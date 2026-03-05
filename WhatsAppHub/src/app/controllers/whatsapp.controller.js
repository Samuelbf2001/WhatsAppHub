import dotenv from 'dotenv';
import WhatsAppService from '../services/whatsappService.js';
import HubSpotService from '../services/hubspotService.js';
import CustomChannelsService from '../services/customChannelsService.js';
import { getValidAccessToken } from './hubspot.controller.js';
import { getChannelAccount, getGupshupApp } from '../../db/channelRepository.js';
import { updateServiceWindow } from '../../db/serviceWindowRepository.js';

const isGupshup = () => (process.env.WHATSAPP_PROVIDER || 'evolution').toLowerCase() === 'gupshup';

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

    // Garantizar que el contacto exista ANTES de publicar el mensaje.
    // La asociación contacto↔conversación ocurre en el momento de creación del hilo —
    // si el contacto no existe, HubSpot lo crea como visitante desconocido.
    const hubspot = new HubSpotService(accessToken);
    await hubspot.findOrCreateContactByPhone(messageData.phoneNumber, messageData.contactName);

    // Publicar mensaje en HubSpot Inbox via Custom Channels API
    const customChannels = new CustomChannelsService(accessToken);
    await customChannels.publishIncomingMessage(channelAccount.channel_id, {
      channelAccountId: channelAccount.channel_account_id,
      senderPhone: messageData.phoneNumber,
      senderName: messageData.contactName || messageData.phoneNumber,
      recipientPhone: channelAccount.whatsapp_phone_number,
      messageText: messageData.text,
      timestamp: messageData.timestamp
    });

    // Actualizar ventana de servicio: el cliente acaba de escribir → 24h abiertas
    await updateServiceWindow(portalId, messageData.phoneNumber);

    console.log(`✅ Mensaje publicado en HubSpot Inbox para portal ${portalId}`);
  } catch (error) {
    console.error('❌ Error procesando webhook de WhatsApp:', error.message);
  }
};

export const sendMessage = async (req, res) => {
  const { portalId, phoneNumber, message } = req.body;
  if (!phoneNumber || !message) return res.status(400).json({ error: 'Faltan parámetros' });

  try {
    let whatsapp;
    if (isGupshup()) {
      const pid = portalId || process.env.HUBSPOT_PORTAL_ID;
      if (!pid) return res.status(400).json({ error: 'portalId requerido para Gupshup' });
      const gupshupApp = await getGupshupApp(String(pid));
      if (!gupshupApp) return res.status(404).json({ error: `No hay credenciales Gupshup para portal ${pid}` });
      whatsapp = new WhatsAppService({
        appId: gupshupApp.gupshup_app_id,
        appToken: gupshupApp.gupshup_app_token
      });
    } else {
      whatsapp = new WhatsAppService();
    }

    const formattedPhone = whatsapp.formatPhoneNumber(phoneNumber);
    const result = await whatsapp.sendTextMessage(formattedPhone, message);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: 'Error enviando mensaje', details: error.message });
  }
};
