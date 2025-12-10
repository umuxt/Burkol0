// Vercel Serverless API Entry Point
// This wraps the Express app for Vercel serverless deployment

import express from 'express';
import { setupAuthRoutes } from '../server/authRoutes.js';
import { setupCRMRoutes } from '../domains/crm/api/index.js';
import mesRoutes from '../domains/production/api/index.js';
import materialsRoutes from '../domains/materials/api/index.js';
import settingsRoutes from '../server/settingsRoutes.js';
import addressRoutes from '../server/addressRoutes.js';

const app = express();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// CORS configuration for Vercel
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://beeplan-nu.vercel.app',
    'https://beeplan.vercel.app',
    'https://test.burkometal.com',
    'http://localhost:3000',
    'http://localhost:3001'
  ];

  const origin = req.headers.origin;
  
  if (origin && allowedOrigins.some(allowed => origin.startsWith(allowed.replace(/\/$/, '')))) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, X-Requested-With');
  res.header('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

// Setup API routes
setupAuthRoutes(app);
setupCRMRoutes(app);

// Materials domain routes
app.use('/api', materialsRoutes);

// Production domain routes (MES)
app.use('/api/mes', mesRoutes);

// Settings routes
app.use('/api/settings', settingsRoutes);

// Address data routes
app.use('/api/address', addressRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.DATABASE_URL ? 'production' : 'development'
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Vercel serverless handler
export default function handler(req, res) {
  return app(req, res);
}

// Also export app for local development
export { app };
