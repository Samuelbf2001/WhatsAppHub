import { Router } from 'express';
import { listConnections, getConnectionStatus } from '../controllers/connections.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

// Ambos endpoints requieren JWT válido
router.use('/api/connections', requireAuth);

router.get('/api/connections', listConnections);
router.get('/api/connections/status', getConnectionStatus);

export default router;
