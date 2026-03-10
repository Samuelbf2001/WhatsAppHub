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

    await client.query(`
      CREATE TABLE IF NOT EXISTS service_windows (
        id SERIAL PRIMARY KEY,
        portal_id VARCHAR(50) NOT NULL,
        customer_phone VARCHAR(30) NOT NULL,
        business_phone VARCHAR(30) NOT NULL DEFAULT '',
        last_message_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(portal_id, customer_phone, business_phone)
      );
    `);

    // Migraciones incrementales — agregar columnas si la tabla ya existe sin ellas
    await client.query(`
      ALTER TABLE channel_accounts
        ADD COLUMN IF NOT EXISTS inbox_id VARCHAR(100),
        ADD COLUMN IF NOT EXISTS authorized BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS provider VARCHAR(20) DEFAULT 'evolution',
        ADD COLUMN IF NOT EXISTS evolution_instance VARCHAR(100),
        ADD COLUMN IF NOT EXISTS evolution_instance_id VARCHAR(100),
        ADD COLUMN IF NOT EXISTS evolution_apikey TEXT,
        ADD COLUMN IF NOT EXISTS gupshup_app_id VARCHAR(100),
        ADD COLUMN IF NOT EXISTS gupshup_app_token TEXT,
        ADD COLUMN IF NOT EXISTS gupshup_app_token_expires_at TIMESTAMP;
    `).catch(() => {});

    // Migrar service_windows: agregar business_phone si no existe
    await client.query(`
      ALTER TABLE service_windows
        ADD COLUMN IF NOT EXISTS business_phone VARCHAR(30) NOT NULL DEFAULT '';
    `).catch(() => {});

    // Reconstruir constraint único de service_windows si solo tenía 2 columnas
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'service_windows_portal_id_customer_phone_key'
        ) THEN
          ALTER TABLE service_windows
            DROP CONSTRAINT service_windows_portal_id_customer_phone_key;
          ALTER TABLE service_windows
            ADD CONSTRAINT service_windows_unique
            UNIQUE(portal_id, customer_phone, business_phone);
        END IF;
      END $$;
    `).catch(() => {});

    // Tabla de logs de mensajes por portal
    await client.query(`
      CREATE TABLE IF NOT EXISTS message_logs (
        id SERIAL PRIMARY KEY,
        portal_id VARCHAR(50) NOT NULL,
        channel_account_id VARCHAR(100),
        direction VARCHAR(10) NOT NULL,
        customer_phone VARCHAR(30),
        business_phone VARCHAR(30),
        message_text TEXT,
        status VARCHAR(20) NOT NULL,
        error_message TEXT,
        event_type VARCHAR(50),
        provider VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_message_logs_portal
        ON message_logs(portal_id, created_at DESC);
    `);

    console.log('✅ Migraciones ejecutadas correctamente');
  } catch (err) {
    console.error('❌ Error en migraciones:', err);
    throw err;
  } finally {
    client.release();
  }
}
