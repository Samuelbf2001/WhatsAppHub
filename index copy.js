const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// HubSpot OAuth Configuration
// Estas credenciales vienen del proyecto HubSpot desplegado
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SCOPE = process.env.SCOPE || 'crm.objects.contacts.read crm.objects.contacts.write crm.objects.deals.read crm.objects.deals.write';
const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${PORT}/oauth-callback`;

// Store access tokens (en producción usar base de datos)
let accessToken = '';
let refreshToken = '';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// OAuth Routes
// 1. Iniciar instalación - Redirect to HubSpot OAuth
app.get('/install', (req, res) => {
  console.log('🚀 Iniciando flujo OAuth de HubSpot');
  console.log('📋 Usando proyecto HubSpot: WhatsAppHub Integration');
  
  const authUrl = `https://app.hubspot.com/oauth/authorize` +
    `?client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&scope=${encodeURIComponent(SCOPE)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
  
  console.log('📍 Redirigiendo a:', authUrl);
  res.redirect(authUrl);
});

// 2. OAuth Callback - Exchange code for tokens
app.get('/oauth-callback', async (req, res) => {
  console.log('🔄 Procesando callback de OAuth');
  const authorizationCode = req.query.code;

  if (authorizationCode) {
    console.log('✅ Authorization code recibido');
    try {
      // Exchange the authorization code for access and refresh tokens
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
      console.log('🔑 Access Token:', accessToken.substring(0, 20) + '...');
      console.log('📊 Proyecto HubSpot: WhatsAppHub Integration (Build #3)');
      
      res.redirect('/');
    } catch (error) {
      console.error('❌ Error intercambiando authorization code:', error.response?.data || error.message);
      return res.status(500).json({
        error: 'Error en OAuth callback',
        details: error.response?.data || error.message
      });
    }
  } else {
    return res.status(400).json({
      error: 'Authorization code no encontrado'
    });
  }
});

// Routes principales
app.get('/', async (req, res) => {
  if (accessToken) {
    try {
      // Test the access token by getting account info
      const accountResponse = await axios.get('https://api.hubapi.com/account-info/v3/details', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      // Get first contact as example
      const contactsResponse = await axios.get('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      res.json({
        message: 'WhatsAppHub - Integración con HubSpot',
        status: 'authenticated',
        version: '1.0.0',
        hubspot_project: 'WhatsAppHub Integration (Build #3)',
        hubspot: {
          authenticated: true,
          account: accountResponse.data,
          sampleContact: contactsResponse.data.results[0] || 'No contacts found'
        }
      });
    } catch (error) {
      console.error('❌ Error consultando HubSpot:', error.response?.data || error.message);
      res.json({
        message: 'WhatsAppHub - Integración con HubSpot',
        status: 'authenticated_with_errors',
        version: '1.0.0',
        hubspot_project: 'WhatsAppHub Integration (Build #3)',
        error: 'Error consultando HubSpot API',
        install_url: '/install'
      });
    }
  } else {
    res.json({
      message: 'WhatsAppHub - Integración con HubSpot',
      status: 'not_authenticated',
      version: '1.0.0',
      hubspot_project: 'WhatsAppHub Integration (Build #3)',
      install_url: '/install',
      instructions: 'Visita /install para autenticar con HubSpot'
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    oauth_status: accessToken ? 'authenticated' : 'not_authenticated',
    hubspot_project: 'WhatsAppHub Integration (Build #3)',
    server: '145.79.2.141'
  });
});

// WhatsApp Webhook endpoints
// Verificación del webhook de WhatsApp
app.get('/whatsapp-webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ Webhook de WhatsApp verificado');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Error verificando webhook de WhatsApp');
    res.sendStatus(403);
  }
});

// Recibir mensajes de WhatsApp
app.post('/whatsapp-webhook', async (req, res) => {
  console.log('📨 Webhook de WhatsApp recibido:', JSON.stringify(req.body, null, 2));
  
  try {
    const WhatsAppService = require('./src/services/whatsappService');
    const HubSpotService = require('./src/services/hubspotService');
    
    const whatsapp = new WhatsAppService();
    const hubspot = new HubSpotService(accessToken);
    
    const messageData = whatsapp.processIncomingMessage(req.body);
    
    if (messageData && accessToken) {
      console.log('📝 Procesando mensaje:', messageData);
      
      // Buscar contacto en HubSpot por número de teléfono
      const contacts = await hubspot.findContactByPhone(messageData.phoneNumber);
      
      let contactId;
      if (contacts.length > 0) {
        contactId = contacts[0].id;
        console.log('👤 Contacto encontrado:', contactId);
      } else {
        // Crear nuevo contacto
        const newContact = await hubspot.createContact({
          firstname: messageData.contactName || 'WhatsApp Contact',
          phone: messageData.phoneNumber,
          hs_lead_status: 'NEW'
        });
        contactId = newContact.id;
        console.log('✨ Nuevo contacto creado:', contactId);
      }
      
      // Crear nota con el mensaje de WhatsApp
      const noteText = `📱 Mensaje de WhatsApp:\n"${messageData.text}"\n\nRecibido: ${new Date(messageData.timestamp * 1000).toLocaleString()}`;
      await hubspot.createNote(contactId, noteText);
      
      console.log('📋 Nota creada en HubSpot para contacto:', contactId);
      
      // Respuesta automática opcional
      if (messageData.text?.toLowerCase().includes('hola')) {
        await whatsapp.sendTextMessage(
          messageData.from,
          '¡Hola! Gracias por contactarnos. Hemos registrado tu mensaje y nos pondremos en contacto contigo pronto.'
        );
      }
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Error procesando webhook de WhatsApp:', error);
    res.sendStatus(500);
  }
});

// HubSpot Webhook endpoint
app.post('/hubspot-webhook', async (req, res) => {
  console.log('📨 Webhook de HubSpot recibido:', JSON.stringify(req.body, null, 2));
  
  try {
    const events = req.body;
    
    for (const event of events) {
      if (event.subscriptionType === 'contact.creation') {
        console.log('👤 Nuevo contacto creado en HubSpot:', event.objectId);
        // Aquí puedes agregar lógica específica cuando se crea un contacto
      }
      
      if (event.subscriptionType === 'contact.propertyChange') {
        console.log('📝 Contacto actualizado en HubSpot:', event.objectId);
        // Aquí puedes agregar lógica específica cuando se actualiza un contacto
      }
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Error procesando webhook de HubSpot:', error);
    res.sendStatus(500);
  }
});

// API Endpoints para testing
app.get('/api/contacts', async (req, res) => {
  if (!accessToken) {
    return res.status(401).json({ error: 'No autenticado con HubSpot' });
  }
  
  try {
    const HubSpotService = require('./src/services/hubspotService');
    const hubspot = new HubSpotService(accessToken);
    const contacts = await hubspot.getContacts(20);
    
    res.json({
      success: true,
      total: contacts.total,
      contacts: contacts.results,
      hubspot_project: 'WhatsAppHub Integration (Build #3)'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Error obteniendo contactos',
      details: error.message
    });
  }
});

app.post('/api/send-whatsapp', async (req, res) => {
  const { phoneNumber, message } = req.body;
  
  if (!phoneNumber || !message) {
    return res.status(400).json({ error: 'phoneNumber y message son requeridos' });
  }
  
  try {
    const WhatsAppService = require('./src/services/whatsappService');
    const whatsapp = new WhatsAppService();
    
    const formattedPhone = whatsapp.formatPhoneNumber(phoneNumber);
    const result = await whatsapp.sendTextMessage(formattedPhone, message);
    
    res.json({
      success: true,
      messageId: result.messages[0].id,
      to: formattedPhone
    });
  } catch (error) {
    res.status(500).json({
      error: 'Error enviando mensaje',
      details: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint no encontrado',
    path: req.originalUrl
  });
});

app.listen(PORT, () => {
  console.log(`🚀 WhatsAppHub servidor corriendo en puerto ${PORT}`);
  console.log(`📊 HubSpot Integration Ready`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 OAuth Redirect: ${REDIRECT_URI}`);
  console.log(`📋 Proyecto HubSpot: WhatsAppHub Integration (Build #3)`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`🎯 Producción: https://whatsapphub.cloud`);
  } else {
    console.log(`🔧 Desarrollo: http://localhost:${PORT}`);
  }
});

module.exports = app;