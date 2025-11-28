/**
 * Entity Relations Controller
 * HTTP handlers for polymorphic entity relationships
 */

import * as entityRelationService from '../services/entityRelationService.js';

/**
 * GET /api/mes/entity-relations
 */
export async function getEntityRelations(req, res) {
  try {
    const { sourceType, sourceId, relationType, targetId } = req.query;

    if (!sourceType || !sourceId || !relationType) {
      return res.status(400).json({
        error: 'Missing required parameters: sourceType, sourceId, relationType'
      });
    }

    const result = await entityRelationService.getEntityRelations({
      sourceType, sourceId, relationType, targetId
    });

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (err) {
    console.error('❌ [API] Failed to fetch entity relations:', err);
    res.status(500).json({
      error: 'Failed to fetch entity relations',
      details: err.message
    });
  }
}

/**
 * POST /api/mes/entity-relations
 */
export async function createEntityRelation(req, res) {
  try {
    const { sourceType, sourceId, relationType, targetId } = req.body;

    if (!sourceType || !sourceId || !relationType || !targetId) {
      return res.status(400).json({
        error: 'Missing required fields: sourceType, sourceId, relationType, targetId'
      });
    }

    const result = await entityRelationService.createEntityRelation(req.body);

    res.status(201).json(result);
  } catch (err) {
    console.error('❌ [API] Failed to create entity relation:', err);
    
    // Handle UNIQUE constraint violation
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'This relation already exists',
        details: err.message
      });
    }

    res.status(500).json({
      error: 'Failed to create entity relation',
      details: err.message
    });
  }
}

/**
 * PUT /api/mes/entity-relations/:id
 */
export async function updateEntityRelation(req, res) {
  try {
    const { id } = req.params;
    const result = await entityRelationService.updateEntityRelation(id, req.body);

    if (result.error) {
      return res.status(404).json({ error: result.error });
    }

    res.json(result);
  } catch (err) {
    console.error('❌ [API] Failed to update entity relation:', err);
    res.status(500).json({
      error: 'Failed to update entity relation',
      details: err.message
    });
  }
}

/**
 * DELETE /api/mes/entity-relations/:id
 */
export async function deleteEntityRelation(req, res) {
  try {
    const { id } = req.params;
    const result = await entityRelationService.deleteEntityRelation(id);

    if (result.error) {
      return res.status(404).json({ error: result.error });
    }

    res.json({
      success: true,
      message: 'Entity relation deleted successfully'
    });
  } catch (err) {
    console.error('❌ [API] Failed to delete entity relation:', err);
    res.status(500).json({
      error: 'Failed to delete entity relation',
      details: err.message
    });
  }
}

/**
 * POST /api/mes/entity-relations/batch
 */
export async function batchUpdateRelations(req, res) {
  try {
    const { relations } = req.body;

    if (!relations || !Array.isArray(relations)) {
      return res.status(400).json({
        error: 'Missing or invalid relations array'
      });
    }

    const result = await entityRelationService.batchUpdateRelations(relations);

    res.json(result);
  } catch (err) {
    console.error('❌ [API] Failed to batch update relations:', err);
    res.status(500).json({
      error: 'Failed to batch update relations',
      details: err.message
    });
  }
}
