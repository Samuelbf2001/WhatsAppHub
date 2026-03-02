import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import hubspotRoutes from '../app/routes/hubspot.routes.js';
import whatsappRoutes from '../app/routes/whatsapp.routes.js';


dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/', hubspotRoutes);
app.use('/', whatsappRoutes);


// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint no encontrado',
    path: req.originalUrl
  });
});


export default app;