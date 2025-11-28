/**
 * Entity Relations Service
 * Handles polymorphic entity relationships (worker→station, node→station, etc.)
 */

import db from '#db/connection';

/**
 * Get entity relations with optional filtering
 */
export async function getEntityRelations(filters) {
  const { sourceType, sourceId, relationType, targetId } = filters;

  // Validation
  const validSourceTypes = ['worker', 'station', 'node'];
  const validRelationTypes = ['station', 'operation', 'substation', 'material', 'predecessor'];

  if (!validSourceTypes.includes(sourceType)) {
    return { error: `Invalid sourceType. Must be one of: ${validSourceTypes.join(', ')}` };
  }

  if (!validRelationTypes.includes(relationType)) {
    return { error: `Invalid relationType. Must be one of: ${validRelationTypes.join(', ')}` };
  }

  // Build query
  let query = db('mes_entity_relations')
    .where({
      sourceType: sourceType,
      sourceId: sourceId,
      relationType: relationType
    })
    .select(
      'id',
      'sourceType',
      'sourceId',
      'relationType',
      'targetId',
      'priority',
      'quantity',
      'unitRatio',
      'isDerived',
      'createdAt',
      'updatedAt'
    );

  // Optional target filter
  if (targetId) {
    query = query.where('targetId', targetId);
  }

  // Order by priority
  query = query.orderBy('priority', 'asc').orderBy('createdAt', 'asc');

  const relations = await query;

  // Enrich with target entity details
  const enrichedRelations = await Promise.all(
    relations.map(async (relation) => {
      let targetName = null;
      let targetDetails = null;

      try {
        if (relation.relationType === 'station') {
          const station = await db('mes.stations')
            .where('id', relation.targetId)
            .first('id', 'name', 'code', 'type');
          if (station) {
            targetName = station.name;
            targetDetails = station;
          }
        } else if (relation.relationType === 'operation') {
          const operation = await db('mes.operations')
            .where('id', relation.targetId)
            .first('id', 'name', 'code', 'type');
          if (operation) {
            targetName = operation.name;
            targetDetails = operation;
          }
        } else if (relation.relationType === 'substation') {
          const substation = await db('mes.substations')
            .where('id', relation.targetId)
            .first('id', 'name', 'code', 'stationId');
          if (substation) {
            targetName = substation.name;
            targetDetails = substation;
          }
        } else if (relation.relationType === 'predecessor') {
          const node = await db('mes.production_plan_nodes')
            .where('id', relation.targetId)
            .first('id', 'name', 'operationId');
          if (node) {
            targetName = node.name;
            targetDetails = node;
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch target details for ${relation.relationType} ${relation.targetId}:`, err.message);
      }

      return {
        ...relation,
        targetName,
        targetDetails
      };
    })
  );

  return {
    success: true,
    count: enrichedRelations.length,
    relations: enrichedRelations
  };
}

/**
 * Create a new entity relation
 */
export async function createEntityRelation(data) {
  const {
    sourceType,
    sourceId,
    relationType,
    targetId,
    priority,
    quantity,
    unitRatio,
    isDerived
  } = data;

  const [relation] = await db('mes_entity_relations')
    .insert({
      sourceType: sourceType,
      sourceId: sourceId,
      relationType: relationType,
      targetId: targetId,
      priority: priority || null,
      quantity: quantity || null,
      unitRatio: unitRatio || null,
      isDerived: isDerived || false,
      createdAt: new Date(),
      updatedAt: new Date()
    })
    .returning('*');

  return {
    success: true,
    relation
  };
}

/**
 * Update an entity relation
 */
export async function updateEntityRelation(id, data) {
  const { priority, quantity, unitRatio } = data;

  const updateData = {
    updatedAt: new Date()
  };

  if (priority !== undefined) updateData.priority = priority;
  if (quantity !== undefined) updateData.quantity = quantity;
  if (unitRatio !== undefined) updateData.unitRatio = unitRatio;

  const [updatedRelation] = await db('mes_entity_relations')
    .where('id', id)
    .update(updateData)
    .returning('*');

  if (!updatedRelation) {
    return { error: 'Entity relation not found' };
  }

  return {
    success: true,
    relation: updatedRelation
  };
}

/**
 * Delete an entity relation
 */
export async function deleteEntityRelation(id) {
  const deleted = await db('mes_entity_relations')
    .where('id', id)
    .del();

  if (deleted === 0) {
    return { error: 'Entity relation not found' };
  }

  return { success: true };
}

/**
 * Batch update relations (for priority reordering)
 */
export async function batchUpdateRelations(relations) {
  await db.transaction(async (trx) => {
    for (const relation of relations) {
      if (relation.id && relation.priority !== undefined) {
        await trx('mes_entity_relations')
          .where('id', relation.id)
          .update({
            priority: relation.priority,
            updatedAt: new Date()
          });
      }
    }
  });

  return {
    success: true,
    message: `${relations.length} relations updated successfully`
  };
}
