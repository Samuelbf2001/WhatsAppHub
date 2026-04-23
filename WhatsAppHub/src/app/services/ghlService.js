import axios from 'axios';

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
const GHL_PROVIDER_ID = process.env.GHL_CONVERSATION_PROVIDER_ID || '69ea36f789175e5da0ebc461';

/**
 * Busca un contacto por teléfono en GHL. Si no existe, lo crea.
 * Retorna el contactId de GHL.
 */
export async function findOrCreateGHLContact(accessToken, locationId, phone) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  };

  // Normalizar a E.164 sin el +
  const normalized = phone.replace(/\D/g, '');

  // Buscar primero
  try {
    const searchRes = await axios.get(`${GHL_BASE_URL}/contacts/search/duplicate`, {
      headers,
      params: { locationId, phone: `+${normalized}` }
    });
    const contact = searchRes.data?.contact;
    if (contact?.id) {
      console.log(`👤 Contacto GHL encontrado: ${contact.id} para +${normalized}`);
      return contact.id;
    }
  } catch (err) {
    // 404 o sin resultados — crear nuevo
  }

  // Crear contacto nuevo
  const createRes = await axios.post(`${GHL_BASE_URL}/contacts/`, {
    locationId,
    phone: `+${normalized}`,
    name: `+${normalized}`,
    source: 'WhatsApp Gateway',
  }, { headers });

  const newContactId = createRes.data?.contact?.id;
  console.log(`✅ Contacto GHL creado: ${newContactId} para +${normalized}`);
  return newContactId;
}

/**
 * Publica un mensaje entrante de WhatsApp en el inbox de GHL.
 * GHL lo mostrará como un mensaje recibido en Conversations.
 */
export async function publishInboundMessageToGHL(accessToken, locationId, contactId, messageData) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  };

  const payload = {
    type: 'Custom',
    locationId,
    contactId,
    conversationProviderId: GHL_PROVIDER_ID,
    message: messageData.text || '',
    direction: 'inbound',
    date: new Date(messageData.timestamp || Date.now()).toISOString(),
  };

  // Adjuntos de media
  if (messageData.mediaUrl) {
    payload.attachments = [messageData.mediaUrl];
  }

  console.log(`📤 Enviando a GHL:`, JSON.stringify(payload));
  try {
    const res = await axios.post(`${GHL_BASE_URL}/conversations/messages/inbound`, payload, { headers });
    console.log(`📥 Mensaje publicado en GHL Inbox: conversationId=${res.data?.conversationId}`, JSON.stringify(res.data));
    return res.data;
  } catch (err) {
    console.error(`❌ Error publicando en GHL:`, err.response?.status, JSON.stringify(err.response?.data));
    throw err;
  }
}

/**
 * Refresca el access token de GHL usando el refresh token.
 */
export async function refreshGHLToken(refreshToken) {
  const res = await axios.post('https://services.leadconnectorhq.com/oauth/token', {
    client_id:     process.env.GHL_CLIENT_ID,
    client_secret: process.env.GHL_CLIENT_SECRET,
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
  }, {
    headers: { 'Content-Type': 'application/json' }
  });

  return {
    accessToken:  res.data.access_token,
    refreshToken: res.data.refresh_token || refreshToken,
    expiresIn:    res.data.expires_in || 86400,
  };
}
