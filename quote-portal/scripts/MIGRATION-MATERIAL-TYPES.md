# Material Type Migration Guide

## Overview

This guide covers the migration from legacy material types to the new standardized type system.

**Migration Date**: December 2024  
**Required Backend Version**: 3.1+  
**Estimated Duration**: ~5 minutes for typical dataset

---

## Why Migrate?

### Problems with Legacy System

1. **Inconsistent Naming**: `wip`, `wip_produced`, `final_product` were confusing
2. **No Production History**: Couldn't track where semi-finished products came from
3. **Poor Consumption Tracking**: No way to see which plans consumed materials
4. **Frontend/Backend Mismatch**: Different type names in different parts of the system

### New System Benefits

1. **Standardized Types**: Clear naming (semi_finished, finished_product)
2. **Production Tracking**: `productionHistory` array tracks all production events
3. **Consumption Tracking**: `consumedBy` array tracks material usage
4. **Better UI**: Cleaner material type tabs and filtering
5. **Scrap Support**: Foundation for 3-type scrap management system

---

## Pre-Migration Checklist

- [ ] **Backup Database**: Create Firestore export
- [ ] **Stop Production**: Pause active production plans
- [ ] **Test Environment**: Run migration on test database first
- [ ] **Review Changes**: Run dry-run mode to preview changes
- [ ] **Notify Users**: Inform team of upcoming maintenance window

---

## Migration Process

### Step 1: Backup Database

```bash
# Create Firestore export (via Firebase Console)
# Project Settings > Service Accounts > Generate Backup
```

Or use gcloud CLI:
```bash
gcloud firestore export gs://your-bucket-name/backups/pre-migration-$(date +%Y%m%d)
```

### Step 2: Run Dry Run

Preview what will change **without** modifying the database:

```bash
cd /path/to/Burkol0/quote-portal
npm run migrate:material-types:dry
```

**Review the output:**
- How many materials will be migrated?
- Are the type conversions correct?
- Any unexpected materials in the list?

**Example output:**
```
🔍 DRY RUN MODE - No changes will be made

📋 Found 156 materials to process

✓ Migrating M-008: type 'wip' → 'semi_finished'
  └─ category 'WIP' → 'SEMI_FINISHED'
  └─ Added productionHistory: []
  
✓ Migrating OUTPUT-001: type 'final_product' → 'finished_product'
  └─ Added productionHistory: []
  
...

📊 Migration Summary
Total Materials     : 156
Migrated           : 89
Skipped            : 67
```

### Step 3: Execute Migration

If dry-run looks good, execute the migration:

```bash
npm run migrate:material-types
```

The script will:
1. Process materials in batches of 450
2. Update types and categories
3. Add new fields (productionHistory, consumedBy)
4. Commit changes to Firestore
5. Automatically run validation

**Expected duration**:
- 100 materials: ~10 seconds
- 1,000 materials: ~30 seconds
- 10,000 materials: ~3 minutes

### Step 4: Validation

Validation runs automatically after migration, but you can re-run it:

```bash
npm run migrate:material-types -- --validate
```

**Validation checks:**
- ✅ No legacy types remain (wip, wip_produced, final_product)
- ✅ All semi_finished materials have productionHistory field
- ✅ All finished_product materials have productionHistory field
- ✅ Type distribution looks correct

**Example validation output:**
```
🔍 Validating migration...

📊 Material Type Distribution:
raw_material              : 45
semi_finished             : 72
finished_product          : 17
scrap                     : 0
legacy_types              : 0
missing_productionHistory : 0

✅ Validation passed! All materials use new type system
```

### Step 5: Verify in UI

1. **Navigate to Materials Page** (`/materials.html`)
2. **Check Tabs**: Should see "Ham Madde", "Yarı Mamül", "Bitmiş Ürün", "Hurda"
3. **Click "Yarı Mamül" tab**: Verify semi-finished materials appear
4. **Open Material Detail**: Check for production history section
5. **Test Material Creation**: Create new semi-finished material via plan canvas

### Step 6: Resume Operations

- [ ] Resume production plans
- [ ] Monitor for issues in next 24 hours
- [ ] Check logs for any type-related errors

---

## Rollback Procedure

If migration causes issues, you can rollback:

### Option 1: Rollback Migrated Materials Only (SAFE)

```bash
npm run rollback:material-types
```

This only reverts materials that have `migratedAt` timestamp (i.e., materials migrated by the script).

### Option 2: Full Rollback (USE WITH CAUTION)

```bash
npm run rollback:material-types -- --all
```

⚠️ This reverts ALL semi_finished/finished_product materials, even if manually created.

### Option 3: Restore from Backup

```bash
gcloud firestore import gs://your-bucket-name/backups/pre-migration-YYYYMMDD
```

---

## Post-Migration Considerations

### Frontend Updates Required

After migration, update frontend code if not already done:

1. **Update materialTypes array** in `src/main.jsx`:
```javascript
const materialTypes = [
  { id: 'raw_material', label: 'Ham Madde' },
  { id: 'semi_finished', label: 'Yarı Mamül' },
  { id: 'finished_product', label: 'Bitmiş Ürün' },
  { id: 'scrap', label: 'Hurda' }
];
```

2. **Remove legacy type checks** in components
3. **Update material type dropdowns** in modals

### Backend Compatibility

Backend maintains backward compatibility for 2 release cycles:

```javascript
// Still recognizes old 'wip' type
const isSemiFinished = 
  currentData.type === 'semi_finished' || 
  currentData.category === 'SEMI_FINISHED' || 
  currentData.type === 'wip' ||  // Legacy
  currentData.category === 'WIP' || 
  currentData.produced === true;
```

### Database Indexes

Ensure Firestore indexes are updated:

```json
{
  "indexes": [
    {
      "collectionGroup": "materials",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "type", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    }
  ]
}
```

---

## Troubleshooting

### Issue: Migration Script Fails with "Permission Denied"

**Cause**: Service account key missing or invalid

**Solution**:
```bash
# Verify service account key exists
ls -la quote-portal/config/serviceAccountKey.json

# If missing, download from Firebase Console
# Project Settings > Service Accounts > Generate new private key
```

### Issue: Some Materials Not Migrated

**Cause**: Materials might not have legacy types

**Solution**:
```bash
# Check validation output for material types
npm run migrate:material-types -- --validate

# Review which materials were skipped in migration log
```

### Issue: Validation Shows "legacy_types: 5"

**Cause**: Some materials still have old types (migration didn't catch them)

**Solution**:
```bash
# Run migration again (it's idempotent)
npm run migrate:material-types

# If issue persists, check those specific materials manually
```

### Issue: Frontend Still Shows Old Type Names

**Cause**: Browser cache or frontend not updated

**Solution**:
```bash
# Clear browser cache
# Hard refresh: Cmd+Shift+R (Mac) or Ctrl+F5 (Windows)

# Rebuild frontend
npm run build

# Restart backend
pm2 restart burkol-backend
```

### Issue: Production Plans Fail After Migration

**Cause**: Plan might be using old material references

**Solution**:
1. Check plan's `materialInputs` array
2. Verify material codes exist
3. Check backend logs for specific error
4. Consider rollback if issue is widespread

---

## Migration Statistics

After migration, you can query material distribution:

```javascript
// In Firebase Console > Firestore
db.collection('materials')
  .where('type', '==', 'semi_finished')
  .get()
  .then(snapshot => console.log(`Semi-finished: ${snapshot.size}`));
```

---

## FAQ

**Q: Is this migration reversible?**  
A: Yes, use `npm run rollback:material-types` to revert migrated materials.

**Q: Will this affect existing production plans?**  
A: No, plans reference materials by code, not type. Backend has backward compatibility.

**Q: Do I need to stop the backend server?**  
A: Recommended but not required. Migration uses batch operations for consistency.

**Q: How long does migration take?**  
A: ~1 second per 50 materials. Most systems complete in under 1 minute.

**Q: Can I run migration multiple times?**  
A: Yes, it's idempotent. Already-migrated materials are skipped.

**Q: What if I have custom material types?**  
A: Only wip/wip_produced/final_product are migrated. Custom types are preserved.

**Q: Will this affect material stock levels?**  
A: No, only type/category fields are changed. Stock quantities are untouched.

---

## Next Steps

After successful migration:

1. **Monitor System**: Watch for any type-related errors in logs
2. **Update Documentation**: Note migration in your deployment docs
3. **Train Users**: Brief team on new material type names
4. **Clean Up**: After 2 release cycles, remove legacy type support from backend
5. **Enable Scrap System**: Proceed with PROMPT #3 (3-type scrap management)

---

## Support

For issues or questions:
- Check backend logs: `pm2 logs burkol-backend`
- Review Firestore operations: Firebase Console > Usage tab
- Contact: [Your support contact]

---

**Document Version**: 1.0  
**Last Updated**: December 2024  
**Related Documents**: 
- `MES-Current-System-Data-Flow.md` - Appendix D
- `scripts/README.md` - Script documentation
