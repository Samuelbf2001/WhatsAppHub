# 🔧 Configuración OAuth de HubSpot para WhatsAppHub

## ✅ **Lo que ya tienes configurado:**

1. **Proyecto HubSpot** ✅
   - Nombre: WhatsAppHub Integration
   - UID: whatsapphub-integration  
   - Build #6 desplegado exitosamente (con scopes ampliados y OAuth funcionando)
   - URL: https://app.hubspot.com/developer-projects/49753409/project/WhatsAppHub

2. **Aplicación Node.js** ✅
   - Flujo OAuth implementado
   - Endpoints de webhook configurados
   - Servicios de integración creados
   - **Scopes ampliados**: CRM completo, archivos, formularios, tickets

## 📋 **Próximos pasos para completar la configuración:**

### 1. **Obtener credenciales OAuth de HubSpot**

1. Ve a tu proyecto en HubSpot Developer Portal:
   ```
   https://app.hubspot.com/developer-projects/49753409/project/WhatsAppHub
   ```

2. En la sección de tu aplicación pública **WhatsAppHub Integration**, busca:
   - **Client ID** (Application ID)  
   - **Client Secret** (Application Secret)

3. Actualiza tu archivo `.env` con estas credenciales:
   ```env
   CLIENT_ID=tu_client_id_aqui
   CLIENT_SECRET=tu_client_secret_aqui
   ```

### 2. **Probar el flujo OAuth**

1. Asegúrate de que tu aplicación esté corriendo:
   ```bash
   npm run dev
   ```

2. Ve a: `http://localhost:3000/install`
   - Te redirigirá a HubSpot para autorizar la aplicación
   - Después del callback, regresarás a `http://localhost:3000/`
   - Deberías ver información de tu cuenta y contactos

### 3. **Configurar WhatsApp Business API**

Para completar la integración, necesitarás:

1. **Cuenta de WhatsApp Business API**
2. **Access Token de WhatsApp**
3. **Phone Number ID**
4. **Webhook Verify Token**

Actualiza tu `.env`:
```env
WHATSAPP_ACCESS_TOKEN=tu_token_aqui
WHATSAPP_PHONE_NUMBER_ID=tu_phone_id_aqui
WHATSAPP_WEBHOOK_VERIFY_TOKEN=tu_verify_token_aqui
```

### 4. **Configurar Webhooks**

#### HubSpot Webhook:
- URL: `https://tu-dominio.com/hubspot-webhook`
- Ya configurado en: `WhatsAppHub/src/app/webhooks/webhooks.json`

#### WhatsApp Webhook:
- URL de verificación: `https://tu-dominio.com/whatsapp-webhook`
- URL de eventos: `https://tu-dominio.com/whatsapp-webhook`

## 🧪 **Endpoints de Testing**

Una vez configurado, puedes probar:

1. **Ver contactos de HubSpot:**
   ```bash
   GET http://localhost:3000/api/contacts
   ```

2. **Enviar mensaje de WhatsApp:**
   ```bash
   POST http://localhost:3000/api/send-whatsapp
   Content-Type: application/json
   
   {
     "phoneNumber": "+5215551234567",
     "message": "Hola desde WhatsAppHub!"
   }
   ```

3. **Estado de la aplicación:**
   ```bash
   GET http://localhost:3000/health
   ```

## 🔗 **Funcionalidades implementadas:**

✅ **Flujo OAuth completo con HubSpot**
✅ **Sincronización WhatsApp → HubSpot** (mensajes se convierten en notas)
✅ **Sincronización HubSpot → WhatsApp** (nuevos contactos reciben mensaje de bienvenida)
✅ **Webhooks bidireccionales**
✅ **Servicios modulares para ambas plataformas**
✅ **Formateo automático de números de teléfono**
✅ **Creación automática de contactos**

## 📚 **Referencias:**

- [HubSpot OAuth Quickstart](https://github.com/HubSpot/oauth-quickstart-nodejs)
- [WhatsApp Business API Docs](https://developers.facebook.com/docs/whatsapp/)
- [HubSpot Developer Projects](https://developers.hubspot.com/docs/platform/developer-projects)