import express from 'express';
import db from '../db/connection.js';
import { getSession } from './auth.js';
import WorkOrders from '../db/models/workOrders.js';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { createRequire } from 'module';
import { 
  reserveMaterialsWithLotTracking, 
  getLotConsumptionPreview,
  releaseMaterialReservations
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
import { recordStatusChange } from './utils/statusHistory.js';

const requireModule = createRequire(import.meta.url);
const planSchema = requireModule('./models/ProductionPlanSchema.json');
const assignmentSchema = requireModule('./models/AssignmentSchema.json');
const featureFlags = requireModule('../config/featureFlags.cjs');

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
  reservationMismatchCount: 0,
  consumptionCappedCount: 0,
  validationErrorCount: 0,
  
  increment(metricName) {
    if (this.hasOwnProperty(metricName)) {
      this[metricName]++;
      console.log(`📊 METRIC: ${metricName} = ${this[metricName]}`);
    }
  },
  
  reset() {
    this.reservationMismatchCount = 0;
    this.consumptionCappedCount = 0;
    this.validationErrorCount = 0;
  },
  
  getAll() {
    return {
      reservationMismatchCount: this.reservationMismatchCount,
      consumptionCappedCount: this.consumptionCappedCount,
      validationErrorCount: this.validationErrorCount
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
    
    // Skip if this is an existing output (not newly created)
    if (node._outputMaterialId || node._outputSelectionMode === 'existing') {
      return node;
    }
    
    // Check if this node is a finished product (no other nodes use it as predecessor)
    const isFinishedProduct = !nodes.some(n => 
      Array.isArray(n.predecessors) && n.predecessors.includes(node.id || node.nodeId)
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
        'semiOutputCode', 
        'expectedDefectRate',
        'defaultEfficiency',
        'supervisorId',
        'skills',
        'createdAt',
        'updatedAt'
      )
      .orderBy('name');
    
    // Parse skills JSON and convert snake_case to camelCase for frontend
    const operations = result.map(op => ({
      id: op.id,
      name: op.name,
      type: op.type,
      semiOutputCode: op.semiOutputCode,
      expectedDefectRate: op.expectedDefectRate,
      defaultEfficiency: op.defaultEfficiency,
      supervisorId: op.supervisorId,
      skills: typeof op.skills === 'string' ? JSON.parse(op.skills) : (op.skills || []),
      createdAt: op.createdAt,
      updatedAt: op.updatedAt
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
          semiOutputCode: op.semiOutputCode || null,
          expectedDefectRate: op.expectedDefectRate || 0,
          defaultEfficiency: op.defaultEfficiency || 1.0,
          supervisorId: op.supervisorId || null,
          skills: JSON.stringify(op.skills || []),
          updatedAt: trx.fn.now()
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
            createdAt: trx.fn.now()
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
    const results = await db('mes.workers')
      .select(
        'id',
        'name',
        'email',
        'phone',
        'skills',
        'personalSchedule',
        'absences',
        'isActive',
        'currentTaskPlanId',
        'currentTaskNodeId',
        'currentTaskAssignmentId',
        'createdAt',
        'updatedAt'
      )
      .where('isActive', true)
      .orderBy('name');
    
    // Map snake_case to camelCase and parse JSONB
    const workers = results.map(w => ({
      id: w.id,
      name: w.name,
      email: w.email,
      phone: w.phone,
      skills: typeof w.skills === 'string' ? JSON.parse(w.skills) : w.skills,
      personalSchedule: typeof w.personalSchedule === 'string' ? JSON.parse(w.personalSchedule) : w.personalSchedule,
      absences: typeof w.absences === 'string' ? JSON.parse(w.absences) : (w.absences || []),
      isActive: w.isActive,
      currentTaskPlanId: w.currentTaskPlanId,
      currentTaskNodeId: w.currentTaskNodeId,
      currentTaskAssignmentId: w.currentTaskAssignmentId,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt
    }));
    
    res.json(workers);
  } catch (error) {
    console.error('Error fetching workers:', error);
    res.status(500).json({ error: 'Failed to fetch workers' });
  }
});

// POST /api/mes/workers - Batch upsert
router.post('/workers', withAuth, async (req, res) => {
  const { workers } = req.body;
  
  // Validation
  if (!Array.isArray(workers) || workers.length === 0) {
    return res.status(400).json({ error: 'Workers array is required' });
  }
  
  try {
    const trx = await db.transaction();
    
    try {
      for (const worker of workers) {
        const { id, name, skills, personalSchedule, absences, isActive, email, phone } = worker;
        
        // Validate required fields
        if (!name) {
          throw new Error('Worker name is required');
        }
        if (!Array.isArray(skills) || skills.length === 0) {
          throw new Error('At least one skill is required');
        }
        if (absences && !Array.isArray(absences)) {
          throw new Error('Absences must be an array');
        }
        
        // Generate worker ID if not provided (WK-001 format)
        let workerId = id;
        if (!workerId) {
          const [{ maxId }] = await trx('mes.workers').max('id as maxId');
          const nextNum = maxId ? parseInt(maxId.split('-')[1]) + 1 : 1;
          workerId = `WK-${nextNum.toString().padStart(3, '0')}`;
        }
        
        // Map camelCase to snake_case for DB
        const dbWorker = {
          id: workerId,
          name,
          email: email || null,
          phone: phone || null,
          skills: JSON.stringify(skills),
          personalSchedule: personalSchedule ? JSON.stringify(personalSchedule) : null,
          absences: absences ? JSON.stringify(absences) : '[]',
          isActive: isActive !== undefined ? isActive : true,
          updatedAt: trx.fn.now()
        };
        
        // Upsert: insert or update if exists
        const exists = await trx('mes.workers').where('id', workerId).first();
        
        if (exists) {
          await trx('mes.workers')
            .where('id', workerId)
            .update(dbWorker);
        } else {
          await trx('mes.workers')
            .insert({
              ...dbWorker,
              createdAt: trx.fn.now()
            });
        }
      }
      
      await trx.commit();
      
      // Return updated workers with field mapping
      const results = await db('mes.workers')
        .select('id', 'name', 'skills', 'personalSchedule', 'absences', 'isActive', 'createdAt', 'updatedAt')
        .whereIn('id', workers.map(w => w.id).filter(Boolean))
        .orWhere(function() {
          this.whereIn('name', workers.map(w => w.name));
        });
      
      const mappedResults = results.map(w => ({
        id: w.id,
        name: w.name,
        skills: typeof w.skills === 'string' ? JSON.parse(w.skills) : w.skills,
        personalSchedule: typeof w.personalSchedule === 'string' ? JSON.parse(w.personalSchedule) : w.personalSchedule,
        absences: typeof w.absences === 'string' ? JSON.parse(w.absences) : (w.absences || []),
        isActive: w.isActive,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt
      }));
      
      res.json(mappedResults);
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error saving workers:', error);
    res.status(500).json({ error: error.message || 'Failed to save workers' });
  }
});


// GET /api/mes/workers/:id/assignments - Get worker assignments
router.get('/workers/:id/assignments', withAuth, async (req, res) => {
  const { id } = req.params;
  const { status } = req.query; // 'active', 'pending', 'completed', etc.
  
  try {
    // Get worker info
    const worker = await db('mes.workers')
      .select('id', 'name')
      .where('id', id)
      .first();
    
    if (!worker) {
      return res.status(404).json({ error: 'Worker not found' });
    }
    
    // Build query for assignments
    let query = db('mes.worker_assignments')
      .select(
        'id',
        'planId',
        'workOrderCode',
        'nodeId',
        'operationId',
        'workerId',
        'workerName',
        'stationId',
        'substationId',
        'status',
        'materials',
        'quantity',
        'priority',
        'isUrgent',
        'createdAt',
        'assignedAt',
        'startedAt',
        'completedAt',
        'expectedStart',
        'plannedEnd',
        'estimatedStartTime',
        'estimatedEndTime'
      )
      .where('workerId', id)
      .orderBy('expectedStart', 'asc');
    
    // Filter by status if provided
    if (status === 'active') {
      query = query.whereIn('status', ['pending', 'ready', 'in_progress']);
    } else if (status) {
      query = query.where('status', status);
    }
    
    const assignments = await query;
    
    // Parse JSONB fields
    const parsedAssignments = assignments.map(assignment => ({
      ...assignment,
      materials: typeof assignment.materials === 'string' ? JSON.parse(assignment.materials) : assignment.materials
    }));
    
    res.json({
      workerId: id,
      workerName: worker.name,
      assignments: parsedAssignments
    });
  } catch (error) {
    console.error('Error fetching worker assignments:', error);
    res.status(500).json({ error: 'Failed to fetch worker assignments' });
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
      .where('isActive', true);
    
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
        isActive: false,
        updatedAt: db.fn.now()
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
      .where('isActive', true)
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
      operationIds: row.operationIds || [],
      subSkills: row.subSkills || [],
      status: row.isActive ? 'active' : 'inactive',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
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
          operationIds: station.operationIds ? JSON.stringify(station.operationIds) : '[]',
          subSkills: station.subSkills ? JSON.stringify(station.subSkills) : '[]',
          isActive: station.status === 'active',
          updatedAt: trx.fn.now()
        };

        // Upsert station (INSERT ... ON CONFLICT UPDATE)
        const [result] = await trx('mes.stations')
          .insert({ ...dbRecord, createdAt: trx.fn.now() })
          .onConflict('id')
          .merge(['name', 'type', 'description', 'location', 'capabilities', 'substations', 'operationIds', 'subSkills', 'isActive', 'updatedAt'])
          .returning('*');
        
        // Sync substations to mes.substations table
        if (Array.isArray(station.subStations) && station.subStations.length > 0) {
          // Delete existing substations for this station that are no longer in the list
          const newSubStationCodes = station.subStations.map(s => s.code);
          await trx('mes.substations')
            .where('stationId', station.id)
            .whereNotIn('id', newSubStationCodes)
            .delete();
          
          // Upsert each substation
          for (const subStation of station.subStations) {
            // Generate name from station name and substation code
            // Example: "Kesim İstasyonu" + "ST-KA-001-01" → "Kesim İstasyonu - 01"
            const subStationNumber = subStation.code.split('-').pop(); // Get last part (01, 02, etc.)
            const subStationName = `${station.name} - ${subStationNumber}`;
            
            await trx('mes.substations')
              .insert({
                id: subStation.code,
                name: subStationName,
                stationId: station.id,
                status: subStation.status || 'active',
                isActive: subStation.status !== 'inactive',
                createdAt: trx.fn.now(),
                updatedAt: trx.fn.now()
              })
              .onConflict('id')
              .merge(['name', 'status', 'isActive', 'updatedAt']);
          }
        } else {
          // If no substations, delete all existing ones for this station
          await trx('mes.substations')
            .where('stationId', station.id)
            .delete();
        }
        
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
    // Get station with its required skills
    const station = await db('mes.stations')
      .select('id', 'name', 'subSkills', 'operationIds')
      .where({ id, isActive: true })
      .first();
    
    if (!station) {
      return res.status(404).json({ error: 'Station not found' });
    }
    
    // Parse required skills (combination of sub_skills and inherited from operations)
    const subSkills = Array.isArray(station.subSkills) ? station.subSkills : [];
    const operationIds = Array.isArray(station.operationIds) ? station.operationIds : [];
    
    // Get skills from operations
    let inheritedSkills = [];
    if (operationIds.length > 0) {
      const operations = await db('mes.operations')
        .select('skills')
        .whereIn('id', operationIds);
      
      operations.forEach(op => {
        const opSkills = Array.isArray(op.skills) ? op.skills : [];
        inheritedSkills.push(...opSkills);
      });
    }
    
    // Combine all required skills (unique)
    const allRequiredSkills = Array.from(new Set([...subSkills, ...inheritedSkills]));
    
    // Get all active workers
    const workers = await db('mes.workers')
      .select('id', 'name', 'skills', 'email', 'phone')
      .where('isActive', true)
      .orderBy('name');
    
    // Filter workers who have at least one matching skill
    const compatibleWorkers = workers
      .map(w => ({
        id: w.id,
        name: w.name,
        email: w.email,
        phone: w.phone,
        skills: Array.isArray(w.skills) ? w.skills : [],
        matchingSkills: []
      }))
      .filter(worker => {
        // Find matching skills
        worker.matchingSkills = worker.skills.filter(skill => 
          allRequiredSkills.includes(skill)
        );
        return worker.matchingSkills.length > 0;
      })
      .sort((a, b) => b.matchingSkills.length - a.matchingSkills.length); // Sort by skill match count
    
    res.json({
      stationId: id,
      stationName: station.name,
      requiredSkills: allRequiredSkills,
      compatibleWorkers: compatibleWorkers
    });
  } catch (error) {
    console.error('Error fetching station workers:', error);
    res.status(500).json({ error: 'Failed to fetch station workers' });
  }
});

// DELETE /api/mes/stations/:id - Delete a station and its substations
router.delete('/stations/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    const trx = await db.transaction();
    
    try {
      // First, delete all substations belonging to this station (hard delete)
      await trx('mes.substations')
        .where({ stationId: id })
        .delete();
      
      // Then, delete the station (hard delete)
      const deletedCount = await trx('mes.stations')
        .where({ id })
        .delete();
      
      if (deletedCount === 0) {
        await trx.rollback();
        return res.status(404).json({ error: 'Station not found' });
      }
      
      await trx.commit();
      res.json({ success: true, id });
    } catch (error) {
      await trx.rollback();
      throw error;
    }
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
      .select('id', 'name', 'description', 'isActive', 'createdAt', 'updatedAt')
      .where('isActive', true)
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
    const [{ maxId }] = await db('mes.skills').max('id as maxId');
    const nextNum = maxId ? parseInt(maxId.split('-')[1]) + 1 : 1;
    const newId = `skill-${nextNum.toString().padStart(3, '0')}`;
    
    const result = await db('mes.skills')
      .insert({
        id: newId,
        name,
        description,
        isActive: true,
        createdAt: db.fn.now(),
        updatedAt: db.fn.now(),
        createdBy: req.user?.email || 'system'
      })
      .returning(['id', 'name', 'description', 'isActive', 'createdAt']);
    
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
        updatedAt: db.fn.now(),
        updatedBy: req.user?.email || 'system'
      })
      .returning(['id', 'name', 'description', 'isActive', 'updatedAt']);
    
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
        isActive: false,
        updatedAt: db.fn.now(),
        updatedBy: req.user?.email || 'system'
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
        'quoteId',
        'status',
        'data',
        'createdAt',
        'updatedAt'
      )
      .orderBy('createdAt', 'desc');
    
    res.json({ workOrders });
  } catch (error) {
    console.error('Error fetching work orders:', error);
    res.status(500).json({ error: 'Failed to fetch work orders' });
  }
});

// POST /api/mes/work-orders - Create work order
router.post('/work-orders', withAuth, async (req, res) => {
  const { quoteId, status, data } = req.body;
  
  try {
    // Generate WO code (WO-001, WO-002, WO-003...)
    const [{ maxCode }] = await db('mes.work_orders')
      .max('code as maxCode');
    
    let nextNum = 1;
    if (maxCode) {
      const match = maxCode.match(/WO-(\d+)/);
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
        quoteId,
        status: status || 'pending',
        data: data ? JSON.stringify(data) : null,
        createdAt: db.fn.now(),
        updatedAt: db.fn.now()
      })
      .returning(['id', 'code', 'quoteId', 'status', 'data', 'createdAt', 'updatedAt']);
    
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
      updatedAt: db.fn.now()
    };
    
    // Only update provided fields
    if (quoteId !== undefined) updateData.quoteId = quoteId;
    if (status !== undefined) updateData.status = status;
    if (data !== undefined) updateData.data = JSON.stringify(data);
    
    const [workOrder] = await db('mes.work_orders')
      .where({ id })
      .update(updateData)
      .returning(['id', 'code', 'quoteId', 'status', 'data', 'updatedAt']);
    
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
    const [{ maxCode }] = await db('mes.work_orders')
      .max('code as maxCode');
    
    let nextNum = 1;
    if (maxCode) {
      const match = maxCode.match(/WO-(\\d+)/);
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
    // Fetch from work_orders table joined with quotes for customer info
    const workOrders = await db('mes.work_orders as wo')
      .leftJoin('quotes.quotes as q', 'wo.quoteId', 'q.id')
      .select(
        'wo.id',
        'wo.code as workOrderCode',
        'wo.quoteId',
        'wo.status',
        'wo.productionState',
        'wo.productionStateUpdatedAt',
        'wo.productionStateUpdatedBy',
        'wo.createdAt',
        'wo.data',
        'q.customerName as customer',
        'q.customerCompany as company',
        'q.customerEmail as email',
        'q.customerPhone as phone',
        'q.finalPrice',
        'q.deliveryDate'
      )
      .orderBy('wo.createdAt', 'desc');
    
    // Transform to include data from JSONB field
    const approvedQuotes = workOrders.map(wo => {
      let data = {};
      try {
        data = typeof wo.data === 'string' ? JSON.parse(wo.data) : (wo.data || {});
      } catch (e) {
        console.error(`Failed to parse data for WO ${wo.workOrderCode}:`, e);
      }
      
      // Format delivery date
      let deliveryDate = data.deliveryDate || wo.deliveryDate;
      if (deliveryDate && !(deliveryDate instanceof Date)) {
        try {
          deliveryDate = new Date(deliveryDate).toISOString();
        } catch (e) {
          deliveryDate = null;
        }
      } else if (deliveryDate instanceof Date) {
        deliveryDate = deliveryDate.toISOString();
      }
      
      return {
        id: wo.id,
        workOrderCode: wo.workOrderCode,
        quoteId: wo.quoteId,
        status: wo.status,
        productionState: wo.productionState,
        productionStateUpdatedAt: wo.productionStateUpdatedAt,
        productionStateUpdatedBy: wo.productionStateUpdatedBy,
        createdAt: wo.createdAt,
        customer: wo.customer,
        company: wo.company,
        email: wo.email,
        phone: wo.phone,
        price: data.price || wo.finalPrice,
        deliveryDate,
        formData: data.formData,
        quoteSnapshot: data.quoteSnapshot
      };
    });
    
    console.log(`✅ Fetched ${approvedQuotes.length} work orders from mes.work_orders`);
    res.json({ approvedQuotes });
  } catch (error) {
    console.error('❌ Error fetching approved quotes:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: 'Failed to fetch approved quotes', details: error.message });
  }
});

// POST /api/mes/approved-quotes/ensure - Ensure an approved quote is copied as WO (PostgreSQL)
router.post('/approved-quotes/ensure', withAuth, async (req, res) => {
  try {
    const { quoteId } = req.body || {};
    console.log(`🔍 [ENSURE] Starting WO creation for quote: ${quoteId}`);
    
    if (!quoteId) {
      console.log('❌ [ENSURE] No quoteId provided');
      return res.status(400).json({ success: false, error: 'quoteId_required' });
    }

    // Check if WO already exists in quotes table
    console.log(`🔍 [ENSURE] Checking if WO already exists for quote: ${quoteId}`);
    const existingQuote = await db('quotes.quotes')
      .where('id', quoteId)
      .first('workOrderCode', 'status');
    
    if (!existingQuote) {
      console.log(`❌ [ENSURE] Quote not found in PostgreSQL: ${quoteId}`);
      return res.status(404).json({ success: false, error: 'quote_not_found' });
    }

    if (existingQuote.workOrderCode) {
      console.log(`ℹ️ [ENSURE] WO already exists: ${existingQuote.workOrderCode}`);
      return res.json({ 
        success: true, 
        ensured: true, 
        workOrderCode: existingQuote.workOrderCode 
      });
    }

    // Validate quote status
    const st = String(existingQuote.status || '').toLowerCase();
    if (!(st === 'approved' || st === 'onaylandı' || st === 'onaylandi')) {
      console.log(`❌ [ENSURE] Quote not approved. Status: ${existingQuote.status}`);
      return res.status(400).json({ 
        success: false, 
        error: 'quote_not_approved', 
        status: existingQuote.status || null 
      });
    }

    // WO should have been created by Quotes.updateStatus()
    // If not, something went wrong - return error
    console.log(`⚠️ [ENSURE] Quote is approved but no WO found - may have failed during approval`);
    return res.status(500).json({ 
      success: false, 
      error: 'wo_creation_failed',
      message: 'Work order should have been created during quote approval'
    });
    
  } catch (error) {
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
      // Return minimal defaults if no master data exists
      console.warn('⚠️ No master-data found in mes.settings, returning minimal defaults');
      return res.json({
        availableSkills: [],
        availableOperationTypes: [],
        stationEfficiency: 1.0,
        workerEfficiency: 1.0,
        timeSettings: null  // No time settings available
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
    
    // Return timeSettings as-is from database (no default injection)
    // Frontend should handle missing/empty timeSettings gracefully
    
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
      INSERT INTO mes.settings (id, key, value, "updatedAt", "updatedBy")
      VALUES (?, ?, ?::jsonb, NOW(), ?)
      ON CONFLICT (key) 
      DO UPDATE SET 
        value = EXCLUDED.value,
        "updatedAt" = NOW(),
        "updatedBy" = EXCLUDED."updatedBy"
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
        'p.planName as name',
        'p.description',
        'p.workOrderCode',
        'p.quoteId',
        'p.status',
        'p.createdAt',
        db.raw('COUNT(pn.id)::integer as "nodeCount"')
      )
      .leftJoin('mes.production_plan_nodes as pn', 'pn.planId', 'p.id')
      .where('p.status', 'template')
      .groupBy('p.id')
      .orderBy('p.createdAt', 'desc');
    
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
  // Frontend sends 'orderCode' but DB uses 'workOrderCode' - normalize
  const workOrderCode = req.body.workOrderCode || req.body.orderCode || null;
  const { id: templateId, quoteId, nodes, steps, templateName, name, description } = req.body;
  
  console.log('📥 Template save request:', { 
    templateId,
    workOrderCode, 
    orderCode: req.body.orderCode,
    hasNodes: !!nodes,
    hasSteps: !!steps,
    nodeCount: nodes?.length || steps?.length || 0,
    isUpdate: !!templateId,
    // DEBUG: planName tracking
    receivedName: name,
    receivedTemplateName: templateName,
    willSaveAs: name || templateName || null
  });
  
  const trx = await db.transaction();
  
  try {
    let planId;
    
    // Check if this is an UPDATE (template id provided)
    if (templateId) {
      // Verify template exists
      const existing = await trx('mes.production_plans')
        .where({ id: templateId, status: 'template' })
        .first();
      
      if (!existing) {
        await trx.rollback();
        return res.status(404).json({ error: 'Template not found' });
      }
      
      planId = templateId;
      console.log(`🔄 Updating existing template: ${planId}`);
      
      // DEBUG: Track what planName will be updated to
      const finalPlanName = name || templateName || null;
      console.log('🔍 PLAN NAME UPDATE DEBUG:', {
        receivedName: name,
        receivedTemplateName: templateName,
        finalPlanName: finalPlanName,
        planId: planId
      });
      
      // Delete existing nodes (cascade will handle related tables)
      await trx('mes.production_plan_nodes')
        .where('planId', planId)
        .del();
      
      // Update template header
      await trx('mes.production_plans')
        .where('id', planId)
        .update({
          planName: finalPlanName,
          description: description || null,
          workOrderCode: workOrderCode,
          quoteId: quoteId || null,
          updatedAt: trx.fn.now()
        });
      
    } else {
      // CREATE new template
      // 1. Generate plan ID (same ID system as production plans)
      const result = await trx('mes.production_plans')
        .max('id as maxId')
        .first();
      
      const maxId = result?.maxId;
      let nextNum = 1;
      
      if (maxId && typeof maxId === 'string' && maxId.includes('-')) {
        const parts = maxId.split('-');
        const numPart = parts[parts.length - 1];
        const parsed = parseInt(numPart, 10);
        if (!isNaN(parsed)) {
          nextNum = parsed + 1;
        }
      }
      
      planId = `PLAN-${nextNum.toString().padStart(3, '0')}`;
      
      console.log(`📋 Creating new template: ${planId} (workOrderCode: ${workOrderCode || 'none'})`);
      
      // DEBUG: Track what planName will be saved
      const finalPlanName = name || templateName || null;
      console.log('🔍 PLAN NAME DEBUG:', {
        receivedName: name,
        receivedTemplateName: templateName,
        finalPlanName: finalPlanName,
        planId: planId
      });
      
      // 2. Create template header - just a plan with status='template'
      await trx('mes.production_plans').insert({
        id: planId,
        planName: finalPlanName,
        description: description || null,
        workOrderCode: workOrderCode,  // Can be null for templates
        quoteId: quoteId || null,
        status: 'template', // Only difference from regular plans
        createdAt: trx.fn.now()
      });
    }
    
    // 3. Insert nodes if provided (frontend sends 'steps', normalize to 'nodes')
    const nodeList = nodes || steps || [];
    if (Array.isArray(nodeList) && nodeList.length > 0) {
      // Apply output code suffixes for finished products
      const processedNodes = applyOutputCodeSuffixes(nodeList);
      
      // Build frontend ID to backend nodeId mapping
      const idMapping = {};
      processedNodes.forEach((node, index) => {
        const frontendId = node.id || node.nodeId;
        // Extract numeric part from frontend ID (e.g., "node-1" → 1) or use sequenceOrder or index
        const numericPart = node.sequenceOrder || parseInt(String(frontendId).replace(/\D/g, '')) || (index + 1);
        const backendNodeId = `${planId}-node-${numericPart}`;
        idMapping[frontendId] = backendNodeId;
      });
      
      for (let nodeIndex = 0; nodeIndex < processedNodes.length; nodeIndex++) {
        const node = processedNodes[nodeIndex];
        // Get frontend ID and calculate backend nodeId (same logic as idMapping)
        const frontendId = node.id || node.nodeId;
        const numericPart = node.sequenceOrder || parseInt(String(frontendId).replace(/\D/g, '')) || (nodeIndex + 1);
        const stringNodeId = `${planId}-node-${numericPart}`;
        
        // Insert node
        const [nodeRecord] = await trx('mes.production_plan_nodes')
          .insert({
            planId: planId,
            nodeId: stringNodeId,  // Use consistent nodeId format
            workOrderCode: workOrderCode,  // Same as plan - can be null
            name: node.name,
            operationId: node.operationId,
            outputCode: node.outputCode,
            outputQty: node.outputQty || 1,
            outputUnit: node.outputUnit || 'adet',
            nominalTime: node.nominalTime || 0,
            efficiency: node.efficiency !== undefined ? parseFloat(node.efficiency) : 1.0,
            effectiveTime: node.effectiveTime || Math.round((node.nominalTime || 0) / (node.efficiency !== undefined ? parseFloat(node.efficiency) : 1.0)),
            sequenceOrder: numericPart,
            assignmentMode: node.assignmentMode || 'auto',
            x: node.x || 80,
            y: node.y || 80,
            createdAt: trx.fn.now()
          })
          .returning('id');
        
        const dbNodeId = nodeRecord.id;  // Integer ID for internal use
        
        // Insert material inputs if any
        if (node.materialInputs && node.materialInputs.length > 0) {
          const materialInputs = node.materialInputs.map(m => ({
            nodeId: stringNodeId,
            materialCode: m.materialCode,
            requiredQuantity: m.requiredQuantity,
            unitRatio: m.unitRatio || 1.0,
            isDerived: !!m.derivedFrom,
            createdAt: trx.fn.now()
          }));
          
          await trx('mes.node_material_inputs').insert(materialInputs);
        }
        
        // Insert station assignments if any
        const stationList = node.stationIds || (node.assignedStations?.map(s => s.stationId || s.id)) || [];
        if (stationList.length > 0) {
          const stationAssignments = stationList.map((stId, idx) => ({
            nodeId: stringNodeId,
            stationId: stId,
            priority: idx + 1,
            createdAt: trx.fn.now()
          }));
          
          await trx('mes.node_stations').insert(stationAssignments);
        }
        
        // Insert predecessors if any
        const predecessorList = node.predecessors || [];
        if (Array.isArray(predecessorList) && predecessorList.length > 0) {
          // Use the same stringNodeId calculated above (already in correct format)
          const predecessorRecords = predecessorList
            .map(predId => {
              // Map frontend ID to backend nodeId format
              const backendPredId = idMapping[predId] || predId;
              return {
                nodeId: stringNodeId,  // Use stringNodeId from above
                predecessorNodeId: backendPredId,
                createdAt: trx.fn.now()
              };
            });
          
          await trx('mes.node_predecessors').insert(predecessorRecords);
        }
      }
    }
    
    await trx.commit();
    
    console.log(`✅ Template created: ${planId} with ${nodeList.length} nodes`);
    
    // AUTO-CREATE FINISHED PRODUCT MATERIALS (if suffix was added)
    // Check if any nodes have "F" suffix that don't exist in materials table
    for (const node of nodeList) {
      if (node.outputCode && node.outputCode.endsWith('F')) {
        const baseCode = node.outputCode.slice(0, -1); // Remove 'F'
        
        // Check if finished product material exists
        const finishedExists = await db('materials.materials')
          .where('code', node.outputCode)
          .first();
        
        if (!finishedExists) {
          // Check if base material exists
          const baseMaterial = await db('materials.materials')
            .where('code', baseCode)
            .first();
          
          if (baseMaterial) {
            // Auto-create finished product material
            await db('materials.materials').insert({
              code: node.outputCode,
              name: `${baseMaterial.name} (Finished)`,
              category: baseMaterial.category || 'cat_finished_product',
              type: 'finished_product',
              unit: baseMaterial.unit || 'adet',
              status: 'Aktif',
              createdAt: db.fn.now()
            });
            console.log(`✅ Auto-created finished product material: ${node.outputCode} from ${baseCode}`);
          }
        }
      }
    }
    
    res.json({ 
      success: true, 
      id: planId,
      nodeCount: nodeList.length,
      message: `Template ${planId} created successfully`
    });
    
  } catch (error) {
    await trx.rollback();
    
    // Handle duplicate key error
    if (error.code === '23505') { // PostgreSQL unique violation
      return res.status(409).json({ 
        error: `${workOrderCode} için plan tasarlanmış plan var`,
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
    
    // Find work order
    const workOrder = await WorkOrders.getByCode(workOrderCode);
    
    if (!workOrder) {
      return res.status(404).json({ 
        error: `${workOrderCode} için iş emri bulunamadı. Quotes ekranından bu work order'ı oluşturup tekrar deneyin.`,
        code: 'work_order_not_found'
      });
    }
    
    // Update production state using model method
    const updatedBy = req.user?.email || 'system';
    const updated = await WorkOrders.updateProductionState(
      workOrderCode, 
      productionState, 
      updatedBy,
      '' // note
    );
    
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
        'w.name as workerName',
        's.name as substationName',
        'o.name as operationName',
        'p.id as planId',
        'pn.name as nodeName'
      )
      .join('mes.workers as w', 'w.id', 'wa.workerId')
      .join('mes.substations as s', 's.id', 'wa.substationId')
      .join('mes.operations as o', 'o.id', 'wa.operationId')
      .join('mes.production_plans as p', 'p.id', 'wa.planId')
      .join('mes.production_plan_nodes as pn', 'pn.id', 'wa.nodeId')
      .whereIn('wa.status', ['pending', 'in_progress', 'queued'])
      .orderBy('wa.estimatedStartTime', 'asc');
    
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
        's.name as substationName',
        'o.name as operationName',
        'p.id as planId',
        'pn.name as nodeName',
        'pn.outputCode',
        'pn.outputQty as nodeQuantity'
      )
      .join('mes.substations as s', 's.id', 'wa.substationId')
      .join('mes.operations as o', 'o.id', 'wa.operationId')
      .join('mes.production_plans as p', 'p.id', 'wa.planId')
      .join('mes.production_plan_nodes as pn', 'pn.id', 'wa.nodeId')
      .where('wa.workerId', workerId)
      .whereIn('wa.status', ['pending', 'in_progress', 'queued'])
      .orderBy('wa.sequenceNumber', 'asc');
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching worker assignments:', error);
    res.status(500).json({ error: 'Failed to fetch worker assignments' });
  }
});

// ============================================================================
// OUTPUT CODE MANAGEMENT
// ============================================================================

/**
 * GET /api/mes/output-codes/validate?code=Be-008
 * Validate if output code already exists in materials table
 */
router.get('/output-codes/validate', withAuth, async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).json({ error: 'code parameter required' });
    }
    
    const material = await db('materials.materials')
      .where({ code })
      .first();
    
    if (material) {
      res.json({
        exists: true,
        material: {
          id: material.id,
          code: material.code,
          name: material.name,
          unit: material.unit,
          category: material.category
        }
      });
    } else {
      res.json({ exists: false });
    }
  } catch (error) {
    console.error('Error validating output code:', error);
    res.status(500).json({ error: 'Failed to validate output code' });
  }
});

/**
 * GET /api/mes/output-codes/existing?prefix=Be
 * Query existing semi-finished and finished products
 * Optionally filter by prefix
 */
router.get('/output-codes/existing', withAuth, async (req, res) => {
  try {
    const { prefix } = req.query;
    
    let query = db('materials.materials')
      .whereIn('type', ['semi_finished', 'finished_product'])
      .where('status', 'Aktif')
      .orderBy('code', 'asc');
    
    if (prefix) {
      query = query.where('code', 'like', `${prefix}%`);
    }
    
    const materials = await query;
    
    const outputs = materials.map(m => ({
      id: m.id,
      code: m.code,
      name: m.name,
      unit: m.unit,
      category: m.category
    }));
    
    res.json(outputs);
  } catch (error) {
    console.error('Error fetching existing outputs:', error);
    res.status(500).json({ error: 'Failed to fetch existing outputs' });
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
      .select('status', 'inputScrapCount', 'productionScrapCount', 'defectQuantity');
    
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
      const current = assignment.inputScrapCount || {};
      current[entry.materialCode] = (current[entry.materialCode] || 0) + entry.quantity;
      updateData.inputScrapCount = current;
      
    } else if (scrapType === 'production_scrap') {
      const current = assignment.productionScrapCount || {};
      current[entry.materialCode] = (current[entry.materialCode] || 0) + entry.quantity;
      updateData.productionScrapCount = current;
      
    } else if (scrapType === 'output_scrap') {
      updateData.defectQuantity = (assignment.defectQuantity || 0) + entry.quantity;
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
      .select('inputScrapCount', 'productionScrapCount', 'defectQuantity', 'status');
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    res.json({
      assignmentId,
      inputScrapCounters: assignment.inputScrapCount || {},
      productionScrapCounters: assignment.productionScrapCount || {},
      defectQuantity: assignment.defectQuantity || 0,
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
      .select('inputScrapCount', 'productionScrapCount', 'defectQuantity');
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    const updateData = {};
    
    if (scrapType === 'input_damaged') {
      const current = assignment.inputScrapCount || {};
      current[materialCode] = Math.max(0, (current[materialCode] || 0) - decrementAmount);
      updateData.inputScrapCount = current;
      
    } else if (scrapType === 'production_scrap') {
      const current = assignment.productionScrapCount || {};
      current[materialCode] = Math.max(0, (current[materialCode] || 0) - decrementAmount);
      updateData.productionScrapCount = current;
      
    } else if (scrapType === 'output_scrap') {
      updateData.defectQuantity = Math.max(0, (assignment.defectQuantity || 0) - decrementAmount);
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
        'isRead',
        'isResolved',
        'createdAt',
        'resolvedAt',
        'resolvedBy'
      );
    
    // Apply filters
    if (type) {
      query = query.where('type', type);
    }
    
    if (status) {
      // Map status to is_resolved/is_read flags
      if (status === 'active') {
        query = query.where('isResolved', false);
      } else if (status === 'resolved') {
        query = query.where('isResolved', true);
      }
    }
    
    // Order by most recent
    query = query.orderBy('createdAt', 'desc');
    
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
        'stationId',
        'description',
        'isActive',
        'createdAt',
        'updatedAt'
      )
      .where('isActive', true);
    
    // Optional filter by station
    if (stationId) {
      query = query.where('stationId', stationId);
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
  const { name, stationId, description } = req.body;
  
  if (!name || !stationId) {
    return res.status(400).json({ error: 'Name and stationId are required' });
  }
  
  try {
    // Get station info for code prefix
    const station = await db('mes.stations')
      .select('id', 'substations')
      .where('id', stationId)
      .first();
    
    if (!station) {
      return res.status(404).json({ error: 'Station not found' });
    }
    
    // Parse station code (ST-Ar-001 → Ar-001)
    const stationCode = stationId.replace('ST-', '');
    
    // Count existing substations for this station
    const existingCount = await db('mes.substations')
      .where('stationId', stationId)
      .count('* as count');
    
    const nextNum = parseInt(existingCount[0].count) + 1;
    const newId = `ST-${stationCode}-${nextNum.toString().padStart(2, '0')}`;
    
    // Insert substation
    const result = await db('mes.substations')
      .insert({
        id: newId,
        name,
        stationId,
        description,
        isActive: true,
        createdAt: db.fn.now(),
        updatedAt: db.fn.now()
      })
      .returning('*');
    
    // Update station's substations array
    const currentSubstations = station.substations || [];
    await db('mes.stations')
      .where('id', stationId)
      .update({
        substations: JSON.stringify([...currentSubstations, newId]),
        updatedAt: db.fn.now()
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
    
    const { applyDeferredReservation } = await import('./utils/fifoScheduler.js');
    
    // ✅ TRANSACTION: Prevent race conditions between concurrent resets
    const result = await db.transaction(async (trx) => {
      // ✅ STEP 1: Find substations with orphaned/stale reservations (limbo state)
      // These have currentAssignmentId but:
      // - Assignment doesn't exist
      // - Assignment is completed/cancelled
      // - Assignment is pending/queued (never started, safe to re-reserve)
      const orphaned = await trx('mes.substations as s')
        .leftJoin('mes.worker_assignments as a', 's.currentAssignmentId', 'a.id')
        .whereNotNull('s.currentAssignmentId')
        .where(function() {
          this.whereNull('a.id') // Assignment doesn't exist
              .orWhereIn('a.status', ['completed', 'cancelled', 'pending', 'queued']); // Done or never started
        })
        .select('s.id');
      
      if (orphaned.length > 0) {
        console.log(`🧹 [RESET] Cleaning ${orphaned.length} orphaned/stale substation reservations...`);
        await trx('mes.substations')
          .whereIn('id', orphaned.map(s => s.id))
          .update({
            status: 'available',
            currentAssignmentId: null,
            assignedWorkerId: null,
            currentOperation: null,
            reservedAt: null,
            updatedAt: trx.fn.now()
          });
      }
      
      // ✅ STEP 2: Reset isActive flag (skip in_use stations with active work)
      const substations = await trx('mes.substations')
        .whereNotIn('status', ['in_use']) // Skip stations with active work
        .update({
          isActive: true,
          updatedAt: trx.fn.now()
        })
        .returning('id');
      
      return { substations, orphanedCount: orphaned.length };
    });
    
    const { substations, orphanedCount } = result;
    const resetCount = substations.length;
    
    console.log(`✅ Reset complete: ${resetCount} substation(s) set to active`);
    if (orphanedCount > 0) {
      console.log(`🧹 Cleaned ${orphanedCount} orphaned reservations`);
    }
    
    // Check deferred reservations AFTER transaction completes
    console.log('🔍 Checking deferred reservations after reset...');
    let appliedCount = 0;
    for (const sub of substations) {
      const applied = await applyDeferredReservation(sub.id);
      if (applied) appliedCount++;
    }
    if (appliedCount > 0) {
      console.log(`✅ Applied ${appliedCount} deferred reservations`);
    }
    
    res.json({
      success: true,
      resetCount,
      orphanedCleaned: orphanedCount,
      appliedReservations: appliedCount,
      message: `${resetCount} alt istasyon sıfırlandı${orphanedCount > 0 ? `, ${orphanedCount} limbo temizlendi` : ''}${appliedCount > 0 ? `, ${appliedCount} rezervasyon uygulandı` : ''}`
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
  const { name, description, stationId, isActive } = req.body;
  
  try {
    // Get current substation to know which station it belongs to
    const currentSubstation = await db('mes.substations')
      .select('stationId', 'isActive')
      .where({ id })
      .first();
    
    if (!currentSubstation) {
      return res.status(404).json({ error: 'Substation not found' });
    }
    
    const updateData = {
      updatedAt: db.fn.now()
    };
    
    // Only update provided fields
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (stationId !== undefined) updateData.stationId = stationId;
    if (isActive !== undefined) updateData.isActive = isActive;
    
    const result = await db('mes.substations')
      .where({ id })
      .update(updateData)
      .returning('*');
    
    // If soft deleting (isActive=false), remove from station's substations array
    if (isActive === false && currentSubstation.isActive === true) {
      const station = await db('mes.stations')
        .select('substations')
        .where('id', currentSubstation.stationId)
        .first();
      
      if (station && station.substations) {
        const updatedSubstations = (station.substations || []).filter(subId => subId !== id);
        await db('mes.stations')
          .where('id', currentSubstation.stationId)
          .update({
            substations: JSON.stringify(updatedSubstations),
            updatedAt: db.fn.now()
          });
      }
    }
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error updating substation:', error);
    res.status(500).json({ error: 'Failed to update substation' });
  }
});

// PUT /api/mes/substations/:id/technical-status - Update technical status
router.put('/substations/:id/technical-status', withAuth, async (req, res) => {
  const { id } = req.params;
  const { technicalStatus } = req.body;
  
  try {
    // Validate technical status
    const validStatuses = ['active', 'passive', 'maintenance'];
    if (!validStatuses.includes(technicalStatus)) {
      return res.status(400).json({ error: 'Invalid technical status. Must be: active, passive, or maintenance' });
    }
    
    // Map technicalStatus to isActive
    const isActive = technicalStatus === 'active';
    
    const result = await db('mes.substations')
      .where({ id })
      .update({
        technicalStatus,
        isActive,
        updatedAt: db.fn.now()
      })
      .returning('*');
    
    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Substation not found' });
    }
    
    // If deactivating (passive/maintenance), remove from station's substations array
    if (!isActive) {
      const substation = result[0];
      const station = await db('mes.stations')
        .select('substations')
        .where('id', substation.stationId)
        .first();
      
      if (station && station.substations) {
        const updatedSubstations = (station.substations || []).filter(subId => subId !== id);
        await db('mes.stations')
          .where('id', substation.stationId)
          .update({
            substations: JSON.stringify(updatedSubstations),
            updatedAt: db.fn.now()
          });
      }
    }
    
    // If activating (active status), check for deferred reservations
    if (isActive && result[0].status === 'available') {
      console.log(`🔍 Checking deferred reservations for activated substation ${id}...`);
      const { applyDeferredReservation } = await import('./utils/fifoScheduler.js');
      const applied = await applyDeferredReservation(id);
      if (applied) {
        console.log(`✅ Applied deferred reservation for substation ${id}`);
        // Reload substation to get updated status
        const updated = await db('mes.substations').where({ id }).first();
        return res.json(updated);
      }
    }
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error updating technical status:', error);
    res.status(500).json({ error: 'Failed to update technical status' });
  }
});

// GET /api/mes/substations/:id/details - Get detailed info about a substation
router.get('/substations/:id/details', withAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    console.log('[Substation Details] Fetching details for ID:', id);
    
    // Get substation from mes.substations table
    const substation = await db('mes.substations')
      .select('*')
      .where({ id })
      .first();
    
    console.log('[Substation Details] Found substation:', substation ? 'YES' : 'NO');
    
    if (!substation) {
      return res.status(404).json({ error: 'Substation not found' });
    }

    // Get station info
    const station = await db('mes.stations')
      .select('id', 'name')
      .where('id', substation.stationId)
      .first();

    // Get current assignment if exists
    let currentTask = null;
    if (substation.currentAssignmentId) {
      const assignment = await db('mes.worker_assignments')
        .select('*')
        .where({ id: substation.currentAssignmentId })
        .first();
      
      if (assignment) {
        const operation = await db('mes.operations')
          .select('name')
          .where({ id: assignment.operationId })
          .first();
        
        currentTask = {
          assignmentId: assignment.id,
          operationName: operation?.name || 'Unknown',
          workerId: assignment.workerId,
          startTime: assignment.startTime,
          expectedEnd: substation.currentExpectedEnd,
          timeRemaining: null // Calculate if needed
        };
      }
    }

    // Return substation details
    res.json({
      substation: {
        id: substation.id,
        code: substation.id,
        stationId: substation.stationId,
        stationName: station?.name || 'Unknown',
        name: substation.name,
        technicalStatus: substation.technicalStatus || 'active',
        isActive: substation.isActive,
        currentOperation: substation.currentOperation,
        currentAssignmentId: substation.currentAssignmentId,
        assignedWorkerId: substation.assignedWorkerId,
        currentExpectedEnd: substation.currentExpectedEnd,
        createdAt: substation.createdAt,
        updatedAt: substation.updatedAt
      },
      currentTask,
      upcomingTasks: [],
      performance: {
        totalCompleted: 0,
        avgCompletionTime: 0,
        onTimeRate: 0,
        defectRate: 0
      }
    });
  } catch (error) {
    console.error('[Substation Details] Error:', error.message);
    console.error('[Substation Details] Stack:', error.stack);
    res.status(500).json({ error: 'Failed to fetch substation details', details: error.message });
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
/**
 * Get default work schedule from master-data (database)
 * ✅ FAZ 1A-1: Removed hardcoded schedules, now fetches from mes.settings
 * 
 * @param {Object} trx - Database transaction
 * @param {string} dayName - Day name (monday, tuesday, etc.)
 * @param {string} shiftNo - Shift number for shift-based schedules (default: '1')
 * @returns {Promise<Array>} Schedule blocks [{ type: 'work'|'break', start: 'HH:MM', end: 'HH:MM' }]
 */
async function getDefaultWorkSchedule(trx, dayName, shiftNo = '1') {
  try {
    // Fetch master-data from database
    const result = await trx('mes.settings')
      .where('key', 'master-data')
      .first();
    
    if (!result || !result.value) {
      console.warn('⚠️  No master-data found in mes.settings, returning empty schedule');
      return [];
    }
    
    // Parse master-data (handle both JSON string and object)
    const masterData = typeof result.value === 'string' 
      ? JSON.parse(result.value) 
      : result.value;
    
    const timeSettings = masterData.timeSettings;
    if (!timeSettings) {
      console.warn('⚠️  No timeSettings in master-data');
      return [];
    }
    
    // Return schedule based on workType
    if (timeSettings.workType === 'fixed') {
      // Fixed schedule: same for all workers
      const blocks = timeSettings.fixedBlocks?.[dayName] || [];
      console.log(`🔍 DEBUG: dayName="${dayName}", available days:`, Object.keys(timeSettings.fixedBlocks || {}));
      console.log(`📅 Fixed schedule for ${dayName}: ${blocks.length} blocks`);
      return blocks;
    } else if (timeSettings.workType === 'shift') {
      // Shift-based schedule: different per shift/lane
      
      // Preferred structure: shiftByLane (most granular)
      if (timeSettings.shiftByLane && timeSettings.shiftByLane[shiftNo]) {
        const blocks = timeSettings.shiftByLane[shiftNo][dayName] || [];
        console.log(`📅 Shift ${shiftNo} schedule for ${dayName}: ${blocks.length} blocks (shiftByLane)`);
        return blocks;
      }
      
      // Fallback: shiftBlocks (legacy structure)
      const key = `shift-${dayName}`;
      const allBlocks = timeSettings.shiftBlocks?.[key] || [];
      
      // Filter by lane index (shiftNo - 1)
      const laneIndex = parseInt(shiftNo, 10) - 1;
      const blocks = allBlocks.filter(b => 
        typeof b.laneIndex === 'number' ? b.laneIndex === laneIndex : true
      );
      console.log(`📅 Shift ${shiftNo} schedule for ${dayName}: ${blocks.length} blocks (legacy shiftBlocks)`);
      return blocks;
    }
    
    console.warn('⚠️  Unknown workType in timeSettings:', timeSettings.workType);
    return [];
  } catch (error) {
    console.error('❌ Error fetching default work schedule:', error);
    return [];
  }
}

/**
 * Check if a given date is a company holiday
 * ✅ FAZ 1A-2: Holiday system implementation
 * 
 * @param {Object} trx - Database transaction
 * @param {Date} date - Date to check
 * @returns {Promise<Object|null>} Holiday object if found, null otherwise
 */
/**
 * Get all company holidays
 * ✅ FAZ 3: Helper for holiday management
 */
async function getHolidays(trx) {
  try {
    const result = await trx('mes.settings')
      .where('key', 'company-holidays')
      .first();
    
    if (!result || !result.value) {
      return []; // No holidays configured
    }
    
    const data = typeof result.value === 'string' 
      ? JSON.parse(result.value) 
      : result.value;
    
    return data.holidays || [];
  } catch (error) {
    console.error('❌ Error fetching holidays:', error);
    return [];
  }
}

/**
 * Check if a given date is a holiday
 * ✅ FAZ 1A-2: Holiday system integration
 * 
 * @param {Object} trx - Database transaction
 * @param {Date} date - Date to check
 * @returns {Promise<Object|null>} Holiday object if found, null otherwise
 */
async function isHoliday(trx, date) {
  try {
    // Get company timezone
    const tzResult = await trx('mes.settings')
      .where('key', 'company-timezone')
      .first();
    
    const timezone = tzResult && tzResult.value 
      ? (typeof tzResult.value === 'string' ? JSON.parse(tzResult.value).timezone : tzResult.value.timezone)
      : 'Europe/Istanbul';
    
    // Convert date to company timezone for comparison
    const checkDate = new Date(date);
    // For now, use UTC comparison (timezone conversion would require moment-timezone or date-fns-tz)
    // TODO: Implement proper timezone conversion
    const checkYear = checkDate.getUTCFullYear();
    const checkMonth = checkDate.getUTCMonth();
    const checkDay = checkDate.getUTCDate();
    
    // Fetch company-holidays from database
    const result = await trx('mes.settings')
      .where('key', 'company-holidays')
      .first();
    
    if (!result || !result.value) {
      return null; // No holidays configured
    }
    
    // Parse holidays data (handle both JSON string and object)
    const data = typeof result.value === 'string' 
      ? JSON.parse(result.value) 
      : result.value;
    
    const holidays = data.holidays || [];
    
    // Check if date falls within any holiday period
    const holiday = holidays.find(h => {
      const start = new Date(h.startDate);
      const end = new Date(h.endDate);
      
      // Get UTC date components for comparison
      const startYear = start.getUTCFullYear();
      const startMonth = start.getUTCMonth();
      const startDay = start.getUTCDate();
      
      const endYear = end.getUTCFullYear();
      const endMonth = end.getUTCMonth();
      const endDay = end.getUTCDate();
      
      // Compare dates using UTC components
      const checkDateNum = checkYear * 10000 + checkMonth * 100 + checkDay;
      const startDateNum = startYear * 10000 + startMonth * 100 + startDay;
      const endDateNum = endYear * 10000 + endMonth * 100 + endDay;
      
      return checkDateNum >= startDateNum && checkDateNum <= endDateNum;
    });
    
    return holiday || null;
  } catch (error) {
    console.error('❌ Error checking holiday:', error);
    return null;
  }
}

/**
 * Get work schedule for a specific date (considers holidays and worker personal schedule)
 * ✅ FAZ 1A-2: Combines holiday system with worker schedules
 * 
 * Worker Schedule Logic:
 * - mode='personal' → Worker'ın kendi blocks'ları kullanılır
 * - mode='company' → Master-data'dan shiftNo ile schedule çekilir (getDefaultWorkSchedule)
 * 
 * @param {Object} trx - Database transaction
 * @param {Date} date - Date to get schedule for
 * @param {Object} worker - Worker object (optional, for personal schedule)
 * @returns {Promise<Array>} Schedule blocks for the day
 */
async function getWorkScheduleForDate(trx, date, worker = null) {
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getDay()];
  
  // 1. Check if it's a holiday
  const holiday = await isHoliday(trx, date);
  
  if (holiday) {
    if (!holiday.isWorkingDay) {
      console.log(`🎉 Holiday: ${holiday.name} (${holiday.date}) - No work scheduled`);
      return []; // No work on this holiday
    }
    
    if (holiday.workHours && Array.isArray(holiday.workHours)) {
      console.log(`🎉 Holiday: ${holiday.name} (${holiday.date}) - Custom hours`);
      return holiday.workHours; // Custom holiday hours (e.g., half-day)
    }
  }
  
  // 2. Get worker's schedule based on mode
  if (worker?.personalSchedule) {
    const personalSchedule = typeof worker.personalSchedule === 'string'
      ? JSON.parse(worker.personalSchedule)
      : worker.personalSchedule;
    
    // Mode 'personal': Use worker's personal blocks
    if (personalSchedule.mode === 'personal' && personalSchedule.blocks) {
      const blocks = personalSchedule.blocks[dayOfWeek] || [];
      console.log(`👤 Using worker personal schedule for ${dayOfWeek}: ${blocks.length} blocks`);
      return blocks;
    }
    
    // Mode 'company': Use master-data with shiftNo
    if (personalSchedule.mode === 'company') {
      const shiftNo = personalSchedule.shiftNo || '1';
      const blocks = await getDefaultWorkSchedule(trx, dayOfWeek, shiftNo);
      console.log(`🏢 Using company schedule for ${dayOfWeek}, shift ${shiftNo}: ${blocks.length} blocks`);
      return blocks;
    }
  }
  
  // 3. Fallback: No worker schedule, use company default (shift 1)
  const blocks = await getDefaultWorkSchedule(trx, dayOfWeek, '1');
  console.log(`🏢 Using company default schedule for ${dayOfWeek}: ${blocks.length} blocks`);
  return blocks;
}

/**
 * Find next working day (skip holidays and weekends)
 * ✅ FAZ 1A-2: Smart date navigation with holiday awareness
 * 
 * @param {Object} trx - Database transaction
 * @param {Date} startDate - Starting date (will check from next day)
 * @param {Object} worker - Worker object (for schedule check)
 * @param {number} maxDaysToCheck - Maximum days to search (default: 30)
 * @returns {Promise<Date|null>} Next working day or null if not found
 */
async function findNextWorkingDay(trx, startDate, worker = null, maxDaysToCheck = 30) {
  let currentDate = new Date(startDate);
  currentDate.setDate(currentDate.getDate() + 1); // Start from next day
  
  for (let i = 0; i < maxDaysToCheck; i++) {
    const schedule = await getWorkScheduleForDate(trx, currentDate, worker);
    
    if (schedule.length > 0) {
      // Found a day with work schedule
      console.log(`✅ Next working day found: ${currentDate.toISOString().split('T')[0]}`);
      return new Date(currentDate); // Return a copy
    }
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  console.warn(`⚠️  No working day found in next ${maxDaysToCheck} days from ${startDate.toISOString().split('T')[0]}`);
  return null;
}

/**
 * Helper function: Calculate end time considering breaks and work schedule
 * ✅ FAZ 1B: Async version with multi-day support, holiday/absence checking
 * 
 * Skips break periods, non-work hours, holidays, and worker absences
 * Automatically moves to next working day when needed
 * 
 * @param {Object} trx - Database transaction
 * @param {Date} startTime - Task start time
 * @param {number} durationInMinutes - Task duration in minutes
 * @param {Object} worker - Worker object with personalSchedule and absences
 * @returns {Promise<Date>} Calculated end time
 */
async function calculateEndTimeWithBreaks(trx, startTime, durationInMinutes, worker) {
  let remainingDuration = durationInMinutes;
  let currentTime = new Date(startTime);
  
  // Safety check: max 365 days to prevent infinite loops
  const maxIterations = 365;
  let iterations = 0;
  
  while (remainingDuration > 0 && iterations < maxIterations) {
    iterations++;
    
    // ✅ FAZ 1B-1: Get work schedule for current date
    const scheduleBlocks = await getWorkScheduleForDate(trx, currentTime, worker);
    
    if (!scheduleBlocks || scheduleBlocks.length === 0) {
      // No work blocks for this day (holiday or no schedule)
      // ✅ FAZ 1B-2: Find next working day
      const nextWorkingDay = await findNextWorkingDay(trx, currentTime, worker);
      
      if (!nextWorkingDay) {
        console.error('❌ No working day found within 365 days!');
        // Fallback: just add remaining time
        return new Date(currentTime.getTime() + remainingDuration * 60000);
      }
      
      currentTime = nextWorkingDay;
      continue; // Re-check schedule for new day
    }
    
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
      // No work blocks today - move to next day
      const nextWorkingDay = await findNextWorkingDay(trx, currentTime, worker);
      if (!nextWorkingDay) {
        return new Date(currentTime.getTime() + remainingDuration * 60000);
      }
      currentTime = nextWorkingDay;
      continue;
    }
    
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
          // No more work blocks today - move to next working day
          currentTime.setDate(currentTime.getDate() + 1);
          currentTime.setHours(0, 0, 0, 0); // Reset to midnight, will find first block in next iteration
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
      // Past all work blocks today - move to next working day
      currentTime.setDate(currentTime.getDate() + 1);
      currentTime.setHours(0, 0, 0, 0); // Will find first block in next iteration
    }
  }
  
  if (iterations >= maxIterations) {
    console.error('⚠️  calculateEndTimeWithBreaks: Maximum iterations reached!');
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
    
    // Canonical SQL query - same structure as worker task queue
    let query = db('mes.worker_assignments as wa')
      .select(
        // Assignment core fields
        'wa.id as assignmentId',
        'wa.status',
        'wa.isUrgent',
        'wa.priority',
        'wa.sequenceNumber',
        
        // IDs for relationships
        'wa.workerId',
        'wa.planId',
        'wa.nodeId',
        'wa.operationId',
        'wa.stationId',
        'wa.substationId',
        'wa.workOrderCode',
        
        // Timing fields
        'wa.expectedStart',
        'wa.plannedEnd',
        'wa.startedAt as actualStart',
        'wa.completedAt as actualEnd',
        'wa.nominalTime',
        'wa.effectiveTime',
        
        // Material & output fields (JSONB)
        'wa.preProductionReservedAmount',
        'wa.plannedOutput',
        'wa.actualReservedAmounts',
        'wa.materialReservationStatus',
        'wa.inputScrapCount',
        'wa.productionScrapCount',
        'wa.defectQuantity',
        'wa.actualQuantity',
        
        // Metadata
        'wa.notes',
        'wa.createdAt',
        
        // Worker info
        'w.name as workerName',
        'w.skills as workerSkills',
        
        // Node info
        'n.name as nodeName',
        'n.nodeId as nodeIdString',
        'n.outputCode',
        'n.outputQty',
        
        // Operation info
        'op.name as operationName',
        
        // Station info
        'st.name as stationName',
        
        // Substation info  
        'sub.id as substationCode'
      )
      .leftJoin('mes.workers as w', 'w.id', 'wa.workerId')
      .leftJoin('mes.production_plan_nodes as n', function() {
        this.on('n.id', '=', db.raw('wa."nodeId"::integer'));
      })
      .leftJoin('mes.operations as op', 'op.id', 'wa.operationId')
      .leftJoin('mes.stations as st', 'st.id', 'wa.stationId')
      .leftJoin('mes.substations as sub', 'sub.id', 'wa.substationId')
      .orderBy([
        { column: 'wa.isUrgent', order: 'desc' },
        { column: 'wa.expectedStart', order: 'asc' },
        { column: 'wa.createdAt', order: 'asc' }
      ])
      .limit(maxResults);
    
    // Apply filters
    if (status) {
      query = query.where('wa.status', status);
    }
    if (workerId) {
      query = query.where('wa.workerId', workerId);
    }
    if (stationId) {
      query = query.where('wa.stationId', stationId);
    }
    
    const tasks = await query;

    // Get material inputs for each task (from junction table)
    const nodeIds = [...new Set(tasks.map(t => t.nodeIdString).filter(Boolean))];
    const materialInputs = nodeIds.length > 0
      ? await db('mes.node_material_inputs')
          .whereIn('nodeId', nodeIds)
          .select('nodeId', 'materialCode', 'requiredQuantity')
      : [];

    // Group materials by nodeId
    const materialsByNode = materialInputs.reduce((acc, m) => {
      if (!acc[m.nodeId]) acc[m.nodeId] = {};
      acc[m.nodeId][m.materialCode] = m.requiredQuantity;
      return acc;
    }, {});

    // Get all unique material codes needed across all tasks
    const allMaterialCodes = [...new Set(materialInputs.map(m => m.materialCode))];
    
    // Check stock availability for all materials (PostgreSQL materials.materials table)
    const stockAvailability = {};
    if (allMaterialCodes.length > 0) {
      const stockLevels = await db('materials.materials')
        .select('code', 'stock')
        .whereIn('code', allMaterialCodes);
      
      stockLevels.forEach(s => {
        stockAvailability[s.code] = parseFloat(s.stock) || 0;
      });
    }

    // Format response with canonical schema
    const parseJsonb = (val) => {
      if (!val) return {};
      if (typeof val === 'string') return JSON.parse(val);
      return val;
    };

    const formatted = tasks.map(t => {
      // Check if materials are sufficient for this task
      const taskMaterials = materialsByNode[t.nodeIdString] || {};
      const reservedAmounts = parseJsonb(t.preProductionReservedAmount);
      
      let materialStatus = 'sufficient'; // Default: sufficient
      
      // Check each material required for this task
      for (const [materialCode, requiredQty] of Object.entries(taskMaterials)) {
        const required = parseFloat(requiredQty) || 0;
        const reserved = parseFloat(reservedAmounts[materialCode]) || 0;
        const available = stockAvailability[materialCode] || 0;
        
        // If we need more than what's available in stock
        if (reserved > available) {
          materialStatus = 'insufficient';
          break;
        }
      }
      
      return {
      // Assignment IDs (backwards compatibility)
      id: t.assignmentId,
      assignmentId: t.assignmentId,
      workPackageId: t.assignmentId,
      status: t.status,
      
      // Work Order & Product
      workOrderCode: t.workOrderCode,
      customer: '', // TODO: Join with work_orders if needed
      productName: null,
      
      // Node/Operation
      nodeName: t.nodeName,
      operationId: t.operationId,
      operationName: t.operationName,
      outputCode: t.outputCode,
      outputQty: t.outputQty,
      
      // Worker
      workerId: t.workerId,
      workerName: t.workerName,
      workerSkills: t.workerSkills || [],
      
      // Station/Substation
      stationId: t.stationId,
      stationName: t.stationName,
      substationId: t.substationId,
      substationCode: t.substationCode,
      
      // Material inputs (from junction table)
      materialInputs: materialsByNode[t.nodeIdString] || {},
      preProductionReservedAmount: parseJsonb(t.preProductionReservedAmount),
      plannedOutput: parseJsonb(t.plannedOutput),
      actualReservedAmounts: parseJsonb(t.actualReservedAmounts),
      materialReservationStatus: t.materialReservationStatus,
      
      // Timing
      estimatedNominalTime: t.nominalTime,
      estimatedEffectiveTime: t.effectiveTime,
      expectedStart: t.expectedStart,
      plannedStart: t.expectedStart, // Alias for backwards compatibility
      plannedEnd: t.plannedEnd,
      actualStart: t.actualStart,
      actualEnd: t.actualEnd,
      
      // Scrap & defects
      inputScrapCount: parseJsonb(t.inputScrapCount),
      productionScrapCount: parseJsonb(t.productionScrapCount),
      defectQuantity: t.defectQuantity || 0,
      
      // Status flags
      isUrgent: t.isUrgent || false,
      isPaused: t.status === 'paused',
      materialStatus: materialStatus, // 'sufficient' or 'insufficient'
      
      // Metadata
      createdAt: t.createdAt,
      actualQuantity: t.actualQuantity,
      notes: t.notes,
      priority: t.priority,
      sequenceNumber: t.sequenceNumber
    };
    });

    console.log(`📦 Work Packages Query: Found ${formatted.length} assignments (limit: ${maxResults})`);

    res.json({
      workPackages: formatted,
      total: formatted.length,
      filters: { status, workerId, stationId },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Work packages fetch error:', error);
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
    
    // Canonical SQL-LAUNCH query - get full task data with all relationships
    const tasks = await db('mes.worker_assignments as wa')
      .select(
        // Assignment core fields
        'wa.id as assignmentId',
        'wa.status',
        'wa.isUrgent',
        'wa.priority',
        'wa.sequenceNumber',
        
        // IDs for relationships
        'wa.workerId',
        'wa.planId',
        'wa.nodeId',
        'wa.operationId',
        'wa.stationId',
        'wa.substationId',
        'wa.workOrderCode',
        
        // Timing fields
        'wa.expectedStart',
        'wa.plannedEnd',
        'wa.startedAt as actualStart',
        'wa.completedAt as actualEnd',
        'wa.nominalTime',
        'wa.effectiveTime',
        
        // Material & output fields (JSONB)
        'wa.preProductionReservedAmount',
        'wa.plannedOutput',
        'wa.actualReservedAmounts',
        'wa.materialReservationStatus',
        'wa.inputScrapCount',
        'wa.productionScrapCount',
        'wa.defectQuantity',
        'wa.actualQuantity',
        
        // Metadata
        'wa.notes',
        'wa.createdAt',
        
        // Worker info
        'w.name as workerName',
        'w.skills as workerSkills',
        
        // Node info
        'n.name as nodeName',
        'n.nodeId as nodeIdString',
        'n.outputCode',
        'n.outputQty',
        
        // Operation info
        'op.name as operationName',
        
        // Station info
        'st.name as stationName',
        
        // Substation info  
        'sub.id as substationCode',
        
        // Plan info
        'p.planName as planName'
      )
      .leftJoin('mes.workers as w', 'w.id', 'wa.workerId')
      .leftJoin('mes.production_plan_nodes as n', function() {
        this.on('n.id', '=', db.raw('wa."nodeId"::integer'));
      })
      .leftJoin('mes.operations as op', 'op.id', 'wa.operationId')
      .leftJoin('mes.stations as st', 'st.id', 'wa.stationId')
      .leftJoin('mes.substations as sub', 'sub.id', 'wa.substationId')
      .leftJoin('mes.production_plans as p', 'p.id', 'wa.planId')
      .where('wa.workerId', workerId)
      .whereIn('wa.status', ['pending', 'ready', 'in_progress', 'paused'])
      .orderBy([
        { column: 'wa.isUrgent', order: 'desc' },
        { column: 'wa.expectedStart', order: 'asc' },
        { column: 'wa.createdAt', order: 'asc' }
      ]);

    // Get material inputs for each task (from junction table)
    const nodeIds = [...new Set(tasks.map(t => t.nodeIdString).filter(Boolean))];
    const materialInputs = nodeIds.length > 0
      ? await db('mes.node_material_inputs as nmi')
          .leftJoin('materials.materials as m', 'm.code', 'nmi.materialCode')
          .whereIn('nmi.nodeId', nodeIds)
          .select('nmi.nodeId', 'nmi.materialCode', 'nmi.requiredQuantity', 'm.name as materialName', 'm.unit as materialUnit')
      : [];

    // Group materials by nodeId with name and unit
    const materialsByNode = materialInputs.reduce((acc, m) => {
      if (!acc[m.nodeId]) acc[m.nodeId] = {};
      acc[m.nodeId][m.materialCode] = {
        qty: m.requiredQuantity,
        name: m.materialName,
        unit: m.materialUnit
      };
      return acc;
    }, {});

    // Get next task ID (first ready/pending task)
    const nextTask = tasks.find(t => ['ready', 'pending'].includes(t.status));
    const nextTaskId = nextTask?.assignmentId || null;

    // Get all unique material codes from plannedOutput for output material info
    const allOutputCodes = new Set();
    tasks.forEach(t => {
      const parseJsonb = (val) => {
        if (!val) return {};
        if (typeof val === 'string') return JSON.parse(val);
        return val;
      };
      const plannedOutput = parseJsonb(t.plannedOutput);
      Object.keys(plannedOutput).forEach(code => allOutputCodes.add(code));
    });

    // Fetch material info for output codes
    const outputMaterialsInfo = allOutputCodes.size > 0
      ? await db('materials.materials')
          .whereIn('code', Array.from(allOutputCodes))
          .select('code', 'name', 'unit')
      : [];

    const outputMaterialsMap = outputMaterialsInfo.reduce((acc, m) => {
      acc[m.code] = { name: m.name, unit: m.unit };
      return acc;
    }, {});

    // Format response with canonical schema
    const formattedTasks = tasks.map(t => {
      // Parse JSONB fields safely
      const parseJsonb = (val) => {
        if (!val) return {};
        if (typeof val === 'string') return JSON.parse(val);
        return val;
      };

      const preProductionReservedAmount = parseJsonb(t.preProductionReservedAmount);
      const plannedOutput = parseJsonb(t.plannedOutput);
      const actualReservedAmounts = parseJsonb(t.actualReservedAmounts);
      const inputScrapCount = parseJsonb(t.inputScrapCount);
      const productionScrapCount = parseJsonb(t.productionScrapCount);

      // Enrich plannedOutput with material name and unit
      const enrichedPlannedOutput = {};
      Object.entries(plannedOutput).forEach(([code, qty]) => {
        enrichedPlannedOutput[code] = {
          qty,
          name: outputMaterialsMap[code]?.name,
          unit: outputMaterialsMap[code]?.unit
        };
      });

      // Calculate canStart flag
      const canStart = t.status === 'ready' && t.materialReservationStatus === 'reserved';

      return {
        // Assignment ID
        assignmentId: t.assignmentId,
        status: t.status,
        
        // Plan & Node IDs
        planId: t.planId,
        planName: t.planName,
        nodeId: t.nodeId,
        
        // Work Order & Product
        workOrderCode: t.workOrderCode,
        customer: '', // TODO: Join with work_orders table if needed
        productName: null, // TODO: Get from materials/quotes if needed
        
        // Node/Operation
        name: t.nodeName,
        operationId: t.operationId,
        operationName: t.operationName,
        outputCode: t.outputCode,
        outputQty: t.outputQty,
        
        // Worker
        workerId: t.workerId,
        workerName: t.workerName,
        workerSkills: t.workerSkills || [],
        
        // Station/Substation
        stationId: t.stationId,
        stationName: t.stationName,
        substationId: t.substationId,
        substationCode: t.substationCode,
        
        // Material inputs (from junction table)
        materialInputs: materialsByNode[t.nodeIdString] || {},
        preProductionReservedAmount,
        plannedOutput: enrichedPlannedOutput,
        actualReservedAmounts,
        materialReservationStatus: t.materialReservationStatus,
        
        // Timing
        estimatedNominalTime: t.nominalTime,
        estimatedEffectiveTime: t.effectiveTime,
        expectedStart: t.expectedStart,
        plannedStart: t.expectedStart, // Alias for frontend compatibility
        plannedEnd: t.plannedEnd,
        actualStart: t.actualStart,
        actualEnd: t.actualEnd,
        
        // Scrap & defects
        inputScrapCount,
        productionScrapCount,
        defectQuantity: t.defectQuantity || 0,
        
        // Status flags
        isUrgent: t.isUrgent || false,
        canStart,
        isPaused: t.status === 'paused',
        materialStatus: t.materialReservationStatus === 'reserved' ? 'ok' : 'pending',
        
        // Metadata
        createdAt: t.createdAt,
        actualQuantity: t.actualQuantity,
        notes: t.notes,
        priority: t.priority,
        sequenceNumber: t.sequenceNumber
      };
    });

    res.json({
      success: true,
      tasks: formattedTasks,
      nextTaskId,
      queueLength: formattedTasks.length
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

/**
 * GET /api/mes/assignments/:assignmentId/lot-preview
 * Preview which lots will be consumed (read-only, no reservation)
 * 
 * This endpoint shows workers which material lots will be consumed
 * when they start a task, using FIFO logic. No actual reservation happens.
 * 
 * Response:
 * {
 *   success: true,
 *   assignmentId: 'WO-001-001',
 *   taskName: 'Kesme',
 *   materials: [
 *     {
 *       materialCode: 'M-00-001',
 *       materialName: 'Çelik Sac',
 *       requiredQty: 100,
 *       availableQty: 250,
 *       lotsToConsume: [
 *         {
 *           lotNumber: 'LOT-M-00-001-20251101-001',
 *           lotDate: '2025-11-01',
 *           lotBalance: 150,
 *           consumeQty: 100,
 *           expiryDate: '2026-11-01',
 *           fifoOrder: 1
 *         }
 *       ],
 *       sufficient: true
 *     }
 *   ]
 * }
 */
router.get('/assignments/:assignmentId/lot-preview', async (req, res) => {
  try {
    const { assignmentId } = req.params;
    
    console.log(`📦 [LOT-PREVIEW] Fetching lot preview for assignment ${assignmentId}`);
    
    // Get assignment details with operation name
    const assignment = await db('mes.worker_assignments as wa')
      .select(
        'wa.id',
        'wa.nodeId',
        'wa.planId',
        'op.name as operationName',
        'n.name as nodeName'
      )
      .leftJoin('mes.operations as op', 'op.id', 'wa.operationId')
      .leftJoin('mes.production_plan_nodes as n', function() {
        this.on('n.id', '=', db.raw('wa."nodeId"::integer'));
      })
      .where('wa.id', assignmentId)
      .first();
    
    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'Assignment not found'
      });
    }
    
    // Get VARCHAR nodeId from production_plan_nodes
    // (worker_assignments.nodeId is INTEGER FK to production_plan_nodes.id)
    // (node_material_inputs.nodeId is VARCHAR FK to production_plan_nodes.nodeId)
    const node = await db('mes.production_plan_nodes')
      .where('id', assignment.nodeId)
      .first();
    
    if (!node) {
      console.warn(`⚠️  [LOT-PREVIEW] Node ${assignment.nodeId} not found`);
      return res.status(404).json({
        success: false,
        error: 'Production node not found'
      });
    }
    
    // Get material requirements using VARCHAR nodeId
    const materialRequirements = await db('mes.node_material_inputs as nmi')
      .select(
        'nmi.materialCode as materialCode',
        'nmi.requiredQuantity as requiredQty'
      )
      .where('nmi.nodeId', node.nodeId); // Use VARCHAR nodeId
    
    console.log(`📋 [LOT-PREVIEW] Found ${materialRequirements.length} material requirement(s) for node ${node.nodeId} (id: ${assignment.nodeId})`);
    
    // Get lot consumption preview (no reservation)
    const preview = await getLotConsumptionPreview(materialRequirements);
    
    res.json({
      success: true,
      assignmentId,
      taskName: assignment.operationName || assignment.nodeName || 'Task',
      materials: preview.materials
    });
    
  } catch (error) {
    console.error('❌ [LOT-PREVIEW] Error fetching lot preview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch lot preview',
      details: error.message
    });
  }
});

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
 * UPDATED: Now calculates actual consumption based on scrap counters!
 * 
 * Body:
 * - workerId: Worker ID (for verification)
 * - quantityProduced: Number - Actual good units produced
 * - defectQuantity: Number - Output defects
 * - inputScrapCounters: Object - { 'M-001': 2, ... } - Damaged incoming materials
 * - productionScrapCounters: Object - { 'M-001': 5, ... } - Materials damaged during production
 * - notes: String (optional)
 * 
 * Material Consumption Formula:
 * consumed = inputScrap + productionScrap + (actualQty × ratio) + (defectQty × ratio)
 * 
 * Side effects:
 * - Calculates actual material consumption per formula
 * - Marks reserved materials as 'consumed' with calculated qty
 * - Creates stock adjustments for over/under reservations
 * - Updates status to completed
 * - Records status history with adjustment details
 * - Triggers real-time notification
 * 
 * Response:
 * {
 *   success: true,
 *   assignment: { ... updated assignment ... },
 *   materialsConsumed: 3,
 *   adjustments: [{ materialCode, reserved, consumed, delta, breakdown }]
 * }
 */
router.post('/assignments/:assignmentId/complete', async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { workerId, quantityProduced, defectQuantity, inputScrapCounters, productionScrapCounters, notes } = req.body;
    
    if (!workerId) {
      return res.status(400).json({
        success: false,
        error: 'workerId is required'
      });
    }
    
    console.log(`✅ [FIFO] Completing task ${assignmentId} for worker ${workerId}`);
    console.log(`📊 Completion data:`, {
      quantityProduced,
      defectQuantity,
      inputScrapCounters,
      productionScrapCounters
    });
    
    // Complete task with integrated material consumption
    const result = await completeTask(assignmentId, workerId, {
      quantityProduced,
      defectQuantity,
      inputScrapCounters,
      productionScrapCounters,
      notes
    });
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    // Log material consumption and adjustments
    if (result.materialsConsumed > 0) {
      console.log(`📦 [FIFO] Processed ${result.materialsConsumed} material consumption(s)`);
    }
    
    if (result.adjustments && result.adjustments.length > 0) {
      console.log(`📊 [FIFO] Stock adjustments:`)
      result.adjustments.forEach(adj => {
        console.log(`  ${adj.materialCode}: Reserved=${adj.reserved}, Consumed=${adj.consumed}, Delta=${adj.delta > 0 ? '+' : ''}${adj.delta}`);
      });
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
 * POST /api/mes/assignments/:assignmentId/pause
 * Pause a task (in_progress → paused)
 * 
 * Body: { workerId: 'w-xxx' }
 * 
 * Response: { success: true, assignment: {...} }
 */
router.post('/assignments/:assignmentId/pause', async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { workerId } = req.body;
    
    if (!workerId) {
      return res.status(400).json({
        success: false,
        error: 'workerId is required'
      });
    }
    
    // Verify worker owns this task
    const assignment = await db('mes.worker_assignments')
      .where('id', assignmentId)
      .where('workerId', workerId)
      .first();
    
    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'Assignment not found or does not belong to worker'
      });
    }
    
    if (assignment.status !== 'in_progress') {
      return res.status(400).json({
        success: false,
        error: `Cannot pause task with status ${assignment.status}`
      });
    }
    
    // Update to paused
    const [updated] = await db('mes.worker_assignments')
      .where('id', assignmentId)
      .update({
        status: 'paused'
      })
      .returning('*');
    
    // Record status change in history
    await recordStatusChange(assignmentId, 'in_progress', 'paused', workerId);
    
    console.log(`⏸️  Task ${assignmentId} paused by worker ${workerId}`);
    
    res.json({
      success: true,
      assignment: updated
    });
    
  } catch (error) {
    console.error('❌ Error pausing task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to pause task',
      details: error.message
    });
  }
});

/**
 * POST /api/mes/assignments/:assignmentId/resume
 * Resume a paused task (paused → in_progress)
 * 
 * Body: { workerId: 'w-xxx' }
 * 
 * Response: { success: true, assignment: {...} }
 */
router.post('/assignments/:assignmentId/resume', async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { workerId } = req.body;
    
    if (!workerId) {
      return res.status(400).json({
        success: false,
        error: 'workerId is required'
      });
    }
    
    // Verify worker owns this task
    const assignment = await db('mes.worker_assignments')
      .where('id', assignmentId)
      .where('workerId', workerId)
      .first();
    
    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'Assignment not found or does not belong to worker'
      });
    }
    
    if (assignment.status !== 'paused') {
      return res.status(400).json({
        success: false,
        error: `Cannot resume task with status ${assignment.status}`
      });
    }
    
    // Update to in_progress
    const [updated] = await db('mes.worker_assignments')
      .where('id', assignmentId)
      .update({
        status: 'in_progress'
      })
      .returning('*');
    
    // Record status change in history
    await recordStatusChange(assignmentId, 'paused', 'in_progress', workerId);
    
    console.log(`▶️  Task ${assignmentId} resumed by worker ${workerId}`);
    
    res.json({
      success: true,
      assignment: updated
    });
    
  } catch (error) {
    console.error('❌ Error resuming task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resume task',
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

    // Order by priority (if applicable)
    query = query.orderBy('priority', 'asc').orderBy('createdAt', 'asc');

    const relations = await query;

    // Join with target entity to get names
    const enrichedRelations = await Promise.all(
      relations.map(async (relation) => {
        let targetName = null;
        let targetDetails = null;

        try {
          // Get target entity details based on relation type
          if (relation.relationType === 'station') {
            const station = await db('mes_stations')
              .where('id', relation.targetId)
              .first('id', 'name', 'code', 'type');
            if (station) {
              targetName = station.name;
              targetDetails = station;
            }
          } else if (relation.relationType === 'operation') {
            const operation = await db('mes_operations')
              .where('id', relation.targetId)
              .first('id', 'name', 'code', 'type');
            if (operation) {
              targetName = operation.name;
              targetDetails = operation;
            }
          } else if (relation.relationType === 'substation') {
            const substation = await db('mes_substations')
              .where('id', relation.targetId)
              .first('id', 'name', 'code', 'stationId');
            if (substation) {
              targetName = substation.name;
              targetDetails = substation;
            }
          } else if (relation.relationType === 'predecessor') {
            const node = await db('mes_production_plan_nodes')
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
          id: relation.id,
          sourceType: relation.sourceType,
          sourceId: relation.sourceId,
          relationType: relation.relationType,
          targetId: relation.targetId,
          targetName,
          targetDetails,
          priority: relation.priority,
          quantity: relation.quantity,
          unitRatio: relation.unitRatio,
          isDerived: relation.isDerived,
          createdAt: relation.createdAt,
          updatedAt: relation.updatedAt
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

    res.status(201).json({
      success: true,
      relation: {
        id: relation.id,
        sourceType: relation.sourceType,
        sourceId: relation.sourceId,
        relationType: relation.relationType,
        targetId: relation.targetId,
        priority: relation.priority,
        quantity: relation.quantity,
        unitRatio: relation.unitRatio,
        isDerived: relation.isDerived,
        createdAt: relation.createdAt,
        updatedAt: relation.updatedAt
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
      return res.status(404).json({
        error: 'Entity relation not found'
      });
    }

    res.json({
      success: true,
      relation: {
        id: updatedRelation.id,
        sourceType: updatedRelation.sourceType,
        sourceId: updatedRelation.sourceId,
        relationType: updatedRelation.relationType,
        targetId: updatedRelation.targetId,
        priority: updatedRelation.priority,
        quantity: updatedRelation.quantity,
        unitRatio: updatedRelation.unitRatio,
        updatedAt: updatedRelation.updatedAt
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
              updatedAt: new Date()
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
  
  // Get nodes
  const nodes = await db('mes.production_plan_nodes as n')
    .select('n.*')  // This includes x and y columns
    .where('n.planId', planId)
    .orderBy('n.sequenceOrder');
  
  // For each node, fetch materials, stations, and predecessors
  for (const node of nodes) {
    // Get material inputs (use VARCHAR nodeId, not INTEGER id)
    const materialInputs = await db('mes.node_material_inputs')
      .where('nodeId', node.nodeId)
      .select('materialCode', 'requiredQuantity', 'unitRatio', 'isDerived');
    
    // Enrich derived materials with source node info
    for (const mat of materialInputs) {
      if (mat.isDerived) {
        // Find which predecessor produces this material
        const predecessorNodeIds = await db('mes.node_predecessors')
          .where('nodeId', node.nodeId)
          .pluck('predecessorNodeId');
        
        for (const predNodeId of predecessorNodeIds) {
          const predNode = await db('mes.production_plan_nodes')
            .where('nodeId', predNodeId)
            .first();
          
          if (predNode && predNode.outputCode === mat.materialCode) {
            mat.derivedFrom = predNodeId;
            break;
          }
        }
      }
    }
    
    node.materialInputs = materialInputs;
    
    // Get assigned stations
    const stations = await db('mes.node_stations')
      .where('nodeId', node.nodeId)
      .select('stationId', 'priority')
      .orderBy('priority');
    
    node.assignedStations = stations;
    
    // Get predecessors
    const predecessors = await db('mes.node_predecessors')
      .where('nodeId', node.nodeId)
      .pluck('predecessorNodeId');
    
    node.predecessors = predecessors;
    
    // Enrich output code with material info if it exists in materials table
    if (node.outputCode) {
      const material = await db('materials.materials')
        .where('code', node.outputCode)
        .first();
      
      if (material) {
        node._outputMaterialId = material.id;
        node._outputName = material.name;
        node._outputSelectionMode = 'existing';
      } else {
        // Code exists but not in materials table (new output not yet created)
        node._outputSelectionMode = 'new';
        node._isNewOutput = true;
      }
    }
  }
  
  // Return plan with frontend-compatible field names
  return { 
    ...plan, 
    name: plan.planName,  // Alias for frontend compatibility
    nodes 
  };
}

/**
 * Helper: Find worker with required skills for a station
 */
async function findAvailableWorkerWithSkills(trx, requiredSkills, stationId) {
  if (!requiredSkills || requiredSkills.length === 0) {
    return await trx('mes.workers')
      .where('isActive', true)
      .first();
  }
  
  // ✅ FIXED: Find workers with matching skills using jsonb contains
  let query = trx('mes.workers').where('isActive', true);
  
  const skillConditions = requiredSkills.map(skill => 
    trx.raw(`skills::jsonb @> ?::jsonb`, [JSON.stringify([skill])])
  );
  
  const workers = await query.where(function() {
    skillConditions.forEach((condition, idx) => {
      if (idx === 0) this.where(condition);
      else this.orWhere(condition);
    });
  });
  
  if (workers.length === 0) return null;
  
  // Prefer workers already assigned to this station
  const stationWorkers = await trx('mes_entity_relations')
    .where('sourceType', 'worker')
    .where('relationType', 'station')
    .where('targetId', stationId)
    .pluck('sourceId');
  
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
        'p.planName as name',
        'p.description',
        'p.workOrderCode',
        'p.quoteId',
        'p.status',
        'p.createdAt',
        'p.launchedAt',
        'p.timingSummary',
        'p.materialSummary',
        db.raw('count(n.id)::integer as "nodeCount"')
      )
      .leftJoin('mes.production_plan_nodes as n', 'n.planId', 'p.id')
      .where('p.status', '!=', 'template')
      .groupBy('p.id')
      .orderBy('p.createdAt', 'desc');
    
    // Parse JSONB fields (PostgreSQL returns them as strings in some drivers)
    const parsedPlans = plans.map(p => ({
      ...p,
      timingSummary: typeof p.timingSummary === 'string' ? JSON.parse(p.timingSummary) : p.timingSummary,
      materialSummary: typeof p.materialSummary === 'string' ? JSON.parse(p.materialSummary) : p.materialSummary
    }));
    
    res.json({ productionPlans: parsedPlans });
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
  const { name, description, workOrderCode, orderCode, quoteId, nodes, quantity, timingSummary, materialSummary } = req.body;
  
  // Accept both workOrderCode and orderCode (frontend compatibility)
  const finalOrderCode = workOrderCode || orderCode;
  
  // Validation - workOrderCode is REQUIRED for production plans
  if (!finalOrderCode) {
    return res.status(400).json({ 
      error: 'Work order code is required for production plans' 
    });
  }
  
  if (!nodes || !Array.isArray(nodes)) {
    return res.status(400).json({ 
      error: 'Missing required field: nodes' 
    });
  }
  
  const trx = await db.transaction();
  
  try {
    // 1. Generate plan ID
    const result = await trx('mes.production_plans')
      .max('id as maxId')
      .first();
    
    const maxId = result?.maxId;
    let nextNum = 1;
    
    if (maxId && typeof maxId === 'string' && maxId.includes('-')) {
      const parts = maxId.split('-');
      const numPart = parts[parts.length - 1];
      const parsed = parseInt(numPart, 10);
      if (!isNaN(parsed)) {
        nextNum = parsed + 1;
      }
    }
    
    const planId = `PLAN-${nextNum.toString().padStart(3, '0')}`;
    
    console.log(`📋 Creating production plan: ${planId} (${name || 'Unnamed'}) for WO: ${finalOrderCode}`);
    
    // 2. Create plan header
    await trx('mes.production_plans').insert({
      id: planId,
      planName: name || null,
      description: description || null,
      workOrderCode: finalOrderCode,
      quoteId: quoteId || null,
      quantity: quantity || 1,
      timingSummary: timingSummary ? JSON.stringify(timingSummary) : null,
      materialSummary: materialSummary ? JSON.stringify(materialSummary) : null,
      status: 'production', // ✅ FIXED: Production plans are ready to launch immediately
      createdAt: trx.fn.now()
    });
    
    // 3. Insert nodes with materials and stations
    // Build frontend ID to backend nodeId mapping first
    const idMapping = {};
    nodes.forEach((node, index) => {
      const frontendId = node.id || node.nodeId;
      // Extract numeric part or use sequenceOrder
      const numericPart = node.sequenceOrder || parseInt(String(frontendId).replace(/\D/g, '')) || (index + 1);
      const backendNodeId = `${planId}-node-${numericPart}`;
      idMapping[frontendId] = backendNodeId;
    });
    
    // Step 1: Insert all nodes first
    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
      const node = nodes[nodeIndex];
      // Get frontend ID and calculate backend nodeId (consistent with idMapping)
      const frontendId = node.id || node.nodeId;
      const numericPart = node.sequenceOrder || parseInt(String(frontendId).replace(/\D/g, '')) || (nodeIndex + 1);
      const stringNodeId = `${planId}-node-${numericPart}`;
      
      // 3a. Insert node
      await trx('mes.production_plan_nodes')
        .insert({
          planId: planId,
          nodeId: stringNodeId,
          workOrderCode: finalOrderCode,
          name: node.name,
          operationId: node.operationId,
          outputCode: node.outputCode,
          outputQty: node.outputQty,
          outputUnit: node.outputUnit,
          nominalTime: node.nominalTime || 0,
          efficiency: node.efficiency !== undefined ? parseFloat(node.efficiency) : 1.0,
          effectiveTime: Math.round((node.nominalTime || 0) / (node.efficiency !== undefined ? parseFloat(node.efficiency) : 1.0)),
          sequenceOrder: numericPart,
          assignmentMode: 'auto',
          x: node.x || 80,
          y: node.y || 80,
          createdAt: trx.fn.now()
        });
      
      // 3b. Insert material inputs
      if (node.materialInputs && node.materialInputs.length > 0) {
        const materialInputs = node.materialInputs.map(m => ({
          nodeId: stringNodeId,
          materialCode: m.materialCode,
          requiredQuantity: m.requiredQuantity,
          unitRatio: m.unitRatio || 1.0,
          isDerived: m.isDerived || false,
          createdAt: trx.fn.now()
        }));
        
        await trx('mes.node_material_inputs').insert(materialInputs);
      }
      
      // 3c. Insert station assignments
      if (node.stationIds && node.stationIds.length > 0) {
        const stationAssignments = node.stationIds.map((stId, idx) => ({
          nodeId: stringNodeId,
          stationId: stId,
          priority: idx + 1,
          createdAt: trx.fn.now()
        }));
        
        await trx('mes.node_stations').insert(stationAssignments);
      }
    }
    
    // Step 2: Insert all predecessors AFTER all nodes exist
    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
      const node = nodes[nodeIndex];
      const frontendId = node.id || node.nodeId;
      const numericPart = node.sequenceOrder || parseInt(String(frontendId).replace(/\D/g, '')) || (nodeIndex + 1);
      const stringNodeId = `${planId}-node-${numericPart}`;
      
      if (node.predecessors && Array.isArray(node.predecessors) && node.predecessors.length > 0) {
        const predecessorRecords = node.predecessors
          .map(predId => {
            // Map frontend ID to backend nodeId format
            const backendPredId = idMapping[predId] || predId;
            return {
              nodeId: stringNodeId,
              predecessorNodeId: backendPredId,
              createdAt: trx.fn.now()
            };
          });
        
        await trx('mes.node_predecessors').insert(predecessorRecords);
      }
    }
    
    await trx.commit();
    
    console.log(`✅ Production plan created: ${planId} with ${nodes.length} nodes`);
    
    // AUTO-CREATE FINISHED PRODUCT MATERIALS (if suffix was added)
    for (const node of nodes) {
      if (node.outputCode && node.outputCode.endsWith('F')) {
        const baseCode = node.outputCode.slice(0, -1);
        
        const finishedExists = await db('materials.materials')
          .where('code', node.outputCode)
          .first();
        
        if (!finishedExists) {
          const baseMaterial = await db('materials.materials')
            .where('code', baseCode)
            .first();
          
          if (baseMaterial) {
            await db('materials.materials').insert({
              code: node.outputCode,
              name: `${baseMaterial.name} (Finished)`,
              category: baseMaterial.category || 'cat_finished_product',
              type: 'finished_product',
              unit: baseMaterial.unit || 'adet',
              status: 'Aktif',
              createdAt: db.fn.now()
            });
            console.log(`✅ Auto-created finished product: ${node.outputCode} from ${baseCode}`);
          }
        }
      }
    }
    
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
 * Update plan (used for template conversion)
 * 
 * Body: { name?, description?, workOrderCode?, quoteId?, status?, nodes?, quantity?, scheduleType?, materialSummary?, timingSummary? }
 */
router.put('/production-plans/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  
  // Frontend sends 'orderCode' but DB uses 'workOrderCode' - normalize
  const workOrderCodeFromBody = req.body.workOrderCode || req.body.orderCode || undefined;
  
  const { 
    name, 
    description, 
    quoteId, 
    status, 
    nodes, 
    quantity, 
    scheduleType, 
    materialSummary, 
    timingSummary,
    autoAssign 
  } = req.body;
  
  // Use normalized workOrderCode
  const workOrderCode = workOrderCodeFromBody;
  
  // DEBUG: Track template conversion
  console.log('🔄 PUT /production-plans/:id - Update request:', {
    id,
    receivedName: name,
    receivedOrderCode: req.body.orderCode,
    receivedWorkOrderCode: req.body.workOrderCode,
    normalizedWorkOrderCode: workOrderCode,
    receivedDescription: description,
    status,
    nodeCount: nodes?.length,
    willUpdatePlanName: name !== undefined,
    willUpdateWorkOrderCode: workOrderCode !== undefined
  });
  
  const trx = await db.transaction();
  
  try {
    // Build update object (only include provided fields)
    const updateData = {
      updatedAt: trx.fn.now()
    };
    
    if (name !== undefined) updateData.planName = name;
    if (description !== undefined) updateData.description = description;
    if (workOrderCode !== undefined) updateData.workOrderCode = workOrderCode;
    if (quoteId !== undefined) updateData.quoteId = quoteId;
    if (status !== undefined) updateData.status = status;
    if (quantity !== undefined) updateData.quantity = quantity;
    if (autoAssign !== undefined) updateData.autoAssign = autoAssign;
    if (timingSummary !== undefined) updateData.timingSummary = timingSummary ? JSON.stringify(timingSummary) : null;
    if (materialSummary !== undefined) updateData.materialSummary = materialSummary ? JSON.stringify(materialSummary) : null;
    
    const [updated] = await trx('mes.production_plans')
      .where('id', id)
      .update(updateData)
      .returning('*');
    
    if (!updated) {
      await trx.rollback();
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    console.log(`✅ Updated production plan: ${id}`, { name, workOrderCode, status, nodeCount: nodes?.length });
    
    // If nodes provided, delete old and insert new
    if (Array.isArray(nodes) && nodes.length > 0) {
      console.log(`🔄 Replacing nodes for plan ${id} (${nodes.length} nodes)`);
      
      // Delete existing nodes and related data
      const existingNodes = await trx('mes.production_plan_nodes')
        .where('planId', id)
        .select('nodeId');
      
      const existingNodeIds = existingNodes.map(n => n.nodeId);
      
      if (existingNodeIds.length > 0) {
        await trx('mes.node_predecessors').whereIn('nodeId', existingNodeIds).del();
        await trx('mes.node_material_inputs').whereIn('nodeId', existingNodeIds).del();
        await trx('mes.node_stations').whereIn('nodeId', existingNodeIds).del();
        await trx('mes.production_plan_nodes').where('planId', id).del();
      }
      
      // Process nodes (same logic as POST /templates)
      const processedNodes = applyOutputCodeSuffixes(nodes);
      const idMapping = {};
      
      processedNodes.forEach((node, index) => {
        const frontendId = node.id || node.nodeId;
        const numericPart = node.sequenceOrder || parseInt(String(frontendId).replace(/\D/g, '')) || (index + 1);
        const backendNodeId = `${id}-node-${numericPart}`;
        idMapping[frontendId] = backendNodeId;
      });
      
      for (let nodeIndex = 0; nodeIndex < processedNodes.length; nodeIndex++) {
        const node = processedNodes[nodeIndex];
        const frontendId = node.id || node.nodeId;
        const numericPart = node.sequenceOrder || parseInt(String(frontendId).replace(/\D/g, '')) || (nodeIndex + 1);
        const stringNodeId = `${id}-node-${numericPart}`;
        
        await trx('mes.production_plan_nodes').insert({
          planId: id,
          nodeId: stringNodeId,
          workOrderCode: workOrderCode,
          name: node.name,
          operationId: node.operationId,
          outputCode: node.outputCode,
          outputQty: node.outputQty || 1,
          outputUnit: node.outputUnit || 'adet',
          nominalTime: node.nominalTime || 0,
          efficiency: node.efficiency !== undefined ? parseFloat(node.efficiency) : 1.0,
          effectiveTime: node.effectiveTime || Math.round((node.nominalTime || 0) / (node.efficiency !== undefined ? parseFloat(node.efficiency) : 1.0)),
          sequenceOrder: numericPart,
          assignmentMode: node.assignmentMode || 'auto',
          x: node.x || 80,
          y: node.y || 80,
          createdAt: trx.fn.now()
        });
        
        // Material inputs
        if (node.materialInputs && node.materialInputs.length > 0) {
          const materialInputs = node.materialInputs.map(m => ({
            nodeId: stringNodeId,
            materialCode: m.materialCode,
            requiredQuantity: m.requiredQuantity,
            unitRatio: m.unitRatio || 1.0,
            isDerived: !!m.derivedFrom || !!m.isDerived,
            createdAt: trx.fn.now()
          }));
          await trx('mes.node_material_inputs').insert(materialInputs);
        }
        
        // Stations
        const stationList = node.stationIds || (node.assignedStations?.map(s => s.stationId || s.id)) || [];
        if (stationList.length > 0) {
          const stationAssignments = stationList.map((stId, idx) => ({
            nodeId: stringNodeId,
            stationId: stId,
            priority: idx + 1,
            createdAt: trx.fn.now()
          }));
          await trx('mes.node_stations').insert(stationAssignments);
        }
        
        // Predecessors
        const predecessorList = node.predecessors || [];
        if (Array.isArray(predecessorList) && predecessorList.length > 0) {
          const predecessorRecords = predecessorList
            .map(predId => {
              const backendPredId = idMapping[predId] || predId;
              return {
                nodeId: stringNodeId,
                predecessorNodeId: backendPredId,
                createdAt: trx.fn.now()
              };
            });
          await trx('mes.node_predecessors').insert(predecessorRecords);
        }
      }
      
      console.log(`✅ Replaced ${nodes.length} nodes for plan ${id}`);
    }
    
    // AUTO-CREATE FINISHED PRODUCT MATERIALS (if suffix was added)
    if (Array.isArray(nodes) && nodes.length > 0) {
      for (const node of nodes) {
        if (node.outputCode && node.outputCode.endsWith('F')) {
          const baseCode = node.outputCode.slice(0, -1);
          
          const finishedExists = await db('materials.materials')
            .where('code', node.outputCode)
            .first();
          
          if (!finishedExists) {
            const baseMaterial = await db('materials.materials')
              .where('code', baseCode)
              .first();
            
            if (baseMaterial) {
              await db('materials.materials').insert({
                code: node.outputCode,
                name: `${baseMaterial.name} (Finished)`,
                category: baseMaterial.category || 'cat_finished_product',
                type: 'finished_product',
                unit: baseMaterial.unit || 'adet',
                status: 'Aktif',
                createdAt: db.fn.now()
              });
              console.log(`✅ Auto-created finished product: ${node.outputCode} from ${baseCode}`);
            }
          }
        }
      }
    }
    
    await trx.commit();
    res.json(updated);
  } catch (error) {
    await trx.rollback();
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
      .select('id', 'status', 'launchedAt');
    
    if (!plan) {
      await trx.rollback();
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    // Prevent deletion of launched plans
    if (plan.launchedAt) {
      await trx.rollback();
      return res.status(400).json({ 
        error: 'Cannot delete launched plan',
        details: 'Plan has been launched and cannot be deleted'
      });
    }
    
    // Get node IDs first
    const nodes = await trx('mes.production_plan_nodes')
      .where('planId', req.params.id)
      .select('id');
    
    const nodeIds = nodes.map(n => n.id);
    
    // Delete in correct order (FK constraints)
    if (nodeIds.length > 0) {
      await trx('mes.node_stations')
        .whereIn('nodeId', nodeIds)
        .delete();
      
      await trx('mes.node_material_inputs')
        .whereIn('nodeId', nodeIds)
        .delete();
    }
    
    await trx('mes.production_plan_nodes')
      .where('planId', req.params.id)
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
 * ✅ FAZ 3: Added currentExpectedEnd database field check
 */
async function findEarliestSubstation(trx, stationOptions, scheduleMap, afterTime) {
  let bestSubstation = null;
  let earliestTime = null;
  
  for (const stOpt of stationOptions) {
    const substations = await trx('mes.substations')
      .where('stationId', stOpt.stationId)
      .where('isActive', true);
    
    for (const sub of substations) {
      // ✅ FAZ 3: Check database currentExpectedEnd field
      let dbEnd = afterTime;
      if (sub.currentExpectedEnd) {
        const dbEndTime = new Date(sub.currentExpectedEnd);
        if (dbEndTime > afterTime) {
          dbEnd = dbEndTime;
        }
      }
      
      // Check memory schedule
      const memSchedule = scheduleMap.get(sub.id) || [];
      const memEnd = calculateEarliestSlot(memSchedule, afterTime);
      
      // Use the latest of: afterTime, dbEnd, memEnd
      const availableAt = new Date(Math.max(
        afterTime.getTime(),
        dbEnd.getTime(),
        memEnd.getTime()
      ));
      
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
  // ✅ CRITICAL: Empty schedule should NOT match (fall through to least-busy selection)
  // Previously returned true, which caused first worker to always be selected
  if (shiftBlocks.length === 0) return false;
  
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
 * ✅ FAZ 3: Added worker status filtering
 */
async function findWorkerWithShiftCheck(trx, requiredSkills, stationId, startTime, duration, workerSchedule = new Map()) {
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][startTime.getDay()];
  
  // Get workers with matching skills (or all if no skills required)
  let query = trx('mes.workers').where('isActive', true);
  
  // ✅ FIXED: Worker must have ALL required skills (AND logic)
  if (requiredSkills && requiredSkills.length > 0) {
    // Check if worker.skills array contains ALL required skills
    requiredSkills.forEach(skill => {
      query = query.whereRaw(`skills::jsonb @> ?::jsonb`, [JSON.stringify([skill])]);
    });
  }
  
  const workers = await query;
  
  // ✅ FAZ 3: Filter by worker status (available/busy only, not break/inactive)
  // NOTE: Absence check is done later in the loop using actualStart
  const eligibleWorkers = workers.filter(w => {
    // Worker status filtering
    const status = normalizeWorkerStatus(w);
    if (status === 'inactive' || status === 'break') {
      return false;
    }
    
    return true;
  });
  
  if (eligibleWorkers.length === 0) {
    console.warn(`⚠️  No eligible workers found (${workers.length} filtered out by status)`);
    return null;
  }
  
  // Filter by shift availability AND current schedule conflicts
  let hasValidShiftConfig = false; // Track if ANY worker has valid shift blocks
  
  for (const worker of eligibleWorkers) {
    // ✅ CRITICAL: Calculate worker's actual availability
    const workerQueue = workerSchedule.get(worker.id) || [];
    const workerAvailableAt = workerQueue.length > 0
      ? new Date(workerQueue[workerQueue.length - 1].end.getTime() + 1000) // Last task end + 1 second
      : startTime; // If no queue, use requested start time
    
    // Use the later of worker availability or requested start time
    const actualStart = new Date(Math.max(workerAvailableAt.getTime(), startTime.getTime()));
    const proposedEnd = new Date(actualStart.getTime() + duration * 60000);
    
    // ✅ CRITICAL: Check absence on ACTUAL start date, not requested date
    const actualTaskDate = actualStart.toISOString().split('T')[0];
    const absences = typeof worker.absences === 'string' ? JSON.parse(worker.absences) : (worker.absences || []);
    const workerWithAbsences = { ...worker, absences };
    
    if (isWorkerAbsent(workerWithAbsences, actualStart)) {
      console.log(`⚠️  Worker ${worker.name} is absent on ${actualTaskDate} (actual start), skipping...`);
      continue; // Skip this worker, try next
    }
    
    // Check conflicts using worker's actual start time
    const hasConflict = workerQueue.some(task => {
      return (actualStart < task.end && proposedEnd > task.start);
    });
    
    if (hasConflict) {
      console.log(`⚠️  Worker ${worker.name} has schedule conflict at ${actualStart.toISOString()}, skipping...`);
      continue; // Skip this worker, try next
    }
    
    // Parse personalSchedule if it's a string (safety check)
    const schedule = typeof worker.personalSchedule === 'string' 
      ? JSON.parse(worker.personalSchedule) 
      : worker.personalSchedule;
    
    // ✅ CRITICAL: Check shift blocks using ACTUAL start time, not requested time
    const actualDayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][actualStart.getDay()];
    const shiftBlocks = getShiftBlocksForDay(schedule, actualDayOfWeek);
    
    // Track if shift config exists
    if (shiftBlocks.length > 0) {
      hasValidShiftConfig = true;
    }
    
    if (isWithinShiftBlocks(actualStart, duration, shiftBlocks)) {
      return worker;
    }
  }
  
  // ✅ FALLBACK: If no shift match OR no valid shift config, select least busy worker
  // Prevents always selecting first worker alphabetically when schedule is empty
  if (!hasValidShiftConfig) {
    console.warn(`⚠️  No shift configuration found for any worker on ${dayOfWeek}, selecting least busy worker`);
  } else {
    console.warn(`⚠️  No worker matches shift for ${dayOfWeek}, selecting least busy worker`);
  }
  
  const workerAvailability = eligibleWorkers.map(worker => {
    const workerQueue = workerSchedule.get(worker.id) || [];
    const availableAt = workerQueue.length > 0
      ? new Date(workerQueue[workerQueue.length - 1].end.getTime() + 1000)
      : startTime;
    return { worker, availableAt };
  });
  
  // Sort by earliest availability
  workerAvailability.sort((a, b) => a.availableAt.getTime() - b.availableAt.getTime());
  
  return workerAvailability[0]?.worker || null;
}

/**
 * Check if worker is absent on a given date
 * ✅ FAZ 1A-3: Worker absence management
 * 
 * Worker absences structure:
 * worker.absences = [
 *   {
 *     id: "abs-001",
 *     type: "vacation" | "sick" | "training" | "meeting" | "other",
 *     startDate: "2025-12-20",
 *     endDate: "2025-12-27",
 *     reason: "Yıllık izin",
 *     createdAt: "2025-11-20T10:00:00Z",
 *     createdBy: "admin-id"
 *   }
 * ]
 * 
 * @param {Object} worker - Worker object with absences array
 * @param {Date} date - Date to check
 * @returns {Object|null} Absence record if found, null otherwise
 */
function isWorkerAbsent(worker, date) {
  if (!worker || !worker.absences || !Array.isArray(worker.absences)) {
    return null; // No absences configured
  }
  
  const checkDate = date.getTime ? date.getTime() : new Date(date).getTime();
  
  for (const absence of worker.absences) {
    if (!absence.startDate || !absence.endDate) {
      continue; // Skip invalid absence records
    }
    
    const start = new Date(absence.startDate).setHours(0, 0, 0, 0);
    const end = new Date(absence.endDate).setHours(23, 59, 59, 999);
    
    // Check if date falls within absence period (inclusive)
    if (checkDate >= start && checkDate <= end) {
      return absence;
    }
  }
  
  return null; // Not absent
}

/**
 * Normalize worker status to standard enum
 * ✅ FAZ 3: Worker status normalization
 * 
 * @param {Object} worker - Worker object
 * @returns {string} - 'available' | 'busy' | 'break' | 'inactive'
 */
function normalizeWorkerStatus(worker) {
  if (!worker) return 'inactive';
  
  let status = worker.status || worker.availability || 'available';
  status = status.toString().toLowerCase();
  
  // Legacy value normalization
  if (/active|enabled|on|available/i.test(status)) return 'available';
  if (/inactive|off|removed|disabled/i.test(status)) return 'inactive';
  if (/break|paused|rest|lunch/i.test(status)) return 'break';
  if (/busy|working|occupied/i.test(status)) return 'busy';
  
  // Default to available if unclear
  return 'available';
}

/**
 * Validate materials for launch (non-blocking warnings)
 * ✅ FAZ 3: Material validation for start nodes + M-00 materials
 * 
 * @param {Object} trx - Knex transaction
 * @param {string} planId - Production plan ID
 * @param {Array} nodes - Plan nodes (with materialInputs already attached)
 * @param {Array} predecessors - Node predecessors
 * @returns {Promise<Array>} - Array of material warnings
 */
async function validateMaterialsForLaunch(trx, planId, nodes, predecessors) {
  const warnings = [];
  
  // 1. Identify start nodes (no predecessors)
  const startNodeIds = new Set(
    nodes
      .filter(n => {
        const hasPred = predecessors.some(p => p.nodeId === n.nodeId);
        return !hasPred;
      })
      .map(n => n.nodeId)
  );
  
  console.log(`🔍 Material validation: ${startNodeIds.size} start nodes`);
  
  // 2. Collect materials to check (start nodes + M-00 raw materials)
  const materialsToCheck = new Map();
  
  for (const node of nodes) {
    const shouldCheckNode = startNodeIds.has(node.nodeId);
    
    // Use pre-loaded materialInputs from node
    const inputs = node.materialInputs || [];
    
    for (const mat of inputs) {
      const isRawMaterial = mat.materialCode && mat.materialCode.startsWith('M-00');
      const shouldCheck = shouldCheckNode || isRawMaterial;
      
      if (shouldCheck && !mat.isDerived) {
        const key = mat.materialCode;
        const existing = materialsToCheck.get(key) || {
          materialCode: key,
          requiredQuantity: 0,
          unit: mat.unit || 'adet',
          nodeNames: new Set()
        };
        
        existing.requiredQuantity += parseFloat(mat.requiredQuantity || 0);
        existing.nodeNames.add(node.name || node.nodeId);
        materialsToCheck.set(key, existing);
      }
    }
  }
  
  console.log(`📊 Checking ${materialsToCheck.size} materials`);
  
  // 3. Check stock availability
  for (const [code, mat] of materialsToCheck) {
    try {
      const stock = await trx('materials.materials')
        .where('code', code)
        .first();
      
      const available = parseFloat(stock?.stock || stock?.available || 0);
      const required = mat.requiredQuantity;
      
      if (available < required) {
        warnings.push({
          nodeName: Array.from(mat.nodeNames).join(', '),
          materialCode: code,
          required: Math.round(required * 100) / 100,
          available: Math.round(available * 100) / 100,
          shortage: Math.round((required - available) * 100) / 100,
          unit: mat.unit
        });
      }
    } catch (error) {
      console.warn(`⚠️  Material ${code} not found in stock table`);
      warnings.push({
        nodeName: Array.from(mat.nodeNames).join(', '),
        materialCode: code,
        required: Math.round(mat.requiredQuantity * 100) / 100,
        available: 0,
        shortage: Math.round(mat.requiredQuantity * 100) / 100,
        unit: mat.unit,
        error: 'Material not found in stock'
      });
    }
  }
  
  if (warnings.length > 0) {
    console.warn(`⚠️  ${warnings.length} material shortage(s) detected (non-blocking)`);
  }
  
  return warnings;
}

/**
 * Topological sort for parallel execution
 */
/**
 * Topological sort using Kahn's algorithm
 * ✅ FIXED: Uses node.nodeId (VARCHAR) instead of node.id (INTEGER)
 */
function topologicalSort(nodes, predecessors) {
  const graph = new Map();
  const inDegree = new Map();
  
  // ✅ FIXED: Use node.nodeId (VARCHAR)
  nodes.forEach(n => {
    graph.set(n.nodeId, []);
    inDegree.set(n.nodeId, 0);
  });
  
  // Predecessors already use VARCHAR nodeId/predecessorNodeId
  predecessors.forEach(p => {
    graph.get(p.predecessorNodeId).push(p.nodeId);
    inDegree.set(p.nodeId, inDegree.get(p.nodeId) + 1);
  });
  
  // ✅ FIXED: Filter and map using node.nodeId
  const queue = nodes.filter(n => inDegree.get(n.nodeId) === 0).map(n => n.nodeId);
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
  
  // ✅ CRITICAL: Detect dependency cycles
  if (order.length !== nodes.length) {
    const missingNodes = nodes.filter(n => !order.includes(n.nodeId)).map(n => n.name);
    throw new Error(`Dependency cycle detected! Cannot process nodes: ${missingNodes.join(', ')}`);
  }
  
  return order;
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
      .where('status', 'production') // ✅ FIXED: Plans are now saved as 'production', not 'draft'
      .first();
    
    if (!plan) {
      await trx.rollback();
      return res.status(404).json({ error: 'Plan not found or already launched' });
    }
    
    console.log(`🚀 Launching production plan: ${id}`);
    
    // 2. Load nodes and dependency graph
    const nodes = await trx('mes.production_plan_nodes')
      .where('planId', id)
      .orderBy('sequenceOrder');
    
    // 2a. Load material inputs for each node (needed for pre-production calculations)
    const allMaterialInputs = await trx('mes.node_material_inputs')
      .whereIn('nodeId', nodes.map(n => n.nodeId));
    
    // Get unique material codes to fetch units
    const uniqueMaterialCodes = [...new Set(allMaterialInputs.map(mi => mi.materialCode))];
    const materialsWithUnits = await trx('materials.materials')
      .select('code', 'unit')
      .whereIn('code', uniqueMaterialCodes);
    
    const materialUnitMap = new Map(materialsWithUnits.map(m => [m.code, m.unit]));
    
    // Attach materialInputs array to each node
    nodes.forEach(node => {
      node.materialInputs = allMaterialInputs
        .filter(mi => mi.nodeId === node.nodeId)
        .map(mi => ({
          materialCode: mi.materialCode,
          requiredQuantity: parseFloat(mi.requiredQuantity) || 0,
          unit: materialUnitMap.get(mi.materialCode) || node.outputUnit || 'adet',
          isDerived: mi.isDerived || false
        }));
    });
    
    // ✅ FIXED: Use nodeId (VARCHAR) not id (INTEGER)
    const predecessors = await trx('mes.node_predecessors')
      .whereIn('nodeId', nodes.map(n => n.nodeId));  // VARCHAR foreign key!
    
    // 3. Topological sort for execution order
    const executionOrder = topologicalSort(nodes, predecessors);
    
    // ✅ FAZ 3: Material validation (non-blocking warnings)
    const materialWarnings = await validateMaterialsForLaunch(trx, id, nodes, predecessors);
    
    // 4. Initialize tracking maps from existing assignments
    const workerSchedule = new Map();      // workerId → [{ start, end, seq }]
    const substationSchedule = new Map();  // substationId → [{ start, end }]
    const nodeCompletionTimes = new Map(); // nodeId → estimatedEnd
    const assignments = [];
    let queuedCount = 0;
    
    // ✅ CRITICAL: Load existing worker assignments to prevent conflicts
    // Include 'paused' - a paused worker/substation is still occupied!
    const existingAssignments = await trx('mes.worker_assignments')
      .select('workerId', 'substationId', 'expectedStart', 'plannedEnd', 'sequenceNumber')
      .whereIn('status', ['pending', 'queued', 'in_progress', 'paused'])
      .orderBy('expectedStart');
    
    // Populate schedules from existing assignments
    existingAssignments.forEach(a => {
      // Worker schedule
      const workerQueue = workerSchedule.get(a.workerId) || [];
      workerQueue.push({ 
        start: new Date(a.expectedStart), 
        end: new Date(a.plannedEnd), 
        sequenceNumber: a.sequenceNumber 
      });
      workerSchedule.set(a.workerId, workerQueue);
      
      // Substation schedule
      const subSchedule = substationSchedule.get(a.substationId) || [];
      subSchedule.push({ 
        start: new Date(a.expectedStart), 
        end: new Date(a.plannedEnd) 
      });
      substationSchedule.set(a.substationId, subSchedule);
    });
    
    console.log(`📋 Loaded ${existingAssignments.length} existing assignments into schedule maps`);
    
    // 5. Process nodes in topological order
    for (const nodeId of executionOrder) {
      // ✅ FIXED: executionOrder contains nodeId (VARCHAR strings)
      const node = nodes.find(n => n.nodeId === nodeId);
      
      // 5a. Calculate earliest start (wait for predecessors)
      const predecessorIds = predecessors
        .filter(p => p.nodeId === nodeId)
        .map(p => p.predecessorNodeId);
      
      let earliestStart = new Date();
      for (const predId of predecessorIds) {
        const predEnd = nodeCompletionTimes.get(predId);
        if (predEnd && predEnd > earliestStart) {
          earliestStart = predEnd;
        }
      }
      
      // 5b. Get station options
      // ✅ FIXED: Use node.nodeId (VARCHAR) not node.id (INTEGER)
      const stationOptions = await trx('mes.node_stations')
        .where('nodeId', node.nodeId)
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
      
      // 5d. Get operation skills and defect rate
      const operation = await trx('mes.operations')
        .where('id', node.operationId)
        .first();
      
      // Get station's additional skill requirements
      const station = await trx('mes.stations')
        .where('id', substation.stationId)
        .first();
      
      // Combine operation skills + station subSkills (both required)
      const operationSkills = operation?.skills || [];
      const stationSkills = station?.subSkills || [];
      const requiredSkills = [...new Set([...operationSkills, ...stationSkills])]; // Unique skills
      
      const expectedDefectRate = operation?.expectedDefectRate || 0;
      
      // 5e. Find worker with shift check
      const effectiveDuration = parseFloat(node.effectiveTime) || 0;
      
      const worker = await findWorkerWithShiftCheck(
        trx,
        requiredSkills,
        substation.stationId,
        availableAt, // Pass substation availability
        effectiveDuration,
        workerSchedule  // ✅ CRITICAL: Pass current schedule to avoid conflicts
      );
      
      if (!worker) {
        // Fetch skill names from database
        let skillNames = 'genel';
        if (requiredSkills.length > 0) {
          const skills = await trx('mes.skills')
            .whereIn('id', requiredSkills)
            .select('name');
          skillNames = skills.map(s => s.name).join(', ');
        }
        throw new Error(`"${node.name}" işi için yetenek uyuşması sağlanan personel bulunamadı\n\nGerekli yetenekler: ${skillNames}`);
      }
      
      // 5f. Calculate worker queue position (worker-specific sequence)
      const workerQueue = workerSchedule.get(worker.id) || [];
      // sequenceNumber is per-worker, not global
      const sequenceNumber = workerQueue.length + 1;
      
      console.log('[LAUNCH] Node "' + node.name + '" - Worker ' + worker.name + ': Sequence=' + sequenceNumber + ', Queue=' + workerQueue.length + ', LastEnd=' + (workerQueue.length > 0 ? workerQueue[workerQueue.length - 1].end.toISOString() : 'N/A') + ', SubAvail=' + availableAt.toISOString());
      
      // 5g. Determine actual start (max of worker and substation)
      let workerAvailableAt = workerQueue.length > 0
        ? new Date(workerQueue[workerQueue.length - 1].end.getTime() + 1000) // Add 1 second gap
        : availableAt;
      
      // ⚠️ CRITICAL FIX: First determine the earliest possible start (considering worker + substation)
      let earliestPossibleStart = new Date(Math.max(
        workerAvailableAt.getTime(),
        availableAt.getTime()
      ));
      
      // ✅ FAZ 3: Adjust start time for worker schedule (avoid breaks)
      // BUT: Only adjust if it doesn't conflict with worker availability
      const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][earliestPossibleStart.getDay()];
      
      // Parse worker's personal schedule safely
      const personalSchedule = typeof worker.personalSchedule === 'string'
        ? JSON.parse(worker.personalSchedule)
        : worker.personalSchedule;
      
      const scheduleBlocks = getShiftBlocksForDay(personalSchedule, dayOfWeek);
      
      let actualStart;
      if (scheduleBlocks.length === 0) {
        // ✅ FAZ 1A-1: Worker has no personal schedule, fetch from master-data (async)
        const shiftNo = personalSchedule?.shiftNo || '1';
        const defaultBlocks = await getDefaultWorkSchedule(trx, dayOfWeek, shiftNo);
        if (defaultBlocks.length > 0) {
          actualStart = adjustStartTimeForSchedule(earliestPossibleStart, defaultBlocks);
        } else {
          actualStart = earliestPossibleStart;
        }
      } else {
        actualStart = adjustStartTimeForSchedule(earliestPossibleStart, scheduleBlocks);
      }
      
      // ⚠️ CRITICAL: If schedule adjustment moved start BEFORE worker is available, override it
      if (actualStart < workerAvailableAt) {
        console.warn('[LAUNCH] Schedule conflict: Worker not available until ' + workerAvailableAt.toISOString() + ', but schedule suggests ' + actualStart.toISOString() + '. Using worker availability.');
        actualStart = new Date(workerAvailableAt);
      }
      
      console.log('[LAUNCH] Node "' + node.name + '" - Timing: Earliest=' + earliestPossibleStart.toISOString() + ', Adjusted=' + actualStart.toISOString() + ', WorkerAvail=' + workerAvailableAt.toISOString() + ', SubAvail=' + availableAt.toISOString());
      
      // ✅ FAZ 2: Check if actualStart is a holiday, reschedule to next working day
      if (await isHoliday(trx, actualStart)) {
        console.log(`⚠️  actualStart ${actualStart.toISOString()} is a holiday, finding next working day...`);
        const nextWorkingDay = await findNextWorkingDay(trx, actualStart, worker);
        if (nextWorkingDay) {
          actualStart = nextWorkingDay;
          console.log(`✅ Rescheduled to next working day: ${actualStart.toISOString()}`);
        } else {
          console.error(`❌ No working day found within 365 days from ${actualStart.toISOString()}`);
        }
      }
      
      // ✅ FAZ 3: Calculate end time with breaks
      let actualEnd;
      // ✅ FAZ 1B: Use async calculateEndTimeWithBreaks with worker context
      const effectiveTimeMinutes = parseFloat(node.effectiveTime) || 0;
      
      // ✅ FAZ 1B: Always use async calculateEndTimeWithBreaks (handles multi-day, holidays, absences)
      actualEnd = await calculateEndTimeWithBreaks(trx, actualStart, effectiveTimeMinutes, worker);
      
      const isQueued = sequenceNumber > 1;
      if (isQueued) queuedCount++;
      
      // 5h. Calculate pre-production reserved amount and planned output
      const planQuantity = plan.quantity || 1;
      const preProductionReservedAmount = calculatePreProductionReservedAmount(
        node,
        expectedDefectRate,
        planQuantity
      );
      const plannedOutput = calculatePlannedOutput(node, planQuantity);
      
      // 5i. Create worker assignment and get its ID
      // ✅ FIXED: nodeId is INTEGER foreign key to production_plan_nodes.id (NOT nodeId VARCHAR!)
      const [createdAssignment] = await trx('mes.worker_assignments')
        .insert({
          planId: id,
          workOrderCode: plan.workOrderCode,
          nodeId: node.id, // INTEGER foreign key to production_plan_nodes.id
          workerId: worker.id,
          substationId: substation.id,
          operationId: node.operationId,
          status: isQueued ? 'queued' : 'pending',
          nominalTime: parseInt(node.nominalTime) || null,
          effectiveTime: parseInt(node.effectiveTime) || null,
          expectedStart: actualStart,
          plannedEnd: actualEnd,
          estimatedStartTime: actualStart,
          estimatedEndTime: actualEnd,
          sequenceNumber: sequenceNumber,
          preProductionReservedAmount: Object.keys(preProductionReservedAmount).length > 0 
            ? JSON.stringify(preProductionReservedAmount) 
            : null,
          plannedOutput: Object.keys(plannedOutput).length > 0 
            ? JSON.stringify(plannedOutput) 
            : null,
          materialReservationStatus: 'pending',
          createdAt: trx.fn.now()
        })
        .returning('id'); // ✅ Get the assignment ID
      
      // 5i. Update node
      await trx('mes.production_plan_nodes')
        .where('id', node.id)
        .update({
          assignedWorkerId: worker.id,
          estimatedStartTime: actualStart,
          estimatedEndTime: actualEnd,
          updatedAt: trx.fn.now()
        });
      
      // 5j. Update schedules
      workerQueue.push({ start: actualStart, end: actualEnd, sequenceNumber });
      workerSchedule.set(worker.id, workerQueue);
      
      const subSchedule = substationSchedule.get(substation.id) || [];
      subSchedule.push({ start: actualStart, end: actualEnd });
      substationSchedule.set(substation.id, subSchedule);
      
      // ✅ FIXED: Use node.nodeId (VARCHAR) for predecessor lookup
      nodeCompletionTimes.set(node.nodeId, actualEnd);
      
      // 5k. Reserve substation ONLY for pending (first-in-queue) tasks
      // Queued tasks should NOT reserve the substation until they become pending
      if (!isQueued) {
        await trx('mes.substations')
          .where('id', substation.id)
          .update({
            status: 'reserved',
            currentAssignmentId: createdAssignment.id, // ✅ Use worker_assignment.id for consistency
            assignedWorkerId: worker.id,
            currentOperation: node.operationId,
            reservedAt: trx.fn.now(),
            updatedAt: trx.fn.now()
          });
      } else {
        console.log(`⏭️  Node "${node.name}" is queued (seq ${sequenceNumber}), substation NOT reserved yet`);
      }
      
      // 5l. Track for response
      assignments.push({
        nodeId: node.nodeId,
        nodeName: node.name,
        workerId: worker.id,
        workerName: worker.name,
        substationId: substation.id,
        substationName: substation.name,
        estimatedStart: actualStart,
        estimatedEnd: actualEnd,
        sequenceNumber,
        isQueued,
        preProductionReservedAmount: Object.keys(preProductionReservedAmount).length > 0 
          ? preProductionReservedAmount 
          : null,
        plannedOutput: Object.keys(plannedOutput).length > 0 
          ? plannedOutput 
          : null,
        materialReservationStatus: 'pending'
      });
      
      console.log(`   ✓ ${node.name}: ${worker.name} @ ${substation.name} (seq ${sequenceNumber})`);
    }
    
    // 6. Update plan status
    await trx('mes.production_plans')
      .where('id', id)
      .update({
        status: 'active',
        launchedAt: trx.fn.now()
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
        estimatedDuration: Math.ceil((maxEnd - minStart) / 60000)
      },
      assignments,
      queuedTasks: queuedCount,
      warnings: materialWarnings.length > 0 ? { materials: materialWarnings } : undefined
    });
    
  } catch (error) {
    await trx.rollback();
    console.error('❌ Error launching plan:', error);
    res.status(500).json({ 
      error: 'Failed to launch plan',
      message: error.message,  // Frontend reads this field
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
        pausedAt: db.fn.now() 
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
        resumedAt: db.fn.now() 
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
      .where('n.planId', planId)
      .leftJoin('mes.operations as op', 'n.operationId', 'op.id')
      .select(
        'n.*',
        'op.name as operationName'
      )
      .orderBy('n.sequenceOrder');
    
    // Get materials for each node
    const materials = await db('mes.node_material_inputs')
      .whereIn('nodeId', nodes.map(n => n.id));
    
    // Get stations for each node
    const stations = await db('mes.node_stations as ns')
      .whereIn('ns.nodeId', nodes.map(n => n.id))
      .leftJoin('mes.stations as s', 'ns.stationId', 's.id')
      .select(
        'ns.nodeId',
        'ns.stationId',
        'ns.priority',
        's.name as stationName'
      )
      .orderBy('ns.priority');
    
    // Assemble response
    const nodesWithDetails = nodes.map(node => ({
      ...node,
      materialInputs: materials
        .filter(m => m.nodeId === node.id)
        .map(m => ({
          materialCode: m.materialCode,
          requiredQuantity: m.requiredQuantity,
          unitRatio: m.unitRatio,
          isDerived: m.isDerived
        })),
      assignedStations: stations
        .filter(s => s.nodeId === node.id)
        .map(s => ({
          stationId: s.stationId,
          stationName: s.stationName,
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
      .where('planId', planId)
      .orderBy('sequenceOrder', 'desc')
      .first();
    
    const sequenceOrder = nodeData.sequenceOrder || (lastNode ? lastNode.sequenceOrder + 1 : 1);
    
    // Calculate effective time
    const effectiveTime = nodeData.nominalTime / (nodeData.efficiency || 0.85);
    
    // Insert node
    const [node] = await trx('mes.production_plan_nodes')
      .insert({
        planId: planId,
        nodeId: nodeData.nodeId || `${planId}-node-${sequenceOrder}`,
        name: nodeData.name,
        operationId: nodeData.operationId,
        nominalTime: nodeData.nominalTime,
        efficiency: nodeData.efficiency || 0.85,
        effectiveTime: effectiveTime,
        assignmentMode: nodeData.assignmentMode || 'auto',
        outputCode: nodeData.outputCode,
        outputQty: nodeData.outputQty,
        outputUnit: nodeData.outputUnit,
        sequenceOrder: sequenceOrder,
        workOrderCode: plan.workOrderCode
      })
      .returning('*');
    
    // Insert material inputs
    if (nodeData.materialInputs && nodeData.materialInputs.length > 0) {
      const materialInserts = nodeData.materialInputs.map(mat => ({
        nodeId: node.id,
        materialCode: mat.materialCode,
        requiredQuantity: mat.requiredQuantity,
        unitRatio: mat.unitRatio || 1.0,
        isDerived: mat.isDerived || false
      }));
      
      await trx('mes.node_material_inputs').insert(materialInserts);
    }
    
    // Insert station assignments
    if (nodeData.stationIds && nodeData.stationIds.length > 0) {
      const stationInserts = nodeData.stationIds.map((stationId, idx) => ({
        nodeId: node.id,
        stationId: stationId,
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
      .where('n.planId', planId)
      .where(function() {
        this.where('n.id', nodeId).orWhere('n.nodeId', nodeId);
      })
      .leftJoin('mes.operations as op', 'n.operationId', 'op.id')
      .select(
        'n.*',
        'op.name as operationName',
        'op.skills as operationSkills'
      )
      .first();
    
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    // Get material inputs
    const materials = await db('mes.node_material_inputs')
      .where('nodeId', node.id)
      .select('*');
    
    // Get assigned stations
    const stations = await db('mes.node_stations as ns')
      .where('ns.nodeId', node.id)
      .leftJoin('mes.stations as s', 'ns.stationId', 's.id')
      .select(
        'ns.stationId',
        'ns.priority',
        's.name as stationName',
        's.description as stationDescription'
      )
      .orderBy('ns.priority');
    
    // Assemble response
    const nodeDetails = {
      ...node,
      materialInputs: materials.map(m => ({
        materialCode: m.materialCode,
        requiredQuantity: m.requiredQuantity,
        unitRatio: m.unitRatio,
        isDerived: m.isDerived
      })),
      assignedStations: stations.map(s => ({
        stationId: s.stationId,
        stationName: s.stationName,
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
      .where('planId', planId)
      .where(function() {
        this.where('id', nodeId).orWhere('nodeId', nodeId);
      })
      .first();
    
    if (!node) {
      await trx.rollback();
      return res.status(404).json({ error: 'Node not found' });
    }
    
    // Prepare update data
    const updateData = {};
    if (updates.name) updateData.name = updates.name;
    if (updates.operationId) updateData.operationId = updates.operationId;
    if (updates.nominalTime) {
      updateData.nominalTime = updates.nominalTime;
      updateData.effectiveTime = updates.nominalTime / (updates.efficiency || node.efficiency || 0.85);
    }
    if (updates.efficiency) {
      updateData.efficiency = updates.efficiency;
      updateData.effectiveTime = (updates.nominalTime || node.nominalTime) / updates.efficiency;
    }
    if (updates.outputCode) updateData.outputCode = updates.outputCode;
    if (updates.outputQty) updateData.outputQty = updates.outputQty;
    if (updates.outputUnit) updateData.outputUnit = updates.outputUnit;
    if (updates.sequenceOrder) updateData.sequenceOrder = updates.sequenceOrder;
    if (updates.assignmentMode) updateData.assignmentMode = updates.assignmentMode;
    
    updateData.updatedAt = trx.fn.now();
    
    // Update node
    await trx('mes.production_plan_nodes')
      .where('id', node.id)
      .update(updateData);
    
    // Update materials if provided
    if (updates.materialInputs) {
      await trx('mes.node_material_inputs')
        .where('nodeId', node.id)
        .delete();
      
      if (updates.materialInputs.length > 0) {
        const materialInserts = updates.materialInputs.map(mat => ({
          nodeId: node.id,
          materialCode: mat.materialCode,
          requiredQuantity: mat.requiredQuantity,
          unitRatio: mat.unitRatio || 1.0,
          isDerived: mat.isDerived || false
        }));
        
        await trx('mes.node_material_inputs').insert(materialInserts);
      }
    }
    
    // Update stations if provided
    if (updates.stationIds) {
      await trx('mes.node_stations')
        .where('nodeId', node.id)
        .delete();
      
      if (updates.stationIds.length > 0) {
        const stationInserts = updates.stationIds.map((stationId, idx) => ({
          nodeId: node.id,
          stationId: stationId,
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
      .where('planId', planId)
      .where(function() {
        this.where('id', nodeId).orWhere('nodeId', nodeId);
      })
      .first();
    
    if (!node) {
      await trx.rollback();
      return res.status(404).json({ error: 'Node not found' });
    }
    
    // Delete related data (CASCADE handles most, but explicit for clarity)
    await trx('mes.node_stations')
      .where('nodeId', node.id)
      .delete();
    
    await trx('mes.node_material_inputs')
      .where('nodeId', node.id)
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
      .join('mes.production_plans as p', 'n.planId', 'p.id')
      .where('n.id', nodeId)
      .select('n.*', 'p.status as planStatus', 'p.workOrderCode')
      .first();
    
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    if (node.planStatus !== 'draft') {
      return res.status(400).json({ 
        error: 'Can only modify materials in draft plans' 
      });
    }
    
    // Check if material already exists
    const existing = await db('mes.node_material_inputs')
      .where('nodeId', nodeId)
      .where('materialCode', materialCode)
      .first();
    
    if (existing) {
      return res.status(400).json({ 
        error: 'Material already added to this node' 
      });
    }
    
    // Insert material
    const [material] = await db('mes.node_material_inputs')
      .insert({
        nodeId: nodeId,
        materialCode: materialCode,
        requiredQuantity: requiredQuantity,
        unitRatio: unitRatio || 1.0,
        isDerived: isDerived || false
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
      .join('mes.production_plans as p', 'n.planId', 'p.id')
      .where('n.id', nodeId)
      .select('p.status as planStatus')
      .first();
    
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    if (node.planStatus !== 'draft') {
      return res.status(400).json({ 
        error: 'Can only modify materials in draft plans' 
      });
    }
    
    // Delete material
    const deleted = await db('mes.node_material_inputs')
      .where('nodeId', nodeId)
      .where('materialCode', materialCode)
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
      .join('mes.production_plans as p', 'n.planId', 'p.id')
      .where('n.id', nodeId)
      .select('p.status as planStatus')
      .first();
    
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    if (node.planStatus !== 'draft') {
      return res.status(400).json({ 
        error: 'Can only modify stations in draft plans' 
      });
    }
    
    // Check if station already assigned
    const existing = await db('mes.node_stations')
      .where('nodeId', nodeId)
      .where('stationId', stationId)
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
        .where('nodeId', nodeId)
        .orderBy('priority', 'desc')
        .first();
      
      stationPriority = lastStation ? lastStation.priority + 1 : 1;
    }
    
    // Insert station assignment
    const [station] = await db('mes.node_stations')
      .insert({
        nodeId: nodeId,
        stationId: stationId,
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
      .join('mes.production_plans as p', 'n.planId', 'p.id')
      .where('n.id', nodeId)
      .select('p.status as planStatus')
      .first();
    
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    if (node.planStatus !== 'draft') {
      return res.status(400).json({ 
        error: 'Can only modify stations in draft plans' 
      });
    }
    
    // Delete station assignment
    const deleted = await db('mes.node_stations')
      .where('nodeId', nodeId)
      .where('stationId', stationId)
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
      .where('isActive', true)
      .select('id', 'name');
    
    // Get current assignments (in-progress)
    const activeAssignments = await db('mes.worker_assignments as wa')
      .join('mes.workers as w', 'w.id', 'wa.workerId')
      .whereIn('wa.status', ['in_progress', 'ready'])
      .select('wa.workerId', 'w.name as workerName')
      .groupBy('wa.workerId', 'w.name');
    
    const activeWorkerIds = new Set(activeAssignments.map(a => a.workerId));
    
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
      .join('mes.operations as op', 'op.id', 'wa.operationId')
      .join('mes.production_plan_nodes as n', 'n.id', 'wa.nodeId')
      .where('wa.status', 'completed')
      .whereNotNull('wa.startedAt')
      .whereNotNull('wa.completedAt')
      .select(
        'op.id as operationId',
        'op.name as operationName',
        'n.effectiveTime',
        db.raw(`EXTRACT(EPOCH FROM (wa.completedAt - wa.startedAt)) / 60 as actualMinutes`)
      );
    
    // Aggregate by operation
    const operationStats = {};
    
    completedAssignments.forEach(a => {
      const opId = a.operationId;
      if (!operationStats[opId]) {
        operationStats[opId] = {
          operationId: opId,
          operationName: a.operationName,
          totalTime: 0,
          instances: 0,
          estimatedTime: 0
        };
      }
      
      operationStats[opId].totalTime += parseFloat(a.actualMinutes) || 0;
      operationStats[opId].estimatedTime += parseFloat(a.effectiveTime) || 0;
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
      .where('isActive', true);
    
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
      .where('launchedAt', '>=', new Date(todayStart))
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
      plansQuery = plansQuery.where('launchedAt', '>=', startDate);
    }
    if (endDate) {
      plansQuery = plansQuery.where('launchedAt', '<=', endDate);
    }
    
    const plans = await plansQuery.select('id', 'workOrderCode', 'status', 'launchedAt');
    
    // Get assignments for these plans
    const planIds = plans.map(p => p.id);
    
    if (planIds.length === 0) {
      return res.json({ workOrders: [], conflicts: [] });
    }
    
    const assignments = await db('mes.worker_assignments as wa')
      .join('mes.workers as w', 'w.id', 'wa.workerId')
      .join('mes.substations as s', 's.id', 'wa.substationId')
      .join('mes.production_plan_nodes as n', 'n.id', 'wa.nodeId')
      .whereIn('wa.planId', planIds)
      .select(
        'wa.planId',
        'wa.nodeId',
        'n.name as nodeName',
        'w.id as workerId',
        'w.name as workerName',
        's.id as substationId',
        's.name as substationName',
        'wa.status',
        'wa.estimatedStartTime',
        'wa.estimatedEndTime',
        'wa.actualStartTime',
        'wa.actualEndTime'
      );
    
    // Group assignments by plan
    const workOrders = plans.map(plan => ({
      workOrderCode: plan.workOrderCode,
      status: plan.status,
      launchedAt: plan.launchedAt,
      assignments: assignments
        .filter(a => a.planId === plan.id)
        .map(a => ({
          nodeId: a.nodeId,
          nodeName: a.node_name,
          workerId: a.workerId,
          workerName: a.workerName,
          substationId: a.substationId,
          substationName: a.substationName,
          status: a.status,
          start: a.actual_start_time || a.estimatedStartTime,
          end: a.actual_end_time || a.estimatedEndTime
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

// ============================================
// HOLIDAY MANAGEMENT ENDPOINTS (FAZ 3)
// ============================================

/**
 * GET /api/mes/holidays
 * Get all company holidays
 */
router.get('/holidays', withAuth, async (req, res) => {
  try {
    const holidays = await getHolidays(db);
    res.json({ holidays });
  } catch (error) {
    console.error('❌ Get holidays error:', error);
    res.status(500).json({ error: 'Failed to fetch holidays', details: error.message });
  }
});

/**
 * POST /api/mes/holidays
 * Add a new holiday
 * Body: { date, name, isWorkingDay, workHours }
 */
router.post('/holidays', withAuth, async (req, res) => {
  try {
    const { startDate, endDate, name } = req.body;
    
    if (!startDate || !endDate || !name) {
      return res.status(400).json({ error: 'startDate, endDate and name are required' });
    }
    
    // Get current holidays
    const currentHolidays = await getHolidays(db);
    
    // Generate new ID
    const newId = `holiday-${Date.now()}`;
    
    // Create new holiday
    const newHoliday = {
      id: newId,
      startDate,
      endDate,
      name,
      createdAt: new Date().toISOString()
    };
    
    // Add to array
    const updatedHolidays = [...currentHolidays, newHoliday];
    
    // Update in database (INSERT if not exists)
    const existing = await db('mes.settings').where('key', 'company-holidays').first();
    if (existing) {
      await db('mes.settings')
        .where('key', 'company-holidays')
        .update({
          value: JSON.stringify({ holidays: updatedHolidays })
        });
    } else {
      await db('mes.settings').insert({
        key: 'company-holidays',
        value: JSON.stringify({ holidays: updatedHolidays })
      });
    }
    
    res.json({ holiday: newHoliday });
  } catch (error) {
    console.error('❌ Add holiday error:', error);
    res.status(500).json({ error: 'Failed to add holiday', details: error.message });
  }
});

/**
 * PUT /api/mes/holidays/:id
 * Update an existing holiday
 * Body: { date, name, isWorkingDay, workHours }
 */
router.put('/holidays/:id', withAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, name } = req.body;
    
    // Get current holidays
    const currentHolidays = await getHolidays(db);
    
    // Find and update holiday
    const holidayIndex = currentHolidays.findIndex(h => h.id === id);
    if (holidayIndex === -1) {
      return res.status(404).json({ error: 'Holiday not found' });
    }
    
    // Update holiday
    currentHolidays[holidayIndex] = {
      ...currentHolidays[holidayIndex],
      startDate: startDate || currentHolidays[holidayIndex].startDate,
      endDate: endDate || currentHolidays[holidayIndex].endDate,
      name: name || currentHolidays[holidayIndex].name,
      updatedAt: new Date().toISOString()
    };
    
    // Update in database
    await db('mes.settings')
      .where('key', 'company-holidays')
      .update({
        value: JSON.stringify({ holidays: currentHolidays })
      });
    
    res.json({ holiday: currentHolidays[holidayIndex] });
  } catch (error) {
    console.error('❌ Update holiday error:', error);
    res.status(500).json({ error: 'Failed to update holiday', details: error.message });
  }
});

/**
 * DELETE /api/mes/holidays/:id
 * Delete a holiday
 */
router.delete('/holidays/:id', withAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get current holidays
    const currentHolidays = await getHolidays(db);
    
    // Filter out the holiday
    const updatedHolidays = currentHolidays.filter(h => h.id !== id);
    
    if (updatedHolidays.length === currentHolidays.length) {
      return res.status(404).json({ error: 'Holiday not found' });
    }
    
    // Update in database
    await db('mes.settings')
      .where('key', 'company-holidays')
      .update({
        value: JSON.stringify({ holidays: updatedHolidays })
      });
    
    res.json({ success: true, deletedId: id });
  } catch (error) {
    console.error('❌ Delete holiday error:', error);
    res.status(500).json({ error: 'Failed to delete holiday', details: error.message });
  }
});

/**
 * GET /api/mes/timezone
 * Get company timezone setting
 */
router.get('/timezone', withAuth, async (req, res) => {
  try {
    const result = await db('mes.settings')
      .where('key', 'company-timezone')
      .first();
    
    if (!result || !result.value) {
      // Return default timezone
      return res.json({ timezone: 'Europe/Istanbul' });
    }
    
    const data = typeof result.value === 'string' 
      ? JSON.parse(result.value) 
      : result.value;
    
    res.json({ timezone: data.timezone || 'Europe/Istanbul' });
  } catch (error) {
    console.error('❌ Get timezone error:', error);
    res.status(500).json({ error: 'Failed to fetch timezone', details: error.message });
  }
});

/**
 * PUT /api/mes/timezone
 * Update company timezone setting
 * Body: { timezone }
 */
router.put('/timezone', withAuth, async (req, res) => {
  try {
    const { timezone } = req.body;
    
    if (!timezone) {
      return res.status(400).json({ error: 'timezone is required' });
    }
    
    // Validate timezone (basic check)
    const validTimezones = [
      'Europe/Istanbul', 'UTC', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
      'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Dubai'
    ];
    
    if (!validTimezones.includes(timezone)) {
      return res.status(400).json({ error: 'Invalid timezone' });
    }
    
    // Update or insert
    const existing = await db('mes.settings').where('id', 'company-timezone').first();
    
    if (existing) {
      await db('mes.settings')
        .where('id', 'company-timezone')
        .update({
          value: JSON.stringify({ timezone }),
          updatedAt: db.fn.now()
        });
    } else {
      await db('mes.settings').insert({
        id: 'company-timezone',
        key: 'company-timezone',
        value: JSON.stringify({ timezone }),
        description: 'Company timezone setting for scheduling and time calculations'
      });
    }
    
    res.json({ timezone });
  } catch (error) {
    console.error('❌ Update timezone error:', error);
    res.status(500).json({ error: 'Failed to update timezone', details: error.message });
  }
});

export default router;

