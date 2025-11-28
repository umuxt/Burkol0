/**
 * Scrap & Output Controller
 * HTTP handlers for scrap records and output code validation
 */

import * as scrapService from '../services/scrapService.js';

/**
 * POST /api/mes/work-packages/:id/scrap
 */
export async function recordScrap(req, res) {
  try {
    const { id } = req.params;
    const result = await scrapService.recordScrap(id, req.body);
    
    if (result.error) {
      return res.status(400).json(result);
    }
    
    res.json(result);
  } catch (error) {
    console.error('❌ Error recording scrap:', error);
    res.status(500).json({ 
      error: 'Failed to record scrap',
      details: error.message 
    });
  }
}

/**
 * GET /api/mes/work-packages/:id/scrap
 */
export async function getScrapRecords(req, res) {
  try {
    const { id } = req.params;
    const result = await scrapService.getScrapRecords(id);
    
    if (result.error) {
      return res.status(404).json(result);
    }
    
    res.json(result);
  } catch (error) {
    console.error('❌ Error fetching scrap records:', error);
    res.status(500).json({ 
      error: 'Failed to fetch scrap records',
      details: error.message 
    });
  }
}

/**
 * DELETE /api/mes/work-packages/:id/scrap/:scrapType/:materialCode/:quantity
 */
export async function removeScrap(req, res) {
  try {
    const { id, scrapType, materialCode, quantity } = req.params;
    const result = await scrapService.removeScrap(id, scrapType, materialCode, quantity);
    
    if (result.error) {
      const statusCode = result.error.includes('not found') ? 404 : 400;
      return res.status(statusCode).json(result);
    }
    
    res.json(result);
  } catch (error) {
    console.error('❌ Error removing scrap:', error);
    res.status(500).json({ 
      error: 'Failed to remove scrap',
      details: error.message 
    });
  }
}

/**
 * GET /api/mes/output-codes/validate
 */
export async function validateOutputCode(req, res) {
  try {
    const { code, excludePlanId } = req.query;
    const result = await scrapService.validateOutputCode(code, excludePlanId);
    res.json(result);
  } catch (error) {
    console.error('❌ Error validating output code:', error);
    res.status(500).json({ 
      error: 'Failed to validate output code',
      details: error.message 
    });
  }
}

/**
 * GET /api/mes/output-codes/existing
 */
export async function getExistingOutputCodes(req, res) {
  try {
    const { planId } = req.query;
    const result = await scrapService.getExistingOutputCodes(planId);
    res.json(result);
  } catch (error) {
    console.error('❌ Error fetching output codes:', error);
    res.status(500).json({ 
      error: 'Failed to fetch output codes',
      details: error.message 
    });
  }
}
