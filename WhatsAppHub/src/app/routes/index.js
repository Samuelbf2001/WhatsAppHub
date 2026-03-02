import { Router } from 'express';

// 1. Importa cada enrutador individual
import healthRoutes from './health.routes.js';
import oauthRoutes from './oauth.routes.js';
import hubspotRoutes from './hubspot.routes.js';
import whatsappRoutes from './whatsapp.routes.js';

// 2. Crea una instancia del enrutador principal
const mainRouter = Router();

// 3. "Monta" cada enrutador en el principal.
// mainRouter.use() funciona como un "conector" que añade todas las
// rutas de cada archivo.
mainRouter.use(healthRoutes);
mainRouter.use(oauthRoutes);
mainRouter.use(hubspotRoutes);
mainRouter.use(whatsappRoutes);

// 4. Exporta el enrutador principal ya unificado
export default mainRouter;