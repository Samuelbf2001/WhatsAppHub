import pool from '../config/database.js';

export async function saveChannelAccount(portalId, channelId, channelAccountId, inboxId, phoneNumberId, phoneNumber) {
  await pool.query(
    `INSERT INTO channel_accounts
       (portal_id, channel_id, channel_account_id, inbox_id, whatsapp_phone_number_id, whatsapp_phone_number)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (portal_id, channel_account_id) DO UPDATE SET
       channel_id = EXCLUDED.channel_id,
       inbox_id = EXCLUDED.inbox_id,
       whatsapp_phone_number_id = EXCLUDED.whatsapp_phone_number_id,
       whatsapp_phone_number = EXCLUDED.whatsapp_phone_number`,
    [portalId, channelId, channelAccountId, inboxId, phoneNumberId, phoneNumber]
  );
}

export async function getChannelAccount(portalId) {
  const { rows } = await pool.query(
    'SELECT * FROM channel_accounts WHERE portal_id = $1 AND authorized = TRUE ORDER BY created_at DESC LIMIT 1',
    [portalId]
  );
  return rows[0] || null;
}

export async function getChannelAccountById(portalId, channelAccountId) {
  const { rows } = await pool.query(
    'SELECT * FROM channel_accounts WHERE portal_id = $1 AND channel_account_id = $2',
    [portalId, channelAccountId]
  );
  return rows[0] || null;
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

export async function getAllChannelAccounts() {
  const { rows } = await pool.query(
    'SELECT * FROM channel_accounts ORDER BY created_at DESC'
  );
  return rows;
}
