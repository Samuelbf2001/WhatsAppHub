import dotenv from 'dotenv';
import WhatsAppService from '../services/whatsappService.js';
import CustomChannelsService from '../services/customChannelsService.js';
import { getValidAccessToken } from './hubspot.controller.js';
import { saveChannelAccount, getAllChannelAccounts } from '../../db/channelRepository.js';

dotenv.config();

// Webhook que recibe los mensajes de salida desde HubSpot → WhatsApp
export const handleHubSpotChannelWebhook = async (req, res) => {
  res.sendStatus(200);

  try {
    const { eventType, recipientId, messageContent, portalId } = req.body;
    console.log(`📤 Evento HubSpot Canal: ${eventType}`);

    if (eventType !== 'OUTGOING_CHANNEL_MESSAGE_CREATED') return;
    if (!recipientId || !messageContent) return;

    const whatsapp = new WhatsAppService();
    const phone = whatsapp.formatPhoneNumber(recipientId);
    await whatsapp.sendTextMessage(phone, messageContent);

    console.log(`✅ Mensaje enviado a WhatsApp: ${phone}`);
  } catch (error) {
    console.error('❌ Error en webhook de canal HubSpot:', error.message);
  }
};

// Registrar el canal en HubSpot y conectar la cuenta de WhatsApp
// POST /api/channels/setup
export const setupChannel = async (req, res) => {
  const { portalId, phoneNumberId, phoneNumber, displayName } = req.body;
  if (!portalId || !phoneNumberId || !phoneNumber) {
    return res.status(400).json({ error: 'Faltan parámetros: portalId, phoneNumberId, phoneNumber' });
  }

  try {
    const accessToken = await getValidAccessToken(portalId);
    const customChannels = new CustomChannelsService(accessToken);

    const webhookUrl = `${process.env.WEBHOOK_BASE_URL || process.env.REDIRECT_URI?.replace('/oauth-callback', '')}/hubspot-channel-webhook`;

    // Registrar canal
    const channel = await customChannels.registerChannel({
      name: displayName || 'WhatsApp',
      webhookUrl
    });

    // Conectar cuenta de WhatsApp
    const account = await customChannels.createChannelAccount(channel.id, {
      displayName: displayName || `WhatsApp ${phoneNumber}`,
      phoneNumber
    });

    // Guardar en DB
    await saveChannelAccount(portalId, channel.id, account.id, phoneNumberId, phoneNumber);

    res.json({
      success: true,
      channelId: channel.id,
      channelAccountId: account.id,
      message: 'Canal configurado correctamente'
    });
  } catch (error) {
    console.error('❌ Error en setup de canal:', error.response?.data || error.message);
    res.status(500).json({ error: 'Error configurando canal', details: error.response?.data || error.message });
  }
};

// Listar cuentas de canal configuradas
// GET /api/channels
export const listChannels = async (req, res) => {
  try {
    const accounts = await getAllChannelAccounts();
    res.json({ success: true, channels: accounts });
  } catch (error) {
    res.status(500).json({ error: 'Error listando canales', details: error.message });
  }
};
