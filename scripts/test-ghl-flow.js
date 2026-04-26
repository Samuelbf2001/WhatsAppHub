#!/usr/bin/env node
/**
 * Test end-to-end del flujo GHL: DB → token → contacto → mensaje entrante
 *
 * Uso:
 *   node --env-file=.env scripts/test-ghl-flow.js <locationId> <phone>
 *
 * Ejemplo:
 *   node --env-file=.env scripts/test-ghl-flow.js dMX4yw4WB0RZFivUhgyG +573009781174
 */

import axios from 'axios';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const { Pool } = pg;
const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
const GHL_PROVIDER_ID = process.env.GHL_CONVERSATION_PROVIDER_ID || '69ea36f789175e5da0ebc461';

const LOCATION_ID = process.argv[2] || 'dMX4yw4WB0RZFivUhgyG';
const TEST_PHONE   = process.argv[3] || '+573009781174';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

function sep(label) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`▶ ${label}`);
  console.log('─'.repeat(60));
}

// ─── 1. DB ──────────────────────────────────────────────────────
async function testDB() {
  sep('1. Conexión DB');
  const client = await pool.connect();
  const { rows } = await client.query('SELECT NOW() as now, current_database() as db');
  console.log('✅ DB OK:', rows[0]);

  const { rows: tables } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' ORDER BY table_name`
  );
  console.log('📋 Tablas:', tables.map(r => r.table_name).join(', '));
  client.release();
  return true;
}

// ─── 2. Token GHL ───────────────────────────────────────────────
async function getToken() {
  sep(`2. Token GHL para location ${LOCATION_ID}`);

  const { rows } = await pool.query(
    'SELECT location_id, expires_at, updated_at, LEFT(access_token,30) as token_prefix, LEFT(refresh_token,20) as refresh_prefix FROM ghl_oauth_tokens WHERE location_id = $1',
    [LOCATION_ID]
  );

  if (!rows[0]) {
    console.error('❌ No hay token para este locationId en DB');
    // Buscar si hay token de company
    const { rows: allTokens } = await pool.query(
      'SELECT location_id, expires_at, LEFT(access_token,30) as prefix FROM ghl_oauth_tokens ORDER BY updated_at DESC LIMIT 10'
    );
    console.log('📋 Tokens disponibles en DB:', allTokens);
    return null;
  }

  const tokenRow = rows[0];
  const expiresAt = new Date(tokenRow.expires_at);
  const isExpired = expiresAt < new Date();
  const isAgency = tokenRow.location_id.startsWith('company_');

  console.log(`📄 Token encontrado:`);
  console.log(`   location_id : ${tokenRow.location_id}`);
  console.log(`   tipo        : ${isAgency ? '⚠️  AGENCY/COMPANY token' : '✅ Location token'}`);
  console.log(`   expires_at  : ${expiresAt.toISOString()} ${isExpired ? '❌ EXPIRADO' : '✅ válido'}`);
  console.log(`   token prefix: ${tokenRow.token_prefix}...`);
  console.log(`   updated_at  : ${tokenRow.updated_at}`);

  // Obtener token completo
  const { rows: full } = await pool.query(
    'SELECT access_token, refresh_token FROM ghl_oauth_tokens WHERE location_id = $1',
    [LOCATION_ID]
  );

  // Si expirado, refrescar
  if (isExpired) {
    console.log('🔄 Token expirado, refrescando...');
    const refreshed = await axios.post(`${GHL_BASE_URL}/oauth/token`, {
      client_id: process.env.GHL_CLIENT_ID,
      client_secret: process.env.GHL_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: full[0].refresh_token,
    }, { headers: { 'Content-Type': 'application/json' } });

    const newToken = refreshed.data.access_token;
    const expiresIn = refreshed.data.expires_in || 86400;
    const newExpiry = new Date(Date.now() + expiresIn * 1000);

    await pool.query(
      'UPDATE ghl_oauth_tokens SET access_token=$1, expires_at=$2, updated_at=NOW() WHERE location_id=$3',
      [newToken, newExpiry, LOCATION_ID]
    );
    console.log('✅ Token refrescado y guardado');
    return newToken;
  }

  return full[0].access_token;
}

// ─── 3. Validar token con GHL API ───────────────────────────────
async function validateToken(accessToken) {
  sep('3. Validar token con GHL API');
  try {
    const res = await axios.get(`${GHL_BASE_URL}/locations/${LOCATION_ID}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Version: '2021-07-28',
      },
    });
    console.log('✅ Token válido. Location:', res.data?.name || res.data?.id);
    return true;
  } catch (err) {
    console.error(`❌ Token inválido: HTTP ${err.response?.status}`, JSON.stringify(err.response?.data));
    return false;
  }
}

// ─── 4. Buscar contacto ──────────────────────────────────────────
async function searchContact(accessToken) {
  sep(`4. Buscar contacto para ${TEST_PHONE}`);
  const normalized = TEST_PHONE.replace(/\D/g, '');
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  };

  try {
    const res = await axios.get(`${GHL_BASE_URL}/contacts/search/duplicate`, {
      headers,
      params: { locationId: LOCATION_ID, phone: `+${normalized}` },
    });
    const contact = res.data?.contact;
    if (contact?.id) {
      console.log(`✅ Contacto encontrado: ${contact.id} (${contact.name || contact.phone})`);
      return contact.id;
    }
    console.log('ℹ️  Contacto no encontrado, hay que crear');
    return null;
  } catch (err) {
    console.warn(`⚠️  Search error ${err.response?.status}:`, JSON.stringify(err.response?.data));
    return null;
  }
}

// ─── 5. Crear contacto ───────────────────────────────────────────
async function createContact(accessToken) {
  sep(`5. Crear contacto para ${TEST_PHONE}`);
  const normalized = TEST_PHONE.replace(/\D/g, '');
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  };

  const payload = {
    locationId: LOCATION_ID,
    phone: `+${normalized}`,
    name: `+${normalized}`,
  };

  console.log('📤 Payload:', JSON.stringify(payload));

  try {
    const res = await axios.post(`${GHL_BASE_URL}/contacts`, payload, { headers });
    const contactId = res.data?.contact?.id || res.data?.id;
    console.log('✅ Contacto creado:', contactId);
    console.log('   Response:', JSON.stringify(res.data).slice(0, 300));
    return contactId;
  } catch (err) {
    console.error(`❌ HTTP ${err.response?.status} al crear contacto`);
    console.error('   Body:', JSON.stringify(err.response?.data));
    return null;
  }
}

// ─── 6. Publicar mensaje inbound ─────────────────────────────────
async function publishInbound(accessToken, contactId) {
  sep('6. Publicar mensaje inbound en GHL');

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  };

  const payload = {
    type: 'Custom',
    locationId: LOCATION_ID,
    contactId,
    conversationProviderId: GHL_PROVIDER_ID,
    message: 'Test desde WhatsAppHub 🚀',
    direction: 'inbound',
    date: new Date().toISOString(),
  };

  console.log('📤 Payload:', JSON.stringify(payload));
  console.log('📌 conversationProviderId:', GHL_PROVIDER_ID);

  try {
    const res = await axios.post(`${GHL_BASE_URL}/conversations/messages/inbound`, payload, { headers });
    console.log('✅ Mensaje publicado!');
    console.log('   Response:', JSON.stringify(res.data));
    return true;
  } catch (err) {
    console.error(`❌ HTTP ${err.response?.status} al publicar mensaje`);
    console.error('   Body:', JSON.stringify(err.response?.data));
    return false;
  }
}

// ─── MAIN ────────────────────────────────────────────────────────
async function main() {
  console.log('🔬 GHL Flow Test');
  console.log(`   locationId : ${LOCATION_ID}`);
  console.log(`   testPhone  : ${TEST_PHONE}`);
  console.log(`   providerID : ${GHL_PROVIDER_ID}`);

  let pass = true;

  // 1. DB
  try { await testDB(); } catch (e) { console.error('❌ DB FAIL:', e.message); process.exit(1); }

  // 2. Token
  let token;
  try { token = await getToken(); } catch (e) { console.error('❌ TOKEN FAIL:', e.message); pass = false; }
  if (!token) { console.error('\n❌ Sin token — abortando'); await pool.end(); process.exit(1); }

  // 3. Validar token
  const tokenOk = await validateToken(token);
  if (!tokenOk) { console.error('\n❌ Token inválido — abortando'); await pool.end(); process.exit(1); }

  // 4. Buscar contacto
  let contactId;
  try { contactId = await searchContact(token); } catch (e) { console.warn('⚠️ Search error:', e.message); }

  // 5. Crear si no existe
  if (!contactId) {
    try { contactId = await createContact(token); } catch (e) { console.error('❌ Create error:', e.message); pass = false; }
  }

  if (!contactId) { console.error('\n❌ Sin contactId — abortando'); await pool.end(); process.exit(1); }

  // 6. Publicar mensaje
  const msgOk = await publishInbound(token, contactId);
  pass = pass && msgOk;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(pass ? '✅ FLUJO GHL COMPLETO — mensaje llegó a GHL' : '❌ FLUJO GHL FALLÓ — ver errores arriba');
  console.log('═'.repeat(60));

  await pool.end();
  process.exit(pass ? 0 : 1);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
