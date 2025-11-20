# 🔄 MES API COMPLETE MIGRATION GUIDE - Firebase to PostgreSQL
## 3-Phase API Geçiş Kılavuzu (Clean Start - No Data Transfer)

**Tarih:** 20 Kasım 2025  
**Durum:** ✅ Database Ready (Migrations 022-031) | ⏳ API Migration Pending  
**Hedef:** Firebase API → PostgreSQL API (60 endpoints, 3 phases, clean start)

---

## 🎯 MİGRATİON STRATEGY

### Önemli Kararlar

**✅ YENİ MİMARİ:**
- 19-table optimized PostgreSQL schema
- FIFO scheduling with 12 timing fields
- Lot tracking with full traceability
- Real-time LISTEN/NOTIFY
- Polymorphic entity_relations (6 junction tables → 1)

**❌ DATA TRANSFER YOK:**
- Firebase'deki MES verisi kurtarılmayacak
- Temiz SQL başlangıç
- Migration scripts sadece schema
- Manuel veri girişi gerekirse yapılacak

**🔄 GEÇİŞ YAKLAŞIMI:**
- Firebase import'ları kaldır
- SQL query'ler yaz
- Transaction management ekle
- Error handling güçlendir
- Feature flags ile kontrollü geçiş

---

## 📊 CURRENT STATE ANALYSIS

### Database Status

| Migration | Status | Description |
|-----------|--------|-------------|
| 022-031 | ✅ Complete | All tables created, FIFO + lot tracking ready |
| 032-035 | ⏳ Pending | Polymorphic consolidation (optional) |

**Mevcut Tablolar: 25** (Target: 19 after polymorphic)

### API Endpoints Status

| Category | Total | Firebase | SQL | Migration Needed |
|----------|-------|----------|-----|------------------|
| **Operations** | 2 | 2 | 0 | 2 |
| **Workers** | 4 | 4 | 0 | 4 |
| **Stations** | 4 | 4 | 0 | 4 |
| **Production Plans** | 8 | 8 | 0 | 8 |
| **Worker Assignments** | 4 | 4 | 0 | 4 |
| **Work Packages** | 6 | 6 | 0 | 6 |
| **Work Orders** | 5 | 5 | 0 | 5 |
| **Approved Quotes** | 3 | 3 | 0 | 3 |
| **Materials** | 4 | 4 | 0 | 4 |
| **Templates** | 3 | 3 | 0 | 3 |
| **Master Data** | 2 | 2 | 0 | 2 |
| **Alerts** | 1 | 1 | 0 | 1 |
| **Substations** | 4 | 4 | 0 | 4 |
| **Metrics** | 2 | 2 | 0 | 2 |
| **FIFO/SSE** | 8 | 0 | 8 | 0 ✅ |
| **Entity Relations** | 5 | 0 | 5 | 0 ✅ |
| **TOTAL** | **65** | **52** | **13** | **52** |

---

## 🚀 3-PHASE MIGRATION ROADMAP

### **PHASE 1: CORE MASTER DATA (Week 1)** - 15 Endpoints

**Priority:** 🔴 CRITICAL - Foundation for everything else

**Endpoints to Migrate:**
1. Operations CRUD (2 endpoints)
2. Workers CRUD (4 endpoints) 
3. Stations CRUD (4 endpoints)
4. Substations CRUD (4 endpoints)
5. Approved Quotes (1 endpoint - GET only)

**Why First:** Master data must exist before production planning

---

### **PHASE 2: PRODUCTION CORE (Week 2)** - 25 Endpoints

**Priority:** 🔴 CRITICAL - Heart of MES system

**Endpoints to Migrate:**
1. Production Plans CRUD (8 endpoints) - **MOST COMPLEX**
2. Worker Assignments (4 endpoints)
3. Work Orders (5 endpoints)
4. Work Packages (6 endpoints)
5. Templates (2 endpoints - create/delete only)

**Why Second:** Production logic depends on master data

---

### **PHASE 3: SUPPORTING FEATURES (Week 3)** - 12 Endpoints

**Priority:** 🟡 MEDIUM - Nice to have, not blocking

**Endpoints to Migrate:**
1. Materials (4 endpoints)
2. Master Data (2 endpoints)
3. Templates GET (1 endpoint)
4. Alerts (1 endpoint)
5. Metrics (2 endpoints)
6. Approved Quotes POST (2 endpoints)

**Why Last:** Can work without these initially

---

## 📋 PHASE 1: CORE MASTER DATA MIGRATION

### STEP 1: Operations Endpoints (2 endpoints)

**Copilot'a Verilecek Prompt:**

```
MES Operations API migration: Firebase → SQL

Dosya: quote-portal/server/mesRoutes.js

Migrate edilecek endpoints:
1. GET /api/mes/operations
2. POST /api/mes/operations

ESKİ KOD (Firebase):
```javascript
router.get('/operations', withAuth, async (req, res) => {
  const db = getFirestore();
  const snapshot = await db.collection('operations').get();
  const operations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  res.json(operations);
});

router.post('/operations', withAuth, async (req, res) => {
  const db = getFirestore();
  const { name, description } = req.body;
  const ref = await db.collection('operations').add({ name, description, createdAt: new Date() });
  res.json({ id: ref.id, name, description });
});
```

YENİ KOD (SQL):
```javascript
import { pool } from '../db/index.js'; // PostgreSQL connection pool

router.get('/operations', withAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, description, created_at FROM mes_operations ORDER BY name'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching operations:', error);
    res.status(500).json({ error: 'Failed to fetch operations' });
  }
});

router.post('/operations', withAuth, async (req, res) => {
  const { name, description } = req.body;
  
  try {
    const result = await pool.query(
      `INSERT INTO mes_operations (name, description, created_at) 
       VALUES ($1, $2, NOW()) 
       RETURNING id, name, description, created_at`,
      [name, description]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating operation:', error);
    res.status(500).json({ error: 'Failed to create operation' });
  }
});
```

Değişiklikler:
1. getFirestore() import'unu kaldır
2. pool.query() kullan
3. Parameterized queries ($1, $2) kullan (SQL injection prevention)
4. Error handling ekle
5. created_at otomatik NOW()
6. RETURNING clause ile insert sonucunu al

Test:
```bash
# Create operation
curl -X POST http://localhost:3000/api/mes/operations \
  -H "Content-Type: application/json" \
  -d '{"name":"Kesim","description":"Metal kesim işlemi"}'

# Get all operations
curl http://localhost:3000/api/mes/operations
```
```

**Beklenen Sonuç:**
- ✅ 2 endpoint SQL kullanıyor
- ✅ Firebase import kaldırıldı
- ✅ Error handling var
- ✅ Parameterized queries
- ✅ Test passed

---

### STEP 2: Workers Endpoints (4 endpoints)

**Copilot'a Verilecek Prompt:**

```
MES Workers API migration: Firebase → SQL

Dosya: quote-portal/server/mesRoutes.js

Migrate edilecek endpoints:
1. GET /api/mes/workers
2. POST /api/mes/workers
3. GET /api/mes/workers/:id/stations (junction table!)
4. DELETE /api/mes/workers/:id

ESKİ KOD (Firebase - örnek):
```javascript
router.get('/workers', withAuth, async (req, res) => {
  const db = getFirestore();
  const snapshot = await db.collection('workers').get();
  const workers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  res.json(workers);
});
```

YENİ KOD (SQL):
```javascript
router.get('/workers', withAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        name,
        employee_id,
        status,
        shift,
        email,
        phone,
        created_at,
        updated_at
      FROM mes_workers 
      WHERE active = true
      ORDER BY name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching workers:', error);
    res.status(500).json({ error: 'Failed to fetch workers' });
  }
});

router.post('/workers', withAuth, async (req, res) => {
  const { name, employeeId, shift, email, phone } = req.body;
  
  try {
    const result = await pool.query(`
      INSERT INTO mes_workers (
        name, employee_id, shift, email, phone, 
        status, active, created_at
      ) 
      VALUES ($1, $2, $3, $4, $5, 'available', true, NOW()) 
      RETURNING *
    `, [name, employeeId, shift, email, phone]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating worker:', error);
    res.status(500).json({ error: 'Failed to create worker' });
  }
});

// Junction table query (uses mes_worker_stations)
router.get('/workers/:id/stations', withAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(`
      SELECT 
        s.id,
        s.name,
        s.code,
        ws.assigned_at,
        ws.is_primary
      FROM mes_worker_stations ws
      JOIN mes_stations s ON s.id = ws.station_id
      WHERE ws.worker_id = $1
      ORDER BY ws.is_primary DESC, s.name
    `, [id]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching worker stations:', error);
    res.status(500).json({ error: 'Failed to fetch worker stations' });
  }
});

router.delete('/workers/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Soft delete (set active = false)
    const result = await pool.query(`
      UPDATE mes_workers 
      SET active = false, updated_at = NOW() 
      WHERE id = $1 
      RETURNING id
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Worker not found' });
    }
    
    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error('Error deleting worker:', error);
    res.status(500).json({ error: 'Failed to delete worker' });
  }
});
```

Özel Notlar:
- mes_worker_stations junction table kullan (henüz polymorphic'e geçmedik)
- Soft delete kullan (active = false)
- JOIN query'lerde tablo alias'ları kullan
- ORDER BY ile sıralama ekle

Test:
```bash
# Create worker
curl -X POST http://localhost:3000/api/mes/workers \
  -H "Content-Type: application/json" \
  -d '{"name":"Ahmet Yılmaz","employeeId":"W-001","shift":"morning","email":"ahmet@example.com"}'

# Get worker stations
curl http://localhost:3000/api/mes/workers/W-001/stations
```
```

**Beklenen Sonuç:**
- ✅ 4 endpoint SQL kullanıyor
- ✅ Junction table query çalışıyor
- ✅ Soft delete implement edildi
- ✅ JOIN query'ler doğru

---

### STEP 3: Stations Endpoints (4 endpoints)

**Copilot'a Verilecek Prompt:**

```
MES Stations API migration: Firebase → SQL

Dosya: quote-portal/server/mesRoutes.js

Migrate edilecek endpoints:
1. GET /api/mes/stations
2. POST /api/mes/stations
3. GET /api/mes/stations/:id/workers (junction table reverse!)
4. DELETE /api/mes/stations/:id

Pattern: Workers ile aynı ama reverse JOIN

YENİ KOD:
```javascript
router.get('/stations', withAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        code,
        name,
        type,
        capacity,
        status,
        location,
        created_at
      FROM mes_stations 
      WHERE active = true
      ORDER BY code
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching stations:', error);
    res.status(500).json({ error: 'Failed to fetch stations' });
  }
});

router.post('/stations', withAuth, async (req, res) => {
  const { code, name, type, capacity, location } = req.body;
  
  try {
    const result = await pool.query(`
      INSERT INTO mes_stations (
        code, name, type, capacity, location,
        status, active, created_at
      ) 
      VALUES ($1, $2, $3, $4, $5, 'available', true, NOW()) 
      RETURNING *
    `, [code, name, type, capacity, location]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating station:', error);
    res.status(500).json({ error: 'Failed to create station' });
  }
});

router.get('/stations/:id/workers', withAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(`
      SELECT 
        w.id,
        w.name,
        w.employee_id,
        w.status,
        ws.assigned_at,
        ws.is_primary
      FROM mes_worker_stations ws
      JOIN mes_workers w ON w.id = ws.worker_id
      WHERE ws.station_id = $1
      ORDER BY ws.is_primary DESC, w.name
    `, [id]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching station workers:', error);
    res.status(500).json({ error: 'Failed to fetch station workers' });
  }
});

router.delete('/stations/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(`
      UPDATE mes_stations 
      SET active = false, updated_at = NOW() 
      WHERE id = $1 
      RETURNING id
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Station not found' });
    }
    
    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error('Error deleting station:', error);
    res.status(500).json({ error: 'Failed to delete station' });
  }
});
```

Aynı pattern, ters JOIN:
- workers/:id/stations → station'ları döndür
- stations/:id/workers → worker'ları döndür

Test aynı mantık.
```

**Beklenen Sonuç:**
- ✅ 4 endpoint SQL kullanıyor
- ✅ Reverse JOIN çalışıyor
- ✅ Code consistency var

---

### STEP 4: Substations Endpoints (4 endpoints)

**Copilot'a Verilecek Prompt:**

```
MES Substations API migration: Firebase → SQL

Dosya: quote-portal/server/mesRoutes.js

Migrate edilecek endpoints:
1. GET /api/mes/substations
2. PATCH /api/mes/substations/:id (status update!)
3. GET /api/mes/substations/:id/details
4. POST /api/mes/substations/reset-all

Pattern: Stations ile benzer ama status update var

YENİ KOD:
```javascript
router.get('/substations', withAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        code,
        name,
        station_id,
        type,
        status,
        current_assignment_id,
        created_at
      FROM mes_substations 
      ORDER BY code
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching substations:', error);
    res.status(500).json({ error: 'Failed to fetch substations' });
  }
});

router.patch('/substations/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  const { status, currentAssignmentId } = req.body;
  
  try {
    const result = await pool.query(`
      UPDATE mes_substations 
      SET 
        status = COALESCE($1, status),
        current_assignment_id = COALESCE($2, current_assignment_id),
        updated_at = NOW()
      WHERE id = $3 
      RETURNING *
    `, [status, currentAssignmentId, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Substation not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating substation:', error);
    res.status(500).json({ error: 'Failed to update substation' });
  }
});

router.get('/substations/:id/details', withAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(`
      SELECT 
        s.*,
        st.name as station_name,
        a.id as current_assignment_id,
        a.status as assignment_status
      FROM mes_substations s
      LEFT JOIN mes_stations st ON st.id = s.station_id
      LEFT JOIN mes_worker_assignments a ON a.id = s.current_assignment_id
      WHERE s.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Substation not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching substation details:', error);
    res.status(500).json({ error: 'Failed to fetch substation details' });
  }
});

router.post('/substations/reset-all', withAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE mes_substations 
      SET 
        status = 'available',
        current_assignment_id = NULL,
        updated_at = NOW()
      RETURNING id
    `);
    
    res.json({ 
      success: true, 
      resetCount: result.rows.length,
      message: `${result.rows.length} substations reset to available` 
    });
  } catch (error) {
    console.error('Error resetting substations:', error);
    res.status(500).json({ error: 'Failed to reset substations' });
  }
});
```

Özel Notlar:
- PATCH için COALESCE kullan (sadece gönderilen field'ları güncelle)
- LEFT JOIN ile ilişkili verileri getir
- Bulk update için WHERE clause olmadan UPDATE

Test:
```bash
# Update status
curl -X PATCH http://localhost:3000/api/mes/substations/SUB-001 \
  -H "Content-Type: application/json" \
  -d '{"status":"in_use"}'

# Reset all
curl -X POST http://localhost:3000/api/mes/substations/reset-all
```
```

**Beklenen Sonuç:**
- ✅ 4 endpoint SQL kullanıyor
- ✅ PATCH partial update çalışıyor
- ✅ Bulk update çalışıyor
- ✅ LEFT JOIN doğru

---

### STEP 5: Approved Quotes GET (1 endpoint)

**Copilot'a Verilecek Prompt:**

```
MES Approved Quotes GET API migration: Firebase → SQL

Dosya: quote-portal/server/mesRoutes.js

Migrate edilecek endpoint:
1. GET /api/mes/approved-quotes

YENİ KOD:
```javascript
router.get('/approved-quotes', withAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        work_order_code,
        quote_code,
        customer_name,
        product_name,
        quantity,
        status,
        production_state,
        created_at,
        approved_at
      FROM mes_approved_quotes 
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching approved quotes:', error);
    res.status(500).json({ error: 'Failed to fetch approved quotes' });
  }
});
```

Basit GET query. POST endpoints Phase 3'te.
```

**Beklenen Sonuç:**
- ✅ 1 endpoint SQL kullanıyor
- ✅ Simple query

---

## ✅ PHASE 1 COMPLETION CHECKLIST

- [ ] STEP 1: Operations (2 endpoints) migrated
- [ ] STEP 2: Workers (4 endpoints) migrated
- [ ] STEP 3: Stations (4 endpoints) migrated
- [ ] STEP 4: Substations (4 endpoints) migrated
- [ ] STEP 5: Approved Quotes GET (1 endpoint) migrated
- [ ] Total: 15 endpoints migrated
- [ ] Firebase imports removed from migrated endpoints
- [ ] All tests passing
- [ ] Manual testing completed

**Verification:**
```bash
# Test all Phase 1 endpoints
npm run test:phase1-endpoints

# Check Firebase usage
grep -n "getFirestore()" server/mesRoutes.js | wc -l
# Should be reduced by ~15
```

---

## 📋 PHASE 2: PRODUCTION CORE MIGRATION

### STEP 6: Work Orders CRUD (5 endpoints)

**Copilot'a Verilecek Prompt:**

```
MES Work Orders API migration: Firebase → SQL

Dosya: quote-portal/server/mesRoutes.js

Migrate edilecek endpoints:
1. GET /api/mes/work-orders
2. POST /api/mes/work-orders
3. PUT /api/mes/work-orders/:id
4. DELETE /api/mes/work-orders/:id
5. POST /api/mes/work-orders/next-id (counter!)

YENİ KOD:
```javascript
router.get('/work-orders', withAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        wo.*,
        q.customer_name,
        q.product_name,
        (SELECT COUNT(*) FROM mes_production_plans WHERE work_order_code = wo.code) as plan_count
      FROM mes_work_orders wo
      LEFT JOIN mes_approved_quotes q ON q.work_order_code = wo.code
      ORDER BY wo.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching work orders:', error);
    res.status(500).json({ error: 'Failed to fetch work orders' });
  }
});

router.post('/work-orders', withAuth, async (req, res) => {
  const { quoteId, quantity, dueDate, notes } = req.body;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Get next WO code using sequence
    const codeResult = await client.query(`
      SELECT generate_mes_code('WO') as code
    `);
    const code = codeResult.rows[0].code;
    
    // Create work order
    const result = await client.query(`
      INSERT INTO mes_work_orders (
        code, quote_id, quantity, due_date, notes,
        status, created_at
      ) 
      VALUES ($1, $2, $3, $4, $5, 'pending', NOW()) 
      RETURNING *
    `, [code, quoteId, quantity, dueDate, notes]);
    
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating work order:', error);
    res.status(500).json({ error: 'Failed to create work order' });
  } finally {
    client.release();
  }
});

router.put('/work-orders/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  const { quantity, dueDate, notes, status } = req.body;
  
  try {
    const result = await pool.query(`
      UPDATE mes_work_orders 
      SET 
        quantity = COALESCE($1, quantity),
        due_date = COALESCE($2, due_date),
        notes = COALESCE($3, notes),
        status = COALESCE($4, status),
        updated_at = NOW()
      WHERE id = $5 
      RETURNING *
    `, [quantity, dueDate, notes, status, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Work order not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating work order:', error);
    res.status(500).json({ error: 'Failed to update work order' });
  }
});

router.delete('/work-orders/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(`
      DELETE FROM mes_work_orders 
      WHERE id = $1 
      RETURNING id
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Work order not found' });
    }
    
    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error('Error deleting work order:', error);
    res.status(500).json({ error: 'Failed to delete work order' });
  }
});

router.post('/work-orders/next-id', withAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT generate_mes_code('WO') as next_code
    `);
    res.json({ nextCode: result.rows[0].next_code });
  } catch (error) {
    console.error('Error generating next WO code:', error);
    res.status(500).json({ error: 'Failed to generate next code' });
  }
});
```

Özel Notlar:
- Transaction kullan (BEGIN/COMMIT/ROLLBACK)
- generate_mes_code() function kullan (Migration 025'te oluşturuldu)
- Subquery ile ilişkili plan sayısını getir
- Hard delete (soft delete yerine)
- client.release() unutma!

Test:
```bash
# Get next code
curl -X POST http://localhost:3000/api/mes/work-orders/next-id

# Create WO
curl -X POST http://localhost:3000/api/mes/work-orders \
  -H "Content-Type: application/json" \
  -d '{"quoteId":"Q-001","quantity":100,"dueDate":"2025-12-31"}'
```
```

**Beklenen Sonuç:**
- ✅ 5 endpoint SQL kullanıyor
- ✅ Transaction management çalışıyor
- ✅ Sequence kullanılıyor
- ✅ Subquery doğru

---

### STEP 7: Production Plans CRUD (8 endpoints) - **EN KARMAŞIK!**

**Copilot'a Verilecek Prompt:**

```
MES Production Plans API migration: Firebase → SQL (MOST COMPLEX!)

Dosya: quote-portal/server/mesRoutes.js

Migrate edilecek endpoints:
1. GET /api/mes/production-plans
2. POST /api/mes/production-plans (ÇOOOOK KARMAŞIK!)
3. PUT /api/mes/production-plans/:id
4. DELETE /api/mes/production-plans/:id
5. GET /api/mes/production-plans/:id/tasks
6. POST /api/mes/production-plans/:planId/launch (KRİTİK!)
7. POST /api/mes/production-plans/:planId/pause
8. POST /api/mes/production-plans/:planId/resume

ÖNEMLİ: Firebase'de JSONB'de saklanan nodes artık ayrı tablolarda!

mes_production_plans (header)
├─ mes_production_plan_nodes (nodes)
│  ├─ mes_node_material_inputs (materials per node)
│  ├─ mes_node_stations (station assignments - junction)
│  ├─ mes_node_substations (substation assignments - junction)
│  └─ mes_node_predecessors (dependencies - junction)
├─ mes_plan_material_requirements (plan-level summary)
└─ mes_plan_wip_outputs (WIP outputs)

YENİ KOD (POST - EN KARMAŞIK):
```javascript
router.post('/production-plans', withAuth, async (req, res) => {
  const { 
    workOrderCode, 
    quoteId, 
    nodes,           // Array of node objects
    materialRequirements,
    wipOutputs 
  } = req.body;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // 1. Generate plan ID
    const idResult = await client.query(`
      SELECT generate_mes_code('PLAN') as id
    `);
    const planId = idResult.rows[0].id;
    
    // 2. Create plan header
    const planResult = await client.query(`
      INSERT INTO mes_production_plans (
        id, work_order_code, quote_id, status, created_at
      ) 
      VALUES ($1, $2, $3, 'draft', NOW()) 
      RETURNING *
    `, [planId, workOrderCode, quoteId]);
    
    // 3. Insert nodes
    for (const node of nodes) {
      const nodeResult = await client.query(`
        INSERT INTO mes_production_plan_nodes (
          plan_id, name, operation_id, output_code,
          quantity, unit, nominal_time, effective_time,
          sequence_number, created_at
        ) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) 
        RETURNING id
      `, [
        planId,
        node.name,
        node.operationId,
        node.outputCode,
        node.quantity,
        node.unit,
        node.nominalTime,
        node.effectiveTime,
        node.sequenceNumber
      ]);
      
      const nodeId = nodeResult.rows[0].id;
      
      // 3a. Insert node material inputs
      if (node.materialInputs && node.materialInputs.length > 0) {
        for (const material of node.materialInputs) {
          await client.query(`
            INSERT INTO mes_node_material_inputs (
              node_id, material_code, quantity, unit, 
              unit_ratio, is_derived, created_at
            ) 
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
          `, [
            nodeId,
            material.materialCode,
            material.quantity,
            material.unit,
            material.unitRatio || 1.0,
            material.isDerived || false
          ]);
        }
      }
      
      // 3b. Insert node station assignments (junction)
      if (node.stationIds && node.stationIds.length > 0) {
        for (let i = 0; i < node.stationIds.length; i++) {
          await client.query(`
            INSERT INTO mes_node_stations (
              node_id, station_id, priority, created_at
            ) 
            VALUES ($1, $2, $3, NOW())
          `, [nodeId, node.stationIds[i], i + 1]); // priority = index + 1
        }
      }
      
      // 3c. Insert node predecessors (dependencies)
      if (node.predecessorIds && node.predecessorIds.length > 0) {
        for (const predecessorId of node.predecessorIds) {
          await client.query(`
            INSERT INTO mes_node_predecessors (
              node_id, predecessor_node_id, created_at
            ) 
            VALUES ($1, $2, NOW())
          `, [nodeId, predecessorId]);
        }
      }
    }
    
    // 4. Insert plan-level material requirements
    if (materialRequirements && materialRequirements.length > 0) {
      for (const material of materialRequirements) {
        await client.query(`
          INSERT INTO mes_plan_material_requirements (
            plan_id, material_code, quantity, unit, created_at
          ) 
          VALUES ($1, $2, $3, $4, NOW())
        `, [planId, material.materialCode, material.quantity, material.unit]);
      }
    }
    
    // 5. Insert WIP outputs
    if (wipOutputs && wipOutputs.length > 0) {
      for (const wip of wipOutputs) {
        await client.query(`
          INSERT INTO mes_plan_wip_outputs (
            plan_id, output_code, quantity, unit, created_at
          ) 
          VALUES ($1, $2, $3, $4, NOW())
        `, [planId, wip.outputCode, wip.quantity, wip.unit]);
      }
    }
    
    await client.query('COMMIT');
    
    // Return full plan with nodes
    const fullPlan = await client.query(`
      SELECT 
        p.*,
        json_agg(
          json_build_object(
            'id', n.id,
            'name', n.name,
            'operationId', n.operation_id,
            'outputCode', n.output_code,
            'quantity', n.quantity,
            'sequenceNumber', n.sequence_number
          ) ORDER BY n.sequence_number
        ) as nodes
      FROM mes_production_plans p
      LEFT JOIN mes_production_plan_nodes n ON n.plan_id = p.id
      WHERE p.id = $1
      GROUP BY p.id
    `, [planId]);
    
    res.json(fullPlan.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating production plan:', error);
    res.status(500).json({ error: 'Failed to create production plan', details: error.message });
  } finally {
    client.release();
  }
});
```

YENİ KOD (GET):
```javascript
router.get('/production-plans', withAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.*,
        wo.code as work_order_code,
        q.customer_name,
        q.product_name,
        (SELECT COUNT(*) FROM mes_production_plan_nodes WHERE plan_id = p.id) as node_count,
        (SELECT COUNT(*) FROM mes_worker_assignments WHERE plan_id = p.id) as assignment_count
      FROM mes_production_plans p
      LEFT JOIN mes_work_orders wo ON wo.code = p.work_order_code
      LEFT JOIN mes_approved_quotes q ON q.id = p.quote_id
      ORDER BY p.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching production plans:', error);
    res.status(500).json({ error: 'Failed to fetch production plans' });
  }
});
```

YENİ KOD (DELETE):
```javascript
router.delete('/production-plans/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Delete in correct order (FK constraints!)
    await client.query('DELETE FROM mes_node_predecessors WHERE node_id IN (SELECT id FROM mes_production_plan_nodes WHERE plan_id = $1)', [id]);
    await client.query('DELETE FROM mes_node_stations WHERE node_id IN (SELECT id FROM mes_production_plan_nodes WHERE plan_id = $1)', [id]);
    await client.query('DELETE FROM mes_node_substations WHERE node_id IN (SELECT id FROM mes_production_plan_nodes WHERE plan_id = $1)', [id]);
    await client.query('DELETE FROM mes_node_material_inputs WHERE node_id IN (SELECT id FROM mes_production_plan_nodes WHERE plan_id = $1)', [id]);
    await client.query('DELETE FROM mes_production_plan_nodes WHERE plan_id = $1', [id]);
    await client.query('DELETE FROM mes_plan_material_requirements WHERE plan_id = $1', [id]);
    await client.query('DELETE FROM mes_plan_wip_outputs WHERE plan_id = $1', [id]);
    
    const result = await client.query('DELETE FROM mes_production_plans WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Production plan not found' });
    }
    
    await client.query('COMMIT');
    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting production plan:', error);
    res.status(500).json({ error: 'Failed to delete production plan' });
  } finally {
    client.release();
  }
});
```

Özel Notlar:
- Nested loops ile tüm ilişkili verileri insert et
- Transaction ZORUNLU (atomicity!)
- json_agg ile nested JSON döndür
- DELETE sırası önemli (FK constraints)
- Error handling çok önemli (complex operation)

Launch, Pause, Resume endpoints daha basit (sadece status update + trigger).

Test:
```bash
# Create complex plan
curl -X POST http://localhost:3000/api/mes/production-plans \
  -H "Content-Type: application/json" \
  -d @test-plan.json  # Büyük JSON payload
```
```

**Beklenen Sonuç:**
- ✅ 8 endpoint SQL kullanıyor
- ✅ Nested insert çalışıyor
- ✅ Transaction management robust
- ✅ JSON aggregation doğru
- ✅ Cascade delete çalışıyor

---

### STEP 8-10: Remaining Phase 2 Endpoints

**Worker Assignments (4 endpoints)**, **Work Packages (6 endpoints)**, **Templates (2 endpoints)** benzer pattern ile implement edilecek.

Her biri için aynı formatı takip et:
1. Transaction kullan
2. Parameterized queries
3. Error handling
4. JOIN query'ler
5. Test curl commands

---

## 📋 PHASE 3: SUPPORTING FEATURES MIGRATION

Materials, Alerts, Metrics, Master Data endpoints - basit CRUD pattern'leri.

---

## ✅ FINAL MIGRATION CHECKLIST

### Code Cleanup

- [ ] Remove Firebase imports from mesRoutes.js
  ```javascript
  // DELETE THIS:
  import { getFirestore } from 'firebase-admin/firestore';
  
  // ADD THIS:
  import { pool } from '../db/index.js';
  ```

- [ ] Remove all `getFirestore()` calls (should be 0)
  ```bash
  grep -n "getFirestore()" server/mesRoutes.js
  # Expected: 0 matches
  ```

- [ ] Add PostgreSQL pool import
  ```javascript
  import { pool } from '../db/index.js';
  ```

- [ ] Update package.json dependencies (remove firebase-admin if only used for MES)

### Testing

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] E2E smoke tests
- [ ] Load testing (100+ concurrent requests)
- [ ] Transaction rollback testing

### Performance

- [ ] Query performance < 50ms
- [ ] EXPLAIN ANALYZE all complex queries
- [ ] Index usage verified
- [ ] Connection pool tuning

### Documentation

- [ ] API documentation updated
- [ ] Migration notes documented
- [ ] Rollback procedure written
- [ ] Known issues documented

---

## 🎉 COMPLETION CRITERIA

Tüm bu adımlar tamamlandığında:

✅ **60 API endpoint tamamen SQL'de**
✅ **Firebase dependency kaldırıldı**
✅ **Transaction management robust**
✅ **Error handling comprehensive**
✅ **MES sistemi %100 PostgreSQL'de çalışıyor**

**Sonraki Adım:** Frontend migration (ayrı guide)

---

**Son Güncelleme:** 20 Kasım 2025
**Versiyon:** 1.0 - Complete API Migration Guide
**Durum:** ⏳ Ready for Implementation

**Hazırlayan:** AI Assistant
**Takip Eden:** Copilot (step-by-step execution)

---

*Bu guide'daki her STEP Copilot'a verilmeye hazır. Her prompt'u kopyala-yapıştır yaparak 3 fazlı geçişi tamamlayın.*
