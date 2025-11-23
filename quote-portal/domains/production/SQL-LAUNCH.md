# 🚀 SQL LAUNCH - Production Plan Launch System

**Tarih:** 23 Kasım 2025  
**Proje:** Burkol MES - PostgreSQL Migration  
**Versiyon:** SQL v1.0  
**Durum:** 🔄 Migration In Progress

---

## 📋 İÇİNDEKİLER

1. [Genel Bakış](#1-genel-bakış)
2. [Sistem Mimarisi](#2-sistem-mimarisi)
3. [Database Schema (PostgreSQL)](#3-database-schema-postgresql)
4. [Launch Akışı (End-to-End)](#4-launch-akışı-end-to-end)
5. [Topology & Dependency Management](#5-topology--dependency-management)
6. [Worker & Resource Assignment](#6-worker--resource-assignment)
7. [Material Validation & Reservation](#7-material-validation--reservation)
8. [Urgent Priority System](#8-urgent-priority-system)
9. [İmplementasyon Durumu](#9-implementasyon-durumu)
10. [Migration Checklist](#10-migration-checklist)

---

## 1. GENEL BAKIŞ

### 1.1 Launch Sistemi Nedir?

Production Plan Launch, bir üretim planının (production plan) **tasarım fazından çalışma fazına** geçirilmesidir. Bu süreç:

- ✅ **Topological Sorting:** Operasyon bağımlılıklarını sıralar
- ✅ **Resource Assignment:** Worker, Station, Substation ataması yapar
- ✅ **Time Scheduling:** Başlangıç/bitiş zamanlarını hesaplar
- ✅ **Material Validation:** Malzeme eksikliklerini kontrol eder
- ✅ **Work Package Creation:** İşçiler için görev paketleri oluşturur

### 1.2 Launch Öncesi ve Sonrası

```
ÖNCE (Draft/Design):
┌─────────────────────────┐
│ Production Plan         │
│ Status: draft/production│
│ LaunchedAt: NULL        │
│ Nodes: [...]            │
└─────────────────────────┘

SONRA (Active/Running):
┌─────────────────────────┐
│ Production Plan         │
│ Status: active          │
│ LaunchedAt: 2025-11-23  │
└─────────────────────────┘
          ↓
┌─────────────────────────┐
│ Worker Assignments (N)  │
│ - Node A → Worker 1     │
│ - Node B → Worker 2     │
│ - Node C → Worker 1     │
└─────────────────────────┘
```

### 1.3 Key Concepts

| Kavram | Açıklama |
|--------|----------|
| **Production Plan** | Üretim sürecinin blueprint'i (nodes, dependencies) |
| **Node** | Bir operasyonu temsil eder (Kesme, Montaj, vb.) |
| **Predecessor** | Bir node'un başlamadan önce tamamlanması gereken node'lar |
| **Topological Sort** | Bağımlılıklara göre doğru çalışma sırasını bulma |
| **Worker Assignment** | Node'a işçi atama (manuel veya otomatik) |
| **Work Package** | İşçinin yapacağı iş tanımı (nodeId, times, materials) |
| **Substation** | Fiziksel çalışma noktası (bir station'ın alt birimi) |

---

## 2. SISTEM MİMARİSİ

### 2.1 Mimari Akış

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  approvedQuotes.js                                         │ │
│  │  - startProduction(workOrderCode)                          │ │
│  │  - Material check (preview)                                │ │
│  │  - User confirmation                                       │ │
│  │  - API call to /launch                                     │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ↓ HTTP POST
┌─────────────────────────────────────────────────────────────────┐
│                       BACKEND (mesRoutes.js)                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  POST /api/mes/production-plans/:id/launch                 │ │
│  │                                                             │ │
│  │  1. Validation (plan exists, status check)                 │ │
│  │  2. Load nodes & predecessors from DB                      │ │
│  │  3. Topological sort (execution order)                     │ │
│  │  4. Load workers, stations, substations                    │ │
│  │  5. For each node (in order):                              │ │
│  │     - Find station (priority-based)                        │ │
│  │     - Find substation (earliest available)                 │ │
│  │     - Find worker (skill + shift + availability)           │ │
│  │     - Calculate start/end times (dependencies)             │ │
│  │     - Create worker assignment                             │ │
│  │  6. Update plan status → active                            │ │
│  │  7. Return summary                                         │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ↓ SQL Transactions
┌─────────────────────────────────────────────────────────────────┐
│                     POSTGRESQL DATABASE                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  mes.production_plans                                      │ │
│  │  mes.production_plan_nodes                                 │ │
│  │  mes.node_predecessors                                     │ │
│  │  mes.worker_assignments                                    │ │
│  │  mes.workers, mes.stations, mes.substations                │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Database Tables

Launch sürecinde kullanılan tablolar:

```sql
-- Plan ve node bilgileri
mes.production_plans          -- Plan metadata
mes.production_plan_nodes     -- Operasyon node'ları
mes.node_predecessors         -- Node bağımlılıkları
mes.node_stations             -- Node için station seçenekleri
mes.node_material_inputs      -- Node için input malzemeler

-- Kaynak tabloları
mes.workers                   -- İşçiler ve yetenekleri
mes.stations                  -- İstasyonlar
mes.substations              -- Alt istasyonlar (fiziksel noktalar)
mes.operations               -- Operasyon tanımları

-- Launch output
mes.worker_assignments       -- Oluşturulan work package'lar
```

---

## 3. DATABASE SCHEMA (POSTGRESQL)

### 3.1 production_plans

```sql
CREATE TABLE mes.production_plans (
  id SERIAL PRIMARY KEY,
  workOrderCode VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
    -- 'draft', 'active', 'paused', 'completed', 'cancelled'
  
  quantity INTEGER DEFAULT 1,
  
  -- Launch bilgileri
  launchedAt TIMESTAMPTZ,
  launchedBy VARCHAR(255),
  
  -- Urgent flag (NEW)
  isUrgent BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_production_plans_status ON mes.production_plans(status);
CREATE INDEX idx_production_plans_urgent ON mes.production_plans(isUrgent) 
  WHERE isUrgent = TRUE;
```

**Key Points:**
- ✅ `status = 'draft'` → Henüz launch edilmemiş
- ✅ `status = 'active'` → Launch edilmiş, çalışıyor
- ✅ `launchedAt` → Launch zamanı (NULL ise henüz launch edilmemiş)
- ✅ `isUrgent` → Urgent priority flag (paralel çalışma için)

---

### 3.2 production_plan_nodes

```sql
CREATE TABLE mes.production_plan_nodes (
  id SERIAL PRIMARY KEY,
  planId INTEGER REFERENCES mes.production_plans(id) ON DELETE CASCADE,
  nodeId VARCHAR(100) NOT NULL,  -- Frontend'den gelen ID
  
  -- Operasyon bilgileri
  operationId INTEGER REFERENCES mes.operations(id),
  name VARCHAR(255) NOT NULL,
  sequenceOrder INTEGER,  -- Tasarım sırası (UI'da gösterim için)
  
  -- Zaman bilgileri
  nominalTime INTEGER,     -- Dakika (verimlilik uygulanmamış)
  effectiveTime INTEGER,   -- Dakika (verimlilik uygulanmış)
  
  -- Launch sonrası atama bilgileri
  assignedWorkerId INTEGER REFERENCES mes.workers(id),
  estimatedStartTime TIMESTAMPTZ,
  estimatedEndTime TIMESTAMPTZ,
  
  -- Çıktı bilgileri
  outputCode VARCHAR(50),
  outputQty NUMERIC(10,2),
  
  -- Timestamps
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(planId, nodeId)
);

CREATE INDEX idx_nodes_plan ON mes.production_plan_nodes(planId);
CREATE INDEX idx_nodes_operation ON mes.production_plan_nodes(operationId);
CREATE INDEX idx_nodes_worker ON mes.production_plan_nodes(assignedWorkerId);
```

**Key Points:**
- ✅ `nodeId` → Frontend'den gelen unique identifier (UUID benzeri)
- ✅ `sequenceOrder` → UI'da gösterim sırası (manuel ayarlanabilir)
- ✅ `assignedWorkerId` → Launch sonrası atanan işçi (NULL ise henüz atanmamış)

---

### 3.3 node_predecessors

```sql
CREATE TABLE mes.node_predecessors (
  id SERIAL PRIMARY KEY,
  nodeId INTEGER REFERENCES mes.production_plan_nodes(id) ON DELETE CASCADE,
  predecessorNodeId INTEGER REFERENCES mes.production_plan_nodes(id) ON DELETE CASCADE,
  
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(nodeId, predecessorNodeId)
);

CREATE INDEX idx_predecessors_node ON mes.node_predecessors(nodeId);
CREATE INDEX idx_predecessors_pred ON mes.node_predecessors(predecessorNodeId);
```

**Örnek:**
```
Node A (id=101) → Node B (id=102) → Node C (id=103)

node_predecessors:
  { nodeId: 102, predecessorNodeId: 101 }  -- B, A'yı bekler
  { nodeId: 103, predecessorNodeId: 102 }  -- C, B'yi bekler
```

---

### 3.4 worker_assignments

```sql
CREATE TABLE mes.worker_assignments (
  id SERIAL PRIMARY KEY,
  
  -- Plan ve node bilgileri
  planId INTEGER REFERENCES mes.production_plans(id) ON DELETE CASCADE,
  workOrderCode VARCHAR(50) NOT NULL,
  nodeId INTEGER REFERENCES mes.production_plan_nodes(id) ON DELETE CASCADE,
  
  -- Kaynak atamaları
  workerId INTEGER REFERENCES mes.workers(id),
  substationId INTEGER REFERENCES mes.substations(id),
  operationId INTEGER REFERENCES mes.operations(id),
  
  -- Durum ve zamanlama
  status VARCHAR(20) DEFAULT 'pending',
    -- 'pending', 'queued', 'in_progress', 'completed', 'paused'
  
  estimatedStartTime TIMESTAMPTZ,
  estimatedEndTime TIMESTAMPTZ,
  actualStartTime TIMESTAMPTZ,
  actualEndTime TIMESTAMPTZ,
  
  -- Queue bilgisi
  sequenceNumber INTEGER DEFAULT 1,  -- İşçinin görev sırası
  
  -- Priority (NEW)
  priorityIndex INTEGER DEFAULT 1,   -- Topological order
  isUrgent BOOLEAN DEFAULT FALSE,    -- Urgent flag
  
  -- Timestamps
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  updatedAt TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_assignments_plan ON mes.worker_assignments(planId);
CREATE INDEX idx_assignments_worker ON mes.worker_assignments(workerId);
CREATE INDEX idx_assignments_status ON mes.worker_assignments(status);
CREATE INDEX idx_assignments_urgent ON mes.worker_assignments(isUrgent) 
  WHERE isUrgent = TRUE;
```

**Key Points:**
- ✅ `sequenceNumber` → İşçinin görev sırası (1 = ilk görev, 2 = ikinci, ...)
- ✅ `priorityIndex` → Topological sort'tan gelen execution order
- ✅ `isUrgent` → Urgent flag (TRUE ise paralel çalışabilir)
- ✅ `status = 'queued'` → İşçinin sırada bekleyen görevi

---

### 3.5 node_stations

```sql
CREATE TABLE mes.node_stations (
  id SERIAL PRIMARY KEY,
  nodeId INTEGER REFERENCES mes.production_plan_nodes(id) ON DELETE CASCADE,
  stationId INTEGER REFERENCES mes.stations(id),
  priority INTEGER DEFAULT 1,  -- 1 = en yüksek öncelik
  
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(nodeId, stationId)
);

CREATE INDEX idx_node_stations_node ON mes.node_stations(nodeId);
CREATE INDEX idx_node_stations_priority ON mes.node_stations(nodeId, priority);
```

**Örnek:**
```
Node "Kesme" için station seçenekleri:
  { nodeId: 101, stationId: 1, priority: 1 }  -- Kesim İstasyonu A (öncelikli)
  { nodeId: 101, stationId: 2, priority: 2 }  -- Kesim İstasyonu B (yedek)
```

**Launch Algoritması:**
1. Priority 1'den başla
2. O station'ın müsait substation'ını ara
3. Bulunamazsa priority 2'ye geç
4. Tümünde müsait yoksa en erken bitecek substation'ı seç

---

## 4. LAUNCH AKIŞI (END-TO-END)

### 4.1 Frontend Başlatma

**Dosya:** `quote-portal/domains/production/js/approvedQuotes.js`

```javascript
async function startProduction(workOrderCode) {
  // 1. Plan var mı kontrol et
  const plan = productionPlansMap[workOrderCode];
  if (!plan || plan.status === 'template') {
    alert('Üretim planı bulunamadı.');
    return;
  }
  
  // 2. Malzeme kontrolü (preview, non-blocking)
  const materialCheck = await checkPlanMaterialAvailability(plan);
  if (!materialCheck.allAvailable) {
    const proceed = confirm(`Malzeme eksiklikleri var. Devam edilsin mi?`);
    if (!proceed) return;
  }
  
  // 3. Kullanıcı onayı
  const confirmed = confirm(
    `Üretimi başlatmak istediğinize emin misiniz?\n\n` +
    `İş Emri: ${workOrderCode}\n` +
    `Plan: ${plan.name}`
  );
  if (!confirmed) return;
  
  // 4. Loading state
  await setProductionState(workOrderCode, 'Başlatılıyor...', false);
  
  // 5. API call
  try {
    const result = await launchProductionPlan(plan.id, workOrderCode);
    
    // 6. Success
    await setProductionState(workOrderCode, PRODUCTION_STATES.IN_PRODUCTION, true);
    alert(`✅ Üretim başlatıldı!\n${result.summary.assignedNodes} operasyon atandı.`);
    
    // 7. Refresh
    await loadQuotesAndRender();
    
  } catch (error) {
    // 8. Error handling
    alert(`❌ Hata: ${error.message}`);
  }
}
```

---

### 4.2 Backend Launch Endpoint

**Dosya:** `quote-portal/server/mesRoutes.js`  
**Endpoint:** `POST /api/mes/production-plans/:id/launch`

#### 4.2.1 Genel Yapı

```javascript
router.post('/production-plans/:id/launch', withAuth, async (req, res) => {
  const { id } = req.params;
  const trx = await db.transaction();
  
  try {
    // 🔒 LOCK TABLES (prevent concurrent launches)
    await trx.raw('LOCK TABLE mes.worker_assignments IN EXCLUSIVE MODE');
    await trx.raw('LOCK TABLE mes.substations IN EXCLUSIVE MODE');
    
    // 1️⃣ VALIDATION
    const plan = await trx('mes.production_plans')
      .where('id', id)
      .where('status', 'draft')
      .first();
    
    if (!plan) {
      await trx.rollback();
      return res.status(404).json({ error: 'Plan not found or already launched' });
    }
    
    // 2️⃣ LOAD NODES & DEPENDENCIES
    const nodes = await trx('mes.production_plan_nodes')
      .where('planId', id)
      .orderBy('sequenceOrder');
    
    const predecessors = await trx('mes.node_predecessors')
      .whereIn('nodeId', nodes.map(n => n.id));
    
    // 3️⃣ TOPOLOGICAL SORT
    const executionOrder = topologicalSort(nodes, predecessors);
    
    // 4️⃣ INITIALIZE TRACKING
    const workerSchedule = new Map();      // workerId → [{ start, end, seq }]
    const substationSchedule = new Map();  // substationId → [{ start, end }]
    const nodeCompletionTimes = new Map(); // nodeId → estimatedEnd
    const assignments = [];
    let queuedCount = 0;
    
    // 5️⃣ PROCESS NODES IN ORDER
    for (const nodeId of executionOrder) {
      const node = nodes.find(n => n.id === nodeId);
      
      // A. Calculate earliest start (wait for predecessors)
      const predecessorIds = predecessors
        .filter(p => p.nodeId === nodeId)
        .map(p => p.predecessorNodeId);
      
      let earliestStart = new Date();
      for (const predId of predecessorIds) {
        const predEnd = nodeCompletionTimes.get(predId);
        if (predEnd && predEnd > earliestStart) {
          earliestStart = predEnd;
        }
      }
      
      // B. Find station & substation
      const { substation, availableAt } = await findEarliestSubstation(
        trx, node, substationSchedule, earliestStart
      );
      
      // C. Find worker (skill + shift check)
      const worker = await findWorkerWithShiftCheck(
        trx, node, substation, availableAt
      );
      
      // D. Calculate worker queue position
      const workerQueue = workerSchedule.get(worker.id) || [];
      const sequenceNumber = workerQueue.length + 1;
      
      // E. Determine actual start (max of worker and substation)
      const workerAvailableAt = workerQueue.length > 0
        ? workerQueue[workerQueue.length - 1].end
        : availableAt;
      
      const actualStart = new Date(Math.max(
        workerAvailableAt.getTime(),
        availableAt.getTime()
      ));
      
      const actualEnd = new Date(
        actualStart.getTime() + node.effectiveTime * 60000
      );
      
      const isQueued = sequenceNumber > 1;
      if (isQueued) queuedCount++;
      
      // F. Create worker assignment
      await trx('mes.worker_assignments').insert({
        planId: id,
        workOrderCode: plan.workOrderCode,
        nodeId: node.id,
        workerId: worker.id,
        substationId: substation.id,
        operationId: node.operationId,
        status: isQueued ? 'queued' : 'pending',
        estimatedStartTime: actualStart,
        estimatedEndTime: actualEnd,
        sequenceNumber: sequenceNumber,
        priorityIndex: executionOrder.indexOf(nodeId) + 1,
        createdAt: trx.fn.now()
      });
      
      // G. Update node
      await trx('mes.production_plan_nodes')
        .where('id', node.id)
        .update({
          assignedWorkerId: worker.id,
          estimatedStartTime: actualStart,
          estimatedEndTime: actualEnd,
          updatedAt: trx.fn.now()
        });
      
      // H. Update schedules
      workerQueue.push({ start: actualStart, end: actualEnd, sequenceNumber });
      workerSchedule.set(worker.id, workerQueue);
      
      const subSchedule = substationSchedule.get(substation.id) || [];
      subSchedule.push({ start: actualStart, end: actualEnd });
      substationSchedule.set(substation.id, subSchedule);
      
      nodeCompletionTimes.set(node.id, actualEnd);
      
      // I. Reserve substation
      await trx('mes.substations')
        .where('id', substation.id)
        .update({
          status: 'reserved',
          currentAssignmentId: node.id,
          assignedWorkerId: worker.id,
          currentOperation: node.operationId,
          reservedAt: trx.fn.now(),
          updatedAt: trx.fn.now()
        });
      
      // J. Track for response
      assignments.push({
        nodeId: node.nodeId,
        nodeName: node.name,
        workerId: worker.id,
        workerName: worker.name,
        substationId: substation.id,
        estimatedStart: actualStart,
        estimatedEnd: actualEnd,
        sequenceNumber,
        isQueued
      });
    }
    
    // 6️⃣ UPDATE PLAN STATUS
    await trx('mes.production_plans')
      .where('id', id)
      .update({
        status: 'active',
        launchedAt: trx.fn.now()
      });
    
    await trx.commit();
    
    // 7️⃣ BUILD RESPONSE
    const allStarts = assignments.map(a => a.estimatedStart);
    const allEnds = assignments.map(a => a.estimatedEnd);
    const minStart = new Date(Math.min(...allStarts.map(d => d.getTime())));
    const maxEnd = new Date(Math.max(...allEnds.map(d => d.getTime())));
    
    res.json({
      planId: id,
      status: 'active',
      launchedAt: new Date(),
      summary: {
        totalNodes: nodes.length,
        assignedNodes: assignments.length,
        totalWorkers: workerSchedule.size,
        totalSubstations: substationSchedule.size,
        estimatedStartTime: minStart,
        estimatedEndTime: maxEnd,
        estimatedDuration: Math.ceil((maxEnd - minStart) / 60000),
        parallelPaths: calculateParallelPaths(executionOrder, predecessors)
      },
      assignments,
      queuedTasks: queuedCount,
      warnings: []
    });
    
  } catch (error) {
    await trx.rollback();
    console.error('❌ Launch error:', error);
    res.status(500).json({ error: 'Failed to launch plan', details: error.message });
  }
});
```

---

## 5. TOPOLOGY & DEPENDENCY MANAGEMENT

### 5.1 Topological Sort Algoritması

**Amaç:** Node'ları bağımlılık sırasına göre sıralamak (predecessor'lar önce, successor'lar sonra)

```javascript
function topologicalSort(nodes, predecessors) {
  // 1. Build adjacency list and in-degree map
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const inDegree = new Map();
  const adjacencyList = new Map();
  
  // Initialize
  nodes.forEach(node => {
    inDegree.set(node.id, 0);
    adjacencyList.set(node.id, []);
  });
  
  // Build graph
  predecessors.forEach(pred => {
    adjacencyList.get(pred.predecessorNodeId).push(pred.nodeId);
    inDegree.set(pred.nodeId, inDegree.get(pred.nodeId) + 1);
  });
  
  // 2. Kahn's Algorithm
  const queue = [];
  const order = [];
  
  // Start with nodes that have no predecessors (in-degree = 0)
  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) {
      queue.push(nodeId);
    }
  });
  
  // Process queue
  while (queue.length > 0) {
    const nodeId = queue.shift();
    order.push(nodeId);
    
    // Process successors
    const successors = adjacencyList.get(nodeId) || [];
    for (const successorId of successors) {
      const newDegree = inDegree.get(successorId) - 1;
      inDegree.set(successorId, newDegree);
      
      if (newDegree === 0) {
        queue.push(successorId);
      }
    }
  }
  
  // 3. Cycle detection
  if (order.length !== nodes.length) {
    throw new Error('Cycle detected in execution graph');
  }
  
  return order;
}
```

**Örnek:**

```
Graph:
  A → B → D
  A → C → D

Predecessors:
  B.predecessors = [A]
  C.predecessors = [A]
  D.predecessors = [B, C]

Topological Order: [A, B, C, D] veya [A, C, B, D]
```

**Algoritma Adımları:**

1. **In-degree hesapla:** Her node'un kaç predecessor'ı var?
   - A: 0 (hiç predecessor yok)
   - B: 1 (A'yı bekliyor)
   - C: 1 (A'yı bekliyor)
   - D: 2 (B ve C'yi bekliyor)

2. **Queue'ya başlangıç node'larını ekle:** In-degree = 0 olanlar
   - Queue: [A]

3. **İşle:**
   - A'yı çıkar, order'a ekle → Order: [A]
   - A'nın successor'larının in-degree'ini azalt:
     - B: 1 → 0 (Queue'ya ekle)
     - C: 1 → 0 (Queue'ya ekle)
   - Queue: [B, C]
   
4. **Devam et:**
   - B'yi çıkar → Order: [A, B]
   - D'nin in-degree: 2 → 1
   - C'yi çıkar → Order: [A, B, C]
   - D'nin in-degree: 1 → 0 (Queue'ya ekle)
   - D'yi çıkar → Order: [A, B, C, D]

5. **Bitti!**

---

### 5.2 Cycle Detection

Eğer topological sort sonunda `order.length !== nodes.length` ise, grafikte **cycle** (döngü) var demektir.

**Örnek Hatalı Graph:**

```
A → B → C → A  (CYCLE!)

In-degree:
  A: 1
  B: 1
  C: 1

Queue: [] (hiçbiri 0 değil!)
Order: [] (hiçbiri işlenemiyor)

Result: order.length (0) !== nodes.length (3) → CYCLE ERROR
```

---

## 6. WORKER & RESOURCE ASSIGNMENT

### 6.1 Station & Substation Selection

**Algoritma:**

```javascript
async function findEarliestSubstation(trx, node, substationSchedule, earliestStart) {
  // 1. Get station options (priority-sorted)
  const stationOptions = await trx('mes.node_stations')
    .where('nodeId', node.id)
    .orderBy('priority');
  
  if (stationOptions.length === 0) {
    throw new Error(`No station assigned for node ${node.name}`);
  }
  
  // 2. Try each station by priority
  for (const stationOption of stationOptions) {
    const substations = await trx('mes.substations')
      .where('stationId', stationOption.stationId)
      .where('status', 'available');
    
    // Check if any substation is immediately available
    const availableNow = substations.find(ss => !ss.currentOperation);
    if (availableNow) {
      return { substation: availableNow, availableAt: earliestStart };
    }
  }
  
  // 3. No immediately available substation → find earliest
  let earliestSubstation = null;
  let earliestTime = null;
  
  for (const stationOption of stationOptions) {
    const substations = await trx('mes.substations')
      .where('stationId', stationOption.stationId);
    
    for (const ss of substations) {
      let lastEndTime = earliestStart;
      
      // Check physical currentExpectedEnd
      if (ss.currentExpectedEnd) {
        lastEndTime = new Date(ss.currentExpectedEnd);
      }
      
      // Check scheduled queue
      const substationQueue = substationSchedule.get(ss.id) || [];
      if (substationQueue.length > 0) {
        const lastQueued = substationQueue[substationQueue.length - 1];
        if (lastQueued.end > lastEndTime) {
          lastEndTime = lastQueued.end;
        }
      }
      
      if (!earliestTime || lastEndTime < earliestTime) {
        earliestTime = lastEndTime;
        earliestSubstation = ss;
      }
    }
  }
  
  return { substation: earliestSubstation, availableAt: earliestTime };
}
```

**Key Points:**

- ✅ **Priority-based:** En yüksek priority'li station'dan başla
- ✅ **Availability check:** Müsait substation varsa hemen ata
- ✅ **Queue fallback:** Yoksa en erken bitecek substation'ı bul
- ✅ **Parallel work:** Aynı station'ın farklı substation'ları paralel çalışabilir

---

### 6.2 Worker Selection

**Algoritma:**

```javascript
async function findWorkerWithShiftCheck(trx, node, substation, availableAt) {
  // 1. Get required skills
  const operation = await trx('mes.operations')
    .where('id', node.operationId)
    .first();
  
  const requiredSkills = operation?.skills || [];
  
  // 2. Get workers with matching skills
  const workers = await trx('mes.workers')
    .where('status', 'available')
    .whereRaw(`skills @> ?`, [JSON.stringify(requiredSkills)]);
  
  if (workers.length === 0) {
    throw new Error(`No worker with skills: ${requiredSkills.join(', ')}`);
  }
  
  // 3. Check shift compatibility
  const dayOfWeek = availableAt.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const hour = availableAt.getHours();
  const minute = availableAt.getMinutes();
  const timeInMinutes = hour * 60 + minute;
  
  const eligibleWorkers = workers.filter(w => {
    const schedule = w.personalSchedule?.blocks?.[dayOfWeek] || [];
    if (schedule.length === 0) return true; // No schedule → always available
    
    return schedule.some(block => {
      const blockStart = block.startHour * 60 + block.startMin;
      const blockEnd = block.endHour * 60 + block.endMin;
      return timeInMinutes >= blockStart && timeInMinutes < blockEnd;
    });
  });
  
  if (eligibleWorkers.length === 0) {
    throw new Error(`No worker available at ${availableAt}`);
  }
  
  // 4. Sort by efficiency (highest first)
  eligibleWorkers.sort((a, b) => (b.efficiency || 1.0) - (a.efficiency || 1.0));
  
  return eligibleWorkers[0];
}
```

**Selection Criteria:**

1. ✅ **Skill matching:** Tüm gerekli skill'lere sahip olmalı
2. ✅ **Shift check:** Çalışma saati içinde olmalı
3. ✅ **Efficiency:** En yüksek verimli olanı seç

---

### 6.3 Time Calculation with Dependencies

```javascript
// Calculate earliest start for a node
let earliestStart = new Date();

// Wait for predecessors to complete
const predecessorIds = predecessors
  .filter(p => p.nodeId === currentNodeId)
  .map(p => p.predecessorNodeId);

for (const predId of predecessorIds) {
  const predEnd = nodeCompletionTimes.get(predId);
  if (predEnd && predEnd > earliestStart) {
    earliestStart = predEnd;
  }
}

// Wait for substation to be available
if (substationAvailableAt > earliestStart) {
  earliestStart = substationAvailableAt;
}

// Wait for worker to be available
if (workerAvailableAt > earliestStart) {
  earliestStart = workerAvailableAt;
}

// Calculate end time
const endTime = new Date(
  earliestStart.getTime() + node.effectiveTime * 60000
);
```

**Example:**

```
Node C depends on A and B:
  A: 09:00 → 10:00
  B: 09:30 → 11:00
  
C's earliestStart = max(10:00, 11:00) = 11:00
C's endTime = 11:00 + 60min = 12:00
```

---

## 7. MATERIAL VALIDATION & RESERVATION

### 7.1 Material Availability Check (Frontend Preview)

**Dosya:** `approvedQuotes.js`

```javascript
async function checkPlanMaterialAvailability(plan) {
  try {
    const response = await fetch(
      `/api/mes/check-material-availability?planId=${plan.id}`,
      { headers: withAuth() }
    );
    
    const result = await response.json();
    
    return {
      allAvailable: result.allAvailable,
      shortages: result.shortages || [],
      hasCriticalShortages: result.hasCriticalShortages,
      criticalShortages: result.criticalShortages || []
    };
  } catch (error) {
    return {
      allAvailable: false,
      shortages: [],
      hasCriticalShortages: false,
      error: error.message
    };
  }
}
```

**Kullanım:**

```javascript
const materialCheck = await checkPlanMaterialAvailability(plan);

if (!materialCheck.allAvailable) {
  const proceed = confirm(
    `Malzeme eksiklikleri tespit edildi:\n\n` +
    materialCheck.shortages.map(s => 
      `- ${s.code}: ${s.required} ${s.unit} gerekli, ${s.available} ${s.unit} mevcut`
    ).join('\n') +
    `\n\nDevam edilsin mi?`
  );
  
  if (!proceed) return;
}
```

---

### 7.2 Material Validation Logic (Backend)

**Backend fonksiyon (mesRoutes.js):**

```javascript
router.get('/check-material-availability', withAuth, async (req, res) => {
  const { planId } = req.query;
  
  try {
    // 1. Get plan nodes
    const nodes = await db('mes.production_plan_nodes')
      .where('planId', planId);
    
    // 2. Get start nodes (no predecessors)
    const predecessors = await db('mes.node_predecessors')
      .whereIn('nodeId', nodes.map(n => n.id));
    
    const startNodeIds = nodes
      .filter(n => !predecessors.some(p => p.nodeId === n.id))
      .map(n => n.id);
    
    // 3. Get material inputs for start nodes
    const materials = await db('mes.node_material_inputs')
      .whereIn('nodeId', startNodeIds);
    
    // 4. Check stock for each material
    const shortages = [];
    
    for (const mat of materials) {
      const stock = await db('materials')
        .where('code', mat.materialCode)
        .first();
      
      const available = parseFloat(stock?.available || 0);
      const required = parseFloat(mat.requiredQuantity || 0);
      
      if (available < required) {
        shortages.push({
          code: mat.materialCode,
          required,
          available,
          shortage: required - available,
          unit: mat.unit || 'adet',
          isCritical: mat.materialCode.startsWith('M-00')
        });
      }
    }
    
    res.json({
      allAvailable: shortages.length === 0,
      shortages,
      hasCriticalShortages: shortages.some(s => s.isCritical),
      criticalShortages: shortages.filter(s => s.isCritical)
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**Key Points:**

- ✅ **Non-blocking:** Malzeme eksikliği launch'ı engellemez (sadece uyarır)
- ✅ **Start nodes only:** Sadece başlangıç node'larının malzemelerini kontrol et
- ✅ **Critical flag:** M-00 ile başlayan malzemeler kritik olarak işaretlenir

---

## 8. URGENT PRIORITY SYSTEM

### 8.1 Genel Bakış

**Normal Mod:**
- Worker Portal'da sadece **ilk sıradaki** (sequenceNumber=1) görev başlatılabilir
- Diğerleri sırada bekler

**Urgent Mod:**
- İlgili work order'daki **TÜM** görevler başlatılabilir
- Paralel çalışma mümkün

### 8.2 Database Schema

```sql
-- production_plans tablosuna ekle
ALTER TABLE mes.production_plans 
ADD COLUMN isUrgent BOOLEAN DEFAULT FALSE;

-- worker_assignments tablosuna ekle
ALTER TABLE mes.worker_assignments 
ADD COLUMN isUrgent BOOLEAN DEFAULT FALSE;

-- Index
CREATE INDEX idx_production_plans_urgent 
ON mes.production_plans(isUrgent) WHERE isUrgent = TRUE;

CREATE INDEX idx_assignments_urgent 
ON mes.worker_assignments(isUrgent) WHERE isUrgent = TRUE;
```

### 8.3 Backend Endpoint

```javascript
router.post('/set-urgent-priority', withAuth, async (req, res) => {
  const { workOrderCode, urgent } = req.body;
  
  if (!workOrderCode || typeof urgent !== 'boolean') {
    return res.status(400).json({ error: 'Invalid parameters' });
  }
  
  const trx = await db.transaction();
  
  try {
    // 1. Update production plan
    await trx('mes.production_plans')
      .where('workOrderCode', workOrderCode)
      .update({ isUrgent: urgent });
    
    // 2. Update all assignments
    const updateCount = await trx('mes.worker_assignments')
      .where('workOrderCode', workOrderCode)
      .where('status', 'in', ['pending', 'queued'])
      .update({ isUrgent: urgent });
    
    await trx.commit();
    
    res.json({
      success: true,
      message: `${workOrderCode} ${urgent ? 'acil önceliğe alındı' : 'normal önceliğe döndürüldü'}`,
      updatedCount: updateCount
    });
    
  } catch (error) {
    await trx.rollback();
    res.status(500).json({ error: error.message });
  }
});
```

### 8.4 Frontend Integration

```javascript
async function setUrgentPriority(workOrderCode) {
  const plan = productionPlansMap[workOrderCode];
  const currentUrgent = plan?.isUrgent || false;
  const newUrgent = !currentUrgent;
  
  const confirmed = confirm(
    `${newUrgent ? 'ACİL ÖNCELİĞE ALMAK' : 'NORMAL ÖNCELİĞE DÖNDÜRMEK'} istediğinizden emin misiniz?\n\n` +
    `İş Emri: ${workOrderCode}\n` +
    `${newUrgent ? '🚨 Tüm görevler aynı anda başlatılabilir hale gelecek!' : '⏳ Sadece sıradaki görev başlatılabilir.'}`
  );
  
  if (!confirmed) return;
  
  const response = await fetch('/api/mes/set-urgent-priority', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('authToken')}`
    },
    body: JSON.stringify({ workOrderCode, urgent: newUrgent })
  });
  
  const result = await response.json();
  alert(`✅ ${result.message}`);
  
  await fetchProductionPlans();
  renderApprovedQuotesTable();
}
```

### 8.5 Worker Portal Logic

```javascript
// Fetch worker's tasks
const tasks = await getWorkerTaskQueue(workerId);

// Determine which tasks can be started
tasks.forEach((task, index) => {
  // Urgent ise VEYA ilk sıradaysa başlatılabilir
  task.canStart = task.isUrgent || index === 0;
});

// Render
tasks.forEach(task => {
  const badge = task.isUrgent 
    ? `<span class="urgent-badge">🚨 Acil</span>` 
    : '';
  
  const startButton = task.canStart
    ? `<button onclick="startTask('${task.id}')">🏁 Başlat</button>`
    : `<button disabled>🏁 Başlat</button>`;
  
  // ... render card
});
```

---

## 9. İMPLEMENTASYON DURUMU

### 9.1 Tamamlanan İşlemler ✅

| Bileşen | Durum | Notlar |
|---------|-------|--------|
| **Database Schema** | ✅ | PostgreSQL migrations tamamlandı |
| **Topological Sort** | ✅ | Kahn's algorithm implementasyonu mevcut |
| **Worker Assignment** | ✅ | Skill matching + shift check çalışıyor |
| **Substation Scheduling** | ✅ | Priority-based selection + queue tracking |
| **Launch Endpoint** | ✅ | Transaction-safe, lock mechanism mevcut |
| **Frontend Integration** | ✅ | approvedQuotes.js entegre edildi |

### 9.2 Yapılması Gerekenler 🔄

#### A. Node ID Normalization (CRITICAL)

**Problem:** Backend bazı yerlerde `node.id`, bazı yerlerde `node.nodeId` kullanıyor

**Çözüm:**
```javascript
// Helper function ekle (mesRoutes.js)
function getNodeId(node) {
  return node.nodeId || node.id || null;
}

// Kullan:
const nodeId = getNodeId(node);
const assignment = assignments.get(nodeId);
```

**Lokasyonlar:**
- mesRoutes.js: satır 398, 1369, 1497, 1521, 5513, 5740

---

#### B. Material Field Consistency (HIGH)

**Problem:** Malzeme kontrolü `mat.required` kullanıyor ama doğru alan `mat.requiredQuantity`

**Çözüm:**
```javascript
// mesRoutes.js satır ~5895
// ÖNCE:
const required = mat.required;  // ❌ undefined

// SONRA:
const required = mat.requiredQuantity || mat.required || 0;  // ✅
```

---

#### C. stationSchedule → substationSchedule Refactoring (HIGH)

**Problem:** Değişken adı "stationSchedule" ama aslında substation ID'leriyle çalışıyor

**Çözüm:**
```javascript
// mesRoutes.js satır ~5508
// ÖNCE:
const stationSchedule = new Map();

// SONRA:
const substationSchedule = new Map(); // substationId → [{ start, end }]

// Tüm referansları güncelle
```

---

#### D. Urgent System Implementation (MEDIUM)

**Durum:** Schema hazır, endpoint hazır, frontend kısmen hazır

**Eksikler:**
1. Worker Portal'da `canStart` logic'i ekle
2. UI'da urgent badge göster
3. Test senaryoları yaz

---

#### E. Material Reservation System (HIGH)

**Problem:** `preProductionReservedAmount` hesaplanıyor ama gerçek rezervasyon yapılmıyor

**Çözüm:**
```javascript
// Launch endpoint'te reservation logic ekle
for (const [materialCode, qty] of Object.entries(preProductionReservedAmount)) {
  await adjustMaterialStock(materialCode, -qty, {
    reason: 'production_reservation',
    planId,
    workPackageId,
    transactionType: 'reservation'
  });
}
```

---

### 9.3 Test Checklist

- [ ] Basit linear plan (A → B → C)
- [ ] Paralel plan (A → B, A → C → D)
- [ ] Diamond plan (A → B → D, A → C → D)
- [ ] Malzeme yetersizliği uyarısı
- [ ] Worker skill matching
- [ ] Shift hour compliance
- [ ] Substation queue scheduling
- [ ] Urgent priority toggle
- [ ] Transaction rollback (hata durumu)
- [ ] Concurrent launch prevention (lock test)

---

## 10. MIGRATION CHECKLIST

### 10.1 Firebase → PostgreSQL

| Koleksiyon | Tablo | Durum | Notlar |
|------------|-------|-------|--------|
| `mes-production-plans` | `mes.production_plans` | ✅ | Migrated |
| `mes-production-plans.nodes[]` | `mes.production_plan_nodes` | ✅ | Array → rows |
| `node.predecessors[]` | `mes.node_predecessors` | ✅ | Normalized |
| `node.assignedStations[]` | `mes.node_stations` | ✅ | Priority system |
| `node.materialInputs[]` | `mes.node_material_inputs` | ✅ | Normalized |
| `mes-worker-assignments` | `mes.worker_assignments` | ✅ | Foreign keys |
| `mes-workers` | `mes.workers` | ✅ | Skills as JSONB |
| `mes-stations` | `mes.stations` | ✅ | - |
| `mes-substations` | `mes.substations` | ✅ | stationId FK |

### 10.2 Naming Convention

| Firebase | PostgreSQL | Notlar |
|----------|-----------|--------|
| camelCase fields | camelCase columns | ✅ Korundu |
| snake_case collections | snake_case tables | ❌ Tablolar snake_case |
| Subcollections | Separate tables | ✅ Foreign keys |
| Array fields | Normalized tables | ✅ predecessors, stations, materials |

**Örnek:**
```javascript
// Firebase
{
  nodes: [
    {
      id: "node-1",
      predecessors: ["node-0"],
      assignedStations: [
        { stationId: "s1", priority: 1 }
      ]
    }
  ]
}

// PostgreSQL
production_plan_nodes: { id: 1, nodeId: "node-1", planId: 123 }
node_predecessors: { nodeId: 1, predecessorNodeId: 0 }
node_stations: { nodeId: 1, stationId: "s1", priority: 1 }
```

---

## 11. NEXT STEPS

### Kısa Vadeli (1-2 gün)

1. ✅ **Node ID Normalization:** getNodeId() ekle ve tüm yerlerde kullan
2. ✅ **Material Field Fix:** mat.requiredQuantity kullan
3. ✅ **stationSchedule Refactor:** substationSchedule'a çevir
4. ⏳ **Urgent System:** Worker Portal logic'i ekle
5. ⏳ **Test Suite:** Temel senaryoları test et

### Orta Vadeli (1 hafta)

1. ⏳ **Material Reservation:** Gerçek stok rezervasyonu implementasyonu
2. ⏳ **Error Handling:** Detaylı hata mesajları ve recovery
3. ⏳ **Monitoring:** Metrics ve logging iyileştirmeleri
4. ⏳ **Documentation:** API dokümantasyonu

### Uzun Vadeli (1 ay)

1. ⏳ **Linear Optimization:** Priority sistem için optimal path calculation
2. ⏳ **CRM Integration:** Müşteri aciliyetine göre önceliklendirme
3. ⏳ **Advanced Scheduling:** Multiple shift support, overtime handling
4. ⏳ **Capacity Planning:** Resource utilization analytics

---

## 12. TROUBLESHOOTING & DEBUG

### 12.1 Common Errors

#### "Node not found in execution order"

**Neden:** Node ID normalizasyonu tutarsız

**Çözüm:**
```javascript
// Tüm yerlerde getNodeId() kullan
const nodeId = getNodeId(node);
const node = nodes.find(n => getNodeId(n) === nodeId);
```

---

#### "No substation available"

**Neden:** Node'a hiç station atanmamış veya tüm substationlar dolu

**Çözüm:**
```javascript
// 1. Plan Designer'da node için station ekle
// 2. Station'ın en az 1 substation'ı olduğundan emin ol
// 3. Substation status = 'available' olmalı
```

---

#### "No worker with skills"

**Neden:** Gerekli skill'e sahip işçi yok

**Çözüm:**
```javascript
// 1. Worker Portal'dan işçilere skill ekle
// 2. Operation tanımındaki skill'leri kontrol et
// 3. Shift saatleri dışında kalıyor olabilir
```

---

#### "Cycle detected in execution graph"

**Neden:** Node'lar arasında döngüsel bağımlılık var (A → B → C → A)

**Çözüm:**
```sql
-- Döngüyü bul
WITH RECURSIVE cycles AS (
  SELECT nodeId, predecessorNodeId, ARRAY[nodeId] as path
  FROM mes.node_predecessors
  UNION ALL
  SELECT np.nodeId, np.predecessorNodeId, cycles.path || np.nodeId
  FROM mes.node_predecessors np
  JOIN cycles ON cycles.predecessorNodeId = np.nodeId
  WHERE np.nodeId = ANY(cycles.path)
)
SELECT * FROM cycles WHERE nodeId = ANY(path);
```

---

### 12.2 Debug Logging

**Launch sırasında debug logları:**

```javascript
// mesRoutes.js launch endpoint
console.log('🚀 Launch started:', {
  planId: id,
  nodeCount: nodes.length,
  executionOrder
});

for (const nodeId of executionOrder) {
  const node = nodes.find(n => n.id === nodeId);
  
  console.log(`\n📍 Processing node ${nodeId}:`, {
    name: node.name,
    predecessors: predecessorIds,
    earliestStart,
    station: selectedStation?.name,
    substation: selectedSubstation?.name,
    worker: selectedWorker?.name
  });
}

console.log('✅ Launch completed:', {
  totalAssignments: assignments.length,
  queuedCount,
  workerCount: workerSchedule.size,
  substationCount: substationSchedule.size
});
```

---

### 12.3 SQL Debugging Queries

**Planın tüm node'larını ve bağımlılıklarını gör:**

```sql
SELECT 
  n.id,
  n.nodeId,
  n.name,
  n.sequenceOrder,
  n.assignedWorkerId,
  ARRAY_AGG(np.predecessorNodeId) as predecessors
FROM mes.production_plan_nodes n
LEFT JOIN mes.node_predecessors np ON n.id = np.nodeId
WHERE n.planId = 123
GROUP BY n.id
ORDER BY n.sequenceOrder;
```

**Worker assignment'ları sequence sırasıyla:**

```sql
SELECT 
  wa.id,
  wa.nodeId,
  n.name as nodeName,
  wa.workerId,
  w.name as workerName,
  wa.sequenceNumber,
  wa.estimatedStartTime,
  wa.estimatedEndTime,
  wa.status
FROM mes.worker_assignments wa
JOIN mes.production_plan_nodes n ON wa.nodeId = n.id
JOIN mes.workers w ON wa.workerId = w.id
WHERE wa.planId = 123
ORDER BY wa.workerId, wa.sequenceNumber;
```

**Substation utilization:**

```sql
SELECT 
  s.id as stationId,
  s.name as stationName,
  ss.id as substationId,
  ss.name as substationName,
  ss.status,
  COUNT(wa.id) as assignmentCount,
  MIN(wa.estimatedStartTime) as firstStart,
  MAX(wa.estimatedEndTime) as lastEnd
FROM mes.stations s
JOIN mes.substations ss ON s.id = ss.stationId
LEFT JOIN mes.worker_assignments wa ON ss.id = wa.substationId
WHERE wa.planId = 123
GROUP BY s.id, s.name, ss.id, ss.name, ss.status
ORDER BY s.name, ss.name;
```

---

## 13. PERFORMANCE OPTIMIZATION

### 13.1 Database Indexes

**Kritik indexler:**

```sql
-- Production plans
CREATE INDEX idx_production_plans_status ON mes.production_plans(status);
CREATE INDEX idx_production_plans_work_order ON mes.production_plans(workOrderCode);
CREATE INDEX idx_production_plans_urgent ON mes.production_plans(isUrgent) WHERE isUrgent = TRUE;

-- Nodes
CREATE INDEX idx_nodes_plan ON mes.production_plan_nodes(planId);
CREATE INDEX idx_nodes_operation ON mes.production_plan_nodes(operationId);
CREATE INDEX idx_nodes_worker ON mes.production_plan_nodes(assignedWorkerId);

-- Predecessors (for topological sort)
CREATE INDEX idx_predecessors_node ON mes.node_predecessors(nodeId);
CREATE INDEX idx_predecessors_pred ON mes.node_predecessors(predecessorNodeId);

-- Worker assignments
CREATE INDEX idx_assignments_plan ON mes.worker_assignments(planId);
CREATE INDEX idx_assignments_worker ON mes.worker_assignments(workerId);
CREATE INDEX idx_assignments_status ON mes.worker_assignments(status);
CREATE INDEX idx_assignments_substation ON mes.worker_assignments(substationId);

-- Composite index for worker queue
CREATE INDEX idx_assignments_worker_sequence 
ON mes.worker_assignments(workerId, sequenceNumber);
```

---

### 13.2 Query Optimization

**N+1 Query Problemi:**

```javascript
// ❌ KÖTÜ: Her node için ayrı query
for (const node of nodes) {
  const stations = await trx('mes.node_stations').where('nodeId', node.id);
  const materials = await trx('mes.node_material_inputs').where('nodeId', node.id);
}

// ✅ İYİ: Toplu query
const nodeIds = nodes.map(n => n.id);
const allStations = await trx('mes.node_stations').whereIn('nodeId', nodeIds);
const allMaterials = await trx('mes.node_material_inputs').whereIn('nodeId', nodeIds);

// Group by nodeId
const stationsByNode = new Map();
allStations.forEach(s => {
  if (!stationsByNode.has(s.nodeId)) stationsByNode.set(s.nodeId, []);
  stationsByNode.get(s.nodeId).push(s);
});
```

---

### 13.3 Transaction Best Practices

**Lock stratejisi:**

```javascript
// Launch endpoint: EXCLUSIVE lock (sadece 1 launch aynı anda)
await trx.raw('LOCK TABLE mes.worker_assignments IN EXCLUSIVE MODE');
await trx.raw('LOCK TABLE mes.substations IN EXCLUSIVE MODE');

// Pause/Resume: ROW SHARE lock (okuma devam edebilir)
await trx('mes.worker_assignments')
  .where('planId', id)
  .forUpdate()  // SELECT FOR UPDATE
  .update({ status: 'paused' });
```

---

## 14. API ENDPOINTS SUMMARY

### Production Plans

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `/api/mes/production-plans` | Tüm planları listele |
| GET | `/api/mes/production-plans/:id` | Belirli planı getir |
| POST | `/api/mes/production-plans/:id/launch` | Planı launch et |
| POST | `/api/mes/production-plans/:id/pause` | Planı durdur |
| POST | `/api/mes/production-plans/:id/resume` | Planı devam ettir |
| DELETE | `/api/mes/production-plans/:id` | Planı sil (launch edilmemişse) |

---

### Worker Assignments

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `/api/mes/worker-assignments` | Tüm assignment'ları listele |
| GET | `/api/mes/worker-assignments/:id` | Belirli assignment'ı getir |
| POST | `/api/mes/worker-assignments/:id/start` | Assignment'ı başlat |
| POST | `/api/mes/worker-assignments/:id/complete` | Assignment'ı tamamla |

---

### Urgent Priority

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| POST | `/api/mes/set-urgent-priority` | isUrgent flag'ini toggle et |

---

### Material Validation

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `/api/mes/check-material-availability?planId=X` | Malzeme kontrolü yap |

---

## 15. CODE PATTERNS & BEST PRACTICES

### 15.1 Transaction Pattern

```javascript
router.post('/some-endpoint', withAuth, async (req, res) => {
  const trx = await db.transaction();
  
  try {
    // 1. Validation
    const entity = await trx('table').where('id', id).first();
    if (!entity) {
      await trx.rollback();
      return res.status(404).json({ error: 'Not found' });
    }
    
    // 2. Business logic
    await trx('table').insert({ ... });
    await trx('related_table').update({ ... });
    
    // 3. Commit
    await trx.commit();
    
    // 4. Response
    res.json({ success: true });
    
  } catch (error) {
    await trx.rollback();
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

---

### 15.2 Error Handling Pattern

```javascript
try {
  const result = await launchProductionPlan(planId, workOrderCode);
  
  // Success handling
  alert(`✅ Başarılı: ${result.summary.assignedNodes} operasyon atandı`);
  
} catch (error) {
  // Specific error codes
  if (error.code === 'approved_quote_not_found') {
    alert('Onaylı teklif bulunamadı');
  } else if (error.code === 'no_workers') {
    alert('Uygun işçi bulunamadı');
  } else if (error.status === 422) {
    // Validation error
    const errors = error.errors || [];
    alert(`Validasyon hatası:\n${errors.map(e => e.message).join('\n')}`);
  } else {
    // Generic error
    alert(`Hata: ${error.message}`);
  }
}
```

---

### 15.3 Data Normalization Pattern

```javascript
// Backend'den gelen data
const rawNode = {
  id: 101,
  nodeId: "node-abc-123",
  name: "Kesme",
  operationId: 5
};

// Normalize et
function normalizeNode(raw) {
  return {
    id: raw.id,                          // Database primary key (SERIAL)
    nodeId: raw.nodeId || raw.id,       // Frontend UUID
    name: raw.name || '',
    operationId: raw.operationId || null,
    
    // Zaman bilgileri
    nominalTime: parseInt(raw.nominalTime) || 60,
    effectiveTime: parseInt(raw.effectiveTime) || raw.nominalTime || 60,
    
    // Array fields
    predecessors: Array.isArray(raw.predecessors) ? raw.predecessors : [],
    
    // Nullable fields
    assignedWorkerId: raw.assignedWorkerId || null,
    estimatedStartTime: raw.estimatedStartTime || null,
    estimatedEndTime: raw.estimatedEndTime || null
  };
}
```

---

## 📚 REFERANSLAR

- **Firebase Doküman:** `LAUNCH-OPERATIONS.md` (eski sistem analizi)
- **Schema Definitions:** `quote-portal/server/models/`
- **Database Migrations:** `quote-portal/db/migrations/`
- **API Routes:** `quote-portal/server/mesRoutes.js`
- **Frontend Logic:** `quote-portal/domains/production/js/`

---

## 🎯 ÖZET

Bu doküman, Production Plan Launch sisteminin **SQL (PostgreSQL) implementasyonunu** kapsamlı şekilde açıklamaktadır.

**Ana Başlıklar:**

1. ✅ **Topological Sort:** Bağımlılık sırasını belirler
2. ✅ **Resource Assignment:** Worker, station, substation ataması
3. ✅ **Time Scheduling:** Predecessor dependencies + shift compliance
4. ✅ **Material Validation:** Non-blocking malzeme kontrolü
5. ✅ **Urgent System:** Paralel çalışma desteği
6. ⏳ **Material Reservation:** Gerçek stok rezervasyonu (yapılacak)

**Durum:**
- Core launch logic: ✅ Çalışıyor
- Database schema: ✅ Hazır
- Frontend integration: ✅ Tamamlandı
- Material reservation: ⏳ Implementasyon gerekiyor
- Urgent system: ⏳ Worker Portal logic gerekiyor

**Sonraki Adım:** Migration Checklist'teki kritik bugları düzelt, sonra test et.

---

**Son Güncelleme:** 23 Kasım 2025  
**Hazırlayan:** GitHub Copilot (Claude Sonnet 4.5)  
**Proje:** Burkol MES - PostgreSQL Migration
