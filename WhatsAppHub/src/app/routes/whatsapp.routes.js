import { Router } from 'express';
import {
  verifyWebhook,
  receiveMessage,
  sendMessage
} from '../controllers/whatsapp.controller.js';

const router = Router();

router.get('/whatsapp-webhook', verifyWebhook);
router.post('/whatsapp-webhook', receiveMessage);
router.post('/api/send-whatsapp', sendMessage);

export default router;
