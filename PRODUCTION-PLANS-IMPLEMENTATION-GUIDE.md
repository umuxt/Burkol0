# 🏭 PRODUCTION PLANS IMPLEMENTATION GUIDE
## Complete Lifecycle: Design → Launch → Execution

**Tarih:** 20 Kasım 2025  
**Durum:** ✅ Phase 1 Complete (Steps 1-6) | 🎯 Ready for Step 7  
**Hedef:** Production Plans CRUD + Launch System

---

## 📊 CURRENT STATE

### ✅ Completed (Steps 1-6):
- [x] Operations CRUD (2 endpoints)
- [x] Workers CRUD (4 endpoints)
- [x] Stations CRUD (4 endpoints)
- [x] Skills CRUD (4 endpoints) - Key-based system
- [x] Substations CRUD (4 endpoints)
- [x] Approved Quotes GET (1 endpoint)
- [x] Work Orders CRUD (5 endpoints)

**Total:** 19 endpoints migrated ✅

### 🎯 Next: STEP 7 - Production Plans (8 endpoints)

---

## 🗂️ DATABASE SCHEMA OVERVIEW

### Current Tables:
```
mes.production_plans (header)
mes.production_plan_nodes (node details)
mes.node_material_inputs (materials per node)
```

### Missing Tables (Migration 039):
```
mes.node_stations (station assignments per node)
```

### Schema Relationships:
```
approved_quotes (1) → (many) production_plans
production_plans (1) → (many) production_plan_nodes
production_plan_nodes (1) → (many) node_material_inputs
production_plan_nodes (1) → (many) node_stations
```

---

## 🎯 PRODUCTION PLANS LIFECYCLE

### PHASE 1: PLAN DESIGN (Pre-Launch)
**Status:** draft  
**User Action:** Create production plan with nodes

**What Happens:**
1. User selects approved quote
2. Creates nodes (operations)
3. Assigns materials to each node
4. Assigns possible stations to each node
5. Sets timing (nominal_time, efficiency)

**Database Operations:**
- INSERT mes.production_plans (header)
- INSERT mes.production_plan_nodes (nodes)
- INSERT mes.node_material_inputs (materials)
- INSERT mes.node_stations (station options)

**Node State:**
```json
{
  "status": "draft",
  "assigned_worker_id": null,
  "assigned_substation_id": null,
  "actual_start_time": null,
  "actual_end_time": null
}
```

---

### PHASE 2: NODE DESIGN
**Focus:** Define each production step

**Node Structure:**
```javascript
{
  // Basic Info
  "name": "Kesim",
  "operation_id": "OP-001",
  "sequence_order": 1,
  
  // Output
  "output_code": "WIP-Kesim-M12",
  "output_qty": 1000,
  "output_unit": "adet",
  
  // Timing
  "nominal_time": 120,  // dakika
  "efficiency": 0.85,
  "effective_time": 141,  // 120 / 0.85
  
  // Station Options (Pre-Launch)
  "stationIds": ["ST-Kesim-001", "ST-Kesim-002"],
  
  // Material Inputs
  "materialInputs": [
    {
      "material_code": "M-001",
      "required_quantity": 100,
      "unit_ratio": 1.0,
      "is_derived": false
    }
  ]
}
```

**ER Diagram:**
```
┌─────────────────────────────────┐
│ mes.production_plan_nodes       │
├─────────────────────────────────┤
│ • id (PK)                       │
│ • plan_id (FK)                  │
│ • node_id                       │
│ • name                          │
│ • operation_id (FK)             │
│ • output_code (FK)              │
│ • output_qty                    │
│ • output_unit                   │
│ • nominal_time                  │
│ • efficiency                    │
│ • effective_time                │
│ • assignment_mode               │
│ • assigned_worker_id (NULL)     │
│ • assigned_substation_id (NULL) │
│ • sequence_order                │
└─────────────────────────────────┘
         │
         ├─► mes.node_material_inputs
         │   (materials needed)
         │
         └─► mes.node_stations
             (possible stations)
```

---

### PHASE 3: LAUNCH PROCESS
**Status:** draft → active  
**Endpoint:** `POST /production-plans/:planId/launch`

**What Happens:**
1. Plan status: draft → active
2. For each node:
   - Read assigned stations
   - Find available substations
   - Match worker skills
   - Assign worker + substation
   - Update timing estimates

**Launch Algorithm:**
```javascript
async function launchPlan(planId) {
  const plan = await getPlan(planId);
  
  for (const node of plan.nodes) {
    // 1. Get station options
    const stations = await db('mes.node_stations')
      .where('node_id', node.id)
      .orderBy('priority');
    
    // 2. Find available substations
    let selectedSubstation = null;
    for (const st of stations) {
      const substations = await db('mes.substations')
        .where('station_id', st.station_id)
        .where('status', 'available')
        .limit(1);
      
      if (substations.length > 0) {
        selectedSubstation = substations[0];
        break;
      }
    }
    
    // 3. Match worker skills
    const operation = await getOperation(node.operation_id);
    const matchedWorker = await findWorkerWithSkills(
      operation.skills,
      selectedSubstation.station_id
    );
    
    // 4. Update node
    await db('mes.production_plan_nodes')
      .where('id', node.id)
      .update({
        assigned_worker_id: matchedWorker.id,
        assigned_substation_id: selectedSubstation.id,
        estimated_start_time: calculateStartTime(node),
        estimated_end_time: calculateEndTime(node)
      });
    
    // 5. Update substation status
    await db('mes.substations')
      .where('id', selectedSubstation.id)
      .update({ status: 'reserved' });
  }
  
  // 6. Update plan status
  await db('mes.production_plans')
    .where('id', planId)
    .update({ status: 'active', launched_at: new Date() });
}
```

**Node State After Launch:**
```json
{
  "status": "pending",
  "assigned_worker_id": "W-005",
  "assigned_substation_id": "SUB-Kesim-001-A",
  "estimated_start_time": "2025-11-20T09:00:00Z",
  "estimated_end_time": "2025-11-20T11:21:00Z",
  "actual_start_time": null,
  "actual_end_time": null
}
```

---

### PHASE 4: AFTER LAUNCH (Execution)
**Status:** active  
**Worker Action:** Complete tasks

**What Happens:**
1. Worker starts task → actual_start_time
2. Worker completes task → actual_end_time
3. System calculates actual_duration
4. Update substation status
5. Move to next node

**Node State After Completion:**
```json
{
  "status": "completed",
  "assigned_worker_id": "W-005",
  "assigned_substation_id": "SUB-Kesim-001-A",
  "estimated_start_time": "2025-11-20T09:00:00Z",
  "estimated_end_time": "2025-11-20T11:21:00Z",
  "actual_start_time": "2025-11-20T09:05:00Z",
  "actual_end_time": "2025-11-20T11:30:00Z",
  "actual_duration": 145  // minutes
}
```

---

## 🔧 MIGRATION 039: CREATE NODE_STATIONS TABLE

**File:** `quote-portal/db/migrations/039_create_node_stations.js`

```javascript
exports.up = async function(knex) {
  // Create node_stations junction table
  await knex.schema.createTable('mes.node_stations', (table) => {
    table.increments('id').primary();
    table.integer('node_id').notNullable()
      .references('id').inTable('mes.production_plan_nodes')
      .onDelete('CASCADE');
    table.string('station_id', 50).notNullable()
      .references('id').inTable('mes.stations')
      .onDelete('RESTRICT');
    table.integer('priority').notNullable().defaultTo(1);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Unique constraint: one station per node only once
    table.unique(['node_id', 'station_id']);
    
    // Indexes
    table.index('node_id');
    table.index('station_id');
  });
  
  console.log('✅ Created mes.node_stations table');
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('mes.node_stations');
};
```

**Run Migration:**
```bash
cd quote-portal
npx knex migrate:latest
```

---

## 📋 STEP 7: PRODUCTION PLANS CRUD

### API Endpoints (8 total):

1. **GET /api/mes/production-plans** - List all plans
2. **POST /api/mes/production-plans** - Create plan with nodes
3. **GET /api/mes/production-plans/:id** - Get plan details
4. **PUT /api/mes/production-plans/:id** - Update plan header
5. **DELETE /api/mes/production-plans/:id** - Delete plan
6. **POST /api/mes/production-plans/:id/launch** - Launch plan
7. **POST /api/mes/production-plans/:id/pause** - Pause plan
8. **POST /api/mes/production-plans/:id/resume** - Resume plan

---

### ENDPOINT 1: GET /production-plans

**Purpose:** List all production plans with summary info

**Query:**
```javascript
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
        'q.customer_name',
        'q.product_name',
        'q.quantity as quote_quantity'
      )
      .leftJoin('mes.approved_quotes as q', 'q.id', 'p.quote_id')
      .count('n.id as node_count')
      .leftJoin('mes.production_plan_nodes as n', 'n.plan_id', 'p.id')
      .groupBy('p.id', 'q.customer_name', 'q.product_name', 'q.quantity')
      .orderBy('p.created_at', 'desc');
    
    res.json(plans);
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({ error: 'Failed to fetch production plans' });
  }
});
```

**Response:**
```json
[
  {
    "id": "PLAN-001",
    "work_order_code": "WO-001",
    "quote_id": "Q-2025-001",
    "status": "draft",
    "customer_name": "ABC Metal",
    "product_name": "Vida M12x50",
    "quote_quantity": 1000,
    "node_count": 3,
    "created_at": "2025-11-20T08:00:00Z",
    "launched_at": null
  }
]
```

---

### ENDPOINT 2: POST /production-plans (MOST COMPLEX!)

**Purpose:** Create complete plan with nodes, materials, stations

**Request Body:**
```json
{
  "workOrderCode": "WO-001",
  "quoteId": "Q-2025-001",
  "nodes": [
    {
      "name": "Kesim",
      "operationId": "OP-001",
      "outputCode": "WIP-Kesim-M12",
      "outputQty": 1000,
      "outputUnit": "adet",
      "nominalTime": 120,
      "efficiency": 0.85,
      "sequenceOrder": 1,
      "stationIds": ["ST-Kesim-001", "ST-Kesim-002"],
      "materialInputs": [
        {
          "materialCode": "M-001",
          "requiredQuantity": 100,
          "unitRatio": 1.0,
          "isDerived": false
        }
      ]
    },
    {
      "name": "Torna",
      "operationId": "OP-002",
      "outputCode": "WIP-Torna-M12",
      "outputQty": 1000,
      "outputUnit": "adet",
      "nominalTime": 180,
      "efficiency": 0.90,
      "sequenceOrder": 2,
      "stationIds": ["ST-Torna-001"],
      "materialInputs": [
        {
          "materialCode": "WIP-Kesim-M12",
          "requiredQuantity": 1000,
          "unitRatio": 1.0,
          "isDerived": true
        }
      ]
    }
  ]
}
```

**Implementation:**
```javascript
router.post('/production-plans', withAuth, async (req, res) => {
  const { workOrderCode, quoteId, nodes } = req.body;
  
  const trx = await db.transaction();
  
  try {
    // 1. Generate plan ID
    const [{ max_id }] = await trx('mes.production_plans')
      .max('id as max_id');
    const nextNum = max_id ? parseInt(max_id.split('-')[1]) + 1 : 1;
    const planId = `PLAN-${nextNum.toString().padStart(3, '0')}`;
    
    // 2. Create plan header
    await trx('mes.production_plans').insert({
      id: planId,
      work_order_code: workOrderCode,
      quote_id: quoteId,
      status: 'draft',
      created_at: trx.fn.now()
    });
    
    // 3. Insert nodes
    for (const node of nodes) {
      // 3a. Insert node
      const [nodeRecord] = await trx('mes.production_plan_nodes')
        .insert({
          plan_id: planId,
          node_id: `${planId}-node-${node.sequenceOrder}`,
          name: node.name,
          operation_id: node.operationId,
          output_code: node.outputCode,
          output_qty: node.outputQty,
          output_unit: node.outputUnit,
          nominal_time: node.nominalTime,
          efficiency: node.efficiency,
          effective_time: Math.ceil(node.nominalTime / node.efficiency),
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
    
    // 4. Fetch and return complete plan
    const plan = await getPlanWithNodes(planId);
    res.json(plan);
    
  } catch (error) {
    await trx.rollback();
    console.error('Error creating production plan:', error);
    res.status(500).json({ 
      error: 'Failed to create production plan',
      details: error.message 
    });
  }
});

// Helper function
async function getPlanWithNodes(planId) {
  const plan = await db('mes.production_plans')
    .where('id', planId)
    .first();
  
  const nodes = await db('mes.production_plan_nodes as n')
    .select(
      'n.*',
      db.raw(`
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'materialCode', mi.material_code,
              'requiredQuantity', mi.required_quantity,
              'unitRatio', mi.unit_ratio,
              'isDerived', mi.is_derived
            )
          ) FILTER (WHERE mi.id IS NOT NULL),
          '[]'
        ) as material_inputs
      `),
      db.raw(`
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'stationId', ns.station_id,
              'priority', ns.priority
            ) ORDER BY jsonb_build_object(
              'stationId', ns.station_id,
              'priority', ns.priority
            ) -> 'priority'
          ) FILTER (WHERE ns.id IS NOT NULL),
          '[]'
        ) as assigned_stations
      `)
    )
    .leftJoin('mes.node_material_inputs as mi', 'mi.node_id', 'n.id')
    .leftJoin('mes.node_stations as ns', 'ns.node_id', 'n.id')
    .where('n.plan_id', planId)
    .groupBy('n.id')
    .orderBy('n.sequence_order');
  
  return { ...plan, nodes };
}
```

---

### ENDPOINT 3: GET /production-plans/:id

**Purpose:** Get plan details with all nodes

**Implementation:**
```javascript
router.get('/production-plans/:id', withAuth, async (req, res) => {
  try {
    const plan = await getPlanWithNodes(req.params.id);
    
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    res.json(plan);
  } catch (error) {
    console.error('Error fetching plan:', error);
    res.status(500).json({ error: 'Failed to fetch plan' });
  }
});
```

---

### ENDPOINT 4: PUT /production-plans/:id

**Purpose:** Update plan header (not nodes)

**Implementation:**
```javascript
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
    
    res.json(updated);
  } catch (error) {
    console.error('Error updating plan:', error);
    res.status(500).json({ error: 'Failed to update plan' });
  }
});
```

---

### ENDPOINT 5: DELETE /production-plans/:id

**Purpose:** Delete plan and all related data (CASCADE)

**Implementation:**
```javascript
router.delete('/production-plans/:id', withAuth, async (req, res) => {
  const trx = await db.transaction();
  
  try {
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
    
    const deleted = await trx('mes.production_plans')
      .where('id', req.params.id)
      .delete();
    
    if (!deleted) {
      await trx.rollback();
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    await trx.commit();
    res.json({ success: true, id: req.params.id });
    
  } catch (error) {
    await trx.rollback();
    console.error('Error deleting plan:', error);
    res.status(500).json({ error: 'Failed to delete plan' });
  }
});
```

---

### ENDPOINT 6: POST /production-plans/:id/launch (CRITICAL!)

**Purpose:** Launch plan - assign workers and substations

**Implementation:**
```javascript
router.post('/production-plans/:id/launch', withAuth, async (req, res) => {
  const { id } = req.params;
  
  const trx = await db.transaction();
  
  try {
    // 1. Get plan
    const plan = await trx('mes.production_plans')
      .where('id', id)
      .first();
    
    if (!plan) {
      await trx.rollback();
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    if (plan.status !== 'draft') {
      await trx.rollback();
      return res.status(400).json({ 
        error: 'Plan already launched',
        status: plan.status 
      });
    }
    
    // 2. Get all nodes
    const nodes = await trx('mes.production_plan_nodes')
      .where('plan_id', id)
      .orderBy('sequence_order');
    
    let currentTime = new Date();
    
    // 3. Process each node
    for (const node of nodes) {
      // 3a. Get station options (ordered by priority)
      const stationOptions = await trx('mes.node_stations')
        .where('node_id', node.id)
        .orderBy('priority');
      
      // 3b. Find available substation
      let selectedSubstation = null;
      for (const stOpt of stationOptions) {
        const [substation] = await trx('mes.substations')
          .where('station_id', stOpt.station_id)
          .where('status', 'available')
          .limit(1);
        
        if (substation) {
          selectedSubstation = substation;
          break;
        }
      }
      
      if (!selectedSubstation) {
        await trx.rollback();
        return res.status(400).json({ 
          error: 'No available substation found',
          node: node.name 
        });
      }
      
      // 3c. Get operation skills
      const operation = await trx('mes.operations')
        .where('id', node.operation_id)
        .first();
      
      // 3d. Find worker with matching skills
      const matchedWorker = await findAvailableWorkerWithSkills(
        trx,
        operation.skills,
        selectedSubstation.station_id
      );
      
      if (!matchedWorker) {
        await trx.rollback();
        return res.status(400).json({ 
          error: 'No available worker with required skills',
          node: node.name,
          required_skills: operation.skills
        });
      }
      
      // 3e. Calculate timing
      const estimatedStart = new Date(currentTime);
      const estimatedEnd = new Date(
        currentTime.getTime() + node.effective_time * 60000
      );
      
      // 3f. Update node
      await trx('mes.production_plan_nodes')
        .where('id', node.id)
        .update({
          assigned_worker_id: matchedWorker.id,
          assigned_substation_id: selectedSubstation.id,
          estimated_start_time: estimatedStart,
          estimated_end_time: estimatedEnd,
          updated_at: trx.fn.now()
        });
      
      // 3g. Reserve substation
      await trx('mes.substations')
        .where('id', selectedSubstation.id)
        .update({ 
          status: 'reserved',
          current_assignment_id: node.id 
        });
      
      // Move time forward for next node
      currentTime = estimatedEnd;
    }
    
    // 4. Update plan status
    await trx('mes.production_plans')
      .where('id', id)
      .update({ 
        status: 'active',
        launched_at: trx.fn.now() 
      });
    
    await trx.commit();
    
    // 5. Return updated plan
    const updatedPlan = await getPlanWithNodes(id);
    res.json(updatedPlan);
    
  } catch (error) {
    await trx.rollback();
    console.error('Error launching plan:', error);
    res.status(500).json({ 
      error: 'Failed to launch plan',
      details: error.message 
    });
  }
});

// Helper: Find worker with skills
async function findAvailableWorkerWithSkills(trx, requiredSkills, stationId) {
  if (!requiredSkills || requiredSkills.length === 0) {
    // No skills required, get any available worker
    return await trx('mes.workers')
      .where('status', 'available')
      .where('active', true)
      .first();
  }
  
  // Find workers with matching skills
  const workers = await trx('mes.workers')
    .where('status', 'available')
    .where('active', true)
    .whereRaw('skills::jsonb ?| ?', [requiredSkills]);
  
  // Prefer workers already assigned to this station
  const stationWorkers = await trx('mes.worker_stations')
    .where('station_id', stationId)
    .pluck('worker_id');
  
  const preferredWorker = workers.find(w => 
    stationWorkers.includes(w.id)
  );
  
  return preferredWorker || workers[0] || null;
}
```

---

### ENDPOINT 7: POST /production-plans/:id/pause

**Purpose:** Pause active plan

**Implementation:**
```javascript
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
    
    res.json(updated);
  } catch (error) {
    console.error('Error pausing plan:', error);
    res.status(500).json({ error: 'Failed to pause plan' });
  }
});
```

---

### ENDPOINT 8: POST /production-plans/:id/resume

**Purpose:** Resume paused plan

**Implementation:**
```javascript
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
    
    res.json(updated);
  } catch (error) {
    console.error('Error resuming plan:', error);
    res.status(500).json({ error: 'Failed to resume plan' });
  }
});
```

---

## ✅ STEP 7 COMPLETION CHECKLIST

- [ ] Migration 039 created and run
- [ ] mes.node_stations table exists
- [ ] GET /production-plans working
- [ ] POST /production-plans working (complex!)
- [ ] GET /production-plans/:id working
- [ ] PUT /production-plans/:id working
- [ ] DELETE /production-plans/:id working
- [ ] POST /production-plans/:id/launch working
- [ ] POST /production-plans/:id/pause working
- [ ] POST /production-plans/:id/resume working
- [ ] All 8 endpoints tested
- [ ] Transaction management verified
- [ ] Error handling comprehensive
- [ ] Launch algorithm tested

---

## 🧪 TESTING GUIDE

### Test 1: Create Plan
```bash
curl -X POST http://localhost:3000/api/mes/production-plans \
  -H "Content-Type: application/json" \
  -d '{
    "workOrderCode": "WO-001",
    "quoteId": "Q-2025-001",
    "nodes": [
      {
        "name": "Kesim",
        "operationId": "OP-001",
        "outputCode": "WIP-Kesim-M12",
        "outputQty": 1000,
        "outputUnit": "adet",
        "nominalTime": 120,
        "efficiency": 0.85,
        "sequenceOrder": 1,
        "stationIds": ["ST-Kesim-001", "ST-Kesim-002"],
        "materialInputs": [
          {
            "materialCode": "M-001",
            "requiredQuantity": 100,
            "unitRatio": 1.0,
            "isDerived": false
          }
        ]
      }
    ]
  }'
```

### Test 2: Get Plan
```bash
curl http://localhost:3000/api/mes/production-plans/PLAN-001
```

### Test 3: Launch Plan
```bash
curl -X POST http://localhost:3000/api/mes/production-plans/PLAN-001/launch
```

### Test 4: Verify Assignments
```bash
# Check nodes have workers assigned
curl http://localhost:3000/api/mes/production-plans/PLAN-001 | jq '.nodes[].assigned_worker_id'

# Check substations are reserved
SELECT * FROM mes.substations WHERE status = 'reserved';
```

---

## 🎯 NEXT STEPS (After Step 7)

### STEP 8: Worker Assignments (4 endpoints)
- Worker task management
- Real-time assignment updates

### STEP 9: Work Packages (6 endpoints)
- Package grouping
- Batch operations

### STEP 10: Templates (3 endpoints)
- Plan templates
- Quick plan creation

---

## 📊 SUCCESS METRICS

- ✅ All 8 Production Plans endpoints working
- ✅ Launch algorithm assigns workers correctly
- ✅ Transaction management robust
- ✅ No orphaned data on failures
- ✅ Performance < 1000ms for plan creation
- ✅ Performance < 2000ms for plan launch

**Phase 2 Progress:** 8/25 endpoints (32%)

---

**Son Güncelleme:** 20 Kasım 2025  
**Versiyon:** 2.0 - Production Plans Complete Guide  
**Durum:** 🎯 Ready for Implementation

**Hazırlayan:** AI Assistant  
**Takip Eden:** Development Team
