import axios from 'axios';
import WhatsAppProvider from './WhatsAppProvider.js';

/**
 * Proveedor para EvolutionAPI (open source, auto-hospedado, basado en Baileys).
 * Docs: https://doc.evolution-api.com
 *
 * Variables de entorno requeridas:
 *   EVOLUTION_API_URL      → URL base del servidor (ej: https://evo.tudominio.com)
 *   EVOLUTION_API_KEY      → API key global (o por instancia)
 *   EVOLUTION_INSTANCE     → Nombre de la instancia (ej: "whatsapphub")
 *
 * Notas clave:
 *   - Eventos webhook en UPPERCASE: MESSAGES_UPSERT, CONNECTION_UPDATE, etc.
 *   - Número destino sin '+': "521234567890" (EvolutionAPI agrega @s.whatsapp.net)
 *   - fromMe=true en MESSAGES_UPSERT = mensaje enviado por nosotros → ignorar
 *   - Texto puede estar en message.conversation o message.extendedTextMessage.text
 */
export default class EvolutionAPIProvider extends WhatsAppProvider {
  constructor() {
    super();
    this.baseUrl = process.env.EVOLUTION_API_URL?.replace(/\/$/, '');
    this.apiKey = process.env.EVOLUTION_API_KEY;
    this.instance = process.env.EVOLUTION_INSTANCE;
    this.headers = {
      'Content-Type': 'application/json',
      'apikey': this.apiKey
    };
  }

  async sendTextMessage(to, message) {
    const number = to.replace(/^\+/, ''); // EvolutionAPI no acepta el +
    const { data } = await axios.post(
      `${this.baseUrl}/message/sendText/${this.instance}`,
      { number, text: message, delay: 0 },
      { headers: this.headers }
    );
    return { messageId: data.key?.id };
  }

  async sendMedia(to, { mediatype, mimetype, url, caption, fileName }) {
    const number = to.replace(/^\+/, '');
    const { data } = await axios.post(
      `${this.baseUrl}/message/sendMedia/${this.instance}`,
      { number, mediatype, mimetype, media: url, caption, fileName, delay: 0 },
      { headers: this.headers }
    );
    return { messageId: data.key?.id };
  }

  /**
   * EvolutionAPI (Baileys) no gestiona templates de Meta.
   * Si se usa WHATSAPP-BAILEYS, enviamos el nombre del template como texto plano
   * (útil para "reabrir" conversación con un mensaje de presentación).
   * Si el operador migra a WHATSAPP-BUSINESS integration, templates funcionan vía Cloud API.
   */
  async sendTemplateMessage(to, templateName, _languageCode = 'es', params = []) {
    const body = params.length > 0
      ? `${templateName}\n${params.join(' | ')}`
      : templateName;
    console.warn(`[EvolutionAPI] Templates Meta no soportados en Baileys. Enviando como texto: "${body}"`);
    return this.sendTextMessage(to, body);
  }

  /**
   * Marcar mensaje como leído.
   * Requiere el objeto key completo del mensaje (remoteJid, fromMe, id).
   */
  async markMessageAsRead(messageId, remoteJid) {
    if (!remoteJid) {
      console.warn('[EvolutionAPI] markMessageAsRead requiere remoteJid');
      return;
    }
    await axios.post(
      `${this.baseUrl}/chat/markMessageAsRead/${this.instance}`,
      {
        readMessages: [
          { remoteJid, fromMe: false, id: messageId }
        ]
      },
      { headers: this.headers }
    );
  }

  /**
   * Verificar si un número tiene WhatsApp.
   * @returns {Promise<boolean>}
   */
  async checkNumberExists(phone) {
    const number = phone.replace(/^\+/, '');
    const { data } = await axios.post(
      `${this.baseUrl}/chat/whatsappNumbers/${this.instance}`,
      { numbers: [number] },
      { headers: this.headers }
    );
    return data?.[0]?.exists === true;
  }

  /**
   * Configurar el webhook de esta instancia para apuntar a WhatsAppHub.
   * Llamar durante el setup inicial o cuando cambie la URL del servidor.
   */
  async setWebhook(webhookUrl) {
    await axios.post(
      `${this.baseUrl}/webhook/set/${this.instance}`,
      {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED']
      },
      { headers: this.headers }
    );
    console.log(`[EvolutionAPI] Webhook configurado: ${webhookUrl}`);
  }

  /**
   * Parsear el webhook de EvolutionAPI al formato estándar de WhatsAppHub.
   *
   * Estructura de entrada:
   * {
   *   event: "MESSAGES_UPSERT",         ← SIEMPRE en UPPERCASE
   *   instance: "whatsapphub",
   *   data: {
   *     key: { remoteJid, fromMe, id },
   *     pushName: "Juan",
   *     message: { conversation | extendedTextMessage: { text } },
   *     messageType: "conversation",
   *     messageTimestamp: 1709000000
   *   }
   * }
   */
  processIncomingWebhook(payload) {
    try {
      if (payload.event !== 'MESSAGES_UPSERT') return null;

      const data = payload.data;
      if (!data) return null;

      // Ignorar mensajes enviados por nosotros
      if (data.key?.fromMe === true) return null;

      // Ignorar mensajes de grupos
      if (data.key?.remoteJid?.endsWith('@g.us')) return null;

      // Extraer texto (puede estar en dos propiedades distintas)
      const text =
        data.message?.conversation ||
        data.message?.extendedTextMessage?.text ||
        null;

      if (!text) return null; // Ignorar media, stickers, reactions, etc.

      const rawPhone = data.key?.remoteJid?.replace('@s.whatsapp.net', '') || '';

      return {
        messageId: data.key?.id,
        phoneNumber: `+${rawPhone}`,        // Normalizar a E.164
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
