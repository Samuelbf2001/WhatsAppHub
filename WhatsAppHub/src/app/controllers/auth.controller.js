import axios from 'axios';
import dotenv from 'dotenv';
import { getTokens } from '../../db/tokenRepository.js';
import { generateToken, verifyToken } from '../middleware/auth.middleware.js';

dotenv.config();

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://whatsfull.sixteam.pro';
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const SCOPE = process.env.SCOPE || 'crm.objects.contacts.read crm.objects.contacts.write conversations.custom_channels.read conversations.custom_channels.write';

/**
 * GET /auth/login?portalId=<hubId>
 *
 * Punto de entrada desde el link en la configuración de HubSpot.
 * - Si el portal ya tiene tokens OAuth → emite JWT → redirige al frontend con el token.
 * - Si no tiene tokens → inicia flujo OAuth de HubSpot.
 */
export const loginWithPortal = async (req, res) => {
  const portalId = req.query.portalId;

  if (!portalId) {
    // Sin portalId: iniciar OAuth (HubSpot enviará el hub_id en el callback)
    const authUrl =
      `https://app.hubspot.com/oauth/authorize` +
      `?client_id=${encodeURIComponent(CLIENT_ID)}` +
      `&scope=${encodeURIComponent(SCOPE)}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    return res.redirect(authUrl);
  }

  try {
    const record = await getTokens(String(portalId));

    if (!record) {
      // No hay tokens para este portal → iniciar OAuth
      console.log(`🔐 Portal ${portalId} no autenticado — iniciando OAuth`);
      const authUrl =
        `https://app.hubspot.com/oauth/authorize` +
        `?client_id=${encodeURIComponent(CLIENT_ID)}` +
        `&scope=${encodeURIComponent(SCOPE)}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
      return res.redirect(authUrl);
    }

    // Portal ya autenticado → emitir JWT y redirigir al frontend
    const token = generateToken(portalId);
    console.log(`✅ Login exitoso para portal ${portalId}`);
    return res.redirect(`${FRONTEND_URL}/dashboard?token=${token}&portalId=${portalId}`);

  } catch (err) {
    console.error('❌ Error en /auth/login:', err.message);
    res.status(500).json({ error: 'Error en autenticación', details: err.message });
  }
};

/**
 * GET /auth/verify
 * Header: Authorization: Bearer <token>
 *
 * Verifica el JWT y devuelve info del portal.
 * El frontend puede llamar esto al iniciar para validar su token guardado.
 */
export const verifyAuth = async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ authenticated: false, error: 'Token requerido' });
  }

  try {
    const payload = verifyToken(token);
    const portalId = payload.portalId;

    // Verificar que el portal aún tenga tokens en DB
    const record = await getTokens(portalId);
    if (!record) {
      return res.status(401).json({ authenticated: false, error: 'Portal no autorizado' });
    }

    // Retornar info del portal desde HubSpot
    const accountResponse = await axios.get(
      'https://api.hubapi.com/account-info/v3/details',
      { headers: { Authorization: `Bearer ${record.access_token}` } }
    ).catch(() => null);

    res.json({
      authenticated: true,
      portalId,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
      account: accountResponse?.data || null
    });

  } catch {
    res.status(401).json({ authenticated: false, error: 'Token inválido o expirado' });
  }
};

/**
 * POST /auth/logout
 * Invalida la sesión del frontend (el JWT expira solo, no hay blacklist).
 * Aquí se puede agregar revocación si se implementa en el futuro.
 */
export const logout = (req, res) => {
  res.json({ success: true, message: 'Sesión cerrada — elimina el token del frontend' });
};
