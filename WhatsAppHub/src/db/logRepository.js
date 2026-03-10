import pool from '../config/database.js';

/**
 * Inserta un registro de log de mensaje.
 * @param {string} portalId
 * @param {object} data
 *   - channelAccountId {string}
 *   - direction        {string}  'incoming' | 'outgoing'
 *   - customerPhone    {string}
 *   - businessPhone    {string}
 *   - messageText      {string}
 *   - status           {string}  'success' | 'error' | 'blocked'
 *   - errorMessage     {string}  solo si status='error'
 *   - eventType        {string}  'MESSAGE_RECEIVED' | 'MESSAGE_SENT' | 'TEMPLATE_SENT' | 'WINDOW_CLOSED' | 'ERROR'
 *   - provider         {string}  'evolution' | 'gupshup'
 */
export async function insertLog(portalId, data) {
  try {
    await pool.query(
      `INSERT INTO message_logs
         (portal_id, channel_account_id, direction, customer_phone, business_phone,
          message_text, status, error_message, event_type, provider)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        portalId,
        data.channelAccountId || null,
        data.direction,
        data.customerPhone || null,
        data.businessPhone || null,
        data.messageText ? data.messageText.slice(0, 500) : null,
        data.status,
        data.errorMessage || null,
        data.eventType || null,
        data.provider || null
      ]
    );
  } catch (err) {
    // El log nunca debe romper el flujo principal
    console.error('⚠️ Error insertando log:', err.message);
  }
}

/**
 * Obtiene logs paginados para un portal.
 * @param {string} portalId
 * @param {object} filters
 *   - page      {number}  default 1
 *   - limit     {number}  default 50 (max 200)
 *   - direction {string}  'incoming' | 'outgoing' | undefined (todos)
 *   - status    {string}  'success' | 'error' | 'blocked' | undefined (todos)
 *   - channelAccountId {string} filtrar por número de negocio
 */
export async function getLogs(portalId, filters = {}) {
  const page = Math.max(1, parseInt(filters.page) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(filters.limit) || 50));
  const offset = (page - 1) * limit;

  const conditions = ['portal_id = $1'];
  const values = [portalId];
  let idx = 2;

  if (filters.direction) {
    conditions.push(`direction = $${idx++}`);
    values.push(filters.direction);
  }
  if (filters.status) {
    conditions.push(`status = $${idx++}`);
    values.push(filters.status);
  }
  if (filters.channelAccountId) {
    conditions.push(`channel_account_id = $${idx++}`);
    values.push(filters.channelAccountId);
  }

  const where = conditions.join(' AND ');

  const [rowsResult, countResult] = await Promise.all([
    pool.query(
      `SELECT id, portal_id, channel_account_id, direction, customer_phone,
              business_phone, message_text, status, error_message, event_type,
              provider, created_at
       FROM message_logs
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset]
    ),
    pool.query(
      `SELECT COUNT(*) FROM message_logs WHERE ${where}`,
      values
    )
  ]);

  return {
    logs: rowsResult.rows,
    total: parseInt(countResult.rows[0].count),
    page,
    limit,
    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
  };
}

/**
 * Resumen de logs por portal: total mensajes, errores, últimos 7 días.
 */
export async function getLogsSummary(portalId) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE direction = 'incoming') AS incoming_total,
       COUNT(*) FILTER (WHERE direction = 'outgoing') AS outgoing_total,
       COUNT(*) FILTER (WHERE status = 'error')       AS errors_total,
       COUNT(*) FILTER (WHERE status = 'blocked')     AS blocked_total,
       COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS last_24h,
       COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')   AS last_7d
     FROM message_logs
     WHERE portal_id = $1`,
    [portalId]
  );
  return rows[0];
}
