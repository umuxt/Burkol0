# MES Test Scenarios - Manual Testing Guide

## Overview
This document provides step-by-step manual test scenarios for the MES canonical model implementation. Use these scenarios to validate the system before production deployment.

---

## Test Scenario 1: Create Plan with Canonical Nodes

**Objective:** Verify that plans can be created with the new canonical `nodes[]` format and `executionGraph` is not saved.

### Prerequisites
- Backend server running
- Valid authentication token
- At least one operation in `mes-operations` collection

### Steps

1. **Open Plan Designer**
   - Navigate to `https://your-domain/pages/production.html`
   - Click "Create New Plan" button

2. **Add Nodes**
   - Drag "Kesim" operation from toolbox to canvas
   - Set node properties:
     - Name: "Kesim İşlemi"
     - Nominal Time: 60 minutes
     - Efficiency: 80% (optional)
   - Add material input: M-00-001, quantity: 100
   - Set output: M-01-001, quantity: 100

3. **Save Plan**
   - Click "Save Plan" button
   - Enter Order Code: WO-TEST-001
   - Enter Quantity: 100
   - Click "Confirm"

4. **Verify Request Payload** (Browser DevTools)
   - Open Network tab
   - Find POST request to `/api/mes/production-plans`
   - Inspect request body:
     - ✅ Should have `nodes[]` array
     - ✅ Each node should have `nominalTime` (not `time`)
     - ✅ Each node should have `requiredSkills` (not `skills`)
     - ❌ Should NOT have `executionGraph[]` field

5. **Verify Database**
   - Open Firestore console
   - Navigate to `mes-production-plans` collection
   - Find saved plan document
   - Check structure:
     - ✅ `nodes[]` exists with canonical fields
     - ✅ `id` follows pattern `PLAN-MMYY-XXX`
     - ✅ `status` is "draft"

**Expected Outcome:** Plan saved successfully with canonical schema, no `executionGraph` in payload or database.

**Pass/Fail Criteria:**
- [ ] Plan saves without errors
- [ ] Request contains `nodes[]` only
- [ ] Database document has canonical fields
- [ ] No `executionGraph` in request or database

---

## Test Scenario 2: Launch Plan with Auto-Assignment

**Objective:** Verify that launching a plan creates worker assignments with `effectiveTime`, `substationId`, and material reservations.

### Prerequisites
- Draft plan created (from Scenario 1)
- At least one active worker with matching skills
- At least one station with substations
- Sufficient material stock

### Steps

1. **Navigate to Plan**
   - Open production dashboard
   - Find plan WO-TEST-001
   - Status should be "draft"

2. **Launch Plan**
   - Click "Launch Plan" button
   - Confirm launch action

3. **Verify Launch Response**
   - Check success message
   - Verify assignments created count

4. **Check Worker Assignments** (Database)
   - Navigate to `mes-worker-assignments` collection
   - Find assignments for this plan
   - Verify each assignment has:
     - ✅ `id` format: `WO-001-01`, `WO-001-02`, etc.
     - ✅ `nodeId` (not `node_id`)
     - ✅ `substationId` (not just `stationId`)
     - ✅ `nominalTime` value matches node
     - ✅ `effectiveTime` computed (nominalTime / efficiency)
     - ✅ `preProductionReservedAmount` object with material codes
     - ✅ `plannedStart` and `plannedEnd` timestamps
     - ✅ `status` is "pending"
     - ✅ `materialReservationStatus` is "pending"

5. **Check Plan Status Update**
   - Plan status changed to "released"
   - `launchStatus` is "launched"

**Expected Outcome:** Assignments created with all canonical fields and proper scheduling.

**Pass/Fail Criteria:**
- [ ] Launch completes successfully
- [ ] All assignments have `effectiveTime` computed
- [ ] Scheduling uses `substationId`
- [ ] Material reservations calculated
- [ ] Plan status updated

---

## Test Scenario 3: Start Assignment with Material Reservation

**Objective:** Test material reservation logic, including partial reservation handling.

### Prerequisites
- Launched plan with pending assignments
- Material M-00-001 with known stock level

### Test Case 3a: Full Reservation (Sufficient Stock)

1. **Prepare Stock**
   - Ensure M-00-001 has stock >= 100 units

2. **Start Assignment**
   - Worker portal: select assignment WO-001-01
   - Click "Start Task"

3. **Verify Material Changes** (Database)
   - Check `materials` collection → M-00-001
   - ✅ `stock` decreased by reserved amount
   - ✅ `wipReserved` increased by reserved amount
   - ✅ Sum: `stock + wipReserved` unchanged

4. **Verify Assignment Update**
   - ✅ `status` changed to "in_progress"
   - ✅ `actualStart` timestamp set
   - ✅ `actualReservedAmounts` object populated
   - ✅ `actualReservedAmounts[M-00-001]` equals `preProductionReservedAmount[M-00-001]`
   - ✅ `materialReservationStatus` is "reserved"

5. **Check Stock-Movements**
   - Find stock-movement document for this reservation
   - ✅ `type` is "out"
   - ✅ `subType` is "reservation"
   - ✅ `requestedQuantity` equals `preProductionReservedAmount`
   - ✅ `actualQuantity` equals `actualReservedAmounts`
   - ✅ `partialReservation` is `false`

**Pass/Fail:** [ ] Full reservation succeeds, all invariants hold

### Test Case 3b: Partial Reservation (Insufficient Stock)

1. **Prepare Stock**
   - Set M-00-001 stock to 50 units (less than required 100)

2. **Start Assignment**
   - Worker portal: select assignment
   - Click "Start Task"

3. **Verify Partial Reservation**
   - ✅ `actualReservedAmounts[M-00-001]` is 50 (capped at available stock)
   - ✅ Stock-movement has:
     - `requestedQuantity`: 100
     - `actualQuantity`: 50
     - `partialReservation`: true
     - `warning`: "Partial reservation: requested 100, reserved 50..."

4. **Check Console Logs**
   - ✅ Warning logged: "Partial reservation for M-00-001: requested 100, reserved 50"
   - ✅ Metric logged: "Reservation mismatch for assignment WO-001-01..."

**Pass/Fail:** [ ] Partial reservation handled correctly, warnings logged

---

## Test Scenario 4: Complete Assignment with Consumption Capping

**Objective:** Verify material consumption is capped at `actualReservedAmounts` and leftover material is returned to stock.

### Prerequisites
- Assignment in "in_progress" status
- `actualReservedAmounts[M-00-001]` is 80 units (partial reservation)

### Steps

1. **Complete Assignment**
   - Worker portal: select in-progress assignment
   - Enter completion data:
     - Actual Output: 75 units
     - Defects: 5 units
   - Click "Complete Task"

2. **Verify Consumption Calculation**
   - Theoretical consumption: 100 units (based on output + defects)
   - ✅ Capped consumption: 80 units (limited by actualReservedAmounts)
   - ✅ Console log: "Consumption capped: theoretical=100, capped=80"

3. **Check Material Stock Updates**
   - ✅ `wipReserved` decreased by 80 (consumed amount)
   - ✅ `stock` unchanged (leftover 0 because fully consumed)
   - If consumption was 70:
     - ✅ `wipReserved` decreased by 70
     - ✅ `stock` increased by 10 (leftover returned)

4. **Verify Stock-Movements**
   - Input material movement:
     - ✅ `type`: "out"
     - ✅ `subType`: "production_consumption"
     - ✅ `quantity`: 80 (capped, not 100)
   - Output material movement:
     - ✅ `type`: "in"
     - ✅ `subType`: "production_output"
     - ✅ `quantity`: 75 (actualOutput, not including defects)

5. **Check Defect Logging**
   - ✅ Assignment document has `defects: 5`
   - ❌ No stock-movement for defects (defects don't go to inventory)

6. **Verify Assignment Status**
   - ✅ `status` is "completed"
   - ✅ `actualEnd` timestamp set
   - ✅ `materialReservationStatus` is "consumed"

**Expected Outcome:** Consumption capped correctly, leftover returned, defects logged but not added to inventory.

**Pass/Fail Criteria:**
- [ ] Consumption capped at actualReservedAmounts
- [ ] Leftover material returned to stock
- [ ] Output added to inventory
- [ ] Defects logged, no movement created
- [ ] All stock-movements correct

---

## Test Scenario 5: Pause and Resume with Time Accounting

**Objective:** Verify `totalPausedTime` is tracked correctly and monotonically increasing.

### Steps

1. **Start Assignment** (t=0)
   - Start time recorded

2. **Work for 10 minutes** (t=10 min)

3. **Pause Assignment** (t=10 min)
   - Click "Pause Task"
   - ✅ `status` changes to "paused"
   - ✅ `pausedAt` timestamp recorded
   - ✅ `currentPauseStart` timestamp recorded

4. **Wait 5 minutes** (t=15 min)

5. **Resume Assignment** (t=15 min)
   - Click "Resume Task"
   - ✅ `status` changes back to "in_progress"
   - ✅ `totalPausedTime` increased by 5 minutes (300000 ms)
   - ✅ `currentPauseStart` cleared (null)
   - ✅ `lastPauseDuration` is 5 minutes

6. **Work for 5 minutes** (t=20 min)

7. **Pause Again** (t=20 min)
   - ✅ `currentPauseStart` recorded again

8. **Wait 3 minutes** (t=23 min)

9. **Resume Again** (t=23 min)
   - ✅ `totalPausedTime` now 8 minutes (5 + 3)
   - ✅ Check invariant: new totalPausedTime (8 min) > previous (5 min) ✓

10. **Complete Assignment**
    - ✅ Final `totalPausedTime` is 8 minutes
    - ✅ Effective work time: 23 - 8 = 15 minutes

**Expected Outcome:** Pause/resume cycles correctly accumulate pause time, invariant maintained.

**Pass/Fail Criteria:**
- [ ] totalPausedTime increases monotonically
- [ ] currentPauseStart cleared on resume
- [ ] Multiple pause/resume cycles work correctly

---

## Test Scenario 6: Backward Compatibility (executionGraph Fallback)

**Objective:** Verify old plans with `executionGraph` can still be launched using fallback logic.

### Prerequisites
- Existing plan in database with `executionGraph[]` but no `nodes[]`
- OR manually create such a plan via database import

### Steps

1. **Find Old Plan**
   - Query Firestore for plans with `executionGraph` field
   - Note plan ID (e.g., PLAN-1224-001)

2. **Launch Old Plan**
   - Use API or UI to launch the plan

3. **Check Server Logs**
   - ✅ Deprecation warning logged: "Plan PLAN-1224-001 using deprecated executionGraph"
   - ✅ Log shows: "Converting executionGraph to nodes for processing"

4. **Verify Assignments Created**
   - ✅ Assignments created successfully
   - ✅ Assignments have canonical fields (nodeId, substationId, effectiveTime)

5. **Check Metrics**
   - ✅ Metric `plan_using_executionGraph_count` incremented
   - ✅ Logged: "Plan loaded with executionGraph fallback: PLAN-1224-001"

**Expected Outcome:** Old plans work with fallback, deprecation warnings logged.

**Pass/Fail:** [ ] Backward compatibility maintained

---

## Test Scenario 7: Validation Errors

**Objective:** Test JSON Schema validation and error responses.

### Test Case 7a: Missing Required Field

**Request:**
```bash
curl -X POST http://localhost:3000/api/mes/production-plans \
  -H "Content-Type: application/json" \
  -d '{
    "orderCode": "WO-INVALID",
    "quantity": 100,
    "nodes": [
      {
        "name": "Kesim",
        "nominalTime": 60
      }
    ]
  }'
```

**Expected Response:**
```json
{
  "error": "Invalid plan schema",
  "details": [
    {
      "instancePath": "/nodes/0",
      "message": "must have required property 'id'"
    }
  ]
}
```

**Pass/Fail:** [ ] 400 error with field details

### Test Case 7b: Invalid nominalTime

**Request:**
```json
{
  "nodes": [{
    "id": "node-1",
    "nominalTime": 0
  }]
}
```

**Expected:** 400 error, "nominalTime must be >= 1"

**Pass/Fail:** [ ] Validation catches invalid time

### Test Case 7c: Circular Dependency

**Request:**
```json
{
  "nodes": [
    {"id": "node-1", "predecessors": ["node-2"]},
    {"id": "node-2", "predecessors": ["node-1"]}
  ]
}
```

**Expected:** 400 error, "Circular dependency detected"

**Pass/Fail:** [ ] Cycle detection works

---

## Metrics Monitoring Checklist

### During Testing, Monitor These Metrics:

1. **Reservation Mismatch Count**
   - Check logs for: `Reservation mismatch for assignment...`
   - Expected: < 5% of all start actions

2. **Validation Error Count**
   - Check logs for: `Validation error: ...`
   - Track which fields fail most often
   - Expected: < 1% of plan creations

3. **Plan Using executionGraph Count**
   - Check logs for: `Plan using deprecated executionGraph`
   - Should decrease over time as migration proceeds

4. **Consumption Capped Count**
   - Check logs for: `Consumption capped for assignment...`
   - Indicates potential material planning issues

5. **API Response Times**
   - Measure POST /production-plans latency
   - Measure POST /launch latency
   - Should not increase significantly vs baseline

---

## Test Environment Setup

### Required Data

1. **Operations** (mes-operations)
   - At least 3 operations with different skills
   - Set `defaultEfficiency` = 0.8 for one operation

2. **Workers** (mes-workers)
   - At least 5 active workers
   - Variety of skills assigned
   - Personal schedules configured (work blocks and breaks)

3. **Stations** (mes-work-stations)
   - At least 3 stations
   - Each with 2-3 substations

4. **Materials** (materials)
   - Raw materials (M-00-xxx) with stock >= 1000
   - Semi-finished materials (M-01-xxx)
   - Output materials (M-02-xxx)

### Test Data Scripts

Run these scripts to populate test data:

```bash
# Create test operations
node scripts/seed-test-operations.js

# Create test workers
node scripts/seed-test-workers.js

# Create test materials with stock
node scripts/seed-test-materials.js
```

---

## Reporting Issues

When a test fails, collect:

1. **Screenshot** of error message
2. **Network tab** request/response (DevTools)
3. **Console logs** (browser and server)
4. **Firestore document** IDs involved
5. **Expected vs Actual** behavior

Report to: [Your issue tracker]

---

## Test Sign-Off

| Scenario | Pass | Fail | Notes | Tester | Date |
|----------|------|------|-------|--------|------|
| 1. Create plan with canonical nodes | [ ] | [ ] | | | |
| 2. Launch plan with auto-assignment | [ ] | [ ] | | | |
| 3a. Full material reservation | [ ] | [ ] | | | |
| 3b. Partial material reservation | [ ] | [ ] | | | |
| 4. Complete with consumption capping | [ ] | [ ] | | | |
| 5. Pause and resume time accounting | [ ] | [ ] | | | |
| 6. Backward compatibility fallback | [ ] | [ ] | | | |
| 7a. Validation: missing field | [ ] | [ ] | | | |
| 7b. Validation: invalid time | [ ] | [ ] | | | |
| 7c. Validation: circular dependency | [ ] | [ ] | | | |

**Overall Test Result:** [ ] PASS [ ] FAIL

**Approved for Production:** [ ] YES [ ] NO

**Approver:** _________________ **Date:** _________________
