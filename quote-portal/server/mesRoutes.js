import express from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import admin from 'firebase-admin';
import { getSession } from './auth.js'
import jsondb from '../src/lib/jsondb.js'
import { adjustMaterialStock, consumeMaterials } from './materialsRoutes.js'

const router = express.Router();

console.log('✅ MES Routes module loaded - including semi-code endpoints');

// Middleware to authenticate requests (reuse existing auth)
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

// Helper function to handle Firestore operations
async function handleFirestoreOperation(operation, res) {
  try {
    const result = await operation();
    res.json(result);
  } catch (error) {
    console.error('Firestore operation error:', error);
    
    // Use error properties if available (status, code)
    const status = error.status || 500;
    const errorCode = error.code || 'internal_server_error';
    
    res.status(status).json({ 
      error: errorCode,
      message: error.message 
    });
  }
}

// ============================================================================
// MATERIAL RESERVATION HELPERS
// ============================================================================

/**
 * Calculate pre-production reserved amounts for a work package
 * Takes into account the expected defect rate from the operation
 * 
 * Formula: rehinMiktari = gerekliInputMiktari / (1 - (expectedDefectRate / 100))
 * Example: For 200 units needed with 2% defect rate: 200 / (1 - 0.02) = 204.08 ≈ 204
 * 
 * @param {Object} node - Execution graph node with materialInputs
 * @param {number} expectedDefectRate - Expected defect rate from operation (percentage)
 * @param {number} planQuantity - Production plan quantity multiplier
 * @returns {Object} Object with materialCode as key and reserved quantity as value
 */
function calculatePreProductionReservedAmount(node, expectedDefectRate = 0, planQuantity = 1) {
  const preProductionReservedAmount = {};
  
  if (!node || !node.materialInputs || !Array.isArray(node.materialInputs)) {
    return preProductionReservedAmount;
  }
  
  // Ensure defect rate is a valid number between 0 and 100
  const defectRate = Math.max(0, Math.min(100, parseFloat(expectedDefectRate) || 0));
  const defectMultiplier = defectRate >= 100 ? 1 : (1 - (defectRate / 100));
  
  node.materialInputs.forEach(material => {
    const materialCode = material.code;
    const requiredQty = (material.qty || material.required || 0) * planQuantity;
    
    if (!materialCode || requiredQty <= 0) return;
    
    // Calculate reserved amount with defect rate adjustment
    const reservedQty = defectRate > 0 
      ? Math.ceil(requiredQty / defectMultiplier) 
      : requiredQty;
    
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
async function getPlanExecutionState(planId) {
  const db = getFirestore();
  
  // Fetch plan document
  const planDoc = await db.collection('mes-production-plans').doc(planId).get();
  if (!planDoc.exists) {
    throw new Error(`Plan not found: ${planId}`);
  }
  
  const planData = planDoc.data();
  const executionGraph = planData.executionGraph || [];
  const materialSummary = planData.materialSummary || {};
  
  // Fetch all assignments for this plan
  const assignmentsSnapshot = await db.collection('mes-worker-assignments')
    .where('planId', '==', planId)
    .get();
  
  const assignments = new Map();
  assignmentsSnapshot.docs.forEach(doc => {
    const data = doc.data();
    if (data.nodeId) {
      assignments.set(data.nodeId, { id: doc.id, ...data });
    }
  });
  
  // Fetch workers and stations for availability check
  const [workersSnapshot, stationsSnapshot] = await Promise.all([
    db.collection('mes-workers').get(),
    db.collection('mes-stations').get()
  ]);
  
  const workers = new Map();
  workersSnapshot.docs.forEach(doc => {
    workers.set(doc.id, { id: doc.id, ...doc.data() });
  });
  
  const stations = new Map();
  stationsSnapshot.docs.forEach(doc => {
    stations.set(doc.id, { id: doc.id, ...doc.data() });
  });
  
  // Build completion status map for predecessor checks
  const completedNodes = new Set();
  assignments.forEach((assignment, nodeId) => {
    if (assignment.status === 'completed') {
      completedNodes.add(nodeId);
    }
  });
  
  // Process each node in execution graph
  const tasks = executionGraph.map(node => {
    const assignment = assignments.get(node.nodeId);
    const workerId = node.assignedWorkerId || assignment?.workerId;
    const stationId = node.assignedStationId || assignment?.stationId;
    
    // Check prerequisites
    const predecessorsDone = Array.isArray(node.predecessors)
      ? node.predecessors.every(predId => completedNodes.has(predId))
      : true;
    
    const worker = workerId ? workers.get(workerId) : null;
    const workerAvailable = !workerId || !worker 
      ? true // No worker assigned yet, or worker doesn't exist
      : !worker.currentTask || worker.currentTask.planId === planId && worker.currentTask.nodeId === node.nodeId;
    
    const station = stationId ? stations.get(stationId) : null;
    const stationAvailable = !stationId || !station
      ? true // No station assigned yet, or station doesn't exist
      : !station.currentOperation || station.currentOperation === node.nodeId;
    
    // Global material check (per plan, not per node yet)
    const materialsReady = !materialSummary.hasShortages;
    
    // Determine task status
    let status = 'pending';
    
    if (assignment) {
      // Status from assignment takes precedence
      if (assignment.status === 'completed') {
        status = 'completed';
      } else if (assignment.status === 'in_progress') {
        status = 'in_progress';
      } else if (assignment.status === 'paused') {
        status = 'paused';
      } else if (assignment.status === 'pending') {
        // Check if ready or blocked
        if (predecessorsDone && workerAvailable && stationAvailable && materialsReady) {
          status = 'ready';
        } else {
          status = 'blocked';
        }
      }
    } else {
      // No assignment yet - check if can be started
      if (predecessorsDone && workerAvailable && stationAvailable && materialsReady) {
        status = 'ready';
      } else {
        status = 'blocked';
      }
    }
    
    return {
      planId,
      nodeId: node.nodeId,
      name: node.name,
      operationId: node.operationId,
      operationName: node.operationName,
      
      // Resource assignments
      workerId,
      workerName: node.workerName,
      stationId,
      stationName: node.stationName,
      
      // Status and prerequisites
      status,
      prerequisites: {
        predecessorsDone,
        workerAvailable,
        stationAvailable,
        materialsReady
      },
      
      // Pause metadata (to differentiate plan pause vs worker pause)
      pauseContext: assignment?.pauseContext || null,
      pauseReason: assignment?.pauseReason || null,
      pausedBy: assignment?.pausedBy || null,
      pausedByName: assignment?.pausedByName || null,
      pausedAt: assignment?.pausedAt || null,
      
      // Timing
      priorityIndex: node.priorityIndex,
      estimatedNominalTime: node.estimatedNominalTime,
      estimatedEffectiveTime: node.estimatedEffectiveTime,
      
      // Assignment details (if exists)
      assignmentId: assignment?.id || null,
      assignedAt: assignment?.createdAt || null,
      actualStart: assignment?.actualStart || null,
      actualFinish: assignment?.actualFinish || null,
      
      // Predecessor info for UI
      predecessors: node.predecessors || [],
      
      // Material output info
      hasOutputs: node.hasOutputs,
      outputCode: node.outputCode,
      outputQty: node.outputQty
    };
  });
  
  // Sort by priority index
  tasks.sort((a, b) => a.priorityIndex - b.priorityIndex);
  
  return tasks;
}

// ============================================================================
// OPERATIONS ROUTES
// ============================================================================

// GET /api/mes/operations - Get all operations
router.get('/operations', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    const snapshot = await db.collection('mes-operations').orderBy('name').get();
    const operations = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    return { operations };
  }, res);
});

// POST /api/mes/operations - Create/Update multiple operations (batch)
router.post('/operations', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { operations } = req.body;
    if (!Array.isArray(operations)) {
      throw new Error('Operations must be an array');
    }
    // Basic validation
    const invalid = operations.find(op => !op || !op.id || !Array.isArray(op.skills))
    if (invalid) {
      throw new Error('Each operation must have id and skills array')
    }

    const db = getFirestore();
    const batch = db.batch();

    // Get existing operations to find deletions
    const existingSnapshot = await db.collection('mes-operations').get();
    const existingIds = new Set(existingSnapshot.docs.map(doc => doc.id));
    const newIds = new Set(operations.map(op => op.id));

    // Add/Update operations
    operations.forEach(operation => {
      const docRef = db.collection('mes-operations').doc(operation.id);
      batch.set(docRef, {
        ...operation,
        updatedAt: new Date()
      }, { merge: true });
    });

    // Delete removed operations
    existingIds.forEach(id => {
      if (!newIds.has(id)) {
        const docRef = db.collection('mes-operations').doc(id);
        batch.delete(docRef);
      }
    });

    await batch.commit();
    return { success: true, updated: operations.length };
  }, res);
});

// ============================================================================
// WORKERS ROUTES
// ============================================================================

// GET /api/mes/workers - Get all workers
router.get('/workers', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    const snapshot = await db.collection('mes-workers').orderBy('name').get();
    const nowIso = new Date().toISOString();
    const normalize = (doc) => {
      const data = doc.data();
      const w = { id: doc.id, ...data };
      // default status
      w.status = (w.status || w.availability || 'available').toString();
      if (/active/i.test(w.status)) w.status = 'available';
      if (/enabled|on/i.test(w.status)) w.status = 'available';
      if (/off|inactive|removed/i.test(w.status)) w.status = 'inactive';
      if (/break|paused|rest/i.test(w.status)) w.status = 'break';
      if (/busy|working/i.test(w.status)) w.status = 'busy';
      // compute leave flag
      const leaveStart = w.leaveStart || (w.leave && w.leave.start) || null;
      const leaveEnd = w.leaveEnd || (w.leave && w.leave.end) || null;
      w.onLeave = false;
      if (leaveStart && leaveEnd) {
        try {
          const s = new Date(leaveStart).toISOString();
          const e = new Date(leaveEnd).toISOString();
          w.onLeave = s <= nowIso && nowIso <= e;
        } catch (err) {
          w.onLeave = false;
        }
      }
      return w;
    };

    const workers = snapshot.docs.map(normalize);
    return { workers };
  }, res);
});

// POST /api/mes/workers - Create/Update multiple workers (batch)
router.post('/workers', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { workers } = req.body;
    if (!Array.isArray(workers)) {
      throw new Error('Workers must be an array');
    }
    // Basic validation: each worker must have at least one skill
    const invalid = workers.find(w => !w || !Array.isArray(w.skills) || w.skills.length === 0)
    if (invalid) {
      throw new Error('Each worker must have at least one skill');
    }

    const db = getFirestore();
    const batch = db.batch();

    // Load master time settings once to compute company schedules when needed
    const mdDoc = await db.collection('mes-settings').doc('master-data').get();
    const master = mdDoc.exists ? (mdDoc.data() || {}) : {};
    const timeSettings = master.timeSettings || { workType: 'fixed', laneCount: 1, fixedBlocks: {}, shiftBlocks: {} };

    // Helper to compute blocks for a day from master time settings
    function getShiftBlocksForDay(ts, day, shiftNo) {
      // 0) Standard shifts array model: shifts: [{ id: '1', blocks: { monday: [...] } }]
      if (Array.isArray(ts?.shifts)) {
        const shift = ts.shifts.find(s => s.id === String(shiftNo || '1'));
        if (shift && shift.blocks && Array.isArray(shift.blocks[day])) {
          return shift.blocks[day];
        }
      }
      
      // Aggregated model with laneIndex under `shift-${day}`
      const agg = ts?.shiftBlocks?.[`shift-${day}`];
      if (Array.isArray(agg)) {
        if (!shiftNo) return agg;
        const idx = (parseInt(shiftNo, 10) || 1) - 1;
        return agg.filter(b => (b && typeof b.laneIndex === 'number') ? b.laneIndex === idx : false);
      }
      // Split‑by‑lane model: shiftByLane: { '1': { day: [...] }, '2': { day: [...] } }
      const byLane = ts?.shiftByLane;
      if (byLane && typeof byLane === 'object') {
        if (shiftNo) {
          return Array.isArray(byLane[String(parseInt(shiftNo, 10) || 1)]?.[day])
            ? byLane[String(parseInt(shiftNo, 10) || 1)][day]
            : [];
        }
        let combined = [];
        Object.keys(byLane).forEach(k => { if (Array.isArray(byLane[k]?.[day])) combined = combined.concat(byLane[k][day]) });
        return combined;
      }
      // Named keys like `${day}-1`, `${day}_1`, `shift-1-${day}`, `shift-${day}-1`
      const keys = Object.keys(ts || {});
      if (keys.length) {
        const collect = (n) => {
          const patterns = [
            new RegExp(`^${day}[-_]${n}$`, 'i'),
            new RegExp(`^shift[-_]${day}[-_]${n}$`, 'i'),
            new RegExp(`^shift[-_]${n}[-_]${day}$`, 'i')
          ];
          const matchKey = keys.find(k => patterns.some(p => p.test(k)));
          const arr = matchKey && Array.isArray(ts[matchKey]) ? ts[matchKey] : [];
          return arr;
        };
        if (shiftNo) return collect(parseInt(shiftNo, 10) || 1);
        let combined = [];
        for (let n = 1; n <= 7; n++) { const arr = collect(n); if (arr.length) combined = combined.concat(arr) }
        return combined;
      }
      return [];
    }

    function normalizeSkills(skills) {
      if (Array.isArray(skills)) return skills;
      if (typeof skills === 'string') return skills.split(',').map(s=>s.trim()).filter(Boolean);
      return [];
    }

    function sanitizeWorkerPayload(worker) {
      const id = worker.id || `w-${Math.random().toString(36).slice(2,9)}`;
      const skills = normalizeSkills(worker.skills);
      const status = (worker.status || 'available').toLowerCase();

      // Normalize schedule: only allow one model via personalSchedule with mode
      const ps = (worker.personalSchedule && typeof worker.personalSchedule === 'object') ? worker.personalSchedule : null;
      let personalSchedule = null;
      if (ps) {
        const mode = (ps.mode === 'personal' || ps.mode === 'company') ? ps.mode : 'company';
        if (mode === 'company') {
          const shiftNo = ps.shiftNo || (timeSettings?.workType === 'shift' ? '1' : undefined);
          // Company mode: only save mode and shiftNo, blocks come from master-data
          personalSchedule = {
            mode: 'company',
            ...(shiftNo ? { shiftNo } : {})
          };
        } else {
          // personal mode: accept provided blocks, default missing days to []
          const blocks = ps.blocks && typeof ps.blocks === 'object' ? ps.blocks : {};
          const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
          const normalized = {};
          days.forEach(d => { normalized[d] = Array.isArray(blocks[d]) ? blocks[d] : [] });
          personalSchedule = { mode: 'personal', blocks: normalized };
        }
      } else {
        // No schedule provided: default to company mode (no blocks stored)
        const shiftNo = (timeSettings?.workType === 'shift') ? '1' : undefined;
        personalSchedule = {
          mode: 'company',
          ...(shiftNo ? { shiftNo } : {})
        };
      }

      const payload = {
        id,
        name: (worker.name || '').trim(),
        email: (worker.email || '').trim(),
        phone: (worker.phone || '').trim(),
        skills,
        status,
        station: worker.station || '',
        currentTask: worker.currentTask || '',
        personalSchedule,
        updatedAt: new Date()
      };
      return payload;
    }

    // Get existing workers to find deletions
    const existingSnapshot = await db.collection('mes-workers').get();
    const existingIds = new Set(existingSnapshot.docs.map(doc => doc.id));
    const newIds = new Set(workers.map(w => w.id));

    // Add/Update workers
    workers.forEach(worker => {
      const payload = sanitizeWorkerPayload(worker);
      const docRef = db.collection('mes-workers').doc(payload.id);
      // Delete legacy/duplicate schedule fields to enforce single weekly schedule source
      const deletes = {
        schedule: admin.firestore.FieldValue.delete(),
        companySchedule: admin.firestore.FieldValue.delete(),
        personalScheduleOld: admin.firestore.FieldValue.delete(),
        companyTimeSettings: admin.firestore.FieldValue.delete(),
        timeSource: admin.firestore.FieldValue.delete()
      };
      batch.set(docRef, { ...deletes, ...payload }, { merge: true });
    });

    // Delete removed workers
    existingIds.forEach(id => {
      if (!newIds.has(id)) {
        const docRef = db.collection('mes-workers').doc(id);
        batch.delete(docRef);
      }
    });

    await batch.commit();
    return { success: true, updated: workers.length };
  }, res);
});

// GET /api/mes/workers/:id/stations - Get stations where this worker can work
router.get('/workers/:id/stations', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params;
    const db = getFirestore();
    
    // Get the worker data
    const workerDoc = await db.collection('mes-workers').doc(id).get();
    if (!workerDoc.exists) {
      throw new Error('Worker not found');
    }
    
    const worker = { id: workerDoc.id, ...workerDoc.data() };
    const workerSkills = Array.isArray(worker.skills) ? worker.skills : [];
    
    // Get all stations
    const stationsSnapshot = await db.collection('mes-stations').get();
    const stations = stationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Get operations to compute inherited skills for stations
    const operationsSnapshot = await db.collection('mes-operations').get();
    const operations = operationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Filter stations where worker can work (has all required skills)
    const compatibleStations = stations.filter(station => {
      // Compute station's effective skills (from operations + station-specific skills)
      const inheritedSkills = [];
      if (Array.isArray(station.operationIds)) {
        station.operationIds.forEach(opId => {
          const operation = operations.find(op => op.id === opId);
          if (operation && Array.isArray(operation.subSkills)) {
            inheritedSkills.push(...operation.subSkills);
          }
        });
      }
      
      const stationSpecificSkills = Array.isArray(station.subSkills) ? station.subSkills : [];
      const stationEffectiveSkills = Array.from(new Set([...inheritedSkills, ...stationSpecificSkills]));
      
      // Check if worker has all required skills for this station
      return stationEffectiveSkills.every(requiredSkill => 
        workerSkills.includes(requiredSkill)
      );
    });
    
    return { 
      workerId: id,
      workerName: worker.name,
      workerSkills: workerSkills,
      compatibleStations: compatibleStations.map(station => {
        // Also include the required skills for each station for display
        const inheritedSkills = [];
        if (Array.isArray(station.operationIds)) {
          station.operationIds.forEach(opId => {
            const operation = operations.find(op => op.id === opId);
            if (operation && Array.isArray(operation.subSkills)) {
              inheritedSkills.push(...operation.subSkills);
            }
          });
        }
        const stationSpecificSkills = Array.isArray(station.subSkills) ? station.subSkills : [];
        const stationEffectiveSkills = Array.from(new Set([...inheritedSkills, ...stationSpecificSkills]));
        
        return {
          ...station,
          requiredSkills: stationEffectiveSkills
        };
      })
    };
  }, res);
});

// ============================================================================
// STATIONS ROUTES
// ============================================================================

// GET /api/mes/stations - Get all stations
router.get('/stations', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    const snapshot = await db.collection('mes-stations').orderBy('name').get();
    const stations = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    return { stations };
  }, res);
});

// POST /api/mes/stations - Create/Update multiple stations (batch)
router.post('/stations', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { stations } = req.body;
    if (!Array.isArray(stations)) {
      throw new Error('Stations must be an array');
    }
    // Basic validation: each station must be linked to at least one operation
    const invalid = stations.find(s => !s || !Array.isArray(s.operationIds) || s.operationIds.length === 0)
    if (invalid) {
      throw new Error('Each station must reference at least one operation (operationIds)');
    }

    const db = getFirestore();
    const batch = db.batch();

    // Get existing stations to find deletions
    const existingSnapshot = await db.collection('mes-stations').get();
    const existingIds = new Set(existingSnapshot.docs.map(doc => doc.id));
    const newIds = new Set(stations.map(s => s.id));

    // Add/Update stations
    stations.forEach(station => {
      const docRef = db.collection('mes-stations').doc(station.id);
      batch.set(docRef, {
        ...station,
        updatedAt: new Date()
      }, { merge: true });
    });

    // Delete removed stations
    existingIds.forEach(id => {
      if (!newIds.has(id)) {
        const docRef = db.collection('mes-stations').doc(id);
        batch.delete(docRef);
      }
    });

    await batch.commit();
    return { success: true, updated: stations.length };
  }, res);
});

// GET /api/mes/stations/:id/workers - Get workers that can work at this station
router.get('/stations/:id/workers', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params;
    const db = getFirestore();
    
    // Get the station data
    const stationDoc = await db.collection('mes-stations').doc(id).get();
    if (!stationDoc.exists) {
      throw new Error('Station not found');
    }
    
    const station = { id: stationDoc.id, ...stationDoc.data() };
    
    // Get operations to compute inherited skills
    const operationsSnapshot = await db.collection('mes-operations').get();
    const operations = operationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Compute station's effective skills (from operations + station-specific skills)
    const inheritedSkills = [];
    if (Array.isArray(station.operationIds)) {
      station.operationIds.forEach(opId => {
        const operation = operations.find(op => op.id === opId);
        if (operation && Array.isArray(operation.subSkills)) {
          inheritedSkills.push(...operation.subSkills);
        }
      });
    }
    
    const stationSpecificSkills = Array.isArray(station.subSkills) ? station.subSkills : [];
    const stationEffectiveSkills = Array.from(new Set([...inheritedSkills, ...stationSpecificSkills]));
    
    // Get all workers
    const workersSnapshot = await db.collection('mes-workers').orderBy('name').get();
    const allWorkers = workersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Filter workers that have ALL the skills required by the station
    const compatibleWorkers = allWorkers.filter(worker => {
      const workerSkills = Array.isArray(worker.skills) ? worker.skills : [];
      
      // Check if worker has all required skills
      return stationEffectiveSkills.every(requiredSkill => 
        workerSkills.includes(requiredSkill)
      );
    });
    
    return { 
      stationId: id,
      stationName: station.name,
      requiredSkills: stationEffectiveSkills,
      compatibleWorkers
    };
  }, res);
});

// DELETE /api/mes/stations/:id - Delete a single station (does not require full payload)
router.delete('/stations/:id', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params
    const db = getFirestore()
    await db.collection('mes-stations').doc(id).delete()
    return { success: true, id }
  }, res)
});

// ============================================================================
// WORK ORDERS ROUTES
// ============================================================================

// GET /api/mes/work-orders - Get all work orders
router.get('/work-orders', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    const snapshot = await db.collection('mes-work-orders')
      .orderBy('createdAt', 'desc')
      .get();
    const workOrders = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    return { workOrders };
  }, res);
});

// POST /api/mes/work-orders - Create work order
router.post('/work-orders', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const workOrder = req.body;
    if (!workOrder.id) {
      throw new Error('Work order ID is required');
    }

    const db = getFirestore();
    await db.collection('mes-work-orders').doc(workOrder.id).set({
      ...workOrder,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return { success: true, id: workOrder.id };
  }, res);
});

// PUT /api/mes/work-orders/:id - Update work order
router.put('/work-orders/:id', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params;
    const updates = req.body;

    const db = getFirestore();
    await db.collection('mes-work-orders').doc(id).update({
      ...updates,
      updatedAt: new Date()
    });

    return { success: true, id };
  }, res);
});

// DELETE /api/mes/work-orders/:id - Delete work order
router.delete('/work-orders/:id', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params;
    const db = getFirestore();
    await db.collection('mes-work-orders').doc(id).delete();
    return { success: true, id };
  }, res);
});

// ============================================================================
// APPROVED QUOTES ROUTES (Read-only listing for Production Planning)
// ============================================================================

// GET /api/mes/approved-quotes - List approved quotes copied from Quotes as Work Orders
router.get('/approved-quotes', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    const snapshot = await db.collection('mes-approved-quotes')
      .orderBy('createdAt', 'desc')
      .get();
    const approvedQuotes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return { approvedQuotes };
  }, res);
});

// POST /api/mes/approved-quotes/ensure - Ensure an approved quote is copied as WO
router.post('/approved-quotes/ensure', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { quoteId } = req.body || {}
    if (!quoteId) {
      return { success: false, error: 'quoteId_required' }
    }

    const db = getFirestore();
    const col = db.collection('mes-approved-quotes')

    // Already exists?
    const existsSnap = await col.where('quoteId', '==', quoteId).limit(1).get()
    if (!existsSnap.empty) {
      return { success: true, ensured: true, workOrderCode: existsSnap.docs[0].id }
    }

    // Load quote from jsondb
    const quote = jsondb.getQuote(quoteId)
    if (!quote) {
      const e = new Error('quote_not_found'); e.status = 404; throw e
    }
    const st = String(quote.status || '').toLowerCase()
    if (!(st === 'approved' || st === 'onaylandı' || st === 'onaylandi')) {
      return { success: false, error: 'quote_not_approved', status: quote.status || null }
    }

    // Delivery date required to ensure approved quote is usable in MES
    if (!quote.deliveryDate || String(quote.deliveryDate).trim() === '') {
      return { success: false, error: 'delivery_date_required' }
    }

    // Generate next WO code
    const snap = await col.get()
    let maxIdx = 0
    snap.forEach(doc => {
      const data = doc.data() || {}
      const code = data.workOrderCode || doc.id || ''
      const m = /^WO-(\d+)$/.exec(String(code))
      if (m) {
        const n = parseInt(m[1], 10)
        if (Number.isFinite(n)) maxIdx = Math.max(maxIdx, n)
      }
    })
    const nextIdx = maxIdx + 1
    const code = `WO-${String(nextIdx).padStart(3, '0')}`

    const approvedDoc = {
      workOrderCode: code,
      quoteId,
      status: 'approved',
      customer: quote.name || quote.customer || null,
      company: quote.company || null,
      email: quote.email || null,
      phone: quote.phone || null,
      deliveryDate: quote.deliveryDate || null,
      price: quote.price ?? quote.calculatedPrice ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      quoteSnapshot: quote
    }

    await col.doc(code).set(approvedDoc, { merge: true })
    return { success: true, ensured: true, workOrderCode: code }
  }, res)
})

// ============================================================================
// MASTER DATA ROUTES
// ============================================================================

// GET /api/mes/master-data - Get available skills and operation types
router.get('/master-data', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    const doc = await db.collection('mes-settings').doc('master-data').get();
    
    if (!doc.exists) {
      // Return defaults if no master data exists
      return {
        availableSkills: ['Kaynak', 'Tornalama', 'Freze', 'Montaj'],
        availableOperationTypes: ['İmalat', 'Kontrol', 'Montaj', 'Paketleme'],
        stationEfficiency: 1.0,  // Default station efficiency multiplier
        workerEfficiency: 1.0,   // Default worker efficiency multiplier
        // default empty time settings for company schedule
        timeSettings: {
          workType: 'fixed',
          laneCount: 1,
          fixedBlocks: {},
          shiftBlocks: {}
        }
      };
    }

    const data = doc.data() || {}
    // Backward compatibility: map legacy fields if present
    if (!data.availableSkills && Array.isArray(data.skills)) {
      data.availableSkills = data.skills
    }
    if (!data.availableOperationTypes && Array.isArray(data.operationTypes)) {
      data.availableOperationTypes = data.operationTypes
    }
    // Ensure efficiency defaults
    data.stationEfficiency = data.stationEfficiency ?? 1.0;
    data.workerEfficiency = data.workerEfficiency ?? 1.0;
    // Ensure timeSettings exists with safe defaults
    data.timeSettings = data.timeSettings || { workType: 'fixed', laneCount: 1, fixedBlocks: {}, shiftBlocks: {} }
    return data;
  }, res);
});

// POST /api/mes/master-data - Update master data
router.post('/master-data', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { availableSkills, availableOperationTypes, timeSettings, stationEfficiency, workerEfficiency } = req.body || {};
    
    console.log('POST /api/mes/master-data - Received:', { 
      availableSkills, 
      availableOperationTypes, 
      timeSettings,
      stationEfficiency,
      workerEfficiency
    });
    
    const db = getFirestore();
    const payload = {
      ...(availableSkills ? { availableSkills } : {}),
      ...(availableOperationTypes ? { availableOperationTypes } : {}),
      ...(timeSettings ? { timeSettings } : {}),
      ...(stationEfficiency !== undefined ? { stationEfficiency: parseFloat(stationEfficiency) || 1.0 } : {}),
      ...(workerEfficiency !== undefined ? { workerEfficiency: parseFloat(workerEfficiency) || 1.0 } : {}),
      updatedAt: new Date()
    }
    
    console.log('Firebase payload to save:', payload);
    await db.collection('mes-settings').doc('master-data').set(payload, { merge: true });

    return { success: true };
  }, res);
});

// ============================================================================
// PRODUCTION PLANS ROUTES  
// ============================================================================

// POST /api/mes/production-plans/next-id - Generate next sequential plan id (prod-plan-YYYY-xxxxx)
router.post('/production-plans/next-id', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    const now = new Date();
    const year = (req.body && req.body.year) || now.getFullYear();
    const pad = (n) => String(n).padStart(5, '0');
    const counterRef = db.collection('mes-counters').doc(`prod-plan-${year}`);

    const id = await db.runTransaction(async (tx) => {
      const snap = await tx.get(counterRef);
      let next = 1;
      if (snap.exists) {
        const data = snap.data() || {};
        next = Number.isFinite(data.next) ? data.next : 1;
      }
      const newId = `prod-plan-${year}-${pad(next)}`;
      tx.set(counterRef, { next: next + 1, updatedAt: new Date() }, { merge: true });
      return newId;
    });

    return { id };
  }, res);
});

// GET /api/mes/production-plans - Get production plans (exclude templates)
router.get('/production-plans', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    // Fetch all then filter out templates to avoid relying on composite indexes
    const snapshot = await db.collection('mes-production-plans').orderBy('createdAt', 'desc').get();
    const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const productionPlans = all.filter(p => (p.status || p.type || '').toString().toLowerCase() !== 'template');
    return { productionPlans };
  }, res);
});

// POST /api/mes/production-plans - Create production plan
router.post('/production-plans', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const productionPlan = req.body;
    const { assignments } = productionPlan; // Extract assignments from plan data
    
    if (!productionPlan.id) {
      throw new Error('Production plan ID is required');
    }

    const db = getFirestore();
    const now = new Date();
    const parts = formatDateParts(now);
    const actorEmail = (req.user && req.user.email) || null;
    const actorName = (req.user && (req.user.name || req.user.userName)) || null;
    const createdBy = actorEmail || actorName || null;

    // Remove assignments from plan data to avoid storing in plan document
    const planData = { ...productionPlan };
    delete planData.assignments;
    
    // Handle 'released' status - add release metadata
    if (productionPlan.status === 'released') {
      planData.releasedAt = now;
      planData.releasedBy = actorEmail || createdBy;
      planData.releasedByName = actorName || createdBy || null;
    }

    // Check if status is 'production' and autoAssign is true
    const shouldAutoAssign = productionPlan.status === 'production' && productionPlan.autoAssign === true && assignments && Array.isArray(assignments);

    if (shouldAutoAssign) {
      // Use transaction for consistency
      const result = await db.runTransaction(async (transaction) => {
        // Create the plan
        const planRef = db.collection('mes-production-plans').doc(productionPlan.id);
        transaction.set(planRef, {
          ...planData,
          createdAt: now,
          updatedAt: now,
          createdDate: productionPlan.createdDate || parts.date,
          createdTime: productionPlan.createdTime || parts.time,
          updatedDate: parts.date,
          updatedTime: parts.time,
          createdBy: actorEmail || createdBy,
          createdByName: actorName || createdBy || null,
          updatedBy: actorEmail || createdBy,
          updatedByName: actorName || createdBy || null
        }, { merge: true });

        // Create assignments
        assignments.forEach(assignment => {
          const assignmentId = `${productionPlan.id}-${assignment.nodeId || assignment.workerId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          const docRef = db.collection('mes-worker-assignments').doc(assignmentId);
          
          transaction.set(docRef, {
            id: assignmentId,
            planId: productionPlan.id,
            nodeId: assignment.nodeId || null,
            workerId: assignment.workerId || null,
            stationId: assignment.stationId || null,
            subStationCode: assignment.subStationCode || null,
            start: assignment.start ? new Date(assignment.start) : null,
            end: assignment.end ? new Date(assignment.end) : null,
            status: assignment.status || 'pending',
            createdAt: now,
            updatedAt: now,
            createdBy: actorEmail || 'system'
          });
        });

        return { success: true, id: productionPlan.id, assignmentsCreated: assignments.length };
      });

      return result;
    } else {
      // Normal creation without assignments
      await db.collection('mes-production-plans').doc(productionPlan.id).set({
        ...planData,
        createdAt: now,
        updatedAt: now,
        createdDate: productionPlan.createdDate || parts.date,
        createdTime: productionPlan.createdTime || parts.time,
        updatedDate: parts.date,
        updatedTime: parts.time,
        createdBy: actorEmail || createdBy,
        createdByName: actorName || createdBy || null,
        updatedBy: actorEmail || createdBy,
        updatedByName: actorName || createdBy || null
      }, { merge: true });
      
      // If status is 'released' and orderCode exists, update approved quote production state
      if (productionPlan.status === 'released' && productionPlan.orderCode) {
        // Async update - don't block response
        updateApprovedQuoteProductionState(
          productionPlan.orderCode, 
          'Üretiliyor',
          actorEmail || 'system'
        ).catch(err => {
          console.error('Failed to update approved quote state on plan release:', err);
        });
      }

      return { success: true, id: productionPlan.id };
    }
  }, res);
});

// PUT /api/mes/production-plans/:id - Update production plan
router.put('/production-plans/:id', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params;
    const updates = req.body;
    const { assignments } = updates; // Extract assignments from updates to avoid storing in plan doc

    const db = getFirestore();
    const updatedByEmail = (req.user && req.user.email) || null;
    const updatedByName = (req.user && (req.user.name || req.user.userName)) || null;
    const now = new Date();
    const parts = formatDateParts(now);

    // Remove assignments from updates to avoid storing in plan document
    const planUpdates = { ...updates };
    delete planUpdates.assignments;
    
    // Check if status is transitioning to 'released' - add release metadata
    if (updates.status === 'released') {
      // Get current plan to check if it wasn't already released
      const currentPlanRef = db.collection('mes-production-plans').doc(id);
      const currentPlanSnap = await currentPlanRef.get();
      const currentPlan = currentPlanSnap.exists ? currentPlanSnap.data() : null;
      
      // Only set releasedAt/releasedBy if not already set (first release)
      if (!currentPlan || !currentPlan.releasedAt) {
        planUpdates.releasedAt = now;
        planUpdates.releasedBy = updatedByEmail || 'system';
        planUpdates.releasedByName = updatedByName || null;
      }
    }

    // Check if status is changing to 'production' and autoAssign is true
    const shouldAutoAssign = updates.status === 'production' && updates.autoAssign === true && assignments && Array.isArray(assignments);

    if (shouldAutoAssign) {
      // Use transaction to ensure consistency between plan update and assignments
      const result = await db.runTransaction(async (transaction) => {
        // Update the plan
        const planRef = db.collection('mes-production-plans').doc(id);
        transaction.set(planRef, {
          ...planUpdates,
          updatedAt: now,
          updatedDate: parts.date,
          updatedTime: parts.time,
          ...(updatedByEmail ? { updatedBy: updatedByEmail } : {}),
          ...(updatedByName ? { updatedByName } : {})
        }, { merge: true });

        // Delete existing assignments for this plan
        const existingQuery = db.collection('mes-worker-assignments').where('planId', '==', id);
        const existingSnapshot = await transaction.get(existingQuery);
        
        existingSnapshot.docs.forEach(doc => {
          transaction.delete(doc.ref);
        });

        // Create new assignments
        assignments.forEach(assignment => {
          const assignmentId = `${id}-${assignment.nodeId || assignment.workerId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          const docRef = db.collection('mes-worker-assignments').doc(assignmentId);
          
          transaction.set(docRef, {
            id: assignmentId,
            planId: id,
            nodeId: assignment.nodeId || null,
            workerId: assignment.workerId || null,
            stationId: assignment.stationId || null,
            subStationCode: assignment.subStationCode || null,
            start: assignment.start ? new Date(assignment.start) : null,
            end: assignment.end ? new Date(assignment.end) : null,
            status: assignment.status || 'pending',
            createdAt: now,
            updatedAt: now,
            createdBy: updatedByEmail || 'system'
          });
        });

        return { success: true, id, assignmentsCreated: assignments.length };
      });

      return result;
    } else {
      // Normal update without assignments
      await db.collection('mes-production-plans').doc(id).set({
        ...planUpdates,
        updatedAt: now,
        updatedDate: parts.date,
        updatedTime: parts.time,
        ...(updatedByEmail ? { updatedBy: updatedByEmail } : {}),
        ...(updatedByName ? { updatedByName } : {})
      }, { merge: true });
      
      // If status is transitioning to 'released' and orderCode exists, update approved quote
      if (updates.status === 'released' && updates.orderCode) {
        // Async update - don't block response
        updateApprovedQuoteProductionState(
          updates.orderCode, 
          'Üretiliyor',
          updatedByEmail || 'system'
        ).catch(err => {
          console.error('Failed to update approved quote state on plan release:', err);
        });
      }
      
      // ========================================================================
      // AUTOMATIC MATERIAL CONSUMPTION & WIP PRODUCTION ON PLAN RELEASE
      // ========================================================================
      // When a production plan transitions to 'released' status, the system
      // automatically processes material movements based on the materialSummary
      // stored in the plan document.
      //
      // MATERIAL SUMMARY STRUCTURE:
      // - materialSummary.rawMaterials: All input materials (raw + derived WIP)
      //   Each item: { id, code, name, required, unit, isDerived }
      // - materialSummary.wipOutputs: All WIP materials produced by plan nodes
      //   Each item: { code, name, quantity, unit, nodeId, operationId }
      //
      // CONSUMPTION FLOW:
      // 1. Raw Materials: Consumed from stock (negative delta)
      //    - Base raw materials (steel, plastic, etc.)
      //    - Derived WIP materials (semi-finished products from previous operations)
      //    - WIP consumption is tracked in material.consumedBy array
      //
      // 2. WIP Production: Added to stock (positive delta)
      //    - Creates WIP material if doesn't exist
      //    - Sets metadata: type='wip', category='WIP', consumedBy=[]
      //    - Links to source plan/node/operation
      //
      // ERROR HANDLING:
      // - Continues on individual material errors (continueOnError: true)
      // - Insufficient stock errors are logged but don't fail the release
      // - Results stored in plan.stockMovements for audit trail
      // ========================================================================
      
      // If status is transitioning to 'released', process material consumption and WIP production
      if (updates.status === 'released') {
        try {
          // Get the full plan data to access materialSummary
          const planRef = db.collection('mes-production-plans').doc(id);
          const planSnap = await planRef.get();
          const planData = planSnap.exists ? planSnap.data() : null;
          
          if (planData && planData.materialSummary) {
            console.log(`🏭 Processing material movements for plan ${id}...`);
            
            const materialSummary = planData.materialSummary;
            const stockResults = { rawMaterials: null, wipOutputs: null };
            
            // 1. Consume raw materials (negative delta)
            // NOTE: This includes both base raw materials and derived WIP materials
            // consumed as inputs. WIP materials will be tracked in their consumedBy array.
            if (Array.isArray(materialSummary.rawMaterials) && materialSummary.rawMaterials.length > 0) {
              const consumptionList = materialSummary.rawMaterials.map(mat => ({
                code: mat.code || mat.id,
                qty: mat.required || 0,
                reason: `production_plan_${id}`,
                nodeId: null // Could be enhanced to track per-node consumption
              }));
              
              stockResults.rawMaterials = await consumeMaterials(consumptionList, {
                userId: updatedByEmail || 'system',
                orderId: planData.orderCode || id,
                planId: id, // Pass planId for WIP consumption tracking
                continueOnError: true // Continue even if some materials fail
              });
              
              console.log(
                `✓ Raw materials: ${stockResults.rawMaterials.consumed.length} consumed, ` +
                `${stockResults.rawMaterials.failed.length} failed`
              );
              
              // Log WIP consumption separately for visibility
              const wipConsumed = stockResults.rawMaterials.consumed.filter(m => m.isWIP);
              if (wipConsumed.length > 0) {
                console.log(`  └─ WIP materials consumed: ${wipConsumed.map(w => w.material).join(', ')}`);
              }
            }
            
            // 2. Produce WIP outputs (positive delta)
            if (Array.isArray(materialSummary.wipOutputs) && materialSummary.wipOutputs.length > 0) {
              const wipResults = { produced: [], failed: [] };
              
              for (const wip of materialSummary.wipOutputs) {
                const wipCode = wip.code || wip.id;
                const wipQty = parseFloat(wip.quantity || 0);
                
                if (!wipCode || wipQty <= 0) continue;
                
                try {
                  // Try to produce the WIP material
                  const result = await adjustMaterialStock(wipCode, wipQty, {
                    reason: `wip_production_plan_${id}`,
                    userId: updatedByEmail || 'system',
                    orderId: planData.orderCode || id
                  });
                  
                  wipResults.produced.push({
                    material: result.materialCode,
                    name: result.materialName,
                    qty: wipQty,
                    previousStock: result.previousStock,
                    newStock: result.newStock
                  });
                  
                } catch (error) {
                  // If WIP doesn't exist, create it
                  if (error.message.includes('not found')) {
                    try {
                      console.log(`📦 Creating new WIP material: ${wipCode}`);
                      
                      const newWipRef = db.collection('materials').doc(wipCode);
                      await newWipRef.set({
                        code: wipCode,
                        name: wip.name || wipCode,
                        type: 'wip', // Explicit WIP type
                        category: 'WIP',
                        stock: wipQty,
                        unit: wip.unit || 'pcs',
                        status: 'Aktif',
                        produced: true,
                        createdAt: now,
                        updatedAt: now,
                        createdBy: updatedByEmail || 'system',
                        source: 'production_plan',
                        sourcePlanId: id,
                        sourceNodeId: wip.nodeId || null,
                        sourceOperationId: wip.operationId || null,
                        consumedBy: [] // Initialize empty array for consumption tracking
                      });
                      
                      wipResults.produced.push({
                        material: wipCode,
                        name: wip.name || wipCode,
                        qty: wipQty,
                        previousStock: 0,
                        newStock: wipQty,
                        created: true
                      });
                      
                    } catch (createError) {
                      console.error(`Failed to create WIP ${wipCode}:`, createError.message);
                      wipResults.failed.push({
                        material: wipCode,
                        qty: wipQty,
                        error: createError.message
                      });
                    }
                  } else {
                    wipResults.failed.push({
                      material: wipCode,
                      qty: wipQty,
                      error: error.message
                    });
                  }
                }
              }
              
              stockResults.wipOutputs = wipResults;
              console.log(
                `✓ WIP outputs: ${wipResults.produced.length} produced, ` +
                `${wipResults.failed.length} failed`
              );
            }
            
            // Log summary
            if (stockResults.rawMaterials || stockResults.wipOutputs) {
              console.log(`✅ Material movements completed for plan ${id}`);
              
              // Optionally store the stock movement results in the plan document for audit
              await planRef.update({
                stockMovements: {
                  timestamp: now,
                  rawMaterials: stockResults.rawMaterials,
                  wipOutputs: stockResults.wipOutputs
                }
              });
            }
          }
        } catch (stockError) {
          // Log error but don't fail the plan release
          console.error(`⚠️ Material movements failed for plan ${id}:`, stockError.message);
          
          // Store the error in the plan document
          await db.collection('mes-production-plans').doc(id).update({
            stockMovementError: {
              timestamp: now,
              error: stockError.message
            }
          });
        }
      }

      return { success: true, id };
    }
  }, res);
});

// DELETE /api/mes/production-plans/:id - Delete production plan
router.delete('/production-plans/:id', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params;
    const db = getFirestore();
    const planRef = db.collection('mes-production-plans').doc(id);
    
    // Get plan data before deletion to check orderCode and status
    const planSnap = await planRef.get();
    const planData = planSnap.exists ? planSnap.data() : null;
    
    // Delete the plan
    await planRef.delete();
    
    // Optional: Rollback approved quote state if plan was released
    if (planData && planData.status === 'released' && planData.orderCode) {
      // Async rollback - don't block response
      updateApprovedQuoteProductionState(
        planData.orderCode,
        'Üretim Onayı Bekliyor',
        req.user?.email || 'system'
      ).catch(err => {
        console.error('Failed to rollback approved quote state on plan deletion:', err);
      });
    }
    
    return { success: true, id };
  }, res);
});

// GET /api/mes/production-plans/:id/tasks - Get task execution states with prerequisites
router.get('/production-plans/:id/tasks', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params;
    
    if (!id) {
      const e = new Error('plan_id_required');
      e.status = 400;
      throw e;
    }
    
    const tasks = await getPlanExecutionState(id);
    return { tasks };
  }, res);
});

// ============================================================================
// TEMPLATES ROUTES
// ============================================================================

// GET /api/mes/templates - Get templates from the same collection using status/type flag
router.get('/templates', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    // Prefer status == 'template' when available; otherwise filter client-side
    let templates = [];
    try {
      const snapshot = await db.collection('mes-production-plans')
        .where('status', '==', 'template')
        .orderBy('createdAt', 'desc')
        .get();
      templates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
      // Fallback without where (in case of missing index) and filter in memory
      const snapshot = await db.collection('mes-production-plans').orderBy('createdAt', 'desc').get();
      const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      templates = all.filter(t => (t.status || t.type || '').toString().toLowerCase() === 'template');
    }
    return { templates };
  }, res);
});

// POST /api/mes/templates - Create template in mes-production-plans with status = 'template'
router.post('/templates', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const template = req.body;
    if (!template.id) {
      throw new Error('Template ID is required');
    }

    const db = getFirestore();
    const now = new Date()
    const parts = formatDateParts(now)
    const actorEmail = (req.user && req.user.email) || null
    const actorName = (req.user && (req.user.name || req.user.userName)) || null
    // Normalize createdAt to Date
    const createdAtDate = template.createdAt ? new Date(template.createdAt) : now
    const createdParts = formatDateParts(createdAtDate)
    await db.collection('mes-production-plans').doc(template.id).set({
      ...template,
      status: (template.status || 'template'),
      createdAt: createdAtDate,
      updatedAt: now,
      createdDate: template.createdDate || createdParts.date,
      createdTime: template.createdTime || createdParts.time,
      updatedDate: parts.date,
      updatedTime: parts.time,
      // Track template edit info
      lastModifiedAt: now,
      lastModifiedDate: parts.date,
      lastModifiedTime: parts.time,
      ...(actorEmail ? { lastModifiedBy: actorEmail, updatedBy: actorEmail } : {}),
      ...(actorName ? { lastModifiedByName: actorName, updatedByName: actorName } : {}),
      // Also keep owner/createdBy for listing
      ...(!template.owner ? (actorEmail ? { owner: actorEmail } : {}) : {}),
      ...(!template.createdBy ? (actorEmail ? { createdBy: actorEmail } : {}) : {}),
      ...(!template.ownerName ? (actorName ? { ownerName: actorName } : {}) : {}),
      ...(!template.createdByName ? (actorName ? { createdByName: actorName } : {}) : {})
    }, { merge: true });

    // Safety: if a legacy collection 'mes-templates' exists and was written by old client, remove duplicate
    try {
      const legacyRef = db.collection('mes-templates').doc(template.id)
      const legacySnap = await legacyRef.get()
      if (legacySnap.exists) {
        await legacyRef.delete()
        console.log(`[MES] Removed legacy duplicate from mes-templates: ${template.id}`)
      }
    } catch (e) {
      // best-effort cleanup, ignore
    }

    return { success: true, id: template.id };
  }, res);
});

// DELETE /api/mes/templates/:id - Delete template from mes-production-plans
router.delete('/templates/:id', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params;
    const db = getFirestore();
    await db.collection('mes-production-plans').doc(id).delete();
    // Best-effort cleanup in legacy collection too
    try { await db.collection('mes-templates').doc(id).delete() } catch {}
    return { success: true, id };
  }, res);
});

// One-time migration endpoint: move any legacy 'mes-templates' docs into 'mes-production-plans'
router.post('/templates/migrate-from-legacy', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore()
    const legacyCol = db.collection('mes-templates')
    let migrated = 0
    let removed = 0
    try {
      const snap = await legacyCol.get()
      for (const doc of snap.docs) {
        const data = doc.data() || {}
        const id = doc.id
        await db.collection('mes-production-plans').doc(id).set({
          ...data,
          status: (data.status || 'template'),
          migratedAt: new Date()
        }, { merge: true })
        migrated++
        await legacyCol.doc(id).delete()
        removed++
      }
    } catch (e) {
      console.warn('[MES] Legacy templates migration issue:', e?.message)
    }
    return { success: true, migrated, removed }
  }, res)
})

// ============================================================================
// MATERIALS ROUTES
// ============================================================================
// NOTE: The 'mes-materials' collection has been removed from the codebase.
// All materials are now stored in the unified 'materials' collection.
// If you have legacy data in 'mes-materials', it should be migrated to 'materials'
// before running this code.

// GET /api/mes/materials - Get all materials from unified materials collection
router.get('/materials', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    const snapshot = await db.collection('materials')
      .orderBy('name')
      .get();
    const materials = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    return { materials };
  }, res);
});

// POST /api/mes/materials - Create/Update multiple materials (batch)
router.post('/materials', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { materials } = req.body;
    if (!Array.isArray(materials)) {
      throw new Error('Materials must be an array');
    }

    const db = getFirestore();
    const batch = db.batch();

    // Get existing materials to find deletions
    const existingSnapshot = await db.collection('materials').get();
    const existingIds = new Set(existingSnapshot.docs.map(doc => doc.id));
    const newIds = new Set(materials.map(m => m.id));

    // Add/Update materials
    materials.forEach(material => {
      const docRef = db.collection('materials').doc(material.id);
      batch.set(docRef, {
        ...material,
        updatedAt: new Date()
      }, { merge: true });
    });

    // Delete removed materials
    existingIds.forEach(id => {
      if (!newIds.has(id)) {
        const docRef = db.collection('materials').doc(id);
        batch.delete(docRef);
      }
    });

    await batch.commit();
    return { success: true, updated: materials.length };
  }, res);
});

// POST /api/mes/materials/check-availability - Check material availability for production plan
router.post('/materials/check-availability', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { materials: requiredMaterials } = req.body;
    
    if (!Array.isArray(requiredMaterials)) {
      throw new Error('Required materials must be an array');
    }

    const db = getFirestore();
    
    // Fetch materials from the unified materials collection only
    // NOTE: 'mes-materials' collection has been removed - all data is in 'materials'
    const snapshot = await db.collection('materials').get();
    
    // Build lookup maps by code, id, and name
    const materialStockMap = new Map();
    
    // Process materials
    snapshot.docs.forEach(doc => {
      const mat = { id: doc.id, ...doc.data() };
      const stock = parseFloat(mat.stock || mat.available) || 0;
      const code = mat.code || mat.id;
      
      // Add to map with multiple keys for flexible lookup
      if (code) materialStockMap.set(code.toLowerCase(), { ...mat, code, stock });
      if (mat.id) materialStockMap.set(mat.id.toLowerCase(), { ...mat, code, stock });
      if (mat.name) materialStockMap.set(mat.name.toLowerCase(), { ...mat, code, stock });
    });

    // Check each required material
    const materialChecks = requiredMaterials.map(required => {
      const requiredQty = parseFloat(required.required) || 0;
      
      // Try to find material by code, then id, then name
      let material = null;
      const searchKeys = [
        required.code?.toLowerCase(),
        required.id?.toLowerCase(),
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
      
      // Placeholder for future reservation system
      // Currently always true if material exists and is available
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
        canReserve // Placeholder for future reservation feature
      };
    });

    const allAvailable = materialChecks.every(check => check.isAvailable);
    const shortages = materialChecks.filter(check => !check.isAvailable);
    const canReserveAll = materialChecks.every(check => check.canReserve);

    return {
      allAvailable,
      canReserveAll, // Placeholder: true if all materials can be reserved
      materials: materialChecks,
      shortages,
      totalShortageItems: shortages.length,
      checkedAt: new Date().toISOString()
    };
  }, res);
});

// ============================================================================
// ORDERS ROUTES
// ============================================================================

// GET /api/mes/orders - Get all MES orders from Firestore (no mock)
router.get('/orders', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    // Read from 'mes-orders' collection if present; otherwise return empty list
    const snapshot = await db.collection('mes-orders').get();
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return { orders };
  }, res);
});

// ============================================================================
// HELPER: Update approved quote production state (internal use)
// ============================================================================
async function updateApprovedQuoteProductionState(orderCode, productionState, updatedBy = 'system') {
  if (!orderCode || !productionState) {
    console.warn('updateApprovedQuoteProductionState: orderCode or productionState missing');
    return { success: false, reason: 'missing_parameters' };
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
    console.warn(`updateApprovedQuoteProductionState: invalid state '${productionState}'`);
    return { success: false, reason: 'invalid_state' };
  }
  
  try {
    const db = getFirestore();
    const col = db.collection('mes-approved-quotes');
    
    // Find document by orderCode (workOrderCode field)
    const snapshot = await col.where('workOrderCode', '==', orderCode).limit(1).get();
    
    if (snapshot.empty) {
      console.log(`updateApprovedQuoteProductionState: order '${orderCode}' not found in approved quotes`);
      return { success: false, reason: 'not_found' };
    }
    
    const doc = snapshot.docs[0];
    const now = new Date().toISOString();
    
    // Update production state with history
    await doc.ref.update({
      productionState,
      updatedAt: now,
      productionStateHistory: admin.firestore.FieldValue.arrayUnion({
        state: productionState,
        timestamp: now,
        updatedBy
      })
    });
    
    console.log(`✓ Updated approved quote '${orderCode}' to state '${productionState}'`);
    return { success: true, orderCode, productionState };
  } catch (error) {
    console.error(`updateApprovedQuoteProductionState error for '${orderCode}':`, error);
    return { success: false, reason: 'firestore_error', error: error.message };
  }
}

// PATCH /api/mes/approved-quotes/:workOrderCode/production-state - Update production state
router.patch('/approved-quotes/:workOrderCode/production-state', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { workOrderCode } = req.params;
    const { productionState } = req.body || {};
    
    if (!workOrderCode) {
      const e = new Error('workOrderCode_required'); e.status = 400; throw e;
    }
    
    if (!productionState) {
      const e = new Error('productionState_required'); e.status = 400; throw e;
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
      const e = new Error('invalid_production_state'); e.status = 400; throw e;
    }
    
    const db = getFirestore();
    const col = db.collection('mes-approved-quotes');
    
    // Find document by workOrderCode
    const snapshot = await col.where('workOrderCode', '==', workOrderCode).limit(1).get();
    
    if (snapshot.empty) {
      const e = new Error(`${workOrderCode} için onaylı teklif bulunamadı. Quotes ekranından bu work order'ı oluşturup tekrar deneyin.`);
      e.status = 404;
      e.code = 'approved_quote_not_found';
      throw e;
    }
    
    const doc = snapshot.docs[0];
    
    // Update production state
    await doc.ref.update({
      productionState,
      updatedAt: new Date().toISOString(),
      productionStateHistory: admin.firestore.FieldValue.arrayUnion({
        state: productionState,
        timestamp: new Date().toISOString(),
        updatedBy: req.user?.email || 'system'
      })
    });
    
    return { 
      success: true, 
      workOrderCode,
      productionState,
      updatedAt: new Date().toISOString()
    };
  }, res);
});

// ============================================================================
// WORKER ASSIGNMENTS ROUTES
// ============================================================================

// POST /api/mes/worker-assignments/batch - Replace all assignments for a plan
router.post('/worker-assignments/batch', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { planId, assignments } = req.body;
    
    if (!planId) {
      throw new Error('planId is required');
    }
    
    if (!Array.isArray(assignments)) {
      throw new Error('assignments must be an array');
    }

    const db = getFirestore();
    
    // Validate worker and station IDs exist
    const workerIds = [...new Set(assignments.map(a => a.workerId).filter(Boolean))];
    const stationIds = [...new Set(assignments.map(a => a.stationId).filter(Boolean))];
    
    if (workerIds.length > 0) {
      const workersSnapshot = await db.collection('mes-workers').where('__name__', 'in', workerIds).get();
      const existingWorkerIds = new Set(workersSnapshot.docs.map(doc => doc.id));
      const invalidWorkerIds = workerIds.filter(id => !existingWorkerIds.has(id));
      if (invalidWorkerIds.length > 0) {
        throw new Error(`Invalid worker IDs: ${invalidWorkerIds.join(', ')}`);
      }
    }
    
    if (stationIds.length > 0) {
      const stationsSnapshot = await db.collection('mes-stations').where('__name__', 'in', stationIds).get();
      const existingStationIds = new Set(stationsSnapshot.docs.map(doc => doc.id));
      const invalidStationIds = stationIds.filter(id => !existingStationIds.has(id));
      if (invalidStationIds.length > 0) {
        throw new Error(`Invalid station IDs: ${invalidStationIds.join(', ')}`);
      }
    }

    // Use transaction to ensure consistency
    const result = await db.runTransaction(async (transaction) => {
      // Delete existing assignments for this plan
      const existingQuery = db.collection('mes-worker-assignments').where('planId', '==', planId);
      const existingSnapshot = await transaction.get(existingQuery);
      
      existingSnapshot.docs.forEach(doc => {
        transaction.delete(doc.ref);
      });

      // Fetch plan to get execution graph and operation details
      const planRef = db.collection('mes-production-plans').doc(planId);
      const planDoc = await transaction.get(planRef);
      
      let planData = null;
      let executionGraph = [];
      let planQuantity = 1;
      let operationsMap = new Map();
      
      if (planDoc.exists) {
        planData = planDoc.data();
        executionGraph = planData.executionGraph || [];
        planQuantity = planData.quantity || 1;
        
        // Fetch operations to get expectedDefectRate
        const operationsSnapshot = await db.collection('mes-operations').get();
        operationsSnapshot.docs.forEach(doc => {
          const opData = doc.data();
          operationsMap.set(doc.id, opData);
        });
      }

      // Create new assignments with material reservation calculations
      const now = new Date();
      const createdBy = req.user?.email || 'system';
      
      assignments.forEach(assignment => {
        const assignmentId = `${planId}-${assignment.nodeId || assignment.workerId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const docRef = db.collection('mes-worker-assignments').doc(assignmentId);
        
        // Find the node in execution graph
        const node = executionGraph.find(n => n.nodeId === assignment.nodeId);
        
        // Get operation data for defect rate
        const operation = node && node.operationId ? operationsMap.get(node.operationId) : null;
        const expectedDefectRate = operation?.expectedDefectRate || 0;
        
        // Calculate material reservations
        const preProductionReservedAmount = node 
          ? calculatePreProductionReservedAmount(node, expectedDefectRate, planQuantity)
          : {};
        
        const plannedOutput = node 
          ? calculatePlannedOutput(node, planQuantity)
          : {};
        
        transaction.set(docRef, {
          id: assignmentId,
          planId,
          nodeId: assignment.nodeId || null,
          workerId: assignment.workerId || null,
          stationId: assignment.stationId || null,
          subStationCode: assignment.subStationCode || null,
          start: assignment.start ? new Date(assignment.start) : null,
          end: assignment.end ? new Date(assignment.end) : null,
          status: assignment.status || 'pending',
          // Material reservation fields
          preProductionReservedAmount: Object.keys(preProductionReservedAmount).length > 0 
            ? preProductionReservedAmount 
            : null,
          plannedOutput: Object.keys(plannedOutput).length > 0 
            ? plannedOutput 
            : null,
          materialReservationStatus: 'pending', // pending, reserved, consumed
          createdAt: now,
          updatedAt: now,
          createdBy
        });
      });

      return { success: true, planId, assignmentCount: assignments.length };
    });

    return result;
  }, res);
});

// POST /api/mes/worker-assignments/activate - Activate assignments for a released plan
router.post('/worker-assignments/activate', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { planId, status } = req.body;
    
    if (!planId) {
      throw new Error('planId is required');
    }
    
    const assignmentStatus = status || 'active'; // Default to 'active' if not provided
    
    const db = getFirestore();
    
    // Fetch all assignments for this plan
    const assignmentsSnapshot = await db.collection('mes-worker-assignments')
      .where('planId', '==', planId)
      .get();
    
    if (assignmentsSnapshot.empty) {
      console.log(`No assignments found for plan ${planId}`);
      return { success: true, planId, activatedCount: 0, message: 'No assignments to activate' };
    }
    
    const assignments = assignmentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    console.log(`Activating ${assignments.length} assignments for plan ${planId}`);
    
    // Use transaction to ensure consistency across workers and stations
    const result = await db.runTransaction(async (transaction) => {
      const updates = {
        workersUpdated: 0,
        stationsUpdated: 0,
        workersMissing: [],
        stationsMissing: []
      };
      
      // Process each assignment
      for (const assignment of assignments) {
        const { workerId, stationId, nodeId, start } = assignment;
        
        // Update worker's currentTask
        if (workerId) {
          const workerRef = db.collection('mes-workers').doc(workerId);
          const workerDoc = await transaction.get(workerRef);
          
          if (workerDoc.exists) {
            transaction.update(workerRef, {
              currentTask: {
                planId,
                nodeId: nodeId || null,
                stationId: stationId || null,
                start: start || null,
                status: assignmentStatus
              },
              updatedAt: new Date()
            });
            updates.workersUpdated++;
          } else {
            console.warn(`Worker ${workerId} not found for assignment ${assignment.id}`);
            updates.workersMissing.push(workerId);
          }
        }
        
        // Update station's currentOperation and currentWorker
        if (stationId) {
          const stationRef = db.collection('mes-stations').doc(stationId);
          const stationDoc = await transaction.get(stationRef);
          
          if (stationDoc.exists) {
            transaction.update(stationRef, {
              currentOperation: nodeId || null,
              currentWorker: workerId || null,
              updatedAt: new Date()
            });
            updates.stationsUpdated++;
          } else {
            console.warn(`Station ${stationId} not found for assignment ${assignment.id}`);
            updates.stationsMissing.push(stationId);
          }
        }
      }
      
      return {
        success: true,
        planId,
        activatedCount: assignments.length,
        workersUpdated: updates.workersUpdated,
        stationsUpdated: updates.stationsUpdated,
        ...(updates.workersMissing.length > 0 && { workersMissing: updates.workersMissing }),
        ...(updates.stationsMissing.length > 0 && { stationsMissing: updates.stationsMissing })
      };
    });
    
    console.log(`✓ Activated assignments for plan ${planId}:`, result);
    return result;
  }, res);
});

// GET /api/mes/workers/:id/assignments - Get worker assignments
router.get('/workers/:id/assignments', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params;
    const { status } = req.query;
    
    const db = getFirestore();
    
    // Verify worker exists
    const workerDoc = await db.collection('mes-workers').doc(id).get();
    if (!workerDoc.exists) {
      throw new Error('Worker not found');
    }

    // Build query with equality filters only
    let query = db.collection('mes-worker-assignments').where('workerId', '==', id);
    
    if (status) {
      query = query.where('status', '==', status);
    }
    
    const snapshot = await query.get();
    const assignments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      // Convert Firestore timestamps to ISO strings
      start: doc.data().start?.toDate?.()?.toISOString() || doc.data().start,
      end: doc.data().end?.toDate?.()?.toISOString() || doc.data().end,
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || doc.data().createdAt,
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || doc.data().updatedAt
    }));

    // Sort by start time in JavaScript (nulls last)
    assignments.sort((a, b) => {
      if (!a.start && !b.start) return 0;
      if (!a.start) return 1;
      if (!b.start) return -1;
      return new Date(a.start).getTime() - new Date(b.start).getTime();
    });

    return { assignments };
  }, res);
});

// ============================================================================
// WORKER PORTAL ROUTES
// ============================================================================

// GET /api/mes/worker-portal/tasks - Get active tasks for worker
router.get('/worker-portal/tasks', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    
    // Get workerId from query param (required)
    const workerId = req.query.workerId;
    
    if (!workerId) {
      const e = new Error('Worker ID is required. Please provide ?workerId=<id> parameter');
      e.status = 400;
      e.code = 'worker_id_required';
      throw e;
    }
    
    // Verify worker exists
    const workerDoc = await db.collection('mes-workers').doc(workerId).get();
    if (!workerDoc.exists) {
      const e = new Error('worker_not_found');
      e.status = 404;
      e.code = 'worker_not_found';
      throw e;
    }
    
    const workerData = workerDoc.data();
    
    // Get all assignments for this worker with active statuses
    const assignmentsSnapshot = await db.collection('mes-worker-assignments')
      .where('workerId', '==', workerId)
      .get();
    
    if (assignmentsSnapshot.empty) {
      return { tasks: [], nextTaskId: null };
    }
    
    // Get unique plan IDs and station IDs to fetch additional data
    const planIds = [...new Set(assignmentsSnapshot.docs.map(doc => doc.data().planId))];
    const stationIds = [...new Set(assignmentsSnapshot.docs.map(doc => doc.data().stationId).filter(Boolean))];
    
    // Fetch plans
    const plansMap = new Map();
    for (const planId of planIds) {
      try {
        const planDoc = await db.collection('mes-production-plans').doc(planId).get();
        if (planDoc.exists) {
          plansMap.set(planId, planDoc.data());
        }
      } catch (err) {
        console.error(`Failed to fetch plan ${planId}:`, err);
      }
    }
    
    // Fetch stations
    const stationsMap = new Map();
    if (stationIds.length > 0) {
      const stationsSnapshot = await db.collection('mes-stations').where('__name__', 'in', stationIds).get();
      stationsSnapshot.docs.forEach(doc => {
        stationsMap.set(doc.id, doc.data());
      });
    }
    
    // Build tasks from assignments
    const allTasks = [];
    
    for (const doc of assignmentsSnapshot.docs) {
      const assignment = { id: doc.id, ...doc.data() };
      
      // Skip only completed tasks; keep cancelled_pending_report for scrap reporting
      if (assignment.status === 'completed' || assignment.status === 'cancelled') {
        continue;
      }
      
      const plan = plansMap.get(assignment.planId);
      const station = assignment.stationId ? stationsMap.get(assignment.stationId) : null;
      
      // Find node info from plan's execution graph
      let nodeInfo = null;
      if (plan && plan.executionGraph && assignment.nodeId) {
        nodeInfo = plan.executionGraph.find(node => node.nodeId === assignment.nodeId);
      }
      
      // Build task object
      const task = {
        // Assignment info
        assignmentId: assignment.id,
        planId: assignment.planId,
        nodeId: assignment.nodeId,
        status: assignment.status || 'pending',
        
        // Worker info
        workerId: assignment.workerId,
        workerName: workerData.name,
        
        // Station info
        stationId: assignment.stationId,
        stationName: station?.name || 'Belirsiz',
        subStationCode: assignment.subStationCode,
        
        // Task details from node
        name: nodeInfo?.name || 'İsimsiz Görev',
        operationId: nodeInfo?.operationId,
        operationName: nodeInfo?.operationName,
        priorityIndex: nodeInfo?.priorityIndex || 0,
        estimatedNominalTime: nodeInfo?.estimatedNominalTime || 0,
        estimatedEffectiveTime: nodeInfo?.estimatedEffectiveTime || 0,
        
        // Timing
        assignedAt: assignment.createdAt,
        actualStart: assignment.actualStart || null,
        actualFinish: assignment.actualFinish || null,
        
        // Pause metadata (to differentiate plan pause vs worker pause)
        pauseContext: assignment.pauseContext || null,
        pauseReason: assignment.pauseReason || null,
        pausedBy: assignment.pausedBy || null,
        pausedByName: assignment.pausedByName || null,
        pausedAt: assignment.pausedAt || null,
        
        // Prerequisites (simplified for worker view)
        prerequisites: {
          predecessorsDone: true, // Worker doesn't need to worry about this
          workerAvailable: true,  // If assigned, worker is available
          stationAvailable: true, // If assigned, station is available
          materialsReady: !plan?.materialSummary?.hasShortages
        },
        
        // Material output info
        hasOutputs: nodeInfo?.hasOutputs || false,
        outputCode: nodeInfo?.outputCode,
        outputQty: nodeInfo?.outputQty
      };
      
      allTasks.push(task);
    }
    
    // Sort by priorityIndex
    allTasks.sort((a, b) => a.priorityIndex - b.priorityIndex);
    
    // Find next task (first pending or ready task)
    const nextTask = allTasks.find(t => t.status === 'pending' || t.status === 'ready');
    const nextTaskId = nextTask?.assignmentId || null;
    
    return { tasks: allTasks, nextTaskId };
  }, res);
});

// ============================================================================
// WORK PACKAGE (ASSIGNMENT) UPDATE ENDPOINT
// ============================================================================
// PATCH /api/mes/work-packages/:id - Update work package with actions
// This is the unified endpoint for all task state changes: start, pause, station_error, complete
// Replaces the old /worker-portal/tasks endpoint for consistency
router.patch('/work-packages/:id', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id: assignmentId } = req.params;
    const { action, scrapQty, stationNote, actualOutputQuantity, defectQuantity } = req.body;
    
    if (!assignmentId) {
      const e = new Error('work_package_id_required');
      e.status = 400;
      throw e;
    }
    
    if (!action) {
      const e = new Error('action_required');
      e.status = 400;
      throw e;
    }
    
    const validActions = ['start', 'pause', 'station_error', 'complete'];
    if (!validActions.includes(action)) {
      const e = new Error('invalid_action');
      e.status = 400;
      throw e;
    }
    
    const db = getFirestore();
    const now = new Date();
    const actorEmail = req.user?.email || 'system';
    const actorName = req.user?.name || req.user?.userName || null;
    
    // Get assignment (work package)
    const assignmentDoc = await db.collection('mes-worker-assignments').doc(assignmentId).get();
    if (!assignmentDoc.exists) {
      const e = new Error('work_package_not_found');
      e.status = 404;
      throw e;
    }
    
    const assignment = assignmentDoc.data();
    const { planId, nodeId, workerId, stationId } = assignment;
    
    // Execute action in atomic transaction
    const result = await db.runTransaction(async (transaction) => {
      const assignmentRef = db.collection('mes-worker-assignments').doc(assignmentId);
      const workerRef = workerId ? db.collection('mes-workers').doc(workerId) : null;
      const stationRef = stationId ? db.collection('mes-stations').doc(stationId) : null;
      
      let updateData = { updatedAt: now };
      let workerUpdate = null;
      let stationUpdate = null;
      let alertCreated = false;
      let scrapAdjustment = null;
      let materialReservationResult = null;
      
      switch (action) {
        case 'start':
          // PRECONDITION CHECK: Verify task is ready to start
          // Get fresh execution state to validate prerequisites
          try {
            const tasks = await getPlanExecutionState(planId);
            const currentTask = tasks.find(t => t.assignmentId === assignmentId);
            
            if (!currentTask) {
              const e = new Error('Task not found in execution graph');
              e.status = 404;
              throw e;
            }
            
            // Check if task status is ready, pending, or paused (but only if not plan-paused)
            if (currentTask.status === 'paused' && currentTask.pauseContext === 'plan') {
              const e = new Error('Task cannot be started: paused by admin');
              e.status = 400;
              e.code = 'precondition_failed';
              throw e;
            }
            
            if (currentTask.status !== 'ready' && currentTask.status !== 'pending' && currentTask.status !== 'paused') {
              const e = new Error(`Task cannot be started: current status is ${currentTask.status}`);
              e.status = 400;
              e.code = 'precondition_failed';
              throw e;
            }
            
            // Check prerequisites
            const prereqs = currentTask.prerequisites || {};
            const failedPrereqs = [];
            
            if (!prereqs.predecessorsDone) failedPrereqs.push('Önceki görevler tamamlanmadı');
            if (!prereqs.workerAvailable) failedPrereqs.push('İşçi meşgul');
            if (!prereqs.stationAvailable) failedPrereqs.push('İstasyon meşgul');
            if (!prereqs.materialsReady) failedPrereqs.push('Malzeme eksik');
            
            if (failedPrereqs.length > 0) {
              const e = new Error(`Preconditions not met: ${failedPrereqs.join(', ')}`);
              e.status = 400;
              e.code = 'precondition_failed';
              e.details = failedPrereqs;
              throw e;
            }
            
            // RE-VALIDATE MATERIAL AVAILABILITY
            // Fetch the plan to check materials haven't been depleted since launch
            const planDoc = await db.collection('mes-production-plans').doc(planId).get();
            if (planDoc.exists) {
              const planData = planDoc.data();
              const planQuantity = planData.quantity || 1;
              const materialValidation = await validateMaterialAvailability(
                planData,
                planQuantity,
                db
              );
              
              if (!materialValidation.allAvailable) {
                const e = new Error('Malzemeler tükendi, görev başlatılamıyor');
                e.status = 409;
                e.code = 'material_shortage';
                e.shortages = materialValidation.shortages;
                e.details = materialValidation.details;
                throw e;
              }
            }
          } catch (err) {
            // If it's a precondition error or material shortage, re-throw
            if (err.code === 'precondition_failed' || err.code === 'material_shortage') {
              throw err;
            }
            // Otherwise, log warning but allow start (backward compatibility)
            console.warn('Precondition check failed, but allowing start:', err.message);
          }
          
          // ========================================================================
          // MATERIAL RESERVATION: Deduct from stock and add to wipReserved
          // ========================================================================
          // When a worker starts a task, materials are physically moved from 
          // warehouse stock to the production floor (WIP area).
          // This is an atomic operation that:
          // 1. Deducts from material.stock (physical inventory)
          // 2. Adds to material.wipReserved (in-production inventory)
          // ========================================================================
          
          // Only process if this assignment hasn't already reserved materials
          if (assignment.materialReservationStatus !== 'reserved' && 
              assignment.preProductionReservedAmount && 
              Object.keys(assignment.preProductionReservedAmount).length > 0) {
            
            const reservationResults = [];
            const reservationErrors = [];
            
            console.log(`🔄 Starting material reservation for work package ${assignmentId}`);
            
            // Process each material in preProductionReservedAmount
            for (const [materialCode, reservedQty] of Object.entries(assignment.preProductionReservedAmount)) {
              try {
                const materialRef = db.collection('materials').doc(materialCode);
                const materialDoc = await transaction.get(materialRef);
                
                if (!materialDoc.exists) {
                  reservationErrors.push({
                    materialCode,
                    error: 'Material not found',
                    reservedQty
                  });
                  console.error(`❌ Material ${materialCode} not found`);
                  continue;
                }
                
                const materialData = materialDoc.data();
                const currentStock = parseFloat(materialData.stock) || 0;
                const currentWipReserved = parseFloat(materialData.wipReserved) || 0;
                
                // Validate sufficient stock
                if (currentStock < reservedQty) {
                  reservationErrors.push({
                    materialCode,
                    error: 'Insufficient stock',
                    required: reservedQty,
                    available: currentStock,
                    shortage: reservedQty - currentStock
                  });
                  console.error(`❌ Insufficient stock for ${materialCode}: required ${reservedQty}, available ${currentStock}`);
                  continue;
                }
                
                // Atomic update: deduct from stock, add to wipReserved
                const newStock = currentStock - reservedQty;
                const newWipReserved = currentWipReserved + reservedQty;
                
                transaction.update(materialRef, {
                  stock: newStock,
                  wipReserved: newWipReserved,
                  updatedAt: now,
                  updatedBy: actorEmail
                });
                
                reservationResults.push({
                  materialCode,
                  materialName: materialData.name,
                  reservedQty,
                  previousStock: currentStock,
                  newStock,
                  previousWipReserved: currentWipReserved,
                  newWipReserved,
                  unit: materialData.unit
                });
                
                // ========================================================================
                // STOCK MOVEMENTS: Record material transfer to WIP
                // ========================================================================
                const stockMovementRef = db.collection('stockMovements').doc();
                transaction.set(stockMovementRef, {
                  materialId: materialCode,
                  materialCode: materialCode,
                  materialName: materialData.name || '',
                  type: 'out', // Stock'tan çıkış
                  subType: 'wip_reservation', // Üretim rezervasyonu
                  quantity: reservedQty,
                  unit: materialData.unit || 'Adet',
                  stockBefore: currentStock,
                  stockAfter: newStock,
                  wipReservedBefore: currentWipReserved,
                  wipReservedAfter: newWipReserved,
                  unitCost: materialData.costPrice || null,
                  totalCost: materialData.costPrice ? materialData.costPrice * reservedQty : null,
                  currency: 'TRY',
                  reference: assignmentId,
                  referenceType: 'mes_task_start',
                  relatedPlanId: planId,
                  relatedNodeId: nodeId,
                  warehouse: null,
                  location: 'WIP',
                  notes: `Görev başlatıldı - Malzeme üretime alındı`,
                  reason: 'MES görev başlatma - WIP rezervasyonu',
                  movementDate: now,
                  createdAt: now,
                  userId: actorEmail,
                  userName: actorName || actorEmail,
                  approved: true,
                  approvedBy: actorEmail,
                  approvedAt: now
                });
                
                console.log(`✅ Reserved ${reservedQty} ${materialData.unit} of ${materialCode}: stock ${currentStock} → ${newStock}, wipReserved ${currentWipReserved} → ${newWipReserved}`);
                
              } catch (err) {
                reservationErrors.push({
                  materialCode,
                  error: err.message,
                  reservedQty
                });
                console.error(`❌ Failed to reserve ${materialCode}:`, err);
              }
            }
            
            // If any errors occurred, throw to rollback transaction
            if (reservationErrors.length > 0) {
              const e = new Error('Material reservation failed');
              e.status = 409;
              e.code = 'material_reservation_failed';
              e.errors = reservationErrors;
              e.details = reservationErrors.map(err => 
                `${err.materialCode}: ${err.error}${err.shortage ? ` (eksik: ${err.shortage})` : ''}`
              ).join(', ');
              throw e;
            }
            
            // Update assignment with reservation status
            updateData.materialReservationStatus = 'reserved';
            updateData.materialReservationTimestamp = now;
            updateData.materialReservationResults = reservationResults;
            
            materialReservationResult = {
              success: true,
              materialsReserved: reservationResults.length,
              details: reservationResults
            };
            
            console.log(`✅ Material reservation completed for work package ${assignmentId}: ${reservationResults.length} material(s) reserved`);
          }
          
          // ========================================================================
          // UPDATE ASSIGNMENT STATUS
          // ========================================================================
          
          updateData.status = 'in_progress';
          
          // Only set actualStart if it doesn't already exist (preserve on resume)
          if (!assignment.actualStart) {
            updateData.actualStart = now;
          }
          
          // Clear pause metadata when starting/resuming
          updateData.pauseContext = admin.firestore.FieldValue.delete();
          updateData.pauseReason = admin.firestore.FieldValue.delete();
          updateData.pausedAt = admin.firestore.FieldValue.delete();
          
          // Set worker currentTask
          if (workerRef) {
            workerUpdate = {
              currentTask: {
                planId,
                nodeId,
                assignmentId,
                status: 'in_progress',
                startedAt: now
              },
              updatedAt: now
            };
          }
          
          // Set station currentOperation
          if (stationRef) {
            stationUpdate = {
              currentOperation: nodeId,
              updatedAt: now
            };
          }
          break;
          
        case 'pause':
          // ========================================================================
          // PAUSE: No material changes, only status update
          // ========================================================================
          updateData.status = 'paused';
          updateData.pausedAt = now;
          updateData.pausedBy = actorEmail;
          updateData.pausedByName = actorName;
          updateData.pauseContext = 'worker'; // Worker-level pause
          updateData.pauseReason = 'Worker paused the task';
          
          // Update worker currentTask status
          if (workerRef) {
            workerUpdate = {
              'currentTask.status': 'paused',
              updatedAt: now
            };
          }
          break;
          
        case 'station_error':
          // ========================================================================
          // STATION ERROR: Pause + create alert
          // ========================================================================
          updateData.status = 'paused';
          updateData.pausedAt = now;
          updateData.pausedBy = actorEmail;
          updateData.pausedByName = actorName;
          updateData.pauseContext = 'station_error'; // Station error pause
          updateData.pauseReason = stationNote || 'Station error reported';
          
          // Update worker currentTask status
          if (workerRef) {
            workerUpdate = {
              'currentTask.status': 'paused',
              updatedAt: now
            };
          }
          
          // Create alert in mes-alerts collection
          const alertRef = db.collection('mes-alerts').doc();
          transaction.set(alertRef, {
            id: alertRef.id,
            type: 'station_error',
            planId,
            nodeId,
            stationId,
            workerId,
            assignmentId,
            note: stationNote || 'İstasyon hatası',
            status: 'open',
            createdAt: now,
            createdBy: actorEmail,
            createdByName: actorName
          });
          alertCreated = true;
          break;
          
        case 'complete':
          // ========================================================================
          // COMPREHENSIVE MATERIAL CONSUMPTION & STOCK FINALIZATION
          // ========================================================================
          // This implements a complete material accounting cycle:
          // 1. Calculate actual consumption based on actual output + defects
          // 2. Release wipReserved and adjust stock for input materials
          // 3. Add good output to stock
          // 4. Record all material movements for audit trail
          // ========================================================================
          
          console.log(`📊 Starting comprehensive completion for work package ${assignmentId}`);
          
          updateData.status = 'completed';
          updateData.actualFinish = now;
          
          // Store actual output and defect quantities
          const actualOutput = parseFloat(actualOutputQuantity) || 0;
          const defects = parseFloat(defectQuantity) || 0;
          
          updateData.actualOutputQuantity = actualOutput;
          updateData.defectQuantity = defects;
          
          // If completing a cancelled_pending_report task, stamp completionContext
          if (assignment.status === 'cancelled_pending_report' || assignment.finishContext === 'cancelled') {
            updateData.completionContext = 'cancelled';
          }
          
          // ========================================================================
          // STEP 1: Gather Required Data
          // ========================================================================
          
          const preProductionReservedAmount = assignment.preProductionReservedAmount || {};
          const plannedOutput = assignment.plannedOutput || {};
          
          console.log(`📦 Reserved materials:`, preProductionReservedAmount);
          console.log(`🎯 Planned output:`, plannedOutput);
          console.log(`✅ Actual output: ${actualOutput}, ❌ Defects: ${defects}`);
          
          // Get plan and node information
          const planDoc = await transaction.get(db.collection('mes-production-plans').doc(planId));
          if (!planDoc.exists) {
            console.error(`Plan ${planId} not found`);
            throw new Error(`Production plan ${planId} not found`);
          }
          
          const planData = planDoc.data();
          const executionGraph = planData.executionGraph || [];
          const node = executionGraph.find(n => n.nodeId === nodeId);
          
          if (!node) {
            console.error(`Node ${nodeId} not found in execution graph`);
            throw new Error(`Task node ${nodeId} not found in production plan`);
          }
          
          // Get material inputs and output information
          const materialInputs = node.materialInputs || [];
          const outputCode = node.outputCode || Object.keys(plannedOutput)[0];
          const plannedOutputQty = node.outputQty || Object.values(plannedOutput)[0] || 0;
          
          console.log(`📋 Material inputs:`, materialInputs.map(m => `${m.code}: ${m.qty}`));
          console.log(`📦 Output code: ${outputCode}, Planned: ${plannedOutputQty}`);
          
          // ========================================================================
          // STEP 2: Calculate Actual Consumption
          // ========================================================================
          
          const totalConsumedOutput = actualOutput + defects;
          const consumptionResults = [];
          const stockAdjustmentResults = [];
          
          console.log(`🔢 Total consumed (output + defect): ${totalConsumedOutput}`);
          
          if (materialInputs.length > 0 && plannedOutputQty > 0) {
            
            for (const materialInput of materialInputs) {
              const inputCode = materialInput.code;
              const requiredInputQty = materialInput.qty || materialInput.required || 0;
              
              if (!inputCode || requiredInputQty <= 0) continue;
              
              // Calculate input-output ratio
              const inputOutputRatio = requiredInputQty / plannedOutputQty;
              
              // Calculate actual consumption based on total consumed output
              const actualConsumption = totalConsumedOutput * inputOutputRatio;
              
              // Get reserved amount for this material
              const reservedAmount = preProductionReservedAmount[inputCode] || 0;
              
              // Calculate stock adjustment (reserved - actual consumption)
              const stockAdjustment = reservedAmount - actualConsumption;
              
              console.log(`
📊 Material: ${inputCode}
   Required per unit: ${requiredInputQty}
   Planned output: ${plannedOutputQty}
   Input-output ratio: ${inputOutputRatio.toFixed(4)}
   Reserved amount: ${reservedAmount}
   Actual consumption: ${actualConsumption.toFixed(2)}
   Stock adjustment: ${stockAdjustment >= 0 ? '+' : ''}${stockAdjustment.toFixed(2)}
              `);
              
              consumptionResults.push({
                materialCode: inputCode,
                requiredInputQty,
                plannedOutputQty,
                inputOutputRatio,
                reservedAmount,
                actualConsumption,
                stockAdjustment
              });
            }
            
            // ========================================================================
            // STEP 3: Stock Adjustment for Input Materials
            // ========================================================================
            
            console.log(`🔄 Processing stock adjustments for ${consumptionResults.length} input material(s)`);
            
            for (const consumption of consumptionResults) {
              const { materialCode, reservedAmount, actualConsumption, stockAdjustment } = consumption;
              
              try {
                const materialRef = db.collection('materials').doc(materialCode);
                const materialDoc = await transaction.get(materialRef);
                
                if (!materialDoc.exists) {
                  console.error(`❌ Material ${materialCode} not found`);
                  continue;
                }
                
                const materialData = materialDoc.data();
                const currentStock = parseFloat(materialData.stock) || 0;
                const currentWipReserved = parseFloat(materialData.wipReserved) || 0;
                
                // Release wipReserved
                const newWipReserved = Math.max(0, currentWipReserved - reservedAmount);
                
                // Adjust stock (add back unused or deduct extra used)
                const newStock = currentStock + stockAdjustment;
                
                if (newStock < 0) {
                  console.warn(`⚠️ Warning: ${materialCode} stock would become negative (${newStock}). Setting to 0.`);
                }
                
                transaction.update(materialRef, {
                  stock: Math.max(0, newStock),
                  wipReserved: newWipReserved,
                  updatedAt: now,
                  updatedBy: actorEmail
                });
                
                stockAdjustmentResults.push({
                  materialCode,
                  materialName: materialData.name,
                  reservedAmount,
                  actualConsumption,
                  stockAdjustment,
                  previousStock: currentStock,
                  newStock: Math.max(0, newStock),
                  previousWipReserved: currentWipReserved,
                  newWipReserved,
                  unit: materialData.unit
                });
                
                // ========================================================================
                // STOCK MOVEMENTS: Record WIP release and consumption
                // ========================================================================
                
                // 1. WIP Release (always happens)
                const wipReleaseMovementRef = db.collection('stockMovements').doc();
                transaction.set(wipReleaseMovementRef, {
                  materialId: materialCode,
                  materialCode: materialCode,
                  materialName: materialData.name || '',
                  type: 'in', // WIP'ten serbest bırakma (conceptually "in" to available pool)
                  subType: 'wip_release',
                  quantity: reservedAmount,
                  unit: materialData.unit || 'Adet',
                  stockBefore: currentStock,
                  stockAfter: Math.max(0, newStock),
                  wipReservedBefore: currentWipReserved,
                  wipReservedAfter: newWipReserved,
                  unitCost: materialData.costPrice || null,
                  totalCost: materialData.costPrice ? materialData.costPrice * reservedAmount : null,
                  currency: 'TRY',
                  reference: assignmentId,
                  referenceType: 'mes_task_complete',
                  relatedPlanId: planId,
                  relatedNodeId: nodeId,
                  warehouse: null,
                  location: 'WIP Release',
                  notes: `Görev tamamlandı - WIP rezervi serbest bırakıldı`,
                  reason: 'MES görev tamamlama - WIP serbest bırakma',
                  movementDate: now,
                  createdAt: now,
                  userId: actorEmail,
                  userName: actorName || actorEmail,
                  approved: true,
                  approvedBy: actorEmail,
                  approvedAt: now
                });
                
                // 2. Actual Consumption (production usage)
                const consumptionMovementRef = db.collection('stockMovements').doc();
                transaction.set(consumptionMovementRef, {
                  materialId: materialCode,
                  materialCode: materialCode,
                  materialName: materialData.name || '',
                  type: actualConsumption > 0 ? 'out' : 'in', // Consumption is 'out', over-reservation return is 'in'
                  subType: 'production_consumption',
                  quantity: Math.abs(actualConsumption),
                  unit: materialData.unit || 'Adet',
                  stockBefore: currentStock,
                  stockAfter: Math.max(0, newStock),
                  actualOutput: actualOutput,
                  defectQuantity: defects,
                  plannedOutput: plannedOutputQty,
                  unitCost: materialData.costPrice || null,
                  totalCost: materialData.costPrice ? materialData.costPrice * Math.abs(actualConsumption) : null,
                  currency: 'TRY',
                  reference: assignmentId,
                  referenceType: 'mes_task_complete',
                  relatedPlanId: planId,
                  relatedNodeId: nodeId,
                  warehouse: null,
                  location: 'Production Floor',
                  notes: `Görev tamamlandı - Gerçek sarfiyat: ${actualConsumption.toFixed(2)} ${materialData.unit} (Çıktı: ${actualOutput}, Fire: ${defects})`,
                  reason: 'MES görev tamamlama - Üretim sarfiyatı',
                  movementDate: now,
                  createdAt: now,
                  userId: actorEmail,
                  userName: actorName || actorEmail,
                  approved: true,
                  approvedBy: actorEmail,
                  approvedAt: now
                });
                
                // 3. Stock Adjustment (if there's a difference)
                if (Math.abs(stockAdjustment) > 0.001) { // Floating point tolerance
                  const adjustmentMovementRef = db.collection('stockMovements').doc();
                  transaction.set(adjustmentMovementRef, {
                    materialId: materialCode,
                    materialCode: materialCode,
                    materialName: materialData.name || '',
                    type: stockAdjustment > 0 ? 'in' : 'out',
                    subType: 'production_adjustment',
                    quantity: Math.abs(stockAdjustment),
                    unit: materialData.unit || 'Adet',
                    stockBefore: currentStock,
                    stockAfter: Math.max(0, newStock),
                    unitCost: materialData.costPrice || null,
                    totalCost: materialData.costPrice ? materialData.costPrice * Math.abs(stockAdjustment) : null,
                    currency: 'TRY',
                    reference: assignmentId,
                    referenceType: 'mes_task_complete',
                    relatedPlanId: planId,
                    relatedNodeId: nodeId,
                    warehouse: null,
                    location: 'Production Adjustment',
                    notes: stockAdjustment > 0 
                      ? `Fazla rezerve edildi - ${Math.abs(stockAdjustment).toFixed(2)} ${materialData.unit} iade edildi`
                      : `Eksik rezerve edildi - ${Math.abs(stockAdjustment).toFixed(2)} ${materialData.unit} ek kullanıldı`,
                    reason: 'MES görev tamamlama - Rezervasyon düzeltmesi',
                    movementDate: now,
                    createdAt: now,
                    userId: actorEmail,
                    userName: actorName || actorEmail,
                    approved: true,
                    approvedBy: actorEmail,
                    approvedAt: now
                  });
                }
                
                console.log(`✅ ${materialCode}: stock ${currentStock} → ${Math.max(0, newStock)} (${stockAdjustment >= 0 ? '+' : ''}${stockAdjustment.toFixed(2)}), wipReserved ${currentWipReserved} → ${newWipReserved} (-${reservedAmount})`);
                
              } catch (err) {
                console.error(`❌ Failed to adjust stock for ${materialCode}:`, err);
                // Continue with other materials
              }
            }
          } else {
            console.warn(`⚠️ No material inputs found or planned output is zero. Skipping consumption calculation.`);
          }
          
          // ========================================================================
          // STEP 4: Stock Update for Output Material
          // ========================================================================
          
          let outputStockResult = null;
          
          if (outputCode && actualOutput > 0) {
            console.log(`📦 Adding ${actualOutput} units of ${outputCode} to stock`);
            
            try {
              const outputMaterialRef = db.collection('materials').doc(outputCode);
              const outputMaterialDoc = await transaction.get(outputMaterialRef);
              
              if (outputMaterialDoc.exists) {
                const outputMaterialData = outputMaterialDoc.data();
                const currentOutputStock = parseFloat(outputMaterialData.stock) || 0;
                const newOutputStock = currentOutputStock + actualOutput;
                
                transaction.update(outputMaterialRef, {
                  stock: newOutputStock,
                  updatedAt: now,
                  updatedBy: actorEmail
                });
                
                outputStockResult = {
                  materialCode: outputCode,
                  materialName: outputMaterialData.name,
                  addedQuantity: actualOutput,
                  previousStock: currentOutputStock,
                  newStock: newOutputStock,
                  unit: outputMaterialData.unit
                };
                
                // ========================================================================
                // STOCK MOVEMENTS: Record production output addition
                // ========================================================================
                const outputMovementRef = db.collection('stockMovements').doc();
                transaction.set(outputMovementRef, {
                  materialId: outputCode,
                  materialCode: outputCode,
                  materialName: outputMaterialData.name || '',
                  type: 'in', // Üretimden gelen stok girişi
                  subType: 'production_output',
                  quantity: actualOutput,
                  unit: outputMaterialData.unit || 'Adet',
                  stockBefore: currentOutputStock,
                  stockAfter: newOutputStock,
                  actualOutput: actualOutput,
                  defectQuantity: defects,
                  plannedOutput: plannedOutputQty,
                  unitCost: outputMaterialData.costPrice || null,
                  totalCost: outputMaterialData.costPrice ? outputMaterialData.costPrice * actualOutput : null,
                  currency: 'TRY',
                  reference: assignmentId,
                  referenceType: 'mes_task_complete',
                  relatedPlanId: planId,
                  relatedNodeId: nodeId,
                  warehouse: null,
                  location: 'Production Output',
                  notes: `Üretim tamamlandı - ${actualOutput} ${outputMaterialData.unit} üretildi${defects > 0 ? ` (Fire: ${defects})` : ''}`,
                  reason: 'MES görev tamamlama - Üretim çıktısı',
                  movementDate: now,
                  createdAt: now,
                  userId: actorEmail,
                  userName: actorName || actorEmail,
                  approved: true,
                  approvedBy: actorEmail,
                  approvedAt: now
                });
                
                console.log(`✅ Output ${outputCode}: stock ${currentOutputStock} → ${newOutputStock} (+${actualOutput})`);
                
              } else {
                console.warn(`⚠️ Output material ${outputCode} not found in database. Creating it...`);
                
                // Create output material if it doesn't exist (WIP material)
                transaction.set(outputMaterialRef, {
                  code: outputCode,
                  name: node.name || outputCode,
                  type: 'wip',
                  category: 'WIP',
                  stock: actualOutput,
                  reserved: 0,
                  wipReserved: 0,
                  unit: 'adet',
                  status: 'Aktif',
                  isActive: true,
                  reorderPoint: 0,
                  createdAt: now,
                  updatedAt: now,
                  createdBy: actorEmail,
                  updatedBy: actorEmail
                });
                
                outputStockResult = {
                  materialCode: outputCode,
                  materialName: node.name || outputCode,
                  addedQuantity: actualOutput,
                  previousStock: 0,
                  newStock: actualOutput,
                  unit: 'adet',
                  created: true
                };
                
                // ========================================================================
                // STOCK MOVEMENTS: Record new material creation + production output
                // ========================================================================
                const newMaterialMovementRef = db.collection('stockMovements').doc();
                transaction.set(newMaterialMovementRef, {
                  materialId: outputCode,
                  materialCode: outputCode,
                  materialName: node.name || outputCode,
                  type: 'in',
                  subType: 'production_output_new_material',
                  quantity: actualOutput,
                  unit: 'adet',
                  stockBefore: 0,
                  stockAfter: actualOutput,
                  actualOutput: actualOutput,
                  defectQuantity: defects,
                  plannedOutput: plannedOutputQty,
                  unitCost: null,
                  totalCost: null,
                  currency: 'TRY',
                  reference: assignmentId,
                  referenceType: 'mes_task_complete',
                  relatedPlanId: planId,
                  relatedNodeId: nodeId,
                  warehouse: null,
                  location: 'Production Output',
                  notes: `Yeni WIP malzemesi oluşturuldu ve ${actualOutput} adet üretildi${defects > 0 ? ` (Fire: ${defects})` : ''}`,
                  reason: 'MES görev tamamlama - Yeni WIP malzeme + Üretim çıktısı',
                  movementDate: now,
                  createdAt: now,
                  userId: actorEmail,
                  userName: actorName || actorEmail,
                  approved: true,
                  approvedBy: actorEmail,
                  approvedAt: now
                });
                
                console.log(`✅ Created output material ${outputCode} with initial stock ${actualOutput}`);
              }
              
            } catch (err) {
              console.error(`❌ Failed to update output material ${outputCode}:`, err);
            }
          } else {
            console.log(`ℹ️ No output material to add to stock (outputCode: ${outputCode}, actualOutput: ${actualOutput})`);
          }
          
          // ========================================================================
          // STEP 5: Record Material Movements in Assignment
          // ========================================================================
          
          updateData.materialMovements = {
            inputConsumption: consumptionResults,
            inputStockAdjustments: stockAdjustmentResults,
            outputStockUpdate: outputStockResult,
            timestamp: now,
            completedBy: actorEmail
          };
          
          console.log(`✅ Comprehensive completion processing finished for ${assignmentId}`);
          console.log(`   - Input materials adjusted: ${stockAdjustmentResults.length}`);
          console.log(`   - Output material updated: ${outputStockResult ? 'Yes' : 'No'}`);
          console.log(`   - Total output: ${actualOutput}, Defects: ${defects}`);
          
          // Clear worker currentTask
          if (workerRef) {
            workerUpdate = {
              currentTask: null,
              updatedAt: now
            };
          }
          
          // Clear station currentOperation
          if (stationRef) {
            stationUpdate = {
              currentOperation: null,
              updatedAt: now
            };
          }
          break;
      }
      
      // Apply updates
      transaction.update(assignmentRef, updateData);
      
      if (workerRef && workerUpdate) {
        transaction.update(workerRef, workerUpdate);
      }
      
      if (stationRef && stationUpdate) {
        transaction.update(stationRef, stationUpdate);
      }
      
      return {
        success: true,
        workPackageId: assignmentId,
        action,
        status: updateData.status,
        alertCreated,
        scrapAdjustment,
        materialReservation: materialReservationResult,
        materialMovements: updateData.materialMovements || null,
        updatedAt: now.toISOString()
      };
    });
    
    return result;
  }, res);
});

// ============================================================================
// ALERTS ROUTES
// ============================================================================

// GET /api/mes/alerts - Get alerts with optional filtering
router.get('/alerts', withAuth, async (req, res) => {
  try {
    const { type, status, limit } = req.query;
    
    const db = getFirestore();
    
    // Check if collection exists by attempting a simple query
    let query = db.collection('mes-alerts');
    
    // Apply filters
    if (type) {
      query = query.where('type', '==', type);
    }
    
    if (status) {
      query = query.where('status', '==', status);
    }
    
    // Order by most recent
    try {
      query = query.orderBy('createdAt', 'desc');
    } catch (err) {
      // If orderBy fails (e.g., missing index), skip ordering
      console.warn('Alert ordering failed, returning unordered results:', err.message);
    }
    
    // Apply limit
    if (limit) {
      const limitNum = parseInt(limit, 10);
      if (!isNaN(limitNum) && limitNum > 0) {
        query = query.limit(limitNum);
      }
    }
    
    // Execute query with error handling
    let snapshot;
    try {
      snapshot = await query.get();
    } catch (err) {
      console.error('Failed to query alerts collection:', err);
      return res.status(500).json({ 
        code: 'alerts_load_failed', 
        message: `Failed to load alerts: ${err.message}`,
        alerts: [] // Return empty array as fallback
      });
    }
    
    // Handle empty collection
    if (snapshot.empty) {
      return res.status(200).json({ alerts: [] });
    }
    
    const alerts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || doc.data().createdAt
    }));
    
    return res.status(200).json({ alerts });
  } catch (err) {
    console.error('Unexpected error in alerts endpoint:', err);
    return res.status(500).json({ 
      code: 'alerts_load_failed', 
      message: `Unexpected error: ${err.message}`,
      alerts: []
    });
  }
});

// ============================================================================
// SUB-STATIONS ROUTES
// ============================================================================

// GET /api/mes/substations - Get substations with optional filtering
router.get('/substations', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { stationId } = req.query;
    
    const db = getFirestore();
    let query = db.collection('mes-substations');
    
    if (stationId) {
      query = query.where('stationId', '==', stationId);
    }
    
    const snapshot = await query.orderBy('code').get();
    const substations = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return { substations };
  }, res);
});

// PATCH /api/mes/substations/:id - Update substation status
router.patch('/substations/:id', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params;
    const updates = req.body;
    
    const db = getFirestore();
    
    // Verify substation exists
    const substationDoc = await db.collection('mes-substations').doc(id).get();
    if (!substationDoc.exists) {
      throw new Error('Substation not found');
    }

    const now = new Date();
    const updatedBy = req.user?.email || 'system';
    
    await db.collection('mes-substations').doc(id).update({
      ...updates,
      updatedAt: now,
      updatedBy
    });

    return { success: true, id, updatedAt: now.toISOString() };
  }, res);
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
 */
router.post('/production-plans/:planId/launch', withAuth, async (req, res) => {
  const { planId } = req.params;
  const { workOrderCode } = req.body;
  
  try {
    const db = getFirestore();
    const userEmail = req.user?.email || 'system';
    
    // ========================================================================
    // 1. INPUT VALIDATION
    // ========================================================================
    
    if (!planId || !workOrderCode) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'planId and workOrderCode are required'
      });
    }
    
    // Fetch plan document
    const planRef = db.collection('mes-production-plans').doc(planId);
    const planSnap = await planRef.get();
    
    if (!planSnap.exists) {
      return res.status(404).json({
        error: 'plan_not_found',
        message: `Production plan ${planId} not found`
      });
    }
    
    const planData = planSnap.data();
    
    // Check if plan is already launched
    if (planData.launchStatus === 'launched') {
      return res.status(409).json({
        error: 'already_launched',
        message: 'This plan has already been launched',
        launchedAt: planData.launchedAt,
        launchedBy: planData.launchedBy
      });
    }
    
    // Check if plan is cancelled
    if (planData.status === 'cancelled') {
      return res.status(422).json({
        error: 'plan_cancelled',
        message: 'Cannot launch a cancelled plan'
      });
    }
    
    // Validate plan status is 'production'
    if (planData.status !== 'production') {
      return res.status(422).json({
        error: 'invalid_status',
        message: `Plan status must be 'production', got '${planData.status}'`
      });
    }
    
    // Fetch approved quote
    const quotesSnapshot = await db.collection('mes-approved-quotes')
      .where('workOrderCode', '==', workOrderCode)
      .limit(1)
      .get();
    
    if (quotesSnapshot.empty) {
      return res.status(404).json({
        error: 'approved_quote_not_found',
        message: `${workOrderCode} için onaylı teklif bulunamadı. Önce quote'u Approved Quotes listesine ekleyin.`,
        workOrderCode
      });
    }
    
    const quoteDoc = quotesSnapshot.docs[0];
    const quoteData = quoteDoc.data();
    
    // ========================================================================
    // 2. LOAD PLAN NODES AND BUILD EXECUTION GRAPH
    // ========================================================================
    
    const nodes = planData.nodes || [];
    if (nodes.length === 0) {
      return res.status(422).json({
        error: 'empty_plan',
        message: 'Cannot launch plan with no operations'
      });
    }
    
    // Build execution order using topological sort
    const executionOrder = buildTopologicalOrder(nodes);
    
    if (executionOrder.error) {
      return res.status(400).json({
        error: 'execution_graph_error',
        message: executionOrder.error,
        details: executionOrder.details
      });
    }
    
    // ========================================================================
    // 3. LOAD LIVE DATA FOR ASSIGNMENT ENGINE
    // ========================================================================
    
    // First, get all workers to check their status values
    const allWorkersSnapshot = await db.collection('mes-workers').get();
    const allWorkers = allWorkersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log(`📊 Total workers in DB: ${allWorkers.length}`);
    if (allWorkers.length > 0) {
      console.log(`📊 Sample worker statuses:`, allWorkers.slice(0, 3).map(w => ({ name: w.name, status: w.status })));
    }
    
    // Load all workers/stations/substations, but don't rely on a specific string value
    // for the worker status at query time (some records may use different conventions).
    const [workersSnapshot, stationsSnapshot, substationsSnapshot] = await Promise.all([
      db.collection('mes-workers').get(),
      db.collection('mes-stations').where('status', '==', 'active').get(),
      db.collection('mes-substations').where('status', '==', 'active').get()
    ]);

    const rawWorkers = workersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const stations = stationsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const substations = substationsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Normalize worker status and filter out workers that cannot be auto-assigned.
    // New status enum: 'available', 'busy', 'break', 'inactive'
    const nowIso = new Date().toISOString();
    function isOnLeave(w) {
      // Support several possible field shapes for backwards compatibility
      const leaveStart = w.leaveStart || (w.leave && w.leave.start) || null;
      const leaveEnd = w.leaveEnd || (w.leave && w.leave.end) || null;
      if (!leaveStart || !leaveEnd) return false;
      try {
        const s = new Date(leaveStart).toISOString();
        const e = new Date(leaveEnd).toISOString();
        return s <= nowIso && nowIso <= e;
      } catch (err) {
        return false;
      }
    }

    const workers = rawWorkers.map(w => {
      const copy = { ...w };
      // Provide default status = 'available' for older records
      copy.status = (copy.status || copy.availability || 'available').toString();
      // Normalize some common legacy values
      if (/active/i.test(copy.status)) copy.status = 'available';
      if (/enabled|on/i.test(copy.status)) copy.status = 'available';
      if (/off|inactive|removed/i.test(copy.status)) copy.status = 'inactive';
      if (/break|paused|rest/i.test(copy.status)) copy.status = 'break';
      if (/busy|working/i.test(copy.status)) copy.status = 'busy';
      // Attach computed onLeave flag
      copy.onLeave = isOnLeave(copy);
      return copy;
    });

    // Only workers with status 'available' or 'busy' and not on leave are eligible for auto-assignment
    const eligibleWorkers = workers.filter(w => (w.status === 'available' || w.status === 'busy') && !w.onLeave);

    console.log(`✅ Total workers in DB: ${rawWorkers.length}`);
    console.log(`✅ Eligible workers for assignment: ${eligibleWorkers.length}`);

    if (eligibleWorkers.length === 0) {
      // Provide helpful debug info in the response to aid troubleshooting
      return res.status(422).json({
        error: 'no_workers',
        message: 'No eligible workers available for assignment. Check worker.status and leave windows.',
        totalWorkers: rawWorkers.length,
        sample: workers.slice(0, 10).map(w => ({ id: w.id, name: w.name, status: w.status, onLeave: w.onLeave }))
      });
    }
    
    if (stations.length === 0) {
      return res.status(422).json({
        error: 'no_stations',
        message: 'No active stations available for assignment'
      });
    }
    
    // ========================================================================
    // 4. MATERIAL VALIDATION (NON-BLOCKING - WARNINGS ONLY)
    // ========================================================================
    
    const planQuantity = planData.quantity || 1;
    const materialValidation = await validateMaterialAvailabilityForLaunch(
      planData,
      planQuantity,
      db
    );
    
    // Material shortages are now warnings, not errors
    // Store warnings in response but continue with launch
    const materialWarnings = materialValidation.warnings || [];
    
    if (materialWarnings.length > 0) {
      console.warn(`⚠️ Material shortages detected (${materialWarnings.length} items) - proceeding with launch`);
    }
    
    // ========================================================================
    // 5. RUN AUTO-ASSIGNMENT ENGINE FOR EACH NODE
    // ========================================================================
    
    const assignments = [];
    const assignmentErrors = [];
    const assignmentWarnings = [];
    
    // Track assignments in this run to avoid conflicts
    const workerSchedule = new Map(); // workerId -> [{ start, end }]
    const stationSchedule = new Map(); // stationId -> [{ start, end }]
    const nodeEndTimes = new Map(); // nodeId -> plannedEnd timestamp (for dependency tracking)
    
    // Process nodes in topological order
    for (const nodeId of executionOrder.order) {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) {
        assignmentErrors.push({
          nodeId,
          error: 'node_not_found',
          message: `Node ${nodeId} referenced in execution order but not found in plan`
        });
        continue;
      }
      
      try {
        const assignment = await assignNodeResources(
          node,
          eligibleWorkers,
          stations,
          substations,
          workerSchedule,
          stationSchedule,
          planData,
          nodeEndTimes // Pass predecessor tracking map
        );
        
        if (assignment.error) {
          assignmentErrors.push({
            nodeId: node.id,
            nodeName: node.name,
            error: assignment.error,
            message: assignment.message,
            details: assignment.details
          });
        } else {
          assignments.push(assignment);
          
          // Track node end time for successor dependencies
          nodeEndTimes.set(node.id, new Date(assignment.plannedEnd));
          
          // Track warnings
          if (assignment.warnings && assignment.warnings.length > 0) {
            assignmentWarnings.push({
              nodeId: node.id,
              nodeName: node.name,
              warnings: assignment.warnings
            });
          }
          
          // Update schedules to avoid conflicts
          const workerId = assignment.workerId;
          const stationId = assignment.stationId;
          
          if (!workerSchedule.has(workerId)) {
            workerSchedule.set(workerId, []);
          }
          workerSchedule.get(workerId).push({
            start: new Date(assignment.plannedStart),
            end: new Date(assignment.plannedEnd)
          });
          
          if (!stationSchedule.has(stationId)) {
            stationSchedule.set(stationId, []);
          }
          stationSchedule.get(stationId).push({
            start: new Date(assignment.plannedStart),
            end: new Date(assignment.plannedEnd)
          });
        }
      } catch (error) {
        assignmentErrors.push({
          nodeId: node.id,
          nodeName: node.name,
          error: 'assignment_exception',
          message: error.message
        });
      }
    }
    
    // If any node failed assignment, abort
    if (assignmentErrors.length > 0) {
      return res.status(422).json({
        error: 'assignment_failed',
        message: `Failed to assign resources for ${assignmentErrors.length} operation(s)`,
        errors: assignmentErrors,
        warnings: assignmentWarnings
      });
    }
    
    // ========================================================================
    // 6. CREATE WORKER ASSIGNMENTS IN BATCH
    // ========================================================================
    
    const batch = db.batch();
    const now = new Date();
    const assignmentIds = [];
    
    // Delete any stray assignments for this plan/WO (cleanup)
    const existingAssignments = await db.collection('mes-worker-assignments')
      .where('planId', '==', planId)
      .where('workOrderCode', '==', workOrderCode)
      .get();
    
    existingAssignments.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // Create new assignments
    assignments.forEach(assignment => {
      const assignmentRef = db.collection('mes-worker-assignments').doc();
      assignmentIds.push(assignmentRef.id);
      
      batch.set(assignmentRef, {
        ...assignment,
        planId,
        workOrderCode,
        createdAt: now,
        createdBy: userEmail,
        updatedAt: now
      });
    });
    
    // Update plan document with launch status
    batch.update(planRef, {
      launchStatus: 'launched',
      launchedAt: now,
      launchedBy: userEmail,
      assignmentCount: assignments.length,
      lastLaunchShortage: admin.firestore.FieldValue.delete(), // Clear any previous shortage
      updatedAt: now
    });
    
    // Update approved quote production state
    batch.update(quoteDoc.ref, {
      productionState: 'Üretiliyor',
      productionStateUpdatedAt: now,
      productionStateUpdatedBy: userEmail
    });
    
    // Commit all changes atomically
    await batch.commit();
    
    // ========================================================================
    // 7. EMIT EVENT FOR FRONTEND REFRESH
    // ========================================================================
    
    // Note: In a production setup, you would use Server-Sent Events, WebSocket,
    // or a pub/sub mechanism. For now, frontend will poll or check on navigation.
    console.log(`✓ Plan ${planId} launched with ${assignments.length} assignments`);
    
    // ========================================================================
    // 8. RETURN SUCCESS RESPONSE (with material warnings if any)
    // ========================================================================
    
    const response = {
      success: true,
      planId,
      workOrderCode,
      assignmentCount: assignments.length,
      assignmentIds,
      warnings: assignmentWarnings.length > 0 ? assignmentWarnings : undefined,
      launchedAt: now.toISOString(),
      launchedBy: userEmail,
      message: `Plan launched successfully with ${assignments.length} assignments`
    };
    
    // Add material warnings to response if any
    if (materialWarnings.length > 0) {
      response.warnings = {
        materialShortages: materialWarnings,
        assignmentWarnings: assignmentWarnings.length > 0 ? assignmentWarnings : undefined
      };
    }
    
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('Launch plan error:', error);
    
    // Check for specific error types
    if (error.status) {
      return res.status(error.status).json({
        error: error.code || 'launch_error',
        message: error.message
      });
    }
    
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to launch production plan',
      details: error.message
    });
  }
});

// ============================================================================
// HELPER FUNCTIONS FOR LAUNCH ENDPOINT
// ============================================================================

/**
 * Build topological order from node predecessors
 * Detects cycles and validates prerequisites
 */
function buildTopologicalOrder(nodes) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const inDegree = new Map();
  const adjacencyList = new Map();
  
  // Initialize
  nodes.forEach(node => {
    inDegree.set(node.id, 0);
    adjacencyList.set(node.id, []);
  });
  
  // Build graph
  nodes.forEach(node => {
    const predecessors = node.predecessors || [];
    
    // Validate all predecessors exist
    for (const predId of predecessors) {
      if (!nodeMap.has(predId)) {
        return {
          error: `Invalid predecessor: Node ${node.id} references non-existent predecessor ${predId}`,
          details: { nodeId: node.id, missingPredecessor: predId }
        };
      }
      
      // Add edge from predecessor to this node
      adjacencyList.get(predId).push(node.id);
      inDegree.set(node.id, inDegree.get(node.id) + 1);
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
  if (order.length !== nodes.length) {
    const remaining = nodes.filter(n => !order.includes(n.id)).map(n => n.id);
    return {
      error: 'Cycle detected in execution graph',
      details: { remainingNodes: remaining }
    };
  }
  
  return { order, success: true };
}

/**
 * Validate material availability for plan launch - NON-BLOCKING
 * Only checks materials for:
 * 1. Start nodes (nodes with no predecessors)
 * 2. Raw materials with codes starting with M-00 (regardless of node position)
 * Returns warnings array instead of throwing errors
 */
async function validateMaterialAvailabilityForLaunch(planData, planQuantity, db) {
  const executionGraph = planData.executionGraph || [];
  const nodes = executionGraph.nodes || [];
  const materialSummary = planData.materialSummary || {};
  const rawMaterials = materialSummary.rawMaterials || [];
  
  if (rawMaterials.length === 0 || nodes.length === 0) {
    return { warnings: [] };
  }
  
  // Build predecessor map to identify start nodes
  const predecessorMap = new Map();
  nodes.forEach(node => {
    predecessorMap.set(node.id, node.predecessors || []);
  });
  
  // Identify start nodes (no predecessors)
  const startNodeIds = new Set(
    nodes.filter(node => !node.predecessors || node.predecessors.length === 0).map(n => n.id)
  );
  
  // Filter materials to check:
  // 1. Materials from start nodes
  // 2. Materials with code starting with M-00 (critical raw materials)
  const materialsToCheck = new Map();
  
  rawMaterials.forEach(mat => {
    if (mat.isDerived) return; // Skip WIP materials
    
    const shouldCheck = 
      (mat.nodeId && startNodeIds.has(mat.nodeId)) || // From start node
      (mat.code && mat.code.startsWith('M-00')); // Critical raw material
    
    if (shouldCheck) {
      const key = mat.code;
      const existing = materialsToCheck.get(key) || { 
        ...mat, 
        required: 0,
        nodeNames: new Set()
      };
      existing.required += (mat.required || 0) * planQuantity;
      if (mat.nodeName) existing.nodeNames.add(mat.nodeName);
      materialsToCheck.set(key, existing);
    }
  });
  
  if (materialsToCheck.size === 0) {
    return { warnings: [] };
  }
  
  // Fetch materials from database
  const materialCodes = Array.from(materialsToCheck.keys());
  const materialDocsPromises = materialCodes.map(code => 
    db.collection('materials').doc(code).get()
  );
  
  const materialDocs = await Promise.all(materialDocsPromises);
  
  // Build lookup map
  const materialMap = new Map();
  materialDocs.forEach((doc, index) => {
    const code = materialCodes[index];
    if (doc.exists) {
      materialMap.set(code, doc.data());
    }
  });
  
  // Check for shortages and build warnings array
  const warnings = [];
  
  for (const [code, mat] of materialsToCheck) {
    const materialData = materialMap.get(code);
    const available = materialData 
      ? parseFloat(materialData.stock || materialData.available) || 0
      : 0;
    const required = mat.required;
    
    if (available < required) {
      const nodeNamesList = Array.from(mat.nodeNames).join(', ');
      warnings.push({
        nodeName: nodeNamesList || 'Unknown',
        materialCode: code,
        materialName: mat.name || code,
        required,
        available,
        shortage: required - available,
        unit: mat.unit || ''
      });
    }
  }
  
  return { warnings };
}

/**
 * Validate material availability for plan launch
 * NOTE: Uses unified 'materials' collection (mes-materials has been removed)
 * DEPRECATED: Use validateMaterialAvailabilityForLaunch instead (non-blocking)
 */
async function validateMaterialAvailability(planData, planQuantity, db) {
  const materialSummary = planData.materialSummary || {};
  const rawMaterials = materialSummary.rawMaterials || [];
  
  if (rawMaterials.length === 0) {
    return { allAvailable: true, shortages: [], details: [] };
  }
  
  // Aggregate materials by code to avoid duplicate lookups
  const aggregated = new Map();
  
  rawMaterials.forEach(mat => {
    if (!mat.code || mat.isDerived) return; // Skip WIP materials (they're produced in the plan)
    
    const key = mat.code;
    const existing = aggregated.get(key) || { ...mat, required: 0 };
    existing.required += (mat.required || 0) * planQuantity;
    aggregated.set(key, existing);
  });
  
  // Fetch all materials in one batch to avoid multiple network calls
  const materialCodes = Array.from(aggregated.keys());
  const materialDocsPromises = materialCodes.map(code => 
    db.collection('materials').doc(code).get()
  );
  
  const materialDocs = await Promise.all(materialDocsPromises);
  
  // Build lookup map from fetched materials
  const materialMap = new Map();
  materialDocs.forEach((doc, index) => {
    const code = materialCodes[index];
    if (doc.exists) {
      materialMap.set(code, doc.data());
    }
  });
  
  // If primary lookup from 'materials' fails, optionally check legacy 'mes-materials' as fallback
  // This provides backward compatibility for any lingering legacy docs
  const missingCodes = materialCodes.filter(code => !materialMap.has(code));
  if (missingCodes.length > 0) {
    console.warn(`Materials not found in primary collection, checking legacy mes-materials: ${missingCodes.join(', ')}`);
    const legacyDocsPromises = missingCodes.map(code =>
      db.collection('mes-materials').doc(code).get().catch(() => null)
    );
    const legacyDocs = await Promise.all(legacyDocsPromises);
    
    legacyDocs.forEach((doc, index) => {
      if (doc && doc.exists) {
        const code = missingCodes[index];
        materialMap.set(code, doc.data());
        console.log(`✓ Found material ${code} in legacy mes-materials collection`);
      }
    });
  }
  
  // Check availability against fetched materials
  const shortages = [];
  const details = [];
  
  for (const [code, mat] of aggregated) {
    try {
      const materialData = materialMap.get(code);
      
      if (!materialData) {
        shortages.push({
          code,
          name: mat.name || code,
          required: mat.required,
          unit: mat.unit || '',
          available: 0,
          shortage: mat.required,
          message: 'Material not found in inventory'
        });
        continue;
      }
      
      // Use 'stock' field for availability (standard in materials collection)
      // Also check 'available' field for backward compatibility
      const available = parseFloat(materialData.stock || materialData.available) || 0;
      const required = mat.required;
      
      // Use material data from DB as source of truth for name/unit
      const materialName = materialData.name || mat.name || code;
      const materialUnit = materialData.unit || mat.unit || '';
      
      details.push({
        code,
        name: materialName,
        required,
        available,
        unit: materialUnit,
        isOk: available >= required
      });
      
      if (available < required) {
        shortages.push({
          code,
          name: materialName,
          required,
          available,
          shortage: required - available,
          unit: materialUnit
        });
      }
    } catch (error) {
      console.error(`Error checking material ${code}:`, error);
      shortages.push({
        code,
        name: mat.name || code,
        required: mat.required,
        unit: mat.unit || '',
        available: 0,
        shortage: mat.required,
        message: `Error checking availability: ${error.message}`
      });
    }
  }
  
  return {
    allAvailable: shortages.length === 0,
    shortages,
    details
  };
}

/**
 * Assign worker, station, and substation to a node using auto-assignment rules
 * Now respects predecessor dependencies for scheduling
 */
async function assignNodeResources(
  node,
  workers,
  stations,
  substations,
  workerSchedule,
  stationSchedule,
  planData,
  nodeEndTimes = new Map() // Track when predecessor nodes finish
) {
  const requiredSkills = node.requiredSkills || [];
  const preferredStationIds = node.preferredStationIds || [];
  const preferredStationTags = node.preferredStationTags || [];
  const legacyPreferredStations = node.preferredStations || []; // For backward compatibility
  const allocationType = node.allocationType || 'auto';
  const workerHint = node.workerHint || null;
  const nominalTime = parseFloat(node.time) || 60; // minutes
  
  // ========================================================================
  // WORKER SELECTION
  // ========================================================================
  
  let selectedWorker = null;
  
  if (allocationType === 'manual' && workerHint && workerHint.workerId) {
    // Manual allocation with worker ID hint
    selectedWorker = workers.find(w => w.id === workerHint.workerId);
    
    if (!selectedWorker) {
      // Fallback to auto if hint not found
      console.warn(`Worker hint ${workerHint.workerId} not found, falling back to auto`);
    }
  }
  
  if (!selectedWorker && requiredSkills.length > 0) {
    // Auto selection: find workers with matching skills
    const candidates = workers.filter(w => {
      const workerSkills = w.skills || [];
      return requiredSkills.every(skill => workerSkills.includes(skill));
    });
    
    if (candidates.length === 0) {
      return {
        error: 'no_qualified_workers',
        message: `No workers found with required skills: ${requiredSkills.join(', ')}`,
        details: { requiredSkills }
      };
    }
    
    // Sort by workload (fewest assignments first) and efficiency
    const candidatesWithLoad = candidates.map(w => ({
      worker: w,
      load: (workerSchedule.get(w.id) || []).length,
      efficiency: w.efficiency || 1.0
    }));
    
    candidatesWithLoad.sort((a, b) => {
      // Prefer less loaded workers
      if (a.load !== b.load) return a.load - b.load;
      // Then prefer higher efficiency
      return b.efficiency - a.efficiency;
    });
    
    selectedWorker = candidatesWithLoad[0].worker;
  } else if (!selectedWorker) {
    // No skills required, pick any worker
    const candidatesWithLoad = workers.map(w => ({
      worker: w,
      load: (workerSchedule.get(w.id) || []).length
    }));
    
    candidatesWithLoad.sort((a, b) => a.load - b.load);
    selectedWorker = candidatesWithLoad[0].worker;
  }
  
  if (!selectedWorker) {
    return {
      error: 'no_worker_available',
      message: 'No worker available for assignment'
    };
  }
  
  // ========================================================================
  // STATION SELECTION
  // ========================================================================
  
  let selectedStation = null;
  
  // Priority 1: Try to match preferred station IDs (exact match)
  if (preferredStationIds.length > 0) {
    for (const stationId of preferredStationIds) {
      const station = stations.find(s => s.id === stationId);
      if (station) {
        selectedStation = station;
        console.log(`Matched station by ID: ${station.name} (${station.id})`);
        break;
      }
    }
  }
  
  // Priority 2: Try to match capability tags (tag-based matching)
  if (!selectedStation && preferredStationTags.length > 0) {
    for (const tag of preferredStationTags) {
      const station = stations.find(s => 
        s.tags && s.tags.some(t => t.toLowerCase() === tag.toLowerCase())
      );
      if (station) {
        selectedStation = station;
        console.log(`Matched station by tag "${tag}": ${station.name} (${station.id})`);
        break;
      }
    }
  }
  
  // Priority 3: Legacy fallback - try to match by ID, name, or tag from legacy field
  if (!selectedStation && legacyPreferredStations.length > 0) {
    for (const pref of legacyPreferredStations) {
      const station = stations.find(s => 
        s.id === pref || 
        s.name === pref || 
        (s.tags && s.tags.includes(pref))
      );
      if (station) {
        selectedStation = station;
        console.log(`Matched station by legacy preference: ${station.name} (${station.id})`);
        break;
      }
    }
  }
  
  // Priority 4: Try to match by operation type
  if (!selectedStation && node.type) {
    selectedStation = stations.find(s => s.type === node.type);
    if (selectedStation) {
      console.log(`Matched station by operation type "${node.type}": ${selectedStation.name}`);
    }
  }
  
  // Priority 5: Pick station with least load
  if (!selectedStation) {
    const stationsWithLoad = stations.map(s => ({
      station: s,
      load: (stationSchedule.get(s.id) || []).length
    }));
    
    stationsWithLoad.sort((a, b) => a.load - b.load);
    selectedStation = stationsWithLoad[0].station;
    
    if (selectedStation) {
      console.log(`Matched station by least load: ${selectedStation.name} (${selectedStation.id})`);
    }
  }
  
  if (!selectedStation) {
    return {
      error: 'no_station_available',
      message: 'No station available for assignment'
    };
  }
  
  // ========================================================================
  // SUBSTATION SELECTION
  // ========================================================================
  
  let selectedSubstation = null;
  const stationSubstations = substations.filter(sub => sub.stationId === selectedStation.id);
  
  if (stationSubstations.length > 0) {
    // Pick first available substation
    selectedSubstation = stationSubstations[0];
  }
  
  // ========================================================================
  // TIME CALCULATION WITH DEPENDENCY TRACKING
  // ========================================================================
  
  // Calculate effective time based on worker and station efficiency
  const workerEfficiency = selectedWorker.efficiency || 1.0;
  const stationEfficiency = selectedStation.efficiency || 1.0;
  const combinedEfficiency = workerEfficiency * stationEfficiency;
  const effectiveTime = combinedEfficiency > 0 ? nominalTime / combinedEfficiency : nominalTime;
  
  // Find next available time slot for this worker
  const workerAssignments = workerSchedule.get(selectedWorker.id) || [];
  const stationAssignments = stationSchedule.get(selectedStation.id) || [];
  const now = new Date();
  
  // Calculate earliest start time based on multiple constraints:
  // 1. Worker availability (after their last assignment)
  // 2. Station availability (after station's last assignment)
  // 3. Predecessor dependencies (after all predecessors finish)
  
  let earliestWorkerStart = now;
  if (workerAssignments.length > 0) {
    const lastWorkerEnd = workerAssignments[workerAssignments.length - 1].end;
    if (lastWorkerEnd > earliestWorkerStart) {
      earliestWorkerStart = lastWorkerEnd;
    }
  }
  
  let earliestStationStart = now;
  if (stationAssignments.length > 0) {
    const lastStationEnd = stationAssignments[stationAssignments.length - 1].end;
    if (lastStationEnd > earliestStationStart) {
      earliestStationStart = lastStationEnd;
    }
  }
  
  // Check predecessor dependencies
  let earliestPredecessorEnd = now;
  const predecessors = node.predecessors || [];
  if (predecessors.length > 0) {
    for (const predId of predecessors) {
      const predEnd = nodeEndTimes.get(predId);
      if (predEnd && predEnd > earliestPredecessorEnd) {
        earliestPredecessorEnd = predEnd;
      }
    }
  }
  
  // Start time is the maximum of all constraints
  const startTime = new Date(Math.max(
    earliestWorkerStart.getTime(),
    earliestStationStart.getTime(),
    earliestPredecessorEnd.getTime()
  ));
  
  const endTime = new Date(startTime.getTime() + effectiveTime * 60000);
  
  // ========================================================================
  // BUILD ASSIGNMENT
  // ========================================================================
  
  const warnings = [];
  
  // Check if outside worker schedule (if defined)
  if (selectedWorker.personalSchedule && selectedWorker.personalSchedule.blocks) {
    const dayName = startTime.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const dayBlocks = selectedWorker.personalSchedule.blocks[dayName] || [];
    
    if (dayBlocks.length > 0) {
      const hour = startTime.getHours();
      const minute = startTime.getMinutes();
      const timeMinutes = hour * 60 + minute;
      
      const withinSchedule = dayBlocks.some(block => {
        if (!block.start || !block.end) return false;
        const [startHour, startMin] = block.start.split(':').map(Number);
        const [endHour, endMin] = block.end.split(':').map(Number);
        const blockStart = startHour * 60 + startMin;
        const blockEnd = endHour * 60 + endMin;
        return timeMinutes >= blockStart && timeMinutes <= blockEnd;
      });
      
      if (!withinSchedule) {
        warnings.push('Assignment is outside worker\'s scheduled hours');
      }
    }
  }
  
  return {
    nodeId: node.id,
    nodeName: node.name,
    operationId: node.operationId,
    workerId: selectedWorker.id,
    workerName: selectedWorker.name,
    stationId: selectedStation.id,
    stationName: selectedStation.name,
    subStationCode: selectedSubstation ? selectedSubstation.id : null,
    plannedStart: startTime.toISOString(),
    plannedEnd: endTime.toISOString(),
    nominalTime,
    effectiveTime,
    status: 'pending',
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

// ============================================================================
// PRODUCTION PLAN CONTROL ENDPOINTS (PAUSE/RESUME/CANCEL)
// ============================================================================

/**
 * POST /api/mes/production-plans/:planId/pause
 * Pause all assignments for a production plan
 * - Sets all assignment statuses to 'paused'
 * - Preserves actualStart for in-progress tasks
 * - Clears worker.currentTask and station.currentOperation
 */
router.post('/production-plans/:planId/pause', withAuth, async (req, res) => {
  const { planId } = req.params;
  
  try {
    const db = getFirestore();
    const userEmail = req.user?.email || 'system';
    const now = new Date();
    
    // Fetch plan
    const planRef = db.collection('mes-production-plans').doc(planId);
    const planSnap = await planRef.get();
    
    if (!planSnap.exists) {
      return res.status(404).json({
        error: 'plan_not_found',
        message: `Production plan ${planId} not found`
      });
    }
    
    const planData = planSnap.data();
    
    // Check if plan is launched
    if (planData.launchStatus !== 'launched') {
      return res.status(422).json({
        error: 'not_launched',
        message: 'Cannot pause a plan that has not been launched'
      });
    }
    
    // Check if already paused
    if (planData.launchStatus === 'paused') {
      return res.status(409).json({
        error: 'already_paused',
        message: 'Plan is already paused'
      });
    }
    
    // Fetch all assignments for this plan
    const assignmentsSnapshot = await db.collection('mes-worker-assignments')
      .where('planId', '==', planId)
      .get();
    
    if (assignmentsSnapshot.empty) {
      return res.status(404).json({
        error: 'no_assignments',
        message: 'No assignments found for this plan'
      });
    }
    
    // Collect unique workers and stations to update
    const workersToUpdate = new Set();
    const stationsToUpdate = new Set();
    
    const batch = db.batch();
    let pausedCount = 0;
    let alreadyCompleteCount = 0;
    
    // Update all assignments
    assignmentsSnapshot.docs.forEach(doc => {
      const assignment = doc.data();
      
      // Skip if already completed or cancelled
      if (assignment.status === 'completed' || assignment.status === 'cancelled') {
        alreadyCompleteCount++;
        return;
      }
      
      // Pause the assignment, preserve actualStart if it exists
      // Set pauseContext='plan' to distinguish admin pause from worker pause
      batch.update(doc.ref, {
        status: 'paused',
        pausedAt: now,
        pausedBy: userEmail,
        pausedByName: req.user?.displayName || userEmail,
        pauseContext: 'plan', // Admin-level pause
        pauseReason: 'Admin paused the production plan',
        updatedAt: now
      });
      
      pausedCount++;
      
      // Track resources to clear
      if (assignment.workerId) workersToUpdate.add(assignment.workerId);
      if (assignment.stationId) stationsToUpdate.add(assignment.stationId);
    });
    
    // Clear worker currentTask for affected workers
    for (const workerId of workersToUpdate) {
      const workerRef = db.collection('mes-workers').doc(workerId);
      batch.update(workerRef, {
        currentTask: null,
        currentTaskUpdatedAt: now
      });
    }
    
    // Clear station currentOperation for affected stations
    for (const stationId of stationsToUpdate) {
      const stationRef = db.collection('mes-stations').doc(stationId);
      batch.update(stationRef, {
        currentOperation: null,
        currentOperationUpdatedAt: now
      });
    }
    
    // Update plan status
    batch.update(planRef, {
      launchStatus: 'paused',
      pausedAt: now,
      pausedBy: userEmail,
      updatedAt: now
    });
    
    // Commit all changes
    await batch.commit();
    
    // Update approved quote productionState to 'Üretim Durduruldu'
    if (planData.orderCode) {
      await updateApprovedQuoteProductionState(
        planData.orderCode,
        'Üretim Durduruldu',
        userEmail
      );
    }
    
    return res.status(200).json({
      success: true,
      planId,
      pausedCount,
      alreadyCompleteCount,
      workersCleared: workersToUpdate.size,
      stationsCleared: stationsToUpdate.size,
      pausedAt: now.toISOString(),
      pausedBy: userEmail,
      message: `Plan paused: ${pausedCount} assignment(s) paused, ${alreadyCompleteCount} already complete`
    });
    
  } catch (error) {
    console.error('Pause plan error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to pause production plan',
      details: error.message
    });
  }
});

/**
 * POST /api/mes/production-plans/:planId/resume
 * Resume all paused assignments for a production plan
 * - Sets paused assignments back to 'ready' or 'pending'
 * - If actualStart exists, set to 'in-progress'
 * - Does NOT automatically assign to workers/stations (worker portal handles that)
 */
router.post('/production-plans/:planId/resume', withAuth, async (req, res) => {
  const { planId } = req.params;
  
  try {
    const db = getFirestore();
    const userEmail = req.user?.email || 'system';
    const now = new Date();
    
    // Fetch plan
    const planRef = db.collection('mes-production-plans').doc(planId);
    const planSnap = await planRef.get();
    
    if (!planSnap.exists) {
      return res.status(404).json({
        error: 'plan_not_found',
        message: `Production plan ${planId} not found`
      });
    }
    
    const planData = planSnap.data();
    
    // Check if plan is paused
    if (planData.launchStatus !== 'paused') {
      return res.status(422).json({
        error: 'not_paused',
        message: 'Cannot resume a plan that is not paused'
      });
    }
    
    // Fetch all paused assignments for this plan
    const assignmentsSnapshot = await db.collection('mes-worker-assignments')
      .where('planId', '==', planId)
      .where('status', '==', 'paused')
      .get();
    
    const batch = db.batch();
    let resumedCount = 0;
    let skippedWorkerPauseCount = 0;
    
    // Update paused assignments (only those paused by admin)
    assignmentsSnapshot.docs.forEach(doc => {
      const assignment = doc.data();
      
      // Skip assignments paused by worker or station error (not admin plan pause)
      if (assignment.pauseContext && assignment.pauseContext !== 'plan') {
        skippedWorkerPauseCount++;
        return;
      }
      
      // Determine new status based on whether task was started
      let newStatus = 'pending'; // Default: not yet started
      
      if (assignment.actualStart) {
        // Was in progress when paused
        newStatus = 'in-progress';
      }
      
      batch.update(doc.ref, {
        status: newStatus,
        resumedAt: now,
        resumedBy: userEmail,
        updatedAt: now,
        // Clear pause metadata
        pauseContext: admin.firestore.FieldValue.delete(),
        pauseReason: admin.firestore.FieldValue.delete(),
        pausedAt: admin.firestore.FieldValue.delete(),
        pausedBy: admin.firestore.FieldValue.delete(),
        pausedByName: admin.firestore.FieldValue.delete()
      });
      
      resumedCount++;
    });
    
    // Update plan status back to launched
    batch.update(planRef, {
      launchStatus: 'launched',
      resumedAt: now,
      resumedBy: userEmail,
      updatedAt: now
    });
    
    // Commit all changes
    await batch.commit();
    
    // Update approved quote productionState to 'Üretiliyor'
    if (planData.orderCode) {
      await updateApprovedQuoteProductionState(
        planData.orderCode,
        'Üretiliyor',
        userEmail
      );
    }
    
    return res.status(200).json({
      success: true,
      planId,
      resumedCount,
      skippedWorkerPauseCount,
      resumedAt: now.toISOString(),
      resumedBy: userEmail,
      message: `Plan resumed: ${resumedCount} assignment(s) resumed, ${skippedWorkerPauseCount} worker-paused assignment(s) skipped`
    });
    
  } catch (error) {
    console.error('Resume plan error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to resume production plan',
      details: error.message
    });
  }
});

/**
 * POST /api/mes/production-plans/:planId/cancel
 * Cancel all assignments for a production plan
 * - Sets all non-completed assignments to 'cancelled'
 * - Marks plan launchStatus as 'cancelled'
 * - Clears worker.currentTask and station.currentOperation
 * - Updates approved quote productionState to 'İptal Edildi'
 */
router.post('/production-plans/:planId/cancel', withAuth, async (req, res) => {
  const { planId } = req.params;
  
  try {
    const db = getFirestore();
    const userEmail = req.user?.email || 'system';
    const now = new Date();
    
    // Fetch plan
    const planRef = db.collection('mes-production-plans').doc(planId);
    const planSnap = await planRef.get();
    
    if (!planSnap.exists) {
      return res.status(404).json({
        error: 'plan_not_found',
        message: `Production plan ${planId} not found`
      });
    }
    
    const planData = planSnap.data();
    const workOrderCode = planData.orderCode;
    
    // Check if plan is already cancelled
    if (planData.launchStatus === 'cancelled') {
      return res.status(409).json({
        error: 'already_cancelled',
        message: 'Plan is already cancelled'
      });
    }
    
    // Fetch all assignments for this plan
    const assignmentsSnapshot = await db.collection('mes-worker-assignments')
      .where('planId', '==', planId)
      .get();
    
    // Collect unique workers and stations to update
    const workersToUpdate = new Set();
    const stationsToUpdate = new Set();
    
    const batch = db.batch();
    let cancelledCount = 0;
    let pendingReportCount = 0;
    let alreadyCompleteCount = 0;
    
    // Cancel all non-completed assignments
    assignmentsSnapshot.docs.forEach(doc => {
      const assignment = doc.data();
      
      // Skip if already completed
      if (assignment.status === 'completed') {
        alreadyCompleteCount++;
        return;
      }
      
      // Check if task has started (has actualStart or is in_progress)
      const hasStarted = assignment.actualStart || assignment.status === 'in_progress';
      
      if (hasStarted) {
        // Set to cancelled_pending_report to allow scrap reporting
        batch.update(doc.ref, {
          status: 'cancelled_pending_report',
          finishContext: 'cancelled',
          cancelledAt: now,
          cancelledBy: userEmail,
          updatedAt: now
        });
        pendingReportCount++;
      } else {
        // Never started - set to cancelled immediately
        batch.update(doc.ref, {
          status: 'cancelled',
          cancelledAt: now,
          cancelledBy: userEmail,
          updatedAt: now
        });
        cancelledCount++;
      }
      
      // Track resources to clear (only for tasks that weren't started)
      if (!hasStarted) {
        if (assignment.workerId) workersToUpdate.add(assignment.workerId);
        if (assignment.stationId) stationsToUpdate.add(assignment.stationId);
      }
    });
    
    // Clear worker currentTask for affected workers
    for (const workerId of workersToUpdate) {
      const workerRef = db.collection('mes-workers').doc(workerId);
      batch.update(workerRef, {
        currentTask: null,
        currentTaskUpdatedAt: now
      });
    }
    
    // Clear station currentOperation for affected stations
    for (const stationId of stationsToUpdate) {
      const stationRef = db.collection('mes-stations').doc(stationId);
      batch.update(stationRef, {
        currentOperation: null,
        currentOperationUpdatedAt: now
      });
    }
    
    // Update plan status
    batch.update(planRef, {
      launchStatus: 'cancelled',
      cancelledAt: now,
      cancelledBy: userEmail,
      updatedAt: now
    });
    
    // Update approved quote productionState if workOrderCode exists
    if (workOrderCode) {
      const quotesSnapshot = await db.collection('mes-approved-quotes')
        .where('workOrderCode', '==', workOrderCode)
        .limit(1)
        .get();
      
      if (!quotesSnapshot.empty) {
        const quoteDoc = quotesSnapshot.docs[0];
        batch.update(quoteDoc.ref, {
          productionState: 'İptal Edildi',
          productionStateUpdatedAt: now,
          productionStateUpdatedBy: userEmail
        });
      }
    }
    
    // Commit all changes
    await batch.commit();
    
    return res.status(200).json({
      success: true,
      planId,
      cancelledCount,
      pendingReportCount,
      alreadyCompleteCount,
      workersCleared: workersToUpdate.size,
      stationsCleared: stationsToUpdate.size,
      cancelledAt: now.toISOString(),
      cancelledBy: userEmail,
      message: `Plan cancelled: ${cancelledCount} assignment(s) cancelled immediately, ${pendingReportCount} pending scrap report, ${alreadyCompleteCount} already complete`
    });
    
  } catch (error) {
    console.error('Cancel plan error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to cancel production plan',
      details: error.message
    });
  }
});

/**
 * POST /api/mes/production-plans/:planId/cancel-with-progress
 * Cancel production plan with material accounting for partial completion
 * 
 * This endpoint handles "early completion" when cancelling a production plan.
 * Unlike regular cancel, this properly accounts for materials that were:
 * - Reserved at start (wipReserved)
 * - Actually consumed during production
 * - Produced as good output
 * - Lost as defects
 * 
 * Request body:
 * - actualOutputQuantity: Total good units produced so far
 * - defectQuantity: Total defective/scrap units produced so far
 * 
 * Process (all in single atomic transaction):
 * 1. Aggregate preProductionReservedAmount from all work packages
 * 2. Calculate actual consumption based on total output + defects
 * 3. Release wipReserved and adjust stock for all input materials
 * 4. Add actualOutputQuantity to output material stock
 * 5. Mark plan and all assignments as cancelled
 */
router.post('/production-plans/:planId/cancel-with-progress', withAuth, async (req, res) => {
  const { planId } = req.params;
  const { actualOutputQuantity, defectQuantity } = req.body;
  
  try {
    const db = getFirestore();
    const userEmail = req.user?.email || 'system';
    const userName = req.user?.name || req.user?.userName || null;
    const now = new Date();
    
    console.log(`🔄 Starting cancel-with-progress for plan ${planId}`);
    console.log(`   Actual output: ${actualOutputQuantity}, Defects: ${defectQuantity}`);
    
    // Validate input
    const actualOutput = parseFloat(actualOutputQuantity) || 0;
    const defects = parseFloat(defectQuantity) || 0;
    
    if (actualOutput < 0 || defects < 0) {
      return res.status(400).json({
        error: 'invalid_input',
        message: 'Output and defect quantities cannot be negative'
      });
    }
    
    // Execute everything in a single transaction
    const result = await db.runTransaction(async (transaction) => {
      // ========================================================================
      // STEP 1: Fetch Plan and Validate
      // ========================================================================
      
      const planRef = db.collection('mes-production-plans').doc(planId);
      const planDoc = await transaction.get(planRef);
      
      if (!planDoc.exists) {
        throw new Error(`Production plan ${planId} not found`);
      }
      
      const planData = planDoc.data();
      const workOrderCode = planData.orderCode;
      
      if (planData.launchStatus === 'cancelled') {
        throw new Error('Plan is already cancelled');
      }
      
      const executionGraph = planData.executionGraph || [];
      
      // ========================================================================
      // STEP 2: Fetch All Assignments and Aggregate Reserved Materials
      // ========================================================================
      
      const assignmentsQuery = db.collection('mes-worker-assignments')
        .where('planId', '==', planId);
      const assignmentsSnapshot = await transaction.get(assignmentsQuery);
      
      if (assignmentsSnapshot.empty) {
        throw new Error('No assignments found for this plan');
      }
      
      // Aggregate all reserved materials from all work packages
      const totalReservedMaterials = {}; // { materialCode: totalReservedQty }
      const totalPlannedOutput = {}; // { outputCode: totalPlannedQty }
      const assignments = [];
      
      assignmentsSnapshot.docs.forEach(doc => {
        const assignment = doc.data();
        assignments.push({ id: doc.id, ref: doc.ref, data: assignment });
        
        // Aggregate reserved materials
        if (assignment.preProductionReservedAmount) {
          Object.entries(assignment.preProductionReservedAmount).forEach(([materialCode, qty]) => {
            totalReservedMaterials[materialCode] = 
              (totalReservedMaterials[materialCode] || 0) + (parseFloat(qty) || 0);
          });
        }
        
        // Aggregate planned output
        if (assignment.plannedOutput) {
          Object.entries(assignment.plannedOutput).forEach(([outputCode, qty]) => {
            totalPlannedOutput[outputCode] = 
              (totalPlannedOutput[outputCode] || 0) + (parseFloat(qty) || 0);
          });
        }
      });
      
      console.log(`📦 Total reserved materials:`, totalReservedMaterials);
      console.log(`🎯 Total planned output:`, totalPlannedOutput);
      
      // ========================================================================
      // STEP 3: Calculate Material Consumption
      // ========================================================================
      
      // Get material inputs and outputs from first node (assuming all nodes produce same output)
      const firstNode = executionGraph.length > 0 ? executionGraph[0] : null;
      const materialInputs = firstNode?.materialInputs || [];
      const outputCode = firstNode?.outputCode || Object.keys(totalPlannedOutput)[0];
      const totalPlannedOutputQty = Object.values(totalPlannedOutput)[0] || 0;
      
      const totalConsumedOutput = actualOutput + defects;
      const consumptionResults = [];
      const stockAdjustmentResults = [];
      
      console.log(`🔢 Total consumed (output + defect): ${totalConsumedOutput}`);
      console.log(`📋 Material inputs:`, materialInputs.map(m => `${m.code}: ${m.qty}`));
      
      if (materialInputs.length > 0 && totalPlannedOutputQty > 0) {
        
        for (const materialInput of materialInputs) {
          const inputCode = materialInput.code;
          const requiredInputQtyPerUnit = materialInput.qty || materialInput.required || 0;
          
          if (!inputCode || requiredInputQtyPerUnit <= 0) continue;
          
          // Calculate total required input for the plan
          const totalRequiredInput = requiredInputQtyPerUnit * (totalPlannedOutputQty / (firstNode?.outputQty || 1));
          
          // Calculate input-output ratio
          const inputOutputRatio = totalRequiredInput / totalPlannedOutputQty;
          
          // Calculate actual consumption
          const actualConsumption = totalConsumedOutput * inputOutputRatio;
          
          // Get total reserved amount
          const totalReserved = totalReservedMaterials[inputCode] || 0;
          
          // Calculate stock adjustment
          const stockAdjustment = totalReserved - actualConsumption;
          
          console.log(`
📊 Material: ${inputCode}
   Required per unit: ${requiredInputQtyPerUnit}
   Total planned output: ${totalPlannedOutputQty}
   Input-output ratio: ${inputOutputRatio.toFixed(4)}
   Total reserved: ${totalReserved}
   Actual consumption: ${actualConsumption.toFixed(2)}
   Stock adjustment: ${stockAdjustment >= 0 ? '+' : ''}${stockAdjustment.toFixed(2)}
          `);
          
          consumptionResults.push({
            materialCode: inputCode,
            totalRequiredInput,
            totalPlannedOutputQty,
            inputOutputRatio,
            totalReserved,
            actualConsumption,
            stockAdjustment
          });
        }
        
        // ========================================================================
        // STEP 4: Stock Adjustment for Input Materials
        // ========================================================================
        
        console.log(`🔄 Processing stock adjustments for ${consumptionResults.length} input material(s)`);
        
        for (const consumption of consumptionResults) {
          const { materialCode, totalReserved, actualConsumption, stockAdjustment } = consumption;
          
          try {
            const materialRef = db.collection('materials').doc(materialCode);
            const materialDoc = await transaction.get(materialRef);
            
            if (!materialDoc.exists) {
              console.error(`❌ Material ${materialCode} not found`);
              continue;
            }
            
            const materialData = materialDoc.data();
            const currentStock = parseFloat(materialData.stock) || 0;
            const currentWipReserved = parseFloat(materialData.wipReserved) || 0;
            
            // Release wipReserved
            const newWipReserved = Math.max(0, currentWipReserved - totalReserved);
            
            // Adjust stock
            const newStock = currentStock + stockAdjustment;
            
            transaction.update(materialRef, {
              stock: Math.max(0, newStock),
              wipReserved: newWipReserved,
              updatedAt: now,
              updatedBy: userEmail
            });
            
            stockAdjustmentResults.push({
              materialCode,
              materialName: materialData.name,
              totalReserved,
              actualConsumption,
              stockAdjustment,
              previousStock: currentStock,
              newStock: Math.max(0, newStock),
              previousWipReserved: currentWipReserved,
              newWipReserved,
              unit: materialData.unit
            });
            
            console.log(`✅ ${materialCode}: stock ${currentStock} → ${Math.max(0, newStock)}, wipReserved ${currentWipReserved} → ${newWipReserved}`);
            
          } catch (err) {
            console.error(`❌ Failed to adjust stock for ${materialCode}:`, err);
          }
        }
      }
      
      // ========================================================================
      // STEP 5: Stock Update for Output Material
      // ========================================================================
      
      let outputStockResult = null;
      
      if (outputCode && actualOutput > 0) {
        console.log(`📦 Adding ${actualOutput} units of ${outputCode} to stock`);
        
        try {
          const outputMaterialRef = db.collection('materials').doc(outputCode);
          const outputMaterialDoc = await transaction.get(outputMaterialRef);
          
          if (outputMaterialDoc.exists) {
            const outputMaterialData = outputMaterialDoc.data();
            const currentOutputStock = parseFloat(outputMaterialData.stock) || 0;
            const newOutputStock = currentOutputStock + actualOutput;
            
            transaction.update(outputMaterialRef, {
              stock: newOutputStock,
              updatedAt: now,
              updatedBy: userEmail
            });
            
            outputStockResult = {
              materialCode: outputCode,
              materialName: outputMaterialData.name,
              addedQuantity: actualOutput,
              previousStock: currentOutputStock,
              newStock: newOutputStock,
              unit: outputMaterialData.unit
            };
            
            console.log(`✅ Output ${outputCode}: stock ${currentOutputStock} → ${newOutputStock}`);
          }
        } catch (err) {
          console.error(`❌ Failed to update output material:`, err);
        }
      }
      
      // ========================================================================
      // STEP 6: Cancel All Assignments
      // ========================================================================
      
      const workersToUpdate = new Set();
      const stationsToUpdate = new Set();
      let cancelledCount = 0;
      
      assignments.forEach(({ ref, data: assignment }) => {
        // Mark all assignments as cancelled
        transaction.update(ref, {
          status: 'cancelled',
          cancelledAt: now,
          cancelledBy: userEmail,
          cancelledByName: userName,
          cancelledWithProgress: true,
          actualOutputQuantity: actualOutput,
          defectQuantity: defects,
          updatedAt: now
        });
        
        cancelledCount++;
        
        if (assignment.workerId) workersToUpdate.add(assignment.workerId);
        if (assignment.stationId) stationsToUpdate.add(assignment.stationId);
      });
      
      // Clear worker currentTask
      for (const workerId of workersToUpdate) {
        const workerRef = db.collection('mes-workers').doc(workerId);
        const workerDoc = await transaction.get(workerRef);
        if (workerDoc.exists) {
          transaction.update(workerRef, {
            currentTask: null,
            updatedAt: now
          });
        }
      }
      
      // Clear station currentOperation
      for (const stationId of stationsToUpdate) {
        const stationRef = db.collection('mes-stations').doc(stationId);
        const stationDoc = await transaction.get(stationRef);
        if (stationDoc.exists) {
          transaction.update(stationRef, {
            currentOperation: null,
            updatedAt: now
          });
        }
      }
      
      // ========================================================================
      // STEP 7: Update Plan Status
      // ========================================================================
      
      transaction.update(planRef, {
        launchStatus: 'cancelled',
        cancelledAt: now,
        cancelledBy: userEmail,
        cancelledByName: userName,
        cancelledWithProgress: true,
        cancellationSummary: {
          actualOutputQuantity: actualOutput,
          defectQuantity: defects,
          totalConsumedOutput,
          inputMaterialsAdjusted: stockAdjustmentResults.length,
          outputMaterialUpdated: outputStockResult !== null
        },
        updatedAt: now
      });
      
      // Update approved quote if exists
      if (workOrderCode) {
        const quotesQuery = db.collection('mes-approved-quotes')
          .where('workOrderCode', '==', workOrderCode)
          .limit(1);
        const quotesSnapshot = await transaction.get(quotesQuery);
        
        if (!quotesSnapshot.empty) {
          const quoteDoc = quotesSnapshot.docs[0];
          transaction.update(quoteDoc.ref, {
            productionState: 'İptal Edildi',
            productionStateUpdatedAt: now,
            productionStateUpdatedBy: userEmail
          });
        }
      }
      
      return {
        success: true,
        planId,
        cancelledCount,
        actualOutputQuantity: actualOutput,
        defectQuantity: defects,
        totalConsumedOutput,
        materialAdjustments: {
          inputMaterials: stockAdjustmentResults,
          outputMaterial: outputStockResult
        },
        workersCleared: workersToUpdate.size,
        stationsCleared: stationsToUpdate.size,
        cancelledAt: now.toISOString(),
        cancelledBy: userEmail
      };
    });
    
    console.log(`✅ Cancel-with-progress completed for plan ${planId}`);
    return res.status(200).json(result);
    
  } catch (error) {
    console.error('Cancel-with-progress error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to cancel production plan with progress',
      details: error.message
    });
  }
});

// ============================================================================
// WORK PACKAGES ENDPOINT (GLOBAL TASK AGGREGATION)
// ============================================================================

/**
 * GET /api/mes/work-packages
 * Returns all active assignments across all launched production plans
 * Joins with plans, quotes, workers, stations for dashboard display
 * 
 * Query params:
 * - status: filter by assignment status (pending, in-progress, paused, etc.)
 * - workerId: filter by specific worker
 * - stationId: filter by specific station
 * - limit: max results (default 100, max 500)
 */
router.get('/work-packages', withAuth, async (req, res) => {
  try {
    const db = getFirestore();
    const { status, workerId, stationId, limit } = req.query;
    const maxResults = Math.min(parseInt(limit) || 100, 500);
    
    // Fetch all assignments for launched plans
    // Active statuses: pending, ready, in-progress, paused, cancelled_pending_report
    const activeStatuses = ['pending', 'ready', 'in-progress', 'paused', 'cancelled_pending_report'];
    
    let assignmentsQuery = db.collection('mes-worker-assignments');
    
    // Apply filters
    if (status && activeStatuses.includes(status)) {
      assignmentsQuery = assignmentsQuery.where('status', '==', status);
    } else {
      // Default: only active assignments (not completed/cancelled)
      assignmentsQuery = assignmentsQuery.where('status', 'in', activeStatuses);
    }
    
    if (workerId) {
      assignmentsQuery = assignmentsQuery.where('workerId', '==', workerId);
    }
    
    if (stationId) {
      assignmentsQuery = assignmentsQuery.where('stationId', '==', stationId);
    }
    
    assignmentsQuery = assignmentsQuery.limit(maxResults);
    
    const assignmentsSnapshot = await assignmentsQuery.get();
    
    if (assignmentsSnapshot.empty) {
      return res.status(200).json({
        workPackages: [],
        total: 0,
        message: 'No active work packages found'
      });
    }
    
    // Collect unique IDs for batch fetching
    const planIds = new Set();
    const workerIds = new Set();
    const stationIds = new Set();
    const workOrderCodes = new Set();
    
    const assignments = assignmentsSnapshot.docs.map(doc => {
      const data = doc.data();
      if (data.planId) planIds.add(data.planId);
      if (data.workerId) workerIds.add(data.workerId);
      if (data.stationId) stationIds.add(data.stationId);
      if (data.workOrderCode) workOrderCodes.add(data.workOrderCode);
      return { id: doc.id, ...data };
    });
    
    // Batch fetch related data
    const [plansMap, workersMap, stationsMap, quotesMap] = await Promise.all([
      fetchPlansMap(db, Array.from(planIds)),
      fetchWorkersMap(db, Array.from(workerIds)),
      fetchStationsMap(db, Array.from(stationIds)),
      fetchQuotesMap(db, Array.from(workOrderCodes))
    ]);
    
    // Enrich assignments with related data
    const workPackages = assignments.map(assignment => {
      const plan = plansMap.get(assignment.planId) || {};
      const worker = workersMap.get(assignment.workerId) || {};
      const station = stationsMap.get(assignment.stationId) || {};
      const quote = quotesMap.get(assignment.workOrderCode) || {};
      
      // Determine material status (simplified for now)
      let materialStatus = 'unknown';
      if (plan.materialSummary) {
        const hasShortages = plan.materialCheckResult && plan.materialCheckResult.hasShortages;
        materialStatus = hasShortages ? 'short' : 'ok';
      }
      
      return {
        // Assignment core data
        id: assignment.id,
        nodeId: assignment.nodeId,
        nodeName: assignment.nodeName,
        operationId: assignment.operationId,
        status: assignment.status,
        priority: assignment.priority || 0,
        
        // Work order data
        workOrderCode: assignment.workOrderCode,
        customer: quote.customer || quote.name || '',
        company: quote.company || '',
        
        // Plan data
        planId: assignment.planId,
        planName: plan.name || '',
        planStatus: plan.status || '',
        launchStatus: plan.launchStatus || '',
        
        // Worker data
        workerId: assignment.workerId,
        workerName: assignment.workerName || worker.name || '',
        workerSkills: worker.skills || [],
        
        // Station data
        stationId: assignment.stationId,
        stationName: assignment.stationName || station.name || '',
        subStationCode: assignment.subStationCode || null,
        
        // Timing data
        plannedStart: assignment.plannedStart,
        plannedEnd: assignment.plannedEnd,
        actualStart: assignment.actualStart || null,
        actualEnd: assignment.actualEnd || null,
        nominalTime: assignment.nominalTime || 0,
        effectiveTime: assignment.effectiveTime || 0,
        
        // Status flags
        materialStatus,
        isPaused: assignment.status === 'paused',
        isBlocked: assignment.preconditions && assignment.preconditions.some(p => !p.met),
        
        // Metadata
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt
      };
    });
    
    // Sort by priority (execution order) and then by planned start
    workPackages.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.plannedStart && b.plannedStart) {
        return new Date(a.plannedStart) - new Date(b.plannedStart);
      }
      return 0;
    });
    
    return res.status(200).json({
      workPackages,
      total: workPackages.length,
      filters: { status, workerId, stationId },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Work packages fetch error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to fetch work packages',
      details: error.message
    });
  }
});

// Helper functions for batch fetching
async function fetchPlansMap(db, planIds) {
  if (planIds.length === 0) return new Map();
  
  const plansMap = new Map();
  const chunks = chunkArray(planIds, 10); // Firestore 'in' limit is 10
  
  for (const chunk of chunks) {
    const snapshot = await db.collection('mes-production-plans')
      .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
      .get();
    
    snapshot.docs.forEach(doc => {
      plansMap.set(doc.id, { id: doc.id, ...doc.data() });
    });
  }
  
  return plansMap;
}

async function fetchWorkersMap(db, workerIds) {
  if (workerIds.length === 0) return new Map();
  
  const workersMap = new Map();
  const chunks = chunkArray(workerIds, 10);
  
  for (const chunk of chunks) {
    const snapshot = await db.collection('mes-workers')
      .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
      .get();
    
    snapshot.docs.forEach(doc => {
      workersMap.set(doc.id, { id: doc.id, ...doc.data() });
    });
  }
  
  return workersMap;
}

async function fetchStationsMap(db, stationIds) {
  if (stationIds.length === 0) return new Map();
  
  const stationsMap = new Map();
  const chunks = chunkArray(stationIds, 10);
  
  for (const chunk of chunks) {
    const snapshot = await db.collection('mes-stations')
      .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
      .get();
    
    snapshot.docs.forEach(doc => {
      stationsMap.set(doc.id, { id: doc.id, ...doc.data() });
    });
  }
  
  return stationsMap;
}

async function fetchQuotesMap(db, workOrderCodes) {
  if (workOrderCodes.length === 0) return new Map();
  
  const quotesMap = new Map();
  const chunks = chunkArray(workOrderCodes, 10);
  
  for (const chunk of chunks) {
    const snapshot = await db.collection('approved-quotes')
      .where('workOrderCode', 'in', chunk)
      .get();
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.workOrderCode) {
        quotesMap.set(data.workOrderCode, { id: doc.id, ...data });
      }
    });
  }
  
  return quotesMap;
}

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// ============================================================================
// SEMI-FINISHED CODE REGISTRY (Firestore-backed)
// ============================================================================

// Helper: normalize materials for signature building
function normalizeMaterialsForSignature(mats = []) {
  const arr = Array.isArray(mats) ? mats : [];
  return arr
    .filter(m => !!m && !!m.id)
    .map(m => ({ 
      id: String(m.id), 
      qty: (m.qty == null || m.qty === '') ? null : Number(m.qty), 
      unit: m.unit || '' 
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// Helper: build signature matching frontend logic
function buildSemiCodeSignature(operationId, operationCode, stationId, materials) {
  const mats = normalizeMaterialsForSignature(materials);
  const matsStr = mats.map(m => `${m.id}:${m.qty != null ? m.qty : ''}${m.unit || ''}`).join(',');
  return `op:${operationId || ''}|code:${operationCode || ''}|st:${stationId || ''}|mats:${matsStr}`;
}

// Helper: generate prefix from operation code (matches frontend logic)
function generatePrefix(operationCode) {
  if (!operationCode) return 'S';
  const raw = String(operationCode).trim();
  const letters = raw.replace(/[^A-Za-z]/g, '');
  if (!letters) return 'S';
  return (letters[0].toUpperCase() + (letters[1] ? letters[1].toLowerCase() : '')).slice(0, 2);
}

// Helper: pad counter to 3 digits
function pad3(n) { 
  return String(n).padStart(3, '0'); 
}

// POST /api/mes/output-codes/preview
// Preview what code would be assigned without committing
router.post('/output-codes/preview', withAuth, async (req, res) => {
  console.log('📋 Semi-code preview request:', { operationId: req.body?.operationId, stationId: req.body?.stationId });
  try {
    const { operationId, operationCode, stationId, materials } = req.body;
    
    // Validation
    if (!operationId) {
      return res.status(400).json({ error: 'operationId required' });
    }
    if (!stationId) {
      return res.status(400).json({ error: 'stationId required' });
    }
    if (!Array.isArray(materials) || materials.length === 0) {
      return res.status(400).json({ error: 'materials array required with at least one item' });
    }
    
    // Ensure all materials have quantities
    const allQtyKnown = materials.every(m => m.qty != null && Number.isFinite(Number(m.qty)));
    if (!allQtyKnown) {
      return res.json({ code: null, reserved: false, message: 'incomplete_materials' });
    }
    
    const db = getFirestore();
    const prefix = generatePrefix(operationCode);
    const signature = buildSemiCodeSignature(operationId, operationCode, stationId, materials);
    
    // Hash materials for storage (simple concatenation)
    const matsNorm = normalizeMaterialsForSignature(materials);
    const materialsHash = matsNorm.map(m => `${m.id}:${m.qty}${m.unit}`).join(',');
    
    // Run transaction to check if code exists or preview next
    const result = await db.runTransaction(async (transaction) => {
      const docRef = db.collection('mes-outputCodes').doc(prefix);
      const doc = await transaction.get(docRef);
      
      if (doc.exists) {
        const data = doc.data();
        const codes = data.codes || {};
        
        // Check if signature already has a code
        if (codes[signature]) {
          return { 
            code: codes[signature].code, 
            reserved: true,
            existingEntry: codes[signature]
          };
        }
        
        // Preview next code without incrementing
        const nextCounter = data.nextCounter || 1;
        const previewCode = `${prefix}-${pad3(nextCounter)}`;
        return { 
          code: previewCode, 
          reserved: false,
          nextCounter
        };
      } else {
        // New prefix - would start at 001
        return { 
          code: `${prefix}-001`, 
          reserved: false,
          nextCounter: 1
        };
      }
    });
    
    res.json(result);
  } catch (error) {
    console.error('Output code preview error:', error);
    res.status(500).json({ error: 'output_code_preview_failed', message: error.message });
  }
});

// POST /api/mes/output-codes/commit
// Commit codes when plan/template is saved
router.post('/output-codes/commit', withAuth, async (req, res) => {
  try {
    const { assignments } = req.body;
    
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ error: 'assignments array required' });
    }
    
    const db = getFirestore();
    let committed = 0;
    let skipped = 0;
    const errors = [];
    
    // Group assignments by prefix to batch transactions
    const byPrefix = new Map();
    for (const assignment of assignments) {
      const { prefix, signature, code, operationId, stationId, materialsHash } = assignment;
      
      if (!prefix || !signature || !code) {
        errors.push({ assignment, error: 'missing_required_fields' });
        continue;
      }
      
      if (!byPrefix.has(prefix)) {
        byPrefix.set(prefix, []);
      }
      byPrefix.get(prefix).push(assignment);
    }
    
    // Process each prefix group in a transaction
    for (const [prefix, prefixAssignments] of byPrefix.entries()) {
      try {
        await db.runTransaction(async (transaction) => {
          const docRef = db.collection('mes-outputCodes').doc(prefix);
          const doc = await transaction.get(docRef);
          
          let data;
          if (doc.exists) {
            data = doc.data();
          } else {
            // Initialize new prefix document
            data = {
              prefix,
              nextCounter: 1,
              codes: {}
            };
          }
          
          const codes = data.codes || {};
          let nextCounter = data.nextCounter || 1;
          let modified = false;
          
          for (const assignment of prefixAssignments) {
            const { signature, code, operationId, stationId, materialsHash } = assignment;
            
            // Skip if already exists
            if (codes[signature]) {
              skipped++;
              continue;
            }
            
            // Validate code format matches expected next value
            const expectedCode = `${prefix}-${pad3(nextCounter)}`;
            if (code !== expectedCode) {
              errors.push({ 
                assignment, 
                error: 'code_mismatch', 
                expected: expectedCode, 
                received: code 
              });
              continue;
            }
            
            // Commit the code
            codes[signature] = {
              code,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              operationId,
              stationId,
              materialsHash
            };
            
            nextCounter++;
            committed++;
            modified = true;
          }
          
          // Update document if modified
          if (modified) {
            transaction.set(docRef, {
              prefix,
              nextCounter,
              codes
            }, { merge: true });
          }
        });
      } catch (error) {
        console.error(`Transaction failed for prefix ${prefix}:`, error);
        errors.push({ prefix, error: error.message });
      }
    }
    
    res.json({ 
      committed, 
      skipped, 
      errors: errors.length > 0 ? errors : undefined 
    });
  } catch (error) {
    console.error('Output code commit error:', error);
    res.status(500).json({ error: 'output_code_commit_failed', message: error.message });
  }
});

export default router;

