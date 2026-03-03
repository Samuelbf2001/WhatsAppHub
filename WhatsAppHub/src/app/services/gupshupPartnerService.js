import axios from 'axios';
import { savePartnerToken, getValidPartnerToken } from '../../db/partnerTokenRepository.js';

const PARTNER_BASE = 'https://partner.gupshup.io/partner';

/**
 * Servicio para gestionar la cuenta Partner de Gupshup.
 * Maneja autenticación, sub-accounts y configuración de webhooks.
 *
 * Variables de entorno requeridas:
 *   GUPSHUP_PARTNER_EMAIL     → Email de la cuenta partner
 *   GUPSHUP_PARTNER_PASSWORD  → Password de la cuenta partner
 */
export default class GupshupPartnerService {

  // Autenticar con Gupshup y obtener Partner Token (expira en 24h)
  // POST /partner/account/login
  async login() {
    const { data } = await axios.post(
      `${PARTNER_BASE}/account/login`,
      new URLSearchParams({
        email: process.env.GUPSHUP_PARTNER_EMAIL,
        password: process.env.GUPSHUP_PARTNER_PASSWORD
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const token = data.token?.api_token || data.api_token;
    if (!token) throw new Error('No se recibió token de Gupshup Partner');

    const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000); // 23h (margen 1h)
    await savePartnerToken(token, expiresAt);
    console.log('✅ Gupshup Partner Token obtenido');
    return token;
  }

  // Obtener token válido — refresca si expiró
  async getPartnerToken() {
    const cached = await getValidPartnerToken();
    if (cached) return cached;
    return this.login();
  }

  // Obtener App Token de un sub-account específico (expira en 24h)
  // GET /partner/app/{appId}/token
  async getAppToken(appId) {
    const partnerToken = await this.getPartnerToken();
    const { data } = await axios.get(
      `${PARTNER_BASE}/app/${appId}/token`,
      { headers: { Authorization: partnerToken } }
    );
    const token = data.token?.api_token || data.api_token;
    if (!token) throw new Error(`No se recibió App Token para appId ${appId}`);
    return token;
  }

  // Crear un nuevo sub-account (App) en Gupshup para un cliente
  // POST /partner/app/create
  async createApp({ displayName, webhookUrl }) {
    const partnerToken = await this.getPartnerToken();
    const { data } = await axios.post(
      `${PARTNER_BASE}/app/create`,
      { name: displayName, webhookUrl },
      { headers: { Authorization: partnerToken, 'Content-Type': 'application/json' } }
    );
    console.log('✅ Gupshup App creada:', data.app?.id || data.id);
    return data.app || data;
  }

  // Configurar webhook URL de un App
  // POST /partner/app/{appId}/callback
  async setWebhook(appId, webhookUrl) {
    const partnerToken = await this.getPartnerToken();
    await axios.post(
      `${PARTNER_BASE}/app/${appId}/callback`,
      { url: webhookUrl, events: ['message', 'message-event'] },
      { headers: { Authorization: partnerToken, 'Content-Type': 'application/json' } }
    );
    console.log(`✅ Webhook configurado para App ${appId}: ${webhookUrl}`);
  }

  // Listar todos los Apps del partner
  // GET /partner/app/list
  async listApps() {
    const partnerToken = await this.getPartnerToken();
    const { data } = await axios.get(
      `${PARTNER_BASE}/app/list`,
      { headers: { Authorization: partnerToken } }
    );
    return data.apps || data;
  }
}
