import dotenv from 'dotenv';
import WhatsAppService from '../services/whatsappService.js';
import HubSpotService from '../services/hubspotService.js';
import CustomChannelsService from '../services/customChannelsService.js';
import { getValidAccessToken } from './hubspot.controller.js';
import { getChannelAccount } from '../../db/channelRepository.js';

dotenv.config();

export const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
};

export const receiveMessage = async (req, res) => {
  // Responder 200 inmediatamente para evitar que Meta reintente
  res.sendStatus(200);

  try {
    const whatsapp = new WhatsAppService();
    const messageData = whatsapp.processIncomingMessage(req.body);
    if (!messageData || !messageData.text) return;

    console.log(`📨 Mensaje de WhatsApp: ${messageData.phoneNumber} → "${messageData.text}"`);

    // Obtener portalId desde query param o variable de entorno (multi-tenant)
    const portalId = req.query.portalId || process.env.HUBSPOT_PORTAL_ID;
    if (!portalId) {
      console.error('❌ portalId no encontrado en el webhook');
      return;
    }

    const accessToken = await getValidAccessToken(portalId);
    const channelAccount = await getChannelAccount(portalId);
    if (!channelAccount) {
      console.error(`❌ No hay cuenta de canal configurada para portal ${portalId}`);
      return;
    }

    // Buscar o crear contacto en HubSpot CRM
    const hubspot = new HubSpotService(accessToken);
    const contacts = await hubspot.findContactByPhone(messageData.phoneNumber);
    if (contacts.length === 0) {
      await hubspot.createContact({
        firstname: messageData.contactName || 'WhatsApp Contact',
        phone: messageData.phoneNumber
      });
    }

    // Publicar mensaje en HubSpot Inbox via Custom Channels API
    const customChannels = new CustomChannelsService(accessToken);
    await customChannels.publishIncomingMessage(channelAccount.channel_id, {
      senderPhone: messageData.phoneNumber,
      senderName: messageData.contactName || messageData.phoneNumber,
      recipientPhone: channelAccount.whatsapp_phone_number,
      messageText: messageData.text,
      timestamp: messageData.timestamp
    });

    console.log(`✅ Mensaje publicado en HubSpot Inbox para portal ${portalId}`);
  } catch (error) {
    console.error('❌ Error procesando webhook de WhatsApp:', error.message);
  }
};

export const sendMessage = async (req, res) => {
  const { phoneNumber, message } = req.body;
  if (!phoneNumber || !message) return res.status(400).json({ error: 'Faltan parámetros' });

  try {
    const whatsapp = new WhatsAppService();
    const formattedPhone = whatsapp.formatPhoneNumber(phoneNumber);
    const result = await whatsapp.sendTextMessage(formattedPhone, message);
    res.json({ success: true, messageId: result.messages[0].id });
  } catch (error) {
    res.status(500).json({ error: 'Error enviando mensaje', details: error.message });
  }
};
