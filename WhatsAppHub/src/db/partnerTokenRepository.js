import pool from '../config/database.js';

// Guarda (o reemplaza) el partner token global de Gupshup
export async function savePartnerToken(token, expiresAt) {
  await pool.query('DELETE FROM partner_tokens');
  await pool.query(
    'INSERT INTO partner_tokens (token, expires_at) VALUES ($1, $2)',
    [token, expiresAt]
  );
}

// Retorna el token vigente o null si no existe / ya expiró
export async function getValidPartnerToken() {
  const { rows } = await pool.query(
    'SELECT * FROM partner_tokens WHERE expires_at > NOW() ORDER BY created_at DESC LIMIT 1'
  );
  return rows[0]?.token || null;
}
