import axios from 'axios';
import dotenv from 'dotenv';
import WhatsAppService from '../services/whatsappService.js';
import { findOrCreateGHLContact, publishInboundMessageToGHL, refreshGHLToken } from '../services/ghlService.js';
import { saveGHLTokens, getGHLTokens, updateGHLAccessToken } from '../../db/ghlTokenRepository.js';
import {
  saveGHLChannelAccount,
  getGHLChannelAccount,
  getAllGHLChannelAccounts,
  getGHLChannelAccountById,
  deleteGHLChannelAccountById,
} from '../../db/ghlChannelRepository.js';
import { insertLog } from '../../db/logRepository.js';
import pool from '../../config/database.js';

dotenv.config();

const GHL_CLIENT_ID     = process.env.GHL_CLIENT_ID;
const GHL_CLIENT_SECRET = process.env.GHL_CLIENT_SECRET;
const GHL_REDIRECT_URI  = process.env.GHL_REDIRECT_URI || 'https://whatsfull.sixteam.pro/ghl/oauth-callback';
const GHL_SETUP_BASE    = process.env.GHL_SETUP_URL || process.env.WEBHOOK_BASE_URL || 'https://whatsfull.sixteam.pro';
const GHL_PROVIDER_ID   = process.env.GHL_CONVERSATION_PROVIDER_ID || '69ea36f789175e5da0ebc461';

/**
 * Genera un location token a partir del company token (instalación agency).
 */
async function getLocationTokenFromCompany(companyId, locationId) {
  const companyKey = `company_${companyId}`;
  const companyTokens = await getGHLTokens(companyKey);
  if (!companyTokens) throw new Error(`No hay company token GHL para ${companyId}`);

  let res;
  try {
    res = await axios.post('https://services.leadconnectorhq.com/oauth/locationToken',
      new URLSearchParams({ companyId, locationId }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Bearer ${companyTokens.access_token}`,
          Version: '2021-07-28',
        },
      }
    );
  } catch (axiosErr) {
    const ghlMsg = axiosErr.response?.data?.message || axiosErr.message;
    throw new Error(`No se pudo generar location token desde company: ${ghlMsg}`);
  }

  const { access_token, expires_in } = res.data;
  // Guardar location token para uso futuro
  await saveGHLTokens(locationId, access_token, companyTokens.refresh_token, expires_in || 86400);
  console.log(`✅ Location token generado para ${locationId} desde company ${companyId}`);
  return access_token;
}

/**
 * Obtiene un access token válido para un locationId.
 * Si no hay token de location, busca un company token y genera uno.
 * Refresca automáticamente si está expirado.
 */
export async function getValidGHLToken(locationId, companyId = null) {
  let tokens = await getGHLTokens(locationId);

  // Si no hay token de location pero sí companyId, generar desde company token
  if (!tokens && companyId) {
    return getLocationTokenFromCompany(companyId, locationId);
  }

  if (!tokens) {
    throw new Error(`No hay tokens GHL para location ${locationId}`);
  }

  const expiresAt = new Date(tokens.expires_at).getTime();
  const now = Date.now();

  if (expiresAt - now < 5 * 60 * 1000) {
    console.log(`🔄 Refrescando token GHL para location ${locationId}`);
    const refreshed = await refreshGHLToken(tokens.refresh_token);
    await updateGHLAccessToken(locationId, refreshed.accessToken, refreshed.expiresIn);
    return refreshed.accessToken;
  }

  return tokens.access_token;
}

// GET /ghl/install — inicia el flujo OAuth con GHL
export const installGHL = (req, res) => {
  // version_id = app ID base (GHL_CLIENT_ID sin el sufijo de tenant "-xxxxx")
  // GHL_APP_VERSION_ID puede sobreescribirse explícitamente como env var
  const versionId = process.env.GHL_APP_VERSION_ID || GHL_CLIENT_ID.split('-')[0];

  const params = new URLSearchParams({
    response_type: 'code',
    redirect_uri:  GHL_REDIRECT_URI,
    client_id:     GHL_CLIENT_ID,
    scope: [
      'conversations.readonly',
      'conversations.write',
      'conversations/message.readonly',
      'conversations/message.write',
      'contacts.readonly',
      'contacts.write',
      'locations.readonly',
    ].join(' '),
    version_id: versionId,
  });

  // GHL V2 Marketplace: requiere /v2/oauth/chooselocation + version_id
  res.redirect(`https://marketplace.leadconnectorhq.com/v2/oauth/chooselocation?${params}`);
};

// GET /ghl/oauth-callback — GHL redirige aquí con ?code=
export const oauthCallback = async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Código OAuth faltante');

  try {
    const tokenRes = await axios.post('https://services.leadconnectorhq.com/oauth/token',
      new URLSearchParams({
        client_id:     GHL_CLIENT_ID,
        client_secret: GHL_CLIENT_SECRET,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  GHL_REDIRECT_URI,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    let { access_token, refresh_token, expires_in, locationId, companyId, userType, isBulkInstallation } = tokenRes.data;

    // Sanitizar locationId por si GHL incluye sufijos como "/launchpad"
    if (locationId) locationId = locationId.split('/')[0].trim();

    console.log(`📋 GHL OAuth token response: locationId=${locationId} companyId=${companyId} userType=${userType} isBulkInstallation=${isBulkInstallation}`);

    if (locationId) {
      // Instalación a nivel Location — guardar directamente
      await saveGHLTokens(locationId, access_token, refresh_token, expires_in || 86400);
      console.log(`✅ GHL OAuth completado para location ${locationId}`);
      return res.redirect(`${GHL_SETUP_BASE}/ghl-setup?locationId=${locationId}`);
    }

    if (companyId) {
      // Instalación a nivel Agency/Company — guardar company token con prefijo "company_"
      const companyKey = `company_${companyId}`;
      await saveGHLTokens(companyKey, access_token, refresh_token, expires_in || 86400);
      console.log(`✅ GHL OAuth completado para company ${companyId} (bulk/agency install)`);
      return res.redirect(`${GHL_SETUP_BASE}/ghl-setup?companyId=${companyId}`);
    }

    console.error('❌ GHL OAuth: no se recibió locationId ni companyId', tokenRes.data);
    return res.status(400).send('No se recibió locationId ni companyId de GHL');
  } catch (error) {
    console.error('❌ Error en GHL OAuth callback:', error.response?.data || error.message);
    res.status(500).send('Error en autenticación con GoHighLevel');
  }
};

/**
 * Helper: obtiene el estado de una instancia Evolution con timeout.
 * Retorna { state, instanceState } o null si timeout/error.
 */
async function getEvolutionInstanceState(evoBase, instanceName, evoApiKey) {
  try {
    const r = await fetch(`${evoBase}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
      headers: { apikey: evoApiKey },
      signal: AbortSignal.timeout(3000), // Timeout 3s máximo
    });
    if (!r.ok) return null;
    const data = await r.json();
    return { state: data.instance?.state ?? 'unknown' };
  } catch (error) {
    console.warn(`⚠️ No se pudo obtener estado de instancia: ${error.message}`);
    return null;
  }
}

/**
 * Helper: obtiene QR de una instancia Evolution con timeout.
 * Retorna { base64, code } o null si timeout/error.
 */
async function getEvolutionQRCode(evoBase, instanceName, evoApiKey) {
  try {
    const r = await fetch(`${evoBase}/instance/connect/${encodeURIComponent(instanceName)}`, {
      headers: { apikey: evoApiKey },
      signal: AbortSignal.timeout(3000), // Timeout 3s máximo
    });
    if (!r.ok) return null;
    const data = await r.json();
    return { base64: data.base64 || null, code: data.code || null };
  } catch (error) {
    console.warn(`⚠️ No se pudo obtener QR: ${error.message}`);
    return null;
  }
}

// GET /api/ghl-channels/validate/:locationId — valida si locationId está listo para crear QR
export const validateGHLChannelLocation = async (req, res) => {
  const { locationId } = req.params;
  if (!locationId) {
    return res.status(400).json({ error: 'locationId es requerido' });
  }

  try {
    // 1. Validar que existe token OAuth para este locationId
    const tokens = await getGHLTokens(locationId);
    const hasTokens = !!tokens;

    // Si no tiene tokens, retornar early
    if (!hasTokens) {
      return res.json({
        locationId,
        hasTokens: false,
        instanceExists: false,
        readyForQR: false,
      });
    }

    // 2. Si está configurado Evolution, verificar instancia
    const evoBase = process.env.EVOLUTION_API_URL;
    const evoApiKey = process.env.EVOLUTION_API_KEY;
    let instanceExists = false;
    let instanceName = null;
    let instanceState = 'unknown';

    // Buscar cualquier instancia GHL para este location en Evolution
    if (evoBase && evoApiKey) {
      try {
        const r = await fetch(`${evoBase}/instance/fetchInstances`, {
          headers: { apikey: evoApiKey },
          signal: AbortSignal.timeout(3000),
        });
        if (r.ok) {
          const data = await r.json();
          const instances = Array.isArray(data) ? data : (data.data || []);
          const ghlInstance = instances.find(i => {
            const iName = i.instance?.instanceName || i.instanceName || '';
            return iName.startsWith(`ghl_${locationId}_`);
          });
          if (ghlInstance) {
            instanceExists = true;
            instanceName = ghlInstance.instance?.instanceName || ghlInstance.instanceName;
            // Intentar obtener el estado
            const stateData = await getEvolutionInstanceState(evoBase, instanceName, evoApiKey);
            if (stateData) {
              instanceState = stateData.state;
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ No se pudo verificar instancias Evolution: ${error.message}`);
      }
    }

    // 3. Retornar objeto de validación
    res.json({
      locationId,
      hasTokens,
      instanceExists,
      ...(instanceName && { instanceName }),
      ...(instanceState !== 'unknown' && { instanceState }),
      readyForQR: hasTokens && (instanceExists || !!evoBase), // Listo si hay tokens y (Evolution existe o está disponible)
    });
  } catch (error) {
    console.error('❌ Error en validateGHLChannelLocation:', error.message);
    res.status(500).json({ error: 'Error validando location GHL', details: error.message });
  }
};

// POST /api/ghl-channels/setup — MEJORADO: setup automático + obtener QR
export const setupGHLChannel = async (req, res) => {
  let { locationId, phoneNumber, evolutionInstance, companyId } = req.body;

  if (!locationId || !phoneNumber) {
    return res.status(400).json({ error: 'locationId y phoneNumber son requeridos' });
  }

  // Sanitizar locationId — GHL a veces devuelve "LOCATION_ID/launchpad" u otros sufijos
  locationId = locationId.split('/')[0].trim();

  try {
    // 1. VALIDAR que locationId tiene tokens OAuth válidos
    let accessToken;
    try {
      accessToken = await getValidGHLToken(locationId, companyId);
    } catch (authErr) {
      return res.status(400).json({
        error: 'Location no autorizado — verifica que la app esté instalada en GHL',
        details: authErr.message,
      });
    }
    if (!accessToken) {
      return res.status(400).json({ error: 'No se encontraron tokens OAuth para este locationId' });
    }

    const formattedPhone = phoneNumber.replace(/\D/g, '');
    const provider = (process.env.WHATSAPP_PROVIDER || 'evolution').toLowerCase();
    const providerData = { provider };
    let qrBase64 = null;
    let instanceState = 'unknown';

    if (provider === 'evolution') {
      const evoBase = process.env.EVOLUTION_API_URL;
      const evoApiKey = process.env.EVOLUTION_API_KEY;

      if (!evoBase || !evoApiKey) {
        return res.status(400).json({ error: 'Evolution no está configurado en backend' });
      }

      const instanceName = evolutionInstance || `ghl_${locationId}_${formattedPhone}`;
      const webhookBase = process.env.WEBHOOK_INTERNAL_URL || process.env.WEBHOOK_BASE_URL;
      const webhookUrl = `${webhookBase}/whatsapp-webhook?locationId=${locationId}`;
      let instanceId = null;
      let instanceApikey = null;

      // 2. CHEQUEAR si instancia existe en Evolution
      let instanceExists = false;
      try {
        const checkRes = await fetch(`${evoBase}/instance/fetchInstances`, {
          headers: { apikey: evoApiKey },
          signal: AbortSignal.timeout(3000),
        });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          const instances = Array.isArray(checkData) ? checkData : (checkData.data || []);
          instanceExists = instances.some(i => i.instance?.instanceName === instanceName || i.instanceName === instanceName);
        }
      } catch (error) {
        console.warn(`⚠️ No se pudo verificar instancia (timeout/error): ${error.message}`);
        // No fallar — intentar crear de todos modos
      }

      if (instanceExists) {
        // INSTANCIA EXISTE: actualizar webhook + obtener QR si no está conectado
        console.log(`ℹ️ Instancia ${instanceName} ya existe, actualizando webhook...`);
        try {
          await fetch(`${evoBase}/webhook/set/${instanceName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: evoApiKey },
            body: JSON.stringify({
              url: webhookUrl,
              webhook_by_events: false,
              webhook_base64: false,
              events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
            }),
            signal: AbortSignal.timeout(3000),
          });
          console.log(`✅ Webhook actualizado para instancia existente: ${instanceName}`);
        } catch (wErr) {
          console.warn(`⚠️ No se pudo actualizar webhook: ${wErr.message}`);
        }

        // Obtener estado actual
        const stateData = await getEvolutionInstanceState(evoBase, instanceName, evoApiKey);
        if (stateData) {
          instanceState = stateData.state;
        }

        // Si no está 'open', intentar obtener QR para reconectar
        if (instanceState !== 'open') {
          const qrData = await getEvolutionQRCode(evoBase, instanceName, evoApiKey);
          if (qrData) {
            qrBase64 = qrData.base64;
          }
        }
      } else {
        // INSTANCIA NO EXISTE: crear nueva
        try {
          const evoRes = await fetch(`${evoBase}/instance/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: evoApiKey },
            body: JSON.stringify({
              instanceName,
              integration: 'WHATSAPP-BAILEYS',
              qrcode: true,
              webhook: {
                url: webhookUrl,
                byEvents: false,
                base64: false,
                events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
              },
            }),
            signal: AbortSignal.timeout(5000),
          });
          if (evoRes.ok) {
            const evoData = await evoRes.json();
            instanceId = evoData.instance?.instanceId || null;
            instanceApikey = evoData.hash?.apikey || null;
            console.log(`✅ Instancia Evolution creada: ${instanceName}`);

            // Obtener QR inmediatamente
            const qrData = await getEvolutionQRCode(evoBase, instanceName, evoApiKey);
            if (qrData) {
              qrBase64 = qrData.base64;
            }
            instanceState = 'connecting';
          } else {
            console.warn(`⚠️ Error creating Evolution instance: ${evoRes.status}`);
          }
        } catch (evoErr) {
          console.warn(`⚠️ No se pudo crear instancia Evolution: ${evoErr.message}`);
          // No fallar — retornar error claro pero sin HTTP 500
          return res.status(400).json({
            error: 'No se pudo crear instancia Evolution',
            details: evoErr.message,
          });
        }
      }

      providerData.evolutionInstance = instanceName;
      providerData.evolutionInstanceId = instanceId;
      providerData.evolutionApikey = instanceApikey;
    }

    if (companyId) {
      providerData.companyId = companyId;
      try {
        await getLocationTokenFromCompany(companyId, locationId);
        console.log(`✅ Location token pre-generado para ${locationId}`);
      } catch (tokErr) {
        console.warn(`⚠️ No se pudo pre-generar location token: ${tokErr.message}`);
      }
    }

    // 3. Guardar en DB
    await saveGHLChannelAccount(locationId, formattedPhone, providerData);

    // 4. RETORNAR respuesta normalizada
    res.json({
      success: true,
      locationId,
      phoneNumber: formattedPhone,
      instanceName: providerData.evolutionInstance,
      instanceState: instanceState,
      qrBase64: qrBase64,
      provider,
      ...(providerData.evolutionApikey && { evolutionApikey: providerData.evolutionApikey }),
    });
  } catch (error) {
    console.error('❌ Error en setupGHLChannel:', error.message);
    res.status(500).json({ error: 'Error configurando canal GHL', details: error.message });
  }
};

// GET /api/ghl-company/locations?companyId= — lista subcuentas reales usando el company token
export const listCompanyLocations = async (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId es requerido' });

  try {
    const companyKey = `company_${companyId}`;
    const companyTokens = await getGHLTokens(companyKey);
    if (!companyTokens) return res.status(404).json({ error: 'No hay token de company para este companyId' });

    // Refrescar token si está por expirar
    let accessToken = companyTokens.access_token;
    const expiresAt = new Date(companyTokens.expires_at).getTime();
    if (expiresAt - Date.now() < 5 * 60 * 1000) {
      const refreshed = await refreshGHLToken(companyTokens.refresh_token);
      await updateGHLAccessToken(companyKey, refreshed.accessToken, refreshed.expiresIn);
      accessToken = refreshed.accessToken;
    }

    // Llamar GHL /locations/search con el company token
    const ghlRes = await axios.get('https://services.leadconnectorhq.com/locations/search', {
      params: { companyId, limit: 100, skip: 0 },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Version: '2021-07-28',
      },
    });

    const locations = (ghlRes.data.locations || []).map(loc => ({
      id:   loc.id,
      name: loc.name,
      address: loc.address || '',
      phone: loc.phone || '',
    }));

    console.log(`✅ ${locations.length} locations obtenidas para company ${companyId}`);
    res.json({ success: true, companyId, locations });
  } catch (error) {
    console.error('❌ Error listando locations GHL:', error.response?.data || error.message);
    res.status(500).json({ error: 'Error listando locations', details: error.response?.data?.message || error.message });
  }
};

// POST /api/ghl-location/generate-token — genera location token desde company token
// Útil para canales creados antes de que se guardara company_id
export const generateLocationToken = async (req, res) => {
  const { locationId, companyId } = req.body;
  if (!locationId || !companyId) {
    return res.status(400).json({ error: 'locationId y companyId son requeridos' });
  }
  // Siempre actualizar company_id en DB, independiente de si el token se genera
  await pool.query(
    `UPDATE ghl_channel_accounts SET company_id = $1 WHERE location_id = $2`,
    [companyId, locationId]
  );

  try {
    await getLocationTokenFromCompany(companyId, locationId);
    console.log(`✅ Token generado manualmente para location ${locationId}`);
    res.json({ success: true, locationId, companyId, tokenGenerated: true });
  } catch (error) {
    // company_id ya actualizado — el token se intentará auto-generar al llegar mensajes
    console.warn(`⚠️ company_id actualizado pero token GHL no generado para ${locationId}:`, error.response?.data || error.message);
    res.json({
      success: true,
      locationId,
      companyId,
      tokenGenerated: false,
      warning: 'company_id guardado. Re-instala la app para obtener scopes oauth.write y generar el token completo.',
      ghl_error: error.response?.data || error.message,
    });
  }
};

// GET /api/ghl-debug — diagnóstico temporal de tokens y canales GHL
export const debugGHL = async (req, res) => {
  try {
    const tokens = await pool.query(
      `SELECT location_id,
              LEFT(access_token, 20) AS token_preview,
              expires_at,
              updated_at,
              location_id LIKE 'company_%' AS is_company
       FROM ghl_oauth_tokens ORDER BY updated_at DESC`
    );
    const channels = await pool.query(
      `SELECT id, location_id, whatsapp_phone_number, provider,
              evolution_instance, company_id, authorized, created_at
       FROM ghl_channel_accounts ORDER BY created_at DESC`
    );
    res.json({ ghl_oauth_tokens: tokens.rows, ghl_channel_accounts: channels.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/ghl-channels?locationId=
export const listGHLChannels = async (req, res) => {
  const { locationId } = req.query;
  try {
    const channels = await getAllGHLChannelAccounts(locationId || null);
    res.json({ success: true, channels });
  } catch (error) {
    res.status(500).json({ error: 'Error listando canales GHL', details: error.message });
  }
};

// GET /api/ghl-channels/qr/:instanceName — proxy QR sin auth JWT
export const getGHLChannelQR = async (req, res) => {
  const { instanceName } = req.params;
  try {
    const evoBase   = process.env.EVOLUTION_API_URL;
    const evoApiKey = process.env.EVOLUTION_API_KEY;
    const r = await fetch(`${evoBase}/instance/connect/${encodeURIComponent(instanceName)}`, {
      headers: { apikey: evoApiKey },
    });
    if (!r.ok) return res.status(r.status).json({ error: 'EvolutionAPI error', status: r.status });
    const data = await r.json();
    // Evolution devuelve { base64: '...', code: '...' }
    res.json({ base64: data.base64 || null, code: data.code || null });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo QR GHL', details: error.message });
  }
};

// GET /api/ghl-channels/state/:instanceName — estado conexión sin auth JWT
export const getGHLChannelState = async (req, res) => {
  const { instanceName } = req.params;
  try {
    const evoBase   = process.env.EVOLUTION_API_URL;
    const evoApiKey = process.env.EVOLUTION_API_KEY;
    const r = await fetch(`${evoBase}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
      headers: { apikey: evoApiKey },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return res.json({ state: 'unknown', connected: false });
    const data = await r.json();
    const state = data.instance?.state ?? 'unknown';
    res.json({ instanceName, state, connected: state === 'open' });
  } catch (error) {
    res.json({ state: 'unknown', connected: false });
  }
};

// DELETE /api/ghl-channels/:id — eliminar canal GHL por ID
export const deleteGHLChannel = async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Obtener datos del canal antes de eliminarlo
    const channel = await getGHLChannelAccountById(id);
    if (!channel) return res.status(404).json({ error: 'Canal no encontrado' });

    // 2. Eliminar instancia de Evolution si existe
    if (channel.evolution_instance) {
      const evoBase = process.env.EVOLUTION_API_URL;
      const evoApiKey = process.env.EVOLUTION_API_KEY;
      try {
        await fetch(`${evoBase}/instance/delete/${encodeURIComponent(channel.evolution_instance)}`, {
          method: 'DELETE',
          headers: { apikey: evoApiKey },
          signal: AbortSignal.timeout(5000)
        });
        console.log(`✅ Instancia Evolution eliminada: ${channel.evolution_instance}`);
      } catch (evoErr) {
        console.warn(`⚠️ No se pudo eliminar instancia Evolution: ${evoErr.message}`);
        // Continuar aunque falle Evolution — DB se sigue limpiando
      }
    }

    // 3. Eliminar registro de DB
    const deleted = await deleteGHLChannelAccountById(id);
    if (!deleted) return res.status(404).json({ error: 'Canal no encontrado en DB' });

    res.json({ success: true, id, location_id: channel.location_id });
  } catch (error) {
    res.status(500).json({ error: 'Error eliminando canal GHL', details: error.message });
  }
};

// GET /api/ghl-test-inbound?locationId=X&phone=Y — diagnóstico completo del flujo entrante
export const testGHLInbound = async (req, res) => {
  const locationId = req.query.locationId;
  const phone      = req.query.phone || '+573009781174';

  if (!locationId) return res.status(400).json({ error: 'locationId requerido' });

  const steps = [];
  const log = (step, ok, data) => { steps.push({ step, ok, data }); };

  // ── 1. DB: tokens para este location ──────────────────────────
  try {
    const { rows } = await pool.query(
      `SELECT location_id, expires_at, updated_at,
              LEFT(access_token,30) AS token_prefix,
              location_id LIKE 'company_%' AS is_company
       FROM ghl_oauth_tokens WHERE location_id = $1`,
      [locationId]
    );

    // También buscar token de company si hay canal con company_id
    const { rows: channelRows } = await pool.query(
      'SELECT * FROM ghl_channel_accounts WHERE location_id = $1 AND authorized = TRUE LIMIT 1',
      [locationId]
    );

    const tokenRow = rows[0];
    const companyId = channelRows[0]?.company_id || null;

    if (!tokenRow && !companyId) {
      log('DB:tokens', false, { error: 'No hay token para este locationId', locationId, available: [] });
      const { rows: allTokens } = await pool.query(
        'SELECT location_id, LEFT(access_token,20) AS prefix, expires_at FROM ghl_oauth_tokens ORDER BY updated_at DESC LIMIT 5'
      );
      steps[steps.length-1].data.available = allTokens;
      return res.json({ locationId, phone, steps, success: false });
    }

    log('DB:tokens', true, {
      found: !!tokenRow,
      location_id: tokenRow?.location_id,
      is_company: tokenRow?.is_company,
      expires_at: tokenRow?.expires_at,
      token_prefix: tokenRow?.token_prefix,
      channel_company_id: companyId,
    });
  } catch (e) {
    log('DB:tokens', false, { error: e.message });
    return res.status(500).json({ steps, success: false });
  }

  // ── 2. Obtener token válido ────────────────────────────────────
  let accessToken;
  try {
    const { rows: channelRows } = await pool.query(
      'SELECT company_id FROM ghl_channel_accounts WHERE location_id = $1 AND authorized = TRUE LIMIT 1',
      [locationId]
    );
    const companyId = channelRows[0]?.company_id || null;
    accessToken = await getValidGHLToken(locationId, companyId);
    log('GHL:getToken', true, { token_prefix: accessToken.slice(0, 30) + '...' });
  } catch (e) {
    log('GHL:getToken', false, { error: e.message });
    return res.json({ locationId, phone, steps, success: false });
  }

  // ── 3. Validar token contra GHL ───────────────────────────────
  try {
    const r = await axios.get(`https://services.leadconnectorhq.com/locations/${locationId}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Version: '2021-07-28' },
    });
    log('GHL:validateToken', true, { locationName: r.data?.name || r.data?.id });
  } catch (e) {
    log('GHL:validateToken', false, {
      status: e.response?.status,
      body: e.response?.data,
      error: e.message,
    });
    return res.json({ locationId, phone, steps, success: false });
  }

  // ── 4. Buscar contacto ────────────────────────────────────────
  const normalized = phone.replace(/\D/g, '');
  let contactId = null;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  };

  try {
    const r = await axios.get('https://services.leadconnectorhq.com/contacts/search/duplicate', {
      headers,
      params: { locationId, number: `+${normalized}` },
    });
    contactId = r.data?.contact?.id || null;
    log('GHL:searchContact', true, { contactId, found: !!contactId });
  } catch (e) {
    log('GHL:searchContact', false, {
      status: e.response?.status,
      body: e.response?.data,
    });
  }

  // ── 5. Crear contacto si no existe ────────────────────────────
  if (!contactId) {
    try {
      const payload = { locationId, phone: `+${normalized}`, name: `+${normalized}` };
      const r = await axios.post('https://services.leadconnectorhq.com/contacts', payload, { headers });
      contactId = r.data?.contact?.id || r.data?.id;
      log('GHL:createContact', true, { contactId, response: r.data });
    } catch (e) {
      // Si el location tiene anti-dup, el 400 trae el contactId existente en meta
      const existingId = e.response?.data?.meta?.contactId;
      if (existingId) {
        contactId = existingId;
        log('GHL:createContact', true, { contactId, note: 'anti-dup: existing contact returned', body: e.response?.data });
      } else {
        log('GHL:createContact', false, {
          status: e.response?.status,
          body: e.response?.data,
          error: e.message,
        });
        return res.json({ locationId, phone, steps, success: false });
      }
    }
  }

  // ── 5b. Descubrir conversationProviderId correcto ─────────────
  let PROVIDER_ID = process.env.GHL_CONVERSATION_PROVIDER_ID || '69ea36f789175e5da0ebc461';
  try {
    const r = await axios.get('https://services.leadconnectorhq.com/conversations/providers', {
      headers,
      params: { locationId },
    });
    const providers = r.data?.providers || r.data || [];
    log('GHL:listProviders', true, { count: providers.length, providers: providers.map(p=>({id:p.id||p._id, name:p.name, type:p.type})) });
    // Si hay providers personalizados, usar el primero de tipo Custom
    const customProvider = providers.find(p => p.type === 'Custom' || p.type === 'custom');
    if (customProvider) {
      PROVIDER_ID = customProvider.id || customProvider._id;
      log('GHL:providerIdResolved', true, { PROVIDER_ID });
    }
  } catch (e) {
    log('GHL:listProviders', false, { status: e.response?.status, body: e.response?.data, note: 'will use env GHL_CONVERSATION_PROVIDER_ID' });
  }

  // ── 6. Publicar mensaje inbound ───────────────────────────────
  try {
    const payload = {
      type: 'Custom',
      locationId,
      contactId,
      conversationProviderId: PROVIDER_ID,
      message: 'Test inbound desde WhatsAppHub 🚀',
      direction: 'inbound',
      date: new Date().toISOString(),
    };
    const r = await axios.post('https://services.leadconnectorhq.com/conversations/messages/inbound', payload, { headers });
    log('GHL:publishInbound', true, { conversationId: r.data?.conversationId, response: r.data });
  } catch (e) {
    log('GHL:publishInbound', false, {
      status: e.response?.status,
      body: e.response?.data,
      error: e.message,
      providerId: PROVIDER_ID,
    });
    return res.json({ locationId, phone, steps, success: false });
  }

  return res.json({ locationId, phone, steps, success: true });
};

// POST /ghl/webhook — GHL envía aquí cuando el agente responde (Delivery URL)
export const handleGHLWebhook = async (req, res) => {
  // Responder 200 inmediatamente
  res.sendStatus(200);

  try {
    const body = req.body;

    // GHL puede enviar distintos tipos de eventos — normalizar campos
    const type       = body.type;
    const locationId = body.locationId;

    // Eventos del sistema GHL (INSTALL, UNINSTALL, etc.) — ignorar silenciosamente
    const SYSTEM_EVENTS = ['INSTALL', 'UNINSTALL', 'UPGRADE', 'DOWNGRADE'];
    if (SYSTEM_EVENTS.includes(type)) {
      console.log(`ℹ️ GHL sistema evento [${type}] para location ${locationId} — ignorado`);
      return;
    }

    // Solo procesar mensajes salientes (OutboundMessage)
    if (type !== 'OutboundMessage') {
      console.log(`ℹ️ GHL evento [${type}] ignorado (no es OutboundMessage)`);
      return;
    }

    // Solo procesar mensajes de nuestro Custom Conversation Provider
    const providerId = body.conversationProviderId;
    if (providerId && providerId !== GHL_PROVIDER_ID) {
      console.log(`ℹ️ GHL OutboundMessage de provider [${providerId}] ignorado — no es nuestro canal`);
      return;
    }

    // GHL envía: to = número destino, body = texto del mensaje
    const phone   = body.to;
    const message = body.body;

    console.log(`📤 GHL Webhook saliente [location: ${locationId}] → ${phone}: "${message?.slice(0, 60)}"`);

    if (!locationId || !phone || !message) {
      console.warn('⚠️ GHL webhook: faltan campos requeridos', JSON.stringify(body));
      return;
    }

    // Buscar canal WhatsApp configurado para este location
    const channelAccount = await getGHLChannelAccount(locationId);
    if (!channelAccount) {
      console.error(`❌ No hay canal WhatsApp configurado para GHL location ${locationId}`);
      return;
    }

    // Construir WhatsAppService con credenciales del canal
    const whatsapp = new WhatsAppService({
      provider: channelAccount.provider || 'evolution',
      apiKey:   channelAccount.evolution_apikey   || process.env.EVOLUTION_API_KEY,
      instance: channelAccount.evolution_instance || process.env.EVOLUTION_INSTANCE,
    });

    const formattedPhone = whatsapp.formatPhoneNumber(phone);
    await whatsapp.sendTextMessage(formattedPhone, message);

    console.log(`✅ Mensaje GHL enviado via WhatsApp a ${formattedPhone}`);

    await insertLog(locationId, {
      channelAccountId: channelAccount.id,
      direction:        'outgoing',
      customerPhone:    phone,
      businessPhone:    channelAccount.whatsapp_phone_number,
      messageText:      message,
      status:           'success',
      eventType:        'MESSAGE_SENT',
      provider:         channelAccount.provider || 'evolution',
    });
  } catch (error) {
    console.error('❌ Error en GHL webhook saliente:', error.response?.data || error.message);
  }
};
