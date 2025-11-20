# MES PostgreSQL Schema Overview
**Complete Table Structure for Fresh Implementation**

---

## Schema Summary

**Total MES Tables**: 19
- **Existing** (from previous migrations): 11 tables
- **New** (for MES optimization): 8 tables

---

## 1. Existing Tables (Modified)

### mes_workers
```sql
CREATE TABLE mes.mes_workers (
  id VARCHAR(100) PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  tc_no VARCHAR(11) UNIQUE,
  status VARCHAR(50) DEFAULT 'active',
  
  -- Current task tracking (replaces currentTask object)
  current_task_plan_id VARCHAR(100),
  current_task_node_id VARCHAR(100),
  current_task_assignment_id VARCHAR(100),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(255),
  created_by_name VARCHAR(255)
);
```
**Changes**: Removed `assigned_stations[]` and `qualified_operations[]` arrays → moved to junction tables

### mes_stations
```sql
CREATE TABLE mes.mes_stations (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100) UNIQUE,
  status VARCHAR(50) DEFAULT 'active',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(255),
  created_by_name VARCHAR(255)
);
```
**Changes**: Removed `operation_ids[]` array → moved to junction table

### mes_operations
```sql
CREATE TABLE mes.mes_operations (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100) UNIQUE,
  description TEXT,
  nominal_time INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(255),
  created_by_name VARCHAR(255)
);
```
**Changes**: Removed `station_ids[]` array → moved to junction table

### mes_substations
```sql
CREATE TABLE mes.mes_substations (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100) UNIQUE,
  station_id VARCHAR(100) REFERENCES mes_stations(id),
  
  current_operation VARCHAR(100),  -- NEW: nodeId of current operation
  status VARCHAR(50) DEFAULT 'available',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(255),
  created_by_name VARCHAR(255)
);
```
**Changes**: Added `current_operation` column

### mes_production_plans
```sql
CREATE TABLE mes.mes_production_plans (
  id VARCHAR(100) PRIMARY KEY,
  work_order_code VARCHAR(100) UNIQUE NOT NULL,
  quote_id VARCHAR(100),
  status VARCHAR(50) DEFAULT 'draft',
  
  material_summary JSONB,    -- Aggregated from nodes (keep as JSONB)
  stock_movements JSONB,     -- Movement results (keep as JSONB)
  metadata JSONB,            -- Plan metadata
  
  -- Release tracking (NEW)
  released_at TIMESTAMPTZ,
  released_by VARCHAR(255),
  released_by_name VARCHAR(255),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(255),
  created_by_name VARCHAR(255)
);
```
**Changes**: 
- Removed `nodes` JSONB → moved to `mes_production_plan_nodes` table
- Added release tracking columns

### Other Existing Tables (No Changes)
- `mes_worker_assignments` - Work packages
- `mes_approved_quotes` - Quote → Work Order link
- `mes_alerts` - System alerts
- `mes_work_orders` - Work order master data
- `mes_settings` - System settings
- `mes_counters` - Counter management (will use sequences instead)

---

## 2. New Tables (8 total)

### 🆕 mes_worker_stations (Many-to-Many)
**Purpose**: Workers assigned to stations
```sql
CREATE TABLE mes.mes_worker_stations (
  id SERIAL PRIMARY KEY,
  worker_id VARCHAR(100) NOT NULL REFERENCES mes_workers(id) ON DELETE CASCADE,
  station_id VARCHAR(100) NOT NULL REFERENCES mes_stations(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(worker_id, station_id)
);

CREATE INDEX idx_worker_stations_worker ON mes_worker_stations(worker_id);
CREATE INDEX idx_worker_stations_station ON mes_worker_stations(station_id);
```

**Example Data**:
| worker_id | station_id | assigned_at |
|-----------|------------|-------------|
| WORKER-001 | ST-001 | 2025-01-15 |
| WORKER-001 | ST-002 | 2025-01-15 |
| WORKER-002 | ST-001 | 2025-01-15 |

### 🆕 mes_worker_operations (Many-to-Many)
**Purpose**: Workers qualified for operations
```sql
CREATE TABLE mes.mes_worker_operations (
  id SERIAL PRIMARY KEY,
  worker_id VARCHAR(100) NOT NULL REFERENCES mes_workers(id) ON DELETE CASCADE,
  operation_id VARCHAR(100) NOT NULL REFERENCES mes_operations(id) ON DELETE CASCADE,
  qualified_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(worker_id, operation_id)
);

CREATE INDEX idx_worker_operations_worker ON mes_worker_operations(worker_id);
CREATE INDEX idx_worker_operations_op ON mes_worker_operations(operation_id);
```

### 🆕 mes_station_operations (Many-to-Many)
**Purpose**: Stations capable of performing operations
```sql
CREATE TABLE mes.mes_station_operations (
  id SERIAL PRIMARY KEY,
  station_id VARCHAR(100) NOT NULL REFERENCES mes_stations(id) ON DELETE CASCADE,
  operation_id VARCHAR(100) NOT NULL REFERENCES mes_operations(id) ON DELETE CASCADE,
  
  UNIQUE(station_id, operation_id)
);

CREATE INDEX idx_station_operations_station ON mes_station_operations(station_id);
CREATE INDEX idx_station_operations_op ON mes_station_operations(operation_id);
```

**Example Data**:
| station_id | operation_id |
|------------|--------------|
| ST-001 | OP-001 |  -- Kesim İstasyonu → Kesim İşlemi
| ST-002 | OP-002 |  -- Büküm İstasyonu → Büküm İşlemi
| ST-003 | OP-003 |  -- Kaynak İstasyonu → Kaynak İşlemi

### 🆕 mes_production_plan_nodes (CRITICAL)
**Purpose**: Extract nodes[] from production plans
```sql
CREATE TABLE mes.mes_production_plan_nodes (
  id SERIAL PRIMARY KEY,
  node_id VARCHAR(100) NOT NULL,  -- e.g., "node-1", "node-2"
  plan_id VARCHAR(100) NOT NULL REFERENCES mes_production_plans(id) ON DELETE CASCADE,
  
  -- Operation details
  name VARCHAR(255) NOT NULL,
  operation_id VARCHAR(100) REFERENCES mes_operations(id),
  nominal_time INTEGER NOT NULL,  -- minutes
  efficiency DECIMAL(4,3) DEFAULT 0.85,
  effective_time DECIMAL(10,2),   -- nominalTime / efficiency
  
  -- Assignment
  assignment_mode VARCHAR(20) DEFAULT 'auto',
  assigned_worker_id VARCHAR(100) REFERENCES mes_workers(id),
  
  -- Output
  output_code VARCHAR(100),
  output_qty DECIMAL(10,2) NOT NULL,
  output_unit VARCHAR(50),
  
  -- Timing
  estimated_start_time TIMESTAMPTZ,
  estimated_end_time TIMESTAMPTZ,
  
  -- Ordering
  sequence_order INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(plan_id, node_id)
);

CREATE INDEX idx_nodes_plan_id ON mes_production_plan_nodes(plan_id);
CREATE INDEX idx_nodes_operation_id ON mes_production_plan_nodes(operation_id);
```

**Example Data**:
| id | node_id | plan_id | name | operation_id | nominal_time | sequence_order |
|----|---------|---------|------|--------------|--------------|----------------|
| 1 | node-1 | PPL-0125-001 | Kesim İşlemi | OP-001 | 60 | 0 |
| 2 | node-2 | PPL-0125-001 | Büküm İşlemi | OP-002 | 45 | 1 |
| 3 | node-3 | PPL-0125-001 | Kaynak İşlemi | OP-003 | 90 | 2 |

### 🆕 mes_node_stations (Many-to-Many)
**Purpose**: Nodes can use multiple stations (with priority)
```sql
CREATE TABLE mes.mes_node_stations (
  id SERIAL PRIMARY KEY,
  node_id INTEGER NOT NULL REFERENCES mes_production_plan_nodes(id) ON DELETE CASCADE,
  station_id VARCHAR(100) NOT NULL REFERENCES mes_stations(id),
  priority INTEGER DEFAULT 1,  -- 1=primary, 2=fallback
  
  UNIQUE(node_id, station_id)
);

CREATE INDEX idx_node_stations_node ON mes_node_stations(node_id);
CREATE INDEX idx_node_stations_station ON mes_node_stations(station_id);
```

**Example Data**:
| node_id | station_id | priority |
|---------|------------|----------|
| 1 | ST-001 | 1 |  -- node-1 prefers ST-001
| 1 | ST-002 | 2 |  -- node-1 can fallback to ST-002
| 2 | ST-002 | 1 |  -- node-2 uses ST-002

### 🆕 mes_node_substations (Many-to-Many)
**Purpose**: Nodes can use specific machines (substations)
```sql
CREATE TABLE mes.mes_node_substations (
  id SERIAL PRIMARY KEY,
  node_id INTEGER NOT NULL REFERENCES mes_production_plan_nodes(id) ON DELETE CASCADE,
  substation_id VARCHAR(100) NOT NULL REFERENCES mes_substations(id),
  
  UNIQUE(node_id, substation_id)
);

CREATE INDEX idx_node_substations_node ON mes_node_substations(node_id);
CREATE INDEX idx_node_substations_sub ON mes_node_substations(substation_id);
```

### 🆕 mes_node_material_inputs (One-to-Many)
**Purpose**: Material requirements per node
```sql
CREATE TABLE mes.mes_node_material_inputs (
  id SERIAL PRIMARY KEY,
  node_id INTEGER NOT NULL REFERENCES mes_production_plan_nodes(id) ON DELETE CASCADE,
  material_code VARCHAR(100) NOT NULL,
  required_quantity DECIMAL(10,2) NOT NULL,
  unit_ratio DECIMAL(10,4) DEFAULT 1.0,
  is_derived BOOLEAN DEFAULT FALSE,  -- true if WIP from previous node
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_material_inputs_node ON mes_node_material_inputs(node_id);
CREATE INDEX idx_material_inputs_material ON mes_node_material_inputs(material_code);
```

**Example Data**:
| node_id | material_code | required_quantity | is_derived |
|---------|---------------|-------------------|------------|
| 1 | MAT-001 | 5.5 | false |  -- Raw material
| 1 | MAT-002 | 2.0 | false |  -- Raw material
| 2 | WIP-001 | 10.0 | true |   -- Output from node-1

### 🆕 mes_node_predecessors (Many-to-Many)
**Purpose**: Dependency graph between nodes
```sql
CREATE TABLE mes.mes_node_predecessors (
  id SERIAL PRIMARY KEY,
  node_id INTEGER NOT NULL REFERENCES mes_production_plan_nodes(id) ON DELETE CASCADE,
  predecessor_node_id INTEGER NOT NULL REFERENCES mes_production_plan_nodes(id) ON DELETE CASCADE,
  
  UNIQUE(node_id, predecessor_node_id)
);

CREATE INDEX idx_predecessors_node ON mes_node_predecessors(node_id);
CREATE INDEX idx_predecessors_pred ON mes_node_predecessors(predecessor_node_id);
```

**Example Data**:
| node_id | predecessor_node_id |
|---------|---------------------|
| 2 | 1 |  -- node-2 depends on node-1
| 3 | 2 |  -- node-3 depends on node-2
| 4 | 2 |  -- node-4 also depends on node-2
| 4 | 3 |  -- node-4 depends on node-3 too

**Graph Visualization**:
```
node-1
  └─> node-2
       ├─> node-3
       │    └─> node-4
       └─> node-4
```

---

## 3. PostgreSQL Sequences & Functions

### Sequences
```sql
CREATE SEQUENCE mes.work_order_counter START 1;
CREATE SEQUENCE mes.production_plan_counter START 1;
```

### Helper Functions
```sql
-- Generate work order code: WO-YYYYMMDD-XXX
CREATE FUNCTION mes.generate_work_order_code() RETURNS VARCHAR(100);

-- Generate plan code: PPL-MMYY-XXX (monthly reset)
CREATE FUNCTION mes.generate_production_plan_code() RETURNS VARCHAR(100);

-- Generate work package ID: {workOrderCode}-XXX
CREATE FUNCTION mes.generate_work_package_id(VARCHAR) RETURNS VARCHAR(100);
```

---

## 4. Real-time Triggers

### LISTEN/NOTIFY Channels
```sql
-- Plan changes
CREATE TRIGGER plan_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON mes_production_plans
FOR EACH ROW EXECUTE FUNCTION mes.notify_plan_change();
-- Emits to: mes_plan_updates

-- Assignment changes  
CREATE TRIGGER assignment_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON mes_worker_assignments
FOR EACH ROW EXECUTE FUNCTION mes.notify_assignment_change();
-- Emits to: mes_assignment_updates

-- Worker changes
CREATE TRIGGER worker_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON mes_workers
FOR EACH ROW EXECUTE FUNCTION mes.notify_worker_change();
-- Emits to: mes_worker_updates

-- Node changes
CREATE TRIGGER node_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON mes_production_plan_nodes
FOR EACH ROW EXECUTE FUNCTION mes.notify_node_change();
-- Emits to: mes_node_updates

-- Station changes
CREATE TRIGGER substation_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON mes_substations
FOR EACH ROW EXECUTE FUNCTION mes.notify_station_change();
-- Emits to: mes_station_updates
```

---

## 5. Complete Relationship Map

```
mes_production_plans (1)
  ├─> mes_production_plan_nodes (N)
  │    ├─> mes_node_stations (N-M) → mes_stations
  │    ├─> mes_node_substations (N-M) → mes_substations
  │    ├─> mes_node_material_inputs (1-N) → materials.materials
  │    ├─> mes_node_predecessors (N-M) → self-reference
  │    ├─> mes_operations (N-1)
  │    └─> mes_workers (N-1) [assigned_worker_id]
  │
  └─> mes_worker_assignments (N)
       ├─> mes_workers (N-1)
       ├─> mes_stations (N-1)
       └─> mes_substations (N-1)

mes_workers (1)
  ├─> mes_worker_stations (N-M) → mes_stations
  └─> mes_worker_operations (N-M) → mes_operations

mes_stations (1)
  ├─> mes_station_operations (N-M) → mes_operations
  └─> mes_substations (1-N)

mes_operations (1)
  (referenced by nodes, workers, stations)
```

---

## 6. Key Design Decisions

### ✅ What We Normalized
1. **Workers → Stations**: Array → Junction table
2. **Workers → Operations**: Array → Junction table
3. **Stations → Operations**: Array → Junction table
4. **Plans → Nodes**: JSONB array → Separate table
5. **Nodes → Stations**: Embedded array → Junction table
6. **Nodes → Materials**: Embedded array → Separate table
7. **Nodes → Predecessors**: Embedded array → Junction table

### ⚠️ What Stayed as JSONB
1. **material_summary**: Aggregated data (calculated from nodes)
2. **stock_movements**: Historical data (append-only)
3. **metadata**: Flexible plan metadata

### 🎯 Why This Design
- **Performance**: Single JOIN query vs 6 separate queries
- **Integrity**: Foreign keys prevent orphaned data
- **Flexibility**: Easy to add new relationships
- **Scalability**: Proper indexes for fast lookups
- **Real-time**: LISTEN/NOTIFY built into PostgreSQL

---

## 7. Example Queries

### Load Full Production Plan
```sql
SELECT 
  p.*,
  json_agg(DISTINCT jsonb_build_object(
    'nodeId', n.node_id,
    'name', n.name,
    'stations', (
      SELECT json_agg(jsonb_build_object('id', s.id, 'name', s.name, 'priority', ns.priority))
      FROM mes_node_stations ns
      JOIN mes_stations s ON s.id = ns.station_id
      WHERE ns.node_id = n.id
    ),
    'materials', (
      SELECT json_agg(jsonb_build_object('code', mi.material_code, 'qty', mi.required_quantity))
      FROM mes_node_material_inputs mi
      WHERE mi.node_id = n.id
    ),
    'predecessors', (
      SELECT json_agg(pn.node_id)
      FROM mes_node_predecessors np
      JOIN mes_production_plan_nodes pn ON pn.id = np.predecessor_node_id
      WHERE np.node_id = n.id
    )
  ) ORDER BY n.sequence_order) as nodes
FROM mes_production_plans p
LEFT JOIN mes_production_plan_nodes n ON n.plan_id = p.id
WHERE p.id = $1
GROUP BY p.id;
```

### Find Available Workers for Operation
```sql
SELECT w.*, 
  json_agg(DISTINCT s.name) as qualified_stations
FROM mes_workers w
JOIN mes_worker_operations wo ON wo.worker_id = w.id
JOIN mes_worker_stations ws ON ws.worker_id = w.id
JOIN mes_stations s ON s.id = ws.station_id
WHERE wo.operation_id = $1
  AND w.current_task_plan_id IS NULL
  AND w.status = 'active'
GROUP BY w.id;
```

---

## 8. Migration Files

1. **022_create_mes_junction_tables.js** - Worker/Station/Operation relationships
2. **023_create_mes_production_plan_nodes.js** - Node extraction + related tables
3. **024_modify_mes_tables_for_sql.js** - Update existing tables
4. **025_create_mes_counter_sequences.js** - Sequences + helper functions
5. **026_create_mes_realtime_triggers.js** - LISTEN/NOTIFY triggers

**Total SQL Changes**: ~500 lines of migration code

---

## 9. Next Steps

1. ✅ Run migrations: `npm run migrate`
2. ✅ Create seed data: `node scripts/seed-mes-data.js --clear`
3. ⏳ Implement API endpoints
4. ⏳ Test real-time updates
5. ⏳ Performance benchmarking

**Status**: Ready for Implementation 🚀
