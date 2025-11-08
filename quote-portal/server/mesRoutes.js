import express from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import admin from 'firebase-admin';
import { getSession } from './auth.js'
import jsondb from '../src/lib/jsondb.js'

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
    // Ensure timeSettings exists with safe defaults
    data.timeSettings = data.timeSettings || { workType: 'fixed', laneCount: 1, fixedBlocks: {}, shiftBlocks: {} }
    return data;
  }, res);
});

// POST /api/mes/master-data - Update master data
router.post('/master-data', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { availableSkills, availableOperationTypes, timeSettings } = req.body || {};
    
    console.log('POST /api/mes/master-data - Received:', { availableSkills, availableOperationTypes, timeSettings });
    
    const db = getFirestore();
    const payload = {
      ...(availableSkills ? { availableSkills } : {}),
      ...(availableOperationTypes ? { availableOperationTypes } : {}),
      ...(timeSettings ? { timeSettings } : {}),
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

      return { success: true, id };
    }
  }, res);
});

// DELETE /api/mes/production-plans/:id - Delete production plan
router.delete('/production-plans/:id', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params;
    const db = getFirestore();
    await db.collection('mes-production-plans').doc(id).delete();
    return { success: true, id };
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

// GET /api/mes/materials - Get all materials
router.get('/materials', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    const snapshot = await db.collection('mes-materials')
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
    const existingSnapshot = await db.collection('mes-materials').get();
    const existingIds = new Set(existingSnapshot.docs.map(doc => doc.id));
    const newIds = new Set(materials.map(m => m.id));

    // Add/Update materials
    materials.forEach(material => {
      const docRef = db.collection('mes-materials').doc(material.id);
      batch.set(docRef, {
        ...material,
        updatedAt: new Date()
      }, { merge: true });
    });

    // Delete removed materials
    existingIds.forEach(id => {
      if (!newIds.has(id)) {
        const docRef = db.collection('mes-materials').doc(id);
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
    const { planId, requiredMaterials } = req.body;
    
    if (!Array.isArray(requiredMaterials)) {
      throw new Error('Required materials must be an array');
    }

    const db = getFirestore();
    const materialsSnapshot = await db.collection('mes-materials').get();
    const availableMaterials = {};
    
    materialsSnapshot.docs.forEach(doc => {
      const material = doc.data();
      availableMaterials[material.name] = material;
    });

    const materialChecks = requiredMaterials.map(required => {
      const available = availableMaterials[required.name];
      const isAvailable = available && available.available >= required.required;
      const shortage = available ? Math.max(0, required.required - available.available) : required.required;
      
      return {
        name: required.name,
        required: required.required,
        available: available?.available || 0,
        unit: required.unit || available?.unit || 'pcs',
        isAvailable,
        shortage,
        shortagePercentage: available ? Math.round((shortage / required.required) * 100) : 100
      };
    });

    const allAvailable = materialChecks.every(check => check.isAvailable);
    const totalShortageItems = materialChecks.filter(check => !check.isAvailable).length;

    return {
      planId,
      allAvailable,
      totalShortageItems,
      materials: materialChecks,
      checkedAt: new Date()
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

    // Build query
    let query = db.collection('mes-worker-assignments').where('workerId', '==', id);
    
    if (status) {
      query = query.where('status', '==', status);
    }
    
    // Order by start time
    query = query.orderBy('start', 'asc');
    
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

    return { assignments };
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
