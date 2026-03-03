import pool from '../config/database.js';

export async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS oauth_tokens (
        id SERIAL PRIMARY KEY,
        portal_id VARCHAR(50) UNIQUE NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS channel_accounts (
        id SERIAL PRIMARY KEY,
        portal_id VARCHAR(50) NOT NULL,
        channel_id VARCHAR(100) NOT NULL,
        channel_account_id VARCHAR(100) NOT NULL,
        inbox_id VARCHAR(100) NOT NULL,
        whatsapp_phone_number_id VARCHAR(50) NOT NULL,
        whatsapp_phone_number VARCHAR(20) NOT NULL,
        authorized BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(portal_id, channel_account_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS partner_tokens (
        id SERIAL PRIMARY KEY,
        token TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Migraciones incrementales — agregar columnas si la tabla ya existe sin ellas
    await client.query(`
      ALTER TABLE channel_accounts
        ADD COLUMN IF NOT EXISTS inbox_id VARCHAR(100),
        ADD COLUMN IF NOT EXISTS authorized BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS gupshup_app_id VARCHAR(100),
        ADD COLUMN IF NOT EXISTS gupshup_app_token TEXT,
        ADD COLUMN IF NOT EXISTS gupshup_app_token_expires_at TIMESTAMP;
    `).catch(() => {});

    console.log('✅ Migraciones ejecutadas correctamente');
  } catch (err) {
    console.error('❌ Error en migraciones:', err);
    throw err;
  } finally {
    client.release();
  }
}
