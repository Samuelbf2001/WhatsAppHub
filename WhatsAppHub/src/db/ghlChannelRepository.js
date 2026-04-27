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
