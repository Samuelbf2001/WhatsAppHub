import axios from 'axios';
import WhatsAppProvider from './WhatsAppProvider.js';

/**
 * Proveedor para Gupshup Partner API (BSP oficial de Meta, multi-tenant).
 * Docs: https://partner-docs.gupshup.io
 *
 * Recibe credenciales por instancia (una por cliente/portal):
 *   appId    → ID del App en Gupshup (obtenido al crear el sub-account)
 *   appToken → App-level access token (expira 24h, gestionado por GupshupPartnerService)
 *
 * Variables de entorno globales (solo para GupshupPartnerService):
 *   GUPSHUP_PARTNER_EMAIL
 *   GUPSHUP_PARTNER_PASSWORD
 */
export default class GupshupProvider extends WhatsAppProvider {
  constructor({ appId, appToken } = {}) {
    super();
    this.appId = appId;
    this.appToken = appToken;
    this.partnerBase = 'https://partner.gupshup.io/partner';
  }

  getHeaders() {
    return {
      Authorization: this.appToken,
      'Content-Type': 'application/json'
    };
  }

  // POST /partner/app/{appId}/v3/message (formato Meta JSON)
  async sendTextMessage(to, message) {
    const { data } = await axios.post(
      `${this.partnerBase}/app/${this.appId}/v3/message`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: message }
      },
      { headers: this.getHeaders() }
    );
    return { messageId: data.messages?.[0]?.id };
  }

  // POST /partner/app/{appId}/v3/message (template formato Meta)
  async sendTemplateMessage(to, templateName, languageCode = 'es') {
    const { data } = await axios.post(
      `${this.partnerBase}/app/${this.appId}/v3/message`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode }
        }
      },
      { headers: this.getHeaders() }
    );
    return { messageId: data.messages?.[0]?.id };
  }

  async markMessageAsRead(messageId) {
    // Gupshup Partner API no expone endpoint de read receipts
    console.log(`[Gupshup] markAsRead: ${messageId} (no soportado vía API)`);
  }

  /**
   * Parsear webhook Gupshup v2.
   * Payload: { app, timestamp, version, type: "message", payload: { id, source, type, payload: { text }, sender: { phone, name } } }
   */
  processIncomingWebhook(payload) {
    try {
      if (payload.type !== 'message') return null;

      const msg = payload.payload;
      if (!msg || msg.type !== 'text') return null;

      return {
        messageId: msg.id,
        phoneNumber: msg.sender?.phone || msg.source,
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
