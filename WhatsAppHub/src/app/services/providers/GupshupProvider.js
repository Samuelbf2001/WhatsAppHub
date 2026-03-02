import axios from 'axios';
import WhatsAppProvider from './WhatsAppProvider.js';

/**
 * Proveedor para Gupshup (BSP oficial de Meta).
 * Docs: https://www.gupshup.io/developer/docs/bot-platform/guide/whatsapp-api-documentation
 *
 * Variables de entorno requeridas:
 *   GUPSHUP_API_KEY        → API key de Gupshup
 *   GUPSHUP_APP_NAME       → Nombre de la app en Gupshup
 *   GUPSHUP_SRC_NUMBER     → Número de origen registrado en Gupshup
 */
export default class GupshupProvider extends WhatsAppProvider {
  constructor() {
    super();
    this.apiKey = process.env.GUPSHUP_API_KEY;
    this.appName = process.env.GUPSHUP_APP_NAME;
    this.srcNumber = process.env.GUPSHUP_SRC_NUMBER;
    this.baseUrl = 'https://api.gupshup.io/sm/api/v1';
    this.headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'apikey': this.apiKey
    };
  }

  async sendTextMessage(to, message) {
    const params = new URLSearchParams({
      channel: 'whatsapp',
      source: this.srcNumber,
      destination: to,
      'src.name': this.appName,
      message: JSON.stringify({ type: 'text', text: message })
    });

    const { data } = await axios.post(
      `${this.baseUrl}/msg`,
      params,
      { headers: this.headers }
    );
    return { messageId: data.messageId };
  }

  async sendTemplateMessage(to, templateName, languageCode = 'es') {
    const params = new URLSearchParams({
      channel: 'whatsapp',
      source: this.srcNumber,
      destination: to,
      'src.name': this.appName,
      message: JSON.stringify({
        type: 'template',
        template: {
          id: templateName,
          params: []
        }
      }),
      template: 'true'
    });

    const { data } = await axios.post(
      `${this.baseUrl}/msg`,
      params,
      { headers: this.headers }
    );
    return { messageId: data.messageId };
  }

  async markMessageAsRead(messageId) {
    // Gupshup no expone endpoint de read receipts directamente
    console.log(`[Gupshup] markAsRead: ${messageId} (no soportado vía API)`);
  }

  /**
   * Normalizar el webhook de Gupshup al formato estándar.
   * Gupshup envía: { app, timestamp, version, type, payload: { ... } }
   */
  processIncomingWebhook(payload) {
    try {
      if (payload.type !== 'message') return null;

      const msg = payload.payload;
      if (!msg || msg.type !== 'text') return null;

      return {
        messageId: msg.id,
        phoneNumber: msg.sender?.phone,
        contactName: msg.sender?.name || null,
        text: msg.payload?.text,
        timestamp: payload.timestamp,
        type: 'text'
      };
    } catch {
      return null;
    }
  }
}
