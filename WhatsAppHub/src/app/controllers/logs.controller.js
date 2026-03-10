import { getLogs, getLogsSummary } from '../../db/logRepository.js';

/**
 * GET /api/logs
 * Headers: Authorization: Bearer <token>   (portalId viene del JWT via requireAuth)
 *
 * Query params opcionales:
 *   - page            {number}   default 1
 *   - limit           {number}   default 50
 *   - direction       {string}   'incoming' | 'outgoing'
 *   - status          {string}   'success' | 'error' | 'blocked'
 *   - channelAccountId {string}  filtrar por número de negocio específico
 */
export const listLogs = async (req, res) => {
  try {
    const portalId = req.portalId; // inyectado por requireAuth

    const filters = {
      page: req.query.page,
      limit: req.query.limit,
      direction: req.query.direction,
      status: req.query.status,
      channelAccountId: req.query.channelAccountId
    };

    const result = await getLogs(portalId, filters);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo logs', details: error.message });
  }
};

/**
 * GET /api/logs/summary
 * Totales y métricas del portal para el dashboard.
 */
export const logsSummary = async (req, res) => {
  try {
    const portalId = req.portalId;
    const summary = await getLogsSummary(portalId);
    res.json({ success: true, portalId, summary });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo resumen de logs', details: error.message });
  }
};
