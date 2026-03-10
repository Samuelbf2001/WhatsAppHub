import { Router } from 'express';
import { listLogs, logsSummary } from '../controllers/logs.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

// Todos los endpoints de logs requieren JWT válido
router.use('/api/logs', requireAuth);

router.get('/api/logs', listLogs);
router.get('/api/logs/summary', logsSummary);

export default router;
