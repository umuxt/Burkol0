# Optimized Data Flow Study — MES
**Purpose:** Propose a single, robust, secure, and maintainable data model and end-to-end process for the MES plan → launch → execution lifecycle. This document replaces the current dual-structure approach (nodes[] + executionGraph[]) with a canonical model, describes API contract changes, migration and validation strategies, and includes ASCII diagrams and concrete schema examples.

**Scope:** Plan designer (frontend) and mes backend (server) changes required to remove duplication, harden validations and produce predictable material/accounting/assignment flows.

---

**Summary recommendation (short):**
- Use a single canonical source-of-truth: `plan.nodes[]` (rename/normalize to `nodes[]` with canonical field names).
- Do not persist an independent `executionGraph[]` in the plan document. Instead, compute any derived execution graph/enriched nodes on the backend when needed (on save, on launch, or on read). For performance, store a derived snapshot if absolutely necessary, but treat it as cache (with a migration flag).
- Unify field names and types across codebase. Provide JSON schema for each object and implement server-side validation on plan creation/update.

---

**Key goals for the optimized flow:**
- Single source of truth for node definitions.
- Deterministic generation of assignments from nodes at launch.
- Explicit separation of design-time (plan.nodes) vs runtime (mes-worker-assignments) state.
- Robust material reservation/consumption invariants and logging.
- Clear migration path and backward compatibility.

---

**Canonical data model (recommended)**

**1) ProductionPlan document (Firestore)**
- Collection: `mes-production-plans/{planId}`
- Important fields (only listing relevant ones):
```json
{
  "id": "PLAN-001",           // string, primary key
  "orderCode": "WO-2025-001",
  "status": "draft|released|production|cancelled",
  "quantity": 100,
  "nodes": [ /* array of Node objects (canonical schema) */ ],
  "materialSummary": { /* summary, optional */ },
  "createdAt": "2025-11-14T...Z"
}
```

**2) Canonical Node schema (single schema used everywhere)**
- Key rules:
  - Use `id` as canonical identifier (no `nodeId`).
  - Use `nominalTime` (minutes) as the design/estimated duration.
  - Use `effectiveTime` only in enriched/runtime outputs where efficiency is applied.
  - Use `requiredSkills` as canonical property name (frontend should map `skills` → `requiredSkills` when sending to server).
  - Use `assignedStations` as an array of { stationId, priority } for design-time hints.

JSON schema:
```json
{
  "id": "node-1",
  "name": "Kesim Operasyonu",
  "operationId": "OP-001",
  "nominalTime": 60,            // integer minutes (design-time)
  "efficiency": 0.85,            // optional per-node efficiency override (0 < value <= 1)
  "requiredSkills": ["welding"],
  "assignedStations": [{"stationId":"ST-001","priority":1}],
  "assignedSubstations": ["SUB-001-A"],  // optional: hint for substation allocation
  "assignmentMode": "auto",     // "auto" | "manual" (worker allocation mode)
  "assignedWorkerId": null,     // string (if assignmentMode=manual, specify worker ID)
  "predecessors": ["node-0"],
  "materialInputs": [{"code":"M-00-001","qty":10.5,"required":true}],
  "outputCode": "M-10-001",
  "outputQty": 100
}
```

- Notes:
- The backend `enrich` step will compute `effectiveTime` using inverse proportionality: effectiveTime = nominalTime / efficiency. For example, if `nominalTime = 30` minutes and `efficiency = 1.0` (100%), then `effectiveTime = 30/1.0 = 30` minutes; if `efficiency = 0.8` (80%), then `effectiveTime = 30/0.8 = 37.5` minutes. The backend should use `node.efficiency` (per-node override) if present, otherwise `operation.defaultEfficiency`, otherwise fall back to `1.0`.
- Frontend should stop shipping `executionGraph[]`. If UI currently uses `executionGraph` internally, keep that as transient in the frontend app state only (not persisted).

**3) Assignment (runtime) canonical schema (mes-worker-assignments)**
- Keep existing `WO-` id format. Required runtime fields are explicit.
```json
{
  "id":"WO-2025-001-01",
  "planId":"PLAN-001",
  "nodeId":"node-1",
  "nodeName":"Kesim Operasyonu",
  "operationId":"OP-001",
  "workerId":"W-001",
  "stationId":"ST-001",
  "substationId":"SUB-001-A",
  "plannedStart":"2025-11-14T08:00:00Z",
  "plannedEnd":"2025-11-14T09:00:00Z",
  "nominalTime":60,
  "effectiveTime":75,
  "status":"pending|in_progress|paused|completed|cancelled",
  "preProductionReservedAmount":{"M-00-001":11},
  "actualReservedAmounts":{"M-00-001":8},
  "materialReservationStatus":"pending|reserved|consumed",
  "actualStart":null,
  "actualEnd":null,
  "pausedAt":null,
  "currentPauseStart":null,
  "totalPausedTime":0
}
```

**4) Material document and Stock Movement — keep current model, ensure consistent fields**
- `materials/{code}`: `{ code, name, stock, wipReserved, unit, costPrice }`
- `stock-movements/{id}`: Detailed schema:
```json
{
  "materialCode": "M-00-001",
  "type": "out",                    // "in" | "out"
  "subType": "wip_reservation",    // "wip_reservation" | "production_consumption" | "production_output"
  "quantity": 8,                     // Actual quantity moved
  "requestedQuantity": 11,           // What was requested (for partial reservation tracking)
  "partialReservation": true,        // true if quantity < requestedQuantity
  "stockBefore": 20,
  "stockAfter": 12,
  "wipReservedBefore": 5,
  "wipReservedAfter": 13,
  "reference": "WO-001-01",          // Assignment ID
  "referenceType": "mes_task_start", // "mes_task_start" | "mes_task_complete"
  "relatedPlanId": "PLAN-001",
  "relatedNodeId": "node-1",
  "warning": "Partial reservation: requested 11, reserved 8 due to insufficient stock",
  "notes": "Material reserved for task start",
  "movementDate": "2025-11-14T08:00:00Z",
  "createdAt": "2025-11-14T08:00:00Z"
}
```

---

**Optimized process (step-by-step)**

**A. Plan creation / save (frontend → backend)**
- Frontend sends canonical `nodes[]` only (normalized names). No `executionGraph`.
- Backend validates plan using `validateProductionPlanNodes(nodes)` against JSON schema. Fail early on missing fields.
- Backend runs `enrichNodesWithEstimatedTimes(nodes, planData, db)` which:
  - Normalizes node ids and durations (already canonical) — compute `effectiveTime`, `estimatedStart`, `estimatedEnd` if desired for preview.
  - Returns `enrichedNodes` which are the node snapshots used to compute `executionGraph` when launching.
- Backend persists `plan.nodes = enrichedNodes` and may optionally store `plan._derivedExecutionGraph` as a cache with a `derivedAt` timestamp and `derivedFromHash` to detect staleness.

**B. Launch (POST /production-plans/:planId/launch)**
- Backend loads `plan.nodes` (canonical) and computes a topological order (`buildTopologicalOrder(nodes)`).
- For each node in order, `assignNodeResources(node, ...)` selects worker/station/substation and computes plannedStart/plannedEnd based on:
  - worker schedule
  - substation workload (keyed by `substationId`) — note: do not key by `stationId`
  - predecessor `end` times
- `assignNodeResources` returns an Assignment object (per canonical schema) for each node — then the backend writes assignments in a transaction.
- **Material pre-reservations**: compute `preProductionReservedAmount` for each assignment and store it in assignments; do NOT adjust material stock at launch. Actual reservation occurs only on task start.

**C. Start (PATCH assignment with action=start)**
- Backend verifies assignment status (pending|paused) and validates worker/substation current availability.
- Backend performs material reservation in a Firestore transaction:
  - For each material in `preProductionReservedAmount`: compute `actualReserved = min(material.stock, requested)`.
  - Update material: `stock -= actualReserved; wipReserved += actualReserved`.
  - Create `stock-movement` with `requestedQuantity` and `actualQuantity` and warning if partial.
  - Record `assignment.actualReservedAmounts` = map of `actualReserved` values.
- Update assignment: `status='in_progress'`, set `actualStart` (if null), set `materialReservationStatus='reserved'`.
- Update `mes-workers` and `mes-substations` currentTask/currentOperation fields.

**D. Pause / Resume**
- Pause: only update assignment metadata (`status='paused'`, `pausedAt`, `currentPauseStart`) and worker state; do not modify material reservations.
- Resume: compute pause duration as `now - currentPauseStart`, accumulate `totalPausedTime`, clear `currentPauseStart`, set status to `in_progress` and continue.

**E. Complete**
- Backend runs a transaction to finalize material consumption and produce output:
  - Read `assignment.actualReservedAmounts` (use as cap) and `node.materialInputs` & node.outputQty.
  - Compute `totalProduced = actualOutput + defects` (validate numbers exist and are non-negative).
  - For each input material, theoreticalConsumption = totalProduced × (inputQty / node.outputQty).
  - **Actual consumption = min(theoreticalConsumption, actualReservedAmounts[mat])** — This is the invariant: consumption must be <= reserved.
  - Update material documents:
    - `wipReserved -= actualReservedAmounts[mat]` (release all reserved)
    - `stock += (actualReservedAmounts[mat] - consumed)` (return leftover to stock if consumed < reserved)
  - Create stock-movements:
    - One per input material: `type='out'`, `subType='production_consumption'`, `quantity=consumed`
    - One for output material: `type='in'`, `subType='production_output'`, `quantity=actualOutput`
    - If defects > 0, log in assignment but do not create stock movement (defects don't go to stock)
- Update assignment: `status='completed'`, set `actualEnd` (or read legacy `actualFinish`), record `materialConsumptionResults` (consumed, released), set `materialReservationStatus='consumed'`.
- Clear `worker.currentTask` and `substation.currentOperation`.

---

**Validation & invariants (server-side enforcement)**
- Node must have: `id`, `nominalTime` (integer >0), `materialInputs[]` (if any), `outputQty` (if node generates WIP/output) and valid `predecessors` referencing existing node ids.
- **Cross-validation:** If both `nodes[]` and `executionGraph[]` exist, verify they have matching node IDs and warn on schema mismatches.
- **Assignment mode validation:** If `assignmentMode='manual'`, require `assignedWorkerId` to be set and valid.
- On start: atomic reservation transaction; if partial reservation occurs (`actualReservedAmounts < preProductionReservedAmount`), create stock-movement with `partialReservation=true`, `warning` field populated, and log metrics. Return `409` with details unless client specified `forceStart=true`.
- On complete: assert `actualOutput + defects >= 0`, and consumption calculations use `actualReservedAmounts` cap (invariant: `consumed[material] <= actualReservedAmounts[material]`). Return unused material to stock.
- Pause/resume: ensure `currentPauseStart` is set only by pause, cleared by resume, and accumulate `totalPausedTime` (ms).
- **Legacy field handling:** Read `actualFinish` as fallback to `actualEnd` for backward compatibility with old assignment documents.

---

**API contract changes (summary)**
- `POST /api/mes/production-plans` — Accepts canonical `nodes[]` only. Backend will compute derived data. Backwards compatibility: if `executionGraph` present, accept and derive nodes from it (but log deprecation). Prefer `nodes[]`.
- `PUT /api/mes/production-plans/:id` — Validate `nodes[]` similarly.
- `POST /api/mes/production-plans/:planId/launch` — Use `plan.nodes` on server to derive assignments.
- `PATCH /api/mes/worker-assignments/:assignmentId` (actions: start, pause, resume, complete) — no change to contract, but server must rely on canonical fields.

**Deprecated field mappings (for migration compatibility):**
- `node.time` / `node.estimatedNominalTime` / `node.duration` → `node.nominalTime`
- `node.skills` → `node.requiredSkills`
- `node.nodeId` → `node.id`
- `node.assignedStationId` (string) → `node.assignedStations` (array)
- `node.allocationType` → `node.assignmentMode`
- `node.workerHint.workerId` → `node.assignedWorkerId`
- `assignment.actualFinish` → `assignment.actualEnd`

---

**Migration strategy for existing plans (practical)**
- On-read fallback: keep code paths that prefer `plan.nodes` but if missing, read `plan.executionGraph` and convert to canonical `nodes[]` in memory.
- Batch migration (safe approach):
  1. Run a dry-run script: for each plan, check if `executionGraph` exists and `nodes` are missing or inconsistent. Compute canonical `nodesFromGraph` and compare to stored `nodes`. Report diffs.
  2. If dry-run ok, run migration: write `nodes = canonicalNodes` and set `meta.migratedExecutionGraphToNodes = { at, by }`.
  3. Keep `executionGraph` as deprecated field for 2 release cycles, then remove.

**Dry-run command (example)**
```bash
# Example pseudo-command to run migration dry-run script
node scripts/migrateExecutionGraphToNodes.js --dry-run
```

---

**Frontend changes (minimal)**
- `planDesigner.js`:
  - Stop calling `buildExecutionGraph()` and stop including `executionGraph` in the plan payload.
  - Map UI node fields to canonical names before sending: `time->nominalTime`, `skills->requiredSkills`, `assignedStationId -> assignedStations` (wrap in array).
  - Keep `buildExecutionGraph()` only for internal UI rendering (if needed) but do not persist it.
- Update any other front-end code that reads `executionGraph` to fallback to `nodes`.

---

**Where to change in the current codebase (concrete pointers)**
- Frontend: `/quote-portal/domains/production/js/planDesigner.js` — remove `executionGraph` in saved payload, and ensure sanitizedNodes map uses canonical fields (lines referenced in earlier analysis).
- Backend: `/quote-portal/server/mesRoutes.js` —
  - `enrichNodesWithEstimatedTimes(nodes, executionGraph, ...)` → change signature to `enrichNodesWithEstimatedTimes(nodes, planData, db)` and treat input as canonical nodes.
  - `validateProductionPlanNodes(nodes, executionGraph = null)` → change to accept `nodes` only.
  - Launch code: prefer `plan.nodes` and if `executionGraph` exists use it only as fallback.
- Worker portal: continue to read assignment.nodeId but ensure assignment.nodeId is canonical node id.

---

**Testing checklist (high level)**
- Unit tests for validation schema.
- Integration tests: create plan (nodes only) → launch → assignments created correctly (substation scheduling works) → start action reserves materials with partial stock → complete action consumes and produces outputs correctly.
- Regression tests for old documents with `actualFinish` field.

---

**Observability & monitoring**
- Add metrics and alerts for:
  - `reservationMismatchRate` = fraction of starts where `actualReservedAmounts < preProductionReservedAmount`.
  - `nodesExecutionGraphDivergence` during migration (count of plans where node IDs don't match).
  - Frequent partial reservations per material code.
  - `partialReservationCount` = total count of stock-movements with `partialReservation=true`.
  - `manualAssignmentFailureRate` = fraction of manual assignments where specified worker is not available.
  - `legacyFieldUsageCount` = count of reads from deprecated fields (actualFinish, time, skills, etc.).

---

**Rollout plan (safe)**
1. Implement backend changes behind a feature flag: `FEATURE_CANONICAL_NODES=true`.
2. Deploy backend to staging. Point frontend staging to backend and test flows.
3. Deploy frontend changes to staging (stops sending executionGraph). Validate plan creation and launch flows.
4. Run migration dry-run and verify no diffs.
5. Opt-in migrate a subset of plans (small production sample) with monitoring enabled.
6. If stable, schedule full migration and remove fallback code 2 releases later.

---

**Appendix A — ASCII sequence (end-to-end)**
```
Frontend (planDesigner)        Backend (mesRoutes)            Firestore
      |                             |                            |
      | POST /production-plans      |                            |
      | nodes[] (canonical)         |                            |
      |---------------------------->| validate nodes schema       |
      |                             | enrichNodesWithEstimated... |
      |                             | write mes-production-plans  |
      |                             |--------------------------->|
      |                             |                            |
      | Release -> POST /launch     |                            |
      |---------------------------->| build topological order    |
      |                             | assignNodeResources per node|
      |                             | create mes-worker-assignments|
      |                             |--------------------------->|
      |                             |                            |
      | Worker calls PATCH start    |                            |
      |---------------------------->| reserve materials (tx)     |
      |                             | update assignment status   |
      |                             | update mes-substations     |
      |                             |--------------------------->|
      |                             |                            |
      | Worker calls PATCH complete |                            |
      |---------------------------->| consume materials (tx)     |
      |                             | create stock movements     |
      |                             | update assignment status   |
      |                             |--------------------------->|
```

---

**Appendix B — Quick checklist for implementation (developer)**
1. Add JSON Schemas in server for Plan/Node/Assignment.
2. Update `planDesigner.js` send payload and sanitize mapping.
3. Change `enrichNodesWithEstimatedTimes` signature and logic to accept canonical nodes only.
4. Update `validateProductionPlanNodes` to use nodes only.
5. Update `launch` endpoint to prefer `plan.nodes` and fallback to `executionGraph` only when present (log deprecation).
6. Add unit tests and migration dry-run script.

---

## End-to-End Process Flow (Detailed)

This section provides comprehensive documentation of the complete MES process lifecycle, from plan creation through execution completion. Each flow includes detailed ASCII sequence diagrams, data structures, function calls, and error handling.

---

### 1. Plan Creation Flow

**Overview:** Designer creates a production plan in the frontend, sends canonical nodes to backend, which validates, enriches, and persists to Firestore.

**ASCII Sequence Diagram:**
```
┌──────────────┐         ┌──────────────┐         ┌─────────────────┐         ┌───────────┐
│ Plan Designer│         │  mesApi.js   │         │  mesRoutes.js   │         │ Firestore │
│   (Frontend) │         │  (Frontend)  │         │   (Backend)     │         │           │
└──────┬───────┘         └──────┬───────┘         └────────┬────────┘         └─────┬─────┘
       │                        │                          │                        │
       │ User designs plan      │                          │                        │
       │ with nodes             │                          │                        │
       │────────────────>       │                          │                        │
       │                        │                          │                        │
       │ savePlanDraft()        │                          │                        │
       │────────────────>       │                          │                        │
       │                        │                          │                        │
       │                        │ POST /api/mes/          │                        │
       │                        │  production-plans        │                        │
       │                        │ Body: {                  │                        │
       │                        │   orderCode,             │                        │
       │                        │   quantity,              │                        │
       │                        │   nodes: [canonical]     │                        │
       │                        │ }                        │                        │
       │                        │─────────────────────────>│                        │
       │                        │                          │                        │
       │                        │                          │ validateProductionPlan │
       │                        │                          │ Nodes(req.body.nodes)  │
       │                        │                          │<────────────           │
       │                        │                          │                        │
       │                        │                          │ enrichNodesWithEstimated│
       │                        │                          │ Times(nodes, planData, │
       │                        │                          │ db)                    │
       │                        │                          │<────────────           │
       │                        │                          │                        │
       │                        │                          │ Firestore.collection(  │
       │                        │                          │  'mes-production-plans')│
       │                        │                          │ .add(plan)             │
       │                        │                          │───────────────────────>│
       │                        │                          │                        │
       │                        │                          │      Plan saved        │
       │                        │                          │<───────────────────────│
       │                        │                          │                        │
       │                        │   Response: {plan}       │                        │
       │                        │<─────────────────────────│                        │
       │                        │                          │                        │
       │   Plan saved success   │                          │                        │
       │<───────────────        │                          │                        │
       │                        │                          │                        │
```

**Input Data Structure:**
```javascript
// POST /api/mes/production-plans
{
  "orderCode": "WO-2025-001",
  "quantity": 100,
  "notes": "Production plan for order 001",
  "nodes": [
    {
      "id": "node-1",
      "name": "Kesim Operasyonu",
      "operationId": "OP-001",
      "nominalTime": 60,              // Canonical: minutes
      "efficiency": 0.85,              // Optional per-node override
      "requiredSkills": ["welding"],   // Canonical: array
      "assignedStations": [            // Canonical: array format
        {"stationId": "ST-001", "priority": 1}
      ],
      "assignedSubstations": ["SUB-001-A"],
      "assignmentMode": "auto",
      "assignedWorkerId": null,
      "predecessors": [],
      "materialInputs": [
        {"code": "M-00-001", "qty": 10.5, "required": true}
      ],
      "outputCode": "M-10-001",
      "outputQty": 100
    }
  ]
}
```

**Functions Called:**
- **File:** `/quote-portal/domains/production/js/planDesigner.js`
  - **Function:** `savePlanDraft()`
  - **Responsibility:** Sanitize nodes, map to canonical schema, call API

- **File:** `/quote-portal/domains/production/js/mesApi.js`
  - **Function:** `createProductionPlan(planData)`
  - **Responsibility:** Make HTTP POST request to backend

- **File:** `/quote-portal/server/mesRoutes.js`
  - **Function:** `validateProductionPlanNodes(nodes)`
  - **Responsibility:** Validate canonical schema (id, nominalTime > 0, valid predecessors)
  - **Function:** `enrichNodesWithEstimatedTimes(nodes, planData, db)`
  - **Responsibility:** Compute effectiveTime, estimatedStart/End for each node

**Key Variables Modified:**
- `plan.nodes` — Enriched with `effectiveTime`, `estimatedStart`, `estimatedEnd`
- `plan.status` — Set to `'draft'`
- `plan.createdAt` — Timestamp
- `plan.id` — Generated plan ID (e.g., `PLAN-001`)

**Output/Side Effects:**
- New document written to Firestore: `mes-production-plans/{planId}`
- Response returned to frontend with saved plan object

**Data Transformation Example:**
```javascript
// Frontend sends:
node.time = 60  // (legacy field)

// Backend sanitizes to canonical:
node.nominalTime = 60

// Backend enriches:
node.effectiveTime = Math.round(60 / (node.efficiency || operation.defaultEfficiency || 1.0))
// If efficiency = 0.85: effectiveTime = Math.round(60 / 0.85) = 71 minutes
```

**Error Conditions:**
- **400 Bad Request:** Invalid node schema (missing `id`, `nominalTime <= 0`, invalid `predecessors`)
  - Rollback: No Firestore write, return validation errors
- **500 Internal Server Error:** Enrichment fails (operation not found, DB error)
  - Rollback: No Firestore write, log error

**Backward Compatibility:**
- If request contains `executionGraph[]`, log deprecation warning and prefer `nodes[]`
- Backend does NOT save `executionGraph` in new plans

---

### 2. Enrichment Step (Server-Side)

**Overview:** Backend enriches canonical nodes with computed fields (effectiveTime, estimatedStart/End) by loading operation metadata and applying efficiency calculations.

**ASCII Flow:**
```
┌─────────────────────────────────────────────────────────────────┐
│  enrichNodesWithEstimatedTimes(nodes, planData, db)             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │ For each node in nodes[]                │
        └─────────────────┬───────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────────┐
        │ Load operation from mes-operations      │
        │ operationDoc = await db.collection(     │
        │   'mes-operations').doc(operationId).get│
        └─────────────────┬───────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────────┐
        │ Compute effectiveTime:                  │
        │ efficiency = node.efficiency ||         │
        │              operation.defaultEfficiency│
        │              || 1.0                      │
        │ effectiveTime = Math.round(             │
        │   node.nominalTime / efficiency         │
        │ )                                       │
        └─────────────────┬───────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────────┐
        │ Compute estimatedStart/End:             │
        │ - Build dependency graph                │
        │ - For each node in topological order:   │
        │   estimatedStart = max(predecessors'    │
        │     estimatedEnd)                       │
        │   estimatedEnd = estimatedStart +       │
        │     effectiveTime                       │
        └─────────────────┬───────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────────┐
        │ Return enrichedNodes[]                  │
        │ (with effectiveTime, estimatedStart,    │
        │  estimatedEnd)                          │
        └─────────────────────────────────────────┘
```

**Input:**
```javascript
nodes = [
  {
    id: "node-1",
    operationId: "OP-001",
    nominalTime: 60,
    efficiency: 0.8,  // Optional override
    predecessors: []
  }
]
planData = { orderCode: "WO-2025-001", quantity: 100 }
db = FirestoreInstance
```

**Function Logic:**
```javascript
async function enrichNodesWithEstimatedTimes(nodes, planData, db) {
  const enrichedNodes = [];
  
  for (const node of nodes) {
    // Load operation metadata
    const operationDoc = await db.collection('mes-operations')
      .doc(node.operationId).get();
    const operation = operationDoc.data();
    
    // Compute effectiveTime using inverse proportionality
    const efficiency = node.efficiency 
      || operation.defaultEfficiency 
      || 1.0;
    const effectiveTime = Math.round(node.nominalTime / efficiency);
    
    enrichedNodes.push({
      ...node,
      effectiveTime,
      // estimatedStart/End computed in next pass
    });
  }
  
  // Compute estimated times based on dependencies
  const sortedNodes = buildTopologicalOrder(enrichedNodes);
  const times = {};
  
  for (const node of sortedNodes) {
    const predecessorEnds = node.predecessors.map(p => times[p]?.end || 0);
    const start = Math.max(...predecessorEnds, 0);
    const end = start + node.effectiveTime;
    
    times[node.id] = { start, end };
    node.estimatedStart = start;
    node.estimatedEnd = end;
  }
  
  return enrichedNodes;
}
```

**Key Variables:**
- `operation.defaultEfficiency` — Read from `mes-operations` collection
- `node.effectiveTime` — Computed: `nominalTime / efficiency`
- `node.estimatedStart` — Computed based on predecessor dependencies
- `node.estimatedEnd` — Computed: `estimatedStart + effectiveTime`

**Output:**
```javascript
enrichedNodes = [
  {
    id: "node-1",
    operationId: "OP-001",
    nominalTime: 60,
    efficiency: 0.8,
    effectiveTime: 75,        // 60 / 0.8 = 75
    estimatedStart: 0,
    estimatedEnd: 75,
    // ... other fields
  }
]
```

**Error Conditions:**
- Operation not found in `mes-operations` → Log warning, use efficiency = 1.0
- Invalid predecessors (circular dependency) → Throw error, return 400

---

### 3. Launch Flow

**Overview:** Backend loads plan.nodes, builds topological order, assigns resources (worker/station/substation) to each node, computes planned times, and creates assignments with material pre-reservations.

**ASCII Sequence Diagram:**
```
┌──────────────┐         ┌─────────────────┐         ┌───────────┐
│   Frontend   │         │  mesRoutes.js   │         │ Firestore │
└──────┬───────┘         └────────┬────────┘         └─────┬─────┘
       │                          │                        │
       │ POST /production-plans/  │                        │
       │   :planId/launch         │                        │
       │─────────────────────────>│                        │
       │                          │                        │
       │                          │ Load plan from DB      │
       │                          │───────────────────────>│
       │                          │<───────────────────────│
       │                          │                        │
       │                          │ nodesToUse = plan.nodes│
       │                          │  || plan.executionGraph│
       │                          │                        │
       │                          │ buildTopologicalOrder( │
       │                          │  nodesToUse)           │
       │                          │<────────────           │
       │                          │                        │
       │                          │ Load workers, stations,│
       │                          │  substations from DB   │
       │                          │───────────────────────>│
       │                          │<───────────────────────│
       │                          │                        │
       │                          │ For each node (in      │
       │                          │  topological order):   │
       │                          │                        │
       │                          │  assignNodeResources(  │
       │                          │   node, predecessorTimes│
       │                          │   workers, substations,│
       │                          │   workersSchedule,     │
       │                          │   substationsSchedule) │
       │                          │<────────────           │
       │                          │                        │
       │                          │  → Returns assignment  │
       │                          │    with:               │
       │                          │    - workerId          │
       │                          │    - stationId         │
       │                          │    - substationId      │
       │                          │    - plannedStart/End  │
       │                          │    - preProductionReserved│
       │                          │      Amount            │
       │                          │                        │
       │                          │ Batch write assignments│
       │                          │  to Firestore          │
       │                          │───────────────────────>│
       │                          │<───────────────────────│
       │                          │                        │
       │                          │ Update plan.status =   │
       │                          │  'released'            │
       │                          │───────────────────────>│
       │                          │                        │
       │   Response: {assignments}│                        │
       │<─────────────────────────│                        │
       │                          │                        │
```

**Input:**
```javascript
// POST /api/mes/production-plans/:planId/launch
// No body required, planId in URL
```

**Functions Called:**
- **File:** `/quote-portal/server/mesRoutes.js`
  - **Function:** `buildTopologicalOrder(nodes)`
    - Returns nodes sorted by dependencies (predecessors first)
  - **Function:** `assignNodeResources(node, predecessorTimes, workers, substations, stations, workersSchedule, substationsSchedule, db)`
    - Selects optimal worker/station/substation
    - Computes plannedStart/plannedEnd based on schedules and predecessor times
    - Computes `preProductionReservedAmount` from `node.materialInputs`

**assignNodeResources Logic:**
```javascript
function assignNodeResources(node, predecessorTimes, workers, substations, stations, workersSchedule, substationsSchedule, db) {
  // 1. Determine start time
  const predecessorEnds = node.predecessors.map(p => predecessorTimes[p]);
  const earliestStart = Math.max(...predecessorEnds, Date.now());
  
  // 2. Select worker with required skills
  const availableWorkers = workers.filter(w => 
    node.requiredSkills.every(skill => w.skills.includes(skill))
  );
  const selectedWorker = availableWorkers[0]; // Simplified selection
  
  // 3. Select substation (keyed by substationId, NOT stationId)
  const substation = substations.find(s => 
    node.assignedSubstations?.includes(s.id) || 
    s.stationId === node.assignedStations[0]?.stationId
  );
  
  // 4. Compute planned times based on substation schedule
  const substationNextAvailable = substationsSchedule[substation.id] || earliestStart;
  const plannedStart = new Date(Math.max(earliestStart, substationNextAvailable));
  const plannedEnd = new Date(plannedStart.getTime() + node.effectiveTime * 60000);
  
  // 5. Update schedules
  substationsSchedule[substation.id] = plannedEnd.getTime();
  workersSchedule[selectedWorker.id] = plannedEnd.getTime();
  
  // 6. Compute material pre-reservations
  const preProductionReservedAmount = {};
  for (const input of node.materialInputs || []) {
    preProductionReservedAmount[input.code] = input.qty * planData.quantity / node.outputQty;
  }
  
  // 7. Return assignment object
  return {
    id: `WO-${planId}-${assignmentCounter++}`,
    planId,
    nodeId: node.id,
    nodeName: node.name,
    operationId: node.operationId,
    workerId: selectedWorker.id,
    stationId: substation.stationId,
    substationId: substation.id,  // Canonical: use substationId
    plannedStart: plannedStart.toISOString(),
    plannedEnd: plannedEnd.toISOString(),
    nominalTime: node.nominalTime,
    effectiveTime: node.effectiveTime,
    status: 'pending',
    preProductionReservedAmount,
    actualReservedAmounts: {},
    materialReservationStatus: 'pending',
    actualStart: null,
    actualEnd: null,
    pausedAt: null,
    currentPauseStart: null,
    totalPausedTime: 0
  };
}
```

**Key Variables Modified:**
- `substationsSchedule[substationId]` — Updated with planned end time (key is `substationId`, NOT `stationId`)
- `workersSchedule[workerId]` — Updated with planned end time
- `plan.status` — Changed from `'draft'` to `'released'`

**Output/Side Effects:**
- Multiple documents written to Firestore: `mes-worker-assignments/{assignmentId}`
- Plan document updated: `status = 'released'`, `launchedAt = timestamp`

**Data Transformation Example:**
```javascript
// From node:
node.materialInputs = [
  { code: "M-00-001", qty: 10.5, required: true }
]
node.outputQty = 100
planData.quantity = 50  // Producing 50 units

// Computed in assignment:
assignment.preProductionReservedAmount = {
  "M-00-001": 10.5 * 50 / 100 = 5.25
}
```

**Error Conditions:**
- **404 Not Found:** Plan not found → Return error
- **400 Bad Request:** Plan already launched (status != 'draft') → Return error
- **500 Internal Server Error:** No available workers with required skills → Return error with details
- **Partial assignment failure:** If some nodes fail to assign, rollback transaction

**Backward Compatibility:**
```javascript
// Fallback to executionGraph if nodes not present
const nodesToUse = plan.nodes || plan.executionGraph || [];
if (!plan.nodes && plan.executionGraph) {
  console.warn(`Plan ${planId} using deprecated executionGraph, consider migration`);
}
```

---

### 4. Start Action Flow

**Overview:** Worker starts an assignment, backend performs material reservation in a transaction, updating material stock and wipReserved, creating stock-movements, and recording actual reserved amounts.

**ASCII Sequence Diagram:**
```
┌──────────────┐         ┌─────────────────┐         ┌───────────┐
│ Worker Portal│         │  mesRoutes.js   │         │ Firestore │
└──────┬───────┘         └────────┬────────┘         └─────┬─────┘
       │                          │                        │
       │ PATCH /worker-assignments│                        │
       │   /:assignmentId         │                        │
       │ Body: {action: 'start'}  │                        │
       │─────────────────────────>│                        │
       │                          │                        │
       │                          │ Load assignment from DB│
       │                          │───────────────────────>│
       │                          │<───────────────────────│
       │                          │                        │
       │                          │ Validate status        │
       │                          │ (must be pending or    │
       │                          │  paused)               │
       │                          │                        │
       │                          │ BEGIN TRANSACTION      │
       │                          │───────────────────────>│
       │                          │                        │
       │                          │ For each material in   │
       │                          │ preProductionReserved  │
       │                          │ Amount:                │
       │                          │                        │
       │                          │  Load material doc     │
       │                          │───────────────────────>│
       │                          │<───────────────────────│
       │                          │                        │
       │                          │  actualReserved =      │
       │                          │   min(material.stock,  │
       │                          │       requested)       │
       │                          │                        │
       │                          │  Update material:      │
       │                          │   stock -= actualReserved│
       │                          │   wipReserved +=       │
       │                          │     actualReserved     │
       │                          │───────────────────────>│
       │                          │                        │
       │                          │  Create stock-movement:│
       │                          │   type: 'out'          │
       │                          │   subType: 'wip_       │
       │                          │     reservation'       │
       │                          │   requestedQuantity    │
       │                          │   actualQuantity       │
       │                          │   partialReservation   │
       │                          │   warning (if partial) │
       │                          │───────────────────────>│
       │                          │                        │
       │                          │ Update assignment:     │
       │                          │  status = 'in_progress'│
       │                          │  actualStart = now     │
       │                          │  actualReservedAmounts │
       │                          │  materialReservation   │
       │                          │   Status = 'reserved'  │
       │                          │───────────────────────>│
       │                          │                        │
       │                          │ Update worker:         │
       │                          │  currentTask = assignmentId│
       │                          │───────────────────────>│
       │                          │                        │
       │                          │ Update substation:     │
       │                          │  currentOperation =    │
       │                          │    assignmentId        │
       │                          │───────────────────────>│
       │                          │                        │
       │                          │ COMMIT TRANSACTION     │
       │                          │<───────────────────────│
       │                          │                        │
       │   Response: {assignment, │                        │
       │    partialReservations}  │                        │
       │<─────────────────────────│                        │
       │                          │                        │
```

**Input:**
```javascript
// PATCH /api/mes/worker-assignments/:assignmentId
{
  "action": "start"
}
```

**Functions Called:**
- **File:** `/quote-portal/server/mesRoutes.js`
  - **Endpoint:** `PATCH /worker-assignments/:assignmentId`
  - **Transaction Logic:** Material reservation in Firestore transaction

**Material Reservation Transaction Logic:**
```javascript
await db.runTransaction(async (transaction) => {
  // 1. Load assignment
  const assignmentRef = db.collection('mes-worker-assignments').doc(assignmentId);
  const assignment = (await transaction.get(assignmentRef)).data();
  
  // 2. Validate status
  if (!['pending', 'paused'].includes(assignment.status)) {
    throw new Error('Invalid status for start action');
  }
  
  // 3. Reserve materials
  const actualReservedAmounts = {};
  const partialReservations = [];
  
  for (const [materialCode, requestedQty] of Object.entries(assignment.preProductionReservedAmount)) {
    const materialRef = db.collection('materials').doc(materialCode);
    const material = (await transaction.get(materialRef)).data();
    
    // Compute actual reservation (capped by available stock)
    const actualReserved = Math.min(material.stock, requestedQty);
    actualReservedAmounts[materialCode] = actualReserved;
    
    // Check for partial reservation
    const isPartial = actualReserved < requestedQty;
    if (isPartial) {
      partialReservations.push({
        materialCode,
        requested: requestedQty,
        actual: actualReserved
      });
      console.warn(`Partial reservation for ${materialCode}: requested ${requestedQty}, reserved ${actualReserved}`);
    }
    
    // Update material stock and wipReserved
    transaction.update(materialRef, {
      stock: material.stock - actualReserved,
      wipReserved: material.wipReserved + actualReserved
    });
    
    // Create stock-movement
    const movementRef = db.collection('stock-movements').doc();
    transaction.set(movementRef, {
      materialCode,
      type: 'out',
      subType: 'wip_reservation',
      quantity: actualReserved,
      requestedQuantity: requestedQty,
      partialReservation: isPartial,
      stockBefore: material.stock,
      stockAfter: material.stock - actualReserved,
      wipReservedBefore: material.wipReserved,
      wipReservedAfter: material.wipReserved + actualReserved,
      reference: assignmentId,
      referenceType: 'mes_task_start',
      relatedPlanId: assignment.planId,
      relatedNodeId: assignment.nodeId,
      warning: isPartial ? `Partial reservation: requested ${requestedQty}, reserved ${actualReserved} due to insufficient stock` : null,
      notes: 'Material reserved for task start',
      movementDate: new Date().toISOString(),
      createdAt: new Date().toISOString()
    });
  }
  
  // 4. Update assignment
  transaction.update(assignmentRef, {
    status: 'in_progress',
    actualStart: assignment.actualStart || new Date().toISOString(),
    actualReservedAmounts,
    materialReservationStatus: 'reserved'
  });
  
  // 5. Update worker
  const workerRef = db.collection('mes-workers').doc(assignment.workerId);
  transaction.update(workerRef, {
    currentTask: assignmentId,
    status: 'working'
  });
  
  // 6. Update substation
  const substationRef = db.collection('mes-substations').doc(assignment.substationId);
  transaction.update(substationRef, {
    currentOperation: assignmentId,
    status: 'occupied'
  });
  
  return { actualReservedAmounts, partialReservations };
});
```

**Key Variables Modified:**
- `material.stock` — Decreased by `actualReserved`
- `material.wipReserved` — Increased by `actualReserved`
- `assignment.status` — Changed to `'in_progress'`
- `assignment.actualStart` — Set to current timestamp (if not already set from previous pause)
- `assignment.actualReservedAmounts` — Recorded actual amounts reserved
- `assignment.materialReservationStatus` — Changed to `'reserved'`
- `worker.currentTask` — Set to `assignmentId`
- `substation.currentOperation` — Set to `assignmentId`

**Output/Side Effects:**
- Material documents updated (stock/wipReserved)
- Stock-movement documents created (one per material)
- Assignment document updated
- Worker document updated
- Substation document updated

**Data Transformation Example:**
```javascript
// Assignment has:
assignment.preProductionReservedAmount = {
  "M-00-001": 10.5
}

// Material has:
material.stock = 8  // Insufficient!

// After transaction:
assignment.actualReservedAmounts = {
  "M-00-001": 8  // Capped at available stock
}

// Stock-movement created:
{
  materialCode: "M-00-001",
  type: "out",
  subType: "wip_reservation",
  quantity: 8,
  requestedQuantity: 10.5,
  partialReservation: true,
  warning: "Partial reservation: requested 10.5, reserved 8 due to insufficient stock",
  // ... other fields
}
```

**Invariants Enforced:**
- `actualReserved <= requestedAmount` (always true by using `Math.min`)
- `actualReserved <= material.stock` (before reservation)
- Transaction ensures atomicity: either all materials reserved or none

**Error Conditions:**
- **400 Bad Request:** Invalid status (assignment not in 'pending' or 'paused')
- **409 Conflict:** Partial reservation occurred
  - If `forceStart=false` in request, return 409 with details
  - If `forceStart=true`, proceed and return warning
- **500 Internal Server Error:** Transaction fails → Rollback all changes

**Monitoring:**
- Log metric: `reservation_mismatch_count` when partial reservation occurs
- Log warning with full context (assignmentId, materialCode, requested, actual)

---

### 5. Pause/Resume Actions Flow

**Overview:** Worker pauses or resumes an assignment, backend updates assignment metadata and tracks pause duration, without modifying material reservations.

**ASCII Sequence Diagram:**
```
┌──────────────┐         ┌─────────────────┐         ┌───────────┐
│ Worker Portal│         │  mesRoutes.js   │         │ Firestore │
└──────┬───────┘         └────────┬────────┘         └─────┬─────┘
       │                          │                        │
       │ ════════ PAUSE ═════════ │                        │
       │                          │                        │
       │ PATCH /worker-assignments│                        │
       │   /:assignmentId         │                        │
       │ Body: {action: 'pause'}  │                        │
       │─────────────────────────>│                        │
       │                          │                        │
       │                          │ Load assignment        │
       │                          │───────────────────────>│
       │                          │<───────────────────────│
       │                          │                        │
       │                          │ Validate status        │
       │                          │ (must be 'in_progress')│
       │                          │                        │
       │                          │ Update assignment:     │
       │                          │  status = 'paused'     │
       │                          │  pausedAt = now        │
       │                          │  currentPauseStart =now│
       │                          │───────────────────────>│
       │                          │                        │
       │                          │ Update worker:         │
       │                          │  status = 'paused'     │
       │                          │───────────────────────>│
       │                          │                        │
       │   Response: {assignment} │                        │
       │<─────────────────────────│                        │
       │                          │                        │
       │                          │                        │
       │ ════════ RESUME ════════ │                        │
       │                          │                        │
       │ PATCH /worker-assignments│                        │
       │   /:assignmentId         │                        │
       │ Body: {action: 'resume'} │                        │
       │─────────────────────────>│                        │
       │                          │                        │
       │                          │ Load assignment        │
       │                          │───────────────────────>│
       │                          │<───────────────────────│
       │                          │                        │
       │                          │ Validate status        │
       │                          │ (must be 'paused')     │
       │                          │                        │
       │                          │ pauseDuration =        │
       │                          │  now - currentPauseStart│
       │                          │                        │
       │                          │ Update assignment:     │
       │                          │  status = 'in_progress'│
       │                          │  totalPausedTime +=    │
       │                          │    pauseDuration       │
       │                          │  currentPauseStart=null│
       │                          │───────────────────────>│
       │                          │                        │
       │                          │ Update worker:         │
       │                          │  status = 'working'    │
       │                          │───────────────────────>│
       │                          │                        │
       │   Response: {assignment} │                        │
       │<─────────────────────────│                        │
       │                          │                        │
```

**Input:**
```javascript
// Pause:
// PATCH /api/mes/worker-assignments/:assignmentId
{ "action": "pause" }

// Resume:
// PATCH /api/mes/worker-assignments/:assignmentId
{ "action": "resume" }
```

**Functions Called:**
- **File:** `/quote-portal/server/mesRoutes.js`
  - **Endpoint:** `PATCH /worker-assignments/:assignmentId`
  - **Logic:** Simple metadata update (no material changes)

**Pause Logic:**
```javascript
// Validate status
if (assignment.status !== 'in_progress') {
  return res.status(400).json({ error: 'Cannot pause: assignment not in progress' });
}

// Update assignment
await assignmentRef.update({
  status: 'paused',
  pausedAt: new Date().toISOString(),
  currentPauseStart: Date.now()
});

// Update worker
await workerRef.update({
  status: 'paused'
});
```

**Resume Logic:**
```javascript
// Validate status
if (assignment.status !== 'paused') {
  return res.status(400).json({ error: 'Cannot resume: assignment not paused' });
}

// Compute pause duration
const pauseDuration = Date.now() - assignment.currentPauseStart;

// Update assignment
await assignmentRef.update({
  status: 'in_progress',
  totalPausedTime: (assignment.totalPausedTime || 0) + pauseDuration,
  currentPauseStart: null
});

// Update worker
await workerRef.update({
  status: 'working'
});
```

**Key Variables Modified:**
- **Pause:**
  - `assignment.status` — Changed to `'paused'`
  - `assignment.pausedAt` — Set to current timestamp
  - `assignment.currentPauseStart` — Set to `Date.now()` (milliseconds)
  - `worker.status` — Changed to `'paused'`

- **Resume:**
  - `assignment.status` — Changed back to `'in_progress'`
  - `assignment.totalPausedTime` — Incremented by pause duration
  - `assignment.currentPauseStart` — Cleared (set to `null`)
  - `worker.status` — Changed back to `'working'`

**Output/Side Effects:**
- Assignment document updated (metadata only)
- Worker document updated (status only)
- **No material changes** (reservations remain intact)

**Invariants Enforced:**
- `totalPausedTime` is monotonically increasing
- `currentPauseStart` is `null` when status is not `'paused'`
- Material reservations remain unchanged during pause/resume

**Error Conditions:**
- **400 Bad Request:** Invalid status for action
  - Pause when not `in_progress`
  - Resume when not `paused`

**Monitoring:**
- Track pause durations for productivity analysis
- Alert if `totalPausedTime` exceeds thresholds

---

### 6. Complete Action Flow

**Overview:** Worker completes an assignment, backend performs material consumption transaction (capped by actualReservedAmounts), creates output material, releases unused materials back to stock, and creates stock-movements.

**ASCII Sequence Diagram:**
```
┌──────────────┐         ┌─────────────────┐         ┌───────────┐
│ Worker Portal│         │  mesRoutes.js   │         │ Firestore │
└──────┬───────┘         └────────┬────────┘         └─────┬─────┘
       │                          │                        │
       │ PATCH /worker-assignments│                        │
       │   /:assignmentId         │                        │
       │ Body: {                  │                        │
       │   action: 'complete',    │                        │
       │   actualOutput: 95,      │                        │
       │   defects: 5             │                        │
       │ }                        │                        │
       │─────────────────────────>│                        │
       │                          │                        │
       │                          │ Load assignment + node │
       │                          │───────────────────────>│
       │                          │<───────────────────────│
       │                          │                        │
       │                          │ BEGIN TRANSACTION      │
       │                          │───────────────────────>│
       │                          │                        │
       │                          │ totalProduced =        │
       │                          │  actualOutput + defects│
       │                          │ = 95 + 5 = 100         │
       │                          │                        │
       │                          │ For each input material│
       │                          │                        │
       │                          │  theoretical =         │
       │                          │   totalProduced *      │
       │                          │   (inputQty / outputQty)│
       │                          │                        │
       │                          │  consumed = min(       │
       │                          │   theoretical,         │
       │                          │   actualReservedAmounts)│
       │                          │                        │
       │                          │  leftover =            │
       │                          │   actualReserved -     │
       │                          │   consumed             │
       │                          │                        │
       │                          │  Update material:      │
       │                          │   wipReserved -=       │
       │                          │     actualReserved     │
       │                          │   stock += leftover    │
       │                          │───────────────────────>│
       │                          │                        │
       │                          │  Create stock-movement │
       │                          │   (consumption):       │
       │                          │   type: 'out'          │
       │                          │   subType: 'production_│
       │                          │     consumption'       │
       │                          │   quantity: consumed   │
       │                          │───────────────────────>│
       │                          │                        │
       │                          │ Create output material:│
       │                          │  stock += actualOutput │
       │                          │───────────────────────>│
       │                          │                        │
       │                          │ Create stock-movement  │
       │                          │  (output):             │
       │                          │  type: 'in'            │
       │                          │  subType: 'production_ │
       │                          │    output'             │
       │                          │  quantity: actualOutput│
       │                          │───────────────────────>│
       │                          │                        │
       │                          │ Update assignment:     │
       │                          │  status = 'completed'  │
       │                          │  actualEnd = now       │
       │                          │  materialConsumption   │
       │                          │   Results              │
       │                          │  materialReservation   │
       │                          │   Status = 'consumed'  │
       │                          │  defects (logged)      │
       │                          │───────────────────────>│
       │                          │                        │
       │                          │ Clear worker.currentTask│
       │                          │───────────────────────>│
       │                          │                        │
       │                          │ Clear substation.current│
       │                          │  Operation             │
       │                          │───────────────────────>│
       │                          │                        │
       │                          │ COMMIT TRANSACTION     │
       │                          │<───────────────────────│
       │                          │                        │
       │   Response: {assignment} │                        │
       │<─────────────────────────│                        │
       │                          │                        │
```

**Input:**
```javascript
// PATCH /api/mes/worker-assignments/:assignmentId
{
  "action": "complete",
  "actualOutput": 95,
  "defects": 5
}
```

**Functions Called:**
- **File:** `/quote-portal/server/mesRoutes.js`
  - **Endpoint:** `PATCH /worker-assignments/:assignmentId`
  - **Transaction Logic:** Material consumption in Firestore transaction

**Material Consumption Transaction Logic:**
```javascript
await db.runTransaction(async (transaction) => {
  // 1. Load assignment and node
  const assignmentRef = db.collection('mes-worker-assignments').doc(assignmentId);
  const assignment = (await transaction.get(assignmentRef)).data();
  
  const nodeRef = db.collection('mes-production-plans').doc(assignment.planId);
  const plan = (await transaction.get(nodeRef)).data();
  const node = plan.nodes.find(n => n.id === assignment.nodeId);
  
  // 2. Validate input
  if (assignment.status !== 'in_progress') {
    throw new Error('Cannot complete: assignment not in progress');
  }
  const totalProduced = actualOutput + defects;
  if (totalProduced < 0 || actualOutput < 0 || defects < 0) {
    throw new Error('Invalid output values');
  }
  
  // 3. Consume input materials
  const consumptionResults = {};
  
  for (const input of node.materialInputs || []) {
    const materialRef = db.collection('materials').doc(input.code);
    const material = (await transaction.get(materialRef)).data();
    
    // Compute theoretical consumption
    const theoretical = totalProduced * (input.qty / node.outputQty);
    
    // Cap consumption at actualReservedAmounts (INVARIANT)
    const actualReserved = assignment.actualReservedAmounts[input.code] || 0;
    const consumed = Math.min(theoretical, actualReserved);
    
    // Compute leftover to return to stock
    const leftover = actualReserved - consumed;
    
    // Log if consumption was capped
    if (consumed < theoretical) {
      console.warn(`Consumption capped for assignment ${assignmentId}, material ${input.code}, theoretical: ${theoretical}, capped: ${consumed}`);
    }
    
    // Update material: release all reserved, return leftover to stock
    transaction.update(materialRef, {
      wipReserved: material.wipReserved - actualReserved,
      stock: material.stock + leftover
    });
    
    // Create stock-movement for consumption
    const consumptionMovementRef = db.collection('stock-movements').doc();
    transaction.set(consumptionMovementRef, {
      materialCode: input.code,
      type: 'out',
      subType: 'production_consumption',
      quantity: consumed,
      stockBefore: material.stock,
      stockAfter: material.stock + leftover,  // Stock increases if leftover
      wipReservedBefore: material.wipReserved,
      wipReservedAfter: material.wipReserved - actualReserved,
      reference: assignmentId,
      referenceType: 'mes_task_complete',
      relatedPlanId: assignment.planId,
      relatedNodeId: assignment.nodeId,
      notes: `Consumed ${consumed}, returned ${leftover} to stock`,
      movementDate: new Date().toISOString(),
      createdAt: new Date().toISOString()
    });
    
    consumptionResults[input.code] = { consumed, leftover, theoretical };
  }
  
  // 4. Create output material
  if (node.outputCode && actualOutput > 0) {
    const outputRef = db.collection('materials').doc(node.outputCode);
    const outputMaterial = (await transaction.get(outputRef)).data();
    
    transaction.update(outputRef, {
      stock: outputMaterial.stock + actualOutput
    });
    
    // Create stock-movement for output
    const outputMovementRef = db.collection('stock-movements').doc();
    transaction.set(outputMovementRef, {
      materialCode: node.outputCode,
      type: 'in',
      subType: 'production_output',
      quantity: actualOutput,
      stockBefore: outputMaterial.stock,
      stockAfter: outputMaterial.stock + actualOutput,
      reference: assignmentId,
      referenceType: 'mes_task_complete',
      relatedPlanId: assignment.planId,
      relatedNodeId: assignment.nodeId,
      notes: `Production output from ${node.name}`,
      movementDate: new Date().toISOString(),
      createdAt: new Date().toISOString()
    });
  }
  
  // 5. Update assignment
  transaction.update(assignmentRef, {
    status: 'completed',
    actualEnd: new Date().toISOString(),
    actualOutput,
    defects,
    materialConsumptionResults: consumptionResults,
    materialReservationStatus: 'consumed'
  });
  
  // 6. Clear worker and substation
  const workerRef = db.collection('mes-workers').doc(assignment.workerId);
  transaction.update(workerRef, {
    currentTask: null,
    status: 'available'
  });
  
  const substationRef = db.collection('mes-substations').doc(assignment.substationId);
  transaction.update(substationRef, {
    currentOperation: null,
    status: 'available'
  });
  
  return consumptionResults;
});
```

**Key Variables Modified:**
- **Input materials:**
  - `material.wipReserved` — Decreased by `actualReservedAmounts[code]` (release all reserved)
  - `material.stock` — Increased by `leftover` (return unused to stock)

- **Output material:**
  - `outputMaterial.stock` — Increased by `actualOutput`

- **Assignment:**
  - `assignment.status` — Changed to `'completed'`
  - `assignment.actualEnd` — Set to current timestamp (or `actualFinish` for legacy)
  - `assignment.actualOutput` — Recorded
  - `assignment.defects` — Recorded (logged, but no stock movement)
  - `assignment.materialConsumptionResults` — Recorded details (consumed, leftover, theoretical per material)
  - `assignment.materialReservationStatus` — Changed to `'consumed'`

- **Worker/Substation:**
  - `worker.currentTask` — Cleared (set to `null`)
  - `worker.status` — Changed to `'available'`
  - `substation.currentOperation` — Cleared (set to `null`)
  - `substation.status` — Changed to `'available'`

**Output/Side Effects:**
- Material documents updated (stock/wipReserved for inputs and output)
- Stock-movement documents created:
  - One per input material (`type='out'`, `subType='production_consumption'`)
  - One for output material (`type='in'`, `subType='production_output'`)
- Assignment document updated
- Worker and substation documents cleared

**Data Transformation Example:**
```javascript
// Assignment has:
assignment.actualReservedAmounts = {
  "M-00-001": 8  // Reserved 8 units at start
}

// Node specifies:
node.materialInputs = [
  { code: "M-00-001", qty: 10.5 }  // Recipe: 10.5 per 100 output
]
node.outputQty = 100

// Worker reports:
actualOutput = 95
defects = 5
totalProduced = 100

// Consumption calculation:
theoretical = 100 * (10.5 / 100) = 10.5
actualReserved = 8
consumed = min(10.5, 8) = 8  // CAPPED by actualReserved (INVARIANT)
leftover = 8 - 8 = 0  // No leftover

// Material update:
material.wipReserved -= 8  // Release all reserved
material.stock += 0  // No leftover to return

// Stock-movement created:
{
  materialCode: "M-00-001",
  type: "out",
  subType: "production_consumption",
  quantity: 8,
  notes: "Consumed 8, returned 0 to stock",
  // ...
}
```

**Example with Leftover:**
```javascript
// If actualOutput = 50, defects = 0:
totalProduced = 50
theoretical = 50 * (10.5 / 100) = 5.25
actualReserved = 8
consumed = min(5.25, 8) = 5.25
leftover = 8 - 5.25 = 2.75  // Leftover returned to stock

// Material update:
material.wipReserved -= 8
material.stock += 2.75  // Leftover returned
```

**Invariants Enforced:**
- `consumed <= actualReservedAmounts[materialCode]` (always true by using `Math.min`)
- All reserved material is released from `wipReserved`
- Unused material is returned to `stock`
- Defects are logged but do NOT create stock movement (defects don't go to inventory)

**Error Conditions:**
- **400 Bad Request:** Invalid status (assignment not in progress)
- **422 Unprocessable Entity:** Invalid output values (negative numbers)
- **500 Internal Server Error:** Transaction fails → Rollback all changes

**Legacy Field Handling:**
```javascript
// Read actualEnd or fallback to actualFinish for old documents
const endTime = assignment.actualEnd || assignment.actualFinish;
```

**Monitoring:**
- Log metric: `consumption_capped_count` when `consumed < theoretical`
- Track defect rates per operation
- Alert if leftover exceeds thresholds (indicates overproduction issues)

---

## Summary of Data Transformations

### Frontend → Backend (Plan Creation)
```javascript
// Frontend (UI):
node.time = 60  // Legacy field
node.skills = ["welding"]  // Legacy field
node.assignedStationId = "ST-001"  // Legacy field (single)

// Backend (Canonical):
node.nominalTime = 60  // Mapped from time
node.requiredSkills = ["welding"]  // Mapped from skills
node.assignedStations = [  // Mapped from assignedStationId (array)
  { stationId: "ST-001", priority: 1 }
]
```

### Backend Enrichment (Efficiency)
```javascript
// Input:
node.nominalTime = 60
node.efficiency = 0.8  // Optional override

// Load operation:
operation.defaultEfficiency = 0.9  // From mes-operations

// Compute effectiveTime (inverse proportionality):
efficiency = node.efficiency || operation.defaultEfficiency || 1.0  // = 0.8
effectiveTime = Math.round(60 / 0.8) = 75 minutes

// Output:
node.effectiveTime = 75
```

### Launch → Assignment (Material Pre-Reservation)
```javascript
// Node:
node.materialInputs = [
  { code: "M-00-001", qty: 10.5 }
]
node.outputQty = 100

// Plan:
planData.quantity = 50  // Producing 50 units

// Assignment:
assignment.preProductionReservedAmount = {
  "M-00-001": 10.5 * 50 / 100 = 5.25
}
```

### Start → Actual Reservation
```javascript
// Assignment:
assignment.preProductionReservedAmount = {
  "M-00-001": 10.5
}

// Material:
material.stock = 8  // Insufficient

// Transaction:
actualReserved = min(8, 10.5) = 8

// Assignment updated:
assignment.actualReservedAmounts = {
  "M-00-001": 8
}

// Material updated:
material.stock = 8 - 8 = 0
material.wipReserved = previous + 8
```

### Complete → Consumption (Capped)
```javascript
// Assignment:
assignment.actualReservedAmounts = {
  "M-00-001": 8
}

// Reported:
actualOutput = 95
defects = 5
totalProduced = 100

// Node recipe:
node.materialInputs[0].qty = 10.5
node.outputQty = 100

// Calculation:
theoretical = 100 * (10.5 / 100) = 10.5
consumed = min(10.5, 8) = 8  // CAPPED (INVARIANT)
leftover = 8 - 8 = 0

// Material updated:
material.wipReserved -= 8  // Release all
material.stock += 0  // No leftover

// Output material:
outputMaterial.stock += 95  // actualOutput only (defects not added to stock)
```

---

## Error Handling and Rollback Matrix

| Operation | Error Condition | HTTP Status | Rollback Behavior | Monitoring |
|-----------|----------------|-------------|-------------------|------------|
| **Plan Creation** | Invalid node schema | 400 | No DB write | `validation_error_count++` |
| **Plan Creation** | Circular dependencies | 400 | No DB write | Log cycle path |
| **Plan Creation** | Operation not found | 500 | No DB write | Alert on missing operations |
| **Launch** | Plan not found | 404 | N/A | Log planId |
| **Launch** | Plan already launched | 400 | No DB write | N/A |
| **Launch** | No workers with skills | 500 | No DB write | Alert resource shortage |
| **Start** | Invalid status | 400 | No DB write | N/A |
| **Start** | Partial reservation | 409 (or continue) | Transaction commits if `forceStart=true` | `reservation_mismatch_count++` |
| **Start** | Transaction failure | 500 | Transaction rollback | Alert + investigate |
| **Pause** | Invalid status | 400 | No DB write | N/A |
| **Resume** | Invalid status | 400 | No DB write | N/A |
| **Complete** | Invalid status | 400 | No DB write | N/A |
| **Complete** | Negative output | 422 | No DB write | Log invalid data |
| **Complete** | Transaction failure | 500 | Transaction rollback | Alert + investigate |

---

## Performance Considerations

### Transaction Sizes
- **Start:** Reads/writes per material + assignment + worker + substation
  - Typical: 3-5 materials = ~15-25 operations
- **Complete:** Similar to start + output material + stock-movements
  - Typical: ~20-30 operations

### Firestore Limits
- Max 500 operations per transaction
- Max 10 MB per document

### Optimizations
- Batch assignment creation during launch (use batch write, not individual transactions)
- Cache operation metadata in memory to reduce reads
- Use subcollections for stock-movements to avoid document size limits

---

This completes the detailed end-to-end process flow documentation for Prompt 2.

---

## API Contract Changes (Detailed)

This section documents all API endpoint changes required for the canonical model migration. Each endpoint includes old vs new contract specifications, request/response examples, validation rules, error responses, and backward compatibility strategies.

---

### Overview of Changes

The canonical model migration affects the following endpoints:
1. **POST /api/mes/production-plans** — Create production plan
2. **PUT /api/mes/production-plans/:id** — Update production plan
3. **POST /api/mes/production-plans/:planId/launch** — Launch plan
4. **PATCH /api/mes/worker-assignments/:assignmentId** — Update assignment (start, pause, resume, complete)

**Key Changes:**
- Accept only `nodes[]` with canonical field names (prefer over `executionGraph[]`)
- Server-side validation with JSON Schema
- Server-side enrichment (compute `effectiveTime`)
- Enhanced error responses with detailed validation feedback

---

### 1. POST /api/mes/production-plans

**Endpoint:** `POST /api/mes/production-plans`

**Purpose:** Create a new production plan with canonical nodes.

#### Old Contract (Pre-Migration)

**Request Body:**
```json
{
  "orderCode": "WO-2025-001",
  "quantity": 100,
  "nodes": [...],
  "executionGraph": [...]  // DEPRECATED: dual structure
}
```

**Accepted Fields (nodes):**
- `time` or `estimatedNominalTime` (minutes) — inconsistent naming
- `skills` (array) — should be `requiredSkills`
- `assignedStationId` (string) — should be array format
- Mixed field names across frontend/backend

**Backend Behavior:**
- Accept both `nodes[]` and `executionGraph[]`
- Use `executionGraph[]` as source of truth if present
- No strict validation on field names

---

#### New Contract (Post-Migration)

**Request Body:**
```json
{
  "orderCode": "WO-2025-001",
  "quantity": 100,
  "notes": "Production plan for customer order",
  "nodes": [
    {
      "id": "node-1",
      "name": "Kesim Operasyonu",
      "operationId": "OP-001",
      "nominalTime": 60,
      "efficiency": 0.85,
      "requiredSkills": ["welding", "assembly"],
      "assignedStations": [
        {
          "stationId": "ST-001",
          "priority": 1
        }
      ],
      "assignedSubstations": ["SUB-001-A"],
      "assignmentMode": "auto",
      "assignedWorkerId": null,
      "predecessors": [],
      "materialInputs": [
        {
          "code": "M-00-001",
          "qty": 10.5,
          "required": true
        }
      ],
      "outputCode": "M-10-001",
      "outputQty": 100
    }
  ]
}
```

**Required Fields (nodes):**
- `id` (string) — unique node identifier
- `name` (string) — operation name
- `operationId` (string) — reference to mes-operations
- `nominalTime` (integer > 0) — design-time duration in minutes
- `predecessors` (array) — valid node IDs

**Optional Fields (nodes):**
- `efficiency` (number, 0.01-1.0) — per-node efficiency override
- `requiredSkills` (array of strings) — worker skills needed
- `assignedStations` (array of objects) — station assignment hints
- `assignedSubstations` (array of strings) — substation hints
- `assignmentMode` (enum: 'auto' | 'manual') — worker allocation mode
- `assignedWorkerId` (string) — if assignmentMode='manual'
- `materialInputs` (array) — input materials
- `outputCode` (string) — output material code
- `outputQty` (number) — expected output quantity

**Backend Behavior:**
1. Validate `nodes[]` using `validateProductionPlanNodes(nodes)`
2. If `executionGraph[]` present, log deprecation warning
3. Enrich nodes using `enrichNodesWithEstimatedTimes(nodes, planData, db)`
4. Save plan with enriched `nodes[]` only (do NOT save `executionGraph[]`)

**Response:**
```json
{
  "success": true,
  "plan": {
    "id": "PLAN-001",
    "orderCode": "WO-2025-001",
    "quantity": 100,
    "status": "draft",
    "nodes": [
      {
        "id": "node-1",
        "name": "Kesim Operasyonu",
        "operationId": "OP-001",
        "nominalTime": 60,
        "efficiency": 0.85,
        "effectiveTime": 71,  // Server-computed: 60 / 0.85 = 70.6 → 71
        "estimatedStart": 0,
        "estimatedEnd": 71,
        "requiredSkills": ["welding", "assembly"],
        "assignedStations": [{"stationId": "ST-001", "priority": 1}],
        "assignedSubstations": ["SUB-001-A"],
        "assignmentMode": "auto",
        "assignedWorkerId": null,
        "predecessors": [],
        "materialInputs": [{"code": "M-00-001", "qty": 10.5, "required": true}],
        "outputCode": "M-10-001",
        "outputQty": 100
      }
    ],
    "createdAt": "2025-11-14T10:00:00Z"
  }
}
```

**Validation Rules:**
- Each node must have `id`, `name`, `operationId`, `nominalTime` > 0
- `predecessors` must reference existing node IDs (no circular dependencies)
- If `assignmentMode='manual'`, `assignedWorkerId` must be present and non-empty
- `efficiency` must be between 0.01 and 1.0 if specified
- `nominalTime` must be positive integer

**Backward Compatibility:**
```javascript
// Backend logic:
if (req.body.executionGraph && !req.body.nodes) {
  console.warn('executionGraph is deprecated, converting to nodes');
  req.body.nodes = convertExecutionGraphToNodes(req.body.executionGraph);
}

if (req.body.executionGraph && req.body.nodes) {
  console.warn('Both nodes and executionGraph present, using nodes');
}
```

**Error Responses:**

**400 Bad Request - Invalid Schema:**
```json
{
  "error": "Invalid plan schema",
  "details": [
    {
      "field": "nodes[0].nominalTime",
      "message": "must be greater than 0",
      "value": -10
    },
    {
      "field": "nodes[1].id",
      "message": "is required",
      "value": null
    }
  ]
}
```

**400 Bad Request - Circular Dependencies:**
```json
{
  "error": "Invalid node dependencies",
  "message": "Circular dependency detected: node-1 → node-2 → node-3 → node-1"
}
```

**400 Bad Request - Invalid Predecessors:**
```json
{
  "error": "Invalid predecessors",
  "details": [
    {
      "nodeId": "node-2",
      "invalidPredecessor": "node-99",
      "message": "Predecessor node-99 does not exist"
    }
  ]
}
```

**400 Bad Request - Manual Assignment Missing Worker:**
```json
{
  "error": "Invalid assignment mode",
  "message": "Node node-3 has assignmentMode='manual' but assignedWorkerId is missing"
}
```

**500 Internal Server Error - Operation Not Found:**
```json
{
  "error": "Operation not found",
  "message": "Operation OP-999 referenced by node node-1 does not exist in mes-operations"
}
```

**cURL Example:**
```bash
curl -X POST https://api.example.com/api/mes/production-plans \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "orderCode": "WO-2025-001",
    "quantity": 100,
    "nodes": [
      {
        "id": "node-1",
        "name": "Kesim",
        "operationId": "OP-001",
        "nominalTime": 60,
        "efficiency": 0.85,
        "requiredSkills": ["welding"],
        "assignedStations": [{"stationId": "ST-001", "priority": 1}],
        "assignmentMode": "auto",
        "predecessors": [],
        "materialInputs": [{"code": "M-00-001", "qty": 10.5}],
        "outputCode": "M-10-001",
        "outputQty": 100
      }
    ]
  }'
```

---

### 2. PUT /api/mes/production-plans/:id

**Endpoint:** `PUT /api/mes/production-plans/:id`

**Purpose:** Update an existing production plan (draft status only).

#### Contract (Same as POST)

**Request Body:** Same structure as POST (see above)

**Validation:** Same rules as POST

**Additional Validation:**
- Plan must exist (404 if not found)
- Plan must be in `draft` status (cannot update released/in-progress plans)

**Error Responses:**

**404 Not Found:**
```json
{
  "error": "Plan not found",
  "planId": "PLAN-999"
}
```

**400 Bad Request - Invalid Status:**
```json
{
  "error": "Cannot update plan",
  "message": "Plan PLAN-001 is in status 'released', only 'draft' plans can be updated"
}
```

**cURL Example:**
```bash
curl -X PUT https://api.example.com/api/mes/production-plans/PLAN-001 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "orderCode": "WO-2025-001",
    "quantity": 150,
    "nodes": [...]
  }'
```

---

### 3. POST /api/mes/production-plans/:planId/launch

**Endpoint:** `POST /api/mes/production-plans/:planId/launch`

**Purpose:** Launch a production plan by creating worker assignments.

#### Old Contract (Pre-Migration)

**Input:** No body required

**Backend Behavior:**
- Load plan (use `executionGraph[]` if available)
- Generate assignments from `executionGraph[]`

---

#### New Contract (Post-Migration)

**Input:** No body required

**Backend Behavior:**
1. Load plan from Firestore
2. Prefer `plan.nodes[]` over `plan.executionGraph[]`:
   ```javascript
   const nodesToUse = plan.nodes || plan.executionGraph || [];
   if (!plan.nodes && plan.executionGraph) {
     console.warn(`Plan ${planId} using deprecated executionGraph, consider migration`);
   }
   ```
3. Build topological order: `buildTopologicalOrder(nodesToUse)`
4. For each node in order:
   - Call `assignNodeResources(node, predecessorTimes, workers, substations, ...)`
   - Create assignment with canonical fields
5. Batch write assignments to Firestore
6. Update plan status to `'released'`

**Function Signature Change:**
- **Old:** `enrichNodesWithEstimatedTimes(nodes, executionGraph, planData, db)`
- **New:** `enrichNodesWithEstimatedTimes(nodes, planData, db)` (removed `executionGraph` param)

**Response:**
```json
{
  "success": true,
  "planId": "PLAN-001",
  "status": "released",
  "assignments": [
    {
      "id": "WO-2025-001-01",
      "planId": "PLAN-001",
      "nodeId": "node-1",
      "nodeName": "Kesim Operasyonu",
      "operationId": "OP-001",
      "workerId": "W-001",
      "stationId": "ST-001",
      "substationId": "SUB-001-A",
      "plannedStart": "2025-11-14T08:00:00Z",
      "plannedEnd": "2025-11-14T09:11:00Z",
      "nominalTime": 60,
      "effectiveTime": 71,
      "status": "pending",
      "preProductionReservedAmount": {
        "M-00-001": 10.5
      },
      "actualReservedAmounts": {},
      "materialReservationStatus": "pending"
    }
  ],
  "launchedAt": "2025-11-14T07:00:00Z"
}
```

**Assignment Canonical Fields:**
- `nodeId` (not `node_id` or `node.id`) — references `node.id`
- `substationId` (not `stationId` for scheduling) — used as key in schedules
- `nominalTime` — from node
- `effectiveTime` — computed from node
- `preProductionReservedAmount` — computed from `node.materialInputs`

**Error Responses:**

**404 Not Found:**
```json
{
  "error": "Plan not found",
  "planId": "PLAN-999"
}
```

**400 Bad Request - Already Launched:**
```json
{
  "error": "Cannot launch plan",
  "message": "Plan PLAN-001 is already in status 'released'"
}
```

**500 Internal Server Error - Resource Shortage:**
```json
{
  "error": "Resource assignment failed",
  "message": "No available workers with required skills: ['welding', 'assembly']",
  "nodeId": "node-3"
}
```

**cURL Example:**
```bash
curl -X POST https://api.example.com/api/mes/production-plans/PLAN-001/launch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>"
```

---

### 4. PATCH /api/mes/worker-assignments/:assignmentId

**Endpoint:** `PATCH /api/mes/worker-assignments/:assignmentId`

**Purpose:** Update assignment status (start, pause, resume, complete).

**No API Contract Changes** (external interface unchanged), but internal behavior updated to use canonical fields.

---

#### 4.1 Start Action

**Request Body:**
```json
{
  "action": "start",
  "forceStart": false
}
```

**Parameters:**
- `action` (required): `"start"`
- `forceStart` (optional, default `false`): If `true`, proceed even with partial material reservation

**Internal Behavior Changes:**
1. Use `assignment.preProductionReservedAmount` (canonical)
2. Create stock-movements with **both** `requestedQuantity` and `actualQuantity`:
   ```javascript
   {
     "requestedQuantity": 10.5,  // From preProductionReservedAmount
     "actualQuantity": 8,         // min(stock, requested)
     "partialReservation": true,  // true if actualQuantity < requestedQuantity
     "warning": "Partial reservation: requested 10.5, reserved 8 due to insufficient stock"
   }
   ```
3. Record `assignment.actualReservedAmounts`

**Response (Success - Full Reservation):**
```json
{
  "success": true,
  "assignment": {
    "id": "WO-2025-001-01",
    "status": "in_progress",
    "actualStart": "2025-11-14T08:00:00Z",
    "actualReservedAmounts": {
      "M-00-001": 10.5
    },
    "materialReservationStatus": "reserved"
  },
  "partialReservations": []
}
```

**Response (Partial Reservation - forceStart=false):**
```json
{
  "error": "Partial material reservation",
  "code": "PARTIAL_RESERVATION",
  "message": "Insufficient stock for some materials",
  "partialReservations": [
    {
      "materialCode": "M-00-001",
      "requested": 10.5,
      "actual": 8,
      "shortfall": 2.5
    }
  ],
  "hint": "Use forceStart=true to proceed anyway"
}
```
**HTTP Status:** 409 Conflict

**Response (Partial Reservation - forceStart=true):**
```json
{
  "success": true,
  "warning": "Started with partial material reservation",
  "assignment": {
    "id": "WO-2025-001-01",
    "status": "in_progress",
    "actualStart": "2025-11-14T08:00:00Z",
    "actualReservedAmounts": {
      "M-00-001": 8
    },
    "materialReservationStatus": "reserved"
  },
  "partialReservations": [
    {
      "materialCode": "M-00-001",
      "requested": 10.5,
      "actual": 8,
      "shortfall": 2.5
    }
  ]
}
```
**HTTP Status:** 200 OK

**Error Responses:**

**400 Bad Request - Invalid Status:**
```json
{
  "error": "Invalid action",
  "message": "Cannot start assignment WO-001-01: current status is 'completed', expected 'pending' or 'paused'"
}
```

**cURL Example:**
```bash
# Start with forceStart=false (fail on partial)
curl -X PATCH https://api.example.com/api/mes/worker-assignments/WO-2025-001-01 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"action": "start", "forceStart": false}'

# Start with forceStart=true (proceed with partial)
curl -X PATCH https://api.example.com/api/mes/worker-assignments/WO-2025-001-01 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"action": "start", "forceStart": true}'
```

---

#### 4.2 Pause Action

**Request Body:**
```json
{
  "action": "pause"
}
```

**No internal changes** (already uses canonical fields).

**Response:**
```json
{
  "success": true,
  "assignment": {
    "id": "WO-2025-001-01",
    "status": "paused",
    "pausedAt": "2025-11-14T08:30:00Z",
    "currentPauseStart": 1731571800000
  }
}
```

---

#### 4.3 Resume Action

**Request Body:**
```json
{
  "action": "resume"
}
```

**Response:**
```json
{
  "success": true,
  "assignment": {
    "id": "WO-2025-001-01",
    "status": "in_progress",
    "totalPausedTime": 300000,
    "currentPauseStart": null
  }
}
```

---

#### 4.4 Complete Action

**Request Body:**
```json
{
  "action": "complete",
  "actualOutput": 95,
  "defects": 5
}
```

**Parameters:**
- `action` (required): `"complete"`
- `actualOutput` (required, integer >= 0): Units produced successfully
- `defects` (required, integer >= 0): Defective units

**Internal Behavior Changes:**
1. Cap consumption at `assignment.actualReservedAmounts[materialCode]` (INVARIANT)
2. Return leftover material to stock: `stock += (actualReserved - consumed)`
3. Create stock-movements:
   - Per input: `type='out'`, `subType='production_consumption'`, `quantity=consumed`
   - For output: `type='in'`, `subType='production_output'`, `quantity=actualOutput`
4. Log defects in assignment (NO stock movement for defects)
5. Handle legacy `actualFinish` field (fallback to `actualEnd`)

**Response:**
```json
{
  "success": true,
  "assignment": {
    "id": "WO-2025-001-01",
    "status": "completed",
    "actualEnd": "2025-11-14T09:30:00Z",
    "actualOutput": 95,
    "defects": 5,
    "materialConsumptionResults": {
      "M-00-001": {
        "consumed": 8,
        "leftover": 0,
        "theoretical": 10.5
      }
    },
    "materialReservationStatus": "consumed"
  },
  "warnings": [
    "Consumption capped: material M-00-001 theoretical=10.5, consumed=8 (limited by reservation)"
  ]
}
```

**Error Responses:**

**400 Bad Request - Invalid Status:**
```json
{
  "error": "Invalid action",
  "message": "Cannot complete assignment: status is 'pending', expected 'in_progress'"
}
```

**422 Unprocessable Entity - Invalid Output:**
```json
{
  "error": "Invalid output values",
  "message": "actualOutput and defects must be non-negative",
  "values": {
    "actualOutput": -5,
    "defects": 2
  }
}
```

**422 Unprocessable Entity - Consumption Exceeds Reserved (Should Never Happen):**
```json
{
  "error": "Consumption invariant violated",
  "message": "Attempted to consume more than reserved (this is a bug)",
  "materialCode": "M-00-001",
  "consumed": 12,
  "reserved": 8
}
```

**cURL Example:**
```bash
curl -X PATCH https://api.example.com/api/mes/worker-assignments/WO-2025-001-01 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "action": "complete",
    "actualOutput": 95,
    "defects": 5
  }'
```

---

## Deprecated Field Mappings

This table documents all deprecated fields and their canonical replacements for migration purposes.

| Deprecated Field | Canonical Field | Type Change | Migration Strategy |
|------------------|-----------------|-------------|-------------------|
| **Node Fields** |
| `node.time` | `node.nominalTime` | Same (integer minutes) | Map on frontend save, backend reads both |
| `node.estimatedNominalTime` | `node.nominalTime` | Same | Backend fallback chain |
| `node.duration` | `node.nominalTime` | Same | Backend fallback chain |
| `node.skills` | `node.requiredSkills` | Same (array) | Map on frontend save |
| `node.nodeId` | `node.id` | Same (string) | Backend reads both |
| `node.assignedStationId` | `node.assignedStations` | String → Array of objects | Wrap in array: `[{stationId, priority: 1}]` |
| `node.allocationType` | `node.assignmentMode` | Rename only | Direct map |
| `node.workerHint.workerId` | `node.assignedWorkerId` | Flatten structure | Extract from nested object |
| **Assignment Fields** |
| `assignment.actualFinish` | `assignment.actualEnd` | Same (ISO timestamp) | Backend reads both (fallback) |
| **Plan Fields** |
| `plan.executionGraph[]` | `plan.nodes[]` | Structure change | Convert with migration script |

**Backend Fallback Example (nominalTime):**
```javascript
// In enrichNodesWithEstimatedTimes
const nominalTime = node.nominalTime 
  || node.time 
  || node.estimatedNominalTime 
  || node.duration 
  || 60;  // Default fallback
```

**Frontend Mapping Example (save flow):**
```javascript
// In planDesigner.js savePlanDraft()
const sanitizedNode = {
  id: node.id || node.nodeId,
  name: node.name,
  operationId: node.operationId,
  nominalTime: node.time || node.nominalTime,  // Map time → nominalTime
  requiredSkills: node.skills || node.requiredSkills || [],  // Map skills → requiredSkills
  assignedStations: node.assignedStationId 
    ? [{ stationId: node.assignedStationId, priority: 1 }]  // Wrap single → array
    : (node.assignedStations || []),
  assignmentMode: node.allocationType || node.assignmentMode || 'auto',
  assignedWorkerId: node.workerHint?.workerId || node.assignedWorkerId || null,
  efficiency: node.efficiency || null,
  // ... other fields
};
```

---

## Summary of API Changes

### Breaking Changes (with backward compatibility)
1. **`nodes[]` required** — Must send canonical `nodes[]`, `executionGraph[]` deprecated
2. **Field name changes** — `time` → `nominalTime`, `skills` → `requiredSkills`, etc.
3. **Structure changes** — `assignedStationId` (string) → `assignedStations` (array)
4. **Signature changes** — `enrichNodesWithEstimatedTimes` removed `executionGraph` param

### Non-Breaking Changes (internal only)
1. **Stock-movements enhanced** — Added `requestedQuantity`, `actualQuantity`, `partialReservation`, `warning`
2. **Assignment fields** — Added `actualReservedAmounts`, enhanced `materialReservationStatus`
3. **Error responses** — More detailed validation errors
4. **Consumption capping** — Enforced invariant (internal logic, not API change)

### Backward Compatibility Strategy
1. **Accept both formats during migration** — Backend reads `executionGraph[]` as fallback
2. **Deprecation warnings** — Log when old format is used
3. **On-read conversion** — Convert `executionGraph[]` to `nodes[]` in memory if needed
4. **Legacy field support** — Backend reads both `actualFinish` and `actualEnd`
5. **Feature flag** — `FEATURE_USE_CANONICAL_NODES` controls preference

### Migration Timeline
- **Phase 1 (Week 1-2):** Backend accepts both formats, logs deprecation warnings
- **Phase 2 (Week 3-4):** Frontend stops sending `executionGraph[]`
- **Phase 3 (Week 5-6):** Run migration script to backfill existing plans
- **Phase 4 (Week 7-8):** Remove fallback code after 2 release cycles

---

## Testing API Changes

### Test Scenarios

**1. Create Plan with Canonical Nodes**
```bash
# Should succeed
curl -X POST /api/mes/production-plans \
  -d '{"orderCode":"WO-001", "quantity":100, "nodes":[{"id":"node-1", "nominalTime":60, ...}]}'
```

**2. Create Plan with executionGraph (Deprecated)**
```bash
# Should succeed but log warning
curl -X POST /api/mes/production-plans \
  -d '{"orderCode":"WO-002", "quantity":50, "executionGraph":[{"nodeId":"node-1", "time":30, ...}]}'
```

**3. Validation Errors**
```bash
# Should fail with 400: nominalTime <= 0
curl -X POST /api/mes/production-plans \
  -d '{"nodes":[{"id":"node-1", "nominalTime":-10}]}'

# Should fail with 400: circular dependency
curl -X POST /api/mes/production-plans \
  -d '{"nodes":[{"id":"node-1","predecessors":["node-2"]}, {"id":"node-2","predecessors":["node-1"]}]}'
```

**4. Launch with nodes vs executionGraph Fallback**
```bash
# Launch plan with nodes (preferred)
curl -X POST /api/mes/production-plans/PLAN-001/launch

# Launch old plan with executionGraph (fallback)
curl -X POST /api/mes/production-plans/OLD-PLAN/launch
```

**5. Start with Partial Reservation**
```bash
# Should return 409 when forceStart=false
curl -X PATCH /api/mes/worker-assignments/WO-001-01 \
  -d '{"action":"start", "forceStart":false}'

# Should succeed with warning when forceStart=true
curl -X PATCH /api/mes/worker-assignments/WO-001-01 \
  -d '{"action":"start", "forceStart":true}'
```

**6. Complete with Consumption Capping**
```bash
# Should cap consumption at actualReservedAmounts
curl -X PATCH /api/mes/worker-assignments/WO-001-01 \
  -d '{"action":"complete", "actualOutput":100, "defects":0}'
```

---

This completes the detailed API contract changes documentation for Prompt 3.

---

## UI + Master Data Changes Required

To fully support the optimized canonical model (single `nodes[]` source of truth) we need a small set of UI and master-data changes so the frontend can provide the inputs the backend needs (notably operation efficiency values used to compute `effectiveTime`). Below is a prioritized and concrete list of changes, file pointers, migration notes and acceptance criteria.

Summary: add an editable `defaultEfficiency` to operation master-data (like `expectedDefectRate`), expose operation efficiency in admin UI, surface efficiency in the Plan Designer node editor (with optional per-node override), map frontend fields to canonical names when saving, and sync changes with Firestore via existing APIs (or small API additions).

1) Master Data: `mes-operations` documents
- Schema change: add `defaultEfficiency` (number, 0 < value ≤ 1). Keep `expectedDefectRate` as-is.
- Example document change:
```json
{
  "id": "OP-001",
  "name": "Kesim",
  "expectedDefectRate": 0.02,
  "defaultEfficiency": 0.80,
  // other existing fields
}
```
- Migration: backfill existing `mes-operations` documents with `defaultEfficiency = 1.0` if missing, or compute heuristically if there is historical `estimatedEffectiveTime/estimatedNominalTime` data.

Files to touch:
- Backend: no schema file required in Firestore, but update any operation-writing endpoints if they exist to accept `defaultEfficiency` (search: `mes-operations` usages). Candidate file: `/quote-portal/server/mesRoutes.js` (where `mes-operations` is read for `expectedDefectRate`).

2) Admin UI: Operation Editor / Master Data UI
- Add `Default Efficiency` input (percent or decimal) to the operations master-data editor so administrators can change efficiencies quickly.
- Validate input range (e.g., 0.1 — 1.0 or 0% — 100%). Display helpful tooltip: "Used to compute effectiveTime = nominalTime / efficiency (or nominalTime * (1/efficiency) depending on chosen formula)."

Concrete files (examples in repo):
- `/quote-portal/domains/production/js/operations.js` — likely contains operation UI logic. Add an input and wire save/update calls.
- If there is a React admin UI for operations, update corresponding component (search results show components in `/quote-portal/src/components` and `/quote-portal/domains/production/components`). If there is no dedicated React component, update the DOM-based JS file listed above.

3) Plan Designer (frontend) — Node editor additions
- Expose `Efficiency override` (optional) and show derived `effectiveTime` preview.
- Node editor fields to show or map:
  - `nominalTime` (existing `time`) — integer minutes
  - `efficiency` (optional number 0 < value ≤ 1) — when set, overrides operation default
  - UI shown value: `effectiveTime = Math.round(nominalTime / (efficiency || operation.defaultEfficiency || 1))` — note this uses inverse proportionality (division). Example: `nominalTime = 30`, `efficiency = 1.0` -> `30`; `efficiency = 0.8` -> `30 / 0.8 = 37.5`.

Concrete files to change:
- `/quote-portal/domains/production/js/planDesigner.js` — in `savePlanDraft()` sanitization and where nodes are created/edited, add mapping for `efficiency` and ensure `time` -> `nominalTime` mapping is applied.
- `/quote-portal/domains/production/components/production-plan-designer.tsx` — update Node edit modal/form to include the efficiency override input and effectiveTime preview (if this TSX file is used in newer UI flows).

4) Toolbox / Operations list in Designer
- Show `defaultEfficiency` in the operations toolbox so designers can see expected efficiency when dragging an operation onto canvas.
- File: `/quote-portal/domains/production/js/planDesigner.js` or `/quote-portal/domains/production/components/*` depending on which UI is active. Update render logic for the operations toolbox.

5) Payload mapping & sanitization (frontend save flow)
- When saving plan, map node fields to canonical schema:
  - `id` : keep
  - `name` : keep
  - `operationId` : keep
  - `nominalTime` : map from `time` or `estimatedTime`
  - `requiredSkills` : map from `skills`
  - `assignedStations` : ensure array form
  - `efficiency` : optional override value

- Update `savePlanDraft()` in `/quote-portal/domains/production/js/planDesigner.js` to set these canonical fields. Example transformations already started in that file — extend them to map `time->nominalTime` and `skills->requiredSkills`, and include `efficiency` when present.

6) Backend read/fallback logic (no breaking change)
- Backend should read `operation.defaultEfficiency` when computing `effectiveTime` in `enrichNodesWithEstimatedTimes`. If node has `efficiency` override, use that; else fall back to `operation.defaultEfficiency`; else default to `1.0`.
- File: `/quote-portal/server/mesRoutes.js` — update enrichment code where operation is fetched (we previously saw `operationDoc` is loaded to read `expectedDefectRate`) to also load `defaultEfficiency`.

7) Sync strategy: update flows & API
- If existing client-side code updates operations via `mesApi`, add support for `defaultEfficiency` in the relevant endpoints. Candidate: `/quote-portal/domains/production/js/mesApi.js` (we saw createProductionPlan and other calls) — add or extend `updateOperation(operation)` or similar.

8) Validation and UX details
- Efficiency input: allow both percent (0–100) and decimal (0.0–1.0) UI; normalize to decimal server-side.
- Add field help text: "Default efficiency used to compute effective time; lower efficiency → longer effectiveTime.".
- Add unit tests for mapping logic (nominalTime + efficiency → effectiveTime).

9) Migration/backfill plan
- Add a small script `scripts/backfill-operation-efficiency.js` to iterate `mes-operations` and set `defaultEfficiency` to `1.0` for docs missing the field. Provide `--dry-run` mode.

10) Acceptance criteria
- Admin can view and edit operation default efficiency and save to Firestore.
- Plan Designer shows the operation's default efficiency and allows optional per-node override.
- Saved plans include `efficiency` (only when overridden) and `nominalTime` fields; backend uses operation.defaultEfficiency when computing `effectiveTime` for nodes without override.

---

If you want, I can implement the minimal UI changes now:
- Add `efficiency` input to `planDesigner.js` node editor and map `time->nominalTime` on save, and
- Add backend read of `defaultEfficiency` in `enrichNodesWithEstimatedTimes` so `effectiveTime` calculation uses the new field.

Tell me whether to (A) implement frontend changes first, (B) implement backend enrichment (safe minimal change), or (C) implement both together (Senaryo A full implementation). I'll start with writing patches once you choose.

If you want, I can now:
- Implement the minimal code changes (Senaryo A) in the repo (apply patches to `mesRoutes.js` and `planDesigner.js`) and add the migration dry-run script, or
- Generate the JSON Schema files + unit test skeletons and a migration script scaffold.

Which step should I take next? (I will follow your instruction and start coding.)

---

## Appendix C — Detailed Implementation Prompts (Copy-Paste Ready)

**Purpose:** Each prompt below corresponds to a TODO item in the tracked list. Copy the relevant prompt and paste it to the assistant to ensure all requirements, file paths, function names, variable names, test commands, and commit messages are included. This ensures nothing is missed during implementation.

---

### Prompt 1: Draft unified data model ✅ (COMPLETED)
*This TODO is already completed. The canonical schemas are documented above in this file.*

---

### Prompt 2: Map end-to-end process

**Prompt:**
```
Task: Document the complete end-to-end MES process flow in `Optimized-DATA-FLOW-STUDY.md` under a new section "## End-to-End Process Flow (Detailed)".

Requirements:
1. Create ASCII sequence diagrams showing:
   - Plan creation flow (frontend planDesigner.js → backend mesRoutes.js POST /production-plans → Firestore write)
   - Enrichment step (server-side enrichNodesWithEstimatedTimes function)
   - Launch flow (POST /production-plans/:planId/launch → assignNodeResources loop → create mes-worker-assignments)
   - Start action (PATCH /worker-assignments/:id with action=start → material reservation transaction → update assignment.actualReservedAmounts)
   - Pause/Resume actions (PATCH with action=pause/resume → update assignment.totalPausedTime)
   - Complete action (PATCH with action=complete → material consumption transaction capped by actualReservedAmounts → create stock-movements → update assignment.actualEnd)

2. For each step, document:
   - Input data structure (with field names)
   - Function/endpoint called (file path + function name)
   - Key variables modified (e.g., assignment.status, material.stock, material.wipReserved)
   - Output/side effects (Firestore writes, stock-movements created)
   - Error conditions and rollback behavior

3. Include data transformation examples:
   - Example: node.time (frontend) → node.nominalTime (canonical) → assignment.effectiveTime (computed as nominalTime / efficiency)
   - Example: preProductionReservedAmount (planned at launch) → actualReservedAmounts (actual at start)

Files to reference:
- `/quote-portal/server/mesRoutes.js` — main backend logic
- `/quote-portal/domains/production/js/planDesigner.js` — frontend save flow
- `/quote-portal/domains/production/js/mesApi.js` — frontend API calls

Expected output:
- A new section in `Optimized-DATA-FLOW-STUDY.md` with detailed ASCII diagrams and step-by-step descriptions.
- No code changes required for this TODO, only documentation.

Acceptance criteria:
- Each flow step is documented with input/output and responsible functions.
- Material reservation/consumption invariants are clearly stated.
- Diagrams show sequence of operations with timing.

Commit message suggestion:
```
docs: add detailed end-to-end process flow diagrams to Optimized-DATA-FLOW-STUDY.md
```
```

---

### Prompt 3: List API contract changes

**Prompt:**
```
Task: Document all API contract changes required for the canonical model in `Optimized-DATA-FLOW-STUDY.md` under a new section "## API Contract Changes (Detailed)".

Requirements:
1. For each affected endpoint, document:
   - Endpoint: `POST /api/mes/production-plans`
     - Old contract: accepts both `nodes[]` and `executionGraph[]`
     - New contract: accepts only `nodes[]` with canonical field names (id, nominalTime, requiredSkills, assignedStations, efficiency)
     - Backward compatibility: if `executionGraph` is present, log deprecation warning and convert to nodes internally
     - Validation: call `validateProductionPlanNodes(nodes)` which checks JSON schema (id, nominalTime > 0, valid predecessors)
     - Response: returns saved plan with server-enriched nodes

   - Endpoint: `PUT /api/mes/production-plans/:id`
     - Same requirements as POST

   - Endpoint: `POST /api/mes/production-plans/:planId/launch`
     - Input: no body changes
     - Behavior change: backend must prefer `plan.nodes` over `plan.executionGraph` (add fallback for migration)
     - Function called: `enrichNodesWithEstimatedTimes(plan.nodes, planData, db)` (signature changed to remove executionGraph param)
     - Output: creates `mes-worker-assignments` documents with canonical fields (nodeId, substationId, nominalTime, effectiveTime, preProductionReservedAmount)

   - Endpoint: `PATCH /api/mes/worker-assignments/:assignmentId` (actions: start, pause, resume, complete)
     - No contract changes, but internal behavior must use canonical assignment fields
     - Start action: create stock-movements with `requestedQuantity` (from preProductionReservedAmount) and `actualQuantity` (min of stock available)
     - Complete action: cap consumption at `actualReservedAmounts[materialCode]`

2. Document request/response examples for each endpoint with before/after payload structures.

3. List deprecated fields and their replacement:
   - `node.time` → `node.nominalTime`
   - `node.skills` → `node.requiredSkills`
   - `node.nodeId` → `node.id`
   - `assignment.actualFinish` → `assignment.actualEnd`

4. Document error responses:
   - 400 Bad Request: invalid node schema (missing id, nominalTime <= 0, invalid predecessors)
   - 409 Conflict: material reservation failed (partial stock) on start action
   - 422 Unprocessable Entity: consumption exceeds reserved amounts on complete

Files to reference:
- `/quote-portal/server/mesRoutes.js` — all endpoints listed above
- `/quote-portal/server/models/` (if schema files exist, otherwise note they need to be created)

Expected output:
- A new section in `Optimized-DATA-FLOW-STUDY.md` with detailed API contract documentation.
- Include curl examples or JSON payloads for each endpoint.

Acceptance criteria:
- Every endpoint change is documented with old vs new contract.
- Error responses are specified.
- Backward compatibility strategy is clear.

Commit message suggestion:
```
docs: document API contract changes for canonical model in Optimized-DATA-FLOW-STUDY.md
```
```

---

### Prompt 4: Frontend changes required

**Prompt:**
```
Task: Implement frontend changes to stop sending `executionGraph[]` and map node fields to canonical names in `planDesigner.js`.

Requirements:
1. File: `/quote-portal/domains/production/js/planDesigner.js`
   - Function: `savePlanDraft()` (around line 450-550 based on previous reads)
   - Changes:
     a) Remove the line `executionGraph: buildExecutionGraph(planDesignerState.nodes)` from the payload
     b) In the `sanitizedNodes` mapping loop, change field mappings:
        - Map `time` → `nominalTime`
        - Map `skills` → `requiredSkills`
        - Map `assignedStationId` (if single value) → `assignedStations: [{ stationId: node.assignedStationId, priority: 1 }]` (array format)
        - Include `efficiency` field if present (optional per-node override)
        - Include `assignmentMode` field ('auto' or 'manual')
        - Include `assignedWorkerId` field if assignmentMode='manual'
        - Include `assignedSubstations` array if present (substation hints)
     c) Keep `buildExecutionGraph()` function for internal UI use only (for rendering the graph visualization), but do not include it in the saved payload

2. Add a node editor UI field for efficiency (optional):
   - In the node edit modal/form (search for where node properties are edited in planDesigner.js or related component files)
   - Add an input field labeled "Efficiency Override (%)" with validation (0 < value <= 100), convert to decimal (0.0-1.0) before saving
   - Show computed `effectiveTime = Math.round(nominalTime / (efficiency || 1.0))` as a preview in the UI

3. Update operations toolbox to show `defaultEfficiency` if available:
   - When operations are listed in the toolbox (search for where `mes-operations` are displayed), add a badge or label showing the operation's default efficiency
   - File: `/quote-portal/domains/production/js/planDesigner.js` or `/quote-portal/domains/production/components/` (check which file handles the operations list)

4. Validation:
   - Before saving, validate that all nodes have `id`, `nominalTime` > 0, and valid `predecessors` (referencing existing node ids)
   - Show user-friendly error messages if validation fails

Files to edit:
- `/quote-portal/domains/production/js/planDesigner.js` — main save flow and node editor
- Possibly `/quote-portal/domains/production/components/production-plan-designer.tsx` if React component is used for node editing

Expected output:
- Frontend sends only `nodes[]` with canonical field names to backend
- `executionGraph` is not included in the POST/PUT payload
- Node editor includes efficiency override input
- Operations toolbox shows default efficiency

Testing:
1. Open Plan Designer UI
2. Create a new plan with 2-3 nodes
3. Set different efficiency values for nodes (e.g., 80%, 100%)
4. Save the plan
5. Inspect the network request payload (browser dev tools) — verify no `executionGraph` field and `nodes[]` has `nominalTime`, `requiredSkills`, `assignedStations`, and `efficiency`
6. Verify backend saves the plan without errors

Acceptance criteria:
- `executionGraph` is not sent to backend
- All node fields use canonical names
- Efficiency input is available in UI
- effectiveTime preview is shown
- Tests pass

Commit message suggestion:
```
feat(frontend): map node fields to canonical schema and remove executionGraph from save payload
```
```

---

### Prompt 5: Backend code changes

**Prompt:**
```
Task: Implement backend changes to accept canonical nodes, compute derived execution graph server-side, and use efficiency in time calculations.

Requirements:
1. File: `/quote-portal/server/mesRoutes.js`
   
   a) Function: `enrichNodesWithEstimatedTimes(nodes, executionGraph, planData, db)`
      - Change signature to: `enrichNodesWithEstimatedTimes(nodes, planData, db)` (remove executionGraph param)
      - Inside the function:
        - For each node, load the operation document from `mes-operations` collection to get `defaultEfficiency`
        - Compute `effectiveTime = Math.round(node.nominalTime / (node.efficiency || operation.defaultEfficiency || 1.0))`
        - Set `node.effectiveTime` in the enriched output
        - Use `effectiveTime` (not nominalTime) when computing `estimatedStart` and `estimatedEnd` for preview purposes
      - Return enriched nodes array
      - Locations to update: search for all calls to `enrichNodesWithEstimatedTimes` and update call sites

   b) Function: `validateProductionPlanNodes(nodes, executionGraph = null)`
      - Change signature to: `validateProductionPlanNodes(nodes)` (remove executionGraph param)
      - Validate canonical schema:
        - Each node must have: `id` (string), `nominalTime` (integer > 0), `predecessors` (array, valid node ids)
        - Optional fields: `efficiency` (0 < value <= 1), `requiredSkills` (array), `assignedStations` (array)
        - **NEW:** If `assignmentMode='manual'`, validate that `assignedWorkerId` is present and non-empty
        - **NEW:** If both `nodes[]` and `executionGraph[]` exist in request, cross-validate node IDs match and warn on schema discrepancies
        - Check for cycles in the dependency graph using `buildTopologicalOrder(nodes)`
      - Return validation errors array or empty if valid

   c) Endpoint: `POST /api/mes/production-plans`
      - Call `validateProductionPlanNodes(req.body.nodes)` before saving
      - If validation fails, return 400 with error details
      - If `req.body.executionGraph` exists, log deprecation warning: "executionGraph is deprecated, using nodes instead"
      - Call `enrichNodesWithEstimatedTimes(req.body.nodes, planData, db)`
      - Save plan with enriched nodes: `plan.nodes = enrichedNodes`
      - Do NOT save `executionGraph` in new plans

   d) Endpoint: `POST /api/mes/production-plans/:planId/launch`
      - Prefer `plan.nodes` over `plan.executionGraph` (add fallback for migration):
        ```javascript
        const nodesToUse = plan.nodes || plan.executionGraph || [];
        if (!plan.nodes && plan.executionGraph) {
          console.warn(`Plan ${planId} using deprecated executionGraph, consider migration`);
        }
        ```
      - Use `nodesToUse` in `buildTopologicalOrder(nodesToUse)` and `assignNodeResources` loop

   e) Function: `assignNodeResources(node, predecessorTimes, workers, substations, stations, workersSchedule, substationsSchedule, db)`
      - Ensure scheduling uses `substationId` (not `stationId`) as the key in `substationsSchedule` map
      - Compute `plannedStart` and `plannedEnd` using `node.effectiveTime` (if available) or fallback to `node.nominalTime`
      - Return assignment object with canonical fields: `nodeId: node.id`, `nominalTime: node.nominalTime`, `effectiveTime: node.effectiveTime`, `substationId`, `preProductionReservedAmount`

   f) Material reservation on start (PATCH /worker-assignments/:id with action=start):
      - Already implemented in previous fixes, verify it uses `assignment.preProductionReservedAmount` and records `actualReservedAmounts`
      - Ensure stock-movements include `requestedQuantity` and `actualQuantity` fields
      - **NEW:** When `actualQuantity < requestedQuantity`, set `partialReservation=true` and populate `warning` field with message like "Partial reservation: requested X, reserved Y due to insufficient stock"
      - **NEW:** Log metric `reservation_mismatch_count` when partial reservation occurs

   g) Material consumption on complete:
      - Already implemented, verify consumption is capped by `assignment.actualReservedAmounts[materialCode]`
      - **NEW:** Verify leftover material is returned to stock: `stock += (actualReservedAmounts[mat] - consumed)`
      - **NEW:** Create stock-movements: one per input (`type='out'`, `subType='production_consumption'`), one for output (`type='in'`, `subType='production_output'`)
      - **NEW:** Handle legacy `actualFinish` field: read it as fallback if `actualEnd` is not present in old assignment documents
      - **NEW:** Log defects in assignment but do not create stock movement for defects (they don't go to inventory)

2. Add operation master-data read for `defaultEfficiency`:
   - When loading operation document in `enrichNodesWithEstimatedTimes`, ensure `operation.defaultEfficiency` is read
   - If missing, default to `1.0`

3. Add server-side logging for migration tracking:
   - Log when old `executionGraph` is used: `console.warn('Plan ${planId} using deprecated executionGraph')`
   - Log when partial material reservation occurs: `console.warn('Partial reservation for material ${materialCode}')`

Files to edit:
- `/quote-portal/server/mesRoutes.js` — functions listed above

Expected output:
- Backend accepts canonical nodes and validates them
- Backend computes effectiveTime using efficiency
- Backend prefers nodes over executionGraph (with fallback)
- Launch creates assignments with canonical fields and substationId scheduling

Testing:
1. POST a new plan with canonical nodes (no executionGraph) → should save successfully
2. Launch the plan → verify assignments are created with effectiveTime = nominalTime / efficiency
3. Start an assignment with partial stock → verify actualReservedAmounts < preProductionReservedAmount and stock-movement has requestedQuantity and actualQuantity
4. Complete assignment → verify consumption capped by actualReservedAmounts
5. Test with an old plan that has executionGraph (no nodes) → should fallback and log deprecation warning

Acceptance criteria:
- All function signatures updated
- Validation enforces canonical schema
- effectiveTime computed correctly (inverse proportionality)
- Scheduling uses substationId
- Tests pass

Commit message suggestion:
```
feat(backend): implement canonical node schema and server-side enrichment with efficiency
```
```

---

### Prompt 6: Migration strategy

**Prompt:**
```
Task: Create a migration script to backfill canonical `nodes[]` from existing `executionGraph[]` in production plans, and implement on-read fallback logic.

Requirements:
1. Create migration script file: `/quote-portal/scripts/migrateExecutionGraphToNodes.js`
   
   Script logic:
   - Accept CLI flags: `--dry-run` (default), `--execute`, `--planId=<id>` (migrate single plan)
   - Load all plans from `mes-production-plans` collection
   - For each plan:
     a) Check if `plan.nodes` exists and is non-empty → skip (already migrated)
     b) Check if `plan.executionGraph` exists → convert to canonical nodes:
        - Map each executionGraph node to canonical schema:
          - `id: node.id || node.nodeId`
          - `nominalTime: node.time || node.estimatedNominalTime || node.duration || 60`
          - `requiredSkills: node.skills || node.requiredSkills || []`
          - `assignedStations: node.assignedStationId ? [{ stationId: node.assignedStationId, priority: 1 }] : (node.assignedStations || [])`
          - `assignedSubstations: node.assignedSubstations || []`
          - `assignmentMode: node.assignmentMode || node.allocationType || 'auto'`
          - `assignedWorkerId: node.assignedWorkerId || node.workerHint?.workerId || null`
          - `efficiency: node.efficiency || null` (omit if null)
          - `predecessors: node.predecessors || []`
          - `materialInputs: node.materialInputs || []`
          - `outputCode: node.outputCode || null`
          - `outputQty: node.outputQty || 0`
        - Store result in `canonicalNodes` array
     c) If `--dry-run`, log comparison: `console.log('Plan ${planId}: would migrate ${executionGraph.length} nodes')`
     d) If `--execute`, write to Firestore:
        - Update plan: `{ nodes: canonicalNodes, _migration: { executionGraphToNodes: true, migratedAt: new Date().toISOString(), migratedBy: 'migration-script' } }`
        - Do NOT delete `executionGraph` yet (keep for 2 release cycles)
   - Generate report: `{ totalPlans, alreadyMigrated, migrated, errors }`

2. File: `/quote-portal/server/mesRoutes.js`
   - Add on-read fallback in endpoints that load plans:
     ```javascript
     // In GET /production-plans/:id and similar
     if (!plan.nodes && plan.executionGraph) {
       plan.nodes = convertExecutionGraphToNodes(plan.executionGraph); // helper function
       console.warn(`Plan ${planId} missing nodes, using executionGraph fallback`);
     }
     ```
   - Create helper function `convertExecutionGraphToNodes(executionGraph)` that applies the mapping logic from the migration script

3. Rollback plan:
   - If migration causes issues, revert by using `plan.executionGraph` as source of truth
   - Add feature flag: `FEATURE_USE_CANONICAL_NODES=true|false` in config
   - When flag is false, prefer `executionGraph` over `nodes`

4. Documentation:
   - Add migration instructions to `/quote-portal/scripts/README.md`:
     - How to run dry-run: `node scripts/migrateExecutionGraphToNodes.js --dry-run`
     - How to migrate single plan: `node scripts/migrateExecutionGraphToNodes.js --execute --planId=PLAN-001`
     - How to migrate all: `node scripts/migrateExecutionGraphToNodes.js --execute`

Files to create/edit:
- `/quote-portal/scripts/migrateExecutionGraphToNodes.js` (new file)
- `/quote-portal/server/mesRoutes.js` (add fallback logic)
- `/quote-portal/scripts/README.md` (update with migration instructions)

Expected output:
- Migration script that can safely backfill nodes from executionGraph
- On-read fallback ensures old plans work without migration
- Feature flag allows safe rollback

Testing:
1. Create a test plan with only `executionGraph` (no nodes)
2. Run migration dry-run: `node scripts/migrateExecutionGraphToNodes.js --dry-run --planId=TEST-PLAN-001`
3. Verify output shows what would be migrated
4. Run migration: `node scripts/migrateExecutionGraphToNodes.js --execute --planId=TEST-PLAN-001`
5. Verify plan now has `nodes[]` with canonical fields
6. Load plan via API and verify it works
7. Test on-read fallback by removing `nodes` field and reloading → should fallback to executionGraph

Acceptance criteria:
- Migration script runs successfully in dry-run and execute modes
- On-read fallback prevents errors for old plans
- Feature flag enables safe rollback
- Documentation is clear

Commit message suggestion:
```
feat(migration): add executionGraph to canonical nodes migration script with on-read fallback
```
```

---

### Prompt 7: Validation & safety rules

**Prompt:**
```
Task: Define and implement JSON Schema validation for Plan/Node/Assignment objects and runtime invariants for material reservation/consumption.

Requirements:
1. Create JSON Schema files in `/quote-portal/server/models/`:
   
   a) File: `/quote-portal/server/models/ProductionPlanSchema.json`
      - Define schema for production plan document:
        ```json
        {
          "$schema": "http://json-schema.org/draft-07/schema#",
          "type": "object",
          "required": ["id", "orderCode", "status", "quantity", "nodes"],
          "properties": {
            "id": { "type": "string", "pattern": "^PLAN-" },
            "orderCode": { "type": "string" },
            "status": { "type": "string", "enum": ["draft", "released", "production", "completed", "cancelled"] },
            "quantity": { "type": "integer", "minimum": 1 },
            "nodes": { "type": "array", "items": { "$ref": "#/definitions/Node" } },
            "createdAt": { "type": "string", "format": "date-time" }
          },
          "definitions": {
            "Node": {
              "type": "object",
              "required": ["id", "name", "operationId", "nominalTime"],
              "properties": {
                "id": { "type": "string" },
                "name": { "type": "string" },
                "operationId": { "type": "string" },
                "nominalTime": { "type": "integer", "minimum": 1 },
                "efficiency": { "type": "number", "minimum": 0.01, "maximum": 1.0 },
                "requiredSkills": { "type": "array", "items": { "type": "string" } },
                "assignedStations": { "type": "array", "items": { "type": "object" } },
                "assignedSubstations": { "type": "array", "items": { "type": "string" } },
                "assignmentMode": { "type": "string", "enum": ["auto", "manual"] },
                "assignedWorkerId": { "type": "string" },
                "predecessors": { "type": "array", "items": { "type": "string" } },
                "materialInputs": { "type": "array" },
                "outputCode": { "type": "string" },
                "outputQty": { "type": "number", "minimum": 0 }
              }
            }
          }
        }
        ```

   b) File: `/quote-portal/server/models/AssignmentSchema.json`
      - Define schema for worker assignment:
        ```json
        {
          "$schema": "http://json-schema.org/draft-07/schema#",
          "type": "object",
          "required": ["id", "planId", "nodeId", "workerId", "stationId", "substationId", "status", "nominalTime"],
          "properties": {
            "id": { "type": "string", "pattern": "^WO-" },
            "planId": { "type": "string" },
            "nodeId": { "type": "string" },
            "workerId": { "type": "string" },
            "stationId": { "type": "string" },
            "substationId": { "type": "string" },
            "status": { "type": "string", "enum": ["pending", "in_progress", "paused", "completed", "cancelled"] },
            "nominalTime": { "type": "integer", "minimum": 1 },
            "effectiveTime": { "type": "integer", "minimum": 1 },
            "plannedStart": { "type": "string", "format": "date-time" },
            "plannedEnd": { "type": "string", "format": "date-time" },
            "preProductionReservedAmount": { "type": "object" },
            "actualReservedAmounts": { "type": "object" },
            "materialReservationStatus": { "type": "string", "enum": ["pending", "reserved", "consumed"] }
          }
        }
        ```

2. Install validation library if not present:
   - Add `ajv` (JSON Schema validator) to package.json: `npm install ajv`

3. File: `/quote-portal/server/mesRoutes.js`
   - Import schemas and create validator instances:
     ```javascript
     const Ajv = require('ajv');
     const ajv = new Ajv();
     const planSchema = require('./models/ProductionPlanSchema.json');
     const assignmentSchema = require('./models/AssignmentSchema.json');
     const validatePlan = ajv.compile(planSchema);
     const validateAssignment = ajv.compile(assignmentSchema);
     ```
   - In `POST /production-plans`, validate request body:
     ```javascript
     if (!validatePlan(req.body)) {
       return res.status(400).json({ error: 'Invalid plan schema', details: validatePlan.errors });
     }
     // NEW: Cross-validate nodes vs executionGraph if both present
     if (req.body.nodes && req.body.executionGraph) {
       const nodeIds = req.body.nodes.map(n => n.id).sort();
       const graphIds = req.body.executionGraph.map(n => n.id || n.nodeId).sort();
       if (JSON.stringify(nodeIds) !== JSON.stringify(graphIds)) {
         console.warn('nodes[] and executionGraph[] have mismatched IDs', { nodeIds, graphIds });
       }
     }
     ```
   - In assignment creation during launch, validate each assignment:
     ```javascript
     if (!validateAssignment(assignment)) {
       console.error('Invalid assignment schema', validateAssignment.errors);
     }
     ```

4. Runtime invariants (add assertions):
   
   a) Material reservation (start action):
      - Invariant: `actualReservedAmounts[materialCode] <= preProductionReservedAmount[materialCode]`
      - Invariant: `actualReservedAmounts[materialCode] <= material.stock` (before reservation)
      - **NEW:** When partial reservation occurs, stock-movement must have `partialReservation=true`, `requestedQuantity`, `actualQuantity`, and `warning` field
      - Add assertion:
        ```javascript
        if (actualReserved > requestedAmount) {
          throw new Error('Reservation invariant violated: actual > requested');
        }
        if (actualReserved < requestedAmount) {
          console.warn(`Partial reservation for ${materialCode}: requested ${requestedAmount}, reserved ${actualReserved}`);
          // Increment metric: reservation_mismatch_count
        }
        ```

   b) Material consumption (complete action):
      - Invariant: `consumedAmount <= actualReservedAmounts[materialCode]`
      - Add assertion:
        ```javascript
        if (consumed > actualReserved) {
          throw new Error('Consumption invariant violated: consumed > reserved');
        }
        ```

   c) Pause/resume time accounting:
      - Invariant: `totalPausedTime` must be monotonically increasing
      - Invariant: `currentPauseStart` must be null when status is not 'paused'
      - Add checks in pause/resume handlers

5. Add detailed error messages:
   - When validation fails, return error response with field-level details
   - When invariant is violated, log error with full context (planId, assignmentId, materialCode, amounts) and return 500 or 422

Files to create/edit:
- `/quote-portal/server/models/ProductionPlanSchema.json` (new)
- `/quote-portal/server/models/AssignmentSchema.json` (new)
- `/quote-portal/server/mesRoutes.js` (add validation calls and assertions)
- `/quote-portal/package.json` (add ajv dependency)

Expected output:
- JSON Schema validation prevents invalid plans from being saved
- Runtime assertions prevent material accounting errors
- Clear error messages guide developers and operators

Testing:
1. POST a plan with invalid schema (e.g., missing `id` field) → should return 400 with validation errors
2. POST a plan with `nominalTime = 0` → should return 400
3. Start an assignment and manually set `actualReservedAmounts` > `preProductionReservedAmount` in code → should throw assertion error
4. Complete assignment and manually set `consumed` > `actualReserved` → should throw assertion error
5. Verify all assertions are tested in unit tests

Acceptance criteria:
- JSON Schemas are defined and validate correctly
- All endpoints validate input
- Runtime invariants are enforced
- Tests cover validation and assertions

Commit message suggestion:
```
feat(validation): add JSON Schema validation and runtime invariants for material accounting
```
```

---

### Prompt 8: Testing & monitoring

**Prompt:**
```
Task: Create unit and integration tests for the canonical model flows, and add monitoring/metrics for tracking material reservation mismatches and plan migration status.

Requirements:
1. Unit tests file: `/quote-portal/tests/mesRoutes.test.js` (create if not exists)
   
   Test cases to implement:
   a) `enrichNodesWithEstimatedTimes` function:
      - Test: given nodes with nominalTime and efficiency, returns nodes with effectiveTime = nominalTime / efficiency
      - Example: node with nominalTime=30, efficiency=0.8 → effectiveTime=37.5 (rounded to 38)
      - Test: given node without efficiency, uses operation.defaultEfficiency
      - Test: given operation without defaultEfficiency, uses 1.0

   b) `validateProductionPlanNodes` function:
      - Test: valid nodes array → returns no errors
      - Test: node missing `id` → returns validation error
      - Test: node with nominalTime <= 0 → returns validation error
      - Test: node with invalid predecessor (referencing non-existent node) → returns validation error
      - Test: circular dependencies → returns cycle detection error

   c) `assignNodeResources` function:
      - Test: assigns to substation (not station) and uses substationId in schedule map
      - Test: computes plannedStart/plannedEnd based on worker schedule, substation workload, and predecessor times
      - Test: preProductionReservedAmount computed from materialInputs

   d) Material reservation transaction (start action):
      - Test: full reservation when stock is sufficient → actualReservedAmounts = preProductionReservedAmount
      - Test: partial reservation when stock is insufficient → actualReservedAmounts = available stock
      - Test: stock-movement created with requestedQuantity and actualQuantity
      - **NEW:** Test: partial reservation creates stock-movement with `partialReservation=true` and `warning` field populated
      - **NEW:** Test: metric `reservation_mismatch_count` incremented on partial reservation

   e) Material consumption transaction (complete action):
      - Test: consumption capped by actualReservedAmounts
      - Test: excess reserved material returned to stock
      - Test: output material created with correct quantity
      - **NEW:** Test: defects logged in assignment but no stock movement for defects
      - **NEW:** Test: legacy assignment with `actualFinish` (not `actualEnd`) reads correctly

2. Integration tests file: `/quote-portal/tests/mesIntegration.test.js` (create if not exists)
   
   End-to-end test scenarios:
   a) Create plan → launch → start → complete:
      - POST plan with canonical nodes (no executionGraph)
      - POST launch → verify assignments created with effectiveTime and substationId
      - PATCH start → verify materials reserved and actualReservedAmounts set
      - PATCH complete → verify consumption capped and outputs created

   b) Backward compatibility:
      - Create plan with executionGraph (no nodes)
      - Launch → verify fallback to executionGraph works
      - Verify deprecation warning logged

   c) Pause/resume:
      - Start assignment → pause → resume → complete
      - Verify totalPausedTime is correct

3. Monitoring & metrics (add to mesRoutes.js):
   
   Add metrics collection (use simple counters, or integrate with existing monitoring like Prometheus/Datadog if available):
   
   a) Metric: `reservation_mismatch_count`
      - Increment when `actualReservedAmounts < preProductionReservedAmount` on start
      - Log: `console.warn('Reservation mismatch for assignment ${assignmentId}, material ${materialCode}, requested: ${requested}, actual: ${actual}')`
      - Add to start action handler

   b) Metric: `plan_using_executionGraph_count`
      - Increment when plan is loaded with executionGraph but no nodes
      - Add to launch endpoint and GET endpoints

   c) Metric: `consumption_capped_count`
      - Increment when consumption is capped by actualReservedAmounts on complete
      - Log: `console.warn('Consumption capped for assignment ${assignmentId}, material ${materialCode}, theoretical: ${theoretical}, capped: ${capped}')`

   d) Metric: `validation_error_count`
      - Increment when plan validation fails
      - Track which fields fail most often

4. Add test scenarios document: `/quote-portal/tests/TEST-SCENARIOS.md`
   - Document all test cases from the earlier analysis (MES-DATA-FLOW-ANALYSIS.md)
   - Include step-by-step instructions for manual testing
   - Include expected outcomes and screenshots/logs

Files to create/edit:
- `/quote-portal/tests/mesRoutes.test.js` (new, unit tests)
- `/quote-portal/tests/mesIntegration.test.js` (new, integration tests)
- `/quote-portal/server/mesRoutes.js` (add metrics logging)
- `/quote-portal/tests/TEST-SCENARIOS.md` (new, test documentation)

Expected output:
- Comprehensive unit and integration test coverage
- Metrics tracking key issues (reservation mismatches, migration status)
- Test documentation for manual QA

Testing framework:
- Use Jest or Mocha (check existing test setup in package.json)
- Mock Firestore using `@google-cloud/firestore` mock or similar

Run tests:
```bash
npm test
# or
npm run test:mes
```

Acceptance criteria:
- All unit tests pass
- Integration tests cover full lifecycle
- Metrics logged correctly
- Test coverage > 80% for mesRoutes.js

Commit message suggestion:
```
test: add comprehensive unit and integration tests for canonical model and material flows
```
```

---

### Prompt 9: Rollout plan

**Prompt:**
```
Task: Create a staged rollout plan document and implement feature flags for safe production deployment of the canonical model.

Requirements:
1. Create rollout plan document: `/quote-portal/docs/ROLLOUT-PLAN.md`
   
   Document structure:
   - Phase 1: Development & Testing (1 week)
     - Complete all code changes (frontend + backend)
     - Run unit and integration tests
     - Manual testing on dev environment
     - Code review and approval
   
   - Phase 2: Staging Deployment (1 week)
     - Deploy backend changes to staging with feature flag `FEATURE_USE_CANONICAL_NODES=false` (disabled)
     - Deploy frontend changes to staging
     - Run migration dry-run on staging database
     - Enable feature flag and test with staging data
     - Monitor metrics: reservation mismatches, validation errors
     - If issues found, fix and repeat
   
   - Phase 3: Production Pilot (1 week)
     - Deploy to production with feature flag disabled
     - Run migration dry-run on production database (read-only)
     - Review dry-run results and fix any data issues
     - Select 5-10 pilot plans (low-risk orders) for migration
     - Migrate pilot plans and enable feature flag for those plans only (implement plan-level flag if needed)
     - Monitor metrics closely: reservation mismatches, errors, performance
     - Collect feedback from operators
   
   - Phase 4: Full Rollout (2 weeks)
     - If pilot successful, schedule full migration
     - Run migration script for all plans: `node scripts/migrateExecutionGraphToNodes.js --execute`
     - Enable feature flag globally: `FEATURE_USE_CANONICAL_NODES=true`
     - Monitor for 1 week with fallback ready
     - After 1 week of stability, remove fallback code (executionGraph reads)
   
   - Phase 5: Cleanup (1 week)
     - Remove deprecated fields from database (executionGraph)
     - Remove fallback code from codebase
     - Update documentation
     - Archive migration scripts

2. Implement feature flag system:
   
   File: `/quote-portal/config/featureFlags.js` (create if not exists)
   ```javascript
   module.exports = {
     USE_CANONICAL_NODES: process.env.FEATURE_USE_CANONICAL_NODES === 'true',
     ENABLE_VALIDATION: process.env.FEATURE_ENABLE_VALIDATION !== 'false', // default true
     // Add more flags as needed
   };
   ```

   File: `/quote-portal/server/mesRoutes.js`
   - Import feature flags: `const featureFlags = require('../config/featureFlags');`
   - Use flags in code:
     ```javascript
     // In launch endpoint
     const nodesToUse = featureFlags.USE_CANONICAL_NODES && plan.nodes 
       ? plan.nodes 
       : (plan.executionGraph || plan.nodes);
     ```

   File: `/quote-portal/.env.example`
   - Add feature flag documentation:
     ```
     # Feature Flags
     FEATURE_USE_CANONICAL_NODES=false  # Enable canonical node model
     FEATURE_ENABLE_VALIDATION=true     # Enable JSON schema validation
     ```

3. Rollback procedure:
   - Document in `/quote-portal/docs/ROLLOUT-PLAN.md`:
     - If issues found, immediately disable feature flag: set `FEATURE_USE_CANONICAL_NODES=false` and restart server
     - If data corruption suspected, restore from backup (ensure backups are taken before each phase)
     - If specific plans are problematic, revert those plans to executionGraph-based model
     - Investigate root cause, fix, and restart from Phase 2

4. Communication plan:
   - Document in rollout plan:
     - Notify team before each phase
     - Prepare operator training materials (how to use new efficiency fields in UI)
     - Create FAQ document for common issues
     - Set up incident response team for production rollout

5. Monitoring checklist:
   - Document metrics to watch:
     - Reservation mismatch rate (should be < 5%)
     - Validation error rate (should be < 1%)
     - Plans using executionGraph fallback (should decrease over time)
     - API response times (should not increase significantly)
     - Assignment creation time during launch (should be similar or faster)

Files to create/edit:
- `/quote-portal/docs/ROLLOUT-PLAN.md` (new, detailed plan)
- `/quote-portal/config/featureFlags.js` (new, feature flag config)
- `/quote-portal/server/mesRoutes.js` (integrate feature flags)
- `/quote-portal/.env.example` (document flags)

Expected output:
- Comprehensive rollout plan with timelines and responsibilities
- Feature flag system for safe deployment
- Rollback procedure documented
- Communication and monitoring checklists

Acceptance criteria:
- Rollout plan is approved by team lead
- Feature flags work correctly (can enable/disable without code changes)
- Rollback procedure is tested in staging
- Monitoring dashboards are set up

Commit message suggestion:
```
docs: add staged rollout plan and feature flags for canonical model deployment
```
```

---

## How to Use These Prompts

1. **Copy the entire prompt** for the TODO item you want to work on.
2. **Paste it directly** to the assistant in a new message.
3. The prompt includes:
   - Exact file paths to edit
   - Function and variable names
   - Required changes with code examples
   - Test commands
   - Acceptance criteria
   - Commit message suggestion
4. The assistant will implement the changes according to the prompt and verify everything is correct.
5. **Track completion** by updating the TODO list status after each prompt is completed.

**Important:** These prompts are designed to be self-contained. You can work on them in any order (though some have dependencies, e.g., backend changes should come before integration tests). Always test after each implementation before moving to the next prompt.

