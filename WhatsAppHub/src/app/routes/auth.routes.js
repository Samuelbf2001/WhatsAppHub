import { Router } from 'express';
import { loginWithPortal, verifyAuth, logout } from '../controllers/auth.controller.js';

const router = Router();

// Punto de entrada desde link en HubSpot → redirige al frontend con JWT
router.get('/auth/login', loginWithPortal);

// El frontend llama esto para validar su token guardado
router.get('/auth/verify', verifyAuth);

// Cierre de sesión
router.post('/auth/logout', logout);

export default router;
