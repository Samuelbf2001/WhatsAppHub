import axios from 'axios';

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
const GHL_PROVIDER_ID = process.env.GHL_CONVERSATION_PROVIDER_ID || '69ea36f789175e5da0ebc461';

// Caché en memoria: `${locationId}:${normalized}` → { contactId: string, expiresAt: number }
const _contactCache = new Map();
const CONTACT_CACHE_TTL = 10 * 60 * 1000;

/**
 * Busca un contacto por teléfono en GHL. Si no existe, lo crea.
 * @param {string} accessToken
 * @param {string} locationId
 * @param {string} phone - Número en E.164 o con dígitos
 * @param {string|null} name - Nombre opcional (ej: nombre del grupo). Si null, usa el número.
 * Retorna el contactId de GHL.
 */
export async function findOrCreateGHLContact(accessToken, locationId, phone, name = null) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  };

  // Normalizar a E.164 sin el +
  const normalized = phone.replace(/\D/g, '');
  const defaultName = `+${normalized}`;
  const cacheKey = `${locationId}:${normalized}`;

  const cached = _contactCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    console.log(`👤 Contacto GHL (caché): ${cached.contactId} para +${normalized}`);
    return cached.contactId;
  }

  // Buscar contacto existente por teléfono
  try {
    const searchRes = await axios.get(`${GHL_BASE_URL}/contacts/search/duplicate`, {
      headers,
      params: { locationId, number: `+${normalized}` }
    });
    const contact = searchRes.data?.contact;
    if (contact?.id) {
      console.log(`👤 Contacto GHL encontrado: ${contact.id} para +${normalized}`);
      _contactCache.set(cacheKey, { contactId: contact.id, expiresAt: Date.now() + CONTACT_CACHE_TTL });
      // Si tenemos un nombre mejor y el contacto tiene el nombre genérico (= número), actualizarlo
      if (name && contact.name === defaultName) {
        axios.put(`${GHL_BASE_URL}/contacts/${contact.id}`, { name }, { headers })
          .then(() => console.log(`✏️ Nombre GHL actualizado: ${contact.id} → "${name}"`))
          .catch(() => {});
      }
      return contact.id;
    }
  } catch (err) {
    if (err.response?.status !== 404) {
      console.warn(`⚠️ GHL contact search error ${err.response?.status}:`, JSON.stringify(err.response?.data));
    }
  }

  // Crear contacto nuevo con nombre real si está disponible
  try {
    const createRes = await axios.post(`${GHL_BASE_URL}/contacts`, {
      locationId,
      phone: `+${normalized}`,
      name: name || defaultName,
    }, { headers });
    // GHL v2 puede devolver { contact: { id } } o { id } directamente
    const newContactId = createRes.data?.contact?.id || createRes.data?.id;
    console.log(`✅ Contacto GHL creado: ${newContactId} para +${normalized} (nombre: "${name || defaultName}")`);
    _contactCache.set(cacheKey, { contactId: newContactId, expiresAt: Date.now() + CONTACT_CACHE_TTL });
    return newContactId;
  } catch (err) {
    // Si el location tiene "no duplicados" activado, GHL retorna 400 con el contactId existente en meta
    const existingId = err.response?.data?.meta?.contactId;
    if (existingId) {
      console.log(`👤 Contacto GHL ya existe (anti-dup): ${existingId} para +${normalized}`);
      _contactCache.set(cacheKey, { contactId: existingId, expiresAt: Date.now() + CONTACT_CACHE_TTL });
      return existingId;
    }
    console.error(`❌ GHL create contact error ${err.response?.status}:`, JSON.stringify(err.response?.data));
    throw err;
  }
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

  // GHL SMS Provider replacement: type='SMS' (no Custom, no TYPE_SMS)
  // Requiere conversationProviderId + phone del remitente
  const payload = {
    type: 'SMS',
    locationId,
    contactId,
    conversationProviderId: GHL_PROVIDER_ID,
    message: messageData.text || '',
    direction: 'inbound',
    phone: messageData.phoneNumber || messageData.phone || '',
    date: new Date(messageData.timestamp ? (messageData.timestamp < 1e12 ? messageData.timestamp * 1000 : messageData.timestamp) : Date.now()).toISOString(),
  };

  // Adjuntos de media
  if (messageData.mediaUrl) {
    payload.attachments = [messageData.mediaUrl];
  }

  console.log(`📤 Enviando a GHL (SMS provider):`, JSON.stringify(payload));
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
