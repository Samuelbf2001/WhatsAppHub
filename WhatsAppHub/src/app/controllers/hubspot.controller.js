import axios from 'axios';
import dotenv from 'dotenv';
import HubSpotService from '../services/hubspotService.js';
import { saveTokens, getTokens, updateAccessToken } from '../../db/tokenRepository.js';
import { generateToken } from '../middleware/auth.middleware.js';

dotenv.config();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SCOPE = process.env.SCOPE || 'crm.objects.contacts.read crm.objects.contacts.write conversations.custom_channels.read conversations.custom_channels.write';
const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${process.env.PORT || 3000}/oauth-callback`;

// Obtener access token válido para un portal, refrescando si expiró
export async function getValidAccessToken(portalId) {
  const record = await getTokens(portalId);
  if (!record) throw new Error(`No hay tokens para el portal ${portalId}`);

  const isExpired = new Date(record.expires_at) <= new Date(Date.now() + 60000);
  if (!isExpired) return record.access_token;

  const response = await axios.post(
    'https://api.hubapi.com/oauth/v1/token',
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: record.refresh_token
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const { access_token, expires_in } = response.data;
  await updateAccessToken(portalId, access_token, expires_in);
  console.log(`🔄 Token refrescado para portal ${portalId}`);
  return access_token;
}

export const installHubspot = (req, res) => {
  console.log('🚀 Iniciando flujo OAuth de HubSpot');
  const authUrl = `https://app.hubspot.com/oauth/authorize` +
    `?client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&scope=${encodeURIComponent(SCOPE)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
  res.redirect(authUrl);
};

export const oauthCallback = async (req, res) => {
  const authorizationCode = req.query.code;
  if (!authorizationCode) {
    return res.status(400).json({ error: 'Authorization code no encontrado' });
  }

  try {
    const tokenResponse = await axios.post(
      'https://api.hubapi.com/oauth/v1/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        code: authorizationCode
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    // Obtener portal_id desde el token de acceso
    const tokenInfo = await axios.get(`https://api.hubapi.com/oauth/v1/access-tokens/${access_token}`);
    const portalId = String(tokenInfo.data.hub_id);

    await saveTokens(portalId, access_token, refresh_token, expires_in);
    console.log(`🎉 Tokens guardados en DB para portal ${portalId}`);

    // Emitir JWT y redirigir al frontend del dashboard
    const frontendUrl = process.env.FRONTEND_URL || 'https://whatsfull.sixteam.pro';
    const jwtToken = generateToken(portalId);
    res.redirect(`${frontendUrl}/dashboard?token=${jwtToken}&portalId=${portalId}`);
  } catch (error) {
    console.error('❌ Error en OAuth callback:', error.response?.data || error.message);
    res.status(500).json({ error: 'Error en OAuth callback', details: error.response?.data || error.message });
  }
};

export const getHome = async (req, res) => {
  const portalId = req.query.portalId || process.env.HUBSPOT_PORTAL_ID;

  if (!portalId) {
    return res.json({
      message: 'WhatsAppHub - Integración con HubSpot',
      status: 'not_authenticated',
      install_url: '/install'
    });
  }

  try {
    const accessToken = await getValidAccessToken(portalId);
    const accountResponse = await axios.get('https://api.hubapi.com/account-info/v3/details', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    res.json({ status: 'authenticated', account: accountResponse.data });
  } catch {
    res.json({ status: 'not_authenticated', install_url: '/install' });
  }
};

export const getContacts = async (req, res) => {
  const portalId = req.query.portalId || process.env.HUBSPOT_PORTAL_ID;
  if (!portalId) return res.status(400).json({ error: 'portalId requerido' });

  try {
    const accessToken = await getValidAccessToken(portalId);
    const hubspot = new HubSpotService(accessToken);
    const contacts = await hubspot.getContacts(20);
    res.json({ success: true, contacts: contacts.results });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo contactos', details: error.message });
  }
};

export const hubspotWebhook = (req, res) => {
  console.log('📨 Webhook de HubSpot recibido:', JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
};
