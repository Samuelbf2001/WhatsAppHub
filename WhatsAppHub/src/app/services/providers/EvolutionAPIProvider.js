import axios from 'axios';
import WhatsAppProvider from './WhatsAppProvider.js';

/**
 * Proveedor para EvolutionAPI (open source, auto-hospedado, basado en Baileys).
 * Docs: https://doc.evolution-api.com
 *
 * Puede recibir credenciales por instancia (multi-tenant) o usar env vars globales.
 * Notas clave:
 *   - Eventos webhook en UPPERCASE: MESSAGES_UPSERT, CONNECTION_UPDATE, etc.
 *   - Número destino sin '+': "521234567890" (EvolutionAPI agrega @s.whatsapp.net)
 *   - fromMe=true en MESSAGES_UPSERT = mensaje enviado por nosotros → ignorar
 *   - payload.sender = JID del número de negocio (la instancia)
 *   - payload.data.key.remoteJid = JID del cliente
 */
export default class EvolutionAPIProvider extends WhatsAppProvider {
  /**
   * @param {object} opts
   * @param {string} [opts.apiUrl]   - URL base (fallback: EVOLUTION_API_URL)
   * @param {string} [opts.apiKey]   - API key de la instancia (fallback: EVOLUTION_API_KEY)
   * @param {string} [opts.instance] - Nombre de instancia (fallback: EVOLUTION_INSTANCE)
   */
  constructor({ apiUrl, apiKey, instance } = {}) {
    super();
    this.baseUrl  = (apiUrl    || process.env.EVOLUTION_API_URL)?.replace(/\/$/, '');
    this.apiKey   = apiKey     || process.env.EVOLUTION_API_KEY;
    this.instance = instance   || process.env.EVOLUTION_INSTANCE;
    this.headers  = {
      'Content-Type': 'application/json',
      'apikey': this.apiKey
    };
  }

  async sendTextMessage(to, message) {
    // Si ya es un JID completo (contiene @), enviarlo tal cual (ej: grupos @g.us)
    const number = to.includes('@') ? to : to.replace(/^\+/, '');
    const { data } = await axios.post(
      `${this.baseUrl}/message/sendText/${this.instance}`,
      { number, text: message, delay: 0 },
      { headers: this.headers }
    );
    return { messageId: data.key?.id };
  }

  async getGroupInfo(groupJid) {
    try {
      const { data } = await axios.get(
        `${this.baseUrl}/group/findGroupInfos/${this.instance}`,
        { params: { groupJid }, headers: this.headers }
      );
      return data;
    } catch (err) {
      console.warn(`[EvolutionAPI] No se pudo obtener info del grupo ${groupJid}: ${err.message}`);
      return null;
    }
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
   * Enviamos el nombre del template como texto plano como fallback.
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
   * @param {string} messageId - ID del mensaje (data.key.id)
   * @param {string} remoteJid - JID del cliente (data.key.remoteJid)
   */
  async markMessageAsRead(messageId, remoteJid) {
    if (!remoteJid || !messageId) {
      console.warn('[EvolutionAPI] markMessageAsRead requiere messageId y remoteJid');
      return;
    }
    try {
      await axios.post(
        `${this.baseUrl}/chat/markMessageAsRead/${this.instance}`,
        { readMessages: [{ remoteJid, fromMe: false, id: messageId }] },
        { headers: this.headers }
      );
    } catch (err) {
      console.warn(`[EvolutionAPI] No se pudo marcar como leído: ${err.message}`);
    }
  }

  /**
   * Verificar si un número tiene WhatsApp.
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
   * Descarga un mensaje de media desde EvolutionAPI y retorna base64 + mimetype.
   * @param {object} rawData - El objeto `data` del webhook (key, message, messageType, etc.)
   * @returns {Promise<{ base64: string, mimetype: string } | null>}
   */
  async downloadMedia(rawData) {
    if (!rawData) return null;
    try {
      const { data } = await axios.post(
        `${this.baseUrl}/chat/getBase64FromMediaMessage/${this.instance}`,
        { message: rawData, convertToMp4: false },
        { headers: this.headers, timeout: 30000 }
      );
      if (data?.base64) return { base64: data.base64, mimetype: data.mimetype || 'application/octet-stream' };
      return null;
    } catch (err) {
      console.warn(`[EvolutionAPI] downloadMedia failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Configurar el webhook de esta instancia.
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
   * Payload de entrada (MESSAGES_UPSERT):
   * {
   *   event: "MESSAGES_UPSERT",
   *   instance: "instancia",
   *   sender: "5219876543210@s.whatsapp.net",   ← número del NEGOCIO
   *   data: {
   *     key: { remoteJid: "5211234567890@s.whatsapp.net", fromMe: false, id: "ABC" },
   *     pushName: "Juan",
   *     message: { conversation | extendedTextMessage: { text } | imageMessage | ... },
   *     messageType: "conversation" | "imageMessage" | "videoMessage" | ...,
   *     messageTimestamp: 1709000000
   *   }
   * }
   *
   * Retorna null si debe ignorarse (evento no relevante).
   * fromMe=true → retorna el mensaje con isFromMe:true (el controlador decide si ignorarlo o echarlo a GHL).
   */
  processIncomingWebhook(payload) {
    try {
      // Compatibilidad con versiones antiguas (messages.upsert) y nuevas (MESSAGES_UPSERT)
      const event = (payload.event || '').toUpperCase().replace('.', '_');
      if (event !== 'MESSAGES_UPSERT') return null;

      const data = payload.data;
      if (!data) return null;

      // fromMe=true: mensajes enviados por nosotros (se echan en GHL para historial)
      const isFromMe = data.key?.fromMe === true;

      const isGroup = data.key?.remoteJid?.endsWith('@g.us') === true;

      const remoteJid   = data.key?.remoteJid || '';
      const businessJid = payload.sender || '';
      const messageType = data.messageType || 'conversation';

      // Para grupos: el participante es quien envió el mensaje dentro del grupo
      const participant    = data.participant || data.key?.participant || null;
      const rawParticipant = participant ? participant.replace('@s.whatsapp.net', '') : null;

      // phoneNumber: null para grupos (el controlador asigna el número del grupo como contacto ficticio)
      const rawPhone    = isGroup ? null : remoteJid.replace('@s.whatsapp.net', '');
      const rawBusiness = businessJid.replace('@s.whatsapp.net', '');

      // --- Extraer texto según tipo de mensaje ---
      let text = null;
      let mediaType = null;
      let caption = null;   // caption o filename — se usa como texto cuando hay adjunto real

      if (messageType === 'conversation' || messageType === 'extendedTextMessage') {
        text =
          data.message?.conversation ||
          data.message?.extendedTextMessage?.text ||
          null;

      } else if (messageType === 'imageMessage') {
        caption = data.message?.imageMessage?.caption || null;
        text = caption ? `📷 ${caption}` : '📷 [Imagen]';
        mediaType = 'image';

      } else if (messageType === 'videoMessage') {
        caption = data.message?.videoMessage?.caption || null;
        text = caption ? `🎥 ${caption}` : '🎥 [Video]';
        mediaType = 'video';

      } else if (messageType === 'audioMessage' || messageType === 'pttMessage') {
        caption = null;
        text = '🎵 [Nota de voz]';
        mediaType = 'audio';

      } else if (messageType === 'documentMessage') {
        caption = data.message?.documentMessage?.title || data.message?.documentMessage?.fileName || null;
        text = caption ? `📄 ${caption}` : '📄 [Documento]';
        mediaType = 'document';

      } else if (messageType === 'stickerMessage') {
        caption = null;
        text = '🎭 [Sticker]';
        mediaType = 'sticker';

      } else if (messageType === 'locationMessage') {
        const loc = data.message?.locationMessage;
        text = loc
          ? `📍 Ubicación: ${loc.degreesLatitude}, ${loc.degreesLongitude}`
          : '📍 [Ubicación recibida]';
        mediaType = 'location';

      } else if (messageType === 'reactionMessage' || messageType === 'protocolMessage' || messageType === 'senderKeyDistributionMessage') {
        // Reacciones y mensajes internos de WhatsApp — ignorar silenciosamente
        return null;
      } else {
        // Tipo no reconocido
        text = `📎 [Mensaje no compatible: ${messageType}]`;
        mediaType = 'unknown';
      }

      if (!text) text = '📎 [Mensaje no compatible]';

      return {
        messageId:    data.key?.id,
        remoteJid,                          // JID completo del cliente (para markAsRead)
        phoneNumber:  rawPhone ? `+${rawPhone}` : null,   // E.164
        businessPhone: rawBusiness ? `+${rawBusiness}` : null, // número del negocio
        contactName:  data.pushName || null,
        text,
        caption,                            // caption limpio (sin emoji), o null
        mediaType,                          // null = texto, "image"|"video"|etc. = media
        mediaUrl:     null,                 // se llena después de descargar el archivo
        timestamp:    (data.messageTimestamp || 0) * 1000,  // Evolution sends Unix seconds → convert to ms
        type:         mediaType ? 'media' : 'text',
        isFromMe,
        isGroup,
        groupJid:     isGroup ? remoteJid : null,
        participant:  isGroup ? (rawParticipant ? `+${rawParticipant}` : null) : null,
        _rawData:     mediaType && mediaType !== 'location' ? data : null,
      };
    } catch {
      return null;
    }
  }
}
