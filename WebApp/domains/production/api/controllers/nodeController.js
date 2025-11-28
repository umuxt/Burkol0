/**
 * Node Controller
 * HTTP handlers for production plan node management
 */

import * as nodeService from '../services/nodeService.js';

/**
 * GET /api/mes/production-plans/:planId/nodes
 */
export async function getNodes(req, res) {
  try {
    const { planId } = req.params;
    const nodes = await nodeService.getNodesByPlanId(planId);
    
    if (!nodes) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    console.log(`✅ Fetched ${nodes.length} nodes for plan: ${planId}`);
    res.json(nodes);
  } catch (error) {
    console.error('❌ Error fetching nodes:', error);
    res.status(500).json({ 
      error: 'Failed to fetch nodes',
      details: error.message 
    });
  }
}

/**
 * GET /api/mes/production-plans/:planId/nodes/:nodeId
 */
export async function getNode(req, res) {
  try {
    const { planId, nodeId } = req.params;
    const node = await nodeService.getNodeById(planId, nodeId);
    
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    res.json(node);
  } catch (error) {
    console.error('❌ Error fetching node:', error);
    res.status(500).json({ 
      error: 'Failed to fetch node',
      details: error.message 
    });
  }
}

/**
 * POST /api/mes/production-plans/:planId/nodes
 */
export async function createNode(req, res) {
  try {
    const { planId } = req.params;
    const result = await nodeService.createNode(planId, req.body);
    
    if (result.error) {
      return res.status(400).json(result);
    }
    
    res.status(201).json(result.node);
  } catch (error) {
    console.error('❌ Error adding node:', error);
    res.status(500).json({ 
      error: 'Failed to add node',
      details: error.message 
    });
  }
}

/**
 * PUT /api/mes/production-plans/:planId/nodes/:nodeId
 */
export async function updateNode(req, res) {
  try {
    const { planId, nodeId } = req.params;
    const result = await nodeService.updateNode(planId, nodeId, req.body);
    
    if (result.error) {
      const statusCode = result.error.includes('not found') ? 404 : 400;
      return res.status(statusCode).json(result);
    }
    
    res.json(result.node);
  } catch (error) {
    console.error('❌ Error updating node:', error);
    res.status(500).json({ 
      error: 'Failed to update node',
      details: error.message 
    });
  }
}

/**
 * DELETE /api/mes/production-plans/:planId/nodes/:nodeId
 */
export async function deleteNode(req, res) {
  try {
    const { planId, nodeId } = req.params;
    const result = await nodeService.deleteNode(planId, nodeId);
    
    if (result.error) {
      const statusCode = result.error.includes('not found') ? 404 : 400;
      return res.status(statusCode).json(result);
    }
    
    res.json({ 
      success: true,
      message: 'Node deleted successfully',
      nodeId 
    });
  } catch (error) {
    console.error('❌ Error deleting node:', error);
    res.status(500).json({ 
      error: 'Failed to delete node',
      details: error.message 
    });
  }
}

/**
 * POST /api/mes/nodes/:nodeId/materials
 */
export async function addMaterial(req, res) {
  try {
    const { nodeId } = req.params;
    const result = await nodeService.addMaterial(nodeId, req.body);
    
    if (result.error) {
      const statusCode = result.error.includes('not found') ? 404 : 400;
      return res.status(statusCode).json(result);
    }
    
    res.status(201).json(result.material);
  } catch (error) {
    console.error('❌ Error adding material:', error);
    res.status(500).json({ 
      error: 'Failed to add material',
      details: error.message 
    });
  }
}

/**
 * DELETE /api/mes/nodes/:nodeId/materials/:materialCode
 */
export async function removeMaterial(req, res) {
  try {
    const { nodeId, materialCode } = req.params;
    const result = await nodeService.removeMaterial(nodeId, materialCode);
    
    if (result.error) {
      const statusCode = result.error.includes('not found') ? 404 : 400;
      return res.status(statusCode).json(result);
    }
    
    res.json({ 
      success: true,
      message: 'Material removed successfully' 
    });
  } catch (error) {
    console.error('❌ Error removing material:', error);
    res.status(500).json({ 
      error: 'Failed to remove material',
      details: error.message 
    });
  }
}

/**
 * POST /api/mes/nodes/:nodeId/stations
 */
export async function addStation(req, res) {
  try {
    const { nodeId } = req.params;
    const result = await nodeService.addStation(nodeId, req.body);
    
    if (result.error) {
      const statusCode = result.error.includes('not found') ? 404 : 400;
      return res.status(statusCode).json(result);
    }
    
    res.status(201).json(result.station);
  } catch (error) {
    console.error('❌ Error assigning station:', error);
    res.status(500).json({ 
      error: 'Failed to assign station',
      details: error.message 
    });
  }
}

/**
 * DELETE /api/mes/nodes/:nodeId/stations/:stationId
 */
export async function removeStation(req, res) {
  try {
    const { nodeId, stationId } = req.params;
    const result = await nodeService.removeStation(nodeId, stationId);
    
    if (result.error) {
      const statusCode = result.error.includes('not found') ? 404 : 400;
      return res.status(statusCode).json(result);
    }
    
    res.json({ 
      success: true,
      message: 'Station removed successfully' 
    });
  } catch (error) {
    console.error('❌ Error removing station:', error);
    res.status(500).json({ 
      error: 'Failed to remove station',
      details: error.message 
    });
  }
}
