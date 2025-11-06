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

    // Get existing workers to find deletions
    const existingSnapshot = await db.collection('mes-workers').get();
    const existingIds = new Set(existingSnapshot.docs.map(doc => doc.id));
    const newIds = new Set(workers.map(w => w.id));

    // Add/Update workers
    workers.forEach(worker => {
      const docRef = db.collection('mes-workers').doc(worker.id);
      batch.set(docRef, {
        ...worker,
        updatedAt: new Date()
      }, { merge: true });
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
        availableOperationTypes: ['İmalat', 'Kontrol', 'Montaj', 'Paketleme']
      };
    }

    return doc.data();
  }, res);
});

// POST /api/mes/master-data - Update master data
router.post('/master-data', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { availableSkills, availableOperationTypes } = req.body;
    
    const db = getFirestore();
    await db.collection('mes-settings').doc('master-data').set({
      availableSkills: availableSkills || [],
      availableOperationTypes: availableOperationTypes || [],
      updatedAt: new Date()
    }, { merge: true });

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
    if (!productionPlan.id) {
      throw new Error('Production plan ID is required');
    }

    const db = getFirestore();
    const now = new Date()
    const parts = formatDateParts(now)
    const actorEmail = (req.user && req.user.email) || null
    const actorName = (req.user && (req.user.name || req.user.userName)) || null
    const createdBy = actorEmail || actorName || null
    await db.collection('mes-production-plans').doc(productionPlan.id).set({
      ...productionPlan,
      createdAt: now,
      updatedAt: now,
      // explicit date/time parts for analytics and UI
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
  }, res);
});

// PUT /api/mes/production-plans/:id - Update production plan
router.put('/production-plans/:id', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params;
    const updates = req.body;

    const db = getFirestore();
    const updatedByEmail = (req.user && req.user.email) || null
    const updatedByName = (req.user && (req.user.name || req.user.userName)) || null
    const now = new Date()
    const parts = formatDateParts(now)
    await db.collection('mes-production-plans').doc(id).set({
      ...updates,
      updatedAt: now,
      updatedDate: parts.date,
      updatedTime: parts.time,
      ...(updatedByEmail ? { updatedBy: updatedByEmail } : {}),
      ...(updatedByName ? { updatedByName } : {})
    }, { merge: true });

    return { success: true, id };
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

export default router;
