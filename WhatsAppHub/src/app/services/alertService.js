import {
  getAlertConfig,
  insertDisconnectEvent,
} from '../../db/alertConfigRepository.js';

// Último estado conocido por instancia (en memoria, se pierde al reiniciar — aceptable)
const _stateCache = new Map(); // instanceName → state string

/**
 * Llamado cuando EvolutionAPI envía un evento CONNECTION_UPDATE.
 * Detecta cambios de estado, registra el evento y dispara el webhook si aplica.
 */
export async function handleConnectionUpdate(instanceName, locationId, newState) {
  const previousState = _stateCache.get(instanceName) ?? null;
  _stateCache.set(instanceName, newState);

  // Sin cambio real: ignorar
  if (previousState === newState) return;

  const isDisconnect = newState !== 'open' && previousState === 'open';
  const isReconnect  = newState === 'open' && previousState !== null && previousState !== 'open';

  if (!isDisconnect && !isReconnect) {
    // Transición intermedia (p.ej. connecting → close): registrar igual
    if (!previousState) return; // primer evento, sin historial previo
  }

  const eventType = isReconnect ? 'reconnected' : 'disconnected';
  console.log(`📡 Alert event [${eventType}]: ${instanceName} (${previousState} → ${newState})`);

  const config = await getAlertConfig(instanceName).catch(() => null);

  let alertSent = false;
  let alertWebhookStatus = null;

  if (config?.alert_enabled) {
    const shouldAlert =
      (isDisconnect && config.notify_on_disconnect) ||
      (isReconnect  && config.notify_on_reconnect);

    if (shouldAlert && config.webhook_url) {
      try {
        const res = await fetch(config.webhook_url, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event:         eventType,
            instanceName,
            locationId:    locationId || config.location_id,
            previousState,
            newState,
            timestamp:     new Date().toISOString(),
          }),
          signal: AbortSignal.timeout(8000),
        });
        alertSent           = true;
        alertWebhookStatus  = res.status;
        console.log(`✅ Alert webhook → ${config.webhook_url} [${res.status}]`);
      } catch (err) {
        console.error(`❌ Error enviando alert webhook: ${err.message}`);
      }
    }
  }

  await insertDisconnectEvent({
    instanceName,
    locationId,
    eventType,
    previousState,
    newState,
    alertSent,
    alertWebhookStatus,
  }).catch(err => console.error('[AlertService] insertDisconnectEvent:', err.message));
}

/**
 * Envía un webhook de prueba con datos ficticios.
 * Devuelve { success, status }.
 */
export async function sendTestAlert(instanceName, webhookUrl) {
  try {
    const res = await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event:         'test',
        instanceName,
        previousState: 'open',
        newState:      'close',
        timestamp:     new Date().toISOString(),
        note:          'Este es un mensaje de prueba de WhatsAppHub',
      }),
      signal: AbortSignal.timeout(8000),
    });
    return { success: res.ok, status: res.status };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
