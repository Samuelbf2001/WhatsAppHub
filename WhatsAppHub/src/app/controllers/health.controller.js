export const getHealthStatus = (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    oauth_status: 'unknown', // Aquí podrías integrar el estado de HubSpot si quieres
    server: process.env.SERVER_NAME || 'local'
  });
};
