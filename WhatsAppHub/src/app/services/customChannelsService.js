import axios from 'axios';

const BASE_URL = 'https://api.hubapi.com/conversations/v3/custom-channels';

export default class CustomChannelsService {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.headers = {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };
  }

  // Registrar el canal en HubSpot (ejecutar una sola vez al hacer setup)
  async registerChannel({ name, webhookUrl, setupRedirectUrl }) {
    const { data } = await axios.post(BASE_URL, {
      name,
      webhookUrl,
      channelAccountCreationRedirectUrl: setupRedirectUrl || `${process.env.WEBHOOK_BASE_URL}/channel-setup`,
      capabilities: {
        deliveryIdentifierTypes: ['HS_PHONE_NUMBER'],
        threadingModel: 'DELIVERY_IDENTIFIER',
        richText: [],
        allowInlineImages: false,
        allowOutgoingMessages: true
      }
    }, { headers: this.headers });

    console.log('✅ Canal registrado en HubSpot:', data.id);
    return data;
  }

  // Conectar una cuenta de WhatsApp al canal
  async createChannelAccount(channelId, { displayName, phoneNumber, inboxId }) {
    const { data } = await axios.post(
      `${BASE_URL}/${channelId}/channel-accounts`,
      {
        name: displayName,
        inboxId,
        authorized: true,
        deliveryIdentifier: {
          type: 'HS_PHONE_NUMBER',
          value: phoneNumber
        }
      },
      { headers: this.headers }
    );

    console.log('✅ Cuenta de canal creada:', data.id);
    return data;
  }

  /**
   * Publicar un mensaje entrante de WhatsApp en el HubSpot Inbox.
   * Usa modelo DELIVERY_IDENTIFIER: integrationThreadId debe ser null.
   * channelAccountId es REQUERIDO por HubSpot para asociar el mensaje.
   */
  async publishIncomingMessage(channelId, { channelAccountId, senderPhone, senderName, recipientPhone, messageText, timestamp }) {
    const { data } = await axios.post(
      `${BASE_URL}/${channelId}/messages`,
      {
        channelAccountId,
        integrationThreadId: null,
        messageDirection: 'INCOMING',
        senders: [{
          deliveryIdentifier: { type: 'HS_PHONE_NUMBER', value: senderPhone },
          name: senderName || senderPhone
        }],
        recipients: [{
          deliveryIdentifier: { type: 'HS_PHONE_NUMBER', value: recipientPhone }
        }],
        text: messageText,
        timestamp: timestamp
          ? new Date(Number(timestamp) * 1000).toISOString()
          : new Date().toISOString()
      },
      { headers: this.headers }
    );

    return data;
  }

  /**
   * Publicar un mensaje de sistema en la conversación de HubSpot.
   * Aparece como mensaje entrante con sender "⚠️ WhatsAppHub" para notificar al agente.
   * Se usa cuando la ventana de 24h está cerrada o para avisos del sistema.
   */
  async publishSystemNotification(channelId, { channelAccountId, customerPhone, businessPhone, text }) {
    const { data } = await axios.post(
      `${BASE_URL}/${channelId}/messages`,
      {
        channelAccountId,
        integrationThreadId: null,
        messageDirection: 'INCOMING',
        senders: [{
          deliveryIdentifier: { type: 'HS_PHONE_NUMBER', value: customerPhone },
          name: '⚠️ WhatsAppHub Sistema'
        }],
        recipients: [{
          deliveryIdentifier: { type: 'HS_PHONE_NUMBER', value: businessPhone }
        }],
        text,
        timestamp: new Date().toISOString()
      },
      { headers: this.headers }
    );

    return data;
  }

  // Listar canales registrados del portal actual
  async listChannels() {
    const { data } = await axios.get(BASE_URL, {
      headers: this.headers
    });
    return data.results || data;
  }
}
