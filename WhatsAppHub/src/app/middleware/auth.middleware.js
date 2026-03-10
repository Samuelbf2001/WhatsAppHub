import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'whatsapphub-secret-change-in-prod';

/**
 * Genera un JWT firmado para un portalId dado.
 * Expira en 24h por defecto.
 */
export function generateToken(portalId, expiresIn = '24h') {
  return jwt.sign({ portalId: String(portalId) }, JWT_SECRET, { expiresIn });
}

/**
 * Verifica un JWT y devuelve el payload, o lanza un error.
 */
export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/**
 * Middleware Express: exige Bearer token válido.
 * Inyecta req.portalId con el valor del JWT.
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.query._token; // fallback para iframes/redirects

  if (!token) {
    return res.status(401).json({ error: 'No autorizado — token requerido' });
  }

  try {
    const payload = verifyToken(token);
    req.portalId = payload.portalId;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}
