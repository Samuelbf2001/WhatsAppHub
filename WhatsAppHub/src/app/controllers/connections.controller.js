import dotenv from 'dotenv';
import { getAllChannelAccounts } from '../../db/channelRepository.js';
import {
  getAlertConfig,
  upsertAlertConfig,
  getDisconnectEvents,
} from '../../db/alertConfigRepository.js';
import { sendTestAlert } from '../services/alertService.js';

dotenv.config();

/**
 * Consulta el estado real de conexión de cada instancia EvolutionAPI
 * del portal (replicando la lógica del n8n: GET /instance/connectionState/{name}).
 *
 * GET /api/connections
 * Headers: Authorization: Bearer <JWT>   (req.portalId inyectado por requireAuth)
 */
export const listConnections = async (req, res) => {
  try {
    const portalId = req.portalId;
    const accounts = await getAllChannelAccounts(portalId);

    const withState = await Promise.all(
      accounts.map(async (account) => {
        const base = {
          id: account.id,
          portalId: account.portal_id,
          channelId: account.channel_id,
          channelAccountId: account.channel_account_id,
          inboxId: account.inbox_id,
          phoneNumber: account.whatsapp_phone_number,
          provider: account.provider || 'evolution',
          evolutionInstance: account.evolution_instance || null,
          authorized: account.authorized,
          createdAt: account.created_at,
        };

        if (account.provider !== 'gupshup' && account.evolution_instance) {
          try {
            const evoUrl = process.env.EVOLUTION_API_URL;
            const apikey = account.evolution_apikey || process.env.EVOLUTION_API_KEY;

            const response = await fetch(
              `${evoUrl}/instance/connectionState/${account.evolution_instance}`,
              { headers: { apikey }, signal: AbortSignal.timeout(5000) }
            );

            if (response.ok) {
              const data = await response.json();
              const state = data.instance?.state ?? 'unknown';
              return {
                ...base,
                connectionState: state,
                connected: state === 'open',
              };
            } else {
              return { ...base, connectionState: 'unreachable', connected: false };
            }
          } catch {
            return { ...base, connectionState: 'error', connected: false };
          }
        }

        // Gupshup — sin estado de instancia local
        return { ...base, connectionState: 'n/a', connected: account.authorized };
      })
    );

    res.json({ success: true, connections: withState });
  } catch (error) {
    res.status(500).json({ error: 'Error consultando conexiones', details: error.message });
  }
};

/**
 * Consulta el estado de una instancia específica por nombre.
 *
 * GET /api/connections/status?instanceName=Samuel
 */
export const getConnectionStatus = async (req, res) => {
  const { instanceName } = req.query;
  if (!instanceName) return res.status(400).json({ error: 'instanceName requerido' });

  try {
    const evoUrl = process.env.EVOLUTION_API_URL;
    const apikey = process.env.EVOLUTION_API_KEY;

    const response = await fetch(
      `${evoUrl}/instance/connectionState/${instanceName}`,
      { headers: { apikey }, signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) {
      return res.status(response.status).json({ error: 'EvolutionAPI error', status: response.status });
    }

    const data = await response.json();
    const state = data.instance?.state ?? 'unknown';

    res.json({
      instanceName,
      state,
      connected: state === 'open',
      raw: data.instance,
    });
  } catch (error) {
    res.status(500).json({ error: 'Error consultando estado', details: error.message });
  }
};

// GET /api/alert-configs/:instanceName
export const getAlertConfigHandler = async (req, res) => {
  const { instanceName } = req.params;
  try {
    const config = await getAlertConfig(instanceName);
    res.json({
      success: true,
      config: config || {
        instance_name:        instanceName,
        alert_enabled:        true,
        notify_on_disconnect: true,
        notify_on_reconnect:  false,
        webhook_url:          null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Error leyendo configuración de alertas', details: err.message });
  }
};

// POST /api/alert-configs/:instanceName
export const upsertAlertConfigHandler = async (req, res) => {
  const { instanceName } = req.params;
  const { locationId, alertEnabled, notifyOnDisconnect, notifyOnReconnect, webhookUrl } = req.body;
  try {
    const config = await upsertAlertConfig(instanceName, locationId, {
      alertEnabled,
      notifyOnDisconnect,
      notifyOnReconnect,
      webhookUrl,
    });
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ error: 'Error guardando configuración de alertas', details: err.message });
  }
};

// GET /api/alert-configs/:instanceName/events
export const getDisconnectEventsHandler = async (req, res) => {
  const { instanceName } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  try {
    const events = await getDisconnectEvents(instanceName, limit);
    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ error: 'Error leyendo historial de eventos', details: err.message });
  }
};

// POST /api/alert-configs/:instanceName/test
export const testAlertHandler = async (req, res) => {
  const { instanceName } = req.params;
  const { webhookUrl } = req.body;
  if (!webhookUrl) return res.status(400).json({ error: 'webhookUrl requerido' });
  const result = await sendTestAlert(instanceName, webhookUrl);
  res.json(result);
};
