import { Router } from 'express';
import productionRoutes from './routes.js';

const router = Router();

// All production routes are now in the clean modular structure
router.use('/', productionRoutes);

// Legacy routes have been fully migrated and disabled
// import legacyProductionRoutes from './legacyRoutes.js';
// router.use('/', legacyProductionRoutes); 

export default router;