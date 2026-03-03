import dotenv from 'dotenv';
import WhatsAppService from '../services/whatsappService.js';
import HubSpotService from '../services/hubspotService.js';
import CustomChannelsService from '../services/customChannelsService.js';
import { getValidAccessToken } from './hubspot.controller.js';
import {
  saveChannelAccount,
  getAllChannelAccounts,
  getChannelAccount,
  getChannelAccountById,
  updateAuthorized,
  deleteChannelAccount
} from '../../db/channelRepository.js';

dotenv.config();

// Listar inboxes disponibles en el portal de HubSpot
// GET /api/channels/inboxes?portalId=
export const listInboxes = async (req, res) => {
  const portalId = req.query.portalId || process.env.HUBSPOT_PORTAL_ID;
  if (!portalId) return res.status(400).json({ error: 'portalId requerido' });

  try {
    const accessToken = await getValidAccessToken(portalId);
    const hubspot = new HubSpotService(accessToken);
    const inboxes = await hubspot.getInboxes();
    res.json({ success: true, inboxes });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo inboxes', details: error.response?.data || error.message });
  }
};

// Registrar canal y conectar cuenta de WhatsApp con inboxId
// POST /api/channels/setup
export const setupChannel = async (req, res) => {
  const { portalId, phoneNumberId, phoneNumber, inboxId, displayName } = req.body;

  if (!portalId || !phoneNumberId || !phoneNumber || !inboxId) {
    return res.status(400).json({
      error: 'Faltan parámetros requeridos',
      required: ['portalId', 'phoneNumberId', 'phoneNumber', 'inboxId']
    });
  }

  try {
    const whatsapp = new WhatsAppService();
    const formattedPhone = whatsapp.formatPhoneNumber(phoneNumber);

    const accessToken = await getValidAccessToken(portalId);
    const customChannels = new CustomChannelsService(accessToken);

    // Verificar si ya existe un canal para este portal (evitar duplicados)
    const existing = await getChannelAccount(portalId);
    let channelId;

    if (existing) {
      channelId = existing.channel_id;
      console.log(`♻️  Canal existente reutilizado para portal ${portalId}: ${channelId}`);
    } else {
      const webhookUrl = `${process.env.WEBHOOK_BASE_URL}/hubspot-channel-webhook`;
      const channel = await customChannels.registerChannel({
        name: displayName || 'WhatsApp',
        webhookUrl
      });
      channelId = channel.id;
      console.log(`✅ Canal registrado: ${channelId}`);
    }

    // Crear cuenta de canal con inboxId (requerido por HubSpot)
    const account = await customChannels.createChannelAccount(channelId, {
      displayName: displayName || `WhatsApp ${formattedPhone}`,
      phoneNumber: formattedPhone,
      inboxId
    });

    await saveChannelAccount(portalId, channelId, account.id, inboxId, phoneNumberId, formattedPhone);

    res.json({
      success: true,
      channelId,
      channelAccountId: account.id,
      inboxId,
      phoneNumber: formattedPhone
    });
  } catch (error) {
    const status = error.response?.status === 409 ? 409 : 500;
    console.error('❌ Error en setup de canal:', error.response?.data || error.message);
    res.status(status).json({
      error: status === 409 ? 'La cuenta de canal ya existe' : 'Error configurando canal',
      details: error.response?.data || error.message
    });
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

// Webhook que recibe todos los eventos de HubSpot Custom Channels
// POST /hubspot-channel-webhook
export const handleHubSpotChannelWebhook = async (req, res) => {
  res.sendStatus(200);

  try {
    const { eventType, portalId, channelAccountId } = req.body;
    console.log(`📤 Evento HubSpot Canal [${portalId}]: ${eventType}`);

    switch (eventType) {
      case 'OUTGOING_CHANNEL_MESSAGE_CREATED': {
        const { recipientId, messageContent } = req.body;
        if (!recipientId || !messageContent) break;

        const whatsapp = new WhatsAppService();
        const phone = whatsapp.formatPhoneNumber(recipientId);
        await whatsapp.sendTextMessage(phone, messageContent);
        console.log(`✅ Mensaje enviado a WhatsApp: ${phone}`);
        break;
      }

      case 'CHANNEL_ACCOUNT_CREATED':
        if (portalId && channelAccountId) {
          await updateAuthorized(String(portalId), channelAccountId, true);
          console.log(`✅ Canal autorizado: ${channelAccountId}`);
        }
        break;

      case 'CHANNEL_ACCOUNT_UPDATED': {
        const authorized = req.body.authorized ?? true;
        if (portalId && channelAccountId) {
          await updateAuthorized(String(portalId), channelAccountId, authorized);
          console.log(`🔄 Canal actualizado: ${channelAccountId} authorized=${authorized}`);
        }
        break;
      }

      case 'CHANNEL_ACCOUNT_PURGED':
        if (portalId && channelAccountId) {
          await deleteChannelAccount(String(portalId), channelAccountId);
          console.log(`🗑️  Canal eliminado: ${channelAccountId}`);
        }
        break;

      default:
        console.log(`⚠️  Evento no manejado: ${eventType}`);
    }
  } catch (error) {
    console.error('❌ Error en webhook de canal HubSpot:', error.message);
  }
};
