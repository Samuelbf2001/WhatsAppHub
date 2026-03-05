import EvolutionAPIProvider from './providers/EvolutionAPIProvider.js';
import GupshupProvider from './providers/GupshupProvider.js';

/**
 * Servicio de WhatsApp con soporte multi-proveedor.
 * Selecciona el provider según WHATSAPP_PROVIDER en .env:
 *   - "evolution"  → EvolutionAPI (default)
 *   - "gupshup"    → Gupshup BSP
 *
 * Para agregar un nuevo proveedor:
 *   1. Crear clase en services/providers/ que extienda WhatsAppProvider
 *   2. Importar y agregar al switch de getProvider()
 */
export default class WhatsAppService {
  // credentials: { appId, appToken } para Gupshup multi-tenant
  // Para EvolutionAPI no se necesitan (usa env vars)
  constructor(credentials = {}) {
    this.provider = WhatsAppService.getProvider(credentials);
  }

  static getProvider(credentials = {}) {
    const name = (process.env.WHATSAPP_PROVIDER || 'evolution').toLowerCase();
    switch (name) {
      case 'gupshup':
        return new GupshupProvider(credentials);
      case 'evolution':
      default:
        return new EvolutionAPIProvider();
    }
  }

  async sendTextMessage(to, message) {
    return this.provider.sendTextMessage(to, message);
  }

  async sendTemplateMessage(to, templateName, languageCode = 'es', params = []) {
    return this.provider.sendTemplateMessage(to, templateName, languageCode, params);
  }

  async markMessageAsRead(messageId) {
    return this.provider.markMessageAsRead(messageId);
  }

  processIncomingMessage(webhookPayload) {
    return this.provider.processIncomingWebhook(webhookPayload);
  }

  formatPhoneNumber(phoneNumber) {
    return this.provider.formatPhoneNumber(phoneNumber);
  }
}
