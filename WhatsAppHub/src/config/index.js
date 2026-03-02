// src/config/index.js
import 'dotenv/config'; // Carga las variables de .env automáticamente

const config = {
  port: process.env.PORT || 3000,
  hubspot: {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    scope: process.env.SCOPE,
    redirectUri: process.env.REDIRECT_URI,
  },
  whatsapp: {
    verifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
  },
};

export default config;