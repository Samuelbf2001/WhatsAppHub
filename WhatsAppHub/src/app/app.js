import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mainRouter from './routes/index.js';
import { runMigrations } from '../db/migrations.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos (setup UI)
app.use(express.static(path.join(__dirname, 'public')));

// Setup flow de canal — HubSpot redirige aquí desde Settings > Inbox > Connect Channel
app.get('/channel-setup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'channel-setup.html'));
});

// GHL Setup — GHL redirige aquí tras OAuth para configurar el canal WhatsApp
app.get('/ghl-setup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ghl-setup.html'));
});

// GHL Admin — redirige al frontend React (app embebida en GHL)
app.get('/ghl-admin', (req, res) => {
  const frontendBase = process.env.FRONTEND_BASE_URL || 'https://whatsfull-ui.lbnkcu.easypanel.host';
  const qs = new URLSearchParams(req.query).toString();
  res.redirect(`${frontendBase}/ghl-admin${qs ? `?${qs}` : ''}`);
});

app.use('/', mainRouter);

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Error interno del servidor', message: err.message });
});

app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado', path: req.originalUrl });
});

// Ejecutar migraciones al iniciar
runMigrations().catch(err => {
  console.error('Error en migraciones, continuando...', err.message);
});

export default app;
