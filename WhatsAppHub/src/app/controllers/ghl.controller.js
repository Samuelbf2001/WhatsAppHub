import axios from 'axios';
import dotenv from 'dotenv';
import WhatsAppService from '../services/whatsappService.js';
import { findOrCreateGHLContact, publishInboundMessageToGHL, refreshGHLToken } from '../services/ghlService.js';
import { saveGHLTokens, getGHLTokens, updateGHLAccessToken } from '../../db/ghlTokenRepository.js';
import { saveGHLChannelAccount, getGHLChannelAccount } from '../../db/ghlChannelRepository.js';
import { insertLog } from '../../db/logRepository.js';

dotenv.config();

const GHL_CLIENT_ID     = process.env.GHL_CLIENT_ID;
const GHL_CLIENT_SECRET = process.env.GHL_CLIENT_SECRET;
const GHL_REDIRECT_URI  = process.env.GHL_REDIRECT_URI || 'https://whatsfull.sixteam.pro/ghl/oauth-callback';
const FRONTEND_URL      = process.env.FRONTEND_URL      || 'https://whatsfull.sixteam.pro';

/**
 * Obtiene un access token válido para un locationId.
 * Refresca automáticamente si está expirado.
 */
export async function getValidGHLToken(locationId) {
  const tokens = await getGHLTokens(locationId);
  if (!tokens) throw new Error(`No hay tokens GHL para location ${locationId}`);

  const expiresAt = new Date(tokens.expires_at).getTime();
  const now = Date.now();

  // Refrescar si expira en menos de 5 minutos
  if (expiresAt - now < 5 * 60 * 1000) {
    console.log(`🔄 Refrescando token GHL para location ${locationId}`);
    const refreshed = await refreshGHLToken(tokens.refresh_token);
    await updateGHLAccessToken(locationId, refreshed.accessToken, refreshed.expiresIn);
    return refreshed.accessToken;
  }

  return tokens.access_token;
}

// GET /ghl/install — inicia el flujo OAuth con GHL
export const installGHL = (req, res) => {
  const params = new URLSearchParams({
    response_type: 'code',
    redirect_uri:  GHL_REDIRECT_URI,
    client_id:     GHL_CLIENT_ID,
    scope: [
      'conversations.readonly',
      'conversations.write',
      'conversations/message.readonly',
      'conversations/message.write',
      'contacts.readonly',
      'contacts.write',
      'locations.readonly',
    ].join(' '),
  });

  res.redirect(`https://marketplace.gohighlevel.com/oauth/chooselocation?${params}`);
};

// GET /ghl/oauth-callback — GHL redirige aquí con ?code=
export const oauthCallback = async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Código OAuth faltante');

  try {
    const tokenRes = await axios.post('https://services.leadconnectorhq.com/oauth/token', {
      client_id:     GHL_CLIENT_ID,
      client_secret: GHL_CLIENT_SECRET,
      grant_type:    'authorization_code',
      code,
      redirect_uri:  GHL_REDIRECT_URI,
    }, { headers: { 'Content-Type': 'application/json' } });

    const { access_token, refresh_token, expires_in, locationId } = tokenRes.data;

    if (!locationId) {
      console.error('❌ GHL OAuth: no se recibió locationId', tokenRes.data);
      return res.status(400).send('No se recibió locationId de GHL');
    }

    await saveGHLTokens(locationId, access_token, refresh_token, expires_in || 86400);
    console.log(`✅ GHL OAuth completado para location ${locationId}`);

    // Redirigir al frontend con locationId para continuar el setup
    res.redirect(`${FRONTEND_URL}/ghl-setup?locationId=${locationId}`);
  } catch (error) {
    console.error('❌ Error en GHL OAuth callback:', error.response?.data || error.message);
    res.status(500).send('Error en autenticación con GoHighLevel');
  }
};

// POST /api/ghl-channels/setup — asociar número WhatsApp a un location GHL
export const setupGHLChannel = async (req, res) => {
  const { locationId, phoneNumber, evolutionInstance } = req.body;

  if (!locationId || !phoneNumber) {
    return res.status(400).json({ error: 'locationId y phoneNumber son requeridos' });
  }

  try {
    const formattedPhone = phoneNumber.replace(/\D/g, '');
    const provider = (process.env.WHATSAPP_PROVIDER || 'evolution').toLowerCase();
    const providerData = { provider };

    if (provider === 'evolution') {
      const instanceName = evolutionInstance || `ghl_${locationId}_${formattedPhone}`;
      let instanceId = null;
      let instanceApikey = null;

      try {
        const webhookUrl = `${process.env.WEBHOOK_BASE_URL}/whatsapp-webhook?locationId=${locationId}`;
        const evoRes = await fetch(`${process.env.EVOLUTION_API_URL}/instance/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: process.env.EVOLUTION_API_KEY },
          body: JSON.stringify({
            instanceName,
            integration: 'WHATSAPP-BAILEYS',
            qrcode: true,
            webhook: {
              url: webhookUrl,
              byEvents: false,
              base64: false,
              events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
            },
          }),
        });
        const evoData = await evoRes.json();
        instanceId   = evoData.instance?.instanceId || null;
        instanceApikey = evoData.hash?.apikey || null;
        console.log(`✅ Instancia Evolution GHL creada: ${instanceName}`);
      } catch (evoErr) {
        console.warn(`⚠️ No se pudo crear instancia Evolution: ${evoErr.message}`);
      }

      providerData.evolutionInstance   = instanceName;
      providerData.evolutionInstanceId = instanceId;
      providerData.evolutionApikey     = instanceApikey;
    }

    await saveGHLChannelAccount(locationId, formattedPhone, providerData);

    res.json({
      success: true,
      locationId,
      phoneNumber: formattedPhone,
      provider,
      ...(providerData.evolutionInstance && { evolutionInstance: providerData.evolutionInstance }),
      ...(providerData.evolutionApikey   && { evolutionApikey: providerData.evolutionApikey }),
    });
  } catch (error) {
    console.error('❌ Error en setup GHL channel:', error.message);
    res.status(500).json({ error: 'Error configurando canal GHL', details: error.message });
  }
};

// GET /api/ghl-channels?locationId=
export const listGHLChannels = async (req, res) => {
  const { locationId } = req.query;
  try {
    const { getAllGHLChannelAccounts } = await import('../../db/ghlChannelRepository.js');
    const channels = await getAllGHLChannelAccounts(locationId || null);
    res.json({ success: true, channels });
  } catch (error) {
    res.status(500).json({ error: 'Error listando canales GHL', details: error.message });
  }
};

// POST /ghl/webhook — GHL envía aquí cuando el agente responde (Delivery URL)
export const handleGHLWebhook = async (req, res) => {
  // Responder 200 inmediatamente
  res.sendStatus(200);

  try {
    const { locationId, contactId, phone, message, type } = req.body;

    console.log(`📤 GHL Webhook saliente [location: ${locationId}] → ${phone}: "${message?.slice(0, 60)}"`);

    if (!locationId || !phone || !message) {
      console.warn('⚠️ GHL webhook: faltan campos requeridos', JSON.stringify(req.body));
      return;
    }

    // Buscar canal WhatsApp configurado para este location
    const channelAccount = await getGHLChannelAccount(locationId);
    if (!channelAccount) {
      console.error(`❌ No hay canal WhatsApp configurado para GHL location ${locationId}`);
      return;
    }

    // Construir WhatsAppService con credenciales del canal
    const whatsapp = new WhatsAppService({
      provider: channelAccount.provider || 'evolution',
      apiKey:   channelAccount.evolution_apikey   || process.env.EVOLUTION_API_KEY,
      instance: channelAccount.evolution_instance || process.env.EVOLUTION_INSTANCE,
    });

    const formattedPhone = whatsapp.formatPhoneNumber(phone);
    await whatsapp.sendTextMessage(formattedPhone, message);

    console.log(`✅ Mensaje GHL enviado via WhatsApp a ${formattedPhone}`);

    await insertLog(locationId, {
      channelAccountId: channelAccount.id,
      direction:        'outgoing',
      customerPhone:    phone,
      businessPhone:    channelAccount.whatsapp_phone_number,
      messageText:      message,
      status:           'success',
      eventType:        'MESSAGE_SENT',
      provider:         channelAccount.provider || 'evolution',
    });
  } catch (error) {
    console.error('❌ Error en GHL webhook saliente:', error.response?.data || error.message);
  }
};
