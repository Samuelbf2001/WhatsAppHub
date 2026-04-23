import { Router } from 'express';
import {
  handleHubSpotChannelWebhook,
  setupChannel,
  listChannels,
  listInboxes,
  deleteChannel,
  getChannelQR,
  getChannelConnectionState
} from '../controllers/channel.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

// Rutas públicas (no requieren JWT)
router.get('/api/channels/inboxes', listInboxes);
router.post('/api/channels/setup', setupChannel);
router.get('/api/channels', listChannels);
router.get('/api/channel-config', (req, res) => {
  res.json({ channelId: process.env.HUBSPOT_CHANNEL_ID || null });
});
router.post('/hubspot-channel-webhook', handleHubSpotChannelWebhook);

// Rutas protegidas (requieren JWT)
router.delete('/api/channels/:channelAccountId', requireAuth, deleteChannel);
router.get('/api/channels/qr/:instanceName', requireAuth, getChannelQR);
router.get('/api/channels/state/:instanceName', requireAuth, getChannelConnectionState);

export default router;
