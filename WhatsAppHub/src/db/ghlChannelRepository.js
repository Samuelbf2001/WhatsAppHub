import pool from '../app/config/database.js';

export async function saveGHLChannelAccount(locationId, phoneNumber, providerData = {}) {
  const {
    provider = 'evolution',
    evolutionInstance = null,
    evolutionInstanceId = null,
    evolutionApikey = null,
    gupshupAppId = null,
    gupshupAppToken = null,
  } = providerData;

  await pool.query(
    `INSERT INTO ghl_channel_accounts
       (location_id, whatsapp_phone_number, provider,
        evolution_instance, evolution_instance_id, evolution_apikey,
        gupshup_app_id, gupshup_app_token)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (location_id, whatsapp_phone_number) DO UPDATE SET
       provider = EXCLUDED.provider,
       evolution_instance = EXCLUDED.evolution_instance,
       evolution_instance_id = EXCLUDED.evolution_instance_id,
       evolution_apikey = EXCLUDED.evolution_apikey,
       gupshup_app_id = EXCLUDED.gupshup_app_id,
       gupshup_app_token = EXCLUDED.gupshup_app_token,
       authorized = TRUE`,
    [locationId, phoneNumber, provider,
     evolutionInstance, evolutionInstanceId, evolutionApikey,
     gupshupAppId, gupshupAppToken]
  );
}

export async function getGHLChannelAccount(locationId) {
  const { rows } = await pool.query(
    'SELECT * FROM ghl_channel_accounts WHERE location_id = $1 AND authorized = TRUE ORDER BY created_at DESC LIMIT 1',
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
