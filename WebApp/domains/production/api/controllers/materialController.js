/**
 * Material Controller
 * HTTP handlers for material-related endpoints
 */

import * as materialService from '../services/materialService.js';

/**
 * GET /api/mes/materials
 */
export async function getMaterials(req, res) {
  try {
    const materials = await materialService.getAllMaterials();
    res.json({ materials });
  } catch (error) {
    console.error('❌ Materials GET Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch materials',
      details: error.message 
    });
  }
}

/**
 * POST /api/mes/materials/check-availability
 */
export async function checkAvailability(req, res) {
  try {
    const { materials: requiredMaterials } = req.body;
    
    if (!Array.isArray(requiredMaterials)) {
      return res.status(400).json({ error: 'Required materials must be an array' });
    }

    const result = await materialService.checkMaterialAvailability(requiredMaterials);
    res.json(result);
  } catch (error) {
    console.error('❌ Material availability check error:', error);
    res.status(500).json({ 
      error: 'Failed to check material availability',
      details: error.message 
    });
  }
}
