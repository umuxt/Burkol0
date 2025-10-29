# Firebase Integration Guide for MES System

Bu döküman, MES (Manufacturing Execution System) projesinin Firebase backend entegrasyonu için hazırlanmıştır.

## 📋 İçindekiler
1. [Firebase Kurulumu](#firebase-kurulumu)
2. [Firestore Veritabanı Yapısı](#firestore-veritabanı-yapısı)
3. [Environment Variables](#environment-variables)
4. [MESContext.tsx Entegrasyonu](#mescontexttsx-entegrasyonu)
5. [Component Level İşlemler](#component-level-işlemler)
6. [Security Rules](#security-rules)
7. [Offline Support](#offline-support)
8. [Error Handling](#error-handling)

---

## 🔧 Firebase Kurulumu

### 1. Firebase Projesi Oluşturma
1. [Firebase Console](https://console.firebase.google.com/)'a git
2. Yeni proje oluştur
3. Web app ekle (</> ikonu)
4. Firebase config bilgilerini kopyala

### 2. NPM Paketlerini Yükle
```bash
npm install firebase
```

### 3. `.env` Dosyası Oluştur
Proje root'unda `.env` dosyası oluştur:
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

---

## 🗄️ Firestore Veritabanı Yapısı

### Collection: `/settings/master-data`
**Tek bir document** - Master data listelerini tutar
```typescript
{
  availableSkills: string[];          // ["CNC Programming", "Welding", ...]
  availableOperationTypes: string[];  // ["Machining", "Welding", ...]
  updatedAt: Timestamp;               // Son güncelleme zamanı
}
```

### Collection: `/operations`
**Document ID: Operation ID**
```typescript
{
  id: string;                    // "op-1", "op-2", ...
  name: string;                  // "CNC Milling"
  description: string;           // "CNC ile frezeleme işlemi"
  operationType: string;         // "Machining"
  estimatedTime: number;         // 45 (dakika)
  requiredSkills: string[];      // ["CNC Programming", "CAM Software"]
  requiredStationId: string;     // "st-1"
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Collection: `/workers`
**Document ID: Worker ID**
```typescript
{
  id: string;                      // "w-1", "w-2", ...
  name: string;                    // "Ali Yılmaz"
  email: string;                   // "ali@company.com"
  skills: string[];                // ["CNC Programming", "CAM Software"]
  shift: string;                   // "Day" | "Night" | "Rotating"
  availability: string;            // "Available" | "Busy" | "On Leave"
  assignedOperationIds: string[];  // ["op-1", "op-4"]
  assignedStationIds: string[];    // ["st-1", "st-4"]
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Collection: `/stations`
**Document ID: Station ID**
```typescript
{
  id: string;           // "st-1", "st-2", ...
  name: string;         // "CNC Mill 01"
  type: string;         // "CNC Milling Machine"
  capacity: number;     // 1
  status: string;       // "Operational" | "Maintenance" | "Down"
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Collection: `/work-orders`
**Document ID: Work Order ID**
```typescript
{
  id: string;                      // "wo-1", "wo-2", ...
  name: string;                    // "WO-2024-001"
  description: string;             // "Bracket üretimi"
  productName: string;             // "Steel Bracket Type-A"
  quantity: number;                // 100
  packageSize: number;             // 10 (units per package)
  completedPackages: number;       // 3
  totalPackages: number;           // 10
  priority: string;                // "low" | "medium" | "high"
  status: string;                  // "planned" | "in-progress" | "completed" | "on-hold"
  estimatedDuration: number;       // 115 (dakika)
  actualDuration?: number;         // 120 (dakika)
  createdAt: string;               // ISO timestamp
  startedAt?: string;              // ISO timestamp
  completedAt?: string;            // ISO timestamp
  
  operations: [                    // Array of operations
    {
      id: string;                  // "wo1-op1"
      operationId: string;         // "op-1" (ref to /operations)
      operationName: string;       // "CNC Milling"
      operationType: string;       // "Machining"
      assignedWorkerId?: string;   // "w-1" (ref to /workers)
      assignedWorkerName?: string; // "Ali Yılmaz"
      stationId?: string;          // "st-1" (ref to /stations)
      stationName?: string;        // "CNC Mill 01"
      estimatedTime: number;       // 45
      actualTime?: number;         // 42
      status: string;              // "pending" | "in-progress" | "completed"
      sequence: number;            // 1, 2, 3, ...
      startedAt?: string;          // ISO timestamp
      completedAt?: string;        // ISO timestamp
      x?: number;                  // Canvas position
      y?: number;                  // Canvas position
    }
  ]
}
```

---

## 🔐 Environment Variables

### `.env` Dosyası
```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
VITE_FIREBASE_AUTH_DOMAIN=mes-system-xxxxx.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=mes-system-xxxxx
VITE_FIREBASE_STORAGE_BUCKET=mes-system-xxxxx.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:xxxxxxxxxxxxx
```

### `.gitignore` - Güvenlik
`.env` dosyasının git'e eklenmediğinden emin ol:
```gitignore
.env
.env.local
.env.production
```

---

## 🔗 MESContext.tsx Entegrasyonu

### Adım 1: Firebase Import'ları Aktif Et
`/contexts/MESContext.tsx` dosyasında yorum satırlarını kaldır:

```typescript
import { 
  getFirestore, 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot,
  query,
  orderBy,
  Timestamp 
} from 'firebase/firestore';
import { initializeApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
```

### Adım 2: Real-time Listeners Ekle

MESProvider içinde, her collection için useEffect ekle:

#### Master Data Listener
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
    toast.error('Failed to load master data');
  });
  
  return () => unsubscribe();
}, []);
```

#### Operations Listener
```typescript
useEffect(() => {
  const q = query(collection(db, 'operations'), orderBy('name'));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const ops = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Operation));
    setOperations(ops);
  }, (error) => {
    console.error('Error fetching operations:', error);
    toast.error('Failed to load operations');
  });
  
  return () => unsubscribe();
}, []);
```

#### Workers Listener
```typescript
useEffect(() => {
  const q = query(collection(db, 'workers'), orderBy('name'));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const wrks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Worker));
    setWorkers(wrks);
  }, (error) => {
    console.error('Error fetching workers:', error);
    toast.error('Failed to load workers');
  });
  
  return () => unsubscribe();
}, []);
```

#### Stations Listener
```typescript
useEffect(() => {
  const q = query(collection(db, 'stations'), orderBy('name'));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const stns = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Station));
    setStations(stns);
  }, (error) => {
    console.error('Error fetching stations:', error);
    toast.error('Failed to load stations');
  });
  
  return () => unsubscribe();
}, []);
```

#### Work Orders Listener
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
    toast.error('Failed to load work orders');
  });
  
  return () => unsubscribe();
}, []);
```

### Adım 3: CRUD Fonksiyonlarını Güncelle

#### addWorkOrder
```typescript
const addWorkOrder = async (workOrder: WorkOrder) => {
  try {
    await setDoc(doc(db, 'work-orders', workOrder.id), workOrder);
    toast.success('Work order created');
  } catch (error) {
    console.error('Error adding work order:', error);
    toast.error('Failed to create work order');
    throw error;
  }
};
```

#### updateWorkOrder
```typescript
const updateWorkOrder = async (id: string, updates: Partial<WorkOrder>) => {
  try {
    await updateDoc(doc(db, 'work-orders', id), updates);
    toast.success('Work order updated');
  } catch (error) {
    console.error('Error updating work order:', error);
    toast.error('Failed to update work order');
    throw error;
  }
};
```

#### deleteWorkOrder
```typescript
const deleteWorkOrder = async (id: string) => {
  try {
    await deleteDoc(doc(db, 'work-orders', id));
    toast.success('Work order deleted');
  } catch (error) {
    console.error('Error deleting work order:', error);
    toast.error('Failed to delete work order');
    throw error;
  }
};
```

#### updateOperationStatus
```typescript
const updateOperationStatus = async (
  workOrderId: string,
  operationId: string,
  status: WorkOrderOperation["status"],
  actualTime?: number
) => {
  try {
    const wo = workOrders.find(w => w.id === workOrderId);
    if (!wo) throw new Error('Work order not found');
    
    const updatedOperations = wo.operations.map(op => {
      if (op.id === operationId) {
        const updates: Partial<WorkOrderOperation> = { status };
        
        if (status === "in-progress" && !op.startedAt) {
          updates.startedAt = new Date().toISOString();
        }
        
        if (status === "completed") {
          updates.completedAt = new Date().toISOString();
          if (actualTime) {
            updates.actualTime = actualTime;
          }
        }
        
        return { ...op, ...updates };
      }
      return op;
    });

    const allCompleted = updatedOperations.every(op => op.status === "completed");
    const woStatus = allCompleted ? "completed" : "in-progress";

    await updateDoc(doc(db, 'work-orders', workOrderId), {
      operations: updatedOperations,
      status: woStatus,
      completedAt: allCompleted ? new Date().toISOString() : null
    });
  } catch (error) {
    console.error('Error updating operation status:', error);
    toast.error('Failed to update operation');
    throw error;
  }
};
```

#### completePackage
```typescript
const completePackage = async (workOrderId: string) => {
  try {
    const wo = workOrders.find(w => w.id === workOrderId);
    if (!wo) throw new Error('Work order not found');
    
    const newCompletedPackages = wo.completedPackages + 1;
    const allPackagesCompleted = newCompletedPackages >= wo.totalPackages;
    
    await updateDoc(doc(db, 'work-orders', workOrderId), {
      completedPackages: newCompletedPackages,
      status: allPackagesCompleted ? 'completed' : wo.status,
      completedAt: allPackagesCompleted ? new Date().toISOString() : null
    });
    
    toast.success(`Package ${newCompletedPackages}/${wo.totalPackages} completed`);
  } catch (error) {
    console.error('Error completing package:', error);
    toast.error('Failed to complete package');
    throw error;
  }
};
```

#### addSkill
```typescript
const addSkill = async (skill: string) => {
  if (availableSkills.includes(skill)) return;
  
  try {
    const newSkills = [...availableSkills, skill];
    await updateDoc(doc(db, 'settings', 'master-data'), {
      availableSkills: newSkills,
      updatedAt: Timestamp.now()
    });
  } catch (error) {
    console.error('Error adding skill:', error);
    toast.error('Failed to add skill');
    throw error;
  }
};
```

#### removeSkill
```typescript
const removeSkill = async (skill: string) => {
  try {
    const newSkills = availableSkills.filter(s => s !== skill);
    await updateDoc(doc(db, 'settings', 'master-data'), {
      availableSkills: newSkills,
      updatedAt: Timestamp.now()
    });
  } catch (error) {
    console.error('Error removing skill:', error);
    toast.error('Failed to remove skill');
    throw error;
  }
};
```

#### addOperationType
```typescript
const addOperationType = async (type: string) => {
  if (availableOperationTypes.includes(type)) return;
  
  try {
    const newTypes = [...availableOperationTypes, type];
    await updateDoc(doc(db, 'settings', 'master-data'), {
      availableOperationTypes: newTypes,
      updatedAt: Timestamp.now()
    });
  } catch (error) {
    console.error('Error adding operation type:', error);
    toast.error('Failed to add operation type');
    throw error;
  }
};
```

#### removeOperationType
```typescript
const removeOperationType = async (type: string) => {
  try {
    const newTypes = availableOperationTypes.filter(t => t !== type);
    await updateDoc(doc(db, 'settings', 'master-data'), {
      availableOperationTypes: newTypes,
      updatedAt: Timestamp.now()
    });
  } catch (error) {
    console.error('Error removing operation type:', error);
    toast.error('Failed to remove operation type');
    throw error;
  }
};
```

---

## 🧩 Component Level İşlemler

Component'ler MESContext üzerinden tüm verilere erişir ve işlemleri yapar. Component'lerde **doğrudan Firebase işlemi yapma**. Tüm CRUD işlemleri MESContext fonksiyonları üzerinden yapılır.

### Workers Management
```typescript
// ✅ Doğru kullanım - MESContext'ten fonksiyon çağır
const { workers, setWorkers } = useMES();

const handleSaveWorker = () => {
  if (editingWorker) {
    const updated = workers.map(w => 
      w.id === editingWorker.id ? { ...w, ...workerForm } : w
    );
    setWorkers(updated);  // Bu fonksiyon Firebase'e yazacak
  } else {
    const newWorker = { id: `w-${Date.now()}`, ...workerForm };
    setWorkers([...workers, newWorker]);  // Bu fonksiyon Firebase'e yazacak
  }
};
```

### Operations Management
```typescript
const { operations, setOperations } = useMES();

const handleSaveOperation = () => {
  if (editingOperation) {
    const updated = operations.map(op => 
      op.id === editingOperation.id ? { ...op, ...operationForm } : op
    );
    setOperations(updated);  // Firebase'e yazılacak
  } else {
    const newOp = { id: `op-${Date.now()}`, ...operationForm };
    setOperations([...operations, newOp]);  // Firebase'e yazılacak
  }
};
```

### Stations Management
```typescript
const { stations, setStations } = useMES();

const handleSaveStation = () => {
  if (editingStation) {
    const updated = stations.map(st => 
      st.id === editingStation.id ? { ...st, ...stationForm } : st
    );
    setStations(updated);  // Firebase'e yazılacak
  } else {
    const newStation = { id: `st-${Date.now()}`, ...stationForm };
    setStations([...stations, newStation]);  // Firebase'e yazılacak
  }
};
```

### Plan Designer
```typescript
const { addWorkOrder } = useMES();

const handleSavePlan = () => {
  const workOrder: WorkOrder = {
    id: `wo-${Date.now()}`,
    name: planForm.name,
    // ... diğer alanlar
    operations: canvasOperations,
  };
  
  addWorkOrder(workOrder);  // Firebase'e yazılacak
};
```

### Dashboard
```typescript
const { workOrders } = useMES();

// Sadece okuma - Firebase listener'dan otomatik gelir
const activeOrders = workOrders.filter(wo => wo.status === 'in-progress');
```

### Worker Panel
```typescript
const { updateOperationStatus, completePackage } = useMES();

const handleStartOperation = (workOrderId: string, operationId: string) => {
  updateOperationStatus(workOrderId, operationId, 'in-progress');
};

const handleCompleteOperation = (workOrderId: string, operationId: string) => {
  updateOperationStatus(workOrderId, operationId, 'completed', actualTime);
};

const handleCompletePackage = (workOrderId: string) => {
  completePackage(workOrderId);
};
```

---

## 🔒 Security Rules

Firestore Security Rules'u Firebase Console'dan ayarla:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Master Data - Sadece authenticated kullanıcılar okuyabilir ve yazabilir
    match /settings/{document} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    
    // Operations - Sadece authenticated kullanıcılar okuyabilir ve yazabilir
    match /operations/{operationId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    
    // Workers - Sadece authenticated kullanıcılar okuyabilir ve yazabilir
    match /workers/{workerId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    
    // Stations - Sadece authenticated kullanıcılar okuyabilir ve yazabilir
    match /stations/{stationId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    
    // Work Orders - Sadece authenticated kullanıcılar okuyabilir ve yazabilir
    match /work-orders/{workOrderId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
```

**DİKKAT**: Production'da daha spesifik rules kullan:
- Planner rolü: read/write tüm collections
- Worker rolü: sadece kendi atandığı work orders'ı read/update

---

## 📴 Offline Support

Firebase Firestore otomatik offline caching sağlar. Aktif etmek için:

```typescript
import { enableIndexedDbPersistence } from 'firebase/firestore';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Offline persistence aktif et
enableIndexedDbPersistence(db)
  .catch((err) => {
    if (err.code == 'failed-precondition') {
      console.warn('Multiple tabs open, persistence disabled');
    } else if (err.code == 'unimplemented') {
      console.warn('Browser does not support persistence');
    }
  });
```

**Özellikler:**
- İnternet kesildiğinde local cache'den okuma
- Offline yapılan değişiklikler internet gelince senkronize edilir
- Real-time listener'lar offline modda da çalışır

---

## ⚠️ Error Handling

### Loading States
Her component'te loading state ekle:

```typescript
const [isLoading, setIsLoading] = useState(true);

useEffect(() => {
  if (operations.length > 0 || workers.length > 0) {
    setIsLoading(false);
  }
}, [operations, workers]);

if (isLoading) {
  return <div>Loading...</div>;
}
```

### Error States
Try-catch blokları ile error handling:

```typescript
const handleSave = async () => {
  try {
    setIsLoading(true);
    await addWorkOrder(workOrder);
    toast.success('Work order created');
  } catch (error) {
    console.error('Error:', error);
    toast.error('Failed to create work order');
  } finally {
    setIsLoading(false);
  }
};
```

### Network Errors
Network durumunu kontrol et:

```typescript
import { onSnapshot } from 'firebase/firestore';

useEffect(() => {
  const unsubscribe = onSnapshot(
    query(collection(db, 'operations')),
    (snapshot) => {
      // Success
      setOperations(snapshot.docs.map(doc => doc.data()));
    },
    (error) => {
      // Error handling
      if (error.code === 'unavailable') {
        toast.error('Network error. Working offline.');
      } else {
        toast.error('Failed to load data');
      }
    }
  );
  
  return () => unsubscribe();
}, []);
```

---

## 🚀 Deployment Checklist

### 1. Environment Variables
- [ ] `.env` dosyası oluşturuldu
- [ ] Firebase config bilgileri eklendi
- [ ] `.env` git'e eklenmedi (.gitignore)

### 2. Firebase Setup
- [ ] Firebase projesi oluşturuldu
- [ ] Firestore Database aktif edildi
- [ ] Security Rules ayarlandı
- [ ] Offline persistence aktif edildi

### 3. MESContext.tsx
- [ ] Firebase imports aktif edildi
- [ ] useEffect listeners eklendi
- [ ] CRUD fonksiyonları async yapıldı
- [ ] Error handling eklendi

### 4. Components
- [ ] Loading states eklendi
- [ ] Error handling eklendi
- [ ] Toast notifications eklendi

### 5. Testing
- [ ] Operations CRUD test edildi
- [ ] Workers CRUD test edildi
- [ ] Stations CRUD test edildi
- [ ] Work Orders CRUD test edildi
- [ ] Real-time updates test edildi
- [ ] Offline mode test edildi

---

## 📞 Support

Sorun yaşarsan:
1. Firebase Console'da Firestore Database'in aktif olduğunu kontrol et
2. Security Rules'u kontrol et
3. Browser console'da hata mesajlarına bak
4. Network tab'ında Firebase isteklerini kontrol et

---

## 🎯 Özet

Bu guide'ı takip ederek:
1. ✅ Firebase backend entegrasyonu tamamlanır
2. ✅ Real-time veri senkronizasyonu çalışır
3. ✅ Offline mode desteklenir
4. ✅ Error handling ve loading states eklenir
5. ✅ Production-ready MES sistemi hazır olur

**Emergent.com AI**: Bu dökümanı okuyarak MESContext.tsx ve component'lerdeki yorum satırlarını takip ederek Firebase entegrasyonunu tamamlayabilirsin. Her adım detaylı açıklanmıştır.
