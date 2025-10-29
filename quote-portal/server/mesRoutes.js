import express from 'express';
import { getFirestore } from 'firebase-admin/firestore';

const router = express.Router();

// Middleware to authenticate requests (reuse existing auth)
function withAuth(req, res, next) {
  // Use same auth logic as materials routes
  const token = req.headers.authorization?.replace('Bearer ', '') || '';
  if (!token && req.hostname !== 'localhost') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
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

// GET /api/mes/production-plans - Get all production plans
router.get('/production-plans', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    const snapshot = await db.collection('mes-production-plans')
      .orderBy('createdAt', 'desc')
      .get();
    const productionPlans = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
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
    await db.collection('mes-production-plans').doc(productionPlan.id).set({
      ...productionPlan,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return { success: true, id: productionPlan.id };
  }, res);
});

// PUT /api/mes/production-plans/:id - Update production plan
router.put('/production-plans/:id', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params;
    const updates = req.body;

    const db = getFirestore();
    await db.collection('mes-production-plans').doc(id).update({
      ...updates,
      updatedAt: new Date()
    });

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

// GET /api/mes/templates - Get all production plan templates
router.get('/templates', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    const snapshot = await db.collection('mes-templates')
      .orderBy('createdAt', 'desc')
      .get();
    const templates = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    return { templates };
  }, res);
});

// POST /api/mes/templates - Create template
router.post('/templates', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const template = req.body;
    if (!template.id) {
      throw new Error('Template ID is required');
    }

    const db = getFirestore();
    await db.collection('mes-templates').doc(template.id).set({
      ...template,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return { success: true, id: template.id };
  }, res);
});

// DELETE /api/mes/templates/:id - Delete template
router.delete('/templates/:id', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params;
    const db = getFirestore();
    await db.collection('mes-templates').doc(id).delete();
    return { success: true, id };
  }, res);
});

// ============================================================================
// ORDERS ROUTES (Mock data for now)
// ============================================================================

// GET /api/mes/orders - Get all orders (mock data)
router.get('/orders', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    // Mock orders for now - later can be integrated with actual order system
    const mockOrders = [
      { id: "WO-2401", product: "Engine Block", quantity: 500, dueDate: "2025-02-15" },
      { id: "WO-2402", product: "Gear Assembly", quantity: 800, dueDate: "2025-02-20" },
      { id: "WO-2403", product: "Control Panel", quantity: 300, dueDate: "2025-02-18" },
    ];
    return { orders: mockOrders };
  }, res);
});

export default router;