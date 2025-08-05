// Ejemplo de configuración para WhatsAppHub
// Copia este archivo como .env y completa los valores

module.exports = {
  // Puerto del servidor
  PORT: process.env.PORT || 3000,

  // HubSpot Configuration
  HUBSPOT: {
    ACCESS_TOKEN: process.env.HUBSPOT_ACCESS_TOKEN || 'your_hubspot_access_token_here',
    PORTAL_ID: process.env.HUBSPOT_PORTAL_ID || '49753409',
    BASE_URL: 'https://api.hubapi.com'
  },

  // WhatsApp Business API Configuration
  WHATSAPP: {
    ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN || 'your_whatsapp_access_token',
    PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || 'your_phone_number_id',
    WEBHOOK_VERIFY_TOKEN: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'your_webhook_verify_token',
    BASE_URL: 'https://graph.facebook.com/v18.0'
  },

  // Security
  JWT_SECRET: process.env.JWT_SECRET || 'your_jwt_secret_here',
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || 'your_webhook_secret',

  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development'
};