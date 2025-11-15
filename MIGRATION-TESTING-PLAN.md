# Material Type Migration - Testing & Validation Plan

## Overview

This document provides a comprehensive testing and validation plan for the material type migration.

---

## Pre-Migration Tests

### 1. Script Validation

```bash
# Test script syntax
node -c quote-portal/scripts/migrate-material-types.js
node -c quote-portal/scripts/rollback-material-types.js

# Verify scripts are executable
ls -lh quote-portal/scripts/migrate-material-types.js
# Should show: -rwxr-xr-x (executable)
```

**Expected Result**: ✅ No syntax errors, scripts executable

---

### 2. Dry-Run Test

```bash
# Run dry-run on current database
cd quote-portal
npm run migrate:material-types:dry
```

**Expected Output**:
```
🚀 Starting material type migration...
🔍 DRY RUN MODE - No changes will be made

📋 Found X materials to process

✓ Migrating M-XXX: type 'wip' → 'semi_finished'
  └─ category 'WIP' → 'SEMI_FINISHED'
  └─ Added productionHistory: []
  
...

📊 Migration Summary
Total Materials     : X
Migrated           : Y
Skipped            : Z

🔍 DRY RUN COMPLETE - No changes were made
```

**Validation Checklist**:
- [ ] Script runs without errors
- [ ] All legacy types identified
- [ ] Migration count looks correct
- [ ] No unexpected materials in list

---

### 3. Database State Check

```bash
# Check current material types in Firestore Console
# Go to: Firestore Database > materials collection
# Filter: type == 'wip' OR type == 'wip_produced' OR type == 'final_product'
```

**Record**:
- Number of `wip` materials: _______
- Number of `wip_produced` materials: _______
- Number of `final_product` materials: _______
- **Total to migrate**: _______

---

## Migration Execution Tests

### 1. Execute Migration

```bash
cd quote-portal
npm run migrate:material-types
```

**Monitor**:
- [ ] Script starts successfully
- [ ] Progress updates show
- [ ] Batch commits occur
- [ ] No error messages
- [ ] Auto-validation runs
- [ ] Validation passes

**Expected Duration**: ~1 second per 50 materials

---

### 2. Immediate Validation

```bash
# Validation runs automatically, but can re-run
npm run migrate:material-types -- --validate
```

**Expected Output**:
```
🔍 Validating migration...

📊 Material Type Distribution:
raw_material              : X
semi_finished             : Y
finished_product          : Z
scrap                     : 0
legacy_types              : 0
missing_productionHistory : 0

✅ Validation passed! All materials use new type system
```

**Critical Checks**:
- [ ] `legacy_types` = 0
- [ ] `missing_productionHistory` = 0
- [ ] `semi_finished` count = previous (wip + wip_produced)
- [ ] `finished_product` count = previous final_product count

---

### 3. Database Verification

**Firestore Console Checks**:

1. **Pick Random Semi-Finished Material**:
   - [ ] `type` = "semi_finished"
   - [ ] `category` = "SEMI_FINISHED"
   - [ ] `productionHistory` field exists (array)
   - [ ] `consumedBy` field exists (array)
   - [ ] `migratedAt` timestamp exists
   - [ ] `updatedAt` is recent
   - [ ] Stock value unchanged

2. **Pick Random Finished Product**:
   - [ ] `type` = "finished_product"
   - [ ] `productionHistory` field exists
   - [ ] `migratedAt` timestamp exists

3. **Pick Random Raw Material**:
   - [ ] `type` = "raw_material" (unchanged)
   - [ ] No `migratedAt` field (not migrated)

---

## Frontend Tests

### 1. Materials Page

**Navigate to**: `/materials.html`

**Tab Tests**:
- [ ] "Ham Madde" tab exists and clickable
- [ ] "Yarı Mamül" tab exists and clickable
- [ ] "Bitmiş Ürün" tab exists and clickable
- [ ] "Hurda" tab exists and clickable
- [ ] "Tümü" tab shows all materials

**Click "Yarı Mamül" Tab**:
- [ ] Semi-finished materials display
- [ ] Count in tab badge is correct
- [ ] Material list loads without errors

**Click "Bitmiş Ürün" Tab**:
- [ ] Finished product materials display
- [ ] Count matches expected

---

### 2. Material Detail Modal

**Open Material Detail** (click any semi-finished material):

- [ ] Modal opens without errors
- [ ] Material type displays correctly
- [ ] Stock information accurate
- [ ] "Üretim Bilgileri" section visible (if material.produced === true)
- [ ] All fields editable
- [ ] Save button works

---

### 3. Material Creation

**Via Plan Canvas**:

1. Create new production plan
2. Add node with semi-finished output
3. Launch plan
4. Check created material in Firestore

**Verify New Material**:
- [ ] `type` = "semi_finished"
- [ ] `category` = "SEMI_FINISHED"
- [ ] `productionHistory` = []
- [ ] `consumedBy` = []
- [ ] `produced` = true

---

## Backend Integration Tests

### 1. Material Stock Adjustment

```bash
# Test via API or create stock movement
curl -X POST http://localhost:3000/api/materials/M-XXX/adjust-stock \
  -H "Content-Type: application/json" \
  -d '{"delta": 10, "reason": "migration_test"}'
```

**Verify**:
- [ ] Stock updated correctly
- [ ] Stock movement created
- [ ] No type-related errors in logs

---

### 2. Production Plan Execution

**Test Complete Production Flow**:

1. Create plan with semi-finished material input
2. Assign to worker
3. Worker starts task
4. Worker completes task
5. Check stock movements

**Verify**:
- [ ] Plan launches without errors
- [ ] Materials reserved correctly
- [ ] Completion succeeds
- [ ] Stock movements accurate
- [ ] Output material created (if applicable)

---

### 3. Material Consumption Tracking

**For Semi-Finished Material**:

1. Note initial `consumedBy` array
2. Use material in production plan
3. Complete plan
4. Check `consumedBy` updated

**Verify**:
- [ ] `consumedBy` array has new entry
- [ ] Entry has correct planId, nodeId, quantity
- [ ] Timestamp is correct

---

## Rollback Tests (Optional)

⚠️ **Only test rollback on non-production database**

### 1. Dry-Run Rollback

```bash
npm run rollback:material-types:dry
```

**Expected Output**:
```
⏪ Starting material type rollback...
🔍 DRY RUN MODE - No changes will be made

📋 Found X materials to process

⏪ Rolling back M-XXX: type 'semi_finished' → 'wip'
  └─ category 'SEMI_FINISHED' → 'WIP'
  └─ Removed empty productionHistory field

...

📊 Rollback Summary
Total Materials     : X
Rolled Back        : Y
Skipped            : Z
```

**Validate**:
- [ ] Only migrated materials identified
- [ ] Counts match migration counts
- [ ] No unexpected materials

---

### 2. Execute Rollback (Test Database Only)

```bash
npm run rollback:material-types
```

**Verify**:
- [ ] Materials reverted to legacy types
- [ ] `migratedAt` field removed
- [ ] Empty arrays removed
- [ ] Stock unchanged

**Re-run Migration**:
```bash
npm run migrate:material-types
```

**Verify**:
- [ ] Migration works again (idempotent)
- [ ] Same materials migrated

---

## Performance Tests

### 1. Large Dataset Test

**If you have 1000+ materials**:

```bash
# Time the migration
time npm run migrate:material-types
```

**Expected**:
- ~30 seconds for 1000 materials
- ~3 minutes for 10,000 materials

**Monitor**:
- [ ] CPU usage acceptable
- [ ] Memory usage stable
- [ ] No Firestore quota warnings
- [ ] Batch commits succeed

---

### 2. Concurrent Access Test

**During migration**:

1. Keep backend server running
2. Run migration in one terminal
3. Access materials page in browser

**Verify**:
- [ ] Materials page still loads
- [ ] No errors during migration
- [ ] Both old and new types display correctly (during migration)

---

## Post-Migration Monitoring

### 1. Log Monitoring (24 hours)

```bash
# Watch backend logs
pm2 logs burkol-backend --lines 100
```

**Watch For**:
- [ ] No "material type" errors
- [ ] No "category WIP not found" errors
- [ ] Stock adjustments work normally
- [ ] Material consumption works

---

### 2. User Testing

**Have team members test**:

1. **Materials Manager**:
   - [ ] Browse materials page
   - [ ] Filter by type
   - [ ] Edit material details
   - [ ] Add new material

2. **Production Planner**:
   - [ ] Create production plan
   - [ ] Add materials to nodes
   - [ ] Launch plan
   - [ ] Check material reservation

3. **Worker**:
   - [ ] View assigned tasks
   - [ ] Complete task with material consumption
   - [ ] Verify stock updated

---

## Error Scenarios

### 1. Test Error Handling

**Invalid Service Account**:
```bash
# Temporarily rename service account file
mv config/serviceAccountKey.json config/serviceAccountKey.json.bak
npm run migrate:material-types:dry
# Expected: Clear error message about missing credentials
mv config/serviceAccountKey.json.bak config/serviceAccountKey.json
```

---

### 2. Network Interruption

**Simulate network issue** (test database only):
1. Start migration
2. Disconnect network midway
3. Check database state

**Expected**:
- Batch operations are atomic
- Either full batch succeeds or full batch fails
- No partial updates within batch

---

## Success Criteria Summary

### Critical (Must Pass)

- ✅ Validation shows 0 legacy types
- ✅ All semi_finished have `productionHistory`
- ✅ All finished_product have `productionHistory`
- ✅ Material counts match expected
- ✅ Frontend tabs display correctly
- ✅ Material creation works
- ✅ Production plans execute
- ✅ Stock movements accurate
- ✅ No errors in logs

### Important (Should Pass)

- ✅ Dry-run accurate
- ✅ Migration completes in expected time
- ✅ Rollback works (tested on dev)
- ✅ Concurrent access safe
- ✅ User testing positive
- ✅ Documentation clear

### Nice to Have

- ✅ Performance meets expectations
- ✅ Error handling graceful
- ✅ Logging helpful for debugging

---

## Sign-Off Checklist

Before marking migration as complete:

- [ ] All pre-migration tests passed
- [ ] Migration executed successfully
- [ ] Validation passed (0 legacy types)
- [ ] Frontend tests passed
- [ ] Backend integration tests passed
- [ ] 24-hour monitoring completed
- [ ] User testing completed
- [ ] Documentation updated
- [ ] Team notified of completion
- [ ] Rollback procedure tested (dev)
- [ ] Backup retained for 30 days

**Signed Off By**: ________________  
**Date**: ________________  
**Environment**: Production / Development (circle one)  

---

## Appendix: Test Data Examples

### Sample Material - Before Migration

```json
{
  "code": "M-008",
  "name": "Test Semi-Finished",
  "type": "wip",
  "category": "WIP",
  "stock": 100,
  "unit": "adet",
  "status": "Aktif",
  "produced": true,
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-11-01T15:30:00Z"
}
```

### Sample Material - After Migration

```json
{
  "code": "M-008",
  "name": "Test Semi-Finished",
  "type": "semi_finished",
  "category": "SEMI_FINISHED",
  "stock": 100,
  "unit": "adet",
  "status": "Aktif",
  "produced": true,
  "productionHistory": [],
  "consumedBy": [],
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-11-15T10:00:00Z",
  "migratedAt": "2024-11-15T10:00:00Z"
}
```

---

**Document Version**: 1.0  
**Last Updated**: December 2024  
**Related**: MIGRATION-MATERIAL-TYPES.md, MIGRATION-IMPLEMENTATION-SUMMARY.md
