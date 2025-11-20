# 🏭 MES COMPLETE MIGRATION GUIDE - Firebase to PostgreSQL
## Kapsamlı SQL Geçiş Kılavuzu (19-Table Optimized Architecture + Lot Tracking)

**Tarih:** 20 Kasım 2025  
**Durum:** ✅ Migrations 022-045 COMPLETE | ✅ 27/60 API Endpoints Migrated | ⏳ Step 8 Ready  
**Hedef:** Firebase MES → PostgreSQL 19-table optimized architecture with lot tracking

**Latest Migrations:**
- ✅ Migration 039: node_stations table
- ✅ Migration 043: worker_assignments enhancements (timing + sequence)
- ✅ Migration 044: node_predecessors table (parallel execution)
- ✅ Migration 045: worker_assignments INTEGER FK fix

**API Migration Progress:**
- ✅ Phase 1: Master Data (19 endpoints) - COMPLETE
- 🔄 Phase 2: Production Core (13/25 endpoints) - IN PROGRESS
- ⏳ Phase 3: Supporting Features (12 endpoints) - PENDING

---

## 📊 MEVCUT DURUM ANALİZİ

### ✅ TAMAMLANAN İŞLER (Migrations 022-031)

**Database Infrastructure: %100 TAMAMLANDI**

| Component | Status | Migration | Tablo Sayısı |
|-----------|--------|-----------|--------------|
| Junction Tables | ✅ Created | 022 | +6 tables |
| Production Plan Nodes | ✅ Created | 023 | +5 tables |
| JSONB Removal | ✅ Complete | 024 | 0 (modified) |
| PostgreSQL Sequences | ✅ Created | 025 | 0 (functions) |
| Real-time Triggers | ✅ Created | 026 | 0 (triggers) |
| Material Summary | ✅ Created | 027 | +2 tables |
| FIFO Fields | ✅ Added | 028 | 0 (modified) |
| Material Reservations | ✅ Created | 029 | +1 table |
| Partial Reservations | ✅ Added | 030 | 0 (modified) |
| Lot Tracking | ✅ Complete | 031 | 0 (modified) |
| Node Stations | ✅ Complete | 039 | +1 table |
| Worker Assignments Enhanced | ✅ Complete | 043 | 0 (modified) |
| Node Predecessors | ✅ Complete | 044 | +1 table |
| Integer FK Fix | ✅ Complete | 045 | 0 (modified) |

**Toplam:** 16 yeni tablo oluşturuldu, 8 tablo modifiye edildi

**API Endpoints Migrated:** 27/60 (45%) ✅
- ✅ Operations, Workers, Stations, Skills, Substations (19 endpoints)
- ✅ Work Orders, Production Plans with Enhanced Launch (8 endpoints)
- ⏳ Worker Assignments (Next - 4 endpoints)

---

### ⏳ KALAN İŞLER (Migrations 032-035 + Backend)

**Database Optimization: %25 KALDI**

| Component | Status | Estimated Time |
|-----------|--------|----------------|
| Polymorphic Relations | ⏳ Pending | 4-6 saat |
| Data Migration | ⏳ Pending | 2-3 saat |
| Junction Tables Cleanup | ⏳ Pending | 1 saat |
| Index Optimization | ⏳ Pending | 2 saat |

**Backend Implementation: %0 BAŞLANMADI**

| Component | Status | Estimated Time |
|-----------|--------|----------------|
| API Endpoint Updates | ⏳ Pending | 2-3 gün |
| FIFO Logic Implementation | ⏳ Pending | 2 gün |
| Lot Consumption Logic | ⏳ Pending | 1 gün |
| Real-time SSE | ⏳ Pending | 1 gün |
| Frontend Integration | ⏳ Pending | 3-4 gün |

**Toplam Kalan Süre:** 2-3 hafta

---

## 🎯 FİNAL ARCHİTECTURE: 19 TABLES

### Current State (After Migration 031)

**✅ Mevcut Tablolar (25 tablo):**
```
MES Core (11 tables):
├─ mes_workers
├─ mes_stations
├─ mes_substations
├─ mes_operations
├─ mes_production_plans
├─ mes_work_orders
├─ mes_worker_assignments (+ FIFO fields)
├─ mes_approved_quotes
├─ mes_alerts
├─ mes_settings
└─ mes_counters

Junction Tables (6 tables - TO BE REPLACED):
├─ mes_worker_stations
├─ mes_worker_operations
├─ mes_station_operations
├─ mes_node_stations
├─ mes_node_substations
└─ mes_node_predecessors

Node Extraction (5 tables):
├─ mes_production_plan_nodes
├─ mes_node_material_inputs
├─ mes_plan_material_requirements
├─ mes_plan_wip_outputs
└─ mes_assignment_material_reservations

Materials (2 tables - ENHANCED):
├─ materials.materials (+ lot summary fields)
└─ materials.stock_movements (+ lot tracking + partial reservation)
```

### Target State (After Migration 035)

**🎯 Final Tablolar (19 tablo):**
```
MES Core (11 tables): Aynı kalır
├─ mes_workers
├─ mes_stations
├─ mes_substations
├─ mes_operations
├─ mes_production_plans
├─ mes_work_orders
├─ mes_worker_assignments
├─ mes_approved_quotes
├─ mes_alerts
├─ mes_settings
└─ mes_counters

Polymorphic (1 table - CONSOLIDATES 6 TABLES):
└─ mes_entity_relations ← worker_stations, worker_operations, station_operations,
                          node_stations, node_substations, node_predecessors

Node Tables (4 tables):
├─ mes_production_plan_nodes
├─ mes_node_material_inputs
├─ mes_plan_material_requirements
└─ mes_plan_wip_outputs

Supporting (3 tables):
├─ mes_assignment_material_reservations
├─ materials.materials (+ lot fields)
└─ materials.stock_movements (+ lot fields)
```

**Kazanç:** 25 → 19 tablo (6 tablo azaltma, %24 optimization)

---

## 🚀 IMPLEMENTATION ROADMAP - COMPLETE STEPS

### ✅ PHASE 1-3: COMPLETED (Migrations 022-031)

Bu fazlar tamamlandı. Detaylar için ilgili migration dosyalarına bakın.

---

### 🔄 PHASE 4: POLYMORPHIC CONSOLIDATION (Migrations 032-035)

**Hedef:** 6 junction table'ı tek polymorphic table'a dönüştürmek

---

## 📋 STEP-BY-STEP IMPLEMENTATION GUIDE

### STEP 1: Create Polymorphic Entity Relations Table (Migration 032)

**Amaç:** 6 junction table'ın yerine geçecek polymorphic table oluşturmak

**Copilot'a Verilecek Prompt:**

```
Migration 032 oluştur: mes_entity_relations polymorphic table

Dosya: quote-portal/db/migrations/032_create_polymorphic_entity_relations.js

Tablo yapısı:

CREATE TABLE mes_entity_relations (
  id SERIAL PRIMARY KEY,
  
  -- Source entity (hangi entity'den)
  source_type VARCHAR(50) NOT NULL,
  source_id VARCHAR(100) NOT NULL,
  
  -- Target entity (hangi entity'ye)
  relation_type VARCHAR(50) NOT NULL,
  target_id VARCHAR(100) NOT NULL,
  
  -- Metadata (ilişkiye özel veriler)
  priority INTEGER,              -- Station assignments için (1=primary, 2=fallback)
  quantity DECIMAL(10, 2),       -- Material inputs için
  unit_ratio DECIMAL(10, 4),     -- Material calculations için
  is_derived BOOLEAN,            -- WIP materials için
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(source_type, source_id, relation_type, target_id)
);

CHECK Constraints ekle:
- source_type IN ('worker', 'station', 'node')
- relation_type IN ('station', 'operation', 'substation', 'material', 'predecessor')

Indexes:
- idx_source: (source_type, source_id)
- idx_target: (relation_type, target_id)
- idx_composite: (source_type, source_id, relation_type)
- Partial indexes:
  * idx_worker_stations: WHERE source_type='worker' AND relation_type='station'
  * idx_worker_operations: WHERE source_type='worker' AND relation_type='operation'
  * idx_node_stations: WHERE source_type='node' AND relation_type='station'

Knex.js syntax kullan. Up ve down fonksiyonlarını ekle.
```

**Beklenen Sonuç:**
- ✅ mes_entity_relations tablosu oluşturuldu
- ✅ 3 ana index + 3 partial index eklendi
- ✅ CHECK constraints eklendi
- ✅ UNIQUE constraint eklendi

**Verification:**
```bash
# Migration'ı çalıştır
cd quote-portal
npx knex migrate:up 032_create_polymorphic_entity_relations.js

# Tabloyu kontrol et
psql -d burkol_dev -c "\d mes_entity_relations"

# Index'leri kontrol et
psql -d burkol_dev -c "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'mes_entity_relations';"
```

---

### STEP 2: Migrate Data to Polymorphic Table (Migration 033)

**Amaç:** 6 junction table'daki tüm veriyi mes_entity_relations'a kopyalamak

**Copilot'a Verilecek Prompt:**

```
Migration 033 oluştur: Data migration to polymorphic entity_relations

Dosya: quote-portal/db/migrations/033_migrate_to_polymorphic_relations.js

Yapılacaklar:

1. mes_worker_stations → mes_entity_relations
   - source_type: 'worker'
   - relation_type: 'station'
   - source_id: worker_id
   - target_id: station_id
   - created_at: assigned_at

2. mes_worker_operations → mes_entity_relations
   - source_type: 'worker'
   - relation_type: 'operation'
   - source_id: worker_id
   - target_id: operation_id
   - created_at: qualified_at

3. mes_station_operations → mes_entity_relations
   - source_type: 'station'
   - relation_type: 'operation'
   - source_id: station_id
   - target_id: operation_id

4. mes_node_stations → mes_entity_relations
   - source_type: 'node'
   - relation_type: 'station'
   - source_id: node_id (mes_production_plan_nodes.id)
   - target_id: station_id
   - priority: priority (önemli!)

5. mes_node_substations → mes_entity_relations
   - source_type: 'node'
   - relation_type: 'substation'
   - source_id: node_id (mes_production_plan_nodes.id)
   - target_id: substation_id

6. mes_node_predecessors → mes_entity_relations
   - source_type: 'node'
   - relation_type: 'predecessor'
   - source_id: node_id
   - target_id: predecessor_node_id

Verification queries ekle:
- Her eski tablodaki kayıt sayısı = yeni tablodaki ilgili kayıt sayısı
- UNIQUE constraint ihlali olmamalı
- NULL değer olmamalı

Transaction kullan: Tüm migration bir transaction içinde olmalı.
Hata durumunda rollback yapılmalı.

Down fonksiyonu: Veriyi geri mes_entity_relations'dan silmeli (ama eski tabloları restore etmemeli)
```

**Beklenen Sonuç:**
- ✅ 6 junction table'dan tüm veri kopyalandı
- ✅ Veri sayıları eşleşiyor
- ✅ UNIQUE constraint ihlali yok
- ✅ Transaction başarılı

**Verification:**
```sql
-- Veri sayılarını kontrol et
SELECT 
  'mes_worker_stations' as source,
  COUNT(*) as old_count,
  (SELECT COUNT(*) FROM mes_entity_relations 
   WHERE source_type='worker' AND relation_type='station') as new_count;

SELECT 
  'mes_worker_operations' as source,
  COUNT(*) as old_count,
  (SELECT COUNT(*) FROM mes_entity_relations 
   WHERE source_type='worker' AND relation_type='operation') as new_count;

-- ... diğer tablolar için de benzer

-- Toplam kontrol
SELECT 
  COUNT(*) as total_old
FROM (
  SELECT id FROM mes_worker_stations
  UNION ALL SELECT id FROM mes_worker_operations
  UNION ALL SELECT id FROM mes_station_operations
  UNION ALL SELECT id FROM mes_node_stations
  UNION ALL SELECT id FROM mes_node_substations
  UNION ALL SELECT id FROM mes_node_predecessors
) old;

SELECT COUNT(*) as total_new FROM mes_entity_relations;
```

---

### STEP 3: Update Application Queries (Backend)

**Amaç:** Eski junction table query'lerini polymorphic table query'lerine dönüştürmek

**Copilot'a Verilecek Prompt:**

```
Backend query'leri güncelle: Junction tables → mes_entity_relations

Dosyalar:
- quote-portal/server/mesRoutes.js
- quote-portal/server/workersRoutes.js (varsa)
- quote-portal/server/productionRoutes.js (varsa)

ESKİ QUERY PATTERN:
-- Worker'ın assigned stations'larını getir
SELECT s.*
FROM mes_worker_stations ws
JOIN mes_stations s ON s.id = ws.station_id
WHERE ws.worker_id = $1;

YENİ QUERY PATTERN:
-- Worker'ın assigned stations'larını getir
SELECT s.*
FROM mes_entity_relations er
JOIN mes_stations s ON s.id = er.target_id
WHERE er.source_type = 'worker'
  AND er.source_id = $1
  AND er.relation_type = 'station';

Tüm junction table kullanımlarını bul ve polymorphic query'ye çevir:

1. mes_worker_stations kullanımları
2. mes_worker_operations kullanımları
3. mes_station_operations kullanımları
4. mes_node_stations kullanımları (priority field'ı kullan!)
5. mes_node_substations kullanımları
6. mes_node_predecessors kullanımları

Her değişiklik için:
- Eski kodu comment out et
- Yeni kodu ekle
- Console.log ile verify et
- Test et

Performance: Partial index'ler kullanıldığından performans aynı veya daha iyi olmalı.
```

**Beklenen Sonuç:**
- ✅ Tüm junction table query'leri güncellendi
- ✅ API endpoint'ler çalışıyor
- ✅ Performans düştü mü kontrol edildi
- ✅ Test passed

**Verification:**
```bash
# API endpoint'leri test et
curl http://localhost:3000/api/mes/workers/WORKER-001/stations
curl http://localhost:3000/api/mes/workers/WORKER-001/operations
curl http://localhost:3000/api/mes/production-plans/PLAN-001/nodes
```

---

### STEP 4: Drop Old Junction Tables (Migration 034)

**Amaç:** Artık kullanılmayan 6 junction table'ı silmek

**ÖNEMLİ:** Bu migration'dan önce backend güncellemeleri MUTLAKA tamamlanmalı!

**Copilot'a Verilecek Prompt:**

```
Migration 034 oluştur: Drop old junction tables

Dosya: quote-portal/db/migrations/034_drop_old_junction_tables.js

UYARI: Bu migration'ı çalıştırmadan önce:
1. Backend tüm query'leri mes_entity_relations kullanıyor olmalı
2. API endpoint'ler test edilmeli
3. Veri backup alınmalı

Silinecek tablolar (sırayla):
1. mes_node_predecessors (FK yok)
2. mes_node_substations (FK var: mes_production_plan_nodes, mes_substations)
3. mes_node_stations (FK var: mes_production_plan_nodes, mes_stations)
4. mes_worker_operations (FK var: mes_workers, mes_operations)
5. mes_station_operations (FK var: mes_stations, mes_operations)
6. mes_worker_stations (FK var: mes_workers, mes_stations)

Down fonksiyonu:
Tabloları geri oluştur (ama veriyi geri yükleme - o Migration 033'te)

Comments ekle:
- Her tablonun ne zaman silindi
- Polymorphic table'da hangi query pattern karşılığı
```

**Beklenen Sonuç:**
- ✅ 6 junction table silindi
- ✅ FK constraints temizlendi
- ✅ Database size küçüldü
- ✅ Rollback fonksiyonu çalışıyor

**Verification:**
```bash
# Migration'ı çalıştır (DİKKATLİ!)
npx knex migrate:up 034_drop_old_junction_tables.js

# Tabloların silindiğini kontrol et
psql -d burkol_dev -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'mes_%';"

# API'lerin hala çalıştığını test et
npm test
```

---

### STEP 5: Optimize Indexes and Performance (Migration 035)

**Amaç:** Polymorphic query'ler için index optimizasyonu

**Copilot'a Verilecek Prompt:**

```
Migration 035 oluştur: Index optimization for polymorphic relations

Dosya: quote-portal/db/migrations/035_optimize_polymorphic_indexes.js

Eklenecek partial indexes (query pattern'lere göre):

1. Worker → Stations (en çok kullanılan)
   CREATE INDEX idx_worker_stations_fast 
   ON mes_entity_relations(source_id, target_id)
   WHERE source_type='worker' AND relation_type='station';

2. Worker → Operations
   CREATE INDEX idx_worker_operations_fast
   ON mes_entity_relations(source_id, target_id)
   WHERE source_type='worker' AND relation_type='operation';

3. Node → Stations (priority field önemli!)
   CREATE INDEX idx_node_stations_priority
   ON mes_entity_relations(source_id, target_id, priority)
   WHERE source_type='node' AND relation_type='station';

4. Node → Predecessors (dependency graph için)
   CREATE INDEX idx_node_predecessors_graph
   ON mes_entity_relations(source_id, target_id)
   WHERE source_type='node' AND relation_type='predecessor';

5. Station → Operations
   CREATE INDEX idx_station_operations_fast
   ON mes_entity_relations(source_id, target_id)
   WHERE source_type='station' AND relation_type='operation';

Analyze index kullanımı:
EXPLAIN ANALYZE query'leri ekle (comment olarak)

Statistics güncelle:
ANALYZE mes_entity_relations;
```

**Beklenen Sonuç:**
- ✅ 5 partial index eklendi
- ✅ Query performance ölçüldü
- ✅ Index-only scan kullanıyor
- ✅ EXPLAIN ANALYZE < 5ms

**Verification:**
```sql
-- Index kullanımını kontrol et
EXPLAIN ANALYZE
SELECT s.*
FROM mes_entity_relations er
JOIN mes_stations s ON s.id = er.target_id
WHERE er.source_type = 'worker'
  AND er.source_id = 'WORKER-001'
  AND er.relation_type = 'station';

-- Index-only scan olmalı, < 5ms
```

---

## 🔧 BACKEND IMPLEMENTATION STEPS

### STEP 6: Implement FIFO Task Scheduling

**Amaç:** Worker portal için FIFO task queue implement etmek

**Copilot'a Verilecek Prompt:**

```
FIFO task scheduling backend implementation

Dosya: quote-portal/server/utils/fifoScheduler.js

Fonksiyon: getWorkerNextTask(workerId)

Query:
SELECT 
  a.*,
  p.work_order_code,
  n.name as node_name,
  n.operation_id
FROM mes_worker_assignments a
JOIN mes_production_plans p ON p.id = a.plan_id
JOIN mes_production_plan_nodes n ON n.id = a.node_id
WHERE a.worker_id = $1
  AND a.status IN ('pending', 'ready')
  AND a.scheduling_mode = 'fifo'
ORDER BY 
  a.is_urgent DESC,           -- Urgent first
  a.expected_start ASC,        -- FIFO order (oldest first)
  a.created_at ASC
LIMIT 1;

Index kullanımı:
- idx_fifo_queue (Migration 028'de oluşturuldu)
- WHERE clause partial index ile match ediyor

Response format:
{
  assignmentId: 'WO-001-001',
  workOrderCode: 'WO-001',
  nodeName: 'Kesim İşlemi',
  operationId: 'OP-001',
  expectedStart: '2025-11-20T10:00:00Z',
  nominalTime: 60,
  effectiveTime: 70,
  isUrgent: false
}

Edge cases:
- Worker'ın hiç task'ı yoksa → null döndür
- Tüm task'lar completed → null döndür
- Urgent task varsa → önce onu döndür
```

**Beklenen Sonuç:**
- ✅ getWorkerNextTask() fonksiyonu çalışıyor
- ✅ FIFO sıralaması doğru
- ✅ Urgent task'lar önce geliyor
- ✅ Query < 5ms

---

### STEP 7: Implement Lot-Based Material Consumption

**Amaç:** Production task start için FIFO lot consumption

**Copilot'a Verilecek Prompt:**

```
Lot-based material consumption backend

Dosya: quote-portal/server/utils/lotConsumption.js
(Bu dosya zaten var - Migration 031'de oluşturuldu)

Güncellemeler:

1. reserveMaterialsWithLotTracking() fonksiyonunu MES ile entegre et:
   - Input: assignmentId, materialRequirements
   - Output: { success, lotsConsumed, warnings }

2. FIFO lot query'sini optimize et:
   WITH available_lots AS (
     SELECT 
       lot_number,
       lot_date,
       SUM(CASE WHEN type='in' THEN quantity ELSE -quantity END) as lot_balance
     FROM materials.stock_movements
     WHERE material_code = $1
       AND lot_number IS NOT NULL
     GROUP BY lot_number, lot_date
     HAVING SUM(...) > 0
     ORDER BY lot_date ASC, created_at ASC  -- FIFO!
   )

3. Assignment'a lot bilgisi kaydet:
   - mes_assignment_material_reservations tablosuna lot_number ekle
   - stock_movements'a assignment_id ekle

4. Transaction isolation:
   - SERIALIZABLE isolation level kullan
   - Concurrent consumption'da race condition olmasın
```

**Beklenen Sonuç:**
- ✅ FIFO lot consumption çalışıyor
- ✅ Assignment'a lot link edildi
- ✅ Transaction atomic
- ✅ Partial reservation uyarıları çalışıyor

---

### STEP 8: Implement Real-time SSE Endpoints

**Amaç:** LISTEN/NOTIFY trigger'larını SSE ile frontend'e iletmek

**Copilot'a Verilecek Prompt:**

```
Real-time SSE endpoints implementation

Dosya: quote-portal/server/mesRoutes.js

Endpoint 1: GET /api/mes/stream/assignments
- PostgreSQL LISTEN 'mes_assignment_updates'
- SSE ile frontend'e stream et
- Format: data: {"operation": "UPDATE", "assignmentId": "...", "status": "..."}

Endpoint 2: GET /api/mes/stream/plans
- PostgreSQL LISTEN 'mes_plan_updates'
- SSE stream

Endpoint 3: GET /api/mes/stream/workers
- PostgreSQL LISTEN 'mes_worker_updates'
- SSE stream

Pattern:
router.get('/stream/assignments', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const pgClient = new Client(dbConfig);
  await pgClient.connect();
  await pgClient.query('LISTEN mes_assignment_updates');
  
  pgClient.on('notification', (msg) => {
    res.write(`data: ${msg.payload}\n\n`);
  });
  
  req.on('close', () => {
    pgClient.query('UNLISTEN mes_assignment_updates');
    pgClient.end();
  });
});

Error handling:
- Connection lost → auto reconnect
- Client disconnect → cleanup
```

**Beklenen Sonuç:**
- ✅ 3 SSE endpoint çalışıyor
- ✅ LISTEN/NOTIFY aktif
- ✅ Frontend real-time update alıyor
- ✅ Connection management doğru

---

## 🎨 FRONTEND INTEGRATION STEPS

### STEP 9: Worker Portal - FIFO Task List

**Amaç:** Worker portal'da FIFO sıralı task listesi göstermek

**Copilot'a Verilecek Prompt:**

```
Worker portal FIFO task list UI

Dosya: quote-portal/pages/worker-portal.html

Component: Task Queue List

API Call:
GET /api/mes/workers/{workerId}/tasks/queue
Response: [
  {
    assignmentId: 'WO-001-001',
    workOrderCode: 'WO-001',
    nodeName: 'Kesim İşlemi',
    expectedStart: '2025-11-20T10:00:00Z',
    nominalTime: 60,
    isUrgent: false,
    fifoPosition: 1  // Queue'daki sırası
  },
  ...
]

UI Elements:
1. Task card per assignment
2. FIFO position badge (#1, #2, #3...)
3. Urgent flag (kırmızı badge)
4. Expected start time
5. "Başlat" button (sadece #1 için aktif)

Real-time update:
EventSource('/api/mes/stream/assignments') ile dinle
Yeni task gelince → list'i güncelle
Task tamamlanınca → list'ten kaldır

FIFO indicator:
- #1: Yeşil border, "ŞİMDİ BAŞLAT" button
- #2-5: Gri border, disabled button
- Urgent: Kırmızı border, star icon
```

**Beklenen Sonuç:**
- ✅ Task list FIFO sırasında
- ✅ Real-time update çalışıyor
- ✅ Urgent task'lar öne çıkıyor
- ✅ UI responsive

---

### STEP 10: Production Planning - Polymorphic Relations UI

**Amaç:** Production plan oluştururken polymorphic relations kullanmak

**Copilot'a Verilecek Prompt:**

```
Production planning UI - polymorphic relations

Dosya: quote-portal/pages/production-planning.html

Değişiklikler:

1. Node → Station Assignment (polymorphic query)
   ESKİ: GET /api/mes/nodes/{nodeId}/stations
   YENİ: GET /api/mes/entity-relations?source=node&sourceId={nodeId}&type=station

   Response kullan:
   {
     relations: [
       {
         targetId: 'ST-001',
         targetName: 'Kesim İstasyonu',
         priority: 1  // Polymorphic'ten geliyor!
       }
     ]
   }

2. Worker → Station Assignment
   Dropdown populate ederken polymorphic query kullan

3. Station → Operation mapping
   Operation seçerken polymorphic relations'dan çek

UI Pattern:
- Primary station: Yeşil badge (priority=1)
- Fallback stations: Gri badge (priority=2+)
- Drag-drop ile priority değiştirme
```

**Beklenen Sonuç:**
- ✅ Polymorphic query'ler kullanılıyor
- ✅ Priority field doğru gösteriliyor
- ✅ Assignment UI çalışıyor
- ✅ Backend ile sync

---

### STEP 11: Material Reservation - Lot Preview

**Amaç:** Task start öncesi lot consumption preview göstermek

**Copilot'a Verilecek Prompt:**

```
Material reservation lot preview UI

Dosya: quote-portal/domains/workerPortal/components/TaskStartModal.jsx

Component: LotConsumptionPreview

API Call:
GET /api/mes/assignments/{assignmentId}/lot-preview

Response:
{
  materials: [
    {
      materialCode: 'M-00-001',
      materialName: 'Çelik Sac',
      requiredQty: 100,
      lotsToConsume: [
        {
          lotNumber: 'LOT-M-00-001-001',
          lotDate: '2025-11-01',
          lotBalance: 150,
          consumeQty: 50  // Bu lot'tan 50 kg alınacak
        },
        {
          lotNumber: 'LOT-M-00-001-002',
          lotDate: '2025-11-15',
          lotBalance: 200,
          consumeQty: 50  // Bu lot'tan 50 kg alınacak
        }
      ],
      sufficientStock: true
    }
  ],
  warnings: []
}

UI:
- Material başına card
- Lot listesi (FIFO sırasında, oldest first)
- Lot date göster
- Consume quantity göster
- Warning varsa → kırmızı alert box
- "Başlat" button → lot consumption confirm et

Preview → Start flow:
1. Modal aç → Lot preview göster
2. Kullanıcı confirm → POST /api/mes/assignments/{id}/start
3. Backend lot consumption yap (FIFO)
4. Success → Modal kapat, task status update
```

**Beklenen Sonuç:**
- ✅ Lot preview doğru gösteriliyor
- ✅ FIFO sıralaması görünüyor
- ✅ Warning'ler gösteriliyor
- ✅ Start flow çalışıyor

---

## ✅ FINAL CHECKLIST - COMPLETION CRITERIA

### Database (Migrations 032-035)

- [ ] Migration 032: mes_entity_relations created
- [ ] Migration 033: Data migrated to polymorphic table
- [ ] Migration 034: Old junction tables dropped
- [ ] Migration 035: Indexes optimized
- [ ] All migrations run without errors
- [ ] Database size reduced by 6 tables
- [ ] EXPLAIN ANALYZE shows index usage

### Backend (Steps 6-8)

- [ ] FIFO task scheduling implemented
- [ ] Lot-based material consumption working
- [ ] Real-time SSE endpoints active
- [ ] All API endpoints using polymorphic queries
- [ ] Transaction handling correct
- [ ] Error handling comprehensive
- [ ] Logging adequate

### Frontend (Steps 9-11)

- [ ] Worker portal FIFO list working
- [ ] Production planning using polymorphic relations
- [ ] Lot preview modal functional
- [ ] Real-time updates working
- [ ] UI responsive
- [ ] Error messages user-friendly

### Testing

- [ ] Unit tests pass (backend)
- [ ] Integration tests pass (API)
- [ ] E2E tests pass (UI)
- [ ] Performance tests < target (FIFO < 5ms, lot consumption < 50ms)
- [ ] Concurrent user test (10+ users)
- [ ] Load test (100+ assignments)

### Documentation

- [ ] API documentation updated
- [ ] Database schema documented
- [ ] User guide created (Turkish)
- [ ] Deployment guide written
- [ ] Rollback procedure documented

---

## 🎯 DEPLOYMENT STRATEGY

### Staging Environment

**Week 1: Database Migrations**
```bash
# Backup production database
pg_dump burkol_prod > backup_before_polymorphic.sql

# Run migrations 032-035 on staging
cd quote-portal
npx knex migrate:up 032_create_polymorphic_entity_relations.js
npx knex migrate:up 033_migrate_to_polymorphic_relations.js

# Verify data integrity
npm run verify:polymorphic-migration

# Test queries
npm run test:polymorphic-queries
```

**Week 2: Backend Deployment**
```bash
# Deploy backend with polymorphic queries
git checkout sql-branch
npm run build
pm2 reload mes-backend

# Smoke test
curl http://staging.burkol.com/api/mes/workers/WORKER-001/tasks/queue
```

**Week 3: Frontend Deployment**
```bash
# Deploy frontend
npm run build:production
pm2 reload mes-frontend

# E2E test
npm run test:e2e
```

### Production Rollout

**Phase 1: Read-Only (Week 4)**
- Deploy backend with dual queries (old + new)
- Log both query results
- Compare results
- No write operations changed

**Phase 2: Write Operations (Week 5)**
- Switch write operations to polymorphic
- Monitor for errors
- Keep old tables as backup (don't drop yet)

**Phase 3: Cleanup (Week 6)**
- Drop old junction tables (Migration 034)
- Full cutover to polymorphic
- Remove dual query logic

---

## 📊 SUCCESS METRICS

### Performance Targets

| Query Type | Target | Current | Status |
|------------|--------|---------|--------|
| FIFO task queue | < 5ms | TBD | ⏳ |
| Material reservation | < 50ms | TBD | ⏳ |
| Lot consumption | < 100ms | TBD | ⏳ |
| Real-time notification | < 10ms | TBD | ⏳ |
| Worker portal load | < 200ms | TBD | ⏳ |

### Business Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| Task assignment accuracy | 100% | FIFO order correct |
| Material traceability | 100% | Lot → Product tracking |
| System uptime | 99.9% | During migration |
| User satisfaction | > 4.5/5 | Post-deployment survey |

---

## 🆘 TROUBLESHOOTING GUIDE

### Issue 1: Migration 033 Fails (Data Migration)

**Symptom:** UNIQUE constraint violation

**Cause:** Duplicate relationships in source tables

**Solution:**
```sql
-- Find duplicates
SELECT source_type, source_id, relation_type, target_id, COUNT(*)
FROM mes_entity_relations
GROUP BY source_type, source_id, relation_type, target_id
HAVING COUNT(*) > 1;

-- Remove duplicates (keep first created_at)
DELETE FROM mes_entity_relations
WHERE id NOT IN (
  SELECT MIN(id)
  FROM mes_entity_relations
  GROUP BY source_type, source_id, relation_type, target_id
);
```

### Issue 2: Slow Polymorphic Queries

**Symptom:** Query > 50ms

**Cause:** Index not being used

**Solution:**
```sql
-- Check index usage
EXPLAIN ANALYZE
SELECT * FROM mes_entity_relations
WHERE source_type = 'worker' AND relation_type = 'station';

-- Should show "Index Scan using idx_worker_stations"
-- If not, rebuild index:
REINDEX INDEX idx_worker_stations_fast;
ANALYZE mes_entity_relations;
```

### Issue 3: Real-time Updates Not Working

**Symptom:** Frontend not receiving SSE events

**Cause:** LISTEN/NOTIFY not configured

**Solution:**
```sql
-- Check if triggers exist
SELECT tgname FROM pg_trigger WHERE tgname LIKE '%notify%';

-- Test trigger manually
UPDATE mes_worker_assignments SET status = 'in_progress' WHERE id = 'TEST-001';

-- Check notification (in separate psql session)
LISTEN mes_assignment_updates;
-- Should see notification
```

---

## 📚 REFERENCES

**Design Documents:**
- MES-ULTIMATE-DATABASE-ARCHITECTURE.md (this file)
- LOT-TRACKING-SYSTEM-ANALYSIS.md (lot tracking spec)
- PHASE-1-2-IMPLEMENTATION-GUIDE.md (lot tracking implementation)
- MES-FIFO-OPTIMIZATION-DATABASE-REQUIREMENTS.md (FIFO spec)

**Migration Files:**
- 022-031: Completed migrations
- 032-035: Pending polymorphic migrations

**Utilities:**
- quote-portal/server/utils/lotGenerator.js
- quote-portal/server/utils/lotConsumption.js
- quote-portal/server/utils/fifoScheduler.js

---

## 🎉 COMPLETION

Bu guide'ı tamamladığında:

✅ **Database:** 25 → 19 tablo (6 tablo azaltma)
✅ **Performance:** FIFO < 5ms, Lot consumption < 50ms
✅ **Traceability:** 100% lot → product tracking
✅ **Real-time:** SSE notifications aktif
✅ **MES Sistemi:** %100 çalışır durumda

**Tahmini Toplam Süre:** 3-4 hafta
**Risk Level:** Orta (good test coverage ile düşük)

---

**Son Güncelleme:** 20 Kasım 2025
**Versiyon:** 1.0 - Complete Migration Guide
**Durum:** ✅ Steps 1-31 Complete | ⏳ Steps 32-35 + Backend Pending

**Hazırlayan:** AI Assistant (based on existing architecture docs)
**Gözden Geçiren:** [Your Name]

---

*Bu guide'daki her adım Copilot'a verilmeye hazır formattadır. Her step'i sırayla kopyala-yapıştır yaparak MES geçişini tamamlayabilirsiniz.*
