import dotenv from 'dotenv';
import WhatsAppService from '../services/whatsappService.js';
import HubSpotService from '../services/hubspotService.js';
import CustomChannelsService from '../services/customChannelsService.js';
import { getValidAccessToken } from './hubspot.controller.js';
import {
  getChannelAccount,
  getChannelAccountById,
  getChannelAccountByInstance,
  getChannelAccountByGupshupAppId,
  getGupshupApp
} from '../../db/channelRepository.js';
import { updateServiceWindow } from '../../db/serviceWindowRepository.js';
import { insertLog } from '../../db/logRepository.js';

dotenv.config();

/**
 * Detecta el channelAccount correcto a partir del payload del webhook.
 * Prioridad:
 *   1. ?channelAccountId= en query param (más explícito)
 *   2. payload.instance (EvolutionAPI)
 *   3. payload.app (Gupshup)
 *   4. Fallback: primer canal activo del portal
 */
async function detectChannelAccount(portalId, query, body) {
  // Prioridad 1: query param explícito
  if (query.channelAccountId) {
    return await getChannelAccountById(portalId, query.channelAccountId);
  }

  // Prioridad 2: Evolution — payload.instance
  if (body.instance) {
    const account = await getChannelAccountByInstance(body.instance);
    if (account) return account;
  }

  // Prioridad 3: Gupshup — payload.app
  if (body.app) {
    const account = await getChannelAccountByGupshupAppId(body.app);
    if (account) return account;
  }

  // Prioridad 4: fallback mono-número
  return await getChannelAccount(portalId);
}

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
  res.sendStatus(200);

  try {
    const whatsapp = new WhatsAppService();
    const messageData = whatsapp.processIncomingMessage(req.body);
    if (!messageData || !messageData.text) return;

    console.log(`📨 Mensaje de WhatsApp: ${messageData.phoneNumber} → "${messageData.text}"`);

    const portalId = req.query.portalId || process.env.HUBSPOT_PORTAL_ID;
    if (!portalId) {
      console.error('❌ portalId no encontrado en el webhook');
      return;
    }

    // Detectar qué número de negocio recibió el mensaje
    const channelAccount = await detectChannelAccount(portalId, req.query, req.body);
    if (!channelAccount) {
      console.error(`❌ No hay cuenta de canal configurada para portal ${portalId}`);
      return;
    }

    const accessToken = await getValidAccessToken(portalId);

    // Garantizar que el contacto exista ANTES de publicar el mensaje
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

    // Actualizar ventana de servicio (solo relevante para Gupshup/Cloud — se guarda igual para consistencia)
    await updateServiceWindow(portalId, messageData.phoneNumber, channelAccount.whatsapp_phone_number);

    await insertLog(portalId, {
      channelAccountId: channelAccount.channel_account_id,
      direction: 'incoming',
      customerPhone: messageData.phoneNumber,
      businessPhone: channelAccount.whatsapp_phone_number,
      messageText: messageData.text,
      status: 'success',
      eventType: 'MESSAGE_RECEIVED',
      provider: channelAccount.provider || 'evolution'
    });

    console.log(`✅ Mensaje publicado en HubSpot Inbox para portal ${portalId} (canal: ${channelAccount.channel_account_id})`);
  } catch (error) {
    console.error('❌ Error procesando webhook de WhatsApp:', error.message);

    const portalId = req.query.portalId || process.env.HUBSPOT_PORTAL_ID;
    if (portalId) {
      await insertLog(portalId, {
        direction: 'incoming',
        status: 'error',
        eventType: 'ERROR',
        errorMessage: error.message
      });
    }
  }
};

export const sendMessage = async (req, res) => {
  const { portalId, phoneNumber, message } = req.body;
  if (!phoneNumber || !message) return res.status(400).json({ error: 'Faltan parámetros' });

  try {
    const pid = portalId || process.env.HUBSPOT_PORTAL_ID;
    const isGupshup = (process.env.WHATSAPP_PROVIDER || 'evolution').toLowerCase() === 'gupshup';

    let whatsapp;
    if (isGupshup) {
      if (!pid) return res.status(400).json({ error: 'portalId requerido para Gupshup' });
      const gupshupApp = await getGupshupApp(String(pid));
      if (!gupshupApp) return res.status(404).json({ error: `No hay credenciales Gupshup para portal ${pid}` });
      whatsapp = new WhatsAppService({ appId: gupshupApp.gupshup_app_id, appToken: gupshupApp.gupshup_app_token });
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
