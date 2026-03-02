import app from './WhatsAppHub/src/app/app.js';
import { hubspotConfig } from './WhatsAppHub/src/config/hubspot.config.js';


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(` Servidor corriendo en puerto ${PORT}`);
  console.log(` OAuth Redirect: ${hubspotConfig.redirectUri}`);
});
