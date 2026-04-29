import dotenv from 'dotenv';
import WhatsAppService from '../services/whatsappService.js';
import HubSpotService from '../services/hubspotService.js';
import CustomChannelsService from '../services/customChannelsService.js';
import { addToBuffer, mergeMessages } from '../services/messageBuffer.js';
import { saveMedia } from '../services/mediaStorage.js';
import { getValidAccessToken } from './hubspot.controller.js';
import { getValidGHLToken } from './ghl.controller.js';
import { findOrCreateGHLContact, publishInboundMessageToGHL } from '../services/ghlService.js';
import {
  getChannelAccount,
  getChannelAccountById,
  getChannelAccountByInstance,
  getChannelAccountByGupshupAppId
} from '../../db/channelRepository.js';
import {
  getGHLChannelAccount,
  getGHLChannelAccountByInstance,
  getAllGHLChannelAccounts,
} from '../../db/ghlChannelRepository.js';
import { updateServiceWindow } from '../../db/serviceWindowRepository.js';
import { insertLog } from '../../db/logRepository.js';

dotenv.config();

// Caché en memoria de nombres de grupo (evita llamar getGroupInfo en cada mensaje)
const _groupNameCache = new Map();

// Deduplicación de mensajes en locations con múltiples números
const _processedMsgIds = new Map(); // "locationId:messageId" → timestamp
let _dedupCleanupCounter = 0;

// Cache: "locationId:customerPhone" → channelAccount object
export const _lastChannelMap = new Map();

async function resolveGroupName(whatsapp, groupJid, groupNumber) {
  if (_groupNameCache.has(groupJid)) return _groupNameCache.get(groupJid);
  try {
    const info = await whatsapp.getGroupInfo(groupJid);
    const name = info?.subject || info?.name || `Grupo ${groupNumber}`;
    _groupNameCache.set(groupJid, name);
    return name;
  } catch {
    const fallback = `Grupo ${groupNumber}`;
    _groupNameCache.set(groupJid, fallback);
    return fallback;
  }
}

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

  return new WhatsAppService({
    provider: 'gupshup',
    appId:    channelAccount.gupshup_app_id,
    appToken: channelAccount.gupshup_app_token
  });
}

/**
 * Publicar mensajes (uno o varios del buffer) en HubSpot y actualizar estado.
 * Se llama cuando el buffer del usuario se vacía (timer vence).
 */
async function flushToHubSpot(messages, channelAccount, portalId) {
  const merged = mergeMessages(messages);

  console.log(`📤 Flush buffer [${messages.length} msg] → HubSpot: ${merged.phoneNumber} "${merged.text.slice(0, 60)}${merged.text.length > 60 ? '…' : ''}"`);

  const accessToken = await getValidAccessToken(portalId);

  // Garantizar que el contacto exista
  const hubspot = new HubSpotService(accessToken);
  await hubspot.findOrCreateContactByPhone(merged.phoneNumber, merged.contactName);

  // Publicar en HubSpot Inbox
  const customChannels = new CustomChannelsService(accessToken);
  await customChannels.publishIncomingMessage(channelAccount.channel_id, {
    channelAccountId:  channelAccount.channel_account_id,
    senderPhone:       merged.phoneNumber,
    senderName:        merged.contactName || merged.phoneNumber,
    recipientPhone:    channelAccount.whatsapp_phone_number,
    messageText:       merged.text,
    timestamp:         merged.timestamp,
    externalMessageId: merged.messageId   // ID del último mensaje del grupo
  });

  // Actualizar ventana de servicio
  await updateServiceWindow(portalId, merged.phoneNumber, channelAccount.whatsapp_phone_number);

  // Log
  await insertLog(portalId, {
    channelAccountId: channelAccount.channel_account_id,
    direction:        'incoming',
    customerPhone:    merged.phoneNumber,
    businessPhone:    channelAccount.whatsapp_phone_number,
    messageText:      merged.text,
    status:           'success',
    eventType:        messages.length > 1 ? 'MESSAGE_BATCH_RECEIVED' : 'MESSAGE_RECEIVED',
    provider:         channelAccount.provider || 'evolution'
  });

  console.log(`✅ Publicado en HubSpot Inbox: portal ${portalId}, canal ${channelAccount.channel_account_id} (${messages.length} msgs agrupados)`);
}

/**
 * Publica mensajes del buffer en GHL Conversations Inbox.
 * Se usa cuando el webhook llega con ?locationId= (canal GHL).
 */
async function flushToGHL(messages, channelAccount, locationId) {
  const merged = mergeMessages(messages);

  console.log(`📤 Flush buffer GHL [${messages.length} msg] → location=${locationId} phone=${merged.phoneNumber} "${merged.text.slice(0, 60)}"`);

  const accessToken = await getValidGHLToken(locationId, channelAccount.company_id || null);
  console.log(`🔑 Token GHL obtenido para ${locationId}: ${accessToken ? accessToken.slice(0,20)+'...' : 'NULL'}`);
  const contactId   = await findOrCreateGHLContact(accessToken, locationId, merged.phoneNumber, merged.contactName);
  console.log(`👤 ContactId GHL: ${contactId}`);

  // Source footer cuando hay múltiples números en el mismo location
  try {
    const allChannels = await getAllGHLChannelAccounts(locationId);
    if (allChannels.length > 1 && channelAccount.whatsapp_phone_number) {
      merged.text = `${merged.text}\n\nSource: +${channelAccount.whatsapp_phone_number}`;
    }
  } catch {}

  await publishInboundMessageToGHL(accessToken, locationId, contactId, {
    text:        merged.text,
    mediaUrl:    merged.mediaUrl || null,
    timestamp:   merged.timestamp,
    phoneNumber: merged.phoneNumber,
  });

  insertLog(locationId, {
    channelAccountId: channelAccount.id,
    direction:        'incoming',
    customerPhone:    merged.phoneNumber,
    businessPhone:    channelAccount.whatsapp_phone_number,
    messageText:      merged.text,
    status:           'success',
    eventType:        messages.length > 1 ? 'MESSAGE_BATCH_RECEIVED' : 'MESSAGE_RECEIVED',
    provider:         channelAccount.provider || 'evolution',
  }).catch(err => console.error('[Log GHL]', err.message));

  _lastChannelMap.set(`${locationId}:${merged.phoneNumber}`, channelAccount);

  console.log(`✅ Publicado en GHL Inbox: location ${locationId} (${messages.length} msgs agrupados)`);
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

// POST /whatsapp-webhook — recibe mensajes entrantes de WhatsApp (HubSpot o GHL)
export const receiveMessage = async (req, res) => {
  res.sendStatus(200);

  // Detectar si el webhook viene de un canal GHL o HubSpot
  const locationId = req.query.locationId || null;
  const portalId   = req.query.portalId   || process.env.HUBSPOT_PORTAL_ID;
  const isGHL      = !!locationId;

  const tenantId = isGHL ? locationId : portalId;
  if (!tenantId) {
    console.error('❌ Ni portalId ni locationId encontrados en el webhook');
    return;
  }

  try {
    let channelAccount;

    if (isGHL) {
      // Canal GHL: buscar por instancia o primer canal del location
      channelAccount = req.body.instance
        ? await getGHLChannelAccountByInstance(req.body.instance) || await getGHLChannelAccount(locationId)
        : await getGHLChannelAccount(locationId);
    } else {
      // Canal HubSpot: lógica existente
      channelAccount = await detectChannelAccount(portalId, req.query, req.body);
    }

    if (!channelAccount) {
      console.error(`❌ No hay canal configurado para ${isGHL ? 'GHL location' : 'HubSpot portal'} ${tenantId}`);
      return;
    }

    const whatsapp    = buildWhatsAppService(channelAccount);
    const messageData = whatsapp.processIncomingMessage(req.body);
    if (!messageData) return;

    // Descargar media (imagen, video, audio) y guardar en disco para GHL
    if (messageData._rawData) {
      try {
        const mediaResult = await whatsapp.downloadMedia(messageData._rawData);
        if (mediaResult?.base64) {
          messageData.mediaUrl = saveMedia(mediaResult.base64, mediaResult.mimetype, messageData.messageId);
          console.log(`📎 Media guardada: ${messageData.mediaUrl} (${messageData.mediaType})`);
        }
      } catch (err) {
        console.warn(`⚠️ No se pudo descargar media (${messageData.mediaType}): ${err.message}`);
      }
      delete messageData._rawData;
    }

    // Deduplicación: evitar doble publicación cuando múltiples números están en el mismo grupo
    if (isGHL && messageData.messageId) {
      const dedupKey = `${tenantId}:${messageData.messageId}`;
      if (_processedMsgIds.has(dedupKey)) {
        console.log(`⚡ Mensaje duplicado ignorado (multi-número): ${messageData.messageId}`);
        return;
      }
      _processedMsgIds.set(dedupKey, Date.now());
      // Cleanup lazy: cada 200 mensajes, eliminar entradas > 5 min
      if (++_dedupCleanupCounter % 200 === 0) {
        const cutoff = Date.now() - 5 * 60 * 1000;
        for (const [k, ts] of _processedMsgIds) {
          if (ts < cutoff) _processedMsgIds.delete(k);
        }
      }
    }

    // Mensajes enviados por nosotros (fromMe): solo interesan a GHL para historial
    if (messageData.isFromMe && !isGHL) return;

    // Grupos: HubSpot no los soporta; GHL sí (contacto ficticio por número de grupo)
    if (messageData.isGroup) {
      if (!isGHL) return;
      const groupNumber = messageData.groupJid?.replace('@g.us', '') || null;
      if (!groupNumber) {
        console.warn('⚠️ Mensaje de grupo sin JID válido, ignorando');
        return;
      }
      messageData.phoneNumber = `+${groupNumber}`;

      if (!messageData.isFromMe) {
        // Guardar nombre e identificador del remitente antes de sobreescribir contactName
        const senderName  = messageData.contactName;   // pushName del remitente
        const senderPhone = messageData.participant;   // número E.164 del remitente

        // Nombre del grupo (una sola llamada a Evolution API, luego queda en caché)
        messageData.contactName = await resolveGroupName(whatsapp, messageData.groupJid, groupNumber);

        // Pie de mensaje: "— Nombre (número)" o "— número" si no hay nombre
        const senderLabel = (senderName && senderPhone && senderName !== senderPhone)
          ? `${senderName} (${senderPhone})`
          : (senderName || senderPhone);
        if (senderLabel) {
          messageData.text = `${messageData.text}\n\n— ${senderLabel}`;
        }
      }
    }

    if (!messageData.phoneNumber) {
      console.warn('⚠️ Mensaje sin número de teléfono, ignorando');
      return;
    }

    console.log(`📨 Mensaje ${messageData.isFromMe ? 'saliente (eco)' : 'entrante'} [${isGHL ? 'GHL' : 'HubSpot'}][${channelAccount.provider}]${messageData.isGroup ? ' [GRUPO]' : ''} ${messageData.phoneNumber} → "${messageData.text?.slice(0, 60)}" (tipo: ${messageData.type})`);

    // fromMe → publicar directamente en GHL como mensaje saliente (sin buffer)
    if (messageData.isFromMe) {
      try {
        const accessToken = await getValidGHLToken(locationId, channelAccount.company_id || null);
        const contactId   = await findOrCreateGHLContact(accessToken, locationId, messageData.phoneNumber, null);
        await publishInboundMessageToGHL(accessToken, locationId, contactId, {
          text:        messageData.text,
          mediaUrl:    messageData.mediaUrl || null,
          timestamp:   messageData.timestamp,
          phoneNumber: messageData.phoneNumber,
          direction:   'outbound',
        });
        await insertLog(locationId, {
          channelAccountId: channelAccount.id,
          direction:        'outgoing',
          customerPhone:    messageData.phoneNumber,
          businessPhone:    channelAccount.whatsapp_phone_number,
          messageText:      messageData.text,
          status:           'success',
          eventType:        'MESSAGE_ECHO',
          provider:         channelAccount.provider || 'evolution',
        });
      } catch (err) {
        console.error('❌ Error al hacer eco de mensaje fromMe a GHL:', err.message);
      }
      return;
    }

    if (messageData.messageId && messageData.remoteJid) {
      whatsapp.markMessageAsRead(messageData.messageId, messageData.remoteJid).catch(() => {});
    }

    if (isGHL) {
      // GHL no necesita buffer — cada mensaje llega inmediatamente
      setImmediate(() => flushToGHL([messageData], channelAccount, tenantId)
        .catch(err => console.error('[GHL flush directo]', err.message)));
      return;
    }

    const bufferKey = `hs:${tenantId}:${messageData.remoteJid}`;
    addToBuffer(bufferKey, messageData, channelAccount, tenantId, flushToHubSpot);

  } catch (error) {
    console.error('❌ Error procesando webhook de WhatsApp:', error.response?.data || error.message);
    await insertLog(tenantId, {
      direction:    'incoming',
      status:       'error',
      eventType:    'ERROR',
      errorMessage: error.message,
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

    const whatsapp = channelAccount
      ? buildWhatsAppService(channelAccount)
      : new WhatsAppService();

    const formattedPhone = whatsapp.formatPhoneNumber(phoneNumber);
    const result = await whatsapp.sendTextMessage(formattedPhone, message);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: 'Error enviando mensaje', details: error.response?.data || error.message });
  }
};
