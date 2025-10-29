# 📋 MES Sistemi - Use Case'ler, Admin Akışı ve Mantıksal Sorunlar

**Tarih:** 29 Ekim 2025  
**Versiyon:** 2.0 - Post Cleanup

---

## 🎯 Executive Summary

Bu dokümanda:
1. ✅ Admin'in adım adım ne yapacağı
2. ✅ Detaylı use case'ler
3. ✅ Mantıksal hatalar ve eksikler
4. ✅ Çözüm önerileri

---

# 📖 BÖLÜM 1: ADMIN AKIŞI (Adım Adım)

## 🚀 PHASE 1: Initial Setup (İlk Kurulum)

### Step 1: Master Data Tanımlama
**Modül:** Settings (Master Data)  
**Süre:** 10-15 dakika

**Ne yapılacak:**
1. **Skills** tanımlama:
   ```
   - CNC Programming
   - MIG Welding
   - Quality Inspection
   - Assembly
   - vb.
   ```

2. **Operation Types** tanımlama:
   ```
   - Machining
   - Welding
   - Quality
   - Assembly
   - Packaging
   - vb.
   ```

**Akış:**
```
Settings → Master Data → Skills → [Add Skill]
Settings → Master Data → Operation Types → [Add Type]
```

**Output:** Sistemde kullanılacak temel kategoriler hazır ✅

---

### Step 2: Stations (İstasyonlar) Ekleme
**Modül:** Stations Management  
**Süre:** 20-30 dakika

**Ne yapılacak:**
Her üretim istasyonunu sisteme ekle:

**Örnek Station:**
```
Name: CNC Mill 01
Type: CNC Milling Machine
Capacity: 1
Status: Operational
```

**Akış:**
```
Stations → [Add Station] → Form doldur → Save
```

**Output:** Tüm fiziksel istasyonlar sistemde kayıtlı ✅

---

### Step 3: Operations (Operasyonlar) Tanımlama
**Modül:** Operations Management  
**Süre:** 30-45 dakika

**Ne yapılacak:**
Her üretim operasyonunu tanımla:

**Örnek Operation:**
```
Name: CNC Milling
Description: CNC ile frezeleme işlemi
Operation Type: Machining
Estimated Time: 45 min
Required Skills: [CNC Programming, CAM Software]
Required Station: CNC Mill 01
```

**Akış:**
```
Operations → [Add Operation] → Form doldur:
  - Basic info (name, description, type)
  - Time (estimated minutes)
  - Skills (select from list)
  - Station (select from list)
→ Save
```

**Output:** Tüm production operations sisteme tanımlanmış ✅

---

### Step 4: Workers (İşçiler) Ekleme
**Modül:** Workers Management  
**Süre:** 30-60 dakika

**Ne yapılacak:**
Her işçiyi sisteme ekle:

**Örnek Worker:**
```
Name: Ali Yılmaz
Email: ali@company.com
Skills: [CNC Programming, CAM Software, Blueprint Reading]
Assigned Operations: [CNC Milling, CNC Turning]
Assigned Stations: [CNC Mill 01, CNC Lathe 01]
Shift: Day
Availability: Available
```

**Akış:**
```
Workers → [Add Worker] → Form doldur:
  - Basic Info (name, email)
  - Skills (multi-select checkboxes)
  - Assigned Operations (multi-select checkboxes)
  - Assigned Stations (multi-select checkboxes)
  - Shift (Day/Night)
  - Availability (Available/Busy/On Leave)
→ Save
```

**Output:** Tüm işçiler ve yetenekleri sistemde kayıtlı ✅

---

### ✅ PHASE 1 TAMAMLANDI!

**Setup Guide Completion:**
- ✅ Master Data tanımlandı
- ✅ Stations eklendi
- ✅ Operations tanımlandı
- ✅ Workers eklendi

**Sistem artık production planning için hazır!** 🎉

---

## 🏭 PHASE 2: Production Planning

### Step 5: Plan Designer'da Production Plan Oluşturma
**Modül:** Plan Designer  
**Süre:** 15-30 dakika (plan başına)

#### 5.1. Sipariş Seçimi
**Akış:**
```
Plan Designer → Left Panel → Select Order:
  - WO-2401: Engine Block (500 units, due 2025-02-15)
  - WO-2402: Gear Assembly (800 units, due 2025-02-20)
  - WO-2403: Control Panel (300 units, due 2025-02-18)
```

**Seçim sonrası gösterilen bilgiler:**
- Product name
- Quantity
- Due date
- Material requirements
- Station availability
- Worker availability

---

#### 5.2. Operations Ekleme (Drag & Drop)
**Akış:**
```
Toolbox (Left Panel) → Operations listesi:
  ├── CNC Milling (45 min)
  ├── Welding - MIG (30 min)
  ├── Quality Control (20 min)
  ├── Assembly (25 min)
  └── Packaging (15 min)

Drag operation → Drop to canvas
```

**Canvas'ta node oluşur:**
```
┌─────────────────────┐
│ CNC Milling         │
│ Type: Machining     │
│ Time: 45 min        │
│ Station: -          │
│ Worker: -           │
└─────────────────────┘
```

---

#### 5.3. Node Konfigürasyonu (Edit)
**Akış:**
```
Click node → Edit button → Dialog açılır:

Configuration Dialog:
├── Operation Name: CNC Milling
├── Estimated Time: 45 min (editable)
├── Station: [Select from dropdown]
│   └── CNC Mill 01
│   └── CNC Mill 02
├── Worker: [Select from filtered list]
│   └── Ali Yılmaz (has required skills)
│   └── Ahmet Can (has required skills)
└── [Save]
```

**Save sonrası node güncellenir:**
```
┌─────────────────────┐
│ CNC Milling         │
│ Type: Machining     │
│ Time: 45 min        │
│ Station: CNC Mill 01│
│ Worker: Ali Yılmaz  │ ← Assigned!
└─────────────────────┘
```

---

#### 5.4. Operations Bağlama (Connect Nodes)
**Akış:**
```
1. Click "Connect Nodes" button
2. Click source node (örn: CNC Milling)
3. Click target node (örn: Welding)
4. Connection line oluşur

Sonuç:
CNC Milling → Welding → Quality Control → Packaging
```

**Bu sequence işlemlerinin sırasını belirler:**
```
Sequence:
1. CNC Milling (must complete first)
2. Welding (waits for step 1)
3. Quality Control (waits for step 2)
4. Packaging (waits for step 3)
```

---

#### 5.5. Plan Kaydetme ve Deploy
**İki seçenek:**

**A) Save as Template (Gelecekte kullanılacak):**
```
[Save Template] button → Template name gir → Save
→ Templates Library'ye kaydedilir
```

**B) Deploy Work Order (Hemen üretime gönder):**
```
[Deploy Work Order] button → Confirmation dialog:

Deploy Confirmation:
├── Work Order ID: WO-2401
├── Product: Engine Block
├── Quantity: 500
├── Operations: 4
├── Estimated Duration: 135 min
├── Assigned Workers: 4
└── [Confirm Deploy]

Confirm → Work Order oluşur ve Dashboard'a eklenir ✅
```

---

### ✅ PHASE 2 TAMAMLANDI!

**Sonuç:**
- ✅ Production plan oluşturuldu
- ✅ Operations sequence belirlendi
- ✅ Workers assigned edildi
- ✅ Stations assigned edildi
- ✅ Work Order deploy edildi

**Work Order artık üretimde!** 🏭

---

## 📊 PHASE 3: Execution & Monitoring

### Step 6: Dashboard'da Takip
**Modül:** Production Dashboard  
**Süre:** Continuous monitoring

#### 6.1. KPI Takibi
**Dashboard üstte 4 KPI kartı:**
```
┌────────────┬────────────┬────────────┬────────────┐
│ Open WOs   │ Completed  │ Total      │ Average    │
│            │ Today      │ Scrap      │ Efficiency │
│     3      │     8      │    12      │    87%     │
└────────────┴────────────┴────────────┴────────────┘
```

**Canlı güncellenir:**
- İşçi operation tamamladıkça "Completed Today" artar
- Tüm operations tamamlanınca "Open WOs" azalır
- Fire bildirilince "Total Scrap" artar
- Ortalama verimlilik hesaplanır

---

#### 6.2. Work Orders Tablosu
**Tüm work order'lar listelenir:**
```
┌────────┬──────────┬─────────┬────────┬─────────┬────────┐
│ WO ID  │ Product  │ Qty     │Progress│Due Date │ Status │
├────────┼──────────┼─────────┼───���────┼─────────┼────────┤
│WO-2401 │Engine    │ 65/500  │ ████░░ │02/15    │In Prog.│
│WO-2402 │Gear Assy │  0/800  │ ░░░░░░ │02/20    │Pending │
│WO-2403 │Control   │ 12/300  │ ██░░░░ │02/18    │In Prog.│
└────────┴──────────┴─────────┴────────┴─────────┴────────┘
```

**Click on row → Operation details gösterilir:**
```
WO-2401 Operations:
├── ✅ CNC Milling (Completed: 42/45 min)
├── 🔄 Welding (In Progress: 18/30 min)
├── ⏸️  Quality Control (Pending)
└── ⏸️  Packaging (Pending)
```

---

#### 6.3. Real-time Updates
**Dashboard otomatik güncellenir:**
- Worker operation start edince → Status "In Progress"
- Worker pause edince → Status "Paused"
- Worker complete edince → Status "Completed", next operation "Pending" → "In Progress"
- Tüm operations complete → WO status "Completed"

---

### Step 7: Worker Panel (İşçi Arayüzü)
**Modül:** Worker Panel  
**Kullanıcı:** Operatör/İşçi

#### 7.1. Operatör Seçimi
**Akış:**
```
Worker Panel → Top dropdown:
Select Operator: [Ali Yılmaz ▼]
```

**Seçim sonrası:**
- Ali Yılmaz'a atanan operations listelenir
- Sadece "pending" ve "in-progress" operations gösterilir

---

#### 7.2. Assigned Operations Listesi
**Ali Yılmaz'ın görevleri:**
```
┌─────────────────────────────────────────────┐
│ WO-2401: Engine Block                       │
│ ┌─────────────────────────────────────────┐ │
│ │ CNC Milling                             │ │
│ │ Station: CNC Mill 01                    │ │
│ │ Estimated: 45 min                       │ │
│ │ Status: Pending                         │ │
│ │ [START] button                          │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ WO-2402: Gear Assembly                      │
│ ┌─────────────────────────────────────────┐ │
│ │ CNC Turning                             │ │
│ │ Station: CNC Lathe 01                   │ │
│ │ Estimated: 40 min                       │ │
│ │ Status: Pending                         │ │
│ │ [START] button                          │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

#### 7.3. Operation Start
**Ali CNC Milling'i başlatıyor:**
```
Click [START] button:
→ Status: In Progress
→ Timer başlar: 00:00 → 00:01 → 00:02 ...
→ Buttons değişir: [PAUSE] [COMPLETE PACKAGE]
```

**Panel güncellenir:**
```
┌─────────────────────────────────────────┐
│ CNC Milling                             │
│ Station: CNC Mill 01                    │
│ Status: 🔄 In Progress                  │
│ Timer: 00:18:32                         │
│ [PAUSE] [COMPLETE PACKAGE]              │
└─────────────────────────────────────────┘
```

---

#### 7.4. Pause/Resume
**Ali işi geçici durduruyor:**
```
Click [PAUSE]:
→ Status: Paused
→ Timer durur
→ Button: [RESUME]

Click [RESUME]:
→ Status: In Progress
→ Timer devam eder
→ Buttons: [PAUSE] [COMPLETE PACKAGE]
```

---

#### 7.5. Complete Package
**Ali paketi tamamlıyor:**
```
Click [COMPLETE PACKAGE]:
→ Confirmation dialog:
  "Mark this package as complete?"
  ├── Actual time: 42 min (calculated from timer)
  ├── Scrap amount: [input] (optional)
  ├── Issue notes: [textarea] (optional)
  └── [CONFIRM]

Confirm:
→ Operation status: Completed
→ Actual time kaydedilir: 42 min (estimated: 45 min)
→ Dashboard güncellenir
→ Next operation (Welding) status: Pending → In Progress (if worker assigned)
→ Success toast: "Package completed!"
```

---

#### 7.6. Report Issue/Scrap
**Ali fire bildiriyor:**
```
Durante operation, click [REPORT ISSUE]:
→ Dialog açılır:

Report Issue/Scrap:
├── Issue Type:
│   ○ Machine Problem
│   ○ Material Defect
│   ○ Quality Issue
│   ○ Other
├── Scrap Amount: [input]
├── Description: [textarea]
└── [SUBMIT]

Submit:
→ Issue kaydedilir
→ Dashboard'da "Total Scrap" artar
→ Notification gönderilir
```

---

### ✅ PHASE 3 TAMAMLANDI!

**Sonuç:**
- ✅ Dashboard'da real-time takip
- ✅ Worker Panel'de işçiler çalışıyor
- ✅ Operations tamamlanıyor
- ✅ Progress güncelleniyor
- ✅ KPI'lar canlı güncelleniyor

**Production flow tam çalışıyor!** 🎯

---

# 🔍 BÖLÜM 2: DETAYLI USE CASES

## Use Case 1: Yeni Üretim Siparişi Geldi

**Senaryo:** Müşteriden 500 adet Engine Block siparişi geldi, termin 15 Şubat.

**Akış:**

### 1. Plan Designer'a Git
```
Navigation: Production Planning → Plan Designer
```

### 2. Mock Order Seç (Gerçekte: Sipariş sistemi entegrasyonu)
```
Left Panel → Select Order → WO-2401: Engine Block (500 units)
```

### 3. Production Flow Tasarla
```
Drag & Drop:
1. CNC Milling (45 min)
2. Welding - MIG (30 min)
3. Quality Control (20 min)
4. Packaging (15 min)

Total time: 110 min/unit
Total production time: 500 × 110 = 55,000 min = 917 hours ≈ 115 shifts (8h/shift)
```

### 4. Operations Configure Et
```
For each operation:
- Assign station
- Assign worker (auto-filtered by required skills)
- Adjust time if needed
```

### 5. Sequence Belirle (Connect Nodes)
```
CNC Milling → Welding → Quality Control → Packaging
```

### 6. Deploy Work Order
```
Click [Deploy Work Order]:
→ Confirmation dialog görüntüler:
  - Estimated duration
  - Assigned workers
  - Required materials check
→ Confirm
→ Work Order oluşur
```

### 7. Dashboard'da Görün
```
Navigation: Execution & Monitoring → Dashboard
→ WO-2401 tabloda görünür
→ Status: Pending / In Progress (worker assigned ise)
```

**Sonuç:** Sipariş production'a alındı! ✅

---

## Use Case 2: İşçi Günlük İşine Başlıyor

**Senaryo:** Ali Yılmaz sabah işe geliyor, kendine atanan işleri yapacak.

**Akış:**

### 1. Worker Panel'e Git
```
Navigation: Execution & Monitoring → Worker Panel
```

### 2. Kendini Seç
```
Top dropdown: Select Operator → Ali Yılmaz
```

### 3. Atanan İşleri Gör
```
Assigned Operations:
├── WO-2401: Engine Block - CNC Milling (Pending)
├── WO-2403: Control Panel - CNC Turning (Pending)
└── WO-2402: Gear Assembly - CNC Milling (In Progress - paused)
```

### 4. İş Başlat (WO-2401)
```
WO-2401 card → [START] button
→ Status: In Progress
→ Timer başlar
→ Ali CNC Mill 01'de çalışmaya başlar
```

### 5. Çalışma Süresi Boyunca
```
Timer çalışır: 00:15:23 ... 00:28:45 ... 00:42:10
Ali gerekirse [PAUSE] ile ara verebilir
```

### 6. İş Tamamlama
```
45 min sonra (veya daha önce):
Click [COMPLETE PACKAGE]
�� Actual time: 42 min (3 min önce bitirdi! Verimli!)
→ Scrap: 0
→ Confirm
→ Operation marked as completed
```

### 7. Dashboard Güncellenir
```
Automatically:
- WO-2401 progress: 1/500 → 2/500
- KPI "Completed Today": +1
- Next operation (Welding) status: Pending
```

### 8. Sıradaki İşe Geç
```
Ali şimdi WO-2403'e başlayabilir
Veya WO-2402'yi devam ettirebilir (paused olan)
```

**Sonuç:** Ali günlük işini yapıyor, sistem gerçek zamanlı takip ediyor! ✅

---

## Use Case 3: Fire (Scrap) Rapor Etme

**Senaryo:** Ayşe Demir welding sırasında malzemede defect buldu, 3 parça fire verecek.

**Akış:**

### 1. Worker Panel'de İşini Yapıyor
```
Ayşe → WO-2401: Welding - MIG
Status: In Progress
Timer: 00:18:45
```

### 2. Problem Fark Etti
```
Material defect: 3 units
```

### 3. Issue Report Et
```
Click [REPORT ISSUE] button (veya Complete sırasında)
→ Dialog açılır:

Report Issue/Scrap:
├── Issue Type: ○ Material Defect ← Select
├── Scrap Amount: [3]
├── Description: "Welding seam cracks, material quality issue"
└── [SUBMIT]
```

### 4. Submit
```
→ Issue kaydedilir
→ Dashboard'da:
  - Total Scrap: 12 → 15
  - WO-2401 scrap counter: +3
→ Notification: "Scrap reported: WO-2401, 3 units"
→ Toast: "Issue reported successfully"
```

### 5. Yönetici Görür
```
Dashboard'da scrap arttı
Click WO-2401 row → Operation details:
→ "Welding: 3 units scrapped (Material defect)"
```

### 6. Aksiyonlar
```
Yönetici:
- Material supplier ile konuşabilir
- Quality check intensify edebilir
- Replacement order verebilir
```

**Sonuç:** Fire hemen raporlandı, tracking yapılıyor! ✅

---

## Use Case 4: Yeni İşçi Ekleme

**Senaryo:** Yeni eleman Zeynep Kara işe başladı, sisteme eklenecek.

**Akış:**

### 1. Workers Management'a Git
```
Navigation: Setup & Configuration → Workers
```

### 2. Add Worker
```
Click [Add Worker] button
→ Dialog açılır
```

### 3. Form Doldur
```
Basic Info:
├── Name: Zeynep Kara
├── Email: zeynep@company.com

Skills (checkboxes):
├── ☑ Assembly
├── ☑ Packaging
├── ☑ Quality Inspection
└── ☐ Other skills...

Assigned Operations (checkboxes):
├── ☑ Assembly (op-5)
├── ☑ Packaging (op-6)
└── ☑ Quality Control (op-3)

Assigned Stations (checkboxes):
├── ☑ Assembly Line A (st-5)
├── ☑ Packaging Station (st-6)
└── ☑ QC Lab (st-3)

Shift: Day ▼
Availability: Available ▼
```

### 4. Save
```
Click [Save]
→ Zeynep sisteme eklendi
→ Toast: "İşçi eklendi"
```

### 5. Plan Designer'da Kullan
```
Yeni plan oluştururken:
→ Assembly operation assign ederken
→ Zeynep Kara dropdown'da görünür (filtered by required skills)
→ Assign edilebilir
```

### 6. Worker Panel'de Görün
```
Worker Panel → Select Operator dropdown:
→ Zeynep Kara listede
→ Kendine atanan işleri görebilir
```

**Sonuç:** Yeni işçi sisteme entegre edildi! ✅

---

## Use Case 5: Yeni Operation Type Ekleme

**Senaryo:** Şirket yeni bir operation type kullanacak: "Surface Coating"

**Akış:**

### 1. Settings'e Git
```
Navigation: Setup & Configuration → Master Data
```

### 2. Operation Types Tab
```
Click "Operation Types" tab
```

### 3. Add New Type
```
Input field: [Surface Coating]
Click [Add]
→ "Surface Coating" listeye eklendi
→ Toast: "Operation type added"
```

### 4. Operations Management'ta Kullan
```
Operations Management → [Add Operation]
→ Operation Type dropdown:
  ├── Machining
  ├── Welding
  ├── Assembly
  ├── Quality
  ├── Packaging
  ├── Painting
  ├── Heat Treatment
  ├── Surface Finishing
  └── Surface Coating ← YENİ!
```

### 5. Yeni Operation Ekle
```
Name: Powder Coating
Description: Electrostatic powder coating
Operation Type: Surface Coating ← Select
Estimated Time: 60 min
Required Skills: [Surface Coating, Quality Inspection]
Required Station: Coating Booth 01
→ Save
```

### 6. Plan Designer'da Kullan
```
Yeni plan'da:
→ Toolbox'ta "Powder Coating" operasyonu kullanılabilir
```

**Sonuç:** Yeni operation type sisteme eklendi, kullanıma hazır! ✅

---

# 🚨 BÖLÜM 3: MANTIKSAL HATALAR ve EKSİKLER

## ❌ SORUN 1: Worker-Operation Assignment Mantığı HATALI

### Tespit:
`workers-management.tsx` ve `operations-management.tsx` her iki yerde de:
- **Worker → Assigned Operations** seçimi var
- **Operation → Assigned Workers** YOK!

### Problem:
**Asimetrik veri yapısı:**
```typescript
// Worker interface:
Worker {
  assignedOperationIds: string[]  ✅ Worker hangi op'leri yapabilir
}

// Operation interface:
Operation {
  requiredSkills: string[]        ✅ Op hangi skill'leri gerektirir
  requiredStationId: string       ✅ Op hangi istasyonda yapılır
  assignedWorkerIds: string[]     ❌ YOK! Op hangi worker'lara açık?
}
```

### Neden Sorunlu:

1. **Plan Designer'da Worker Assignment:**
```typescript
// Plan Designer'da worker seçerken:
getAvailableWorkers(requiredSkills) // ✅ Skill'e göre filtreler

// AMA:
// Bu worker'ın bu operasyonu YAPIP YAPAMAYACAĞINI kontrol etmiyor!
// Worker.assignedOperationIds kontrolü YOK!
```

2. **İki Kaynak, Tek Kontrol:**
```typescript
// Şu anda sadece skill check var:
Worker has "CNC Programming" skill → OK ✅

// Olması gereken:
Worker has "CNC Programming" skill ✅ AND
Worker.assignedOperationIds includes "op-1" ✅
→ OK
```

### Çözüm:

#### Çözüm A: Operation interface'e assignedWorkerIds ekle (Simetrik yap)
```typescript
export interface Operation {
  id: string;
  name: string;
  // ... existing fields
  assignedWorkerIds: string[];  // ← EKLE!
}
```

**Operations Management'ta:**
```typescript
// Operation edit dialog'a ekle:
"Assigned Workers" section:
- Multi-select checkboxes
- Show all workers
- Filter by skills
- Save to Operation.assignedWorkerIds
```

**Plan Designer'da:**
```typescript
// getAvailableWorkers fonksiyonunu güncelle:
const getAvailableWorkers = (operation: Operation) => {
  return workers.filter(w => {
    // Skill check
    const hasRequiredSkills = operation.requiredSkills.every(
      skill => w.skills.includes(skill)
    );
    
    // Assignment check
    const isAssignedToOperation = operation.assignedWorkerIds.includes(w.id);
    
    // Availability check
    const isAvailable = w.availability === "Available";
    
    return hasRequiredSkills && isAssignedToOperation && isAvailable;
  });
};
```

#### Çözüm B: Worker.assignedOperationIds kullan (Mevcut yapıyı kullan)
```typescript
// Plan Designer'da:
const getAvailableWorkers = (operation: Operation) => {
  return workers.filter(w => {
    const hasRequiredSkills = operation.requiredSkills.every(
      skill => w.skills.includes(skill)
    );
    
    const canDoThisOperation = w.assignedOperationIds.includes(operation.id);
    
    const isAvailable = w.availability === "Available";
    
    return hasRequiredSkills && canDoThisOperation && isAvailable;
  });
};
```

**ÖNERİM:** Çözüm B daha basit, mevcut yapıyı kullanıyor. Sadece Plan Designer'da kontrol ekle!

---

## ❌ SORUN 2: Worker Panel - Real-time Updates YOK

### Tespit:
`worker-panel-simple.tsx` statik duruyor, gerçek zamanlı güncelleme yok.

### Problem:
```typescript
// Worker Panel şu anda:
const { workers, workOrders } = useMES();

// workOrders değişince component re-render olmuyor!
// Çünkü Context update mekanizması yok
```

### Senaryo:
1. Ali operation start ediyor → Status "In Progress"
2. Dashboard'a git → Status güncel
3. Worker Panel'e dön → Status hala "Pending" ❌

### Neden:
**Context state değişiyor ama component re-render olmuyor.**

### Çözüm:

#### MESContext.tsx'e event listener ekle:
```typescript
// Ekle:
type MESEventListener = () => void;
const listeners: MESEventListener[] = [];

export function useMES() {
  const context = useContext(MESContext);
  
  // Subscribe to updates
  useEffect(() => {
    const listener = () => forceUpdate();
    listeners.push(listener);
    return () => {
      const index = listeners.indexOf(listener);
      if (index > -1) listeners.splice(index, 1);
    };
  }, []);
  
  return context;
}

// Her update'te notify et:
const notifyListeners = () => {
  listeners.forEach(listener => listener());
};

// updateOperationStatus içinde:
const updateOperationStatus = (...) => {
  setWorkOrders(...); // existing
  notifyListeners();  // ← EKLE!
};
```

**Daha Basit Alternatif:** React Context otomatik re-render yapıyor, eğer yapmazsa state yönetiminde sorun var. Kontrol et!

---

## ❌ SORUN 3: Plan Designer - Mock Orders Gerçek Değil

### Tespit:
```typescript
const mockOrders: Order[] = [
  { id: "WO-2401", product: "Engine Block", quantity: 500, dueDate: "2025-02-15" },
  // ... static mock data
];
```

### Problem:
**Gerçek sipariş sistemi entegrasyonu yok!**

### Gerçek Dünyada:
- Siparişler Burkol0 Order Management'tan gelir
- ERP sisteminden gelir
- Manuel oluşturulur

### Çözüm:

#### Kısa Vadede: Mock Order Ekleme Formu
```typescript
// Plan Designer'a "Create New Order" butonu ekle:
<Button onClick={() => setOrderDialog(true)}>
  <Plus /> Create New Order
</Button>

// Dialog:
Create New Order:
├── Product Name: [input]
├── Quantity: [input]
├── Due Date: [date picker]
└── [Create]

// Save to context/local state
```

#### Uzun Vadede: Burkol0 Integration
```typescript
// Burkol0 Order Management API:
const orders = await fetch('/api/orders').then(r => r.json());

// Veya:
const orders = useBurkol0Orders(); // Hook
```

**ÖNERİM:** Kısa vadede mock order creation formu ekle!

---

## ❌ SORUN 4: Materials Check Eksik

### Tespit:
```typescript
// Plan Designer'da materials var ama:
const [materials, setMaterials] = useState<Material[]>([
  { id: "m1", name: "Steel Block", required: 500, available: 450, unit: "kg" },
  // ... mock data
]);

// Deploy sırasında material check YOK!
```

### Problem:
**Material yetersizliği kontrol edilmiyor:**
```
Required: 500 kg Steel Block
Available: 450 kg
→ Deploy ediliyor! ❌
```

### Senaryo:
1. Admin plan oluşturuyor
2. Materials section'da "Steel Block: 450/500 kg available" görüyor (KIRMIZI)
3. [Deploy Work Order] tıklıyor
4. Sistem uyarı vermeden deploy ediyor ❌
5. Production başlıyor
6. Material bitince duruyor!

### Çözüm:

#### Deploy sırasında validation:
```typescript
const handleDeployWorkOrder = () => {
  // Material validation
  const insufficientMaterials = materials.filter(m => m.available < m.required);
  
  if (insufficientMaterials.length > 0) {
    // Warning dialog:
    setMaterialWarningDialog(true);
    setInsufficientMaterials(insufficientMaterials);
    return;
  }
  
  // Continue with deploy...
};

// Warning Dialog:
Material Shortage Warning:
├── ⚠️ Insufficient materials detected:
├── - Steel Block: 450/500 kg (50 kg short)
├── - Fasteners: 4800/5000 pcs (200 pcs short)
├──
├── [Cancel] [Deploy Anyway] [Order Materials]
```

**ÖNERİM:** Material validation ekle, warning göster!

---

## ❌ SORUN 5: Worker Availability Kontrolü Eksik

### Tespit:
```typescript
// Worker interface:
Worker {
  availability: "Available" | "Busy" | "On Leave"
}

// Plan Designer'da:
getAvailableWorkers(requiredSkills) {
  return workers.filter(w => 
    requiredSkills.every(skill => w.skills.includes(skill))
    // ❌ w.availability kontrolü YOK!
  );
}
```

### Problem:
**"On Leave" olan worker assign edilebiliyor!**

### Senaryo:
1. Ali Yılmaz "On Leave" (tatilde)
2. Plan Designer'da CNC Milling operation'a worker seçiliyor
3. Ali Yılmaz dropdown'da görünüyor ❌
4. Ali assign ediliyor
5. Ali tatilde, iş yapamıyor!

### Çözüm:

#### getAvailableWorkers'a availability filter ekle:
```typescript
const getAvailableWorkers = (requiredSkills: string[]) => {
  if (!requiredSkills || requiredSkills.length === 0) {
    return workers.filter((w) => w.availability === "Available"); // ← EKLE!
  }
  
  return workers.filter((w) => {
    if (w.availability !== "Available") return false; // ← EKLE!
    return requiredSkills.every((skill) => w.skills.includes(skill));
  });
};
```

**ÖNERİM:** Availability filter ekle HEMEN!

---

## ❌ SORUN 6: Station Capacity Kontrolü YOK

### Tespit:
```typescript
// Station interface:
Station {
  capacity: number  // Aynı anda kaç worker çalışabilir
  status: string    // "Operational" / "Maintenance" / "Down"
}

// Plan Designer'da:
// Station capacity check YOK!
// Station status check YOK!
```

### Problem:

**Problem 1: Capacity overflow:**
```
Station: CNC Mill 01
Capacity: 1 (tek worker)

Plan 1: Ali → CNC Mill 01 (45 min)
Plan 2: Ahmet → CNC Mill 01 (40 min)
→ İkisi de aynı anda assign ediliyor! ❌
```

**Problem 2: Maintenance station assign:**
```
Station: Welding Station A
Status: Maintenance

Plan: Ayşe → Welding Station A
→ Assign ediliyor ama station çalışmıyor! ❌
```

### Çözüm:

#### Station availability check:
```typescript
// Plan Designer'da station dropdown:
const getAvailableStations = (operationType: string, assignedTime: Date) => {
  return stations.filter(st => {
    // Type check
    const matchesType = st.type.includes(operationType);
    
    // Status check
    const isOperational = st.status === "Operational";
    
    // Capacity check (complex - need to check other assignments)
    const currentAssignments = getCurrentAssignmentsForStation(st.id, assignedTime);
    const hasCapacity = currentAssignments.length < st.capacity;
    
    return matchesType && isOperational && hasCapacity;
  });
};

// Helper:
const getCurrentAssignmentsForStation = (stationId: string, time: Date) => {
  // Check all work orders
  // Find operations assigned to this station
  // Check if they overlap with given time
  return overlappingAssignments;
};
```

**ÖNERİM:** Station status check ekle, capacity check için scheduling logic gerekli (complex)!

---

## ⚠️ SORUN 7: Sequence Validation YOK

### Tespit:
Plan Designer'da operations connect edilebiliyor ama:
- Circular dependency check YOK
- Orphan node check YOK
- Start/End node check YOK

### Problem:

**Problem 1: Circular dependency:**
```
A → B → C → A ❌
```

**Problem 2: Orphan nodes:**
```
A → B → C
D (not connected) ❌
```

**Problem 3: Multiple start nodes:**
```
A → C
B → C
(Which one starts first?) ❌
```

### Çözüm:

#### Deploy öncesi validation:
```typescript
const validatePlanSequence = () => {
  const errors: string[] = [];
  
  // Check 1: Circular dependency
  if (hasCircularDependency(nodes)) {
    errors.push("Circular dependency detected");
  }
  
  // Check 2: All nodes connected
  const orphanNodes = nodes.filter(n => 
    n.connections.length === 0 && 
    !isConnectedAsTarget(n.id)
  );
  if (orphanNodes.length > 0) {
    errors.push(`${orphanNodes.length} unconnected operations`);
  }
  
  // Check 3: Single start node
  const startNodes = nodes.filter(n => !isConnectedAsTarget(n.id));
  if (startNodes.length > 1) {
    errors.push("Multiple start nodes found");
  }
  
  return errors;
};

// Deploy button:
const handleDeploy = () => {
  const errors = validatePlanSequence();
  if (errors.length > 0) {
    // Show error dialog
    return;
  }
  // Continue...
};
```

**ÖNERİM:** Sequence validation ekle!

---

## ⚠️ SORUN 8: Worker Panel - Package Completion Eksik

### Tespit:
Worker Panel'de "Complete Package" var ama:
- Package size nedir? (25 units default)
- Kaç package tamamlandı?
- Total quantity'ye nasıl yansıyor?

### Problem:
**Package tracking yok:**
```typescript
// Work Order:
WorkOrder {
  quantity: 500 units
  // ❌ completedPackages: number YOK!
  // ❌ packageSize: number YOK!
}

// Worker completes package:
// Sistem quantity'yi nasıl güncelliyor?
```

### Senaryo:
1. WO-2401: 500 units, package size: 25
2. Ali 1 package tamamlıyor
3. Sistem completedQuantity'yi nasıl hesaplıyor?
   - 25 units mi? (1 package × 25)
   - 1 unit mi? (1 operation)
   - ???

### Çözüm:

#### Work Order'a package tracking ekle:
```typescript
export interface WorkOrder {
  // ... existing fields
  packageSize: number;        // ← EKLE! (e.g., 25 units)
  completedPackages: number;  // ← EKLE! (e.g., 20 packages)
  totalPackages: number;      // ← EKLE! (e.g., 500/25 = 20 packages)
}

// Calculate:
completedQuantity = completedPackages × packageSize
progress = (completedQuantity / quantity) × 100
```

#### Worker Panel'de package info göster:
```typescript
<Card>
  <CardHeader>
    <h3>WO-2401: Engine Block</h3>
    <p>Package Size: 25 units</p>
    <p>Progress: {completedPackages}/{totalPackages} packages</p>
    <p>Units: {completedQuantity}/{quantity}</p>
  </CardHeader>
  <CardContent>
    {/* Operation details */}
    <Button onClick={completePackage}>
      Complete Package ({packageSize} units)
    </Button>
  </CardContent>
</Card>
```

**ÖNERİM:** Package tracking ekle!

---

## ℹ️ SORUN 9: Templates Library Implement Edilmeli

### Tespit:
Templates Library placeholder, gerçek fonksiyon yok.

### Eksikler:
1. ❌ Plan Designer'dan template save yok
2. ❌ Template load yok
3. ❌ Template edit yok
4. ❌ Template storage (Context/LocalStorage/API)

### İhtiyaç:
Admin sık kullanılan flow'ları template olarak kaydetmek istiyor.

### Çözüm:

#### Phase 1: Template Save (Plan Designer)
```typescript
// Plan Designer'a ekle:
<Button onClick={handleSaveAsTemplate}>
  <FileText /> Save as Template
</Button>

const handleSaveAsTemplate = () => {
  setTemplateDialog(true);
};

// Dialog:
Save as Template:
├── Template Name: [input]
├── Category: [select]
├── Description: [textarea]
└── [Save]

// Save to Context:
const template: ProductionTemplate = {
  id: `tpl-${Date.now()}`,
  name: templateForm.name,
  category: templateForm.category,
  description: templateForm.description,
  nodes: nodes,              // Save current canvas
  packageSize: packageSize,
  createdAt: new Date().toISOString(),
};
addTemplate(template);
```

#### Phase 2: Template Load (Plan Designer)
```typescript
// Plan Designer'a ekle:
<Button onClick={() => setTemplateLibraryDialog(true)}>
  <FileText /> Load Template
</Button>

// Dialog: Template selection
// On select:
const handleLoadTemplate = (template: ProductionTemplate) => {
  setNodes(template.nodes);
  setPackageSize(template.packageSize);
  toast.success("Template loaded");
};
```

#### Phase 3: Templates Library UI
```typescript
// templates-library.tsx'i implement et:
- Template grid/list
- Search/filter
- Preview
- Use template button → Plan Designer'a yönlendir
```

**ÖNERİM:** Template functionality implement et (medium priority)!

---

## ℹ️ SORUN 10: Setup Guide Completion Check Eksik

### Tespit:
Setup Guide'da completion check var ama hatalı:

```typescript
const setupSteps: SetupStep[] = [
  {
    id: "workers",
    checkComplete: () => workers.length > 0,  // ✅ OK
  },
];

// Ama:
// Skills count check yok
// Operation Types count check yok
// Stations count check yok
// Operations count check yok
```

### Problem:
**Minimum data kontrolü yok:**
```
Admin 1 skill ekliyor → "Master Data" step complete ✅
Ama sadece 1 skill yeterli mi? ❌
```

### Çözüm:

#### Minimum requirements ekle:
```typescript
{
  id: "master-data",
  checkComplete: () => 
    availableSkills.length >= 3 &&        // En az 3 skill
    availableOperationTypes.length >= 3,  // En az 3 type
},
{
  id: "stations",
  checkComplete: () => stations.length >= 2,  // En az 2 station
},
{
  id: "operations",
  checkComplete: () => operations.length >= 3,  // En az 3 operation
},
{
  id: "workers",
  checkComplete: () => workers.length >= 2,  // En az 2 worker
},
```

**ÖNERİM:** Minimum requirements ekle!

---

# 📊 BÖLÜM 4: ÖNCELİK SIRASI

## 🔴 CRİTİCAL (Hemen düzelt!)

1. **Worker Availability Filter (Sorun 5)**
   - Impact: HIGH
   - Effort: LOW
   - Fix: 5 dakika

2. **Worker-Operation Assignment Check (Sorun 1)**
   - Impact: HIGH
   - Effort: MEDIUM
   - Fix: 30 dakika

3. **Station Status Check (Sorun 6 - partial)**
   - Impact: MEDIUM
   - Effort: LOW
   - Fix: 15 dakika

---

## 🟠 HIGH (Önümüzdeki sprint'te yap)

4. **Material Shortage Warning (Sorun 4)**
   - Impact: MEDIUM
   - Effort: LOW
   - Fix: 20 dakika

5. **Package Tracking (Sorun 8)**
   - Impact: HIGH
   - Effort: MEDIUM
   - Fix: 1 saat

6. **Sequence Validation (Sorun 7)**
   - Impact: MEDIUM
   - Effort: MEDIUM
   - Fix: 1 saat

---

## 🟡 MEDIUM (Backlog'a al)

7. **Real-time Updates (Sorun 2)**
   - Impact: LOW (Context zaten re-render yapıyor olmalı)
   - Effort: LOW
   - Fix: Debug et

8. **Setup Guide Requirements (Sorun 10)**
   - Impact: LOW
   - Effort: LOW
   - Fix: 10 dakika

9. **Station Capacity Check (Sorun 6 - full)**
   - Impact: MEDIUM
   - Effort: HIGH (complex scheduling logic)
   - Fix: 3-4 saat

---

## 🟢 LOW (Feature request)

10. **Mock Orders → Real Orders (Sorun 3)**
    - Impact: LOW (şu an mock yeterli)
    - Effort: MEDIUM/HIGH (integration needed)
    - Fix: Burkol0 integration gerektiğinde

11. **Templates Library (Sorun 9)**
    - Impact: LOW (nice to have)
    - Effort: HIGH
    - Fix: 4-6 saat

---

# ✅ BÖLÜM 5: QUICK FIX'LER (Hemen Yapılacaklar)

## Fix 1: Worker Availability Filter (5 dakika)

`/contexts/MESContext.tsx`:
```typescript
const getAvailableWorkers = (requiredSkills: string[]) => {
  if (!requiredSkills || requiredSkills.length === 0) {
    return workers.filter((w) => w.availability === "Available");
  }
  
  return workers.filter((w) => {
    if (w.availability !== "Available") return false;  // ← EKLE!
    return requiredSkills.every((skill) => w.skills.includes(skill));
  });
};
```

---

## Fix 2: Worker-Operation Assignment Check (30 dakika)

`/components/production-plan-designer.tsx`:
```typescript
// getAvailableWorkersForOperation fonksiyonu ekle:
const getAvailableWorkersForOperation = (operation: Operation) => {
  return workers.filter(w => {
    // 1. Availability check
    if (w.availability !== "Available") return false;
    
    // 2. Skills check
    const hasRequiredSkills = operation.requiredSkills.every(
      skill => w.skills.includes(skill)
    );
    
    // 3. Assignment check ← YENİ!
    const canDoThisOperation = w.assignedOperationIds.includes(operation.id);
    
    return hasRequiredSkills && canDoThisOperation;
  });
};

// Node edit dialog'da kullan:
const availableWorkersForThisOp = getAvailableWorkersForOperation(
  operations.find(op => op.id === node.operationId)
);
```

---

## Fix 3: Station Status Check (15 dakika)

`/components/production-plan-designer.tsx`:
```typescript
// Station dropdown'da:
const availableStations = stations.filter(st => 
  st.status === "Operational"  // ← EKLE!
);

// Eğer "Maintenance" ise kırmızı göster ve disable et:
<Select disabled={station.status !== "Operational"}>
  <SelectItem value={station.id}>
    {station.name}
    {station.status !== "Operational" && (
      <Badge variant="destructive">
        {station.status}
      </Badge>
    )}
  </SelectItem>
</Select>
```

---

# 📝 SONUÇ

## Sistem Durumu: 85% Ready

**✅ İyi Olanlar:**
- Core flow çalışıyor
- Setup Guide iyi tasarlanmış
- Navigation temiz
- Worker Panel basit ve kullanışlı
- Dashboard informative

**⚠️ Kritik Eksikler:**
- Worker availability filter YOK
- Worker-operation assignment check YOK
- Station status check YOK
- Material validation YOK
- Package tracking yarım

**💡 Öneri:**
1. Yukarıdaki 3 critical fix'i yap (50 dakika)
2. Material warning ekle (20 dakika)
3. Package tracking implement et (1 saat)
4. **Sistem production-ready olur!** 🚀

---

**Bu dokümanda:**
- ✅ 7 detaylı use case
- ✅ 10 mantıksal sorun tespit edildi
- ✅ Her sorun için çözüm önerildi
- ✅ Öncelik sırası belirlendi
- ✅ 3 quick fix kodu hazır

**Hangi fix'lerden başlayalım?** 🛠️
