import express from 'express';
import db from '../db/connection.js';
import { getSession } from './auth.js'
import { adjustMaterialStock, consumeMaterials } from './materialsRoutes.js'
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { createRequire } from 'module';
import { 
  reserveMaterialsWithLotTracking, 
  getLotConsumptionPreview,
  releaseMaterialReservations,
  markMaterialsConsumed 
} from './utils/lotConsumption.js';
import {
  getWorkerNextTask,
  getWorkerTaskQueue,
  getWorkerTaskStats,
  startTask,
  completeTask,
  hasTasksInQueue
} from './utils/fifoScheduler.js';
import {
  createSSEStream,
  createWorkerFilter,
  createPlanFilter
} from './utils/sseStream.js';

const require = createRequire(import.meta.url);
const planSchema = require('./models/ProductionPlanSchema.json');
const assignmentSchema = require('./models/AssignmentSchema.json');
const featureFlags = require('../config/featureFlags.cjs');

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validatePlan = ajv.compile(planSchema);
const validateAssignment = ajv.compile(assignmentSchema);

const router = express.Router();

// Log feature flag status on module load
featureFlags.logStatus();

// ============================================================================
// METRICS COLLECTION
// ============================================================================
// Simple in-memory counters for monitoring key events
// In production, integrate with Prometheus/Datadog/CloudWatch
const metrics = {
  reservation_mismatch_count: 0,
  consumption_capped_count: 0,
  validation_error_count: 0,
  
  increment(metricName) {
    if (this.hasOwnProperty(metricName)) {
      this[metricName]++;
      console.log(`📊 METRIC: ${metricName} = ${this[metricName]}`);
    }
  },
  
  reset() {
    this.reservation_mismatch_count = 0;
    this.consumption_capped_count = 0;
    this.validation_error_count = 0;
  },
  
  getAll() {
    return {
      reservation_mismatch_count: this.reservation_mismatch_count,
      consumption_capped_count: this.consumption_capped_count,
      validation_error_count: this.validation_error_count
    };
  }
};

console.log('✅ MES Routes module loaded');

function withAuth(req, res, next) {
  // Basic token presence check
  const token = req.headers.authorization?.replace('Bearer ', '') || ''
  if (!token && req.hostname !== 'localhost') {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  // Attach session user when possible (for createdBy/updatedBy fields)
  try {
    if (token && token.startsWith('dev-')) {
      req.user = { email: 'dev@burkol.com', userName: 'Dev User' }
    } else if (token) {
      const s = getSession(token)
      if (s) req.user = s
    }
  } catch {}
  next()
}

// Date helpers to store explicit date and time parts
function formatDateParts(d) {
  try {
    const dt = (d instanceof Date) ? d : new Date(d)
    const pad = (n) => String(n).padStart(2, '0')
    const yyyy = dt.getFullYear()
    const mm = pad(dt.getMonth() + 1)
    const dd = pad(dt.getDate())
    const HH = pad(dt.getHours())
    const MM = pad(dt.getMinutes())
    const SS = pad(dt.getSeconds())
    return { date: `${yyyy}-${mm}-${dd}`, time: `${HH}:${MM}:${SS}` }
  } catch {
    return { date: null, time: null }
  }
}

function generateWorkPackageIds(workOrderCode, assignmentsCount) {
  if (!workOrderCode) {
    throw new Error('workOrderCode is required for generating work package IDs');
  }
  
  console.log(`🔢 Generating ${assignmentsCount} work package IDs for order: ${workOrderCode}`);
  
  const ids = [];
  for (let i = 1; i <= assignmentsCount; i++) {
    const workPackageId = `${workOrderCode}-${String(i).padStart(2, '0')}`;
    ids.push(workPackageId);
  }
  
  console.log(`  ✅ Generated IDs: ${ids.join(', ')}`);
  return ids;
}

// ============================================================================
// MATERIAL RESERVATION HELPERS
// ============================================================================

/**
 * Apply output code suffix for finished products
 * If a node is the final node (no other nodes use it as predecessor),
 * append 'F' suffix to outputCode to mark it as finished product
 * 
 * @param {Array} nodes - All nodes in the plan
 * @returns {Array} Nodes with updated outputCodes
 */
function applyOutputCodeSuffixes(nodes) {
  if (!nodes || !Array.isArray(nodes)) return nodes;
  
  return nodes.map(node => {
    if (!node.outputCode) return node;
    
    // Check if this node is a finished product (no other nodes use it as predecessor)
    const isFinishedProduct = !nodes.some(n => 
      Array.isArray(n.predecessors) && n.predecessors.includes(node.nodeId)
    );
    
    // If it's a finished product and doesn't already have 'F' suffix, add it
    if (isFinishedProduct && !node.outputCode.endsWith('F')) {
      const updatedNode = { ...node };
      updatedNode.outputCode = `${node.outputCode}F`;
      console.log(`✅ Applied 'F' suffix to finished product: ${node.outputCode} → ${updatedNode.outputCode}`);
      return updatedNode;
    }
    
    return node;
  });
}

/**
 * Calculate pre-production reserved amounts for a work package
 * Takes into account expected defect rate and input/output ratio
 * 
 * Example:
 * - Output: 100 units, Defect Rate: 1%
 * - Expected defects: 100 * 0.01 = 1 unit (in output)
 * - Material M-008: 2 units input → 1 unit output (ratio = 2)
 * - Required input for 100 output: 100 * 2 = 200 units
 * - Defect input: 1 * 2 = 2 units
 * - Total reserved: 200 + 2 = 202 units
 * 
 * @param {Object} node - Execution graph node with materialInputs and outputQty
 * @param {number} expectedDefectRate - Expected defect rate from operation (percentage)
 * @param {number} planQuantity - Production plan quantity multiplier
 * @returns {Object} Object with materialCode as key and reserved quantity as value
 */
function calculatePreProductionReservedAmount(node, expectedDefectRate = 0, planQuantity = 1) {
  const preProductionReservedAmount = {};
  
  if (!node || !node.materialInputs || !Array.isArray(node.materialInputs)) {
    console.warn(`⚠️ calculatePreProductionReservedAmount: node ${node?.id} has no materialInputs!`);
    console.warn(`   node.materialInputs:`, node?.materialInputs);
    return preProductionReservedAmount;
  }
  
  // Get output quantity (planned output for this operation)
  const outputQty = parseFloat(node.outputQty) || 0;
  
  if (outputQty <= 0) {
    console.warn(`Node ${node.nodeId} has no outputQty, cannot calculate input/output ratio. Using direct input quantities.`);
    // Fallback: use input quantities directly
    node.materialInputs.forEach(material => {
      // Material schema: materialCode, requiredQuantity (legacy code/qty still supported for materials)
      const materialCode = material.materialCode || material.code;
      const requiredQty = (material.requiredQuantity || material.qty || material.required || 0) * planQuantity;
      if (materialCode && requiredQty > 0) {
        preProductionReservedAmount[materialCode] = 
          (preProductionReservedAmount[materialCode] || 0) + requiredQty;
      }
    });
    return preProductionReservedAmount;
  }
  
  // Calculate scaled output based on plan quantity
  const scaledOutputQty = outputQty * planQuantity;
  
  // Ensure defect rate is a valid number between 0 and 100
  const defectRate = Math.max(0, Math.min(100, parseFloat(expectedDefectRate) || 0));
  
  // Calculate expected defects in OUTPUT units
  const expectedDefectsInOutput = scaledOutputQty * (defectRate / 100);
  
  console.log(`📊 Rehin Calculation for node ${node.nodeId}:`);
  console.log(`   Output: ${scaledOutputQty}, Defect Rate: ${defectRate}%, Expected Defects: ${expectedDefectsInOutput}`);
  
  // Process each input material
  node.materialInputs.forEach(material => {
    // Material schema: materialCode, requiredQuantity (legacy code/qty still supported)
    const materialCode = material.materialCode || material.code;
    const inputQtyPerOperation = material.requiredQuantity || material.qty || material.required || 0;
    
    if (!materialCode || inputQtyPerOperation <= 0) return;
    
    // Calculate input/output ratio for THIS material
    // Example: If 2 units of M-008 produces 1 unit of output, ratio = 2
    const inputOutputRatio = inputQtyPerOperation / outputQty;
    
    // Required input for planned good output
    const requiredInputForGoodOutput = scaledOutputQty * inputOutputRatio;
    
    // Additional input needed for expected defects
    const additionalInputForDefects = expectedDefectsInOutput * inputOutputRatio;
    
    // Total reserved = normal requirement + defect buffer
    const totalReserved = requiredInputForGoodOutput + additionalInputForDefects;
    
    // Round up to avoid fractional units
    const reservedQty = Math.ceil(totalReserved);
    
    console.log(`   Material ${materialCode}:`);
    console.log(`      Input/Output Ratio: ${inputOutputRatio.toFixed(4)} (${inputQtyPerOperation}/${outputQty})`);
    console.log(`      Required for good output: ${requiredInputForGoodOutput.toFixed(2)}`);
    console.log(`      Additional for defects: ${additionalInputForDefects.toFixed(2)}`);
    console.log(`      Total reserved: ${reservedQty}`);
    
    // Accumulate if material appears multiple times
    preProductionReservedAmount[materialCode] = 
      (preProductionReservedAmount[materialCode] || 0) + reservedQty;
  });
  
  return preProductionReservedAmount;
}

/**
 * Calculate planned output for a work package
 * 
 * @param {Object} node - Execution graph node with output information
 * @param {number} planQuantity - Production plan quantity multiplier
 * @returns {Object} Object with materialCode as key and planned quantity as value
 */
function calculatePlannedOutput(node, planQuantity = 1) {
  const plannedOutput = {};
  
  if (!node) return plannedOutput;
  
  // Check if node has output material (semi-finished product or final product)
  if (node.outputCode && node.outputQty) {
    const outputQty = parseFloat(node.outputQty) || 0;
    if (outputQty > 0) {
      plannedOutput[node.outputCode] = outputQty * planQuantity;
    }
  }
  
  return plannedOutput;
}

// ============================================================================
// EXECUTION STATE HELPERS
// ============================================================================

/**
 * Get execution state for all tasks in a production plan
 * Calculates prerequisites and determines task status (ready, blocked, in_progress, etc.)
 * @param {string} planId - Production plan ID
 * @returns {Promise<Array>} Array of task execution states
 */

// ============================================================================
// OPERATIONS
// ============================================================================

// GET /api/mes/operations
router.get('/operations', withAuth, async (req, res) => {
  try {
    const result = await db('mes.operations')
      .select(
        'id', 
        'name', 
        'type', 
        'semi_output_code', 
        'expected_defect_rate',
        'default_efficiency',
        'supervisor_id',
        'skills',
        'created_at',
        'updated_at'
      )
      .orderBy('name');
    
    // Parse skills JSON and convert snake_case to camelCase for frontend
    const operations = result.map(op => ({
      id: op.id,
      name: op.name,
      type: op.type,
      semiOutputCode: op.semi_output_code,
      expectedDefectRate: op.expected_defect_rate,
      defaultEfficiency: op.default_efficiency,
      supervisorId: op.supervisor_id,
      skills: typeof op.skills === 'string' ? JSON.parse(op.skills) : (op.skills || []),
      createdAt: op.created_at,
      updatedAt: op.updated_at
    }));
    
    res.json(operations);
  } catch (error) {
    console.error('Error fetching operations:', error);
    res.status(500).json({ error: 'Failed to fetch operations' });
  }
});

// POST /api/mes/operations
// Save or update operations (batch operation)
router.post('/operations', withAuth, async (req, res) => {
  const { operations } = req.body;
  
  if (!Array.isArray(operations)) {
    return res.status(400).json({ error: 'operations array is required' });
  }
  
  try {
    // Use transaction for batch upsert
    await db.transaction(async (trx) => {
      for (const op of operations) {
        const operationData = {
          id: op.id,
          name: op.name,
          type: op.type || 'General',
          semi_output_code: op.semiOutputCode || null,
          expected_defect_rate: op.expectedDefectRate || 0,
          default_efficiency: op.defaultEfficiency || 1.0,
          supervisor_id: op.supervisorId || null,
          skills: JSON.stringify(op.skills || []),
          updated_at: trx.fn.now()
        };
        
        // Upsert: insert or update if exists
        const exists = await trx('mes.operations').where({ id: op.id }).first();
        
        if (exists) {
          await trx('mes.operations')
            .where({ id: op.id })
            .update(operationData);
        } else {
          await trx('mes.operations').insert({
            ...operationData,
            created_at: trx.fn.now()
          });
        }
      }
    });
    
    res.json({ success: true, operations });
  } catch (error) {
    console.error('Error saving operations:', error);
    res.status(500).json({ error: 'Failed to save operations' });
  }
});

// ============================================================================
// WORKERS
// ============================================================================

// GET /api/mes/workers
router.get('/workers', withAuth, async (req, res) => {
  try {
    const result = await db('mes.workers')
      .select(
        'id',
        'name',
        'skills',
        'personal_schedule',
        'is_active',
        'current_task_plan_id',
        'current_task_node_id',
        'current_task_assignment_id',
        'created_at',
        'updated_at'
      )
      .where('is_active', true)
      .orderBy('name');
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching workers:', error);
    res.status(500).json({ error: 'Failed to fetch workers' });
  }
});

// POST /api/mes/workers
router.post('/workers', withAuth, async (req, res) => {
  const { name, skills, personalSchedule } = req.body;
  
  // Validation
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (!Array.isArray(skills) || skills.length === 0) {
    return res.status(400).json({ error: 'At least one skill is required' });
  }
  
  try {
    // Generate worker ID (WK-001 format) - this is the only ID needed
    const [{ max_id }] = await db('mes.workers')
      .max('id as max_id');
    const nextNum = max_id ? parseInt(max_id.split('-')[1]) + 1 : 1;
    const newId = `WK-${nextNum.toString().padStart(3, '0')}`;
    
    // Insert worker
    const result = await db('mes.workers')
      .insert({
        id: newId,
        name,
        skills: JSON.stringify(skills),
        personal_schedule: personalSchedule ? JSON.stringify(personalSchedule) : null,
        is_active: true,
        created_at: db.fn.now(),
        updated_at: db.fn.now()
      })
      .returning([
        'id',
        'name',
        'skills',
        'personal_schedule',
        'is_active',
        'created_at'
      ]);
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error creating worker:', error);
    res.status(500).json({ error: 'Failed to create worker' });
  }
});


// GET /api/mes/workers/:id/stations - Get stations where this worker can work
router.get('/workers/:id/stations', withAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Get worker's skills
    const worker = await db('mes.workers')
      .select('id', 'name', 'skills')
      .where('id', id)
      .first();
    
    if (!worker) {
      return res.status(404).json({ error: 'Worker not found' });
    }
    
    const workerSkills = Array.isArray(worker.skills) ? worker.skills : [];
    
    // Get all stations with their required skills
    const stations = await db('mes.stations')
      .select(
        'id',
        'name',
        'type',
        'description',
        'capabilities'
      )
      .where('is_active', true);
    
    // Simple compatibility: return all active stations
    // (Complex skill matching can be added later if needed)
    const compatibleStations = stations.map(station => ({
      id: station.id,
      name: station.name,
      type: station.type,
      description: station.description,
      capabilities: station.capabilities
    }));
    
    res.json({
      workerId: id,
      workerName: worker.name,
      workerSkills: workerSkills,
      compatibleStations: compatibleStations
    });
  } catch (error) {
    console.error('Error fetching worker stations:', error);
    res.status(500).json({ error: 'Failed to fetch worker stations' });
  }
});

// DELETE /api/mes/workers/:id - Soft delete worker
router.delete('/workers/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await db('mes.workers')
      .update({
        is_active: false,
        updated_at: db.fn.now()
      })
      .where('id', id)
      .returning(['id', 'name']);
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Worker not found' });
    }
    
    res.json({ success: true, id: result[0].id, name: result[0].name });
  } catch (error) {
    console.error('Error deleting worker:', error);
    res.status(500).json({ error: 'Failed to delete worker' });
  }
});

// ============================================================================
// STATIONS
// ============================================================================

// GET /api/mes/stations
router.get('/stations', withAuth, async (req, res) => {
  try {
    const rows = await db('mes.stations')
      .select('*')
      .where('is_active', true)
      .orderBy('name');
    
    // Map DB columns → frontend camelCase
    const mapped = rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      description: row.description,
      location: row.location,
      capabilities: row.capabilities,
      subStations: row.substations || [],
      operationIds: row.operation_ids || [],
      subSkills: row.sub_skills || [],
      status: row.is_active ? 'active' : 'inactive',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
    
    res.json(mapped); // Return array directly
  } catch (error) {
    console.error('Error fetching stations:', error);
    res.status(500).json({ error: 'Failed to fetch stations' });
  }
});

// POST /api/mes/stations - Batch upsert stations
router.post('/stations', withAuth, async (req, res) => {
  const { stations } = req.body;
  
  if (!Array.isArray(stations) || stations.length === 0) {
    return res.status(400).json({ error: 'Invalid stations array' });
  }

  try {
    const results = await db.transaction(async (trx) => {
      const upserted = [];
      
      for (const station of stations) {
        // Map frontend fields → DB columns
        const dbRecord = {
          id: station.id,
          name: station.name,
          type: station.type || null,
          description: station.description || null,
          location: station.location || null,
          capabilities: station.capabilities ? JSON.stringify(station.capabilities) : null,
          substations: station.subStations ? JSON.stringify(station.subStations) : '[]',
          operation_ids: station.operationIds ? JSON.stringify(station.operationIds) : '[]',
          sub_skills: station.subSkills ? JSON.stringify(station.subSkills) : '[]',
          is_active: station.status === 'active',
          updated_at: trx.fn.now()
        };

        // Upsert (INSERT ... ON CONFLICT UPDATE)
        const [result] = await trx('mes.stations')
          .insert({ ...dbRecord, created_at: trx.fn.now() })
          .onConflict('id')
          .merge(['name', 'type', 'description', 'location', 'capabilities', 'substations', 'operation_ids', 'sub_skills', 'is_active', 'updated_at'])
          .returning('*');
        
        upserted.push(result);
      }
      
      return upserted;
    });

    res.json(results);
  } catch (error) {
    console.error('Error saving stations:', error);
    res.status(500).json({ error: 'Failed to save stations' });
  }
});

// GET /api/mes/stations/:id/workers - Get workers that can work at this station
router.get('/stations/:id/workers', withAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Check if station exists
    const station = await db('mes.stations')
      .where({ id })
      .first();
    
    if (!station) {
      return res.status(404).json({ error: 'Station not found' });
    }
    
    // For now, return empty array (worker-station assignments not yet implemented)
    res.json([]);
  } catch (error) {
    console.error('Error fetching station workers:', error);
    res.status(500).json({ error: 'Failed to fetch station workers' });
  }
});

// DELETE /api/mes/stations/:id - Soft delete a station
router.delete('/stations/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Soft delete (set is_active = false)
    const result = await db('mes.stations')
      .where({ id })
      .update({
        is_active: false,
        updated_at: db.fn.now()
      })
      .returning('id');
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Station not found' });
    }
    
    res.json({ success: true, id: result[0].id });
  } catch (error) {
    console.error('Error deleting station:', error);
    res.status(500).json({ error: 'Failed to delete station' });
  }
});

// ============================================================================
// SKILLS (Master Data)
// ============================================================================

// GET /api/mes/skills
router.get('/skills', withAuth, async (req, res) => {
  try {
    const skills = await db('mes.skills')
      .select('id', 'name', 'description', 'is_active', 'created_at', 'updated_at')
      .where('is_active', true)
      .orderBy('name');
    
    res.json(skills);
  } catch (error) {
    console.error('Error fetching skills:', error);
    res.status(500).json({ error: 'Failed to fetch skills' });
  }
});

// POST /api/mes/skills - Create new skill
router.post('/skills', withAuth, async (req, res) => {
  const { name, description } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Skill name is required' });
  }
  
  try {
    // Generate skill-xxx ID
    const [{ max_id }] = await db('mes.skills').max('id as max_id');
    const nextNum = max_id ? parseInt(max_id.split('-')[1]) + 1 : 1;
    const newId = `skill-${nextNum.toString().padStart(3, '0')}`;
    
    const result = await db('mes.skills')
      .insert({
        id: newId,
        name,
        description,
        is_active: true,
        created_at: db.fn.now(),
        updated_at: db.fn.now(),
        created_by: req.user?.email || 'system'
      })
      .returning(['id', 'name', 'description', 'is_active', 'created_at']);
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error creating skill:', error);
    res.status(500).json({ error: 'Failed to create skill' });
  }
});

// PUT /api/mes/skills/:id - Update skill
router.put('/skills/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  
  try {
    const result = await db('mes.skills')
      .where({ id })
      .update({
        name,
        description,
        updated_at: db.fn.now(),
        updated_by: req.user?.email || 'system'
      })
      .returning(['id', 'name', 'description', 'is_active', 'updated_at']);
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error updating skill:', error);
    res.status(500).json({ error: 'Failed to update skill' });
  }
});

// DELETE /api/mes/skills/:id - Soft delete skill
router.delete('/skills/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Check if skill is in use
    const [workersCount] = await db('mes.workers')
      .whereRaw('skills::jsonb @> ?', [JSON.stringify([id])])
      .count('* as count');
    
    const [stationsCount] = await db('mes.stations')
      .whereRaw('capabilities::jsonb @> ?', [JSON.stringify([id])])
      .count('* as count');
    
    const [operationsCount] = await db('mes.operations')
      .whereRaw('skills::jsonb @> ?', [JSON.stringify([id])])
      .count('* as count');
    
    const totalUsage = parseInt(workersCount.count) + parseInt(stationsCount.count) + parseInt(operationsCount.count);
    
    if (totalUsage > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete skill in use',
        usage: {
          workers: parseInt(workersCount.count),
          stations: parseInt(stationsCount.count),
          operations: parseInt(operationsCount.count)
        }
      });
    }
    
    // Soft delete
    const result = await db('mes.skills')
      .where({ id })
      .update({
        is_active: false,
        updated_at: db.fn.now(),
        updated_by: req.user?.email || 'system'
      })
      .returning('id');
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    
    res.json({ success: true, id: result[0].id });
  } catch (error) {
    console.error('Error deleting skill:', error);
    res.status(500).json({ error: 'Failed to delete skill' });
  }
});

// ============================================================================
// WORK ORDERS
// ============================================================================

// GET /api/mes/work-orders
router.get('/work-orders', withAuth, async (req, res) => {
  try {
    const workOrders = await db('mes.work_orders')
      .select(
        'id',
        'code',
        'quote_id',
        'status',
        'data',
        'created_at',
        'updated_at'
      )
      .orderBy('created_at', 'desc');
    
    res.json({ workOrders });
  } catch (error) {
    console.error('Error fetching work orders:', error);
    res.status(500).json({ error: 'Failed to fetch work orders' });
  }
});

// POST /api/mes/work-orders - Create work order
router.post('/work-orders', withAuth, async (req, res) => {
  const { quote_id, status, data } = req.body;
  
  try {
    // Generate WO code (WO-001, WO-002, WO-003...)
    const [{ max_code }] = await db('mes.work_orders')
      .max('code as max_code');
    
    let nextNum = 1;
    if (max_code) {
      const match = max_code.match(/WO-(\d+)/);
      if (match) {
        nextNum = parseInt(match[1]) + 1;
      }
    }
    
    const code = `WO-${nextNum.toString().padStart(3, '0')}`;
    
    // Create work order (production work order, not materials.orders!)
    const [workOrder] = await db('mes.work_orders')
      .insert({
        id: code,  // Use code as ID
        code,
        quote_id,
        status: status || 'pending',
        data: data ? JSON.stringify(data) : null,
        created_at: db.fn.now(),
        updated_at: db.fn.now()
      })
      .returning(['id', 'code', 'quote_id', 'status', 'data', 'created_at', 'updated_at']);
    
    res.json({ success: true, ...workOrder });
  } catch (error) {
    console.error('Error creating work order:', error);
    res.status(500).json({ error: 'Failed to create work order' });
  }
});

// PUT /api/mes/work-orders/:id - Update work order
router.put('/work-orders/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  const { quote_id, status, data } = req.body;
  
  try {
    const updateData = {
      updated_at: db.fn.now()
    };
    
    // Only update provided fields
    if (quote_id !== undefined) updateData.quote_id = quote_id;
    if (status !== undefined) updateData.status = status;
    if (data !== undefined) updateData.data = JSON.stringify(data);
    
    const [workOrder] = await db('mes.work_orders')
      .where({ id })
      .update(updateData)
      .returning(['id', 'code', 'quote_id', 'status', 'data', 'updated_at']);
    
    if (!workOrder) {
      return res.status(404).json({ error: 'Work order not found' });
    }
    
    res.json({ success: true, ...workOrder });
  } catch (error) {
    console.error('Error updating work order:', error);
    res.status(500).json({ error: 'Failed to update work order' });
  }
});

// DELETE /api/mes/work-orders/:id - Delete work order
router.delete('/work-orders/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    const [deleted] = await db('mes.work_orders')
      .where({ id })
      .delete()
      .returning('id');
    
    if (!deleted) {
      return res.status(404).json({ error: 'Work order not found' });
    }
    
    res.json({ success: true, id: deleted.id });
  } catch (error) {
    console.error('Error deleting work order:', error);
    res.status(500).json({ error: 'Failed to delete work order' });
  }
});

// POST /api/mes/work-orders/next-id - Get next available work order code
router.post('/work-orders/next-id', withAuth, async (req, res) => {
  try {
    const [{ max_code }] = await db('mes.work_orders')
      .max('code as max_code');
    
    let nextNum = 1;
    if (max_code) {
      const match = max_code.match(/WO-(\\d+)/);
      if (match) {
        nextNum = parseInt(match[1]) + 1;
      }
    }
    
    const nextCode = `WO-${nextNum.toString().padStart(3, '0')}`;
    
    res.json({ nextCode });
  } catch (error) {
    console.error('Error generating next work order code:', error);
    res.status(500).json({ error: 'Failed to generate next code' });
  }
});

// ============================================================================
// APPROVED QUOTES
// ============================================================================

// GET /api/mes/approved-quotes
router.get('/approved-quotes', withAuth, async (req, res) => {
  try {
    const approvedQuotes = await db('mes.approved_quotes')
      .select(
        'id',
        'work_order_code',
        'production_state',
        'production_state_updated_at',
        'production_state_updated_by',
        'created_at'
      )
      .orderBy('created_at', 'desc');
    
    res.json({ approvedQuotes });
  } catch (error) {
    console.error('Error fetching approved quotes:', error);
    res.status(500).json({ error: 'Failed to fetch approved quotes' });
  }
});

// POST /api/mes/approved-quotes/ensure - Ensure an approved quote is copied as WO (SQL)
router.post('/approved-quotes/ensure', withAuth, async (req, res) => {
  const trx = await db.transaction();
  
  try {
    const { quoteId } = req.body || {};
    console.log(`🔍 [ENSURE] Starting WO creation for quote: ${quoteId}`);
    
    if (!quoteId) {
      await trx.rollback();
      console.log('❌ [ENSURE] No quoteId provided');
      return res.status(400).json({ success: false, error: 'quoteId_required' });
    }

    // Check if WO already exists
    console.log(`🔍 [ENSURE] Checking if WO already exists for quote: ${quoteId}`);
    const [existing] = await trx('mes.approved_quotes')
      .where({ quote_id: quoteId })
      .select('work_order_code')
      .limit(1);
    
    if (existing) {
      await trx.rollback();
      console.log(`ℹ️ [ENSURE] WO already exists: ${existing.work_order_code}`);
      return res.json({ 
        success: true, 
        ensured: true, 
        workOrderCode: existing.work_order_code 
      });
    }

    // Load quote from jsondb
    console.log(`🔍 [ENSURE] Loading quote from jsondb: ${quoteId}`);
    const { default: jsondb } = await import('../src/lib/jsondb.js');
    const quote = jsondb.getQuote(quoteId);
    
    if (!quote) {
      await trx.rollback();
      console.log(`❌ [ENSURE] Quote not found in jsondb: ${quoteId}`);
      return res.status(404).json({ success: false, error: 'quote_not_found' });
    }
    
    console.log(`✅ [ENSURE] Quote loaded: ${quote.id} | Status: ${quote.status}`);
    
    // Validate quote status
    const st = String(quote.status || '').toLowerCase();
    if (!(st === 'approved' || st === 'onaylandı' || st === 'onaylandi')) {
      await trx.rollback();
      console.log(`❌ [ENSURE] Quote not approved. Status: ${quote.status}`);
      return res.status(400).json({ 
        success: false, 
        error: 'quote_not_approved', 
        status: quote.status || null 
      });
    }

    // Validate delivery date
    if (!quote.deliveryDate || String(quote.deliveryDate).trim() === '') {
      await trx.rollback();
      console.log(`❌ [ENSURE] Delivery date missing`);
      return res.status(400).json({ success: false, error: 'delivery_date_required' });
    }
    console.log(`✅ [ENSURE] Delivery date: ${quote.deliveryDate}`);

    // Generate next WO code using mes.work_orders counter
    const [{ max_code }] = await trx('mes.work_orders')
      .max('code as max_code');
    
    const nextNum = max_code ? parseInt(max_code.split('-')[1]) + 1 : 1;
    const code = `WO-${nextNum.toString().padStart(3, '0')}`;
    
    console.log(`✅ [ENSURE] Generated WO code: ${code}`);

    // Insert into approved_quotes
    await trx('mes.approved_quotes').insert({
      id: code,
      work_order_code: code,
      quote_id: quoteId,
      production_state: 'Üretim Onayı Bekliyor',
      customer: quote.name || quote.customer || null,
      company: quote.company || null,
      email: quote.email || null,
      phone: quote.phone || null,
      delivery_date: quote.deliveryDate || null,
      price: quote.price ?? quote.calculatedPrice ?? null,
      quote_snapshot: quote,
      created_at: trx.fn.now()
    });

    await trx.commit();
    
    console.log(`✅ [ENSURE] WO successfully created: ${code} for quote ${quoteId}`);
    
    res.json({ success: true, ensured: true, workOrderCode: code });
    
  } catch (error) {
    await trx.rollback();
    console.error('❌ [ENSURE] Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to ensure approved quote',
      details: error.message 
    });
  }
});

// ============================================================================
// MASTER DATA ROUTES
// ============================================================================

// GET /api/mes/master-data - Get available skills and operation types
// ✅ MIGRATED TO SQL - HOTFIX
router.get('/master-data', withAuth, async (req, res) => {
  try {
    const result = await db('mes.settings')
      .where({ key: 'master-data' })
      .first();
    
    if (!result) {
      // Return defaults if no master data exists
      return res.json({
        availableSkills: ['Kaynak', 'Tornalama', 'Freze', 'Montaj'],
        availableOperationTypes: ['İmalat', 'Kontrol', 'Montaj', 'Paketleme'],
        stationEfficiency: 1.0,
        workerEfficiency: 1.0,
        timeSettings: {
          workType: 'fixed',
          laneCount: 1,
          fixedBlocks: {},
          shiftBlocks: {}
        }
      });
    }

    const data = result.value || {};
    // Map legacy field names if present
    if (!data.availableSkills && Array.isArray(data.skills)) {
      data.availableSkills = data.skills;
    }
    if (!data.availableOperationTypes && Array.isArray(data.operationTypes)) {
      data.availableOperationTypes = data.operationTypes;
    }
    // Ensure efficiency defaults
    data.stationEfficiency = data.stationEfficiency ?? 1.0;
    data.workerEfficiency = data.workerEfficiency ?? 1.0;
    // Ensure timeSettings exists with safe defaults
    data.timeSettings = data.timeSettings || { 
      workType: 'fixed', 
      laneCount: 1, 
      fixedBlocks: {}, 
      shiftBlocks: {} 
    };
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching master data:', error);
    res.status(500).json({ error: 'Failed to fetch master data' });
  }
});

// POST /api/mes/master-data
router.post('/master-data', withAuth, async (req, res) => {
  try {
    const { availableSkills, availableOperationTypes, timeSettings, stationEfficiency, workerEfficiency } = req.body || {};
    
    console.log('POST /api/mes/master-data - Received:', { 
      availableSkills, 
      availableOperationTypes, 
      timeSettings,
      stationEfficiency,
      workerEfficiency
    });
    
    const payload = {
      ...(availableSkills ? { availableSkills } : {}),
      ...(availableOperationTypes ? { availableOperationTypes } : {}),
      ...(timeSettings ? { timeSettings } : {}),
      ...(stationEfficiency !== undefined ? { stationEfficiency: parseFloat(stationEfficiency) || 1.0 } : {}),
      ...(workerEfficiency !== undefined ? { workerEfficiency: parseFloat(workerEfficiency) || 1.0 } : {})
    };
    
    console.log('SQL payload to save:', payload);
    
    // Upsert using INSERT ... ON CONFLICT
    await db.raw(`
      INSERT INTO mes.settings (id, key, value, updated_at, updated_by)
      VALUES (?, ?, ?::jsonb, NOW(), ?)
      ON CONFLICT (key) 
      DO UPDATE SET 
        value = EXCLUDED.value,
        updated_at = NOW(),
        updated_by = EXCLUDED.updated_by
    `, ['master-data', 'master-data', JSON.stringify(payload), req.user?.email || 'system']);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating master data:', error);
    res.status(500).json({ error: 'Failed to update master data' });
  }
});

// ============================================================================
// PRODUCTION PLANS
// ============================================================================

/**
 * Validate production plan nodes for completeness and data integrity
 * Ensures all nodes have required fields before plan can be saved
 * 
 * @param {Array} nodes - Array of plan nodes (canonical schema)
 * @returns {Object} { valid: boolean, errors: Array<string> }
 */
function validateProductionPlanNodes(nodes) {
  const errors = [];
  const nodesToValidate = nodes;
  
  if (!Array.isArray(nodesToValidate) || nodesToValidate.length === 0) {
    errors.push('Production plan must have at least one operation node');
    return { valid: false, errors };
  }
  
  // Build predecessor map for starting node detection
  const predecessorMap = new Map();
  nodesToValidate.forEach(node => {
    const nodeId = node.nodeId;
    const preds = node.predecessors || [];
    predecessorMap.set(nodeId, preds);
  });
  
  nodesToValidate.forEach((node, index) => {
    const nodeId = node.nodeId;
    const nodeLabel = `Node ${index + 1} (${nodeId || 'unknown'})`;
    
    // 1. Validate node ID (CANONICAL - required)
    if (!node.nodeId || typeof node.nodeId !== 'string' || node.nodeId.trim() === '') {
      errors.push(`${nodeLabel}: Node id is required and must be a non-empty string`);
    }
    
    // 2. Validate operation name
    if (!node.name || typeof node.name !== 'string' || node.name.trim() === '') {
      errors.push(`${nodeLabel}: Operation name is required`);
    }
    
    // 3. Validate nominalTime (CANONICAL - required)
    const nominalTime = node.nominalTime;
    if (!Number.isFinite(nominalTime) || nominalTime < 1) {
      errors.push(`${nodeLabel}: nominalTime must be a number >= 1 minute`);
    }
    
    // 4. Validate efficiency (CANONICAL - optional)
    if (node.efficiency !== undefined && node.efficiency !== null) {
      const eff = parseFloat(node.efficiency);
      if (!Number.isFinite(eff) || eff <= 0 || eff > 1) {
        errors.push(`${nodeLabel}: efficiency must be between 0.01 and 1.0`);
      }
    }
    
    // 5. Validate assignmentMode and assignedWorkerId (CANONICAL)
    if (node.assignmentMode === 'manual') {
      if (!node.assignedWorkerId || typeof node.assignedWorkerId !== 'string' || node.assignedWorkerId.trim() === '') {
        errors.push(`${nodeLabel}: assignmentMode='manual' requires assignedWorkerId to be present and non-empty`);
      }
    }
    
    // 6. Validate station assignments
    const stations = node.assignedStations || [];
    if (!Array.isArray(stations) || stations.length === 0) {
      errors.push(`${nodeLabel}: At least one work station must be assigned`);
    }
    
    // 7. Validate output quantity
    const outputQty = node.outputQty;
    if (!Number.isFinite(outputQty) || outputQty <= 0) {
      errors.push(`${nodeLabel}: Output quantity must be a number greater than 0`);
    }
    
    // 8. Validate material inputs
    const materials = node.materialInputs || [];
    const materialInputs = node.materialInputs || [];
    const allMaterials = materials.length > 0 ? materials : materialInputs;
    
    // Debug log for material validation
    if (allMaterials.length > 0) {
      console.log(`🔍 ${nodeLabel} materials:`, JSON.stringify(allMaterials, null, 2));
    }
    
    // Check each material has a valid quantity (CANONICAL: requiredQuantity)
    allMaterials.forEach((material, matIndex) => {
      const matQty = material.requiredQuantity;
      console.log(`   Material ${matIndex + 1}: requiredQuantity=${material.requiredQuantity}, resolved=${matQty}`);
      if (!Number.isFinite(matQty) || matQty < 0) {
        errors.push(`${nodeLabel}, Material ${matIndex + 1}: Quantity must be a valid number >= 0`);
      }
    });
    
    // Check starting nodes (no predecessors) have at least one material
    const predecessors = node.predecessors || [];
    const isStartingNode = !Array.isArray(predecessors) || predecessors.length === 0;
    
    if (isStartingNode) {
      // Starting nodes must have at least one non-derived material
      const nonDerivedMaterials = allMaterials.filter(m => !m.derivedFrom);
      
      if (nonDerivedMaterials.length === 0) {
        errors.push(`${nodeLabel}: Starting operations must have at least one material input`);
      }
    }
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================================================
// TEMPLATES
// ============================================================================

// GET /api/mes/templates
router.get('/templates', withAuth, async (req, res) => {
  try {
    const templates = await db('mes.production_plans as p')
      .select(
        'p.id',
        'p.work_order_code',
        'p.quote_id',
        'p.status',
        'p.created_at',
        db.raw('COUNT(pn.id) as node_count')
      )
      .leftJoin('mes.production_plan_nodes as pn', 'pn.plan_id', 'p.id')
      .where('p.status', 'template')
      .groupBy('p.id')
      .orderBy('p.created_at', 'desc');
    
    console.log(`📋 Templates: Found ${templates.length} templates`);
    
    res.json({ templates });
  } catch (error) {
    console.error('❌ Error fetching templates:', error);
    res.status(500).json({ 
      error: 'Failed to fetch templates',
      details: error.message 
    });
  }
});

// POST /api/mes/templates
router.post('/templates', withAuth, async (req, res) => {
  const { workOrderCode, quoteId, nodes } = req.body;
  
  if (!workOrderCode) {
    return res.status(400).json({ error: 'Work order code is required' });
  }
  
  const trx = await db.transaction();
  
  try {
    // 1. Generate plan ID (same ID system as production plans)
    const [{ max_id }] = await trx('mes.production_plans')
      .max('id as max_id');
    const nextNum = max_id ? parseInt(max_id.split('-')[1]) + 1 : 1;
    const planId = `PLAN-${nextNum.toString().padStart(3, '0')}`;
    
    console.log(`📋 Creating template: ${planId}`);
    
    // 2. Create template header - just a plan with status='template'
    await trx('mes.production_plans').insert({
      id: planId,
      work_order_code: workOrderCode,
      quote_id: quoteId || null,
      status: 'template', // Only difference from regular plans
      created_at: trx.fn.now()
    });
    
    // 2. Insert nodes if provided (templates can have pre-defined workflows)
    if (nodes && Array.isArray(nodes) && nodes.length > 0) {
      // Apply output code suffixes for finished products
      const processedNodes = applyOutputCodeSuffixes(nodes);
      
      for (const node of processedNodes) {
        // Insert node
        const [nodeRecord] = await trx('mes.production_plan_nodes')
          .insert({
            plan_id: planId,
            node_id: `${planId}-node-${node.sequenceOrder || node.nodeId}`,
            work_order_code: workOrderCode,
            name: node.name,
            operation_id: node.operationId,
            output_code: node.outputCode,
            output_qty: node.outputQty || 1,
            output_unit: node.outputUnit || 'adet',
            nominal_time: node.nominalTime || 0,
            efficiency: node.efficiency || 0.85,
            effective_time: node.effectiveTime || Math.ceil((node.nominalTime || 0) / (node.efficiency || 0.85)),
            sequence_order: node.sequenceOrder || node.nodeId,
            assignment_mode: node.assignmentMode || 'auto',
            created_at: trx.fn.now()
          })
          .returning('id');
        
        const nodeId = nodeRecord.id;
        
        // Insert material inputs if any
        if (node.materialInputs && node.materialInputs.length > 0) {
          const materialInputs = node.materialInputs.map(m => ({
            node_id: nodeId,
            material_code: m.materialCode,
            required_quantity: m.requiredQuantity,
            unit_ratio: m.unitRatio || 1.0,
            is_derived: m.isDerived || false,
            created_at: trx.fn.now()
          }));
          
          await trx('mes.node_material_inputs').insert(materialInputs);
        }
        
        // Insert station assignments if any
        if (node.stationIds && node.stationIds.length > 0) {
          const stationAssignments = node.stationIds.map((stId, idx) => ({
            node_id: nodeId,
            station_id: stId,
            priority: idx + 1,
            created_at: trx.fn.now()
          }));
          
          await trx('mes.node_stations').insert(stationAssignments);
        }
      }
    }
    
    await trx.commit();
    
    console.log(`✅ Template created: ${planId}${nodes ? ` with ${nodes.length} nodes` : ''}`);
    
    res.json({ 
      success: true, 
      id: planId,
      nodeCount: nodes ? nodes.length : 0,
      message: `Template ${planId} created successfully`
    });
    
  } catch (error) {
    await trx.rollback();
    
    // Handle duplicate key error
    if (error.code === '23505') { // PostgreSQL unique violation
      return res.status(409).json({ 
        error: 'Template with this work order code already exists',
        workOrderCode
      });
    }
    
    console.error('❌ Error creating template:', error);
    res.status(500).json({ 
      error: 'Failed to create template',
      details: error.message 
    });
  }
});

// DELETE /api/mes/templates/:id
router.delete('/templates/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Verify it's a template before deleting
    const [template] = await db('mes.production_plans')
      .where({ id, status: 'template' })
      .select('id');
    
    if (!template) {
      return res.status(404).json({ 
        error: 'Template not found or not a template' 
      });
    }
    
    // Delete template (CASCADE will delete related nodes)
    await db('mes.production_plans')
      .where({ id })
      .delete();
    
    console.log(`✅ Template deleted: ${id}`);
    
    res.json({ 
      success: true, 
      id,
      message: `Template ${id} deleted successfully`
    });
    
  } catch (error) {
    console.error('❌ Error deleting template:', error);
    res.status(500).json({ 
      error: 'Failed to delete template',
      details: error.message 
    });
  }
});

// ============================================================================
// MATERIALS ROUTES
// ============================================================================
// All materials are now stored in the unified 'materials' collection.
router.get('/materials', withAuth, async (req, res) => {
  try {
    const materials = await db('materials.materials')
      .select('*')
      .orderBy('name');
    
    res.json({ materials });
  } catch (error) {
    console.error('❌ Materials GET Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch materials',
      details: error.message 
    });
  }
});

// POST /api/mes/materials/check-availability - Check material availability for production plan
router.post('/materials/check-availability', withAuth, async (req, res) => {
  try {
    const { materials: requiredMaterials } = req.body;
    
    if (!Array.isArray(requiredMaterials)) {
      return res.status(400).json({ error: 'Required materials must be an array' });
    }

    // Fetch all materials from PostgreSQL
    const allMaterials = await db('materials.materials').select('*');
    
    // Build lookup map by code, id (auto-increment), and name
    const materialStockMap = new Map();
    
    allMaterials.forEach(mat => {
      const stock = parseFloat(mat.stock) || 0;
      const reserved = parseFloat(mat.reserved) || 0;
      const wipReserved = parseFloat(mat.wip_reserved) || 0;
      const available = stock - reserved - wipReserved;
      const code = mat.code;
      
      // Add to map with multiple keys for flexible lookup
      if (code) materialStockMap.set(code.toLowerCase(), { ...mat, code, stock: available });
      if (mat.id) materialStockMap.set(mat.id.toString().toLowerCase(), { ...mat, code, stock: available });
      if (mat.name) materialStockMap.set(mat.name.toLowerCase(), { ...mat, code, stock: available });
    });

    // Check each required material
    const materialChecks = requiredMaterials.map(required => {
      const requiredQty = parseFloat(required.required) || 0;
      
      // Try to find material by code, then id, then name
      let material = null;
      const searchKeys = [
        required.code?.toLowerCase(),
        required.id?.toString().toLowerCase(),
        required.name?.toLowerCase()
      ].filter(Boolean);
      
      for (const key of searchKeys) {
        if (materialStockMap.has(key)) {
          material = materialStockMap.get(key);
          break;
        }
      }
      
      const availableQty = material ? material.stock : 0;
      const shortage = Math.max(0, requiredQty - availableQty);
      const isAvailable = shortage === 0;
      const canReserve = material && isAvailable;
      
      return {
        code: required.code || material?.code || required.id || '',
        name: required.name || material?.name || '',
        id: required.id || material?.id || '',
        required: requiredQty,
        available: availableQty,
        unit: required.unit || material?.unit || 'pcs',
        isAvailable,
        shortage,
        status: isAvailable ? 'ok' : 'shortage',
        canReserve
      };
    });

    const allAvailable = materialChecks.every(check => check.isAvailable);
    const shortages = materialChecks.filter(check => !check.isAvailable);
    const canReserveAll = materialChecks.every(check => check.canReserve);

    console.log(`🔍 Materials Availability: ${materialChecks.length} checked, ${shortages.length} shortages`);

    res.json({
      allAvailable,
      canReserveAll,
      materials: materialChecks,
      shortages,
      totalShortageItems: shortages.length,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Materials Check-Availability Error:', error);
    res.status(500).json({ 
      error: 'Failed to check material availability',
      details: error.message 
    });
  }
});

// PATCH /api/mes/approved-quotes/:workOrderCode/production-state
router.patch('/approved-quotes/:workOrderCode/production-state', withAuth, async (req, res) => {
  try {
    const { workOrderCode } = req.params;
    const { productionState } = req.body || {};
    
    if (!workOrderCode) {
      return res.status(400).json({ error: 'workOrderCode_required' });
    }
    
    if (!productionState) {
      return res.status(400).json({ error: 'productionState_required' });
    }
    
    // Validate production state
    const validStates = [
      'Üretim Onayı Bekliyor',
      'Üretiliyor',
      'Üretim Durduruldu', 
      'Üretim Tamamlandı',
      'İptal Edildi'
    ];
    
    if (!validStates.includes(productionState)) {
      return res.status(400).json({ error: 'invalid_production_state' });
    }
    
    // Find and update approved quote
    const [approvedQuote] = await db('mes.approved_quotes')
      .where({ work_order_code: workOrderCode })
      .select('id', 'production_state', 'production_state_history');
    
    if (!approvedQuote) {
      return res.status(404).json({ 
        error: `${workOrderCode} için onaylı teklif bulunamadı. Quotes ekranından bu work order'ı oluşturup tekrar deneyin.`,
        code: 'approved_quote_not_found'
      });
    }
    
    // Build history entry
    const historyEntry = {
      state: productionState,
      timestamp: new Date().toISOString(),
      updatedBy: req.user?.email || 'system'
    };
    
    // Append to history array (PostgreSQL jsonb append)
    const currentHistory = approvedQuote.production_state_history || [];
    const updatedHistory = [...currentHistory, historyEntry];
    
    // Update production state
    await db('mes.approved_quotes')
      .where({ work_order_code: workOrderCode })
      .update({
        production_state: productionState,
        production_state_updated_at: db.fn.now(),
        production_state_updated_by: req.user?.email || 'system',
        production_state_history: JSON.stringify(updatedHistory),
        updated_at: db.fn.now()
      });
    
    console.log(`✅ Production state updated: ${workOrderCode} → ${productionState}`);
    
    res.json({
      success: true,
      workOrderCode,
      productionState,
      updatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error updating production state:', error);
    res.status(500).json({ 
      error: 'Failed to update production state',
      details: error.message 
    });
  }
});

// ============================================================================
// WORKER ASSIGNMENTS ROUTES - ✅ MIGRATED TO SQL (STEP 8)
// ============================================================================
// NOTE: Assignments are created by production-plans/:planId/launch endpoint
// These endpoints manage existing assignments (view, start, complete)

// GET /api/mes/worker-assignments - Get all active assignments (supervisor dashboard)
// ✅ MIGRATED TO SQL - STEP 8
router.get('/worker-assignments', withAuth, async (req, res) => {
  try {
    const result = await db('mes.worker_assignments as wa')
      .select(
        'wa.*',
        'w.name as worker_name',
        's.name as substation_name',
        'o.name as operation_name',
        'p.id as plan_id',
        'pn.name as node_name'
      )
      .join('mes.workers as w', 'w.id', 'wa.worker_id')
      .join('mes.substations as s', 's.id', 'wa.substation_id')
      .join('mes.operations as o', 'o.id', 'wa.operation_id')
      .join('mes.production_plans as p', 'p.id', 'wa.plan_id')
      .join('mes.production_plan_nodes as pn', 'pn.id', 'wa.node_id')
      .whereIn('wa.status', ['pending', 'in_progress', 'queued'])
      .orderBy('wa.estimated_start_time', 'asc');
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching worker assignments:', error);
    res.status(500).json({ error: 'Failed to fetch worker assignments' });
  }
});

// GET /api/mes/worker-assignments/:workerId - Get assignments for specific worker
// ✅ MIGRATED TO SQL - STEP 8
router.get('/worker-assignments/:workerId', withAuth, async (req, res) => {
  const { workerId } = req.params;
  
  try {
    const result = await db('mes.worker_assignments as wa')
      .select(
        'wa.*',
        's.name as substation_name',
        'o.name as operation_name',
        'p.id as plan_id',
        'pn.name as node_name',
        'pn.output_code',
        'pn.output_qty as node_quantity'
      )
      .join('mes.substations as s', 's.id', 'wa.substation_id')
      .join('mes.operations as o', 'o.id', 'wa.operation_id')
      .join('mes.production_plans as p', 'p.id', 'wa.plan_id')
      .join('mes.production_plan_nodes as pn', 'pn.id', 'wa.node_id')
      .where('wa.worker_id', workerId)
      .whereIn('wa.status', ['pending', 'in_progress', 'queued'])
      .orderBy('wa.sequence_number', 'asc');
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching worker assignments:', error);
    res.status(500).json({ error: 'Failed to fetch worker assignments' });
  }
});

// POST /api/mes/worker-assignments/:id/start
router.post('/worker-assignments/:id/start', withAuth, async (req, res) => {
  const { id } = req.params;
  
  const trx = await db.transaction();
  try {
    // Get assignment details
    const [assignment] = await trx('mes.worker_assignments')
      .where({ id })
      .select('*');
    
    if (!assignment) {
      await trx.rollback();
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    // Verify status is pending
    if (assignment.status !== 'pending') {
      await trx.rollback();
      return res.status(400).json({ 
        error: `Cannot start assignment with status ${assignment.status}` 
      });
    }
    
    // Update assignment to in_progress
    await trx('mes.worker_assignments')
      .where({ id })
      .update({
        status: 'in_progress',
        started_at: trx.fn.now()
      });
    
    // Update substation status
    await trx('mes.substations')
      .where({ id: assignment.substation_id })
      .update({
        status: 'in_use',
        current_assignment_id: id,
        updated_at: trx.fn.now()
      });
    
    // Update node status
    await trx('mes.production_plan_nodes')
      .where({ id: assignment.node_id })
      .update({
        status: 'in_progress',
        started_at: trx.fn.now()
      });
    
    await trx.commit();
    
    res.json({ 
      success: true, 
      id,
      status: 'in_progress',
      startedAt: new Date()
    });
  } catch (error) {
    await trx.rollback();
    console.error('Error starting assignment:', error);
    res.status(500).json({ error: 'Failed to start assignment' });
  }
});

// POST /api/mes/worker-assignments/:id/complete
router.post('/worker-assignments/:id/complete', withAuth, async (req, res) => {
  const { id } = req.params;
  const { actualQuantity, notes } = req.body;
  
  const trx = await db.transaction();
  try {
    // Get assignment details
    const [assignment] = await trx('mes.worker_assignments')
      .where({ id })
      .select('*');
    
    if (!assignment) {
      await trx.rollback();
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    // Verify status is in_progress
    if (assignment.status !== 'in_progress') {
      await trx.rollback();
      return res.status(400).json({ 
        error: `Cannot complete assignment with status ${assignment.status}` 
      });
    }
    
    // Update assignment to completed
    await trx('mes.worker_assignments')
      .where({ id })
      .update({
        status: 'completed',
        completed_at: trx.fn.now(),
        actual_quantity: actualQuantity,
        notes: notes
      });
    
    // Free substation
    await trx('mes.substations')
      .where({ id: assignment.substation_id })
      .update({
        status: 'available',
        current_assignment_id: null,
        updated_at: trx.fn.now()
      });
    
    // Update node status
    await trx('mes.production_plan_nodes')
      .where({ id: assignment.node_id })
      .update({
        status: 'completed',
        completed_at: trx.fn.now(),
        actual_quantity: actualQuantity
      });
    
    // Activate next queued task for this worker (if any)
    const [nextQueued] = await trx('mes.worker_assignments')
      .where({
        worker_id: assignment.worker_id,
        status: 'queued'
      })
      .orderBy('sequence_number', 'asc')
      .limit(1);
    
    if (nextQueued) {
      await trx('mes.worker_assignments')
        .where({ id: nextQueued.id })
        .update({
          status: 'pending'
        });
    }
    
    // TODO: Create WIP output record (lot tracking)
    // This will be implemented in materials management phase
    
    await trx.commit();
    
    res.json({ 
      success: true, 
      id,
      status: 'completed',
      completedAt: new Date()
    });
  } catch (error) {
    await trx.rollback();
    console.error('Error completing assignment:', error);
    res.status(500).json({ error: 'Failed to complete assignment' });
  }
});

// ============================================================================
// SCRAP MANAGEMENT
// ============================================================================

// POST /api/mes/work-packages/:id/scrap
router.post('/work-packages/:id/scrap', withAuth, async (req, res) => {
  const { id: assignmentId } = req.params;
  const { scrapType, entry } = req.body;
  
  // Validate scrap type
  const validTypes = ['input_damaged', 'production_scrap', 'output_scrap'];
  if (!validTypes.includes(scrapType)) {
    return res.status(400).json({ error: 'Invalid scrap type' });
  }
  
  // Validate entry
  if (!entry || !entry.materialCode || !entry.quantity || entry.quantity <= 0) {
    return res.status(400).json({ error: 'Invalid scrap entry' });
  }
  
  try {
    // Get current assignment
    const [assignment] = await db('mes.worker_assignments')
      .where({ id: assignmentId })
      .select('status', 'input_scrap_count', 'production_scrap_count', 'defect_quantity');
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    // Check if task is in progress or just completed
    if (assignment.status !== 'in_progress' && assignment.status !== 'completed') {
      return res.status(400).json({ 
        error: 'Task must be in progress or completed to record scrap' 
      });
    }
    
    // Update appropriate counter (JSONB)
    const updateData = {};
    
    if (scrapType === 'input_damaged') {
      const current = assignment.input_scrap_count || {};
      current[entry.materialCode] = (current[entry.materialCode] || 0) + entry.quantity;
      updateData.input_scrap_count = current;
      
    } else if (scrapType === 'production_scrap') {
      const current = assignment.production_scrap_count || {};
      current[entry.materialCode] = (current[entry.materialCode] || 0) + entry.quantity;
      updateData.production_scrap_count = current;
      
    } else if (scrapType === 'output_scrap') {
      updateData.defect_quantity = (assignment.defect_quantity || 0) + entry.quantity;
    }
    
    await db('mes.worker_assignments')
      .where({ id: assignmentId })
      .update(updateData);
    
    console.log(`✅ Scrap counter updated for assignment ${assignmentId}: ${scrapType}, +${entry.quantity} ${entry.materialCode}`);
    
    res.json({
      success: true,
      assignmentId,
      scrapType,
      materialCode: entry.materialCode,
      quantity: entry.quantity,
      operation: 'increment'
    });
    
  } catch (error) {
    console.error('Error recording scrap:', error);
    res.status(500).json({ error: 'Failed to record scrap' });
  }
});

// GET /api/mes/work-packages/:id/scrap
router.get('/work-packages/:id/scrap', withAuth, async (req, res) => {
  const { id: assignmentId } = req.params;
  
  try {
    const [assignment] = await db('mes.worker_assignments')
      .where({ id: assignmentId })
      .select('input_scrap_count', 'production_scrap_count', 'defect_quantity', 'status');
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    res.json({
      assignmentId,
      inputScrapCounters: assignment.input_scrap_count || {},
      productionScrapCounters: assignment.production_scrap_count || {},
      defectQuantity: assignment.defect_quantity || 0,
      status: assignment.status
    });
    
  } catch (error) {
    console.error('Error fetching scrap:', error);
    res.status(500).json({ error: 'Failed to fetch scrap counters' });
  }
});

// DELETE /api/mes/work-packages/:id/scrap/:scrapType/:materialCode/:quantity
router.delete('/work-packages/:id/scrap/:scrapType/:materialCode/:quantity', withAuth, async (req, res) => {
  const { id: assignmentId, scrapType, materialCode, quantity } = req.params;
  const decrementAmount = parseFloat(quantity);
  
  if (isNaN(decrementAmount) || decrementAmount <= 0) {
    return res.status(400).json({ error: 'Invalid quantity' });
  }
  
  const validTypes = ['input_damaged', 'production_scrap', 'output_scrap'];
  if (!validTypes.includes(scrapType)) {
    return res.status(400).json({ error: 'Invalid scrap type' });
  }
  
  try {
    const [assignment] = await db('mes.worker_assignments')
      .where({ id: assignmentId })
      .select('input_scrap_count', 'production_scrap_count', 'defect_quantity');
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    const updateData = {};
    
    if (scrapType === 'input_damaged') {
      const current = assignment.input_scrap_count || {};
      current[materialCode] = Math.max(0, (current[materialCode] || 0) - decrementAmount);
      updateData.input_scrap_count = current;
      
    } else if (scrapType === 'production_scrap') {
      const current = assignment.production_scrap_count || {};
      current[materialCode] = Math.max(0, (current[materialCode] || 0) - decrementAmount);
      updateData.production_scrap_count = current;
      
    } else if (scrapType === 'output_scrap') {
      updateData.defect_quantity = Math.max(0, (assignment.defect_quantity || 0) - decrementAmount);
    }
    
    await db('mes.worker_assignments')
      .where({ id: assignmentId })
      .update(updateData);
    
    console.log(`✅ Scrap counter decreased for assignment ${assignmentId}: ${scrapType}, -${decrementAmount} ${materialCode}`);
    
    res.json({
      success: true,
      assignmentId,
      scrapType,
      materialCode,
      decrementAmount,
      operation: 'decrement'
    });
    
  } catch (error) {
    console.error('Error decreasing scrap:', error);
    res.status(500).json({ error: 'Failed to decrease scrap counter' });
  }
});

// ============================================================================
// ALERTS
// ============================================================================

// GET /api/mes/alerts
router.get('/alerts', withAuth, async (req, res) => {
  try {
    const { type, status, limit } = req.query;
    
    let query = db('mes.alerts')
      .select(
        'id',
        'type',
        'severity',
        'title',
        'message',
        'metadata',
        'is_read',
        'is_resolved',
        'created_at',
        'resolved_at',
        'resolved_by'
      );
    
    // Apply filters
    if (type) {
      query = query.where('type', type);
    }
    
    if (status) {
      // Map status to is_resolved/is_read flags
      if (status === 'active') {
        query = query.where('is_resolved', false);
      } else if (status === 'resolved') {
        query = query.where('is_resolved', true);
      }
    }
    
    // Order by most recent
    query = query.orderBy('created_at', 'desc');
    
    // Apply limit
    if (limit) {
      const limitNum = parseInt(limit, 10);
      if (!isNaN(limitNum) && limitNum > 0) {
        query = query.limit(limitNum);
      }
    }
    
    const alerts = await query;
    
    console.log(`📢 Alerts: Found ${alerts.length} alerts`);
    
    res.json({ alerts });
  } catch (error) {
    console.error('❌ Error fetching alerts:', error);
    res.status(500).json({ 
      error: 'Failed to fetch alerts',
      details: error.message,
      alerts: [] // Return empty array as fallback
    });
  }
});

// ============================================================================
// SUB-STATIONS
// ============================================================================

// GET /api/mes/substations
router.get('/substations', withAuth, async (req, res) => {
  try {
    const { stationId } = req.query;
    
    let query = db('mes.substations')
      .select(
        'id',
        'name',
        'station_id',
        'description',
        'is_active',
        'created_at',
        'updated_at'
      )
      .where('is_active', true);
    
    // Optional filter by station
    if (stationId) {
      query = query.where('station_id', stationId);
    }
    
    const substations = await query.orderBy('id');
    
    res.json(substations);
  } catch (error) {
    console.error('Error fetching substations:', error);
    res.status(500).json({ error: 'Failed to fetch substations' });
  }
});

// POST /api/mes/substations - Create new substation (SQL)
// ID Format: ST-XXX-XXX-XX (örn: ST-Ar-001-01, ST-Ka-002-01)
router.post('/substations', withAuth, async (req, res) => {
  const { name, station_id, description } = req.body;
  
  if (!name || !station_id) {
    return res.status(400).json({ error: 'Name and station_id are required' });
  }
  
  try {
    // Get station info for code prefix
    const station = await db('mes.stations')
      .select('id', 'substations')
      .where('id', station_id)
      .first();
    
    if (!station) {
      return res.status(404).json({ error: 'Station not found' });
    }
    
    // Parse station code (ST-Ar-001 → Ar-001)
    const stationCode = station_id.replace('ST-', '');
    
    // Count existing substations for this station
    const existingCount = await db('mes.substations')
      .where('station_id', station_id)
      .count('* as count');
    
    const nextNum = parseInt(existingCount[0].count) + 1;
    const newId = `ST-${stationCode}-${nextNum.toString().padStart(2, '0')}`;
    
    // Insert substation
    const result = await db('mes.substations')
      .insert({
        id: newId,
        name,
        station_id,
        description,
        is_active: true,
        created_at: db.fn.now(),
        updated_at: db.fn.now()
      })
      .returning('*');
    
    // Update station's substations array
    const currentSubstations = station.substations || [];
    await db('mes.stations')
      .where('id', station_id)
      .update({
        substations: JSON.stringify([...currentSubstations, newId]),
        updated_at: db.fn.now()
      });
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error creating substation:', error);
    res.status(500).json({ error: 'Failed to create substation', details: error.message });
  }
});

// POST /api/mes/substations/reset-all - Reset all substations (SQL - simplified for Phase 1)
router.post('/substations/reset-all', withAuth, async (req, res) => {
  try {
    console.log('🔧 Resetting all substations to active state...');
    
    // Simple reset: ensure all substations are active
    const result = await db('mes.substations')
      .update({
        is_active: true,
        updated_at: db.fn.now()
      })
      .returning('id');
    
    const resetCount = result.length;
    
    console.log(`✅ Reset complete: ${resetCount} substation(s) set to active`);
    
    res.json({
      success: true,
      resetCount,
      message: `${resetCount} alt istasyon sıfırlandı`
    });
  } catch (error) {
    console.error('Error resetting substations:', error);
    res.status(500).json({ error: 'Failed to reset substations' });
  }
});

// PATCH /api/mes/substations/:id - Update substation (SQL)
// Soft delete (is_active=false) also removes from station's substations array
router.patch('/substations/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  const { name, description, station_id, is_active } = req.body;
  
  try {
    // Get current substation to know which station it belongs to
    const currentSubstation = await db('mes.substations')
      .select('station_id', 'is_active')
      .where({ id })
      .first();
    
    if (!currentSubstation) {
      return res.status(404).json({ error: 'Substation not found' });
    }
    
    const updateData = {
      updated_at: db.fn.now()
    };
    
    // Only update provided fields
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (station_id !== undefined) updateData.station_id = station_id;
    if (is_active !== undefined) updateData.is_active = is_active;
    
    const result = await db('mes.substations')
      .where({ id })
      .update(updateData)
      .returning('*');
    
    // If soft deleting (is_active=false), remove from station's substations array
    if (is_active === false && currentSubstation.is_active === true) {
      const station = await db('mes.stations')
        .select('substations')
        .where('id', currentSubstation.station_id)
        .first();
      
      if (station && station.substations) {
        const updatedSubstations = (station.substations || []).filter(subId => subId !== id);
        await db('mes.stations')
          .where('id', currentSubstation.station_id)
          .update({
            substations: JSON.stringify(updatedSubstations),
            updated_at: db.fn.now()
          });
      }
    }
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error updating substation:', error);
    res.status(500).json({ error: 'Failed to update substation' });
  }
});

// GET /api/mes/substations/:id/details - Get detailed info about a substation
router.get('/substations/:id/details', withAuth, async (req, res) => {
  const { id } = req.params; // This is the substation code like "ST-Cu-001-1"
  
  try {
    // Substations are stored in stations.substations JSONB column
    // Extract station_id from substation code (e.g., "ST-Cu-001-1" -> "ST-Cu-001")
    const parts = id.split('-');
    if (parts.length < 4) {
      return res.status(400).json({ error: 'Invalid substation code format' });
    }
    
    // Rebuild station ID from first 3 parts
    const stationId = parts.slice(0, 3).join('-');
    
    // Get station with substations
    const station = await db('mes.stations')
      .select('id', 'name', 'substations')
      .where('id', stationId)
      .first();
    
    if (!station) {
      return res.status(404).json({ error: 'Station not found for substation' });
    }

    // Find the specific substation in the JSONB array
    const substations = station.substations || [];
    const substation = substations.find(s => s.code === id);
    
    if (!substation) {
      return res.status(404).json({ error: 'Substation not found' });
    }

    // Return substation details
    // For now, return basic info - task assignments would need separate implementation
    res.json({
      substation: {
        id: substation.code,
        code: substation.code,
        stationId: station.id,
        station_name: station.name,
        status: substation.status || 'active',
        description: null,
        is_active: substation.status === 'active',
        created_at: null,
        updated_at: null
      },
      currentTask: null,
      upcomingTasks: [],
      performance: {
        totalCompleted: 0,
        avgCompletionTime: 0,
        onTimeRate: 0,
        defectRate: 0
      }
    });
  } catch (error) {
    console.error('Error fetching substation details:', error);
    res.status(500).json({ error: 'Failed to fetch substation details' });
  }
});

// ============================================================================
// PRODUCTION PLAN LAUNCH ENDPOINT
// ============================================================================

/**
 * POST /api/mes/production-plans/:planId/launch
 * Launch a production plan with auto-assignment engine
 * 
 * Input: { workOrderCode }
 * - Validates approved quote exists and plan is ready
 * - Runs auto-assignment engine for all nodes
 * - Creates worker assignments
 * - Updates plan and quote status
 * 
// ============================================================================
// HELPER FUNCTIONS FOR LAUNCH ENDPOINT
// ============================================================================

/**
 * Build topological order from node predecessors
 * Detects cycles and validates prerequisites
 * Expects canonical schema: node.nodeId (not node.id)
 */
function buildTopologicalOrder(nodes) {
  // Use nodeId directly - no normalization needed
  const normalizedNodes = nodes.map(n => ({
    ...n,
    _id: n.nodeId
  }));
  
  const nodeMap = new Map(normalizedNodes.map(n => [n._id, n]));
  const inDegree = new Map();
  const adjacencyList = new Map();
  
  // Initialize
  normalizedNodes.forEach(node => {
    inDegree.set(node._id, 0);
    adjacencyList.set(node._id, []);
  });
  
  // Build graph
  normalizedNodes.forEach(node => {
    const predecessors = node.predecessors || [];
    
    // Validate all predecessors exist
    for (const predId of predecessors) {
      if (!nodeMap.has(predId)) {
        return {
          error: `Invalid predecessor: Node ${node._id} references non-existent predecessor ${predId}`,
          details: { nodeId: node._id, missingPredecessor: predId }
        };
      }
      
      // Add edge from predecessor to this node
      adjacencyList.get(predId).push(node._id);
      inDegree.set(node._id, inDegree.get(node._id) + 1);
    }
  });
  
  // Kahn's algorithm for topological sort
  const queue = [];
  const order = [];
  
  // Start with nodes that have no predecessors
  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) {
      queue.push(nodeId);
    }
  });
  
  while (queue.length > 0) {
    const nodeId = queue.shift();
    order.push(nodeId);
    
    // Process successors
    const successors = adjacencyList.get(nodeId) || [];
    for (const successorId of successors) {
      const newDegree = inDegree.get(successorId) - 1;
      inDegree.set(successorId, newDegree);
      
      if (newDegree === 0) {
        queue.push(successorId);
      }
    }
  }
  
  // Check for cycles
  if (order.length !== normalizedNodes.length) {
    const remaining = normalizedNodes.filter(n => !order.includes(n._id)).map(n => n._id);
    return {
      error: 'Cycle detected in execution graph',
      details: { remainingNodes: remaining }
    };
  }
  
  return { order, success: true };
}


/**
 * Helper function: Adjust start time to next valid work block
 * If startTime falls within a break or outside schedule, move it to next work block
 * 
 * @param {Date} startTime - Proposed start time
 * @param {Array} scheduleBlocks - Array of { type: 'work'|'break', start: 'HH:MM', end: 'HH:MM' }
 * @returns {Date} - Adjusted start time
 */
function adjustStartTimeForSchedule(startTime, scheduleBlocks) {
  if (!scheduleBlocks || scheduleBlocks.length === 0) {
    return startTime; // No schedule constraints
  }
  
  const hour = startTime.getHours();
  const minute = startTime.getMinutes();
  const timeInMinutes = hour * 60 + minute;
  
  // Find if current time is within a work block
  for (const block of scheduleBlocks) {
    if (block.type !== 'work' || !block.start || !block.end) continue;
    
    const [startHour, startMin] = block.start.split(':').map(Number);
    const [endHour, endMin] = block.end.split(':').map(Number);
    const blockStart = startHour * 60 + startMin;
    const blockEnd = endHour * 60 + endMin;
    
    // If within work block, use as-is
    if (timeInMinutes >= blockStart && timeInMinutes < blockEnd) {
      return startTime;
    }
  }
  
  // Not in a work block - find next work block
  const workBlocks = scheduleBlocks
    .filter(b => b.type === 'work' && b.start && b.end)
    .map(b => {
      const [startHour, startMin] = b.start.split(':').map(Number);
      return {
        startMinutes: startHour * 60 + startMin,
        startHour,
        startMin
      };
    })
    .sort((a, b) => a.startMinutes - b.startMinutes);
  
  // Find first work block after current time
  for (const wb of workBlocks) {
    if (wb.startMinutes > timeInMinutes) {
      const adjusted = new Date(startTime);
      adjusted.setHours(wb.startHour, wb.startMin, 0, 0);
      return adjusted;
    }
  }
  
  // All work blocks are before current time - move to next day's first work block
  if (workBlocks.length > 0) {
    const nextDay = new Date(startTime);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(workBlocks[0].startHour, workBlocks[0].startMin, 0, 0);
    return nextDay;
  }
  
  // No work blocks defined - return original time
  return startTime;
}

/**
 * Get default work schedule for a given day
 * Used when worker has no personalSchedule or personalSchedule.blocks is empty
 * 
 * @param {string} dayName - Day name (lowercase: monday, tuesday, etc.)
 * @returns {Array} - Array of schedule blocks: [{ type: 'work'|'break', start: 'HH:MM', end: 'HH:MM' }]
 */
function getDefaultWorkSchedule(dayName) {
  const defaultSchedules = {
    monday: [
      { type: 'work', start: '08:00', end: '12:00' },
      { type: 'break', start: '12:00', end: '13:00' },
      { type: 'work', start: '13:00', end: '17:00' }
    ],
    tuesday: [
      { type: 'work', start: '08:00', end: '12:00' },
      { type: 'break', start: '12:00', end: '13:00' },
      { type: 'work', start: '13:00', end: '17:00' }
    ],
    wednesday: [
      { type: 'work', start: '08:00', end: '12:00' },
      { type: 'break', start: '12:00', end: '13:00' },
      { type: 'work', start: '13:00', end: '17:00' }
    ],
    thursday: [
      { type: 'work', start: '08:00', end: '12:00' },
      { type: 'break', start: '12:00', end: '13:00' },
      { type: 'work', start: '13:00', end: '17:00' }
    ],
    friday: [
      { type: 'work', start: '08:00', end: '12:00' },
      { type: 'break', start: '12:00', end: '13:00' },
      { type: 'work', start: '13:00', end: '16:00' }
    ],
    saturday: [],  // Hafta sonu çalışmıyor
    sunday: []     // Hafta sonu çalışmıyor
  };
  
  return defaultSchedules[dayName.toLowerCase()] || [];
}

/**
 * Helper function: Calculate end time considering breaks and work schedule
 * Skips break periods and non-work hours when calculating task duration
 * 
 * @param {Date} startTime - Task start time (must be in a work block)
 * @param {number} durationInMinutes - Net work time required
 * @param {Array} scheduleBlocks - Array of { type: 'work'|'break', start: 'HH:MM', end: 'HH:MM' }
 * @returns {Date} - Actual end time considering breaks
 */
function calculateEndTimeWithBreaks(startTime, durationInMinutes, scheduleBlocks) {
  if (!scheduleBlocks || scheduleBlocks.length === 0) {
    // No schedule constraints - simple addition
    return new Date(startTime.getTime() + durationInMinutes * 60000);
  }
  
  let remainingDuration = durationInMinutes;
  let currentTime = new Date(startTime);
  
  // Get work blocks sorted by start time
  const workBlocks = scheduleBlocks
    .filter(b => b.type === 'work' && b.start && b.end)
    .map(b => {
      const [startHour, startMin] = b.start.split(':').map(Number);
      const [endHour, endMin] = b.end.split(':').map(Number);
      return {
        startHour,
        startMin,
        endHour,
        endMin,
        startMinutes: startHour * 60 + startMin,
        endMinutes: endHour * 60 + endMin
      };
    })
    .sort((a, b) => a.startMinutes - b.startMinutes);
  
  if (workBlocks.length === 0) {
    // No work blocks - simple addition
    return new Date(startTime.getTime() + durationInMinutes * 60000);
  }
  
  // Iterate through work blocks until duration is consumed
  while (remainingDuration > 0) {
    const hour = currentTime.getHours();
    const minute = currentTime.getMinutes();
    const currentMinutes = hour * 60 + minute;
    
    // Find current or next work block
    let currentBlock = null;
    let nextBlock = null;
    
    for (const wb of workBlocks) {
      if (currentMinutes >= wb.startMinutes && currentMinutes < wb.endMinutes) {
        currentBlock = wb;
        break;
      } else if (currentMinutes < wb.startMinutes) {
        nextBlock = wb;
        break;
      }
    }
    
    if (currentBlock) {
      // We're in a work block - calculate how much time we can work here
      const blockEndMinutes = currentBlock.endMinutes;
      const workableMinutes = blockEndMinutes - currentMinutes;
      
      if (remainingDuration <= workableMinutes) {
        // Task finishes in this block
        currentTime = new Date(currentTime.getTime() + remainingDuration * 60000);
        remainingDuration = 0;
      } else {
        // Task continues beyond this block
        remainingDuration -= workableMinutes;
        // Move to end of this block
        currentTime.setHours(currentBlock.endHour, currentBlock.endMin, 0, 0);
        
        // Find next work block
        const nextBlockIndex = workBlocks.findIndex(wb => wb.startMinutes > currentBlock.endMinutes);
        if (nextBlockIndex === -1) {
          // No more work blocks today - move to next day's first block
          currentTime.setDate(currentTime.getDate() + 1);
          currentTime.setHours(workBlocks[0].startHour, workBlocks[0].startMin, 0, 0);
        } else {
          // Move to next work block
          const nextWb = workBlocks[nextBlockIndex];
          currentTime.setHours(nextWb.startHour, nextWb.startMin, 0, 0);
        }
      }
    } else if (nextBlock) {
      // We're in a break or before schedule - jump to next work block
      currentTime.setHours(nextBlock.startHour, nextBlock.startMin, 0, 0);
    } else {
      // Past all work blocks today - move to next day's first block
      currentTime.setDate(currentTime.getDate() + 1);
      currentTime.setHours(workBlocks[0].startHour, workBlocks[0].startMin, 0, 0);
    }
  }
  
  return currentTime;
}

/**
 * Assign worker, station, and substation to a node using auto-assignment rules
 * Now respects predecessor dependencies for scheduling
 */
router.get('/work-packages', withAuth, async (req, res) => {
  try {
    const { status, workerId, stationId, limit } = req.query;
    const maxResults = Math.min(parseInt(limit) || 100, 500);
    
    // Build query with filters
    let query = db('mes.worker_assignments as wa')
      .select(
        // Assignment core
        'wa.id',
        'wa.node_id',
        'wa.operation_id',
        'wa.status',
        'wa.priority',
        'wa.is_urgent',
        'wa.sequence_number',
        
        // Worker data
        'wa.worker_id',
        'w.name as worker_name',
        'w.skills as worker_skills',
        
        // Station/Substation data
        'wa.station_id',
        'st.name as station_name',
        'wa.substation_id',
        's.name as substation_name',
        
        // Operation data
        'o.name as operation_name',
        
        // Plan data
        'wa.plan_id',
        'pn.name as node_name',
        'pn.output_code',
        'pn.output_qty as node_quantity',
        
        // Work order data
        'wa.work_order_code',
        'qq.customer_name as customer',
        db.raw('NULL as product_name'), // TODO: Get from quote_items or form_data
        
        // Timing
        'wa.estimated_start_time as expected_start',
        'wa.estimated_end_time as planned_end',
        'wa.started_at as actual_start',
        'wa.completed_at as actual_end',
        
        // Material data
        'wa.materials as material_inputs',
        'wa.pre_production_reserved_amount',
        'wa.actual_reserved_amounts',
        'wa.material_reservation_status',
        
        // Scrap tracking
        'wa.input_scrap_count',
        'wa.production_scrap_count',
        'wa.defect_quantity',
        
        // Metadata
        'wa.created_at',
        'wa.actual_quantity',
        'wa.notes'
      )
      .leftJoin('mes.workers as w', 'w.id', 'wa.worker_id')
      .leftJoin('mes.stations as st', 'st.id', 'wa.station_id')
      .leftJoin('mes.substations as s', 's.id', 'wa.substation_id')
      .leftJoin('mes.operations as o', 'o.id', 'wa.operation_id')
      .leftJoin('mes.production_plan_nodes as pn', 'pn.id', 'wa.node_id')
      .leftJoin('mes.approved_quotes as aq', 'aq.work_order_code', 'wa.work_order_code')
      .leftJoin('quotes.quotes as qq', 'qq.work_order_code', 'aq.work_order_code')
      .orderBy('wa.estimated_start_time', 'asc')
      .limit(maxResults);
    
    // Apply filters
    if (status) {
      query = query.where('wa.status', status);
    }
    if (workerId) {
      query = query.where('wa.worker_id', workerId);
    }
    if (stationId) {
      query = query.where('wa.station_id', stationId);
    }
    
    const workPackages = await query;
    
    console.log(`📦 Work Packages Query: Found ${workPackages.length} assignments (limit: ${maxResults})`);
    
    // Transform to frontend format
    const transformed = workPackages.map(wp => ({
      id: wp.id,
      assignmentId: wp.id,
      workPackageId: wp.id,
      nodeId: wp.node_id,
      nodeName: wp.node_name,
      operationName: wp.operation_name,
      operationId: wp.operation_id,
      status: wp.status,
      priority: wp.priority || 2,
      isUrgent: wp.is_urgent || false,
      
      // Work order
      workOrderCode: wp.work_order_code,
      customer: wp.customer || '',
      productName: wp.product_name || '',
      
      // Worker
      workerId: wp.worker_id,
      workerName: wp.worker_name,
      workerSkills: wp.worker_skills || [],
      
      // Station
      stationId: wp.station_id,
      stationName: wp.station_name,
      substationId: wp.substation_id,
      substationCode: wp.substation_name,
      
      // Material
      materialInputs: wp.material_inputs || {},
      preProductionReservedAmount: wp.pre_production_reserved_amount || {},
      actualReservedAmounts: wp.actual_reserved_amounts || {},
      materialReservationStatus: wp.material_reservation_status,
      outputCode: wp.output_code,
      
      // Timing
      expectedStart: wp.expected_start,
      plannedEnd: wp.planned_end,
      actualStart: wp.actual_start,
      actualEnd: wp.actual_end,
      
      // Scrap
      inputScrapCount: wp.input_scrap_count || {},
      productionScrapCount: wp.production_scrap_count || {},
      defectQuantity: wp.defect_quantity || 0,
      
      // Status flags
      isPaused: wp.status === 'paused',
      materialStatus: wp.material_reservation_status === 'reserved' ? 'ok' : 'pending',
      
      // Metadata
      createdAt: wp.created_at,
      actualQuantity: wp.actual_quantity,
      notes: wp.notes
    }));
    
    res.json({
      workPackages: transformed,
      total: transformed.length,
      filters: { status, workerId, stationId },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Work packages fetch error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to fetch work packages',
      details: error.message
    });
  }
});

// ============================================================================
// METRICS ENDPOINT
// ============================================================================

// GET /api/mes/metrics - Get current metrics
router.get('/metrics', withAuth, async (req, res) => {
  try {
    res.json({
      success: true,
      metrics: metrics.getAll(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Metrics retrieval error:', error);
    res.status(500).json({ error: 'metrics_retrieval_failed', message: error.message });
  }
});

// POST /api/mes/metrics/reset - Reset all metrics (for testing)
router.post('/metrics/reset', withAuth, async (req, res) => {
  try {
    metrics.reset();
    res.json({
      success: true,
      message: 'Metrics reset successfully',
      metrics: metrics.getAll()
    });
  } catch (error) {
    console.error('Metrics reset error:', error);
    res.status(500).json({ error: 'metrics_reset_failed', message: error.message });
  }
});

// ============================================================================
// FIFO TASK SCHEDULING ENDPOINTS
// ============================================================================

/**
 * GET /api/mes/workers/:workerId/tasks/next
 * Get the next task for a worker using FIFO scheduling
 * 
 * Response: Single task object or null
 * Performance: < 5ms (uses idx_fifo_queue)
 */
router.get('/workers/:workerId/tasks/next', async (req, res) => {
  try {
    const { workerId } = req.params;
    
    const nextTask = await getWorkerNextTask(workerId);
    
    if (!nextTask) {
      return res.json({
        success: true,
        task: null,
        message: 'No tasks available in queue'
      });
    }
    
    res.json({
      success: true,
      task: nextTask
    });
    
  } catch (error) {
    console.error('❌ Error getting next task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get next task',
      details: error.message
    });
  }
});

/**
 * GET /api/mes/workers/:workerId/tasks/queue
 * Get full task queue for a worker in FIFO order
 * 
 * Query params:
 * - limit: Max tasks to return (default: 10)
 * 
 * Response: Array of tasks with FIFO positions
 */
router.get('/workers/:workerId/tasks/queue', async (req, res) => {
  try {
    const { workerId } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    
    const queue = await getWorkerTaskQueue(workerId, limit);
    const stats = await getWorkerTaskStats(workerId);
    
    res.json({
      success: true,
      workerId,
      queue,
      stats,
      queueLength: queue.length
    });
    
  } catch (error) {
    console.error('❌ Error getting task queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get task queue',
      details: error.message
    });
  }
});

/**
 * GET /api/mes/workers/:workerId/tasks/stats
 * Get task statistics for a worker
 * 
 * Response: Task counts, workload estimates, etc.
 */
router.get('/workers/:workerId/tasks/stats', async (req, res) => {
  try {
    const { workerId } = req.params;
    
    const stats = await getWorkerTaskStats(workerId);
    
    res.json({
      success: true,
      workerId,
      stats
    });
    
  } catch (error) {
    console.error('❌ Error getting task stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get task stats',
      details: error.message
    });
  }
});

/**
 * POST /api/mes/assignments/:assignmentId/start
 * Start a task (pending/ready → in_progress)
 * 
 * STEP 7 INTEGRATION: Now includes FIFO lot-based material consumption!
 * 
 * Body:
 * - workerId: Worker ID (for verification)
 * 
 * Side effects:
 * - Gets material requirements from production plan node
 * - Reserves materials with FIFO lot consumption
 * - Creates stock_movements (type='out') for consumed lots
 * - Creates assignment_material_reservations records
 * - Updates materials.stock and wip_reserved aggregates
 * - Updates status to in_progress
 * - Sets actual_start timestamp
 * - Triggers real-time notification
 * 
 * Response:
 * {
 *   success: true,
 *   assignment: { ... updated assignment ... },
 *   materialReservation: {
 *     success: true,
 *     reservations: [
 *       {
 *         materialCode: 'M-00-001',
 *         lotsConsumed: [
 *           { lotNumber: 'LOT-M-00-001-001', lotDate: '2025-11-01', qty: 50 },
 *           { lotNumber: 'LOT-M-00-001-002', lotDate: '2025-11-15', qty: 50 }
 *         ],
 *         totalReserved: 100,
 *         partialReservation: false
 *       }
 *     ],
 *     warnings: []
 *   }
 * }
 */
router.post('/assignments/:assignmentId/start', async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { workerId } = req.body;
    
    if (!workerId) {
      return res.status(400).json({
        success: false,
        error: 'workerId is required'
      });
    }
    
    console.log(`🚀 [FIFO] Starting task ${assignmentId} for worker ${workerId}`);
    
    // Start task with integrated lot consumption
    const result = await startTask(assignmentId, workerId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    // Log material consumption details
    if (result.materialReservation && result.materialReservation.reservations.length > 0) {
      console.log(`📦 [FIFO] Reserved ${result.materialReservation.reservations.length} material(s) with FIFO lot consumption`);
      
      result.materialReservation.reservations.forEach(r => {
        console.log(`   - ${r.materialCode}: ${r.totalReserved} from ${r.lotsConsumed.length} lot(s)`);
      });
      
      if (result.materialReservation.warnings.length > 0) {
        console.warn(`⚠️  [FIFO] Warnings:`, result.materialReservation.warnings);
      }
    }
    
    res.json({
      ...result,
      message: result.materialReservation.warnings.length > 0
        ? 'Task started with warnings (partial material reservations)'
        : 'Task started successfully'
    });
    
  } catch (error) {
    console.error('❌ [FIFO] Error starting task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start task',
      details: error.message
    });
  }
});

/**
 * POST /api/mes/assignments/:assignmentId/complete
 * Complete a task (in_progress → completed)
 * 
 * STEP 7 INTEGRATION: Now marks materials as consumed!
 * 
 * Body:
 * - workerId: Worker ID (for verification)
 * - quantityProduced: Number (optional)
 * - defectQuantity: Number (optional)
 * - qualityOk: Boolean (optional, default: true)
 * - notes: String (optional)
 * 
 * Side effects:
 * - Marks reserved materials as 'consumed'
 * - Updates consumed_qty in assignment_material_reservations
 * - Updates status to completed
 * - Sets actual_end timestamp
 * - Records completion data
 * - Triggers real-time notification
 * 
 * Response:
 * {
 *   success: true,
 *   assignment: { ... updated assignment ... },
 *   materialsConsumed: 3  // Number of material reservations marked as consumed
 * }
 */
router.post('/assignments/:assignmentId/complete', async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { workerId, quantityProduced, defectQuantity, qualityOk, notes } = req.body;
    
    if (!workerId) {
      return res.status(400).json({
        success: false,
        error: 'workerId is required'
      });
    }
    
    console.log(`✅ [FIFO] Completing task ${assignmentId} for worker ${workerId}`);
    
    // Complete task with integrated material consumption
    const result = await completeTask(assignmentId, workerId, {
      quantityProduced,
      defectQuantity,
      qualityOk,
      notes
    });
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    // Log material consumption
    if (result.materialsConsumed > 0) {
      console.log(`📦 [FIFO] Marked ${result.materialsConsumed} material reservation(s) as consumed`);
    }
    
    res.json({
      ...result,
      message: `Task completed successfully${result.materialsConsumed > 0 ? ` (${result.materialsConsumed} materials consumed)` : ''}`
    });
    
  } catch (error) {
    console.error('❌ [FIFO] Error completing task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete task',
      details: error.message
    });
  }
});

/**
 * GET /api/mes/workers/:workerId/has-tasks
 * Quick check if worker has any tasks in queue
 * 
 * Response: { hasTasks: boolean }
 * Use case: Dashboard widgets, availability indicators
 */
router.get('/workers/:workerId/has-tasks', async (req, res) => {
  try {
    const { workerId } = req.params;
    
    const hasTasks = await hasTasksInQueue(workerId);
    
    res.json({
      success: true,
      workerId,
      hasTasks
    });
    
  } catch (error) {
    console.error('❌ Error checking task queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check task queue',
      details: error.message
    });
  }
});

// ============================================================================
// STEP 8: REAL-TIME SSE ENDPOINTS
// ============================================================================

/**
 * GET /api/mes/stream/assignments
 * Real-time stream of worker assignment changes
 * 
 * Server-Sent Events (SSE) endpoint that streams PostgreSQL notifications
 * for assignment table changes (INSERT, UPDATE, DELETE).
 * 
 * Query params:
 * - workerId: Filter events for specific worker (optional)
 * 
 * Event format:
 * event: message
 * data: {
 *   "operation": "UPDATE",
 *   "table": "worker_assignments",
 *   "id": "assignment-id",
 *   "planId": "plan-id",
 *   "nodeId": "node-id",
 *   "workerId": "worker-id",
 *   "status": "in_progress",
 *   "timestamp": 1700000000
 * }
 * 
 * Frontend usage:
 * ```javascript
 * const eventSource = new EventSource('/api/mes/stream/assignments?workerId=W-001');
 * eventSource.addEventListener('message', (e) => {
 *   const data = JSON.parse(e.data);
 *   console.log('Assignment updated:', data);
 * });
 * ```
 */
router.get('/stream/assignments', (req, res) => {
  const { workerId } = req.query;

  console.log(`🌊 [SSE] New assignment stream connection${workerId ? ` for worker ${workerId}` : ''}`);

  // Create filter if workerId provided
  const filter = workerId ? createWorkerFilter(workerId) : null;

  // Create SSE stream
  const stream = createSSEStream(res, 'mes_assignment_updates', { filter });

  // Start streaming
  stream.start();
});

/**
 * GET /api/mes/stream/plans
 * Real-time stream of production plan changes
 * 
 * Streams notifications when production plans are created, updated, or deleted.
 * 
 * Query params:
 * - planId: Filter events for specific plan (optional)
 * 
 * Event format:
 * event: message
 * data: {
 *   "operation": "UPDATE",
 *   "table": "production_plans",
 *   "id": "plan-id",
 *   "planId": "plan-id",
 *   "status": "in_progress",
 *   "orderCode": "WO-001",
 *   "timestamp": 1700000000
 * }
 * 
 * Frontend usage:
 * ```javascript
 * const eventSource = new EventSource('/api/mes/stream/plans');
 * eventSource.addEventListener('message', (e) => {
 *   const data = JSON.parse(e.data);
 *   if (data.operation === 'UPDATE') {
 *     updatePlanStatus(data.planId, data.status);
 *   }
 * });
 * ```
 */
router.get('/stream/plans', (req, res) => {
  const { planId } = req.query;

  console.log(`🌊 [SSE] New plan stream connection${planId ? ` for plan ${planId}` : ''}`);

  // Create filter if planId provided
  const filter = planId ? createPlanFilter(planId) : null;

  // Create SSE stream
  const stream = createSSEStream(res, 'mes_plan_updates', { filter });

  // Start streaming
  stream.start();
});

/**
 * GET /api/mes/stream/workers
 * Real-time stream of worker status changes
 * 
 * Streams notifications when worker status, availability, or current task changes.
 * 
 * Query params:
 * - workerId: Filter events for specific worker (optional)
 * 
 * Event format:
 * event: message
 * data: {
 *   "operation": "UPDATE",
 *   "table": "workers",
 *   "id": "worker-id",
 *   "workerId": "worker-id",
 *   "status": "active",
 *   "currentTaskPlanId": "plan-id",
 *   "currentTaskNodeId": "node-id",
 *   "timestamp": 1700000000
 * }
 * 
 * Use cases:
 * - Worker portal: Show current task and availability
 * - Production monitoring: Track worker utilization
 * - Real-time dashboard: Worker status indicators
 * 
 * Frontend usage:
 * ```javascript
 * const eventSource = new EventSource('/api/mes/stream/workers?workerId=W-001');
 * eventSource.addEventListener('message', (e) => {
 *   const data = JSON.parse(e.data);
 *   updateWorkerStatus(data.workerId, data.status);
 * });
 * 
 * // Handle connection events
 * eventSource.addEventListener('connected', (e) => {
 *   console.log('SSE connected:', e.data);
 * });
 * 
 * eventSource.addEventListener('error', (e) => {
 *   console.error('SSE error:', e);
 *   // Will auto-reconnect
 * });
 * ```
 */
router.get('/stream/workers', (req, res) => {
  const { workerId } = req.query;

  console.log(`🌊 [SSE] New worker stream connection${workerId ? ` for worker ${workerId}` : ''}`);

  // Create filter if workerId provided
  const filter = workerId ? createWorkerFilter(workerId) : null;

  // Create SSE stream
  const stream = createSSEStream(res, 'mes_worker_updates', { filter });

  // Start streaming
  stream.start();
});

/**
 * GET /api/mes/stream/test
 * Test SSE endpoint for development
 * 
 * Sends a test event every 5 seconds with incrementing counter.
 * Useful for testing SSE connection without database triggers.
 * 
 * Frontend usage:
 * ```javascript
 * const eventSource = new EventSource('/api/mes/stream/test');
 * eventSource.onmessage = (e) => {
 *   console.log('Test event:', JSON.parse(e.data));
 * };
 * ```
 */
router.get('/stream/test', (req, res) => {
  console.log('🧪 [SSE] Test stream connection');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let counter = 0;
  const interval = setInterval(() => {
    res.write(`data: ${JSON.stringify({ 
      counter: ++counter, 
      timestamp: Date.now(),
      message: 'Test event from SSE stream'
    })}\n\n`);
  }, 5000);

  res.on('close', () => {
    clearInterval(interval);
    console.log('🧪 [SSE] Test stream closed');
  });
});

// ============================================================================
// STEP 10: POLYMORPHIC ENTITY RELATIONS API
// ============================================================================
// Generic API for querying entity relationships (replaces 6 junction tables)
// Supports: worker→station, worker→operation, station→operation,
//           node→station, node→substation, node→predecessor

/**
 * GET /api/mes/entity-relations
 * Query polymorphic entity relations
 * 
 * Query params:
 * - sourceType: 'worker' | 'station' | 'node'
 * - sourceId: ID of source entity
 * - relationType: 'station' | 'operation' | 'substation' | 'material' | 'predecessor'
 * - targetId: (optional) Filter by specific target
 * 
 * Examples:
 * - GET /api/mes/entity-relations?sourceType=node&sourceId=node-123&relationType=station
 *   Returns all stations assigned to node-123 (with priority field)
 * 
 * - GET /api/mes/entity-relations?sourceType=worker&sourceId=W-001&relationType=station
 *   Returns all stations worker W-001 can work at
 * 
 * - GET /api/mes/entity-relations?sourceType=station&sourceId=ST-001&relationType=operation
 *   Returns all operations available on station ST-001
 */
router.get('/entity-relations', withAuth, async (req, res) => {
  try {
    const { sourceType, sourceId, relationType, targetId } = req.query;

    // Validation
    if (!sourceType || !sourceId || !relationType) {
      return res.status(400).json({
        error: 'Missing required parameters: sourceType, sourceId, relationType'
      });
    }

    const validSourceTypes = ['worker', 'station', 'node'];
    const validRelationTypes = ['station', 'operation', 'substation', 'material', 'predecessor'];

    if (!validSourceTypes.includes(sourceType)) {
      return res.status(400).json({
        error: `Invalid sourceType. Must be one of: ${validSourceTypes.join(', ')}`
      });
    }

    if (!validRelationTypes.includes(relationType)) {
      return res.status(400).json({
        error: `Invalid relationType. Must be one of: ${validRelationTypes.join(', ')}`
      });
    }

    // Build query
    let query = db('mes_entity_relations')
      .where({
        source_type: sourceType,
        source_id: sourceId,
        relation_type: relationType
      })
      .select(
        'id',
        'source_type',
        'source_id',
        'relation_type',
        'target_id',
        'priority',
        'quantity',
        'unit_ratio',
        'is_derived',
        'created_at',
        'updated_at'
      );

    // Optional target filter
    if (targetId) {
      query = query.where('target_id', targetId);
    }

    // Order by priority (if applicable)
    query = query.orderBy('priority', 'asc').orderBy('created_at', 'asc');

    const relations = await query;

    // Join with target entity to get names
    const enrichedRelations = await Promise.all(
      relations.map(async (relation) => {
        let targetName = null;
        let targetDetails = null;

        try {
          // Get target entity details based on relation type
          if (relation.relation_type === 'station') {
            const station = await db('mes_stations')
              .where('id', relation.target_id)
              .first('id', 'name', 'code', 'type');
            if (station) {
              targetName = station.name;
              targetDetails = station;
            }
          } else if (relation.relation_type === 'operation') {
            const operation = await db('mes_operations')
              .where('id', relation.target_id)
              .first('id', 'name', 'code', 'type');
            if (operation) {
              targetName = operation.name;
              targetDetails = operation;
            }
          } else if (relation.relation_type === 'substation') {
            const substation = await db('mes_substations')
              .where('id', relation.target_id)
              .first('id', 'name', 'code', 'station_id');
            if (substation) {
              targetName = substation.name;
              targetDetails = substation;
            }
          } else if (relation.relation_type === 'predecessor') {
            const node = await db('mes_production_plan_nodes')
              .where('id', relation.target_id)
              .first('id', 'name', 'operation_id');
            if (node) {
              targetName = node.name;
              targetDetails = node;
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch target details for ${relation.relation_type} ${relation.target_id}:`, err.message);
        }

        return {
          id: relation.id,
          sourceType: relation.source_type,
          sourceId: relation.source_id,
          relationType: relation.relation_type,
          targetId: relation.target_id,
          targetName,
          targetDetails,
          priority: relation.priority,
          quantity: relation.quantity,
          unitRatio: relation.unit_ratio,
          isDerived: relation.is_derived,
          createdAt: relation.created_at,
          updatedAt: relation.updated_at
        };
      })
    );

    res.json({
      success: true,
      count: enrichedRelations.length,
      relations: enrichedRelations
    });

  } catch (err) {
    console.error('❌ [API] Failed to fetch entity relations:', err);
    res.status(500).json({
      error: 'Failed to fetch entity relations',
      details: err.message
    });
  }
});

/**
 * POST /api/mes/entity-relations
 * Create a new entity relation
 * 
 * Body:
 * {
 *   sourceType: 'node',
 *   sourceId: 'node-123',
 *   relationType: 'station',
 *   targetId: 'ST-001',
 *   priority: 1,  // Optional
 *   quantity: 100,  // Optional (for materials)
 *   unitRatio: 1.5  // Optional (for material conversions)
 * }
 */
router.post('/entity-relations', withAuth, async (req, res) => {
  try {
    const {
      sourceType,
      sourceId,
      relationType,
      targetId,
      priority,
      quantity,
      unitRatio,
      isDerived
    } = req.body;

    // Validation
    if (!sourceType || !sourceId || !relationType || !targetId) {
      return res.status(400).json({
        error: 'Missing required fields: sourceType, sourceId, relationType, targetId'
      });
    }

    // Insert relation
    const [relation] = await db('mes_entity_relations')
      .insert({
        source_type: sourceType,
        source_id: sourceId,
        relation_type: relationType,
        target_id: targetId,
        priority: priority || null,
        quantity: quantity || null,
        unit_ratio: unitRatio || null,
        is_derived: isDerived || false,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('*');

    res.status(201).json({
      success: true,
      relation: {
        id: relation.id,
        sourceType: relation.source_type,
        sourceId: relation.source_id,
        relationType: relation.relation_type,
        targetId: relation.target_id,
        priority: relation.priority,
        quantity: relation.quantity,
        unitRatio: relation.unit_ratio,
        isDerived: relation.is_derived,
        createdAt: relation.created_at,
        updatedAt: relation.updated_at
      }
    });

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
});

/**
 * PUT /api/mes/entity-relations/:id
 * Update an entity relation (primarily for priority changes)
 * 
 * Body:
 * {
 *   priority: 2  // Update priority
 * }
 */
router.put('/entity-relations/:id', withAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { priority, quantity, unitRatio } = req.body;

    const updateData = {
      updated_at: new Date()
    };

    if (priority !== undefined) updateData.priority = priority;
    if (quantity !== undefined) updateData.quantity = quantity;
    if (unitRatio !== undefined) updateData.unit_ratio = unitRatio;

    const [updatedRelation] = await db('mes_entity_relations')
      .where('id', id)
      .update(updateData)
      .returning('*');

    if (!updatedRelation) {
      return res.status(404).json({
        error: 'Entity relation not found'
      });
    }

    res.json({
      success: true,
      relation: {
        id: updatedRelation.id,
        sourceType: updatedRelation.source_type,
        sourceId: updatedRelation.source_id,
        relationType: updatedRelation.relation_type,
        targetId: updatedRelation.target_id,
        priority: updatedRelation.priority,
        quantity: updatedRelation.quantity,
        unitRatio: updatedRelation.unit_ratio,
        updatedAt: updatedRelation.updated_at
      }
    });

  } catch (err) {
    console.error('❌ [API] Failed to update entity relation:', err);
    res.status(500).json({
      error: 'Failed to update entity relation',
      details: err.message
    });
  }
});

/**
 * DELETE /api/mes/entity-relations/:id
 * Delete an entity relation
 */
router.delete('/entity-relations/:id', withAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await db('mes_entity_relations')
      .where('id', id)
      .del();

    if (deleted === 0) {
      return res.status(404).json({
        error: 'Entity relation not found'
      });
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
});

/**
 * POST /api/mes/entity-relations/batch
 * Create or update multiple relations at once
 * Used for drag-drop priority reordering
 * 
 * Body:
 * {
 *   relations: [
 *     { id: 1, priority: 1 },
 *     { id: 2, priority: 2 },
 *     { id: 3, priority: 3 }
 *   ]
 * }
 */
router.post('/entity-relations/batch', withAuth, async (req, res) => {
  try {
    const { relations } = req.body;

    if (!relations || !Array.isArray(relations)) {
      return res.status(400).json({
        error: 'Missing or invalid relations array'
      });
    }

    // Update all relations in a transaction
    await db.transaction(async (trx) => {
      for (const relation of relations) {
        if (relation.id && relation.priority !== undefined) {
          await trx('mes_entity_relations')
            .where('id', relation.id)
            .update({
              priority: relation.priority,
              updated_at: new Date()
            });
        }
      }
    });

    res.json({
      success: true,
      message: `${relations.length} relations updated successfully`
    });

  } catch (err) {
    console.error('❌ [API] Failed to batch update relations:', err);
    res.status(500).json({
      error: 'Failed to batch update relations',
      details: err.message
    });
  }
});

// ============================================================================
// PRODUCTION PLANS API - STEP 7
// ============================================================================
// Lifecycle: Design → Launch → Execute
// - Design: Create plan with nodes (draft status)
// - Launch: Assign workers and substations (active status)
// - Execute: Workers complete tasks
// ============================================================================

/**
 * Helper: Get plan with all nodes and related data
 */
async function getPlanWithNodes(planId) {
  const plan = await db('mes.production_plans')
    .where('id', planId)
    .first();
  
  if (!plan) return null;
  
  // Get nodes with aggregated materials and stations
  const nodes = await db('mes.production_plan_nodes as n')
    .select('n.*')
    .where('n.plan_id', planId)
    .orderBy('n.sequence_order');
  
  // For each node, fetch materials and stations separately
  for (const node of nodes) {
    // Get material inputs
    const materialInputs = await db('mes.node_material_inputs')
      .where('node_id', node.id)
      .select('material_code as materialCode', 'required_quantity as requiredQuantity', 
              'unit_ratio as unitRatio', 'is_derived as isDerived');
    
    node.material_inputs = materialInputs;
    
    // Get assigned stations
    const stations = await db('mes.node_stations')
      .where('node_id', node.id)
      .select('station_id as stationId', 'priority')
      .orderBy('priority');
    
    node.assigned_stations = stations;
  }
  
  return { ...plan, nodes };
}

/**
 * Helper: Find worker with required skills for a station
 */
async function findAvailableWorkerWithSkills(trx, requiredSkills, stationId) {
  if (!requiredSkills || requiredSkills.length === 0) {
    // No skills required, get any available worker
    return await trx('mes.workers')
      .where('is_active', true)
      .first();
  }
  
  // Find workers with matching skills
  const workers = await trx('mes.workers')
    .where('is_active', true)
    .whereRaw('skills::jsonb ?| ?', [requiredSkills]);
  
  if (workers.length === 0) return null;
  
  // Prefer workers already assigned to this station
  const stationWorkers = await trx('mes_entity_relations')
    .where('source_type', 'worker')
    .where('relation_type', 'station')
    .where('target_id', stationId)
    .pluck('source_id');
  
  const preferredWorker = workers.find(w => 
    stationWorkers.includes(w.id)
  );
  
  return preferredWorker || workers[0] || null;
}

/**
 * GET /api/mes/production-plans
 * List all production plans with summary info
 * Excludes templates (status='template')
 */
router.get('/production-plans', withAuth, async (req, res) => {
  try {
    const plans = await db('mes.production_plans as p')
      .select(
        'p.id',
        'p.work_order_code',
        'p.quote_id',
        'p.status',
        'p.created_at',
        'p.launched_at',
        db.raw('count(n.id)::integer as node_count')
      )
      .leftJoin('mes.production_plan_nodes as n', 'n.plan_id', 'p.id')
      .where('p.status', '!=', 'template') // Exclude templates
      .groupBy('p.id')
      .orderBy('p.created_at', 'desc');
    
    res.json(plans);
  } catch (error) {
    console.error('❌ Error fetching production plans:', error);
    res.status(500).json({ 
      error: 'Failed to fetch production plans',
      details: error.message 
    });
  }
});

/**
 * POST /api/mes/production-plans
 * Create production plan with nodes, materials, and stations
 * 
 * Body:
 * {
 *   workOrderCode: "WO-001",
 *   quoteId: "Q-2025-001",
 *   nodes: [
 *     {
 *       name: "Kesim",
 *       operationId: "OP-001",
 *       outputCode: "WIP-Kesim-M12",
 *       outputQty: 1000,
 *       outputUnit: "adet",
 *       nominalTime: 120,
 *       efficiency: 0.85,
 *       sequenceOrder: 1,
 *       stationIds: ["ST-Kesim-001", "ST-Kesim-002"],
 *       materialInputs: [
 *         {
 *           materialCode: "M-001",
 *           requiredQuantity: 100,
 *           unitRatio: 1.0,
 *           isDerived: false
 *         }
 *       ]
 *     }
 *   ]
 * }
 */
router.post('/production-plans', withAuth, async (req, res) => {
  const { workOrderCode, quoteId, nodes } = req.body;
  
  // Validation
  if (!workOrderCode || !quoteId || !nodes || !Array.isArray(nodes)) {
    return res.status(400).json({ 
      error: 'Missing required fields: workOrderCode, quoteId, nodes' 
    });
  }
  
  const trx = await db.transaction();
  
  try {
    // 1. Generate plan ID
    const [{ max_id }] = await trx('mes.production_plans')
      .max('id as max_id');
    const nextNum = max_id ? parseInt(max_id.split('-')[1]) + 1 : 1;
    const planId = `PLAN-${nextNum.toString().padStart(3, '0')}`;
    
    console.log(`📋 Creating production plan: ${planId}`);
    
    // 2. Create plan header
    await trx('mes.production_plans').insert({
      id: planId,
      work_order_code: workOrderCode,
      quote_id: quoteId,
      status: 'draft',
      created_at: trx.fn.now()
    });
    
    // 3. Insert nodes with materials and stations
    for (const node of nodes) {
      // 3a. Insert node
      const [nodeRecord] = await trx('mes.production_plan_nodes')
        .insert({
          plan_id: planId,
          node_id: `${planId}-node-${node.sequenceOrder}`,
          work_order_code: workOrderCode, // Add work_order_code for easy access
          name: node.name,
          operation_id: node.operationId,
          output_code: node.outputCode,
          output_qty: node.outputQty,
          output_unit: node.outputUnit,
          nominal_time: node.nominalTime,
          efficiency: node.efficiency || 0.85,
          effective_time: Math.ceil(node.nominalTime / (node.efficiency || 0.85)),
          sequence_order: node.sequenceOrder,
          assignment_mode: 'auto',
          created_at: trx.fn.now()
        })
        .returning('id');
      
      const nodeId = nodeRecord.id;
      
      // 3b. Insert material inputs
      if (node.materialInputs && node.materialInputs.length > 0) {
        const materialInputs = node.materialInputs.map(m => ({
          node_id: nodeId,
          material_code: m.materialCode,
          required_quantity: m.requiredQuantity,
          unit_ratio: m.unitRatio || 1.0,
          is_derived: m.isDerived || false,
          created_at: trx.fn.now()
        }));
        
        await trx('mes.node_material_inputs').insert(materialInputs);
      }
      
      // 3c. Insert station assignments
      if (node.stationIds && node.stationIds.length > 0) {
        const stationAssignments = node.stationIds.map((stId, idx) => ({
          node_id: nodeId,
          station_id: stId,
          priority: idx + 1,
          created_at: trx.fn.now()
        }));
        
        await trx('mes.node_stations').insert(stationAssignments);
      }
    }
    
    await trx.commit();
    
    console.log(`✅ Production plan created: ${planId} with ${nodes.length} nodes`);
    
    // 4. Fetch and return complete plan
    const plan = await getPlanWithNodes(planId);
    res.json(plan);
    
  } catch (error) {
    await trx.rollback();
    console.error('❌ Error creating production plan:', error);
    res.status(500).json({ 
      error: 'Failed to create production plan',
      details: error.message 
    });
  }
});

/**
 * GET /api/mes/production-plans/:id
 * Get plan details with all nodes
 */
router.get('/production-plans/:id', withAuth, async (req, res) => {
  try {
    const plan = await getPlanWithNodes(req.params.id);
    
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    res.json(plan);
  } catch (error) {
    console.error('❌ Error fetching plan:', error);
    res.status(500).json({ 
      error: 'Failed to fetch plan',
      details: error.message 
    });
  }
});

/**
 * PUT /api/mes/production-plans/:id
 * Update plan header (not nodes)
 * 
 * Body: { workOrderCode?, quoteId?, status? }
 */
router.put('/production-plans/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  const { workOrderCode, quoteId, status } = req.body;
  
  try {
    const [updated] = await db('mes.production_plans')
      .where('id', id)
      .update({
        work_order_code: workOrderCode,
        quote_id: quoteId,
        status,
        updated_at: db.fn.now()
      })
      .returning('*');
    
    if (!updated) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    console.log(`✅ Updated production plan: ${id}`);
    res.json(updated);
  } catch (error) {
    console.error('❌ Error updating plan:', error);
    res.status(500).json({ 
      error: 'Failed to update plan',
      details: error.message 
    });
  }
});

/**
 * DELETE /api/mes/production-plans/:id
 * Delete plan and all related data (CASCADE)
 */
router.delete('/production-plans/:id', withAuth, async (req, res) => {
  const trx = await db.transaction();
  
  try {
    // Check if plan exists and get launch status
    const [plan] = await trx('mes.production_plans')
      .where('id', req.params.id)
      .select('id', 'status', 'launched_at');
    
    if (!plan) {
      await trx.rollback();
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    // Prevent deletion of launched plans
    if (plan.launched_at) {
      await trx.rollback();
      return res.status(400).json({ 
        error: 'Cannot delete launched plan',
        details: 'Plan has been launched and cannot be deleted'
      });
    }
    
    // Get node IDs first
    const nodes = await trx('mes.production_plan_nodes')
      .where('plan_id', req.params.id)
      .select('id');
    
    const nodeIds = nodes.map(n => n.id);
    
    // Delete in correct order (FK constraints)
    if (nodeIds.length > 0) {
      await trx('mes.node_stations')
        .whereIn('node_id', nodeIds)
        .delete();
      
      await trx('mes.node_material_inputs')
        .whereIn('node_id', nodeIds)
        .delete();
    }
    
    await trx('mes.production_plan_nodes')
      .where('plan_id', req.params.id)
      .delete();
    
    await trx('mes.production_plans')
      .where('id', req.params.id)
      .delete();
    
    await trx.commit();
    
    console.log(`✅ Deleted production plan: ${req.params.id}`);
    res.json({ success: true, id: req.params.id });
    
  } catch (error) {
    await trx.rollback();
    console.error('❌ Error deleting plan:', error);
    res.status(500).json({ 
      error: 'Failed to delete plan',
      details: error.message 
    });
  }
});

// ============================================================================
// ============================================================================
// ENHANCED LAUNCH ALGORITHM - HELPER FUNCTIONS
// ============================================================================
// ============================================================================

/**
 * Calculate earliest available slot in a schedule
 */
function calculateEarliestSlot(schedule, afterTime) {
  if (schedule.length === 0) return afterTime;
  
  const sorted = schedule.sort((a, b) => b.end - a.end);
  const lastEnd = sorted[0].end;
  
  return lastEnd > afterTime ? lastEnd : afterTime;
}

/**
 * Find earliest available substation from station options
 */
async function findEarliestSubstation(trx, stationOptions, scheduleMap, afterTime) {
  let bestSubstation = null;
  let earliestTime = null;
  
  for (const stOpt of stationOptions) {
    const substations = await trx('mes.substations')
      .where('station_id', stOpt.station_id)
      .where('is_active', true);
    
    for (const sub of substations) {
      const schedule = scheduleMap.get(sub.id) || [];
      const availableAt = calculateEarliestSlot(schedule, afterTime);
      
      if (!earliestTime || availableAt < earliestTime) {
        bestSubstation = sub;
        earliestTime = availableAt;
      }
    }
  }
  
  return { 
    substation: bestSubstation, 
    availableAt: earliestTime || afterTime 
  };
}

/**
 * Get shift blocks for specific day from personal_schedule
 */
function getShiftBlocksForDay(schedule, dayOfWeek) {
  if (!schedule) return [];
  
  // Standard model: shifts: [{ id: '1', blocks: { monday: [...] } }]
  if (Array.isArray(schedule.shifts)) {
    const shift = schedule.shifts.find(s => s.id === '1');
    return shift?.blocks?.[dayOfWeek] || [];
  }
  
  // Aggregated model: shiftBlocks: { 'shift-monday': [...] }
  const aggregated = schedule.shiftBlocks?.[`shift-${dayOfWeek}`];
  if (Array.isArray(aggregated)) return aggregated;
  
  // Split-by-lane: shiftByLane: { '1': { monday: [...] } }
  const byLane = schedule.shiftByLane?.['1']?.[dayOfWeek];
  if (Array.isArray(byLane)) return byLane;
  
  return [];
}

/**
 * Check if time slot falls within shift blocks
 */
function isWithinShiftBlocks(startTime, durationMinutes, shiftBlocks) {
  if (shiftBlocks.length === 0) return true; // No restrictions
  
  const startHour = startTime.getHours() + startTime.getMinutes() / 60;
  const endHour = startHour + durationMinutes / 60;
  
  for (const block of shiftBlocks) {
    if (!block.start || !block.end) continue;
    
    const [blockStartH, blockStartM] = block.start.split(':').map(Number);
    const [blockEndH, blockEndM] = block.end.split(':').map(Number);
    
    const blockStart = blockStartH + blockStartM / 60;
    const blockEnd = blockEndH + blockEndM / 60;
    
    // Task must fit entirely within one shift block
    if (startHour >= blockStart && endHour <= blockEnd) {
      return true;
    }
  }
  
  return false;
}

/**
 * Find worker with skill check and shift availability
 */
async function findWorkerWithShiftCheck(trx, requiredSkills, stationId, startTime, duration) {
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][startTime.getDay()];
  
  // Get workers with matching skills (or all if no skills required)
  let query = trx('mes.workers').where('is_active', true);
  
  if (requiredSkills && requiredSkills.length > 0) {
    query = query.whereRaw('skills::jsonb ?| ?', [requiredSkills]);
  }
  
  const workers = await query;
  
  // Filter by shift availability
  for (const worker of workers) {
    const schedule = worker.personal_schedule;
    const shiftBlocks = getShiftBlocksForDay(schedule, dayOfWeek);
    
    if (isWithinShiftBlocks(startTime, duration, shiftBlocks)) {
      return worker;
    }
  }
  
  // If no shift match, return first available worker (fallback)
  return workers[0] || null;
}

/**
 * Topological sort for parallel execution
 */
function topologicalSort(nodes, predecessors) {
  const graph = new Map();
  const inDegree = new Map();
  
  nodes.forEach(n => {
    graph.set(n.id, []);
    inDegree.set(n.id, 0);
  });
  
  predecessors.forEach(p => {
    graph.get(p.predecessor_node_id).push(p.node_id);
    inDegree.set(p.node_id, inDegree.get(p.node_id) + 1);
  });
  
  const queue = nodes.filter(n => inDegree.get(n.id) === 0).map(n => n.id);
  const order = [];
  
  while (queue.length > 0) {
    const nodeId = queue.shift();
    order.push(nodeId);
    
    for (const neighbor of graph.get(nodeId)) {
      inDegree.set(neighbor, inDegree.get(neighbor) - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    }
  }
  
  return order;
}

/**
 * Calculate number of parallel execution paths
 */
function calculateParallelPaths(executionOrder, predecessors) {
  const levels = new Map();
  let maxLevel = 0;
  
  for (const nodeId of executionOrder) {
    const preds = predecessors.filter(p => p.node_id === nodeId);
    
    if (preds.length === 0) {
      levels.set(nodeId, 0);
    } else {
      const predLevels = preds.map(p => levels.get(p.predecessor_node_id) || 0);
      const level = Math.max(...predLevels) + 1;
      levels.set(nodeId, level);
      maxLevel = Math.max(maxLevel, level);
    }
  }
  
  return maxLevel + 1;
}

/**
 * POST /api/mes/production-plans/:id/launch
 * Launch plan with enhanced algorithm
 */
router.post('/production-plans/:id/launch', withAuth, async (req, res) => {
  const { id } = req.params;
  const trx = await db.transaction();
  
  try {
    // 🔒 CRITICAL: Lock tables to prevent concurrent launches
    // Only ONE launch can run at a time across entire system
    await trx.raw('LOCK TABLE mes.worker_assignments IN EXCLUSIVE MODE');
    await trx.raw('LOCK TABLE mes.substations IN EXCLUSIVE MODE');
    
    console.log(`🔒 Acquired exclusive locks for launch of ${id}`);
    
    // 1. Validate plan
    const plan = await trx('mes.production_plans')
      .where('id', id)
      .where('status', 'draft')
      .first();
    
    if (!plan) {
      await trx.rollback();
      return res.status(404).json({ error: 'Plan not found or already launched' });
    }
    
    console.log(`🚀 Launching production plan: ${id}`);
    
    // 2. Load nodes and dependency graph
    const nodes = await trx('mes.production_plan_nodes')
      .where('plan_id', id)
      .orderBy('sequence_order');
    
    const predecessors = await trx('mes.node_predecessors')
      .whereIn('node_id', nodes.map(n => n.id));
    
    // 3. Topological sort for execution order
    const executionOrder = topologicalSort(nodes, predecessors);
    
    // 4. Initialize tracking maps
    const workerSchedule = new Map();      // workerId → [{ start, end, seq }]
    const substationSchedule = new Map();  // substationId → [{ start, end }]
    const nodeCompletionTimes = new Map(); // nodeId → estimatedEnd
    const assignments = [];
    let queuedCount = 0;
    
    // 5. Process nodes in topological order
    for (const nodeId of executionOrder) {
      const node = nodes.find(n => n.id === nodeId);
      
      // 5a. Calculate earliest start (wait for predecessors)
      const predecessorIds = predecessors
        .filter(p => p.node_id === nodeId)
        .map(p => p.predecessor_node_id);
      
      let earliestStart = new Date();
      for (const predId of predecessorIds) {
        const predEnd = nodeCompletionTimes.get(predId);
        if (predEnd && predEnd > earliestStart) {
          earliestStart = predEnd;
        }
      }
      
      // 5b. Get station options
      const stationOptions = await trx('mes.node_stations')
        .where('node_id', node.id)
        .orderBy('priority');
      
      // 5c. Find earliest available substation
      const { substation, availableAt } = await findEarliestSubstation(
        trx,
        stationOptions,
        substationSchedule,
        earliestStart
      );
      
      if (!substation) {
        throw new Error(`No substation for node ${node.name}`);
      }
      
      // 5d. Get operation skills
      const operation = await trx('mes.operations')
        .where('id', node.operation_id)
        .first();
      
      const requiredSkills = operation?.skills || [];
      
      // 5e. Find worker with shift check
      const worker = await findWorkerWithShiftCheck(
        trx,
        requiredSkills,
        substation.station_id,
        availableAt,
        node.effective_time
      );
      
      if (!worker) {
        throw new Error(`No worker for ${node.name} at ${availableAt}`);
      }
      
      // 5f. Calculate worker queue position
      const workerQueue = workerSchedule.get(worker.id) || [];
      const sequenceNumber = workerQueue.length + 1;
      
      // 5g. Determine actual start (max of worker and substation)
      const workerAvailableAt = workerQueue.length > 0
        ? workerQueue[workerQueue.length - 1].end
        : availableAt;
      
      const actualStart = new Date(Math.max(
        workerAvailableAt.getTime(),
        availableAt.getTime()
      ));
      
      const actualEnd = new Date(
        actualStart.getTime() + node.effective_time * 60000
      );
      
      const isQueued = sequenceNumber > 1;
      if (isQueued) queuedCount++;
      
      // 5h. Create worker assignment (now uses INTEGER foreign key)
      await trx('mes.worker_assignments').insert({
        plan_id: id,
        work_order_code: plan.work_order_code,
        node_id: node.id, // INTEGER foreign key to production_plan_nodes.id
        worker_id: worker.id,
        substation_id: substation.id,
        operation_id: node.operation_id,
        status: isQueued ? 'queued' : 'pending',
        estimated_start_time: actualStart,
        estimated_end_time: actualEnd,
        sequence_number: sequenceNumber,
        created_at: trx.fn.now()
      });
      
      // 5i. Update node
      await trx('mes.production_plan_nodes')
        .where('id', node.id)
        .update({
          assigned_worker_id: worker.id,
          estimated_start_time: actualStart,
          estimated_end_time: actualEnd,
          updated_at: trx.fn.now()
        });
      
      // 5j. Update schedules
      workerQueue.push({ start: actualStart, end: actualEnd, sequenceNumber });
      workerSchedule.set(worker.id, workerQueue);
      
      const subSchedule = substationSchedule.get(substation.id) || [];
      subSchedule.push({ start: actualStart, end: actualEnd });
      substationSchedule.set(substation.id, subSchedule);
      
      nodeCompletionTimes.set(node.id, actualEnd);
      
      // 5k. Reserve substation
      await trx('mes.substations')
        .where('id', substation.id)
        .update({
          status: 'reserved',
          current_assignment_id: node.id,
          assigned_worker_id: worker.id,
          current_operation: node.operation_id,
          reserved_at: trx.fn.now(),
          updated_at: trx.fn.now()
        });
      
      // 5l. Track for response
      assignments.push({
        nodeId: node.node_id,
        nodeName: node.name,
        workerId: worker.id,
        workerName: worker.name,
        substationId: substation.id,
        substationName: substation.name,
        estimatedStart: actualStart,
        estimatedEnd: actualEnd,
        sequenceNumber,
        isQueued
      });
      
      console.log(`   ✓ ${node.name}: ${worker.name} @ ${substation.name} (seq ${sequenceNumber})`);
    }
    
    // 6. Update plan status
    await trx('mes.production_plans')
      .where('id', id)
      .update({
        status: 'active',
        launched_at: trx.fn.now()
      });
    
    await trx.commit();
    
    console.log(`✅ Plan launched: ${id} with ${nodes.length} nodes`);
    
    // 7. Build summary response
    const allStarts = assignments.map(a => a.estimatedStart);
    const allEnds = assignments.map(a => a.estimatedEnd);
    const minStart = new Date(Math.min(...allStarts.map(d => d.getTime())));
    const maxEnd = new Date(Math.max(...allEnds.map(d => d.getTime())));
    
    res.json({
      planId: id,
      status: 'active',
      launchedAt: new Date(),
      summary: {
        totalNodes: nodes.length,
        assignedNodes: assignments.length,
        totalWorkers: workerSchedule.size,
        totalSubstations: substationSchedule.size,
        estimatedStartTime: minStart,
        estimatedEndTime: maxEnd,
        estimatedDuration: Math.ceil((maxEnd - minStart) / 60000),
        parallelPaths: calculateParallelPaths(executionOrder, predecessors)
      },
      assignments,
      queuedTasks: queuedCount,
      warnings: []
    });
    
  } catch (error) {
    await trx.rollback();
    console.error('❌ Error launching plan:', error);
    res.status(500).json({ 
      error: 'Failed to launch plan',
      details: error.message 
    });
  }
});

/**
 * POST /api/mes/production-plans/:id/pause
 * Pause active plan
 */
router.post('/production-plans/:id/pause', withAuth, async (req, res) => {
  try {
    const [updated] = await db('mes.production_plans')
      .where('id', req.params.id)
      .where('status', 'active')
      .update({ 
        status: 'paused',
        paused_at: db.fn.now() 
      })
      .returning('*');
    
    if (!updated) {
      return res.status(400).json({ 
        error: 'Plan not found or not active' 
      });
    }
    
    console.log(`⏸️  Paused production plan: ${req.params.id}`);
    res.json(updated);
  } catch (error) {
    console.error('❌ Error pausing plan:', error);
    res.status(500).json({ 
      error: 'Failed to pause plan',
      details: error.message 
    });
  }
});

/**
 * POST /api/mes/production-plans/:id/resume
 * Resume paused plan
 */
router.post('/production-plans/:id/resume', withAuth, async (req, res) => {
  try {
    const [updated] = await db('mes.production_plans')
      .where('id', req.params.id)
      .where('status', 'paused')
      .update({ 
        status: 'active',
        resumed_at: db.fn.now() 
      })
      .returning('*');
    
    if (!updated) {
      return res.status(400).json({ 
        error: 'Plan not found or not paused' 
      });
    }
    
    console.log(`▶️  Resumed production plan: ${req.params.id}`);
    res.json(updated);
  } catch (error) {
    console.error('❌ Error resuming plan:', error);
    res.status(500).json({ 
      error: 'Failed to resume plan',
      details: error.message 
    });
  }
});

// ============================================================================
// ============================================================================
// NODE MANAGEMENT
// ============================================================================
// ============================================================================

/**
 * GET /api/mes/production-plans/:planId/nodes
 * List all nodes for a production plan with materials and stations
 */
router.get('/production-plans/:planId/nodes', withAuth, async (req, res) => {
  try {
    const { planId } = req.params;
    
    // Check plan exists
    const plan = await db('mes.production_plans')
      .where('id', planId)
      .first();
    
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    // Get nodes with materials and stations
    const nodes = await db('mes.production_plan_nodes as n')
      .where('n.plan_id', planId)
      .leftJoin('mes.operations as op', 'n.operation_id', 'op.id')
      .select(
        'n.*',
        'op.name as operation_name'
      )
      .orderBy('n.sequence_order');
    
    // Get materials for each node
    const materials = await db('mes.node_material_inputs')
      .whereIn('node_id', nodes.map(n => n.id));
    
    // Get stations for each node
    const stations = await db('mes.node_stations as ns')
      .whereIn('ns.node_id', nodes.map(n => n.id))
      .leftJoin('mes.stations as s', 'ns.station_id', 's.id')
      .select(
        'ns.node_id',
        'ns.station_id',
        'ns.priority',
        's.name as station_name'
      )
      .orderBy('ns.priority');
    
    // Assemble response
    const nodesWithDetails = nodes.map(node => ({
      ...node,
      material_inputs: materials
        .filter(m => m.node_id === node.id)
        .map(m => ({
          materialCode: m.material_code,
          requiredQuantity: m.required_quantity,
          unitRatio: m.unit_ratio,
          isDerived: m.is_derived
        })),
      assigned_stations: stations
        .filter(s => s.node_id === node.id)
        .map(s => ({
          stationId: s.station_id,
          stationName: s.station_name,
          priority: s.priority
        }))
    }));
    
    console.log(`✅ Fetched ${nodesWithDetails.length} nodes for plan: ${planId}`);
    res.json(nodesWithDetails);
    
  } catch (error) {
    console.error('❌ Error fetching nodes:', error);
    res.status(500).json({ 
      error: 'Failed to fetch nodes',
      details: error.message 
    });
  }
});

/**
 * POST /api/mes/production-plans/:planId/nodes
 * Add a new node to an existing plan (only if status = draft)
 */
router.post('/production-plans/:planId/nodes', withAuth, async (req, res) => {
  const trx = await db.transaction();
  
  try {
    const { planId } = req.params;
    const nodeData = req.body;
    
    // Check plan exists and is in draft
    const plan = await trx('mes.production_plans')
      .where('id', planId)
      .first();
    
    if (!plan) {
      await trx.rollback();
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    if (plan.status !== 'draft') {
      await trx.rollback();
      return res.status(400).json({ 
        error: 'Can only add nodes to draft plans',
        currentStatus: plan.status 
      });
    }
    
    // Calculate next sequence order
    const lastNode = await trx('mes.production_plan_nodes')
      .where('plan_id', planId)
      .orderBy('sequence_order', 'desc')
      .first();
    
    const sequenceOrder = nodeData.sequence_order || (lastNode ? lastNode.sequence_order + 1 : 1);
    
    // Calculate effective time
    const effectiveTime = nodeData.nominal_time / (nodeData.efficiency || 0.85);
    
    // Insert node
    const [node] = await trx('mes.production_plan_nodes')
      .insert({
        plan_id: planId,
        node_id: nodeData.node_id || `${planId}-node-${sequenceOrder}`,
        name: nodeData.name,
        operation_id: nodeData.operation_id,
        nominal_time: nodeData.nominal_time,
        efficiency: nodeData.efficiency || 0.85,
        effective_time: effectiveTime,
        assignment_mode: nodeData.assignment_mode || 'auto',
        output_code: nodeData.output_code,
        output_qty: nodeData.output_qty,
        output_unit: nodeData.output_unit,
        sequence_order: sequenceOrder,
        work_order_code: plan.work_order_code
      })
      .returning('*');
    
    // Insert material inputs
    if (nodeData.materialInputs && nodeData.materialInputs.length > 0) {
      const materialInserts = nodeData.materialInputs.map(mat => ({
        node_id: node.id,
        material_code: mat.materialCode,
        required_quantity: mat.requiredQuantity,
        unit_ratio: mat.unitRatio || 1.0,
        is_derived: mat.isDerived || false
      }));
      
      await trx('mes.node_material_inputs').insert(materialInserts);
    }
    
    // Insert station assignments
    if (nodeData.stationIds && nodeData.stationIds.length > 0) {
      const stationInserts = nodeData.stationIds.map((stationId, idx) => ({
        node_id: node.id,
        station_id: stationId,
        priority: idx + 1
      }));
      
      await trx('mes.node_stations').insert(stationInserts);
    }
    
    await trx.commit();
    
    console.log(`✅ Added node: ${node.name} to plan ${planId}`);
    
    // Return node with details
    const nodeWithDetails = await getPlanWithNodes(planId);
    const addedNode = nodeWithDetails.nodes.find(n => n.id === node.id);
    
    res.json(addedNode);
    
  } catch (error) {
    await trx.rollback();
    console.error('❌ Error adding node:', error);
    res.status(500).json({ 
      error: 'Failed to add node',
      details: error.message 
    });
  }
});

/**
 * GET /api/mes/production-plans/:planId/nodes/:nodeId
 * Get single node with full details
 */
router.get('/production-plans/:planId/nodes/:nodeId', withAuth, async (req, res) => {
  try {
    const { planId, nodeId } = req.params;
    
    // Get node (nodeId can be numeric id or node_id string)
    const node = await db('mes.production_plan_nodes as n')
      .where('n.plan_id', planId)
      .where(function() {
        this.where('n.id', nodeId).orWhere('n.node_id', nodeId);
      })
      .leftJoin('mes.operations as op', 'n.operation_id', 'op.id')
      .select(
        'n.*',
        'op.name as operation_name',
        'op.skills as operation_skills'
      )
      .first();
    
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    // Get material inputs
    const materials = await db('mes.node_material_inputs')
      .where('node_id', node.id)
      .select('*');
    
    // Get assigned stations
    const stations = await db('mes.node_stations as ns')
      .where('ns.node_id', node.id)
      .leftJoin('mes.stations as s', 'ns.station_id', 's.id')
      .select(
        'ns.station_id',
        'ns.priority',
        's.name as station_name',
        's.description as station_description'
      )
      .orderBy('ns.priority');
    
    // Assemble response
    const nodeDetails = {
      ...node,
      material_inputs: materials.map(m => ({
        materialCode: m.material_code,
        requiredQuantity: m.required_quantity,
        unitRatio: m.unit_ratio,
        isDerived: m.is_derived
      })),
      assigned_stations: stations.map(s => ({
        stationId: s.station_id,
        stationName: s.station_name,
        stationDescription: s.station_description,
        priority: s.priority
      }))
    };
    
    res.json(nodeDetails);
    
  } catch (error) {
    console.error('❌ Error fetching node:', error);
    res.status(500).json({ 
      error: 'Failed to fetch node',
      details: error.message 
    });
  }
});

/**
 * PUT /api/mes/production-plans/:planId/nodes/:nodeId
 * Update node (only if plan status = draft)
 */
router.put('/production-plans/:planId/nodes/:nodeId', withAuth, async (req, res) => {
  const trx = await db.transaction();
  
  try {
    const { planId, nodeId } = req.params;
    const updates = req.body;
    
    // Check plan is in draft
    const plan = await trx('mes.production_plans')
      .where('id', planId)
      .first();
    
    if (!plan) {
      await trx.rollback();
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    if (plan.status !== 'draft') {
      await trx.rollback();
      return res.status(400).json({ 
        error: 'Can only update nodes in draft plans',
        currentStatus: plan.status 
      });
    }
    
    // Get node
    const node = await trx('mes.production_plan_nodes')
      .where('plan_id', planId)
      .where(function() {
        this.where('id', nodeId).orWhere('node_id', nodeId);
      })
      .first();
    
    if (!node) {
      await trx.rollback();
      return res.status(404).json({ error: 'Node not found' });
    }
    
    // Prepare update data
    const updateData = {};
    if (updates.name) updateData.name = updates.name;
    if (updates.operation_id) updateData.operation_id = updates.operation_id;
    if (updates.nominal_time) {
      updateData.nominal_time = updates.nominal_time;
      updateData.effective_time = updates.nominal_time / (updates.efficiency || node.efficiency || 0.85);
    }
    if (updates.efficiency) {
      updateData.efficiency = updates.efficiency;
      updateData.effective_time = (updates.nominal_time || node.nominal_time) / updates.efficiency;
    }
    if (updates.output_code) updateData.output_code = updates.output_code;
    if (updates.output_qty) updateData.output_qty = updates.output_qty;
    if (updates.output_unit) updateData.output_unit = updates.output_unit;
    if (updates.sequence_order) updateData.sequence_order = updates.sequence_order;
    if (updates.assignment_mode) updateData.assignment_mode = updates.assignment_mode;
    
    updateData.updated_at = trx.fn.now();
    
    // Update node
    await trx('mes.production_plan_nodes')
      .where('id', node.id)
      .update(updateData);
    
    // Update materials if provided
    if (updates.materialInputs) {
      await trx('mes.node_material_inputs')
        .where('node_id', node.id)
        .delete();
      
      if (updates.materialInputs.length > 0) {
        const materialInserts = updates.materialInputs.map(mat => ({
          node_id: node.id,
          material_code: mat.materialCode,
          required_quantity: mat.requiredQuantity,
          unit_ratio: mat.unitRatio || 1.0,
          is_derived: mat.isDerived || false
        }));
        
        await trx('mes.node_material_inputs').insert(materialInserts);
      }
    }
    
    // Update stations if provided
    if (updates.stationIds) {
      await trx('mes.node_stations')
        .where('node_id', node.id)
        .delete();
      
      if (updates.stationIds.length > 0) {
        const stationInserts = updates.stationIds.map((stationId, idx) => ({
          node_id: node.id,
          station_id: stationId,
          priority: idx + 1
        }));
        
        await trx('mes.node_stations').insert(stationInserts);
      }
    }
    
    await trx.commit();
    
    console.log(`✅ Updated node: ${nodeId} in plan ${planId}`);
    
    // Return updated node
    const updatedNode = await db('mes.production_plan_nodes')
      .where('id', node.id)
      .first();
    
    res.json(updatedNode);
    
  } catch (error) {
    await trx.rollback();
    console.error('❌ Error updating node:', error);
    res.status(500).json({ 
      error: 'Failed to update node',
      details: error.message 
    });
  }
});

/**
 * DELETE /api/mes/production-plans/:planId/nodes/:nodeId
 * Delete node (only if plan status = draft)
 */
router.delete('/production-plans/:planId/nodes/:nodeId', withAuth, async (req, res) => {
  const trx = await db.transaction();
  
  try {
    const { planId, nodeId } = req.params;
    
    // Check plan is in draft
    const plan = await trx('mes.production_plans')
      .where('id', planId)
      .first();
    
    if (!plan) {
      await trx.rollback();
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    if (plan.status !== 'draft') {
      await trx.rollback();
      return res.status(400).json({ 
        error: 'Can only delete nodes from draft plans',
        currentStatus: plan.status 
      });
    }
    
    // Get node
    const node = await trx('mes.production_plan_nodes')
      .where('plan_id', planId)
      .where(function() {
        this.where('id', nodeId).orWhere('node_id', nodeId);
      })
      .first();
    
    if (!node) {
      await trx.rollback();
      return res.status(404).json({ error: 'Node not found' });
    }
    
    // Delete related data (CASCADE handles most, but explicit for clarity)
    await trx('mes.node_stations')
      .where('node_id', node.id)
      .delete();
    
    await trx('mes.node_material_inputs')
      .where('node_id', node.id)
      .delete();
    
    // Delete node
    await trx('mes.production_plan_nodes')
      .where('id', node.id)
      .delete();
    
    await trx.commit();
    
    console.log(`🗑️  Deleted node: ${nodeId} from plan ${planId}`);
    res.json({ 
      success: true,
      message: 'Node deleted successfully',
      nodeId: nodeId
    });
    
  } catch (error) {
    await trx.rollback();
    console.error('❌ Error deleting node:', error);
    res.status(500).json({ 
      error: 'Failed to delete node',
      details: error.message 
    });
  }
});

/**
 * POST /api/mes/nodes/:nodeId/materials
 * Add material input to a node
 */
router.post('/nodes/:nodeId/materials', withAuth, async (req, res) => {
  try {
    const { nodeId } = req.params;
    const { materialCode, requiredQuantity, unitRatio, isDerived } = req.body;
    
    // Get node and verify plan is draft
    const node = await db('mes.production_plan_nodes as n')
      .join('mes.production_plans as p', 'n.plan_id', 'p.id')
      .where('n.id', nodeId)
      .select('n.*', 'p.status as plan_status', 'p.work_order_code')
      .first();
    
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    if (node.plan_status !== 'draft') {
      return res.status(400).json({ 
        error: 'Can only modify materials in draft plans' 
      });
    }
    
    // Check if material already exists
    const existing = await db('mes.node_material_inputs')
      .where('node_id', nodeId)
      .where('material_code', materialCode)
      .first();
    
    if (existing) {
      return res.status(400).json({ 
        error: 'Material already added to this node' 
      });
    }
    
    // Insert material
    const [material] = await db('mes.node_material_inputs')
      .insert({
        node_id: nodeId,
        material_code: materialCode,
        required_quantity: requiredQuantity,
        unit_ratio: unitRatio || 1.0,
        is_derived: isDerived || false
      })
      .returning('*');
    
    console.log(`✅ Added material ${materialCode} to node ${nodeId}`);
    res.json(material);
    
  } catch (error) {
    console.error('❌ Error adding material:', error);
    res.status(500).json({ 
      error: 'Failed to add material',
      details: error.message 
    });
  }
});

/**
 * DELETE /api/mes/nodes/:nodeId/materials/:materialCode
 * Remove material input from a node
 */
router.delete('/nodes/:nodeId/materials/:materialCode', withAuth, async (req, res) => {
  try {
    const { nodeId, materialCode } = req.params;
    
    // Verify plan is draft
    const node = await db('mes.production_plan_nodes as n')
      .join('mes.production_plans as p', 'n.plan_id', 'p.id')
      .where('n.id', nodeId)
      .select('p.status as plan_status')
      .first();
    
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    if (node.plan_status !== 'draft') {
      return res.status(400).json({ 
        error: 'Can only modify materials in draft plans' 
      });
    }
    
    // Delete material
    const deleted = await db('mes.node_material_inputs')
      .where('node_id', nodeId)
      .where('material_code', materialCode)
      .delete();
    
    if (deleted === 0) {
      return res.status(404).json({ error: 'Material not found in node' });
    }
    
    console.log(`🗑️  Removed material ${materialCode} from node ${nodeId}`);
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
});

/**
 * POST /api/mes/nodes/:nodeId/stations
 * Assign station option to a node
 */
router.post('/nodes/:nodeId/stations', withAuth, async (req, res) => {
  try {
    const { nodeId } = req.params;
    const { stationId, priority } = req.body;
    
    // Get node and verify plan is draft
    const node = await db('mes.production_plan_nodes as n')
      .join('mes.production_plans as p', 'n.plan_id', 'p.id')
      .where('n.id', nodeId)
      .select('p.status as plan_status')
      .first();
    
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    if (node.plan_status !== 'draft') {
      return res.status(400).json({ 
        error: 'Can only modify stations in draft plans' 
      });
    }
    
    // Check if station already assigned
    const existing = await db('mes.node_stations')
      .where('node_id', nodeId)
      .where('station_id', stationId)
      .first();
    
    if (existing) {
      return res.status(400).json({ 
        error: 'Station already assigned to this node' 
      });
    }
    
    // Calculate priority if not provided
    let stationPriority = priority;
    if (!stationPriority) {
      const lastStation = await db('mes.node_stations')
        .where('node_id', nodeId)
        .orderBy('priority', 'desc')
        .first();
      
      stationPriority = lastStation ? lastStation.priority + 1 : 1;
    }
    
    // Insert station assignment
    const [station] = await db('mes.node_stations')
      .insert({
        node_id: nodeId,
        station_id: stationId,
        priority: stationPriority
      })
      .returning('*');
    
    console.log(`✅ Assigned station ${stationId} to node ${nodeId}`);
    res.json(station);
    
  } catch (error) {
    console.error('❌ Error assigning station:', error);
    res.status(500).json({ 
      error: 'Failed to assign station',
      details: error.message 
    });
  }
});

/**
 * DELETE /api/mes/nodes/:nodeId/stations/:stationId
 * Remove station option from a node
 */
router.delete('/nodes/:nodeId/stations/:stationId', withAuth, async (req, res) => {
  try {
    const { nodeId, stationId } = req.params;
    
    // Verify plan is draft
    const node = await db('mes.production_plan_nodes as n')
      .join('mes.production_plans as p', 'n.plan_id', 'p.id')
      .where('n.id', nodeId)
      .select('p.status as plan_status')
      .first();
    
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    if (node.plan_status !== 'draft') {
      return res.status(400).json({ 
        error: 'Can only modify stations in draft plans' 
      });
    }
    
    // Delete station assignment
    const deleted = await db('mes.node_stations')
      .where('node_id', nodeId)
      .where('station_id', stationId)
      .delete();
    
    if (deleted === 0) {
      return res.status(404).json({ error: 'Station not found in node' });
    }
    
    console.log(`🗑️  Removed station ${stationId} from node ${nodeId}`);
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
});

// ============================================================================
// ANALYTICS & DASHBOARD ENDPOINTS
// ============================================================================

/**
 * GET /api/mes/analytics/worker-utilization
 * Real-time worker utilization metrics for Production Dashboard
 * 
 * Returns:
 * - Active/Idle/Break distribution
 * - Per-worker efficiency
 * - Overall utilization rate
 */
router.get('/analytics/worker-utilization', withAuth, async (req, res) => {
  try {
    // Get all workers
    const workers = await db('mes.workers')
      .where('is_active', true)
      .select('id', 'name');
    
    // Get current assignments (in-progress)
    const activeAssignments = await db('mes.worker_assignments as wa')
      .join('mes.workers as w', 'w.id', 'wa.worker_id')
      .whereIn('wa.status', ['in_progress', 'ready'])
      .select('wa.worker_id', 'w.name as worker_name')
      .groupBy('wa.worker_id', 'w.name');
    
    const activeWorkerIds = new Set(activeAssignments.map(a => a.worker_id));
    
    const active = activeWorkerIds.size;
    const total = workers.length;
    const idle = total - active;
    const utilizationRate = total > 0 ? (active / total) * 100 : 0;
    
    // Per-worker details
    const perWorker = workers.map(w => ({
      workerId: w.id,
      name: w.name,
      isActive: activeWorkerIds.has(w.id),
      efficiency: 1.0 // Default efficiency since column doesn't exist
    }));
    
    res.json({
      active,
      idle,
      onBreak: 0, // TODO: Track break status
      total,
      utilizationRate: parseFloat(utilizationRate.toFixed(1)),
      perWorker
    });
    
  } catch (error) {
    console.error('❌ Worker utilization analytics error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch worker utilization',
      details: error.message 
    });
  }
});

/**
 * GET /api/mes/analytics/operation-bottlenecks
 * Operation performance analysis for bottleneck detection
 * 
 * Returns:
 * - Average time per operation
 * - Operation instance counts
 * - Top bottlenecks
 */
router.get('/analytics/operation-bottlenecks', withAuth, async (req, res) => {
  try {
    // Get completed assignments with timing
    const completedAssignments = await db('mes.worker_assignments as wa')
      .join('mes.operations as op', 'op.id', 'wa.operation_id')
      .join('mes.production_plan_nodes as n', 'n.id', 'wa.node_id')
      .where('wa.status', 'completed')
      .whereNotNull('wa.started_at')
      .whereNotNull('wa.completed_at')
      .select(
        'op.id as operation_id',
        'op.name as operation_name',
        'n.effective_time',
        db.raw(`EXTRACT(EPOCH FROM (wa.completed_at - wa.started_at)) / 60 as actual_minutes`)
      );
    
    // Aggregate by operation
    const operationStats = {};
    
    completedAssignments.forEach(a => {
      const opId = a.operation_id;
      if (!operationStats[opId]) {
        operationStats[opId] = {
          operationId: opId,
          operationName: a.operation_name,
          totalTime: 0,
          instances: 0,
          estimatedTime: 0
        };
      }
      
      operationStats[opId].totalTime += parseFloat(a.actual_minutes) || 0;
      operationStats[opId].estimatedTime += parseFloat(a.effective_time) || 0;
      operationStats[opId].instances += 1;
    });
    
    // Calculate averages and sort by average time
    const operations = Object.values(operationStats)
      .map(op => ({
        ...op,
        avgTime: op.instances > 0 ? op.totalTime / op.instances : 0,
        avgEstimated: op.instances > 0 ? op.estimatedTime / op.instances : 0,
        variance: op.instances > 0 ? ((op.totalTime / op.instances) - (op.estimatedTime / op.instances)) : 0
      }))
      .sort((a, b) => b.avgTime - a.avgTime);
    
    const topBottlenecks = operations.slice(0, 5);
    
    res.json({
      operations,
      topBottlenecks,
      totalOperations: operations.length
    });
    
  } catch (error) {
    console.error('❌ Operation bottleneck analytics error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch operation bottlenecks',
      details: error.message 
    });
  }
});

/**
 * GET /api/mes/analytics/material-consumption
 * Material stock levels and consumption tracking
 * 
 * Returns:
 * - Current stock levels
 * - Reserved amounts
 * - Low stock warnings
 */
router.get('/analytics/material-consumption', withAuth, async (req, res) => {
  try {
    const materials = await db('materials.materials')
      .select(
        'code',
        'name',
        'stock',
        'reserved',
        'wip_reserved',
        'unit',
        'reorder_point',
        'max_stock'
      )
      .where('is_active', true);
    
    const materialsWithStatus = materials.map(m => {
      const stock = parseFloat(m.stock) || 0;
      const reserved = parseFloat(m.reserved) || 0;
      const wipReserved = parseFloat(m.wip_reserved) || 0;
      const available = stock - reserved - wipReserved;
      const reorderPoint = parseFloat(m.reorder_point) || 0;
      const maxStock = parseFloat(m.max_stock) || 0;
      
      return {
        code: m.code,
        name: m.name,
        stock,
        reserved,
        wipReserved,
        available,
        unit: m.unit || 'pcs',
        reorderPoint,
        maxStock,
        isLowStock: available < reorderPoint,
        stockLevel: reorderPoint > 0 ? (available / reorderPoint) * 100 : 100
      };
    });
    
    const lowStockWarnings = materialsWithStatus
      .filter(m => m.isLowStock)
      .sort((a, b) => a.stockLevel - b.stockLevel);
    
    res.json({
      materials: materialsWithStatus,
      lowStockWarnings,
      totalMaterials: materialsWithStatus.length,
      lowStockCount: lowStockWarnings.length
    });
    
  } catch (error) {
    console.error('❌ Material consumption analytics error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch material consumption',
      details: error.message 
    });
  }
});

/**
 * GET /api/mes/analytics/production-velocity
 * Production performance metrics (throughput, completion rate)
 * 
 * Returns:
 * - Today's metrics
 * - Weekly trend
 * - Active/completed work orders
 */
router.get('/analytics/production-velocity', withAuth, async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now).setHours(0, 0, 0, 0);
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    
    // Today's metrics
    const todayPlans = await db('mes.production_plans')
      .where('launched_at', '>=', new Date(todayStart))
      .select('status')
      .count('* as count')
      .groupBy('status');
    
    const todayStats = {
      launched: 0,
      active: 0,
      completed: 0
    };
    
    todayPlans.forEach(p => {
      const count = parseInt(p.count) || 0;
      if (p.status === 'active') todayStats.active += count;
      if (p.status === 'completed') todayStats.completed += count;
      todayStats.launched += count;
    });
    
    // Active work orders (all time)
    const activeCount = await db('mes.production_plans')
      .where('status', 'active')
      .count('* as count')
      .first();
    
    const completedCount = await db('mes.production_plans')
      .where('status', 'completed')
      .count('* as count')
      .first();
    
    res.json({
      today: todayStats,
      overall: {
        active: parseInt(activeCount?.count) || 0,
        completed: parseInt(completedCount?.count) || 0
      }
    });
    
  } catch (error) {
    console.error('❌ Production velocity analytics error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch production velocity',
      details: error.message 
    });
  }
});

/**
 * GET /api/mes/analytics/master-timeline
 * Master Gantt chart data for all active work orders
 * 
 * Query params:
 * - startDate: Filter start date (optional)
 * - endDate: Filter end date (optional)
 * 
 * Returns:
 * - All active work orders with assignments
 * - Timeline data for Gantt visualization
 */
router.get('/analytics/master-timeline', withAuth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Get active production plans
    let plansQuery = db('mes.production_plans')
      .whereIn('status', ['active', 'paused']);
    
    if (startDate) {
      plansQuery = plansQuery.where('launched_at', '>=', startDate);
    }
    if (endDate) {
      plansQuery = plansQuery.where('launched_at', '<=', endDate);
    }
    
    const plans = await plansQuery.select('id', 'work_order_code', 'status', 'launched_at');
    
    // Get assignments for these plans
    const planIds = plans.map(p => p.id);
    
    if (planIds.length === 0) {
      return res.json({ workOrders: [], conflicts: [] });
    }
    
    const assignments = await db('mes.worker_assignments as wa')
      .join('mes.workers as w', 'w.id', 'wa.worker_id')
      .join('mes.substations as s', 's.id', 'wa.substation_id')
      .join('mes.production_plan_nodes as n', 'n.id', 'wa.node_id')
      .whereIn('wa.plan_id', planIds)
      .select(
        'wa.plan_id',
        'wa.node_id',
        'n.name as node_name',
        'w.id as worker_id',
        'w.name as worker_name',
        's.id as substation_id',
        's.name as substation_name',
        'wa.status',
        'wa.estimated_start_time',
        'wa.estimated_end_time',
        'wa.actual_start_time',
        'wa.actual_end_time'
      );
    
    // Group assignments by plan
    const workOrders = plans.map(plan => ({
      workOrderCode: plan.work_order_code,
      status: plan.status,
      launchedAt: plan.launched_at,
      assignments: assignments
        .filter(a => a.plan_id === plan.id)
        .map(a => ({
          nodeId: a.node_id,
          nodeName: a.node_name,
          workerId: a.worker_id,
          workerName: a.worker_name,
          substationId: a.substation_id,
          substationName: a.substation_name,
          status: a.status,
          start: a.actual_start_time || a.estimated_start_time,
          end: a.actual_end_time || a.estimated_end_time
        }))
    }));
    
    res.json({
      workOrders,
      conflicts: [] // TODO: Detect resource conflicts
    });
    
  } catch (error) {
    console.error('❌ Master timeline analytics error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch master timeline',
      details: error.message 
    });
  }
});

export default router;
