import axios from 'axios';
import { hubspotConfig } from '../../config/hubspot.config.js';

let accessToken = '';
let refreshToken = '';

export const install = (req, res) => {
  const authUrl = `https://app.hubspot.com/oauth/authorize` +
    `?client_id=${encodeURIComponent(hubspotConfig.clientId)}` +
    `&scope=${encodeURIComponent(hubspotConfig.scope)}` +
    `&redirect_uri=${encodeURIComponent(hubspotConfig.redirectUri)}`;

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
      client_id: hubspotConfig.clientId,
      client_secret: hubspotConfig.clientSecret,
      redirect_uri: hubspotConfig.redirectUri,
      code: authorizationCode
    });

    accessToken = tokenResponse.data.access_token;
    refreshToken = tokenResponse.data.refresh_token;

    res.redirect('/');
  } catch (error) {
    res.status(500).json({
      error: 'Error en OAuth callback',
      details: error.response?.data || error.message
    });
  }
};

export const getTokens = () => ({ accessToken, refreshToken });
