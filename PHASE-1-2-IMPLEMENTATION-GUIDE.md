# 🎯 PHASE 1+2 IMPLEMENTATION GUIDE
## 19 Tables + Simple Lot Tracking - Complete Schema & Workflow

**Tarih:** 20 Kasım 2025  
**Kapsam:** 19-table optimized MES + Simple lot tracking  
**Hedef:** Zero redundancy + FIFO inventory + Full traceability

---

## 📊 COMPLETE SCHEMA OVERVIEW

### Total Tables: 19 (MES) + Lot Enhancement

**No new tables for lot tracking - just enhance existing tables**

| Category | Tables | Lot Impact |
|----------|--------|------------|
| **Master Data** | 7 | No change |
| **Transactions** | 5 | ✅ stock_movements + lot fields |
| **Relationships** | 4 | No change |
| **Supporting** | 3 | ✅ order_items + lot fields |
| **Total** | **19** | 2 tables enhanced |

---

## 🔧 DATABASE CHANGES (Complete List)

### Change 1: Stock Movements - Add Lot Tracking

**File:** `db/migrations/019_create_stock_movements.js` (MODIFY)

```javascript
export async function up(knex) {
  await knex.schema.withSchema('materials').createTable('stock_movements', (table) => {
    // ... existing fields ...
    
    // ✅ NEW: Lot/Batch tracking fields
    table.string('lot_number', 100);              // Lot identifier (manual or auto)
    table.date('lot_date');                       // Receipt/Production date (for FIFO)
    table.string('supplier_lot_code', 100);       // Supplier's batch code
    table.date('manufacturing_date');             // Manufacturing date (if known)
    table.date('expiry_date');                    // Expiration date (if applicable)
    
    // ✅ NEW: Partial reservation tracking (from Optimized-DATA-FLOW-STUDY.md)
    table.decimal('requested_quantity', 15, 3);   // What was requested
    table.boolean('partial_reservation').defaultTo(false); // True if quantity < requested
    table.text('warning');                        // Warning message for partial reservations
    
    // ✅ NEW: MES assignment reference (FK)
    table.string('assignment_id', 100);           // Direct FK to mes_worker_assignments
    
    // ... existing indexes ...
    
    // ✅ NEW: Lot-specific indexes
    table.index('lot_number');                              // Fast lot lookup
    table.index(['material_code', 'lot_number']);           // Material + Lot
    table.index(['material_code', 'lot_date', 'type'])      // FIFO consumption (CRITICAL!)
      .where(knex.raw("type = 'in' AND status = 'available'"));
    table.index('expiry_date')                              // Expiry alerts
      .where(knex.raw("expiry_date IS NOT NULL"));
    table.index('assignment_id')                            // Assignment movements
      .where(knex.raw("assignment_id IS NOT NULL"));
    
    // ✅ NEW: Foreign key to assignment
    table.foreign('assignment_id')
      .references('id')
      .inTable('mes_worker_assignments')
      .onDelete('SET NULL');
  });
}
```

**Key Points:**
- Lot fields nullable (backward compatible)
- `lot_date` is the FIFO sort key
- Partial index on `type='in'` for FIFO queries
- FK to assignments for full traceability

---

### Change 2: Order Items - Add Lot Tracking

**File:** `db/migrations/017_create_orders_tables.js` (MODIFY)

```javascript
export function up(knex) {
  return knex.schema
    .withSchema('materials').createTable('order_items', (table) => {
      // ... existing fields ...
      
      // ✅ NEW: Lot information at receipt
      table.string('lot_number', 100);              // Generated or entered on delivery
      table.string('supplier_lot_code', 100);       // Supplier's batch/lot code
      table.date('manufacturing_date');             // Manufacturing date from supplier
      table.date('expiry_date');                    // Expiration date (if applicable)
      
      // ... existing indexes ...
      
      // ✅ NEW: Lot index
      table.index('lot_number');
    });
}
```

**Key Points:**
- Lot number assigned when order item delivered
- Links to stock_movements.lot_number
- Traceability: order_item → stock_movement → assignment

---

### Change 3: Materials Table - Lot Summary (Optional Denormalization)

**File:** `db/migrations/004_create_materials.js` (MODIFY - Optional)

```javascript
export function up(knex) {
  return knex.schema.createTable('materials', (table) => {
    // ... existing fields ...
    
    // ✅ NEW: Lot-level summary (denormalized for performance)
    table.integer('active_lot_count').defaultTo(0);        // Number of active lots
    table.date('oldest_lot_date');                         // Oldest lot (FIFO indicator)
    table.date('nearest_expiry_date');                     // Nearest expiring lot
    
    // ... rest of schema ...
  });
}
```

**Update via trigger (create in migration 031):**
```sql
CREATE OR REPLACE FUNCTION update_material_lot_summary()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE materials.materials m
  SET 
    active_lot_count = (
      SELECT COUNT(DISTINCT lot_number)
      FROM materials.stock_movements
      WHERE material_code = NEW.material_code 
        AND type = 'in'
        AND lot_number IS NOT NULL
      GROUP BY material_code
    ),
    oldest_lot_date = (
      SELECT MIN(lot_date)
      FROM materials.stock_movements
      WHERE material_code = NEW.material_code
        AND type = 'in'
        AND lot_number IS NOT NULL
    ),
    nearest_expiry_date = (
      SELECT MIN(expiry_date)
      FROM materials.stock_movements
      WHERE material_code = NEW.material_code
        AND expiry_date IS NOT NULL
        AND expiry_date > CURRENT_DATE
    )
  WHERE code = NEW.material_code;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_lot_summary
AFTER INSERT OR UPDATE ON materials.stock_movements
FOR EACH ROW
WHEN (NEW.type = 'in' AND NEW.lot_number IS NOT NULL)
EXECUTE FUNCTION update_material_lot_summary();
```

---

## 🔄 WORKFLOW CHANGES

### Workflow 1: Order Delivery (Lot Creation)

**Before (No Lot):**
```sql
-- Simple stock IN
INSERT INTO materials.stock_movements (
  material_code, type, quantity, reference
) VALUES (
  'M-00-001', 'in', 500, 'ORD-2025-001'
);

UPDATE materials.materials
SET stock = stock + 500
WHERE code = 'M-00-001';
```

**After (With Lot):**
```sql
BEGIN TRANSACTION;

-- 1. Generate lot number
WITH next_lot AS (
  SELECT 
    'LOT-' || material_code || '-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' ||
    LPAD((COUNT(*) + 1)::TEXT, 3, '0') as lot_number
  FROM materials.stock_movements
  WHERE material_code = 'M-00-001' AND type = 'in'
    AND lot_date = CURRENT_DATE
  GROUP BY material_code
)
-- 2. Create stock movement with lot
INSERT INTO materials.stock_movements (
  material_code, 
  type, 
  quantity, 
  lot_number,
  lot_date,
  supplier_lot_code,
  manufacturing_date,
  expiry_date,
  reference, 
  reference_type,
  stock_before, 
  stock_after
) 
SELECT 
  'M-00-001',
  'in',
  500,
  COALESCE((SELECT lot_number FROM next_lot), 'LOT-M-00-001-20251120-001'),
  CURRENT_DATE,
  'SUPPLIER-BATCH-789',      -- From order_item
  '2025-11-15'::DATE,        -- From order_item
  '2026-11-15'::DATE,        -- From order_item (+1 year)
  'ORD-2025-001',
  'order_delivery',
  (SELECT stock FROM materials.materials WHERE code = 'M-00-001'),
  (SELECT stock FROM materials.materials WHERE code = 'M-00-001') + 500;

-- 3. Update material stock
UPDATE materials.materials
SET stock = stock + 500,
    updated_at = NOW()
WHERE code = 'M-00-001';

-- 4. Update order_item with lot
UPDATE materials.order_items
SET lot_number = (SELECT lot_number FROM materials.stock_movements WHERE id = currval('materials.stock_movements_id_seq')),
    actual_delivery_date = NOW(),
    item_status = 'Teslim Alındı'
WHERE order_code = 'ORD-2025-001' AND material_code = 'M-00-001';

COMMIT;
```

**UI Changes:**
```javascript
// Order delivery form
<form onSubmit={handleDelivery}>
  <input name="quantity" type="number" required />
  
  {/* NEW: Lot information */}
  <input 
    name="supplierLotCode" 
    placeholder="Tedarikçi Lot Kodu (opsiyonel)" 
  />
  <input 
    name="manufacturingDate" 
    type="date"
    placeholder="Üretim Tarihi"
  />
  <input 
    name="expiryDate" 
    type="date"
    placeholder="Son Kullanma Tarihi (opsiyonel)"
  />
  
  {/* Auto-generated lot shown after submit */}
  <div class="info">
    Lot Numarası: <span id="generatedLot"></span>
  </div>
</form>
```

---

### Workflow 2: Production Start (FIFO Lot Consumption)

**Before (No Lot):**
```sql
-- Reserve materials (aggregated)
UPDATE materials.materials
SET stock = stock - 100,
    wip_reserved = wip_reserved + 100
WHERE code = 'M-00-001';
```

**After (With Lot - FIFO):**
```sql
BEGIN TRANSACTION;

-- 1. Find oldest available lot (FIFO)
WITH available_lots AS (
  SELECT 
    lot_number,
    lot_date,
    SUM(CASE WHEN type = 'in' THEN quantity ELSE -quantity END) as lot_balance
  FROM materials.stock_movements
  WHERE material_code = 'M-00-001'
    AND lot_number IS NOT NULL
  GROUP BY lot_number, lot_date
  HAVING SUM(CASE WHEN type = 'in' THEN quantity ELSE -quantity END) > 0
  ORDER BY lot_date ASC, lot_number ASC
),
consumption_plan AS (
  SELECT 
    lot_number,
    lot_balance,
    SUM(lot_balance) OVER (ORDER BY lot_date, lot_number) as running_total,
    CASE 
      WHEN SUM(lot_balance) OVER (ORDER BY lot_date, lot_number ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) < 100 
      THEN LEAST(lot_balance, 100 - COALESCE(SUM(lot_balance) OVER (ORDER BY lot_date, lot_number ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0))
      ELSE 0
    END as consume_qty
  FROM available_lots
)
-- 2. Create stock OUT movements (one per lot consumed)
INSERT INTO materials.stock_movements (
  material_code,
  type,
  quantity,
  lot_number,
  lot_date,
  reference,
  reference_type,
  assignment_id,
  related_plan_id,
  related_node_id,
  sub_type,
  stock_before,
  stock_after
)
SELECT 
  'M-00-001',
  'out',
  cp.consume_qty,
  cp.lot_number,
  al.lot_date,
  'WO-001-001',
  'mes_task_start',
  'WO-001-001',
  'PLAN-001',
  'node-1',
  'wip_reservation',
  (SELECT stock FROM materials.materials WHERE code = 'M-00-001'),
  (SELECT stock FROM materials.materials WHERE code = 'M-00-001') - cp.consume_qty
FROM consumption_plan cp
INNER JOIN available_lots al ON cp.lot_number = al.lot_number
WHERE cp.consume_qty > 0;

-- 3. Update material stock
UPDATE materials.materials
SET stock = stock - (SELECT SUM(consume_qty) FROM consumption_plan),
    wip_reserved = wip_reserved + (SELECT SUM(consume_qty) FROM consumption_plan)
WHERE code = 'M-00-001';

-- 4. Record which lots were consumed in assignment
UPDATE mes_worker_assignments
SET actual_start = NOW(),
    status = 'in_progress',
    material_reservation_status = 'reserved'
WHERE id = 'WO-001-001';

-- 5. Insert reservation records (per lot)
INSERT INTO mes_assignment_material_reservations (
  assignment_id,
  material_code,
  lot_number,
  pre_production_qty,
  actual_reserved_qty,
  reservation_status
)
SELECT 
  'WO-001-001',
  'M-00-001',
  cp.lot_number,
  cp.consume_qty,
  cp.consume_qty,
  'reserved'
FROM consumption_plan cp
WHERE cp.consume_qty > 0;

COMMIT;
```

**Backend Function:**
```javascript
// server/mesRoutes.js - Enhanced with lot tracking
async function reserveMaterialsForAssignment(assignmentId, materialRequirements, db) {
  const transaction = await db.transaction();
  
  try {
    for (const req of materialRequirements) {
      const { materialCode, requiredQty } = req;
      
      // FIFO lot consumption query
      const lotsToConsume = await transaction.raw(`
        WITH available_lots AS (
          SELECT 
            lot_number,
            lot_date,
            SUM(CASE WHEN type = 'in' THEN quantity ELSE -quantity END) as lot_balance
          FROM materials.stock_movements
          WHERE material_code = ?
            AND lot_number IS NOT NULL
          GROUP BY lot_number, lot_date
          HAVING SUM(CASE WHEN type = 'in' THEN quantity ELSE -quantity END) > 0
          ORDER BY lot_date ASC, lot_number ASC
        )
        SELECT * FROM available_lots
        WHERE lot_balance > 0
      `, [materialCode]);
      
      let remainingQty = requiredQty;
      
      // Consume from each lot (FIFO order)
      for (const lot of lotsToConsume.rows) {
        if (remainingQty <= 0) break;
        
        const consumeQty = Math.min(lot.lot_balance, remainingQty);
        
        // Create stock movement
        await transaction('materials.stock_movements').insert({
          material_code: materialCode,
          type: 'out',
          quantity: consumeQty,
          lot_number: lot.lot_number,
          lot_date: lot.lot_date,
          reference: assignmentId,
          reference_type: 'mes_task_start',
          assignment_id: assignmentId,
          sub_type: 'wip_reservation',
          movement_date: new Date()
        });
        
        // Record in assignment_material_reservations
        await transaction('mes_assignment_material_reservations').insert({
          assignment_id: assignmentId,
          material_code: materialCode,
          lot_number: lot.lot_number,
          pre_production_qty: consumeQty,
          actual_reserved_qty: consumeQty,
          reservation_status: 'reserved'
        });
        
        remainingQty -= consumeQty;
      }
      
      // Update material totals
      await transaction('materials.materials')
        .where('code', materialCode)
        .update({
          stock: db.raw('stock - ?', [requiredQty - remainingQty]),
          wip_reserved: db.raw('wip_reserved + ?', [requiredQty - remainingQty])
        });
      
      // Check for partial reservation
      if (remainingQty > 0) {
        // Log warning
        await transaction('materials.stock_movements').insert({
          material_code: materialCode,
          type: 'out',
          quantity: requiredQty - remainingQty,
          requested_quantity: requiredQty,
          partial_reservation: true,
          warning: `Partial reservation: requested ${requiredQty}, reserved ${requiredQty - remainingQty} due to insufficient stock`,
          reference: assignmentId,
          reference_type: 'mes_task_start',
          assignment_id: assignmentId,
          sub_type: 'wip_reservation'
        });
      }
    }
    
    await transaction.commit();
    return { success: true };
    
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
```

---

### Workflow 3: Stock Check (Lot-Level Inventory)

**Query: Available stock per lot**
```sql
SELECT 
  sm.material_code,
  sm.lot_number,
  sm.lot_date,
  sm.expiry_date,
  SUM(CASE WHEN sm.type = 'in' THEN sm.quantity ELSE -sm.quantity END) as lot_balance,
  CASE 
    WHEN sm.expiry_date IS NOT NULL AND sm.expiry_date < CURRENT_DATE THEN 'expired'
    WHEN sm.expiry_date IS NOT NULL AND sm.expiry_date < CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
    ELSE 'active'
  END as lot_status,
  -- Oldest first (FIFO indicator)
  ROW_NUMBER() OVER (PARTITION BY sm.material_code ORDER BY sm.lot_date ASC) as fifo_order
FROM materials.stock_movements sm
WHERE sm.lot_number IS NOT NULL
GROUP BY sm.material_code, sm.lot_number, sm.lot_date, sm.expiry_date
HAVING SUM(CASE WHEN sm.type = 'in' THEN sm.quantity ELSE -sm.quantity END) > 0
ORDER BY sm.material_code, sm.lot_date ASC;
```

**Result:**
```
material_code | lot_number         | lot_date   | lot_balance | lot_status    | fifo_order
--------------|-------------------|------------|-------------|---------------|------------
M-00-001      | LOT-M-00-001-001  | 2025-11-01 | 150.00      | active        | 1
M-00-001      | LOT-M-00-001-002  | 2025-11-15 | 300.00      | active        | 2
M-00-001      | LOT-M-00-001-003  | 2025-11-20 | 500.00      | active        | 3
M-00-002      | LOT-M-00-002-001  | 2025-10-15 | 50.00       | expiring_soon | 1
```

---

### Workflow 4: Traceability (Lot → Product)

**Query: Which assignment used which lot?**
```sql
SELECT 
  a.id as assignment_id,
  a.plan_id,
  a.work_order_code,
  a.operation_name,
  amr.material_code,
  amr.lot_number,
  amr.actual_reserved_qty,
  sm.lot_date,
  sm.supplier_lot_code,
  sm.manufacturing_date,
  a.actual_start,
  a.actual_end
FROM mes_worker_assignments a
INNER JOIN mes_assignment_material_reservations amr ON a.id = amr.assignment_id
INNER JOIN materials.stock_movements sm 
  ON amr.material_code = sm.material_code 
  AND amr.lot_number = sm.lot_number
  AND sm.type = 'in'
WHERE a.work_order_code = 'WO-001'
ORDER BY a.id, amr.material_code, sm.lot_date;
```

**Result:**
```
assignment_id | work_order_code | operation_name | material_code | lot_number        | qty   | lot_date
--------------|-----------------|----------------|---------------|-------------------|-------|------------
WO-001-001    | WO-001          | Cutting        | M-00-001      | LOT-M-00-001-001  | 50.00 | 2025-11-01
WO-001-001    | WO-001          | Cutting        | M-00-001      | LOT-M-00-001-002  | 50.00 | 2025-11-15
WO-001-002    | WO-001          | Welding        | M-00-002      | LOT-M-00-002-001  | 20.00 | 2025-10-15
```

---

## 📋 MIGRATION FILES (Complete List)

### New Migrations Needed

**022-030: Core 19-table structure (as designed)**
- 022: Polymorphic entity_relations
- 023: Production plan nodes
- 024: Modify production_plans (remove JSONB)
- 025: PostgreSQL sequences
- 026: LISTEN/NOTIFY triggers
- 027: Material summary tables
- 028: Add FIFO fields to assignments
- 029: Create assignment_material_reservations
- 030: Update stock_movements (partial reservation)

**031: Lot Tracking Enhancement (NEW)**
```javascript
/**
 * Migration 031: Add lot tracking to inventory system
 * Enhances stock_movements and order_items with lot/batch tracking
 */

export async function up(knex) {
  // 1. Add lot fields to stock_movements
  await knex.schema.withSchema('materials').table('stock_movements', (table) => {
    table.string('lot_number', 100);
    table.date('lot_date');
    table.string('supplier_lot_code', 100);
    table.date('manufacturing_date');
    table.date('expiry_date');
    table.decimal('requested_quantity', 15, 3);
    table.boolean('partial_reservation').defaultTo(false);
    table.text('warning');
    table.string('assignment_id', 100);
    
    // Indexes
    table.index('lot_number');
    table.index(['material_code', 'lot_number']);
    table.index(['material_code', 'lot_date', 'type']);
    table.index('expiry_date');
    table.index('assignment_id');
    
    // FK to assignments
    table.foreign('assignment_id')
      .references('id')
      .inTable('mes_worker_assignments')
      .onDelete('SET NULL');
  });
  
  // 2. Add lot fields to order_items
  await knex.schema.withSchema('materials').table('order_items', (table) => {
    table.string('lot_number', 100);
    table.string('supplier_lot_code', 100);
    table.date('manufacturing_date');
    table.date('expiry_date');
    
    table.index('lot_number');
  });
  
  // 3. Add lot summary to materials (optional)
  await knex.schema.withSchema('materials').table('materials', (table) => {
    table.integer('active_lot_count').defaultTo(0);
    table.date('oldest_lot_date');
    table.date('nearest_expiry_date');
  });
  
  // 4. Add lot_number to assignment_material_reservations
  await knex.schema.table('mes_assignment_material_reservations', (table) => {
    table.string('lot_number', 100);
    table.index(['assignment_id', 'lot_number']);
  });
  
  // 5. Create trigger for lot summary updates
  await knex.raw(`
    CREATE OR REPLACE FUNCTION materials.update_material_lot_summary()
    RETURNS TRIGGER AS $$
    BEGIN
      UPDATE materials.materials m
      SET 
        active_lot_count = (
          SELECT COUNT(DISTINCT lot_number)
          FROM materials.stock_movements
          WHERE material_code = NEW.material_code AND type = 'in' AND lot_number IS NOT NULL
        ),
        oldest_lot_date = (
          SELECT MIN(lot_date)
          FROM materials.stock_movements
          WHERE material_code = NEW.material_code AND type = 'in' AND lot_number IS NOT NULL
        ),
        nearest_expiry_date = (
          SELECT MIN(expiry_date)
          FROM materials.stock_movements
          WHERE material_code = NEW.material_code AND expiry_date IS NOT NULL AND expiry_date > CURRENT_DATE
        )
      WHERE code = NEW.material_code;
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    
    CREATE TRIGGER trg_update_lot_summary
    AFTER INSERT OR UPDATE ON materials.stock_movements
    FOR EACH ROW
    WHEN (NEW.type = 'in' AND NEW.lot_number IS NOT NULL)
    EXECUTE FUNCTION materials.update_material_lot_summary();
  `);
  
  console.log('✅ Migration 031: Added lot tracking to inventory system');
}

export async function down(knex) {
  await knex.raw('DROP TRIGGER IF EXISTS trg_update_lot_summary ON materials.stock_movements');
  await knex.raw('DROP FUNCTION IF EXISTS materials.update_material_lot_summary()');
  
  await knex.schema.table('mes_assignment_material_reservations', (table) => {
    table.dropColumn('lot_number');
  });
  
  await knex.schema.withSchema('materials').table('materials', (table) => {
    table.dropColumn('active_lot_count');
    table.dropColumn('oldest_lot_date');
    table.dropColumn('nearest_expiry_date');
  });
  
  await knex.schema.withSchema('materials').table('order_items', (table) => {
    table.dropColumn('lot_number');
    table.dropColumn('supplier_lot_code');
    table.dropColumn('manufacturing_date');
    table.dropColumn('expiry_date');
  });
  
  await knex.schema.withSchema('materials').table('stock_movements', (table) => {
    table.dropForeign('assignment_id');
    table.dropColumn('lot_number');
    table.dropColumn('lot_date');
    table.dropColumn('supplier_lot_code');
    table.dropColumn('manufacturing_date');
    table.dropColumn('expiry_date');
    table.dropColumn('requested_quantity');
    table.dropColumn('partial_reservation');
    table.dropColumn('warning');
    table.dropColumn('assignment_id');
  });
  
  console.log('✅ Migration 031 rolled back: Removed lot tracking');
}
```

---

## 🎯 UI/UX CHANGES

### 1. Order Delivery Screen

**Add lot input fields:**
```html
<div class="delivery-form">
  <h3>Sipariş Teslim Alma</h3>
  
  <!-- Existing fields -->
  <input name="quantity" type="number" required />
  
  <!-- NEW: Lot information -->
  <div class="lot-info-section">
    <h4>Lot Bilgileri</h4>
    
    <input 
      name="supplierLotCode" 
      placeholder="Tedarikçi Lot Kodu (opsiyonel)"
      maxlength="100"
    />
    
    <input 
      name="manufacturingDate" 
      type="date"
      label="Üretim Tarihi"
    />
    
    <input 
      name="expiryDate" 
      type="date"
      label="Son Kullanma Tarihi (opsiyonel)"
    />
    
    <div class="info-box">
      ℹ️ Lot numarası otomatik oluşturulacaktır
    </div>
  </div>
  
  <!-- After submit, show generated lot -->
  <div class="success-message" style="display:none">
    ✅ Teslimat kaydedildi
    <br/>
    <strong>Oluşturulan Lot:</strong> <span id="generatedLot"></span>
  </div>
</div>
```

### 2. Stock Check Screen

**Show lot-level inventory:**
```javascript
// Lot-level inventory table
<table class="lot-inventory-table">
  <thead>
    <tr>
      <th>Malzeme</th>
      <th>Lot Numarası</th>
      <th>Lot Tarihi</th>
      <th>Miktar</th>
      <th>Son Kullanma</th>
      <th>Durum</th>
      <th>FIFO Sırası</th>
    </tr>
  </thead>
  <tbody>
    {lots.map(lot => (
      <tr class={lot.status}>
        <td>{lot.materialName}</td>
        <td>{lot.lotNumber}</td>
        <td>{formatDate(lot.lotDate)}</td>
        <td>{lot.balance} {lot.unit}</td>
        <td>{lot.expiryDate || 'N/A'}</td>
        <td>
          <span class={`badge ${lot.status}`}>
            {lot.status === 'active' ? '✅ Aktif' : 
             lot.status === 'expiring_soon' ? '⚠️ Yakında Dolacak' : 
             '❌ Süresi Dolmuş'}
          </span>
        </td>
        <td>#{lot.fifoOrder}</td>
      </tr>
    ))}
  </tbody>
</table>
```

### 3. Production Start (Worker Portal)

**Show which lots will be consumed:**
```javascript
// Before starting task, show lot consumption plan
<div class="material-reservation-preview">
  <h4>Tüketilecek Malzemeler</h4>
  
  {materials.map(mat => (
    <div class="material-item">
      <strong>{mat.materialName}</strong>
      <div class="lot-consumption">
        {mat.lots.map(lot => (
          <div class="lot-line">
            📦 {lot.lotNumber} 
            <span class="lot-date">({formatDate(lot.lotDate)})</span>
            → {lot.consumeQty} {mat.unit}
          </div>
        ))}
      </div>
    </div>
  ))}
  
  <button onclick="startTaskWithLots()">Başlat</button>
</div>
```

---

## 📊 PERFORMANCE CONSIDERATIONS

### Index Strategy

**Critical indexes for lot queries:**
```sql
-- FIFO consumption (most important!)
CREATE INDEX idx_stock_fifo_lots 
ON materials.stock_movements(material_code, lot_date, type)
WHERE type = 'in' AND lot_number IS NOT NULL;

-- Lot balance calculation
CREATE INDEX idx_stock_lot_balance
ON materials.stock_movements(material_code, lot_number, type);

-- Expiry alerts
CREATE INDEX idx_stock_expiry
ON materials.stock_movements(expiry_date)
WHERE expiry_date IS NOT NULL AND expiry_date > CURRENT_DATE;

-- Assignment traceability
CREATE INDEX idx_stock_assignment
ON materials.stock_movements(assignment_id)
WHERE assignment_id IS NOT NULL;
```

### Query Optimization

**Use materialized view for lot balances:**
```sql
CREATE MATERIALIZED VIEW materials.lot_balances AS
SELECT 
  material_code,
  lot_number,
  lot_date,
  MAX(expiry_date) as expiry_date,
  SUM(CASE WHEN type = 'in' THEN quantity ELSE -quantity END) as balance,
  MAX(supplier_lot_code) as supplier_lot_code
FROM materials.stock_movements
WHERE lot_number IS NOT NULL
GROUP BY material_code, lot_number, lot_date
HAVING SUM(CASE WHEN type = 'in' THEN quantity ELSE -quantity END) > 0;

CREATE UNIQUE INDEX idx_lot_balances_pk ON materials.lot_balances(material_code, lot_number);
CREATE INDEX idx_lot_balances_fifo ON materials.lot_balances(material_code, lot_date);

-- Refresh periodically or on trigger
CREATE OR REPLACE FUNCTION refresh_lot_balances()
RETURNS TRIGGER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY materials.lot_balances;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_refresh_lot_balances
AFTER INSERT OR UPDATE OR DELETE ON materials.stock_movements
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_lot_balances();
```

---

## ✅ FINAL SUMMARY: PHASE 1+2

### What Changes?

**Database (2 tables enhanced):**
- ✅ `stock_movements` + 9 lot fields
- ✅ `order_items` + 4 lot fields  
- ✅ `materials` + 3 lot summary fields (optional)
- ✅ `assignment_material_reservations` + 1 lot field

**Backend (3 workflows):**
- ✅ Order delivery → Lot creation
- ✅ Production start → FIFO lot consumption
- ✅ Stock check → Lot-level inventory

**Frontend (3 screens):**
- ✅ Order delivery form → Lot input
- ✅ Stock check → Lot inventory table
- ✅ Worker portal → Lot consumption preview

### What Stays Same?

- ✅ 19-table structure (no new tables)
- ✅ MES FIFO scheduling (unchanged)
- ✅ Material aggregates (stock, reserved, wip_reserved)
- ✅ All existing queries (lot fields nullable)

### Implementation Effort

**Total: 3-4 weeks**

| Task | Time | Complexity |
|------|------|------------|
| Migration 031 (lot fields) | 1 day | Low |
| Backend lot generation | 2 days | Medium |
| Backend FIFO consumption | 3 days | High |
| Order delivery UI | 2 days | Low |
| Stock check UI | 2 days | Medium |
| Worker portal preview | 1 day | Low |
| Testing | 1 week | High |
| Documentation | 2 days | Low |

---

## 🚀 READY TO IMPLEMENT?

Evet dersen şimdi migration dosyalarını oluşturalım! 🎯
