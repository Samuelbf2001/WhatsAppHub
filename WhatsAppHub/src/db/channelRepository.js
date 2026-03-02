import pool from '../config/database.js';

export async function saveChannelAccount(portalId, channelId, channelAccountId, phoneNumberId, phoneNumber) {
  await pool.query(
    `INSERT INTO channel_accounts (portal_id, channel_id, channel_account_id, whatsapp_phone_number_id, whatsapp_phone_number)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (portal_id, whatsapp_phone_number_id) DO UPDATE SET
       channel_id = EXCLUDED.channel_id,
       channel_account_id = EXCLUDED.channel_account_id`,
    [portalId, channelId, channelAccountId, phoneNumberId, phoneNumber]
  );
}

export async function getChannelAccount(portalId) {
  const { rows } = await pool.query(
    'SELECT * FROM channel_accounts WHERE portal_id = $1 ORDER BY created_at DESC LIMIT 1',
    [portalId]
  );
  return rows[0] || null;
}

export async function getAllChannelAccounts() {
  const { rows } = await pool.query(
    'SELECT * FROM channel_accounts ORDER BY created_at DESC'
  );
  return rows;
}
