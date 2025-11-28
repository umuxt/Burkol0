# 🔍 LOT/BATCH TRACKING SYSTEM ANALYSIS & STRATEGY

**Tarih:** 20 Kasım 2025  
**Konu:** Mevcut envanter sistemi lot desteği + 19 tabloya geçiş stratejisi

---

## 📊 CURRENT SYSTEM ANALYSIS

### ✅ What We Have Now

**materials table (Migration 004):**
```sql
-- Stock tracking (SIMPLE AGGREGATED MODEL)
stock DECIMAL(15, 3)              -- Total available
reserved DECIMAL(15, 3)            -- Reserved for quotes/orders  
wip_reserved DECIMAL(15, 3)        -- Reserved for production

-- NO lot/batch tracking fields:
❌ lot_number
❌ lot_date
❌ expiry_date
❌ batch_code
```

**stock_movements table (Migration 019):**
```sql
-- Movement tracking (TRANSACTION-BASED)
material_code VARCHAR(50)
type ENUM('in', 'out')
quantity DECIMAL(15, 3)
stock_before DECIMAL(15, 3)
stock_after DECIMAL(15, 3)
movement_date TIMESTAMP

-- NO lot/batch tracking:
❌ lot_number
❌ lot_date  
❌ source_lot
❌ consumed_from_lot
```

**orders & order_items (Migration 017):**
```sql
-- Order items
quantity DECIMAL(15, 3)
actual_delivery_date TIMESTAMP

-- NO lot/batch tracking:
❌ lot_number
❌ batch_code
❌ manufacturing_date
❌ expiry_date
```

### ❌ What We DON'T Have

**No lot-level inventory tracking:**
- Malzeme giriş yaptığında lot numarası kaydetmiyor
- Sipariş tesliminde hangi lot'tan geldiği bilinmiyor
- Üretimde hangi lot'un kullanıldığı takip edilmiyor
- FIFO (ilk giren ilk çıkar) lot bazında uygulanamıyor
- Expiry date takibi yok
- Traceability yok (hangi son ürün hangi hammadde lot'undan)

**Current Model: AGGREGATED STOCK**
```
Material: M-00-001 (Çelik Sac)
Total Stock: 1000 kg
├─ Reserved: 200 kg
├─ WIP Reserved: 300 kg
└─ Available: 500 kg

❌ Lot detayı yok:
   - 500 kg'nin kaç lot'tan oluştuğu bilinmiyor
   - Hangi lotun ne zaman alındığı bilinmiyor
   - Hangi lotun ne kadar stoku kaldığı bilinmiyor
```

---

## 🎯 LOT TRACKING OPTIONS

### Option 1: NO LOT TRACKING (Current System)
**Keep aggregated stock model**

**Pros:**
- ✅ Basit - mevcut sistem çalışıyor
- ✅ Hızlı implementation
- ✅ Düşük complexity
- ✅ Müşterilerin çoğu için yeterli

**Cons:**
- ❌ FIFO envanteri yok (sadece FIFO task scheduling)
- ❌ Traceability yok
- ❌ Expiry tracking yok
- ❌ Gıda/ilaç sektörü için uygun değil
- ❌ ISO 9001 lot traceability requirement karşılanmıyor

**Use Cases:**
- Genel üretim
- Metal işleme
- Mobilya
- Basit envanter yönetimi

---

### Option 2: SIMPLE LOT TRACKING (Minimal Change)
**Add lot fields to stock_movements only**

**Implementation:**
```sql
ALTER TABLE materials.stock_movements ADD (
  lot_number VARCHAR(100),           -- Manual or auto-generated
  lot_date DATE,                     -- Receipt/Production date
  supplier_lot_code VARCHAR(100),    -- Supplier's batch code
  
  INDEX idx_lot_lookup (material_code, lot_number),
  INDEX idx_lot_fifo (material_code, lot_date) WHERE type = 'in'
);
```

**How it works:**
```sql
-- Stock IN (order delivery)
INSERT INTO materials.stock_movements (
  material_code, type, quantity, lot_number, lot_date
) VALUES (
  'M-00-001', 'in', 500, 'LOT-2025-11-001', '2025-11-20'
);

-- Stock OUT (production consumption)
-- FIFO: consume from oldest lot first
WITH oldest_lot AS (
  SELECT lot_number, SUM(quantity) as available
  FROM materials.stock_movements
  WHERE material_code = 'M-00-001' AND type = 'in'
  GROUP BY lot_number, lot_date
  HAVING SUM(quantity) > 0
  ORDER BY lot_date ASC
  LIMIT 1
)
INSERT INTO materials.stock_movements (
  material_code, type, quantity, lot_number
) VALUES (
  'M-00-001', 'out', 100, (SELECT lot_number FROM oldest_lot)
);
```

**Pros:**
- ✅ Minimal DB changes (1 table)
- ✅ Lot tracking başlar
- ✅ FIFO consumption mümkün
- ✅ Traceability var (stock_movements üzerinden)
- ✅ Geriye dönük uyumlu (lot_number nullable)

**Cons:**
- ⚠️ Stock aggregate hesaplaması complex (SUM per lot)
- ⚠️ UI changes gerekli (lot selection on order receipt)
- ⚠️ Backend logic changes (FIFO consumption)
- ⚠️ Expiry tracking eksik

**Impact:**
- 🔧 Order delivery: Lot number input gerekli
- 🔧 Production start: Lot selection otomatik (FIFO)
- 🔧 Reports: Lot-level inventory report

---

### Option 3: FULL LOT TRACKING (Separate Lot Inventory Table)
**Create dedicated lot inventory table**

**Implementation:**
```sql
-- New table: Lot-level inventory
CREATE TABLE materials.material_lots (
  id SERIAL PRIMARY KEY,
  material_code VARCHAR(50) NOT NULL REFERENCES materials.materials(code),
  lot_number VARCHAR(100) NOT NULL,
  
  -- Lot details
  lot_date DATE NOT NULL,                    -- Receipt/Production date
  supplier_lot_code VARCHAR(100),            -- Supplier's batch code
  manufacturing_date DATE,                   -- Production date
  expiry_date DATE,                          -- Expiration date
  
  -- Quantity tracking
  initial_quantity DECIMAL(15, 3) NOT NULL,  -- Original lot size
  current_quantity DECIMAL(15, 3) NOT NULL,  -- Current available
  reserved_quantity DECIMAL(15, 3) DEFAULT 0,
  wip_reserved_quantity DECIMAL(15, 3) DEFAULT 0,
  
  -- Lot status
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'depleted', 'expired', 'quarantine')),
  
  -- Source tracking
  order_id INTEGER REFERENCES materials.orders(id),
  order_item_id INTEGER REFERENCES materials.order_items(id),
  
  -- Auditing
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(100),
  
  UNIQUE (material_code, lot_number),
  INDEX idx_lot_fifo (material_code, lot_date, status) WHERE status = 'active',
  INDEX idx_lot_expiry (expiry_date, status) WHERE status = 'active'
);

-- Update stock_movements to reference lots
ALTER TABLE materials.stock_movements ADD (
  source_lot_id INTEGER REFERENCES materials.material_lots(id),
  
  INDEX idx_lot_movements (source_lot_id)
);
```

**How it works:**
```sql
-- Order received: Create lot
INSERT INTO materials.material_lots (
  material_code, lot_number, lot_date, initial_quantity, current_quantity,
  order_id, supplier_lot_code, expiry_date
) VALUES (
  'M-00-001', 'LOT-2025-11-001', '2025-11-20', 500, 500,
  123, 'SUP-BATCH-789', '2026-11-20'
);

-- Stock movement references lot
INSERT INTO materials.stock_movements (
  material_code, type, quantity, source_lot_id
) VALUES (
  'M-00-001', 'in', 500, CURRVAL('materials.material_lots_id_seq')
);

-- Production consumption: FIFO from oldest active lot
WITH oldest_lot AS (
  SELECT id, lot_number, current_quantity
  FROM materials.material_lots
  WHERE material_code = 'M-00-001' AND status = 'active' AND current_quantity > 0
  ORDER BY lot_date ASC, created_at ASC
  LIMIT 1
)
UPDATE materials.material_lots
SET current_quantity = current_quantity - 100,
    status = CASE WHEN current_quantity - 100 = 0 THEN 'depleted' ELSE 'active' END
WHERE id = (SELECT id FROM oldest_lot);
```

**Pros:**
- ✅ Full lot-level inventory tracking
- ✅ FIFO automatic (query by lot_date)
- ✅ Expiry date management
- ✅ Lot status (active/depleted/expired)
- ✅ Full traceability (lot → order → supplier)
- ✅ ISO 9001 compliant
- ✅ Reserved quantities per lot

**Cons:**
- ❌ Major DB schema change (new table)
- ❌ Significant backend rewrite
- ❌ UI redesign (lot selection, lot reports)
- ❌ Migration complexity (existing stock → lots)
- ❌ Performance overhead (more complex queries)

**Impact:**
- 🔧 Order delivery: Lot creation mandatory
- 🔧 Production start: Automatic lot selection (FIFO)
- 🔧 Reports: Lot-level inventory, expiry alerts
- 🔧 Stock check: Per-lot availability
- 🔧 Traceability: Full lot → product lineage

---

## 📊 COMPARISON MATRIX

| Aspect | No Lot | Simple Lot | Full Lot |
|--------|--------|------------|----------|
| **DB Changes** | None | 1 table (ALTER) | 1 new table + 1 ALTER |
| **Backend Rewrite** | 0% | 30% | 70% |
| **UI Changes** | 0% | 20% | 60% |
| **FIFO Inventory** | ❌ No | ✅ Yes (manual) | ✅ Yes (automatic) |
| **Traceability** | ❌ No | ⚠️ Partial | ✅ Full |
| **Expiry Tracking** | ❌ No | ❌ No | ✅ Yes |
| **ISO 9001 Compliance** | ❌ No | ⚠️ Partial | ✅ Yes |
| **Migration Risk** | None | Low | High |
| **Implementation Time** | 0 weeks | 2 weeks | 6 weeks |
| **Performance Impact** | None | Minimal | Moderate |

---

## 🎯 STRATEGIC RECOMMENDATION

### Phase 1: START WITHOUT LOT (MES FIFO Only)
**Implement 19-table design WITHOUT lot tracking**

**Rationale:**
1. ✅ **MES FIFO ≠ Inventory FIFO**
   - MES FIFO: Task scheduling (worker portal)
   - Inventory FIFO: Material consumption (lot-based)
   - İkisi farklı sistemler!

2. ✅ **Separation of Concerns**
   - MES sistemi: Production planning & execution
   - Inventory sistemi: Material tracking
   - Şu an MES'e odaklanıyoruz

3. ✅ **Low Risk Implementation**
   - 19 tabloya geçiş zaten büyük değişiklik
   - Lot tracking eklemek complexity'i 2x artırır
   - Sıfır hata hedefi için adım adım ilerlemeliyiz

4. ✅ **Future-Ready Design**
   - 19 tablo lot tracking'e hazır
   - `stock_movements.lot_number` eklemek kolay
   - `material_lots` tablosu eklemek mümkün

**Implementation:**
```sql
-- Phase 1: MES with aggregated stock (NO lot)
19 tables (as designed)
+ FIFO task scheduling (expected_start sorting)
+ Material reservation (assignment_material_reservations)
+ Stock movements (quantity tracking only)

-- Phase 2: Add simple lot tracking (FUTURE)
+ ALTER stock_movements (add lot_number, lot_date)
+ UI for lot input on order delivery
+ Backend FIFO lot consumption

-- Phase 3: Full lot inventory (FUTURE if needed)
+ CREATE material_lots table
+ Full traceability
+ Expiry management
```

**Benefits:**
- ✅ Ship MES system faster (2-3 weeks)
- ✅ Zero risk of lot complexity breaking MES
- ✅ Test MES thoroughly before adding inventory features
- ✅ Customer feedback before lot investment
- ✅ Gradual rollout (Phase 1 → Phase 2 → Phase 3)

---

### Phase 2: SIMPLE LOT (When Needed)
**Trigger: Customer requests lot tracking**

**Quick Implementation (1 week):**
```sql
-- 1. Add lot fields to stock_movements
ALTER TABLE materials.stock_movements ADD (
  lot_number VARCHAR(100),
  lot_date DATE,
  supplier_lot_code VARCHAR(100),
  
  INDEX idx_lot_fifo (material_code, lot_date) WHERE type = 'in'
);

-- 2. Add lot input to order delivery UI
-- 3. Add FIFO lot consumption to production start
-- 4. Add lot-level inventory report
```

**Migration:**
```sql
-- Backfill existing stock movements with auto-generated lots
UPDATE materials.stock_movements
SET lot_number = 'LEGACY-' || TO_CHAR(movement_date, 'YYYY-MM-DD') || '-' || id,
    lot_date = movement_date::DATE
WHERE type = 'in' AND lot_number IS NULL;
```

---

### Phase 3: FULL LOT (If Compliance Required)
**Trigger: ISO 9001, food/pharma industry, regulatory requirement**

**Full Implementation (4-6 weeks):**
- Create `material_lots` table
- Rewrite stock reservation logic
- Add expiry alerts
- Full traceability reports
- Lot genealogy tracking

---

## 🚀 FINAL DECISION FRAMEWORK

### Scenario A: General Manufacturing (Metal, Furniture, etc.)
**Recommendation: Phase 1 (No Lot)**
- Aggregated stock yeterli
- FIFO task scheduling var (MES)
- Material FIFO gerekmez
- **Action: 19 tabloya geç, lot ekleme**

### Scenario B: Customer Requests "Lot Tracking"
**Recommendation: Phase 2 (Simple Lot)**
- stock_movements'a lot_number ekle
- 1 hafta implementation
- Minimal risk
- **Action: Phase 1 → Phase 2 migration**

### Scenario C: ISO 9001 / Compliance Required
**Recommendation: Phase 3 (Full Lot)**
- Dedicated material_lots table
- Full traceability
- 6 hafta implementation
- **Action: Plan Phase 3 architecture**

---

## 📋 IMMEDIATE ACTION PLAN

### For Current SQL Migration:

**✅ DO NOW (19 Tables WITHOUT Lot):**
1. Implement polymorphic entity_relations
2. Add FIFO fields to mes_worker_assignments
3. Create assignment_material_reservations table
4. Add partial_reservation to stock_movements
5. **DON'T add lot_number to stock_movements yet**

**⏳ PREPARE FOR LATER (Lot-Ready Design):**
- stock_movements has all needed fields
- Easy to add lot_number (nullable)
- material_lots table design ready
- Migration scripts prepared

**🔮 FUTURE PHASES:**
- Phase 2: Trigger based on customer need
- Phase 3: Trigger based on compliance
- No premature optimization

---

## 🎯 SANA SORUM

**19 tablaya geçerken lot tracking'i ne yapalım?**

1. **✅ Phase 1: Lot YOK (Öneri)** 
   - Hızlı ship (2-3 hafta)
   - Sıfır risk
   - MES'e odaklan
   - İleride ekleriz

2. **⚠️ Phase 2: Basit Lot (Orta)** 
   - stock_movements'a lot_number ekle
   - 4 hafta implementation
   - Orta risk
   - Şimdi yap, sonra rahat et

3. **❌ Phase 3: Full Lot (Karmaşık)**
   - material_lots table
   - 8 hafta implementation
   - Yüksek risk
   - Şu an gereksiz

**Kararın ne olsun?** 🚀

---

---

# 📘 APPENDIX: PHASE 1+2 IMPLEMENTATION GUIDE
## Complete Step-by-Step Instructions for Another Copilot Session

**Purpose:** This appendix provides complete, self-contained prompts that can be copy-pasted into a fresh Copilot chat session to implement Phase 1+2 (19 tables + simple lot tracking) without requiring any additional context.

**Prerequisites:** All design work complete (see MES-ULTIMATE-DATABASE-ARCHITECTURE.md, PHASE-1-2-IMPLEMENTATION-GUIDE.md)

---

## 🎯 IMPLEMENTATION OVERVIEW

### What Will Be Built

**Phase 1: 19-Table MES Architecture**
- Polymorphic entity_relations (consolidates 6 junction tables)
- Production plan nodes extraction (no JSONB)
- FIFO task scheduling (12 timing fields)
- Material reservation tracking
- Real-time triggers (LISTEN/NOTIFY)

**Phase 2: Simple Lot Tracking**
- stock_movements: +9 lot fields
- order_items: +4 lot fields
- materials: +3 lot summary fields
- FIFO inventory consumption
- Full traceability

**Total Implementation Time:** 3-4 weeks  
**Database Changes:** 4 tables enhanced, 0 new tables  
**Migration Files:** 028-031 (4 new migrations)

---

## 📋 STEP-BY-STEP EXECUTION PLAN

### STEP 1: Review Existing Architecture (15 minutes)

**Prompt for Copilot:**
```
I need to review the MES architecture design that was completed in a previous session. 

Please:
1. Read MES-ULTIMATE-DATABASE-ARCHITECTURE.md (complete file)
2. Read PHASE-1-2-IMPLEMENTATION-GUIDE.md (complete file)
3. Summarize the 19-table structure
4. List all existing migrations (022-027)
5. Identify what's already done vs what needs to be implemented

Context: Previous session completed all design work. I need to implement migrations 028-031 for FIFO fields and lot tracking.
```

**Expected Output:**
- Summary of 19 tables
- List of 6 existing migrations (022-027)
- Identification of 4 pending migrations (028-031)
- Confirmation of design decisions (no JSONB, polymorphic relations, simple lot)

**Success Criteria:**
- ✅ Copilot understands the 19-table architecture
- ✅ Copilot confirms migrations 022-027 exist
- ✅ Copilot identifies that 028-031 need to be created

---

### STEP 2: Create Migration 028 - FIFO Fields in Assignments (30 minutes)

**Prompt for Copilot:**
```
Create migration 028: Add FIFO scheduling fields to mes_worker_assignments table.

Reference: MES-FIFO-OPTIMIZATION-DATABASE-REQUIREMENTS.md section "12 Timing Fields"

Requirements:
1. Add these fields to mes_worker_assignments:
   - scheduling_mode VARCHAR(20) DEFAULT 'fifo' CHECK (IN ('fifo', 'optimized'))
   - nominal_time INTEGER NOT NULL
   - effective_time INTEGER
   - expected_start TIMESTAMP NOT NULL (for FIFO sorting)
   - optimized_start TIMESTAMP
   - planned_end TIMESTAMP
   - actual_start TIMESTAMP
   - actual_end TIMESTAMP
   - optimized_index INTEGER
   - paused_at TIMESTAMP
   - current_pause_start TIMESTAMP
   - total_paused_time INTEGER DEFAULT 0

2. Create these indexes:
   - idx_fifo_queue: (worker_id, status, expected_start) WHERE status IN ('pending', 'ready')
   - idx_optimization_queue: (worker_id, status, optimized_index) WHERE scheduling_mode = 'optimized'

3. Add CHECK constraints:
   - actual_start >= expected_start (if not null)
   - actual_end >= actual_start (if not null)
   - scheduling_mode consistency

File: WebApp/db/migrations/028_add_fifo_fields_to_assignments.js

Use Knex.js syntax. Include proper up() and down() functions. Add detailed comments.
```

**Expected Output:**
- New file: `028_add_fifo_fields_to_assignments.js`
- 12 new columns in mes_worker_assignments
- 2 partial indexes for FIFO performance
- 3 CHECK constraints for data integrity

**Success Criteria:**
- ✅ Migration file created with correct Knex syntax
- ✅ All 12 FIFO fields present
- ✅ Indexes optimized for FIFO queries
- ✅ Rollback function complete

**Verification Command:**
```bash
# Test migration syntax
npm run migrate:make test
npm run migrate:status
```

---

### STEP 3: Create Migration 029 - Assignment Material Reservations (30 minutes)

**Prompt for Copilot:**
```
Create migration 029: Create mes.assignment_material_reservations table.

Reference: MES-ULTIMATE-DATABASE-ARCHITECTURE.md section "Decision 2: FIFO Fields"

Requirements:
1. Create table mes.assignment_material_reservations (using mes schema):
   - id SERIAL PRIMARY KEY
   - assignment_id VARCHAR(100) FK to mes.mes_worker_assignments(id) ON DELETE CASCADE
   - material_code VARCHAR(100) NOT NULL
   - pre_production_qty DECIMAL(10,2) NOT NULL (calculated at plan launch)
   - actual_reserved_qty DECIMAL(10,2) (reserved at task start)
   - consumed_qty DECIMAL(10,2) (consumed at completion)
   - reservation_status VARCHAR(20) DEFAULT 'pending' CHECK (IN 'pending','reserved','consumed','released')
   - created_at TIMESTAMP DEFAULT NOW()

2. Add UNIQUE constraint: (assignment_id, material_code)

3. Add CHECK constraint: consumed_qty <= actual_reserved_qty <= pre_production_qty

4. Create indexes:
   - idx_assignment: (assignment_id)
   - idx_material: (material_code)
   - idx_status: (reservation_status)

5. Add FK to materials.materials(code) ON DELETE RESTRICT

File: WebApp/db/migrations/029_create_assignment_material_reservations.js

IMPORTANT: Use knex.schema.withSchema('mes').createTable('assignment_material_reservations', ...) to create table in mes schema.

Include detailed comments about 2-phase commit pattern (pre-production calculation → actual reservation → consumption).
```

**Expected Output:**
- New file: `029_create_assignment_material_reservations.js`
- New table with 8 columns
- 3 indexes for performance
- FK constraints to assignments and materials

**Success Criteria:**
- ✅ Table schema matches design doc exactly
- ✅ 2-phase commit pattern documented in comments
- ✅ CHECK constraint prevents invalid state transitions
- ✅ Rollback drops table cleanly

---

### STEP 4: Create Migration 030 - Stock Movements Enhancements (30 minutes)

**Prompt for Copilot:**
```
Create migration 030: Add partial reservation tracking to materials.stock_movements.

Reference: Optimized-DATA-FLOW-STUDY.md section "Partial Reservation Handling"

Requirements:
1. Add to materials.stock_movements table:
   - requested_quantity DECIMAL(15,3) (what was originally requested)
   - partial_reservation BOOLEAN DEFAULT false
   - warning TEXT (message for partial reservations)
   - assignment_id VARCHAR(100) (FK to mes_worker_assignments)

2. Create indexes:
   - idx_assignment_movements: (assignment_id) WHERE assignment_id IS NOT NULL
   - idx_partial_warnings: (partial_reservation) WHERE partial_reservation = true

3. Add FK constraint:
   - assignment_id → mes_worker_assignments(id) ON DELETE SET NULL

4. Add CHECK constraint:
   - IF partial_reservation = true THEN quantity < requested_quantity

File: WebApp/db/migrations/030_add_partial_reservation_to_stock_movements.js

Note: This prepares stock_movements for lot tracking (Migration 031 will add lot fields).
```

**Expected Output:**
- Migration file modifying materials.stock_movements
- 4 new columns
- 2 indexes for tracking partial reservations
- FK to assignments for traceability

**Success Criteria:**
- ✅ Partial reservation logic documented
- ✅ Assignment link established
- ✅ Warning field for user notifications
- ✅ Backward compatible (all fields nullable)

---

### STEP 5: Create Migration 031 - Lot Tracking Fields (45 minutes)

**Prompt for Copilot:**
```
Create migration 031: Add lot/batch tracking to inventory system.

Reference: PHASE-1-2-IMPLEMENTATION-GUIDE.md section "Database Changes"

This is the FINAL migration for Phase 1+2. It adds simple lot tracking without creating new tables.

Requirements:

**Part 1: Enhance stock_movements**
Add to materials.stock_movements:
- lot_number VARCHAR(100) (auto-generated or manual)
- lot_date DATE (CRITICAL for FIFO sorting)
- supplier_lot_code VARCHAR(100) (supplier's batch code)
- manufacturing_date DATE
- expiry_date DATE
- node_sequence INTEGER (which node in plan produced this)

Indexes:
- idx_lot_number: (lot_number)
- idx_material_lot: (material_code, lot_number)
- idx_fifo_lots: (material_code, lot_date, type) WHERE type='in' AND lot_number IS NOT NULL (CRITICAL!)
- idx_expiry: (expiry_date) WHERE expiry_date IS NOT NULL
- idx_node_sequence: (related_plan_id, node_sequence) WHERE node_sequence IS NOT NULL

**Part 2: Enhance order_items**
Add to materials.order_items:
- lot_number VARCHAR(100) (links to stock_movements.lot_number)
- supplier_lot_code VARCHAR(100)
- manufacturing_date DATE
- expiry_date DATE

Index:
- idx_lot: (lot_number)

**Part 3: Enhance materials (optional denormalization)**
Add to materials.materials:
- active_lot_count INTEGER DEFAULT 0 (number of active lots)
- oldest_lot_date DATE (for FIFO indicator)
- nearest_expiry_date DATE (for expiry alerts)

**Part 4: Enhance assignment_material_reservations**
Add to mes.assignment_material_reservations:
- lot_number VARCHAR(100) (which lot was consumed)

Index:
- idx_assignment_lot: (assignment_id, lot_number)

IMPORTANT: Use knex.schema.withSchema('mes').alterTable('assignment_material_reservations', ...) to modify table in mes schema.

**Part 5: Create trigger for lot summary**
Create PostgreSQL trigger that updates materials.active_lot_count, oldest_lot_date, nearest_expiry_date when stock_movements are inserted/updated.

Function: materials.update_material_lot_summary()
Trigger: trg_update_lot_summary ON materials.stock_movements

File: WebApp/db/migrations/031_add_lot_tracking.js

Use Knex.js for schema changes and knex.raw() for trigger creation. Include comprehensive comments.
```

**Expected Output:**
- Complete migration file with 4 table modifications
- 9 new fields in stock_movements
- 4 new fields in order_items
- 3 new fields in materials
- 1 new field in assignment_material_reservations
- PostgreSQL trigger for denormalized lot summary
- Detailed comments explaining FIFO lot consumption

**Success Criteria:**
- ✅ All lot fields added as nullable (backward compatible)
- ✅ FIFO index on (material_code, lot_date, type) created
- ✅ Trigger automatically updates lot summaries
- ✅ Rollback removes all lot fields and trigger
- ✅ Comments explain lot numbering scheme: LOT-{materialCode}-{date}-{seq}

---

### STEP 6: Run Migrations (10 minutes)

**Prompt for Copilot:**
```
I've created migrations 028-031. Now I need to:

1. Check migration syntax for errors
2. Run migrations in test environment
3. Verify all tables were modified correctly
4. Check that indexes were created

Commands to run:
npm run migrate:status (show pending migrations)
npm run migrate (apply migrations)
npm run migrate:status (verify applied)

Environment: test database

If any errors occur, analyze the error and fix the migration file.
```

**Expected Output:**
- Migration status showing 028-031 as "pending"
- Successful migration execution
- Migration status showing 028-031 as "completed"
- No errors in console

**Success Criteria:**
- ✅ All 4 migrations run successfully
- ✅ No foreign key errors
- ✅ No syntax errors
- ✅ Database schema matches design

**Verification Queries:**
```sql
-- Verify FIFO fields in assignments
\d mes_worker_assignments

-- Verify material reservations table
\d mes.assignment_material_reservations

-- Verify lot fields in stock_movements
\d materials.stock_movements

-- Verify lot fields in order_items  
\d materials.order_items

-- Check indexes
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'stock_movements' AND indexname LIKE '%lot%';
```

---

### STEP 7: Create Backend - Lot Number Generation (45 minutes)

**Prompt for Copilot:**
```
Create backend function to generate lot numbers automatically.

Reference: PHASE-1-2-IMPLEMENTATION-GUIDE.md section "Workflow 1: Order Delivery"

Requirements:

**File: WebApp/server/utils/lotGenerator.js**

Create function generateLotNumber(materialCode, date = new Date()) that:
1. Generates format: LOT-{materialCode}-{YYYYMMDD}-{seq}
   Example: LOT-M-00-001-20251120-001

2. Queries stock_movements to find existing lots for this material + date
3. Increments sequence number (001, 002, 003...)
4. Returns unique lot number

Include:
- JSDoc comments
- Error handling
- Unit test examples in comments

Also create:
- validateLotNumber(lotNumber) - validates format
- parseLotNumber(lotNumber) - extracts material code, date, sequence
```

**Expected Output:**
- New file: `WebApp/server/utils/lotGenerator.js`
- 3 exported functions
- Comprehensive error handling
- Examples in comments

**Success Criteria:**
- ✅ Lot number format matches design: LOT-{code}-{date}-{seq}
- ✅ Sequence increments correctly for same material+date
- ✅ Handles concurrent requests (uses database transaction)
- ✅ Validation function checks format

---

### STEP 8: Create Backend - FIFO Lot Consumption (60 minutes)

**Prompt for Copilot:**
```
Create backend function for FIFO lot consumption when production task starts.

Reference: PHASE-1-2-IMPLEMENTATION-GUIDE.md section "Workflow 2: Production Start (FIFO Lot Consumption)"

Requirements:

**File: WebApp/server/utils/lotConsumption.js**

Create async function reserveMaterialsWithLotTracking(assignmentId, materialRequirements, db):

1. Start database transaction (serializable isolation)
2. For each material requirement:
   a. Query available lots (FIFO order by lot_date ASC)
   b. Calculate consumption from oldest lots first
   c. Create stock_movements (type='out') for each lot consumed
   d. Insert into mes.assignment_material_reservations with lot_number
   e. Handle partial reservations (warn if insufficient stock)
3. Update materials.stock and wip_reserved aggregates
4. Update assignment status to 'in_progress'
5. Commit transaction (or rollback on any error)

Input materialRequirements format:
[
  { materialCode: 'M-00-001', requiredQty: 100 },
  { materialCode: 'M-00-002', requiredQty: 50 }
]

Output format:
{
  success: true,
  reservations: [
    { 
      materialCode: 'M-00-001', 
      lotsConsumed: [
        { lotNumber: 'LOT-M-00-001-001', qty: 50 },
        { lotNumber: 'LOT-M-00-001-002', qty: 50 }
      ],
      totalReserved: 100,
      partialReservation: false
    }
  ],
  warnings: []
}

Include:
- Complete error handling
- Transaction rollback on failure
- Detailed logging
- JSDoc documentation
```

**Expected Output:**
- New file: `WebApp/server/utils/lotConsumption.js`
- FIFO lot consumption logic
- Transaction handling
- Partial reservation warnings

**Success Criteria:**
- ✅ Consumes from oldest lot first (lot_date ASC)
- ✅ Creates one stock_movement per lot consumed
- ✅ Records lot_number in assignment_material_reservations
- ✅ Handles multi-lot consumption correctly
- ✅ Warns on partial reservations
- ✅ Atomic transaction (all or nothing)

---

### STEP 9: Update API - Order Delivery with Lot (45 minutes)

**Prompt for Copilot:**
```
Update order delivery API endpoint to support lot tracking.

Reference: PHASE-1-2-IMPLEMENTATION-GUIDE.md section "Workflow 1: Order Delivery"

File to modify: WebApp/server/ordersRoutes.js (or similar)

Find the POST /api/orders/:orderCode/items/:itemId/deliver endpoint.

Modifications:

1. Accept new request body fields:
   - supplierLotCode (optional)
   - manufacturingDate (optional)
   - expiryDate (optional)

2. Use lotGenerator.generateLotNumber(materialCode, new Date())

3. When creating stock_movement (type='in'):
   - Add lot_number (generated)
   - Add lot_date (delivery date)
   - Add supplier_lot_code (from request)
   - Add manufacturing_date (from request)
   - Add expiry_date (from request)

4. Update order_item with lot information:
   - SET lot_number, supplier_lot_code, manufacturing_date, expiry_date

5. Return lot_number in response

Request example:
{
  "quantity": 500,
  "supplierLotCode": "SUPPLIER-BATCH-789",
  "manufacturingDate": "2025-11-15",
  "expiryDate": "2026-11-15"
}

Response example:
{
  "success": true,
  "lotNumber": "LOT-M-00-001-20251120-001",
  "message": "Delivered 500 kg with lot tracking"
}

Maintain backward compatibility: lot fields are optional.
```

**Expected Output:**
- Modified POST endpoint
- Lot number generation integrated
- Request/response includes lot data
- Backward compatible

**Success Criteria:**
- ✅ Lot number auto-generated
- ✅ Lot fields saved to stock_movements
- ✅ order_items updated with lot data
- ✅ Works without lot data (fields nullable)
- ✅ Returns generated lot number to client

---

### STEP 10: Update API - Production Start with FIFO Lot (45 minutes)

**Prompt for Copilot:**
```
Update production task start endpoint to use FIFO lot consumption.

Reference: PHASE-1-2-IMPLEMENTATION-GUIDE.md section "Workflow 2: Production Start"

File to modify: WebApp/server/mesRoutes.js

Find the POST /api/mes/assignments/:assignmentId/start endpoint.

Modifications:

1. Import lotConsumption.js utility

2. Before starting task, call:
   const result = await reserveMaterialsWithLotTracking(
     assignmentId, 
     materialRequirements, // from mes_node_material_inputs
     db
   );

3. If result.success === false, return error

4. If result.warnings.length > 0, include in response

5. Update assignment:
   - actual_start = NOW()
   - status = 'in_progress'
   - material_reservation_status = 'reserved'

6. Update worker state:
   - current_task_assignment_id = assignmentId

7. Return lot consumption details in response

Response format:
{
  "success": true,
  "assignmentId": "WO-001-001",
  "startTime": "2025-11-20T10:30:00Z",
  "lotsConsumed": [
    {
      "materialCode": "M-00-001",
      "lotsUsed": [
        { "lotNumber": "LOT-M-00-001-001", "qty": 50 },
        { "lotNumber": "LOT-M-00-001-002", "qty": 50 }
      ]
    }
  ],
  "warnings": []
}

Test edge cases:
- Insufficient stock (partial reservation)
- No lots available
- Multiple materials from different lots
```

**Expected Output:**
- Modified POST /start endpoint
- FIFO lot consumption integrated
- Detailed response with lot usage
- Warning handling

**Success Criteria:**
- ✅ FIFO lot consumption on task start
- ✅ Stock_movements created per lot
- ✅ assignment_material_reservations populated
- ✅ Warnings returned for partial reservations
- ✅ Transaction atomic (rollback on failure)

---

### STEP 11: Create Frontend - Order Delivery Form (30 minutes)

**Prompt for Copilot:**
```
Update order delivery form to include lot information input fields.

Reference: PHASE-1-2-IMPLEMENTATION-GUIDE.md section "UI/UX Changes - Order Delivery Screen"

File to modify: WebApp/pages/materials.html (or materials UI component)

Add these input fields to delivery form:

1. Supplier Lot Code (text input, optional)
   - Label: "Tedarikçi Lot Kodu (opsiyonel)"
   - Placeholder: "Örn: BATCH-2025-001"
   - Max length: 100

2. Manufacturing Date (date input, optional)
   - Label: "Üretim Tarihi"
   - Type: date

3. Expiry Date (date input, optional)
   - Label: "Son Kullanma Tarihi (opsiyonel)"
   - Type: date

4. Info message:
   - "ℹ️ Lot numarası otomatik oluşturulacaktır"

5. After successful delivery, show generated lot:
   - "✅ Teslimat kaydedildi - Lot Numarası: LOT-M-00-001-20251120-001"

Style: Bootstrap 4 or existing UI framework

Validation:
- Manufacturing date <= today
- Expiry date > today (if provided)
- Expiry date > manufacturing date (if both provided)
```

**Expected Output:**
- Updated HTML form with 3 new fields
- Client-side validation
- Success message shows generated lot
- Optional fields (can be left blank)

**Success Criteria:**
- ✅ Form sends lot data to API
- ✅ Validation prevents invalid dates
- ✅ Generated lot number displayed on success
- ✅ Works without lot data (backward compatible)

---

### STEP 12: Integrate Lot Inventory into Material Detail Modal (45 minutes)

**Prompt for Copilot:**
```
Add lot inventory section to Material Detail modal.

Reference: PHASE-1-2-IMPLEMENTATION-GUIDE.md section "UI/UX Changes - Stock Check Screen"

Instead of creating a new page, integrate lot inventory into the existing Material Detail modal (EditMaterialModal.jsx) for better UX - this centralizes all material-related data (general info, suppliers, lot inventory, production history, procurement history) in one place.

Requirements:

1. Create API endpoint GET /api/materials/:code/lots:
   Query:
   SELECT 
     sm.lot_number,
     sm.lot_date,
     sm.supplier_lot_code,
     sm.manufacturing_date,
     sm.expiry_date,
     SUM(CASE WHEN sm.type='in' THEN sm.quantity ELSE -sm.quantity END) as lot_balance,
     CASE
       WHEN sm.expiry_date < CURRENT_DATE THEN 'expired'
       WHEN sm.expiry_date < CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
       ELSE 'active'
     END as lot_status,
     ROW_NUMBER() OVER (PARTITION BY sm.material_code ORDER BY sm.lot_date) as fifo_order
   FROM materials.stock_movements sm
   WHERE sm.material_code = :code AND sm.lot_number IS NOT NULL
   GROUP BY sm.lot_number, sm.lot_date, sm.supplier_lot_code, sm.manufacturing_date, sm.expiry_date
   HAVING SUM(CASE WHEN sm.type='in' THEN sm.quantity ELSE -sm.quantity END) > 0
   ORDER BY sm.lot_date ASC;

2. Create custom hook WebApp/domains/materials/hooks/useMaterialLots.js:
   - Lazy loading pattern (matches existing useMaterialProcurementHistory)
   - loadLots(materialCode) function
   - Returns { lots, loading, error, loadLots }

3. Add section to EditMaterialModal.jsx (between suppliers and production history):
   - Section header: "📦 Lot Envanteri"
   - Load button: "🔄 Lot Bilgilerini Yükle" (follows existing lazy-loading pattern)
   - Table with columns:
     * Lot Numarası (Lot Number)
     * Lot Tarihi (Lot Date)
     * Tedarikçi Lot Kodu (Supplier Lot Code)
     * Üretim Tarihi (Manufacturing Date)
     * Son Kullanma (Expiry Date)
     * Bakiye (Balance)
     * Durum (Status badge)
     * FIFO Sıra (FIFO Order: #1, #2, #3...)

4. Color coding for status badges:
   - Green (mes-status-active): active lots
   - Yellow (mes-status-warning): expiring_soon (<30 days)
   - Red (mes-status-error): expired lots

5. MES design system styling:
   - Use existing .mes-section-card classes
   - Use .mes-primary-action for load button
   - Use .mes-table-container for table
   - Match styling of Production History and Procurement History sections

Files to modify:
- WebApp/server/materialsRoutes.js (add GET /:code/lots endpoint)
- WebApp/domains/materials/hooks/useMaterialLots.js (create new)
- WebApp/domains/materials/components/EditMaterialModal.jsx (add section)
```

**Expected Output:**
- New GET /api/materials/:code/lots endpoint in materialsRoutes.js
- New useMaterialLots.js hook following existing patterns
- New "Lot Envanteri" section in Material Detail modal
- Lazy-loading with "Yükle" button (matches existing UI pattern)
- Table showing lot-level stock with FIFO order
- Status badges with color coding

**Success Criteria:**
- ✅ Lot inventory integrated into Material Detail modal (not a new page)
- ✅ Follows existing lazy-loading section pattern
- ✅ Shows all active lots for specific material
- ✅ FIFO order displayed (oldest first: #1, #2, #3...)
- ✅ Expiry warnings visible (color-coded badges)
- ✅ Balance calculated correctly (sum of in - out)
- ✅ MES design system styling applied
- ✅ Consistent with Production History and Procurement History UI

---

### STEP 13: Create Frontend - Production Lot Preview (30 minutes)

**Prompt for Copilot:**
```
Add lot consumption preview to worker portal before starting task.

Reference: PHASE-1-2-IMPLEMENTATION-GUIDE.md section "UI/UX Changes - Production Start"

File to modify: WebApp/pages/worker-portal.html

Before "Start Task" button, show which lots will be consumed:

1. Create API endpoint GET /api/mes/assignments/:assignmentId/lot-preview:
   - Returns which lots will be consumed (FIFO order)
   - Doesn't actually reserve (just preview)

   Response format:
   {
     "materials": [
       {
         "materialCode": "M-00-001",
         "materialName": "Çelik Sac",
         "requiredQty": 100,
         "lotsToConsume": [
           { "lotNumber": "LOT-M-00-001-001", "lotDate": "2025-11-01", "consumeQty": 50 },
           { "lotNumber": "LOT-M-00-001-002", "lotDate": "2025-11-15", "consumeQty": 50 }
         ]
       }
     ]
   }

2. Display in UI:
   <div class="lot-consumption-preview">
     <h4>Tüketilecek Malzemeler</h4>
     <div class="material-item">
       <strong>Çelik Sac (M-00-001)</strong>
       <div class="lot-line">
         📦 LOT-M-00-001-001 (01.11.2025) → 50 kg
       </div>
       <div class="lot-line">
         📦 LOT-M-00-001-002 (15.11.2025) → 50 kg
       </div>
     </div>
   </div>

3. Show warning if insufficient stock

Style: Bootstrap cards or existing UI
```

**Expected Output:**
- New GET lot-preview endpoint
- Preview section in worker portal
- Shows FIFO lot consumption plan
- Warns if insufficient stock

**Success Criteria:**
- ✅ Preview shown before task start
- ✅ Lists lots in FIFO order (oldest first)
- ✅ Shows quantities from each lot
- ✅ Warning if stock shortage

---

### STEP 14: Testing & Validation (60 minutes)

**Prompt for Copilot:**
```
Create comprehensive test plan for Phase 1+2 implementation.

Requirements:

**Test 1: Migration Validation**
1. Verify all 4 tables modified correctly
2. Check all indexes created
3. Verify triggers working
4. Test rollback (down migrations)

Commands:
\d mes_worker_assignments
\d mes_assignment_material_reservations
\d materials.stock_movements
\d materials.order_items

**Test 2: Lot Number Generation**
1. Create order delivery with lot data
2. Verify lot_number generated: LOT-{code}-{date}-{seq}
3. Test sequence increment (same material, same day)
4. Verify lot_date = delivery date

**Test 3: FIFO Lot Consumption**
1. Create 3 lots for material M-00-001:
   - LOT 001: 100 kg, date: 2025-11-01
   - LOT 002: 200 kg, date: 2025-11-15
   - LOT 003: 150 kg, date: 2025-11-20

2. Start production task requiring 250 kg
3. Verify consumption:
   - LOT 001: 100 kg consumed (oldest)
   - LOT 002: 150 kg consumed (next oldest)
   - LOT 003: 0 kg (not touched)

4. Check stock_movements created (2 OUT movements)
5. Check assignment_material_reservations (2 rows with lot numbers)

**Test 4: Partial Reservation**
1. Material with only 80 kg available (1 lot)
2. Start task requiring 100 kg
3. Verify:
   - partial_reservation = true
   - warning = "Partial reservation: requested 100, reserved 80"
   - Task still starts (with warning)

**Test 5: Traceability**
1. Deliver order → get lot_number
2. Start production → consume from lot
3. Query: Which assignment used which lot?
4. Query: Which lot was used in which work order?

**Test 6: UI Validation**
1. Order delivery form accepts lot data
2. Material Detail modal lot inventory section shows lots (lazy-loaded)
3. Worker portal shows lot preview
4. FIFO order displayed correctly (#1, #2, #3)

Create test script: WebApp/tests/lot-tracking-test.js
```

**Expected Output:**
- Comprehensive test script
- SQL queries for verification
- Expected vs actual results
- Pass/fail criteria

**Success Criteria:**
- ✅ All migrations run cleanly
- ✅ Lot number format correct
- ✅ FIFO consumption works
- ✅ Partial reservations handled
- ✅ Traceability queries work
- ✅ UI shows lot data correctly

---

### STEP 15: Documentation & Handoff (30 minutes)

**Prompt for Copilot:**
```
Create final documentation for Phase 1+2 implementation.

**File 1: IMPLEMENTATION-COMPLETED.md**
Create summary document with:
1. What was implemented (19 tables + lot tracking)
2. Migration files created (028-031)
3. Backend functions created
4. API endpoints modified
5. UI changes made
6. Test results
7. Known limitations
8. Future enhancements (Phase 3)

**File 2: API-CHANGES.md**
Document all API changes:
- New request fields (lot data in order delivery)
- New response fields (lot consumption in production start)
- New endpoints:
  * GET /api/materials/:code/lots (material-specific lot inventory)
  * GET /api/mes/assignments/:assignmentId/lot-preview (FIFO consumption preview)
- Backward compatibility notes (all lot fields nullable)

**File 3: DATABASE-SCHEMA.md**
Update with final schema including lot fields:
- Table diagrams (note: mes.assignment_material_reservations in mes schema)
- Field descriptions
- Index strategy
- Trigger documentation

**File 4: USER-GUIDE.md (Turkish)**
Create user guide for lot tracking features:
- Sipariş tesliminde lot bilgisi girme (Order Delivery modal)
- Lot bazında stok görüntüleme (Material Detail modal → Lot Envanteri sekmesi)
- Üretimde lot tüketimi takibi (Worker Portal lot preview)
- FIFO mantığı açıklaması (en eski lot önce tüketilir)
- Screenshots (placeholders)

Include version number: Phase 1+2 (v1.0)
```

**Expected Output:**
- 4 comprehensive documentation files
- API change summary
- Schema documentation
- Turkish user guide

**Success Criteria:**
- ✅ Complete feature list documented
- ✅ All API changes listed
- ✅ Schema accurate and up-to-date
- ✅ User guide in Turkish
- ✅ Ready for production deployment

---

## 🎯 FINAL VERIFICATION CHECKLIST

After completing all 15 steps, verify:

### Database
- [ ] 4 migrations created (028-031)
- [ ] 4 migrations applied successfully
- [ ] 4 tables modified (assignments, stock_movements, order_items, materials)
- [ ] 1 new table created (assignment_material_reservations)
- [ ] 8+ indexes created
- [ ] 1 trigger created (lot summary)
- [ ] All rollbacks tested

### Backend
- [ ] lotGenerator.js created
- [ ] lotConsumption.js created
- [ ] Order delivery endpoint updated
- [ ] Production start endpoint updated
- [ ] 2 new API endpoints (GET /api/materials/:code/lots, GET /api/mes/assignments/:assignmentId/lot-preview)

### Frontend
- [ ] Order delivery form updated
- [ ] Lot inventory section integrated into Material Detail modal
- [ ] Worker portal lot preview added
- [ ] All UI shows lot data

### Testing
- [ ] Lot generation tested
- [ ] FIFO consumption tested
- [ ] Partial reservation tested
- [ ] Traceability queries work
- [ ] UI validation complete

### Documentation
- [ ] Implementation summary written
- [ ] API changes documented
- [ ] Schema updated
- [ ] User guide created (Turkish)

---

## 📞 SUPPORT & TROUBLESHOOTING

### Common Issues

**Issue 1: Migration fails with FK constraint error**
- Check migration 028-031 order (must run sequentially)
- Verify mes_worker_assignments exists
- Check materials.stock_movements schema

**Issue 2: Lot number generation creates duplicates**
- Ensure database transaction isolation
- Check sequence query logic
- Verify unique constraint on lot_number

**Issue 3: FIFO consumption takes from wrong lot**
- Verify lot_date is set correctly on delivery
- Check ORDER BY clause: lot_date ASC, created_at ASC
- Verify index on (material_code, lot_date, type)

**Issue 4: Partial reservation warning not showing**
- Check stock_movements.partial_reservation field
- Verify CHECK constraint logic
- Check UI warning display logic

### Performance Issues

**Slow lot inventory query:**
- Ensure idx_fifo_lots index exists
- Consider materialized view (see PHASE-1-2-IMPLEMENTATION-GUIDE.md)
- Add LIMIT clause for large datasets

**Slow FIFO consumption:**
- Check EXPLAIN ANALYZE on lot query
- Ensure partial index on type='in'
- Consider caching available lot balances

---

## 🚀 DEPLOYMENT CHECKLIST

Before deploying to production:

1. **Backup Database**
   ```bash
   pg_dump BeePlan_prod > backup_before_phase1_2.sql
   ```

2. **Test in Staging**
   - Run all migrations
   - Test with production-like data volume
   - Performance benchmarks

3. **Gradual Rollout**
   - Week 1: Enable lot tracking for new orders only
   - Week 2: Migrate existing materials (set lot_date = created_at)
   - Week 3: Full lot tracking enforcement

4. **Monitor**
   - Query performance (lot queries <100ms)
   - Stock movement volume
   - User feedback on lot UI

5. **Rollback Plan**
   - Keep migrations 028-031 rollback ready
   - Backup before migration
   - Test rollback in staging

---

## 📚 ADDITIONAL RESOURCES

**Key Files to Reference:**
- MES-ULTIMATE-DATABASE-ARCHITECTURE.md (Complete 19-table design)
- PHASE-1-2-IMPLEMENTATION-GUIDE.md (15,000-word complete guide)
- MES-FIFO-OPTIMIZATION-DATABASE-REQUIREMENTS.md (FIFO timing fields)
- Optimized-DATA-FLOW-STUDY.md (Partial reservation pattern)

**Database Design Decisions:**
- No new tables for lot tracking (enhances existing tables)
- Lot fields nullable (backward compatible)
- FIFO via lot_date sorting (not complex queue)
- Denormalized lot summary in materials table (performance)

**Critical Indexes:**
```sql
-- Most important for FIFO performance
CREATE INDEX idx_fifo_lots ON materials.stock_movements(material_code, lot_date, type)
WHERE type='in' AND lot_number IS NOT NULL;

-- Most important for task scheduling
CREATE INDEX idx_fifo_queue ON mes_worker_assignments(worker_id, status, expected_start)
WHERE status IN ('pending', 'ready');
```

---

## ✅ SUCCESS METRICS

Implementation is successful when:

1. **All migrations run**: 028, 029, 030, 031 applied with zero errors
2. **Lot tracking works**: Order delivery → lot generation → FIFO consumption → traceability
3. **FIFO verified**: Consumes from oldest lot first (lot_date ASC)
4. **UI functional**: 3 screens show lot data (delivery, inventory, preview)
5. **Performance good**: Lot queries <100ms, FIFO consumption <50ms
6. **Tests pass**: All 6 test scenarios pass
7. **Documentation complete**: 4 docs written

**Phase 1+2 Implementation Complete! 🎉**

---

*End of Appendix - Ready for handoff to fresh Copilot session*
