import { Router } from 'express';
import {
  handleHubSpotChannelWebhook,
  setupChannel,
  listChannels,
  listInboxes
} from '../controllers/channel.controller.js';

const router = Router();

router.get('/api/channels/inboxes', listInboxes);
router.post('/api/channels/setup', setupChannel);
router.get('/api/channels', listChannels);
router.get('/api/channel-config', (req, res) => {
  res.json({ channelId: process.env.HUBSPOT_CHANNEL_ID || null });
});
router.post('/hubspot-channel-webhook', handleHubSpotChannelWebhook);

export default router;
