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

# APPENDIX A: Sistem Analizi ve İyileştirme Noktaları

## A.1 Genel Bakış

Bu bölüm, mevcut FIFO sisteminde tespit edilen sorunları, eksikleri ve iyileştirme noktalarını detaylı olarak açıklar. Her sorun için:
- **Durum:** Kritik / Orta / İyileştirme seviyesi
- **Konum:** İlgili kod dosyası ve satır numarası
- **Etki:** Sistemin hangi kısmını etkiliyor
- **Çözüm:** Önerilen düzeltme yaklaşımı

---

## A.2 Tespit Edilen Sorunlar

### ✅ A.2.1 expectedStart ve plannedStart Hesaplama (DOĞRU ÇALIŞIYOR)

**Durum:** ✅ Doğru Çalışıyor  
**Konum:** `mesRoutes.js:5765-5770` (assignment creation)  
**Konum:** `mesRoutes.js:6500-6950` (assignNodeResources)

**Analiz:**
```javascript
// Assignment creation sırasında
expectedStart: assignment.plannedStart,  // ✅ plannedStart kopyalanıyor

// plannedStart hesaplama (assignNodeResources içinde)
let startTime = new Date(Math.max(
  earliestWorkerStart.getTime(),        // Worker'ın son task bitiş zamanı
  earliestSubstationStart.getTime(),    // Substation'ın son task bitiş zamanı
  earliestPredecessorEnd.getTime()      // Predecessor'ların bitiş zamanı
));
```

**Değerlendirme:**
- System zaten dependency-aware scheduling yapıyor ✅
- Worker schedule takip ediliyor ✅
- Substation schedule takip ediliyor ✅
- Predecessor dependencies takip ediliyor ✅

**Sonuç:** Bu kısımda değişiklik GEREKMİYOR.

---

### ✅ A.2.2 In-Memory Schedule Tracking (DOĞRU ÇALIŞIYOR)

**Durum:** ✅ Doğru Çalışıyor  
**Konum:** `mesRoutes.js:5620-5710`

**Analiz:**
```javascript
const workerSchedule = new Map();      // workerId -> [{ start, end }]
const substationSchedule = new Map();  // substationId -> [{ start, end }]
const nodeEndTimes = new Map();        // nodeId -> plannedEnd

// Her node için schedule güncelleniyor
for (const nodeId of executionOrder.order) {
  const assignment = await assignNodeResources(...);
  
  // Map'lere ekleniyor
  nodeEndTimes.set(node.nodeId, new Date(assignment.plannedEnd));
  workerSchedule.get(workerId).push({
    start: new Date(assignment.plannedStart),
    end: new Date(assignment.plannedEnd)
  });
  substationSchedule.get(substationId).push(...);
}

// Sonunda batch commit
await batch.commit();
```

**Değerlendirme:**
- Fetch → Map → Write stratejisi doğru uygulanmış ✅
- Her node sırayla işleniyor ✅
- Schedule'lar in-memory tutuluyor ✅
- Batch commit kullanılıyor ✅

**Sonuç:** Bu kısımda değişiklik GEREKMİYOR.

---

### 🔴 A.2.3 Mevcut Assignments'ları Schedule'a Dahil Etme (KRİTİK)

**Durum:** 🔴 Kritik Sorun  
**Konum:** `mesRoutes.js:5620` (workerSchedule initialization)

**Sorun:**
```javascript
const workerSchedule = new Map();      // ❌ BOŞ başlıyor
const substationSchedule = new Map();  // ❌ BOŞ başlıyor
```

**Senaryo:**
1. Worker-1'e Pazartesi sabah 3 task atanmış (WO-001)
2. Pazartesi öğleden sonra yeni bir plan launch ediliyor (WO-002)
3. Launch sırasında Worker-1'in sabahki task'ları **görmezden geliniyor**
4. Yeni task'lar sabahki task'larla **overlap** olabiliyor

**Etki:**
- Çakışan atamalar (double booking)
- Worker'ın gerçek müsaitlik durumu yanlış hesaplanıyor
- expectedStart zamanları yanlış olabiliyor

**Çözüm:**
Launch başında mevcut assignments'ları yükle:
```javascript
// Load existing pending/in-progress assignments
const existingAssignments = await db.collection('mes-worker-assignments')
  .where('status', 'in', ['pending', 'in-progress', 'ready'])
  .get();

// Populate schedule maps
existingAssignments.forEach(doc => {
  const a = doc.data();
  
  // Worker schedule
  if (!workerSchedule.has(a.workerId)) {
    workerSchedule.set(a.workerId, []);
  }
  workerSchedule.get(a.workerId).push({
    start: new Date(a.plannedStart || a.expectedStart),
    end: new Date(a.plannedEnd)
  });
  
  // Substation schedule
  if (a.substationId) {
    if (!substationSchedule.has(a.substationId)) {
      substationSchedule.set(a.substationId, []);
    }
    substationSchedule.get(a.substationId).push({
      start: new Date(a.plannedStart || a.expectedStart),
      end: new Date(a.plannedEnd)
    });
  }
});
```

---

### ⚠️ A.2.4 Worker Personal Schedule Schema Eksikliği

**Durum:** ⚠️ Orta Seviye Sorun  
**Konum:** `mesRoutes.js:6837-6850` (schedule adjustment)

**Sorun:**
```javascript
if (selectedWorker.personalSchedule && selectedWorker.personalSchedule.blocks) {
  const dayName = startTime.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  scheduleBlocks = selectedWorker.personalSchedule.blocks[dayName] || [];
}
```

**Kod `personalSchedule` field'ını kullanıyor AMA:**
1. Worker schema'sında bu field **tanımlı mı?** ❓
2. Worker dökümanlarında bu data **dolu mu?** ❓
3. Boşsa **default schedule** kullanılıyor mu? ❌

**Etki:**
- Worker'ların mesai saatleri görmezden gelinebiliyor
- Mesai dışı saatlerde task atanabiliyor
- Mola saatleri dikkate alınmıyor

**Gerekli Schema:**
```javascript
{
  id: 'worker-123',
  name: 'Ahmet Yılmaz',
  skills: ['kaynak', 'kesim'],
  efficiency: 1.2,
  personalSchedule: {
    blocks: {
      monday: [
        { type: 'work', start: '08:00', end: '12:00' },
        { type: 'break', start: '12:00', end: '13:00' },
        { type: 'work', start: '13:00', end: '17:00' }
      ],
      tuesday: [...],
      wednesday: [...],
      thursday: [...],
      friday: [...],
      saturday: null,  // Hafta sonu çalışmıyor
      sunday: null
    }
  }
}
```

**Çözüm:**
1. Worker schema'sına `personalSchedule` field ekle
2. Mevcut worker'lara default schedule ata (migration script)
3. Admin panel'de schedule edit özelliği ekle
4. `assignNodeResources()` içinde default schedule fallback ekle

---

### 🟡 A.2.5 Topological Order Validation Eksikliği

**Durum:** 🟡 İyileştirme  
**Konum:** `mesRoutes.js:5545-5550`

**Mevcut Kod:**
```javascript
const executionOrder = planData.executionOrder || { order: [], validation: null };

if (!executionOrder.order || executionOrder.order.length === 0) {
  return res.status(422).json({
    error: 'invalid_execution_order',
    message: 'Production plan has no execution order'
  });
}
```

**Sorun:**
- `executionOrder` plan designer'dan geliyor
- Launch endpoint sadece **varlığını** kontrol ediyor
- **Doğruluğunu** kontrol etmiyor:
  - Circular dependency var mı?
  - Tüm node'lar dahil mi?
  - Invalid predecessor reference var mı?

**Etki:**
- Invalid execution order'la launch edilebiliyor
- Runtime'da predecessor bulunamıyor hatası alınabilir
- Incomplete schedules oluşabilir

**Çözüm:**
Launch endpoint'e validation logic ekle:
```javascript
// Validate topological order
const validation = validateTopologicalOrder(executionOrder, nodesToUse);
if (!validation.valid) {
  return res.status(422).json({
    error: 'invalid_execution_order',
    message: validation.error,
    details: validation.details
  });
}

function validateTopologicalOrder(executionOrder, nodes) {
  const nodeMap = new Map(nodes.map(n => [n.nodeId, n]));
  const visited = new Set();
  const errors = [];
  
  // Check all nodes are in execution order
  for (const node of nodes) {
    if (!executionOrder.order.includes(node.nodeId)) {
      errors.push(`Node ${node.nodeId} not in execution order`);
    }
  }
  
  // Check no invalid references
  for (const nodeId of executionOrder.order) {
    if (!nodeMap.has(nodeId)) {
      errors.push(`Execution order references invalid node: ${nodeId}`);
    }
  }
  
  // Check predecessor ordering (predecessor must come before dependent)
  for (let i = 0; i < executionOrder.order.length; i++) {
    const nodeId = executionOrder.order[i];
    const node = nodeMap.get(nodeId);
    
    if (node && node.predecessors) {
      for (const predId of node.predecessors) {
        const predIndex = executionOrder.order.indexOf(predId);
        if (predIndex > i) {
          errors.push(`Node ${nodeId} depends on ${predId} but appears before it`);
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
```

---

### ⚠️ A.2.6 Material Shortage Error Handling

**Durum:** ⚠️ Tartışmalı (Policy Decision)  
**Konum:** `mesRoutes.js:5599-5612`

**Mevcut Kod:**
```javascript
const materialValidation = await validateMaterialAvailabilityForLaunch(...);
const materialWarnings = materialValidation.warnings || [];

// Material shortages are now warnings, not errors
if (materialWarnings.length > 0) {
  console.warn(`⚠️ Material shortages detected - proceeding with launch`);
}
```

**Sorun:**
- Malzeme yetersizliği varsa **yine de launch ediliyor**
- Warning olarak response'ta dönülüyor
- Production başlatılıyor ama malzeme YOK

**Tartışma:**
Bu bir **policy decision:**

**Seçenek A: Error (Strict Mode)**
```javascript
if (materialWarnings.length > 0) {
  return res.status(422).json({
    error: 'material_shortage',
    message: 'Cannot launch: Insufficient materials',
    shortages: materialWarnings
  });
}
```

**Avantaj:** Malzeme olmadan production başlamaz  
**Dezavantaj:** Malzeme beklerken plan launch edilemez

**Seçenek B: Warning (Current - Flexible Mode)**
```javascript
// Proceed with launch but warn
response.warnings = { materialShortages: materialWarnings };
```

**Avantaj:** Plan launch edilir, malzeme sonra tedarik edilir  
**Dezavantaj:** Worker malzeme bulamaz, task start edemez

**Seçenek C: Hybrid (Reservation System)**
```javascript
// Launch with "pre-production" reservation status
assignment.materialReservationStatus = 'pending';

// Worker portal'da:
if (task.materialReservationStatus !== 'reserved') {
  task.canStart = false;
  task.blockReason = 'Malzeme bekleniyor';
}
```

**Önerilen Çözüm:** Seçenek C (Hybrid)
- Launch edebilir ama task start engellenebilir
- Material geldiğinde reservation yapılır
- Worker portal'da durum gösterilir

---

### 🟡 A.2.7 Schema Validation Timing

**Durum:** 🟡 İyileştirme  
**Konum:** `mesRoutes.js:5771-5791`

**Mevcut Kod:**
```javascript
for (let i = 0; i < assignments.length; i++) {
  const assignment = assignments[i];
  
  // Her assignment için ayrı validate
  if (!validateAssignment(completeAssignment)) {
    const errors = validateAssignment.errors || [];
    // ... only throw for critical errors
  }
  
  batch.set(assignmentRef, completeAssignment);
}

await batch.commit();  // ❌ Invalid assignment yazılmış olabilir
```

**Sorun:**
- Her assignment **ayrı ayrı** validate ediliyor
- Critical error varsa throw ediyor AMA batch'e **zaten eklenmiş** olabilir
- Partial commit olabilir (bazı assignments yazılmış, bazıları yazılmamış)

**Etki:**
- Inconsistent database state
- Bazı node'lar atanmış, bazıları atanmamış
- Plan "partially launched" state'de kalabilir

**Çözüm:**
Tüm assignments'ı **commit ÖNCE** validate et:
```javascript
// PHASE 1: Validate ALL assignments
const validationErrors = [];
for (let i = 0; i < assignments.length; i++) {
  const assignment = assignments[i];
  const completeAssignment = { ...assignment, id, planId, ... };
  
  if (!validateAssignment(completeAssignment)) {
    validationErrors.push({
      index: i,
      nodeId: assignment.nodeId,
      errors: validateAssignment.errors
    });
  }
}

// PHASE 2: Abort if any validation failed
if (validationErrors.length > 0) {
  return res.status(422).json({
    error: 'schema_validation_failed',
    message: `${validationErrors.length} assignment(s) failed validation`,
    errors: validationErrors
  });
}

// PHASE 3: All valid, commit batch
const batch = db.batch();
for (let i = 0; i < assignments.length; i++) {
  // ... add to batch
}
await batch.commit();
```

---

### ⚠️ A.2.8 Batch Size Limiting

**Durum:** ⚠️ Risk (500+ assignments için)  
**Konum:** `mesRoutes.js:5759`

**Mevcut Kod:**
```javascript
const batch = db.batch();
// ... add all assignments (potentially 500+)
await batch.commit();
```

**Sorun:**
- Firestore batch limit: **500 operations**
- Eğer plan 500+ node içeriyorsa **commit fail** olur
- Error: "Maximum 500 operations per batch"

**Etki:**
- Large plan'lar launch edilemiyor
- Error message belirsiz

**Çözüm:**
Batch splitting logic:
```javascript
const BATCH_SIZE = 500;
const batches = [];
let currentBatch = db.batch();
let operationCount = 0;

// Delete existing assignments (count operations)
existingAssignments.docs.forEach(doc => {
  if (operationCount >= BATCH_SIZE) {
    batches.push(currentBatch);
    currentBatch = db.batch();
    operationCount = 0;
  }
  currentBatch.delete(doc.ref);
  operationCount++;
});

// Add new assignments (count operations)
for (let i = 0; i < assignments.length; i++) {
  if (operationCount >= BATCH_SIZE) {
    batches.push(currentBatch);
    currentBatch = db.batch();
    operationCount = 0;
  }
  
  const assignmentRef = db.collection('mes-worker-assignments').doc(workPackageId);
  currentBatch.set(assignmentRef, completeAssignment);
  operationCount++;
}

// Add plan update (count operation)
if (operationCount >= BATCH_SIZE) {
  batches.push(currentBatch);
  currentBatch = db.batch();
  operationCount = 0;
}
currentBatch.update(planRef, { ... });
operationCount++;

// Add quote update (count operation)
if (operationCount >= BATCH_SIZE) {
  batches.push(currentBatch);
  currentBatch = db.batch();
  operationCount = 0;
}
currentBatch.update(quoteDoc.ref, { ... });
operationCount++;

// Push last batch
batches.push(currentBatch);

// Commit all batches sequentially
for (const batch of batches) {
  await batch.commit();
}
```

---

## A.3 İyileştirme Öncelik Matrisi

| # | Sorun | Seviye | Etki | Öncelik |
|---|-------|--------|------|---------|
| 1 | expectedStart hesaplama | ✅ OK | Yok | - |
| 2 | In-memory schedule tracking | ✅ OK | Yok | - |
| 3 | Mevcut assignments yükleme | 🔴 Kritik | Çakışan atamalar | **P0 - Acil** |
| 4 | Worker schedule schema | ⚠️ Orta | Mesai dışı atama | **P1 - Yüksek** |
| 5 | Topological order validation | 🟡 İyileştirme | Invalid launch | **P2 - Orta** |
| 6 | Material shortage handling | ⚠️ Policy | Task start block | **P2 - Orta** |
| 7 | Schema validation timing | 🟡 İyileştirme | Partial commit | **P3 - Düşük** |
| 8 | Batch size limiting | ⚠️ Risk | Large plan fail | **P3 - Düşük** |

---

## A.4 Uygulama Stratejisi

### Sprint 1: Core Fixes (P0-P1)
1. ✅ **Mevcut Assignments Yükleme** (#3)
   - Kritik: Çakışan atamaları önler
   - Konum: Launch endpoint başı
   
2. ✅ **Worker Schedule Schema** (#4)
   - Yüksek: Mesai saatleri kontrolü
   - Konum: Worker collection + migration

### Sprint 2: Robustness (P2)
3. ✅ **Topological Order Validation** (#5)
   - Orta: Invalid launch önler
   - Konum: Launch endpoint validation
   
4. ✅ **Material Shortage Handling** (#6)
   - Orta: Policy decision + implementation
   - Konum: Material validation + worker portal

### Sprint 3: Scalability (P3)
5. ✅ **Schema Validation Timing** (#7)
   - Düşük: Consistency garantisi
   - Konum: Batch commit öncesi
   
6. ✅ **Batch Size Limiting** (#8)
   - Düşük: Large plan support
   - Konum: Batch commit logic

---

# APPENDIX B: Implementation Prompts

## B.1 Genel Kullanım Talimatları

Bu bölümdeki promtlar **3 sprint** halinde organize edilmiştir:

### 📦 SPRINT 1-2: Backend Foundation (PROMPT #1-6)
**Core FIFO system improvements** - Launch endpoint, schedule tracking, validation

### 🎨 SPRINT 3: UI Infrastructure (PROMPT #7-10)
**User interface enhancements** - Production settings, cache system, conditional UI components

Her prompt:
- **Önceki promtların tamamlandığını varsayar**
- **Kod değişikliklerini detaylı açıklar**
- **Test senaryolarını içerir**
- **Rollback planını belirtir**

**⚠️ UYARI:** 
- Promtları **atlayarak** veya **sıra dışı** uygularsanız sistem **tutarsız** hale gelebilir
- **PROMPT #7 (Cache System) ÖNCELİKLİDİR** - #8-10 buna bağımlıdır
- Backend promtları (#1-6) UI promtlarından (#7-10) önce tamamlanmalıdır

---

## 📦 BACKEND FOUNDATION

### PROMPT #1: Worker Personal Schedule Schema Ekleme

### Amaç
`mes-workers` collection'ına `personalSchedule` field'ı ekleyerek worker'ların mesai saatleri ve mola zamanlarını tanımlayın.

### Hedef Dosyalar
- Firestore database: `mes-workers` collection
- Schema documentation (eğer varsa)

### İşlem Adımları

**1. Worker Schema Güncelleme**

Mevcut worker dökümanına aşağıdaki field'ı ekleyin:
```javascript
{
  id: 'worker-123',
  name: 'Ahmet Yılmaz',
  email: 'ahmet@burkol.com',
  skills: ['kaynak', 'kesim', 'montaj'],
  efficiency: 1.2,
  status: 'active',
  
  // ✅ YENİ FIELD
  personalSchedule: {
    enabled: true,  // false ise default schedule kullanılır
    timezone: 'Europe/Istanbul',
    blocks: {
      monday: [
        { type: 'work', start: '08:00', end: '12:00' },
        { type: 'break', start: '12:00', end: '13:00' },
        { type: 'work', start: '13:00', end: '17:00' }
      ],
      tuesday: [
        { type: 'work', start: '08:00', end: '12:00' },
        { type: 'break', start: '12:00', end: '13:00' },
        { type: 'work', start: '13:00', end: '17:00' }
      ],
      wednesday: [
        { type: 'work', start: '08:00', end: '12:00' },
        { type: 'break', start: '12:00', end: '13:00' },
        { type: 'work', start: '13:00', end: '17:00' }
      ],
      thursday: [
        { type: 'work', start: '08:00', end: '12:00' },
        { type: 'break', start: '12:00', end: '13:00' },
        { type: 'work', start: '13:00', end: '17:00' }
      ],
      friday: [
        { type: 'work', start: '08:00', end: '12:00' },
        { type: 'break', start: '12:00', end: '13:00' },
        { type: 'work', start: '13:00', end: '16:00' }  // Cuma erken bitiş
      ],
      saturday: null,  // Çalışmıyor
      sunday: null     // Çalışmıyor
    }
  },
  
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**2. Default Schedule Tanımı**

`mesRoutes.js` dosyasına global default schedule ekleyin (satır ~6300 civarı, helper functions bölümü):

```javascript
/**
 * Get default work schedule for a given day
 * Used when worker has no personalSchedule or personalSchedule.enabled=false
 */
function getDefaultWorkSchedule(dayName) {
  const defaultSchedules = {
    monday: [
      { type: 'work', start: '08:00', end: '12:00' },
      { type: 'break', start: '12:00', end: '13:00' },
      { type: 'work', start: '13:00', end: '17:00' }
    ],
    tuesday: [
      { type: 'work', start: '08:00', end: '12:00' },
      { type: 'break', start: '12:00', end: '13:00' },
      { type: 'work', start: '13:00', end: '17:00' }
    ],
    wednesday: [
      { type: 'work', start: '08:00', end: '12:00' },
      { type: 'break', start: '12:00', end: '13:00' },
      { type: 'work', start: '13:00', end: '17:00' }
    ],
    thursday: [
      { type: 'work', start: '08:00', end: '12:00' },
      { type: 'break', start: '12:00', end: '13:00' },
      { type: 'work', start: '13:00', end: '17:00' }
    ],
    friday: [
      { type: 'work', start: '08:00', end: '12:00' },
      { type: 'break', start: '12:00', end: '13:00' },
      { type: 'work', start: '13:00', end: '16:00' }
    ],
    saturday: [],  // Hafta sonu çalışmıyor
    sunday: []
  };
  
  return defaultSchedules[dayName.toLowerCase()] || [];
}
```

**3. assignNodeResources Güncelleme**

`mesRoutes.js` dosyasında `assignNodeResources` fonksiyonunu güncelleyin (satır ~6837):

```javascript
// MEVCUT KOD:
let scheduleBlocks = [];
if (selectedWorker.personalSchedule && selectedWorker.personalSchedule.blocks) {
  const dayName = startTime.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  scheduleBlocks = selectedWorker.personalSchedule.blocks[dayName] || [];
}

// ✅ YENİ KOD:
let scheduleBlocks = [];
const dayName = startTime.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

// Use personal schedule if enabled, otherwise use default
if (selectedWorker.personalSchedule?.enabled && selectedWorker.personalSchedule.blocks) {
  scheduleBlocks = selectedWorker.personalSchedule.blocks[dayName] || [];
} else {
  scheduleBlocks = getDefaultWorkSchedule(dayName);
}
```

**4. Migration Script (Mevcut Worker'lara Default Eklemek)**

`quote-portal/scripts/migrate-worker-schedules.js` oluşturun:

```javascript
const admin = require('firebase-admin');
const serviceAccount = require('../config/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrateWorkerSchedules() {
  console.log('🔧 Starting worker schedule migration...');
  
  const workersSnapshot = await db.collection('mes-workers').get();
  const batch = db.batch();
  let updateCount = 0;
  
  const defaultSchedule = {
    enabled: true,
    timezone: 'Europe/Istanbul',
    blocks: {
      monday: [
        { type: 'work', start: '08:00', end: '12:00' },
        { type: 'break', start: '12:00', end: '13:00' },
        { type: 'work', start: '13:00', end: '17:00' }
      ],
      tuesday: [
        { type: 'work', start: '08:00', end: '12:00' },
        { type: 'break', start: '12:00', end: '13:00' },
        { type: 'work', start: '13:00', end: '17:00' }
      ],
      wednesday: [
        { type: 'work', start: '08:00', end: '12:00' },
        { type: 'break', start: '12:00', end: '13:00' },
        { type: 'work', start: '13:00', end: '17:00' }
      ],
      thursday: [
        { type: 'work', start: '08:00', end: '12:00' },
        { type: 'break', start: '12:00', end: '13:00' },
        { type: 'work', start: '13:00', end: '17:00' }
      ],
      friday: [
        { type: 'work', start: '08:00', end: '12:00' },
        { type: 'break', start: '12:00', end: '13:00' },
        { type: 'work', start: '13:00', end: '16:00' }
      ],
      saturday: null,
      sunday: null
    }
  };
  
  workersSnapshot.docs.forEach(doc => {
    const worker = doc.data();
    
    // Skip if already has personalSchedule
    if (worker.personalSchedule) {
      console.log(`⏭️  Skipping ${worker.name} (already has schedule)`);
      return;
    }
    
    batch.update(doc.ref, {
      personalSchedule: defaultSchedule,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    updateCount++;
    console.log(`✅ Updated ${worker.name}`);
  });
  
  if (updateCount > 0) {
    await batch.commit();
    console.log(`\n✅ Migration complete: ${updateCount} worker(s) updated`);
  } else {
    console.log(`\n✅ No workers to update`);
  }
  
  process.exit(0);
}

migrateWorkerSchedules().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
```

Çalıştırma:
```bash
node scripts/migrate-worker-schedules.js
```

### Test Senaryoları

**Test 1: Default Schedule Kullanımı**
1. Bir worker'ın `personalSchedule.enabled = false` yap
2. Plan launch et
3. Worker'a atanan task'ların plannedStart zamanları 08:00-17:00 arasında olmalı
4. Öğle molaları (12:00-13:00) skip edilmeli

**Test 2: Personal Schedule Kullanımı**
1. Bir worker'ın personal schedule'ını değiştir (örn: 07:00-15:00)
2. Plan launch et
3. Worker'a atanan task'ların plannedStart zamanları 07:00-15:00 arasında olmalı

**Test 3: Hafta Sonu Kontrolü**
1. Cumartesi günü plan launch et
2. Worker'lara task atanmamalı veya Pazartesi sabaha ertelenmeli

### Rollback Planı

Eğer sorun çıkarsa:
```javascript
// Migration'ı geri al
const batch = db.batch();
workersSnapshot.docs.forEach(doc => {
  batch.update(doc.ref, {
    personalSchedule: admin.firestore.FieldValue.delete()
  });
});
await batch.commit();

// assignNodeResources'daki değişikliği geri al (eski kodu kullan)
```

### Başarı Kriterleri

✅ Tüm worker'lar `personalSchedule` field'ına sahip  
✅ `getDefaultWorkSchedule()` fonksiyonu çalışıyor  
✅ `assignNodeResources()` schedule'ı doğru kullanıyor  
✅ Test senaryoları pass oluyor  

---

## PROMPT #2: Mevcut Assignments'ları Schedule'a Yükleme

### Amaç
Launch sırasında mevcut pending/in-progress assignments'ları yükleyerek worker ve substation schedule'larını doğru hesaplayın. Bu, çakışan atamaları önler.

### Hedef Dosya
- `quote-portal/server/mesRoutes.js`

### İşlem Adımları

**1. Launch Endpoint Başına Schedule Loading Ekleyin**

`mesRoutes.js` dosyasında launch endpoint'i bulun (satır ~5407). "5. RUN AUTO-ASSIGNMENT ENGINE FOR EACH NODE" bölümünün **ÖNCESİNE** aşağıdaki kodu ekleyin (satır ~5617 civarı):

```javascript
// ========================================================================
// 5. LOAD EXISTING ASSIGNMENTS INTO SCHEDULE MAPS
// ========================================================================

console.log('📊 Loading existing assignments into schedule...');

// Fetch all pending/in-progress/ready assignments from ALL plans
const existingAssignmentsSnapshot = await db.collection('mes-worker-assignments')
  .where('status', 'in', ['pending', 'in-progress', 'ready'])
  .get();

console.log(`   Found ${existingAssignmentsSnapshot.size} existing assignment(s)`);

// Initialize schedule maps with existing assignments
const workerSchedule = new Map(); // workerId -> [{ start, end, assignmentId }]
const substationSchedule = new Map(); // substationId -> [{ start, end, assignmentId }]
const nodeEndTimes = new Map(); // nodeId -> plannedEnd timestamp

// Populate maps with existing assignments
existingAssignmentsSnapshot.docs.forEach(doc => {
  const assignment = doc.data();
  const assignmentId = assignment.id || doc.id;
  
  // Skip if missing critical fields
  if (!assignment.plannedStart || !assignment.plannedEnd) {
    console.warn(`   ⚠️  Assignment ${assignmentId} missing plannedStart or plannedEnd, skipping`);
    return;
  }
  
  const startTime = new Date(assignment.plannedStart);
  const endTime = new Date(assignment.plannedEnd);
  
  // Add to worker schedule
  if (assignment.workerId) {
    if (!workerSchedule.has(assignment.workerId)) {
      workerSchedule.set(assignment.workerId, []);
    }
    workerSchedule.get(assignment.workerId).push({
      start: startTime,
      end: endTime,
      assignmentId,
      workOrderCode: assignment.workOrderCode
    });
  }
  
  // Add to substation schedule
  if (assignment.substationId) {
    if (!substationSchedule.has(assignment.substationId)) {
      substationSchedule.set(assignment.substationId, []);
    }
    substationSchedule.get(assignment.substationId).push({
      start: startTime,
      end: endTime,
      assignmentId,
      workOrderCode: assignment.workOrderCode
    });
  }
});

// Sort schedules by start time (chronological order)
workerSchedule.forEach((schedule, workerId) => {
  schedule.sort((a, b) => a.start.getTime() - b.start.getTime());
});
substationSchedule.forEach((schedule, substationId) => {
  schedule.sort((a, b) => a.start.getTime() - b.start.getTime());
});

console.log(`   ✅ Loaded schedules: ${workerSchedule.size} worker(s), ${substationSchedule.size} substation(s)`);

// ========================================================================
// 6. RUN AUTO-ASSIGNMENT ENGINE FOR EACH NODE
// ========================================================================
```

**2. Değişken Tanımlamalarını KALDIR (Duplicate Olmaması İçin)**

Aşağıdaki satırları **SİLİN** (çünkü yukarıda zaten tanımladık):

```javascript
// ❌ SİL (satır ~5620-5625 civarı)
const assignments = [];
const assignmentErrors = [];
const assignmentWarnings = [];

const workerSchedule = new Map();
const substationSchedule = new Map();
const nodeEndTimes = new Map();
```

**SADECE** bunları tutun:
```javascript
// ✅ TUT
const assignments = [];
const assignmentErrors = [];
const assignmentWarnings = [];
```

**3. Schedule Tracking Güncellemelerini Koru**

`for (const nodeId of executionOrder.order)` loop'unda mevcut schedule update kodları doğru, **DOKUNMAYIN**:

```javascript
// ✅ DOĞRU - DOKUNMAYIN (satır ~5670-5690 civarı)
assignments.push(assignment);
nodeEndTimes.set(node.nodeId, new Date(assignment.plannedEnd));

const workerId = assignment.workerId;
const substationId = assignment.substationId;

if (!workerSchedule.has(workerId)) {
  workerSchedule.set(workerId, []);
}
workerSchedule.get(workerId).push({
  start: new Date(assignment.plannedStart),
  end: new Date(assignment.plannedEnd)
});

if (substationId) {
  if (!substationSchedule.has(substationId)) {
    substationSchedule.set(substationId, []);
  }
  substationSchedule.get(substationId).push({
    start: new Date(assignment.plannedStart),
    end: new Date(assignment.plannedEnd)
  });
}
```

### Test Senaryoları

**Test 1: Çakışan Atama Önleme**

**Başlangıç Durumu:**
- Worker-1'e 09:00-11:00 arasında WO-001 task'ı atanmış (pending)

**İşlem:**
1. 10:00'da yeni bir plan (WO-002) launch et
2. WO-002'nin ilk node'u Worker-1 gerektiriyor

**Beklenen Sonuç:**
- WO-002'nin Worker-1'e atanan ilk task'ı **11:00'dan sonra** plannedStart almalı
- 09:00-11:00 arası çakışma olmamalı

**Doğrulama:**
```javascript
// WO-002 assignment check
const wo002Assignment = await db.collection('mes-worker-assignments')
  .where('workOrderCode', '==', 'WO-002')
  .where('workerId', '==', 'worker-1')
  .limit(1)
  .get();

const assignment = wo002Assignment.docs[0].data();
const plannedStart = new Date(assignment.plannedStart);

console.assert(plannedStart >= new Date('2025-11-18T11:00:00Z'), 
  'WO-002 task should start after WO-001 task ends');
```

**Test 2: Substation Paralel Kullanımı**

**Başlangıç Durumu:**
- Station-A'nın 2 substation'ı var: SS-A1, SS-A2
- SS-A1'de 09:00-11:00 arasında task var (pending)

**İşlem:**
1. Yeni plan launch et
2. Station-A gerektiren node var

**Beklenen Sonuç:**
- Yeni task **SS-A2'ye** atanmalı (09:00'da başlayabilir, çünkü SS-A2 boş)
- SS-A1'e atanmamalı (dolu)

**Test 3: Boş Schedule (İlk Launch)**

**Başlangıç Durumu:**
- Hiç assignment yok (fresh database)

**İşlem:**
1. İlk plan launch et

**Beklenen Sonuç:**
- Assignments başarıyla oluşturulmalı
- Hata olmamalı (empty schedule handled)

### Debug Logging

Launch sırasında console'da şunları görmelisiniz:

```
📊 Loading existing assignments into schedule...
   Found 15 existing assignment(s)
   ✅ Loaded schedules: 5 worker(s), 8 substation(s)

🔄 Processing node-001...
   Worker-1 schedule: [09:00-11:00 (WO-001), 11:00-13:00 (WO-002)]
   Next available: 13:00
   ✅ Assigned to Worker-1, Substation SS-A2, Start: 13:00
```

### Rollback Planı

Eğer sorun çıkarsa:
1. Yeni eklenen "LOAD EXISTING ASSIGNMENTS" bölümünü sil
2. Map initialization'ları eski haline döndür:
   ```javascript
   const workerSchedule = new Map();
   const substationSchedule = new Map();
   ```
3. Server'ı restart et

### Başarı Kriterleri

✅ Mevcut assignments yükleniyor (console log check)  
✅ Çakışan atamalar olmuyor (Test 1 pass)  
✅ Substation paralel kullanımı doğru (Test 2 pass)  
✅ Boş database handle ediliyor (Test 3 pass)  

---

## PROMPT #3: Topological Order Validation Ekleme

### Amaç
Launch endpoint'e topological order validation logic ekleyerek invalid execution order'la launch edilmeyi önleyin.

### Hedef Dosya
- `quote-portal/server/mesRoutes.js`

### İşlem Adımları

**1. Validation Fonksiyonu Ekleyin**

`mesRoutes.js` dosyasında helper functions bölümüne (satır ~6300 civarı, `adjustStartTimeForSchedule` fonksiyonundan ÖNCE) aşağıdaki fonksiyonu ekleyin:

```javascript
/**
 * Validate topological order against production plan nodes
 * Checks:
 * 1. All nodes in plan are included in execution order
 * 2. All nodeIds in execution order exist in plan
 * 3. Predecessor dependencies are satisfied (predecessor comes before dependent)
 * 4. No circular dependencies
 * 
 * @param {Object} executionOrder - { order: ['node-1', 'node-2', ...], validation: {...} }
 * @param {Array} nodes - Production plan nodes
 * @returns {Object} { valid: boolean, errors: [], warnings: [] }
 */
function validateTopologicalOrder(executionOrder, nodes) {
  const errors = [];
  const warnings = [];
  
  // Create node lookup map
  const nodeMap = new Map(nodes.map(n => [n.nodeId, n]));
  const orderSet = new Set(executionOrder.order);
  
  // Check 1: All nodes are in execution order
  for (const node of nodes) {
    if (!orderSet.has(node.nodeId)) {
      errors.push({
        type: 'missing_in_order',
        nodeId: node.nodeId,
        nodeName: node.name || node.operationName,
        message: `Node ${node.nodeId} (${node.name || node.operationName}) exists in plan but not in execution order`
      });
    }
  }
  
  // Check 2: All order entries reference valid nodes
  for (const nodeId of executionOrder.order) {
    if (!nodeMap.has(nodeId)) {
      errors.push({
        type: 'invalid_node_reference',
        nodeId,
        message: `Execution order references non-existent node: ${nodeId}`
      });
    }
  }
  
  // Check 3: Predecessor ordering (predecessor must come before dependent)
  const nodeIndexMap = new Map();
  executionOrder.order.forEach((nodeId, index) => {
    nodeIndexMap.set(nodeId, index);
  });
  
  for (let i = 0; i < executionOrder.order.length; i++) {
    const nodeId = executionOrder.order[i];
    const node = nodeMap.get(nodeId);
    
    if (!node) continue; // Skip if node doesn't exist (already reported in Check 2)
    
    const predecessors = node.predecessors || [];
    
    for (const predId of predecessors) {
      if (!nodeIndexMap.has(predId)) {
        errors.push({
          type: 'missing_predecessor',
          nodeId,
          nodeName: node.name || node.operationName,
          predecessorId: predId,
          message: `Node ${nodeId} depends on ${predId}, but ${predId} not in execution order`
        });
        continue;
      }
      
      const predIndex = nodeIndexMap.get(predId);
      
      if (predIndex > i) {
        errors.push({
          type: 'predecessor_order_violation',
          nodeId,
          nodeName: node.name || node.operationName,
          predecessorId: predId,
          nodePosition: i,
          predecessorPosition: predIndex,
          message: `Node ${nodeId} (position ${i}) depends on ${predId} (position ${predIndex}), but predecessor appears AFTER dependent`
        });
      }
    }
  }
  
  // Check 4: Detect circular dependencies (simple cycle detection)
  const visited = new Set();
  const recursionStack = new Set();
  
  function hasCycle(nodeId, path = []) {
    if (recursionStack.has(nodeId)) {
      // Cycle detected
      const cycleStart = path.indexOf(nodeId);
      const cycle = [...path.slice(cycleStart), nodeId];
      return cycle;
    }
    
    if (visited.has(nodeId)) {
      return null; // Already checked this branch
    }
    
    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);
    
    const node = nodeMap.get(nodeId);
    if (node && node.predecessors) {
      for (const predId of node.predecessors) {
        const cycle = hasCycle(predId, [...path]);
        if (cycle) return cycle;
      }
    }
    
    recursionStack.delete(nodeId);
    return null;
  }
  
  for (const nodeId of executionOrder.order) {
    if (!visited.has(nodeId)) {
      const cycle = hasCycle(nodeId);
      if (cycle) {
        errors.push({
          type: 'circular_dependency',
          cycle,
          message: `Circular dependency detected: ${cycle.join(' → ')}`
        });
        break; // Only report first cycle
      }
    }
  }
  
  // Generate warnings for nodes without predecessors appearing late in order
  // (might indicate suboptimal ordering, but not an error)
  for (let i = 1; i < executionOrder.order.length; i++) {
    const nodeId = executionOrder.order[i];
    const node = nodeMap.get(nodeId);
    
    if (node && (!node.predecessors || node.predecessors.length === 0)) {
      warnings.push({
        type: 'independent_node_late_position',
        nodeId,
        nodeName: node.name || node.operationName,
        position: i,
        message: `Node ${nodeId} has no predecessors but appears at position ${i}. Consider moving to earlier position for better parallelization.`
      });
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
```

**2. Launch Endpoint'e Validation Çağrısı Ekleyin**

`mesRoutes.js` dosyasında launch endpoint'te execution order kontrolünden **HEMEN SONRA** (satır ~5555 civarı) aşağıdaki kodu ekleyin:

```javascript
// Existing code (KEEP):
const executionOrder = planData.executionOrder || { order: [], validation: null };

if (!executionOrder.order || executionOrder.order.length === 0) {
  return res.status(422).json({
    error: 'invalid_execution_order',
    message: 'Production plan has no execution order. Please save the plan in Plan Designer to generate execution order.'
  });
}

// ✅ YENİ KOD EKLE:
// ========================================================================
// VALIDATE TOPOLOGICAL ORDER
// ========================================================================

console.log('🔍 Validating topological order...');

const topologyValidation = validateTopologicalOrder(executionOrder, nodesToUse);

if (!topologyValidation.valid) {
  console.error('❌ Topological order validation failed:');
  topologyValidation.errors.forEach(err => {
    console.error(`   - ${err.type}: ${err.message}`);
  });
  
  return res.status(422).json({
    error: 'invalid_topological_order',
    message: `Execution order validation failed: ${topologyValidation.errors.length} error(s) found`,
    errors: topologyValidation.errors,
    hint: 'Please re-save the plan in Plan Designer to regenerate a valid execution order'
  });
}

// Log warnings (non-blocking)
if (topologyValidation.warnings.length > 0) {
  console.warn('⚠️  Topological order warnings:');
  topologyValidation.warnings.forEach(warn => {
    console.warn(`   - ${warn.type}: ${warn.message}`);
  });
}

console.log('✅ Topological order is valid');
```

### Test Senaryoları

**Test 1: Valid Topological Order**

**Plan Yapısı:**
```javascript
nodes: [
  { nodeId: 'node-1', name: 'Kesim', predecessors: [] },
  { nodeId: 'node-2', name: 'Kaynak', predecessors: ['node-1'] },
  { nodeId: 'node-3', name: 'Boya', predecessors: ['node-2'] }
]

executionOrder: {
  order: ['node-1', 'node-2', 'node-3']
}
```

**Beklenen Sonuç:**
- Validation pass ✅
- Launch başarılı

**Test 2: Predecessor Order Violation**

**Plan Yapısı:**
```javascript
nodes: [
  { nodeId: 'node-1', name: 'Kesim', predecessors: [] },
  { nodeId: 'node-2', name: 'Kaynak', predecessors: ['node-1'] },
  { nodeId: 'node-3', name: 'Boya', predecessors: ['node-2'] }
]

executionOrder: {
  order: ['node-2', 'node-1', 'node-3']  // ❌ node-2 node-1'den önce
}
```

**Beklenen Sonuç:**
- Validation fail ❌
- Error response:
  ```json
  {
    "error": "invalid_topological_order",
    "message": "Execution order validation failed: 1 error(s) found",
    "errors": [
      {
        "type": "predecessor_order_violation",
        "nodeId": "node-2",
        "predecessorId": "node-1",
        "message": "Node node-2 (position 0) depends on node-1 (position 1), but predecessor appears AFTER dependent"
      }
    ]
  }
  ```

**Test 3: Missing Node in Order**

**Plan Yapısı:**
```javascript
nodes: [
  { nodeId: 'node-1', name: 'Kesim', predecessors: [] },
  { nodeId: 'node-2', name: 'Kaynak', predecessors: ['node-1'] },
  { nodeId: 'node-3', name: 'Boya', predecessors: ['node-2'] }
]

executionOrder: {
  order: ['node-1', 'node-2']  // ❌ node-3 missing
}
```

**Beklenen Sonuç:**
- Validation fail ❌
- Error: "Node node-3 exists in plan but not in execution order"

**Test 4: Circular Dependency**

**Plan Yapısı:**
```javascript
nodes: [
  { nodeId: 'node-1', name: 'Kesim', predecessors: ['node-3'] },  // ❌ cycle
  { nodeId: 'node-2', name: 'Kaynak', predecessors: ['node-1'] },
  { nodeId: 'node-3', name: 'Boya', predecessors: ['node-2'] }
]

executionOrder: {
  order: ['node-1', 'node-2', 'node-3']
}
```

**Beklenen Sonuç:**
- Validation fail ❌
- Error: "Circular dependency detected: node-1 → node-3 → node-2 → node-1"

### Debug Logging

Launch sırasında console'da şunları görmelisiniz:

**Valid Order:**
```
🔍 Validating topological order...
✅ Topological order is valid
```

**Invalid Order:**
```
🔍 Validating topological order...
❌ Topological order validation failed:
   - predecessor_order_violation: Node node-2 depends on node-1, but predecessor appears AFTER dependent
```

### Rollback Planı

Eğer sorun çıkarsa:
1. `validateTopologicalOrder` fonksiyonunu sil
2. Launch endpoint'teki validation çağrısını sil
3. Eski execution order kontrolünü koru (sadece empty check)

### Başarı Kriterleri

✅ `validateTopologicalOrder()` fonksiyonu çalışıyor  
✅ Valid order ile launch başarılı (Test 1 pass)  
✅ Invalid order ile launch blocked (Test 2,3,4 pass)  
✅ Error messages açıklayıcı  

---

## PROMPT #4: Material Shortage Hybrid Handling

### Amaç
Material shortage durumunda hybrid approach uygulayın: Plan launch edilebilir ama worker task start edemez (malzeme rezerve edilene kadar).

### Hedef Dosyalar
- `quote-portal/server/mesRoutes.js` (launch endpoint)
- `quote-portal/server/mesRoutes.js` (worker tasks endpoint)
- `quote-portal/domains/workerPortal/workerPortal.js` (UI)

### İşlem Adımları

**1. Launch Endpoint: Material Shortage Handling Güncelleme**

`mesRoutes.js` dosyasında material validation bölümünü bulun (satır ~5599-5612) ve güncelleyin:

```javascript
// MEVCUT KOD:
const materialValidation = await validateMaterialAvailabilityForLaunch(
  planData,
  planQuantity,
  db
);

const materialWarnings = materialValidation.warnings || [];

if (materialWarnings.length > 0) {
  console.warn(`⚠️ Material shortages detected (${materialWarnings.length} items) - proceeding with launch`);
}

// ✅ YENİ KOD (DEĞİŞTİR):
const materialValidation = await validateMaterialAvailabilityForLaunch(
  planData,
  planQuantity,
  db
);

const materialWarnings = materialValidation.warnings || [];
let hasMaterialShortages = false;

if (materialWarnings.length > 0) {
  hasMaterialShortages = true;
  console.warn(`⚠️ Material shortages detected (${materialWarnings.length} items)`);
  console.warn(`   Plan will launch but assignments will be blocked until materials are reserved`);
  
  // Log each shortage
  materialWarnings.forEach(shortage => {
    console.warn(`   - ${shortage.materialId}: Need ${shortage.required}, Available ${shortage.available}, Short ${shortage.shortage}`);
  });
}
```

**2. Assignment Creation: materialReservationStatus Field Ekleyin**

`mesRoutes.js` dosyasında assignment creation loop'unda (satır ~5743 civarı) `completeAssignment` object'ine yeni field ekleyin:

```javascript
// Prepare complete assignment document with required fields
const completeAssignment = {
  ...assignment,
  id: workPackageId,
  workPackageId: workPackageId,
  planId,
  workOrderCode,
  nodeId: assignment.nodeId,
  substationId: assignment.substationId || null,
  
  // FIFO scheduling fields
  expectedStart: assignment.plannedStart,
  priority: 2,
  optimizedIndex: null,
  optimizedStart: null,
  schedulingMode: 'fifo',
  
  isUrgent: false,
  
  // ✅ YENİ FIELD:
  materialReservationStatus: hasMaterialShortages ? 'blocked' : 'pending',
  // States: 'blocked' (malzeme yok), 'pending' (rezervasyon bekliyor), 'reserved' (rezerve edildi), 'consumed' (kullanıldı)
  materialBlockReason: hasMaterialShortages 
    ? `${materialWarnings.length} malzeme eksikliği tespit edildi` 
    : null,
  
  createdAt: now,
  createdBy: userEmail,
  updatedAt: now
};
```

**3. Worker Tasks Endpoint: canStart Logic Güncelleme**

`mesRoutes.js` dosyasında worker tasks endpoint'te canStart hesaplamasını bulun (satır ~3125-3150 civarı) ve güncelleyin:

```javascript
// MEVCUT CANSTART LOGIC:
// ✅ canStart logic: WORKER-LEVEL FIFO (not per work order)
const activeTasks = allTasks.filter(t => 
  t.status === 'pending' || t.status === 'in-progress' || t.status === 'in_progress' || t.status === 'ready'
);

// Find first pending task (FIFO)
const firstPendingTask = activeTasks.find(t => t.status === 'pending');

if (firstPendingTask) {
  // ✅ YENİ KOD EKLE (material check):
  // Check material reservation status
  if (firstPendingTask.materialReservationStatus === 'blocked') {
    firstPendingTask.canStart = false;
    firstPendingTask.blockReason = firstPendingTask.materialBlockReason || 'Malzeme rezervasyonu bekleniyor';
  } else {
    firstPendingTask.canStart = true;
  }
}

// Allow urgent tasks to start (even if not first) if materials are ready
activeTasks.forEach(task => {
  if (task.isUrgent && task.status === 'pending') {
    // ✅ YENİ KOD EKLE (material check):
    if (task.materialReservationStatus === 'blocked') {
      task.canStart = false;
      task.blockReason = task.materialBlockReason || 'Malzeme rezervasyonu bekleniyor';
    } else {
      task.canStart = true;
    }
  }
});
```

**4. Worker Portal UI: Block Reason Display**

`quote-portal/domains/workerPortal/workerPortal.js` dosyasında task card rendering bölümünü bulun (satır ~1397-1500 civarı) ve güncelleyin:

```javascript
// TASK CARD RENDERING (mevcut kod içinde):

// ✅ YENİ KOD EKLE (canStart false durumunda):
if (!task.canStart) {
  // Check if blocked due to materials
  if (task.blockReason) {
    statusHtml += `<span class="task-badge badge-blocked">🚫 ${task.blockReason}</span>`;
  } else {
    statusHtml += `<span class="task-badge badge-waiting">⏳ Bekliyor</span>`;
  }
}

// Start button disable logic:
const startButton = card.querySelector('.btn-start-task');
if (startButton) {
  if (task.canStart) {
    startButton.disabled = false;
    startButton.classList.remove('disabled');
  } else {
    startButton.disabled = true;
    startButton.classList.add('disabled');
    
    // ✅ YENİ KOD: Add tooltip with block reason
    if (task.blockReason) {
      startButton.title = task.blockReason;
    }
  }
}
```

**5. CSS: Block Badge Styling**

`quote-portal/domains/workerPortal/workerPortal.css` dosyasına ekleyin:

```css
/* Material Block Badge */
.task-badge.badge-blocked {
  background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
  color: white;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.85rem;
  box-shadow: 0 2px 4px rgba(231, 76, 60, 0.3);
  animation: pulse-red 2s infinite;
}

@keyframes pulse-red {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* Disabled Start Button */
.btn-start-task.disabled {
  background: #95a5a6;
  cursor: not-allowed;
  opacity: 0.6;
}

.btn-start-task.disabled:hover {
  background: #95a5a6;
  transform: none;
}
```

### Test Senaryoları

**Test 1: Material Shortage Launch**

**Başlangıç Durumu:**
- Plan'da 10 adet M-001 malzeme gerekiyor
- Stokta 5 adet M-001 var (5 eksik)

**İşlem:**
1. Plan launch et

**Beklenen Sonuç:**
- Launch başarılı ✅
- Response'ta warning var:
  ```json
  {
    "success": true,
    "warnings": {
      "materialShortages": [
        { "materialId": "M-001", "required": 10, "available": 5, "shortage": 5 }
      ]
    }
  }
  ```
- Tüm assignments oluşturulmuş
- `materialReservationStatus = 'blocked'`
- `materialBlockReason = '1 malzeme eksikliği tespit edildi'`

**Test 2: Worker Portal Block Display**

**Başlangıç Durumu:**
- Worker-1'in ilk task'ı `materialReservationStatus='blocked'`

**İşlem:**
1. Worker portal aç
2. Task card'a bak

**Beklenen Sonuç:**
- Task card görünüyor
- Badge: "🚫 Malzeme rezervasyonu bekleniyor"
- Start butonu disabled
- Hover: Tooltip ile block reason

**Test 3: Material Resolved (Manual Unblock)**

**Başlangıç Durumu:**
- Task `materialReservationStatus='blocked'`
- Malzeme tedarik edildi

**İşlem:**
1. Admin malzeme reservation'ı manuel olarak "reserved" yap:
   ```javascript
   await db.collection('mes-worker-assignments').doc(taskId).update({
     materialReservationStatus: 'pending',  // veya 'reserved'
     materialBlockReason: null,
     updatedAt: new Date()
   });
   ```
2. Worker portal refresh

**Beklenen Sonuç:**
- Task artık `canStart=true`
- Start butonu active
- Badge: "⏳ Bekliyor" (normal FIFO)

**Test 4: No Material Shortage**

**Başlangıç Durumu:**
- Tüm malzemeler stokta

**İşlem:**
1. Plan launch et

**Beklenen Sonuç:**
- Launch başarılı
- Tüm assignments `materialReservationStatus='pending'`
- Worker portal'da normal FIFO çalışıyor

### Debug Logging

**Material Shortage Launch:**
```
⚠️ Material shortages detected (2 items)
   Plan will launch but assignments will be blocked until materials are reserved
   - M-001: Need 10, Available 5, Short 5
   - M-005: Need 20, Available 15, Short 5

✓ Plan launched with 15 assignments (2 material shortages)
```

**Worker Portal Load:**
```
📦 Loading tasks for Worker-1...
   Task WO-001-001: materialReservationStatus=blocked, canStart=false
   Task WO-001-002: materialReservationStatus=pending, canStart=false (FIFO waiting)
```

### Rollback Planı

Eğer sorun çıkarsa:
1. Assignment creation'dan `materialReservationStatus` field'ını kaldır
2. canStart logic'den material check'i kaldır
3. UI'dan block badge'i kaldır
4. Eski warning-only approach'a dön

### Başarı Kriterleri

✅ Material shortage ile plan launch ediliyor  
✅ Blocked assignments oluşturuluyor  
✅ Worker portal block reason gösteriyor  
✅ Start button disabled (blocked task'lar için)  
✅ Material resolved olunca task start edilebiliyor  

---

## PROMPT #5: Schema Validation Timing İyileştirmesi

### Amaç
Tüm assignments'ları batch commit **öncesinde** validate ederek partial commit durumlarını önleyin.

### Hedef Dosya
- `quote-portal/server/mesRoutes.js`

### İşlem Adımları

**1. Validation Phase Ayrımı Yapın**

`mesRoutes.js` dosyasında assignment creation loop'unu bulun (satır ~5733 civarı) ve iki phase'e ayırın:

```javascript
// ========================================================================
// 6. CREATE WORKER ASSIGNMENTS IN BATCH
// ========================================================================

const batch = db.batch();
const now = new Date();

// Delete any stray assignments for this plan/WO (cleanup)
const existingAssignments = await db.collection('mes-worker-assignments')
  .where('planId', '==', planId)
  .where('workOrderCode', '==', workOrderCode)
  .get();

existingAssignments.docs.forEach(doc => {
  batch.delete(doc.ref);
});

// Generate all work package IDs at once (simple sequential numbering)
const assignmentIds = generateWorkPackageIds(workOrderCode, assignments.length);

// ========================================================================
// PHASE 1: PREPARE AND VALIDATE ALL ASSIGNMENTS (NO DB WRITES YET)
// ========================================================================

console.log('🔍 Validating assignment schemas...');

const completeAssignments = [];
const validationErrors = [];

for (let i = 0; i < assignments.length; i++) {
  const assignment = assignments[i];
  const workPackageId = assignmentIds[i];
  
  // Prepare complete assignment document with required fields
  const completeAssignment = {
    ...assignment,
    id: workPackageId,
    workPackageId: workPackageId,
    planId,
    workOrderCode,
    nodeId: assignment.nodeId,
    substationId: assignment.substationId || null,
    
    // FIFO scheduling fields
    expectedStart: assignment.plannedStart,
    priority: 2,
    optimizedIndex: null,
    optimizedStart: null,
    schedulingMode: 'fifo',
    
    isUrgent: false,
    materialReservationStatus: hasMaterialShortages ? 'blocked' : 'pending',
    materialBlockReason: hasMaterialShortages 
      ? `${materialWarnings.length} malzeme eksikliği tespit edildi` 
      : null,
    
    createdAt: now,
    createdBy: userEmail,
    updatedAt: now
  };
  
  // Validate assignment schema
  if (!validateAssignment(completeAssignment)) {
    const schemaErrors = validateAssignment.errors || [];
    
    // Collect ALL errors (both critical and non-critical)
    validationErrors.push({
      index: i,
      workPackageId,
      nodeId: assignment.nodeId,
      nodeName: assignment.nodeName || assignment.operationName,
      errors: schemaErrors.map(err => ({
        field: err.instancePath || err.dataPath,
        keyword: err.keyword,
        message: err.message,
        params: err.params
      }))
    });
  }
  
  // Add to array even if validation failed (we'll check later)
  completeAssignments.push({
    ref: db.collection('mes-worker-assignments').doc(workPackageId),
    data: completeAssignment
  });
}

// ========================================================================
// PHASE 2: CHECK VALIDATION RESULTS (ABORT IF CRITICAL ERRORS)
// ========================================================================

if (validationErrors.length > 0) {
  console.error(`❌ Schema validation failed for ${validationErrors.length} assignment(s):`);
  
  // Separate critical vs non-critical errors
  const criticalErrors = validationErrors.filter(ve => 
    ve.errors.some(e => e.keyword === 'required' || e.keyword === 'type')
  );
  
  const warnings = validationErrors.filter(ve => 
    !ve.errors.some(e => e.keyword === 'required' || e.keyword === 'type')
  );
  
  // Log all errors for debugging
  validationErrors.forEach(ve => {
    console.error(`   - ${ve.workPackageId} (${ve.nodeName}):`);
    ve.errors.forEach(err => {
      console.error(`     * ${err.keyword} at ${err.field}: ${err.message}`);
    });
  });
  
  // ABORT if critical errors exist
  if (criticalErrors.length > 0) {
    return res.status(422).json({
      error: 'schema_validation_failed',
      message: `Schema validation failed for ${criticalErrors.length} assignment(s). Cannot proceed with launch.`,
      criticalErrors: criticalErrors.map(ve => ({
        workPackageId: ve.workPackageId,
        nodeId: ve.nodeId,
        nodeName: ve.nodeName,
        errors: ve.errors
      })),
      warnings: warnings.length > 0 ? warnings : undefined,
      hint: 'Please check production plan data and try again. Required fields may be missing or have incorrect types.'
    });
  }
  
  // Continue with warnings only (log but don't block)
  console.warn(`⚠️  ${warnings.length} non-critical validation warning(s) - proceeding with launch`);
}

console.log(`✅ All assignments validated successfully`);

// ========================================================================
// PHASE 3: BATCH COMMIT (ALL VALIDATED, SAFE TO WRITE)
// ========================================================================

console.log('💾 Writing assignments to database...');

// Add all assignments to batch
for (const { ref, data } of completeAssignments) {
  batch.set(ref, data);
}

// Update plan document with launch status
batch.update(planRef, {
  launchStatus: 'launched',
  launchedAt: now,
  launchedBy: userEmail,
  assignmentCount: assignments.length,
  lastLaunchShortage: admin.firestore.FieldValue.delete(),
  updatedAt: now
});

// Update approved quote production state
batch.update(quoteDoc.ref, {
  productionState: 'Üretiliyor',
  productionStateUpdatedAt: now,
  productionStateUpdatedBy: userEmail
});

// Commit all changes atomically
await batch.commit();

console.log(`✅ Batch commit successful: ${assignments.length} assignment(s) created`);
```

**2. Eski Validation Logic'i Kaldırın**

Aşağıdaki kodu **SİLİN** (artık PHASE 1'de yapılıyor):

```javascript
// ❌ SİL (satır ~5771-5791 civarı - assignment loop içindeki validation)
if (!validateAssignment(completeAssignment)) {
  const errors = validateAssignment.errors || [];
  console.error(`❌ Invalid assignment schema for ${workPackageId}:`, errors);
  
  const criticalErrors = errors.filter(err => 
    err.keyword === 'required' || err.keyword === 'type'
  );
  
  if (criticalErrors.length > 0) {
    throw new Error(
      `Schema validation failed for ${workPackageId}: ${
        criticalErrors.map(e => `${e.instancePath} ${e.message}`).join(', ')
      }`
    );
  }
}

// ❌ SİL (batch.set çağrısı - artık PHASE 3'te yapılıyor)
batch.set(assignmentRef, completeAssignment);
```

### Test Senaryoları

**Test 1: All Assignments Valid**

**Başlangıç Durumu:**
- Plan'daki tüm node'lar valid
- Tüm required fields dolu

**İşlem:**
1. Plan launch et

**Beklenen Sonuç:**
- Validation pass ✅
- Tüm assignments batch commit ediliyor
- Console log:
  ```
  🔍 Validating assignment schemas...
  ✅ All assignments validated successfully
  💾 Writing assignments to database...
  ✅ Batch commit successful: 10 assignment(s) created
  ```

**Test 2: Critical Validation Error (Missing Required Field)**

**Başlangıç Durumu:**
- Plan'daki bir node `nodeId` field'ı eksik

**İşlem:**
1. Plan launch et

**Beklenen Sonuç:**
- Validation fail ❌
- **HİÇBİR** assignment yazılmıyor (atomic abort)
- Error response:
  ```json
  {
    "error": "schema_validation_failed",
    "message": "Schema validation failed for 1 assignment(s). Cannot proceed with launch.",
    "criticalErrors": [
      {
        "workPackageId": "WO-001-003",
        "nodeId": null,
        "nodeName": "Boya",
        "errors": [
          {
            "field": "/nodeId",
            "keyword": "required",
            "message": "must have required property 'nodeId'"
          }
        ]
      }
    ]
  }
  ```

**Test 3: Non-Critical Validation Warning**

**Başlangıç Durumu:**
- Plan'daki node'larda optional field eksik (örn: `description`)

**İşlem:**
1. Plan launch et

**Beklenen Sonuç:**
- Validation pass with warnings ⚠️
- Tüm assignments yazılıyor ✅
- Console log:
  ```
  🔍 Validating assignment schemas...
  ⚠️  3 non-critical validation warning(s) - proceeding with launch
  💾 Writing assignments to database...
  ✅ Batch commit successful: 10 assignment(s) created
  ```

**Test 4: Mixed Errors**

**Başlangıç Durumu:**
- 1 node critical error (missing `nodeId`)
- 2 node non-critical warnings (missing optional fields)

**İşlem:**
1. Plan launch et

**Beklenen Sonuç:**
- Launch blocked ❌ (critical error nedeniyle)
- Response'ta hem critical errors hem warnings var
- **HİÇBİR** assignment yazılmıyor

### Debug Logging

**Validation Failed:**
```
🔍 Validating assignment schemas...
❌ Schema validation failed for 2 assignment(s):
   - WO-001-003 (Boya):
     * required at /nodeId: must have required property 'nodeId'
   - WO-001-005 (Montaj):
     * type at /nominalTime: must be integer
```

**Validation Passed:**
```
🔍 Validating assignment schemas...
✅ All assignments validated successfully
💾 Writing assignments to database...
✅ Batch commit successful: 15 assignment(s) created
```

### Rollback Planı

Eğer sorun çıkarsa:
1. PHASE 1/2/3 bölümlerini kaldır
2. Eski validation logic'i geri yükle (assignment loop içinde)
3. Eski batch.set çağrılarını geri yükle

### Başarı Kriterleri

✅ Validation batch commit öncesinde yapılıyor  
✅ Critical error varsa **hiçbir** assignment yazılmıyor  
✅ Non-critical warning'ler launch'u block etmiyor  
✅ Error messages açıklayıcı ve detaylı  
✅ Console logging informatif  

---

## PROMPT #6: Batch Size Limiting (500+ Assignment Desteği)

### Amaç
Firestore'un 500 operation/batch limitini handle ederek large plan'ları destekleyin.

### Hedef Dosya
- `quote-portal/server/mesRoutes.js`

### İşlem Adımları

**1. Batch Helper Fonksiyonu Ekleyin**

`mesRoutes.js` dosyasında helper functions bölümüne (satır ~6300 civarı) aşağıdaki fonksiyonu ekleyin:

```javascript
/**
 * Commit multiple operations in batches (Firestore limit: 500 ops/batch)
 * @param {Array} operations - Array of { type: 'set'|'update'|'delete', ref, data? }
 * @param {FirebaseFirestore.Firestore} db - Firestore instance
 * @returns {Promise<number>} - Total number of batches committed
 */
async function commitInBatches(operations, db) {
  const BATCH_SIZE = 500;
  const batches = [];
  let currentBatch = db.batch();
  let operationCount = 0;
  
  for (const operation of operations) {
    // Check if current batch is full
    if (operationCount >= BATCH_SIZE) {
      batches.push(currentBatch);
      currentBatch = db.batch();
      operationCount = 0;
    }
    
    // Add operation to batch
    switch (operation.type) {
      case 'set':
        currentBatch.set(operation.ref, operation.data);
        break;
      case 'update':
        currentBatch.update(operation.ref, operation.data);
        break;
      case 'delete':
        currentBatch.delete(operation.ref);
        break;
      default:
        console.warn(`Unknown operation type: ${operation.type}`);
        continue;
    }
    
    operationCount++;
  }
  
  // Push last batch (if not empty)
  if (operationCount > 0) {
    batches.push(currentBatch);
  }
  
  // Commit all batches sequentially
  console.log(`💾 Committing ${batches.length} batch(es) with ${operations.length} total operation(s)...`);
  
  for (let i = 0; i < batches.length; i++) {
    await batches[i].commit();
    console.log(`   ✅ Batch ${i + 1}/${batches.length} committed`);
  }
  
  return batches.length;
}
```

**2. Launch Endpoint'te Batch Logic Değiştirin**

`mesRoutes.js` dosyasında PHASE 3 (Batch Commit) bölümünü bulun ve değiştirin:

```javascript
// ========================================================================
// PHASE 3: BATCH COMMIT (ALL VALIDATED, SAFE TO WRITE)
// ========================================================================

console.log('💾 Preparing batch operations...');

// Collect all operations in an array
const operations = [];

// Delete existing assignments
existingAssignments.docs.forEach(doc => {
  operations.push({
    type: 'delete',
    ref: doc.ref
  });
});

// Add new assignments
for (const { ref, data } of completeAssignments) {
  operations.push({
    type: 'set',
    ref,
    data
  });
}

// Update plan document
operations.push({
  type: 'update',
  ref: planRef,
  data: {
    launchStatus: 'launched',
    launchedAt: now,
    launchedBy: userEmail,
    assignmentCount: assignments.length,
    lastLaunchShortage: admin.firestore.FieldValue.delete(),
    updatedAt: now
  }
});

// Update approved quote
operations.push({
  type: 'update',
  ref: quoteDoc.ref,
  data: {
    productionState: 'Üretiliyor',
    productionStateUpdatedAt: now,
    productionStateUpdatedBy: userEmail
  }
});

// Commit all operations in batches (handles 500+ operations)
const batchCount = await commitInBatches(operations, db);

console.log(`✅ All operations committed successfully (${batchCount} batch(es))`);
```

**3. Eski Batch Kod'unu Kaldırın**

Aşağıdaki kodları **SİLİN**:

```javascript
// ❌ SİL
const batch = db.batch();

// ... batch.set, batch.update çağrıları ...

await batch.commit();
```

### Test Senaryoları

**Test 1: Small Plan (< 500 assignments)**

**Plan Yapısı:**
- 50 node
- 50 assignment oluşturulacak

**İşlem:**
1. Plan launch et

**Beklenen Sonuç:**
- 1 batch commit ✅
- Tüm assignments yazılıyor
- Console log:
  ```
  💾 Committing 1 batch(es) with 52 total operation(s)...
     ✅ Batch 1/1 committed
  ✅ All operations committed successfully (1 batch(es))
  ```

**Test 2: Medium Plan (500-1000 assignments)**

**Plan Yapısı:**
- 750 node
- 750 assignment oluşturulacak

**İşlem:**
1. Plan launch et

**Beklenen Sonuç:**
- 2 batch commit ✅
- Tüm assignments yazılıyor
- Console log:
  ```
  💾 Committing 2 batch(es) with 752 total operation(s)...
     ✅ Batch 1/2 committed
     ✅ Batch 2/2 committed
  ✅ All operations committed successfully (2 batch(es))
  ```

**Test 3: Large Plan (1000+ assignments)**

**Plan Yapısı:**
- 1500 node
- 1500 assignment oluşturulacak

**İşlem:**
1. Plan launch et

**Beklenen Sonuç:**
- 3 batch commit ✅
- Tüm assignments yazılıyor
- Console log:
  ```
  💾 Committing 3 batch(es) with 1502 total operation(s)...
     ✅ Batch 1/3 committed
     ✅ Batch 2/3 committed
     ✅ Batch 3/3 committed
  ✅ All operations committed successfully (3 batch(es))
  ```

**Test 4: Error Handling (Batch Fail)**

**Başlangıç Durumu:**
- 1000 assignment
- 500. assignment invalid (test için data corruption)

**İşlem:**
1. Plan launch et

**Beklenen Sonuç:**
- İlk batch (500 op) başarılı
- İkinci batch fail ❌
- **Partial commit olur** (ilk 500 yazılmış)
- Error throw edilir

**Not:** Bu durumu önlemek için **PROMPT #5'teki validation MUTLAKA önce uygulanmalı!**

### Debug Logging

**Small Plan:**
```
💾 Preparing batch operations...
💾 Committing 1 batch(es) with 52 total operation(s)...
   ✅ Batch 1/1 committed
✅ All operations committed successfully (1 batch(es))
```

**Large Plan:**
```
💾 Preparing batch operations...
💾 Committing 3 batch(es) with 1502 total operation(s)...
   ✅ Batch 1/3 committed
   ✅ Batch 2/3 committed
   ✅ Batch 3/3 committed
✅ All operations committed successfully (3 batch(es))
```

### Performance Considerations

**Batch Count Estimation:**
```
Total Operations = Delete Ops + Assignment Ops + 2 (plan + quote update)
Total Operations = existingAssignments.length + assignments.length + 2

Example:
- Existing assignments: 10 (delete)
- New assignments: 1500 (set)
- Plan update: 1 (update)
- Quote update: 1 (update)
Total = 1512 operations
Batches = Math.ceil(1512 / 500) = 4 batches
```

**Timing:**
- 1 batch ≈ 200-500ms (Firestore network latency)
- 4 batches ≈ 1-2 seconds
- Acceptable for large plans

### Rollback Planı

Eğer sorun çıkarsa:
1. `commitInBatches` fonksiyonunu sil
2. PHASE 3'ü eski haline döndür (tek batch):
   ```javascript
   const batch = db.batch();
   // ... add operations
   await batch.commit();
   ```
3. Large plan'lar (500+) launch edilemez (known limitation)

### Başarı Kriterleri

✅ Small plan'lar 1 batch ile commit ediliyor  
✅ Large plan'lar (500+) multiple batch ile commit ediliyor  
✅ Console logging batch count gösteriyor  
✅ Performance acceptable (< 3 seconds for 1500 assignments)  
✅ Validation (PROMPT #5) ile birlikte kullanıldığında partial commit önleniyor  

---

## 🎨 UI INFRASTRUCTURE

### PROMPT #7: Production Mode Cache System ⭐ ÖNCELİKLİ!

**Kaynak:** `Optimize-Packet-Order-System.md - PROMPT #14`

**Süre:** ~30 dakika

### Amaç
Global cache system ile production mode'u (FIFO/Optimization) app başlangıcında 1 kez yükleyip tüm component'lerde kullanın. Bu, gereksiz Firestore query'lerini önler ve UI reactive hale getirir.

### Hedef Dosyalar
- `quote-portal/shared/state/productionMode.js` (yeni)
- `quote-portal/src/main.js` (güncelle)

### İşlem Adımları

**1. ProductionModeCache Class Oluştur**

`quote-portal/shared/state/productionMode.js` dosyası oluşturun:

```javascript
/**
 * Production Mode Cache System
 * Loads production mode once at app startup, provides synchronous access
 * Prevents redundant Firestore queries across the app
 */

import { getFirestore, doc, getDoc } from 'firebase/firestore';

class ProductionModeCache {
  constructor() {
    this.mode = 'fifo'; // Default fallback
    this.loaded = false;
    this.listeners = []; // Reactive listener system
  }
  
  /**
   * Load production mode from Firestore (call once at app startup)
   */
  async initialize() {
    try {
      console.log('🔧 Initializing ProductionModeCache...');
      
      const db = getFirestore();
      const settingsRef = doc(db, 'master-data', 'production-settings');
      const settingsSnap = await getDoc(settingsRef);
      
      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        this.mode = data.scheduling?.mode || 'fifo';
        console.log(`✅ Production mode loaded: ${this.mode}`);
      } else {
        console.warn('⚠️  Production settings not found, using default: fifo');
        this.mode = 'fifo';
      }
      
      this.loaded = true;
      this._notifyListeners();
      
    } catch (error) {
      console.error('❌ Failed to load production mode:', error);
      this.mode = 'fifo'; // Fallback to safe default
      this.loaded = true;
    }
  }
  
  /**
   * Get current production mode (synchronous)
   * @returns {'fifo' | 'optimized'}
   */
  getMode() {
    if (!this.loaded) {
      console.warn('⚠️  ProductionModeCache not loaded yet, returning fallback');
    }
    return this.mode;
  }
  
  /**
   * Check if optimization mode is active
   * @returns {boolean}
   */
  isOptimizationMode() {
    return this.getMode() === 'optimized';
  }
  
  /**
   * Check if FIFO mode is active
   * @returns {boolean}
   */
  isFifoMode() {
    return this.getMode() === 'fifo';
  }
  
  /**
   * Update cache (call after settings save)
   * @param {string} newMode - 'fifo' or 'optimized'
   */
  setMode(newMode) {
    if (newMode !== 'fifo' && newMode !== 'optimized') {
      console.error(`Invalid production mode: ${newMode}`);
      return;
    }
    
    console.log(`🔄 Production mode changed: ${this.mode} → ${newMode}`);
    this.mode = newMode;
    this._notifyListeners();
  }
  
  /**
   * Register a listener for mode changes
   * @param {Function} callback - Called when mode changes
   * @returns {Function} - Unregister function
   */
  onChange(callback) {
    this.listeners.push(callback);
    
    // Return unregister function
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }
  
  /**
   * Notify all listeners of mode change
   * @private
   */
  _notifyListeners() {
    this.listeners.forEach(callback => {
      try {
        callback(this.mode);
      } catch (error) {
        console.error('Error in mode change listener:', error);
      }
    });
  }
}

// Create singleton instance
const productionModeCache = new ProductionModeCache();

// Expose globally for easy access
if (typeof window !== 'undefined') {
  window.productionModeCache = productionModeCache;
}

export default productionModeCache;
```

**2. App Başlangıcında Initialize Et**

`quote-portal/src/main.js` dosyasını güncelleyin:

```javascript
import productionModeCache from '../shared/state/productionMode.js';

// App initialization
async function initializeApp() {
  console.log('🚀 Initializing app...');
  
  // Initialize Firebase
  await initializeFirebase();
  
  // ✅ YENİ: Load production mode ONCE
  await productionModeCache.initialize();
  
  // Continue with app startup
  loadUserSession();
  initializeRouting();
  
  console.log('✅ App initialized');
}

initializeApp();
```

**3. Component'lerde Kullanım Örnekleri**

**Örnek 1: Work Order Start Button**
```javascript
import productionModeCache from '../shared/state/productionMode.js';

function handleStartButtonClick(workOrderCode) {
  // ✅ Synchronous check (no Firestore query!)
  if (productionModeCache.isOptimizationMode()) {
    // Show priority popup
    showPrioritySelectionPopup(workOrderCode);
  } else {
    // Direct start with default priority
    startProduction(workOrderCode, { priority: 2 });
  }
}
```

**Örnek 2: Optimize Button Visibility**
```javascript
import productionModeCache from '../shared/state/productionMode.js';

// Initial render
function renderOptimizeButton() {
  const button = document.getElementById('optimize-btn');
  button.style.display = productionModeCache.isOptimizationMode() ? 'block' : 'none';
}

// Reactive update on mode change
productionModeCache.onChange((newMode) => {
  const button = document.getElementById('optimize-btn');
  button.style.display = newMode === 'optimized' ? 'block' : 'none';
  console.log(`🔄 Optimize button visibility updated: ${button.style.display}`);
});
```

**Örnek 3: Worker Portal Sorting**
```javascript
import productionModeCache from '../shared/state/productionMode.js';

function sortTasks(tasks) {
  if (productionModeCache.isOptimizationMode()) {
    // Sort by optimizedStart (or fallback to expectedStart)
    return tasks.sort((a, b) => {
      const aTime = a.optimizedStart || a.expectedStart;
      const bTime = b.optimizedStart || b.expectedStart;
      return new Date(aTime) - new Date(bTime);
    });
  } else {
    // Sort by expectedStart (FIFO)
    return tasks.sort((a, b) => 
      new Date(a.expectedStart) - new Date(b.expectedStart)
    );
  }
}
```

### Test Senaryoları

**Test 1: Cache Initialization**

**İşlem:**
1. App'i başlat
2. Console log'ları kontrol et

**Beklenen Sonuç:**
```
🔧 Initializing ProductionModeCache...
✅ Production mode loaded: fifo
```

**Test 2: Synchronous Access**

**İşlem:**
```javascript
console.log(productionModeCache.getMode()); // Should not wait
console.log(productionModeCache.isOptimizationMode()); // Instant response
```

**Beklenen Sonuç:**
- Hiç Firestore query atılmıyor
- Anında response alınıyor

**Test 3: Mode Change Reactive Update**

**Başlangıç Durumu:**
- Mode = 'fifo'
- Optimize button gizli

**İşlem:**
1. Production Settings'te mode'u 'optimized' yap
2. Save et

**Beklenen Sonuç:**
- `setMode('optimized')` çağrılıyor
- Listener tetikleniyor
- Optimize button otomatik görünüyor
- **Page reload YOK**

**Test 4: Fallback Behavior**

**Senaryo:**
- Firestore erişilemez (network error)

**İşlem:**
1. Network'ü kes
2. App'i başlat

**Beklenen Sonuç:**
```
❌ Failed to load production mode: [error]
⚠️  Using fallback mode: fifo
```
- App çökmüyor
- FIFO mode kullanılıyor

### Debug Logging

**Başarılı Initialize:**
```
🔧 Initializing ProductionModeCache...
✅ Production mode loaded: fifo
```

**Mode Change:**
```
🔄 Production mode changed: fifo → optimized
🔄 Optimize button visibility updated: block
```

**Fallback:**
```
⚠️  Production settings not found, using default: fifo
⚠️  ProductionModeCache not loaded yet, returning fallback
```

### Rollback Planı

Eğer sorun çıkarsa:
1. `productionMode.js` dosyasını sil
2. `main.js`'teki initialize çağrısını kaldır
3. Component'lerde cache yerine direkt Firestore query kullan (eski yöntem)

### Başarı Kriterleri

✅ App başlangıcında 1 Firestore query (production-settings)  
✅ `getMode()` synchronous ve instant  
✅ Mode change reactive (no page reload)  
✅ Fallback güvenli çalışıyor (fifo default)  
✅ `window.productionModeCache` global olarak erişilebilir  

---

### PROMPT #8: Production Settings UI (Non-Functional)

**Kaynak:** `Optimize-Packet-Order-System.md - PROMPT #13`

**Süre:** ~60 dakika

### Amaç
Admin panel'e Production Settings sayfası ekleyin. Bu sayfada scheduling mode toggle ve optimization ayarları olacak. Bu fazda sadece UI, backend entegrasyonu sonraki fazda yapılacak.

### Hedef Dosyalar
- `quote-portal/domains/admin/pages/production-settings.html` (yeni)
- `quote-portal/domains/admin/js/production-settings.js` (yeni)
- `quote-portal/domains/admin/styles/production-settings.css` (yeni)
- `quote-portal/pages/settings.html` (menü güncellemesi)

### İşlem Adımları

**1. Settings Menüsüne Link Ekle**

`quote-portal/pages/settings.html` dosyasında Master Data section'a ekleyin:

```html
<div class="settings-section">
  <h3>📊 Master Data</h3>
  <ul class="settings-menu">
    <li><a href="/domains/admin/pages/workers.html">👷 Workers</a></li>
    <li><a href="/domains/admin/pages/stations.html">🏭 Stations</a></li>
    <li><a href="/domains/admin/pages/materials.html">📦 Materials</a></li>
    <!-- ✅ YENİ -->
    <li><a href="/domains/admin/pages/production-settings.html">⚙️ Production Settings</a></li>
  </ul>
</div>
```

**2. Production Settings HTML**

`quote-portal/domains/admin/pages/production-settings.html` oluşturun:

```html
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Production Settings - Burkol MES</title>
  <link rel="stylesheet" href="../../../styles/main.css">
  <link rel="stylesheet" href="../styles/production-settings.css">
</head>
<body>
  <div class="container">
    <header class="page-header">
      <h1>⚙️ Production Settings</h1>
      <p class="subtitle">Üretim planlama ve sıralama ayarları</p>
    </header>
    
    <div class="settings-card">
      <!-- Scheduling Mode Toggle -->
      <div class="setting-group">
        <label class="setting-label">
          <span class="label-text">Scheduling Mode</span>
          <span class="label-description">Üretim sıralama algoritması</span>
        </label>
        
        <div class="toggle-switch">
          <input type="radio" id="mode-fifo" name="scheduling-mode" value="fifo" checked>
          <label for="mode-fifo">
            <span class="mode-icon">📦</span>
            <span class="mode-name">FIFO</span>
            <span class="mode-desc">First In First Out</span>
          </label>
          
          <input type="radio" id="mode-optimized" name="scheduling-mode" value="optimized">
          <label for="mode-optimized">
            <span class="mode-icon">🎯</span>
            <span class="mode-name">Optimized</span>
            <span class="mode-desc">Priority-Based</span>
          </label>
        </div>
      </div>
      
      <!-- Optimization Settings (collapsible) -->
      <div id="optimization-settings" class="optimization-panel" style="display: none;">
        <h3>🎯 Optimization Settings</h3>
        
        <!-- Auto-calculation -->
        <div class="setting-group">
          <label for="auto-calc-enabled">
            <input type="checkbox" id="auto-calc-enabled">
            Enable auto-calculation
          </label>
          <input type="number" id="auto-calc-interval" min="15" max="1440" value="60" disabled>
          <span class="unit">minutes</span>
        </div>
        
        <!-- Working hours constraint -->
        <div class="setting-group">
          <label for="working-hours-constraint">
            <input type="checkbox" id="working-hours-constraint">
            Respect working hours
          </label>
          <div id="working-hours-inputs" class="time-inputs" style="display: none;">
            <input type="time" id="work-start" value="08:00">
            <span>to</span>
            <input type="time" id="work-end" value="18:00">
          </div>
        </div>
        
        <!-- Triggers -->
        <div class="setting-group">
          <label>Auto-trigger on:</label>
          <label><input type="checkbox" id="trigger-new-wo"> New work order</label>
          <label><input type="checkbox" id="trigger-priority"> Priority change</label>
          <label><input type="checkbox" id="trigger-resource"> Resource change</label>
        </div>
        
        <!-- Worker assignment (disabled) -->
        <div class="setting-group disabled">
          <label>Worker Assignment Mode</label>
          <select disabled>
            <option>Manual (current)</option>
            <option>Auto (coming soon)</option>
          </select>
          <span class="coming-soon-badge">Coming Soon</span>
        </div>
      </div>
      
      <!-- Save Button -->
      <div class="actions">
        <button id="save-btn" class="btn-primary">💾 Save Settings</button>
        <span id="save-status" class="status-message"></span>
      </div>
    </div>
  </div>
  
  <script type="module" src="../js/production-settings.js"></script>
</body>
</html>
```

**3. JavaScript Logic**

`quote-portal/domains/admin/js/production-settings.js`:

```javascript
import productionModeCache from '../../../shared/state/productionMode.js';

// DOM elements
const modeRadios = document.querySelectorAll('input[name="scheduling-mode"]');
const optimizationPanel = document.getElementById('optimization-settings');
const autoCalcCheckbox = document.getElementById('auto-calc-enabled');
const autoCalcInterval = document.getElementById('auto-calc-interval');
const workingHoursCheckbox = document.getElementById('working-hours-constraint');
const workingHoursInputs = document.getElementById('working-hours-inputs');
const saveBtn = document.getElementById('save-btn');
const saveStatus = document.getElementById('save-status');

// Initialize
function init() {
  // Load current mode from cache
  const currentMode = productionModeCache.getMode();
  document.getElementById(`mode-${currentMode}`).checked = true;
  
  // Show/hide optimization panel
  toggleOptimizationPanel();
  
  // Event listeners
  modeRadios.forEach(radio => {
    radio.addEventListener('change', toggleOptimizationPanel);
  });
  
  autoCalcCheckbox.addEventListener('change', () => {
    autoCalcInterval.disabled = !autoCalcCheckbox.checked;
  });
  
  workingHoursCheckbox.addEventListener('change', () => {
    workingHoursInputs.style.display = workingHoursCheckbox.checked ? 'flex' : 'none';
  });
  
  saveBtn.addEventListener('click', handleSave);
}

// Toggle optimization panel visibility
function toggleOptimizationPanel() {
  const selectedMode = document.querySelector('input[name="scheduling-mode"]:checked').value;
  optimizationPanel.style.display = selectedMode === 'optimized' ? 'block' : 'none';
}

// Handle save (NON-FUNCTIONAL - just alert)
function handleSave() {
  const selectedMode = document.querySelector('input[name="scheduling-mode"]:checked').value;
  
  // Show loading
  saveBtn.disabled = true;
  saveBtn.textContent = '⏳ Saving...';
  
  // Simulate save
  setTimeout(() => {
    // ⚠️ NON-FUNCTIONAL: Just show alert
    alert('✅ Settings saved! (Non-functional UI - backend integration coming soon)');
    
    // Reset button
    saveBtn.disabled = false;
    saveBtn.textContent = '💾 Save Settings';
    
    // Show success message
    saveStatus.textContent = '✅ Saved successfully';
    saveStatus.className = 'status-message success';
    setTimeout(() => {
      saveStatus.textContent = '';
    }, 3000);
    
  }, 1000);
}

// Initialize on load
init();
```

**4. CSS Styling**

`quote-portal/domains/admin/styles/production-settings.css`:

```css
.settings-card {
  background: white;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.setting-group {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid #eee;
}

.setting-group:last-child {
  border-bottom: none;
}

.setting-label {
  display: block;
  margin-bottom: 12px;
}

.label-text {
  font-weight: 600;
  font-size: 16px;
  display: block;
}

.label-description {
  font-size: 14px;
  color: #666;
  display: block;
  margin-top: 4px;
}

/* Toggle Switch */
.toggle-switch {
  display: flex;
  gap: 16px;
}

.toggle-switch input[type="radio"] {
  display: none;
}

.toggle-switch label {
  flex: 1;
  padding: 16px;
  border: 2px solid #ddd;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  text-align: center;
}

.toggle-switch input:checked + label {
  border-color: #4CAF50;
  background: #f0f8f0;
}

.mode-icon {
  font-size: 32px;
  display: block;
  margin-bottom: 8px;
}

.mode-name {
  font-weight: 600;
  display: block;
  font-size: 16px;
}

.mode-desc {
  font-size: 12px;
  color: #666;
  display: block;
}

/* Optimization Panel */
.optimization-panel {
  background: #f9f9f9;
  padding: 16px;
  border-radius: 8px;
  margin-top: 16px;
}

.optimization-panel h3 {
  margin-top: 0;
}

/* Actions */
.actions {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 24px;
}

.btn-primary {
  padding: 12px 24px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
  transition: background 0.3s;
}

.btn-primary:hover {
  background: #45a049;
}

.btn-primary:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.status-message {
  font-size: 14px;
}

.status-message.success {
  color: #4CAF50;
}

/* Disabled state */
.setting-group.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.coming-soon-badge {
  background: #ff9800;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  margin-left: 8px;
}
```

### Test Senaryoları

**Test 1: Toggle Visibility**

**İşlem:**
1. FIFO seç
2. Optimization seç

**Beklenen Sonuç:**
- FIFO: Optimization panel gizli
- Optimization: Panel görünür

**Test 2: Checkbox Dependencies**

**İşlem:**
1. Auto-calculation checkbox'ı işaretle

**Beklenen Sonuç:**
- Interval input enabled oluyor

**Test 3: Save Button**

**İşlem:**
1. Mode değiştir
2. Save'e tıkla

**Beklenen Sonuç:**
- Loading state gösteriliyor
- Alert çıkıyor: "Settings saved! (Non-functional UI)"
- Success message gösteriliyor

### Başarı Kriterleri

✅ Settings sayfasına link eklendi  
✅ Production settings UI render ediliyor  
✅ Mode toggle çalışıyor  
✅ Optimization panel conditional visibility  
✅ Save button alert gösteriyor  
✅ Tüm form inputs responsive  

**⚠️ NOT:** Bu prompt sadece UI, backend entegrasyonu sonraki fazda!

---

### PROMPT #9: Work Order Priority Popup (Conditional)

**Kaynak:** `Optimize-Packet-Order-System.md - PROMPT #15`

**Süre:** ~40 dakika

### Amaç
Work order start butonuna tıklandığında, optimization mode'daysa priority selection popup gösterin. FIFO mode'daysa direkt başlatsın.

### Hedef Dosyalar
- `quote-portal/domains/orders/components/start-wo-modal.html` (yeni)
- `quote-portal/domains/orders/js/start-wo-modal.js` (yeni)
- `quote-portal/domains/orders/styles/start-wo-modal.css` (yeni)
- `quote-portal/domains/production/js/approvedQuotes.js` (güncelle)

### İşlem Adımları

**1. Popup HTML Component**

`quote-portal/domains/orders/components/start-wo-modal.html`:

```html
<div id="start-wo-modal" class="modal" style="display: none;">
  <div class="modal-content">
    <div class="modal-header">
      <h2>🎯 Set Work Order Priority</h2>
      <button class="close-btn">&times;</button>
    </div>
    
    <div class="modal-body">
      <p>Select priority for work order: <strong id="modal-wo-code"></strong></p>
      
      <div class="priority-options">
        <label class="priority-option">
          <input type="radio" name="priority" value="1">
          <span class="priority-card low">
            <span class="priority-icon">🟢</span>
            <span class="priority-name">Low Priority</span>
            <span class="priority-desc">Non-urgent, flexible timeline</span>
          </span>
        </label>
        
        <label class="priority-option">
          <input type="radio" name="priority" value="2" checked>
          <span class="priority-card normal">
            <span class="priority-icon">🟡</span>
            <span class="priority-name">Normal Priority</span>
            <span class="priority-desc">Standard production schedule</span>
          </span>
        </label>
        
        <label class="priority-option">
          <input type="radio" name="priority" value="3">
          <span class="priority-card high">
            <span class="priority-icon">🔴</span>
            <span class="priority-name">High Priority</span>
            <span class="priority-desc">Urgent, prioritize scheduling</span>
          </span>
        </label>
      </div>
      
      <div class="urgent-section">
        <label>
          <input type="checkbox" id="is-urgent-check">
          <span>⚡ Mark as URGENT (override FIFO)</span>
        </label>
      </div>
    </div>
    
    <div class="modal-footer">
      <button id="cancel-btn" class="btn-secondary">Cancel</button>
      <button id="confirm-start-btn" class="btn-primary">🚀 Start Production</button>
    </div>
  </div>
</div>
```

**2. Popup JavaScript**

`quote-portal/domains/orders/js/start-wo-modal.js`:

```javascript
import productionModeCache from '../../../shared/state/productionMode.js';

let currentWorkOrderCode = null;
let onConfirmCallback = null;

// Show modal
export function showStartWoModal(workOrderCode, onConfirm) {
  currentWorkOrderCode = workOrderCode;
  onConfirmCallback = onConfirm;
  
  // Set work order code in modal
  document.getElementById('modal-wo-code').textContent = workOrderCode;
  
  // Reset form
  document.querySelector('input[name="priority"][value="2"]').checked = true;
  document.getElementById('is-urgent-check').checked = false;
  
  // Show modal
  document.getElementById('start-wo-modal').style.display = 'flex';
}

// Hide modal
function hideModal() {
  document.getElementById('start-wo-modal').style.display = 'none';
  currentWorkOrderCode = null;
  onConfirmCallback = null;
}

// Handle confirm
function handleConfirm() {
  const priority = parseInt(document.querySelector('input[name="priority"]:checked').value);
  const isUrgent = document.getElementById('is-urgent-check').checked;
  
  if (onConfirmCallback) {
    onConfirmCallback({ priority, isUrgent });
  }
  
  hideModal();
}

// Initialize event listeners
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('start-wo-modal');
  if (!modal) return;
  
  // Close button
  modal.querySelector('.close-btn').addEventListener('click', hideModal);
  
  // Cancel button
  document.getElementById('cancel-btn').addEventListener('click', hideModal);
  
  // Confirm button
  document.getElementById('confirm-start-btn').addEventListener('click', handleConfirm);
  
  // Click outside to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      hideModal();
    }
  });
});
```

**3. ApprovedQuotes Integration**

`quote-portal/domains/production/js/approvedQuotes.js` içinde `startProduction` fonksiyonunu güncelleyin:

```javascript
import productionModeCache from '../../../shared/state/productionMode.js';
import { showStartWoModal } from '../../orders/js/start-wo-modal.js';

async function startProduction(workOrderCode) {
  // ... existing validation code ...
  
  // ✅ YENİ: Conditional popup based on production mode
  if (productionModeCache.isOptimizationMode()) {
    // Show priority selection popup
    showStartWoModal(workOrderCode, async ({ priority, isUrgent }) => {
      await launchWithPriority(workOrderCode, priority, isUrgent);
    });
  } else {
    // FIFO mode: Direct start with default priority
    await launchWithPriority(workOrderCode, 2, false);
  }
}

async function launchWithPriority(workOrderCode, priority, isUrgent) {
  // ... existing launch code ...
  
  // Add priority to request
  const result = await launchProductionPlan(plan.id, workOrderCode, { 
    priority, 
    isUrgent 
  });
  
  // ... rest of the code ...
}
```

**4. Modal CSS**

`quote-portal/domains/orders/styles/start-wo-modal.css`:

```css
.modal {
  display: none;
  position: fixed;
  z-index: 1000;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.5);
  align-items: center;
  justify-content: center;
}

.modal-content {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #eee;
}

.modal-header h2 {
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 28px;
  cursor: pointer;
  color: #999;
}

.modal-body {
  padding: 20px;
}

.priority-options {
  display: flex;
  gap: 12px;
  margin: 20px 0;
}

.priority-option {
  flex: 1;
  cursor: pointer;
}

.priority-option input {
  display: none;
}

.priority-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  border: 2px solid #ddd;
  border-radius: 8px;
  transition: all 0.3s;
}

.priority-option input:checked + .priority-card {
  border-color: #4CAF50;
  background: #f0f8f0;
  transform: scale(1.05);
}

.priority-card.low:hover { border-color: #4CAF50; }
.priority-card.normal:hover { border-color: #FF9800; }
.priority-card.high:hover { border-color: #F44336; }

.priority-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.priority-name {
  font-weight: 600;
  margin-bottom: 4px;
}

.priority-desc {
  font-size: 12px;
  color: #666;
  text-align: center;
}

.urgent-section {
  margin-top: 20px;
  padding: 12px;
  background: #fff3cd;
  border-radius: 4px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px;
  border-top: 1px solid #eee;
}

.btn-secondary {
  padding: 10px 20px;
  background: #999;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.btn-primary {
  padding: 10px 20px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.btn-primary:hover {
  background: #45a049;
}
```

### Test Senaryoları

**Test 1: FIFO Mode - No Popup**

**Başlangıç Durumu:**
- Production mode = 'fifo'

**İşlem:**
1. Work order start butonuna tıkla

**Beklenen Sonuç:**
- Popup AÇILMIYOR
- Direkt production başlıyor
- Default priority = 2

**Test 2: Optimization Mode - Popup Shows**

**Başlangıç Durumu:**
- Production mode = 'optimized'

**İşlem:**
1. Work order start butonuna tıkla

**Beklenen Sonuç:**
- Popup açılıyor
- Work order code gösteriliyor
- Priority seçenekleri var

**Test 3: Priority Selection**

**İşlem:**
1. Popup'ta High Priority seç
2. is-Urgent check et
3. Start Production'a tıkla

**Beklenen Sonuç:**
- Popup kapanıyor
- Backend'e priority=3, isUrgent=true gönderiliyor

**Test 4: Mode Change Reactive**

**Başlangıç Durumu:**
- Mode = 'fifo', sayfa açık

**İşlem:**
1. Production Settings'ten mode'u 'optimized' yap
2. Sayfayı RELOAD ETME
3. Start butonuna tıkla

**Beklenen Sonuç:**
- Popup açılıyor (reactive update)

### Başarı Kriterleri

✅ FIFO mode: Popup yok, direkt start  
✅ Optimization mode: Popup açılıyor  
✅ Priority selection çalışıyor  
✅ isUrgent checkbox çalışıyor  
✅ Backend'e doğru data gönderiliyor  
✅ Mode change reactive (no reload)  

---

### PROMPT #10: Manual Optimize Button (Conditional Visibility)

**Kaynak:** `Optimize-Packet-Order-System.md - PROMPT #16`

**Süre:** ~30 dakika

### Amaç
Work Orders sayfasına "Optimize Schedule Now" butonu ekleyin. Bu buton sadece optimization mode'dayken görünsün ve reactive olsun.

### Hedef Dosyalar
- `quote-portal/pages/quote-dashboard.html` (güncelle)
- `quote-portal/domains/orders/js/work-orders.js` (güncelle)
- `quote-portal/domains/orders/styles/work-orders.css` (güncelle)

### İşlem Adımları

**1. HTML'e Buton Ekle**

`quote-portal/pages/quote-dashboard.html` içinde work orders section'a ekleyin:

```html
<div class="page-header">
  <h1>📋 Work Orders</h1>
  <div class="header-actions">
    <!-- ✅ YENİ: Conditional optimize button -->
    <button id="optimize-schedule-btn" class="btn-optimize" style="display: none;">
      <span class="btn-icon">🎯</span>
      <span class="btn-text">Optimize Schedule Now</span>
      <span class="btn-badge" id="optimize-badge"></span>
    </button>
    
    <button id="refresh-btn" class="btn-secondary">
      🔄 Refresh
    </button>
  </div>
</div>

<!-- Last optimization info -->
<div id="last-optimization-info" class="info-banner" style="display: none;">
  <span class="info-icon">ℹ️</span>
  <span id="last-run-text">Last optimization: Never</span>
</div>
```

**2. JavaScript Logic**

`quote-portal/domains/orders/js/work-orders.js` içine ekleyin:

```javascript
import productionModeCache from '../../../shared/state/productionMode.js';

// DOM elements
const optimizeBtn = document.getElementById('optimize-schedule-btn');
const optimizeBadge = document.getElementById('optimize-badge');
const lastOptInfo = document.getElementById('last-optimization-info');
const lastRunText = document.getElementById('last-run-text');

// Initialize
function initializeOptimizeButton() {
  // Initial visibility
  updateOptimizeButtonVisibility();
  
  // Reactive update on mode change
  productionModeCache.onChange((newMode) => {
    updateOptimizeButtonVisibility();
    console.log(`🔄 Optimize button visibility updated for mode: ${newMode}`);
  });
  
  // Click handler
  optimizeBtn.addEventListener('click', handleOptimizeClick);
  
  // Load last optimization time
  loadLastOptimizationTime();
}

// Update button visibility based on mode
function updateOptimizeButtonVisibility() {
  const isOptimizationMode = productionModeCache.isOptimizationMode();
  
  optimizeBtn.style.display = isOptimizationMode ? 'flex' : 'none';
  lastOptInfo.style.display = isOptimizationMode ? 'flex' : 'none';
  
  // Update badge
  if (isOptimizationMode) {
    const pendingCount = getPendingTasksCount();
    optimizeBadge.textContent = pendingCount > 0 ? `${pendingCount} tasks` : '';
  }
}

// Handle optimize button click
async function handleOptimizeClick() {
  try {
    // Show loading state
    optimizeBtn.disabled = true;
    optimizeBtn.classList.add('loading');
    optimizeBtn.querySelector('.btn-text').textContent = 'Optimizing...';
    
    // ⚠️ NON-FUNCTIONAL: Just show alert (real optimization in Phase 3)
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    alert('✅ Schedule optimized! (Non-functional - algorithm coming in Phase 3)');
    
    // Update last run time
    const now = new Date();
    lastRunText.textContent = `Last optimization: ${now.toLocaleTimeString()}`;
    localStorage.setItem('lastOptimization', now.toISOString());
    
  } catch (error) {
    console.error('Optimization failed:', error);
    alert('❌ Optimization failed. Please try again.');
    
  } finally {
    // Reset button state
    optimizeBtn.disabled = false;
    optimizeBtn.classList.remove('loading');
    optimizeBtn.querySelector('.btn-text').textContent = 'Optimize Schedule Now';
  }
}

// Load last optimization time from localStorage
function loadLastOptimizationTime() {
  const lastRun = localStorage.getItem('lastOptimization');
  if (lastRun) {
    const date = new Date(lastRun);
    const timeAgo = getTimeAgo(date);
    lastRunText.textContent = `Last optimization: ${timeAgo}`;
  }
}

// Helper: Get time ago string
function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return date.toLocaleDateString();
}

// Helper: Get pending tasks count
function getPendingTasksCount() {
  // Count pending assignments (from work orders page data)
  const workOrders = document.querySelectorAll('.work-order-card[data-status="Üretiliyor"]');
  return workOrders.length;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initializeOptimizeButton);
```

**3. CSS Styling**

`quote-portal/domains/orders/styles/work-orders.css`:

```css
.btn-optimize {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-optimize:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.6);
}

.btn-optimize:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.btn-optimize.loading .btn-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.btn-icon {
  font-size: 20px;
}

.btn-badge {
  background: rgba(255,255,255,0.3);
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
}

.info-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #e3f2fd;
  border-left: 4px solid #2196F3;
  border-radius: 4px;
  margin-bottom: 16px;
}

.info-icon {
  font-size: 20px;
}
```

### Test Senaryoları

**Test 1: FIFO Mode - Button Hidden**

**Başlangıç Durumu:**
- Production mode = 'fifo'

**İşlem:**
1. Work Orders sayfasını aç

**Beklenen Sonuç:**
- Optimize button **görünmüyor**
- Last optimization info **görünmüyor**

**Test 2: Optimization Mode - Button Visible**

**Başlangıç Durumu:**
- Production mode = 'optimized'

**İşlem:**
1. Work Orders sayfasını aç

**Beklenen Sonuç:**
- Optimize button **görünüyor**
- Badge pending task sayısını gösteriyor
- Last optimization info görünüyor

**Test 3: Button Click**

**İşlem:**
1. Optimize button'a tıkla

**Beklenen Sonuç:**
- Loading state aktif
- Button text: "Optimizing..."
- Icon spin animation
- 1.5 saniye sonra alert: "Schedule optimized!"
- Last run time güncelleniyor

**Test 4: Reactive Visibility**

**Başlangıç Durumu:**
- Mode = 'fifo', Work Orders page açık

**İşlem:**
1. Production Settings'ten mode'u 'optimized' yap
2. Work Orders page'e dön (RELOAD ETME)

**Beklenen Sonuç:**
- Button otomatik görünüyor (reactive)
- Console log: "🔄 Optimize button visibility updated"

**Test 5: Last Run Persistence**

**İşlem:**
1. Optimize button'a tıkla
2. Sayfayı reload et

**Beklenen Sonuç:**
- Last run time korunuyor (localStorage)
- "Last optimization: X minutes ago" gösteriliyor

### Debug Logging

**Mode Change:**
```
🔄 Optimize button visibility updated for mode: optimized
```

**Button Click:**
```
🎯 Optimizing schedule...
✅ Optimization completed
```

### Başarı Kriterleri

✅ FIFO mode: Button gizli  
✅ Optimization mode: Button görünür  
✅ Reactive visibility (no page reload)  
✅ Loading state animation çalışıyor  
✅ Last run time gösteriliyor ve persist ediliyor  
✅ Badge pending task count gösteriyor  

**⚠️ NOT:** Bu fazda buton sadece alert gösterecek, gerçek optimization algorithm Phase 3'te!

---

## B.2 Prompt Uygulama Sırası ve Entegrasyon

### Zorunlu Sıralama

**BACKEND FOUNDATION (Sprint 1):** #1 → #2 → #3 → #4 → #5 → #6  
**UI INFRASTRUCTURE (Sprint 2):** #7 → (#8, #9, #10 paralel)

### Bağımlılık Matrisi

| Prompt # | Başlık | Süre | Bağımlı Olduğu Prompts | Entegrasyon Noktaları |
|----------|--------|------|------------------------|----------------------|
| **#1** | Worker Schedule Schema | 45 dk | - | `assignNodeResources()` içinde kullanılıyor |
| **#2** | Mevcut Assignments Yükleme | 30 dk | #1 (schedule kullanımı) | Launch endpoint başında, schedule map'leri dolduruyor |
| **#3** | Topological Validation | 60 dk | - | Launch endpoint'te execution order check'ten sonra |
| **#4** | Material Shortage Handling | 45 dk | #1, #2, #3 (launch flow devam ediyor) | Assignment creation + worker portal canStart logic |
| **#5** | Schema Validation Timing | 60 dk | #1-#4 (tüm assignment fields set) | Batch commit öncesi, PHASE 1-2-3 ayrımı |
| **#6** | Batch Size Limiting | 40 dk | #5 (validation öncesi) | PHASE 3'te batch commit logic |
| **#7** ⭐ | Production Mode Cache | 30 dk | - | **KRİTİK:** #8-10 buna bağımlı! App başlangıcı |
| **#8** | Production Settings UI | 60 dk | #7 (cache kullanımı) | Admin panel, non-functional UI |
| **#9** | Priority Popup | 40 dk | #7 (cache kullanımı) | Work order start conditional popup |
| **#10** | Optimize Button | 30 dk | #7 (cache kullanımı) | Work orders page conditional visibility |

**Toplam Süre:** ~6.5 saat (Backend: 4.5 saat, UI: 2 saat)

### Sprint Organizasyonu

**Sprint 1 - Backend Foundation (1 gün)**
- PROMPT #1-6 sıralı uygulama
- Her prompt sonrası checklist kontrolü
- Final test senaryosu ile doğrulama

**Sprint 2 - UI Infrastructure (yarım gün)**
- PROMPT #7 ÖNCE (blocking)
- PROMPT #8-10 paralel (non-blocking)
- Reactive behavior testleri

### Entegrasyon Kontrol Listesi

Her prompt'u uyguladıktan sonra şunları kontrol edin:

**Backend Foundation (#1-6) Sonrası:**
- [ ] Worker dökümanlarında `personalSchedule` field var
- [ ] `getDefaultWorkSchedule()` fonksiyonu çalışıyor
- [ ] `assignNodeResources()` schedule kullanıyor
- [ ] Launch başında mevcut assignments yükleniyor
- [ ] `workerSchedule` ve `substationSchedule` Map'leri dolu
- [ ] Çakışan atamalar olmuyor
- [ ] `validateTopologicalOrder()` fonksiyonu çalışıyor
- [ ] Invalid order ile launch blocked
- [ ] Material shortage ile plan launch ediliyor
- [ ] `materialReservationStatus` field assignment'larda var
- [ ] Worker portal block reason gösteriyor
- [ ] Validation batch commit öncesinde
- [ ] Critical error varsa hiçbir assignment yazılmıyor
- [ ] `commitInBatches()` fonksiyonu çalışıyor
- [ ] 500+ assignment plan'lar launch ediliyor

**UI Infrastructure (#7-10) Sonrası:**
- [ ] `productionModeCache` global olarak erişilebilir
- [ ] App başlangıcında 1 Firestore query
- [ ] `getMode()` synchronous ve instant
- [ ] Production Settings UI render ediliyor
- [ ] Mode toggle çalışıyor
- [ ] FIFO mode: Priority popup YOK, optimize button GİZLİ
- [ ] Optimization mode: Priority popup VAR, optimize button GÖRÜNÜR
- [ ] Mode change reactive (no page reload)
- [ ] Optimize button loading state çalışıyor
- [ ] Last optimization time gösteriliyor

### Final Test Senaryosu (Tüm 10 Prompt Entegre)

**Başlangıç Durumu:**
- 3 worker (personal schedule'lı)
- 2 station (3 substation)
- 1 mevcut plan launched (5 pending assignment)
- Production mode = 'optimized'

**Test Plan:**
- 800 node'lu large plan
- Topological dependencies var
- Material shortage var (2 malzeme)
- Invalid node yok

**Backend Test:**
1. Launch başında mevcut 5 assignment yükleniyor ✅
2. Worker schedule'ları doğru (mesai saatleri) ✅
3. Topological order validation pass ✅
4. Material shortage warning alınıyor ✅
5. 800 assignment validate ediliyor ✅
6. 2 batch commit yapılıyor (800 assignment + 2 update) ✅
7. Tüm assignments `materialReservationStatus='blocked'` ✅
8. Worker portal'da block badge görünüyor ✅

**UI Test:**
1. App başlangıcında production mode 'optimized' yükleniyor ✅
2. Work order start button → Priority popup açılıyor ✅
3. High priority + Urgent seçimi backend'e gidiyor ✅
4. Optimize button work orders sayfasında görünür ✅
5. Production Settings'te mode → 'fifo' değiştir ✅
6. Priority popup artık açılmıyor (reactive) ✅
7. Optimize button artık gizli (reactive) ✅
8. Page reload YOK ✅

**Console Output:**
```
🚀 Initializing app...
🔧 Initializing ProductionModeCache...
✅ Production mode loaded: optimized

📊 Loading existing assignments into schedule...
   Found 5 existing assignment(s)
   ✅ Loaded schedules: 2 worker(s), 3 substation(s)

🔍 Validating topological order...
✅ Topological order is valid

⚠️ Material shortages detected (2 items)
   Plan will launch but assignments will be blocked until materials are reserved

🔍 Validating assignment schemas...
✅ All assignments validated successfully

💾 Preparing batch operations...
💾 Committing 2 batch(es) with 807 total operation(s)...
   ✅ Batch 1/2 committed
   ✅ Batch 2/2 committed
✅ All operations committed successfully (2 batch(es))

✓ Plan WO-002 launched with 800 assignments (2 material shortages)
```

---

## B.3 Implementation Checklist ve Rollback Plan

### Ön Hazırlık

**Gerekli Toollar:**
- [ ] Firebase Admin SDK kurulu
- [ ] Firestore database backup alındı
- [ ] Git branch oluşturuldu (örn: `feature/fifo-improvements`)
- [ ] Test database hazır (prod'a dokunmadan test için)

### Implementation Order

```
Phase 1: Foundation (Öncelik: P0-P1)
├── PROMPT #1: Worker Personal Schedule Schema    [~2 saat]
│   ├── Schema tanımı
│   ├── Migration script
│   ├── Default schedule function
│   └── Test senaryoları
│
└── PROMPT #2: Mevcut Assignments Yükleme         [~1 saat]
    ├── Schedule loading logic
    ├── Map initialization
    └── Test senaryoları

Phase 2: Validation & Safety (Öncelik: P2)
├── PROMPT #3: Topological Order Validation       [~1.5 saat]
│   ├── Validation function
│   ├── Launch endpoint integration
│   └── Test senaryoları
│
└── PROMPT #4: Material Shortage Handling         [~2 saat]
    ├── Assignment field ekleme
    ├── Worker portal logic
    ├── UI update
    └── Test senaryoları

Phase 3: Scalability & Robustness (Öncelik: P3)
├── PROMPT #5: Schema Validation Timing           [~1 saat]
│   ├── Phase 1-2-3 ayrımı
│   ├── Error handling
│   └── Test senaryoları
│
└── PROMPT #6: Batch Size Limiting                [~1 saat]
    ├── commitInBatches helper
    ├── Operations array
    └── Test senaryoları

Toplam Tahmini Süre: ~9.5 saat
```

### Checkpoint System

Her prompt'tan sonra checkpoint alın:

```bash
# PROMPT #1 tamamlandı
git add .
git commit -m "feat(fifo): Add worker personal schedule schema (#1)"
git tag checkpoint-prompt-1

# PROMPT #2 tamamlandı
git add .
git commit -m "feat(fifo): Load existing assignments into schedule (#2)"
git tag checkpoint-prompt-2

# ... devam ...
```

### Rollback Komutları

Eğer bir prompt sorun çıkarırsa:

```bash
# Son checkpoint'e dön
git reset --hard checkpoint-prompt-2
git tag -d checkpoint-prompt-3  # Failed tag'i sil

# Veya specific commit'e dön
git log --oneline
git reset --hard <commit-hash>
```

### Test Automation Script

Her prompt sonrası çalıştırılacak test script'i:

```bash
#!/bin/bash
# test-fifo-prompts.sh

echo "🧪 Running FIFO System Tests..."

# Test 1: Worker Schedule
echo "1️⃣ Testing Worker Schedule..."
node scripts/test-worker-schedule.js || exit 1

# Test 2: Launch with Existing Assignments
echo "2️⃣ Testing Launch with Existing Assignments..."
node scripts/test-launch-overlap.js || exit 1

# Test 3: Topological Validation
echo "3️⃣ Testing Topological Validation..."
node scripts/test-topological-order.js || exit 1

# Test 4: Material Shortage
echo "4️⃣ Testing Material Shortage..."
node scripts/test-material-shortage.js || exit 1

# Test 5: Schema Validation
echo "5️⃣ Testing Schema Validation..."
node scripts/test-schema-validation.js || exit 1

# Test 6: Large Plan
echo "6️⃣ Testing Large Plan (500+ assignments)..."
node scripts/test-large-plan.js || exit 1

echo "✅ All tests passed!"
```

---

# APPENDIX C: Özet ve Sonuç

## C.1 Dokümantasyon Özeti

Bu doküman **3 ana bölümden** oluşmaktadır:

### Bölüm 1-11: FIFO System Documentation (Orijinal)
- Mevcut FIFO sisteminin detaylı teknik açıklaması
- Veri akışı, schema tanımları, endpoint'ler
- Örnek senaryolar ve kullanım durumları

### APPENDIX A: Sistem Analizi ve İyileştirme Noktaları
- Tespit edilen 8 sorun/iyileştirme noktası
- Her sorun için detaylı analiz
- Etki seviyesi ve öncelik matrisi

### APPENDIX B: Implementation Prompts
- 6 adet sıralı, entegre implementation prompt
- Her prompt için:
  - Amaç ve hedef dosyalar
  - Adım adım işlem talimatları
  - Test senaryoları ve debug logging
  - Rollback planı
  - Başarı kriterleri

## C.2 Önemli Notlar

### ⚠️ Zorunlu Sıralama

Promtlar **MUTLAKA** 1'den 6'ya kadar sırayla uygulanmalıdır:

```
#1 (Worker Schedule) → #2 (Existing Assignments) → 
#3 (Topological Validation) → #4 (Material Shortage) → 
#5 (Schema Validation) → #6 (Batch Limiting)
```

### 🔗 Entegrasyon Kritik Noktaları

1. **#1 ve #2 birlikte çalışır:**  
   Schedule logic (#1) olmadan assignment loading (#2) eksik olur

2. **#5 ve #6 birlikte çalışır:**  
   Validation (#5) olmadan batch split (#6) partial commit riski taşır

3. **#4 tüm flow'a entegre:**  
   Material handling (#4) hem launch hem worker portal'ı etkiler

### ✅ Başarı Metrikleri

Tüm promtlar uygulandıktan sonra:

- [ ] Worker schedule control çalışıyor (mesai saatleri)
- [ ] Çakışan atamalar olmuyor (double booking yok)
- [ ] Invalid topological order launch edilemiyor
- [ ] Material shortage launch'u block etmiyor ama task start'ı engelliyor
- [ ] Schema validation batch commit öncesinde yapılıyor
- [ ] 500+ node'lu plan'lar launch ediliyor

### 📊 Performans Beklentileri

| Plan Büyüklüğü | Node Sayısı | Launch Süresi | Batch Count |
|----------------|-------------|---------------|-------------|
| Small | 1-100 | < 1 saniye | 1 |
| Medium | 100-500 | 1-2 saniye | 1-2 |
| Large | 500-1000 | 2-4 saniye | 2-3 |
| XLarge | 1000+ | 4-8 saniye | 3+ |

## C.3 Sonraki Adımlar

### Immediate (Bu Promtlar Uygulandıktan Sonra)

1. **Monitoring ve Metrics:**
   - Launch sürelerini log'la
   - Batch count'ları track et
   - Material shortage frequency'yi ölç

2. **UI İyileştirmeleri:**
   - Admin panel'de material reservation management
   - Worker schedule editor interface
   - Topological order visualization

3. **Documentation Update:**
   - API documentation güncelle
   - User guide'a yeni features ekle
   - Troubleshooting guide oluştur

### Future Enhancements

1. **Optimization Mode Aktivasyonu:**
   - `Optimize-Packet-Order-System.md` dokümanına göre
   - schedulingMode='optimized' desteği
   - Algorithm selection interface

2. **Advanced Scheduling:**
   - Worker shift planning (vardiya sistemi)
   - Holiday calendar integration
   - Overtime calculation

3. **Material Automation:**
   - Otomatik material reservation
   - Just-in-time stock alert
   - Supplier integration

## C.4 Destek ve İletişim

### Sorun Bildir

Eğer implementation sırasında sorun yaşarsanız:

1. **Console log'ları toplayın:**  
   ```bash
   npm start > logs/launch-$(date +%Y%m%d-%H%M%S).log 2>&1
   ```

2. **Test senaryosunu tanımlayın:**  
   - Plan yapısı (node count, dependencies)
   - Error message
   - Expected vs actual behavior

3. **Checkpoint bilgisini paylaşın:**  
   ```bash
   git log --oneline -5
   git describe --tags
   ```

### Debug Mode

Detaylı logging için environment variable:

```bash
# .env dosyasına ekle
DEBUG_FIFO_LAUNCH=true
DEBUG_ASSIGNMENT_CREATION=true
DEBUG_SCHEDULE_TRACKING=true
```

## C.5 Version History

| Versiyon | Tarih | Değişiklikler |
|----------|-------|---------------|
| 1.0 | 18 Kasım 2025 | Initial FIFO system documentation |
| 1.1 | 18 Kasım 2025 | + Appendix A: Sistem analizi |
| 1.2 | 18 Kasım 2025 | + Appendix B: Implementation prompts |
| 1.3 | 18 Kasım 2025 | + Appendix C: Özet ve sonuç |

---

**🎯 Bu doküman kullanıma hazır!**

APPENDIX B'deki 6 prompt'u sırayla uygulayarak FIFO sistemini production-ready hale getirebilirsiniz.

**Başarılar! 🚀**

---

**Doküman Sonu**  
**Toplam Satır:** 3,900+  
**Toplam Prompt:** 6  
**Tahmini Implementation Süresi:** ~10 saat  

---

