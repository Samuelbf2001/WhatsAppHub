import axios from 'axios';
import WhatsAppProvider from './WhatsAppProvider.js';

/**
 * Proveedor para EvolutionAPI (open source, auto-hospedado).
 * Docs: https://doc.evolution-api.com
 *
 * Variables de entorno requeridas:
 *   EVOLUTION_API_URL      → URL base del servidor (ej: http://localhost:8080)
 *   EVOLUTION_API_KEY      → API key global del servidor
 *   EVOLUTION_INSTANCE     → Nombre de la instancia (ej: "whatsapphub")
 */
export default class EvolutionAPIProvider extends WhatsAppProvider {
  constructor() {
    super();
    this.baseUrl = process.env.EVOLUTION_API_URL;
    this.apiKey = process.env.EVOLUTION_API_KEY;
    this.instance = process.env.EVOLUTION_INSTANCE;
    this.headers = {
      'Content-Type': 'application/json',
      'apikey': this.apiKey
    };
  }

  async sendTextMessage(to, message) {
    const { data } = await axios.post(
      `${this.baseUrl}/message/sendText/${this.instance}`,
      {
        number: to,
        text: message,
        delay: 0
      },
      { headers: this.headers }
    );
    return { messageId: data.key?.id || data.messageId };
  }

  async sendTemplateMessage(to, templateName, languageCode = 'es') {
    // EvolutionAPI no maneja templates de Meta nativamente.
    // Se puede enviar como texto plano o usar un mensaje pre-definido.
    console.warn('EvolutionAPI no soporta templates de Meta. Enviando como texto.');
    return this.sendTextMessage(to, templateName);
  }

  async markMessageAsRead(messageId) {
    await axios.post(
      `${this.baseUrl}/chat/markMessageAsRead/${this.instance}`,
      { messageId },
      { headers: this.headers }
    );
  }

  /**
   * Normalizar el webhook de EvolutionAPI al formato estándar.
   * EvolutionAPI envía eventos con estructura:
   * { event: "messages.upsert", data: { key, pushName, message, ... } }
   */
  processIncomingWebhook(payload) {
    try {
      if (payload.event !== 'messages.upsert') return null;

      const data = payload.data;
      if (!data || data.key?.fromMe) return null; // Ignorar mensajes enviados por nosotros

      const text =
        data.message?.conversation ||
        data.message?.extendedTextMessage?.text ||
        null;

      if (!text) return null;

      return {
        messageId: data.key?.id,
        phoneNumber: data.key?.remoteJid?.replace('@s.whatsapp.net', ''),
        contactName: data.pushName || null,
        text,
        timestamp: data.messageTimestamp,
        type: 'text'
      };
    } catch {
      return null;
    }
  }
}
