# Scripts Directory

This directory contains utility scripts for database management, testing, and maintenance.

## Available Scripts

### 🆕 migrate-material-types.js
**Purpose:** Migrate material type system from legacy types to new standardized schema

**Background:**
The system previously used inconsistent material types (wip, wip_produced, final_product). This migration standardizes to a cleaner type system with better tracking capabilities.

**Type Migrations:**
- `wip` → `semi_finished` (Yarı Mamül)
- `wip_produced` → `semi_finished` (Üretilmiş Yarı Mamül → Yarı Mamül)
- `final_product` → `finished_product` (Bitmiş Ürün)
- Category: `WIP` → `SEMI_FINISHED`

**New Fields Added:**
- `productionHistory: []` - Tracks production records for semi_finished and finished_product
- `consumedBy: []` - Tracks consumption records for semi_finished materials
- `migratedAt` - Timestamp for rollback capability

**Usage Modes:**

1. **Dry-run (Preview)** - See what will change without modifying database:
```bash
npm run migrate:material-types:dry
# or
npm run migrate:material-types -- --dry
```

2. **Execute Migration** - Apply changes to database:
```bash
npm run migrate:material-types
```

3. **Validate Migration** - Check if all materials use new types:
```bash
npm run migrate:material-types -- --validate
```

**Example Output:**
```
🚀 Starting material type migration...

📋 Found 156 materials to process

✓ Migrating M-008: type 'wip' → 'semi_finished'
  └─ category 'WIP' → 'SEMI_FINISHED'
  └─ Added productionHistory: []
  └─ Added consumedBy: []

✓ Migrating OUTPUT-001: type 'final_product' → 'finished_product'
  └─ Added productionHistory: []

📦 Committed batch 1 (145 operations)

============================================================
📊 Migration Summary
============================================================
Total Materials     : 156
Migrated           : 89
Skipped            : 67
Errors             : 0

✅ Successfully migrated 89 materials
```

**Safety Features:**
- ✅ Dry-run mode for preview
- ✅ Batch processing (handles 450 operations per batch)
- ✅ Idempotent (safe to run multiple times)
- ✅ Automatic validation after migration
- ✅ Migration timestamp tracking for rollback
- ✅ Preserves all existing data
- ✅ Detailed progress logging

**Compatibility:**
Backend code includes backward compatibility checks:
```javascript
// materialsRoutes.js still recognizes old 'wip' type
const isSemiFinished = currentData.type === 'semi_finished' || 
                       currentData.category === 'SEMI_FINISHED' || 
                       currentData.type === 'wip' ||  // Legacy support
                       currentData.category === 'WIP' || 
                       currentData.produced === true;
```

---

### ⏪ rollback-material-types.js
**Purpose:** Revert material type migration back to legacy types

⚠️ **WARNING:** Use only if migration needs to be undone. This is a destructive operation.

**Type Rollbacks:**
- `semi_finished` → `wip`
- `finished_product` → `final_product`
- Category: `SEMI_FINISHED` → `WIP`
- Removes empty `productionHistory` and `consumedBy` arrays

**Usage Modes:**

1. **Dry-run (Preview)** - See what will be rolled back:
```bash
npm run rollback:material-types:dry
# or
npm run rollback:material-types -- --dry
```

2. **Rollback Migrated Materials Only** (SAFE):
```bash
npm run rollback:material-types
```
This only rolls back materials with `migratedAt` timestamp.

3. **Rollback ALL Materials** (DANGEROUS):
```bash
npm run rollback:material-types -- --all
```
⚠️ This rolls back ALL semi_finished/finished_product materials, even if not migrated by script.

**Safety Features:**
- ✅ Default mode only rolls back migrated materials
- ✅ 5-second countdown for --all mode
- ✅ Dry-run preview capability
- ✅ Detailed rollback logging

**When to Use:**
- Migration caused unexpected issues
- Need to revert for testing purposes
- Rolling back to previous system version

---

### 📦 migrateExecutionGraphToNodes.js
**Purpose:** Migrate production plans from legacy executionGraph[] to canonical nodes[]

**Background:**
Part of the MES data model migration to use nodes[] as the single source of truth for production planning. This script backfills canonical nodes[] from existing executionGraph[] data.

**Usage Modes:**

1. **Dry-run (default)** - Preview what would be migrated:
```bash
node quote-portal/scripts/migrateExecutionGraphToNodes.cjs --dry-run
```

2. **Migrate single plan** - Test on one plan first:
```bash
node quote-portal/scripts/migrateExecutionGraphToNodes.cjs --execute --planId=PLAN-001
```

3. **Migrate all plans** - Full migration:
```bash
node quote-portal/scripts/migrateExecutionGraphToNodes.cjs --execute
```

**Canonical Schema Mapping:**
- `id` ← node.id || node.nodeId
- `nominalTime` ← node.nominalTime || node.time || node.estimatedNominalTime || node.duration || 60
- `requiredSkills` ← node.requiredSkills || node.skills || []
- `assignedStations` ← [{stationId: node.assignedStationId, priority: 1}] if single, else node.assignedStations
- `efficiency` ← node.efficiency (omitted if null)
- Plus all other canonical fields (predecessors, materialInputs, outputCode, etc.)

**Safety Features:**
- Default dry-run mode (must explicitly use `--execute`)
- Preserves executionGraph[] for backward compatibility (kept for 2 release cycles)
- Skips plans already migrated (_migration.executionGraphToNodes === true)
- Comprehensive error handling and reporting
- Single-plan testing capability
- Adds _migration metadata for tracking

**Migration States:**
- `already_migrated` - Plan has _migration.executionGraphToNodes = true
- `migrated/would_migrate` - Plan successfully converted
- `no_execution_graph` - Plan has neither nodes nor executionGraph (skipped)
- `error` - Migration failed with error details

**Feature Flag:**
After migration, the system uses canonical nodes[] by default. To rollback if needed:
```bash
export FEATURE_USE_CANONICAL_NODES=false
```

**Testing Procedure:**
1. Run dry-run to see what will change
2. Test on single plan: `--execute --planId=<test-plan-id>`
3. Verify plan in UI and check _migration metadata
4. If successful, migrate all plans: `--execute`
5. Monitor for issues; use feature flag to rollback if needed

**On-read Fallback:**
The backend automatically converts executionGraph to nodes on-read for old plans that haven't been migrated yet. See mesRoutes.js `convertExecutionGraphToNodes()` function.

---

### 🔄 reset-mes-data.js
**Purpose:** Reset all MES Firestore collections for clean testing

**Usage:**
```bash
RESET_MES=1 node quote-portal/scripts/reset-mes-data.js
```

**Warning:** This is a destructive operation that permanently deletes all MES data!

**Collections Purged:**
- mes-production-plans
- mes-worker-assignments
- mes-approved-quotes
- mes-workers
- mes-stations
- mes-substations
- mes-operations
- mes-alerts
- mes-work-orders
- mes-settings
- mes-counters
- mes-templates
- mes-orders

**Safety Features:**
- Requires `RESET_MES=1` environment flag
- 3-second countdown before execution
- Progress indicators for each collection
- Detailed summary report

---

### 🧹 cleanup-firestore.js
**Purpose:** General Firestore cleanup utilities

---

### 🔍 check-suppliers.cjs
**Purpose:** Verify supplier data integrity

---

### 🐛 debug-supplier-materials.cjs
**Purpose:** Debug supplier materials relationships

---

### 🧪 firestore-smoke-test.js
**Purpose:** Basic Firestore connectivity test

---

### 📦 mes-materials-removal-info.js
**Purpose:** Information about MES materials collection removal

---

### 🔄 Migration Scripts
- `migrate-material-types.js` - **NEW**: Migrate material types from legacy (wip, wip_produced, final_product) to new system (semi_finished, finished_product)
- `rollback-material-types.js` - **NEW**: Rollback material type migration
- `migrate-manual-override.js` - Migrate manual override data
- `migrate-sessions.js` - Migrate session data
- `migrate-versioning.js` - Migrate versioning data

---

### ⚙️ setup-config.js
**Purpose:** Initialize configuration files

---

### 🧪 Test Scripts
- `test-add-material.cjs` - Test material addition
- `test-session-system.js` - Test session management

---

### 📊 update-suppliers.cjs
**Purpose:** Update supplier data in bulk

---

## General Usage Pattern

Most scripts use the Firebase Admin SDK and require:

1. **Service Account Key**: `config/serviceAccountKey.json` must exist
2. **Node.js**: Version 18 or higher recommended
3. **Dependencies**: Run `npm install` in quote-portal directory

## Running Scripts

From the project root:
```bash
cd /path/to/Burkol0
node quote-portal/scripts/<script-name>.js
```

## Safety Best Practices

1. **Always backup** before running destructive scripts
2. **Test in development** environment first
3. **Use environment flags** for protection (like `RESET_MES=1`)
4. **Review logs** after execution
5. **Document changes** in your deployment notes

## Need Help?

Check the individual script files for detailed documentation and usage examples. Each script includes inline comments and error handling.
