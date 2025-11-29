/**
 * Materials Domain API
 * Entry point for all materials-related routes
 */

import { Router } from 'express';
import materialsRoutes from './routes.js';

const router = Router();

// All materials domain routes
router.use('/', materialsRoutes);

export default router;
