import { Router } from 'express';
import { install, oauthCallback } from '../controllers/oauth.controller.js';

const router = Router();

router.get('/install', install);
router.get('/oauth-callback', oauthCallback);

export default router;
