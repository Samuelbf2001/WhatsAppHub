// services/HubSpotService.js
import axios from 'axios';

export default class HubSpotService {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseURL = 'https://api.hubapi.com';
  }

  // Configurar headers para peticiones
  getHeaders() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };
  }

  // Obtener información de la cuenta
  async getAccountInfo() {
    try {
      const { data } = await axios.get(`${this.baseURL}/account-info/v3/details`, {
        headers: this.getHeaders()
      });
      return data;
    } catch (error) {
      console.error('Error obteniendo info de cuenta:', error.response?.data || error.message);
      throw error;
    }
  }

  // Obtener contactos
  async getContacts(limit = 10, after = null) {
    try {
      let url = `${this.baseURL}/crm/v3/objects/contacts?limit=${limit}`;
      if (after) url += `&after=${after}`;

      const { data } = await axios.get(url, { headers: this.getHeaders() });
      return data;
    } catch (error) {
      console.error('Error obteniendo contactos:', error.response?.data || error.message);
      throw error;
    }
  }

  // Crear contacto
  async createContact(contactData) {
    try {
      const { data } = await axios.post(
        `${this.baseURL}/crm/v3/objects/contacts`,
        { properties: contactData },
        { headers: this.getHeaders() }
      );
      return data;
    } catch (error) {
      console.error('Error creando contacto:', error.response?.data || error.message);
      throw error;
    }
  }

  // Actualizar contacto
  async updateContact(contactId, contactData) {
    try {
      const { data } = await axios.patch(
        `${this.baseURL}/crm/v3/objects/contacts/${contactId}`,
        { properties: contactData },
        { headers: this.getHeaders() }
      );
      return data;
    } catch (error) {
      console.error('Error actualizando contacto:', error.response?.data || error.message);
      throw error;
    }
  }

  // Genera variantes de formato de un número de teléfono para búsqueda amplia
  _phoneVariants(phone) {
    const digits = phone.replace(/\D/g, '');
    const variants = new Set([phone, digits]);
    // Con + al inicio
    variants.add(`+${digits}`);
    // Sin código de país México (52) → 10 dígitos locales
    if (digits.startsWith('52') && digits.length === 12) variants.add(digits.slice(2));
    // Sin código de país USA/Canada (1) → 10 dígitos locales
    if (digits.startsWith('1') && digits.length === 11) variants.add(digits.slice(1));
    return [...variants];
  }

  // Buscar contacto por teléfono en múltiples propiedades y formatos
  async findContactByPhone(phoneNumber) {
    const variants = this._phoneVariants(phoneNumber);
    const props = ['phone', 'mobilephone'];

    // Cada filterGroup es un OR; dentro de cada grupo los filters son AND
    const filterGroups = variants.flatMap(v =>
      props.map(prop => ({ filters: [{ propertyName: prop, operator: 'EQ', value: v }] }))
    );

    try {
      const { data } = await axios.post(
        `${this.baseURL}/crm/v3/objects/contacts/search`,
        { filterGroups, properties: ['firstname', 'lastname', 'phone', 'mobilephone', 'email'] },
        { headers: this.getHeaders() }
      );
      return data.results;
    } catch (error) {
      console.error('Error buscando contacto por teléfono:', error.response?.data || error.message);
      throw error;
    }
  }

  // Busca el contacto; si no existe lo crea. Retorna siempre el contacto.
  // DEBE llamarse ANTES de publicar el primer mensaje (la asociación ocurre al crear la conversación).
  async findOrCreateContactByPhone(phoneNumber, name) {
    const results = await this.findContactByPhone(phoneNumber);
    if (results.length > 0) return results[0];

    const nameParts = (name || '').trim().split(' ');
    return this.createContact({
      phone: phoneNumber,
      firstname: nameParts[0] || 'WhatsApp',
      lastname: nameParts.slice(1).join(' ') || 'Contact'
    });
  }

  // Crear nota en contacto
  async createNote(contactId, note) {
    try {
      const { data } = await axios.post(
        `${this.baseURL}/crm/v3/objects/notes`,
        {
          properties: {
            hs_note_body: note,
            hs_timestamp: new Date().toISOString()
          },
          associations: [
            {
              to: { id: contactId },
              types: [
                {
                  associationCategory: 'HUBSPOT_DEFINED',
                  associationTypeId: 202 // Contact to Note association
                }
              ]
            }
          ]
        },
        { headers: this.getHeaders() }
      );
      return data;
    } catch (error) {
      console.error('Error creando nota:', error.response?.data || error.message);
      throw error;
    }
  }

  // Obtener inboxes de Conversaciones del portal
  async getInboxes() {
    try {
      const { data } = await axios.get(
        `${this.baseURL}/conversations/v1/conversations/inboxes`,
        { headers: this.getHeaders() }
      );
      return data.results || data;
    } catch (error) {
      console.error('Error obteniendo inboxes:', error.response?.data || error.message);
      throw error;
    }
  }

  // Obtener deals asociados a un contacto
  async getContactDeals(contactId) {
    try {
      const { data } = await axios.get(
        `${this.baseURL}/crm/v4/objects/contacts/${contactId}/associations/deals`,
        { headers: this.getHeaders() }
      );
      return data;
    } catch (error) {
      console.error('Error obteniendo deals del contacto:', error.response?.data || error.message);
      throw error;
    }
  }
}
