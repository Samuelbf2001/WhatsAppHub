import { Router } from 'express';
import {
  installGHL,
  oauthCallback,
  setupGHLChannel,
  listGHLChannels,
  handleGHLWebhook,
  listCompanyLocations,
  generateLocationToken,
} from '../controllers/ghl.controller.js';

const router = Router();

// OAuth
router.get('/ghl/install',         installGHL);
router.get('/ghl/oauth-callback',  oauthCallback);

// Delivery URL — GHL envía mensajes salientes del agente aquí
router.post('/ghl/webhook',        handleGHLWebhook);

// API de canales GHL
router.post('/api/ghl-channels/setup',           setupGHLChannel);
router.get('/api/ghl-channels',                  listGHLChannels);
router.get('/api/ghl-company/locations',         listCompanyLocations);
router.post('/api/ghl-location/generate-token',  generateLocationToken);

export default router;
