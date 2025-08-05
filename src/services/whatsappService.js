const axios = require('axios');

class WhatsAppService {
  constructor() {
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.baseURL = 'https://graph.facebook.com/v18.0';
  }

  // Configurar headers para peticiones
  getHeaders() {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };
  }

  // Enviar mensaje de texto
  async sendTextMessage(to, message) {
    try {
      const response = await axios.post(`${this.baseURL}/${this.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: {
          body: message
        }
      }, {
        headers: this.getHeaders()
      });
      
      console.log('✅ Mensaje enviado:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Error enviando mensaje:', error.response?.data || error.message);
      throw error;
    }
  }

  // Enviar mensaje de template
  async sendTemplateMessage(to, templateName, languageCode = 'es') {
    try {
      const response = await axios.post(`${this.baseURL}/${this.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        to: to,
        type: 'template',
        template: {
          name: templateName,
          language: {
            code: languageCode
          }
        }
      }, {
        headers: this.getHeaders()
      });
      
      console.log('✅ Template enviado:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Error enviando template:', error.response?.data || error.message);
      throw error;
    }
  }

  // Marcar mensaje como leído
  async markMessageAsRead(messageId) {
    try {
      const response = await axios.post(`${this.baseURL}/${this.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId
      }, {
        headers: this.getHeaders()
      });
      
      return response.data;
    } catch (error) {
      console.error('❌ Error marcando mensaje como leído:', error.response?.data || error.message);
      throw error;
    }
  }

  // Procesar mensaje recibido
  processIncomingMessage(webhookData) {
    try {
      const entry = webhookData.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (value?.messages) {
        const message = value.messages[0];
        const contact = value.contacts?.[0];
        
        return {
          messageId: message.id,
          from: message.from,
          timestamp: message.timestamp,
          type: message.type,
          text: message.text?.body,
          contactName: contact?.profile?.name,
          phoneNumber: contact?.wa_id
        };
      }
      
      return null;
    } catch (error) {
      console.error('❌ Error procesando mensaje entrante:', error);
      return null;
    }
  }

  // Formatear número de teléfono para WhatsApp
  formatPhoneNumber(phoneNumber) {
    // Remover espacios, guiones y caracteres especiales
    let formatted = phoneNumber.replace(/[^\d+]/g, '');
    
    // Si no empieza con +, agregar código de país (asumiendo México +52)
    if (!formatted.startsWith('+')) {
      if (formatted.startsWith('52')) {
        formatted = '+' + formatted;
      } else if (formatted.length === 10) {
        formatted = '+52' + formatted;
      }
    }
    
    return formatted;
  }
}

module.exports = WhatsAppService;