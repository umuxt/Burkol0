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

