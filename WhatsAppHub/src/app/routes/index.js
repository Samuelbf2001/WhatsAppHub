import { Router } from 'express';
import healthRoutes from './health.routes.js';
import hubspotRoutes from './hubspot.routes.js';
import whatsappRoutes from './whatsapp.routes.js';
import channelRoutes from './channel.routes.js';

const mainRouter = Router();

mainRouter.use(healthRoutes);
mainRouter.use(hubspotRoutes);
mainRouter.use(whatsappRoutes);
mainRouter.use(channelRoutes);

export default mainRouter;
