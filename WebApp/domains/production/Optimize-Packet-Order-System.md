# 🎯 Optimize Packet Order System

## Genel Bakış

Bu doküman, üretim paketlerinin (work order assignments) sıralama ve optimizasyon sisteminin kapsamlı teknik spesifikasyonunu içerir. Sistem, mevcut FIFO (First In First Out) moduna paralel çalışacak, isteğe bağlı olarak etkinleştirilebilecek bir optimizasyon katmanı sunar.

**Doküman Tarihi:** 18 Kasım 2025  
**Versiyon:** 1.0  
**Kaynak:** LAUNCH-OPERATIONS.md APPENDIX D + Conversation Context

---

## İçindekiler

1. [Amaç ve Kapsam](#1-amaç-ve-kapsam)
2. [Optimization Modal – Non-Functional UI Taslağı](#2-optimization-modal--non-functional-ui-taslağı)
3. [Operations → Optimization Veri Akışı](#3-operations--optimization-veri-akışı)
4. [Optimization Engine – Model Girdileri ve Çıktıları](#4-optimization-engine--model-girdileri-ve-çıktıları)
5. [İşleyiş Takip Alanı (Model Roadmap)](#5-i̇şleyiş-takip-alanı-model-roadmap)

---

# 1. Amaç ve Kapsam

## 1.1 Projenin Amacı

Production Scheduling Optimization Module, mevcut FIFO (First In First Out) tabanlı üretim sıralama sistemine ek olarak, **öncelik bazlı (priority-based)** optimizasyon desteği getiren bir modüldür.

**Ana Hedefler:**
1. ✅ **Geriye Uyumluluk:** Mevcut FIFO sistemini korumak, hiçbir veriyi bozmamak
2. ✅ **Dual-Mode Mimari:** FIFO (varsayılan) ve Optimization (isteğe bağlı) modları paralel çalıştırmak
3. ✅ **Priority-Based Scheduling:** İş emirlerine öncelik verme (Low/Normal/High)
4. ✅ **Manuel + Otomatik Tetikleme:** Kullanıcı isteğine göre veya belirli olaylarda otomatik optimizasyon
5. ✅ **Real-Time Visualization:** Worker Portal'da güncel sıralama ve beklenen başlangıç zamanlarını gösterme

---

## 1.2 Sistem Mimarisi (Dual-Mode Design)

```
┌─────────────────────────────────────────────────────┐
│           PRODUCTION SCHEDULING SYSTEM              │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────┐         ┌──────────────────┐    │
│  │  FIFO MODE   │         │ OPTIMIZATION MODE│    │
│  │  (Default)   │         │   (Optional)     │    │
│  └──────────────┘         └──────────────────┘    │
│         │                          │               │
│         ├─ expectedStart            ├─ optimizedStart   │
│         ├─ Topological order        ├─ optimizedIndex   │
│         ├─ Simple queue             ├─ Priority-based   │
│         └─ No calculation           └─ Algorithm result │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │        COMMON LAYER                          │  │
│  ├──────────────────────────────────────────────┤  │
│  │ • isUrgent (UI button control)               │  │
│  │ • priority (1-3, optimization weight)        │  │
│  │ • Worker Portal (mode-aware sorting)         │  │
│  │ • Master Data Settings (mode toggle)         │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Mod Davranışları:**

| Özellik | FIFO Mode | Optimization Mode |
|---------|-----------|-------------------|
| **Sıralama Kriteri** | Topological order (dependencies) | Priority + algorithm result |
| **Başlangıç Zamanı** | expectedStart (plan launch sırasında hesaplanır) | optimizedStart (optimize endpoint hesaplar) |
| **Worker Portal Sorting** | expectedStart'a göre kronolojik | optimizedStart'a göre (varsa), yoksa expectedStart |
| **Priority Selection** | Gizli (default: 2) | Work order start popup'ta seçilebilir |
| **Optimize Button** | Görünmez | Work Orders sayfasında görünür |
| **Auto-Calculation** | Kapalı | Production Settings'ten aktif edilebilir |

---

## 1.3 Kapsam

### 1.3.1 Kapsam İçinde
- ✅ Production Settings UI (mode toggle, optimization ayarları)
- ✅ Work Order Priority Selection popup (optimization mode için)
- ✅ Manual "Optimize Schedule Now" butonu
- ✅ Production Mode Cache System (global state)
- ✅ Worker Portal UI updates (mode-aware sorting, priority badges)
- ✅ Schema extensions (Assignment + ProductionSettings documents)
- ✅ Optimization engine API endpoint placeholder
- ✅ Auto-calculation scheduler infrastructure

### 1.3.2 Kapsam Dışında (Gelecek Fazlar)
- ❌ Optimization algorithm implementation (Phase 3)
- ❌ Worker auto-assignment (future feature)
- ❌ Machine learning-based predictions
- ❌ Real-time resource optimization
- ❌ Cross-factory scheduling

---

## 1.4 Bağımlılıklar

**Tamamlanmış Olması Gereken Promtlar:**
- ✅ **PROMPT 1-12:** Foundation work (schema, urgent system, material reservation, vb.)
- ✅ **PROMPT 11:** Priority index removal + expectedStart, priority, optimizedIndex, optimizedStart fields eklenmesi

**Yeni Eklenecek Promtlar:**
- ⏳ **PROMPT 13:** Production Settings UI (Non-Functional)
- ⏳ **PROMPT 14:** Production Mode Cache System ⭐ (ÖNCE BU!)
- ⏳ **PROMPT 15:** Work Order Priority Popup (Conditional)
- ⏳ **PROMPT 16:** Manual Optimize Button (Conditional Visibility)

---

## 1.5 Conversation Context: Optimization Modal Tartışması

**Kullanıcı Sorusu (Özet):**
> "Optimization modda popup gösterilmesi gerekiyor mu, yoksa sadece Production Settings'ten mode değiştirince tüm sistem otomatik mu adapte olsun?"

**Karar:**
1. **Work Order Start Popup:**
   - FIFO modda: Popup YOK, direkt start (priority=2 default)
   - Optimization modda: Priority selection popup AÇILIR
   - Bu, kullanıcıya her iş emrinin önceliğini belirleme esnekliği sağlar

2. **Production Settings:**
   - Mode toggle (FIFO/Optimization)
   - Auto-calculation ayarları (interval, working hours, triggers)
   - Settings değişince cache güncellenir, tüm UI reactive olarak değişir

3. **Optimize Button:**
   - Sadece Optimization modunda görünür
   - Manuel tetikleme imkanı sağlar (otomatik hesaplamanın yanı sıra)
   - Real-time optimization ihtiyaçları için

**Teknik Karar:**
- **productionModeCache** global state kullanılacak
- App başlangıcında 1 kez Firestore'dan yüklenecek
- Tüm componentler cache'den okuyacak (Firestore query'si yok)
- Settings değişince cache invalidate olup yeniden yüklenecek

---

# 2. Optimization Modal – Non-Functional UI Taslağı

Bu bölüm, optimization modülü için gerekli tüm UI bileşenlerinin **NON-FUNCTIONAL** (görsel taslak) spesifikasyonlarını içerir. Backend entegrasyonu Phase 3'te yapılacaktır.

---

## 2.1 Production Settings Page (PROMPT 13)

**Öncelik:** 🟡 MEDIUM  
**Bağımlılık:** PROMPT 11 tamamlanmış olmalı  
**Süre:** ~60 dakika  
**Dosyalar:**
- `WebApp/domains/admin/pages/production-settings.html` (yeni)
- `WebApp/domains/admin/js/production-settings.js` (yeni)
- `WebApp/domains/admin/styles/production-settings.css` (yeni)

### 2.1.1 UI Layout

```
┌────────────────────────────────────────────────────────┐
│ Production Settings                                    │
├────────────────────────────────────────────────────────┤
│                                                        │
│ ┌──────────────────────────────────────────────────┐  │
│ │ 📋 Operations Management                         │  │
│ │ [Existing settings...]                           │  │
│ └──────────────────────────────────────────────────┘  │
│                                                        │
│ ┌──────────────────────────────────────────────────┐  │
│ │ 🎯 Production Scheduling                         │  │
│ │                                                  │  │
│ │ Scheduling Mode:                                 │  │
│ │ ┌─────────────────────────────────────────────┐ │  │
│ │ │  ○ FIFO (First In First Out)               │ │  │
│ │ │     Simple queue - tasks run in order      │ │  │
│ │ │                                             │ │  │
│ │ │  ● Optimization                             │ │  │
│ │ │     AI-powered scheduling with priorities  │ │  │
│ │ └─────────────────────────────────────────────┘ │  │
│ │                                                  │  │
│ │ ┌─────────────────────────────────────────────┐ │  │
│ │ │ ⚙️ Optimization Settings                   │ │  │
│ │ │ (Only visible if Optimization selected)    │ │  │
│ │ │                                             │ │  │
│ │ │ Auto-Calculation:                           │ │  │
│ │ │ ☑ Enable automatic schedule optimization   │ │  │
│ │ │                                             │ │  │
│ │ │ Calculation Interval:                       │ │  │
│ │ │ [60] minutes                                │ │  │
│ │ │                                             │ │  │
│ │ │ Working Hours Constraint:                   │ │  │
│ │ │ ☐ Calculate only outside working hours    │ │  │
│ │ │                                             │ │  │
│ │ │ ┌──────────────────────────────────────┐   │ │  │
│ │ │ │ Working Hours:                       │   │ │  │
│ │ │ │ Start: [08:00] End: [18:00]          │   │ │  │
│ │ │ └──────────────────────────────────────┘   │ │  │
│ │ │                                             │ │  │
│ │ │ Automatic Triggers:                         │ │  │
│ │ │ ☑ Optimize on new work order launch        │ │  │
│ │ │ ☑ Optimize on priority change              │ │  │
│ │ │ ☐ Optimize on resource change              │ │  │
│ │ └─────────────────────────────────────────────┘ │  │
│ └──────────────────────────────────────────────────┘  │
│                                                        │
│ ┌──────────────────────────────────────────────────┐  │
│ │ 👷 Worker Assignment Mode                        │  │
│ │                                                  │  │
│ │ Assignment Method:                               │  │
│ │ ● Manual Assignment (Current)                    │  │
│ │ ○ Automatic Assignment (Future)                  │  │
│ │                                                  │  │
│ │ ℹ️ Automatic assignment coming soon...          │  │
│ └──────────────────────────────────────────────────┘  │
│                                                        │
│                            [Cancel]  [Save Settings]  │
└────────────────────────────────────────────────────────┘
```

### 2.1.2 Component Structure

```html
<div class="production-settings-page">
  <h1>Production Settings</h1>
  
  <section class="operations-management">
    <!-- Existing operations settings -->
  </section>
  
  <section class="scheduling-settings">
    <h2>🎯 Production Scheduling</h2>
    
    <div class="mode-selector">
      <label>
        <input type="radio" name="mode" value="fifo" checked>
        <strong>FIFO (First In First Out)</strong>
        <p>Simple queue - tasks run in order</p>
      </label>
      
      <label>
        <input type="radio" name="mode" value="optimized">
        <strong>Optimization</strong>
        <p>AI-powered scheduling with priorities</p>
      </label>
    </div>
    
    <div id="optimization-panel" class="collapsible" style="display: none;">
      <h3>⚙️ Optimization Settings</h3>
      
      <label>
        <input type="checkbox" id="auto-calc-enabled">
        Enable automatic schedule optimization
      </label>
      
      <label>
        Calculation Interval:
        <input type="number" id="calc-interval" value="60" min="15" max="240"> minutes
      </label>
      
      <label>
        <input type="checkbox" id="working-hours-constraint">
        Calculate only outside working hours
      </label>
      
      <div id="working-hours-inputs" style="display: none;">
        Start: <input type="time" id="work-start" value="08:00">
        End: <input type="time" id="work-end" value="18:00">
      </div>
      
      <fieldset>
        <legend>Automatic Triggers:</legend>
        <label><input type="checkbox" checked> Optimize on new work order launch</label>
        <label><input type="checkbox" checked> Optimize on priority change</label>
        <label><input type="checkbox"> Optimize on resource change</label>
      </fieldset>
    </div>
  </section>
  
  <section class="worker-assignment">
    <h2>👷 Worker Assignment Mode</h2>
    <label>
      <input type="radio" name="assignment" value="manual" checked>
      Manual Assignment (Current)
    </label>
    <label>
      <input type="radio" name="assignment" value="automatic" disabled>
      Automatic Assignment (Future)
    </label>
    <p class="info">ℹ️ Automatic assignment coming soon...</p>
  </section>
  
  <div class="actions">
    <button class="cancel-btn">Cancel</button>
    <button class="save-btn">Save Settings</button>
  </div>
</div>
```

### 2.1.3 JavaScript Logic (Non-Functional)

```javascript
// Mode toggle handler
document.querySelectorAll('input[name="mode"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    const panel = document.getElementById('optimization-panel');
    panel.style.display = e.target.value === 'optimized' ? 'block' : 'none';
  });
});

// Working hours constraint toggle
document.getElementById('working-hours-constraint').addEventListener('change', (e) => {
  const inputs = document.getElementById('working-hours-inputs');
  inputs.style.display = e.target.checked ? 'block' : 'none';
});

// Save button (dummy alert)
document.querySelector('.save-btn').addEventListener('click', () => {
  alert('Settings saved! (Non-functional UI - Phase 2a)');
});
```

### 2.1.4 Test Checklist

- ✅ FIFO seçilince Optimization panel gizli
- ✅ Optimization seçilince panel görünür
- ✅ Auto-calculation checkbox çalışıyor
- ✅ Working hours constraint toggle çalışıyor
- ✅ Save butonu alert gösteriyor
- ✅ Worker assignment dropdown disabled

---

## 2.2 Work Order Priority Popup (PROMPT 15)

**Öncelik:** 🟡 MEDIUM  
**Bağımlılık:** PROMPT 14 (cache system) tamamlanmış olmalı  
**Süre:** ~40 dakika  
**Dosyalar:**
- `WebApp/domains/orders/components/start-wo-modal.html` (yeni)
- `WebApp/domains/orders/js/start-wo-modal.js` (yeni)
- `WebApp/domains/orders/styles/start-wo-modal.css` (yeni)

### 2.2.1 Modal Layout

```
┌─────────────────────────────────────┐
│ Start Work Order: WO-001            │
├─────────────────────────────────────┤
│                                     │
│ 📊 Select Priority Level:           │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │  ○ Low Priority (1)             │ │
│ │     Can be delayed if needed    │ │
│ ├─────────────────────────────────┤ │
│ │  ● Normal Priority (2)          │ │
│ │     Standard scheduling         │ │
│ ├─────────────────────────────────┤ │
│ │  ○ High Priority (3)            │ │
│ │     Prioritize in schedule      │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ℹ️ Priority affects optimization    │
│    algorithm's scheduling decisions │
│                                     │
│ 🚨 Need immediate start?            │
│ ☐ Mark as Urgent                   │
│   (allows parallel execution)      │
│                                     │
│              [Cancel]  [Start WO]  │
└─────────────────────────────────────┘
```

### 2.2.2 Conditional Display Logic

**FIFO Mode:**
- Popup **gösterilmez**
- Start butonu → Direkt `startWorkOrder(woCode, { priority: 2, isUrgent: false })`

**Optimization Mode:**
- Popup **açılır**
- Kullanıcı priority seçer (1-3)
- isUrgent checkbox optional
- Start → `startWorkOrder(woCode, { priority, isUrgent })`

```javascript
import productionModeCache from '../../../shared/state/productionMode.js';

function handleStartWorkOrder(workOrderCode) {
  const mode = productionModeCache.getMode();
  
  if (mode === 'optimized') {
    openPriorityPopup(workOrderCode);
  } else {
    startWorkOrderDirectly(workOrderCode, { priority: 2, isUrgent: false });
  }
}
```

### 2.2.3 HTML Structure

```html
<div id="start-wo-modal" class="modal" style="display: none;">
  <div class="modal-content">
    <div class="modal-header">
      <h2>Start Work Order: <span id="wo-code"></span></h2>
      <button class="close-btn">&times;</button>
    </div>
    
    <div class="modal-body">
      <div class="priority-section">
        <h3>📊 Select Priority Level:</h3>
        
        <div class="priority-options">
          <label class="priority-option">
            <input type="radio" name="priority" value="1">
            <div class="option-content">
              <strong>Low Priority (1)</strong>
              <p>Can be delayed if needed</p>
            </div>
          </label>
          
          <label class="priority-option">
            <input type="radio" name="priority" value="2" checked>
            <div class="option-content">
              <strong>Normal Priority (2)</strong>
              <p>Standard scheduling</p>
            </div>
          </label>
          
          <label class="priority-option">
            <input type="radio" name="priority" value="3">
            <div class="option-content">
              <strong>High Priority (3)</strong>
              <p>Prioritize in schedule</p>
            </div>
          </label>
        </div>
        
        <p class="info-text">
          ℹ️ Priority affects optimization algorithm's scheduling decisions
        </p>
      </div>
      
      <div class="urgent-section">
        <h3>🚨 Urgent Execution</h3>
        <label class="checkbox-label">
          <input type="checkbox" id="is-urgent">
          <span>Mark as Urgent (allows parallel execution)</span>
        </label>
      </div>
    </div>
    
    <div class="modal-footer">
      <button class="btn-secondary cancel-btn">Cancel</button>
      <button class="btn-primary start-btn">Start Work Order</button>
    </div>
  </div>
</div>
```

### 2.2.4 Test Scenarios

**Test 1: FIFO Mode**
```
1. Set mode = 'fifo' in cache
2. Click "Start" on WO-001
3. Expected: NO popup, direct start, priority=2
```

**Test 2: Optimization Mode**
```
1. Set mode = 'optimized' in cache
2. Click "Start" on WO-001
3. Expected: Popup opens with priority selection
4. Select High (3) + Check Urgent
5. Click Start
6. Expected: Launch with priority=3, isUrgent=true
```

**Test 3: Mode Switch (No Reload)**
```
1. Start in FIFO → No popup ✅
2. Switch to Optimization in Settings
3. Click Start → Popup shows ✅
4. No page reload needed ✅
```

---

## 2.3 Manual Optimize Button (PROMPT 16)

**Öncelik:** 🟢 LOW  
**Bağımlılık:** PROMPT 14, 15 tamamlanmış olmalı  
**Süre:** ~30 dakika  
**Dosyalar:**
- `WebApp/pages/quote-dashboard.html` (güncelle)
- `WebApp/domains/orders/js/work-orders.js` (güncelle)

### 2.3.1 Button Layout

```
┌────────────────────────────────────────────────────────────┐
│ Work Orders                                  [+ New WO]    │
├────────────────────────────────────────────────────────────┤
│                                                            │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ Filters: [All] [Active] [Completed] [Cancelled]     │  │
│ │                                                      │  │
│ │ Scheduling Mode: Optimization                        │  │
│ │ [🎯 Optimize Schedule Now]  Last run: 2 hours ago   │  │
│ └──────────────────────────────────────────────────────┘  │
```

### 2.3.2 Conditional Visibility Logic

```javascript
import productionModeCache from '../../../shared/state/productionMode.js';

function initOptimizeSection() {
  const optimizeSection = document.getElementById('optimize-section');
  
  // Initial visibility
  updateOptimizeSectionVisibility();
  
  // Subscribe to mode changes (reactive)
  productionModeCache.subscribe((newMode) => {
    updateOptimizeSectionVisibility();
  });
  
  // Button handler
  document.getElementById('optimize-btn').addEventListener('click', handleOptimize);
}

function updateOptimizeSectionVisibility() {
  const optimizeSection = document.getElementById('optimize-section');
  const isOptimizationMode = productionModeCache.isOptimizationMode();
  
  optimizeSection.style.display = isOptimizationMode ? 'block' : 'none';
}
```

### 2.3.3 Button HTML

```html
<div id="optimize-section" class="optimize-section" style="display: none;">
  <div class="mode-indicator">
    <span class="mode-label">Scheduling Mode:</span>
    <span class="mode-value">Optimization</span>
  </div>
  
  <button id="optimize-btn" class="optimize-btn">
    <span class="icon">🎯</span>
    <span class="text">Optimize Schedule Now</span>
  </button>
  
  <div class="last-run">
    Last run: <span id="last-run-time">Never</span>
  </div>
</div>
```

### 2.3.4 Dummy Handler (Phase 2a)

```javascript
async function handleOptimize() {
  const btn = document.getElementById('optimize-btn');
  
  // Show loading state
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Optimizing...';
  
  // Simulate optimization (dummy)
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Reset button
  btn.disabled = false;
  btn.innerHTML = '<span class="icon">🎯</span><span class="text">Optimize Schedule Now</span>';
  
  // Update last run time
  const now = new Date().toLocaleString('tr-TR');
  document.getElementById('last-run-time').textContent = now;
  
  // Show alert (Phase 3'te gerçek API çağrısı olacak)
  alert('Schedule optimized! (Demo - Phase 3'te gerçek optimizasyon)');
}
```

### 2.3.5 Test Checklist

- ✅ FIFO mode → Button gizli
- ✅ Optimization mode → Button görünür
- ✅ Mode değişince reactive update (cache listener)
- ✅ Button click → Loading state
- ✅ 2 saniye sonra → Success state
- ✅ Last run time güncelleniyor

---

# 3. Operations → Optimization Veri Akışı

Bu bölüm, work order launch'tan başlayarak optimization engine'e kadar olan veri akışını ve schema değişikliklerini detaylandırır.

---

## 3.1 Genel Veri Akışı

```
┌─────────────────────┐
│ Work Order Launch   │
│ (User initiates)    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────┐
│  Launch Endpoint                    │
│  - Read schedulingMode from cache   │
│  - Create assignments with:         │
│    * expectedStart (FIFO baseline)  │
│    * priority (from popup or 2)     │
│    * optimizedIndex = null          │
│    * optimizedStart = null          │
│    * schedulingMode = cache.mode    │
└──────────┬──────────────────────────┘
           │
           ├─────────────────┬─────────────────┐
           ▼                 ▼                 ▼
   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
   │ FIFO Mode    │  │ Manual       │  │ Auto-Trigger │
   │ (Skip opt)   │  │ Optimize Btn │  │ (Settings)   │
   └──────────────┘  └──────┬───────┘  └──────┬───────┘
                            │                  │
                            └──────┬───────────┘
                                   ▼
                        ┌──────────────────────┐
                        │ Optimization Engine  │
                        │ - Read assignments   │
                        │ - Calculate schedule │
                        │ - Write optimized*   │
                        └──────────┬───────────┘
                                   ▼
                        ┌──────────────────────┐
                        │ Worker Portal        │
                        │ - Sort by mode       │
                        │ - Show badges        │
                        └──────────────────────┘
```

---

## 3.2 Schema Extensions

### 3.2.1 Assignment Document (Firestore)

```typescript
interface Assignment {
  // ═══════════════════════════════════════════════
  // EXISTING FIELDS (Unchanged)
  // ═══════════════════════════════════════════════
  id: string;
  workOrderCode: string;
  nodeId: string;
  operationName: string;
  status: 'pending' | 'ready' | 'in-progress' | 'completed' | 'cancelled';
  substationId: string | null;
  assignedWorker: string | null;
  
  // Material reservation
  materialReservations: Array<{
    materialCode: string;
    requiredQuantity: number;
    reservationId: string;
    status: 'reserved' | 'committed';
  }>;
  
  // Urgent system
  isUrgent: boolean;  // UI button control (can start parallel)
  
  // Timestamps
  startedAt: Timestamp | null;
  completedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // ═══════════════════════════════════════════════
  // NEW: DUAL-MODE SCHEDULING FIELDS
  // ═══════════════════════════════════════════════
  
  // FIFO Mode (Always Set)
  expectedStart: Timestamp;  // Topological order start time
  
  // Priority (User-Defined or Default)
  priority: 1 | 2 | 3;  // 1=Low, 2=Normal, 3=High
  
  // Optimization Mode (Set by Algorithm)
  optimizedIndex: number | null;  // Calculated sequence number
  optimizedStart: Timestamp | null;  // Calculated start time
  
  // Current Scheduling Mode
  schedulingMode: 'fifo' | 'optimized';  // Which mode was used at launch
}
```

**Field Descriptions:**

| Field | Type | Description | Set By | When |
|-------|------|-------------|--------|------|
| `expectedStart` | Timestamp | Topological order start time | Launch endpoint | Always (both modes) |
| `priority` | 1-3 | User-defined priority weight | Work order start popup (or default 2) | Always |
| `optimizedIndex` | number\|null | Optimized sequence number | Optimization algorithm | Only in optimized mode |
| `optimizedStart` | Timestamp\|null | Optimized start time | Optimization algorithm | Only in optimized mode |
| `schedulingMode` | 'fifo'\|'optimized' | Active mode at launch | Launch endpoint (reads from cache) | Always |

---

### 3.2.2 ProductionSettings Document (Firestore)

```typescript
interface ProductionSettings {
  // ═══════════════════════════════════════════════
  // EXISTING FIELDS
  // ═══════════════════════════════════════════════
  operations: {
    // ... existing operations config
  };
  
  // ═══════════════════════════════════════════════
  // NEW: SCHEDULING CONFIGURATION
  // ═══════════════════════════════════════════════
  scheduling: {
    mode: 'fifo' | 'optimized';  // System-wide default
    
    optimization: {
      enabled: boolean;  // Master toggle
      
      autoCalculation: {
        enabled: boolean;
        intervalMinutes: number;  // Default: 60
        onlyOutsideWorkHours: boolean;
        workingHours: {
          start: string;  // HH:MM format (e.g., "08:00")
          end: string;    // HH:MM format (e.g., "18:00")
        };
      };
      
      triggers: {
        onNewWorkOrder: boolean;      // Default: true
        onPriorityChange: boolean;    // Default: true
        onResourceChange: boolean;    // Default: false
      };
    };
  };
  
  // ═══════════════════════════════════════════════
  // FUTURE: WORKER ASSIGNMENT MODE
  // ═══════════════════════════════════════════════
  workerAssignment: {
    mode: 'manual' | 'automatic';  // Future expansion
    // ... (will be defined later)
  };
}
```

**Default Values:**

```json
{
  "scheduling": {
    "mode": "fifo",
    "optimization": {
      "enabled": false,
      "autoCalculation": {
        "enabled": false,
        "intervalMinutes": 60,
        "onlyOutsideWorkHours": false,
        "workingHours": {
          "start": "08:00",
          "end": "18:00"
        }
      },
      "triggers": {
        "onNewWorkOrder": true,
        "onPriorityChange": true,
        "onResourceChange": false
      }
    }
  },
  "workerAssignment": {
    "mode": "manual"
  }
}
```

---

## 3.3 Launch Endpoint Updates

**Dosya:** `WebApp/server/mesRoutes.js`

### 3.3.1 Priority Parameter Extraction

```javascript
router.post('/launch-plan', async (req, res) => {
  const { workOrderCode, priority, isUrgent } = req.body;
  
  // ✅ Validate priority
  const validPriority = [1, 2, 3].includes(priority) ? priority : 2;
  
  // ✅ Read scheduling mode from cache (Phase 2b'de implement edilecek)
  const schedulingMode = 'fifo';  // Placeholder, Phase 2b'de productionModeCache'den okunacak
  
  // ... rest of launch logic
});
```

### 3.3.2 Assignment Creation with New Fields

```javascript
executionOrder.order.forEach((nodeId, index) => {
  const node = nodesToUse.find(n => getNodeId(n) === nodeId);
  if (!node) return;
  
  // ✅ Calculate expectedStart (FIFO baseline)
  const expectedStart = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + index * 3600000)  // 1 hour intervals
  );
  
  const assignment = {
    id: admin.firestore().collection('assignments').doc().id,
    workOrderCode,
    nodeId: getNodeId(node),
    operationName: node.operationName || node.name,
    status: 'pending',
    
    // ✅ NEW: Dual-mode fields
    expectedStart,
    priority: validPriority,
    optimizedIndex: null,
    optimizedStart: null,
    schedulingMode,
    
    // Existing fields
    isUrgent: isUrgent || false,
    substationId: null,
    assignedWorker: null,
    materialReservations: [],
    
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  
  assignmentsArray.push(assignment);
});
```

**⚠️ Değişiklikler:**
- ✅ `expectedStart` her zaman hesaplanıyor (FIFO baseline)
- ✅ `priority` parameter'dan alınıyor (default: 2)
- ✅ `optimizedIndex`, `optimizedStart` başlangıçta `null`
- ✅ `schedulingMode` cache'den okunuyor (şimdilik hardcoded 'fifo')
- ❌ `priorityIndex` KALDIRILDI (PROMPT 11'de temizlendi)

---

## 3.4 Worker Portal Sorting Logic

**Dosya:** `WebApp/domains/workerPortal/workerPortal.js`

### 3.4.1 Mode-Aware Sorting

```javascript
// ✅ Dual-mode sorting (PROMPT 11'de implement edildi)
activeTasks.sort((a, b) => {
  // Optimization mode: Use optimizedStart if available
  const timeA = a.schedulingMode === 'optimized' && a.optimizedStart 
    ? a.optimizedStart.toMillis() 
    : (a.expectedStart ? a.expectedStart.toMillis() : 0);
  
  const timeB = b.schedulingMode === 'optimized' && b.optimizedStart 
    ? b.optimizedStart.toMillis() 
    : (b.expectedStart ? b.expectedStart.toMillis() : 0);
  
  return timeA - timeB;
});

console.log(`🔍 Worker Portal sorting (${activeTasks[0]?.schedulingMode || 'fifo'}):`, 
  activeTasks.map(t => ({
    op: t.operationName,
    mode: t.schedulingMode,
    expected: t.expectedStart?.toDate(),
    optimized: t.optimizedStart?.toDate()
  }))
);
```

**Davranış:**
- **FIFO mode:** `expectedStart`'a göre sırala
- **Optimization mode:** `optimizedStart` varsa onu kullan, yoksa `expectedStart` fallback

---

## 3.5 Production Mode Cache System (PROMPT 14)

**Dosya:** `WebApp/shared/state/productionMode.js` (YENİ)

### 3.5.1 Cache Module

```javascript
class ProductionModeCache {
  constructor() {
    this.schedulingMode = 'fifo';  // Default
    this.isLoaded = false;
    this.listeners = [];  // Reactive updates
  }
  
  async load() {
    try {
      const db = firebase.firestore();
      const doc = await db.collection('settings').doc('production').get();
      
      if (doc.exists) {
        const data = doc.data();
        this.schedulingMode = data.scheduling?.mode || 'fifo';
        this.isLoaded = true;
        
        console.log('✅ Production mode loaded:', this.schedulingMode);
        this.notifyListeners();
      }
    } catch (error) {
      console.error('❌ Failed to load production mode:', error);
      this.schedulingMode = 'fifo';  // Fallback
      this.isLoaded = true;
    }
  }
  
  getMode() {
    return this.schedulingMode;
  }
  
  isOptimizationMode() {
    return this.schedulingMode === 'optimized';
  }
  
  setMode(newMode) {
    this.schedulingMode = newMode;
    this.notifyListeners();
  }
  
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }
  
  notifyListeners() {
    this.listeners.forEach(callback => callback(this.schedulingMode));
  }
}

const productionModeCache = new ProductionModeCache();
export default productionModeCache;
```

### 3.5.2 App Initialization

**Dosya:** `WebApp/src/main.js`

```javascript
import productionModeCache from '../shared/state/productionMode.js';

async function initApp() {
  await initFirebase();
  await loadUserData();
  
  // ✅ Load production mode ONCE at startup
  await productionModeCache.load();
  
  renderNavigation();
}

document.addEventListener('DOMContentLoaded', initApp);
```

**Avantajlar:**
- ✅ 1 Firestore query at app start
- ✅ 0 Firestore queries for subsequent checks
- ✅ Synchronous access (no await needed)
- ✅ Reactive updates when mode changes

---

## 3.6 Veri Akışı Özeti

### 3.6.1 FIFO Mode Flow

```
1. User clicks "Start WO" → No popup
2. Launch endpoint:
   - priority = 2 (default)
   - expectedStart = topological order
   - schedulingMode = 'fifo'
   - optimizedIndex = null
   - optimizedStart = null
3. Firestore write
4. Worker Portal:
   - Sort by expectedStart
   - Show "NORMAL" priority badge
   - No optimization indicator
```

### 3.6.2 Optimization Mode Flow (Phase 3)

```
1. User clicks "Start WO" → Priority popup opens
2. User selects priority (e.g., High=3) + isUrgent
3. Launch endpoint:
   - priority = 3
   - expectedStart = topological order (baseline)
   - schedulingMode = 'optimized'
   - optimizedIndex = null (will be set by algorithm)
   - optimizedStart = null (will be set by algorithm)
4. Firestore write
5. Auto-trigger (if enabled):
   → Call /api/mes/optimize-schedule
6. Optimization algorithm:
   - Read all pending assignments
   - Calculate optimized sequence
   - Update optimizedIndex + optimizedStart
7. Worker Portal:
   - Sort by optimizedStart (fallback: expectedStart)
   - Show "HIGH" priority badge
   - Show "🎯 Optimized" indicator
```

---

# 4. Optimization Engine – Model Girdileri ve Çıktıları

Bu bölüm, optimization algorithm'ünün (Phase 3'te implement edilecek) **girdilerini, çıktılarını ve çalışma mantığını** tanımlar.

---

## 4.1 API Endpoint Spesifikasyonu

### 4.1.1 Endpoint Definition

```
POST /api/mes/optimize-schedule
```

**Request Body:**
```json
{
  "mode": "manual" | "automatic",
  "scope": "all" | "workOrderCode",
  "workOrderCode": "WO-001"  // Optional, if scope = "workOrderCode"
}
```

**Response:**
```json
{
  "success": true,
  "tasksUpdated": 15,
  "executionTimeMs": 450,
  "changes": [
    {
      "assignmentId": "abc123",
      "oldIndex": null,
      "newIndex": 3,
      "oldStart": "2025-11-18T08:00:00Z",
      "newStart": "2025-11-18T09:30:00Z"
    }
  ]
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "No pending assignments found",
  "code": "NO_TASKS"
}
```

---

## 4.2 Algorithm Girdileri (Inputs)

### 4.2.1 Firestore Data Collection

**1. Pending Assignments**
```javascript
const pendingAssignments = await db.collection('assignments')
  .where('status', '==', 'pending')
  .where('schedulingMode', '==', 'optimized')
  .get();
```

**Kullanılan Alanlar:**
- `nodeId` → Dependency graph için
- `predecessors` → Topological order için
- `priority` → Weight hesaplama için
- `expectedStart` → Baseline start time
- `workOrderCode` → Grouping için

**2. Resource Availability**
```javascript
// Workers
const workers = await db.collection('workers')
  .where('status', '==', 'active')
  .get();

// Substations
const substations = await db.collection('substations')
  .where('isActive', '==', true)
  .get();

// Materials
const materials = await db.collection('materials')
  .where('stockLevel', '>', 0)
  .get();
```

**3. Production Settings**
```javascript
const settings = await db.collection('settings')
  .doc('production')
  .get();

const optimizationConfig = settings.data().scheduling.optimization;
```

---

## 4.2.2 Dependency Graph Construction

```javascript
/**
 * Build dependency graph from assignments
 */
function buildDependencyGraph(assignments) {
  const graph = new Map();
  
  assignments.forEach(assignment => {
    const nodeId = assignment.nodeId;
    const predecessors = assignment.predecessors || [];
    
    if (!graph.has(nodeId)) {
      graph.set(nodeId, {
        assignment,
        predecessors: [],
        successors: []
      });
    }
    
    predecessors.forEach(predId => {
      if (graph.has(predId)) {
        graph.get(predId).successors.push(nodeId);
        graph.get(nodeId).predecessors.push(predId);
      }
    });
  });
  
  return graph;
}
```

---

## 4.3 Algorithm Çalışma Mantığı

### 4.3.1 Three-Phase Execution

```
┌─────────────────────────────────────────────┐
│ PHASE 1: READ (Firestore Transaction)      │
├─────────────────────────────────────────────┤
│ • Get pending assignments                   │
│ • Get resource availability                 │
│ • Get production settings                   │
│ • Build dependency graph                    │
└──────────────────┬──────────────────────────┘
                   ▼
┌─────────────────────────────────────────────┐
│ PHASE 2: CALCULATE (In-Memory)             │
├─────────────────────────────────────────────┤
│ • Group by work order                       │
│ • Apply priority weights                    │
│ • Consider constraints:                     │
│   - Topological order (dependencies)        │
│   - Resource availability                   │
│   - Setup time between operations           │
│   - Working hours                           │
│ • Run scheduling algorithm (WSPT/EDD/etc.)  │
│ • Calculate optimizedIndex + optimizedStart │
└──────────────────┬──────────────────────────┘
                   ▼
┌─────────────────────────────────────────────┐
│ PHASE 3: WRITE (Firestore Transaction)     │
├─────────────────────────────────────────────┤
│ • Update each assignment:                   │
│   - optimizedIndex                          │
│   - optimizedStart                          │
│   - updatedAt                               │
│ • Log optimization event                    │
└─────────────────────────────────────────────┘
```

---

### 4.3.2 Priority Weight System

```javascript
/**
 * Calculate priority weight for scheduling
 */
function calculatePriorityWeight(priority) {
  switch (priority) {
    case 3:  // High
      return 1.5;
    case 2:  // Normal
      return 1.0;
    case 1:  // Low
      return 0.5;
    default:
      return 1.0;
  }
}

/**
 * Apply weights to task durations (WSPT - Weighted Shortest Processing Time)
 */
function calculateWeightedDuration(task) {
  const baseDuration = task.estimatedDuration || 3600;  // Default 1 hour
  const weight = calculatePriorityWeight(task.priority);
  
  return baseDuration / weight;  // Higher priority → shorter weighted duration → scheduled earlier
}
```

**Örnek:**
- Task A: duration=2h, priority=3 (High) → weighted=2/1.5 = 1.33h → **öncelikli**
- Task B: duration=1h, priority=1 (Low) → weighted=1/0.5 = 2h → **sonraya atılır**

---

### 4.3.3 Constraint Checking

```javascript
/**
 * Check if task can be scheduled at given time
 */
function canScheduleTask(task, startTime, resources) {
  // 1. Check dependencies (predecessors must be completed)
  const predecessorsCompleted = task.predecessors.every(predId => {
    const pred = findAssignment(predId);
    return pred.optimizedStart && 
           (pred.optimizedStart.toMillis() + pred.estimatedDuration * 1000) <= startTime;
  });
  
  // 2. Check resource availability
  const resourcesAvailable = checkResourceAvailability(task, startTime, resources);
  
  // 3. Check working hours constraint
  const withinWorkingHours = checkWorkingHours(startTime, task.estimatedDuration);
  
  return predecessorsCompleted && resourcesAvailable && withinWorkingHours;
}
```

---

### 4.3.4 Scheduling Algorithm Outline (Pseudocode)

```javascript
async function optimizeSchedule(scope, workOrderCode) {
  // ══════════════════════════════════════════════
  // PHASE 1: READ
  // ══════════════════════════════════════════════
  const assignments = await fetchPendingAssignments(scope, workOrderCode);
  const resources = await fetchResourceAvailability();
  const settings = await fetchOptimizationSettings();
  
  const graph = buildDependencyGraph(assignments);
  
  // ══════════════════════════════════════════════
  // PHASE 2: CALCULATE
  // ══════════════════════════════════════════════
  
  // Sort by weighted priority
  const sortedTasks = assignments
    .map(a => ({
      ...a,
      weightedDuration: calculateWeightedDuration(a)
    }))
    .sort((a, b) => a.weightedDuration - b.weightedDuration);
  
  // Schedule tasks respecting constraints
  const schedule = [];
  let currentTime = Date.now();
  
  for (const task of sortedTasks) {
    // Find earliest feasible start time
    let candidateTime = currentTime;
    
    while (!canScheduleTask(task, candidateTime, resources)) {
      candidateTime += 300000;  // Increment by 5 minutes
      
      if (candidateTime > currentTime + 86400000) {  // Max 1 day ahead
        throw new Error('Cannot find feasible schedule');
      }
    }
    
    // Assign optimized values
    task.optimizedStart = new Date(candidateTime);
    task.optimizedIndex = schedule.length + 1;
    
    schedule.push(task);
    
    // Update resource allocations
    allocateResources(task, candidateTime, resources);
    
    // Move current time forward
    currentTime = candidateTime + (task.estimatedDuration || 3600) * 1000;
  }
  
  // ══════════════════════════════════════════════
  // PHASE 3: WRITE
  // ══════════════════════════════════════════════
  const batch = db.batch();
  
  schedule.forEach((task, index) => {
    const ref = db.collection('assignments').doc(task.id);
    batch.update(ref, {
      optimizedIndex: task.optimizedIndex,
      optimizedStart: admin.firestore.Timestamp.fromDate(task.optimizedStart),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
  
  await batch.commit();
  
  // Log optimization event
  await db.collection('optimizationLogs').add({
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    tasksUpdated: schedule.length,
    scope,
    workOrderCode,
    executionTimeMs: Date.now() - startTime
  });
  
  return {
    success: true,
    tasksUpdated: schedule.length,
    changes: schedule.map(t => ({
      assignmentId: t.id,
      oldIndex: null,
      newIndex: t.optimizedIndex,
      oldStart: t.expectedStart,
      newStart: t.optimizedStart
    }))
  };
}
```

---

## 4.4 Algorithm Çıktıları (Outputs)

### 4.4.1 Assignment Updates

**BEFORE Optimization:**
```javascript
{
  id: "abc123",
  operationName: "Cutting",
  priority: 3,  // High
  expectedStart: Timestamp(2025-11-18 08:00:00),
  optimizedIndex: null,
  optimizedStart: null,
  schedulingMode: "optimized"
}
```

**AFTER Optimization:**
```javascript
{
  id: "abc123",
  operationName: "Cutting",
  priority: 3,  // High
  expectedStart: Timestamp(2025-11-18 08:00:00),  // Unchanged (baseline)
  optimizedIndex: 1,  // ✅ NEW
  optimizedStart: Timestamp(2025-11-18 08:00:00),  // ✅ NEW (scheduled first due to high priority)
  schedulingMode: "optimized",
  updatedAt: Timestamp(2025-11-18 07:50:00)
}
```

---

### 4.4.2 Optimization Log Entry

```javascript
{
  id: "log_xyz",
  timestamp: Timestamp(2025-11-18 07:50:00),
  tasksUpdated: 15,
  scope: "all",
  workOrderCode: null,
  executionTimeMs: 450,
  triggeredBy: "manual",  // or "automatic"
  changes: [
    {
      assignmentId: "abc123",
      operationName: "Cutting",
      oldIndex: null,
      newIndex: 1,
      priorityWeight: 1.5
    },
    // ... more changes
  ]
}
```

---

## 4.5 Performance Considerations

### 4.5.1 Scalability Targets

| Metric | Target | Notes |
|--------|--------|-------|
| **Max Assignments** | 100 | Per optimization run |
| **Execution Time** | < 5 seconds | For 100 tasks |
| **Firestore Reads** | 3-5 queries | Batch operations |
| **Firestore Writes** | 1 batch | Atomic updates |
| **Memory Usage** | < 50 MB | In-memory graph |

### 4.5.2 Optimization Strategies

```javascript
// 1. Batch Firestore operations
const batch = db.batch();
assignments.forEach(a => {
  batch.update(ref, updates);
});
await batch.commit();  // 1 write instead of N

// 2. In-memory graph construction
const graph = new Map();  // O(1) lookups

// 3. Greedy algorithm (not optimal, but fast)
// Instead of brute-force (O(n!)), use heuristic (O(n log n))

// 4. Limit scope
if (assignments.length > 100) {
  throw new Error('Too many tasks, please optimize per work order');
}
```

---

## 4.6 Algorithm Variants (Future)

### 4.6.1 Weighted Shortest Processing Time (WSPT)
**Current Implementation (Phase 3)**
- Sort by `duration / priority_weight`
- Simple, fast, works well for most cases

### 4.6.2 Earliest Due Date (EDD)
**Future Enhancement**
- Consider work order due dates
- Minimize tardiness

### 4.6.3 Critical Path Method (CPM)
**Future Enhancement**
- Calculate critical path in dependency graph
- Prioritize tasks on critical path

### 4.6.4 Machine Learning-Based
**Future Research**
- Train model on historical data
- Predict optimal sequence based on patterns

---

# 5. İşleyiş Takip Alanı (Model Roadmap)

Bu bölüm, optimization modülünün implementation roadmap'ini ve her fazın detaylı adımlarını içerir.

---

## 5.1 Implementation Phases

### Phase 1: Foundation (PROMPT 1-12) ✅ TAMAMLANDI

**Durum:** ✅ Complete (18 Kasım 2025)

**Tamamlanan İşler:**
- ✅ Schema updates (expectedStart, priority, optimizedIndex, optimizedStart)
- ✅ priorityIndex removal (eski sistemin temizlenmesi)
- ✅ Worker Portal sorting updates (mode-aware)
- ✅ isUrgent system (UI button + backend)
- ✅ Material reservation (2-phase commit)
- ✅ Frontend-backend schema sync
- ✅ Component updates (materialFlowView, semiCode)

**Test Sonuçları:**
- ✅ TEST 1-6: All passing
- ✅ Schema validation: 10/10 fields
- ✅ Material flow: Successor rendering OK
- ✅ Worker Portal: expectedStart sorting OK
- ✅ Urgent system: Parallel execution OK

---

### Phase 2a: Non-Functional UI Infrastructure (PROMPT 13-16)

**Durum:** ⏳ Pending  
**Tahmini Süre:** ~2.5 saat  
**Öncelik:** YÜKSEK (cache system critical)

#### PROMPT 13: Production Settings UI (Non-Functional) 🟡

**Süre:** ~60 dakika  
**Bağımlılık:** PROMPT 11 tamamlanmış olmalı  
**Dosyalar:**
- `WebApp/domains/admin/pages/production-settings.html` (yeni)
- `WebApp/domains/admin/js/production-settings.js` (yeni)
- `WebApp/domains/admin/styles/production-settings.css` (yeni)

**Görev:**
1. Master Data → Production Settings menüsüne yeni section ekle
2. Scheduling Mode toggle (FIFO / Optimization)
3. Optimization settings collapsible panel
4. Auto-calculation interval input
5. Working hours constraint checkbox + time inputs
6. Trigger checkboxes (new WO, priority change, resource change)
7. Worker Assignment mode dropdown (disabled, "coming soon")
8. Save button (dummy alert - "Settings saved! (Non-functional UI)")

**Başarı Kriterleri:**
- ✅ Toggle FIFO → Optimization panel gizli
- ✅ Toggle Optimization → Panel görünür
- ✅ All form inputs responsive
- ✅ Save button shows alert (no backend call yet)

**⚠️ NOT:** Bu prompt sadece UI oluşturur, backend entegrasyonu Phase 2b'de!

---

#### PROMPT 14: Production Mode Cache System ⭐ ÖNCELİKLİ!

**Süre:** ~30 dakika  
**Bağımlılık:** PROMPT 13 tamamlanmış olmalı  
**Dosyalar:**
- `WebApp/shared/state/productionMode.js` (yeni)
- `WebApp/src/main.js` (güncelle)

**Görev:**
1. Global cache module oluştur (`ProductionModeCache` class)
2. App başlangıcında Master Data'dan mode yükle (1x Firestore query)
3. Synchronous `getMode()` ve `isOptimizationMode()` fonksiyonları
4. Reactive listener system (mode değişince UI update)
5. Cache invalidation on settings save

**Başarı Kriterleri:**
- ✅ 1 Firestore query at app start
- ✅ 0 Firestore queries for subsequent checks
- ✅ `window.productionModeCache.getMode()` works
- ✅ Mode switch → Instant UI update (no reload)

**⚠️ KRİTİK:** PROMPT 15 ve 16, cache system'e bağımlı! Bu olmadan diğerleri Firestore'a her işlemde query atar.

---

#### PROMPT 15: Work Order Priority Popup (Conditional) 🟡

**Süre:** ~40 dakika  
**Bağımlılık:** PROMPT 14 tamamlanmış olmalı  
**Dosyalar:**
- `WebApp/domains/orders/components/start-wo-modal.html` (yeni)
- `WebApp/domains/orders/js/start-wo-modal.js` (yeni)
- `WebApp/domains/orders/styles/start-wo-modal.css` (yeni)
- `WebApp/domains/orders/js/work-orders.js` (güncelle)

**Görev:**
1. productionModeCache'i import et
2. FIFO modda: Start butonu → Direkt başlat (popup YOK, priority=2 default)
3. Optimization modda: Start butonu → Priority popup aç
4. Priority selection (1=Low, 2=Normal, 3=High)
5. isUrgent checkbox
6. Backend'e priority gönder (functional)

**Başarı Kriterleri:**
- ✅ FIFO mode: No popup, direct start
- ✅ Optimization mode: Popup opens
- ✅ Priority selection works (1-3)
- ✅ Backend receives priority correctly
- ✅ Mode switch → Instant behavior change (no reload)

---

#### PROMPT 16: Manual Optimize Button (Conditional Visibility) 🟢

**Süre:** ~30 dakika  
**Bağımlılık:** PROMPT 14, 15 tamamlanmış olmalı  
**Dosyalar:**
- `WebApp/pages/quote-dashboard.html` (güncelle)
- `WebApp/domains/orders/js/work-orders.js` (güncelle)

**Görev:**
1. Work Orders sayfasına "🎯 Optimize Schedule Now" butonu ekle
2. Sadece Optimization modunda görünsün (productionModeCache.isOptimizationMode())
3. Mode değişince reactive show/hide (cache listener)
4. Button click → Loading state + dummy alert
5. Last run time display

**Başarı Kriterleri:**
- ✅ FIFO mode: Button gizli
- ✅ Optimization mode: Button görünür
- ✅ Reactive visibility (no reload)
- ✅ Loading state animation works
- ✅ Last run time updates

**⚠️ NOT:** Bu fazda buton sadece alert gösterecek, gerçek optimizasyon Phase 3'te!

---

### Phase 2b: Backend Integration (Production Settings → Cache)

**Durum:** ⏳ Pending  
**Tahmini Süre:** ~1 saat  
**Öncelik:** YÜKSEK

**Görevler:**
1. Production Settings save handler → Firestore write
2. Cache invalidation after save
3. Launch endpoint → productionModeCache.getMode() kullan
4. Reactive UI updates on mode change

**Başarı Kriterleri:**
- ✅ Settings değişiklikleri Firestore'a yazılıyor
- ✅ Cache güncelleniyor (no page reload needed)
- ✅ Launch endpoint cache'den mode okuyor
- ✅ Work order start popup reactive olarak görünüp kayboluyor

---

### Phase 3: Optimization Engine Implementation

**Durum:** ⏳ Planned  
**Tahmini Süre:** ~2 hafta  
**Öncelik:** ORTA (Phase 2 tamamlandıktan sonra)

#### 3.1 Algorithm Implementation

**Dosyalar:**
- `WebApp/server/services/optimizationEngine.js` (yeni)
- `WebApp/server/mesRoutes.js` (POST /optimize-schedule endpoint)

**Görevler:**
1. Dependency graph builder
2. Priority weight system (1.5x, 1.0x, 0.5x)
3. Resource availability checker
4. Constraint validator (dependencies, resources, working hours)
5. WSPT (Weighted Shortest Processing Time) algorithm
6. optimizedIndex + optimizedStart calculator
7. Firestore batch update

**Başarı Kriterleri:**
- ✅ Algorithm completes in < 5 seconds for 100 tasks
- ✅ Respects all constraints
- ✅ Atomic Firestore updates (batch write)
- ✅ Optimization log entry created

---

#### 3.2 API Endpoint

**Endpoint:** `POST /api/mes/optimize-schedule`

**Request:**
```json
{
  "mode": "manual",
  "scope": "all"
}
```

**Response:**
```json
{
  "success": true,
  "tasksUpdated": 15,
  "executionTimeMs": 450,
  "changes": [...]
}
```

**Hata Yönetimi:**
- No pending tasks → 400 error
- Too many tasks (>100) → 413 error
- Algorithm failure → 500 error + rollback

---

#### 3.3 Worker Portal Integration

**Görevler:**
1. Real-time updates after optimization (Firestore listener)
2. Visual indicator (🎯 Optimized badge)
3. optimizedStart gösterimi
4. Sorting verification

**Başarı Kriterleri:**
- ✅ Worker Portal otomatik güncelleniyor (no refresh)
- ✅ optimizedStart doğru gösteriliyor
- ✅ Sıralama optimizedStart'a göre yapılıyor

---

### Phase 4: Auto-Calculation Scheduler

**Durum:** ⏳ Planned  
**Tahmini Süre:** ~1 hafta  
**Öncelik:** DÜŞÜK (Phase 3 tamamlandıktan sonra)

#### 4.1 Cron Job Implementation

**Dosyalar:**
- `WebApp/server/services/optimizationScheduler.js` (yeni)
- `WebApp/server.js` (startup integration)

**Görevler:**
1. Node-cron integration
2. Interval-based execution (default: 60 min)
3. Working hours constraint check
4. Auto-trigger logic (new WO, priority change, resource change)
5. Error handling + retry mechanism
6. Logging and monitoring

**Başarı Kriterleri:**
- ✅ Cron job starts with server
- ✅ Runs at configured interval
- ✅ Respects working hours constraint
- ✅ Triggers work correctly
- ✅ Errors logged and handled gracefully

---

#### 4.2 Trigger Handlers

**1. New Work Order Launch Trigger:**
```javascript
// In launch endpoint
if (settings.scheduling.optimization.triggers.onNewWorkOrder) {
  setTimeout(() => {
    optimizationScheduler.runOptimization({ mode: 'automatic', scope: 'all' });
  }, 5000);  // 5 second delay
}
```

**2. Priority Change Trigger:**
```javascript
// In set-urgent-priority endpoint
if (settings.scheduling.optimization.triggers.onPriorityChange) {
  optimizationScheduler.runOptimization({ mode: 'automatic', scope: workOrderCode });
}
```

**3. Resource Change Trigger (Future):**
```javascript
// When worker availability changes
// When station goes offline
// When material arrives
```

---

### Phase 5: Testing & Refinement

**Durum:** ⏳ Planned  
**Tahmini Süre:** ~1 hafta  
**Öncelik:** YÜKSEK (Phase 3-4 tamamlandıktan sonra)

#### 5.1 Unit Tests

**Test Coverage:**
- ✅ Priority weight calculation
- ✅ Dependency graph construction
- ✅ Constraint validation
- ✅ WSPT algorithm correctness
- ✅ Cache system behavior

**Araçlar:** Jest, Mocha, Chai

---

#### 5.2 Integration Tests

**Senaryolar:**
1. FIFO mode: Work order launch → Direct start → Worker Portal sorting
2. Optimization mode: Work order launch → Priority popup → Manual optimize → Worker Portal update
3. Mode switch: FIFO → Optimization → Instant UI change (no reload)
4. Auto-calculation: Trigger on new WO → Background optimization → UI update

**Araçlar:** Puppeteer, Cypress

---

#### 5.3 Performance Tests

**Ölçümler:**
- Algorithm execution time (target: < 5s for 100 tasks)
- Firestore query count (target: < 5 per optimization)
- Memory usage (target: < 50 MB)
- UI responsiveness (target: < 100ms for mode switch)

**Araçlar:** Artillery, k6

---

#### 5.4 User Acceptance Testing (UAT)

**Test Kullanıcıları:**
- Production Manager (settings configuration)
- Operations Supervisor (manual optimize button)
- Worker (portal UI updates)

**Test Senaryoları:**
1. Settings değiştirme
2. Priority seçimi
3. Manuel optimizasyon tetikleme
4. Worker Portal'da sıralama kontrolü
5. Urgent system ile entegrasyon

**Başarı Kriterleri:**
- ✅ Tüm kullanıcılar UI'dan memnun
- ✅ Hiç bug report yok
- ✅ Performance memnuniyeti yüksek

---

## 5.2 Implementation Order (Critical Path)

```
┌────────────────────────────────────────────────────┐
│ PHASE 1: Foundation                                │
│ ✅ COMPLETED (PROMPT 1-12)                         │
└────────────────────┬───────────────────────────────┘
                     ▼
┌────────────────────────────────────────────────────┐
│ PHASE 2a: Non-Functional UI (PROMPT 13-16)        │
│ ⏳ NEXT                                            │
│                                                    │
│ 1. PROMPT 14 (Cache System) ⭐ ÖNCE BU!          │
│    └─ Global state, 1x Firestore query           │
│                                                    │
│ 2. PROMPT 15 (Priority Popup)                     │
│    └─ Conditional UI (depends on cache)           │
│                                                    │
│ 3. PROMPT 16 (Optimize Button)                    │
│    └─ Conditional visibility (depends on cache)   │
│                                                    │
│ 4. PROMPT 13 (Settings UI)                        │
│    └─ Admin interface (can be parallel)           │
└────────────────────┬───────────────────────────────┘
                     ▼
┌────────────────────────────────────────────────────┐
│ PHASE 2b: Backend Integration                     │
│ ⏳ AFTER 2a                                        │
│                                                    │
│ • Settings save → Firestore                       │
│ • Cache invalidation                              │
│ • Launch endpoint → cache integration             │
└────────────────────┬───────────────────────────────┘
                     ▼
┌────────────────────────────────────────────────────┐
│ PHASE 3: Optimization Engine                      │
│ ⏳ AFTER 2b                                        │
│                                                    │
│ • Algorithm implementation                        │
│ • API endpoint                                    │
│ • Worker Portal integration                       │
└────────────────────┬───────────────────────────────┘
                     ▼
┌────────────────────────────────────────────────────┐
│ PHASE 4: Auto-Calculation                         │
│ ⏳ AFTER 3                                         │
│                                                    │
│ • Cron job                                        │
│ • Trigger handlers                                │
│ • Monitoring                                      │
└────────────────────┬───────────────────────────────┘
                     ▼
┌────────────────────────────────────────────────────┐
│ PHASE 5: Testing & Refinement                     │
│ ⏳ AFTER 3-4                                       │
│                                                    │
│ • Unit tests                                      │
│ • Integration tests                               │
│ • Performance tests                               │
│ • UAT                                             │
└────────────────────────────────────────────────────┘
```

---

## 5.3 Prompt Dependency Matrix

| Prompt | Depends On | Blocks | Priority | Estimated Time |
|--------|-----------|--------|----------|----------------|
| **PROMPT 13** | PROMPT 11 | - | 🟡 MEDIUM | 60 min |
| **PROMPT 14** | PROMPT 13 | PROMPT 15, 16 | 🔴 CRITICAL | 30 min |
| **PROMPT 15** | PROMPT 14 | - | 🟡 MEDIUM | 40 min |
| **PROMPT 16** | PROMPT 14, 15 | - | 🟢 LOW | 30 min |

**⚠️ EXECUTION ORDER:**
1. PROMPT 14 (cache) → ÖNCE BU!
2. PROMPT 15 (popup) ve PROMPT 16 (button) paralel yapılabilir
3. PROMPT 13 (settings UI) bağımsız, paralel yapılabilir

---

## 5.4 Risk Mitigation

### Risk 1: Cache System Failure
**Senaryo:** productionModeCache yüklenemezse  
**Mitigasyon:**
- Fallback to 'fifo' mode (safe default)
- Log error, notify admin
- Continue operation (graceful degradation)

### Risk 2: Optimization Algorithm Timeout
**Senaryo:** 100+ task için 5+ saniye alırsa  
**Mitigasyon:**
- Scope limiti (max 100 tasks per run)
- Background execution (don't block UI)
- Timeout handler (10 second max)

### Risk 3: Firestore Quota Exceeded
**Senaryo:** Auto-calculation çok sık çalışırsa  
**Mitigasyon:**
- Interval minimum: 15 dakika
- Working hours constraint (only outside 08:00-18:00)
- Rate limiting (max 1 optimization per 5 minutes)

### Risk 4: User Confusion (FIFO vs Optimization)
**Senaryo:** Kullanıcı hangi modda olduğunu bilmiyor  
**Mitigasyon:**
- Mode indicator her sayfada göster
- Worker Portal'da badge ("FIFO" vs "🎯 Optimized")
- Settings'te clear documentation

---

## 5.5 Success Metrics

### Phase 2 Success Metrics
- ✅ Cache system: 1 Firestore query at app start
- ✅ Mode switch: < 100ms UI update (no reload)
- ✅ Priority popup: Shows only in optimization mode
- ✅ Optimize button: Reactive visibility

### Phase 3 Success Metrics
- ✅ Algorithm: < 5 seconds for 100 tasks
- ✅ Accuracy: 95%+ tasks scheduled correctly
- ✅ Firestore: < 5 queries per optimization
- ✅ Worker Portal: Real-time updates (< 2 second delay)

### Phase 4 Success Metrics
- ✅ Cron job: 99.9% uptime
- ✅ Auto-triggers: < 10 second response time
- ✅ Error rate: < 1%

### Phase 5 Success Metrics
- ✅ Test coverage: > 80%
- ✅ Bug count: 0 critical, < 5 minor
- ✅ User satisfaction: > 90%

---

## 5.6 Next Actions

### Immediate Next Steps (Phase 2a):
1. ✅ **PROMPT 14 İLE BAŞLA!** (Cache system - critical dependency)
2. ⏳ PROMPT 15 ve 16'yı paralel implement et
3. ⏳ PROMPT 13'ü son olarak implement et (admin-only, low impact)

### Validation Checklist (After Phase 2a):
- [ ] productionModeCache.getMode() works
- [ ] Work order start popup conditional
- [ ] Optimize button conditional visibility
- [ ] Settings UI renders correctly
- [ ] No Firestore query spam (only 1 at startup)

### Phase 2b Readiness:
- [ ] All Phase 2a prompts completed
- [ ] UI components tested
- [ ] Cache system validated
- [ ] Ready for backend integration

---

## 5.7 Documentation & Training

### Developer Documentation
- ✅ This file (Optimize-Packet-Order-System.md)
- ⏳ API documentation (Swagger/OpenAPI)
- ⏳ Algorithm documentation (technical deep-dive)
- ⏳ Cache system documentation (architecture)

### User Documentation
- ⏳ Production Settings guide (admin)
- ⏳ Work order priority guide (operations)
- ⏳ Worker Portal updates guide (workers)
- ⏳ Troubleshooting guide

### Training Materials
- ⏳ Video tutorial (settings configuration)
- ⏳ Demo environment (sandbox testing)
- ⏳ FAQ document
- ⏳ Best practices guide

---

## 5.8 Appendix: Conversation Context

**Kullanıcı Sorusu (18 Kasım 2025):**
> "Optimization modda popup gösterilmesi gerekiyor mu, yoksa sadece Production Settings'ten mode değiştirince tüm sistem otomatik mu adapte olsun?"

**Karar:**
- Work order start popup: **KOŞULLU** (FIFO: popup yok, Optimization: popup var)
- Production Settings: **Mode toggle** (FIFO/Optimization)
- Cache system: **App başlangıcında 1 kez yükle**, tüm componentler cache'den okusun
- Optimize button: **Koşullu görünürlük** (sadece Optimization modunda)

**Teknik Seçim:**
- productionModeCache global state kullanılacak
- Reactive listener system ile UI otomatik güncellenecek
- Firestore query'si minimize edilecek (1x at app start)

**Öncelik Kararı:**
- PROMPT 14 (cache) **EN ÖNCELİKLİ** → PROMPT 15/16 buna bağımlı
- PROMPT 13 (settings UI) bağımsız, paralel yapılabilir
- Phase 3 (optimization engine) Phase 2 tamamlandıktan sonra başlanacak

---

**Son Güncelleme:** 18 Kasım 2025  
**Yazar:** GitHub Copilot (Claude Sonnet 4.5)  
**Versiyon:** 1.0  
**Durum:** Phase 1 Complete, Phase 2a Next

---

