import EvolutionAPIProvider from './providers/EvolutionAPIProvider.js';
import GupshupProvider from './providers/GupshupProvider.js';

/**
 * Servicio de WhatsApp con soporte multi-proveedor y multi-tenant.
 *
 * Uso básico (usa env vars globales):
 *   new WhatsAppService()
 *
 * Uso multi-tenant (credenciales por canal):
 *   new WhatsAppService({ provider: 'evolution', apiKey: '...', instance: '...' })
 *   new WhatsAppService({ provider: 'gupshup',   appId: '...', appToken: '...' })
 */
export default class WhatsAppService {
  constructor(credentials = {}) {
    this.provider = WhatsAppService.getProvider(credentials);
  }

  static getProvider(credentials = {}) {
    const name = (credentials.provider || process.env.WHATSAPP_PROVIDER || 'evolution').toLowerCase();

    switch (name) {
      case 'gupshup':
        return new GupshupProvider(credentials);

      case 'evolution':
      default:
        return new EvolutionAPIProvider({
          apiUrl:   credentials.apiUrl,
          apiKey:   credentials.apiKey,
          instance: credentials.instance
        });
    }
  }

  async sendTextMessage(to, message) {
    return this.provider.sendTextMessage(to, message);
  }

  async sendTemplateMessage(to, templateName, languageCode = 'es', params = []) {
    return this.provider.sendTemplateMessage(to, templateName, languageCode, params);
  }

  async markMessageAsRead(messageId, remoteJid) {
    return this.provider.markMessageAsRead(messageId, remoteJid);
  }

  processIncomingMessage(webhookPayload) {
    return this.provider.processIncomingWebhook(webhookPayload);
  }

  formatPhoneNumber(phoneNumber) {
    return this.provider.formatPhoneNumber(phoneNumber);
  }
}
