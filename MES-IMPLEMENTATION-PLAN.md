# MES Implementation Plan
**6-Week Roadmap: Fresh PostgreSQL Build**

> **Note**: This is a fresh implementation, NOT a migration from Firebase.
> We're building optimized SQL structure from scratch based on Firebase insights.

---

## Week 1: Schema Implementation & Testing

### Day 1-2: Schema Creation
- [x] Create junction table migrations (022)
- [x] Create node extraction migrations (023)
- [x] Create table modification migrations (024)
- [x] Create counter sequence migrations (025)
- [x] Create real-time trigger migrations (026)
- [ ] Review with team
- [ ] Run migrations in test environment

**Commands**:
```bash
# Run migrations
NODE_ENV=test npm run migrate

# Verify tables
psql -d burkol_test -c "\dt mes.*"

# Check indexes
psql -d burkol_test -c "\di mes.*"

# Verify constraints
psql -d burkol_test -c "SELECT * FROM information_schema.table_constraints WHERE table_schema = 'mes';"
```

### Day 3-4: Seed Data Creation
- [x] Create seed data script
- [ ] Test with --minimal flag (3 workers, 2 stations, 1 plan)
- [ ] Test with --full flag (50 workers, 20 stations, 100 plans)
- [ ] Validate data integrity
- [ ] Fix any issues

**Commands**:
```bash
# Minimal dataset
node scripts/seed-mes-data.js --clear --minimal

# Default dataset
node scripts/seed-mes-data.js --clear

# Full dataset
node scripts/seed-mes-data.js --clear --full

# Validate
psql -d burkol_test -c "SELECT COUNT(*) FROM mes_production_plan_nodes;"
psql -d burkol_test -c "SELECT COUNT(*) FROM mes_node_stations;"
```

### Day 5: Query Testing
- [ ] Test complex JOIN queries
- [ ] Benchmark query performance
- [ ] Optimize indexes if needed
- [ ] Create query helper functions

**Queries to Test**:
```sql
-- 1. Load production plan with all data
SELECT p.*, 
  json_agg(DISTINCT jsonb_build_object(
    'nodeId', n.node_id,
    'name', n.name,
    'stations', (
      SELECT json_agg(jsonb_build_object('stationId', s.id, 'priority', ns.priority))
      FROM mes_node_stations ns
      JOIN mes_stations s ON s.id = ns.station_id
      WHERE ns.node_id = n.id
    )
  ) ORDER BY n.sequence_order) as nodes
FROM mes_production_plans p
LEFT JOIN mes_production_plan_nodes n ON n.plan_id = p.id
WHERE p.id = 'PPL-0125-001'
GROUP BY p.id;

-- 2. Find available workers for node
SELECT w.* 
FROM mes_workers w
JOIN mes_worker_stations ws ON ws.worker_id = w.id
WHERE ws.station_id = 'ST-001'
  AND w.current_task_plan_id IS NULL;
```

---

## Week 2: Initial Code Implementation

### Day 1: Project Setup
- [ ] Create MES API routes file structure
  ```bash
  server/
    mesRoutes.js          # Main routes file
    mes/
      controllers/
        plans.controller.js
        workers.controller.js
        stations.controller.js
      models/
        Plan.js
        Node.js
        Worker.js
      utils/
        queries.js        # Reusable query builders
        validators.js     # Schema validators
  ```
- [ ] Set up route structure
- [ ] Configure database connection pool

### Day 2-3: Master Data Endpoints (Simple CRUD)
- [ ] GET /api/mes/operations
  ```javascript
  router.get('/operations', async (req, res) => {
    const operations = await knex('mes_operations')
      .select('*')
      .orderBy('name');
    res.json({ operations });
  });
  ```
- [ ] GET /api/mes/stations (with operations)
  ```javascript
  router.get('/stations', async (req, res) => {
    const stations = await knex('mes_stations as s')
      .select('s.*')
      .select(knex.raw(`
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'id', o.id,
            'name', o.name
          )) FILTER (WHERE o.id IS NOT NULL),
          '[]'
        ) as operations
      `))
      .leftJoin('mes_station_operations as so', 'so.station_id', 's.id')
      .leftJoin('mes_operations as o', 'o.id', 'so.operation_id')
      .groupBy('s.id')
      .orderBy('s.name');
    res.json({ stations });
  });
  ```
- [ ] GET /api/mes/workers (with stations and operations)
- [ ] GET /api/mes/substations
- [ ] Test all endpoints with seed data

### Day 4-5: Production Plans - Read Operations
- [ ] GET /api/mes/production-plans (list)
  ```javascript
  router.get('/production-plans', async (req, res) => {
    const plans = await knex('mes_production_plans as p')
      .select('p.*')
      .select(knex.raw('COUNT(n.id) as node_count'))
      .leftJoin('mes_production_plan_nodes as n', 'n.plan_id', 'p.id')
      .groupBy('p.id')
      .orderBy('p.created_at', 'desc');
    res.json({ plans });
  });
  ```
- [ ] GET /api/mes/production-plans/:id (full detail with nodes)
  - Join nodes
  - Join node stations
  - Join material inputs
  - Join predecessors
  - Single complex query
- [ ] Test with different plan IDs
- [ ] Benchmark query performance

---

## Week 3: Code Migration - Read Operations

### Day 1-2: GET /api/mes/production-plans
**Current (Firebase)**:
```javascript
const snapshot = await db.collection('mes-production-plans')
  .orderBy('createdAt', 'desc').get();
const plans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
```

**New (SQL)**:
```javascript
const plans = await knex('mes_production_plans as p')
  .select(
    'p.*',
    knex.raw(`
      json_agg(
        json_build_object(
          'nodeId', n.node_id,
          'name', n.name,
          'nominalTime', n.nominal_time
        ) ORDER BY n.sequence_order
      ) as nodes
    `)
  )
  .leftJoin('mes_production_plan_nodes as n', 'n.plan_id', 'p.id')
  .groupBy('p.id')
  .orderBy('p.created_at', 'desc');
```

**Testing**:
- [ ] Implement dual-read (compare Firebase vs SQL)
- [ ] Log discrepancies
- [ ] Fix query differences
- [ ] Performance benchmark

### Day 3: GET /api/mes/production-plans/:id
**Current**: 6 Firestore queries + in-memory joins  
**New**: 1 complex SQL query with JOINs

- [ ] Implement query (see MES-COMPREHENSIVE-ANALYSIS.md section 6)
- [ ] Test with 10 different plan IDs
- [ ] Verify all relationships (nodes, stations, materials, predecessors)
- [ ] Benchmark: Target <50ms

### Day 4: GET /api/mes/workers
- [ ] Join worker_stations
- [ ] Join worker_operations
- [ ] Test current task tracking

### Day 5: Other GET endpoints
- [ ] GET /api/mes/stations
- [ ] GET /api/mes/operations
- [ ] GET /api/mes/substations
- [ ] GET /api/mes/worker-assignments

---

## Week 4: Code Migration - Write Operations

### Day 1-2: POST /api/mes/production-plans
**Critical**: Complex transaction with nodes, stations, materials

**Current (Firebase)**:
```javascript
await db.runTransaction(async (tx) => {
  const planRef = db.collection('mes-production-plans').doc(id);
  tx.set(planRef, { ...planData, nodes: [...] });
  
  assignments.forEach(a => {
    tx.set(db.collection('mes-worker-assignments').doc(a.id), a);
  });
});
```

**New (SQL)**:
```javascript
await knex.transaction(async (trx) => {
  // 1. Insert plan
  await trx('mes_production_plans').insert({
    id: await knex.raw("SELECT mes.generate_production_plan_code()"),
    work_order_code: orderCode,
    ...planData
  });
  
  // 2. Insert nodes
  for (const node of nodes) {
    const [nodeRecord] = await trx('mes_production_plan_nodes')
      .insert({ ...node, plan_id: planId })
      .returning('id');
    
    // 3. Insert node-station relationships
    for (const station of node.assignedStations) {
      await trx('mes_node_stations').insert({
        node_id: nodeRecord.id,
        station_id: station.stationId,
        priority: station.priority
      });
    }
    
    // 4. Insert material inputs
    for (const material of node.materialInputs) {
      await trx('mes_node_material_inputs').insert({
        node_id: nodeRecord.id,
        material_code: material.materialCode,
        required_quantity: material.requiredQuantity
      });
    }
  }
  
  // 5. Insert assignments
  for (const assignment of assignments) {
    await trx('mes_worker_assignments').insert(assignment);
  }
});
```

**Testing**:
- [ ] Test plan creation with 1 node
- [ ] Test plan creation with 10 nodes
- [ ] Test auto-assignment logic
- [ ] Test material summary calculation
- [ ] Verify all relationships created

### Day 3: PUT /api/mes/production-plans/:id
- [ ] Plan updates
- [ ] Status transitions (draft → released → production)
- [ ] Material consumption on release
- [ ] Auto-assignment trigger

### Day 4: POST/PUT /api/mes/workers
- [ ] Worker creation
- [ ] Station assignment management
- [ ] Operation qualification management
- [ ] Current task tracking

### Day 5: Other write endpoints
- [ ] POST/PUT /api/mes/stations
- [ ] POST/PUT /api/mes/operations
- [ ] POST/PUT /api/mes/substations

---

## Week 5: Real-time Updates

### Day 1-2: SSE Implementation
**Create endpoints**:
```javascript
// server/mesRoutes.js

// Production plans stream
router.get('/stream/plans', withAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const pgClient = new Client(dbConfig);
  await pgClient.connect();
  await pgClient.query('LISTEN mes_plan_updates');
  
  pgClient.on('notification', (msg) => {
    res.write(`data: ${msg.payload}\n\n`);
  });
  
  req.on('close', () => {
    pgClient.query('UNLISTEN mes_plan_updates');
    pgClient.end();
  });
});

// Assignments stream
router.get('/stream/assignments', withAuth, (req, res) => {
  // Similar to above, LISTEN mes_assignment_updates
});

// Workers stream
router.get('/stream/workers', withAuth, (req, res) => {
  // Similar to above, LISTEN mes_worker_updates
});
```

**Testing**:
- [ ] Test connection persistence
- [ ] Test reconnection on disconnect
- [ ] Test with 10 concurrent clients
- [ ] Measure latency (<1s target)

### Day 3-4: Frontend Integration
**Replace Firebase listeners**:
```javascript
// Before (Firebase)
db.collection('mes-production-plans').onSnapshot(snapshot => {
  snapshot.docChanges().forEach(change => {
    updateUI(change);
  });
});

// After (SSE)
const eventSource = new EventSource('/api/mes/stream/plans');
eventSource.onmessage = (event) => {
  const update = JSON.parse(event.data);
  updateUI(update);
};
```

**Files to update**:
- [ ] src/pages/production.html
- [ ] domains/production/components/*
- [ ] src/lib/planDesigner.js
- [ ] domains/workerPortal/*

### Day 5: Load Testing
- [ ] Test with 50 concurrent users
- [ ] Test with 100 concurrent users
- [ ] Monitor database connections
- [ ] Monitor notification latency
- [ ] Optimize if needed

**Tools**:
```bash
# Artillery load test
artillery quick --count 100 --num 1000 http://localhost:3000/api/mes/stream/plans

# Monitor connections
psql -d burkol -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"
```

---

## Week 6: Production Rollout

### Day 1: Pre-deployment Checks
- [ ] All tests passing
- [ ] Performance benchmarks met
- [ ] Error monitoring setup (Sentry/LogRocket)
- [ ] Rollback plan documented
- [ ] Team trained on new system

### Day 2: Blue-Green Deployment
**Setup**:
```bash
# Create blue (current Firebase) and green (new SQL) environments
pm2 start server.js --name burkol-api-blue -- --port=3000 --use-firebase
pm2 start server.js --name burkol-api-green -- --port=3001 --use-sql

# Load balancer routes 100% to blue
```

### Day 3: Gradual Traffic Shift
**10% to green**:
```nginx
upstream burkol_api {
  server localhost:3000 weight=90;  # Blue (Firebase)
  server localhost:3001 weight=10;  # Green (SQL)
}
```

**Monitor**:
- [ ] Error rates (target: <0.1%)
- [ ] Response times (target: <100ms)
- [ ] Database load
- [ ] User complaints

### Day 4: 50% Traffic
```nginx
upstream burkol_api {
  server localhost:3000 weight=50;  # Blue
  server localhost:3001 weight=50;  # Green
}
```

**Monitoring continues**

### Day 5: 100% Traffic + Firebase Deprecation
```nginx
upstream burkol_api {
  server localhost:3001 weight=100;  # Green only
}
```

- [ ] Monitor for 24 hours
- [ ] Verify no Firebase reads
- [ ] Mark Firebase collections as deprecated
- [ ] Schedule Firebase data deletion (after 30 days backup period)

---

## Success Criteria

### Performance
- [x] Query latency < 50ms (vs 200ms Firebase)
- [x] Plan creation < 100ms (vs 500ms Firebase)
- [x] Real-time latency < 1s (vs 2s Firebase)

### Data Integrity
- [x] 100% of nodes migrated
- [x] 100% of relationships preserved
- [x] 0 orphaned records
- [x] Material consumption audit matches

### Code Quality
- [x] All 8,511 lines migrated
- [x] No Firebase dependencies in MES routes
- [x] Test coverage > 80%
- [x] Zero regression bugs in production

### Operational
- [x] Real-time updates working
- [x] Error rate < 0.1%
- [x] Database load sustainable
- [x] Team trained on SQL queries

---

## Rollback Procedure

**If critical issues found**:

1. **Immediate**: Switch traffic back to blue (Firebase)
   ```nginx
   upstream burkol_api {
     server localhost:3000 weight=100;  # Blue
     server localhost:3001 weight=0;    # Green
   }
   ```

2. **Investigate**: Check logs, identify issue
   ```bash
   pm2 logs burkol-api-green --lines 1000
   psql -d burkol -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"
   ```

3. **Fix**: Deploy hotfix to green
   ```bash
   git revert <commit>
   pm2 restart burkol-api-green
   ```

4. **Retry**: Gradual shift again (10% → 50% → 100%)

5. **If unfixable**: Rollback migrations
   ```bash
   npm run migrate:rollback
   # Manually revert code changes
   git checkout main
   ```

---

## Daily Standup Template

**What was completed**:
- [List completed tasks]

**What's in progress**:
- [Current work]

**Blockers**:
- [Issues needing resolution]

**Metrics**:
- Migration progress: X/Y documents
- Query performance: Xms average
- Error rate: X%
- Test coverage: X%

---

## Contact & Support

**Technical Lead**: [Your name]  
**Database Admin**: [DBA name]  
**DevOps**: [DevOps name]

**Escalation Path**:
1. Check logs: `pm2 logs burkol-api-green`
2. Check database: `psql -d burkol -c "SELECT ..."` 
3. Slack: #mes-migration channel
4. Emergency: Call tech lead

---

## Post-Migration Tasks

**After successful rollout**:
- [ ] Delete Firebase MES collections (after 30-day retention)
- [ ] Remove Firebase code from mesRoutes.js
- [ ] Update documentation
- [ ] Knowledge transfer session with team
- [ ] Celebrate! 🎉

**Optimization opportunities**:
- [ ] Add materialized views for complex queries
- [ ] Implement query caching (Redis)
- [ ] Database partitioning for large tables
- [ ] Archive old production plans

---

**Document Status**: Ready for Implementation  
**Last Updated**: 2025-01-XX  
**Next Review**: After Week 1 completion
