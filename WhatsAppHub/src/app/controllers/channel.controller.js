import dotenv from 'dotenv';
import WhatsAppService from '../services/whatsappService.js';
import HubSpotService from '../services/hubspotService.js';
import CustomChannelsService from '../services/customChannelsService.js';
import GupshupPartnerService from '../services/gupshupPartnerService.js';
import { getValidAccessToken } from './hubspot.controller.js';
import {
  saveChannelAccount,
  getAllChannelAccounts,
  getChannelAccount,
  getChannelAccountById,
  updateAuthorized,
  deleteChannelAccount,
  saveGupshupApp,
  getGupshupApp
} from '../../db/channelRepository.js';
import { getWindowStatus } from '../../db/serviceWindowRepository.js';
import { insertLog } from '../../db/logRepository.js';

dotenv.config();

const getProvider = () => (process.env.WHATSAPP_PROVIDER || 'evolution').toLowerCase();
const isGupshup = () => getProvider() === 'gupshup';

/**
 * Parsear el comando /plantilla del agente.
 * Sintaxis: /plantilla nombre_template [param1|param2|param3]
 */
function parseTemplateCommand(text) {
  const trimmed = (text || '').trim();
  if (!/^\/plantilla\s+/i.test(trimmed)) return null;
  const parts = trimmed.replace(/^\/plantilla\s+/i, '').trim();
  const [namePart, paramsPart] = parts.split(/\s+(.+)/);
  const templateName = namePart?.trim();
  if (!templateName) return null;
  const params = paramsPart ? paramsPart.split('|').map(p => p.trim()) : [];
  return { templateName, params };
}

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

// POST /api/channels/setup
export const setupChannel = async (req, res) => {
  const { portalId, phoneNumberId, phoneNumber, inboxId, displayName, evolutionInstance } = req.body;

  if (!portalId || !phoneNumberId || !phoneNumber || !inboxId) {
    return res.status(400).json({
      error: 'Faltan parámetros requeridos',
      required: ['portalId', 'phoneNumberId', 'phoneNumber', 'inboxId']
    });
  }

  try {
    const formattedPhone = phoneNumber.replace(/\D/g, '');
    const provider = getProvider();

    const accessToken = await getValidAccessToken(portalId);
    const customChannels = new CustomChannelsService(accessToken);

    // Verificar si ya existe canal para este portal
    const existing = await getChannelAccount(portalId);
    let channelId;

    if (existing) {
      channelId = existing.channel_id;
      console.log(`♻️  Canal existente reutilizado para portal ${portalId}: ${channelId}`);
    } else {
      const hubspotWebhookUrl = `${process.env.WEBHOOK_BASE_URL}/hubspot-channel-webhook`;
      const channel = await customChannels.registerChannel({
        name: displayName || 'WhatsApp',
        webhookUrl: hubspotWebhookUrl
      });
      channelId = channel.id;
      console.log(`✅ Canal registrado: ${channelId}`);
    }

    const account = await customChannels.createChannelAccount(channelId, {
      displayName: displayName || `WhatsApp ${formattedPhone}`,
      phoneNumber: formattedPhone,
      inboxId
    });

    // Datos de provider a guardar
    const providerData = { provider };

    if (provider === 'evolution') {
      // Si se pasó instancia existente, usarla; si no, crear nueva en EvolutionAPI
      const instanceName = evolutionInstance || `portal_${portalId}_${formattedPhone}`;
      let instanceId = null;
      let instanceApikey = null;

      try {
        const whatsappWebhookUrl = `${process.env.WEBHOOK_BASE_URL}/whatsapp-webhook?portalId=${portalId}&channelAccountId=${account.id}`;
        const evoResponse = await fetch(`${process.env.EVOLUTION_API_URL}/instance/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': process.env.EVOLUTION_API_KEY },
          body: JSON.stringify({
            instanceName,
            integration: 'WHATSAPP-BAILEYS',
            qrcode: true,
            webhook: {
              url: whatsappWebhookUrl,
              byEvents: false,
              base64: false,
              events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED']
            }
          })
        });
        const evoData = await evoResponse.json();
        instanceId = evoData.instance?.instanceId || null;
        instanceApikey = evoData.hash?.apikey || null;
        console.log(`✅ Instancia Evolution creada: ${instanceName} (id: ${instanceId})`);
      } catch (evoErr) {
        console.warn(`⚠️ No se pudo crear instancia Evolution automáticamente: ${evoErr.message}`);
      }

      providerData.evolutionInstance = instanceName;
      providerData.evolutionInstanceId = instanceId;
      providerData.evolutionApikey = instanceApikey;

    } else if (provider === 'gupshup') {
      const whatsappWebhookUrl = `${process.env.WEBHOOK_BASE_URL}/whatsapp-webhook?portalId=${portalId}&channelAccountId=${account.id}`;
      const partner = new GupshupPartnerService();
      const gupshupApp = await partner.createApp({
        displayName: displayName || `WhatsApp ${formattedPhone}`,
        webhookUrl: whatsappWebhookUrl
      });
      const gupshupAppId = gupshupApp.id || gupshupApp.app?.id;
      await partner.setWebhook(gupshupAppId, whatsappWebhookUrl);
      const gupshupAppToken = await partner.getAppToken(gupshupAppId);
      const tokenExpiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000);
      await saveGupshupApp(portalId, account.id, gupshupAppId, gupshupAppToken, tokenExpiresAt);
      providerData.gupshupAppId = gupshupAppId;
      providerData.gupshupAppToken = gupshupAppToken;
      providerData.gupshupAppTokenExpiresAt = tokenExpiresAt;
      console.log(`✅ Gupshup App configurada para portal ${portalId}: ${gupshupAppId}`);
    }

    await saveChannelAccount(portalId, channelId, account.id, inboxId, phoneNumberId, formattedPhone, providerData);

    res.json({
      success: true,
      channelId,
      channelAccountId: account.id,
      inboxId,
      phoneNumber: formattedPhone,
      provider,
      ...(providerData.evolutionInstance && { evolutionInstance: providerData.evolutionInstance })
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

// GET /api/channels
export const listChannels = async (req, res) => {
  try {
    const portalId = req.query.portalId || null;
    const accounts = await getAllChannelAccounts(portalId);
    res.json({ success: true, channels: accounts });
  } catch (error) {
    res.status(500).json({ error: 'Error listando canales', details: error.message });
  }
};

// POST /hubspot-channel-webhook
export const handleHubSpotChannelWebhook = async (req, res) => {
  res.sendStatus(200);

  try {
    const { eventType, portalId, channelAccountId } = req.body;
    console.log(`📤 Evento HubSpot Canal [${portalId}]: ${eventType}`);

    switch (eventType) {
      case 'OUTGOING_CHANNEL_MESSAGE_CREATED': {
        const msg = req.body.message || {};
        const customerPhone = msg.recipients?.[0]?.deliveryIdentifier?.value;
        const businessPhone = msg.senders?.[0]?.deliveryIdentifier?.value;
        const messageText = msg.text;
        const msgChannelAccountId = msg.channelAccountId || channelAccountId;

        if (!customerPhone || !messageText) {
          console.warn('⚠️ OUTGOING sin customerPhone o text', JSON.stringify(req.body));
          break;
        }

        // Obtener canal exacto por channelAccountId (routing saliente preciso)
        const channelAccount = await getChannelAccountById(String(portalId), msgChannelAccountId)
          || await getChannelAccount(String(portalId));

        if (!channelAccount) {
          console.error(`❌ No hay cuenta de canal para portal ${portalId} / ${msgChannelAccountId}`);
          break;
        }

        const provider = channelAccount.provider || 'evolution';

        // Construir instancia WhatsApp con credenciales correctas
        let whatsapp;
        if (provider === 'gupshup') {
          const gupshupApp = await getGupshupApp(String(portalId));
          if (!gupshupApp) {
            console.error(`❌ No hay credenciales Gupshup para portal ${portalId}`);
            break;
          }
          whatsapp = new WhatsAppService({ appId: gupshupApp.gupshup_app_id, appToken: gupshupApp.gupshup_app_token });
        } else {
          // Evolution: usar apikey de instancia si está disponible, sino la global
          whatsapp = new WhatsAppService({
            instanceApikey: channelAccount.evolution_apikey || null,
            instanceName: channelAccount.evolution_instance || process.env.EVOLUTION_INSTANCE
          });
        }

        const phone = whatsapp.formatPhoneNumber(customerPhone);

        const logBase = {
          channelAccountId: msgChannelAccountId,
          direction: 'outgoing',
          customerPhone,
          businessPhone: businessPhone || channelAccount.whatsapp_phone_number,
          messageText,
          provider
        };

        if (provider === 'evolution') {
          // Baileys — sin restricción de ventana de servicio
          await whatsapp.sendTextMessage(phone, messageText);
          console.log(`✅ Mensaje enviado via Evolution a ${phone}`);
          await insertLog(String(portalId), { ...logBase, status: 'success', eventType: 'MESSAGE_SENT' });

        } else {
          // Gupshup / Cloud API — verificar ventana de 24h
          const businessPhoneKey = businessPhone || channelAccount.whatsapp_phone_number;
          const window = await getWindowStatus(String(portalId), customerPhone, businessPhoneKey);

          if (window.open) {
            await whatsapp.sendTextMessage(phone, messageText);
            console.log(`✅ Mensaje libre enviado a ${phone}`);
            await insertLog(String(portalId), { ...logBase, status: 'success', eventType: 'MESSAGE_SENT' });
          } else {
            const templateCmd = parseTemplateCommand(messageText);

            if (templateCmd) {
              await whatsapp.sendTemplateMessage(phone, templateCmd.templateName, 'es', templateCmd.params);
              console.log(`✅ Template '${templateCmd.templateName}' enviado a ${phone}`);
              await insertLog(String(portalId), { ...logBase, status: 'success', eventType: 'TEMPLATE_SENT' });
            } else {
              console.warn(`⚠️ Ventana cerrada para ${phone} — mensaje no enviado`);
              await insertLog(String(portalId), { ...logBase, status: 'blocked', eventType: 'WINDOW_CLOSED' });

              const accessToken = await getValidAccessToken(String(portalId));
              const customChannels = new CustomChannelsService(accessToken);
              await customChannels.publishSystemNotification(channelAccount.channel_id, {
                channelAccountId: msgChannelAccountId,
                customerPhone,
                businessPhone: businessPhoneKey,
                text: [
                  '⚠️ Ventana de servicio de 24h cerrada.',
                  'El cliente no puede recibir mensajes libres.',
                  '',
                  'Para contactarlo usa el comando:',
                  '/plantilla nombre_plantilla [param1|param2]',
                  '',
                  'Ejemplo: /plantilla saludo_inicial Juan'
                ].join('\n')
              });
            }
          }
        }
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
