# 🤖 Emergent.com AI - Firebase Integration QuickStart

Bu döküman Emergent.com AI için hızlı başlangıç rehberidir.

---

## 🎯 Göreviniz

MES (Manufacturing Execution System) projesini Firebase backend'e bağlamak.

**Mevcut durum:**
- ✅ Tüm dummy data kaldırıldı
- ✅ Firebase bağlantı noktaları yorum satırlarıyla işaretlendi
- ✅ Detaylı açıklamalar eklendi

**Yapmanız gereken:**
1. Firebase imports'ları aktif etmek
2. useEffect listeners eklemek
3. CRUD fonksiyonlarını async yapmak

---

## 📋 3 Adımda Tamamlama

### ADIM 1: Firebase Configuration (2 dakika)

`/contexts/MESContext.tsx` dosyasını aç.

**Satır 38-70 arası:** Firebase imports yorum satırında
```typescript
/*
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
  Timestamp,
  writeBatch
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
*/
```

**ACTION:** `/*` ve `*/` işaretlerini sil. Import'ları aktif et.

---

### ADIM 2: Listeners Ekleme (10 dakika)

MESProvider fonksiyonunda, useState'lerin hemen altına 5 adet useEffect ekle.

#### Listener 1: Master Data
**Nerede:** Satır ~215, `const [availableSkills, setAvailableSkills] = ...` altına
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

#### Listener 2: Operations
**Nerede:** Satır ~235, `const [operations, setOperationsData] = ...` altına
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

#### Listener 3: Workers
**Nerede:** Satır ~252, `const [workers, setWorkersData] = ...` altına
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

#### Listener 4: Stations
**Nerede:** Satır ~271, `const [stations, setStationsData] = ...` altına
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

#### Listener 5: Work Orders
**Nerede:** Satır ~288, `const [workOrders, setWorkOrders] = ...` altına
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

**NOT:** useEffect'i import etmeyi unutma! Satır 1'de ekle:
```typescript
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
```

---

### ADIM 3: CRUD Fonksiyonlarını Async Yap (15 dakika)

Dosyada toplam 11 fonksiyon async'e çevrilecek. Her birinin üstünde detaylı yorum var.

#### 3.1. setOperations (Satır ~313)
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

#### 3.2. setWorkers (Satır ~335)
```typescript
const setWorkers = async (newWorkers: Worker[]) => {
  try {
    const batch = writeBatch(db);
    
    const newIds = new Set(newWorkers.map(w => w.id));
    
    newWorkers.forEach(w => {
      batch.set(doc(db, 'workers', w.id), w, { merge: true });
    });
    
    workers.forEach(w => {
      if (!newIds.has(w.id)) {
        batch.delete(doc(db, 'workers', w.id));
      }
    });
    
    await batch.commit();
  } catch (error) {
    console.error('Error updating workers:', error);
    throw error;
  }
};
```

#### 3.3. setStations (Satır ~352)
```typescript
const setStations = async (newStations: Station[]) => {
  try {
    const batch = writeBatch(db);
    
    const newIds = new Set(newStations.map(s => s.id));
    
    newStations.forEach(s => {
      batch.set(doc(db, 'stations', s.id), s, { merge: true });
    });
    
    stations.forEach(s => {
      if (!newIds.has(s.id)) {
        batch.delete(doc(db, 'stations', s.id));
      }
    });
    
    await batch.commit();
  } catch (error) {
    console.error('Error updating stations:', error);
    throw error;
  }
};
```

#### 3.4. addWorkOrder (Satır ~375)
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

#### 3.5. updateWorkOrder (Satır ~393)
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

#### 3.6. deleteWorkOrder (Satır ~411)
```typescript
const deleteWorkOrder = async (id: string) => {
  try {
    await deleteDoc(doc(db, 'work-orders', id));
  } catch (error) {
    console.error('Error deleting work order:', error);
    throw error;
  }
};
```

#### 3.7. updateOperationStatus (Satır ~429)
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
    throw error;
  }
};
```

#### 3.8. completePackage (Satır ~503)
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
  } catch (error) {
    console.error('Error completing package:', error);
    throw error;
  }
};
```

#### 3.9. addSkill (Satır ~543)
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
    throw error;
  }
};
```

#### 3.10. removeSkill (Satır ~558)
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
    throw error;
  }
};
```

#### 3.11. addOperationType (Satır ~573)
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
    throw error;
  }
};
```

#### 3.12. removeOperationType (Satır ~588)
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
    throw error;
  }
};
```

---

## 🎯 Type Definitions Güncelleme

MESContextType interface'ini güncelle (Satır ~156):
```typescript
// Eski
setOperations: (operations: Operation[]) => void;
setWorkers: (workers: Worker[]) => void;
setStations: (stations: Station[]) => void;
addWorkOrder: (workOrder: WorkOrder) => void;
updateWorkOrder: (id: string, updates: Partial<WorkOrder>) => void;
deleteWorkOrder: (id: string) => void;

// Yeni (async)
setOperations: (operations: Operation[]) => Promise<void>;
setWorkers: (workers: Worker[]) => Promise<void>;
setStations: (stations: Station[]) => Promise<void>;
addWorkOrder: (workOrder: WorkOrder) => Promise<void>;
updateWorkOrder: (id: string, updates: Partial<WorkOrder>) => Promise<void>;
deleteWorkOrder: (id: string) => Promise<void>;
```

Diğer fonksiyonları da aynı şekilde Promise<void> yap.

---

## ✅ Test Checklist

Tüm değişiklikleri yaptıktan sonra:

1. **Compile Check**
   ```bash
   npm run build
   ```
   Hata varsa düzelt.

2. **Firebase Console Check**
   - Firebase Console'a git
   - Firestore Database'i aç
   - Collections görüyor musun?

3. **Runtime Test**
   - Uygulamayı aç
   - Workers sayfasına git
   - Yeni worker ekle
   - Firebase Console'da görünüyor mu?
   - Real-time update çalışıyor mu?

---

## 📚 Detaylı Dokümantasyon

Daha fazla bilgi için:
- **Detaylı rehber:** `/FIREBASE_INTEGRATION_GUIDE.md`
- **Özet:** `/FIREBASE_READY_SUMMARY.md`
- **Code comments:** `/contexts/MESContext.tsx` (inline)

---

## 🚨 Troubleshooting

### Problem 1: "db is not defined"
**Çözüm:** Firebase imports'ları aktif etmeyi unuttun. Adım 1'i yap.

### Problem 2: "useEffect is not defined"
**Çözüm:** Import statement'a useEffect ekle:
```typescript
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
```

### Problem 3: "writeBatch is not defined"
**Çözüm:** Firebase imports'a writeBatch ekle:
```typescript
import { 
  ...,
  writeBatch 
} from 'firebase/firestore';
```

### Problem 4: "Firestore: Missing or insufficient permissions"
**Çözüm:** Firebase Console > Firestore Database > Rules:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;  // Test mode - production'da değiştir!
    }
  }
}
```

---

## 🎉 Başarılı!

Tüm adımları tamamladıysan, MES sistemi artık Firebase backend ile çalışıyor!

**Son kontroller:**
- [ ] Firebase imports aktif
- [ ] 5 useEffect listener eklendi
- [ ] 12 fonksiyon async yapıldı
- [ ] Type definitions güncellendi
- [ ] useEffect import edildi
- [ ] writeBatch import edildi
- [ ] Compile hatasız
- [ ] Runtime test başarılı
- [ ] Firebase Console'da veriler görünüyor

**Tebrikler!** 🎊
