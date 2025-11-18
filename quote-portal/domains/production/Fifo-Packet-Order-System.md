# 📦 FIFO Packet Order System - İş Paketi Sıralama ve Atama Sistemi

## Genel Bakış

Bu doküman, mevcut **FIFO (First In First Out)** tabanlı iş paketi sıralama ve atama sisteminin detaylı teknik çalışma yapısını açıklar. Sistem, production plan launch edildiğinde work order'ların assignment'lara dönüştürülmesi, sıralanması ve Worker Portal'da gösterilmesi süreçlerini kapsar.

**Doküman Tarihi:** 18 Kasım 2025  
**Versiyon:** 1.0  
**Kapsam:** FIFO Mode (schedulingMode='fifo')

---

## İçindekiler

1. [Sistem Mimarisi](#1-sistem-mimarisi)
2. [Launch Endpoint: İş Paketi Oluşturma](#2-launch-endpoint-i̇ş-paketi-oluşturma)
3. [Assignment Schema (FIFO Fields)](#3-assignment-schema-fifo-fields)
4. [expectedStart Hesaplama Mantığı](#4-expectedstart-hesaplama-mantığı)
5. [Worker Portal: Task Loading](#5-worker-portal-task-loading)
6. [Worker Portal: FIFO Sıralama](#6-worker-portal-fifo-sıralama)
7. [canStart Logic (FIFO + Urgent)](#7-canstart-logic-fifo--urgent)
8. [Worker Portal UI: Task Card Rendering](#8-worker-portal-ui-task-card-rendering)
9. [Veri Akışı Diyagramı](#9-veri-akışı-diyagramı)
10. [Örnek Senaryo](#10-örnek-senaryo)

---

# 1. Sistem Mimarisi

## 1.1 Genel Akış

```
┌─────────────────────────────────────────────────────────┐
│                    FIFO SYSTEM FLOW                     │
└─────────────────────────────────────────────────────────┘

1. PLAN LAUNCH (Backend)
   ├─ Production plan seçilir
   ├─ Work order code atanır
   ├─ Plan'daki her node → Assignment'a dönüştürülür
   └─ Firestore: mes-worker-assignments collection'a yazılır

2. ASSIGNMENT CREATION
   ├─ expectedStart = plannedStart (topological order)
   ├─ priority = 2 (default: Normal)
   ├─ schedulingMode = 'fifo'
   ├─ optimizedIndex = null
   └─ optimizedStart = null

3. WORKER PORTAL LOAD
   ├─ Backend: /api/mes/worker-tasks/:workerId
   ├─ Tüm assignments Firestore'dan çekilir
   ├─ expectedStart'a göre sıralanır (FIFO)
   └─ canStart hesaplanır (ilk pending task)

4. WORKER PORTAL UI
   ├─ Task cards render edilir
   ├─ canStart=true → "Başlat" butonu aktif
   ├─ canStart=false → "Bekliyor" badge
   └─ isUrgent=true → "!! ACİL" badge + Start aktif
```

---

## 1.2 Temel Prensipler

### FIFO (First In First Out)
- **Tanım:** İlk giren, ilk çıkar. Assignments topological order'a göre expectedStart alır, worker portal'da bu sıraya göre gösterilir.
- **Sıralama Kriteri:** `expectedStart` timestamp (Firestore Timestamp)
- **Başlatma Kuralı:** Sadece **en erken expectedStart'a sahip pending task** başlatılabilir (isUrgent hariç)

### Topological Order
- Production plan'daki node'lar **dependency graph** (predecessors) ile bağlıdır
- Launch sırasında topological sıralama yapılır (dependencies önce tamamlanmalı)
- expectedStart her node'un predecessors'ları tamamlandıktan sonra hesaplanır

### schedulingMode='fifo'
- Mevcut sistemde **tüm assignments** FIFO modunda oluşturulur
- Optimization desteği hazır ama henüz aktif değil
- Future: 'optimized' mode aktif olduğunda optimizedStart kullanılacak

---

# 2. Launch Endpoint: İş Paketi Oluşturma

## 2.1 Endpoint: POST /api/mes/launch-plan

**Dosya:** `quote-portal/server/mesRoutes.js`  
**Satır:** ~5700-5850

### 2.1.1 Assignment Creation Loop

```javascript
// ========================================================================
// 6. CREATE WORKER ASSIGNMENTS IN BATCH
// ========================================================================

const batch = db.batch();
const now = new Date();

// Generate all work package IDs at once (simple sequential numbering)
const assignmentIds = generateWorkPackageIds(workOrderCode, assignments.length);

// Create new assignments with work order-based IDs
for (let i = 0; i < assignments.length; i++) {
  const assignment = assignments[i];
  const workPackageId = assignmentIds[i];
  const assignmentRef = db.collection('mes-worker-assignments').doc(workPackageId);
  
  // Prepare complete assignment document with required fields
  const completeAssignment = {
    ...assignment,
    id: workPackageId,
    workPackageId: workPackageId,
    planId,
    workOrderCode,
    nodeId: assignment.nodeId,
    substationId: assignment.substationId || null,
    
    // ✅ FIFO scheduling fields
    expectedStart: assignment.plannedStart,  // Topological order start time
    priority: 2,  // Default: Normal priority (1=Low, 2=Normal, 3=High)
    optimizedIndex: null,  // Not optimized yet
    optimizedStart: null,  // No optimization result
    schedulingMode: 'fifo',  // Default scheduling mode
    
    isUrgent: false,  // Default to normal priority
    createdAt: now,
    createdBy: userEmail,
    updatedAt: now
  };
  
  batch.set(assignmentRef, completeAssignment);
}

// Commit all changes atomically
await batch.commit();
```

---

## 2.2 expectedStart Kaynağı: assignment.plannedStart

**plannedStart nedir?**
- Production plan'daki her node'un topological sıralamaya göre hesaplanan başlangıç zamanı
- Plan designer'da predecessors (dependencies) dikkate alınarak hesaplanır
- Launch endpoint'e gelmeden önce plan'da zaten mevcut

**Örnek:**
```javascript
// Plan'daki node'lar:
{
  nodeId: 'node-001',
  operationName: 'Cutting',
  plannedStart: Timestamp(2025-11-18 08:00:00),  // İlk operasyon
  predecessors: []
}

{
  nodeId: 'node-002',
  operationName: 'Welding',
  plannedStart: Timestamp(2025-11-18 10:00:00),  // Cutting'ten sonra
  predecessors: ['node-001']
}

// Launch sonrası assignments:
{
  id: 'WO-001-001',
  nodeId: 'node-001',
  expectedStart: Timestamp(2025-11-18 08:00:00),  // plannedStart kopyalandı
  schedulingMode: 'fifo'
}

{
  id: 'WO-001-002',
  nodeId: 'node-002',
  expectedStart: Timestamp(2025-11-18 10:00:00),  // plannedStart kopyalandı
  schedulingMode: 'fifo'
}
```

---

## 2.3 Work Package ID Generation

**Format:** `WO-XXX-YYY`
- `WO-XXX`: Work order code (örn: WO-001)
- `YYY`: Sequential number (001, 002, 003...)

**Kod:**
```javascript
function generateWorkPackageIds(workOrderCode, count) {
  const ids = [];
  for (let i = 0; i < count; i++) {
    const sequenceNum = String(i + 1).padStart(3, '0');
    ids.push(`${workOrderCode}-${sequenceNum}`);
  }
  return ids;
}

// Example:
generateWorkPackageIds('WO-001', 3)
// Returns: ['WO-001-001', 'WO-001-002', 'WO-001-003']
```

---

# 3. Assignment Schema (FIFO Fields)

## 3.1 Firestore Document Structure

**Collection:** `mes-worker-assignments`  
**Document ID:** Work package ID (örn: `WO-001-001`)

```typescript
interface Assignment {
  // ═══════════════════════════════════════════════
  // IDENTITY
  // ═══════════════════════════════════════════════
  id: string;                    // WO-XXX-YYY
  workPackageId: string;         // Same as id
  planId: string;                // mes-production-plans document ID
  workOrderCode: string;         // WO-XXX
  nodeId: string;                // Node from production plan
  
  // ═══════════════════════════════════════════════
  // OPERATION INFO
  // ═══════════════════════════════════════════════
  operationId?: string;
  operationName: string;
  estimatedNominalTime: number;  // Estimated duration (seconds)
  estimatedEffectiveTime: number;
  
  // ═══════════════════════════════════════════════
  // FIFO SCHEDULING FIELDS (Current System)
  // ═══════════════════════════════════════════════
  expectedStart: Timestamp;      // ✅ Topological order start time (from plannedStart)
  priority: 1 | 2 | 3;          // 1=Low, 2=Normal, 3=High (default: 2)
  schedulingMode: 'fifo';        // Always 'fifo' in current system
  
  // ═══════════════════════════════════════════════
  // OPTIMIZATION FIELDS (Not Used in FIFO Mode)
  // ═══════════════════════════════════════════════
  optimizedIndex: null;          // Always null (future: sequence number)
  optimizedStart: null;          // Always null (future: optimized timestamp)
  
  // ═══════════════════════════════════════════════
  // URGENT SYSTEM
  // ═══════════════════════════════════════════════
  isUrgent: boolean;             // Default: false (set by "!! Acil" button)
  
  // ═══════════════════════════════════════════════
  // ASSIGNMENT STATE
  // ═══════════════════════════════════════════════
  status: 'pending' | 'ready' | 'in-progress' | 'completed' | 'cancelled';
  workerId?: string;
  workerName?: string;
  stationId?: string;
  substationId?: string | null;
  
  // ═══════════════════════════════════════════════
  // TIMESTAMPS
  // ═══════════════════════════════════════════════
  createdAt: Timestamp;
  updatedAt: Timestamp;
  actualStart?: Timestamp | null;
  actualEnd?: Timestamp | null;
  
  // ═══════════════════════════════════════════════
  // MATERIAL RESERVATION (2-Phase Commit)
  // ═══════════════════════════════════════════════
  preProductionReservedAmount?: Record<string, number>;
  materialReservationStatus?: 'reserved' | 'committed';
  plannedOutput?: Record<string, number>;
}
```

---

## 3.2 Field Descriptions (FIFO Focus)

| Field | Type | FIFO Kullanımı | Değer | Kaynak |
|-------|------|----------------|-------|--------|
| `expectedStart` | Timestamp | ✅ Sıralama için kullanılır | plannedStart (topological) | Plan designer |
| `priority` | 1-3 | ⚠️ Sadece UI badge | 2 (default: Normal) | Launch endpoint |
| `schedulingMode` | 'fifo' | ✅ Worker portal sorting | 'fifo' (hardcoded) | Launch endpoint |
| `optimizedIndex` | null | ❌ Kullanılmıyor | null | N/A (future) |
| `optimizedStart` | null | ❌ Kullanılmıyor | null | N/A (future) |
| `isUrgent` | boolean | ✅ canStart override | false (default) | UI "!! Acil" button |

---

# 4. expectedStart Hesaplama Mantığı

## 4.1 Topological Sorting (Plan Designer)

**Amaç:** Dependencies (predecessors) dikkate alarak doğru sıralama oluşturmak

**Algoritma (Simplified):**
```javascript
// Production plan designer'da yapılır (frontend)
function calculatePlannedStartTimes(nodes) {
  const startTime = new Date();  // Plan başlangıç zamanı
  const nodeStartTimes = new Map();
  
  // Topological sort (BFS/DFS)
  const sorted = topologicalSort(nodes);
  
  let currentTime = startTime.getTime();
  
  sorted.forEach((node, index) => {
    // Find latest predecessor end time
    let predecessorEndTime = startTime.getTime();
    
    if (node.predecessors && node.predecessors.length > 0) {
      node.predecessors.forEach(predId => {
        const predNode = nodes.find(n => n.nodeId === predId);
        const predStart = nodeStartTimes.get(predId);
        const predDuration = (predNode.estimatedEffectiveTime || 3600) * 1000;
        const predEnd = predStart + predDuration;
        
        if (predEnd > predecessorEndTime) {
          predecessorEndTime = predEnd;
        }
      });
    }
    
    // Node starts after all predecessors finish
    const nodeStart = Math.max(currentTime, predecessorEndTime);
    
    nodeStartTimes.set(node.nodeId, nodeStart);
    
    // Move time forward for next node
    const nodeDuration = (node.estimatedEffectiveTime || 3600) * 1000;
    currentTime = nodeStart + nodeDuration;
  });
  
  // Assign plannedStart to each node
  nodes.forEach(node => {
    node.plannedStart = new Date(nodeStartTimes.get(node.nodeId));
  });
  
  return nodes;
}
```

---

## 4.2 Launch Endpoint: expectedStart Assignment

```javascript
// Launch endpoint'te:
const completeAssignment = {
  ...assignment,
  expectedStart: assignment.plannedStart,  // ✅ Direct copy from plan
  // ...
};
```

**Notlar:**
- expectedStart = plannedStart (1:1 kopyalama)
- Topological hesaplama launch sırasında **YAPILMIYOR**
- Plan designer'da önceden hesaplanmış plannedStart kullanılıyor
- Bu sayede launch işlemi hızlı ve basit

---

## 4.3 Örnek Hesaplama

**Plan Nodes:**
```javascript
[
  {
    nodeId: 'node-001',
    operationName: 'Cutting',
    predecessors: [],
    estimatedEffectiveTime: 3600,  // 1 hour
    plannedStart: '2025-11-18T08:00:00Z'  // Calculated
  },
  {
    nodeId: 'node-002',
    operationName: 'Welding',
    predecessors: ['node-001'],
    estimatedEffectiveTime: 7200,  // 2 hours
    plannedStart: '2025-11-18T09:00:00Z'  // After Cutting (08:00 + 1h)
  },
  {
    nodeId: 'node-003',
    operationName: 'Painting',
    predecessors: ['node-002'],
    estimatedEffectiveTime: 5400,  // 1.5 hours
    plannedStart: '2025-11-18T11:00:00Z'  // After Welding (09:00 + 2h)
  }
]
```

**Launch → Assignments:**
```javascript
[
  {
    id: 'WO-001-001',
    nodeId: 'node-001',
    operationName: 'Cutting',
    expectedStart: Timestamp(2025-11-18T08:00:00Z),  // ✅ From plannedStart
    schedulingMode: 'fifo'
  },
  {
    id: 'WO-001-002',
    nodeId: 'node-002',
    operationName: 'Welding',
    expectedStart: Timestamp(2025-11-18T09:00:00Z),  // ✅ From plannedStart
    schedulingMode: 'fifo'
  },
  {
    id: 'WO-001-003',
    nodeId: 'node-003',
    operationName: 'Painting',
    expectedStart: Timestamp(2025-11-18T11:00:00Z),  // ✅ From plannedStart
    schedulingMode: 'fifo'
  }
]
```

---

# 5. Worker Portal: Task Loading

## 5.1 Endpoint: GET /api/mes/worker-tasks/:workerId

**Dosya:** `quote-portal/server/mesRoutes.js`  
**Satır:** ~3000-3200

### 5.1.1 Query & Data Fetching

```javascript
router.get('/worker-tasks/:workerId', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { workerId } = req.params;
    const userEmail = req.user?.email;
    
    // ✅ Fetch worker's assignments (all work orders)
    const assignmentsSnapshot = await db.collection('mes-worker-assignments')
      .where('workerId', '==', workerId)
      .where('status', 'in', ['pending', 'ready', 'in-progress', 'cancelled_pending_report'])
      .get();
    
    // Build tasks from assignments
    const allTasks = [];
    
    for (const doc of assignmentsSnapshot.docs) {
      const assignment = { id: doc.id, ...doc.data() };
      
      // Skip completed/cancelled tasks
      if (assignment.status === 'completed' || assignment.status === 'cancelled') {
        continue;
      }
      
      // ✅ Build task object with FIFO fields
      const task = {
        assignmentId: assignment.id,
        planId: assignment.planId,
        workOrderCode: assignment.workOrderCode,
        nodeId: assignment.nodeId,
        status: assignment.status,
        
        // ✅ FIFO scheduling fields
        priority: assignment.priority || 2,
        expectedStart: assignment.expectedStart || assignment.plannedStart || null,
        optimizedIndex: assignment.optimizedIndex || null,
        optimizedStart: assignment.optimizedStart || null,
        schedulingMode: assignment.schedulingMode || 'fifo',
        isUrgent: assignment.isUrgent || false,
        
        // Worker, station, operation info
        workerId: assignment.workerId,
        workerName: workerData.name,
        stationId: assignment.stationId,
        operationName: nodeInfo?.operationName,
        estimatedNominalTime: nodeInfo?.estimatedNominalTime || 0,
        
        // ... other fields
      };
      
      allTasks.push(task);
    }
    
    // ✅ FIFO SORTING (Critical!)
    allTasks.sort((a, b) => {
      const aTime = a.expectedStart ? new Date(a.expectedStart).getTime() : 0;
      const bTime = b.expectedStart ? new Date(b.expectedStart).getTime() : 0;
      return aTime - bTime;
    });
    
    // ... canStart logic (explained in next section)
    
    return { tasks: allTasks, nextTaskId };
  }, res);
});
```

---

## 5.2 Task Object Structure

```typescript
interface WorkerPortalTask {
  // Assignment identity
  assignmentId: string;          // WO-001-001
  planId: string;
  workOrderCode: string;         // WO-001
  nodeId: string;
  status: 'pending' | 'ready' | 'in-progress';
  
  // ✅ FIFO fields (from assignment)
  priority: 1 | 2 | 3;
  expectedStart: string | null;  // ISO timestamp
  schedulingMode: 'fifo';
  isUrgent: boolean;
  
  // ✅ Backend-calculated
  canStart: boolean;             // Calculated in endpoint
  
  // Worker info
  workerId: string;
  workerName: string;
  
  // Operation info
  operationName: string;
  estimatedNominalTime: number;
  estimatedEffectiveTime: number;
  
  // Station info
  stationId: string;
  stationName: string;
  substationId: string | null;
  
  // Timing
  actualStart: string | null;
  actualEnd: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  
  // Materials
  preProductionReservedAmount: Record<string, number>;
  materialInputs: Record<string, any>;
}
```

---

# 6. Worker Portal: FIFO Sıralama

## 6.1 Sorting Algorithm (Backend)

**Dosya:** `quote-portal/server/mesRoutes.js`  
**Satır:** ~3113-3117

```javascript
// ✅ Sort by expectedStart (FIFO scheduling)
allTasks.sort((a, b) => {
  const aTime = a.expectedStart ? new Date(a.expectedStart).getTime() : 0;
  const bTime = b.expectedStart ? new Date(b.expectedStart).getTime() : 0;
  return aTime - bTime;
});
```

**Açıklama:**
- `expectedStart` Timestamp'i milisaniye'ye çevirilir
- Ascending order (küçükten büyüğe)
- expectedStart=null olan task'lar en sona gider (0 değeri alır)

---

## 6.2 Sorting Example

**Before Sorting (Random Order):**
```javascript
[
  { id: 'WO-001-003', expectedStart: '2025-11-18T11:00:00Z' },
  { id: 'WO-001-001', expectedStart: '2025-11-18T08:00:00Z' },
  { id: 'WO-001-002', expectedStart: '2025-11-18T09:00:00Z' }
]
```

**After Sorting (FIFO Order):**
```javascript
[
  { id: 'WO-001-001', expectedStart: '2025-11-18T08:00:00Z' },  // First
  { id: 'WO-001-002', expectedStart: '2025-11-18T09:00:00Z' },
  { id: 'WO-001-003', expectedStart: '2025-11-18T11:00:00Z' }   // Last
]
```

---

## 6.3 Multi-Work Order Sorting

**Önemli:** Worker aynı anda **birden fazla work order'dan** task'lara sahip olabilir!

**Example:**
```javascript
[
  // WO-001 tasks
  { id: 'WO-001-001', workOrderCode: 'WO-001', expectedStart: '2025-11-18T08:00:00Z' },
  { id: 'WO-001-002', workOrderCode: 'WO-001', expectedStart: '2025-11-18T10:00:00Z' },
  
  // WO-002 tasks (started earlier!)
  { id: 'WO-002-001', workOrderCode: 'WO-002', expectedStart: '2025-11-18T07:00:00Z' },
  { id: 'WO-002-002', workOrderCode: 'WO-002', expectedStart: '2025-11-18T09:00:00Z' }
]
```

**After FIFO Sorting:**
```javascript
[
  { id: 'WO-002-001', workOrderCode: 'WO-002', expectedStart: '2025-11-18T07:00:00Z' },  // ✅ First!
  { id: 'WO-001-001', workOrderCode: 'WO-001', expectedStart: '2025-11-18T08:00:00Z' },
  { id: 'WO-002-002', workOrderCode: 'WO-002', expectedStart: '2025-11-18T09:00:00Z' },
  { id: 'WO-001-002', workOrderCode: 'WO-001', expectedStart: '2025-11-18T10:00:00Z' }
]
```

**Sonuç:** Worker portal'da **tüm work order'lar karışık ama expectedStart'a göre sıralı** gösterilir.

---

# 7. canStart Logic (FIFO + Urgent)

## 7.1 Algorithm (Backend)

**Dosya:** `quote-portal/server/mesRoutes.js`  
**Satır:** ~3119-3145

```javascript
// ✅ Initialize canStart=false for all tasks
allTasks.forEach(task => {
  task.canStart = false;
});

// ✅ canStart logic: WORKER-LEVEL FIFO (not per work order)
// Filter active tasks (pending/ready/in-progress) across ALL work orders
const activeTasks = allTasks.filter(t => 
  t.status === 'pending' || t.status === 'in-progress' || t.status === 'in_progress' || t.status === 'ready'
);

// Already sorted by expectedStart above

// Find first pending/ready task
const firstPendingIndex = activeTasks.findIndex(t => t.status === 'pending' || t.status === 'ready');

// Set canStart: isUrgent=true -> all can start, otherwise only first pending
activeTasks.forEach((task, index) => {
  if (task.status === 'in-progress' || task.status === 'in_progress') {
    task.canStart = false; // Already started
  } else {
    // ✅ Worker can start: urgent tasks OR first pending task (FIFO)
    task.canStart = task.isUrgent || (index === firstPendingIndex);
  }
});

// Find next task (first pending or ready task)
const nextTask = allTasks.find(t => t.status === 'pending' || t.status === 'ready');
const nextTaskId = nextTask?.assignmentId || null;
```

---

## 7.2 canStart Rules

| Durum | canStart | Açıklama |
|-------|----------|----------|
| **status = 'in-progress'** | `false` | Zaten başlatılmış |
| **status = 'completed'** | N/A | Liste dışı (query'de excluded) |
| **status = 'cancelled'** | N/A | Liste dışı |
| **isUrgent = true** | `true` ✅ | Urgent task'lar PARALEL başlatılabilir |
| **First pending task** | `true` ✅ | FIFO: En erken expectedStart'a sahip pending task |
| **Other pending tasks** | `false` | Sıra bekliyor |

---

## 7.3 Urgent Override

**"!! Acil" Butonu:**
- Work Orders sayfasında assignment'a `isUrgent=true` set edilir
- Endpoint: `POST /api/mes/set-urgent-priority`
- Worker Portal'da urgent task'lar **herzaman başlatılabilir** (FIFO kuralı bypass)

**Örnek:**
```javascript
[
  { id: 'WO-001-001', expectedStart: '08:00', status: 'pending', isUrgent: false, canStart: true },   // ✅ First
  { id: 'WO-001-002', expectedStart: '09:00', status: 'pending', isUrgent: false, canStart: false },  // ❌ Waiting
  { id: 'WO-002-001', expectedStart: '10:00', status: 'pending', isUrgent: true, canStart: true }    // ✅ Urgent!
]
```

**Worker şu anda 3 task görecek:**
- WO-001-001: "Başlat" butonu aktif (FIFO first)
- WO-001-002: "Bekliyor" badge (sıra değil)
- WO-002-001: "Başlat" butonu aktif + "!! ACİL" badge (urgent override)

---

## 7.4 canStart Flow Diagram

```
┌─────────────────────────────────────────────┐
│ canStart Calculation Flow                  │
└─────────────────────────────────────────────┘

FOR EACH task IN allTasks:
  ↓
  ┌─────────────────────────┐
  │ status = 'in-progress'? │
  └───────┬─────────────────┘
          │ YES → canStart = false (already started)
          │
          ▼ NO
  ┌─────────────────────────┐
  │ isUrgent = true?        │
  └───────┬─────────────────┘
          │ YES → canStart = true ✅ (urgent override)
          │
          ▼ NO
  ┌─────────────────────────┐
  │ Is first pending task?  │
  │ (index === 0 in sorted) │
  └───────┬─────────────────┘
          │ YES → canStart = true ✅ (FIFO rule)
          │
          ▼ NO
          canStart = false ❌ (waiting)
```

---

# 8. Worker Portal UI: Task Card Rendering

## 8.1 Frontend: Task List Component

**Dosya:** `quote-portal/domains/workerPortal/workerPortal.js`  
**Satır:** ~1397-1500

### 8.1.1 Task Card HTML Structure

```javascript
function renderTaskCard(task, isNextTask) {
  // ✅ Priority badge (1=Low, 2=Normal, 3=High)
  const priorityLabels = {1: 'DÜŞÜK', 2: 'NORMAL', 3: 'YÜKSEK'};
  const priorityColors = {1: 'priority-low', 2: 'priority-normal', 3: 'priority-high'};
  const priority = task.priority || 2;
  const priorityBadgeHtml = `<span class="priority-level-badge ${priorityColors[priority]}">${priorityLabels[priority]}</span>`;
  
  // ✅ Expected start time (from expectedStart)
  const expectedStartHtml = task.expectedStart 
    ? `<div class="expected-start">Planlanan: ${new Date(task.expectedStart).toLocaleString('tr-TR')}</div>`
    : '';
  
  // ✅ Urgent badge
  const urgentBadge = task.isUrgent 
    ? '<span class="urgent-badge">!! ACİL</span>'
    : '';
  
  // ✅ Next task indicator
  const nextBadge = isNextTask 
    ? '<span class="priority-badge">Öncelikli</span>' 
    : '';
  
  return `
    <div class="task-card ${task.status}" data-assignment-id="${task.assignmentId}">
      <div class="task-header">
        <h3>${task.operationName}</h3>
        <span class="work-order-badge">${task.workOrderCode}</span>
        ${priorityBadgeHtml}
        ${urgentBadge}
        ${nextBadge}
      </div>
      
      <div class="task-details">
        ${expectedStartHtml}
        <div class="station-info">İstasyon: ${task.stationName}</div>
        <div class="duration-info">Süre: ${formatDuration(task.estimatedNominalTime)}</div>
      </div>
      
      <div class="task-actions">
        ${renderTaskActions(task)}
      </div>
    </div>
  `;
}
```

---

## 8.2 Start Button Logic

```javascript
function renderTaskActions(task) {
  // ✅ canStart backend'den geliyor
  if (task.status === 'pending' || task.status === 'ready') {
    if (task.canStart) {
      return `
        <button class="btn-primary start-btn" data-assignment-id="${task.assignmentId}">
          <span>▶</span> Başlat
        </button>
      `;
    } else {
      return `
        <div class="waiting-badge">
          <span>⏳</span> Bekliyor
        </div>
      `;
    }
  }
  
  if (task.status === 'in-progress' || task.status === 'in_progress') {
    return `
      <button class="btn-danger complete-btn" data-assignment-id="${task.assignmentId}">
        <span>✓</span> Tamamla
      </button>
      <button class="btn-secondary pause-btn" data-assignment-id="${task.assignmentId}">
        <span>⏸</span> Duraklat
      </button>
    `;
  }
  
  return '';
}
```

---

## 8.3 UI State Matrix

| status | canStart | isUrgent | UI Display |
|--------|----------|----------|------------|
| `pending` | `true` | `false` | ▶ **Başlat** (green button) |
| `pending` | `false` | `false` | ⏳ **Bekliyor** (gray badge) |
| `pending` | `true` | `true` | ▶ **Başlat** + **!! ACİL** badge (red) |
| `in-progress` | N/A | N/A | ✓ **Tamamla** + ⏸ **Duraklat** buttons |
| `completed` | N/A | N/A | *(Not shown in list)* |

---

## 8.4 CSS Styling

```css
/* Priority Badge */
.priority-level-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.priority-low {
  background: #e3f2fd;
  color: #1976d2;
}

.priority-normal {
  background: #fff3e0;
  color: #f57c00;
}

.priority-high {
  background: #ffebee;
  color: #c62828;
}

/* Urgent Badge */
.urgent-badge {
  background: #f44336;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 700;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* Expected Start */
.expected-start {
  font-size: 0.85rem;
  color: #666;
  margin-top: 4px;
}

/* Waiting Badge */
.waiting-badge {
  background: #e0e0e0;
  color: #666;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.9rem;
  text-align: center;
}

/* Start Button */
.btn-primary.start-btn {
  background: #4caf50;
  color: white;
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.2s;
}

.btn-primary.start-btn:hover {
  background: #45a049;
  transform: scale(1.05);
}

.btn-primary.start-btn:disabled {
  background: #cccccc;
  cursor: not-allowed;
}
```

---

# 9. Veri Akışı Diyagramı

## 9.1 Full System Flow

```
┌────────────────────────────────────────────────────────────────────┐
│                    FIFO SYSTEM - COMPLETE FLOW                     │
└────────────────────────────────────────────────────────────────────┘

STEP 1: PRODUCTION PLAN DESIGN (Frontend)
   ├─ User creates production plan
   ├─ Adds nodes (operations) with dependencies (predecessors)
   ├─ System calculates topological order
   ├─ plannedStart assigned to each node (dependency-aware)
   └─ Plan saved to Firestore: mes-production-plans

STEP 2: PLAN LAUNCH (Backend: /api/mes/launch-plan)
   ├─ User selects plan + work order code
   ├─ Backend reads plan.nodes array
   ├─ FOR EACH node:
   │  ├─ Create assignment document
   │  ├─ expectedStart = node.plannedStart (copy)
   │  ├─ priority = 2 (default: Normal)
   │  ├─ schedulingMode = 'fifo'
   │  ├─ optimizedIndex = null
   │  ├─ optimizedStart = null
   │  └─ isUrgent = false
   ├─ Generate work package IDs (WO-XXX-YYY)
   └─ Batch write to Firestore: mes-worker-assignments

STEP 3: WORKER PORTAL LOAD (Backend: /api/mes/worker-tasks/:workerId)
   ├─ Query assignments WHERE workerId = X
   ├─ Filter: status IN ['pending', 'ready', 'in-progress']
   ├─ Build task objects (convert Firestore → task format)
   ├─ SORT by expectedStart (ascending) ✅ FIFO
   ├─ Calculate canStart:
   │  ├─ Find first pending task index
   │  ├─ IF isUrgent=true → canStart=true
   │  ├─ ELSE IF index=0 → canStart=true (FIFO first)
   │  └─ ELSE → canStart=false
   └─ Return { tasks, nextTaskId }

STEP 4: WORKER PORTAL UI (Frontend)
   ├─ Fetch tasks via /api/mes/worker-tasks/:workerId
   ├─ Render task cards:
   │  ├─ Priority badge (DÜŞÜK/NORMAL/YÜKSEK)
   │  ├─ expectedStart time display
   │  ├─ Urgent badge (if isUrgent=true)
   │  ├─ Start button (if canStart=true)
   │  └─ Waiting badge (if canStart=false)
   └─ User clicks "Başlat" → POST /api/mes/start-task

STEP 5: TASK START (Backend: /api/mes/start-task)
   ├─ Update assignment:
   │  ├─ status = 'in-progress'
   │  ├─ actualStart = now
   │  └─ updatedAt = now
   ├─ Commit materials (2-phase → committed)
   ├─ Update substation schedule
   └─ Return success

STEP 6: TASK COMPLETE (Backend: /api/mes/complete-task)
   ├─ Update assignment:
   │  ├─ status = 'completed'
   │  ├─ actualEnd = now
   │  └─ Fire material outputs
   ├─ Free substation
   └─ Worker portal reloads → next task becomes first
```

---

## 9.2 Data Transformation Flow

```
PRODUCTION PLAN NODE (Frontend)
   ↓
{
  nodeId: 'node-001',
  operationName: 'Cutting',
  plannedStart: Timestamp(2025-11-18 08:00:00),  // Topological
  predecessors: [],
  estimatedEffectiveTime: 3600
}
   ↓
LAUNCH ENDPOINT (Backend Transform)
   ↓
{
  id: 'WO-001-001',
  nodeId: 'node-001',
  workOrderCode: 'WO-001',
  operationName: 'Cutting',
  
  expectedStart: Timestamp(2025-11-18 08:00:00),  // ← plannedStart
  priority: 2,                                     // ← default
  schedulingMode: 'fifo',                          // ← hardcoded
  optimizedIndex: null,                            // ← not used
  optimizedStart: null,                            // ← not used
  isUrgent: false,                                // ← default
  
  status: 'pending',
  createdAt: Timestamp(now)
}
   ↓
FIRESTORE (mes-worker-assignments)
   ↓
WORKER PORTAL ENDPOINT (Backend Read)
   ↓
{
  assignmentId: 'WO-001-001',
  operationName: 'Cutting',
  expectedStart: '2025-11-18T08:00:00Z',           // ← ISO string
  priority: 2,
  schedulingMode: 'fifo',
  isUrgent: false,
  status: 'pending',
  canStart: true,                                  // ← calculated!
  // ... other fields
}
   ↓
WORKER PORTAL UI (Frontend Render)
   ↓
┌─────────────────────────────────────┐
│ 📦 Cutting                          │
│ WO-001                              │
│ [NORMAL] Priority                   │
│ Planlanan: 18.11.2025 08:00         │
│                                     │
│ [▶ Başlat]                          │
└─────────────────────────────────────┘
```

---

# 10. Örnek Senaryo

## 10.1 Scenario Setup

**Work Order:** WO-001  
**Worker:** Ali (workerId: worker-123)  
**Plan Nodes:**

```javascript
[
  {
    nodeId: 'node-001',
    operationName: 'Kesim',
    plannedStart: '2025-11-18T08:00:00Z',
    predecessors: [],
    estimatedEffectiveTime: 3600  // 1 hour
  },
  {
    nodeId: 'node-002',
    operationName: 'Kaynak',
    plannedStart: '2025-11-18T09:00:00Z',
    predecessors: ['node-001'],
    estimatedEffectiveTime: 7200  // 2 hours
  },
  {
    nodeId: 'node-003',
    operationName: 'Boya',
    plannedStart: '2025-11-18T11:00:00Z',
    predecessors: ['node-002'],
    estimatedEffectiveTime: 5400  // 1.5 hours
  }
]
```

---

## 10.2 T=0: Plan Launch

**Action:** Admin launches WO-001

**Backend (Launch Endpoint):**
```javascript
// Create 3 assignments
[
  {
    id: 'WO-001-001',
    nodeId: 'node-001',
    operationName: 'Kesim',
    expectedStart: Timestamp(2025-11-18T08:00:00Z),
    priority: 2,
    schedulingMode: 'fifo',
    isUrgent: false,
    status: 'pending',
    workerId: 'worker-123'
  },
  {
    id: 'WO-001-002',
    nodeId: 'node-002',
    operationName: 'Kaynak',
    expectedStart: Timestamp(2025-11-18T09:00:00Z),
    priority: 2,
    schedulingMode: 'fifo',
    isUrgent: false,
    status: 'pending',
    workerId: 'worker-123'
  },
  {
    id: 'WO-001-003',
    nodeId: 'node-003',
    operationName: 'Boya',
    expectedStart: Timestamp(2025-11-18T11:00:00Z),
    priority: 2,
    schedulingMode: 'fifo',
    isUrgent: false,
    status: 'pending',
    workerId: 'worker-123'
  }
]
```

---

## 10.3 T=1: Worker Portal Load (Ali)

**Action:** Ali opens worker portal

**Backend (/api/mes/worker-tasks/worker-123):**
```javascript
// 1. Query assignments
// 2. Sort by expectedStart
// 3. Calculate canStart

[
  {
    assignmentId: 'WO-001-001',
    operationName: 'Kesim',
    expectedStart: '2025-11-18T08:00:00Z',
    status: 'pending',
    canStart: true  // ✅ First pending task
  },
  {
    assignmentId: 'WO-001-002',
    operationName: 'Kaynak',
    expectedStart: '2025-11-18T09:00:00Z',
    status: 'pending',
    canStart: false  // ❌ Not first
  },
  {
    assignmentId: 'WO-001-003',
    operationName: 'Boya',
    expectedStart: '2025-11-18T11:00:00Z',
    status: 'pending',
    canStart: false  // ❌ Not first
  }
]
```

**UI Display:**
```
┌─────────────────────────────────────┐
│ 📦 Kesim                            │
│ WO-001 | NORMAL                     │
│ Planlanan: 18.11.2025 08:00         │
│ [▶ Başlat]  ← Active button         │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 📦 Kaynak                           │
│ WO-001 | NORMAL                     │
│ Planlanan: 18.11.2025 09:00         │
│ [⏳ Bekliyor]  ← Disabled            │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 📦 Boya                             │
│ WO-001 | NORMAL                     │
│ Planlanan: 18.11.2025 11:00         │
│ [⏳ Bekliyor]  ← Disabled            │
└─────────────────────────────────────┘
```

---

## 10.4 T=2: Ali Starts "Kesim"

**Action:** Ali clicks "Başlat" on Kesim

**Backend (/api/mes/start-task):**
```javascript
// Update WO-001-001
{
  status: 'in-progress',
  actualStart: Timestamp(now),
  updatedAt: Timestamp(now)
}
```

**Worker Portal Reload:**
```javascript
[
  {
    assignmentId: 'WO-001-001',
    operationName: 'Kesim',
    status: 'in-progress',  // Changed!
    canStart: false  // ❌ Already started
  },
  {
    assignmentId: 'WO-001-002',
    operationName: 'Kaynak',
    status: 'pending',
    canStart: false  // ❌ Still waiting (Kesim not done)
  },
  {
    assignmentId: 'WO-001-003',
    operationName: 'Boya',
    status: 'pending',
    canStart: false  // ❌ Still waiting
  }
]
```

**UI Display:**
```
┌─────────────────────────────────────┐
│ 📦 Kesim                            │
│ WO-001 | NORMAL                     │
│ ⏱️ Başladı: 18.11.2025 08:05        │
│ [✓ Tamamla] [⏸ Duraklat]          │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 📦 Kaynak                           │
│ WO-001 | NORMAL                     │
│ [⏳ Bekliyor]                        │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 📦 Boya                             │
│ WO-001 | NORMAL                     │
│ [⏳ Bekliyor]                        │
└─────────────────────────────────────┘
```

---

## 10.5 T=3: Ali Completes "Kesim"

**Action:** Ali clicks "Tamamla"

**Backend (/api/mes/complete-task):**
```javascript
// Update WO-001-001
{
  status: 'completed',
  actualEnd: Timestamp(now),
  updatedAt: Timestamp(now)
}
```

**Worker Portal Reload:**
```javascript
// WO-001-001 removed from list (status='completed')

[
  {
    assignmentId: 'WO-001-002',
    operationName: 'Kaynak',
    expectedStart: '2025-11-18T09:00:00Z',
    status: 'pending',
    canStart: true  // ✅ NOW first pending task!
  },
  {
    assignmentId: 'WO-001-003',
    operationName: 'Boya',
    expectedStart: '2025-11-18T11:00:00Z',
    status: 'pending',
    canStart: false  // ❌ Not first
  }
]
```

**UI Display:**
```
┌─────────────────────────────────────┐
│ 📦 Kaynak                           │
│ WO-001 | NORMAL                     │
│ Planlanan: 18.11.2025 09:00         │
│ [▶ Başlat]  ← NOW active!           │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 📦 Boya                             │
│ WO-001 | NORMAL                     │
│ Planlanan: 18.11.2025 11:00         │
│ [⏳ Bekliyor]                        │
└─────────────────────────────────────┘
```

---

## 10.6 T=4: Admin Sets "Boya" as Urgent

**Action:** Admin clicks "!! Acil" button on WO-001-003

**Backend (/api/mes/set-urgent-priority):**
```javascript
// Update WO-001-003
{
  isUrgent: true,
  updatedAt: Timestamp(now)
}
```

**Worker Portal Reload:**
```javascript
[
  {
    assignmentId: 'WO-001-002',
    operationName: 'Kaynak',
    expectedStart: '2025-11-18T09:00:00Z',
    status: 'pending',
    canStart: true  // ✅ First pending (FIFO)
  },
  {
    assignmentId: 'WO-001-003',
    operationName: 'Boya',
    expectedStart: '2025-11-18T11:00:00Z',
    status: 'pending',
    isUrgent: true,  // Changed!
    canStart: true  // ✅ Urgent override!
  }
]
```

**UI Display:**
```
┌─────────────────────────────────────┐
│ 📦 Kaynak                           │
│ WO-001 | NORMAL                     │
│ Planlanan: 18.11.2025 09:00         │
│ [▶ Başlat]                          │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 📦 Boya                             │
│ WO-001 | NORMAL | !! ACİL           │
│ Planlanan: 18.11.2025 11:00         │
│ [▶ Başlat]  ← Also active!          │
└─────────────────────────────────────┘
```

**Ali can now start BOTH tasks in parallel!**

---

## 10.7 Scenario Summary

| Time | Action | Kesim (WO-001-001) | Kaynak (WO-001-002) | Boya (WO-001-003) |
|------|--------|-------------------|--------------------|--------------------|
| T=0 | Plan Launch | status=pending, canStart=true | status=pending, canStart=false | status=pending, canStart=false |
| T=1 | Portal Load | [▶ Başlat] | [⏳ Bekliyor] | [⏳ Bekliyor] |
| T=2 | Start Kesim | status=in-progress | [⏳ Bekliyor] | [⏳ Bekliyor] |
| T=3 | Complete Kesim | status=completed (hidden) | [▶ Başlat] ✅ | [⏳ Bekliyor] |
| T=4 | Set Boya Urgent | - | [▶ Başlat] | [▶ Başlat] ✅ + !! ACİL |

---

# 11. Özet

## 11.1 FIFO System Key Points

1. **expectedStart = plannedStart**
   - Launch sırasında topological order'dan kopyalanır
   - Dependency graph dikkate alınır (plan designer'da)

2. **FIFO Sorting**
   - Worker portal'da `expectedStart`'a göre ascending order
   - Tüm work order'lar karışık ama kronolojik sıralı

3. **canStart Logic**
   - Sadece **ilk pending task** başlatılabilir (FIFO)
   - `isUrgent=true` olan task'lar **paralel** başlatılabilir (override)

4. **schedulingMode='fifo'**
   - Mevcut sistemde her zaman 'fifo'
   - Optimization desteği hazır ama aktif değil

5. **Backend-Calculated canStart**
   - Frontend'de duplicate logic YOK
   - Backend `/api/mes/worker-tasks/:workerId` hesaplar
   - UI sadece `canStart` değerine göre render yapar

---

## 11.2 Dosya Referansları

| Dosya | Satır | İşlev |
|-------|-------|-------|
| `quote-portal/server/mesRoutes.js` | ~5700-5850 | Launch endpoint (assignment creation) |
| `quote-portal/server/mesRoutes.js` | ~3000-3200 | Worker tasks endpoint (FIFO sorting + canStart) |
| `quote-portal/domains/workerPortal/workerPortal.js` | ~70-150 | Task loading (frontend) |
| `quote-portal/domains/workerPortal/workerPortal.js` | ~1397-1500 | Task card rendering (UI) |
| `quote-portal/shared/schemas/assignment.schema.json` | - | Assignment schema (FIFO fields) |

---

## 11.3 Future: Optimization Mode

**Şu anki sistem FIFO kullanıyor. Optimization mode aktif olduğunda:**

1. `schedulingMode = 'optimized'`
2. `optimizedStart` hesaplanacak (algorithm tarafından)
3. `optimizedIndex` set edilecek (sequence number)
4. Worker Portal sorting: `optimizedStart` kullanacak (fallback: `expectedStart`)

**Detaylar:** `Optimize-Packet-Order-System.md` dosyasına bakın.

---

**Son Güncelleme:** 18 Kasım 2025  
**Yazar:** GitHub Copilot (Claude Sonnet 4.5)  
**Versiyon:** 1.0  
**Durum:** FIFO System Active, Optimization System Prepared

---
