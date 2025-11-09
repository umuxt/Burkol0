# Semi-Finished Code Registry Migration to Firestore

## Overview
The semi-finished product code registry has been migrated from localStorage to Firestore for centralized, persistent storage across all browsers and users.

## Changes Made

### 1. Backend API (`server/mesRoutes.js`)

#### New Endpoints:

**POST `/api/mes/output-codes/preview`**
- Purpose: Preview what semi-code would be assigned without committing it
- Request Body:
  ```json
  {
    "operationId": "op-xxx",
    "operationCode": "Ka",
    "stationId": "s-xxx",
    "materials": [
      { "id": "mat-001", "qty": 10, "unit": "kg" }
    ]
  }
  ```
- Response:
  ```json
  {
    "code": "Ka-001",
    "reserved": false,
    "message": "incomplete_materials" // if materials missing
  }
  ```
- Features:
  - Idempotent (same signature always returns same code)
  - Does NOT increment counters
  - Validates material quantities are complete
  - Uses Firestore transaction for consistency

**POST `/api/mes/output-codes/commit`**
- Purpose: Commit codes when plan/template is saved
- Request Body:
  ```json
  {
    "assignments": [
      {
        "prefix": "Ka",
        "signature": "op:xxx|code:Ka|st:s-xxx|mats:mat-001:10kg",
        "code": "Ka-001",
        "operationId": "op-xxx",
        "stationId": "s-xxx",
        "materialsHash": "mat-001:10kg"
      }
    ]
  }
  ```
- Response:
  ```json
  {
    "committed": 5,
    "skipped": 2,
    "errors": []
  }
  ```
- Features:
  - Batches by prefix to minimize transactions
  - Validates code matches expected next value
  - Skips if signature already exists
  - Increments counters only on commit

#### Firestore Schema:

**Collection:** `mes-outputCodes`

**Document ID:** `<prefix>` (e.g., `Ka`, `KaO`, `BrMn`)

**Document Structure:**
```javascript
{
  prefix: "Ka",
  nextCounter: 3,
  codes: {
    "op:xxx|code:Ka|st:s-xxx|mats:mat-001:10kg": {
      code: "Ka-001",
      createdAt: Timestamp,
      operationId: "op-xxx",
      stationId: "s-xxx",
      materialsHash: "mat-001:10kg"
    },
    "op:yyy|code:Ka|st:s-yyy|mats:mat-002:5kg": {
      code: "Ka-002",
      createdAt: Timestamp,
      operationId: "op-yyy",
      stationId: "s-yyy",
      materialsHash: "mat-002:5kg"
    }
  }
}
```

### 2. Client API Helpers (`production/js/mesApi.js`)

Added two new functions:

```javascript
// Preview semi code without committing
export async function getSemiCodePreview(payload)

// Commit semi codes when saving plan/template
export async function commitSemiCodes(assignments)
```

### 3. Semi Code Logic (`production/js/semiCode.js`)

**Major Changes:**
- ❌ Removed localStorage registry functions
- ✅ Added API-based preview and commit logic
- ✅ Nodes now track `_semiCodePending` flag
- ✅ Nodes store `_semiCodeMeta` for later commit
- ✅ Added `collectPendingSemiCodes()` helper

**New Functions:**
```javascript
// Async function that fetches from API
export async function computeAndAssignSemiCode(node, ops, stations)

// Preview for display without mutating node
export async function getSemiCodePreviewForNode(node, ops, stations)

// Collect all pending codes for commit
export function collectPendingSemiCodes(nodes)
```

**Kept Functions:**
```javascript
// Still used for prefix calculation
export function getPrefixForNode(node, ops, stations)

// Exposed for reference but now uses API
export function buildSignature(node, ops, stations)
```

### 4. Plan Designer (`production/js/planDesigner.js`)

**Updated Import:**
```javascript
import { 
  computeAndAssignSemiCode, 
  getSemiCodePreviewForNode,  // changed from getSemiCodePreview
  getPrefixForNode, 
  collectPendingSemiCodes      // new
} from './semiCode.js';

import { 
  ..., 
  commitSemiCodes              // new
} from './mesApi.js';
```

**Changes to `editNode()`:**
- Made function `async`
- Updated preview call to use `getSemiCodePreviewForNode()` with await

**Changes to `savePlanAsTemplate()`:**
- Added commit logic before saving:
```javascript
const pendingCodes = collectPendingSemiCodes(planDesignerState.nodes);
if (pendingCodes.length > 0) {
  const result = await commitSemiCodes(pendingCodes);
  // Clear pending flags on success
}
```

**Changes to `savePlanDraft()`:**
- Added commit logic in two places:
  1. When updating existing production plan from template
  2. When creating new production plan
- Same pattern as template save

### 5. Documentation (`docs/KULLANIM-KLAVUZU.md`)

Added new section under "Plan Tasarlama":

**🏷️ Yarı Mamul Kod Sistemi (Semi-Finished Codes)**
- Explains automatic code generation
- Documents code format and prefix rules
- Describes centralized Firestore storage
- Details preview → save → commit workflow
- Lists use cases (WIP tracking, material flow)

## Migration Benefits

### Before (localStorage):
- ❌ Codes lost on browser clear/reset
- ❌ Different codes across browsers
- ❌ No synchronization between users
- ❌ No audit trail
- ❌ Risk of conflicts

### After (Firestore):
- ✅ Codes persist across sessions
- ✅ Consistent codes across all browsers
- ✅ Synchronized between users
- ✅ Full audit trail (createdAt timestamps)
- ✅ Transaction-based conflict prevention
- ✅ Reuse of codes for identical combinations

## Behavior

### Preview Phase (Node Editing):
1. User selects station and enters materials
2. System calls preview API
3. Code shown in UI (marked as pending)
4. No Firestore write occurs

### Commit Phase (Save Plan/Template):
1. User clicks "Save" or "Save as Template"
2. System collects all pending codes
3. Calls commit API with batch of assignments
4. Firestore transaction validates and writes
5. Counters incremented only for new codes
6. Pending flags cleared

### Reuse Logic:
- Same signature (operation + station + materials) = Same code
- Different materials = New code
- Different station = New code
- System automatically detects and reuses

## Testing Checklist

- [ ] Create new plan with operations
- [ ] Verify preview shows codes in node badges
- [ ] Save as template - verify codes committed
- [ ] Reload page - verify codes persist
- [ ] Open in different browser - verify same codes
- [ ] Create identical operation - verify code reuse
- [ ] Change materials - verify new code assigned
- [ ] Check Firestore console for `mes-outputCodes` collection
- [ ] Verify counters increment correctly
- [ ] Test with multiple users simultaneously

## Rollback Plan

If issues occur, revert these files:
1. `server/mesRoutes.js` - Remove new endpoints
2. `production/js/mesApi.js` - Remove helper functions
3. `production/js/semiCode.js` - Restore localStorage logic
4. `production/js/planDesigner.js` - Restore old imports/calls
5. `docs/KULLANIM-KLAVUZU.md` - Remove new section

Old localStorage keys to clear: `semiCodeRegistry.v1`

## Future Enhancements

1. **Code Index Map:** Add reverse lookup from code → signature
2. **Bulk Code Generation:** Pre-generate codes for common combinations
3. **Code History:** Track when codes were used in which plans
4. **Code Analytics:** Report on most used prefixes/combinations
5. **Code Cleanup:** Archive unused codes after certain period
6. **Admin UI:** Manage and view all registered codes

## Notes

- Preview endpoint is completely safe (read-only transaction)
- Commit endpoint uses per-prefix transactions for atomicity
- If commit fails, system shows warning but allows save to continue
- Node metadata (`_semiCodePending`, `_semiCodeMeta`) is transient (not saved)
- Signature building exactly matches original localStorage logic
