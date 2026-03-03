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
  async registerChannel({ name, webhookUrl }) {
    const { data } = await axios.post(BASE_URL, {
      name,
      webhookUrl,
      deliveryIdentifierTypes: ['PHONE_NUMBER']
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
          type: 'PHONE_NUMBER',
          value: phoneNumber
        }
      },
      { headers: this.headers }
    );

    console.log('✅ Cuenta de canal creada:', data.id);
    return data;
  }

  // Publicar un mensaje entrante de WhatsApp en el HubSpot Inbox
  // Usa modelo DELIVERY_IDENTIFIER: HubSpot agrupa por número de teléfono
  async publishIncomingMessage(channelId, { senderPhone, senderName, recipientPhone, messageText, timestamp }) {
    const { data } = await axios.post(
      `${BASE_URL}/${channelId}/messages`,
      {
        type: 'MESSAGE',
        direction: 'INCOMING',
        channelSpecificConversationId: senderPhone,
        senders: [{
          deliveryIdentifier: {
            type: 'PHONE_NUMBER',
            value: senderPhone
          },
          name: senderName || senderPhone
        }],
        recipients: [{
          deliveryIdentifier: {
            type: 'PHONE_NUMBER',
            value: recipientPhone
          }
        }],
        text: messageText,
        createdAt: timestamp ? new Date(Number(timestamp) * 1000).toISOString() : new Date().toISOString()
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
