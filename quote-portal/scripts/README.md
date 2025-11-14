# Scripts Directory

This directory contains utility scripts for database management, testing, and maintenance.

## Available Scripts

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
