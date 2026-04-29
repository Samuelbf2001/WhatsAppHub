import { Router } from 'express';
import {
  listConnections,
  getConnectionStatus,
  getAlertConfigHandler,
  upsertAlertConfigHandler,
  getDisconnectEventsHandler,
  testAlertHandler,
} from '../controllers/connections.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

// Endpoints de estado — requieren JWT
router.use('/api/connections', requireAuth);
router.get('/api/connections', listConnections);
router.get('/api/connections/status', getConnectionStatus);

// Alertas de desconexión — sin auth (mismo patrón que /api/ghl-channels)
router.get('/api/alert-configs/:instanceName', getAlertConfigHandler);
router.post('/api/alert-configs/:instanceName', upsertAlertConfigHandler);
router.get('/api/alert-configs/:instanceName/events', getDisconnectEventsHandler);
router.post('/api/alert-configs/:instanceName/test', testAlertHandler);

export default router;
