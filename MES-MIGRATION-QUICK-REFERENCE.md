# MES Implementation Quick Reference

## Overview
Fresh PostgreSQL implementation of MES (Manufacturing Execution System) with optimized relational design.

**Status**: Ready for Implementation  
**Reference Code**: 8,511 lines (server/mesRoutes.js - Firebase reference)  
**Approach**: Build from scratch with SQL best practices

---

## Implementation Files Created

### 1. Migrations (5 new files)
```
✅ 022_create_mes_junction_tables.js       - Worker/station/operation many-to-many
✅ 023_create_mes_production_plan_nodes.js - Nodes with full normalization
✅ 024_modify_mes_tables_for_sql.js        - Update existing tables
✅ 025_create_mes_counter_sequences.js     - PostgreSQL sequences
✅ 026_create_mes_realtime_triggers.js     - LISTEN/NOTIFY triggers
```

### 2. Scripts
```
✅ scripts/seed-mes-data.js                - Create initial test data
```

### 3. Documentation
```
✅ MES-COMPREHENSIVE-ANALYSIS.md           - Full design analysis
✅ MES-MIGRATION-QUICK-REFERENCE.md        - This file
✅ MES-IMPLEMENTATION-PLAN.md              - 6-week roadmap
```

---

## Database Changes

### New Tables (8)
1. **mes_worker_stations** - Workers ↔ Stations (many-to-many)
2. **mes_worker_operations** - Workers ↔ Operations (many-to-many)
3. **mes_station_operations** - Stations ↔ Operations (many-to-many)
4. **mes_production_plan_nodes** - Extract nodes[] from production plans
5. **mes_node_stations** - Nodes ↔ Stations (many-to-many)
6. **mes_node_substations** - Nodes ↔ Substations (many-to-many)
7. **mes_node_material_inputs** - Material requirements per node
8. **mes_node_predecessors** - Node dependencies (graph)

### Modified Tables (5)
- **mes_workers**: Drop arrays, add current_task_* columns
- **mes_stations**: Drop operation_ids array
- **mes_operations**: Drop station_ids array
- **mes_substations**: Add current_operation column
- **mes_production_plans**: Drop nodes JSONB, add release metadata

### Sequences & Functions
- `work_order_counter` - Generate WO-YYYYMMDD-XXX
- `production_plan_counter` - Generate PPL-MMYY-XXX (monthly reset)
- `generate_work_order_code()` - Helper function
- `generate_production_plan_code()` - Helper function
- `generate_work_package_id()` - Helper function

### Triggers (5)
- `plan_change_trigger` → Emit `mes_plan_updates`
- `assignment_change_trigger` → Emit `mes_assignment_updates`
- `worker_change_trigger` → Emit `mes_worker_updates`
- `node_change_trigger` → Emit `mes_node_updates`
- `substation_change_trigger` → Emit `mes_station_updates`

---

## Implementation Process

### Run Migrations
```bash
# Apply all migrations
npm run migrate

# Check migration status
npm run migrate:status

# Rollback if needed
npm run migrate:rollback
```

### Create Initial Data
```bash
# Clear existing data and create minimal dataset
node scripts/seed-mes-data.js --clear --minimal

# Create default dataset (10 workers, 5 stations, 5 plans)
node scripts/seed-mes-data.js --clear

# Create full dataset for testing (50 workers, 20 stations, 100 plans)
node scripts/seed-mes-data.js --clear --full

# Add data without clearing
node scripts/seed-mes-data.js
```

Seed script creates:
1. Operations (master data) - Kesim, Büküm, Kaynak, Montaj, etc.
2. Stations → Station-Operation junctions
3. Substations (machines)
4. Workers → Worker-Station/Operation junctions
5. Production Plans → Nodes → Node-Stations → Material Inputs → Predecessors

---

## Code Migration Checklist

### Phase 1: Read Operations (GET endpoints)
- [ ] GET /api/mes/production-plans
  - Replace Firestore query with SQL JOIN
  - Join nodes, stations, operations, workers
  
- [ ] GET /api/mes/production-plans/:id
  - Replace 6 Firestore queries with 1 SQL query
  - Aggregate nodes as JSON array
  
- [ ] GET /api/mes/workers
  - Join worker_stations, worker_operations
  
- [ ] GET /api/mes/stations
  - Join station_operations

### Phase 2: Write Operations (POST/PUT endpoints)
- [ ] POST /api/mes/production-plans
  - Replace Firestore transaction with SQL transaction
  - Insert into plans → nodes → node_stations → material_inputs
  
- [ ] POST /api/mes/production-plans/next-id
  - Use `generate_production_plan_code()` function
  
- [ ] PUT /api/mes/production-plans/:id
  - Update plan + nodes in transaction
  - Handle material consumption on release
  
- [ ] POST /api/mes/workers
  - Insert worker + junction tables
  
- [ ] PUT /api/mes/workers/:id
  - Update worker + manage junction tables

### Phase 3: Real-time Updates
- [ ] Create SSE endpoint `/api/mes/stream/plans`
- [ ] Create SSE endpoint `/api/mes/stream/assignments`
- [ ] Update frontend to use EventSource instead of Firebase
- [ ] Test LISTEN/NOTIFY with concurrent users

---

## Query Examples

### Load Production Plan (Complex JOIN)
```sql
SELECT 
  p.id, p.status, p.work_order_code,
  n.node_id, n.name AS node_name, n.nominal_time,
  json_agg(DISTINCT jsonb_build_object(
    'stationId', s.id,
    'stationName', s.name,
    'priority', ns.priority
  )) AS assigned_stations,
  json_agg(DISTINCT jsonb_build_object(
    'materialCode', mi.material_code,
    'requiredQuantity', mi.required_quantity
  )) AS materials
FROM mes_production_plans p
JOIN mes_production_plan_nodes n ON n.plan_id = p.id
LEFT JOIN mes_node_stations ns ON ns.node_id = n.id
LEFT JOIN mes_stations s ON s.id = ns.station_id
LEFT JOIN mes_node_material_inputs mi ON mi.node_id = n.id
WHERE p.id = $1
GROUP BY p.id, n.id
ORDER BY n.sequence_order;
```

### Create Production Plan (Transaction)
```sql
BEGIN;

-- Generate plan ID
SELECT mes.generate_production_plan_code() INTO plan_id;

-- Insert plan
INSERT INTO mes_production_plans (id, work_order_code, status, ...)
VALUES (plan_id, 'WO-20250115-001', 'draft', ...);

-- Insert nodes
INSERT INTO mes_production_plan_nodes (node_id, plan_id, name, ...)
VALUES ('node-1', plan_id, 'Kesim', ...);

-- Insert node-station relationships
INSERT INTO mes_node_stations (node_id, station_id, priority)
VALUES (1, 'ST-001', 1);

COMMIT;
```

### Auto-assign Workers (Complex Query)
```sql
-- Find available workers for a node
SELECT w.id, w.first_name, w.last_name
FROM mes_workers w
JOIN mes_worker_stations ws ON ws.worker_id = w.id
JOIN mes_worker_operations wo ON wo.worker_id = w.id
WHERE ws.station_id = $1
  AND wo.operation_id = $2
  AND w.status = 'active'
  AND w.current_task_plan_id IS NULL
LIMIT 1;
```

---

## Real-time Updates

### Server-Side (SSE Endpoint)
```javascript
// server/mesRoutes.js
router.get('/stream/plans', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Subscribe to PostgreSQL notifications
  pgClient.query('LISTEN mes_plan_updates');
  
  pgClient.on('notification', (msg) => {
    if (msg.channel === 'mes_plan_updates') {
      res.write(`data: ${msg.payload}\n\n`);
    }
  });
  
  req.on('close', () => {
    pgClient.query('UNLISTEN mes_plan_updates');
  });
});
```

### Client-Side (Frontend)
```javascript
// Replace Firebase listener
const eventSource = new EventSource('/api/mes/stream/plans');

eventSource.onmessage = (event) => {
  const update = JSON.parse(event.data);
  
  if (update.operation === 'INSERT') {
    // New plan created
  } else if (update.operation === 'UPDATE') {
    // Plan updated
  }
};

eventSource.onerror = () => {
  console.error('SSE connection lost, reconnecting...');
  eventSource.close();
  // Reconnect logic
};
```

---

## Testing Strategy

### 1. Schema Validation
```bash
# Run migrations in test database
NODE_ENV=test npm run migrate

# Verify all tables exist
psql -d burkol_test -c "\dt mes.*"

# Check constraints
psql -d burkol_test -c "SELECT * FROM information_schema.table_constraints WHERE table_schema = 'mes';"
```

### 2. Data Migration Validation
```bash
# Dry run first
node scripts/migrate-mes-to-sql.js --dry-run

# Migrate small batch
node scripts/migrate-mes-to-sql.js --limit=10

# Verify data
psql -d burkol -c "SELECT COUNT(*) FROM mes_production_plan_nodes;"
psql -d burkol -c "SELECT COUNT(*) FROM mes_node_stations;"

# Compare with Firebase
# Firebase count: db.collection('mes-production-plans').get().then(snap => console.log(snap.size))
```

### 3. Query Performance
```sql
-- Enable query timing
\timing

-- Test complex JOIN
EXPLAIN ANALYZE
SELECT p.id, count(n.id) as node_count
FROM mes_production_plans p
LEFT JOIN mes_production_plan_nodes n ON n.plan_id = p.id
GROUP BY p.id;

-- Check index usage
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM mes_production_plan_nodes WHERE plan_id = 'PPL-0125-001';
```

### 4. Real-time Testing
```bash
# Terminal 1: Subscribe to notifications
psql -d burkol -c "LISTEN mes_plan_updates;"

# Terminal 2: Trigger update
psql -d burkol -c "UPDATE mes_production_plans SET status = 'production' WHERE id = 'PPL-0125-001';"

# Terminal 1 should receive notification
```

---

## Rollback Plan

### If implementation has issues:
```bash
# Rollback SQL migrations
npm run migrate:rollback

# Clear test data
node scripts/seed-mes-data.js --clear

# Restart with fresh migrations
npm run migrate
```

### Development cycle:
- Implement features incrementally
- Test each endpoint with seed data
- Use transactions for data integrity
- Monitor query performance with EXPLAIN ANALYZE

---

## Performance Targets

### PostgreSQL Design (Optimized)
- Load production plan: **20-50ms** (1 query with JOINs)
- Create plan: **100-200ms** (single transaction)
- Real-time updates: **<1s latency** (LISTEN/NOTIFY)

### vs Firebase Reference (for comparison)
- Load: ~200-500ms (6 queries + in-memory joins)
- Create: ~500-1000ms (multiple writes)
- Real-time: ~2s latency

**Expected improvement**: 4-10x faster queries

---

## Next Steps

1. **Review this analysis** with team ✅ (complete)
2. **Run migrations** in test environment
   ```bash
   NODE_ENV=test npm run migrate
   ```
3. **Test data migration** with small dataset
   ```bash
   node scripts/migrate-mes-to-sql.js --dry-run --limit=5
   ```
4. **Start code migration** (GET endpoints first)
5. **Implement SSE endpoints** for real-time
6. **Load testing** with 100 concurrent users
7. **Production rollout** (gradual shift)

---

## Support

- Full analysis: `MES-COMPREHENSIVE-ANALYSIS.md`
- Migration files: `quote-portal/db/migrations/022-026*.js`
- Data migration: `quote-portal/scripts/migrate-mes-to-sql.js`
- Original Firebase code: `quote-portal/server/mesRoutes.js` (8,511 lines)

**Estimated Timeline**: 4-6 weeks (schema + data + code + testing)
