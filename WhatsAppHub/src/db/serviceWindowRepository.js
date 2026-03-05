import pool from '../config/database.js';

const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 horas en ms

/**
 * Actualiza (o crea) la ventana de servicio al recibir un mensaje del cliente.
 * Se llama cada vez que llega un mensaje entrante de WhatsApp.
 */
export async function updateServiceWindow(portalId, customerPhone) {
  await pool.query(
    `INSERT INTO service_windows (portal_id, customer_phone, last_message_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (portal_id, customer_phone)
     DO UPDATE SET last_message_at = NOW()`,
    [portalId, customerPhone]
  );
}

/**
 * Comprueba si la ventana de 24h está abierta para un número de cliente.
 * Retorna: { open: boolean, lastMessageAt: Date|null, remainingMs: number }
 */
export async function getWindowStatus(portalId, customerPhone) {
  const { rows } = await pool.query(
    `SELECT last_message_at FROM service_windows
     WHERE portal_id = $1 AND customer_phone = $2`,
    [portalId, customerPhone]
  );

  if (rows.length === 0) return { open: false, lastMessageAt: null, remainingMs: 0 };

  const lastMessageAt = new Date(rows[0].last_message_at);
  const elapsed = Date.now() - lastMessageAt.getTime();
  const remainingMs = Math.max(0, WINDOW_MS - elapsed);

  return { open: remainingMs > 0, lastMessageAt, remainingMs };
}
