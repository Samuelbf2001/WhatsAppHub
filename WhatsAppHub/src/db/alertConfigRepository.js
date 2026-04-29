import pool from '../config/database.js';

export async function getAlertConfig(instanceName) {
  const { rows } = await pool.query(
    'SELECT * FROM alert_configs WHERE instance_name = $1',
    [instanceName]
  );
  return rows[0] || null;
}

export async function upsertAlertConfig(instanceName, locationId, config) {
  const {
    alertEnabled,
    notifyOnDisconnect,
    notifyOnReconnect,
    webhookUrl,
  } = config;

  const { rows } = await pool.query(
    `INSERT INTO alert_configs
       (instance_name, location_id, alert_enabled, notify_on_disconnect, notify_on_reconnect, webhook_url, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (instance_name)
     DO UPDATE SET
       location_id          = EXCLUDED.location_id,
       alert_enabled        = EXCLUDED.alert_enabled,
       notify_on_disconnect = EXCLUDED.notify_on_disconnect,
       notify_on_reconnect  = EXCLUDED.notify_on_reconnect,
       webhook_url          = EXCLUDED.webhook_url,
       updated_at           = NOW()
     RETURNING *`,
    [
      instanceName,
      locationId || null,
      alertEnabled ?? true,
      notifyOnDisconnect ?? true,
      notifyOnReconnect ?? false,
      webhookUrl || null,
    ]
  );
  return rows[0];
}

export async function getDisconnectEvents(instanceName, limit = 20) {
  const { rows } = await pool.query(
    `SELECT * FROM disconnect_events
     WHERE instance_name = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [instanceName, limit]
  );
  return rows;
}

export async function insertDisconnectEvent({
  instanceName,
  locationId,
  eventType,
  previousState,
  newState,
  alertSent,
  alertWebhookStatus,
}) {
  const { rows } = await pool.query(
    `INSERT INTO disconnect_events
       (instance_name, location_id, event_type, previous_state, new_state, alert_sent, alert_webhook_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      instanceName,
      locationId || null,
      eventType,
      previousState || null,
      newState,
      alertSent ?? false,
      alertWebhookStatus ?? null,
    ]
  );
  return rows[0];
}
