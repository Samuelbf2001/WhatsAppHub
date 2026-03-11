import pool from '../config/database.js';

export async function saveChannelAccount(portalId, channelId, channelAccountId, inboxId, phoneNumberId, phoneNumber, providerData = {}) {
  const {
    provider = 'evolution',
    evolutionInstance = null,
    evolutionInstanceId = null,
    evolutionApikey = null,
    gupshupAppId = null,
    gupshupAppToken = null,
    gupshupAppTokenExpiresAt = null
  } = providerData;

  await pool.query(
    `INSERT INTO channel_accounts
       (portal_id, channel_id, channel_account_id, inbox_id, whatsapp_phone_number_id, whatsapp_phone_number,
        provider, evolution_instance, evolution_instance_id, evolution_apikey,
        gupshup_app_id, gupshup_app_token, gupshup_app_token_expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (portal_id, channel_account_id) DO UPDATE SET
       channel_id = EXCLUDED.channel_id,
       inbox_id = EXCLUDED.inbox_id,
       whatsapp_phone_number_id = EXCLUDED.whatsapp_phone_number_id,
       whatsapp_phone_number = EXCLUDED.whatsapp_phone_number,
       provider = EXCLUDED.provider,
       evolution_instance = EXCLUDED.evolution_instance,
       evolution_instance_id = EXCLUDED.evolution_instance_id,
       evolution_apikey = EXCLUDED.evolution_apikey,
       gupshup_app_id = EXCLUDED.gupshup_app_id,
       gupshup_app_token = EXCLUDED.gupshup_app_token,
       gupshup_app_token_expires_at = EXCLUDED.gupshup_app_token_expires_at`,
    [portalId, channelId, channelAccountId, inboxId, phoneNumberId, phoneNumber,
     provider, evolutionInstance, evolutionInstanceId, evolutionApikey,
     gupshupAppId, gupshupAppToken, gupshupAppTokenExpiresAt]
  );
}

// Obtener primer canal activo de un portal (fallback mono-número)
export async function getChannelAccount(portalId) {
  const { rows } = await pool.query(
    'SELECT * FROM channel_accounts WHERE portal_id = $1 AND authorized = TRUE ORDER BY created_at DESC LIMIT 1',
    [portalId]
  );
  return rows[0] || null;
}

// Obtener canal específico por channelAccountId (routing saliente exacto)
export async function getChannelAccountById(portalId, channelAccountId) {
  const { rows } = await pool.query(
    'SELECT * FROM channel_accounts WHERE portal_id = $1 AND channel_account_id = $2',
    [portalId, channelAccountId]
  );
  return rows[0] || null;
}

// Obtener canal por nombre de instancia Evolution (routing entrante)
export async function getChannelAccountByInstance(instanceName) {
  const { rows } = await pool.query(
    'SELECT * FROM channel_accounts WHERE evolution_instance = $1 AND authorized = TRUE LIMIT 1',
    [instanceName]
  );
  return rows[0] || null;
}

// Obtener canal por Gupshup appId (routing entrante Gupshup)
export async function getChannelAccountByGupshupAppId(appId) {
  const { rows } = await pool.query(
    'SELECT * FROM channel_accounts WHERE gupshup_app_id = $1 AND authorized = TRUE LIMIT 1',
    [appId]
  );
  return rows[0] || null;
}

// Listar todos los canales de un portal
export async function getAllChannelAccounts(portalId) {
  if (portalId) {
    const { rows } = await pool.query(
      'SELECT * FROM channel_accounts WHERE portal_id = $1 ORDER BY created_at DESC',
      [portalId]
    );
    return rows;
  }
  const { rows } = await pool.query('SELECT * FROM channel_accounts ORDER BY created_at DESC');
  return rows;
}

export async function updateAuthorized(portalId, channelAccountId, authorized) {
  await pool.query(
    'UPDATE channel_accounts SET authorized = $1 WHERE portal_id = $2 AND channel_account_id = $3',
    [authorized, portalId, channelAccountId]
  );
}

export async function deleteChannelAccount(portalId, channelAccountId) {
  await pool.query(
    'DELETE FROM channel_accounts WHERE portal_id = $1 AND channel_account_id = $2',
    [portalId, channelAccountId]
  );
}

// Guardar credenciales Gupshup Partner de un sub-account
export async function saveGupshupApp(portalId, channelAccountId, gupshupAppId, gupshupAppToken, expiresAt) {
  await pool.query(
    `UPDATE channel_accounts
     SET gupshup_app_id = $1, gupshup_app_token = $2, gupshup_app_token_expires_at = $3
     WHERE portal_id = $4 AND channel_account_id = $5`,
    [gupshupAppId, gupshupAppToken, expiresAt, portalId, channelAccountId]
  );
}

// Obtener credenciales Gupshup de un portal
export async function getGupshupApp(portalId) {
  const { rows } = await pool.query(
    `SELECT gupshup_app_id, gupshup_app_token, gupshup_app_token_expires_at, channel_account_id
     FROM channel_accounts
     WHERE portal_id = $1 AND gupshup_app_id IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`,
    [portalId]
  );
  return rows[0] || null;
}
