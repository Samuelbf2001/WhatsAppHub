/**
 * Buffer de mensajes entrantes por usuario.
 *
 * Cuando un usuario envía múltiples mensajes rápidos ("Hola", "tengo una pregunta",
 * "sobre el precio"), los agrupa en una sola entrada para HubSpot en lugar de
 * publicar 3 conversaciones separadas.
 *
 * Patrón n8n equivalente:
 *   - Agrega mensaje a lista Redis del remoteJid
 *   - Espera X segundos desde el último mensaje
 *   - Si llega otro antes del timeout, resetea el timer
 *   - Al vencer el timer, procesa todos los mensajes acumulados
 *
 * Implementación en memoria (sin Redis). Suficiente para una sola instancia.
 * Si se escala a múltiples instancias, migrar a Redis con ioredis.
 */

const BUFFER_WINDOW_MS = parseInt(process.env.MESSAGE_BUFFER_MS || '8000', 10);

/** @type {Map<string, { messages: Array, timer: NodeJS.Timeout, channelAccount: object, portalId: string }>} */
const buffers = new Map();

/**
 * Agrega un mensaje al buffer del usuario.
 * Si el timer ya estaba corriendo, lo reinicia (ventana deslizante).
 * Cuando el timer vence, llama onFlush con todos los mensajes acumulados.
 *
 * @param {string} bufferKey - Identificador único: `${channelAccountId}:${remoteJid}`
 * @param {object} messageData - Resultado de processIncomingWebhook()
 * @param {object} channelAccount - Cuenta de canal asociada
 * @param {string} portalId - Portal de HubSpot
 * @param {function(messages: Array, channelAccount: object, portalId: string): Promise<void>} onFlush
 */
export function addToBuffer(bufferKey, messageData, channelAccount, portalId, onFlush) {
  if (!buffers.has(bufferKey)) {
    buffers.set(bufferKey, { messages: [], timer: null, channelAccount, portalId });
  }

  const entry = buffers.get(bufferKey);
  entry.messages.push(messageData);

  // Resetear ventana cada vez que llega un mensaje nuevo
  clearTimeout(entry.timer);
  entry.timer = setTimeout(async () => {
    const { messages, channelAccount: ca, portalId: pid } = entry;
    buffers.delete(bufferKey);
    try {
      await onFlush(messages, ca, pid);
    } catch (err) {
      console.error(`[MessageBuffer] Error en flush de ${bufferKey}:`, err.message);
    }
  }, BUFFER_WINDOW_MS);
}

/**
 * Combinar múltiples mensajes del buffer en un solo texto para HubSpot.
 * Si solo hay uno, se devuelve tal cual.
 * Si hay varios, se unen con salto de línea y se usa el último messageId/timestamp.
 *
 * @param {Array} messages
 * @returns {object} messageData combinado
 */
export function mergeMessages(messages) {
  if (messages.length === 1) return messages[0];

  const combined = {
    ...messages[messages.length - 1], // usa el más reciente como base (messageId, remoteJid, etc.)
    text: messages.map(m => m.text).join('\n'),
    mediaType: messages.some(m => m.mediaType) ? 'mixed' : null,
    type: messages.every(m => m.type === 'text') ? 'text' : 'media'
  };

  return combined;
}

/** Número de buffers activos (útil para diagnóstico) */
export function getActiveBufferCount() {
  return buffers.size;
}
