import { createContext, useContext, useState, useEffect, ReactNode } from "react";
// NOTE: useEffect yukarıda import edildi - Firebase listeners için gerekli

/**
 * ============================================================================
 * MES CONTEXT - FIREBASE INTEGRATION GUIDE
 * ============================================================================
 * 
 * Bu dosya MES sisteminin merkezi state yönetimini sağlar.
 * Firebase backend entegrasyonu için hazırlanmıştır.
 * 
 * FIREBASE COLLECTION YAPISI:
 * ============================================================================
 * 
 * 1. /settings/master-data
 *    - availableSkills: string[]
 *    - availableOperationTypes: string[]
 * 
 * 2. /operations (collection)
 *    - Her dokuman bir Operation objesi içerir
 *    - Document ID: operation.id
 * 
 * 3. /workers (collection)
 *    - Her dokuman bir Worker objesi içerir
 *    - Document ID: worker.id
 * 
 * 4. /stations (collection)
 *    - Her dokuman bir Station objesi içerir
 *    - Document ID: station.id
 * 
 * 5. /work-orders (collection)
 *    - Her dokuman bir WorkOrder objesi içerir (operations array dahil)
 *    - Document ID: workOrder.id
 * 
 * EMERGENT.COM AI İÇİN TALİMATLAR:
 * ============================================================================
 * 1. Firebase imports ve configuration ekle (üstte, yorum satırlarını kaldır)
 * 2. Her useState'in yanındaki "FIREBASE: ..." yorumlarını oku
 * 3. useEffect hookları ekleyerek real-time listeners kur
 * 4. Her state değiştiren fonksiyonda Firestore write işlemleri ekle
 * 5. Error handling ve loading states ekle
 * 6. Offline capability için local cache kullan
 */

// ============================================================================
// FIREBASE IMPORTS - Yorum satırlarını kaldırarak aktif et
// ============================================================================
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

// Firebase configuration - .env dosyasından al
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

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface Operation {
  id: string;
  name: string;
  description: string;
  operationType: string;
  estimatedTime: number;
  requiredSkills: string[];
  requiredStationId: string;
}

export interface Worker {
  id: string;
  name: string;
  email: string;
  skills: string[];
  shift: string;
  availability: string;
  assignedOperationIds: string[];
  assignedStationIds: string[];
}

export interface Station {
  id: string;
  name: string;
  type: string;
  capacity: number;
  status: string;
}

export interface WorkOrderOperation {
  id: string;
  operationId: string;
  operationName: string;
  operationType: string;
  assignedWorkerId?: string;
  assignedWorkerName?: string;
  stationId?: string;
  stationName?: string;
  estimatedTime: number;
  actualTime?: number;
  status: "pending" | "in-progress" | "completed";
  sequence: number;
  startedAt?: string;
  completedAt?: string;
  x?: number;
  y?: number;
}

export interface WorkOrder {
  id: string;
  name: string;
  description: string;
  productName: string;
  quantity: number;
  packageSize: number;
  completedPackages: number;
  totalPackages: number;
  priority: "low" | "medium" | "high";
  status: "planned" | "in-progress" | "completed" | "on-hold";
  operations: WorkOrderOperation[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  estimatedDuration: number;
  actualDuration?: number;
}

interface MESContextType {
  // Master Data
  operations: Operation[];
  workers: Worker[];
  stations: Station[];
  availableSkills: string[];
  availableOperationTypes: string[];
  
  // FIREBASE: Async functions return Promise<void>
  // EMERGENT.COM AI: Fonksiyonları async yaptığında return type'ları da güncelle
  setOperations: (operations: Operation[]) => void | Promise<void>;
  setWorkers: (workers: Worker[]) => void | Promise<void>;
  setStations: (stations: Station[]) => void | Promise<void>;
  addSkill: (skill: string) => void | Promise<void>;
  removeSkill: (skill: string) => void | Promise<void>;
  addOperationType: (type: string) => void | Promise<void>;
  removeOperationType: (type: string) => void | Promise<void>;
  
  // Work Orders
  workOrders: WorkOrder[];
  addWorkOrder: (workOrder: WorkOrder) => void | Promise<void>;
  updateWorkOrder: (id: string, updates: Partial<WorkOrder>) => void | Promise<void>;
  deleteWorkOrder: (id: string) => void | Promise<void>;
  
  // Operation Updates
  updateOperationStatus: (
    workOrderId: string,
    operationId: string,
    status: WorkOrderOperation["status"],
    actualTime?: number
  ) => void | Promise<void>;
  
  // Package Tracking
  completePackage: (workOrderId: string) => void | Promise<void>;
  
  // Helper functions (Read-only, sync)
  getWorkerById: (id: string) => Worker | undefined;
  getOperationById: (id: string) => Operation | undefined;
  getStationById: (id: string) => Station | undefined;
  getWorkOrdersByWorker: (workerId: string) => WorkOrder[];
  getAvailableWorkers: (requiredSkills: string[]) => Worker[];
}

const MESContext = createContext<MESContextType | undefined>(undefined);

export function MESProvider({ children }: { children: ReactNode }) {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  
  /**
   * FIREBASE: Master Data Settings
   * Collection: /settings/master-data
   * 
   * EMERGENT.COM AI: useEffect ekle:
   * useEffect(() => {
   *   const docRef = doc(db, 'settings', 'master-data');
   *   const unsubscribe = onSnapshot(docRef, (doc) => {
   *     if (doc.exists()) {
   *       const data = doc.data();
   *       setAvailableSkills(data.availableSkills || []);
   *       setAvailableOperationTypes(data.availableOperationTypes || []);
   *     }
   *   });
   *   return () => unsubscribe();
   * }, []);
   */
  const [availableSkills, setAvailableSkills] = useState<string[]>([]);
  const [availableOperationTypes, setAvailableOperationTypes] = useState<string[]>([]);

  /**
   * FIREBASE: Operations Collection
   * Collection: /operations
   * 
   * EMERGENT.COM AI: useEffect ekle:
   * useEffect(() => {
   *   const q = query(collection(db, 'operations'), orderBy('name'));
   *   const unsubscribe = onSnapshot(q, (snapshot) => {
   *     const ops = snapshot.docs.map(doc => ({
   *       id: doc.id,
   *       ...doc.data()
   *     } as Operation));
   *     setOperationsData(ops);  // Private setter kullan
   *   });
   *   return () => unsubscribe();
   * }, []);
   */
  const [operations, setOperationsData] = useState<Operation[]>([]);

  /**
   * FIREBASE: Workers Collection
   * Collection: /workers
   * 
   * EMERGENT.COM AI: useEffect ekle:
   * useEffect(() => {
   *   const q = query(collection(db, 'workers'), orderBy('name'));
   *   const unsubscribe = onSnapshot(q, (snapshot) => {
   *     const wrks = snapshot.docs.map(doc => ({
   *       id: doc.id,
   *       ...doc.data()
   *     } as Worker));
   *     setWorkersData(wrks);  // Private setter kullan
   *   });
   *   return () => unsubscribe();
   * }, []);
   */
  const [workers, setWorkersData] = useState<Worker[]>([]);

  /**
   * FIREBASE: Stations Collection
   * Collection: /stations
   * 
   * EMERGENT.COM AI: useEffect ekle:
   * useEffect(() => {
   *   const q = query(collection(db, 'stations'), orderBy('name'));
   *   const unsubscribe = onSnapshot(q, (snapshot) => {
   *     const stns = snapshot.docs.map(doc => ({
   *       id: doc.id,
   *       ...doc.data()
   *     } as Station));
   *     setStationsData(stns);  // Private setter kullan
   *   });
   *   return () => unsubscribe();
   * }, []);
   */
  const [stations, setStationsData] = useState<Station[]>([]);

  /**
   * FIREBASE: Work Orders Collection
   * Collection: /work-orders
   * 
   * EMERGENT.COM AI: useEffect ekle:
   * useEffect(() => {
   *   const q = query(collection(db, 'work-orders'), orderBy('createdAt', 'desc'));
   *   const unsubscribe = onSnapshot(q, (snapshot) => {
   *     const wos = snapshot.docs.map(doc => ({
   *       id: doc.id,
   *       ...doc.data()
   *     } as WorkOrder));
   *     setWorkOrders(wos);
   *   });
   *   return () => unsubscribe();
   * }, []);
   */
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);

  // ============================================================================
  // MASTER DATA SETTER FUNCTIONS
  // ============================================================================

  /**
   * FIREBASE: Set Operations (Batch Update)
   * 
   * EMERGENT.COM AI: 
   * Bu fonksiyon tüm operations listesini alır ve Firebase'e yazar.
   * Optimizasyon: Sadece değişen itemları güncellemek için diff algoritması kullan.
   * 
   * Örnek implementation:
   * const setOperations = async (newOperations: Operation[]) => {
   *   try {
   *     const batch = writeBatch(db);
   *     
   *     // Mevcut operations
   *     const currentIds = new Set(operations.map(op => op.id));
   *     const newIds = new Set(newOperations.map(op => op.id));
   *     
   *     // Yeni veya güncellenen operations
   *     newOperations.forEach(op => {
   *       const docRef = doc(db, 'operations', op.id);
   *       batch.set(docRef, {
   *         ...op,
   *         updatedAt: Timestamp.now()
   *       }, { merge: true });
   *     });
   *     
   *     // Silinen operations
   *     operations.forEach(op => {
   *       if (!newIds.has(op.id)) {
   *         const docRef = doc(db, 'operations', op.id);
   *         batch.delete(docRef);
   *       }
   *     });
   *     
   *     await batch.commit();
   *     toast.success('Operations updated');
   *   } catch (error) {
   *     console.error('Error updating operations:', error);
   *     toast.error('Failed to update operations');
   *     throw error;
   *   }
   * };
   */
  const setOperations = (newOperations: Operation[]) => {
    setOperationsData(newOperations);
    // FIREBASE: Yukarıdaki yorum satırlarındaki async fonksiyonu kullan
  };

  /**
   * FIREBASE: Set Workers (Batch Update)
   * 
   * EMERGENT.COM AI: 
   * setOperations ile aynı mantıkta çalışır.
   * writeBatch kullanarak tüm workers'ı güncelle.
   */
  const setWorkers = (newWorkers: Worker[]) => {
    setWorkersData(newWorkers);
    // FIREBASE: setOperations pattern'ini takip et
  };

  /**
   * FIREBASE: Set Stations (Batch Update)
   * 
   * EMERGENT.COM AI: 
   * setOperations ile aynı mantıkta çalışır.
   * writeBatch kullanarak tüm stations'ı güncelle.
   */
  const setStations = (newStations: Station[]) => {
    setStationsData(newStations);
    // FIREBASE: setOperations pattern'ini takip et
  };

  // ============================================================================
  // WORK ORDER FUNCTIONS
  // ============================================================================

  /**
   * FIREBASE: Add Work Order
   * 
   * EMERGENT.COM AI: Firebase write işlemi ekle:
   * const addWorkOrder = async (workOrder: WorkOrder) => {
   *   try {
   *     await setDoc(doc(db, 'work-orders', workOrder.id), workOrder);
   *     // Local state güncelleme listener tarafından otomatik yapılacak
   *   } catch (error) {
   *     console.error('Error adding work order:', error);
   *     throw error;
   *   }
   * };
   */
  const addWorkOrder = (workOrder: WorkOrder) => {
    setWorkOrders([...workOrders, workOrder]);
    // FIREBASE: Yukarıdaki yorum satırlarındaki async fonksiyonu kullan
  };

  /**
   * FIREBASE: Update Work Order
   * 
   * EMERGENT.COM AI: Firebase update işlemi ekle:
   * const updateWorkOrder = async (id: string, updates: Partial<WorkOrder>) => {
   *   try {
   *     await updateDoc(doc(db, 'work-orders', id), updates);
   *     // Local state güncelleme listener tarafından otomatik yapılacak
   *   } catch (error) {
   *     console.error('Error updating work order:', error);
   *     throw error;
   *   }
   * };
   */
  const updateWorkOrder = (id: string, updates: Partial<WorkOrder>) => {
    setWorkOrders(
      workOrders.map((wo) => (wo.id === id ? { ...wo, ...updates } : wo))
    );
    // FIREBASE: Yukarıdaki yorum satırlarındaki async fonksiyonu kullan
  };

  /**
   * FIREBASE: Delete Work Order
   * 
   * EMERGENT.COM AI: Firebase delete işlemi ekle:
   * const deleteWorkOrder = async (id: string) => {
   *   try {
   *     await deleteDoc(doc(db, 'work-orders', id));
   *     // Local state güncelleme listener tarafından otomatik yapılacak
   *   } catch (error) {
   *     console.error('Error deleting work order:', error);
   *     throw error;
   *   }
   * };
   */
  const deleteWorkOrder = (id: string) => {
    setWorkOrders(workOrders.filter((wo) => wo.id !== id));
    // FIREBASE: Yukarıdaki yorum satırlarındaki async fonksiyonu kullan
  };

  /**
   * FIREBASE: Update Operation Status
   * 
   * EMERGENT.COM AI: 
   * Bu fonksiyon bir work order içindeki operation'ı günceller.
   * Firebase'de work order document'ını bul ve operations array'ini güncelle:
   * 
   * const updateOperationStatus = async (...) => {
   *   const wo = workOrders.find(w => w.id === workOrderId);
   *   if (!wo) return;
   *   
   *   const updatedOperations = wo.operations.map(op => {
   *     if (op.id === operationId) {
   *       // Update logic (aşağıdaki gibi)
   *     }
   *     return op;
   *   });
   *   
   *   // Check status changes
   *   const allCompleted = updatedOperations.every(op => op.status === 'completed');
   *   const woStatus = allCompleted ? 'completed' : 'in-progress';
   *   
   *   await updateDoc(doc(db, 'work-orders', workOrderId), {
   *     operations: updatedOperations,
   *     status: woStatus,
   *     completedAt: allCompleted ? new Date().toISOString() : null
   *   });
   * };
   */
  const updateOperationStatus = (
    workOrderId: string,
    operationId: string,
    status: WorkOrderOperation["status"],
    actualTime?: number
  ) => {
    setWorkOrders(
      workOrders.map((wo) => {
        if (wo.id === workOrderId) {
          const updatedOperations = wo.operations.map((op) => {
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

          const allCompleted = updatedOperations.every(
            (op) => op.status === "completed"
          );
          
          const anyInProgress = updatedOperations.some(
            (op) => op.status === "in-progress"
          );

          let woStatus = wo.status;
          if (allCompleted) {
            woStatus = "completed";
          } else if (anyInProgress || updatedOperations.some((op) => op.status === "completed")) {
            woStatus = "in-progress";
          }

          return {
            ...wo,
            operations: updatedOperations,
            status: woStatus,
            completedAt: allCompleted ? new Date().toISOString() : wo.completedAt,
          };
        }
        return wo;
      })
    );
    // FIREBASE: Yukarıdaki yorum satırlarındaki async fonksiyonu kullan
  };

  /**
   * FIREBASE: Complete Package
   * 
   * EMERGENT.COM AI: 
   * Bu fonksiyon bir work order'ın paket sayacını artırır:
   * 
   * const completePackage = async (workOrderId: string) => {
   *   const wo = workOrders.find(w => w.id === workOrderId);
   *   if (!wo) return;
   *   
   *   const newCompletedPackages = wo.completedPackages + 1;
   *   const allPackagesCompleted = newCompletedPackages >= wo.totalPackages;
   *   
   *   await updateDoc(doc(db, 'work-orders', workOrderId), {
   *     completedPackages: newCompletedPackages,
   *     status: allPackagesCompleted ? 'completed' : wo.status,
   *     completedAt: allPackagesCompleted ? new Date().toISOString() : wo.completedAt
   *   });
   * };
   */
  const completePackage = (workOrderId: string) => {
    setWorkOrders((prev) =>
      prev.map((wo) => {
        if (wo.id === workOrderId) {
          const newCompletedPackages = wo.completedPackages + 1;
          const allPackagesCompleted = newCompletedPackages >= wo.totalPackages;
          
          return {
            ...wo,
            completedPackages: newCompletedPackages,
            status: allPackagesCompleted ? "completed" as const : wo.status,
            completedAt: allPackagesCompleted ? new Date().toISOString() : wo.completedAt,
          };
        }
        return wo;
      })
    );
    // FIREBASE: Yukarıdaki yorum satırlarındaki async fonksiyonu kullan
  };

  // ============================================================================
  // HELPER FUNCTIONS (Sadece okuma - Firebase'e yazma yok)
  // ============================================================================
  
  const getWorkerById = (id: string) => workers.find((w) => w.id === id);
  
  const getOperationById = (id: string) => operations.find((op) => op.id === id);
  
  const getStationById = (id: string) => stations.find((st) => st.id === id);
  
  const getWorkOrdersByWorker = (workerId: string) => {
    return workOrders.filter((wo) =>
      wo.operations.some((op) => op.assignedWorkerId === workerId)
    );
  };
  
  const getAvailableWorkers = (requiredSkills: string[]) => {
    if (!requiredSkills || requiredSkills.length === 0) {
      return workers.filter((w) => w.availability === "Available");
    }
    
    return workers.filter((w) => {
      if (w.availability !== "Available") return false;
      return requiredSkills.every((skill) => w.skills.includes(skill));
    });
  };

  // ============================================================================
  // MASTER DATA MANAGEMENT FUNCTIONS
  // ============================================================================

  /**
   * FIREBASE: Add Skill
   * 
   * EMERGENT.COM AI: Master data'ya skill ekle:
   * const addSkill = async (skill: string) => {
   *   if (availableSkills.includes(skill)) return;
   *   
   *   const newSkills = [...availableSkills, skill];
   *   await updateDoc(doc(db, 'settings', 'master-data'), {
   *     availableSkills: newSkills
   *   });
   * };
   */
  const addSkill = (skill: string) => {
    if (!availableSkills.includes(skill)) {
      setAvailableSkills([...availableSkills, skill]);
    }
    // FIREBASE: Yukarıdaki yorum satırlarındaki async fonksiyonu kullan
  };

  /**
   * FIREBASE: Remove Skill
   * 
   * EMERGENT.COM AI: Master data'dan skill çıkar:
   * const removeSkill = async (skill: string) => {
   *   const newSkills = availableSkills.filter(s => s !== skill);
   *   await updateDoc(doc(db, 'settings', 'master-data'), {
   *     availableSkills: newSkills
   *   });
   * };
   */
  const removeSkill = (skill: string) => {
    setAvailableSkills(availableSkills.filter(s => s !== skill));
    // FIREBASE: Yukarıdaki yorum satırlarındaki async fonksiyonu kullan
  };

  /**
   * FIREBASE: Add Operation Type
   * 
   * EMERGENT.COM AI: Master data'ya operation type ekle:
   * const addOperationType = async (type: string) => {
   *   if (availableOperationTypes.includes(type)) return;
   *   
   *   const newTypes = [...availableOperationTypes, type];
   *   await updateDoc(doc(db, 'settings', 'master-data'), {
   *     availableOperationTypes: newTypes
   *   });
   * };
   */
  const addOperationType = (type: string) => {
    if (!availableOperationTypes.includes(type)) {
      setAvailableOperationTypes([...availableOperationTypes, type]);
    }
    // FIREBASE: Yukarıdaki yorum satırlarındaki async fonksiyonu kullan
  };

  /**
   * FIREBASE: Remove Operation Type
   * 
   * EMERGENT.COM AI: Master data'dan operation type çıkar:
   * const removeOperationType = async (type: string) => {
   *   const newTypes = availableOperationTypes.filter(t => t !== type);
   *   await updateDoc(doc(db, 'settings', 'master-data'), {
   *     availableOperationTypes: newTypes
   *   });
   * };
   */
  const removeOperationType = (type: string) => {
    setAvailableOperationTypes(availableOperationTypes.filter(t => t !== type));
    // FIREBASE: Yukarıdaki yorum satırlarındaki async fonksiyonu kullan
  };

  // ============================================================================
  // CONTEXT VALUE
  // ============================================================================

  const value = {
    operations,
    workers,
    stations,
    availableSkills,
    availableOperationTypes,
    setOperations,
    setWorkers,
    setStations,
    addSkill,
    removeSkill,
    addOperationType,
    removeOperationType,
    workOrders,
    addWorkOrder,
    updateWorkOrder,
    deleteWorkOrder,
    updateOperationStatus,
    completePackage,
    getWorkerById,
    getOperationById,
    getStationById,
    getWorkOrdersByWorker,
    getAvailableWorkers,
  };

  return <MESContext.Provider value={value}>{children}</MESContext.Provider>;
}

export function useMES() {
  const context = useContext(MESContext);
  if (context === undefined) {
    throw new Error("useMES must be used within a MESProvider");
  }
  return context;
}
