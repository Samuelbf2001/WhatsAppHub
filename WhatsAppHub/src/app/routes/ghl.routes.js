import { Router } from 'express';
import {
  installGHL,
  oauthCallback,
  setupGHLChannel,
  validateGHLChannelLocation,
  listGHLChannels,
  handleGHLWebhook,
  listCompanyLocations,
  generateLocationToken,
  getGHLChannelQR,
  getGHLChannelState,
  deleteGHLChannel,
  debugGHL,
  testGHLInbound,
} from '../controllers/ghl.controller.js';

const router = Router();

// OAuth
router.get('/ghl/install',         installGHL);
router.get('/ghl/oauth-callback',  oauthCallback);

// Delivery URL — GHL envía mensajes salientes del agente aquí
router.post('/ghl/webhook',        handleGHLWebhook);

// Proxy GHL (sin auth JWT — usados por GHLSetupPage standalone)
router.get('/api/ghl-channels/qr/:instanceName',    getGHLChannelQR);
router.get('/api/ghl-channels/state/:instanceName', getGHLChannelState);
router.delete('/api/ghl-channels/:id',              deleteGHLChannel);

// API de canales GHL
router.get('/api/ghl-channels/validate/:locationId',  validateGHLChannelLocation);
router.post('/api/ghl-channels/setup',                setupGHLChannel);
router.get('/api/ghl-channels',                       listGHLChannels);
router.get('/api/ghl-company/locations',              listCompanyLocations);
router.post('/api/ghl-location/generate-token',       generateLocationToken);
router.get('/api/ghl-debug',                          debugGHL);
router.get('/api/ghl-test-inbound',                   testGHLInbound);

export default router;
