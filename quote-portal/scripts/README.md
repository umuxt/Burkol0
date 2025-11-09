# Scripts Directory

This directory contains utility scripts for database management, testing, and maintenance.

## Available Scripts

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
