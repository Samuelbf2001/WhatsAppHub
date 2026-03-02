import { Router } from 'express';
import {
  handleHubSpotChannelWebhook,
  setupChannel,
  listChannels
} from '../controllers/channel.controller.js';

const router = Router();

router.post('/hubspot-channel-webhook', handleHubSpotChannelWebhook);
router.post('/api/channels/setup', setupChannel);
router.get('/api/channels', listChannels);

export default router;
