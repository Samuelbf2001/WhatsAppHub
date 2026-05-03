import pool from '../config/database.js';

export async function saveGHLChannelAccount(locationId, phoneNumber, providerData = {}) {
  const {
    provider = 'evolution',
    evolutionInstance = null,
    evolutionInstanceId = null,
    evolutionApikey = null,
    gupshupAppId = null,
    gupshupAppToken = null,
    companyId = null,
  } = providerData;

  await pool.query(
    `INSERT INTO ghl_channel_accounts
       (location_id, whatsapp_phone_number, provider,
        evolution_instance, evolution_instance_id, evolution_apikey,
        gupshup_app_id, gupshup_app_token, company_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (location_id, whatsapp_phone_number) DO UPDATE SET
       provider = EXCLUDED.provider,
       evolution_instance = EXCLUDED.evolution_instance,
       evolution_instance_id = EXCLUDED.evolution_instance_id,
       evolution_apikey = EXCLUDED.evolution_apikey,
       gupshup_app_id = EXCLUDED.gupshup_app_id,
       gupshup_app_token = EXCLUDED.gupshup_app_token,
       company_id = EXCLUDED.company_id,
       authorized = TRUE`,
    [locationId, phoneNumber, provider,
     evolutionInstance, evolutionInstanceId, evolutionApikey,
     gupshupAppId, gupshupAppToken, companyId]
  );
}

export async function getGHLChannelAccount(locationId) {
  // Preferir el canal marcado como predeterminado; si no hay, el más reciente
  const { rows } = await pool.query(
    'SELECT * FROM ghl_channel_accounts WHERE location_id = $1 AND authorized = TRUE ORDER BY is_default DESC, created_at DESC LIMIT 1',
    [locationId]
  );
  return rows[0] || null;
}

export async function getGHLChannelAccountByInstance(instanceName) {
  const { rows } = await pool.query(
    'SELECT * FROM ghl_channel_accounts WHERE evolution_instance = $1 AND authorized = TRUE LIMIT 1',
    [instanceName]
  );
  return rows[0] || null;
}

export async function getAllGHLChannelAccounts(locationId) {
  if (locationId) {
    const { rows } = await pool.query(
      'SELECT * FROM ghl_channel_accounts WHERE location_id = $1 ORDER BY created_at DESC',
      [locationId]
    );
    return rows;
  }
  const { rows } = await pool.query('SELECT * FROM ghl_channel_accounts ORDER BY created_at DESC');
  return rows;
}

export async function deleteGHLChannelAccount(locationId, phoneNumber) {
  await pool.query(
    'DELETE FROM ghl_channel_accounts WHERE location_id = $1 AND whatsapp_phone_number = $2',
    [locationId, phoneNumber]
  );
}

export async function getGHLChannelAccountById(id) {
  const { rows } = await pool.query(
    'SELECT * FROM ghl_channel_accounts WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

export async function updateGHLChannelAccount(id, { displayName, isDefault } = {}) {
  const updates = [];
  const values = [];
  let idx = 1;
  if (displayName !== undefined) { updates.push(`display_name = $${idx++}`); values.push(displayName); }
  if (isDefault  !== undefined) { updates.push(`is_default = $${idx++}`);   values.push(isDefault);  }
  if (updates.length === 0) return;
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE ghl_channel_accounts SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return rows[0] || null;
}

export async function setGHLChannelAsDefault(locationId, id) {
  // Quitar default de todos los del location, luego poner en el elegido
  await pool.query(
    'UPDATE ghl_channel_accounts SET is_default = FALSE WHERE location_id = $1',
    [locationId]
  );
  const { rows } = await pool.query(
    'UPDATE ghl_channel_accounts SET is_default = TRUE WHERE id = $1 RETURNING *',
    [id]
  );
  return rows[0] || null;
}

export async function getGHLChannelAccountByDisplayName(locationId, name) {
  // Busca por display_name exacto o por evolution_instance (para el comando)
  const { rows } = await pool.query(
    `SELECT * FROM ghl_channel_accounts
      WHERE location_id = $1 AND authorized = TRUE
        AND (LOWER(display_name) = LOWER($2) OR LOWER(evolution_instance) = LOWER($2))
      LIMIT 1`,
    [locationId, name]
  );
  return rows[0] || null;
}

export async function deleteGHLChannelAccountById(id) {
  const { rows } = await pool.query(
    'DELETE FROM ghl_channel_accounts WHERE id = $1 RETURNING id',
    [id]
  );
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// Routing persistente: contacto → canal (sobrevive reinicios del servidor)
// ---------------------------------------------------------------------------

/**
 * Guarda o actualiza qué canal WhatsApp debe manejar a este contacto en el location.
 * Se llama cada vez que llega un mensaje entrante al canal correcto.
 */
export async function saveContactChannelRouting(locationId, customerPhone, channelAccountId) {
  await pool.query(
    `INSERT INTO ghl_contact_channel_routing (location_id, customer_phone, channel_account_id, last_used_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (location_id, customer_phone) DO UPDATE SET
       channel_account_id = EXCLUDED.channel_account_id,
       last_used_at = NOW()`,
    [locationId, customerPhone, channelAccountId]
  );
}

/**
 * Devuelve el canal que atendió por última vez a este contacto en el location.
 * Retorna el channelAccount completo o null si no hay historial.
 */
export async function getContactChannelRouting(locationId, customerPhone) {
  const { rows } = await pool.query(
    `SELECT ca.*
     FROM ghl_contact_channel_routing r
     JOIN ghl_channel_accounts ca ON ca.id = r.channel_account_id
     WHERE r.location_id = $1 AND r.customer_phone = $2
       AND ca.authorized = TRUE`,
    [locationId, customerPhone]
  );
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// Connection tokens: links de conexión fácil por subcuenta
// ---------------------------------------------------------------------------

/**
 * Guarda un token de conexión nuevo.
 */
export async function saveConnectionToken(token, locationId, { companyId, displayName, createdBy, expiresAt } = {}) {
  await pool.query(
    `INSERT INTO ghl_connection_tokens (token, location_id, company_id, display_name, created_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [token, locationId, companyId || null, displayName || null, createdBy || null, expiresAt || null]
  );
}

/**
 * Busca y valida un token. Incrementa el contador de uso.
 * Retorna null si el token no existe o expiró.
 */
export async function getConnectionToken(token) {
  const { rows } = await pool.query(
    `SELECT * FROM ghl_connection_tokens
     WHERE token = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
    [token]
  );
  if (!rows[0]) return null;
  // Incrementar uso de forma no bloqueante
  pool.query('UPDATE ghl_connection_tokens SET used_count = used_count + 1 WHERE token = $1', [token]).catch(() => {});
  return rows[0];
}

/**
 * Lista todos los tokens activos de un location.
 */
export async function listConnectionTokens(locationId) {
  const { rows } = await pool.query(
    `SELECT token, display_name, created_by, expires_at, used_count, created_at
     FROM ghl_connection_tokens
     WHERE location_id = $1 AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC`,
    [locationId]
  );
  return rows;
}

/**
 * Elimina un token por su valor.
 */
export async function deleteConnectionToken(token) {
  const { rows } = await pool.query(
    'DELETE FROM ghl_connection_tokens WHERE token = $1 RETURNING token',
    [token]
  );
  return rows[0] || null;
}
