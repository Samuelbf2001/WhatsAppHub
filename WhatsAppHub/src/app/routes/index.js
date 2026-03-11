import { Router } from 'express';
import healthRoutes from './health.routes.js';
import hubspotRoutes from './hubspot.routes.js';
import whatsappRoutes from './whatsapp.routes.js';
import channelRoutes from './channel.routes.js';
import authRoutes from './auth.routes.js';
import logsRoutes from './logs.routes.js';
import connectionsRoutes from './connections.routes.js';

const mainRouter = Router();

mainRouter.use(healthRoutes);
mainRouter.use(authRoutes);
mainRouter.use(hubspotRoutes);
mainRouter.use(whatsappRoutes);
mainRouter.use(channelRoutes);
mainRouter.use(logsRoutes);
mainRouter.use(connectionsRoutes);

export default mainRouter;
