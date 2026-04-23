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
 * Genera un location token a partir del company token (instalación agency).
 */
async function getLocationTokenFromCompany(companyId, locationId) {
  const companyKey = `company_${companyId}`;
  const companyTokens = await getGHLTokens(companyKey);
  if (!companyTokens) throw new Error(`No hay company token GHL para ${companyId}`);

  const res = await axios.post('https://services.leadconnectorhq.com/oauth/locationToken',
    new URLSearchParams({ companyId, locationId }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${companyTokens.access_token}`,
        Version: '2021-07-28',
      },
    }
  );

  const { access_token, expires_in } = res.data;
  // Guardar location token para uso futuro
  await saveGHLTokens(locationId, access_token, companyTokens.refresh_token, expires_in || 86400);
  console.log(`✅ Location token generado para ${locationId} desde company ${companyId}`);
  return access_token;
}

/**
 * Obtiene un access token válido para un locationId.
 * Si no hay token de location, busca un company token y genera uno.
 * Refresca automáticamente si está expirado.
 */
export async function getValidGHLToken(locationId, companyId = null) {
  let tokens = await getGHLTokens(locationId);

  // Si no hay token de location pero sí companyId, generar desde company token
  if (!tokens && companyId) {
    return getLocationTokenFromCompany(companyId, locationId);
  }

  // Si no hay token y tampoco companyId, buscar si existe algún company token en DB
  if (!tokens) {
    // Intentar encontrar un company token disponible
    const companyTokens = await getGHLTokens(`company_${locationId}`);
    if (!companyTokens) throw new Error(`No hay tokens GHL para location ${locationId}`);
    tokens = companyTokens;
  }

  const expiresAt = new Date(tokens.expires_at).getTime();
  const now = Date.now();

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
    const tokenRes = await axios.post('https://services.leadconnectorhq.com/oauth/token',
      new URLSearchParams({
        client_id:     GHL_CLIENT_ID,
        client_secret: GHL_CLIENT_SECRET,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  GHL_REDIRECT_URI,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, refresh_token, expires_in, locationId, companyId, userType, isBulkInstallation } = tokenRes.data;

    if (locationId) {
      // Instalación a nivel Location — guardar directamente
      await saveGHLTokens(locationId, access_token, refresh_token, expires_in || 86400);
      console.log(`✅ GHL OAuth completado para location ${locationId}`);
      return res.redirect(`${FRONTEND_URL}/ghl-setup?locationId=${locationId}`);
    }

    if (companyId) {
      // Instalación a nivel Agency/Company — guardar company token con prefijo "company_"
      const companyKey = `company_${companyId}`;
      await saveGHLTokens(companyKey, access_token, refresh_token, expires_in || 86400);
      console.log(`✅ GHL OAuth completado para company ${companyId} (bulk/agency install)`);
      // Redirigir al frontend para que el usuario elija la location
      return res.redirect(`${FRONTEND_URL}/ghl-setup?companyId=${companyId}`);
    }

    console.error('❌ GHL OAuth: no se recibió locationId ni companyId', tokenRes.data);
    return res.status(400).send('No se recibió locationId ni companyId de GHL');
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
      const webhookUrl   = `${process.env.WEBHOOK_BASE_URL}/whatsapp-webhook?locationId=${locationId}`;
      const evoBase      = process.env.EVOLUTION_API_URL;
      const evoApiKey    = process.env.EVOLUTION_API_KEY;
      let instanceId     = null;
      let instanceApikey = null;

      // Verificar si la instancia ya existe
      let instanceExists = false;
      try {
        const checkRes  = await fetch(`${evoBase}/instance/fetchInstances`, {
          headers: { apikey: evoApiKey },
        });
        const checkData = await checkRes.json();
        const instances = Array.isArray(checkData) ? checkData : (checkData.data || []);
        instanceExists  = instances.some(i => i.instance?.instanceName === instanceName || i.instanceName === instanceName);
      } catch {}

      if (instanceExists) {
        // Instancia existente — solo actualizar el webhook
        console.log(`ℹ️ Instancia ${instanceName} ya existe, actualizando webhook...`);
        try {
          await fetch(`${evoBase}/webhook/set/${instanceName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: evoApiKey },
            body: JSON.stringify({
              url:              webhookUrl,
              webhook_by_events: false,
              webhook_base64:   false,
              events:           ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
            }),
          });
          console.log(`✅ Webhook actualizado para instancia existente: ${instanceName}`);
        } catch (wErr) {
          console.warn(`⚠️ No se pudo actualizar webhook de ${instanceName}: ${wErr.message}`);
        }
      } else {
        // Instancia nueva — crear con webhook incluido
        try {
          const evoRes = await fetch(`${evoBase}/instance/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: evoApiKey },
            body: JSON.stringify({
              instanceName,
              integration: 'WHATSAPP-BAILEYS',
              qrcode: true,
              webhook: {
                url:      webhookUrl,
                byEvents: false,
                base64:   false,
                events:   ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
              },
            }),
          });
          const evoData  = await evoRes.json();
          instanceId     = evoData.instance?.instanceId || null;
          instanceApikey = evoData.hash?.apikey || null;
          console.log(`✅ Instancia Evolution GHL creada: ${instanceName}`);
        } catch (evoErr) {
          console.warn(`⚠️ No se pudo crear instancia Evolution: ${evoErr.message}`);
        }
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

// GET /api/ghl-company/locations?companyId= — lista locations de una company y genera sus tokens
export const listCompanyLocations = async (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId es requerido' });

  try {
    const companyKey = `company_${companyId}`;
    const companyTokens = await getGHLTokens(companyKey);
    if (!companyTokens) return res.status(404).json({ error: 'No hay token de company para este companyId' });

    const locRes = await axios.get('https://services.leadconnectorhq.com/locations/search', {
      headers: {
        Authorization: `Bearer ${companyTokens.access_token}`,
        Version: '2021-07-28',
      },
      params: { companyId, limit: 100 },
    });

    const locations = locRes.data?.locations || [];
    res.json({ success: true, companyId, locations });
  } catch (error) {
    console.error('❌ Error listando locations GHL:', error.response?.data || error.message);
    res.status(500).json({ error: 'Error listando locations', details: error.response?.data || error.message });
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
    const body = req.body;

    // GHL puede enviar distintos tipos de eventos — normalizar campos
    const type       = body.type;
    const locationId = body.locationId;

    // Eventos del sistema GHL (INSTALL, UNINSTALL, etc.) — ignorar silenciosamente
    const SYSTEM_EVENTS = ['INSTALL', 'UNINSTALL', 'UPGRADE', 'DOWNGRADE'];
    if (SYSTEM_EVENTS.includes(type)) {
      console.log(`ℹ️ GHL sistema evento [${type}] para location ${locationId} — ignorado`);
      return;
    }

    // Solo procesar mensajes salientes (OutboundMessage)
    if (type !== 'OutboundMessage') {
      console.log(`ℹ️ GHL evento [${type}] ignorado (no es OutboundMessage)`);
      return;
    }

    // GHL envía: to = número destino, body = texto del mensaje
    const phone   = body.to;
    const message = body.body;

    console.log(`📤 GHL Webhook saliente [location: ${locationId}] → ${phone}: "${message?.slice(0, 60)}"`);

    if (!locationId || !phone || !message) {
      console.warn('⚠️ GHL webhook: faltan campos requeridos', JSON.stringify(body));
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
