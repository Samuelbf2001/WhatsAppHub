import pool from '../config/database.js';

export async function saveGHLTokens(locationId, accessToken, refreshToken, expiresIn) {
  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  await pool.query(
    `INSERT INTO ghl_oauth_tokens (location_id, access_token, refresh_token, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (location_id) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       expires_at = EXCLUDED.expires_at,
       updated_at = NOW()`,
    [locationId, accessToken, refreshToken, expiresAt]
  );
}

export async function getGHLTokens(locationId) {
  const { rows } = await pool.query(
    'SELECT * FROM ghl_oauth_tokens WHERE location_id = $1',
    [locationId]
  );
  return rows[0] || null;
}

export async function updateGHLAccessToken(locationId, newAccessToken, expiresIn) {
  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  await pool.query(
    `UPDATE ghl_oauth_tokens SET access_token = $1, expires_at = $2, updated_at = NOW()
     WHERE location_id = $3`,
    [newAccessToken, expiresAt, locationId]
  );
}
