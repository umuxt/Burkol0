# 🚀 LAUNCH MOTOR GELİŞTİRME PLANI

**Tarih:** 25 Kasım 2025  
**Hedef:** Launch motorunun eksik senaryolarını tamamlama ve production-ready hale getirme

---

## 📋 İÇİNDEKİLER

**⚠️ ÖNEMLI:** Bölümler bağımlılık sırasına göre düzenlenmiştir. Bu sıra takip edilmelidir!

### FAZ 1A: Temel Helper Fonksiyonlar (Diğerlerinin Temeli)
1. [Master-Data ve Company Working Hours](#1-master-data-ve-company-working-hours) ⭐⭐⭐
2. [Tatil Günleri Sistemi](#2-tatil-günleri-sistemi) ⭐⭐⭐
3. [Worker İzin/Hastalık Yönetimi](#3-worker-izinhastalık-yönetimi) ⭐⭐⭐

### FAZ 1B: Üst Seviye Fonksiyonlar (Helper'ları Kullanır)
4. [Shift Bitişi ve Gün Geçişleri](#4-shift-bitişi-ve-gün-geçişleri) ⭐⭐

### FAZ 2: Launch Motor Entegrasyonu
5. [Launch Motor Ana Döngü Entegrasyonu](#5-launch-motor-ana-döngü-entegrasyonu) ⭐⭐⭐

### FAZ 3: Database & UI İyileştirmeleri
6. [Database Migration - Worker Absences](#6-database-migration---worker-absences) ⭐
7. [Shift UI Bozukluğu Düzeltme](#7-shift-ui-bozukluğu-düzeltme) ⭐⭐

### FAZ 4: Opsiyonel Geliştirmeler
8. [Substation Durum ve Setup Time](#8-substation-durum-ve-setup-time) ⭐
9. [Worker Overtime Limitleri](#9-worker-overtime-limitleri) 💡
10. [isUrgent ve Priority Sistemi](#10-isurgent-ve-priority-sistemi) 💡

---

## FAZ 1A: TEMEL HELPER FONKSİYONLAR

> **⚠️ KRİTİK:** Bu bölümdeki fonksiyonlar diğer tüm iyileştirmelerin temelidir.  
> **Bağımlılık:** Hiçbirine bağımlı değiller, ama üst seviye fonksiyonlar bunları kullanacak.  
> **Sıra:** 1 → 2 → 3 şeklinde yapılmalı.

---

## 1. MASTER-DATA VE COMPANY WORKING HOURS

### 🎯 Hedef
Hardcoded çalışma saatlerini kaldırıp tüm schedule bilgisini master-data'dan almak.

### 🔗 Bağımlılıklar
- **Girdi:** Hiçbiri (en temel fonksiyon)
- **Çıktı:** `calculateEndTimeWithBreaks()`, `getWorkScheduleForDate()` bu fonksiyonu kullanacak
- **Etki:** Launch motorun 2 yerinde çağrılıyor (satır ~5627, ~5645)

### 📊 Mevcut Durum

**Database:**
```sql
-- mes.settings tablosunda
key: 'master-data'
value: {
  "timeSettings": {
    "workType": "fixed" | "shift",
    "laneCount": 1-7,
    "fixedBlocks": {
      "monday": [{ type: "work", start: "08:00", end: "12:00" }, ...],
      ...
    },
    "shiftBlocks": {
      "shift-monday": [...]
    },
    "shiftByLane": {
      "1": { "monday": [...], "tuesday": [...] },
      "2": { "monday": [...], "tuesday": [...] }
    }
  }
}
```

**Hardcoded Kod (mesRoutes.js):**
```javascript
function getDefaultWorkSchedule(dayName) {
  const defaultSchedules = {
    monday: [
      { type: 'work', start: '08:00', end: '12:00' },
      { type: 'break', start: '12:00', end: '13:00' },
      { type: 'work', start: '13:00', end: '17:00' }
    ],
    // ... DİĞER GÜNLER HARDCODED
  };
  return defaultSchedules[dayName.toLowerCase()] || [];
}
```

### ✅ KARAR
**Hardcoded schedule kaldırılacak** - Tüm schedule bilgisi master-data'dan gelecek.

### 🔧 Yapılacaklar

#### 1.1. Database Fonksiyonu Güncelleme

**Dosya:** `quote-portal/server/mesRoutes.js`

**Değişiklik:**
```javascript
/**
 * Get default work schedule from master-data
 * @param {Object} trx - Database transaction
 * @param {string} dayName - Day name (monday, tuesday, etc.)
 * @param {string} shiftNo - Shift number for shift-based schedules (default: '1')
 * @returns {Promise<Array>} Schedule blocks
 */
async function getDefaultWorkSchedule(trx, dayName, shiftNo = '1') {
  try {
    // Fetch master-data from database
    const result = await trx('mes.settings')
      .where('key', 'master-data')
      .first();
    
    if (!result || !result.value) {
      console.warn('⚠️  No master-data found, returning empty schedule');
      return [];
    }
    
    const masterData = typeof result.value === 'string' 
      ? JSON.parse(result.value) 
      : result.value;
    
    const timeSettings = masterData.timeSettings;
    if (!timeSettings) {
      console.warn('⚠️  No timeSettings in master-data');
      return [];
    }
    
    // Return schedule based on workType
    if (timeSettings.workType === 'fixed') {
      const blocks = timeSettings.fixedBlocks?.[dayName] || [];
      console.log(`📅 Fixed schedule for ${dayName}: ${blocks.length} blocks`);
      return blocks;
    } else if (timeSettings.workType === 'shift') {
      // Use shiftByLane if available (preferred structure)
      if (timeSettings.shiftByLane && timeSettings.shiftByLane[shiftNo]) {
        const blocks = timeSettings.shiftByLane[shiftNo][dayName] || [];
        console.log(`📅 Shift ${shiftNo} schedule for ${dayName}: ${blocks.length} blocks`);
        return blocks;
      }
      
      // Fallback to shiftBlocks (legacy structure)
      const key = `shift-${dayName}`;
      const allBlocks = timeSettings.shiftBlocks?.[key] || [];
      // Filter by lane index (shiftNo - 1)
      const laneIndex = parseInt(shiftNo, 10) - 1;
      const blocks = allBlocks.filter(b => 
        typeof b.laneIndex === 'number' ? b.laneIndex === laneIndex : true
      );
      console.log(`📅 Shift ${shiftNo} schedule for ${dayName} (legacy): ${blocks.length} blocks`);
      return blocks;
    }
    
    console.warn('⚠️  Unknown workType:', timeSettings.workType);
    return [];
  } catch (error) {
    console.error('❌ Error fetching default work schedule:', error);
    return [];
  }
}
```

#### 1.2. Launch Motorunda Kullanım Güncellemesi

**Dosya:** `quote-portal/server/mesRoutes.js` (Launch endpoint içinde)

**Değişiklik yapılacak yerler:**

**A) Worker Schedule Alma (Satır ~5627):**
```javascript
// ÖNCE:
const scheduleBlocks = getShiftBlocksForDay(personalSchedule, dayOfWeek);

if (scheduleBlocks.length === 0) {
  const defaultBlocks = getDefaultWorkSchedule(dayOfWeek);
  if (defaultBlocks.length > 0) {
    actualStart = adjustStartTimeForSchedule(actualStart, defaultBlocks);
  }
}

// SONRA:
const scheduleBlocks = getShiftBlocksForDay(personalSchedule, dayOfWeek);

if (scheduleBlocks.length === 0) {
  // Worker has no personal schedule, fetch from master-data
  const shiftNo = worker.personalSchedule?.shiftNo || '1';
  const defaultBlocks = await getDefaultWorkSchedule(trx, dayOfWeek, shiftNo);
  if (defaultBlocks.length > 0) {
    actualStart = adjustStartTimeForSchedule(actualStart, defaultBlocks);
  }
}
```

**B) End Time Calculation (Satır ~5645):**
```javascript
// ÖNCE:
const effectiveSchedule = scheduleBlocks.length > 0 
  ? scheduleBlocks 
  : getDefaultWorkSchedule(dayOfWeek);

// SONRA:
let effectiveSchedule = scheduleBlocks;
if (effectiveSchedule.length === 0) {
  const shiftNo = worker.personalSchedule?.shiftNo || '1';
  effectiveSchedule = await getDefaultWorkSchedule(trx, dayOfWeek, shiftNo);
}
```

#### 1.3. Test Senaryoları

- [ ] Test 1: Fixed workType ile launch
- [ ] Test 2: Shift workType, shift 1 ile launch
- [ ] Test 3: Shift workType, shift 2 ile launch
- [ ] Test 4: Worker personal schedule varken
- [ ] Test 5: Worker personal schedule yokken (master-data default)
- [ ] Test 6: Master-data boşken (fallback davranışı)

---

## 2. TATİL GÜNLERİ SİSTEMİ

### 🎯 Hedef
Resmi tatil günlerini ve şirket özel tatillerini yönetmek, launch sırasında kontrol etmek.

### 🔗 Bağımlılıklar
- **Girdi:** `getDefaultWorkSchedule()` (Bölüm 1'de yapılacak)
- **Çıktı:** `calculateEndTimeWithBreaks()`, Launch motor ana döngüsü bu fonksiyonları kullanacak
- **Yeni Fonksiyonlar:** `isHoliday()`, `getWorkScheduleForDate()`, `findNextWorkingDay()`

### ✅ KARARLAR

1. **Veri Yapısı:** Ayrı bir `company.holidays` koleksiyonu oluşturulacak (master-data içinde değil)
2. **Veri Depolama:** `mes.settings` tablosunda `key: 'company-holidays'` olarak saklanacak
3. **Launch Davranışı:**
   - ⚠️ Tatil gününe iş atanmak istenirse **UYARI VERİLECEK**
   - Kullanıcı "Evet" derse → Tatil gününe de atama yapılır
   - Kullanıcı "Hayır" derse → Bir sonraki iş günü kontrol edilir
   - Sonraki gün de tatilse → Tekrar soru sorulur
   - Tatil değilse → Atama yapılır

### 📊 Veri Yapısı

**Database Schema:**
```javascript
// mes.settings tablosunda
{
  key: 'company-holidays',
  value: {
    "holidays": [
      {
        "id": "holiday-001",
        "date": "2025-01-01",
        "name": "Yılbaşı",
        "isWorkingDay": false,
        "workHours": null
      },
      {
        "id": "holiday-002",
        "date": "2025-04-23",
        "name": "23 Nisan Ulusal Egemenlik ve Çocuk Bayramı",
        "isWorkingDay": false
      },
      {
        "id": "holiday-003",
        "date": "2025-12-31",
        "name": "Yılbaşı Arife (Yarım Gün)",
        "isWorkingDay": true,
        "workHours": [
          { "type": "work", "start": "08:00", "end": "13:00" }
        ]
      }
    ],
    "lastUpdated": "2025-11-25T10:00:00Z"
  }
}
```

### 🔧 Yapılacaklar

#### 2.1. Database Helper Fonksiyonları

**Dosya:** `quote-portal/server/mesRoutes.js`

**Yeni Fonksiyonlar:**

```javascript
/**
 * Check if a given date is a company holiday
 * @param {Object} trx - Database transaction
 * @param {Date} date - Date to check
 * @returns {Promise<Object|null>} Holiday object if found, null otherwise
 */
async function isHoliday(trx, date) {
  try {
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    
    const result = await trx('mes.settings')
      .where('key', 'company-holidays')
      .first();
    
    if (!result || !result.value) {
      return null;
    }
    
    const data = typeof result.value === 'string' 
      ? JSON.parse(result.value) 
      : result.value;
    
    const holidays = data.holidays || [];
    const holiday = holidays.find(h => h.date === dateStr);
    
    return holiday || null;
  } catch (error) {
    console.error('❌ Error checking holiday:', error);
    return null;
  }
}

/**
 * Get work schedule for a specific date (considers holidays)
 * @param {Object} trx - Database transaction
 * @param {Date} date - Date to get schedule for
 * @param {Object} worker - Worker object (optional)
 * @returns {Promise<Array>} Schedule blocks
 */
async function getWorkScheduleForDate(trx, date, worker = null) {
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getDay()];
  
  // 1. Check if it's a holiday
  const holiday = await isHoliday(trx, date);
  
  if (holiday) {
    if (!holiday.isWorkingDay) {
      console.log(`🎉 Holiday: ${holiday.name} - No work scheduled`);
      return []; // No work on this holiday
    }
    
    if (holiday.workHours && Array.isArray(holiday.workHours)) {
      console.log(`🎉 Holiday: ${holiday.name} - Custom hours`);
      return holiday.workHours; // Custom holiday hours (e.g., half-day)
    }
  }
  
  // 2. Get worker's personal schedule or company default
  if (worker?.personalSchedule?.mode === 'personal') {
    const blocks = worker.personalSchedule.blocks?.[dayOfWeek] || [];
    console.log(`👤 Using worker personal schedule for ${dayOfWeek}: ${blocks.length} blocks`);
    return blocks;
  }
  
  // 3. Use company default from master-data
  const shiftNo = worker?.personalSchedule?.shiftNo || '1';
  const blocks = await getDefaultWorkSchedule(trx, dayOfWeek, shiftNo);
  console.log(`🏢 Using company schedule for ${dayOfWeek}, shift ${shiftNo}: ${blocks.length} blocks`);
  return blocks;
}

/**
 * Find next working day (skip holidays and weekends)
 * @param {Object} trx - Database transaction
 * @param {Date} startDate - Starting date
 * @param {Object} worker - Worker object (for schedule check)
 * @param {number} maxDaysToCheck - Maximum days to search (default: 30)
 * @returns {Promise<Date|null>} Next working day or null if not found
 */
async function findNextWorkingDay(trx, startDate, worker = null, maxDaysToCheck = 30) {
  let currentDate = new Date(startDate);
  currentDate.setDate(currentDate.getDate() + 1); // Start from next day
  
  for (let i = 0; i < maxDaysToCheck; i++) {
    const schedule = await getWorkScheduleForDate(trx, currentDate, worker);
    
    if (schedule.length > 0) {
      console.log(`✅ Next working day found: ${currentDate.toISOString().split('T')[0]}`);
      return currentDate;
    }
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  console.warn(`⚠️  No working day found in next ${maxDaysToCheck} days`);
  return null;
}
```

#### 2.2. Launch Motor Entegrasyonu

**SENARYO 1: Task Tatil Gününe Denk Gelirse**

```javascript
// Launch endpoint içinde, her node için (satır ~5560 sonrası)

// 5g. Determine actual start (max of worker and substation)
const workerAvailableAt = workerQueue.length > 0
  ? workerQueue[workerQueue.length - 1].end
  : availableAt;

let actualStart = new Date(Math.max(
  workerAvailableAt.getTime(),
  availableAt.getTime()
));

// ✅ YENI: Check if start date is a holiday
const holiday = await isHoliday(trx, actualStart);
if (holiday && !holiday.isWorkingDay) {
  console.warn(`⚠️  Task for node "${node.name}" falls on holiday: ${holiday.name} (${holiday.date})`);
  
  // Bu noktada iki seçenek var:
  // A) LAUNCH SÜRECİNDE OTOMATİK KARAR: Sonraki iş gününe kaydır
  const nextWorkingDay = await findNextWorkingDay(trx, actualStart, worker);
  if (nextWorkingDay) {
    actualStart = nextWorkingDay;
    // Set to first work block of the day
    const daySchedule = await getWorkScheduleForDate(trx, actualStart, worker);
    if (daySchedule.length > 0) {
      const firstBlock = daySchedule.find(b => b.type === 'work');
      if (firstBlock) {
        const [hour, min] = firstBlock.start.split(':').map(Number);
        actualStart.setHours(hour, min, 0, 0);
      }
    }
    console.log(`   ➡️  Rescheduled to next working day: ${actualStart.toISOString()}`);
  } else {
    throw new Error(`Cannot schedule node "${node.name}": No working days available in next 30 days`);
  }
  
  // B) KULLANICI ONAYINA BIRAKMA: Warning olarak kaydet, launch tamamla
  // (Bu yaklaşım için warnings array'ine eklemek yeterli)
  // materialWarnings yerine scheduleWarnings array'i oluşturulabilir
}
```

**NOT:** Frontend'de kullanıcıya soru sormak için launch öncesi bir **validation endpoint** eklenebilir:

```javascript
/**
 * POST /api/mes/production-plans/:id/validate-launch
 * Validate plan before launch (check holidays, material, etc.)
 */
router.post('/production-plans/:id/validate-launch', withAuth, async (req, res) => {
  // ... validation logic
  // Return warnings array with holiday conflicts
  res.json({
    valid: true,
    warnings: {
      holidays: [
        {
          nodeId: 'node-001',
          nodeName: 'Kesim',
          scheduledDate: '2025-12-31',
          holiday: { name: 'Yılbaşı Arife', isWorkingDay: true },
          suggestedAction: 'continue_with_custom_hours' // or 'reschedule'
        }
      ],
      materials: [...]
    }
  });
});
```

#### 2.3. Tatil Yönetimi UI (İsteğe Bağlı - Gelecek Faz)

**Dosya:** `quote-portal/domains/admin/settings-app.js` (yeni tab)

```javascript
// Company Holidays Management UI
function HolidaysTab() {
  const [holidays, setHolidays] = useState([]);
  
  return (
    <div>
      <h3>Resmi Tatiller ve Özel Günler</h3>
      <button onClick={addHoliday}>+ Yeni Tatil Ekle</button>
      <table>
        <thead>
          <tr>
            <th>Tarih</th>
            <th>Açıklama</th>
            <th>Çalışma Durumu</th>
            <th>Saatler</th>
            <th>İşlemler</th>
          </tr>
        </thead>
        <tbody>
          {holidays.map(h => (
            <tr key={h.id}>
              <td>{h.date}</td>
              <td>{h.name}</td>
              <td>{h.isWorkingDay ? 'Yarım Gün' : 'Tatil'}</td>
              <td>{h.workHours ? formatHours(h.workHours) : '-'}</td>
              <td>
                <button onClick={() => editHoliday(h.id)}>Düzenle</button>
                <button onClick={() => deleteHoliday(h.id)}>Sil</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

#### 2.4. Test Senaryoları

- [ ] Test 1: Normal gün → Atama başarılı
- [ ] Test 2: Tatil günü → Bir sonraki iş gününe kaydırılır
- [ ] Test 3: Yarım gün tatil → Custom saatlerde atama
- [ ] Test 4: Ardışık tatil günleri → İlk iş gününe kaydırılır
- [ ] Test 5: 30 gün içinde iş günü yok → Hata mesajı
- [ ] Test 6: Tatil yokken → Normal çalışma

---

## 3. WORKER İZİN/HASTALIK YÖNETİMİ

### 🎯 Hedef
Worker'ların izinli/hasta olduğu durumları yönetmek ve launch sırasında kontrol etmek.

### 🔗 Bağımlılıklar
- **Girdi:** Hiçbiri (sadece worker objesini kontrol eder)
- **Çıktı:** `findWorkerWithShiftCheck()` bu fonksiyonu kullanacak
- **Yeni Fonksiyon:** `isWorkerAbsent()` (SYNC fonksiyon, database'e ihtiyaç yok)

### ✅ KARAR

**Veri Yapısı:** Worker detayında mevcut sistem kullanılacak (yeni takvim oluşturulmayacak)

**Nasıl Çalışacak:**
- Worker detayında "İzin/Hastalık" ekle butonu
- İzin bilgisi `worker` objesinin içine eklenir
- Launch motor çalışırken worker seçimi yaparken izinli/hasta olanlar filtrelenir

### 📊 Veri Yapısı

**Worker Schema Güncelleme:**

```javascript
// mes.workers tablosu
{
  id: "WK-001",
  name: "Ali Yılmaz",
  skills: ["skill-001", "skill-002"],
  personalSchedule: {...},
  isActive: true,
  
  // YENI ALAN:
  absences: [
    {
      id: "abs-001",
      type: "vacation",  // vacation, sick, training, meeting, other
      startDate: "2025-12-20T00:00:00Z",
      endDate: "2025-12-27T23:59:59Z",
      reason: "Yıllık izin",
      approvedBy: "manager@company.com",
      createdAt: "2025-11-20T10:00:00Z"
    },
    {
      id: "abs-002",
      type: "sick",
      startDate: "2025-11-18T00:00:00Z",
      endDate: "2025-11-19T23:59:59Z",
      reason: "Grip",
      approvedBy: null,
      createdAt: "2025-11-18T08:00:00Z"
    }
  ]
}
```

### 🔧 Yapılacaklar

#### 3.1. Database Schema Güncellemesi

**Migration:**
```javascript
// db/migrations/XXX_add_worker_absences.js
exports.up = function(knex) {
  return knex.schema.table('mes.workers', function(table) {
    table.jsonb('absences').defaultTo('[]');
  });
};

exports.down = function(knex) {
  return knex.schema.table('mes.workers', function(table) {
    table.dropColumn('absences');
  });
};
```

#### 3.2. Helper Fonksiyonlar

```javascript
/**
 * Check if worker is absent on a given date
 * @param {Object} worker - Worker object with absences
 * @param {Date} date - Date to check
 * @returns {Object|null} Absence record if found, null otherwise
 */
function isWorkerAbsent(worker, date) {
  if (!worker.absences || !Array.isArray(worker.absences)) {
    return null;
  }
  
  const checkDate = date.getTime();
  
  for (const absence of worker.absences) {
    const start = new Date(absence.startDate).getTime();
    const end = new Date(absence.endDate).getTime();
    
    if (checkDate >= start && checkDate <= end) {
      return absence;
    }
  }
  
  return null;
}
```

#### 3.3. Launch Motor Entegrasyonu

**Dosya:** `quote-portal/server/mesRoutes.js` (findWorkerWithShiftCheck içinde)

```javascript
async function findWorkerWithShiftCheck(trx, requiredSkills, stationId, startTime, duration) {
  const dayOfWeek = ['sunday', 'monday', ...][startTime.getDay()];
  
  // Get workers with matching skills
  let query = trx('mes.workers').where('isActive', true);
  
  if (requiredSkills && requiredSkills.length > 0) {
    requiredSkills.forEach(skill => {
      query = query.whereRaw(`skills::jsonb @> ?::jsonb`, [JSON.stringify([skill])]);
    });
  }
  
  const workers = await query;
  
  // Filter by status and absences
  const eligibleWorkers = workers.filter(w => {
    // 1. Status check
    const status = normalizeWorkerStatus(w);
    if (status === 'inactive' || status === 'break') {
      return false;
    }
    
    // 2. ✅ YENI: Absence check
    const absence = isWorkerAbsent(w, startTime);
    if (absence) {
      console.log(`⚠️  Worker ${w.name} is absent (${absence.type}): ${absence.startDate} - ${absence.endDate}`);
      return false;
    }
    
    return true;
  });
  
  // ... rest of the function
}
```

#### 3.4. Worker Details UI Güncellemesi

**Dosya:** `quote-portal/domains/production/js/workers.js`

**Yeni Bölüm Ekle:**

```javascript
function generateWorkerDetailContent(worker) {
  // ... existing code
  
  return `
    <!-- ... existing sections ... -->
    
    <!-- YENI: İzin/Hastalık Geçmişi -->
    <div class="detail-section">
      <div class="detail-section-header">
        <h4>📅 İzin ve Devamsızlık Kayıtları</h4>
        <button onclick="addWorkerAbsence('${worker.id}')" class="btn-secondary">
          + Yeni Ekle
        </button>
      </div>
      
      ${generateAbsencesList(worker.absences || [])}
    </div>
  `;
}

function generateAbsencesList(absences) {
  if (absences.length === 0) {
    return '<p style="color: var(--muted-foreground);">Kayıtlı izin/devamsızlık bulunmuyor.</p>';
  }
  
  const absenceTypeLabels = {
    vacation: '🏖️ Yıllık İzin',
    sick: '🤒 Hastalık',
    training: '📚 Eğitim',
    meeting: '👥 Toplantı',
    other: '📝 Diğer'
  };
  
  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>Tür</th>
          <th>Başlangıç</th>
          <th>Bitiş</th>
          <th>Sebep</th>
          <th>İşlemler</th>
        </tr>
      </thead>
      <tbody>
        ${absences.map(abs => `
          <tr>
            <td>${absenceTypeLabels[abs.type] || abs.type}</td>
            <td>${formatDate(abs.startDate)}</td>
            <td>${formatDate(abs.endDate)}</td>
            <td>${escapeHtml(abs.reason || '-')}</td>
            <td>
              <button onclick="deleteAbsence('${abs.id}')" class="btn-delete">Sil</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}
```

#### 3.5. Test Senaryoları

- [ ] Test 1: Worker izinli değil → Normal atama
- [ ] Test 2: Worker izinli → Atlanır, başka worker seçilir
- [ ] Test 3: İzin süresi task'tan önce bitiyor → Normal atama
- [ ] Test 4: İzin süresi task sırasında başlıyor → Atlanır
- [ ] Test 5: Tüm uygun worker'lar izinli → Hata mesajı

---

## FAZ 1B: ÜST SEVİYE FONKSİYONLAR

> **⚠️ BAĞIMLILIK:** Bu bölüm Faz 1A'daki helper fonksiyonları kullanır.  
> **Gereksinim:** Bölüm 1, 2, 3 tamamlanmış olmalı.

---

## 4. SHIFT BİTİŞİ VE GÜN GEÇİŞLERİ

### 🎯 Hedef
Task'ın birden fazla güne yayılması durumunda tatil/izin kontrolü yapmak ve doğru hesaplama.

### 🔗 Bağımlılıklar
- **Girdi:** `getWorkScheduleForDate()` (Bölüm 2), `findNextWorkingDay()` (Bölüm 2)
- **Çıktı:** Launch motor bu fonksiyonu kullanıyor (satır ~5650)
- **Güncellenen Fonksiyon:** `calculateEndTimeWithBreaks()` → ASYNC yapılacak

### 🎯 Hedef
Substation'ların durum yönetimini iyileştirmek ve setup time'ı hesaba katmak.

### ✅ KARAR

**İki Ayrı Alan:**
1. **General Status:** `active`, `inactive`, `maintenance`
2. **Working Status:** `available`, `working`, `reserved`

**Setup Time:**
- Station details'da setup time girme alanı eklenecek
- Launch motorunda `estimatedStartTime` ve `estimatedEndTime` hesaplanırken setup time eklenecek

### 📊 Veri Yapısı

**Substation Schema Güncelleme:**

```javascript
// mes.substations tablosu
{
  id: "ST-KA-001-01",
  name: "Kesim İstasyonu - 01",
  stationId: "ST-KA-001",
  
  // Mevcut alanlar:
  status: "available",  // available, working, reserved, maintenance
  isActive: true,
  currentAssignmentId: null,
  assignedWorkerId: null,
  
  // YENI ALANLAR:
  generalStatus: "active",  // active, inactive, maintenance
  workingStatus: "available",  // available, working, reserved
  
  setupTimeMinutes: 15,  // Setup/cleanup time in minutes
  lastMaintenanceDate: "2025-11-01T00:00:00Z",
  nextMaintenanceDate: "2026-02-01T00:00:00Z",
  
  // Planlı duruşlar için:
  plannedDowntime: [
    {
      id: "down-001",
      type: "maintenance",  // maintenance, setup, cleaning
      startTime: "2025-12-01T08:00:00Z",
      endTime: "2025-12-01T12:00:00Z",
      reason: "Periyodik bakım",
      createdBy: "maintenance@company.com"
    }
  ]
}
```

### 🔧 Yapılacaklar

#### 4.1. Database Migration

```javascript
// db/migrations/XXX_update_substations_status.js
exports.up = function(knex) {
  return knex.schema.table('mes.substations', function(table) {
    table.string('generalStatus').defaultTo('active');
    table.string('workingStatus').defaultTo('available');
    table.integer('setupTimeMinutes').defaultTo(0);
    table.timestamp('lastMaintenanceDate');
    table.timestamp('nextMaintenanceDate');
    table.jsonb('plannedDowntime').defaultTo('[]');
  });
};

exports.down = function(knex) {
  return knex.schema.table('mes.substations', function(table) {
    table.dropColumn('generalStatus');
    table.dropColumn('workingStatus');
    table.dropColumn('setupTimeMinutes');
    table.dropColumn('lastMaintenanceDate');
    table.dropColumn('nextMaintenanceDate');
    table.dropColumn('plannedDowntime');
  });
};
```

**Migration Script - Mevcut Veriyi Taşıma:**
```javascript
exports.up = async function(knex) {
  // Add new columns
  await knex.schema.table('mes.substations', function(table) {
    // ... column definitions
  });
  
  // Migrate existing status values
  await knex('mes.substations').update({
    generalStatus: knex.raw(`
      CASE 
        WHEN "isActive" = false THEN 'inactive'
        WHEN status = 'maintenance' THEN 'maintenance'
        ELSE 'active'
      END
    `),
    workingStatus: knex.raw(`
      CASE 
        WHEN status IN ('available', 'working', 'reserved') THEN status
        ELSE 'available'
      END
    `)
  });
};
```

#### 4.2. Helper Fonksiyonlar

```javascript
/**
 * Check if substation is available for work
 * @param {Object} substation - Substation object
 * @param {Date} startTime - Proposed start time
 * @param {Date} endTime - Proposed end time
 * @returns {boolean} True if available
 */
function isSubstationAvailable(substation, startTime, endTime) {
  // 1. General status check
  if (substation.generalStatus !== 'active') {
    console.log(`❌ Substation ${substation.name} is not active (${substation.generalStatus})`);
    return false;
  }
  
  // 2. Working status check
  if (substation.workingStatus !== 'available') {
    console.log(`❌ Substation ${substation.name} is not available (${substation.workingStatus})`);
    return false;
  }
  
  // 3. Planned downtime check
  if (substation.plannedDowntime && Array.isArray(substation.plannedDowntime)) {
    const startTimestamp = startTime.getTime();
    const endTimestamp = endTime.getTime();
    
    for (const downtime of substation.plannedDowntime) {
      const downtimeStart = new Date(downtime.startTime).getTime();
      const downtimeEnd = new Date(downtime.endTime).getTime();
      
      // Check if there's any overlap
      if (
        (startTimestamp >= downtimeStart && startTimestamp < downtimeEnd) ||
        (endTimestamp > downtimeStart && endTimestamp <= downtimeEnd) ||
        (startTimestamp <= downtimeStart && endTimestamp >= downtimeEnd)
      ) {
        console.log(`❌ Substation ${substation.name} has planned downtime: ${downtime.reason}`);
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Calculate actual start time including setup time
 * @param {Object} substation - Substation object
 * @param {Date} proposedStart - Proposed start time
 * @returns {Date} Actual start time (including setup)
 */
function calculateStartTimeWithSetup(substation, proposedStart) {
  const setupMinutes = parseInt(substation.setupTimeMinutes) || 0;
  
  if (setupMinutes > 0) {
    const actualStart = new Date(proposedStart);
    actualStart.setMinutes(actualStart.getMinutes() + setupMinutes);
    console.log(`⏱️  Setup time: ${setupMinutes} min → Start delayed to ${actualStart.toISOString()}`);
    return actualStart;
  }
  
  return proposedStart;
}
```

#### 4.3. Launch Motor Entegrasyonu

**Dosya:** `quote-portal/server/mesRoutes.js` (findEarliestSubstation)

```javascript
async function findEarliestSubstation(trx, stationOptions, substationSchedule, earliestStart) {
  let bestSubstation = null;
  let bestAvailableAt = null;
  
  for (const stationOpt of stationOptions) {
    const substations = await trx('mes.substations')
      .where('stationId', stationOpt.stationId)
      .where('isActive', true);
    
    for (const sub of substations) {
      // ✅ YENI: Check general status
      if (sub.generalStatus !== 'active') {
        console.log(`   ⏭️  Skipping ${sub.name}: not active (${sub.generalStatus})`);
        continue;
      }
      
      // Check memory schedule
      const schedule = substationSchedule.get(sub.id) || [];
      const lastTask = schedule[schedule.length - 1];
      let availableAt = lastTask ? lastTask.end : earliestStart;
      
      // ✅ YENI: Add setup time
      availableAt = calculateStartTimeWithSetup(sub, availableAt);
      
      // Check database end time
      if (sub.reservedUntil) {
        const dbEnd = new Date(sub.reservedUntil);
        if (dbEnd > availableAt) {
          availableAt = dbEnd;
        }
      }
      
      // ✅ YENI: Check planned downtime
      // (isSubstationAvailable fonksiyonu kullanılabilir)
      
      if (!bestAvailableAt || availableAt < bestAvailableAt) {
        bestSubstation = sub;
        bestAvailableAt = availableAt;
      }
    }
  }
  
  return { substation: bestSubstation, availableAt: bestAvailableAt };
}
```

#### 4.4. Station Details UI

**Dosya:** `quote-portal/domains/production/js/stations.js`

**Setup Time Input Ekleme:**

```javascript
function generateStationDetailContent(station) {
  return `
    <!-- Existing sections -->
    
    <!-- Substations with setup time -->
    <div class="detail-section">
      <h4>🔧 Alt İstasyonlar</h4>
      <table>
        <thead>
          <tr>
            <th>Kod</th>
            <th>Durum</th>
            <th>Çalışma Durumu</th>
            <th>Setup Süresi (dk)</th>
            <th>İşlemler</th>
          </tr>
        </thead>
        <tbody>
          ${station.subStations.map(sub => `
            <tr>
              <td>${sub.code}</td>
              <td>${formatGeneralStatus(sub.generalStatus)}</td>
              <td>${formatWorkingStatus(sub.workingStatus)}</td>
              <td>
                <input 
                  type="number" 
                  value="${sub.setupTimeMinutes || 0}" 
                  onchange="updateSetupTime('${sub.code}', this.value)"
                  min="0"
                  style="width: 60px;"
                />
              </td>
              <td>
                <button onclick="editSubstation('${sub.code}')">Düzenle</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
```

#### 4.5. Test Senaryoları

- [ ] Test 1: Active substation, no setup time → Immediate start
- [ ] Test 2: Active substation, 15 min setup → Start delayed by 15 min
- [ ] Test 3: Maintenance status → Substation skipped
- [ ] Test 4: Planned downtime conflict → Substation skipped
- [ ] Test 5: Setup time + break time → Correctly calculated end time

---

## 7. SHIFT UI BOZUKLUĞU DÜZELTME

### 🎯 Hedef
Gün geçişlerini düzgün yönetmek: tatil kontrolü, worker izin kontrolü, farklı schedule'lar.

### ✅ KARAR
Onaylandı - Gün geçişlerinde tatil, izin ve schedule kontrolü yapılacak.

### 📊 Mevcut Sorunlar

**Şu anki kod:**
```javascript
// calculateEndTimeWithBreaks içinde:
if (nextBlockIndex === -1) {
  // No more work blocks today - move to next day's first block
  currentTime.setDate(currentTime.getDate() + 1);
  currentTime.setHours(workBlocks[0].startHour, workBlocks[0].startMin, 0, 0);
}
```

**Problemler:**
1. ❌ Ertesi gün tatil olabilir (kontrol edilmiyor)
2. ❌ Ertesi gün farklı schedule olabilir (seasonal change)
3. ❌ Worker ertesi gün izinli olabilir
4. ❌ Hafta sonu geçişi düzgün değil
5. ❌ workBlocks[0] undefined olabilir (ertesi gün schedule yoksa)

### 🔧 Yapılacaklar

#### 5.1. calculateEndTimeWithBreaks Güncellemesi

**Dosya:** `quote-portal/server/mesRoutes.js`

**Değişiklik:**

```javascript
function calculateEndTimeWithBreaks(startTime, durationInMinutes, scheduleBlocks, worker, trx) {
  if (!scheduleBlocks || scheduleBlocks.length === 0) {
    // No schedule constraints - simple addition
    return new Date(startTime.getTime() + durationInMinutes * 60000);
  }
  
  let remainingDuration = durationInMinutes;
  let currentTime = new Date(startTime);
  
  // Get work blocks sorted by start time
  const workBlocks = scheduleBlocks
    .filter(b => b.type === 'work' && b.start && b.end)
    .map(b => {
      const [startHour, startMin] = b.start.split(':').map(Number);
      const [endHour, endMin] = b.end.split(':').map(Number);
      return {
        startHour, startMin, endHour, endMin,
        startMinutes: startHour * 60 + startMin,
        endMinutes: endHour * 60 + endMin
      };
    })
    .sort((a, b) => a.startMinutes - b.startMinutes);
  
  if (workBlocks.length === 0) {
    return new Date(startTime.getTime() + durationInMinutes * 60000);
  }
  
  // Iterate through work blocks until duration is consumed
  while (remainingDuration > 0) {
    const hour = currentTime.getHours();
    const minute = currentTime.getMinutes();
    const currentMinutes = hour * 60 + minute;
    
    // Find current or next work block
    let currentBlock = null;
    let nextBlock = null;
    
    for (const wb of workBlocks) {
      if (currentMinutes >= wb.startMinutes && currentMinutes < wb.endMinutes) {
        currentBlock = wb;
        break;
      } else if (currentMinutes < wb.startMinutes) {
        nextBlock = wb;
        break;
      }
    }
    
    if (currentBlock) {
      // We're in a work block
      const blockEndMinutes = currentBlock.endMinutes;
      const workableMinutes = blockEndMinutes - currentMinutes;
      
      if (remainingDuration <= workableMinutes) {
        currentTime = new Date(currentTime.getTime() + remainingDuration * 60000);
        remainingDuration = 0;
      } else {
        remainingDuration -= workableMinutes;
        currentTime.setHours(currentBlock.endHour, currentBlock.endMin, 0, 0);
        
        // Find next work block
        const nextBlockIndex = workBlocks.findIndex(wb => wb.startMinutes > currentBlock.endMinutes);
        if (nextBlockIndex === -1) {
          // ✅ IMPROVED: No more work blocks today - find next working day
          const nextWorkDay = await findNextWorkingDay(trx, currentTime, worker);
          
          if (!nextWorkDay) {
            throw new Error(`Cannot complete task: No working days available for worker ${worker?.name || 'Unknown'}`);
          }
          
          currentTime = nextWorkDay;
          
          // Get schedule for the new day
          const nextDaySchedule = await getWorkScheduleForDate(trx, currentTime, worker);
          
          if (nextDaySchedule.length === 0) {
            throw new Error(`No work schedule found for ${currentTime.toISOString().split('T')[0]}`);
          }
          
          // Rebuild work blocks for new day
          const newWorkBlocks = nextDaySchedule
            .filter(b => b.type === 'work' && b.start && b.end)
            .map(b => {
              const [startHour, startMin] = b.start.split(':').map(Number);
              const [endHour, endMin] = b.end.split(':').map(Number);
              return {
                startHour, startMin, endHour, endMin,
                startMinutes: startHour * 60 + startMin,
                endMinutes: endHour * 60 + endMin
              };
            })
            .sort((a, b) => a.startMinutes - b.startMinutes);
          
          if (newWorkBlocks.length === 0) {
            throw new Error(`No work blocks in schedule for ${currentTime.toISOString().split('T')[0]}`);
          }
          
          // Set to start of first work block
          const firstBlock = newWorkBlocks[0];
          currentTime.setHours(firstBlock.startHour, firstBlock.startMin, 0, 0);
          
          console.log(`   📅 Moved to next working day: ${currentTime.toISOString()}`);
          
          // Update workBlocks reference for next iteration
          workBlocks.length = 0;
          workBlocks.push(...newWorkBlocks);
        } else {
          // Move to next work block same day
          const nextWb = workBlocks[nextBlockIndex];
          currentTime.setHours(nextWb.startHour, nextWb.startMin, 0, 0);
        }
      }
    } else if (nextBlock) {
      // In a break - jump to next work block
      currentTime.setHours(nextBlock.startHour, nextBlock.startMin, 0, 0);
    } else {
      // ✅ IMPROVED: Past all work blocks - find next working day
      const nextWorkDay = await findNextWorkingDay(trx, currentTime, worker);
      
      if (!nextWorkDay) {
        throw new Error(`Cannot complete task: No working days available`);
      }
      
      currentTime = nextWorkDay;
      const nextDaySchedule = await getWorkScheduleForDate(trx, currentTime, worker);
      
      const newWorkBlocks = nextDaySchedule
        .filter(b => b.type === 'work')
        .map(b => {
          const [startHour, startMin] = b.start.split(':').map(Number);
          const [endHour, endMin] = b.end.split(':').map(Number);
          return {
            startHour, startMin, endHour, endMin,
            startMinutes: startHour * 60 + startMin,
            endMinutes: endHour * 60 + endMin
          };
        })
        .sort((a, b) => a.startMinutes - b.startMinutes);
      
      if (newWorkBlocks.length > 0) {
        currentTime.setHours(newWorkBlocks[0].startHour, newWorkBlocks[0].startMin, 0, 0);
        workBlocks.length = 0;
        workBlocks.push(...newWorkBlocks);
      }
    }
  }
  
  return currentTime;
}
```

**NOT:** Fonksiyon signature'ı değişti - artık `async` ve `worker`, `trx` parametreleri alıyor.

#### 5.2. Launch Motorunda Çağrı Güncellemesi

**Dosya:** `quote-portal/server/mesRoutes.js` (Launch endpoint)

```javascript
// Satır ~5649 civarı:
if (effectiveSchedule.length > 0) {
  // ÖNCE:
  // actualEnd = calculateEndTimeWithBreaks(actualStart, effectiveTimeMinutes, effectiveSchedule);
  
  // SONRA:
  actualEnd = await calculateEndTimeWithBreaks(
    actualStart, 
    effectiveTimeMinutes, 
    effectiveSchedule,
    worker,
    trx
  );
} else {
  actualEnd = new Date(actualStart.getTime() + effectiveTimeMinutes * 60000);
}
```

#### 5.3. Test Senaryoları

- [ ] Test 1: Task bir günde tamamlanıyor → Normal bitiş
- [ ] Test 2: Task gün bitimini geçiyor → Ertesi güne kayıyor
- [ ] Test 3: Ertesi gün tatil → Bir sonraki iş gününe kayıyor
- [ ] Test 4: Worker ertesi gün izinli → Başka iş gününe kayıyor
- [ ] Test 5: Task hafta sonunu geçiyor → Pazartesiye kayıyor
- [ ] Test 6: Ardışık tatiller → İlk iş gününe kayıyor
- [ ] Test 7: 30 gün içinde iş günü yok → Hata mesajı

---

---

## FAZ 4: OPSİYONEL GELİŞTİRMELER

> **💡 BİLGİ:** Bu bölümdeki geliştirmeler zorunlu değil, gelecekte eklenebilir.  
> **Öncelik:** Düşük - production-ready olmak için gerekli değil.

---

## 8. SUBSTATION DURUM VE SETUP TIME

### 🎯 Hedef
Worker çalışma saatlerinin doğru yönetildiğini doğrulamak.

### ✅ KARAR

**Overtime limit kontrolüne gerek yok!** 

Çünkü:
1. ✅ Master-data'da şirket çalışma saatleri zaten tanımlı
2. ✅ Worker personal schedule'da çalışma saatleri zaten tanımlı
3. ✅ Launch motor zaten bu saatlere göre planlama yapıyor
4. ✅ Shift sistemi var - worker hangi shift'te çalışıyorsa o saatler uygulanıyor

### 📊 Mevcut Yapı (Değişiklik YOK)

**Master-Data:**
```json
{
  "timeSettings": {
    "workType": "shift",
    "shiftByLane": {
      "1": {  // Shift 1: Sabah vardiyası
        "monday": [
          { "type": "work", "start": "08:00", "end": "12:00" },
          { "type": "break", "start": "12:00", "end": "13:00" },
          { "type": "work", "start": "13:00", "end": "17:00" }
        ]
      },
      "2": {  // Shift 2: Akşam vardiyası
        "monday": [
          { "type": "work", "start": "17:00", "end": "21:00" },
          { "type": "break", "start": "21:00", "end": "21:30" },
          { "type": "work", "start": "21:30", "end": "01:00" }
        ]
      }
    }
  }
}
```

**Worker Personal Schedule:**
```json
{
  "mode": "company",  // veya "personal"
  "shiftNo": "1",     // Shift 1 kullanıyor
  "blocks": {
    // Auto-populated from master-data when mode=company
    "monday": [...],
    "tuesday": [...]
  }
}
```

### 🔍 Doğrulama

Launch motor zaten şu kontrolleri yapıyor:
1. ✅ Worker schedule'a uygun start time seçiyor
2. ✅ Break time'ları atlıyor
3. ✅ Shift bitişinde bir sonraki çalışma gününe atlıyor
4. ✅ Worker'ın çalışma saatleri dışına iş atamıyor

### 💡 İyileştirme Önerisi (Opsiyonel)

Eğer **gerçek overtime tracking** (fazla mesai kayıtları) istiyorsanız:

```javascript
// Worker assignment tamamlandığında:
async function trackWorkerHours(trx, workerId, date, workedMinutes) {
  const dateStr = date.toISOString().split('T')[0];
  
  await trx('mes.worker_daily_hours')
    .insert({
      workerId,
      date: dateStr,
      regularMinutes: Math.min(workedMinutes, 480), // 8 hours
      overtimeMinutes: Math.max(0, workedMinutes - 480),
      createdAt: trx.fn.now()
    })
    .onConflict(['workerId', 'date'])
    .merge({
      regularMinutes: trx.raw('EXCLUDED.regularMinutes'),
      overtimeMinutes: trx.raw('EXCLUDED.overtimeMinutes')
    });
}
```

**Ama bu opsiyonel - şu an için gerekmiyor.**

---

## 7. isUrgent VE PRİORİTY SİSTEMİ

### 🎯 Hedef
`isUrgent` özelliğinin doğru çalıştığından emin olmak.

### ✅ KARAR

**Launch motorunda değişiklik YOK!**

Çünkü:
- `isUrgent` **launch sürecinde kullanılan bir özellik değil**
- Bu özellik **worker portal'da** kullanılıyor
- Launch edildikten sonra acil durumda worker'ın **sıra beklemeden** o işe başlayabilmesini sağlayan bir **shortcut**

### 📊 Mevcut Yapı (Değişiklik YOK)

**Worker Assignments:**
```sql
CREATE TABLE mes.worker_assignments (
  id SERIAL PRIMARY KEY,
  -- ... other fields
  isUrgent BOOLEAN DEFAULT false,
  priority INTEGER DEFAULT 0,
  status VARCHAR(50),
  sequenceNumber INTEGER,
  -- ...
);
```

**Kullanım Yeri:**

**A) Worker Portal - Task List Query:**
```javascript
// GET /api/mes/work-packages
router.get('/work-packages', withAuth, async (req, res) => {
  const query = db('mes.worker_assignments')
    .where('workerId', req.user.workerId)
    .orderBy([
      { column: 'isUrgent', order: 'desc' },      // Urgent first
      { column: 'priority', order: 'desc' },      // Then by priority
      { column: 'sequenceNumber', order: 'asc' }  // Then by sequence
    ]);
  
  // ...
});
```

**B) Work Order Actions (WO Tablosu):**
```javascript
// Worker portal'da "Aksiyonlar" bölümünde:
if (assignment.isUrgent) {
  // Worker bu işe hemen başlayabilir (sequence beklemez)
  return `<button onclick="startTask('${assignment.id}')">🚨 Acil - Hemen Başla</button>`;
} else if (assignment.sequenceNumber === 1) {
  // Normal durum - sadece ilk iş başlatılabilir
  return `<button onclick="startTask('${assignment.id}')">Başla</button>`;
} else {
  // Sıra bekliyor
  return `<span>Sıra bekliyor (${assignment.sequenceNumber})</span>`;
}
```

### 🔍 Doğrulama

Launch motor doğru çalışıyor:
1. ✅ Topological order'a göre bağımlılıkları sıralıyor
2. ✅ Worker'lara sequence number atıyor (1, 2, 3...)
3. ✅ İşler database'e `priority` ve `isUrgent` bilgisiyle kaydediliyor
4. ✅ Worker portal bu bilgileri kullanarak doğru sıralama yapıyor

**Değişiklik gerekmiyor.**

---

## 10. ISURGENT VE PRİORİTY SİSTEMİSİ

### 🎯 Hedef
Shift sayısı arttırıldığında UI'da timeline sütunlarının doğru şekilde oluşturulması.

### 🐛 Sorun

**Belirtilen Problem:**
> "Vardiya sayısını arttırınca gün içindeki zaman sütunu artmadı ve 2. shift'in saatlerini giremedim"

**Lokasyon:** `quote-portal/domains/production/js/main.js`

### 📊 Sorun Analizi

**Muhtemel Neden:**

```javascript
// setTimelineLaneCount fonksiyonu:
function setTimelineLaneCount(count) {
  const laneCount = Math.max(1, Math.min(7, parseInt(count, 10) || 1));
  
  // ❌ SORUN: Timeline sütunları yeniden oluşturulmuyor
  // Sadece lane count değişkeni güncelleniyor
  
  // DOM'da shift-monday, shift-tuesday vs. elementlerinin
  // içindeki lane (column) sayısı güncellenmeli
}
```

### 🔧 Yapılacaklar

#### 8.1. Timeline Column Regeneration

**Dosya:** `quote-portal/domains/production/js/main.js`

**Mevcut Fonksiyon (İncelenmeli):**
```javascript
function setTimelineLaneCount(count) {
  const validated = Math.max(1, Math.min(7, parseInt(count, 10) || 1));
  currentLaneCount = validated;
  
  // ✅ EKLE: Shift timeline'larını yeniden oluştur
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  
  days.forEach(day => {
    const container = document.getElementById(`blocks-shift-${day}`);
    if (!container) return;
    
    // Clear existing content
    container.innerHTML = '';
    
    // Create new lane columns
    for (let lane = 0; lane < validated; lane++) {
      const laneColumn = createTimelineLaneColumn(day, lane);
      container.appendChild(laneColumn);
    }
  });
  
  console.log(`✅ Timeline lanes updated: ${validated} lanes`);
}

function createTimelineLaneColumn(day, laneIndex) {
  const column = document.createElement('div');
  column.className = 'timeline-lane-column';
  column.dataset.day = day;
  column.dataset.laneIndex = laneIndex;
  
  // Add hour markers (0-24)
  const markers = document.createElement('div');
  markers.className = 'timeline-markers';
  for (let hour = 0; hour <= 24; hour++) {
    const marker = document.createElement('div');
    marker.className = 'hour-marker';
    marker.style.top = `${(hour / 24) * 100}%`;
    marker.textContent = `${hour.toString().padStart(2, '0')}:00`;
    markers.appendChild(marker);
  }
  column.appendChild(markers);
  
  // Add blocks container
  const blocksContainer = document.createElement('div');
  blocksContainer.className = 'day-timeline-vertical';
  blocksContainer.id = `blocks-shift-${day}-lane-${laneIndex}`;
  blocksContainer.dataset.day = day;
  blocksContainer.dataset.laneIndex = laneIndex;
  column.appendChild(blocksContainer);
  
  return column;
}
```

#### 8.2. Lane Count Input Event Handler

**HTML'de:**
```html
<input 
  type="number" 
  id="lane-count-input" 
  min="1" 
  max="7" 
  value="1"
  onchange="handleLaneCountChange(this.value)"
/>
```

**JavaScript:**
```javascript
function handleLaneCountChange(value) {
  const count = parseInt(value, 10);
  
  if (isNaN(count) || count < 1 || count > 7) {
    alert('Vardiya sayısı 1-7 arasında olmalıdır');
    return;
  }
  
  // Update UI
  setTimelineLaneCount(count);
  
  // Show confirmation
  showInfoToast(`Vardiya sayısı ${count} olarak güncellendi`);
}
```

#### 8.3. Existing Blocks Preservation

Eğer kullanıcı vardiya sayısını değiştirdiğinde **mevcut blokları korumak** istiyorsak:

```javascript
function setTimelineLaneCount(count) {
  const validated = Math.max(1, Math.min(7, parseInt(count, 10) || 1));
  currentLaneCount = validated;
  
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  
  days.forEach(day => {
    const container = document.getElementById(`blocks-shift-${day}`);
    if (!container) return;
    
    // ✅ PRESERVE: Save existing blocks before clearing
    const existingBlocks = [];
    const blockElements = container.querySelectorAll('[data-block-info]');
    blockElements.forEach(el => {
      const info = JSON.parse(el.dataset.blockInfo || '{}');
      existingBlocks.push(info);
    });
    
    // Clear and rebuild
    container.innerHTML = '';
    
    for (let lane = 0; lane < validated; lane++) {
      const laneColumn = createTimelineLaneColumn(day, lane);
      container.appendChild(laneColumn);
    }
    
    // ✅ RESTORE: Re-create blocks that fit in new lane count
    existingBlocks.forEach(blockInfo => {
      if (blockInfo.laneIndex < validated) {
        // Block still fits in new lane count
        createScheduleBlock(
          `shift-${day}`,
          blockInfo.type,
          blockInfo.startHour,
          blockInfo.endHour,
          blockInfo.startTime,
          blockInfo.endTime,
          blockInfo.laneIndex
        );
      }
    });
  });
  
  console.log(`✅ Timeline rebuilt with ${validated} lanes`);
}
```

#### 8.4. Backend Kayıt Güncellemesi

**Master-data kaydederken:**
```javascript
async function saveTimeManagement() {
  const workType = document.querySelector('input[name="work-type"]:checked')?.value || 'fixed';
  const laneCount = parseInt(document.getElementById('lane-count-input')?.value || '1', 10);
  
  // ... collect blocks from UI ...
  
  const timeSettingsData = { 
    workType, 
    laneCount,  // ✅ Save lane count
    fixedBlocks, 
    shiftBlocks, 
    shiftByLane 
  };
  
  // Save to database
  await saveMasterData({ timeSettings: timeSettingsData });
}
```

#### 8.5. Test Senaryoları

- [ ] Test 1: Lane count 1 → 2 → UI 2 sütun gösteriyor
- [ ] Test 2: Lane count 2 → 3 → Mevcut bloklar korunuyor
- [ ] Test 3: Lane count 3 → 1 → Lane 1'deki bloklar korunuyor, diğerleri siliniyor
- [ ] Test 4: Block ekleme → Doğru lane'de görünüyor
- [ ] Test 5: Sayfa yenileme → Kaydedilmiş lane count ve bloklar yükleniyor

---

## 📝 UYGULAMA PLANI (BAĞIMLILIK SIRASINA GÖRE)

### ⚠️ KRİTİK: SIRA ÇOK ÖNEMLİ!

Her adım bir öncekine bağımlıdır. Sıra değiştirilmemelidir.

---

### FAZ 1A: Temel Helper Fonksiyonlar (1 Gün) ⭐⭐⭐

**Bu fonksiyonlar diğerlerinin temeli - önce bunlar tamamlanmalı!**

1. **[Bölüm 1] Master-Data Hardcode Kaldırma**
   - [ ] `getDefaultWorkSchedule(trx, dayName, shiftNo)` → ASYNC yap
   - [ ] Database'den `mes.settings` → `master-data` çek
   - [ ] `timeSettings.fixedBlocks` / `shiftByLane` parse et
   - [ ] Console log ekle (debug için)
   - [ ] **Basit test:** Fonksiyonu doğrudan çağır, schedule dönüyor mu?

2. **[Bölüm 2] Tatil Helper Fonksiyonları**
   - [ ] `isHoliday(trx, date)` → ASYNC fonksiyon ekle
   - [ ] `getWorkScheduleForDate(trx, date, worker)` → ASYNC ekle
     - İçinde `getDefaultWorkSchedule()` ÇAĞIRIR (bağımlılık!)
   - [ ] `findNextWorkingDay(trx, startDate, worker)` → ASYNC ekle
     - İçinde `getWorkScheduleForDate()` ÇAĞIRIR (bağımlılık!)
   - [ ] **Test:** Tatil günü kontrol et, sonraki iş günü bulunuyor mu?

3. **[Bölüm 3] Worker Absence Helper**
   - [ ] `isWorkerAbsent(worker, date)` → SYNC fonksiyon ekle
   - [ ] Worker objesindeki `absences` array'ini kontrol et
   - [ ] **Test:** Absence date range kontrolü doğru mu?

**Faz 1A Sonunda:**
✅ Tüm temel helper'lar hazır  
✅ Birbirleriyle entegre  
✅ Test edilmiş

---

### FAZ 1B: Üst Seviye Fonksiyonlar (1 Gün) ⭐⭐

**Gereksinim:** Faz 1A tamamlanmış olmalı!

4. **[Bölüm 4] calculateEndTimeWithBreaks() Async Yapma**
   - [ ] Fonksiyon signature: `async function calculateEndTimeWithBreaks(trx, startTime, duration, worker)`
   - [ ] İçinde `getWorkScheduleForDate(trx, currentTime, worker)` ÇAĞIR
   - [ ] İçinde `findNextWorkingDay(trx, currentTime, worker)` ÇAĞIR
   - [ ] Gün geçişlerinde tatil/izin atla
   - [ ] **Test:** Multi-day task + holiday → Doğru hesaplama

**Faz 1B Sonunda:**
✅ Gün geçişi fonksiyonu hazır  
✅ Tatil/izin kontrolü dahil

---

### FAZ 2: Launch Motor Entegrasyonu (2 Gün) ⭐⭐⭐

**Gereksinim:** Faz 1A + 1B tamamlanmış olmalı!

5. **[Bölüm 5] Launch Motor Ana Döngü**
   
   **A) findWorkerWithShiftCheck() Güncelleme**
   - [ ] Worker filtreleme loop'una `isWorkerAbsent()` ekle
   - [ ] Absence varsa worker'ı filtrele
   - [ ] **Test:** İzinli worker atlanıyor mu?
   
   **B) getDefaultWorkSchedule Çağrıları**
   - [ ] Satır ~5627: `await getDefaultWorkSchedule(trx, dayOfWeek, shiftNo)`
   - [ ] Satır ~5645: `await getDefaultWorkSchedule(trx, dayOfWeek, shiftNo)`
   - [ ] **Test:** Master-data'dan doğru schedule geliyor mu?
   
   **C) calculateEndTimeWithBreaks Çağrısı**
   - [ ] Satır ~5650: `await calculateEndTimeWithBreaks(trx, actualStart, duration, worker)`
   - [ ] **Test:** End time hesabı doğru mu?
   
   **D) Tatil Kontrolü (Her Node)**
   - [ ] actualStart hesaplandıktan sonra `isHoliday()` çağır
   - [ ] Tatil ise `findNextWorkingDay()` ile reschedule
   - [ ] **Test:** Tatil günü atlanıyor mu?

**Faz 2 Sonunda:**
✅ Launch motor tamamen entegre  
✅ Tüm yeni fonksiyonlar kullanılıyor  
✅ End-to-end test başarılı

---

### FAZ 3: Database & UI (1 Gün) ⭐

**Gereksinim:** Faz 2 tamamlanmış, sistem çalışıyor olmalı!

6. **[Bölüm 6] Database Migration - Worker Absences**
   - [ ] Migration dosyası: `mes.workers` → `absences JSONB DEFAULT '[]'`
   - [ ] Migration çalıştır
   - [ ] Mevcut worker'lara test absence'ları ekle
   - [ ] **Test:** İzinli worker'la launch dene

7. **[Bölüm 7] Shift UI Bozukluğu**
   - [ ] `setTimelineLaneCount()` fonksiyonunu düzelt
   - [ ] DOM regeneration ekle
   - [ ] Mevcut blokları koruma
   - [ ] **Test:** Lane count değiştir, UI doğru mu?

**Faz 3 Sonunda:**
✅ Database schema complete  
✅ UI bug fixed  
✅ Production-ready sistem

---

### FAZ 4: Opsiyonel Geliştirmeler (İsteğe Bağlı) 💡

8. **[Bölüm 8] Substation Status & Setup Time**
9. **[Bölüm 9] Worker Overtime Limitleri**
10. **[Bölüm 10] isUrgent ve Priority Sistemi**

---

### 🎯 TOPLAM SÜRE TAHMİNİ

- **Faz 1A:** 1 gün (temel helper'lar)
- **Faz 1B:** 1 gün (üst seviye fonksiyonlar)
- **Faz 2:** 2 gün (launch motor entegrasyonu + kapsamlı test)
- **Faz 3:** 1 gün (database + UI)
- **Toplam:** 5 gün (production-ready sistem)
- **Faz 4:** +3-4 gün (opsiyonel)

---

## 🧪 TEST STRATEJİSİ

### Unit Tests
```javascript
// test/launch-motor.test.js
describe('Launch Motor', () => {
  describe('Master-Data Integration', () => {
    it('should fetch schedule from master-data', async () => {
      // ...
    });
  });
  
  describe('Holiday Handling', () => {
    it('should skip holidays', async () => {
      // ...
    });
    
    it('should use custom hours for half-day holidays', async () => {
      // ...
    });
  });
  
  describe('Worker Absence', () => {
    it('should not assign tasks to absent workers', async () => {
      // ...
    });
  });
});
```

### Integration Tests
```javascript
describe('End-to-End Launch', () => {
  it('should launch plan with holiday and worker absence', async () => {
    // Setup: Create plan, set holiday, mark worker absent
    // Execute: Launch plan
    // Assert: Correct worker selected, correct dates
  });
});
```

### Manual Test Checklist

- [ ] Hardcoded schedule kaldırıldı mı?
- [ ] Tatil günü atlaması çalışıyor mu?
- [ ] Worker izinli ise atlanıyor mu?
- [ ] Gün geçişi doğru mu?
- [ ] Shift UI düzgün çalışıyor mu?
- [ ] Setup time hesaplanıyor mu?

---

## DOKÜMANTASYON DURUMU

✅ **Tamamlanan Bölümler:** 1, 2, 3, 4, 5, 6, 7, 8  
📋 **Uygulama Planı:** Hazır  
🧪 **Test Stratejisi:** Tanımlandı  

**Son Güncelleme:** 25 Kasım 2025, 15:15

---

## 🚀 SONRAKİ ADIM

✅ **Dokümantasyon tamamlandı ve bağımlılık sırasına göre yeniden düzenlendi!**

### Başlangıç Noktası

**FAZ 1A - ADIM 1: Master-Data Hardcode Kaldırma**

Bu en temel ve en kritik adımdır. Diğer tüm fonksiyonlar buna bağımlıdır.

```
getDefaultWorkSchedule() → SYNC'den ASYNC'e dönüşüm
  ├─ Database'den mes.settings oku
  ├─ timeSettings.fixedBlocks / shiftByLane parse et
  └─ Schedule blocks dön
```

**Bu adımı tamamladıktan sonra:**
→ Bölüm 2 (Tatil Helper'ları) yapılabilir  
→ Bölüm 3 (Worker Absence) yapılabilir

**Hazır mısınız?** 🎯

Komut verdiğinizde `getDefaultWorkSchedule()` fonksiyonunu async yapıp database entegrasyonunu ekleyeceğim!
