# MES Work Package Allocation - Complete Data Flow Analysis
**Detective Analysis: Node Creation → Work Package → Completion**
**Date:** 14 Kasım 2025

---

## 🔍 EXECUTIVE SUMMARY

This document provides a comprehensive analysis of data transformations in the MES system from production plan node creation through work package allocation to task completion. Key findings include:

### Critical Data Incompatibilities Found:
1. **Field Name Variations:** `time` vs `estimatedNominalTime` vs `duration` (3 different names for same data)
2. **ID Field Duality:** `id` vs `nodeId` (system must check both fields everywhere)
3. **Skills Field Variation:** `skills` vs `requiredSkills` (2 different property names)
4. **Station Field Variation:** `assignedStationId` (string) vs `assignedStations` (array of objects)
5. **Time Field Inconsistency:** `actualFinish` (old) vs `actualEnd` (new) - **FIXED**
6. **Material Reservation Gap:** `preProductionReservedAmount` → `actualReservedAmounts` (may differ if stock insufficient)

---

## 📊 PHASE 1: PRODUCTION PLAN CREATION

### Input Data Structure (Frontend → Backend)
```javascript
POST /api/mes/production-plans
{
  id: "PLAN-001",                    // Plan ID
  status: "draft",                   // draft|released|production
  orderCode: "WO-2024-001",         // Work order code (for WO-XXX-XX format)
  quantity: 100,                     // Plan quantity multiplier
  nodes: [                           // Array of operation nodes
    {
      id: "node-1",                  // ⚠️ VARIATION: Some use 'id', some 'nodeId'
      name: "Kesim Operasyonu",
      operationId: "OP-001",
      time: 60,                      // ⚠️ VARIATION: Some use 'estimatedNominalTime' or 'duration'
      skills: ["welding"],           // ⚠️ VARIATION: Some use 'requiredSkills'
      assignedStationId: "ST-001",   // ⚠️ VARIATION: Some use 'assignedStations' array
      predecessors: [],              // Dependency array
      materialInputs: [              // Input materials
        {
          code: "M-00-001",
          qty: 10.5,
          required: true
        }
      ],
      outputCode: "M-10-001",        // Output material code
      outputQty: 100                 // Output quantity
    }
  ],
  executionGraph: [                  // ⚠️ DUPLICATE: Different field names than nodes[]
    {
      nodeId: "node-1",              // ⚠️ Uses 'nodeId' instead of 'id'
      estimatedNominalTime: 60,      // ⚠️ Uses 'estimatedNominalTime' instead of 'time'
      requiredSkills: ["welding"]    // ⚠️ Uses 'requiredSkills' instead of 'skills'
    }
  ]
}
```

### Data Transformation: Node Enrichment
**Function:** `enrichNodesWithEstimatedTimes(nodes, executionGraph, planData, db)`
**Location:** mesRoutes.js lines 1243-1360

#### Input Normalization Pattern:
```javascript
// CRITICAL PATTERN: System must handle multiple field name variations
const nodeId = node.id || node.nodeId;                                    // ID variation
const duration = node.time || node.estimatedNominalTime || node.duration || 60; // Time variation
const skills = node.skills || node.requiredSkills || [];                 // Skills variation
```

#### Enrichment Process:
```
Input Node               Transform                  Enriched Node
-----------             -----------                 --------------
id: "node-1"       →    assignNodeResources()  →    id: "node-1"
time: 60           →    + dependency calc      →    estimatedStartTime: ISO string
skills: [...]      →    + worker schedule      →    estimatedEndTime: ISO string
predecessors: []   →    + station schedule     →    assignedWorker: {id, name}
                                                     assignedStation: {id, name}
                                                     assignedSubstation: {id, code}
```

### Output: Enriched Plan Document (Firestore)
```javascript
mes-production-plans/{planId}
{
  id: "PLAN-001",
  status: "draft",
  quantity: 100,
  nodes: [                           // Enriched with timing
    {
      id: "node-1",
      estimatedStartTime: "2025-11-14T08:00:00Z",
      estimatedEndTime: "2025-11-14T09:00:00Z",
      // ... original fields ...
    }
  ],
  executionGraph: [...],             // ⚠️ Kept separate with different field names
  materialSummary: {
    rawMaterials: [...],
    hasShortages: false
  },
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

---

## 📊 PHASE 2: PRODUCTION PLAN LAUNCH

### Input: Launch Request
```javascript
POST /api/mes/production-plans/:planId/launch
{
  launchNow: true,
  ignoreMaterialWarnings: false
}
```

### Data Flow Diagram: Launch Process

```
┌─────────────────────────────────────────────────────────────────┐
│ LAUNCH PROCESS: Node → Assignment Transformation               │
└─────────────────────────────────────────────────────────────────┘

1. Load Plan Data
   ├─→ executionGraph (nodes with nodeId, estimatedNominalTime)
   ├─→ nodes (nodes with id, time)
   └─→ materialSummary

2. Build Execution Order
   └─→ buildTopologicalOrder(nodes)
       ├─ Normalize: nodeId = node.nodeId || node.id
       ├─ Validate: Check all predecessors exist
       ├─ Detect: Cycles (Kahn's algorithm)
       └─→ Returns: {order: [nodeId1, nodeId2, ...]}

3. Load Resources (Parallel)
   ├─→ mes-workers collection
   │   └─ Filter: status = "available"
   ├─→ mes-stations collection
   ├─→ mes-substations collection
   │   └─ Filter: stationId matches
   └─→ mes-operations collection

4. Validate Materials (Non-blocking)
   └─→ validateMaterialAvailabilityForLaunch()
       ├─ Check: Start nodes only
       ├─ Check: Raw materials (M-00-*)
       └─→ Returns: {warnings: [...]}

5. FOR EACH node in topological order:
   
   ┌─────────────────────────────────────────────────┐
   │ assignNodeResources(node, ...)                  │
   ├─────────────────────────────────────────────────┤
   │                                                 │
   │ INPUT NORMALIZATION:                            │
   │ ├─ nodeId = node.nodeId || node.id             │
   │ ├─ duration = node.time || estimatedNominal... │
   │ └─ skills = node.skills || node.requiredSkills │
   │                                                 │
   │ WORKER SELECTION:                               │
   │ ├─ Filter by skills match                      │
   │ ├─ Filter by availability                      │
   │ ├─ Check workerSchedule Map                    │
   │ └─ Select: First available                     │
   │                                                 │
   │ STATION SELECTION:                              │
   │ ├─ Get node.assignedStations array             │
   │ ├─ Match with station.availableSkills          │
   │ ├─ Load substations for each station           │
   │ └─ Select: Station + Substation                │
   │                                                 │
   │ SUBSTATION WORKLOAD CHECK: ⚠️ CRITICAL          │
   │ ├─ Check stationSchedule Map                   │
   │ ├─ Key: substationId (NOT stationId!)          │
   │ └─ Find earliest available slot                │
   │                                                 │
   │ TIME CALCULATION:                               │
   │ ├─ Base: now or last task end                  │
   │ ├─ Check: Predecessor dependencies             │
   │ ├─ Check: Worker schedule (breaks)             │
   │ ├─ Check: Substation schedule                  │
   │ ├─ Calculate: Start = max(all constraints)     │
   │ └─ Calculate: End = start + effectiveTime      │
   │                                                 │
   │ MATERIAL CALCULATION:                           │
   │ ├─ preProductionReservedAmount =                │
   │ │  calculatePreProductionReservedAmount()      │
   │ │  ├─ Input: node.materialInputs[]             │
   │ │  ├─ Factor: expectedDefectRate               │
   │ │  └─ Output: {materialCode: quantity}         │
   │ └─ plannedOutput =                              │
   │    calculatePlannedOutput()                     │
   │    └─ Output: {outputCode: outputQty * planQty}│
   │                                                 │
   │ RETURN ASSIGNMENT OBJECT                        │
   └─────────────────────────────────────────────────┘
             │
             ├─→ Update workerSchedule Map
             │   └─ Add: {nodeId, start, end}
             │
             └─→ Update stationSchedule Map
                 └─ Key: ⚠️ substationId (lines 5547-5590)
                 └─ Add: {nodeId, start, end}

6. Generate Work Package IDs
   └─→ generateWorkPackageIds(orderCode, count)
       └─ Format: "WO-XXX-01", "WO-XXX-02", ...

7. Batch Create Assignments (Firestore Transaction)
   └─→ mes-worker-assignments collection
```

### Critical Data Transformation: Node → Assignment

```
┌──────────────────────────┐         ┌──────────────────────────┐
│   Node (Design Time)     │         │  Assignment (Runtime)    │
├──────────────────────────┤         ├──────────────────────────┤
│ id/nodeId: "node-1"      │   →     │ id: "WO-001-01"          │
│ time/estimated.../dur: 60│   →     │ nodeId: "node-1"         │
│ operationId: "OP-001"    │   →     │ operationId: "OP-001"    │
│ skills/requiredSkills    │   →     │ workerId: "W-001"        │
│ assignedStation.../array │   →     │ stationId: "ST-001"      │
│                          │   →     │ substationId: "SUB-001"  │
│                          │   →     │ substationCode: "A1"     │
│ predecessors: []         │   →     │ plannedStart: ISO string │
│                          │   →     │ plannedEnd: ISO string   │
│ materialInputs: [...]    │   →     │ preProductionReserved... │
│ outputCode, outputQty    │   →     │ plannedOutput: {...}     │
│                          │   →     │ status: "pending"        │
└──────────────────────────┘         └──────────────────────────┘

⚠️ INCOMPATIBILITY ZONE:
- Field name must be checked with fallbacks (node.id || node.nodeId)
- Time field has 3 possible names
- Skills field has 2 possible names
- Station field is string vs array (complex mapping)
```

### Output: Work Assignments Created

```javascript
mes-worker-assignments/{WO-XXX-XX}
{
  id: "WO-001-01",                   // Work package ID (sequential)
  planId: "PLAN-001",
  workOrderCode: "WO-2024-001",
  nodeId: "node-1",
  nodeName: "Kesim Operasyonu",
  operationId: "OP-001",
  
  // Resource allocation
  workerId: "W-001",
  workerName: "Ali Yılmaz",
  stationId: "ST-001",
  stationName: "Kesim İstasyonu",
  substationId: "SUB-001-A",         // ⚠️ Used for scheduling (CRITICAL)
  substationCode: "A1",
  
  // Timing
  plannedStart: "2025-11-14T08:00:00Z",
  plannedEnd: "2025-11-14T09:00:00Z",
  nominalTime: 60,                   // Base time (minutes)
  effectiveTime: 75,                 // With efficiency factors
  
  // Status tracking
  status: "pending",                 // pending|in_progress|paused|completed|cancelled
  
  // Material tracking
  preProductionReservedAmount: {     // Planned reservation
    "M-00-001": 11                   // Includes defect rate buffer
  },
  plannedOutput: {                   // Expected output
    "M-10-001": 100
  },
  materialReservationStatus: "pending", // pending|reserved|consumed
  
  // Timestamps (null until actions occur)
  actualStart: null,
  actualEnd: null,
  pausedAt: null,
  currentPauseStart: null,
  totalPausedTime: 0,
  
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

---

## 📊 PHASE 3: TASK EXECUTION (Worker Portal)

### 3.1 Worker Views Tasks

```
GET /api/mes/worker-portal/tasks?workerId=W-001

┌─────────────────────────────────────────────┐
│ Task Loading Process                        │
├─────────────────────────────────────────────┤
│                                             │
│ 1. Load assignments (WHERE workerId = W-001)│
│    ├─ Filter: status != 'completed'        │
│    └─ Filter: status != 'cancelled'        │
│                                             │
│ 2. Load execution states for each plan     │
│    └─→ getPlanExecutionState(planId)       │
│        ├─ Load plan data                   │
│        ├─ Load all plan assignments        │
│        ├─ Load workers, stations, substa.. │
│        └─ Calculate prerequisites:         │
│            ├─ predecessorsDone             │
│            ├─ workerAvailable              │
│            ├─ substationAvailable          │
│            └─ materialsReady               │
│                                             │
│ 3. Build task objects (merge data)         │
│    ├─ Assignment data (status, timing)     │
│    ├─ Node data (name, operation)          │
│    ├─ Station data (name, location)        │
│    └─ State data (prerequisites, workload) │
│                                             │
│ 4. Return enriched tasks                   │
└─────────────────────────────────────────────┘

RESPONSE:
{
  tasks: [
    {
      assignmentId: "WO-001-01",
      planId: "PLAN-001",
      nodeId: "node-1",
      status: "pending",
      name: "Kesim Operasyonu",
      
      // Resource info
      workerId: "W-001",
      stationId: "ST-001",
      substationId: "SUB-001-A",
      substationCode: "A1",
      
      // Substation workload (for "Makine meşgul" check)
      substationCurrentOperation: null,      // If occupied: other nodeId
      substationCurrentWorkPackageId: null,  // If occupied: "WO-XXX-XX"
      substationCurrentExpectedEnd: null,    // If occupied: ISO string
      
      // Prerequisites
      prerequisites: {
        predecessorsDone: true,
        workerAvailable: true,
        substationAvailable: true,           // ⚠️ Based on substationId
        materialsReady: true
      },
      
      // Timing
      plannedStart: "2025-11-14T08:00:00Z",
      plannedEnd: "2025-11-14T09:00:00Z",
      actualStart: null,
      actualEnd: null
    }
  ],
  nextTaskId: "WO-001-01"
}
```

### 3.2 Worker Starts Task

```
PATCH /api/mes/worker-assignments/:assignmentId
{
  action: "start",
  workerId: "W-001"
}

┌─────────────────────────────────────────────────────────┐
│ START ACTION: Material Reservation + Status Update     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ 1. Load assignment document                            │
│    └─ Validate: status = "pending" or "paused"        │
│                                                         │
│ 2. MATERIAL RESERVATION (Transaction)                  │
│    ├─ FOR EACH material in preProductionReserved...:  │
│    │  ├─ Load material document                       │
│    │  ├─ Check: stock >= reservedQty                  │
│    │  ├─ Calculate actual = min(stock, reservedQty)  │
│    │  │                                                │
│    │  ├─ UPDATE material document:                    │
│    │  │  ├─ stock -= actualReservedQty               │
│    │  │  └─ wipReserved += actualReservedQty         │
│    │  │                                                │
│    │  └─ CREATE stock movement:                       │
│    │     ├─ type: "out"                               │
│    │     ├─ subType: "wip_reservation"               │
│    │     ├─ quantity: actualReservedQty              │
│    │     ├─ stockBefore, stockAfter                  │
│    │     ├─ wipReservedBefore, wipReservedAfter     │
│    │     └─ reference: assignmentId                  │
│    │                                                   │
│    └─ ⚠️ CRITICAL: actualReservedAmounts may differ   │
│       from preProductionReservedAmount if stock low   │
│                                                         │
│ 3. UPDATE assignment document:                         │
│    ├─ status: "in_progress"                           │
│    ├─ actualStart: now (only if not resuming)        │
│    ├─ materialReservationStatus: "reserved"           │
│    ├─ actualReservedAmounts: {...}                    │
│    │                                                   │
│    ├─ IF resuming from pause:                         │
│    │  ├─ pauseDuration = now - currentPauseStart     │
│    │  ├─ totalPausedTime += pauseDuration            │
│    │  └─ DELETE currentPauseStart                    │
│    │                                                   │
│    └─ DELETE pause metadata (pausedAt, pauseReason..)│
│                                                         │
│ 4. UPDATE worker document:                             │
│    └─ currentTask: {planId, nodeId, assignmentId}    │
│                                                         │
│ 5. UPDATE substation document: ⚠️ NOT STATION         │
│    ├─ currentOperation: nodeId                        │
│    ├─ currentWorkPackageId: assignmentId             │
│    ├─ currentExpectedEnd: ISO string                  │
│    └─ updatedAt: now                                  │
│                                                         │
└─────────────────────────────────────────────────────────┘

⚠️ MATERIAL INCOMPATIBILITY RISK:
preProductionReservedAmount: {"M-00-001": 11}  // PLANNED
actualReservedAmounts: {"M-00-001": 8}         // ACTUAL (stock was low!)
```

### Material Reservation Data Flow

```
┌─────────────────┐      ┌─────────────────┐      ┌──────────────────┐
│   materials/    │      │  stock-         │      │  mes-worker-     │
│   {materialCode}│      │  movements/{id} │      │  assignments/{id}│
├─────────────────┤      ├─────────────────┤      ├──────────────────┤
│ BEFORE:         │      │ type: "out"     │      │ preProduction... │
│ stock: 20       │  →   │ subType: "wip_  │  →   │ {"M-00-001": 11} │
│ wipReserved: 5  │      │  reservation"   │      │                  │
│                 │      │ quantity: 8     │      │ actualReserved..│
│ AFTER:          │      │ stockBefore: 20 │      │ {"M-00-001": 8}  │
│ stock: 12       │  ←   │ stockAfter: 12  │  ←   │ ⚠️ MISMATCH!     │
│ wipReserved: 13 │      │ wipReserved+: 8 │      │                  │
└─────────────────┘      └─────────────────┘      └──────────────────┘
```

### 3.3 Worker Pauses Task

```
PATCH /api/mes/worker-assignments/:assignmentId
{
  action: "pause",
  workerId: "W-001"
}

┌─────────────────────────────────────────┐
│ PAUSE ACTION: Status Only               │
├─────────────────────────────────────────┤
│                                         │
│ UPDATE assignment:                      │
│ ├─ status: "paused"                    │
│ ├─ pausedAt: now                       │
│ ├─ currentPauseStart: now ⚠️ TRACKING  │
│ ├─ pausedBy: email                     │
│ ├─ pauseContext: "worker"              │
│ └─ pauseReason: "Worker paused"        │
│                                         │
│ UPDATE worker.currentTask:              │
│ └─ status: "paused"                    │
│                                         │
│ NO MATERIAL CHANGES                     │
│                                         │
└─────────────────────────────────────────┘
```

### 3.4 Worker Completes Task

```
PATCH /api/mes/worker-assignments/:assignmentId
{
  action: "complete",
  workerId: "W-001",
  actualOutputQuantity: 95,      // Good output
  defectQuantity: 5               // Scrap/defects
}

┌──────────────────────────────────────────────────────────────┐
│ COMPLETE ACTION: Comprehensive Material Finalization        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ 1. Load assignment + plan + node data                       │
│                                                              │
│ 2. MATERIAL CONSUMPTION CALCULATION                          │
│    ├─ Gather data:                                          │
│    │  ├─ preProductionReservedAmount (planned)             │
│    │  ├─ actualReservedAmounts (what was actually reserved)│
│    │  ├─ plannedOutput                                      │
│    │  ├─ actualOutputQuantity (from worker input)          │
│    │  └─ defectQuantity (from worker input)                │
│    │                                                         │
│    ├─ Calculate consumption per material:                   │
│    │  │                                                      │
│    │  ├─ Input/Output Ratio = inputQty / outputQty         │
│    │  ├─ Total produced = actualOutput + defects           │
│    │  ├─ Consumed = totalProduced × ratio                  │
│    │  └─ ⚠️ Cap at actualReservedAmounts[material]         │
│    │                                                         │
│    └─ Build consumptionResults array                        │
│                                                              │
│ 3. MATERIAL UPDATES (Transaction) FOR EACH INPUT:           │
│    │                                                         │
│    ├─ Load material document                                │
│    ├─ Calculate:                                            │
│    │  ├─ releaseQty = actualReserved - consumed           │
│    │  └─ newWipReserved = current - actualReserved        │
│    │                                                         │
│    ├─ UPDATE material:                                      │
│    │  ├─ wipReserved -= actualReservedQty                 │
│    │  ├─ stock += releaseQty (return unused)              │
│    │  └─ updatedAt: now                                    │
│    │                                                         │
│    └─ CREATE stock movement (consumption):                  │
│       ├─ type: "out"                                        │
│       ├─ subType: "production_consumption"                  │
│       ├─ quantity: consumed                                 │
│       └─ notes: "Consumed in production"                    │
│                                                              │
│ 4. OUTPUT MATERIAL UPDATE (if good output > 0):             │
│    │                                                         │
│    ├─ Load output material document                         │
│    ├─ UPDATE:                                               │
│    │  ├─ stock += actualOutputQuantity                     │
│    │  └─ updatedAt: now                                    │
│    │                                                         │
│    └─ CREATE stock movement (production):                   │
│       ├─ type: "in"                                         │
│       ├─ subType: "production_output"                       │
│       ├─ quantity: actualOutputQuantity                     │
│       └─ notes: "Produced in MES operation"                 │
│                                                              │
│ 5. UPDATE assignment:                                        │
│    ├─ status: "completed"                                  │
│    ├─ actualEnd: now                                        │
│    ├─ actualOutputQuantity: 95                             │
│    ├─ defectQuantity: 5                                    │
│    ├─ materialReservationStatus: "consumed"                │
│    ├─ materialConsumptionResults: [...]                    │
│    └─ completedBy: email                                   │
│                                                              │
│ 6. CLEAR worker.currentTask                                 │
│                                                              │
│ 7. CLEAR substation workload:                               │
│    ├─ DELETE currentOperation                              │
│    ├─ DELETE currentWorkPackageId                          │
│    └─ DELETE currentExpectedEnd                            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Complete Material Flow Diagram

```
┌───────────────────────────────────────────────────────────────┐
│ MATERIAL LIFECYCLE: Reservation → Consumption → Output       │
└───────────────────────────────────────────────────────────────┘

START (action: "start")
│
├─ Material: M-00-001 (Raw Material)
│  ├─ stock: 20 → 12 (-8)
│  └─ wipReserved: 5 → 13 (+8)
│
└─ Assignment:
   ├─ preProductionReservedAmount: {"M-00-001": 11}
   └─ actualReservedAmounts: {"M-00-001": 8} ⚠️ MISMATCH

              ⬇ TIME PASSES ⬇

COMPLETE (action: "complete", actualOutput: 95, defects: 5)
│
├─ Calculate Consumption:
│  ├─ Total produced: 95 + 5 = 100
│  ├─ Input/Output ratio: 10.5 / 100 = 0.105
│  ├─ Theoretical consumed: 100 × 0.105 = 10.5
│  └─ Actual consumed: min(10.5, 8) = 8 ⚠️ CAPPED
│
├─ Material: M-00-001 (Input)
│  ├─ consumed: 8
│  ├─ released: 8 - 8 = 0 (no return)
│  ├─ wipReserved: 13 → 5 (-8)
│  └─ stock: 12 → 12 (+0 return)
│
├─ Material: M-10-001 (Output - Good Product)
│  └─ stock: 50 → 145 (+95)
│
└─ Stock Movements Created:
   ├─ M-00-001: type="out", subType="production_consumption", qty=8
   └─ M-10-001: type="in", subType="production_output", qty=95

DEFECTS (5 units) → Not tracked in stock, logged in assignment
```

---

## 🔍 DETECTED DATA INCOMPATIBILITIES

### 1. Field Name Variations (CRITICAL)

| Concept | Variation 1 | Variation 2 | Variation 3 | Impact |
|---------|------------|-------------|-------------|--------|
| Node ID | `id` | `nodeId` | - | Must check both everywhere |
| Duration | `time` | `estimatedNominalTime` | `duration` | 3 fallback checks |
| Skills | `skills` | `requiredSkills` | - | 2 fallback checks |
| Station | `assignedStationId` (string) | `assignedStations` (array) | - | Complex mapping |

**Code Pattern Used:**
```javascript
const nodeId = node.id || node.nodeId;
const duration = node.time || node.estimatedNominalTime || node.duration || 60;
const skills = node.skills || node.requiredSkills || [];
```

### 2. Dual Data Structures

**Problem:** System maintains TWO arrays with different schemas:
- `nodes[]` - Uses: id, time, skills
- `executionGraph[]` - Uses: nodeId, estimatedNominalTime, requiredSkills

**Risk:** Updates to one may not sync to the other, causing data inconsistency.

### 3. Material Reservation Mismatch

```javascript
// PLANNED (calculated at launch)
preProductionReservedAmount: {"M-00-001": 11}

// ACTUAL (reserved at start - may be lower if stock insufficient)
actualReservedAmounts: {"M-00-001": 8}

// PROBLEM: System must handle this discrepancy throughout completion
```

**Impact:** Completion logic must cap consumption at `actualReservedAmounts`, not `preProductionReservedAmount`.

### 4. Time Field Naming

**FIXED:** Backend changed `actualFinish` → `actualEnd` to match frontend.
**Remaining Risk:** Legacy documents may still have `actualFinish`.

### 5. Missing Validation Points

| Stage | Missing Validation |
|-------|-------------------|
| Plan Creation | No check that `nodes[]` and `executionGraph[]` have same node IDs |
| Launch | No validation that all nodes have required fields (time/duration) |
| Start | No check if `actualReservedAmounts < preProductionReservedAmount` |
| Complete | No validation that `actualOutput + defects` matches expected output |

---

## 📋 COMPLETE DATA STRUCTURE REFERENCE

### Node (Design Time)
```javascript
{
  // ID (VARIATION)
  id: string,                        // OR nodeId
  nodeId: string,                    // OR id
  
  // Basic info
  name: string,
  operationId: string,
  operationName: string,
  
  // Duration (VARIATION)
  time: number,                      // OR estimatedNominalTime OR duration
  estimatedNominalTime: number,      // OR time OR duration
  duration: number,                  // OR time OR estimatedNominalTime
  
  // Skills (VARIATION)
  skills: string[],                  // OR requiredSkills
  requiredSkills: string[],          // OR skills
  
  // Station assignment (VARIATION)
  assignedStationId: string,         // OR assignedStations array
  assignedStations: [{               // OR assignedStationId string
    id: string,
    priority: number
  }],
  
  // Dependencies
  predecessors: string[],            // Array of node IDs
  
  // Materials
  materialInputs: [{
    code: string,
    qty: number,
    required: boolean
  }],
  outputCode: string,
  outputQty: number,
  
  // Enriched (after enrichNodesWithEstimatedTimes)
  estimatedStartTime: string,        // ISO timestamp
  estimatedEndTime: string,          // ISO timestamp
  assignedWorker: {id, name},
  assignedStation: {id, name},
  assignedSubstation: {id, code}
}
```

### Assignment (Runtime)
```javascript
{
  // Identity
  id: string,                        // "WO-XXX-XX" format
  planId: string,
  workOrderCode: string,
  nodeId: string,
  nodeName: string,
  operationId: string,
  
  // Resource allocation
  workerId: string,
  workerName: string,
  stationId: string,
  stationName: string,
  substationId: string,              // ⚠️ Used for scheduling
  substationCode: string,
  
  // Timing
  plannedStart: string,              // ISO timestamp
  plannedEnd: string,                // ISO timestamp
  nominalTime: number,               // Base time (minutes)
  effectiveTime: number,             // With efficiency factors
  actualStart: string | null,        // ISO timestamp (set on start)
  actualEnd: string | null,          // ISO timestamp (set on complete)
  
  // Pause tracking
  pausedAt: string | null,
  currentPauseStart: string | null,  // Track pause start for duration calc
  totalPausedTime: number,           // Accumulated pause time (ms)
  lastPauseDuration: number,         // Last pause duration (ms)
  pauseContext: string,              // "worker" | "plan" | "station_error"
  pauseReason: string,
  
  // Status
  status: string,                    // "pending" | "in_progress" | "paused" | "completed" | "cancelled"
  
  // Material tracking
  preProductionReservedAmount: {     // PLANNED reservation
    [materialCode]: number
  },
  actualReservedAmounts: {           // ACTUAL reservation (may differ!)
    [materialCode]: number
  },
  plannedOutput: {
    [materialCode]: number
  },
  materialReservationStatus: string, // "pending" | "reserved" | "consumed"
  materialReservationTimestamp: Timestamp,
  materialConsumptionResults: [{
    materialCode: string,
    consumed: number,
    released: number,
    unit: string
  }],
  
  // Completion data
  actualOutputQuantity: number,      // Good output
  defectQuantity: number,            // Scrap/defects
  completionContext: string,         // "normal" | "cancelled"
  
  // Metadata
  createdAt: Timestamp,
  updatedAt: Timestamp,
  createdBy: string,
  completedBy: string
}
```

### Material Document
```javascript
{
  code: string,                      // Primary key
  name: string,
  unit: string,
  stock: number,                     // Available quantity
  wipReserved: number,               // Reserved for production
  costPrice: number,
  category: string,
  subcategory: string,
  updatedAt: Timestamp
}
```

### Stock Movement
```javascript
{
  // Material reference
  materialId: string,
  materialCode: string,
  materialName: string,
  
  // Movement type
  type: "in" | "out",
  subType: "wip_reservation" | "production_consumption" | "production_output",
  
  // Quantities
  quantity: number,                  // Movement quantity
  requestedQuantity: number,         // What was requested (for partial)
  partialReservation: boolean,       // True if actual < requested
  
  // Stock state
  stockBefore: number,
  stockAfter: number,
  wipReservedBefore: number,
  wipReservedAfter: number,
  
  // Reference
  reference: string,                 // Assignment ID
  referenceType: string,             // "mes_task_start" | "mes_task_complete"
  relatedPlanId: string,
  relatedNodeId: string,
  
  // Metadata
  notes: string,
  warning: string | null,            // Stock warning if partial
  reason: string,
  movementDate: Timestamp,
  createdAt: Timestamp,
  userId: string,
  userName: string
}
```

---

## 🎯 SYSTEM FLOW SUMMARY

```
┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐
│   DESIGN   │ →  │   LAUNCH   │ →  │  EXECUTE   │ →  │  COMPLETE  │
└────────────┘    └────────────┘    └────────────┘    └────────────┘
     │                  │                  │                  │
     │                  │                  │                  │
  nodes[]          assign          material           material
     +          Resources()      reservation        consumption
executionGrap       +                +                   +
     h           validation      status update      output added
     │                  │                  │                  │
     ↓                  ↓                  ↓                  ↓
mes-production-  mes-worker-      materials/      materials/
   plans/        assignments/    {code}           {code}
   {id}            {WO-XX-XX}    stock-           stock-
                                 movements/       movements/
```

### Key Data Transformation Points:

1. **Plan Creation → Enrichment:**
   - Normalize field names (id/nodeId, time/duration)
   - Add estimated start/end times
   - Calculate material requirements

2. **Launch → Assignment:**
   - Convert nodes to work packages
   - Assign resources (worker, station, substation)
   - Generate WO-XXX-XX IDs
   - Store material reservation plan

3. **Start → Reservation:**
   - Reserve materials (stock → wipReserved)
   - May reserve less than planned (stock shortage)
   - Track actualReservedAmounts separately

4. **Complete → Finalization:**
   - Consume materials (wipReserved → consumed)
   - Release unused (wipReserved → stock)
   - Add output to stock
   - Cap consumption at actualReservedAmounts

---

## ⚠️ CRITICAL FINDINGS SUMMARY

1. **Field Name Chaos:** 3 names for duration, 2 for skills, 2 for node ID
2. **Dual Data Structures:** nodes[] and executionGraph[] with different schemas
3. **Substation Tracking Fixed:** Now uses substationId (not stationId) for scheduling
4. **Material Mismatch:** preProductionReservedAmount ≠ actualReservedAmounts
5. **Pause Duration Tracking:** Now properly accumulates with currentPauseStart
6. **No Cross-Validation:** nodes[] vs executionGraph[] consistency not checked

---

## 📝 RECOMMENDATIONS

1. **Unify Field Names:** Standardize to one name per concept
2. **Merge Data Structures:** Eliminate nodes[] vs executionGraph[] duality
3. **Add Validation:** Check data consistency at plan creation
4. **Material Warnings:** Alert users when actualReserved < planned
5. **Output Validation:** Compare actual vs planned output at completion
6. **Legacy Migration:** Handle old documents with actualFinish field

---

**End of Analysis**
