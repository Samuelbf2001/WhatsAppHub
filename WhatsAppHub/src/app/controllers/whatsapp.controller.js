import dotenv from 'dotenv';
import WhatsAppService from '../services/whatsappService.js';
import HubSpotService from '../services/hubspotService.js';
import CustomChannelsService from '../services/customChannelsService.js';
import { getValidAccessToken } from './hubspot.controller.js';
import {
  getChannelAccount,
  getChannelAccountById,
  getChannelAccountByInstance,
  getChannelAccountByGupshupAppId
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
  if (query.channelAccountId) {
    return await getChannelAccountById(portalId, query.channelAccountId);
  }
  if (body.instance) {
    const account = await getChannelAccountByInstance(body.instance);
    if (account) return account;
  }
  if (body.app) {
    const account = await getChannelAccountByGupshupAppId(body.app);
    if (account) return account;
  }
  return await getChannelAccount(portalId);
}

/**
 * Construir WhatsAppService con credenciales del channelAccount (multi-tenant).
 */
function buildWhatsAppService(channelAccount) {
  const provider = channelAccount.provider || 'evolution';

  if (provider === 'evolution') {
    return new WhatsAppService({
      provider: 'evolution',
      apiKey:   channelAccount.evolution_apikey   || process.env.EVOLUTION_API_KEY,
      instance: channelAccount.evolution_instance || process.env.EVOLUTION_INSTANCE
    });
  }

  // Gupshup: credenciales vienen del channelAccount
  return new WhatsAppService({
    provider: 'gupshup',
    appId:    channelAccount.gupshup_app_id,
    appToken: channelAccount.gupshup_app_token
  });
}

// GET /whatsapp-webhook — verificación de webhook (Meta/Gupshup)
export const verifyWebhook = (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
};

// POST /whatsapp-webhook — recibe mensajes entrantes de WhatsApp
export const receiveMessage = async (req, res) => {
  // Responder 200 inmediatamente (EvolutionAPI y otros no esperan respuesta)
  res.sendStatus(200);

  const portalId = req.query.portalId || process.env.HUBSPOT_PORTAL_ID;
  if (!portalId) {
    console.error('❌ portalId no encontrado en el webhook');
    return;
  }

  try {
    // 1. Detectar canal ANTES de parsear (necesitamos el provider)
    const channelAccount = await detectChannelAccount(portalId, req.query, req.body);
    if (!channelAccount) {
      console.error(`❌ No hay cuenta de canal configurada para portal ${portalId}`);
      return;
    }

    // 2. Construir servicio con credenciales del canal correcto
    const whatsapp = buildWhatsAppService(channelAccount);

    // 3. Parsear el webhook
    const messageData = whatsapp.processIncomingMessage(req.body);
    if (!messageData) return; // evento ignorado (fromMe, grupo, CONNECTION_UPDATE, etc.)

    if (!messageData.phoneNumber) {
      console.warn('⚠️ Mensaje sin número de teléfono, ignorando');
      return;
    }

    console.log(`📨 Mensaje entrante [${channelAccount.provider}] ${messageData.phoneNumber} → "${messageData.text}" (tipo: ${messageData.type})`);

    const accessToken = await getValidAccessToken(portalId);

    // 4. Garantizar que el contacto exista en HubSpot antes de publicar
    const hubspot = new HubSpotService(accessToken);
    await hubspot.findOrCreateContactByPhone(messageData.phoneNumber, messageData.contactName);

    // 5. Publicar en HubSpot Inbox via Custom Channels API
    const customChannels = new CustomChannelsService(accessToken);
    await customChannels.publishIncomingMessage(channelAccount.channel_id, {
      channelAccountId: channelAccount.channel_account_id,
      senderPhone:      messageData.phoneNumber,
      senderName:       messageData.contactName || messageData.phoneNumber,
      recipientPhone:   channelAccount.whatsapp_phone_number,
      messageText:      messageData.text,
      timestamp:        messageData.timestamp,
      externalMessageId: messageData.messageId
    });

    // 6. Marcar mensaje como leído en WhatsApp
    if (messageData.messageId && messageData.remoteJid) {
      await whatsapp.markMessageAsRead(messageData.messageId, messageData.remoteJid);
    }

    // 7. Actualizar ventana de servicio (24h)
    await updateServiceWindow(portalId, messageData.phoneNumber, channelAccount.whatsapp_phone_number);

    // 8. Log
    await insertLog(portalId, {
      channelAccountId: channelAccount.channel_account_id,
      direction:        'incoming',
      customerPhone:    messageData.phoneNumber,
      businessPhone:    channelAccount.whatsapp_phone_number,
      messageText:      messageData.text,
      status:           'success',
      eventType:        'MESSAGE_RECEIVED',
      provider:         channelAccount.provider || 'evolution'
    });

    console.log(`✅ Mensaje publicado en HubSpot Inbox para portal ${portalId} (canal: ${channelAccount.channel_account_id})`);

  } catch (error) {
    console.error('❌ Error procesando webhook de WhatsApp:', error.response?.data || error.message);

    await insertLog(portalId, {
      direction:    'incoming',
      status:       'error',
      eventType:    'ERROR',
      errorMessage: error.message
    }).catch(() => {});
  }
};

// POST /api/send-whatsapp — envío manual (para testing / uso interno)
export const sendMessage = async (req, res) => {
  const { portalId, phoneNumber, message } = req.body;
  if (!phoneNumber || !message) return res.status(400).json({ error: 'Faltan parámetros' });

  try {
    const pid = portalId || process.env.HUBSPOT_PORTAL_ID;
    const channelAccount = pid ? await getChannelAccount(String(pid)) : null;

    let whatsapp;
    if (channelAccount) {
      whatsapp = buildWhatsAppService(channelAccount);
    } else {
      whatsapp = new WhatsAppService(); // fallback env vars globales
    }

    const formattedPhone = whatsapp.formatPhoneNumber(phoneNumber);
    const result = await whatsapp.sendTextMessage(formattedPhone, message);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: 'Error enviando mensaje', details: error.response?.data || error.message });
  }
};
