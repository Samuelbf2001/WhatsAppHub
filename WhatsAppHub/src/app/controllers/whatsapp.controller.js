import dotenv from 'dotenv';
import WhatsAppService from '../services/whatsappService.js';
import HubSpotService from '../services/hubspotService.js';

dotenv.config();

let accessToken = ''; // ⚠️ Si quieres compartir con HubSpot.controller, mover a un store global

export const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
};

export const receiveMessage = async (req, res) => {
  console.log('📨 Webhook de WhatsApp recibido:', JSON.stringify(req.body, null, 2));

  try {
    const whatsapp = new WhatsAppService();
    const hubspot = new HubSpotService(accessToken);

    const messageData = whatsapp.processIncomingMessage(req.body);

    if (messageData && accessToken) {
      const contacts = await hubspot.findContactByPhone(messageData.phoneNumber);
      let contactId;

      if (contacts.length > 0) {
        contactId = contacts[0].id;
      } else {
        const newContact = await hubspot.createContact({
          firstname: messageData.contactName || 'WhatsApp Contact',
          phone: messageData.phoneNumber
        });
        contactId = newContact.id;
      }

      await hubspot.createNote(contactId, `📱 ${messageData.text}`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Error procesando webhook de WhatsApp:', error);
    res.sendStatus(500);
  }
};

export const sendMessage = async (req, res) => {
  const { phoneNumber, message } = req.body;
  if (!phoneNumber || !message) return res.status(400).json({ error: 'Faltan parámetros' });

  try {
    const whatsapp = new WhatsAppService();
    const formattedPhone = whatsapp.formatPhoneNumber(phoneNumber);
    const result = await whatsapp.sendTextMessage(formattedPhone, message);

    res.json({ success: true, messageId: result.messages[0].id });
  } catch (error) {
    res.status(500).json({ error: 'Error enviando mensaje', details: error.message });
  }
};
