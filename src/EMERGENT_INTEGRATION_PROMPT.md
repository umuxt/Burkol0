# 🤖 Emergent.com AI - MES System Integration Prompt

Bu döküman, Emergent.com AI'nın MES (Manufacturing Execution System) sistemini Burkol0 ana sistemine entegre etmesi için hazırlanmış kapsamlı talimatlardır.

---

## 📌 GÖREV ÖZETİ

**Hedef:** React + TypeScript ile geliştirilmiş MES sistemini, mevcut Burkol0 sistemine entegre etmek.

**Ana Dosya:** `/production.html` - Bu dosya Burkol0'ın ana navigation bar'ını içerir ve MES React uygulamasını yükler.

**Entegrasyon Tipi:** Hybrid entegrasyon
- Burkol0 navbar (HTML/CSS/Vanilla JS) → Sabit, değişmeyecek
- MES App (React/TypeScript) → Firebase backend'e bağlanacak
- İki sistem aynı sayfada çalışacak (`production.html`)

---

## 🎯 GÖREV 1: Firebase Backend Entegrasyonu

### Öncelik: 🔴 YÜKSEK

MES sistemi şu anda local state ile çalışıyor. Firebase Firestore ile real-time backend entegrasyonu yapılacak.

### Adım 1.1: Firebase Paketini Yükle

```bash
npm install firebase
```

### Adım 1.2: Environment Variables Oluştur

Proje root'unda `.env` dosyası oluştur:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

**ÖNEMLI:** `.gitignore` dosyasında `.env` olduğundan emin ol.

### Adım 1.3: MESContext.tsx'i Güncelle

`/contexts/MESContext.tsx` dosyasını aç. Bu dosyada tüm Firebase bağlantı noktaları yorum satırlarıyla işaretlenmiş durumda.

#### 1.3.1: Firebase Imports'ları Aktif Et (Satır 48-78)

**Mevcut durum:**
```typescript
/*
import { 
  getFirestore, 
  collection, 
  ...
} from 'firebase/firestore';
import { initializeApp } from 'firebase/app';

const firebaseConfig = { ... };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
*/
```

**Yapılacak işlem:** `/*` ve `*/` işaretlerini kaldır, imports'ları aktif et.

#### 1.3.2: useEffect'i Import Et (Satır 1)

**Mevcut:**
```typescript
import { createContext, useContext, useState, ReactNode } from "react";
```

**Yeni:**
```typescript
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
```

#### 1.3.3: Real-time Listeners Ekle

Dosyada her `useState` tanımı için, hemen altına ilgili `useEffect` listener'ı ekle. Her useState için detaylı örnek yorum satırlarında mevcut.

**Eklenecek 5 useEffect:**

1. **Master Data Listener** (Satır ~218 sonrası):
```typescript
useEffect(() => {
  const docRef = doc(db, 'settings', 'master-data');
  const unsubscribe = onSnapshot(docRef, (doc) => {
    if (doc.exists()) {
      const data = doc.data();
      setAvailableSkills(data.availableSkills || []);
      setAvailableOperationTypes(data.availableOperationTypes || []);
    }
  }, (error) => {
    console.error('Error fetching master data:', error);
  });
  return () => unsubscribe();
}, []);
```

2. **Operations Listener** (Satır ~238 sonrası):
```typescript
useEffect(() => {
  const q = query(collection(db, 'operations'), orderBy('name'));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const ops = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Operation));
    setOperationsData(ops);
  }, (error) => {
    console.error('Error fetching operations:', error);
  });
  return () => unsubscribe();
}, []);
```

3. **Workers Listener** (Satır ~257 sonrası):
```typescript
useEffect(() => {
  const q = query(collection(db, 'workers'), orderBy('name'));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const wrks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Worker));
    setWorkersData(wrks);
  }, (error) => {
    console.error('Error fetching workers:', error);
  });
  return () => unsubscribe();
}, []);
```

4. **Stations Listener** (Satır ~276 sonrası):
```typescript
useEffect(() => {
  const q = query(collection(db, 'stations'), orderBy('name'));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const stns = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Station));
    setStationsData(stns);
  }, (error) => {
    console.error('Error fetching stations:', error);
  });
  return () => unsubscribe();
}, []);
```

5. **Work Orders Listener** (Satır ~295 sonrası):
```typescript
useEffect(() => {
  const q = query(collection(db, 'work-orders'), orderBy('createdAt', 'desc'));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const wos = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as WorkOrder));
    setWorkOrders(wos);
  }, (error) => {
    console.error('Error fetching work orders:', error);
  });
  return () => unsubscribe();
}, []);
```

#### 1.3.4: CRUD Fonksiyonlarını Async Yap

Dosyada 12 fonksiyon async'e çevrilecek. Her fonksiyonun üstünde detaylı yorum açıklamaları var.

**Async yapılacak fonksiyonlar:**

1. `setOperations` (Satır ~343)
2. `setWorkers` (Satır ~355)
3. `setStations` (Satır ~367)
4. `addWorkOrder` (Satır ~390)
5. `updateWorkOrder` (Satır ~409)
6. `deleteWorkOrder` (Satır ~430)
7. `updateOperationStatus` (Satır ~464)
8. `completePackage` (Satır ~541)
9. `addSkill` (Satır ~605)
10. `removeSkill` (Satır ~623)
11. `addOperationType` (Satır ~641)
12. `removeOperationType` (Satır ~659)

**Örnek 1 - setOperations (Batch Update):**
```typescript
const setOperations = async (newOperations: Operation[]) => {
  try {
    const batch = writeBatch(db);
    
    const newIds = new Set(newOperations.map(op => op.id));
    
    // Yeni veya güncellenen operations
    newOperations.forEach(op => {
      batch.set(doc(db, 'operations', op.id), op, { merge: true });
    });
    
    // Silinen operations
    operations.forEach(op => {
      if (!newIds.has(op.id)) {
        batch.delete(doc(db, 'operations', op.id));
      }
    });
    
    await batch.commit();
  } catch (error) {
    console.error('Error updating operations:', error);
    throw error;
  }
};
```

**Örnek 2 - addWorkOrder (Basit Create):**
```typescript
const addWorkOrder = async (workOrder: WorkOrder) => {
  try {
    await setDoc(doc(db, 'work-orders', workOrder.id), workOrder);
  } catch (error) {
    console.error('Error adding work order:', error);
    throw error;
  }
};
```

**Örnek 3 - updateWorkOrder (Update):**
```typescript
const updateWorkOrder = async (id: string, updates: Partial<WorkOrder>) => {
  try {
    await updateDoc(doc(db, 'work-orders', id), updates);
  } catch (error) {
    console.error('Error updating work order:', error);
    throw error;
  }
};
```

**NOT:** Her fonksiyon için tam implementation örneği dosyadaki yorum satırlarında mevcut.

#### 1.3.5: Type Definitions Güncelle (Satır ~159-192)

Interface'teki fonksiyon return type'larını `Promise<void>` yap:

```typescript
interface MESContextType {
  // Master Data
  operations: Operation[];
  workers: Worker[];
  stations: Station[];
  availableSkills: string[];
  availableOperationTypes: string[];
  
  // Async functions - return Promise<void>
  setOperations: (operations: Operation[]) => Promise<void>;
  setWorkers: (workers: Worker[]) => Promise<void>;
  setStations: (stations: Station[]) => Promise<void>;
  addSkill: (skill: string) => Promise<void>;
  removeSkill: (skill: string) => Promise<void>;
  addOperationType: (type: string) => Promise<void>;
  removeOperationType: (type: string) => Promise<void>;
  
  // Work Orders
  workOrders: WorkOrder[];
  addWorkOrder: (workOrder: WorkOrder) => Promise<void>;
  updateWorkOrder: (id: string, updates: Partial<WorkOrder>) => Promise<void>;
  deleteWorkOrder: (id: string) => Promise<void>;
  
  // Operation Updates
  updateOperationStatus: (
    workOrderId: string,
    operationId: string,
    status: WorkOrderOperation["status"],
    actualTime?: number
  ) => Promise<void>;
  
  // Package Tracking
  completePackage: (workOrderId: string) => Promise<void>;
  
  // Helper functions (sync - değişmeyecek)
  getWorkerById: (id: string) => Worker | undefined;
  getOperationById: (id: string) => Operation | undefined;
  getStationById: (id: string) => Station | undefined;
  getWorkOrdersByWorker: (workerId: string) => WorkOrder[];
  getAvailableWorkers: (requiredSkills: string[]) => Worker[];
}
```

### Adım 1.4: Firestore Database Yapısı

Firebase Console'da şu collection'ları oluştur:

#### Collection: `/settings/master-data`
**Tek bir document:**
```json
{
  "availableSkills": ["CNC Programming", "Welding", "Assembly", "Quality Control"],
  "availableOperationTypes": ["Machining", "Welding", "Assembly", "Quality Check", "Packaging"],
  "updatedAt": "2025-10-29T00:00:00.000Z"
}
```

#### Collection: `/operations`
**Her dokuman bir operation:**
```json
{
  "id": "op-1",
  "name": "CNC Milling",
  "description": "CNC ile frezeleme işlemi",
  "operationType": "Machining",
  "estimatedTime": 45,
  "requiredSkills": ["CNC Programming"],
  "requiredStationId": "st-1"
}
```

#### Collection: `/workers`
```json
{
  "id": "w-1",
  "name": "Ali Yılmaz",
  "email": "ali@company.com",
  "skills": ["CNC Programming", "CAM Software"],
  "shift": "Day",
  "availability": "Available",
  "assignedOperationIds": [],
  "assignedStationIds": []
}
```

#### Collection: `/stations`
```json
{
  "id": "st-1",
  "name": "CNC Mill 01",
  "type": "CNC Milling Machine",
  "capacity": 1,
  "status": "Operational"
}
```

#### Collection: `/work-orders`
```json
{
  "id": "wo-1",
  "name": "WO-2024-001",
  "description": "Bracket üretimi",
  "productName": "Steel Bracket Type-A",
  "quantity": 100,
  "packageSize": 10,
  "completedPackages": 0,
  "totalPackages": 10,
  "priority": "high",
  "status": "planned",
  "estimatedDuration": 115,
  "createdAt": "2025-10-29T10:00:00.000Z",
  "operations": [
    {
      "id": "wo1-op1",
      "operationId": "op-1",
      "operationName": "CNC Milling",
      "operationType": "Machining",
      "assignedWorkerId": "w-1",
      "assignedWorkerName": "Ali Yılmaz",
      "stationId": "st-1",
      "stationName": "CNC Mill 01",
      "estimatedTime": 45,
      "status": "pending",
      "sequence": 1,
      "x": 100,
      "y": 100
    }
  ]
}
```

### Adım 1.5: Firebase Security Rules

Firebase Console > Firestore Database > Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Test mode - Production'da daha spesifik rules kullan
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
    
    // Production için örnek:
    // match /work-orders/{workOrderId} {
    //   allow read: if request.auth != null;
    //   allow write: if request.auth.token.role == 'planner';
    // }
  }
}
```

---

## 🎯 GÖREV 2: Component-Level Async Handling

Firebase entegrasyonu sonrası, component'lerde async fonksiyonları doğru kullan.

### Component Update Pattern

**ÖNCE (Sync):**
```typescript
const handleSaveWorker = () => {
  setWorkers([...workers, newWorker]);
};
```

**SONRA (Async):**
```typescript
const [isLoading, setIsLoading] = useState(false);

const handleSaveWorker = async () => {
  try {
    setIsLoading(true);
    await setWorkers([...workers, newWorker]);
    toast.success('Worker saved successfully');
  } catch (error) {
    console.error('Error saving worker:', error);
    toast.error('Failed to save worker');
  } finally {
    setIsLoading(false);
  }
};
```

### Güncellenecek Component'ler

1. `/components/workers-management.tsx`
   - handleSaveWorker → async
   - handleDeleteWorker → async

2. `/components/operations-management.tsx`
   - handleSaveOperation → async
   - handleDeleteOperation → async

3. `/components/stations-management.tsx`
   - handleSaveStation → async
   - handleDeleteStation → async

4. `/components/production-plan-designer.tsx`
   - handleSavePlan → async (addWorkOrder kullanıyor)

5. `/components/production-dashboard-clean.tsx`
   - Sadece okuma yapıyor, değişiklik gerekmez

6. `/components/worker-panel-simple.tsx`
   - handleStartOperation → async
   - handleCompleteOperation → async
   - handleCompletePackage → async

**NOT:** Her component'te zaten useMES() hook'u kullanılıyor. Sadece async/await eklemen yeterli.

---

## 🎯 GÖREV 3: production.html Entegrasyonu

`/production.html` dosyası zaten hazır durumda. Bu dosya:
- ✅ Burkol0 navbar'ını içeriyor
- ✅ MES React app'i yüklüyor (`<script type="module" src="/src/main.tsx"></script>`)
- ✅ Navbar navigation logic'i mevcut

### Yapılması Gerekenler

#### 3.1: Build Konfigürasyonu

Projenin `vite.config.ts` dosyasını kontrol et. Şu şekilde olmalı:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'production.html'),
      },
    },
  },
})
```

#### 3.2: Build Çalıştır

```bash
npm run build
```

Bu komut:
- `production.html` dosyasını build edecek
- React app bundle'ı oluşturacak
- Output: `/dist` klasörü

#### 3.3: Burkol0 Sistemine Deploy

**Seçenek A: Standalone Deploy**
```bash
# dist klasörünü web server'a kopyala
cp -r dist/* /var/www/burkol0/production/

# production.html artık:
# https://burkol0.com/production/production.html
# veya
# https://burkol0.com/production.html (URL rewrite ile)
```

**Seçenek B: Burkol0 Build Pipeline'a Entegre Et**
- Burkol0'ın mevcut build sistemine MES build'i ekle
- Ana sistemin `production.html` sayfasını bu MES bundle'ı ile güncelle

---

## 🎯 GÖREV 4: Burkol0 Navbar Entegrasyonu

`production.html` zaten Burkol0 navbar'ını içeriyor, ama navbar'ın diğer sayfalarda da güncel olduğundan emin ol.

### Navbar Navigation Linkleri

Burkol0'ın tüm sayfalarında navbar şu linkleri içermeli:

```html
<a href="./admin-dashboard.html" class="nav-btn">
  <span class="nav-btn-icon">🏠</span>
  <span class="nav-btn-text">Yönetim Paneli</span>
</a>

<a href="./quote-dashboard.html" class="nav-btn">
  <span class="nav-btn-icon">📋</span>
  <span class="nav-btn-text">Teklif Yönetimi</span>
</a>

<a href="./production.html" class="nav-btn">
  <span class="nav-btn-icon">🏭</span>
  <span class="nav-btn-text">Üretim Paneli</span>
</a>

<a href="./materials.html" class="nav-btn">
  <span class="nav-btn-icon">📦</span>
  <span class="nav-btn-text">Malzeme Yönetimi</span>
</a>

<a href="./settings.html" class="nav-btn">
  <span class="nav-btn-icon">⚙️</span>
  <span class="nav-btn-text">Ayarlar</span>
</a>
```

**Active State Logic:**

Her sayfada, o sayfaya ait nav-btn'ye `nav-btn-active` class'ı ekle:

```javascript
// production.html için
document.addEventListener('DOMContentLoaded', function() {
  const currentPage = 'production';
  const navButtons = document.querySelectorAll('.nav-btn');
  
  navButtons.forEach(btn => {
    if (btn.dataset.page === currentPage) {
      btn.classList.add('nav-btn-active');
    } else {
      btn.classList.remove('nav-btn-active');
    }
  });
});
```

---

## 🎯 GÖREV 5: Authentication & Authorization (Opsiyonel ama Önerilen)

### Firebase Authentication Entegrasyonu

Burkol0 kendi auth sistemini kullanıyorsa, Firebase'e token aktarımı yap:

```typescript
// Burkol0 auth token'ı al
const burkol0Token = localStorage.getItem('authToken');
const userRole = localStorage.getItem('userRole'); // 'planner' or 'worker'

// Firebase'e custom token ile giriş yap
import { getAuth, signInWithCustomToken } from 'firebase/auth';

const auth = getAuth();
signInWithCustomToken(auth, customToken)
  .then((userCredential) => {
    // Başarılı giriş
    console.log('Firebase authenticated');
  })
  .catch((error) => {
    console.error('Authentication error:', error);
  });
```

### Role-Based Access Control

MESContext'e role kontrolü ekle:

```typescript
export function MESProvider({ children }: { children: ReactNode }) {
  const [userRole, setUserRole] = useState<'planner' | 'worker'>('planner');

  useEffect(() => {
    const role = localStorage.getItem('userRole') as 'planner' | 'worker';
    if (role) setUserRole(role);
  }, []);

  // Value'ya role'ü ekle
  const value = {
    ...existing values,
    userRole,
  };

  return <MESContext.Provider value={value}>{children}</MESContext.Provider>;
}
```

Component'lerde kullanım:

```typescript
const { userRole } = useMES();

// Planner-only işlemler
if (userRole === 'planner') {
  // Plan Designer, Settings, vs.
}

// Worker-only işlemler
if (userRole === 'worker') {
  // Worker Panel
}
```

---

## 🎯 GÖREV 6: Testing & Verification

### 6.1: Development Test

```bash
# Development server başlat
npm run dev

# Tarayıcıda aç:
# http://localhost:5173/production.html
```

**Test Checklist:**
- [ ] Sayfa yükleniyor
- [ ] Burkol0 navbar görünüyor
- [ ] MES app render oluyor
- [ ] Tab navigation çalışıyor
- [ ] Firebase bağlantısı kuruldu (Console'da hata yok)
- [ ] Real-time listeners çalışıyor

### 6.2: Firebase Test

Firebase Console'u aç:
- [ ] Collections oluşturuldu mu?
- [ ] Master data document var mı?
- [ ] Operations/Workers/Stations collections boş mu? (Normal, UI'dan eklenecek)

MES UI'dan:
- [ ] Yeni worker ekle → Firebase Console'da görünüyor mu?
- [ ] Worker'ı güncelle → Real-time update çalışıyor mu?
- [ ] Worker'ı sil → Firebase'den siliniyor mu?

### 6.3: Production Build Test

```bash
npm run build
cd dist
python -m http.server 8000
# veya
npx serve
```

Tarayıcıda `http://localhost:8000/production.html` aç ve tüm fonksiyonları test et.

### 6.4: Integration Test

Burkol0 ana sistemine deploy ettikten sonra:
- [ ] Navbar linklerinden production.html'e geçiş çalışıyor
- [ ] Auth token aktarılıyor (eğer varsa)
- [ ] User role doğru algılanıyor
- [ ] Logout yapıldığında Burkol0 login'e yönlendiriyor

---

## 🎯 GÖREV 7: Dokümantasyon ve Son Adımlar

### 7.1: Environment Variables Dokümantasyonu

`.env.example` dosyası oluştur:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

README'ye ekle:
```markdown
## Setup

1. Clone the repository
2. Copy `.env.example` to `.env`
3. Fill in your Firebase credentials
4. Run `npm install`
5. Run `npm run dev`
```

### 7.2: Deployment Checklist Güncelle

`/DEPLOYMENT.md` dosyasını oku ve şu adımları tamamla:
- [ ] Firebase entegrasyonu tamamlandı
- [ ] Environment variables set edildi
- [ ] Build başarılı
- [ ] Burkol0 navbar entegrasyonu çalışıyor
- [ ] All tests passed

### 7.3: Change Log

Sistem değişikliklerini dokümante et:

```markdown
## Changelog

### 2025-10-29 - Firebase Integration
- ✅ Firebase Firestore backend entegrasyonu tamamlandı
- ✅ Real-time listeners eklendi
- ✅ Async CRUD operations implement edildi
- ✅ production.html build konfigürasyonu ayarlandı
- ✅ Burkol0 navbar entegrasyonu doğrulandı
```

---

## 📚 Referans Dökümanlar

Entegrasyon sırasında şu dosyalara başvur:

1. **`/FIREBASE_INTEGRATION_GUIDE.md`**
   - Firestore yapısı
   - Detaylı Firebase implementation
   - Security rules
   - Offline support

2. **`/EMERGENT_AI_QUICKSTART.md`**
   - Step-by-step Firebase entegrasyon adımları
   - Her fonksiyon için kod örnekleri
   - Troubleshooting

3. **`/DEPLOYMENT.md`**
   - Production deployment checklist
   - API endpoints beklentileri
   - Testing stratejisi

4. **`/README.md`**
   - Proje genel bakış
   - Teknoloji stack'i
   - Dosya yapısı

5. **`/contexts/MESContext.tsx`**
   - Inline yorum satırlarında detaylı açıklamalar
   - Her fonksiyon için implementation örneği

---

## ⚠️ DİKKAT EDİLMESİ GEREKENLER

### 1. Dosya İsimleri
- ❌ `production.tsx` değil
- ✅ `production.html` kullan

### 2. Firebase Imports
- ❌ Yeni Firebase config dosyası oluşturma
- ✅ MESContext.tsx içindeki yorum satırlarını aktif et

### 3. State Management
- ❌ Component'lerde local Firebase çağrıları yapma
- ✅ Her şey MESContext üzerinden

### 4. Burkol0 Navbar
- ❌ MES içinde yeni navbar oluşturma
- ✅ production.html'deki Burkol0 navbar'ı kullan

### 5. Build Output
- ❌ index.html output kullanma
- ✅ production.html'i build entry point'i yap

### 6. Authentication
- ❌ Firebase Authentication'ı bağımsız başlatma
- ✅ Burkol0'dan gelen auth token'ı Firebase'e aktar

---

## 🚨 Troubleshooting

### Problem 1: "db is not defined"
**Çözüm:** Firebase imports'ları aktif etmeyi unuttun. MESContext.tsx satır 48-78'deki yorum satırlarını kaldır.

### Problem 2: "useEffect is not defined"
**Çözüm:** Import statement'a useEffect ekle (satır 1).

### Problem 3: "Firestore: Missing or insufficient permissions"
**Çözüm:** Firebase Console > Firestore Database > Rules'u kontrol et. Test mode için:
```javascript
allow read, write: if true;
```

### Problem 4: Real-time updates çalışmıyor
**Çözüm:** 
1. useEffect listeners eklendi mi kontrol et
2. Firebase Console'da collection'lar var mı?
3. Browser console'da hata var mı?

### Problem 5: Build hata veriyor
**Çözüm:**
1. `npm install` tekrar çalıştır
2. `.env` dosyası var mı?
3. `vite.config.ts` doğru mu?

### Problem 6: production.html Burkol0'da görünmüyor
**Çözüm:**
1. Build output'u doğru klasöre kopyalandı mı?
2. Web server static file serving ayarları doğru mu?
3. URL routing konfigürasyonu var mı?

---

## ✅ Final Checklist

Entegrasyonu tamamladıktan sonra bu checklist'i kontrol et:

### Firebase
- [ ] Firebase projesi oluşturuldu
- [ ] `.env` dosyası oluşturuldu ve credentials eklendi
- [ ] Firebase imports aktif edildi (MESContext.tsx)
- [ ] useEffect import edildi
- [ ] 5 useEffect listener eklendi
- [ ] 12 fonksiyon async yapıldı
- [ ] Type definitions güncellendi
- [ ] Firestore collections oluşturuldu
- [ ] Security rules ayarlandı

### Components
- [ ] Component'lerde async/await kullanımı eklendi
- [ ] Loading states eklendi
- [ ] Error handling eklendi (try/catch)
- [ ] Toast notifications çalışıyor

### Build & Deploy
- [ ] `npm run build` hatasız çalışıyor
- [ ] production.html build output'ta var
- [ ] Bundle size makul (<2MB)
- [ ] Source maps oluşturuldu (debugging için)

### Burkol0 Integration
- [ ] production.html Burkol0 navbar'ını içeriyor
- [ ] Navbar linklerinden production.html'e geçiş çalışıyor
- [ ] Active state logic doğru
- [ ] Auth token aktarımı çalışıyor (varsa)
- [ ] Role-based routing çalışıyor

### Testing
- [ ] Development mode'da test edildi
- [ ] Production build'de test edildi
- [ ] Firebase CRUD operations test edildi
- [ ] Real-time updates test edildi
- [ ] Responsive design test edildi (mobil/tablet/desktop)
- [ ] Cross-browser test edildi (Chrome, Firefox, Safari)

### Documentation
- [ ] `.env.example` oluşturuldu
- [ ] README güncellendi
- [ ] Changelog eklendi
- [ ] Deployment notları yazıldı

---

## 🎉 Tamamlandı!

Tüm adımları tamamladıysan, MES sistemi artık:
- ✅ Firebase backend ile çalışıyor
- ✅ Real-time senkronizasyon aktif
- ✅ Burkol0 sistemine entegre
- ✅ production.html üzerinden erişilebilir
- ✅ Production-ready

**Sonraki Adımlar:**
1. Kullanıcı testleri yap
2. Performance monitoring ekle
3. Error tracking servis ekle (Sentry, vb.)
4. Production deployment yap
5. Kullanıcı eğitimi ver

---

**Son Güncelleme:** 29 Ekim 2025
**Hazırlayan:** MES Development Team
**Hedef AI:** Emergent.com AI Integration Assistant
