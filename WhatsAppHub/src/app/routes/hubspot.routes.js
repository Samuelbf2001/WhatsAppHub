import { Router } from 'express';
import {
  installHubspot,
  oauthCallback,
  getHome,
  getContacts,
  hubspotWebhook
} from '../controllers/hubspot.controller.js';

const router = Router();

// Rutas OAuth
router.get('/install', installHubspot);
router.get('/oauth-callback', oauthCallback);

// Home / Estado
router.get('/', getHome);

// API HubSpot
router.get('/api/contacts', getContacts);

// Webhook HubSpot
router.post('/hubspot-webhook', hubspotWebhook);

export default router;
