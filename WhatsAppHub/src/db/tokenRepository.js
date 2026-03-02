import pool from '../config/database.js';

export async function saveTokens(portalId, accessToken, refreshToken, expiresIn) {
  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  await pool.query(
    `INSERT INTO oauth_tokens (portal_id, access_token, refresh_token, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (portal_id) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       expires_at = EXCLUDED.expires_at,
       updated_at = NOW()`,
    [portalId, accessToken, refreshToken, expiresAt]
  );
}

export async function getTokens(portalId) {
  const { rows } = await pool.query(
    'SELECT * FROM oauth_tokens WHERE portal_id = $1',
    [portalId]
  );
  return rows[0] || null;
}

export async function updateAccessToken(portalId, newAccessToken, expiresIn) {
  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  await pool.query(
    `UPDATE oauth_tokens SET access_token = $1, expires_at = $2, updated_at = NOW()
     WHERE portal_id = $3`,
    [newAccessToken, expiresAt, portalId]
  );
}
