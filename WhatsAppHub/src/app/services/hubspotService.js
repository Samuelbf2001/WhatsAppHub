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

  // Buscar contacto por teléfono
  async findContactByPhone(phoneNumber) {
    try {
      const { data } = await axios.post(
        `${this.baseURL}/crm/v3/objects/contacts/search`,
        {
          filterGroups: [
            {
              filters: [
                { propertyName: 'phone', operator: 'EQ', value: phoneNumber }
              ]
            }
          ]
        },
        { headers: this.getHeaders() }
      );
      return data.results;
    } catch (error) {
      console.error('Error buscando contacto por teléfono:', error.response?.data || error.message);
      throw error;
    }
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
