import express from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import admin from 'firebase-admin';
import { getSession } from './auth.js'
import jsondb from '../src/lib/jsondb.js'
import { adjustMaterialStock, consumeMaterials } from './materialsRoutes.js'

const router = express.Router();

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
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
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
    const workers = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
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

    function buildCompanyBlocks(ts, shiftNo) {
      const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
      const result = {};
      const isShift = (ts?.workType === 'shift');
      for (const d of days) {
        if (isShift) {
          result[d] = getShiftBlocksForDay(ts, d, shiftNo);
        } else {
          result[d] = Array.isArray(ts?.fixedBlocks?.[d]) ? ts.fixedBlocks[d] : [];
        }
      }
      return result;
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
          personalSchedule = {
            mode: 'company',
            ...(shiftNo ? { shiftNo } : {}),
            blocks: buildCompanyBlocks(timeSettings, shiftNo)
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
        // No schedule provided: default to company with computed blocks
        const shiftNo = (timeSettings?.workType === 'shift') ? '1' : undefined;
        personalSchedule = {
          mode: 'company',
          ...(shiftNo ? { shiftNo } : {}),
          blocks: buildCompanyBlocks(timeSettings, shiftNo)
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
      const e = new Error('work_order_not_found'); e.status = 404; throw e;
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

      // Create new assignments
      const now = new Date();
      const createdBy = req.user?.email || 'system';
      
      assignments.forEach(assignment => {
        const assignmentId = `${planId}-${assignment.nodeId || assignment.workerId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const docRef = db.collection('mes-worker-assignments').doc(assignmentId);
        
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
    
    // Get workerId from user profile or query param
    let workerId = req.user?.workerId;
    if (!workerId && req.query.workerId) {
      workerId = req.query.workerId;
    }
    
    if (!workerId) {
      const e = new Error('worker_id_required');
      e.status = 400;
      throw e;
    }
    
    // Verify worker exists
    const workerDoc = await db.collection('mes-workers').doc(workerId).get();
    if (!workerDoc.exists) {
      const e = new Error('worker_not_found');
      e.status = 404;
      throw e;
    }
    
    // Get all assignments for this worker
    const assignmentsSnapshot = await db.collection('mes-worker-assignments')
      .where('workerId', '==', workerId)
      .get();
    
    if (assignmentsSnapshot.empty) {
      return { tasks: [], nextTaskId: null };
    }
    
    // Get unique plan IDs
    const planIds = [...new Set(assignmentsSnapshot.docs.map(doc => doc.data().planId))];
    
    // Get execution state for each plan and merge
    const allTasks = [];
    
    for (const planId of planIds) {
      try {
        const tasks = await getPlanExecutionState(planId);
        // Filter: only this worker and active statuses
        const workerTasks = tasks.filter(task => 
          task.workerId === workerId &&
          ['pending', 'ready', 'in_progress', 'paused'].includes(task.status)
        );
        allTasks.push(...workerTasks);
      } catch (err) {
        console.error(`Failed to get execution state for plan ${planId}:`, err);
        // Continue with other plans
      }
    }
    
    // Sort by priorityIndex
    allTasks.sort((a, b) => a.priorityIndex - b.priorityIndex);
    
    // Find next task (first ready or pending task)
    const nextTask = allTasks.find(task => task.status === 'ready' || task.status === 'pending');
    const nextTaskId = nextTask?.assignmentId || null;
    
    return { tasks: allTasks, nextTaskId };
  }, res);
});

// PATCH /api/mes/worker-portal/tasks/:assignmentId - Update task status
router.patch('/worker-portal/tasks/:assignmentId', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { assignmentId } = req.params;
    const { action, scrapQty, stationNote } = req.body;
    
    if (!assignmentId) {
      const e = new Error('assignment_id_required');
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
    
    // Get assignment
    const assignmentDoc = await db.collection('mes-worker-assignments').doc(assignmentId).get();
    if (!assignmentDoc.exists) {
      const e = new Error('assignment_not_found');
      e.status = 404;
      throw e;
    }
    
    const assignment = assignmentDoc.data();
    const { planId, nodeId, workerId, stationId } = assignment;
    
    // Execute action
    const result = await db.runTransaction(async (transaction) => {
      const assignmentRef = db.collection('mes-worker-assignments').doc(assignmentId);
      const workerRef = workerId ? db.collection('mes-workers').doc(workerId) : null;
      const stationRef = stationId ? db.collection('mes-stations').doc(stationId) : null;
      
      let updateData = { updatedAt: now };
      let workerUpdate = null;
      let stationUpdate = null;
      let alertCreated = false;
      let scrapAdjustment = null;
      
      switch (action) {
        case 'start':
          updateData.status = 'in_progress';
          updateData.actualStart = now;
          
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
          updateData.status = 'paused';
          
          // Update worker currentTask status
          if (workerRef) {
            workerUpdate = {
              'currentTask.status': 'paused',
              updatedAt: now
            };
          }
          break;
          
        case 'station_error':
          updateData.status = 'paused';
          
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
          updateData.status = 'completed';
          updateData.actualFinish = now;
          
          // Handle scrap material adjustment
          if (scrapQty && scrapQty > 0) {
            // Get plan to find material info
            const planDoc = await transaction.get(db.collection('mes-production-plans').doc(planId));
            if (planDoc.exists) {
              const planData = planDoc.data();
              const executionGraph = planData.executionGraph || [];
              const node = executionGraph.find(n => n.nodeId === nodeId);
              
              if (node && node.materialInputs && node.materialInputs.length > 0) {
                // Apply scrap adjustment to first raw material (or all proportionally)
                const materialCode = node.materialInputs[0].code;
                
                try {
                  // Consume additional material for scrap
                  const scrapResult = await adjustMaterialStock(materialCode, -scrapQty, {
                    reason: 'production_plan_runtime',
                    reference: `Scrap adjustment for ${planId}/${nodeId}`,
                    planId,
                    nodeId,
                    workerId,
                    transactionType: 'scrap_adjustment'
                  });
                  
                  scrapAdjustment = {
                    materialCode,
                    scrapQty,
                    timestamp: now,
                    nodeId,
                    workerId,
                    result: scrapResult
                  };
                  
                  // Log scrap adjustment in plan document
                  const planRef = db.collection('mes-production-plans').doc(planId);
                  transaction.update(planRef, {
                    'stockMovements.scrapAdjustments': admin.firestore.FieldValue.arrayUnion({
                      materialCode,
                      scrapQty,
                      nodeId,
                      workerId,
                      timestamp: now,
                      assignmentId
                    }),
                    updatedAt: now
                  });
                } catch (err) {
                  console.error('Failed to adjust scrap material:', err);
                  // Continue with completion even if scrap adjustment fails
                }
              }
            }
          }
          
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
        assignmentId,
        action,
        status: updateData.status,
        alertCreated,
        scrapAdjustment,
        updatedAt: now.toISOString()
      };
    });
    
    return result;
  }, res);
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

export default router;
