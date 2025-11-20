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
