import axios from 'axios';
import dotenv from 'dotenv';
import HubSpotService from '../services/hubspotService.js';

dotenv.config();

let accessToken = '';
let refreshToken = '';

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SCOPE = process.env.SCOPE || 'crm.objects.contacts.read crm.objects.contacts.write crm.objects.deals.read crm.objects.deals.write';
const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${process.env.PORT || 3000}/oauth-callback`;

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
    const tokenResponse = await axios.post('https://api.hubapi.com/oauth/v1/token', {
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      code: authorizationCode
    });

    accessToken = tokenResponse.data.access_token;
    refreshToken = tokenResponse.data.refresh_token;

    console.log('🎉 Tokens obtenidos exitosamente');
    res.redirect('/');
  } catch (error) {
    console.error('❌ Error en OAuth callback:', error.response?.data || error.message);
    res.status(500).json({ error: 'Error en OAuth callback', details: error.response?.data || error.message });
  }
};

export const getHome = async (req, res) => {
  if (!accessToken) {
    return res.json({
      message: 'WhatsAppHub - Integración con HubSpot',
      status: 'not_authenticated',
      install_url: '/install'
    });
  }

  try {
    const accountResponse = await axios.get('https://api.hubapi.com/account-info/v3/details', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const contactsResponse = await axios.get('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    res.json({
      status: 'authenticated',
      account: accountResponse.data,
      sampleContact: contactsResponse.data.results[0] || 'No contacts found'
    });
  } catch (error) {
    res.json({
      status: 'authenticated_with_errors',
      error: 'Error consultando HubSpot API'
    });
  }
};

export const getContacts = async (req, res) => {
  if (!accessToken) return res.status(401).json({ error: 'No autenticado con HubSpot' });

  try {
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
