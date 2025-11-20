# 🔄 MES API COMPLETE MIGRATION GUIDE - Firebase to PostgreSQL
## 3-Phase API Geçiş Kılavuzu (Clean Start - No Data Transfer)

**Tarih:** 20 Kasım 2025  
**Durum:** ✅ PHASE 1-2 COMPLETE (27/60 endpoints) | ⏳ STEP 8 Ready  
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

## ⚠️ CRITICAL SCHEMA CLARIFICATION

### Orders Tables - KARIŞIKLIĞI ÖNLE!

**🗑️ KALDIRILDI (Migration 037):**
- `mes.orders` - Bu tablo migration 014'te yanlışlıkla oluşturulmuş, hiç kullanılmamış ve kaldırıldı.

**✅ DOĞRU KULLANIM:**

1. **`materials.orders`** - Tedarikçi Siparişleri (Malzeme Satın Alma)
   - Format: `ORD-2025-0001`, `ORD-2025-0002`
   - Amaç: Hammadde/malzeme tedarikçilerden satın alma
   - İlişkili Tablo: `materials.order_items` (sipariş kalemleri)
   - Kullanım: Materials modülü, satın alma işlemleri

2. **`mes.work_orders`** - Üretim İş Emirleri (Production Work Orders)
   - Format: `WO-001`, `WO-002`, `WO-003`
   - Amaç: Üretim planlaması ve iş emri yönetimi
   - İlişkili: `mes.production_plans`, `mes.approved_quotes`
   - Kullanım: MES modülü, üretim takibi

**💡 HATIRLATMA:**
- "orders" kelimesini gördüğünüzde kontekse dikkat edin!
- Materials context → `materials.orders` kullan
- MES/Production context → `mes.work_orders` kullan
- Migration 037 ile `mes.orders` temizlendi, karışıklık giderildi.

### Skills Reference System - KEY-BASED!

**✅ YENİ SİSTEM (Migration 038):**
- `mes.skills` - Centralized skill definitions table

**🎯 NASIL ÇALIŞIR:**

1. **Skills Table Structure:**
   ```sql
   mes.skills (
     id: skill-001, skill-002, skill-003...
     name: "TIG Kaynağı", "Freze", "Montaj"
     description: "Tungsten Inert Gas kaynağı"
     is_active: boolean
   )
   ```

2. **Reference System:**
   - Workers → `skills: ["skill-001", "skill-003"]`
   - Stations → `capabilities: ["skill-001", "skill-002"]`
   - Operations → `skills: ["skill-005"]`
   - Frontend → "TIG Kaynağı, Freze, Montaj" (names)
   - Backend → `["skill-001", "skill-003", "skill-005"]` (keys)

3. **Matching Algorithm:**
   ```javascript
   Worker: ["skill-001", "skill-003"]
   Station: ["skill-001", "skill-002"]
   Match: skill-001 ✓ (TIG Kaynağı)
   ```

**💡 BENEFITS:**
- ✅ Company-specific skill sets (her şirket kendi yeteneklerini tanımlar)
- ✅ Easy renaming ("Kaynak" → "TIG Kaynağı" tüm referanslar otomatik güncellenir)
- ✅ Simple matching (string comparison: key === key)
- ✅ Delete protection (kullanımdaki skill silinemez)
- ✅ i18n ready (gelecekte name_en, name_tr eklenebilir)

**🔧 CRUD Endpoints:**
- GET /api/mes/skills - List all skills
- POST /api/mes/skills - Create new skill (auto-generated ID)
- PUT /api/mes/skills/:id - Update skill name/description
- DELETE /api/mes/skills/:id - Soft delete (protected if in use)

---

## 📊 CURRENT STATE ANALYSIS

### Database Status

| Migration | Status | Description |
|-----------|--------|-------------|
| 022-031 | ✅ Complete | All tables created, FIFO + lot tracking ready |
| 032-035 | ⏳ Pending | Polymorphic consolidation (optional) |
| 036 | ✅ Complete | Removed duplicate employee_id from workers |
| 037 | ✅ Complete | Dropped unused mes.orders table (cleanup) |
| 038 | ✅ Complete | Skills reference table (key-based system) |
| 039 | ✅ Complete | node_stations junction table |
| 043 | ✅ Complete | worker_assignments enhancements (timing + sequence) |
| 044 | ✅ Complete | node_predecessors table for parallel execution |
| 045 | ✅ Complete | worker_assignments INTEGER FK fix |

**Mevcut Tablolar: 25** (Target: 19 after polymorphic)
**Son Temizlik:** mes.orders kaldırıldı, tek orders kaynağı materials.orders
**Skills System:** Key-based reference (skill-001, skill-002) - Company customizable

### API Endpoints Status

| Category | Total | Firebase | SQL | Migration Needed |
|----------|-------|----------|-----|------------------|
| **Operations** | 2 | 0 | 2 | 0 ✅ |
| **Workers** | 4 | 0 | 4 | 0 ✅ |
| **Stations** | 4 | 0 | 4 | 0 ✅ |
| **Skills** | 4 | 0 | 4 | 0 ✅ |
| **Substations** | 4 | 0 | 4 | 0 ✅ |
| **Approved Quotes** | 3 | 2 | 1 | 2 |
| **Work Orders** | 5 | 0 | 5 | 0 ✅ |
| **Production Plans** | 8 | 0 | 8 | 0 ✅ |
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

### **✅ PHASE 1: CORE MASTER DATA (Week 1)** - 19 Endpoints - **COMPLETE!**

**Priority:** 🔴 CRITICAL - Foundation for everything else

**Endpoints Migrated:**
1. ✅ Operations CRUD (2 endpoints)
2. ✅ Workers CRUD (4 endpoints) 
3. ✅ Stations CRUD (4 endpoints)
4. ✅ **Skills CRUD (4 endpoints)** - KEY-BASED SYSTEM
5. ✅ Substations CRUD (4 endpoints)
6. ✅ Approved Quotes GET (1 endpoint)

**Status:** ✅ **19/19 Complete**

---

### **🔄 PHASE 2: PRODUCTION CORE (Week 2)** - 25 Endpoints - **IN PROGRESS (8/25)**

**Priority:** 🔴 CRITICAL - Heart of MES system

**Endpoints Status:**
1. ✅ Work Orders CRUD (5 endpoints) - **COMPLETE**
2. ✅ Production Plans CRUD (8 endpoints) - **COMPLETE** (Most Complex!)
3. ⏳ Worker Assignments (4 endpoints) - **NEXT!**
4. ⏳ Work Packages (6 endpoints)
5. ⏳ Templates (2 endpoints - create/delete only)

**Current Progress:** 13/25 endpoints (52%)

**What's Done:**
- ✅ Enhanced launch algorithm with 7 helper functions
- ✅ Database-level concurrent launch prevention
- ✅ Migrations 039, 043, 044, 045 executed
- ✅ Shift-aware worker scheduling
- ✅ Queue management system
- ✅ Parallel node execution (topological sort)

**Next Step:** Worker Assignments (real-time task management)

---

### **⏳ PHASE 3: SUPPORTING FEATURES (Week 3)** - 12 Endpoints

**Priority:** 🟡 MEDIUM - Nice to have, not blocking

**Endpoints to Migrate:**
1. Materials (4 endpoints)
2. Master Data (2 endpoints)
3. Templates GET (1 endpoint)
4. Alerts (1 endpoint)
5. Metrics (2 endpoints)
6. Approved Quotes POST (2 endpoints)

**Why Last:** Can work without these initially

**Overall Progress:** 27/60 endpoints (45%) ✅

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

### STEP 3.5: Skills CRUD (4 endpoints) - 🆕 KEY-BASED REFERENCE SYSTEM

**⚠️ ÖNEMLİ:** Bu adım Migration 038 ile eklendi. Skills artık key-based (skill-001, skill-002) olarak saklanıyor.

**Copilot'a Verilecek Prompt:**

```
MES Skills API migration: Implement Key-Based Reference System

Dosya: quote-portal/server/mesRoutes.js

IMPLEMENT edilecek endpoints (YENİ SİSTEM):
1. GET /api/mes/skills
2. POST /api/mes/skills
3. PUT /api/mes/skills/:id
4. DELETE /api/mes/skills/:id

ÖZELLİKLER:
- Key-based IDs (skill-001, skill-002, skill-003...)
- Company-customizable names and descriptions
- Delete protection (can't delete if in use)
- Usage tracking (workers, stations, operations)
- Auto ID generation

YENİ KOD:
```javascript
// GET /api/mes/skills - Get all skills
router.get('/skills', withAuth, async (req, res) => {
  try {
    const skills = await db('mes.skills')
      .select('id', 'name', 'description', 'is_active', 'created_at', 'updated_at')
      .where('is_active', true)
      .orderBy('name');
    
    res.json(skills);
  } catch (error) {
    console.error('Error fetching skills:', error);
    res.status(500).json({ error: 'Failed to fetch skills' });
  }
});

// POST /api/mes/skills - Create new skill
router.post('/skills', withAuth, async (req, res) => {
  const { name, description } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Skill name is required' });
  }
  
  try {
    // Generate skill-xxx ID
    const [{ max_id }] = await db('mes.skills').max('id as max_id');
    const nextNum = max_id ? parseInt(max_id.split('-')[1]) + 1 : 1;
    const newId = `skill-${nextNum.toString().padStart(3, '0')}`;
    
    const result = await db('mes.skills')
      .insert({
        id: newId,
        name,
        description,
        is_active: true,
        created_at: db.fn.now(),
        updated_at: db.fn.now(),
        created_by: req.user?.email || 'system'
      })
      .returning(['id', 'name', 'description', 'is_active', 'created_at']);
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error creating skill:', error);
    res.status(500).json({ error: 'Failed to create skill' });
  }
});

// PUT /api/mes/skills/:id - Update skill
router.put('/skills/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  
  try {
    const result = await db('mes.skills')
      .where({ id })
      .update({
        name,
        description,
        updated_at: db.fn.now(),
        updated_by: req.user?.email || 'system'
      })
      .returning(['id', 'name', 'description', 'is_active', 'updated_at']);
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error updating skill:', error);
    res.status(500).json({ error: 'Failed to update skill' });
  }
});

// DELETE /api/mes/skills/:id - Soft delete with protection
router.delete('/skills/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Check if skill is in use
    const [workersCount] = await db('mes.workers')
      .whereRaw('skills::jsonb @> ?', [JSON.stringify([id])])
      .count('* as count');
    
    const [stationsCount] = await db('mes.stations')
      .whereRaw('capabilities::jsonb @> ?', [JSON.stringify([id])])
      .count('* as count');
    
    const [operationsCount] = await db('mes.operations')
      .whereRaw('skills::jsonb @> ?', [JSON.stringify([id])])
      .count('* as count');
    
    const totalUsage = parseInt(workersCount.count) + parseInt(stationsCount.count) + parseInt(operationsCount.count);
    
    if (totalUsage > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete skill in use',
        usage: {
          workers: parseInt(workersCount.count),
          stations: parseInt(stationsCount.count),
          operations: parseInt(operationsCount.count)
        }
      });
    }
    
    // Soft delete
    const result = await db('mes.skills')
      .where({ id })
      .update({
        is_active: false,
        updated_at: db.fn.now(),
        updated_by: req.user?.email || 'system'
      })
      .returning('id');
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    
    res.json({ success: true, id: result[0].id });
  } catch (error) {
    console.error('Error deleting skill:', error);
    res.status(500).json({ error: 'Failed to delete skill' });
  }
});
```

Özel Notlar:
- Auto ID generation (skill-009, skill-010...)
- Delete protection (kullanımdaki skill silinemez)
- Usage tracking (workers/stations/operations)
- Soft delete pattern
- Audit trail (created_by, updated_by)

Test:
```bash
# Get all skills
curl http://localhost:3000/api/mes/skills

# Create skill with name AND description
curl -X POST http://localhost:3000/api/mes/skills \
  -H "Content-Type: application/json" \
  -d '{"name":"Boyama","description":"Elektrostatik toz boya uygulaması"}'

# Update skill
curl -X PUT http://localhost:3000/api/mes/skills/skill-009 \
  -H "Content-Type: application/json" \
  -d '{"name":"Elektrostatik Boyama","description":"Toz boya ve fırınlama"}'

# Try delete (will fail if in use)
curl -X DELETE http://localhost:3000/api/mes/skills/skill-001
```
```

**Beklenen Sonuç:**
- ✅ 4 endpoint SQL kullanıyor
- ✅ Key-based ID generation (skill-001, skill-002)
- ✅ Delete protection working
- ✅ Usage tracking active
- ✅ Name + Description fields supported

**🎯 FRONTEND INTEGRATION:**

1. **Skill Creation Form:**
   ```html
   <form>
     <input name="name" placeholder="Skill Name" required />
     <textarea name="description" placeholder="Description (optional)"></textarea>
     <button>Create Skill</button>
   </form>
   ```

2. **Skill Display:**
   ```javascript
   // Load skills from API
   const skills = await fetch('/api/mes/skills').then(r => r.json());
   
   // Show in dropdown
   skills.forEach(skill => {
     dropdown.add(new Option(skill.name, skill.id));
   });
   ```

3. **Worker/Station Assignment:**
   ```javascript
   // When creating worker, store skill keys
   const workerData = {
     name: "Ahmet Yılmaz",
     skills: ["skill-001", "skill-003", "skill-005"] // Keys, not names!
   };
   
   // Display with names
   const skillMap = {};
   skills.forEach(s => skillMap[s.id] = s.name);
   const displayNames = workerData.skills.map(key => skillMap[key]);
   // → "TIG Kaynağı, Freze, Montaj"
   ```

**📝 MIGRATION 038:**
Bu adım için Migration 038 zaten uygulandı:
- mes.skills tablosu oluşturuldu
- Default skills (skill-001 to skill-008) eklendi
- Mevcut worker/station data skill keys'e migrate edildi

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

- [x] STEP 1: Operations (2 endpoints) migrated ✅
- [x] STEP 2: Workers (4 endpoints) migrated ✅
- [x] STEP 3: Stations (4 endpoints) migrated ✅
- [x] STEP 3.5: Skills CRUD (4 endpoints) implemented ✅ KEY-BASED SYSTEM
- [x] STEP 4: Substations (4 endpoints) migrated ✅
- [x] STEP 5: Approved Quotes GET (1 endpoint) migrated ✅
- [x] STEP 6: Work Orders CRUD (5 endpoints) migrated ✅
- [x] STEP 7: Production Plans CRUD (8 endpoints) migrated ✅ **MOST COMPLEX!**
- [x] Total: 27 endpoints migrated ✅
- [x] Firebase imports removed from migrated endpoints ✅
- [x] Skills reference system working ✅
- [x] All tests passing ✅
- [x] Manual testing completed ✅

**Skills System Validation:**
```bash
# Test skills CRUD
curl http://localhost:3000/api/mes/skills
curl -X POST http://localhost:3000/api/mes/skills \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Skill","description":"Test description"}'

# Verify key-based references
curl http://localhost:3000/api/mes/workers
# Check that skills field contains: ["skill-001", "skill-003"] (keys, not names)
```

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

**⚠️ ÖNEMLI:** Bu `mes.work_orders` tablosudur (üretim iş emirleri). 
`materials.orders` ile karıştırmayın (o tedarikçi siparişleri için)!

**Copilot'a Verilecek Prompt:**

```
MES Work Orders API migration: Firebase → SQL

ÖNEMLİ: mes.work_orders kullan (üretim iş emirleri).
materials.orders DEĞİL (o tedarikçi siparişleri)!

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
    // NOTE: mes.work_orders = üretim iş emirleri (WO-001 format)
    // NOT materials.orders (tedarikçi siparişleri ORD-2025-0001 format)
    const result = await pool.query(`
      SELECT 
        wo.*,
        q.customer_name,
        q.product_name,
        (SELECT COUNT(*) FROM mes_production_plans WHERE work_order_code = wo.code) as plan_count
      FROM mes.work_orders wo
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
    
    // Create work order (üretim iş emri)
    const result = await client.query(`
      INSERT INTO mes.work_orders (
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
      UPDATE mes.work_orders 
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
      DELETE FROM mes.work_orders 
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

### ✅ STEP 7: Production Plans CRUD (8 endpoints) - **COMPLETED!**

**Status:** ✅ COMPLETE - All 8 endpoints implemented and tested

**📚 Detailed Implementation:** See [COMPLETED-PRODUCTION-PLANS-IMPLEMENTATION-GUIDE.md](./COMPLETED-PRODUCTION-PLANS-IMPLEMENTATION-GUIDE.md)

**What Was Implemented:**

1. **8 Production Plans Endpoints:**
   - ✅ GET /api/mes/production-plans
   - ✅ POST /api/mes/production-plans (Complex nested insert)
   - ✅ GET /api/mes/production-plans/:id
   - ✅ PUT /api/mes/production-plans/:id
   - ✅ DELETE /api/mes/production-plans/:id (CASCADE)
   - ✅ POST /api/mes/production-plans/:planId/launch (Enhanced algorithm)
   - ✅ POST /api/mes/production-plans/:planId/pause
   - ✅ POST /api/mes/production-plans/:planId/resume

2. **Database Schema:**
   ```
   mes_production_plans (header)
   ├─ mes_production_plan_nodes (nodes)
   │  ├─ mes_node_material_inputs (materials per node)
   │  ├─ mes_node_stations (station assignments - junction)
   │  └─ mes_node_predecessors (dependencies - junction)
   ├─ mes_plan_material_requirements (plan-level summary)
   └─ mes_plan_wip_outputs (WIP outputs)
   ```

3. **Enhanced Launch Algorithm:**
   - ✅ Topological sort for parallel execution
   - ✅ Shift-aware worker scheduling
   - ✅ Queue management (sequence_number tracking)
   - ✅ Earliest available substation selection
   - ✅ Skill-based worker matching
   - ✅ **Database-level EXCLUSIVE locks** for concurrent launch prevention
   - ✅ Summary response format for UI

4. **Helper Functions (7 total):**
   - `topologicalSort()` - Parallel execution order
   - `findWorkerWithShiftCheck()` - Shift-aware matching
   - `calculateEarliestSlot()` - Substation availability
   - `getShiftBlocksForDay()` - Shift schedule parsing
   - `isWithinShiftBlocks()` - Time validation
   - `calculateParallelPaths()` - Execution metrics
   - Other utility functions

5. **Database Migrations:**
   - ✅ Migration 039: node_stations table
   - ✅ Migration 043: worker_assignments enhancements
   - ✅ Migration 044: node_predecessors table
   - ✅ Migration 045: worker_assignments INTEGER FK fix

6. **Critical Features:**
   - **Concurrent Launch Prevention:** Only ONE plan can launch at a time (database locks)
   - **Plan-Scoped Sequences:** Each plan has independent worker queues
   - **Integer Foreign Keys:** Fixed VARCHAR→INTEGER for proper relationships
   - **Transaction Safety:** Full rollback on errors
   - **Performance:** < 2000ms launch time (2 nodes with queue)

**Testing Results:**
- ✅ PLAN-007: Single node launch successful
- ✅ PLAN-008: Multi-node with queue management
- ✅ Sequence numbers: Plan-scoped, not global
- ✅ Summary response: 7 required metrics
- ✅ Database state: 8 plans, 3 assignments

**Original Implementation Prompt (For Reference):**

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

## 📋 PHASE 2: PRODUCTION CORE MIGRATION (Continued)

### STEP 8: Worker Assignments (4 endpoints) - **NEXT!**

**Priority:** 🔴 HIGH - Worker task management and real-time updates

**Copilot'a Verilecek Prompt:**

```
MES Worker Assignments API migration: Firebase → SQL

Dosya: quote-portal/server/mesRoutes.js

Migrate edilecek endpoints:
1. GET /api/mes/worker-assignments
2. GET /api/mes/worker-assignments/:workerId
3. POST /api/mes/worker-assignments/:id/start
4. POST /api/mes/worker-assignments/:id/complete

ÖNEMLİ: Bu endpoints launch sırasında oluşturulmuş assignments'ları yönetir!

Schema:
```sql
mes.worker_assignments (
  id SERIAL PRIMARY KEY,
  plan_id TEXT (FK → production_plans),
  node_id INTEGER (FK → production_plan_nodes),
  worker_id TEXT (FK → workers),
  substation_id TEXT (FK → substations),
  operation_id TEXT (FK → operations),
  status TEXT (pending|in_progress|completed|paused),
  estimated_start_time TIMESTAMPTZ,
  estimated_end_time TIMESTAMPTZ,
  actual_start_time TIMESTAMPTZ,
  actual_end_time TIMESTAMPTZ,
  sequence_number INTEGER, -- Queue position (1, 2, 3...)
  created_at TIMESTAMPTZ
)
```

YENİ KOD:
```javascript
// GET all assignments (for supervisor dashboard)
router.get('/worker-assignments', withAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        wa.*,
        w.name as worker_name,
        w.employee_id,
        s.name as substation_name,
        s.code as substation_code,
        o.name as operation_name,
        p.id as plan_id,
        pn.name as node_name
      FROM mes.worker_assignments wa
      JOIN mes.workers w ON w.id = wa.worker_id
      JOIN mes.substations s ON s.id = wa.substation_id
      JOIN mes.operations o ON o.id = wa.operation_id
      JOIN mes.production_plans p ON p.id = wa.plan_id
      JOIN mes.production_plan_nodes pn ON pn.id = wa.node_id
      WHERE wa.status IN ('pending', 'in_progress', 'queued')
      ORDER BY wa.estimated_start_time ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching worker assignments:', error);
    res.status(500).json({ error: 'Failed to fetch worker assignments' });
  }
});

// GET assignments for specific worker (worker's own view)
router.get('/worker-assignments/:workerId', withAuth, async (req, res) => {
  const { workerId } = req.params;
  
  try {
    const result = await pool.query(`
      SELECT 
        wa.*,
        s.name as substation_name,
        s.code as substation_code,
        o.name as operation_name,
        p.id as plan_id,
        pn.name as node_name,
        pn.output_code,
        pn.quantity as node_quantity
      FROM mes.worker_assignments wa
      JOIN mes.substations s ON s.id = wa.substation_id
      JOIN mes.operations o ON o.id = wa.operation_id
      JOIN mes.production_plans p ON p.id = wa.plan_id
      JOIN mes.production_plan_nodes pn ON pn.id = wa.node_id
      WHERE wa.worker_id = $1
        AND wa.status IN ('pending', 'in_progress', 'queued')
      ORDER BY wa.sequence_number ASC
    `, [workerId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching worker assignments:', error);
    res.status(500).json({ error: 'Failed to fetch worker assignments' });
  }
});

// POST start assignment (worker starts task)
router.post('/worker-assignments/:id/start', withAuth, async (req, res) => {
  const { id } = req.params;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Get assignment details
    const assignment = await client.query(
      'SELECT * FROM mes.worker_assignments WHERE id = $1',
      [id]
    );
    
    if (assignment.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    const task = assignment.rows[0];
    
    // Verify status is pending
    if (task.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: `Cannot start assignment with status ${task.status}` 
      });
    }
    
    // Update assignment to in_progress
    await client.query(`
      UPDATE mes.worker_assignments
      SET 
        status = 'in_progress',
        actual_start_time = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `, [id]);
    
    // Update substation status
    await client.query(`
      UPDATE mes.substations
      SET 
        status = 'in_use',
        current_assignment_id = $1,
        updated_at = NOW()
      WHERE id = $2
    `, [id, task.substation_id]);
    
    // Update node status
    await client.query(`
      UPDATE mes.production_plan_nodes
      SET 
        status = 'in_progress',
        actual_start_time = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `, [task.node_id]);
    
    // TODO: Reserve materials (FIFO deduction)
    // This will be implemented in materials management phase
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      id,
      status: 'in_progress',
      startedAt: new Date()
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error starting assignment:', error);
    res.status(500).json({ error: 'Failed to start assignment' });
  } finally {
    client.release();
  }
});

// POST complete assignment (worker finishes task)
router.post('/worker-assignments/:id/complete', withAuth, async (req, res) => {
  const { id } = req.params;
  const { actualQuantity, notes } = req.body;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Get assignment details
    const assignment = await client.query(
      'SELECT * FROM mes.worker_assignments WHERE id = $1',
      [id]
    );
    
    if (assignment.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    const task = assignment.rows[0];
    
    // Verify status is in_progress
    if (task.status !== 'in_progress') {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: `Cannot complete assignment with status ${task.status}` 
      });
    }
    
    // Update assignment to completed
    await client.query(`
      UPDATE mes.worker_assignments
      SET 
        status = 'completed',
        actual_end_time = NOW(),
        actual_quantity = $1,
        notes = $2,
        updated_at = NOW()
      WHERE id = $3
    `, [actualQuantity, notes, id]);
    
    // Free substation
    await client.query(`
      UPDATE mes.substations
      SET 
        status = 'available',
        current_assignment_id = NULL,
        updated_at = NOW()
      WHERE id = $1
    `, [task.substation_id]);
    
    // Update node status
    await client.query(`
      UPDATE mes.production_plan_nodes
      SET 
        status = 'completed',
        actual_end_time = NOW(),
        actual_quantity = $1,
        updated_at = NOW()
      WHERE id = $2
    `, [actualQuantity, task.node_id]);
    
    // Activate next queued task for this worker (if any)
    await client.query(`
      UPDATE mes.worker_assignments
      SET 
        status = 'pending',
        updated_at = NOW()
      WHERE worker_id = $1
        AND sequence_number = (
          SELECT MIN(sequence_number)
          FROM mes.worker_assignments
          WHERE worker_id = $1
            AND status = 'queued'
        )
        AND status = 'queued'
    `, [task.worker_id]);
    
    // TODO: Create WIP output record (lot tracking)
    // This will be implemented in materials management phase
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      id,
      status: 'completed',
      completedAt: new Date()
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error completing assignment:', error);
    res.status(500).json({ error: 'Failed to complete assignment' });
  } finally {
    client.release();
  }
});
```

Özel Notlar:
- **Start**: Material reservation yapılacak (future phase)
- **Complete**: WIP output kaydı oluşturulacak (future phase)
- **Queue activation**: Worker tamamlayınca sıradaki task otomatik pending olur
- **Substation management**: Status güncellemeleri senkronize
- **Transaction safety**: Tüm statuslar atomik güncellenir

Test:
```bash
# Get all assignments
curl http://localhost:3000/api/mes/worker-assignments

# Get worker's tasks
curl http://localhost:3000/api/mes/worker-assignments/W-001

# Start task
curl -X POST http://localhost:3000/api/mes/worker-assignments/1/start

# Complete task
curl -X POST http://localhost:3000/api/mes/worker-assignments/1/complete \
  -H "Content-Type: application/json" \
  -d '{"actualQuantity":1000,"notes":"Completed successfully"}'
```
```

**Beklenen Sonuç:**
- ✅ 4 endpoint SQL kullanıyor
- ✅ Worker queue otomatik ilerliyor
- ✅ Substation status senkronize
- ✅ Transaction safety var
- ✅ Ready for materials integration

---

### STEP 9: Work Packages (6 endpoints)

**Placeholder** - Will be implemented after Worker Assignments

---

### STEP 10: Templates (3 endpoints)

**Placeholder** - Will be implemented after Work Packages

---

## 📋 PHASE 3: SUPPORTING FEATURES MIGRATION

Materials, Alerts, Metrics, Master Data endpoints - basit CRUD pattern'leri.

---

## ✅ MIGRATION PROGRESS CHECKLIST

### Phase 1: Core Master Data (19 endpoints) ✅ COMPLETE

- [x] STEP 1: Operations (2 endpoints)
- [x] STEP 2: Workers (4 endpoints)
- [x] STEP 3: Stations (4 endpoints)
- [x] STEP 3.5: Skills (4 endpoints) - Key-based system
- [x] STEP 4: Substations (4 endpoints)
- [x] STEP 5: Approved Quotes GET (1 endpoint)
- [x] **Total: 19/19 endpoints ✅**

### Phase 2: Production Core (25 endpoints) 🔄 IN PROGRESS (13/25)

- [x] STEP 6: Work Orders (5 endpoints) ✅
- [x] STEP 7: Production Plans (8 endpoints) ✅ **MOST COMPLEX**
- [ ] STEP 8: Worker Assignments (4 endpoints) ⏳ **NEXT**
- [ ] STEP 9: Work Packages (6 endpoints)
- [ ] STEP 10: Templates (2 endpoints)
- [ ] **Progress: 13/25 endpoints (52%)**

### Phase 3: Supporting Features (12 endpoints) ⏳ PENDING

- [ ] Materials (4 endpoints)
- [ ] Master Data (2 endpoints)
- [ ] Templates GET (1 endpoint)
- [ ] Alerts (1 endpoint)
- [ ] Metrics (2 endpoints)
- [ ] Approved Quotes POST (2 endpoints)

### Overall Migration Status

**Total Endpoints:** 60  
**Completed:** 27 (45%) ✅  
**In Progress:** STEP 8 - Worker Assignments  
**Remaining:** 33 endpoints

**Database Migrations:**
- [x] Migrations 022-038 (Core schema)
- [x] Migration 039 (node_stations)
- [x] Migration 043 (worker_assignments enhancements)
- [x] Migration 044 (node_predecessors)
- [x] Migration 045 (INTEGER FK fixes)

**Key Achievements:**
- ✅ 27 endpoints migrated to PostgreSQL
- ✅ Enhanced launch algorithm with 7 helper functions
- ✅ Concurrent launch prevention (database locks)
- ✅ Shift-aware worker scheduling
- ✅ Queue management system
- ✅ Parallel node execution (topological sort)
- ✅ Transaction safety throughout
- ✅ Comprehensive testing and documentation

---

## ✅ FINAL MIGRATION CHECKLIST (When All Complete)

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
**Versiyon:** 2.0 - Phase 1-2 In Progress (27/60 endpoints complete)  
**Durum:** 🔄 Active Development - STEP 8 Ready

**Hazırlayan:** AI Assistant  
**Takip Eden:** Copilot (step-by-step execution)

---

## 📚 Related Documentation

- **[COMPLETED-PRODUCTION-PLANS-IMPLEMENTATION-GUIDE.md](./COMPLETED-PRODUCTION-PLANS-IMPLEMENTATION-GUIDE.md)** - Detailed STEP 7 implementation with enhanced launch algorithm, helper functions, migrations, and testing results

---

*Bu guide'daki her STEP Copilot'a verilmeye hazır. Her prompt'u kopyala-yapıştır yaparak 3 fazlı geçişi tamamlayın.*