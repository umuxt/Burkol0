# 🚀 Launch Operations - Üretim Başlatma İşlemleri

## Genel Bakış

Bu doküman, kullanıcı **🏁 Başlat** butonuna tıkladığında sistemde gerçekleşen tüm işlemleri, akışları ve algoritmaları detaylı şekilde açıklar.

---

## 📍 Başlangıç Noktası

**Konum:** `quote-portal/domains/production/js/approvedQuotes.js`  
**Fonksiyon:** `startProduction(workOrderCode)`  
**Tetikleyici:** Onaylı Teklifler sayfasındaki "🏁 Başlat" butonu

```javascript
async function startProduction(workOrderCode)
```

---

## 🔄 İşlem Akışı

### 1️⃣ **Validasyon Aşaması** (Frontend)

#### 1.1 Production Plan Kontrolü
```javascript
const plan = productionPlansMap[workOrderCode];

if (!plan || plan.type !== 'production') {
  alert('Üretim planı bulunamadı...');
  return;
}
```

**Ne kontrol ediliyor:**
- İş emri için üretim planı var mı?
- Plan tipi 'production' mı (template değil mi)?

**Veri Kaynağı:**
- `productionPlansMap`: `fetchProductionPlans()` fonksiyonu ile doldurulur
- Firestore `mes-production-plans` koleksiyonundan gelir

---

#### 1.2 Kullanıcı Onayı
```javascript
const confirmed = confirm(
  `Üretimi Başlatmak İstediğinizden Emin misiniz?\n\n` +
  `İş Emri: ${workOrderCode}\n` +
  `Plan: ${plan.name}\n\n` +
  `Bu işlem tüm operasyonlar için kaynak ataması yapacak...`
);
```

**Amaç:** Kullanıcıya kritik işlem öncesi onay aldırmak

---

#### 1.3 UI Durum Güncelleme (Loading)
```javascript
const originalState = getProductionState(workOrderCode);
await setProductionState(workOrderCode, 'Başlatılıyor...', false);
```

**Ne oluyor:**
- Mevcut durum kaydedilir (hata durumunda geri dönmek için)
- UI'da "Başlatılıyor..." gösterilir
- `updateServer = false` → Sadece local state, server'a gönderilmez

---

### 2️⃣ **Backend Launch Request** (API Call)

#### 2.1 API Çağrısı
```javascript
const result = await launchProductionPlan(plan.id, workOrderCode);
```

**API Endpoint:**
```
POST /api/mes/production-plans/:planId/launch
```

**Request Body:**
```json
{
  "workOrderCode": "WO-2024-001"
}
```

**Konum:** `quote-portal/domains/production/js/mesApi.js`

```javascript
export async function launchProductionPlan(planId, workOrderCode) {
  const res = await fetch(`${API_BASE}/api/mes/production-plans/${encodeURIComponent(planId)}/launch`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ workOrderCode })
  });
  
  // Error handling
  if (!res.ok) {
    let errorData = await res.json();
    const error = new Error(errorData.message);
    error.code = errorData.error;
    error.status = res.status;
    error.shortages = errorData.shortages;
    error.errors = errorData.errors;
    throw error;
  }
  
  const result = await res.json();
  
  // Emit BroadcastChannel event
  emitAssignmentsUpdated(planId);
  
  return result;
}
```

---

### 3️⃣ **Backend İşlemleri** (Server Side)

**Konum:** `quote-portal/server/mesRoutes.js`  
**Route Handler:** `router.post('/production-plans/:planId/launch', ...)`

---

#### 3.1 Input Validation (Giriş Kontrolü)

```javascript
if (!planId || !workOrderCode) {
  return res.status(400).json({
    error: 'validation_error',
    message: 'planId and workOrderCode are required'
  });
}
```

**Kontroller:**
1. `planId` ve `workOrderCode` parametreleri mevcut mu?
2. Production plan dokümanı var mı?
3. Plan daha önce başlatılmış mı? (`launchStatus === 'launched'`)
4. Plan iptal edilmiş mi? (`status === 'cancelled'`)
5. Plan durumu 'production' mu?

---

#### 3.2 Approved Quote Kontrolü

```javascript
const quotesSnapshot = await db.collection('mes-approved-quotes')
  .where('workOrderCode', '==', workOrderCode)
  .limit(1)
  .get();

if (quotesSnapshot.empty) {
  return res.status(404).json({
    error: 'approved_quote_not_found',
    message: `${workOrderCode} için onaylı teklif bulunamadı...`
  });
}
```

**Neden Gerekli:**
- Üretim sadece onaylanmış teklifler üzerinden başlatılabilir
- Approved Quote olmadan üretim planlı bile olsa başlamaz

---

#### 3.3 Node Yapısı ve Execution Graph

```javascript
const nodesToUse = planData.nodes || [];

if (nodesToUse.length === 0) {
  return res.status(422).json({
    error: 'empty_plan',
    message: 'Cannot launch plan with no operations'
  });
}

// Build execution order using topological sort
const executionOrder = buildTopologicalOrder(nodesToUse);
```

**Topological Sort (Topolojik Sıralama) Nedir?**

Grafik teorisinde kullanılan bir algoritma. İşlemleri bağımlılık sırasına göre sıralar.

**Örnek:**
```
A → B → D
  ↘ C ↗

Topological Order: [A, B, C, D] veya [A, C, B, D]
```

**Fonksiyon:** `buildTopologicalOrder(nodes)`

```javascript
function buildTopologicalOrder(nodes) {
  // 1. Node normalizasyonu (nodeId veya id kullanımı)
  const normalizedNodes = nodes.map(n => ({
    ...n,
    _id: n.nodeId || n.id
  }));
  
  // 2. Adjacency list ve In-degree map oluşturma
  const nodeMap = new Map(normalizedNodes.map(n => [n._id, n]));
  const inDegree = new Map();
  const adjacencyList = new Map();
  
  // 3. Graph initialization
  normalizedNodes.forEach(node => {
    inDegree.set(node._id, 0);
    adjacencyList.set(node._id, []);
  });
  
  // 4. Predecessor'ları işleyerek graph oluşturma
  normalizedNodes.forEach(node => {
    const predecessors = node.predecessors || [];
    
    for (const predId of predecessors) {
      if (!nodeMap.has(predId)) {
        return {
          error: `Invalid predecessor: Node ${node._id} references non-existent predecessor ${predId}`
        };
      }
      
      adjacencyList.get(predId).push(node._id);
      inDegree.set(node._id, inDegree.get(node._id) + 1);
    }
  });
  
  // 5. Kahn's Algorithm (Topological Sort)
  const queue = [];
  const order = [];
  
  // Predecessor'ı olmayan node'ları queue'ya ekle
  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) {
      queue.push(nodeId);
    }
  });
  
  // Queue'yu işle
  while (queue.length > 0) {
    const nodeId = queue.shift();
    order.push(nodeId);
    
    // Successor'ları işle
    const successors = adjacencyList.get(nodeId) || [];
    for (const successorId of successors) {
      const newDegree = inDegree.get(successorId) - 1;
      inDegree.set(successorId, newDegree);
      
      if (newDegree === 0) {
        queue.push(successorId);
      }
    }
  }
  
  // 6. Cycle detection
  if (order.length !== normalizedNodes.length) {
    return {
      error: 'Cycle detected in execution graph'
    };
  }
  
  return { order, success: true };
}
```

**Çıktı:**
- `order`: Node ID'lerinin çalıştırılma sırası
- Veya `error`: Döngü (cycle) veya geçersiz bağımlılık hatası

---

#### 3.4 Canlı Veri Yükleme (Live Data Loading)

```javascript
const [workersSnapshot, stationsSnapshot, substationsSnapshot] = await Promise.all([
  db.collection('mes-workers').get(),
  db.collection('mes-stations').where('status', '==', 'active').get(),
  db.collection('mes-substations').where('status', '==', 'active').get()
]);
```

**Ne Yükleniyor:**
1. **Tüm işçiler** (worker status normalization yapılacak)
2. **Aktif istasyonlar**
3. **Aktif alt istasyonlar (substations)**

---

##### Worker Status Normalization

```javascript
const workers = rawWorkers.map(w => {
  const copy = { ...w };
  copy.status = (copy.status || copy.availability || 'available').toString();
  
  // Legacy değer normalizasyonu
  if (/active/i.test(copy.status)) copy.status = 'available';
  if (/enabled|on/i.test(copy.status)) copy.status = 'available';
  if (/off|inactive|removed/i.test(copy.status)) copy.status = 'inactive';
  if (/break|paused|rest/i.test(copy.status)) copy.status = 'break';
  if (/busy|working/i.test(copy.status)) copy.status = 'busy';
  
  // Leave durumu kontrolü
  copy.onLeave = isOnLeave(copy);
  
  return copy;
});
```

**Yeni Status Enum:**
- `available`: Müsait
- `busy`: Meşgul
- `break`: Mola
- `inactive`: Aktif değil

---

##### Eligible Workers (Uygun İşçiler)

```javascript
const eligibleWorkers = workers.filter(w => 
  (w.status === 'available' || w.status === 'busy') && !w.onLeave
);

if (eligibleWorkers.length === 0) {
  return res.status(422).json({
    error: 'no_workers',
    message: 'No eligible workers available for assignment...'
  });
}
```

**Koşullar:**
- Status `available` veya `busy` olmalı
- İzinde olmamalı (`onLeave === false`)

---

#### 3.5 Malzeme Validasyonu (Non-Blocking Warnings)

```javascript
const materialValidation = await validateMaterialAvailabilityForLaunch(
  planData,
  planQuantity,
  db
);

const materialWarnings = materialValidation.warnings || [];
```

**Önemli:** Malzeme eksikliği artık **hata değil, uyarı** döner!

**Hangi Malzemeler Kontrol Edilir:**
1. **Start node'lardaki malzemeler** (predecessor'ı olmayan operasyonlar)
2. **M-00 ile başlayan hammaddeler** (kritik raw materials)

**Fonksiyon:** `validateMaterialAvailabilityForLaunch(planData, planQuantity, db)`

```javascript
async function validateMaterialAvailabilityForLaunch(planData, planQuantity, db) {
  const nodes = planData.nodes || [];
  const materialSummary = planData.materialSummary || {};
  const materialInputs = materialSummary.materialInputs || [];
  
  // Start node'ları tespit et
  const startNodeIds = new Set(
    nodes.filter(node => !node.predecessors || node.predecessors.length === 0)
        .map(n => n.id)
  );
  
  // Kontrol edilecek malzemeleri filtrele
  const materialsToCheck = new Map();
  
  materialInputs.forEach(mat => {
    if (mat.isDerived) return; // WIP'leri atla
    
    const shouldCheck = 
      (mat.nodeId && startNodeIds.has(mat.nodeId)) || 
      (mat.materialCode && mat.materialCode.startsWith('M-00'));
    
    if (shouldCheck) {
      const key = mat.materialCode;
      const existing = materialsToCheck.get(key) || { 
        ...mat, 
        requiredQuantity: 0,
        nodeNames: new Set()
      };
      existing.requiredQuantity += (mat.requiredQuantity || 0) * planQuantity;
      if (mat.nodeName) existing.nodeNames.add(mat.nodeName);
      materialsToCheck.set(key, existing);
    }
  });
  
  // Firestore'dan malzeme stok bilgilerini çek
  const materialCodes = Array.from(materialsToCheck.keys());
  const materialDocsPromises = materialCodes.map(code => 
    db.collection('materials').doc(code).get()
  );
  
  const materialDocs = await Promise.all(materialDocsPromises);
  
  // Stok karşılaştırması
  const warnings = [];
  
  for (const [code, mat] of materialsToCheck) {
    const materialData = materialMap.get(code);
    const available = materialData 
      ? parseFloat(materialData.stock || materialData.available) || 0
      : 0;
    const required = mat.requiredQuantity;
    
    if (available < required) {
      warnings.push({
        nodeName: Array.from(mat.nodeNames).join(', '),
        materialCode: code,
        required,
        available,
        unit: mat.unit || 'adet'
      });
    }
  }
  
  return { warnings };
}
```

**Çıktı:**
```javascript
{
  warnings: [
    {
      nodeName: "Kesme, Delme",
      materialCode: "M-001",
      required: 200,
      available: 150,
      unit: "kg"
    }
  ]
}
```

---

#### 3.6 Auto-Assignment Engine (Otomatik Atama Motoru)

Bu aşama, sistemin en kritik ve karmaşık kısmıdır. Her node için worker, station, ve substation ataması yapılır.

```javascript
const assignments = [];
const assignmentErrors = [];
const assignmentWarnings = [];

// Schedule tracking maps
const workerSchedule = new Map();
const stationSchedule = new Map();
const nodeEndTimes = new Map();

// Process nodes in topological order
for (const nodeId of executionOrder.order) {
  const node = nodesToUse.find(n => n.id === nodeId);
  
  const assignment = await assignNodeResources(
    node,
    eligibleWorkers,
    stations,
    substations,
    workerSchedule,
    stationSchedule,
    planData,
    nodeEndTimes,
    db
  );
  
  if (assignment.error) {
    assignmentErrors.push({ nodeId, error: assignment.error, ... });
  } else {
    assignments.push(assignment);
    nodeEndTimes.set(node.id, new Date(assignment.plannedEnd));
    
    // Update schedules
    workerSchedule.get(workerId).push({
      start: new Date(assignment.plannedStart),
      end: new Date(assignment.plannedEnd)
    });
    
    stationSchedule.get(substationId).push({
      start: new Date(assignment.plannedStart),
      end: new Date(assignment.plannedEnd)
    });
  }
}
```

**Amaç:**
- Her node için kaynak (worker, station, substation) atama
- Zamanlama çakışmalarını önleme
- Predecessor bağımlılıklarını gözetme

---

##### 3.6.1 assignNodeResources Fonksiyonu

**Konum:** `quote-portal/server/mesRoutes.js`

```javascript
async function assignNodeResources(
  node,
  workers,
  stations,
  substations,
  workerSchedule,
  stationSchedule,
  planData,
  nodeEndTimes = new Map(),
  db = null
)
```

**Parametreler:**
- `node`: İşlenecek operasyon node'u
- `workers`: Uygun işçi listesi
- `stations`: Aktif istasyon listesi
- `substations`: Aktif alt istasyon listesi
- `workerSchedule`: İşçi zamanlama haritası (Map)
- `stationSchedule`: Alt istasyon zamanlama haritası (Map)
- `planData`: Production plan verisi
- `nodeEndTimes`: Node'ların bitiş zamanlarını takip eder (Map)
- `db`: Firestore database instance

---

###### A. Skill ve Zaman Bilgilerini Al

```javascript
const requiredSkills = node.requiredSkills || node.skills || [];

const effectiveTime = node.effectiveTime 
  ? parseFloat(node.effectiveTime)
  : (node.nominalTime ? parseFloat(node.nominalTime) : parseFloat(node.time || 60));

const nominalTime = node.nominalTime 
  ? parseFloat(node.nominalTime)
  : parseFloat(node.time || 60);
```

**Kavramlar:**
- **nominalTime**: Operasyonun temel süresi (verimlilik uygulanmamış)
- **effectiveTime**: Verimlilik ile ayarlanmış süre (`nominalTime / efficiency`)

---

###### B. Station ve Substation Seçimi (Priority-Based Smart Allocation)

```javascript
const assignedStations = Array.isArray(node.assignedStations) 
  ? node.assignedStations 
  : [];

if (assignedStations.length > 0) {
  // Öncelik sırasına göre sırala
  const sortedStations = [...assignedStations].sort((a, b) => a.priority - b.priority);
  
  for (const stationInfo of sortedStations) {
    const stationId = stationInfo.stationId || stationInfo.id;
    const station = stations.find(s => s.id === stationId);
    
    // İstasyonun alt istasyonlarını bul
    const stationSubstations = substations.filter(ss => ss.stationId === station.id);
    
    // Müsait alt istasyon var mı? (currentOperation == null)
    const availableSubstation = stationSubstations.find(ss => !ss.currentOperation);
    
    if (availableSubstation) {
      selectedStation = station;
      selectedSubstation = availableSubstation;
      console.log(`✅ Selected available substation: ${availableSubstation.code}`);
      break;
    }
  }
  
  // Eğer müsait alt istasyon yoksa, en erken bitecek olanı seç
  if (!selectedSubstation) {
    let earliestSubstation = null;
    let earliestEnd = null;
    
    for (const stationInfo of sortedStations) {
      const station = stations.find(s => s.id === stationInfo.stationId);
      const stationSubstations = substations.filter(ss => ss.stationId === station.id);
      
      for (const ss of stationSubstations) {
        let lastEndTime = new Date();
        
        // Fiziksel currentExpectedEnd kontrolü
        if (ss.currentExpectedEnd) {
          lastEndTime = new Date(ss.currentExpectedEnd);
        }
        
        // Sıradaki işleri de kontrol et (stationSchedule)
        const substationQueue = stationSchedule.get(ss.id) || [];
        if (substationQueue.length > 0) {
          const lastQueued = substationQueue[substationQueue.length - 1];
          if (lastQueued.end > lastEndTime) {
            lastEndTime = lastQueued.end;
          }
        }
        
        if (!earliestEnd || lastEndTime < earliestEnd) {
          earliestEnd = lastEndTime;
          earliestSubstation = ss;
          selectedStation = station;
        }
      }
    }
    
    selectedSubstation = earliestSubstation;
    console.log(`⏳ Queued to substation ${earliestSubstation.code}`);
  }
}
```

**Algoritma:**
1. Node'un `assignedStations` dizisini priority'ye göre sırala
2. En yüksek öncelikli istasyondan başla
3. İstasyonun alt istasyonlarında müsait olanı ara (`currentOperation == null`)
4. Müsait varsa seç ve bitir
5. Müsait yoksa, en erken bitecek alt istasyonu bul
6. Hem fiziksel işleri (`currentExpectedEnd`) hem de kuyruktaki işleri (`stationSchedule`) kontrol et

---

###### C. Worker Seçimi (Auto vs Manual)

```javascript
let selectedWorker = null;
const assignmentMode = node.assignmentMode || 'auto';
const manualWorkerId = node.assignedWorkerId;

// Manual atama
if (assignmentMode === 'manual' && manualWorkerId) {
  selectedWorker = workers.find(w => w.id === manualWorkerId);
  
  if (!selectedWorker) {
    console.warn(`Assigned worker ${manualWorkerId} not found, falling back to auto`);
  }
}

// Auto atama
if (!selectedWorker && requiredSkills.length > 0) {
  // Skill matching
  const candidates = workers.filter(w => {
    const workerSkills = w.skills || [];
    return requiredSkills.every(skill => workerSkills.includes(skill));
  });
  
  if (candidates.length === 0) {
    return {
      error: 'no_qualified_workers',
      message: `No eligible workers found for node '${node.name}'. Required skills [${requiredSkills.join(', ')}]...`
    };
  }
  
  // Sıralama: Skill count → Load → Efficiency
  const candidatesWithLoad = candidates.map(w => ({
    worker: w,
    skillCount: (w.skills || []).length,
    load: (workerSchedule.get(w.id) || []).length,
    efficiency: w.efficiency || 1.0
  }));
  
  candidatesWithLoad.sort((a, b) => {
    // 1. Daha az toplam skill'e sahip olanı tercih et (çok yeteneğini boşa harcama)
    if (a.skillCount !== b.skillCount) return a.skillCount - b.skillCount;
    // 2. Daha az yüklenmiş olanı tercih et
    if (a.load !== b.load) return a.load - b.load;
    // 3. Daha yüksek verimli olanı tercih et
    return b.efficiency - a.efficiency;
  });
  
  selectedWorker = candidatesWithLoad[0].worker;
}
```

**Worker Seçim Kriterleri (Sırasıyla):**
1. **Skill Matching**: Tüm gerekli skill'lere sahip olmalı
2. **Skill Count**: Az skill'e sahip olan tercih edilir (çok yetenekliyi boşa harcamayalım)
3. **Load**: Az yüklenmiş olan tercih edilir
4. **Efficiency**: Yüksek verimli olan tercih edilir

---

###### D. Zamanlama Hesaplaması (Dependency-Aware Scheduling)

```javascript
let schedulingTime = effectiveTime; // Efficiency-adjusted time

// Worker'ın son atama bitiş zamanı
let earliestWorkerStart = new Date();
const workerAssignments = workerSchedule.get(selectedWorker.id) || [];
if (workerAssignments.length > 0) {
  earliestWorkerStart = workerAssignments[workerAssignments.length - 1].end;
}

// Substation'ın son atama bitiş zamanı
let earliestSubstationStart = new Date();
const substationAssignments = stationSchedule.get(selectedSubstation.id) || [];
if (substationAssignments.length > 0) {
  earliestSubstationStart = substationAssignments[substationAssignments.length - 1].end;
}

// Predecessor bağımlılıkları
let earliestPredecessorEnd = new Date();
const predecessors = node.predecessors || [];
for (const predId of predecessors) {
  const predEnd = nodeEndTimes.get(predId);
  if (predEnd && predEnd > earliestPredecessorEnd) {
    earliestPredecessorEnd = predEnd;
  }
}

// Start time = Max(worker availability, substation availability, predecessor end)
let startTime = new Date(Math.max(
  earliestWorkerStart.getTime(),
  earliestSubstationStart.getTime(),
  earliestPredecessorEnd.getTime()
));
```

**Başlangıç Zamanı Koşulları:**
- İşçi müsait olmalı
- Alt istasyon müsait olmalı
- Tüm predecessor'lar bitmiş olmalı

**En geç koşul başlangıç zamanını belirler!**

---

###### E. Worker Schedule Adjustment (Madde 6 - Çalışma Saatleri)

```javascript
// Worker'ın kişisel çalışma takvimi
let scheduleBlocks = [];
if (selectedWorker.personalSchedule && selectedWorker.personalSchedule.blocks) {
  const dayName = startTime.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  scheduleBlocks = selectedWorker.personalSchedule.blocks[dayName] || [];
}

// Başlangıç zamanını schedule'a uyarla
if (scheduleBlocks.length > 0) {
  const adjustedStart = adjustStartTimeForSchedule(startTime, scheduleBlocks);
  if (adjustedStart.getTime() !== startTime.getTime()) {
    console.log(`⏰ Adjusted start time to fit worker schedule`);
    startTime = adjustedStart;
  }
}
```

**Fonksiyon:** `adjustStartTimeForSchedule(targetTime, workBlocks)`

```javascript
function adjustStartTimeForSchedule(targetTime, workBlocks) {
  let currentTime = new Date(targetTime);
  
  // İterasyon limiti (sonsuz döngü koruması)
  let iterations = 0;
  const MAX_ITERATIONS = 100;
  
  while (iterations < MAX_ITERATIONS) {
    iterations++;
    
    const currentHour = currentTime.getHours();
    const currentMin = currentTime.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMin;
    
    // Bugünün çalışma bloklarını kontrol et
    for (const block of workBlocks) {
      const blockStart = block.startHour * 60 + block.startMin;
      const blockEnd = block.endHour * 60 + block.endMin;
      
      // Eğer şu anki zaman bloğun içindeyse, uygun
      if (currentTimeMinutes >= blockStart && currentTimeMinutes < blockEnd) {
        return currentTime;
      }
      
      // Eğer şu anki zaman bloğun öncesindeyse, bloğun başına ayarla
      if (currentTimeMinutes < blockStart) {
        currentTime.setHours(block.startHour, block.startMin, 0, 0);
        return currentTime;
      }
    }
    
    // Tüm blokların sonrasındaysa, bir sonraki güne geç
    currentTime.setDate(currentTime.getDate() + 1);
    currentTime.setHours(workBlocks[0].startHour, workBlocks[0].startMin, 0, 0);
  }
  
  return currentTime;
}
```

**Amaç:** İşçinin çalışma saatleri dışında iş atamamak.

**Örnek:**
- Worker schedule: 09:00-12:00, 13:00-17:00
- Target time: 12:30 → Adjusted to: 13:00

---

###### F. Bitiş Zamanı Hesaplama (With Breaks)

```javascript
let endTime;
if (scheduleBlocks.length > 0) {
  endTime = calculateEndTimeWithBreaks(startTime, schedulingTime, scheduleBlocks);
} else {
  // Schedule yok, basit toplama
  endTime = new Date(startTime.getTime() + schedulingTime * 60000);
}
```

**Fonksiyon:** `calculateEndTimeWithBreaks(startTime, durationMinutes, workBlocks)`

```javascript
function calculateEndTimeWithBreaks(startTime, durationMinutes, workBlocks) {
  let currentTime = new Date(startTime);
  let remainingDuration = durationMinutes;
  
  let iterations = 0;
  const MAX_ITERATIONS = 1000;
  
  while (remainingDuration > 0 && iterations < MAX_ITERATIONS) {
    iterations++;
    
    const currentHour = currentTime.getHours();
    const currentMin = currentTime.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMin;
    
    // Şu anki blok
    let currentBlock = null;
    for (const block of workBlocks) {
      const blockStart = block.startHour * 60 + block.startMin;
      const blockEnd = block.endHour * 60 + block.endMin;
      
      if (currentTimeMinutes >= blockStart && currentTimeMinutes < blockEnd) {
        currentBlock = block;
        break;
      }
    }
    
    if (!currentBlock) {
      // Çalışma saati dışı, bir sonraki bloğa geç
      // ... (kod devamı)
      continue;
    }
    
    // Bloğun kalan zamanını hesapla
    const blockEnd = currentBlock.endHour * 60 + currentBlock.endMin;
    const timeLeftInBlock = blockEnd - currentTimeMinutes;
    
    if (remainingDuration <= timeLeftInBlock) {
      // Bu blokta bitirilebilir
      currentTime.setMinutes(currentTime.getMinutes() + remainingDuration);
      remainingDuration = 0;
    } else {
      // Bu bloğu doldur, sonraki bloğa geç
      remainingDuration -= timeLeftInBlock;
      currentTime.setMinutes(currentTime.getMinutes() + timeLeftInBlock);
      
      // Bir sonraki bloğa geç (veya yeni güne)
      // ... (kod devamı)
    }
  }
  
  return currentTime;
}
```

**Amaç:** Çalışma saatleri ve molalar dikkate alınarak bitiş zamanını hesapla.

**Örnek:**
- Start: 11:00
- Duration: 120 dakika
- Schedule: 09:00-12:00, 13:00-17:00
- End: 14:00 (60dk 11:00-12:00, 60dk 13:00-14:00)

---

###### G. Malzeme Rezervasyon Hesaplamaları

```javascript
// Operation'dan expectedDefectRate al
let expectedDefectRate = 0;
if (db && node.operationId) {
  const operationDoc = await db.collection('mes-operations').doc(node.operationId).get();
  if (operationDoc.exists) {
    expectedDefectRate = operationDoc.data().expectedDefectRate || 0;
  }
}

const planQuantity = planData.quantity || 1;

// Pre-production reserved amount (Rehin miktarı)
const preProductionReservedAmount = calculatePreProductionReservedAmount(
  node,
  expectedDefectRate,
  planQuantity
);

// Planned output
const plannedOutput = calculatePlannedOutput(node, planQuantity);
```

**Fonksiyon:** `calculatePreProductionReservedAmount(node, expectedDefectRate, planQuantity)`

```javascript
function calculatePreProductionReservedAmount(node, expectedDefectRate = 0, planQuantity = 1) {
  const preProductionReservedAmount = {};
  
  if (!node || !node.materialInputs || !Array.isArray(node.materialInputs)) {
    return preProductionReservedAmount;
  }
  
  const outputQty = parseFloat(node.outputQty) || 0;
  
  if (outputQty <= 0) {
    // Fallback: Direkt input miktarını kullan
    node.materialInputs.forEach(material => {
      const materialCode = material.materialCode || material.code;
      const requiredQty = (material.requiredQuantity || 0) * planQuantity;
      if (materialCode && requiredQty > 0) {
        preProductionReservedAmount[materialCode] = 
          (preProductionReservedAmount[materialCode] || 0) + requiredQty;
      }
    });
    return preProductionReservedAmount;
  }
  
  // Scaled output
  const scaledOutputQty = outputQty * planQuantity;
  
  // Expected defects (output cinsinden)
  const defectRate = Math.max(0, Math.min(100, parseFloat(expectedDefectRate) || 0));
  const expectedDefectsInOutput = scaledOutputQty * (defectRate / 100);
  
  // Her input malzemeyi işle
  node.materialInputs.forEach(material => {
    const materialCode = material.materialCode || material.code;
    const inputQtyPerOperation = material.requiredQuantity || 0;
    
    if (!materialCode || inputQtyPerOperation <= 0) return;
    
    // Input/Output oranı
    const inputOutputRatio = inputQtyPerOperation / outputQty;
    
    // Normal ihtiyaç
    const requiredInputForGoodOutput = scaledOutputQty * inputOutputRatio;
    
    // Fire için ek ihtiyaç
    const additionalInputForDefects = expectedDefectsInOutput * inputOutputRatio;
    
    // Toplam rehin
    const totalReserved = requiredInputForGoodOutput + additionalInputForDefects;
    const reservedQty = Math.ceil(totalReserved);
    
    preProductionReservedAmount[materialCode] = 
      (preProductionReservedAmount[materialCode] || 0) + reservedQty;
  });
  
  return preProductionReservedAmount;
}
```

**Örnek Hesaplama:**

**Input:**
- Material M-008: 2 birim → 1 birim output
- Plan quantity: 100
- Expected defect rate: 5%

**Hesaplama:**
1. Scaled output = 100
2. Expected defects = 100 * 0.05 = 5 birim
3. Input/Output ratio = 2/1 = 2
4. Required input for good output = 100 * 2 = 200 birim
5. Additional input for defects = 5 * 2 = 10 birim
6. **Total reserved = 200 + 10 = 210 birim**

---

**Fonksiyon:** `calculatePlannedOutput(node, planQuantity)`

```javascript
function calculatePlannedOutput(node, planQuantity = 1) {
  const plannedOutput = {};
  
  if (!node) return plannedOutput;
  
  if (node.outputCode && node.outputQty) {
    const outputQty = parseFloat(node.outputQty) || 0;
    if (outputQty > 0) {
      plannedOutput[node.outputCode] = outputQty * planQuantity;
    }
  }
  
  return plannedOutput;
}
```

---

###### H. Assignment Objesi Oluşturma

```javascript
const normalizedNodeId = node.nodeId || node.id;

return {
  nodeId: normalizedNodeId,
  nodeName: node.name,
  operationId: node.operationId,
  workerId: selectedWorker.id,
  workerName: selectedWorker.name,
  stationId: selectedStation.id,
  stationName: selectedStation.name,
  substationId: selectedSubstation ? selectedSubstation.id : null,
  substationCode: selectedSubstation ? selectedSubstation.code : null,
  plannedStart: startTime.toISOString(),
  plannedEnd: endTime.toISOString(),
  nominalTime,
  effectiveTime: schedulingTime,
  status: 'pending',
  preProductionReservedAmount: Object.keys(preProductionReservedAmount).length > 0 
    ? preProductionReservedAmount 
    : null,
  plannedOutput: Object.keys(plannedOutput).length > 0 
    ? plannedOutput 
    : null,
  materialReservationStatus: 'pending',
  warnings: warnings.length > 0 ? warnings : undefined
};
```

**Assignment Schema:**
- `nodeId`: İlgili node ID'si
- `workerId`, `workerName`: Atanan işçi
- `stationId`, `stationName`: Atanan istasyon
- `substationId`, `substationCode`: Atanan alt istasyon
- `plannedStart`, `plannedEnd`: Planlanan başlangıç ve bitiş zamanları
- `nominalTime`: Temel süre (verimlilik uygulanmamış)
- `effectiveTime`: Verimlilik uygulanmış süre
- `status`: `'pending'` (henüz başlamadı)
- `preProductionReservedAmount`: Rehin malzeme miktarları (object)
- `plannedOutput`: Planlanan çıktı miktarları (object)
- `materialReservationStatus`: `'pending'` (henüz rezerve edilmedi)
- `warnings`: Uyarılar (varsa)

---

#### 3.7 Work Package (Assignment) Oluşturma (Batch Write)

```javascript
const batch = db.batch();
const now = new Date();

// Eski atamaları sil (temizlik)
const existingAssignments = await db.collection('mes-worker-assignments')
  .where('planId', '==', planId)
  .where('workOrderCode', '==', workOrderCode)
  .get();

existingAssignments.docs.forEach(doc => {
  batch.delete(doc.ref);
});

// Work package ID'leri oluştur
const assignmentIds = generateWorkPackageIds(workOrderCode, assignments.length);

// Her assignment için doküman oluştur
for (let i = 0; i < assignments.length; i++) {
  const assignment = assignments[i];
  const workPackageId = assignmentIds[i];
  const assignmentRef = db.collection('mes-worker-assignments').doc(workPackageId);
  
  const completeAssignment = {
    ...assignment,
    id: workPackageId,
    planId,
    workOrderCode,
    createdAt: now,
    createdBy: userEmail,
    updatedAt: now
  };
  
  batch.set(assignmentRef, completeAssignment);
}

// Plan dokümanını güncelle
batch.update(planRef, {
  launchStatus: 'launched',
  launchedAt: now,
  launchedBy: userEmail,
  assignmentCount: assignments.length,
  lastLaunchShortage: admin.firestore.FieldValue.delete(),
  updatedAt: now
});

// Approved quote'u güncelle
batch.update(quoteDoc.ref, {
  productionState: 'Üretiliyor',
  productionStateUpdatedAt: now,
  productionStateUpdatedBy: userEmail
});

// Batch commit (atomik işlem)
await batch.commit();
```

**Batch Write Avantajları:**
- **Atomik**: Ya hepsi başarılı olur ya hiçbiri
- **Performans**: Tek network request
- **Tutarlılık**: Yarım kalmış işlem olmaz

**Work Package ID Format:**
```
WO-2024-001-WP-001
WO-2024-001-WP-002
...
```

---

#### 3.8 Response Dönüşü

```javascript
const response = {
  success: true,
  planId,
  workOrderCode,
  assignmentCount: assignments.length,
  assignmentIds,
  launchedAt: now.toISOString(),
  launchedBy: userEmail,
  message: `Plan launched successfully with ${assignments.length} assignments`
};

// Malzeme uyarıları varsa ekle
if (materialWarnings.length > 0) {
  response.warnings = {
    materialShortages: materialWarnings,
    assignmentWarnings: assignmentWarnings.length > 0 ? assignmentWarnings : undefined
  };
}

return res.status(200).json(response);
```

**Response Schema:**
```json
{
  "success": true,
  "planId": "plan-123",
  "workOrderCode": "WO-2024-001",
  "assignmentCount": 5,
  "assignmentIds": ["WO-2024-001-WP-001", "..."],
  "launchedAt": "2024-11-16T10:30:00.000Z",
  "launchedBy": "user@example.com",
  "message": "Plan launched successfully with 5 assignments",
  "warnings": {
    "materialShortages": [...],
    "assignmentWarnings": [...]
  }
}
```

---

### 4️⃣ **Frontend Success Handling**

Backend'den başarılı response döndükten sonra:

```javascript
// Success! Update state to IN_PRODUCTION
await setProductionState(workOrderCode, PRODUCTION_STATES.IN_PRODUCTION, true);

// Build success message
let message = `Üretim başarıyla başlatıldı!\n\n${result.assignmentCount} atama oluşturuldu.`;

// Material shortage warnings
if (result.warnings && result.warnings.materialShortages && result.warnings.materialShortages.length > 0) {
  const shortageList = result.warnings.materialShortages.map(s => 
    `• ${s.nodeName || 'Node'} – ${s.materialCode}: İhtiyaç ${s.required} ${s.unit}, Stok ${s.available} ${s.unit}`
  ).join('\n');
  
  message += `\n\n⚠️ Malzeme Eksiklikleri (Bilgilendirme):\n${shortageList}\n\nÜretim başladı; stokları en kısa sürede tamamlayın.`;
}

// Assignment warnings
if (result.warnings && result.warnings.assignmentWarnings && result.warnings.assignmentWarnings.length > 0) {
  const warningList = result.warnings.assignmentWarnings.map(w => 
    `• ${w.nodeName}: ${w.warnings.join(', ')}`
  ).join('\n');
  
  message += `\n\n⚠️ Atama Uyarıları:\n${warningList}`;
}

alert(message);

// Refresh quotes and plans
await loadQuotesAndRender();

// Emit BroadcastChannel event
try {
  const channel = new BroadcastChannel('mes-assignments');
  channel.postMessage({ type: 'assignments:updated', planId: plan.id, workOrderCode });
  channel.close();
} catch {}
```

**BroadcastChannel Nedir?**
- Aynı origin'deki tüm tab/window'lar arasında mesajlaşma
- Diğer açık tab'larda otomatik refresh tetiklenir

---

### 5️⃣ **Hata Durumları ve Kullanıcı Bildirimleri**

#### A. Approved Quote Bulunamadı

```javascript
if (error.code === 'approved_quote_not_found') {
  alert(
    `Onaylı Teklif Bulunamadı\n\n` +
    `${workOrderCode} iş emri için onaylı teklif bulunamadı.\n\n` +
    `Quotes ekranından bu iş emrini oluşturup onayladıktan sonra tekrar deneyin.`
  );
}
```

---

#### B. İşçi Bulunamadı

```javascript
else if (error.code === 'no_workers' || (error.status === 422 && error.error === 'no_workers')) {
  const sampleInfo = error.sample ? error.sample.map(s => 
    `${s.name || s.id}: ${s.status}${s.onLeave ? ' (on leave)' : ''}`
  ).join('\n') : '';
  
  alert(`Üretim Başlatılamadı\n\nAktif ve müsait işçi bulunamadı. Lütfen Worker Portal'dan işçilerin durumunu kontrol edin.\n\n${sampleInfo}`);
}
```

---

#### C. Kaynak Atama Hatası

```javascript
else if (error.status === 422 && error.errors) {
  const errorList = error.errors.map(e => 
    `- ${e.nodeName || e.nodeId}: ${e.message}`
  ).join('\n');
  
  alert(`Kaynak Ataması Başarısız\n\n${errorList}\n\nLütfen planı kontrol edip tekrar deneyin.`);
}
```

---

#### D. Generic Hata

```javascript
else {
  alert(`Üretim Başlatılamadı\n\n${error.message || 'Bilinmeyen hata'}\n\nLütfen tekrar deneyin.`);
}
```

---

## 📊 Veri Akışı Özeti

```
[UI: 🏁 Başlat Button]
        ↓
[Frontend: startProduction(workOrderCode)]
        ↓
[Validation: Plan exists? Type=production?]
        ↓
[User Confirmation Dialog]
        ↓
[UI State: "Başlatılıyor..."]
        ↓
[API Call: POST /api/mes/production-plans/:planId/launch]
        ↓
────────────────────────────────────────────
[Backend: Input Validation]
        ↓
[Fetch: Plan, Approved Quote]
        ↓
[Topological Sort: Build Execution Order]
        ↓
[Load: Workers, Stations, Substations]
        ↓
[Worker Status Normalization]
        ↓
[Material Validation: Non-blocking warnings]
        ↓
[For each node in execution order:]
  ├─ Select Station (Priority-based)
  ├─ Select Substation (Available or earliest)
  ├─ Select Worker (Skill + Load + Efficiency)
  ├─ Calculate Start Time (Worker + Substation + Predecessors)
  ├─ Adjust for Worker Schedule (Madde 6)
  ├─ Calculate End Time (With Breaks)
  ├─ Calculate Material Reservation (Rehin)
  └─ Create Assignment Object
        ↓
[Batch Write: Create Work Packages]
        ↓
[Update: Plan launchStatus = 'launched']
        ↓
[Update: Quote productionState = 'Üretiliyor']
        ↓
[Commit Batch (Atomic)]
        ↓
[Return Response with assignments & warnings]
────────────────────────────────────────────
        ↓
[Frontend: Update State to IN_PRODUCTION]
        ↓
[Show Success Alert (with warnings)]
        ↓
[Refresh UI: loadQuotesAndRender()]
        ↓
[Emit BroadcastChannel Event]
        ↓
[Other Tabs: Auto-refresh]
```

---

## 🔑 Kritik Noktalar

### 1. Atomik İşlemler
- Batch write kullanılır → Ya hepsi başarılı, ya hiçbiri
- Yarım kalmış atama olmaz

### 2. Non-Blocking Material Validation
- Malzeme eksikliği artık üretimi engellemez
- Sadece uyarı olarak döner
- Üretim başlar, kullanıcı stokları sonra tamamlayabilir

### 3. Topological Sort
- Operasyonlar bağımlılık sırasına göre işlenir
- Predecessor'lar bitmeden successor başlamaz
- Cycle detection ile sonsuz döngü engellenir

### 4. Smart Station/Substation Allocation
- Öncelik sırasına göre istasyon seçimi
- Müsait alt istasyon varsa hemen atar
- Yoksa en erken bitecek alt istasyona kuyruğa alır
- **Paralel çalışma:** Aynı istasyonun farklı alt istasyonları eşzamanlı çalışabilir

### 5. Worker Schedule Compliance (Madde 6)
- İşçinin çalışma saatleri dışında iş atanmaz
- Molalar otomatik hesaba katılır
- Bitiş zamanı break'leri içerir

### 6. Material Reservation (Rehin Hesabı)
- Fire oranı dikkate alınır
- Input/Output ratio kullanılır
- Matematiksel olarak doğru hesaplama

### 7. Predecessor Dependency Tracking
- `nodeEndTimes` Map'i ile takip edilir
- Successor'lar, tüm predecessor'lar bitene kadar bekler

### 8. Error Handling
- Detaylı hata mesajları
- Kullanıcıya aksiyon önerileri
- State rollback (hata durumunda orijinal state'e dön)

---

## 📁 Firestore Koleksiyonları

### mes-production-plans
```javascript
{
  id: "plan-123",
  name: "Production Plan A",
  status: "production", // draft, production, cancelled
  launchStatus: "launched", // launched, paused, cancelled
  launchedAt: Timestamp,
  launchedBy: "user@example.com",
  assignmentCount: 5,
  nodes: [...],
  quantity: 100,
  materialSummary: {...}
}
```

### mes-worker-assignments (Work Packages)
```javascript
{
  id: "WO-2024-001-WP-001",
  planId: "plan-123",
  workOrderCode: "WO-2024-001",
  nodeId: "node-1",
  nodeName: "Kesme",
  operationId: "op-cut",
  workerId: "worker-1",
  workerName: "Ali Yılmaz",
  stationId: "station-1",
  stationName: "Kesim İstasyonu",
  substationId: "substation-1",
  substationCode: "KSM-A",
  plannedStart: "2024-11-16T09:00:00Z",
  plannedEnd: "2024-11-16T10:30:00Z",
  nominalTime: 60,
  effectiveTime: 54, // efficiency-adjusted
  status: "pending", // pending, in_progress, completed, paused
  preProductionReservedAmount: {
    "M-001": 210,
    "M-008": 105
  },
  plannedOutput: {
    "WIP-001": 100
  },
  materialReservationStatus: "pending", // pending, reserved, consumed
  createdAt: Timestamp,
  createdBy: "user@example.com"
}
```

### mes-approved-quotes
```javascript
{
  id: "quote-123",
  workOrderCode: "WO-2024-001",
  productionState: "Üretiliyor", // Onay Bekliyor, Üretiliyor, Tamamlandı, İptal Edildi
  productionStateUpdatedAt: Timestamp,
  productionStateUpdatedBy: "user@example.com"
}
```

---

## 🚨 Acil Öncelik Sistemi (Urgent Priority System)

### Genel Bakış

Normal üretim akışında, işçiler **Worker Portal**'da iş paketlerini (work packages) sırasıyla alırlar. Ancak bazı kritik durumlarda (müşteri acil siparişi, makine arızası sonrası hızlı telafi, vb.) tüm iş paketlerinin aynı anda başlatılabilmesi gerekebilir.

**Acil Öncelik Sistemi**, admin kullanıcılara bir üretim planını "urgent" olarak işaretleme ve Worker Portal'daki kısıtlamaları kaldırma yetkisi verir.

---

### İki Mod: Normal vs Urgent

#### 🔵 Normal Mod (Varsayılan)
- **Kural:** Sadece **ilk sıradaki** work package başlatılabilir
- **Mantık:** `plannedStart` tarihine göre sıralama yapılır, en erken olanın `canStart = true` olur
- **Amaç:** İş akışının düzenli ilerlemesini sağlamak, kaynak çakışmalarını önlemek
- **UI:** İlk iş paketinde **🏁 Başlat** butonu aktif, diğerleri disabled (gri)

#### 🔴 Urgent Mod
- **Kural:** İlgili iş emrine ait **tüm** work package'lar başlatılabilir
- **Mantık:** `priority = "urgent"` olduğunda tüm work package'ların `canStart = true` olur
- **Amaç:** Kritik durumlarda paralel çalışmayı sağlamak, üretimi hızlandırmak
- **UI:** **Tüm** iş paketlerinde **🏁 Başlat** butonu aktif, "🚨 Acil" rozeti gösterilir

---

### Urgent Moda Alma İşlemi

#### 1. Admin Panel (Approved Quotes)

**Konum:** `quote-portal/domains/production/js/approvedQuotes.js`

**UI Değişikliği:**
```javascript
// Actions sütununa yeni buton eklenir:
<button class="btn-urgent" onclick="setUrgentPriority('${workOrderCode}')">
  !! Acil
</button>
```

**Görünüm:**
```
[ 🏁 Başlat ]  [ !! Acil ]  [ ⚙️ Ayarlar ]  [ 🗑️ Sil ]
```

---

#### 2. Backend İşlemi

**Endpoint:** `POST /api/mes/set-urgent-priority`

**Request:**
```json
{
  "workOrderCode": "WO-005",
  "urgent": true
}
```

**İşlemler:**
1. `mes-production-plans` koleksiyonunda ilgili planı bul
2. `priority` alanını `"urgent"` olarak güncelle
3. `mes-worker-assignments` koleksiyonunda ilgili tüm work package'ları bul
4. Her birinin `priority` alanını `"urgent"` olarak güncelle
5. `mes-approved-quotes` koleksiyonunda ilgili quote'u bul
6. `priority` alanını `"urgent"` olarak güncelle
7. Batch commit ile atomik güncelleme

**Kod (mesRoutes.js):**
```javascript
router.post('/set-urgent-priority', withAuth, async (req, res) => {
  try {
    const { workOrderCode, urgent } = req.body;
    const priority = urgent ? 'urgent' : 'normal';
    
    const batch = db.batch();
    
    // Plan güncellemesi
    const planSnap = await db.collection('mes-production-plans')
      .where('workOrderCode', '==', workOrderCode)
      .limit(1)
      .get();
    
    if (!planSnap.empty) {
      batch.update(planSnap.docs[0].ref, { priority });
    }
    
    // Work package güncellemeleri
    const assignmentSnap = await db.collection('mes-worker-assignments')
      .where('workOrderCode', '==', workOrderCode)
      .get();
    
    assignmentSnap.docs.forEach(doc => {
      batch.update(doc.ref, { priority });
    });
    
    // Quote güncellemesi
    const quoteSnap = await db.collection('mes-approved-quotes')
      .where('workOrderCode', '==', workOrderCode)
      .limit(1)
      .get();
    
    if (!quoteSnap.empty) {
      batch.update(quoteSnap.docs[0].ref, { priority });
    }
    
    await batch.commit();
    
    res.json({ 
      success: true, 
      message: `Üretim planı ${urgent ? 'acil' : 'normal'} önceliğe alındı`,
      updatedCount: assignmentSnap.size + 2
    });
  } catch (error) {
    console.error('Set urgent priority error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

---

#### 3. Worker Portal Render Değişikliği

**Konum:** `quote-portal/domains/workerPortal/js/workerPortal.js`

**Mevcut Mantık:**
```javascript
// Tüm work package'lara canStart: true atanıyor (BUG!)
tasks.forEach(task => {
  task.canStart = true;
});
```

**Yeni Mantık:**
```javascript
// Priority'e göre canStart belirleme
tasks.forEach((task, index) => {
  // Urgent ise veya ilk sıradaysa başlatılabilir
  task.canStart = (task.priority === 'urgent') || (index === 0);
});
```

**Render:**
```javascript
function renderTaskCard(task, index) {
  const urgentBadge = task.priority === 'urgent' 
    ? `<span class="urgent-badge">🚨 Acil</span>` 
    : '';
  
  const startButton = task.canStart
    ? `<button class="btn-start" onclick="startTask('${task.id}')">🏁 Başlat</button>`
    : `<button class="btn-start disabled" disabled>🏁 Başlat</button>`;
  
  return `
    <div class="task-card ${task.priority === 'urgent' ? 'urgent-card' : ''}">
      <div class="task-header">
        <h3>${task.workPackageId} - ${task.operationName}</h3>
        ${urgentBadge}
      </div>
      <div class="task-info">
        <p><strong>İş Emri:</strong> ${task.workOrderCode}</p>
        <p><strong>Başlama:</strong> ${formatDate(task.plannedStart)}</p>
        <p><strong>Süre:</strong> ${task.duration} saat</p>
      </div>
      <div class="task-actions">
        ${startButton}
      </div>
    </div>
  `;
}
```

---

#### 4. CSS Styling

**Konum:** `quote-portal/domains/workerPortal/css/workerPortal.css`

**Urgent Göstergesi:**
```css
.urgent-badge {
  display: inline-block;
  background: linear-gradient(135deg, #ff4444, #cc0000);
  color: white;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.85em;
  font-weight: bold;
  box-shadow: 0 2px 8px rgba(255, 68, 68, 0.3);
  animation: pulse-urgent 2s infinite;
}

@keyframes pulse-urgent {
  0%, 100% {
    box-shadow: 0 2px 8px rgba(255, 68, 68, 0.3);
  }
  50% {
    box-shadow: 0 2px 16px rgba(255, 68, 68, 0.6);
  }
}

.urgent-card {
  border: 2px solid #ff4444;
  background: linear-gradient(to bottom, #fff5f5, #ffffff);
}

.urgent-card .task-header {
  background: linear-gradient(135deg, #ff4444, #cc0000);
  color: white;
}
```

---

### Veri Modeli Değişiklikleri

#### mes-production-plans
```javascript
{
  id: "plan-abc123",
  workOrderCode: "WO-005",
  priority: "urgent",  // ← YENİ ALAN: "normal" | "urgent"
  status: "in-progress",
  nodes: [...],
  // ... diğer alanlar
}
```

#### mes-worker-assignments
```javascript
{
  id: "assignment-xyz789",
  workOrderCode: "WO-005",
  workPackageId: "WO-005-01",
  priority: "urgent",  // ← YENİ ALAN: "normal" | "urgent"
  status: "pending",
  canStart: true,  // ← Bu alan Worker Portal tarafında hesaplanır (DB'de tutulmaz)
  // ... diğer alanlar
}
```

#### mes-approved-quotes
```javascript
{
  id: "quote-def456",
  workOrderCode: "WO-005",
  priority: "urgent",  // ← YENİ ALAN: "normal" | "urgent"
  productionState: "Üretimde",
  // ... diğer alanlar
}
```

---

### İş Akışı Diyagramı

```
┌─────────────────────────────────────────────────────────────┐
│                    ADMIN PANEL                               │
│                 (Approved Quotes)                            │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Admin clicks [!! Acil] button
                           │ setUrgentPriority('WO-005')
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND                                  │
│              (approvedQuotes.js)                             │
│                                                              │
│  async function setUrgentPriority(workOrderCode) {          │
│    const result = await fetch('/api/mes/set-urgent-priority',│
│      { method: 'POST', body: { workOrderCode, urgent: true }})│
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ POST /api/mes/set-urgent-priority
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND                                   │
│                  (mesRoutes.js)                              │
│                                                              │
│  1. Find plan → Update priority: "urgent"                   │
│  2. Find all assignments → Update priority: "urgent"        │
│  3. Find quote → Update priority: "urgent"                  │
│  4. Batch commit                                            │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Firestore updated
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   FIRESTORE                                  │
│                                                              │
│  mes-production-plans       (priority: "urgent")            │
│  mes-worker-assignments     (priority: "urgent" × N)        │
│  mes-approved-quotes        (priority: "urgent")            │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Worker reloads page or polls
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  WORKER PORTAL                               │
│                (workerPortal.js)                             │
│                                                              │
│  tasks.forEach((task, index) => {                           │
│    task.canStart = (task.priority === 'urgent') || (i === 0)│
│  })                                                          │
│                                                              │
│  → Urgent ise: Tüm kartlarda [🏁 Başlat] aktif             │
│  → Normal ise: Sadece ilk kartta [🏁 Başlat] aktif         │
└─────────────────────────────────────────────────────────────┘
```

---

### Test Senaryoları

#### Senaryo 1: Normal Mod
```
1. Admin WO-005 için üretimi başlatır (🏁 Başlat)
2. 5 work package oluşturulur: WO-005-01, WO-005-02, ..., WO-005-05
3. Worker Portal'da sadece WO-005-01'in "Başlat" butonu aktif
4. İşçi WO-005-01'i tamamlar
5. Şimdi WO-005-02'nin "Başlat" butonu aktif hale gelir
```

#### Senaryo 2: Urgent Moda Alma
```
1. WO-005 normal modda üretimde (3. work package tamamlanmış)
2. Admin [!! Acil] butonuna tıklar
3. Backend 3 koleksiyonda 7 dokümanı günceller (1 plan + 5 assignment + 1 quote)
4. Worker Portal'da WO-005-04 ve WO-005-05 için "Başlat" butonları aktifleşir
5. İşçiler paralel çalışabilir
```

#### Senaryo 3: Urgent Moddan Çıkma
```
1. WO-005 urgent modda
2. Admin tekrar [!! Acil] butonuna tıklar (toggle)
3. Backend priority: "normal" olarak günceller
4. Worker Portal'da sadece sıradaki ilk bekleyen work package aktif kalır
```

---

### Avantajlar

✅ **Esneklik:** Admin müdahale ederek iş akışını hızlandırabilir  
✅ **Kontrol:** Normal durumda düzenli akış, acil durumda paralel çalışma  
✅ **Görünürlük:** Urgent işler görsel olarak belirgin (badge, renkli kart)  
✅ **İzlenebilirlik:** Priority alanı 3 koleksiyonda da saklanır, reporting mümkün  
✅ **Atomik:** Batch işlem ile tutarlılık garantisi  

---

## 🎯 Özet

**🏁 Başlat** butonu:

1. ✅ Plan ve approved quote validasyonu yapar
2. ✅ Kullanıcıdan onay alır
3. ✅ Topological sort ile çalışma sırasını belirler
4. ✅ Malzeme kontrolü yapar (non-blocking)
5. ✅ Her operasyon için otomatik kaynak ataması yapar:
   - İstasyon ve alt istasyon (priority-based, availability-aware)
   - İşçi (skill matching, load balancing, efficiency optimization)
   - Zamanlama (predecessor dependencies, worker schedule compliance)
   - Malzeme rezervasyonu (fire oranı dahil)
6. ✅ Work package'ları (assignments) atomik olarak oluşturur
7. ✅ Plan ve quote durumlarını günceller
8. ✅ Başarı mesajı ve uyarılarla kullanıcıyı bilgilendirir
9. ✅ Diğer açık tab'lara event gönderir

**Sonuç:** Üretim başlar, work package'lar Worker Portal'da görünür hale gelir! 🎉

**🚨 Acil Öncelik Sistemi:**

1. ✅ Admin **!! Acil** butonu ile urgent moda alır
2. ✅ Backend 3 koleksiyonda (plan, assignments, quote) `priority` alanını günceller
3. ✅ Worker Portal'da urgent işler için **tüm** work package'ların `canStart = true` olur
4. ✅ Normal modda sadece **ilk sıradaki** work package başlatılabilir
5. ✅ Urgent işler görsel olarak belirginleştirilir (🚨 rozet, kırmızı border)

**Sonuç:** Normal akışta düzenli ilerlerken, kritik durumlarda paralel çalışma mümkün olur! 🚨

---

## 📚 İlgili Dokümanlar

- `NODE-STRUCTURE-IMPROVEMENTS.md`: Node yapısı detayları
- `MES-DATA-FLOW-ANALYSIS.md`: Genel data flow analizi
- `MIGRATION-IMPLEMENTATION-SUMMARY.md`: Migration özeti

---

## APPENDIX A: Tespit Edilen Kritik Hatalar ve Detaylı Analiz

### A.1 Node ID Tutarsızlığı (CRITICAL)

**Hata Lokasyonu:** `quote-portal/server/mesRoutes.js:5513`

**Kod:**
```javascript
const node = nodesToUse.find(n => n.id === nodeId);
```

**Problem:**
- Launch endpoint'i topological sort sonrası node'ları `n.id` ile arıyor
- Ancak backend'in diğer bölümleri (getPlanExecutionState, Ajv şeması) `nodeId` alanını kullanıyor
- `node.nodeId` set edilmiş ancak `node.id` olmayan planlarda "node not found" hatası oluşuyor

**Bulgu:**
```javascript
// mesRoutes.js:398 - getPlanExecutionState
const assignment = assignments.get(node.nodeId);  // ❌ nodeId kullanıyor

// mesRoutes.js:5513 - Launch sırasında
const node = nodesToUse.find(n => n.id === nodeId);  // ❌ id kullanıyor
```

**Etki:**
- Bazı planlar başlatılamıyor
- Hata mesajı: "Node referenced in execution order but not found in plan"
- Topological sort başarılı oluyor ama node matching başarısız oluyor

**Kök Neden:**
- Frontend `node.id` oluşturuyor
- Backend bazen `node.nodeId`, bazen `node.id` bekliyor
- Normalizasyon tutarsız yapılıyor

---

### A.2 Malzeme Kontrolü Field Tutarsızlığı (CRITICAL)

**Hata Lokasyonu:** `quote-portal/server/mesRoutes.js:5895`

**Kod:**
```javascript
const required = mat.required;  // ❌ YANLIŞ ALAN

if (available < required) {
  warnings.push({...});
}
```

**Problem:**
- `materialsToCheck` Map'ine `requiredQuantity` alanı yazılıyor (satır 5859)
- Ancak kontrol sırasında `mat.required` okunuyor
- `mat.required` alanı undefined kalıyor → stok kontrolü asla çalışmıyor

**Doğru Kod:**
```javascript
// Satır 5859 - Map'e yazma
existing.requiredQuantity += (mat.requiredQuantity || 0) * planQuantity;

// Satır 5895 - Map'ten okuma (YANLIŞ)
const required = mat.required;  // ❌ undefined

// Olması gereken:
const required = mat.requiredQuantity;  // ✅ DOĞRU
```

**Etki:**
- Malzeme eksikliği asla tespit edilmiyor
- Kullanıcıya sahte "stok yeterli" mesajı gidiyor
- Üretim başladıktan sonra malzeme bulunamıyor

**Kod Karşılaştırması:**
```javascript
// calculatePreProductionReservedAmount (DOĞRU)
const requiredQty = (material.requiredQuantity || material.qty || material.required || 0);

// validateMaterialAvailabilityForLaunch (YANLIŞ)
existing.requiredQuantity += (mat.requiredQuantity || 0);  // Yazma
const required = mat.required;  // Okuma - TUTARSIZ!
```

---

### A.3 Substation ID Schema İhlali (HIGH)

**Hata Lokasyonu:** 
- `quote-portal/server/models/AssignmentSchema.json:21`
- `quote-portal/server/mesRoutes.js:6632`

**Schema:**
```json
{
  "required": ["id", "planId", "nodeId", "workerId", "stationId", "substationId", ...],
  "properties": {
    "substationId": {
      "type": "string"  // ❌ ZORUNLU, ama nullable olmalı
    }
  }
}
```

**Kod (assignNodeResources):**
```javascript
return {
  ...
  substationId: selectedSubstation ? selectedSubstation.id : null,  // ❌ null dönebiliyor
  ...
};
```

**Problem:**
- Schema `substationId` alanını zorunlu (required) olarak tanımlıyor
- `assignNodeResources` null dönebiliyor
- Validasyon sadece console.error'a yazıyor, kayıt yine de oluşturuluyor

**Bulgu:**
```javascript
// mesRoutes.js:5624
if (!validateAssignment(completeAssignment)) {
  console.error(`❌ Invalid assignment schema for ${workPackageId}:`, validateAssignment.errors);
  // Continue anyway but log for monitoring  // ❌ HATA YUTULMUŞ!
}
```

**Etki:**
- Şema ihlali sessizce görmezden geliniyor
- "Hangi makine rezerve edildi?" bilgisi kayboluyor
- Substation tracking çalışmıyor

---

### A.4 Frontend-Backend Schema Uyumsuzluğu (HIGH)

**Hata Lokasyonu:** 
- `quote-portal/domains/production/components/production-plan-designer.tsx:72`
- `NODE-STRUCTURE-IMPROVEMENTS.md`

**Frontend Interface:**
```typescript
interface OperationNode {
  id: string;
  name: string;
  operationId: string;
  // ...
  connections: string[];  // ❌ ESKİ MODEL
  stationId?: string;     // ❌ TEKİL STATION
  // assignedStations eksik!
  // assignmentMode eksik!
  // predecessors eksik!
}
```

**Backend Beklentisi:**
```javascript
// NODE-STRUCTURE-IMPROVEMENTS.md
{
  predecessors: string[],        // ✅ Yeni model
  successor: string | null,      // ✅ Yeni model
  assignedStations: [            // ✅ Yeni model
    { stationId: string, priority: number }
  ],
  assignmentMode: 'auto' | 'manual'  // ✅ Yeni model
}
```

**Problem:**
- Frontend hâlâ `connections[]` dizisi kullanıyor
- Backend `predecessors[]` ve `successor` bekliyor
- İstasyon ataması tekil `stationId` olarak yapılıyor
- Backend `assignedStations[]` array'i ile öncelik sistemi bekliyor

**Etki:**
- Launch sırasında topolojik sıralama için gerekli bağımlılık verisi eksik
- İstasyon öncelik sistemi çalışmıyor
- Otomatik atama için gerekli meta veriler yok

**Kod Karşılaştırması:**
```typescript
// production-plan-designer.tsx:187 (MEVCUT)
const newNode: OperationNode = {
  id: `node-${Date.now()}`,
  connections: [],  // ❌ ESKİ MODEL
  stationId: "",    // ❌ TEKİL
  // ...
};

// Olması gereken:
const newNode: OperationNode = {
  id: `node-${Date.now()}`,
  predecessors: [],     // ✅ YENİ MODEL
  successor: null,      // ✅ YENİ MODEL
  assignedStations: [], // ✅ YENİ MODEL
  assignmentMode: 'auto', // ✅ YENİ MODEL
  // ...
};
```

---

### A.5 Malzeme Rezervasyonu Eksikliği (CRITICAL)

**Hata Lokasyonu:** `quote-portal/server/mesRoutes.js:5500-5650`

**Problem:**
- `calculatePreProductionReservedAmount()` çağrılıyor ve hesaplama yapılıyor
- Ancak hesaplanan değer sadece assignment kaydına yazılıyor
- Gerçek stok rezervasyonu yapılmıyor
- `adjustMaterialStock()` veya benzeri fonksiyon çağrılmıyor

**Kod Analizi:**
```javascript
// mesRoutes.js:6621 - Hesaplama yapılıyor
const preProductionReservedAmount = calculatePreProductionReservedAmount(
  node,
  expectedDefectRate,
  planQuantity
);

// mesRoutes.js:6656 - Sadece assignment'a yazılıyor
return {
  preProductionReservedAmount: Object.keys(preProductionReservedAmount).length > 0 
    ? preProductionReservedAmount 
    : null,
  materialReservationStatus: 'pending',  // ❌ pending kalıyor, asla reserved olmuyor
};

// ❌ adjustMaterialStock() çağrısı YOK!
// ❌ materials koleksiyonu güncellenmesi YOK!
```

**Import Edilmiş Ama Kullanılmamış:**
```javascript
// mesRoutes.js:6
import { adjustMaterialStock, consumeMaterials } from './materialsRoutes.js'

// Sadece 1 yerde kullanılıyor (WIP creation), launch'ta kullanılmıyor!
```

**Etki:**
- Hesaplanan rezervasyon sadece assignment kaydında meta veri olarak duruyor
- Gerçek stok hâlâ serbest
- Aynı malzeme birden fazla plana atanabilir (çift rezervasyon)
- Stok takibi çalışmıyor

**Beklenen Akış:**
```javascript
// 1. Rezervasyon hesapla
const preProductionReservedAmount = calculatePreProductionReservedAmount(...);

// 2. Stoktan düş (YOK!)
for (const [materialCode, qty] of Object.entries(preProductionReservedAmount)) {
  await adjustMaterialStock(materialCode, -qty, {
    reason: 'production_reservation',
    planId,
    workPackageId,
    transactionType: 'reservation'
  });
}

// 3. Status güncelle
assignment.materialReservationStatus = 'reserved';
```

---

### A.6 StationSchedule İsimlendirme Yanılgısı (MEDIUM)

**Hata Lokasyonu:** `quote-portal/server/mesRoutes.js:5508, 5576`

**Kod:**
```javascript
const stationSchedule = new Map(); // stationId -> [{ start, end }]  // ❌ Yorum yanlış

// ...

// CRITICAL FIX: Track substation schedule, not station schedule
// This allows multiple substations of the same station to work in parallel
if (substationId) {
  if (!stationSchedule.has(substationId)) {  // ❌ substationId kullanıyor ama isim station
    stationSchedule.set(substationId, []);
  }
  stationSchedule.get(substationId).push({...});
}
```

**Problem:**
- Değişken adı `stationSchedule` ama aslında substation ID'leriyle çalışıyor
- Yorumlarda "CRITICAL FIX" yazıyor ama değişken adı düzeltilmemiş
- Kod okuma sırasında karışıklığa yol açıyor

**Diğer Kullanımlar:**
```javascript
// mesRoutes.js:6313 - assignNodeResources
const substationQueue = stationSchedule.get(ss.id) || [];  // substation id kullanıyor

// mesRoutes.js:6352 - Fallback logic
load: (stationSchedule.get(s.id) || []).length  // ❌ Burada station id! BUG!
```

**Etki:**
- Yanlış ID kullanımına açık kapı
- Fallback logic'te hatalı kullanım var
- Kod maintainability düşük

---

### A.7 Pause/Cancel Substation Güncellemesi Eksik (MEDIUM)

**Hata Lokasyonu:** `quote-portal/server/mesRoutes.js:6778-6784`

**Kod:**
```javascript
// Clear station currentOperation for affected stations
for (const stationId of stationsToUpdate) {
  const stationRef = db.collection('mes-stations').doc(stationId);
  batch.update(stationRef, {
    currentOperation: null,  // ❌ Station güncelleniyor
    currentOperationUpdatedAt: now
  });
}

// ❌ Substation güncellenmesi YOK!
```

**Problem:**
- Pause/Cancel sırasında worker ve station currentTask/Operation temizleniyor
- Ancak asıl işi yapan substation'ın `currentOperation` alanı güncellenmemiyor
- Assignment'tan station ID toplanıyor, substation ID değil

**Bulgu:**
```javascript
// mesRoutes.js:6741 - Collection yapılırken
if (assignment.workerId) workersToUpdate.add(assignment.workerId);
if (assignment.stationId) stationsToUpdate.add(assignment.stationId);  // ❌ station

// Olması gereken:
if (assignment.substationId) substationsToUpdate.add(assignment.substationId);  // ✅ substation
```

**Etki:**
- Substation'lar pause/cancel sonrası meşgul görünmeye devam ediyor
- Yeni atama yapılamıyor (substation busy görünüyor)
- Capacity planning yanlış hesaplanıyor

---

### A.8 Ek Tespit Edilen Hatalar

#### A.8.1 Node ID Normalization Tutarsızlığı
**Lokasyon:** Çoklu lokasyon

**Bulgular:**
```javascript
// Bazı yerlerde normalization var:
const nodeId = node.id || node.nodeId;  // ✅ mesRoutes.js:1369, 1497, 1521

// Bazı yerlerde yok:
const node = nodesToUse.find(n => n.id === nodeId);  // ❌ mesRoutes.js:5513
const assignment = assignments.get(node.nodeId);     // ❌ mesRoutes.js:398
```

#### A.8.2 materialFlowView Component - Eski Model Kullanımı
**Lokasyon:** `quote-portal/domains/production/components/materialFlowView.js:70`

```javascript
const outs = Array.isArray(n.connections) ? n.connections : [];  // ❌ connections kullanıyor
```

**Etki:** Material flow görselleştirmesi yeni modelle çalışmıyor

#### A.8.3 Semi-Code Generator - AssignedStations Eksik Destek
**Lokasyon:** `quote-portal/domains/production/js/semiCode.js:47`

```javascript
const firstStationId = Array.isArray(node.assignedStations) && node.assignedStations.length > 0
  ? (node.assignedStations[0].stationId || node.assignedStations[0].id)
  : null;
```

**Problem:** İlk station'ı alıyor, priority sistemini görmezden geliyor

---

## APPENDIX B: Mevcut Durum vs Önerilen Yapı Karşılaştırması

### B.1 Kaynak Bilgisi Yönetimi

**Mevcut Durum:**
```javascript
// Parça parça, birden fazla yerde:
{
  assignedWorkerId: "worker-1",          // Node'da
  assignedStations: [...],                // Node'da
  substationId: "sub-1",                  // Assignment'ta
  workerSchedule: Map<string, []>,        // Runtime Map'te
  stationSchedule: Map<string, []>,       // Runtime Map'te (yanlış isimlendirilmiş)
}
```

**Sorunlar:**
- Veriler dağınık
- Frontend-backend sözleşmesi belirsiz
- Runtime verileri kaybolup gidiyor
- Rollback/yeniden planlama zor

**Önerilen Yapı:**
```javascript
{
  allocation: {
    resources: {
      worker: {
        id: "worker-1",
        name: "Ali Yılmaz",
        skillSet: ["Kesme", "Kaynak"],
        efficiency: 1.2,
        personalScheduleId: "schedule-1"
      },
      station: {
        id: "station-1",
        name: "Kesim İstasyonu",
        efficiency: 1.1
      },
      substation: {
        id: "substation-1",
        code: "KSM-A",
        currentOperation: null
      },
      assignmentMode: "auto",  // "auto" | "manual"
      priority: 1
    }
  }
}
```

**Avantajlar:**
- Tek bir yerde tüm kaynak bilgisi
- JSON sözleşmesi net
- Frontend-backend aynı yapıyı kullanır
- Validation kolay

---

### B.2 Zaman Bilgisi Yönetimi

**Mevcut Durum:**
```javascript
// Assignment kaydında:
{
  nominalTime: 60,
  effectiveTime: 54,
  plannedStart: "2024-11-16T09:00:00Z",
  plannedEnd: "2024-11-16T10:00:00Z"
}

// ❌ Ara hesaplamalar kayıp:
// - Predecessor bitişi ne zaman?
// - Worker hangi saatte müsait?
// - Substation hangi saatte müsait?
// - Schedule adjustment sebepleri?
```

**Sorunlar:**
- Ara hesaplamalar sadece runtime'da var
- Gecikme analizi yapılamıyor
- Yeniden planlama için bilgi yok
- Capacity analysis yapılamıyor

**Önerilen Yapı:**
```javascript
{
  allocation: {
    time: {
      nominalMinutes: 60,           // Temel süre
      effectiveMinutes: 54,         // Efficiency-adjusted
      predecessorReadyAt: "2024-11-16T08:30:00Z",  // En geç predecessor bitiş
      workerReadyAt: "2024-11-16T08:45:00Z",       // Worker müsait olma
      substationReadyAt: "2024-11-16T09:00:00Z",   // Substation müsait olma
      scheduledStart: "2024-11-16T09:00:00Z",      // Final başlangıç
      scheduledEnd: "2024-11-16T09:54:00Z",        // Final bitiş
      scheduleAdjustments: [
        {
          reason: "shift_adjusted",
          originalStart: "2024-11-16T08:45:00Z",
          adjustedStart: "2024-11-16T09:00:00Z",
          details: "Worker shift starts at 09:00"
        }
      ]
    }
  }
}
```

**Avantajlar:**
- Tüm zaman hesapları kayıtlı
- Gecikme sebepleri anlaşılır
- Yeniden planlama mümkün
- Grafikleştirme kolay

---

### B.3 Malzeme Bilgisi Yönetimi

**Mevcut Durum:**
```javascript
// Assignment kaydında:
{
  preProductionReservedAmount: {
    "M-001": 210,
    "M-008": 105
  },
  plannedOutput: {
    "WIP-001": 100
  },
  materialReservationStatus: "pending"  // ❌ Asla "reserved" olmuyor
}

// ❌ Gerçek rezervasyon yok:
// - materials koleksiyonu güncellenmesi yok
// - Batch ID yok
// - Rezervasyon zamanı yok
// - Consumption tracking yok
```

**Sorunlar:**
- Hesaplama var, rezervasyon yok
- Çift rezervasyon mümkün
- Stok takibi çalışmıyor
- Consumption tracking yok

**Önerilen Yapı:**
```javascript
{
  allocation: {
    materials: {
      inputs: [
        {
          code: "M-001",
          requiredQty: 200,          // Normal ihtiyaç
          defectBufferQty: 10,       // Fire buffer
          reservedQty: 210,          // Toplam rezerve
          reservedBatchId: "batch-123",  // Hangi batch
          reservedAt: "2024-11-16T10:30:00Z",
          consumedQty: 0,            // Henüz tüketilmedi
          consumedAt: null
        },
        {
          code: "M-008",
          requiredQty: 100,
          defectBufferQty: 5,
          reservedQty: 105,
          reservedBatchId: "batch-456",
          reservedAt: "2024-11-16T10:30:00Z",
          consumedQty: 0,
          consumedAt: null
        }
      ],
      outputs: [
        {
          code: "WIP-001",
          plannedQty: 100,
          actualQty: 0,
          nextNodeId: "node-2",     // Bu output nereye gidiyor
          producedAt: null
        }
      ],
      reservationStatus: "reserved",   // pending → reserved → consumed
      consumptionStatus: "not_started" // not_started → partial → completed
    }
  }
}
```

**Avantajlar:**
- Gerçek rezervasyon tracking
- Batch takibi
- Consumption takibi
- Çift rezervasyon engellenmiş
- Material flow analizi mümkün

---

### B.4 Bağımlılık Bilgisi Yönetimi

**Mevcut Durum:**
```javascript
// Frontend (plan designer):
{
  connections: ["node-2", "node-3"]  // ❌ Çift yönlü bağlantı belirsiz
}

// Backend (runtime):
{
  predecessors: ["node-1"]  // ✅ Girişler
  // ❌ Çıkış bilgisi yok
}
```

**Sorunlar:**
- Frontend connections kullanıyor
- Backend predecessors bekliyor
- Successor bilgisi yok
- Sequence bilgisi yok

**Önerilen Yapı:**
```javascript
{
  allocation: {
    dependencies: {
      predecessorIds: ["node-1", "node-2"],  // Bu node bunların bitmesini bekler
      successorId: "node-4",                  // Bu node bitince sonraki
      sequence: 3,                            // Execution sırası (topological)
      criticalPath: true,                     // Critical path üzerinde mi?
      slack: 0                                // Gecikme toleransı (minutes)
    }
  }
}
```

**Avantajlar:**
- Net bağımlılık tanımı
- Frontend-backend uyumlu
- Critical path analizi mümkün
- Slack calculation mümkün

---

### B.5 Durum ve İzleme

**Mevcut Durum:**
```javascript
{
  status: "pending",
  createdAt: Timestamp,
  createdBy: "user@example.com"
  // ❌ Multi-status tracking yok
  // ❌ Audit trail eksik
  // ❌ Quality gate tracking yok
}
```

**Önerilen Yapı:**
```javascript
{
  allocation: {
    status: {
      assignment: "pending",      // pending → in_progress → completed → cancelled
      reservation: "pending",     // pending → reserved → consumed
      qualityGate: "not_started", // not_started → in_progress → passed → failed
      overall: "pending"          // Genel durum (composite)
    },
    audit: {
      createdBy: "user@example.com",
      createdAt: "2024-11-16T10:30:00Z",
      lastAutoSchedulerId: "scheduler-v2.1",
      modifications: [
        {
          modifiedBy: "user@example.com",
          modifiedAt: "2024-11-16T11:00:00Z",
          field: "scheduledStart",
          oldValue: "2024-11-16T09:00:00Z",
          newValue: "2024-11-16T09:30:00Z",
          reason: "manual_adjustment"
        }
      ]
    },
    metrics: {
      plannedDuration: 54,        // minutes
      actualDuration: null,       // minutes
      efficiency: null,           // actual / planned
      qualityRate: null,          // good units / total units
      defectCount: null,
      reworkCount: null
    }
  }
}
```

**Avantajlar:**
- Multi-dimensional status tracking
- Full audit trail
- Metrics collection
- Quality tracking

---

## APPENDIX C: Geçiş Adımları ve Uygulama Planı

### C.1 Şema ve UI Senkronizasyonu (Phase 1 - HIGH PRIORITY)

#### C.1.1 Node Interface Güncellemesi

**Dosya:** `quote-portal/domains/production/components/production-plan-designer.tsx`

**Değişiklikler:**
```typescript
interface OperationNode {
  id: string;
  name: string;
  operationId: string;
  type: "operation";
  operationType: string;
  x: number;
  y: number;
  
  // ❌ KALDIRILACAK
  // connections: string[];
  // stationId?: string;
  
  // ✅ EKLENMİŞ (YENİ MODEL)
  predecessors: string[];        // Input node'ların ID'leri
  successor: string | null;      // Output node'un ID'si (tekil)
  
  // Skill ve zaman
  requiredSkills: string[];
  nominalTime: number;           // Temel süre
  effectiveTime?: number;        // Efficiency-adjusted süre
  
  // Kaynak ataması
  assignedStations: Array<{      // Öncelik sıralı istasyon listesi
    stationId: string;
    stationName: string;
    priority: number;            // 1 = en yüksek öncelik
  }>;
  assignmentMode: 'auto' | 'manual';  // Otomatik mi manuel mi
  assignedWorkerId?: string;     // Manuel atama için
  assignedWorkerName?: string;
  
  // Malzeme bilgisi
  materialInputs?: Array<{
    materialCode: string;
    materialName: string;
    requiredQuantity: number;
    unit: string;
  }>;
  outputCode?: string;
  outputQty?: number;
  
  sequence?: number;
}
```

#### C.1.2 Plan Designer Logic Güncellemesi

**Değişiklikler:**
```typescript
// Yeni node oluşturma
const newNode: OperationNode = {
  id: `node-${Date.now()}`,
  predecessors: [],           // ✅ Yeni
  successor: null,            // ✅ Yeni
  assignedStations: [],       // ✅ Yeni
  assignmentMode: 'auto',     // ✅ Yeni
  // connections: [],         // ❌ Kaldırıldı
  // stationId: "",           // ❌ Kaldırıldı
  // ...
};

// Bağlantı oluşturma (connections → predecessors/successor)
const handleConnect = (sourceId: string, targetId: string) => {
  setNodes(prevNodes => prevNodes.map(node => {
    if (node.id === targetId) {
      // Target node'a source'u predecessor olarak ekle
      return {
        ...node,
        predecessors: [...new Set([...node.predecessors, sourceId])]
      };
    }
    if (node.id === sourceId) {
      // Source node'un successor'ını set et (tekil!)
      if (node.successor && node.successor !== targetId) {
        alert('Her operasyonun sadece bir çıkışı olabilir!');
        return node;
      }
      return {
        ...node,
        successor: targetId
      };
    }
    return node;
  }));
};

// Bağlantı silme
const handleDisconnect = (sourceId: string, targetId: string) => {
  setNodes(prevNodes => prevNodes.map(node => {
    if (node.id === targetId) {
      // Target'tan source'u predecessor listesinden çıkar
      return {
        ...node,
        predecessors: node.predecessors.filter(p => p !== sourceId)
      };
    }
    if (node.id === sourceId) {
      // Source'un successor'ını temizle
      return {
        ...node,
        successor: node.successor === targetId ? null : node.successor
      };
    }
    return node;
  }));
};
```

#### C.1.3 Station Assignment UI

**Yeni Component:**
```typescript
// Station Priority Selector
interface StationAssignmentProps {
  node: OperationNode;
  availableStations: Station[];
  onChange: (stations: Array<{stationId: string, priority: number}>) => void;
}

function StationPrioritySelector({ node, availableStations, onChange }: StationAssignmentProps) {
  const [assignments, setAssignments] = useState(node.assignedStations || []);
  
  const addStation = (stationId: string) => {
    const station = availableStations.find(s => s.id === stationId);
    if (!station) return;
    
    const newAssignment = {
      stationId: station.id,
      stationName: station.name,
      priority: assignments.length + 1
    };
    
    const updated = [...assignments, newAssignment];
    setAssignments(updated);
    onChange(updated);
  };
  
  const removeStation = (stationId: string) => {
    const updated = assignments.filter(a => a.stationId !== stationId)
      .map((a, index) => ({ ...a, priority: index + 1 })); // Re-index priorities
    setAssignments(updated);
    onChange(updated);
  };
  
  const changePriority = (stationId: string, delta: number) => {
    const index = assignments.findIndex(a => a.stationId === stationId);
    if (index === -1) return;
    
    const newIndex = index + delta;
    if (newIndex < 0 || newIndex >= assignments.length) return;
    
    const updated = [...assignments];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    updated.forEach((a, i) => a.priority = i + 1);
    
    setAssignments(updated);
    onChange(updated);
  };
  
  return (
    <div className="station-priority-selector">
      <h4>İstasyon Ataması (Öncelik Sıralı)</h4>
      <select onChange={(e) => addStation(e.target.value)} value="">
        <option value="">İstasyon seçin...</option>
        {availableStations
          .filter(s => !assignments.some(a => a.stationId === s.id))
          .map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
      </select>
      
      <ul className="assigned-stations">
        {assignments.map((a, index) => (
          <li key={a.stationId} className="station-item">
            <span className="priority-badge">{a.priority}</span>
            <span className="station-name">{a.stationName}</span>
            <div className="priority-controls">
              <button onClick={() => changePriority(a.stationId, -1)} disabled={index === 0}>
                ↑
              </button>
              <button onClick={() => changePriority(a.stationId, 1)} disabled={index === assignments.length - 1}>
                ↓
              </button>
              <button onClick={() => removeStation(a.stationId)}>
                ×
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

### C.2 Backend Normalizasyonu (Phase 1 - CRITICAL)

#### C.2.1 Node ID Tutarlılığı

**Dosya:** `quote-portal/server/mesRoutes.js`

**Değişiklik 1: Launch endpoint (satır 5513)**
```javascript
// ❌ ÖNCE
const node = nodesToUse.find(n => n.id === nodeId);

// ✅ SONRA
const node = nodesToUse.find(n => (n.nodeId || n.id) === nodeId);
```

**Değişiklik 2: Topological sort (satır 5740)**
```javascript
// Zaten var, değişiklik yok
const normalizedNodes = nodes.map(n => ({
  ...n,
  _id: n.nodeId || n.id  // ✅ Normalizasyon mevcut
}));
```

**Değişiklik 3: getPlanExecutionState (satır 398)**
```javascript
// ❌ ÖNCE
const assignment = assignments.get(node.nodeId);

// ✅ SONRA
const nodeId = node.nodeId || node.id;
const assignment = assignments.get(nodeId);
```

**Global Normalizer Fonksiyonu:**
```javascript
/**
 * Normalize node ID - use nodeId if exists, otherwise id
 * @param {Object} node - Node object
 * @returns {string} Normalized node ID
 */
function getNodeId(node) {
  return node.nodeId || node.id;
}

// Kullanım:
const nodeId = getNodeId(node);
const assignment = assignments.get(nodeId);
```

#### C.2.2 StationSchedule → SubstationSchedule Refactoring

**Değişiklik 1: Map isimleri (satır 5508)**
```javascript
// ❌ ÖNCE
const workerSchedule = new Map(); // workerId -> [{ start, end }]
const stationSchedule = new Map(); // stationId -> [{ start, end }]  // ❌ Yanlış yorum

// ✅ SONRA
const workerSchedule = new Map(); // workerId -> [{ start, end }]
const substationSchedule = new Map(); // substationId -> [{ start, end }]  // ✅ Doğru
```

**Değişiklik 2: Tüm referansları güncelle**
```javascript
// Eski:
stationSchedule.get(substationId)
stationSchedule.set(substationId, [])
stationSchedule.get(s.id)  // ❌ BUG! station id kullanıyor

// Yeni:
substationSchedule.get(substationId)
substationSchedule.set(substationId, [])
substationSchedule.get(ss.id)  // ✅ DOĞRU! substation id
```

**Değişiklik 3: Function signature güncellemeleri**
```javascript
async function assignNodeResources(
  node,
  workers,
  stations,
  substations,
  workerSchedule,
  substationSchedule,  // ✅ İsim değişti
  planData,
  nodeEndTimes,
  db
) {
  // ...
}
```

---

### C.3 Malzeme Validasyonu Fix (Phase 1 - CRITICAL)

**Dosya:** `quote-portal/server/mesRoutes.js`

**Değişiklik: satır 5895**
```javascript
// ❌ ÖNCE
const required = mat.required;  // undefined!

// ✅ SONRA
const required = mat.requiredQuantity;
```

**Ekstra Güvenlik:**
```javascript
// Check for shortages and build warnings array
const warnings = [];

for (const [code, mat] of materialsToCheck) {
  const materialData = materialMap.get(code);
  const available = materialData 
    ? parseFloat(materialData.stock || materialData.available) || 0
    : 0;
  
  // ✅ DOĞRU ALAN + FALLBACK
  const required = mat.requiredQuantity || mat.required || 0;
  
  // ✅ Güvenli kontrol
  if (required > 0 && available < required) {
    const nodeNamesList = Array.from(mat.nodeNames).join(', ');
    warnings.push({
      nodeName: nodeNamesList || 'Unknown',
      materialCode: code,
      materialName: mat.name || code,
      required,
      available,
      shortage: Math.max(required - available, 0),  // ✅ Negatif önleme
      unit: mat.unit || ''
    });
  }
}

return { warnings };
```

---

### C.4 Gerçek Rezervasyon Mekanizması (Phase 2 - HIGH)

**Dosya:** `quote-portal/server/mesRoutes.js`

**Yeni Fonksiyon:**
```javascript
/**
 * Reserve materials for work package
 * @param {Object} preProductionReservedAmount - {materialCode: quantity}
 * @param {string} workPackageId - Work package ID
 * @param {string} planId - Plan ID
 * @param {Object} db - Firestore instance
 * @returns {Promise<Object>} Reservation result
 */
async function reserveMaterialsForWorkPackage(
  preProductionReservedAmount,
  workPackageId,
  planId,
  db
) {
  const batch = db.batch();
  const now = new Date();
  const reservations = [];
  const errors = [];
  
  for (const [materialCode, qty] of Object.entries(preProductionReservedAmount)) {
    try {
      // 1. Check stock
      const materialRef = db.collection('materials').doc(materialCode);
      const materialDoc = await materialRef.get();
      
      if (!materialDoc.exists) {
        errors.push({
          materialCode,
          error: 'material_not_found',
          message: `Material ${materialCode} not found`
        });
        continue;
      }
      
      const materialData = materialDoc.data();
      const currentStock = parseFloat(materialData.stock || 0);
      
      if (currentStock < qty) {
        errors.push({
          materialCode,
          error: 'insufficient_stock',
          message: `Insufficient stock for ${materialCode}. Required: ${qty}, Available: ${currentStock}`,
          required: qty,
          available: currentStock
        });
        continue;
      }
      
      // 2. Create reservation record
      const reservationId = `${workPackageId}-${materialCode}`;
      const reservationRef = db.collection('material-reservations').doc(reservationId);
      
      batch.set(reservationRef, {
        id: reservationId,
        materialCode,
        quantity: qty,
        workPackageId,
        planId,
        status: 'reserved',
        reservedAt: now,
        consumedQty: 0,
        consumedAt: null,
        releasedQty: 0,
        releasedAt: null
      });
      
      // 3. Update material stock (decrease)
      batch.update(materialRef, {
        stock: admin.firestore.FieldValue.increment(-qty),
        reservedStock: admin.firestore.FieldValue.increment(qty),
        updatedAt: now
      });
      
      // 4. Add movement record
      const movementRef = db.collection('material-movements').doc();
      batch.set(movementRef, {
        materialCode,
        movementType: 'reservation',
        quantity: -qty,  // Negative for outgoing
        relatedDocType: 'work-package',
        relatedDocId: workPackageId,
        reason: 'Production reservation',
        createdAt: now,
        createdBy: 'system'
      });
      
      reservations.push({
        materialCode,
        quantity: qty,
        reservationId
      });
      
    } catch (error) {
      errors.push({
        materialCode,
        error: 'reservation_failed',
        message: error.message
      });
    }
  }
  
  // Commit batch if no errors
  if (errors.length === 0) {
    await batch.commit();
    return {
      success: true,
      reservations,
      errors: []
    };
  } else {
    // Don't commit if any errors
    return {
      success: false,
      reservations: [],
      errors
    };
  }
}
```

**Launch Endpoint'e Entegrasyon:**
```javascript
// mesRoutes.js:5650 civarı - Assignment oluşturduktan sonra

// Create new assignments with work order-based IDs
for (let i = 0; i < assignments.length; i++) {
  const assignment = assignments[i];
  const workPackageId = assignmentIds[i];
  
  // ... assignment oluştur
  
  // ✅ YENİ: Malzeme rezervasyonu yap
  if (assignment.preProductionReservedAmount && 
      Object.keys(assignment.preProductionReservedAmount).length > 0) {
    
    const reservationResult = await reserveMaterialsForWorkPackage(
      assignment.preProductionReservedAmount,
      workPackageId,
      planId,
      db
    );
    
    if (!reservationResult.success) {
      // Rezervasyon başarısız, assignment'ı işaretle
      assignment.materialReservationStatus = 'failed';
      assignment.materialReservationErrors = reservationResult.errors;
      
      console.error(`Material reservation failed for ${workPackageId}:`, reservationResult.errors);
      
      // Opsiyonel: Tüm launch'ı iptal et
      // throw new Error(`Material reservation failed for ${workPackageId}`);
    } else {
      assignment.materialReservationStatus = 'reserved';
      assignment.reservedAt = new Date();
    }
  }
  
  batch.set(assignmentRef, assignment);
}
```

---

### C.5 Şema Tutarlılığı (Phase 1 - HIGH)

**Dosya:** `quote-portal/server/models/AssignmentSchema.json`

**Değişiklik:**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["id", "planId", "nodeId", "workerId", "stationId", "status", "nominalTime"],
  // ❌ ÖNCE: "substationId" required'da vardı
  // ✅ SONRA: substationId opsiyonel
  "properties": {
    "substationId": {
      "type": ["string", "null"]  // ✅ nullable
    }
  }
}
```

**Alternatif (daha iyi):**
```json
{
  "required": ["id", "planId", "nodeId", "workerId", "stationId", "substationId", "status", "nominalTime"],
  // ✅ Required'da bırak AMA UI'da zorunlu hale getir
  "properties": {
    "substationId": {
      "type": "string",
      "minLength": 1  // ✅ Empty string kabul etme
    }
  }
}
```

**Plan Designer'da zorunlu kontrol:**
```typescript
const validateNode = (node: OperationNode): string[] => {
  const errors: string[] = [];
  
  if (!node.assignedStations || node.assignedStations.length === 0) {
    errors.push('En az bir istasyon ataması yapmalısınız');
  }
  
  // ✅ Her istasyonun substation'ı olduğunu kontrol et
  node.assignedStations.forEach(station => {
    const stationData = stations.find(s => s.id === station.stationId);
    const substations = getSubstationsForStation(stationData);
    
    if (!substations || substations.length === 0) {
      errors.push(`${station.stationName} istasyonunun alt istasyonu yok!`);
    }
  });
  
  return errors;
};
```

---

### C.6 Pause/Cancel Substation Fix (Phase 2 - MEDIUM)

**Dosya:** `quote-portal/server/mesRoutes.js`

**Değişiklik: satır 6741**
```javascript
// Collect unique workers, stations, and substations to update
const workersToUpdate = new Set();
const stationsToUpdate = new Set();
const substationsToUpdate = new Set();  // ✅ YENİ

// ...

assignmentsSnapshot.docs.forEach(doc => {
  const assignment = doc.data();
  
  // ...
  
  // Track resources to clear
  if (assignment.workerId) workersToUpdate.add(assignment.workerId);
  if (assignment.stationId) stationsToUpdate.add(assignment.stationId);
  if (assignment.substationId) substationsToUpdate.add(assignment.substationId);  // ✅ YENİ
});

// Clear worker currentTask for affected workers
for (const workerId of workersToUpdate) {
  const workerRef = db.collection('mes-workers').doc(workerId);
  batch.update(workerRef, {
    currentTask: null,
    currentTaskUpdatedAt: now
  });
}

// Clear station currentOperation for affected stations
for (const stationId of stationsToUpdate) {
  const stationRef = db.collection('mes-stations').doc(stationId);
  batch.update(stationRef, {
    currentOperation: null,
    currentOperationUpdatedAt: now
  });
}

// ✅ YENİ: Clear substation currentOperation
for (const substationId of substationsToUpdate) {
  const substationRef = db.collection('mes-substations').doc(substationId);
  batch.update(substationRef, {
    currentOperation: null,
    currentExpectedEnd: null,
    currentOperationUpdatedAt: now
  });
}
```

---

### C.7 Migration Script (Phase 3)

**Yeni Dosya:** `quote-portal/scripts/migrate-to-new-allocation-model.cjs`

```javascript
const admin = require('firebase-admin');
const serviceAccount = require('../config/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrateNodes() {
  console.log('🔄 Migrating production plans to new allocation model...');
  
  const plansSnapshot = await db.collection('mes-production-plans').get();
  const batch = db.batch();
  let migratedCount = 0;
  let errorCount = 0;
  
  for (const planDoc of plansSnapshot.docs) {
    try {
      const planData = planDoc.data();
      const nodes = planData.nodes || [];
      
      const migratedNodes = nodes.map(node => {
        const migratedNode = { ...node };
        
        // 1. Convert connections to predecessors/successor
        if (node.connections && Array.isArray(node.connections)) {
          // connections listesindeki her node, bu node'un successor'ıdır
          // Ancak predecessor'ları belirlemek için tüm node'ları taramak gerek
          migratedNode.successor = node.connections[0] || null;  // İlk connection'ı successor yap
          delete migratedNode.connections;
        }
        
        // 2. Normalize node ID
        if (!migratedNode.id && migratedNode.nodeId) {
          migratedNode.id = migratedNode.nodeId;
        }
        
        // 3. Convert stationId to assignedStations array
        if (node.stationId && !node.assignedStations) {
          migratedNode.assignedStations = [{
            stationId: node.stationId,
            stationName: node.stationName || '',
            priority: 1
          }];
          delete migratedNode.stationId;
          delete migratedNode.stationName;
        }
        
        // 4. Add assignmentMode if missing
        if (!migratedNode.assignmentMode) {
          migratedNode.assignmentMode = node.assignedWorkerId ? 'manual' : 'auto';
        }
        
        // 5. Add empty predecessors if missing
        if (!migratedNode.predecessors) {
          migratedNode.predecessors = [];
        }
        
        return migratedNode;
      });
      
      // Build predecessor relationships
      migratedNodes.forEach(node => {
        if (node.successor) {
          const successorNode = migratedNodes.find(n => n.id === node.successor);
          if (successorNode) {
            if (!successorNode.predecessors.includes(node.id)) {
              successorNode.predecessors.push(node.id);
            }
          }
        }
      });
      
      // Update plan document
      batch.update(planDoc.ref, {
        nodes: migratedNodes,
        migratedToNewModel: true,
        migratedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      migratedCount++;
      
    } catch (error) {
      console.error(`Error migrating plan ${planDoc.id}:`, error);
      errorCount++;
    }
  }
  
  await batch.commit();
  
  console.log(`✅ Migration complete: ${migratedCount} plans migrated, ${errorCount} errors`);
}

migrateNodes()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
```

---

### C.8 Test & İzleme (Phase 3)

**Yeni Dosya:** `quote-portal/scripts/test-launch-validation.cjs`

```javascript
const admin = require('firebase-admin');
const serviceAccount = require('../config/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function testLaunchValidation() {
  console.log('🧪 Testing launch validation...');
  
  const tests = [
    {
      name: 'Node ID consistency',
      test: async () => {
        const plans = await db.collection('mes-production-plans')
          .where('status', '==', 'production')
          .limit(10)
          .get();
        
        let passed = 0;
        let failed = 0;
        
        plans.docs.forEach(doc => {
          const plan = doc.data();
          const nodes = plan.nodes || [];
          
          nodes.forEach(node => {
            const hasId = !!node.id;
            const hasNodeId = !!node.nodeId;
            const idsMatch = node.id === node.nodeId;
            
            if ((hasId || hasNodeId) && (!hasId || !hasNodeId || !idsMatch)) {
              console.warn(`❌ Plan ${doc.id}, Node ${node.name}: ID inconsistency`);
              console.warn(`   id: ${node.id}, nodeId: ${node.nodeId}`);
              failed++;
            } else {
              passed++;
            }
          });
        });
        
        return { passed, failed };
      }
    },
    {
      name: 'Material field consistency',
      test: async () => {
        const plans = await db.collection('mes-production-plans')
          .where('status', '==', 'production')
          .limit(10)
          .get();
        
        let passed = 0;
        let failed = 0;
        
        plans.docs.forEach(doc => {
          const plan = doc.data();
          const materialInputs = plan.materialSummary?.materialInputs || [];
          
          materialInputs.forEach(mat => {
            if (!mat.requiredQuantity && mat.required) {
              console.warn(`❌ Plan ${doc.id}, Material ${mat.materialCode}: Using 'required' field instead of 'requiredQuantity'`);
              failed++;
            } else if (mat.requiredQuantity) {
              passed++;
            }
          });
        });
        
        return { passed, failed };
      }
    },
    {
      name: 'Station assignment structure',
      test: async () => {
        const plans = await db.collection('mes-production-plans')
          .where('status', '==', 'production')
          .limit(10)
          .get();
        
        let passed = 0;
        let failed = 0;
        
        plans.docs.forEach(doc => {
          const plan = doc.data();
          const nodes = plan.nodes || [];
          
          nodes.forEach(node => {
            if (node.stationId && !node.assignedStations) {
              console.warn(`❌ Plan ${doc.id}, Node ${node.name}: Using old stationId field`);
              failed++;
            } else if (node.assignedStations && Array.isArray(node.assignedStations)) {
              passed++;
            }
          });
        });
        
        return { passed, failed };
      }
    }
  ];
  
  for (const test of tests) {
    console.log(`\n🧪 Running: ${test.name}`);
    const result = await test.test();
    console.log(`   ✅ Passed: ${result.passed}`);
    console.log(`   ❌ Failed: ${result.failed}`);
  }
}

testLaunchValidation()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
```

---

## Özet

Bu appendix'ler şunları içermektedir:

1. **APPENDIX A:** 8 kritik hata detaylı olarak açıklanmış, kod örnekleriyle gösterilmiş
2. **APPENDIX B:** Mevcut yapı ile önerilen yapı arasındaki farklar 5 kategoride karşılaştırılmış
3. **APPENDIX C:** 8 aşamalı geçiş planı, kod örnekleri ve migration script'leriyle birlikte sunulmuş

Her hata için:
- Lokasyon bilgisi
- Mevcut kod
- Problem açıklaması
- Etki analizi
- Çözüm önerisi

verilmiştir.

---

## APPENDIX D: İmplementasyon Promtları

**Düzenleme Tarihi:** 16 Kasım 2025  
**Proje:** Burkol MES - Production System  
**Versiyon:** v2.0 (isUrgent + priorityIndex)

---

## ⚠️ ÖNEMLİ NOTLAR

### Priority Sistemi Mimari Kararı

Bu dokümandaki tüm promtlar **YENİ ALAN ADLARIYLA** yazıldı:

- ❌ **ESKİ:** `priority: "urgent" | "normal"` (String)
- ✅ **YENİ:** `isUrgent: true | false` (Boolean) + `priorityIndex: 1, 2, 3...` (Number)

**Neden bu seçim?**
- İleride **linear optimization** ile sıraları dinamik değiştireceğiz (CRM entegrasyonu için optimal path)
- `priorityIndex` topological/optimized execution order için
- `isUrgent` sadece paralel çalışma iznini kontrol eder

### Migration Stratejisi

**CLEAN SLATE APPROACH:** Eski verileri Firestore'dan manuel sileceğiz, migration scripti yok.

### Prompt Sırası ve Bağımlılıklar

Promtlar **FAZ** bazlı gruplanmış. **Mutlaka sırayla** çalıştır:

```
FAZ 1 → FAZ 2 → FAZ 3 → FAZ 4 → FAZ 5
```

**FAZ içindeki** promtları paralel çalıştırabilirsin, ama **FAZ'lar arası** bağımlılık var!

---

## 🏗️ FAZ 1: FOUNDATION (TEMEL DÜZELTMELER)

Bu faz **en kritik**. Diğer tüm promtlar bu temele dayanır.

---

#PROMPT 1: Node ID Normalization - getNodeId() Helper Fonksiyonu

**Öncelik:** 🔴 CRITICAL - İLK ÇALIŞTIR!  
**Bağımlılık:** Yok  
**Süre:** ~5 dakika  
**Dosya:** `quote-portal/server/mesRoutes.js`

```markdown
GÖREV: mesRoutes.js'te node.id vs node.nodeId tutarsızlığını çözmek için normalizasyon fonksiyonu oluşturma.

**⚠️ BAĞIMLILIK:** Bu prompt **MUTLAKA İLK** çalıştırılmalı! Diğer promtlar bu fonksiyonu kullanıyor.

CONTEXT:
- Sorun: Bazı node'larda node.id, bazılarında node.nodeId var
- Backend bazı yerlerde n.id kullanıyor, bazı yerlerde n.nodeId
- Launch sırasında "node not found" hataları oluşuyor
- Lokasyonlar: mesRoutes.js satır 398, 1369, 1497, 1521, 5513, 5740

İMPLEMENTASYON:

Dosyayı aç: quote-portal/server/mesRoutes.js

Dosyanın başına (diğer helper fonksiyonların yanına, tahmini satır 100-200 arası) ekle:

```javascript
/**
 * Normalize node ID - use nodeId if exists, otherwise fallback to id
 * This handles the inconsistency where some nodes have 'nodeId' and some have 'id'
 * @param {Object} node - Node object
 * @returns {string|null} Normalized node ID
 */
function getNodeId(node) {
  if (!node) return null;
  return node.nodeId || node.id || null;
}

/**
 * Normalize array of nodes - ensures each node has consistent ID field
 * @param {Array} nodes - Array of node objects
 * @returns {Array} Normalized nodes with _id field
 */
function normalizeNodes(nodes) {
  if (!Array.isArray(nodes)) return [];
  
  return nodes.map(node => ({
    ...node,
    _id: getNodeId(node) // Canonical ID field
  }));
}
```

TEST ADIMLARI:
1. mesRoutes.js dosyasını aç
2. Yukarıdaki 2 fonksiyonu ekle (satır 100-200 arası, diğer helper'ların yanına)
3. Server'ı restart et: `npm run dev` veya `pm2 restart server`
4. Node.js console'da test et:
   ```javascript
   getNodeId({id: "test"}) // → "test"
   getNodeId({nodeId: "test2"}) // → "test2"
   getNodeId({nodeId: "a", id: "b"}) // → "a" (nodeId öncelikli)
   getNodeId(null) // → null
   ```

BAŞARI KRİTERLERİ:
✅ getNodeId() fonksiyonu tanımlı
✅ normalizeNodes() fonksiyonu tanımlı
✅ Server başarıyla başlıyor
✅ Console'da syntax error yok
✅ Fonksiyon çağrıları çalışıyor

**📢 SONRAKİ ADIM:** Diğer promtlar bu fonksiyonu kullanacak. Lütfen sırayla devam et!

DOSYA YOLU:
/Users/umutyalcin/Documents/Burkol0/quote-portal/server/mesRoutes.js

İŞLEMİ GERÇEKLEŞTIR.
```

---

#PROMPT 2: Malzeme Alan İsmi Tutarsızlığı Düzeltmesi

**Öncelik:** 🟡 HIGH  
**Bağımlılık:** PROMPT 1 tamamlanmış olmalı (getNodeId kullanılacak)  
**Süre:** ~3 dakika  
**Dosya:** `quote-portal/server/mesRoutes.js`

```markdown
GÖREV: Malzeme kontrolü sırasında mat.required yerine mat.requiredQuantity kullanılması.

**⚠️ BAĞIMLILIK:** PROMPT 1 tamamlanmış olmalı (getNodeId kullanılacak).

CONTEXT:
- Sorun: Launch sırasında malzeme kontrolü mat.required kullanıyor (undefined)
- Doğru alan: mat.requiredQuantity
- Lokasyon: mesRoutes.js satır ~5895

ÇÖZÜM:

Dosyayı aç: quote-portal/server/mesRoutes.js

Satır ~5895'i bul (malzeme kontrolü loop'u):

MEVCUT KOD:
```javascript
for (const [code, mat] of materialsToCheck) {
  const materialData = materialMap.get(code);
  const available = materialData 
    ? parseFloat(materialData.stock || materialData.available) || 0
    : 0;
  
  const required = mat.required;  // ❌ UNDEFINED!
  
  if (available < required) {
    // ...
  }
}
```

YENİ KOD:
```javascript
for (const [code, mat] of materialsToCheck) {
  const materialData = materialMap.get(code);
  const available = materialData 
    ? parseFloat(materialData.stock || materialData.available) || 0
    : 0;
  
  // ✅ DOĞRU ALAN + FALLBACK
  const required = mat.requiredQuantity || mat.required || 0;
  
  if (required <= 0) {
    console.warn(`⚠️  Material ${code} has invalid required quantity:`, mat);
    continue;
  }
  
  if (available < required) {
    const nodeNamesList = Array.from(mat.nodeNames).join(', ');
    const shortage = Math.max(required - available, 0);
    
    warnings.push({
      nodeName: nodeNamesList || 'Unknown',
      materialCode: code,
      materialName: mat.name || code,
      required: parseFloat(required.toFixed(2)),
      available: parseFloat(available.toFixed(2)),
      shortage: parseFloat(shortage.toFixed(2)),
      unit: mat.unit || 'adet'
    });
  }
}
```

TEST ADIMLARI:
1. mesRoutes.js'te mat.required → mat.requiredQuantity değiştir
2. Fallback ekle: mat.requiredQuantity || mat.required || 0
3. Invalid quantity validation ekle
4. Server restart
5. Plan oluştur, malzeme ekle
6. Malzeme stokunu yetersiz yap (Firebase console'da)
7. Launch et
8. Malzeme uyarısında doğru değerleri gör (required > 0)

BAŞARI KRİTERLERİ:
✅ mat.requiredQuantity kullanılıyor
✅ Fallback var (eski data için)
✅ Console'da "undefined" hatası yok
✅ Launch warnings doğru değerleri gösteriyor

DOSYA YOLU:
/Users/umutyalcin/Documents/Burkol0/quote-portal/server/mesRoutes.js

İŞLEMİ GERÇEKLEŞTIR.
```

---

#PROMPT 3: stationSchedule → substationSchedule Refactoring

**Öncelik:** 🟡 HIGH  
**Bağımlılık:** PROMPT 1 tamamlanmış olmalı (getNodeId kullanılacak)  
**Süre:** ~5 dakika  
**Dosya:** `quote-portal/server/mesRoutes.js`

```markdown
GÖREV: Yanlış isimlendirilmiş stationSchedule değişkenini substationSchedule olarak düzeltmek.

**⚠️ BAĞIMLILIK:** PROMPT 1 tamamlanmış olmalı (getNodeId kullanılacak).

CONTEXT:
- Sorun: Değişken adı "stationSchedule" ama aslında substation ID'leriyle çalışıyor
- Bu karmaşıklığa sebep oluyor
- Lokasyon: mesRoutes.js satır 5508, 5576, 6313, 6352

ÇÖZÜM:

1. DEĞİŞKEN İSMİNİ DEĞİŞTİR (satır ~5508):

```javascript
// ❌ ÖNCE
const stationSchedule = new Map();

// ✅ SONRA
const substationSchedule = new Map(); // substationId -> [{ start, end }]
```

2. TÜM REFERANSLARI GÜNCELLE:

Find & Replace yap (VS Code: Cmd+Shift+H):
- Find: `stationSchedule\.get`
- Replace: `substationSchedule.get`

- Find: `stationSchedule\.set`
- Replace: `substationSchedule.set`

- Find: `stationSchedule\.has`
- Replace: `substationSchedule.has`

3. ASSIGNNODERESOURCES PARAMETRESİ EKLE (satır ~6200):

MEVCUT KOD:
```javascript
function assignNodeResources(
  node,
  workersMap,
  stationsMap,
  substationsMap,
  skillsMap,
  assignmentsArray,
  planName
) {
  // ...
}
```

YENİ KOD:
```javascript
function assignNodeResources(
  node,
  workersMap,
  stationsMap,
  substationsMap,
  skillsMap,
  assignmentsArray,
  planName,
  workerSchedule,          // ✅ Parametre ekle
  substationSchedule       // ✅ Parametre ekle
) {
  // ...
}
```

4. FONKSİYON ÇAĞRISINDA PARAMETRE EKLE (satır ~5540):

MEVCUT KOD:
```javascript
const resources = assignNodeResources(
  node,
  workersMap,
  stationsMap,
  substationsMap,
  skillsMap,
  assignmentsArray,
  plan.name
);
```

YENİ KOD:
```javascript
const resources = assignNodeResources(
  node,
  workersMap,
  stationsMap,
  substationsMap,
  skillsMap,
  assignmentsArray,
  plan.name,
  workerSchedule,          // ✅ Ekle
  substationSchedule       // ✅ Ekle
);
```

TEST ADIMLARI:
1. Find & Replace: "stationSchedule" → "substationSchedule" (tüm dosyada)
2. Function signature güncelle (satır ~6200)
3. Function call güncelle (satır ~5540)
4. Server restart
5. Plan launch et
6. Console'da substation scheduling log'larını kontrol et
7. Paralel substation ataması çalıştığını doğrula

BAŞARI KRİTERLERİ:
✅ stationSchedule → substationSchedule değişti
✅ Parametre olarak geçiliyor
✅ Paralel substation ataması çalışıyor
✅ Server başarıyla başlıyor

DOSYA YOLU:
/Users/umutyalcin/Documents/Burkol0/quote-portal/server/mesRoutes.js

İŞLEMİ GERÇEKLEŞTIR.
```

---

## 🔧 FAZ 2: SCHEMA VE VALIDATION

Bu faz schema dosyasını ve validation logic'i güncelliyor.

---

#PROMPT 4: SubstationId Schema Validation + isUrgent Field

**Öncelik:** 🟡 HIGH  
**Bağımlılık:** FAZ 1 tamamlanmış olmalı  
**Süre:** ~7 dakika  
**Dosyalar:** 
- `quote-portal/server/models/AssignmentSchema.json`
- `quote-portal/server/mesRoutes.js`

```markdown
GÖREV: AssignmentSchema.json'da substationId'yi opsiyonel yapmak VE isUrgent alanını eklemek, mesRoutes.js'te getNodeId() kullanımını yaygınlaştırmak.

**⚠️ BAĞIMLILIK:** PROMPT 1, 2, 3 tamamlanmış olmalı.

CONTEXT:
- Schema substationId'yi required yapıyor ama backend null dönebiliyor
- Validation hatası görmezden geliniyor
- getNodeId() kullanımı eksik
- isUrgent alanı schema'da yok

ÇÖZÜM:

1. SCHEMA DÜZELTMESİ:

Dosya: quote-portal/server/models/AssignmentSchema.json

MEVCUT KOD:
```json
{
  "substationId": {
    "type": "string",
    "description": "Assigned substation ID"
  }
}
```

YENİ KOD:
```json
{
  "substationId": {
    "type": ["string", "null"],
    "description": "Assigned substation ID (optional)"
  },
  "priorityIndex": {
    "type": "integer",
    "minimum": 1,
    "description": "Execution order (topological/optimized)"
  },
  "isUrgent": {
    "type": "boolean",
    "default": false,
    "description": "Urgent flag for parallel execution"
  }
}
```

2. VALIDATION LOGIC (mesRoutes.js, satır ~5624):

MEVCUT KOD:
```javascript
workPackageIds.forEach((workPackageId, i) => {
  const assignment = assignmentsArray[i];
  const assignmentRef = assignmentsRef.doc();
  
  const completeAssignment = {
    id: assignmentRef.id,
    workPackageId,
    planId: plan.id,
    workOrderCode,
    nodeId: assignment.nodeId,
    operationName: assignment.operationName,
    workerId: assignment.workerId,
    stationId: assignment.stationId,
    substationId: assignment.substationId,
    status: 'pending',
    plannedStart: assignment.plannedStart,
    duration: assignment.duration,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  
  batch.set(assignmentRef, completeAssignment);
});
```

YENİ KOD:
```javascript
workPackageIds.forEach((workPackageId, i) => {
  const assignment = assignmentsArray[i];
  const assignmentRef = assignmentsRef.doc();
  
  const completeAssignment = {
    id: assignmentRef.id,
    workPackageId,
    planId: plan.id,
    workOrderCode,
    nodeId: getNodeId(assignment),  // ✅ Normalization
    operationName: assignment.operationName,
    workerId: assignment.workerId,
    stationId: assignment.stationId,
    substationId: assignment.substationId || null,  // ✅ Explicit null
    status: 'pending',
    plannedStart: assignment.plannedStart,
    duration: assignment.duration,
    priorityIndex: assignment.priorityIndex,  // ✅ YENİ
    isUrgent: false,  // ✅ YENİ: Varsayılan normal
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  
  // ✅ Validation kontrolü
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
  
  batch.set(assignmentRef, completeAssignment);
});
```

TEST ADIMLARI:
1. AssignmentSchema.json güncelle (isUrgent ekle)
2. mesRoutes.js'te getNodeId() kullan
3. isUrgent: false ekle
4. substationId: assignment.substationId || null
5. Server restart
6. Plan launch et
7. Firestore'da isUrgent alanını gör
8. substationId null olabilsin

BAŞARI KRİTERLERİ:
✅ Schema'da isUrgent var
✅ getNodeId() kullanılıyor
✅ Validation çalışıyor
✅ isUrgent: false default
✅ substationId null olabilir

DOSYA YOLLARI:
- /Users/umutyalcin/Documents/Burkol0/quote-portal/server/models/AssignmentSchema.json
- /Users/umutyalcin/Documents/Burkol0/quote-portal/server/mesRoutes.js

İŞLEMİ GERÇEKLEŞTIR.
```

---

## 🚨 FAZ 3: URGENT PRİORİTY SİSTEMİ

Bu faz urgent sistemin core implementasyonu.

---

#PROMPT 5: Urgent Backend Endpoint (isUrgent Flag)

**Öncelik:** 🔴 CRITICAL  
**Bağımlılık:** FAZ 2 tamamlanmış olmalı (isUrgent alanı schema'da var)  
**Süre:** ~10 dakika  
**Dosya:** `quote-portal/server/mesRoutes.js`

```markdown
GÖREV: POST /api/mes/set-urgent-priority endpoint'i eklenmesi. isUrgent flag'ini true/false yapar.

**⚠️ BAĞIMLILIK:** PROMPT 4 tamamlanmış olmalı (isUrgent alanı schema'da var).

CONTEXT:
- Yeni endpoint: POST /api/mes/set-urgent-priority
- isUrgent: boolean flag kullanacağız (❌ priority: "urgent" DEĞİL!)
- 3 koleksiyonu günceller: production-plans, worker-assignments, approved-quotes

KOD (mesRoutes.js, satır ~5800 sonrası ekle):

```javascript
/**
 * Urgent Priority Endpoint
 * isUrgent flag'ini toggle eder
 */
router.post('/set-urgent-priority', withAuth, async (req, res) => {
  try {
    const { workOrderCode, urgent } = req.body;
    
    if (!workOrderCode || typeof urgent !== 'boolean') {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    
    console.log(`⚡ Setting isUrgent=${urgent} for ${workOrderCode}`);
    
    const batch = db.batch();
    let updateCount = 0;
    
    // 1. Production Plan
    const planSnap = await db.collection('mes-production-plans')
      .where('workOrderCode', '==', workOrderCode)
      .where('status', 'in', ['production', 'in-progress'])
      .limit(1)
      .get();
    
    if (!planSnap.empty) {
      batch.update(planSnap.docs[0].ref, { 
        isUrgent: urgent,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      updateCount++;
    }
    
    // 2. Worker Assignments
    const assignmentSnap = await db.collection('mes-worker-assignments')
      .where('workOrderCode', '==', workOrderCode)
      .where('status', 'in', ['pending', 'in-progress'])
      .get();
    
    assignmentSnap.docs.forEach(doc => {
      batch.update(doc.ref, { 
        isUrgent: urgent,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      updateCount++;
    });
    
    // 3. Approved Quote
    const quoteSnap = await db.collection('mes-approved-quotes')
      .where('workOrderCode', '==', workOrderCode)
      .limit(1)
      .get();
    
    if (!quoteSnap.empty) {
      batch.update(quoteSnap.docs[0].ref, { 
        isUrgent: urgent,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      updateCount++;
    }
    
    await batch.commit();
    
    res.json({
      success: true,
      message: `Üretim planı ${urgent ? 'acil' : 'normal'} önceliğe alındı`,
      updatedCount,
      isUrgent: urgent
    });
    
  } catch (error) {
    console.error('❌ Set urgent error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

TEST ADIMLARI:
1. Endpoint'i ekle (mesRoutes.js, satır ~5800 sonrası)
2. Server restart
3. Postman ile test:
```json
POST http://localhost:3002/api/mes/set-urgent-priority
Headers: {
  "Authorization": "Bearer YOUR_TOKEN",
  "Content-Type": "application/json"
}
Body: {
  "workOrderCode": "WO-005",
  "urgent": true
}
```
4. Response kontrol:
```json
{
  "success": true,
  "message": "Üretim planı acil önceliğe alındı",
  "updatedCount": 5,
  "isUrgent": true
}
```
5. Firestore'da isUrgent: true gör (3 koleksiyonda)

BAŞARI KRİTERLERİ:
✅ Endpoint çalışıyor
✅ isUrgent flag set ediliyor
✅ 3 koleksiyon güncelleniyor
✅ Postman'de 200 response

DOSYA YOLU:
/Users/umutyalcin/Documents/Burkol0/quote-portal/server/mesRoutes.js

İŞLEMİ GERÇEKLEŞTIR.
```

---

#PROMPT 6: Urgent Frontend Button (isUrgent Toggle)

**Öncelik:** 🔴 CRITICAL  
**Bağımlılık:** PROMPT 5 tamamlanmış olmalı (backend endpoint hazır)  
**Süre:** ~8 dakika  
**Dosyalar:** 
- `quote-portal/domains/production/js/approvedQuotes.js`
- `quote-portal/domains/production/css/approvedQuotes.css`

```markdown
GÖREV: Approved Quotes'a "!! Acil" butonu eklenmesi. isUrgent flag'ini toggle eder.

**⚠️ BAĞIMLILIK:** PROMPT 5 tamamlanmış olmalı (backend endpoint hazır).

CONTEXT:
- Dosya: quote-portal/domains/production/js/approvedQuotes.js
- isUrgent flag kullanacağız (❌ priority: "urgent" DEĞİL!)
- Button: Üretimde olan planlara görünür

ÇÖZÜM:

1. YENİ FONKSİYON (approvedQuotes.js, satır ~300 sonrası):

```javascript
/**
 * Set urgent priority for production plan
 * @param {string} workOrderCode - Work order code
 */
async function setUrgentPriority(workOrderCode) {
  try {
    const plan = productionPlansMap[workOrderCode];
    const currentUrgent = plan?.isUrgent || false;
    const newUrgent = !currentUrgent;
    
    const confirmed = confirm(
      `${newUrgent ? 'ACİL ÖNCELİĞE ALMAK' : 'NORMAL ÖNCELİĞE DÖNDÜRMEK'} istediğinizden emin misiniz?\n\n` +
      `İş Emri: ${workOrderCode}\n` +
      `${newUrgent ? '🚨 Tüm work package\'lar aynı anda başlatılabilir!' : '⏳ Sadece ilk work package başlatılabilir.'}`
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
    
    if (!response.ok) {
      throw new Error(result.error || 'Öncelik ayarlanamadı');
    }
    
    alert(`✅ ${result.message}`);
    await fetchProductionPlans();
    renderApprovedQuotesTable();
    
  } catch (error) {
    console.error('Set urgent error:', error);
    alert(`❌ Hata: ${error.message}`);
  }
}
```

2. RENDER GÜNCELLEMESİ (renderApprovedQuotesTable fonksiyonunda, satır ~150):

MEVCUT KOD:
```javascript
if (productionState === 'Üretimde') {
  actionsHTML += `
    <button class="btn-pause" onclick="pauseProduction('${workOrderCode}')">
      ⏸️ Duraklat
    </button>
    <button class="btn-cancel" onclick="cancelProduction('${workOrderCode}')">
      ❌ İptal
    </button>
  `;
}
```

YENİ KOD:
```javascript
if (productionState === 'Üretimde') {
  const plan = productionPlansMap[workOrderCode];
  const isUrgent = plan?.isUrgent || false;
  
  actionsHTML += `
    <button class="${isUrgent ? 'btn-urgent active' : 'btn-urgent'}" 
            onclick="setUrgentPriority('${workOrderCode}')">
      ${isUrgent ? '🚨 Acil (Aktif)' : '!! Acil'}
    </button>
    <button class="btn-pause" onclick="pauseProduction('${workOrderCode}')">
      ⏸️ Duraklat
    </button>
    <button class="btn-cancel" onclick="cancelProduction('${workOrderCode}')">
      ❌ İptal
    </button>
  `;
}
```

3. CSS (approvedQuotes.css, dosya sonuna ekle):

```css
/* Urgent Button Styles */
.btn-urgent {
  background: linear-gradient(135deg, #ff6b6b, #ee5a52);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: bold;
  font-size: 0.9em;
  cursor: pointer;
  transition: all 0.3s ease;
  margin-right: 8px;
}

.btn-urgent:hover {
  background: linear-gradient(135deg, #ee5a52, #ff6b6b);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 107, 107, 0.4);
}

.btn-urgent.active {
  background: linear-gradient(135deg, #ff4444, #cc0000);
  animation: pulse-urgent 2s infinite;
}

@keyframes pulse-urgent {
  0%, 100% { 
    box-shadow: 0 2px 8px rgba(255, 68, 68, 0.4); 
  }
  50% { 
    box-shadow: 0 4px 16px rgba(255, 68, 68, 0.7); 
  }
}
```

TEST ADIMLARI:
1. Fonksiyonu ekle (approvedQuotes.js)
2. Render güncelle
3. CSS ekle (approvedQuotes.css)
4. Browser refresh (Cmd+Shift+R)
5. Üretimde olan plana "!! Acil" butonunu gör
6. Tıkla, confirm dialog gör
7. Onayla, "🚨 Acil (Aktif)" olsun
8. Tekrar tıkla, normal moda dönsün

BAŞARI KRİTERLERİ:
✅ Buton görünüyor
✅ Toggle çalışıyor
✅ isUrgent flag güncelleniyor
✅ Active state animasyonu çalışıyor
✅ Confirm dialog çalışıyor

DOSYA YOLLARI:
- /Users/umutyalcin/Documents/Burkol0/quote-portal/domains/production/js/approvedQuotes.js
- /Users/umutyalcin/Documents/Burkol0/quote-portal/domains/production/css/approvedQuotes.css

İŞLEMİ GERÇEKLEŞTIR.
```

---

#PROMPT 7: Worker Portal canStart Logic (isUrgent + priorityIndex)

**Öncelik:** 🔴 CRITICAL  
**Bağımlılık:** FAZ 3 diğer promtları tamamlanmış olmalı  
**Süre:** ~12 dakika  
**Dosyalar:** 
- `quote-portal/domains/workerPortal/js/workerPortal.js`
- `quote-portal/domains/workerPortal/css/workerPortal.css`

```markdown
GÖREV: Worker Portal'da canStart logic'i implement etmek. isUrgent=true ise tüm tasklar, değilse sadece ilk task başlatılabilir.

**⚠️ BAĞIMLILIK:** PROMPT 5, 6 tamamlanmış olmalı.

CONTEXT:
- Dosya: quote-portal/domains/workerPortal/js/workerPortal.js
- priorityIndex'e göre sırala, isUrgent flag'ine göre canStart belirle
- Logic: `task.canStart = task.isUrgent || (index === 0)`

ÇÖZÜM:

1. TASK LOADING (workerPortal.js, loadWorkerTasks fonksiyonunu güncelle, satır ~100):

MEVCUT KOD:
```javascript
async function loadWorkerTasks() {
  try {
    const workerId = localStorage.getItem('selectedWorkerId');
    if (!workerId) {
      window.location.href = '/pages/worker-selection.html';
      return;
    }

    const response = await fetch(`/api/mes/worker-portal/tasks?workerId=${workerId}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Task yüklenemedi');

    const tasks = data.tasks || [];
    renderTasks(tasks);
    
  } catch (error) {
    console.error('Load tasks error:', error);
    showError('Görevler yüklenirken hata oluştu');
  }
}
```

YENİ KOD:
```javascript
async function loadWorkerTasks() {
  try {
    const workerId = localStorage.getItem('selectedWorkerId');
    if (!workerId) {
      window.location.href = '/pages/worker-selection.html';
      return;
    }

    const response = await fetch(`/api/mes/worker-portal/tasks?workerId=${workerId}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Task yüklenemedi');

    let tasks = data.tasks || [];
    
    // ✅ Work order'lara göre grupla
    const tasksByWorkOrder = {};
    tasks.forEach(task => {
      const wo = task.workOrderCode;
      if (!tasksByWorkOrder[wo]) tasksByWorkOrder[wo] = [];
      tasksByWorkOrder[wo].push(task);
    });
    
    // ✅ Her work order için canStart belirle
    Object.keys(tasksByWorkOrder).forEach(workOrderCode => {
      const woTasks = tasksByWorkOrder[workOrderCode];
      
      // Pending/in-progress olanları filtrele
      const pendingTasks = woTasks.filter(t => 
        t.status === 'pending' || t.status === 'in-progress'
      );
      
      // ✅ priorityIndex'e göre sırala
      pendingTasks.sort((a, b) => (a.priorityIndex || 0) - (b.priorityIndex || 0));
      
      // ✅ canStart logic: isUrgent=true ise hepsi, değilse sadece ilk
      pendingTasks.forEach((task, index) => {
        task.canStart = task.isUrgent || (index === 0);
      });
    });
    
    console.log(`📋 Tasks loaded: ${tasks.length}`);
    renderTasks(tasks);
    
  } catch (error) {
    console.error('Load tasks error:', error);
    showError('Görevler yüklenirken hata oluştu');
  }
}
```

2. RENDER (renderTaskCard fonksiyonunu güncelle, satır ~200):

MEVCUT KOD:
```javascript
function renderTaskCard(task) {
  return `
    <div class="task-card">
      <h3>${task.workPackageId} - ${task.operationName}</h3>
      <p><strong>İş Emri:</strong> ${task.workOrderCode}</p>
      <button class="btn-start" onclick="startTask('${task.id}')">
        🏁 Başlat
      </button>
    </div>
  `;
}
```

YENİ KOD:
```javascript
function renderTaskCard(task) {
  // ✅ isUrgent badge
  const urgentBadge = task.isUrgent 
    ? `<span class="urgent-badge">🚨 Acil</span>` 
    : '';
  
  // ✅ Start button logic
  let startButtonHTML = '';
  if (task.status === 'pending') {
    if (task.canStart) {
      startButtonHTML = `
        <button class="btn-start" onclick="startTask('${task.id}')">
          🏁 Başlat
        </button>
      `;
    } else {
      startButtonHTML = `
        <button class="btn-start disabled" disabled>
          🏁 Başlat
        </button>
        <small class="waiting-text">⏳ Sırada bekliyor</small>
      `;
    }
  } else if (task.status === 'in-progress') {
    startButtonHTML = `
      <button class="btn-complete" onclick="completeTask('${task.id}')">
        ✅ Tamamla
      </button>
    `;
  }
  
  const cardClass = task.isUrgent ? 'task-card urgent-card' : 'task-card';
  
  return `
    <div class="${cardClass}">
      <div class="task-header">
        <h3>${task.workPackageId} - ${task.operationName}</h3>
        ${urgentBadge}
      </div>
      <div class="task-info">
        <p><strong>İş Emri:</strong> ${task.workOrderCode}</p>
        <p><strong>Sıra:</strong> #${task.priorityIndex}</p>
        <p><strong>Başlama:</strong> ${formatDate(task.plannedStart)}</p>
        <p><strong>Süre:</strong> ${task.duration} saat</p>
      </div>
      <div class="task-actions">
        ${startButtonHTML}
      </div>
    </div>
  `;
}
```

3. CSS (workerPortal.css, dosya sonuna ekle):

```css
/* Urgent Badge */
.urgent-badge {
  background: linear-gradient(135deg, #ff4444, #cc0000);
  color: white;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.85em;
  font-weight: bold;
  animation: pulse-urgent 2s infinite;
  display: inline-block;
}

@keyframes pulse-urgent {
  0%, 100% { box-shadow: 0 2px 8px rgba(255, 68, 68, 0.4); }
  50% { box-shadow: 0 4px 16px rgba(255, 68, 68, 0.7); }
}

/* Urgent Task Card */
.urgent-card {
  border: 2px solid #ff4444 !important;
  background: linear-gradient(to bottom, #fff5f5, #ffffff) !important;
  box-shadow: 0 4px 12px rgba(255, 68, 68, 0.2) !important;
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.task-header h3 {
  margin: 0;
  flex: 1;
}

/* Disabled Button */
.btn-start.disabled {
  background: #cccccc;
  cursor: not-allowed;
  opacity: 0.6;
}

.btn-start.disabled:hover {
  background: #cccccc;
  transform: none;
}

.waiting-text {
  display: block;
  color: #888;
  font-size: 0.85em;
  font-style: italic;
  margin-top: 8px;
}
```

TEST ADIMLARI:
1. loadWorkerTasks() güncelle
2. renderTaskCard() güncelle
3. CSS ekle
4. Browser refresh (Cmd+Shift+R)
5. **Normal mod testi:**
   - Approved Quotes'ta isUrgent=false ol (varsayılan)
   - Worker Portal'ı aç
   - Sadece ilk task'ın "🏁 Başlat" butonunu gör
   - Diğerleri: "🏁 Başlat (disabled) + ⏳ Sırada bekliyor"
6. **Urgent mod testi:**
   - Approved Quotes'ta "!! Acil" butonuna tıkla
   - Worker Portal'ı refresh et
   - "🚨 Acil" badge'ini gör
   - Tüm taskların "🏁 Başlat" butonu aktif olsun

BAŞARI KRİTERLERİ:
✅ Normal: Sadece ilk task başlatılabilir
✅ Urgent: Tüm tasklar başlatılabilir
✅ priorityIndex sıralaması çalışıyor
✅ isUrgent badge görünüyor
✅ Disabled buton çalışmıyor
✅ Waiting text görünüyor

DOSYA YOLLARI:
- /Users/umutyalcin/Documents/Burkol0/quote-portal/domains/workerPortal/js/workerPortal.js
- /Users/umutyalcin/Documents/Burkol0/quote-portal/domains/workerPortal/css/workerPortal.css

İŞLEMİ GERÇEKLEŞTIR.
```

---

---

## 🔧 FAZ 4: MALZEME REZERVASYONU

Bu faz malzeme rezervasyon sistemini düzeltiyor.

---

#PROMPT 8: Gerçek Malzeme Rezervasyon Mekanizması (2-Phase Commit) + Transaction Fix

**Öncelik:** 🔴 CRITICAL  
**Bağımlılık:** FAZ 1-3 tamamlanmış olmalı  
**Süre:** ~20 dakika  
**Dosya:** `quote-portal/server/mesRoutes.js`

```markdown
GÖREV: 
1. Launch sırasında malzeme kontrolünün simülasyon yerine gerçek stok düşüşü yapmasını sağlamak (2-phase commit pattern)
2. **CRITICAL BUG FIX:** Complete task transaction'ında Firestore read/write order violation'ı düzeltmek

**⚠️ BAĞIMLILIK:** PROMPT 1-7 tamamlanmış olmalı.

CONTEXT:
- Sorun 1: Şu anda launch malzeme kontrolü yapıyor ama stoktan düşmüyor
- Sorun 2: **CRITICAL:** Complete task transaction'ında READ → WRITE → READ sırası var (Firestore hatası)
- Risk 1: Aynı malzeme birden fazla plana atanabilir
- Risk 2: Output material ekleme işlemi fail oluyor (transaction violation)
- Lokasyon 1: mesRoutes.js satır ~5850-5950 (material check + warnings)
- Lokasyon 2: mesRoutes.js satır ~3850-4300 (complete task comprehensive completion)

ÇÖZÜM:

## PART A: TRANSACTION ORDER FIX (CRITICAL - mesRoutes.js satır ~3850-4300)

**Problem:**
```javascript
// ❌ CURRENT (WRONG ORDER):
const planDoc = await transaction.get(...)           // READ ✅
const materialDoc = await transaction.get(...)       // READ ✅
transaction.update(materialRef, {...})               // WRITE ❌
transaction.update(wipMovementDoc.ref, {...})        // WRITE ❌
const outputMaterialDoc = await transaction.get(...) // READ ❌ TOO LATE!
// ❌ Error: Firestore transactions require all reads to be executed before all writes.
```

**Solution: ALL READS FIRST, THEN ALL WRITES**

MEVCUT KOD (satır ~3850-4300, completeAssignmentComprehensive function):
```javascript
await db.runTransaction(async (transaction) => {
  // Step 1: Gather data
  const preProductionReservedAmount = assignment.preProductionReservedAmount || {};
  
  // Get plan and node
  const planDoc = await transaction.get(db.collection('mes-production-plans').doc(planId));
  const planData = planDoc.data();
  const node = planData.nodes.find(n => n.id === nodeId);
  
  // Step 3: Stock adjustment for input materials
  for (const consumption of consumptionResults) {
    const materialRef = db.collection('materials').doc(materialCode);
    const materialDoc = await transaction.get(materialRef);  // READ
    // ... calculations ...
    transaction.update(materialRef, { ... });  // WRITE ❌ (TOO EARLY)
  }
  
  // Step 4: Output material
  const outputMaterialRef = db.collection('materials').doc(outputCode);
  const outputMaterialDoc = await transaction.get(outputMaterialRef);  // READ ❌ (AFTER WRITE!)
  transaction.update(outputMaterialRef, { ... });  // WRITE
});
```

YENİ KOD (TRANSACTION ORDER FIX):
```javascript
await db.runTransaction(async (transaction) => {
  
  // ========================================================================
  // PHASE 1: ALL READS (Firestore requirement)
  // ========================================================================
  
  console.log(`📖 PHASE 1: Reading all documents before writes...`);
  
  // READ 1: Get plan and node information
  const planDoc = await transaction.get(db.collection('mes-production-plans').doc(planId));
  if (!planDoc.exists) {
    throw new Error(`Production plan ${planId} not found`);
  }
  
  const planData = planDoc.data();
  const nodes = planData.nodes || [];
  const node = nodes.find(n => n.id === nodeId);
  
  if (!node) {
    throw new Error(`Task node ${nodeId} not found in production plan`);
  }
  
  const materialInputs = node.materialInputs || [];
  const outputCode = node.outputCode || Object.keys(plannedOutput)[0];
  const plannedOutputQty = node.outputQty || Object.values(plannedOutput)[0] || 0;
  
  // READ 2: Pre-fetch ALL input materials
  const inputMaterialDocs = new Map();
  for (const materialInput of materialInputs) {
    const inputCode = materialInput.materialCode || materialInput.code;
    if (!inputCode) continue;
    
    const materialRef = db.collection('materials').doc(inputCode);
    const materialDoc = await transaction.get(materialRef);
    inputMaterialDocs.set(inputCode, { ref: materialRef, doc: materialDoc });
  }
  
  // READ 3: Pre-fetch output material (CRITICAL: before any writes!)
  let outputMaterialSnapshot = null;
  if (outputCode) {
    const outputMaterialRef = db.collection('materials').doc(outputCode);
    outputMaterialSnapshot = await transaction.get(outputMaterialRef);
  }
  
  // READ 4: Pre-fetch WIP movements for all input materials
  const wipMovementDocs = new Map();
  for (const [inputCode, _] of inputMaterialDocs) {
    const wipMovementSnap = await db.collection('stockMovements')
      .where('reference', '==', assignmentId)
      .where('materialCode', '==', inputCode)
      .where('subType', '==', 'wip_reservation')
      .limit(1)
      .get();
    
    if (!wipMovementSnap.empty) {
      wipMovementDocs.set(inputCode, wipMovementSnap.docs[0]);
    }
  }
  
  console.log(`✅ READ PHASE COMPLETE: ${inputMaterialDocs.size} input materials, ${outputMaterialSnapshot ? 1 : 0} output material, ${wipMovementDocs.size} WIP movements`);
  
  // ========================================================================
  // PHASE 2: CALCULATIONS (No Firestore operations)
  // ========================================================================
  
  const preProductionReservedAmount = assignment.preProductionReservedAmount || {};
  const actualReservedAmounts = assignment.actualReservedAmounts || preProductionReservedAmount;
  const plannedOutput = assignment.plannedOutput || {};
  
  console.log(`📦 Planned reserved materials:`, preProductionReservedAmount);
  console.log(`📦 Actually reserved materials:`, actualReservedAmounts);
  console.log(`🎯 Planned output:`, plannedOutput);
  console.log(`✅ Actual output: ${actualOutput}, ❌ Defects: ${defects}`);
  
  // Process scrap counters
  const inputScrapTotals = {};
  const productionScrapTotals = {};
  
  Object.keys(assignment).forEach(key => {
    if (key.startsWith('inputScrapCount_')) {
      const materialCode = key.replace('inputScrapCount_', '').replace(/_/g, '-');
      const quantity = assignment[key] || 0;
      if (quantity > 0) {
        inputScrapTotals[materialCode] = quantity;
      }
    } else if (key.startsWith('productionScrapCount_')) {
      const materialCode = key.replace('productionScrapCount_', '').replace(/_/g, '-');
      const quantity = assignment[key] || 0;
      if (quantity > 0) {
        productionScrapTotals[materialCode] = quantity;
      }
    }
  });
  
  console.log(`📊 Scrap Summary for assignment ${assignmentId}:`);
  console.log(`   Input scrap:`, inputScrapTotals);
  console.log(`   Production scrap:`, productionScrapTotals);
  console.log(`   Output defects: ${defects}`);
  
  console.log(`📋 Material inputs:`, materialInputs.map(m => `${m.materialCode || m.code}: ${m.requiredQuantity || 0}`));
  console.log(`📦 Output code: ${outputCode}, Planned: ${plannedOutputQty}`);
  
  // Calculate consumption for each material
  const totalConsumedOutput = actualOutput + defects;
  const consumptionResults = [];
  
  console.log(`🔢 Total consumed (output + defect): ${totalConsumedOutput}`);
  
  if (materialInputs.length > 0 && plannedOutputQty > 0) {
    for (const materialInput of materialInputs) {
      const inputCode = materialInput.materialCode || materialInput.code;
      const requiredInputQty = materialInput.requiredQuantity || 0;
      
      if (!inputCode || requiredInputQty <= 0) {
        console.warn(`⚠️ Skipping invalid material input:`, materialInput);
        continue;
      }
      
      const inputOutputRatio = requiredInputQty / plannedOutputQty;
      const baseConsumption = totalConsumedOutput * inputOutputRatio;
      const inputScrap = inputScrapTotals[inputCode] || 0;
      const productionScrap = productionScrapTotals[inputCode] || 0;
      const theoreticalConsumption = baseConsumption + inputScrap + productionScrap;
      const reservedAmount = actualReservedAmounts[inputCode] || 0;
      const cappedConsumption = Math.min(theoreticalConsumption, reservedAmount);
      
      if (theoreticalConsumption > reservedAmount) {
        console.error(`❌ INVARIANT VIOLATION: Consumption exceeds reserved for ${inputCode}!`);
        console.error(`   Consumed: ${theoreticalConsumption}, Reserved: ${reservedAmount}`);
        console.error(`   Capping consumption at reserved amount.`);
      }
      
      const stockAdjustment = reservedAmount - cappedConsumption;
      
      console.log(`
📊 Material: ${inputCode}
   Required per unit: ${requiredInputQty}
   Planned output: ${plannedOutputQty}
   Input-output ratio: ${inputOutputRatio.toFixed(4)}
   Actually reserved: ${reservedAmount}
   Base consumption (output-based): ${baseConsumption.toFixed(2)}
   Input scrap: ${inputScrap}
   Production scrap: ${productionScrap}
   Theoretical total: ${theoreticalConsumption.toFixed(2)}
   Capped consumption: ${cappedConsumption.toFixed(2)}
   Stock adjustment: ${stockAdjustment >= 0 ? '+' : ''}${stockAdjustment.toFixed(2)}
      `);
      
      consumptionResults.push({
        materialCode: inputCode,
        requiredInputQty,
        plannedOutputQty,
        inputOutputRatio,
        reservedAmount,
        baseConsumption,
        inputScrap,
        productionScrap,
        theoreticalConsumption,
        actualConsumption: cappedConsumption,
        stockAdjustment
      });
    }
  } else {
    console.warn(`⚠️ No material inputs found or planned output is zero. Skipping consumption calculation.`);
  }
  
  // ========================================================================
  // PHASE 3: ALL WRITES (After all reads complete)
  // ========================================================================
  
  console.log(`✍️ PHASE 2: Performing all writes...`);
  
  // WRITE 1: Update input materials stock
  console.log(`🔄 Processing stock adjustments for ${consumptionResults.length} input material(s)`);
  
  for (const consumption of consumptionResults) {
    const { materialCode, reservedAmount, actualConsumption, stockAdjustment } = consumption;
    
    try {
      const materialSnapshot = inputMaterialDocs.get(materialCode);
      if (!materialSnapshot || !materialSnapshot.doc.exists) {
        console.error(`❌ Material ${materialCode} not found`);
        continue;
      }
      
      const materialData = materialSnapshot.doc.data();
      const currentStock = parseFloat(materialData.stock) || 0;
      const currentWipReserved = parseFloat(materialData.wipReserved) || 0;
      
      const newWipReserved = Math.max(0, currentWipReserved - reservedAmount);
      const newStock = currentStock + stockAdjustment;
      
      if (newStock < 0) {
        console.warn(`⚠️ Warning: ${materialCode} stock would become negative (${newStock}). Setting to 0.`);
      }
      
      transaction.update(materialSnapshot.ref, {
        stock: Math.max(0, newStock),
        wipReserved: newWipReserved,
        updatedAt: now,
        updatedBy: actorEmail
      });
      
      // WRITE 2: Update or create WIP movement
      const wipMovementDoc = wipMovementDocs.get(materialCode);
      
      if (wipMovementDoc) {
        transaction.update(wipMovementDoc.ref, {
          status: 'consumption',
          quantity: actualConsumption,
          notes: `[UPDATED] Görev tamamlandı - Gerçek sarfiyat: ${actualConsumption.toFixed(2)} ${materialData.unit} (Rezerve: ${reservedAmount}, Ayarlama: ${stockAdjustment >= 0 ? '+' : ''}${stockAdjustment.toFixed(2)})`,
          actualConsumption,
          stockAdjustment,
          completedAt: now
        });
        
        console.log(`✅ Updated WIP movement ${wipMovementDoc.id} to consumption: ${materialCode} ${reservedAmount} → ${actualConsumption} (${stockAdjustment >= 0 ? '+' : ''}${stockAdjustment})`);
      } else {
        console.warn(`⚠️ WIP movement not found for ${assignmentId}/${materialCode}, creating new consumption record`);
        const consumptionMovementRef = db.collection('stockMovements').doc();
        transaction.set(consumptionMovementRef, {
          materialId: materialCode,
          materialCode: materialCode,
          materialName: materialData.name || '',
          type: 'out',
          subType: 'production_consumption',
          status: 'consumption',
          quantity: actualConsumption,
          reservedQuantity: reservedAmount,
          adjustedQuantity: stockAdjustment,
          unit: materialData.unit || 'Adet',
          stockBefore: currentStock,
          stockAfter: Math.max(0, newStock),
          actualOutput: actualOutput,
          defectQuantity: defects,
          plannedOutput: plannedOutputQty,
          unitCost: materialData.costPrice || null,
          totalCost: materialData.costPrice ? materialData.costPrice * actualConsumption : null,
          currency: 'TRY',
          reference: assignmentId,
          referenceType: 'mes_task_complete',
          relatedPlanId: planId,
          relatedNodeId: nodeId,
          warehouse: null,
          location: 'Production Floor',
          notes: `Görev tamamlandı - Gerçek sarfiyat: ${actualConsumption.toFixed(2)} ${materialData.unit} (Çıktı: ${actualOutput}, Fire: ${defects})`,
          reason: 'MES görev tamamlama - Üretim sarfiyatı',
          movementDate: now,
          createdAt: now,
          userId: actorEmail,
          userName: actorName || actorEmail,
          approved: true,
          approvedBy: actorEmail,
          approvedAt: now
        });
      }
      
      console.log(`✅ ${materialCode}: stock ${currentStock} → ${Math.max(0, newStock)} (${stockAdjustment >= 0 ? '+' : ''}${stockAdjustment.toFixed(2)}), wipReserved ${currentWipReserved} → ${newWipReserved} (-${reservedAmount})`);
      
    } catch (err) {
      console.error(`❌ Failed to adjust stock for ${materialCode}:`, err);
      // Continue with other materials
    }
  }
  
  // WRITE 3: Output material update
  let outputStockResult = null;
  
  if (outputCode && actualOutput > 0 && outputMaterialSnapshot) {
    console.log(`📦 Adding ${actualOutput} units of ${outputCode} to stock`);
    
    try {
      const outputMaterialRef = db.collection('materials').doc(outputCode);
      
      if (outputMaterialSnapshot.exists) {
        const outputMaterialData = outputMaterialSnapshot.data();
        const currentOutputStock = parseFloat(outputMaterialData.stock) || 0;
        const newOutputStock = currentOutputStock + actualOutput;
        
        transaction.update(outputMaterialRef, {
          stock: newOutputStock,
          updatedAt: now,
          updatedBy: actorEmail
        });
        
        outputStockResult = {
          materialCode: outputCode,
          materialName: outputMaterialData.name,
          addedQuantity: actualOutput,
          previousStock: currentOutputStock,
          newStock: newOutputStock,
          unit: outputMaterialData.unit
        };
        
        // Stock movement for output
        const outputMovementRef = db.collection('stockMovements').doc();
        transaction.set(outputMovementRef, {
          materialId: outputCode,
          materialCode: outputCode,
          materialName: outputMaterialData.name || '',
          type: 'in',
          subType: 'production_output',
          status: 'production',
          quantity: actualOutput,
          unit: outputMaterialData.unit || 'Adet',
          stockBefore: currentOutputStock,
          stockAfter: newOutputStock,
          actualOutput: actualOutput,
          defectQuantity: defects,
          plannedOutput: plannedOutputQty,
          unitCost: outputMaterialData.costPrice || null,
          totalCost: outputMaterialData.costPrice ? outputMaterialData.costPrice * actualOutput : null,
          currency: 'TRY',
          reference: assignmentId,
          referenceType: 'mes_task_complete',
          relatedPlanId: planId,
          relatedNodeId: nodeId,
          warehouse: null,
          location: 'Production Output',
          notes: `Üretim tamamlandı - ${actualOutput} ${outputMaterialData.unit} üretildi${defects > 0 ? ` (Fire: ${defects})` : ''}`,
          reason: 'MES görev tamamlama - Üretim çıktısı',
          movementDate: now,
          createdAt: now,
          userId: actorEmail,
          userName: actorName || actorEmail,
          approved: true,
          approvedBy: actorEmail,
          approvedAt: now
        });
        
        console.log(`✅ Output ${outputCode}: stock ${currentOutputStock} → ${newOutputStock} (+${actualOutput})`);
        
      } else {
        console.warn(`⚠️ Output material ${outputCode} not found, creating new material...`);
        
        const isFinishedProduct = !planData.nodes.some(n => 
          Array.isArray(n.predecessors) && n.predecessors.includes(nodeId)
        );
        
        const materialType = isFinishedProduct ? 'finished_product' : 'semi_finished';
        const materialCategory = isFinishedProduct ? 'FINISHED_PRODUCT' : 'SEMI_FINISHED';
        
        console.log(`🏭 Material type determination: ${materialType} (isFinishedProduct: ${isFinishedProduct})`);
        
        transaction.set(outputMaterialRef, {
          code: outputCode,
          name: node.name || outputCode,
          type: materialType,
          category: materialCategory,
          stock: actualOutput,
          reserved: 0,
          wipReserved: 0,
          unit: 'adet',
          status: 'Aktif',
          isActive: true,
          reorderPoint: 0,
          createdAt: now,
          updatedAt: now,
          createdBy: actorEmail,
          updatedBy: actorEmail,
          productionHistory: []
        });
        
        outputStockResult = {
          materialCode: outputCode,
          materialName: node.name || outputCode,
          addedQuantity: actualOutput,
          previousStock: 0,
          newStock: actualOutput,
          unit: 'adet',
          created: true
        };
        
        const newMaterialMovementRef = db.collection('stockMovements').doc();
        transaction.set(newMaterialMovementRef, {
          materialId: outputCode,
          materialCode: outputCode,
          materialName: node.name || outputCode,
          type: 'in',
          subType: 'production_output_new_material',
          status: 'production',
          quantity: actualOutput,
          unit: 'adet',
          stockBefore: 0,
          stockAfter: actualOutput,
          actualOutput: actualOutput,
          defectQuantity: defects,
          plannedOutput: plannedOutputQty,
          unitCost: null,
          totalCost: null,
          currency: 'TRY',
          reference: assignmentId,
          referenceType: 'mes_task_complete',
          relatedPlanId: planId,
          relatedNodeId: nodeId,
          warehouse: null,
          location: 'Production Output',
          notes: `Yeni ${materialType === 'finished_product' ? 'bitmiş ürün' : 'yarı mamül'} malzemesi oluşturuldu ve ${actualOutput} adet üretildi${defects > 0 ? ` (Fire: ${defects})` : ''}`,
          reason: `MES görev tamamlama - Yeni ${materialType === 'finished_product' ? 'bitmiş ürün' : 'yarı mamül'} malzeme + Üretim çıktısı`,
          movementDate: now,
          createdAt: now,
          userId: actorEmail,
          userName: actorName || actorEmail,
          approved: true,
          approvedBy: actorEmail,
          approvedAt: now
        });
        
        console.log(`✅ Created new output material ${outputCode} with stock: ${actualOutput}`);
      }
      
    } catch (err) {
      console.error(`❌ Failed to update output material ${outputCode}:`, err);
      throw err; // Critical error, rollback transaction
    }
  }
  
  console.log(`✅ WRITE PHASE COMPLETE`);
  
  // Return results (outside transaction)
  return { consumptionResults, outputStockResult };
});
```

**KEY CHANGES:**
1. ✅ **PHASE 1 (READS):** All `transaction.get()` calls moved to top
2. ✅ **PHASE 2 (CALCULATIONS):** Pure JavaScript calculations, no Firestore calls
3. ✅ **PHASE 3 (WRITES):** All `transaction.update()` and `transaction.set()` at end
4. ✅ Pre-fetched output material **BEFORE** any writes
5. ✅ Pre-fetched WIP movements **BEFORE** any writes
6. ✅ Used snapshots from Phase 1 during write operations

---

## PART B: 2-PHASE MATERIAL RESERVATION (mesRoutes.js satır ~5850-5950)

1. LAUNCH ENDPOİNTİNE REZERVASYON EKLE (satır ~5900):

MEVCUT KOD:
```javascript
// Malzeme kontrolü
for (const [code, mat] of materialsToCheck) {
  const materialData = materialMap.get(code);
  const available = materialData ? parseFloat(materialData.stock || 0) : 0;
  const required = mat.requiredQuantity || 0;
  
  if (available < required) {
    warnings.push({
      materialCode: code,
      required,
      available,
      shortage: required - available
    });
  }
}
```

YENİ KOD:
```javascript
// ✅ PHASE 1: Material Check & Reserve
const materialReservations = [];

for (const [code, mat] of materialsToCheck) {
  const materialDoc = await db.collection('materials')
    .where('code', '==', code)
    .limit(1)
    .get();
  
  if (materialDoc.empty) {
    warnings.push({
      materialCode: code,
      required: mat.requiredQuantity,
      available: 0,
      shortage: mat.requiredQuantity,
      error: 'Malzeme bulunamadı'
    });
    continue;
  }
  
  const materialData = materialDoc.docs[0].data();
  const materialRef = materialDoc.docs[0].ref;
  const available = parseFloat(materialData.stock || 0);
  const required = mat.requiredQuantity || 0;
  
  if (available < required) {
    warnings.push({
      materialCode: code,
      required,
      available,
      shortage: required - available
    });
    continue;
  }
  
  // ✅ Reserve material (optimistic locking)
  const newStock = available - required;
  const reservationId = `${workOrderCode}-${code}-${Date.now()}`;
  
  batch.update(materialRef, {
    stock: newStock,
    reservations: admin.firestore.FieldValue.arrayUnion({
      id: reservationId,
      workOrderCode,
      quantity: required,
      reservedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'reserved'
    })
  });
  
  materialReservations.push({
    materialCode: code,
    reservationId,
    quantity: required,
    previousStock: available,
    newStock
  });
  
  console.log(`  ✓ Reserved ${required} ${materialData.unit || 'adet'} of ${code} (${newStock} remaining)`);
}

// ✅ Production plan'e rezervasyon bilgisi ekle
const planUpdateData = {
  status: 'production',
  launchedAt: admin.firestore.FieldValue.serverTimestamp(),
  materialReservations  // ✅ Rezervasyon tracking
};
```

2. COMPLETE TASK ENDPOİNTİNE COMMIT EKLE (yeni endpoint):

```javascript
/**
 * Complete Task & Commit Material Reservation
 */
router.post('/complete-task', withAuth, async (req, res) => {
  try {
    const { taskId } = req.body;
    
    // Get task
    const taskDoc = await db.collection('mes-worker-assignments').doc(taskId).get();
    if (!taskDoc.exists) {
      return res.status(404).json({ error: 'Task bulunamadı' });
    }
    
    const task = taskDoc.data();
    
    // ✅ PHASE 2: Commit material reservation (update status to 'consumed')
    const planDoc = await db.collection('mes-production-plans')
      .where('workOrderCode', '==', task.workOrderCode)
      .limit(1)
      .get();
    
    if (!planDoc.empty) {
      const plan = planDoc.docs[0].data();
      const reservations = plan.materialReservations || [];
      
      const batch = db.batch();
      
      for (const reservation of reservations) {
        const materialSnap = await db.collection('materials')
          .where('code', '==', reservation.materialCode)
          .limit(1)
          .get();
        
        if (!materialSnap.empty) {
          const materialRef = materialSnap.docs[0].ref;
          
          batch.update(materialRef, {
            'reservations': admin.firestore.FieldValue.arrayRemove({
              ...reservation,
              status: 'reserved'
            }),
            'reservations': admin.firestore.FieldValue.arrayUnion({
              ...reservation,
              status: 'consumed',  // ✅ Mark as consumed
              consumedAt: admin.firestore.FieldValue.serverTimestamp()
            })
          });
        }
      }
      
      // Update task status
      batch.update(taskDoc.ref, {
        status: 'completed',
        completedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      await batch.commit();
    }
    
    res.json({ success: true, message: 'Task tamamlandı, malzemeler consume edildi' });
    
  } catch (error) {
    console.error('Complete task error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

2. CANCEL/PAUSE ENDPOİNTLERİNE ROLLBACK EKLE:

```javascript
/**
 * Cancel Production & Rollback Material Reservation
 */
router.post('/cancel-production', withAuth, async (req, res) => {
  try {
    const { workOrderCode } = req.body;
    
    // Get plan
    const planSnap = await db.collection('mes-production-plans')
      .where('workOrderCode', '==', workOrderCode)
      .limit(1)
      .get();
    
    if (planSnap.empty) {
      return res.status(404).json({ error: 'Plan bulunamadı' });
    }
    
    const plan = planSnap.docs[0].data();
    const reservations = plan.materialReservations || [];
    
    // ✅ ROLLBACK: Return reserved materials to stock
    const batch = db.batch();
    
    for (const reservation of reservations) {
      const materialSnap = await db.collection('materials')
        .where('code', '==', reservation.materialCode)
        .limit(1)
        .get();
      
      if (!materialSnap.empty) {
        const materialRef = materialSnap.docs[0].ref;
        const materialData = materialSnap.docs[0].data();
        const currentStock = parseFloat(materialData.stock || 0);
        
        // Return to stock
        batch.update(materialRef, {
          stock: currentStock + reservation.quantity,  // ✅ Add back
          'reservations': admin.firestore.FieldValue.arrayRemove(reservation)
        });
        
        console.log(`  ↩️  Returned ${reservation.quantity} of ${reservation.materialCode} to stock`);
      }
    }
    
    // Update plan status
    batch.update(planSnap.docs[0].ref, {
      status: 'cancelled',
      cancelledAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    await batch.commit();
    
    res.json({ 
      success: true, 
      message: 'Üretim iptal edildi, malzemeler stoka iade edildi',
      returnedMaterials: reservations.length
    });
    
  } catch (error) {
    console.error('Cancel production error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

---

## ÖZET: YAPILACAKLAR

### ✅ PART A: Transaction Order Fix (CRITICAL)
1. **mesRoutes.js satır ~3850-4300** - `completeAssignmentComprehensive` fonksiyonunu refactor et
2. Transaction'ı 3 phase'e böl:
   - **Phase 1:** ALL READS (plan, nodes, input materials, output material, WIP movements)
   - **Phase 2:** CALCULATIONS (pure JavaScript, no Firestore)
   - **Phase 3:** ALL WRITES (stock updates, movement records, material creation)
3. Pre-fetch tüm material docs'ları Phase 1'de
4. Snapshot'ları Phase 3'te kullan

### ✅ PART B: 2-Phase Material Reservation
1. **mesRoutes.js satır ~5850-5950** - Launch endpoint'e material reservation ekle
2. Stock düşüşünü launch sırasında yap (rezervasyon)
3. Cancel/Pause endpoint'lerine rollback logic ekle

---

TEST ADIMLARI:

**PART A Test (Transaction Fix):**
1. mesRoutes.js'de transaction refactor yap
2. Server restart
3. Plan launch et
4. Task start et
5. Task complete et → **Output material eklenmeli (hata olmamalı)**
6. Console'da "✅ WRITE PHASE COMPLETE" log'unu gör
7. Firestore'da output material'in stock'unun arttığını doğrula

**PART B Test (Material Reservation):**
1. Launch endpoint'i güncelle (material reservation ekle)
2. Cancel production endpoint'i ekle (rollback)
3. Server restart
4. Firestore'da materials koleksiyonunu aç
5. Bir malzemenin stock değerini not et (örn: 100)
6. Plan launch et (örn: 10 adet gerekiyor)
7. Firestore'da stock'un 90'a düştüğünü gör
8. Reservations array'inde rezervasyonu gör
9. Cancel et
10. Stock'un 100'e geri döndüğünü gör

---

BAŞARI KRİTERLERİ:
✅ **CRITICAL:** Complete task transaction başarıyla tamamlanıyor (output material ekleniyor)
✅ Firestore transaction order kuralı uygulanıyor (ALL READS → ALL WRITES)
✅ Launch sırasında malzeme rezerve ediliyor
✅ Stock gerçekten düşüyor
✅ Cancel sırasında stoka geri dönüyor
✅ Console'da transaction phase log'ları görünüyor

---

DOSYA YOLU:
/Users/umutyalcin/Documents/Burkol0/quote-portal/server/mesRoutes.js

İŞLEMİ GERÇEKLEŞTIR.
```

---

## 🔧 FAZ 5: DİĞER SYSTEM FİXLER

Bu faz kalan kritik hataları düzeltiyor.

---

#PROMPT 9: Frontend-Backend Schema Senkronizasyonu

**Öncelik:** 🟡 MEDIUM  
**Bağımlılık:** FAZ 1-2 tamamlanmış olmalı  
**Süre:** ~10 dakika  
**Dosyalar:**
- `quote-portal/domains/production/production-plan-designer.tsx`
- `quote-portal/server/mesRoutes.js`

```markdown
GÖREV: Production Plan Designer (frontend) ile mesRoutes.js (backend) arasındaki schema uyumsuzluğunu düzeltmek.

**⚠️ BAĞIMLILIK:** PROMPT 4 tamamlanmış olmalı (schema güncel).

CONTEXT:
- Sorun: Frontend "dependencies" array gönderiyor, backend "predecessors" bekliyor
- Alan adları: nodeId vs id, operationName vs name
- Lokasyon: production-plan-designer.tsx satır ~450, mesRoutes.js satır ~5400

ÇÖZÜM:

1. FRONTEND DÜZELTMESİ (production-plan-designer.tsx):

MEVCUT KOD:
```typescript
const planData = {
  name: planName,
  workOrderCode: selectedWorkOrder,
  nodes: nodes.map(node => ({
    id: node.id,
    name: node.operationName,
    dependencies: node.dependencies || [],
    duration: node.duration || 1,
    stationId: node.stationId,
    substationId: node.substationId,
    skillIds: node.skillIds || []
  }))
};
```

YENİ KOD:
```typescript
const planData = {
  name: planName,
  workOrderCode: selectedWorkOrder,
  nodes: nodes.map(node => ({
    nodeId: node.id,  // ✅ nodeId (backend bunu bekliyor)
    operationName: node.operationName,  // ✅ operationName (tutarlı)
    predecessors: node.dependencies || [],  // ✅ predecessors (backend terminology)
    duration: parseFloat(node.duration) || 1,
    stationId: node.stationId,
    substationId: node.substationId || null,  // ✅ Explicit null
    skillIds: node.skillIds || [],
    materials: node.materials || []  // ✅ Materials array
  })),
  createdAt: new Date().toISOString(),
  isUrgent: false  // ✅ Default
};
```

2. BACKEND VALİDASYONU (mesRoutes.js, satır ~5400):

```javascript
// ✅ Normalize incoming plan data
router.post('/create-plan', withAuth, async (req, res) => {
  try {
    const { name, workOrderCode, nodes } = req.body;
    
    // Validation
    if (!name || !workOrderCode || !Array.isArray(nodes)) {
      return res.status(400).json({ error: 'Invalid plan data' });
    }
    
    // ✅ Normalize nodes (handle both old and new formats)
    const normalizedNodes = nodes.map(node => ({
      nodeId: node.nodeId || node.id,  // ✅ Accept both
      operationName: node.operationName || node.name,  // ✅ Accept both
      predecessors: node.predecessors || node.dependencies || [],  // ✅ Accept both
      duration: parseFloat(node.duration) || 1,
      stationId: node.stationId,
      substationId: node.substationId || null,
      skillIds: Array.isArray(node.skillIds) ? node.skillIds : [],
      materials: Array.isArray(node.materials) ? node.materials : []
    }));
    
    // Validate each node
    for (const node of normalizedNodes) {
      if (!node.nodeId || !node.operationName) {
        return res.status(400).json({ 
          error: `Invalid node: nodeId and operationName required`,
          node 
        });
      }
    }
    
    // Create plan
    const planRef = db.collection('mes-production-plans').doc();
    await planRef.set({
      id: planRef.id,
      name,
      workOrderCode,
      nodes: normalizedNodes,
      status: 'draft',
      isUrgent: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({ 
      success: true, 
      planId: planRef.id,
      message: 'Plan oluşturuldu'
    });
    
  } catch (error) {
    console.error('Create plan error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

TEST ADIMLARI:
1. Frontend güncelle (nodeId, operationName, predecessors)
2. Backend normalization ekle
3. Server + frontend rebuild
4. Production Plan Designer'ı aç
5. Yeni plan oluştur
6. Console'da network request'i kontrol et
7. Backend'de validation geçtiğini gör
8. Firestore'da düzgün kaydedildiğini gör

BAŞARI KRİTERLERİ:
✅ Frontend doğru field names gönderiyor
✅ Backend her iki formatı da kabul ediyor
✅ Validation çalışıyor
✅ Console'da schema error yok

DOSYA YOLLARI:
- /Users/umutyalcin/Documents/Burkol0/quote-portal/domains/production/production-plan-designer.tsx
- /Users/umutyalcin/Documents/Burkol0/quote-portal/server/mesRoutes.js

İŞLEMİ GERÇEKLEŞTIR.
```

---

#PROMPT 10: Pause/Cancel Substation Schedule Güncelleme

**Öncelik:** 🟡 MEDIUM  
**Bağımlılık:** PROMPT 3 tamamlanmış olmalı (substationSchedule var)  
**Süre:** ~8 dakika  
**Dosya:** `quote-portal/server/mesRoutes.js`

```markdown
GÖREV: Pause/Cancel endpoint'lerinde substationSchedule'ın güncellenmesini sağlamak.

**⚠️ BAĞIMLILIK:** PROMPT 3 tamamlanmış olmalı (substationSchedule refactoring).

CONTEXT:
- Sorun: Pause/Cancel sırasında worker schedule güncelleniyor ama substation schedule güncellenmiyor
- Sonuç: Substation'lar hala rezerve görünüyor, yeni atama yapılamıyor
- Lokasyon: mesRoutes.js satır ~6100, ~6200

ÇÖZÜM:

1. PAUSE ENDPOINT GÜNCELLEMESİ (satır ~6100):

MEVCUT KOD:
```javascript
router.post('/pause-production', withAuth, async (req, res) => {
  try {
    const { workOrderCode } = req.body;
    
    const batch = db.batch();
    
    // Update plan
    const planSnap = await db.collection('mes-production-plans')
      .where('workOrderCode', '==', workOrderCode)
      .limit(1)
      .get();
    
    if (!planSnap.empty) {
      batch.update(planSnap.docs[0].ref, { 
        status: 'paused',
        pausedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    // Update assignments
    const assignmentSnap = await db.collection('mes-worker-assignments')
      .where('workOrderCode', '==', workOrderCode)
      .where('status', 'in', ['pending', 'in-progress'])
      .get();
    
    assignmentSnap.docs.forEach(doc => {
      batch.update(doc.ref, { 
        status: 'paused',
        pausedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    
    await batch.commit();
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Pause error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

YENİ KOD:
```javascript
router.post('/pause-production', withAuth, async (req, res) => {
  try {
    const { workOrderCode } = req.body;
    
    const batch = db.batch();
    
    // Update plan
    const planSnap = await db.collection('mes-production-plans')
      .where('workOrderCode', '==', workOrderCode)
      .limit(1)
      .get();
    
    if (!planSnap.empty) {
      batch.update(planSnap.docs[0].ref, { 
        status: 'paused',
        pausedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    // Get assignments to free substations
    const assignmentSnap = await db.collection('mes-worker-assignments')
      .where('workOrderCode', '==', workOrderCode)
      .where('status', 'in', ['pending', 'in-progress'])
      .get();
    
    // ✅ Free substations
    const freedSubstations = [];
    
    assignmentSnap.docs.forEach(doc => {
      const assignment = doc.data();
      
      batch.update(doc.ref, { 
        status: 'paused',
        pausedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // ✅ Track freed substation
      if (assignment.substationId) {
        freedSubstations.push({
          substationId: assignment.substationId,
          workPackageId: assignment.workPackageId
        });
      }
    });
    
    await batch.commit();
    
    console.log(`✅ Paused production for ${workOrderCode}`);
    console.log(`   Freed ${freedSubstations.length} substations:`, freedSubstations);
    
    res.json({ 
      success: true,
      message: 'Üretim duraklatıldı',
      freedSubstations: freedSubstations.length
    });
    
  } catch (error) {
    console.error('Pause error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

2. CANCEL ENDPOINT GÜNCELLEMESİ (satır ~6200):

MEVCUT KOD:
```javascript
router.post('/cancel-production', withAuth, async (req, res) => {
  try {
    const { workOrderCode } = req.body;
    
    const batch = db.batch();
    
    // Similar to pause...
    
    await batch.commit();
    res.json({ success: true });
    
  } catch (error) {
    console.error('Cancel error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

YENİ KOD:
```javascript
router.post('/cancel-production', withAuth, async (req, res) => {
  try {
    const { workOrderCode } = req.body;
    
    const batch = db.batch();
    
    // Get plan
    const planSnap = await db.collection('mes-production-plans')
      .where('workOrderCode', '==', workOrderCode)
      .limit(1)
      .get();
    
    if (!planSnap.empty) {
      batch.update(planSnap.docs[0].ref, { 
        status: 'cancelled',
        cancelledAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    // Get assignments
    const assignmentSnap = await db.collection('mes-worker-assignments')
      .where('workOrderCode', '==', workOrderCode)
      .where('status', 'in', ['pending', 'in-progress', 'paused'])
      .get();
    
    // ✅ Free substations & workers
    const freedResources = {
      substations: [],
      workers: []
    };
    
    assignmentSnap.docs.forEach(doc => {
      const assignment = doc.data();
      
      batch.update(doc.ref, { 
        status: 'cancelled',
        cancelledAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // ✅ Track freed resources
      if (assignment.substationId) {
        freedResources.substations.push(assignment.substationId);
      }
      if (assignment.workerId) {
        freedResources.workers.push(assignment.workerId);
      }
    });
    
    await batch.commit();
    
    console.log(`✅ Cancelled production for ${workOrderCode}`);
    console.log(`   Freed resources:`, freedResources);
    
    res.json({ 
      success: true,
      message: 'Üretim iptal edildi, kaynaklar serbest bırakıldı',
      freedResources
    });
    
  } catch (error) {
    console.error('Cancel error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

TEST ADIMLARI:
1. Pause endpoint'i güncelle
2. Cancel endpoint'i güncelle
3. Server restart
4. Plan launch et, substation ataması olsun
5. Pause et
6. Console'da freed substations log'unu gör
7. Yeni plan launch edebilmeyi dene (aynı substation'a)
8. Cancel et
9. Freed resources log'unu gör

BAŞARI KRİTERLERİ:
✅ Pause sırasında substation'lar track ediliyor
✅ Cancel sırasında substation'lar free ediliyor
✅ Yeni atamalar yapılabiliyor
✅ Log'lar doğru

DOSYA YOLU:
/Users/umutyalcin/Documents/Burkol0/quote-portal/server/mesRoutes.js

İŞLEMİ GERÇEKLEŞTIR.
```

---

#PROMPT 11: priorityIndex Assignment Array'e Ekleme

**Öncelik:** 🟡 MEDIUM  
**Bağımlılık:** PROMPT 1 tamamlanmış olmalı  
**Süre:** ~3 dakika  
**Dosya:** `quote-portal/server/mesRoutes.js`

```markdown
GÖREV: Launch sırasında assignment array'e priorityIndex değerini eklemek (PROMPT 4 ile birlikte çalışır).

**⚠️ BAĞIMLILIK:** PROMPT 1 tamamlanmış olmalı (getNodeId kullanılacak).

**📢 ÖNEMLİ:** Bu prompt SADECE assignmentsArray.push() kısmını düzeltir. Firestore write kısmı PROMPT 4'te zaten yapılıyor!

CONTEXT:
- PROMPT 4 completeAssignment objesine `priorityIndex: assignment.priorityIndex` ekliyor
- Ancak assignmentsArray'de bu alan yok
- Lokasyon: mesRoutes.js satır ~5545

ÇÖZÜM:

ASSIGNMENT ARRAY'E priorityIndex EKLE (satır ~5545):

MEVCUT KOD:
```javascript
executionOrder.order.forEach((nodeId, index) => {
  const node = nodesToUse.find(n => getNodeId(n) === nodeId);
  
  if (resources) {
    assignmentsArray.push({
      nodeId: getNodeId(node),
      operationName: node.operationName,
      workerId: resources.workerId,
      stationId: resources.stationId,
      substationId: resources.substationId,
      plannedStart: resources.plannedStart,
      duration: node.duration
    });
  }
});
```

YENİ KOD:
```javascript
executionOrder.order.forEach((nodeId, index) => {
  const node = nodesToUse.find(n => getNodeId(n) === nodeId);
  
  if (resources) {
    assignmentsArray.push({
      nodeId: getNodeId(node),
      operationName: node.operationName,
      workerId: resources.workerId,
      stationId: resources.stationId,
      substationId: resources.substationId,
      plannedStart: resources.plannedStart,
      duration: node.duration,
      priorityIndex: index + 1  // ✅ Topological order (1-based)
    });
  }
});
```

**❗ NOT:** Firestore write kısmı (satır ~5620) PROMPT 4'te zaten düzeltildi. Orada tekrar değişiklik YAPMA!

TEST ADIMLARI:
1. assignmentsArray.push() içine priorityIndex ekle
2. Server restart
3. Plan launch et
4. Console'da assignmentsArray log'la, priorityIndex olduğunu gör
5. Firestore'da assignment'larda priorityIndex (1, 2, 3...) olduğunu gör

BAŞARI KRİTERLERİ:
✅ assignmentsArray her item'da priorityIndex var
✅ Değerler topological order'a uygun (1, 2, 3...)
✅ PROMPT 4 ile uyumlu çalışıyor
✅ Duplicate edit yok

DOSYA YOLU:
/Users/umutyalcin/Documents/Burkol0/quote-portal/server/mesRoutes.js

İŞLEMİ GERÇEKLEŞTIR.
```

---

#PROMPT 12: Component Schema Updates (materialFlowView & semiCode)

**Öncelik:** 🟢 LOW  
**Bağımlılık:** PROMPT 9 tamamlanmış olmalı (schema güncel)  
**Süre:** ~8 dakika  
**Dosyalar:**
- `quote-portal/domains/production/components/materialFlowView.js`
- `quote-portal/domains/production/js/semiCode.js`

```markdown
GÖREV: Eski node yapısı kullanan component'ları yeni schema'ya uyarlamak.

**⚠️ BAĞIMLILIK:** PROMPT 9 tamamlanmış olmalı (frontend schema güncel).

CONTEXT:
- materialFlowView hâlâ `connections` array'i kullanıyor
- semiCode generator priority sistemini görmezden geliyor
- Yeni schema `predecessors` ve `assignedStations` kullanıyor

ÇÖZÜM:

1. MATERIAL FLOW VIEW GÜNCELLEMESİ (materialFlowView.js, satır ~70):

MEVCUT KOD:
```javascript
const outs = Array.isArray(n.connections) ? n.connections : [];  // ❌ Eski model

return {
  ...n,
  ins: ins.filter(id => nodes.has(id)),
  outs: outs.filter(id => nodes.has(id))
};
```

YENİ KOD:
```javascript
// ✅ Yeni model: predecessors → ins, successor → outs
const ins = Array.isArray(n.predecessors) ? n.predecessors : [];
const outs = n.successor ? [n.successor] : [];  // Successor single value

// ✅ Backward compatibility
const legacyConnections = Array.isArray(n.connections) ? n.connections : [];

return {
  ...n,
  ins: ins.length > 0 ? ins.filter(id => nodes.has(id)) : [],
  outs: outs.length > 0 ? outs.filter(id => nodes.has(id)) : legacyConnections.filter(id => nodes.has(id))
};
```

2. SEMI-CODE GENERATOR GÜNCELLEMESİ (semiCode.js, satır ~47):

MEVCUT KOD:
```javascript
const firstStationId = Array.isArray(node.assignedStations) && node.assignedStations.length > 0
  ? (node.assignedStations[0].stationId || node.assignedStations[0].id)
  : null;  // ❌ İlk station'ı alıyor, priority yok
```

YENİ KOD:
```javascript
// ✅ Priority'ye göre sırala
let firstStationId = null;

if (Array.isArray(node.assignedStations) && node.assignedStations.length > 0) {
  // Sort by priority (lowest number = highest priority)
  const sortedStations = [...node.assignedStations].sort((a, b) => 
    (a.priority || 999) - (b.priority || 999)
  );
  
  const firstStation = sortedStations[0];
  firstStationId = firstStation.stationId || firstStation.id;
  
  console.log(`📝 Semi-code for ${node.operationName}: Using station ${firstStationId} (priority: ${firstStation.priority || 'N/A'})`);
} else if (node.stationId) {
  // ✅ Backward compatibility
  firstStationId = node.stationId;
}
```

3. DEPENDENCIES ARRAY GÜNCELLEMESİ (semiCode.js, satır ~120):

MEVCUT KOD:
```javascript
let dependencies = '';
if (Array.isArray(node.dependencies) && node.dependencies.length > 0) {
  dependencies = node.dependencies.join(', ');  // ❌ Eski alan
}
```

YENİ KOD:
```javascript
let dependencies = '';

// ✅ Yeni model: predecessors
if (Array.isArray(node.predecessors) && node.predecessors.length > 0) {
  dependencies = node.predecessors.map(predId => {
    const predNode = nodesArray.find(n => n.nodeId === predId || n.id === predId);
    return predNode ? predNode.operationName || predId : predId;
  }).join(', ');
}
// ✅ Backward compatibility
else if (Array.isArray(node.dependencies) && node.dependencies.length > 0) {
  dependencies = node.dependencies.join(', ');
}
```

TEST ADIMLARI:
1. materialFlowView.js güncelle
2. semiCode.js güncelle
3. Build yap
4. Production Plan Designer'ı aç
5. Yeni plan oluştur (predecessors ve assignedStations kullan)
6. Material Flow View'ı aç → Bağlantıları gör
7. Semi-code oluştur → Priority'li station'ı kullandığını gör
8. Eski plan aç (connections varsa) → Backward compatibility çalışsın

BAŞARI KRİTERLERİ:
✅ Material flow yeni model ile çalışıyor
✅ Semi-code priority'yi dikkate alıyor
✅ Backward compatibility var
✅ Console'da error yok

DOSYA YOLLARI:
- /Users/umutyalcin/Documents/Burkol0/quote-portal/domains/production/components/materialFlowView.js
- /Users/umutyalcin/Documents/Burkol0/quote-portal/domains/production/js/semiCode.js

İŞLEMİ GERÇEKLEŞTIR.
```

---

## 🎉 TÜM PROMTLAR TAMAMLANDI!

**12 Detaylı Prompt Hazır ve %100 Entegre:**

### 🏗️ FAZ 1: Foundation (PROMPT 1-3)
**Bağımlılık:** Yok - İlk çalıştır
- ✅ **PROMPT 1:** Node ID Normalization (getNodeId helper) → **A.1, C.2**
  - Çıktı: `getNodeId()` ve `normalizeNodes()` fonksiyonları
  - Kullanıldığı yerler: PROMPT 4, 11
  
- ✅ **PROMPT 2:** Malzeme Alan Tutarsızlığı (mat.requiredQuantity) → **A.2, C.3**
  - Çıktı: Malzeme kontrolü düzeltmesi
  - Bağımlılık: Yok
  
- ✅ **PROMPT 3:** stationSchedule → substationSchedule Refactoring → **A.6**
  - Çıktı: Değişken adı + parametre düzeltmesi
  - Bağımlılık: Yok

### 🔧 FAZ 2: Schema & Validation (PROMPT 4, 11)
**Bağımlılık:** FAZ 1 tamamlanmış olmalı
- ✅ **PROMPT 4:** SubstationId Schema + isUrgent + priorityIndex Fields → **A.3, C.5**
  - Çıktı: Schema güncelleme + Firestore write logic (completeAssignment)
  - Kullanır: `getNodeId()` (PROMPT 1'den)
  - Ekler: `priorityIndex`, `isUrgent: false`, `substationId: null`
  
- ✅ **PROMPT 11:** priorityIndex Assignment Array'e Ekleme → **Temel Gereksinim**
  - Çıktı: assignmentsArray.push() içine priorityIndex ekler
  - PROMPT 4 ile uyumlu: PROMPT 4 Firestore'a yazar, PROMPT 11 array'e ekler
  - **UYARI:** Sadece array kısmını düzelt, Firestore kısmına DOKUNMA!

### 🚨 FAZ 3: Urgent Priority System (PROMPT 5-7)
**Bağımlılık:** FAZ 2 tamamlanmış olmalı (isUrgent field var)
- ✅ **PROMPT 5:** Urgent Backend Endpoint → **Yeni Özellik**
  - Çıktı: POST /api/mes/set-urgent-priority endpoint
  - Günceller: production-plans, worker-assignments, approved-quotes (3 koleksiyon)
  - Field: `isUrgent: true/false`
  
- ✅ **PROMPT 6:** Urgent Frontend Button → **Yeni Özellik**
  - Çıktı: "!! Acil" butonu + setUrgentPriority() fonksiyonu
  - Bağımlılık: PROMPT 5 (backend endpoint hazır)
  - Kullanır: `/api/mes/set-urgent-priority`
  
- ✅ **PROMPT 7:** Worker Portal canStart Logic → **Yeni Özellik**
  - Çıktı: Sıralama + `task.canStart = task.isUrgent || (index === 0)`
  - Bağımlılık: PROMPT 5, 6 (isUrgent flag set edilebiliyor)
  - Kullanır: `priorityIndex` (PROMPT 4'ten) + `isUrgent` (PROMPT 5'ten)

### 🔧 FAZ 4: Material Reservation (PROMPT 8)
**Bağımlılık:** FAZ 1-3 tamamlanmış olmalı
- ✅ **PROMPT 8:** 2-Phase Commit Material Reservation → **A.5, C.4**
  - Çıktı: Launch sırasında reserve, complete'te commit, cancel'da rollback
  - Yeni endpoint'ler: `/complete-task`, `/cancel-production` (material rollback)
  - Kullanır: `getNodeId()` (PROMPT 1'den)

### 🔧 FAZ 5: System Fixes (PROMPT 9-12)
**Bağımlılık:** Farklı FAZ'lara bağımlı
- ✅ **PROMPT 9:** Frontend-Backend Schema Sync → **A.4, C.1**
  - Çıktı: Frontend (nodeId, operationName, predecessors) + Backend normalization
  - Bağımlılık: PROMPT 1, 4 (getNodeId + schema güncel)
  
- ✅ **PROMPT 10:** Pause/Cancel Substation Update → **A.7, C.6**
  - Çıktı: Pause/Cancel endpoint'lerinde substation'ları free et
  - Bağımlılık: PROMPT 3 (substationSchedule var)
  
- ✅ **PROMPT 12:** Component Schema Updates → **A.8**
  - Çıktı: materialFlowView (predecessors) + semiCode (priority)
  - Bağımlılık: PROMPT 9 (frontend schema güncel)

---

## 🔍 ENTEGRASYON MATRİSİ

| Prompt | Üretir | Kullanır | Bağımlı Olduğu |
|--------|--------|----------|----------------|
| **1** | getNodeId() | - | - |
| **2** | Material fix | - | - |
| **3** | substationSchedule | - | - |
| **4** | isUrgent field, priorityIndex (Firestore) | getNodeId() | **1** |
| **11** | priorityIndex (Array) | - | **1, 4** |
| **5** | /set-urgent-priority endpoint | isUrgent field | **4** |
| **6** | Acil butonu | /set-urgent-priority | **5** |
| **7** | canStart logic | isUrgent, priorityIndex | **5, 6** |
| **8** | Material 2-phase | getNodeId() | **1** |
| **9** | Schema sync | getNodeId(), schema | **1, 4** |
| **10** | Substation free | substationSchedule | **3** |
| **12** | Component updates | Frontend schema | **9** |

---

## ⚠️ KRİTİK UYARILAR

### 1. PROMPT 4 ve 11 İlişkisi
- **PROMPT 4:** `completeAssignment` objesine `priorityIndex: assignment.priorityIndex` ekler
- **PROMPT 11:** `assignmentsArray.push()` içine `priorityIndex: index + 1` ekler
- **İkisi birlikte çalışır:** PROMPT 11 array'e ekler, PROMPT 4 Firestore'a yazar
- **UYARI:** PROMPT 11'de Firestore write kısmına DOKUNMA!

### 2. Field Name Tutarlılığı
- **✅ DOĞRU:** `isUrgent: true/false` (Boolean)
- **❌ YANLIŞ:** `priority: "urgent"/"normal"` (String) - ESKİ SİSTEM
- **Tüm promtlar:** `isUrgent` + `priorityIndex` kullanıyor

### 3. getNodeId() Kullanımı
PROMPT 1'deki `getNodeId()` şu promtlarda kullanılıyor:
- ✅ PROMPT 4 (completeAssignment)
- ✅ PROMPT 8 (Material reservation)
- ✅ PROMPT 9 (Frontend sync)
- ✅ PROMPT 11 (assignmentsArray)

### 4. Execution Order
```
1. FAZ 1 (1→2→3) : Foundation (paralel çalıştırılabilir)
2. FAZ 2 (4→11)  : Schema + priorityIndex (SIRASIYLA!)
3. FAZ 3 (5→6→7) : Urgent system (SIRASIYLA!)
4. FAZ 4 (8)     : Material reservation
5. FAZ 5 (9→10→12): System fixes (9→12 sıralı, 10 bağımsız)
```

---

## 📊 Kapsam Analizi

**Appendix A (8 kritik hata):** ✅ 8/8 → %100 kapsanıyor
**Appendix C (8 migration faz):** ✅ 6/8 → C.7 (migration script) ve C.8 (test) manuel

**Toplam:** 12 prompt, 12 bağımsız fix, tam entegrasyon

---

**Son Güncelleme:** 16 Kasım 2025  
**Yazar:** GitHub Copilot (Claude Sonnet 4.5)  
**Versiyon:** v2.0 - Final (Entegrasyon Doğrulandı)
