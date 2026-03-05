/**
 * Interfaz base para proveedores de WhatsApp.
 * Todos los providers deben implementar estos métodos.
 */
export default class WhatsAppProvider {
  /**
   * Enviar mensaje de texto
   * @param {string} to - Número de teléfono destino
   * @param {string} message - Texto del mensaje
   * @returns {Promise<{ messageId: string }>}
   */
  async sendTextMessage(to, message) {
    throw new Error('sendTextMessage() no implementado');
  }

  /**
   * Enviar mensaje de template
   * @param {string} to - Número de teléfono destino
   * @param {string} templateName - Nombre del template
   * @param {string} languageCode - Código de idioma (ej: 'es')
   * @returns {Promise<{ messageId: string }>}
   */
  async sendTemplateMessage(to, templateName, languageCode = 'es', params = []) {
    throw new Error('sendTemplateMessage() no implementado');
  }

  /**
   * Marcar mensaje como leído
   * @param {string} messageId - ID del mensaje
   */
  async markMessageAsRead(messageId) {
    throw new Error('markMessageAsRead() no implementado');
  }

  /**
   * Procesar payload del webhook entrante y normalizar al formato estándar
   * @param {object} webhookPayload - Cuerpo del webhook recibido
   * @returns {{ messageId, phoneNumber, contactName, text, timestamp, type } | null}
   */
  processIncomingWebhook(webhookPayload) {
    throw new Error('processIncomingWebhook() no implementado');
  }

  /**
   * Formatear número de teléfono al formato E.164
   * @param {string} phoneNumber
   * @returns {string}
   */
  formatPhoneNumber(phoneNumber) {
    let formatted = phoneNumber.replace(/[^\d+]/g, '');
    if (!formatted.startsWith('+')) {
      formatted = formatted.startsWith('52') ? `+${formatted}` : `+52${formatted}`;
    }
    return formatted;
  }
}
