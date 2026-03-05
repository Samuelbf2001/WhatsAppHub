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

const isGupshup = () => (process.env.WHATSAPP_PROVIDER || 'evolution').toLowerCase() === 'gupshup';

/**
 * Parsear el comando /plantilla del agente.
 * Sintaxis: /plantilla nombre_template [param1|param2|param3]
 * Retorna: { templateName, params } o null si no es un comando de plantilla.
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
    const formattedPhone = phoneNumber.replace(/\D/g, '');

    const accessToken = await getValidAccessToken(portalId);
    const customChannels = new CustomChannelsService(accessToken);

    // Verificar si ya existe un canal para este portal (evitar duplicados)
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

    // Crear cuenta de canal con inboxId (requerido por HubSpot)
    const account = await customChannels.createChannelAccount(channelId, {
      displayName: displayName || `WhatsApp ${formattedPhone}`,
      phoneNumber: formattedPhone,
      inboxId
    });

    await saveChannelAccount(portalId, channelId, account.id, inboxId, phoneNumberId, formattedPhone);

    // Si usamos Gupshup Partner: crear App, configurar webhook y guardar credenciales
    let gupshupAppId;
    if (isGupshup()) {
      const whatsappWebhookUrl = `${process.env.WEBHOOK_BASE_URL}/whatsapp-webhook?portalId=${portalId}`;
      const partner = new GupshupPartnerService();
      const gupshupApp = await partner.createApp({
        displayName: displayName || `WhatsApp ${formattedPhone}`,
        webhookUrl: whatsappWebhookUrl
      });
      gupshupAppId = gupshupApp.id || gupshupApp.app?.id;
      await partner.setWebhook(gupshupAppId, whatsappWebhookUrl);
      const gupshupAppToken = await partner.getAppToken(gupshupAppId);
      const tokenExpiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000);
      await saveGupshupApp(portalId, account.id, gupshupAppId, gupshupAppToken, tokenExpiresAt);
      console.log(`✅ Gupshup App configurada para portal ${portalId}: ${gupshupAppId}`);
    }

    res.json({
      success: true,
      channelId,
      channelAccountId: account.id,
      inboxId,
      phoneNumber: formattedPhone,
      ...(gupshupAppId && { gupshupAppId })
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
        // Extraer datos del payload anidado de HubSpot
        const msg = req.body.message || {};
        const customerPhone = msg.recipients?.[0]?.deliveryIdentifier?.value;
        const businessPhone = msg.senders?.[0]?.deliveryIdentifier?.value;
        const messageText = msg.text;
        const msgChannelAccountId = msg.channelAccountId || channelAccountId;

        if (!customerPhone || !messageText) {
          console.warn('⚠️ OUTGOING sin customerPhone o text', JSON.stringify(req.body));
          break;
        }

        // Obtener credenciales WhatsApp
        let whatsapp;
        if (isGupshup()) {
          const gupshupApp = await getGupshupApp(String(portalId));
          if (!gupshupApp) {
            console.error(`❌ No hay credenciales Gupshup para portal ${portalId}`);
            break;
          }
          whatsapp = new WhatsAppService({
            appId: gupshupApp.gupshup_app_id,
            appToken: gupshupApp.gupshup_app_token
          });
        } else {
          whatsapp = new WhatsAppService();
        }

        const phone = whatsapp.formatPhoneNumber(customerPhone);

        // Verificar ventana de servicio de 24h
        const window = await getWindowStatus(String(portalId), customerPhone);

        if (window.open) {
          // Ventana abierta → enviar texto libre
          await whatsapp.sendTextMessage(phone, messageText);
          console.log(`✅ Mensaje libre enviado a ${phone}`);
        } else {
          // Ventana cerrada → solo se permiten templates
          const templateCmd = parseTemplateCommand(messageText);

          if (templateCmd) {
            // El agente usó el comando /plantilla
            await whatsapp.sendTemplateMessage(phone, templateCmd.templateName, 'es', templateCmd.params);
            console.log(`✅ Template '${templateCmd.templateName}' enviado a ${phone}`);
          } else {
            // El agente escribió texto libre con ventana cerrada → notificar
            console.warn(`⚠️ Ventana cerrada para ${phone} — mensaje no enviado`);

            const channelAccount = await getChannelAccount(String(portalId));
            if (channelAccount) {
              const accessToken = await getValidAccessToken(String(portalId));
              const customChannels = new CustomChannelsService(accessToken);
              await customChannels.publishSystemNotification(channelAccount.channel_id, {
                channelAccountId: msgChannelAccountId,
                customerPhone,
                businessPhone: businessPhone || channelAccount.whatsapp_phone_number,
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
