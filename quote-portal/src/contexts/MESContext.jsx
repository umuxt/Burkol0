import { createContext, useContext, useState, ReactNode } from "react";
import { MESService } from '../lib/mes-service.js';
import { updateProductionState } from '../../domains/production/js/mesApi.js';

/**
 * ============================================================================
 * MES CONTEXT - BACKEND API INTEGRATION
 * ============================================================================
 * 
 * Bu context MES sisteminin merkezi state yönetimini sağlar.
 * Backend API üzerinden Firebase Admin SDK ile haberleşir.
 * 
 * API ENDPOINTS:
 * ============================================================================
 * 
 * GET /api/mes/operations       - Operations listesi
 * POST /api/mes/operations      - Operations güncelleme (batch)
 * GET /api/mes/workers          - Workers listesi  
 * POST /api/mes/workers         - Workers güncelleme (batch)
 * GET /api/mes/stations         - Stations listesi
 * POST /api/mes/stations        - Stations güncelleme (batch)
 * GET /api/mes/work-orders      - Work orders listesi
 * POST /api/mes/work-orders     - Work order oluşturma
 * PUT /api/mes/work-orders/:id  - Work order güncelleme
 * DELETE /api/mes/work-orders/:id - Work order silme
 * GET /api/mes/master-data      - Master data (skills, types)
 * POST /api/mes/master-data     - Master data güncelleme
 */

// ============================================================================
// TYPE DEFINITIONS (same as original)
// ============================================================================

export interface Operation {
  id: string;
  name: string;
  description: string;
  operationType: string;
  estimatedTime: number;
  requiredSkills: string[];
  requiredStationId: string;
  // Semi-finished output code token for this operation (e.g., K, D, C)
  semiOutputCode?: string;
}

export interface Worker {
  id: string;
  name: string;
  email: string;
  skills: string[];
  shift: string;
  availability: string;
}

export interface Station {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  currentStatus: string;
  location?: string;
}

export interface WorkOrderOperation {
  id: string;
  operationId: string;
  assignedWorkerId?: string;
  assignedStationId?: string;
  status: "not-started" | "in-progress" | "completed" | "on-hold";
  startTime?: Date;
  endTime?: Date;
  estimatedTime: number;
  actualTime?: number;
  notes?: string;
}

export interface WorkOrder {
  id: string;
  title: string;
  description: string;
  workOrderCode?: string; // Optional work order code for production state tracking
  priority: "low" | "medium" | "high";
  status: "draft" | "active" | "completed" | "on-hold";
  operations: WorkOrderOperation[];
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  progress: number;
  assignedWorkers: string[];
  requiredStations: string[];
}

// ============================================================================
// CONTEXT INTERFACE
// ============================================================================

interface MESContextType {
  // Master Data
  operations: Operation[];
  workers: Worker[];
  stations: Station[];
  availableSkills: string[];
  availableOperationTypes: string[];
  
  // Work Orders
  workOrders: WorkOrder[];
  
  // Loading & Error States
  loading: boolean;
  error: string | null;
  
  // CRUD Functions - All async with backend API calls
  setOperations: (operations: Operation[]) => Promise<void>;
  setWorkers: (workers: Worker[]) => Promise<void>;
  setStations: (stations: Station[]) => Promise<void>;
  addSkill: (skill: string) => Promise<void>;
  removeSkill: (skill: string) => Promise<void>;
  addOperationType: (type: string) => Promise<void>;
  removeOperationType: (type: string) => Promise<void>;
  
  // Work Order Functions
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
  
  // Helper functions (sync - calculated from state)
  getWorkerById: (id: string) => Worker | undefined;
  getOperationById: (id: string) => Operation | undefined;
  getStationById: (id: string) => Station | undefined;
  getWorkOrdersByWorker: (workerId: string) => WorkOrder[];
  getAvailableWorkers: (requiredSkills: string[]) => Worker[];
  
  // Refresh function
  refreshData: () => Promise<void>;
}

// ============================================================================
// CONTEXT CREATION
// ============================================================================

const MESContext = createContext<MESContextType | undefined>(undefined);

export const useMES = () => {
  const context = useContext(MESContext);
  if (context === undefined) {
    throw new Error('useMES must be used within a MESProvider');
  }
  return context;
};

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

interface MESProviderProps {
  children: ReactNode;
}

export const MESProvider: React.FC<MESProviderProps> = ({ children }) => {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  
  // Master Data States
  const [operations, setOperationsState] = useState<Operation[]>([]);
  const [workers, setWorkersState] = useState<Worker[]>([]);  
  const [stations, setStationsState] = useState<Station[]>([]);
  const [availableSkills, setAvailableSkillsState] = useState<string[]>([]);
  const [availableOperationTypes, setAvailableOperationTypesState] = useState<string[]>([]);
  
  // Work Orders State
  const [workOrders, setWorkOrdersState] = useState<WorkOrder[]>([]);
  
  // UI States  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================================================
  // DATA LOADING - Initial load and polling for updates
  // ============================================================================
  
  const loadAllData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Load all data in parallel
      const [
        operationsData,
        workersData, 
        stationsData,
        workOrdersData,
        masterData
      ] = await Promise.all([
        MESService.getOperations(),
        MESService.getWorkers(),
        MESService.getStations(), 
        MESService.getWorkOrders(),
        MESService.getMasterData()
      ]);
      
      setOperationsState(operationsData);
      setWorkersState(workersData);
      setStationsState(stationsData);
      setWorkOrdersState(workOrdersData);
      setAvailableSkillsState(masterData.availableSkills || []);
      setAvailableOperationTypesState(masterData.availableOperationTypes || []);
      
    } catch (error) {
      console.error('❌ Error loading MES data:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Note: Automatic data load and polling removed. Consumers should call refreshData() explicitly when needed.

  // ============================================================================
  // CRUD OPERATIONS - Backend API calls
  // ============================================================================

  const setOperations = async (newOperations: Operation[]) => {
    try {
      await MESService.setOperations(newOperations);
      setOperationsState(newOperations);
    } catch (error) {
      console.error('❌ Error updating operations:', error);
      throw error;
    }
  };

  const setWorkers = async (newWorkers: Worker[]) => {
    try {
      await MESService.setWorkers(newWorkers);
      setWorkersState(newWorkers);
    } catch (error) {
      console.error('❌ Error updating workers:', error);
      throw error;
    }
  };

  const setStations = async (newStations: Station[]) => {
    try {
      await MESService.setStations(newStations);
      setStationsState(newStations);
    } catch (error) {
      console.error('❌ Error updating stations:', error);
      throw error;
    }
  };

  const addSkill = async (skill: string) => {
    try {
      const newSkills = [...availableSkills, skill];
      await MESService.setMasterData({
        availableSkills: newSkills,
        availableOperationTypes
      });
      setAvailableSkillsState(newSkills);
    } catch (error) {
      console.error('❌ Error adding skill:', error);
      throw error;
    }
  };

  const removeSkill = async (skill: string) => {
    try {
      const newSkills = availableSkills.filter(s => s !== skill);
      await MESService.setMasterData({
        availableSkills: newSkills,
        availableOperationTypes
      });
      setAvailableSkillsState(newSkills);
    } catch (error) {
      console.error('❌ Error removing skill:', error);
      throw error;
    }
  };

  const addOperationType = async (type: string) => {
    try {
      const newTypes = [...availableOperationTypes, type];
      await MESService.setMasterData({
        availableSkills,
        availableOperationTypes: newTypes
      });
      setAvailableOperationTypesState(newTypes);
    } catch (error) {
      console.error('❌ Error adding operation type:', error);
      throw error;
    }
  };

  const removeOperationType = async (type: string) => {
    try {
      const newTypes = availableOperationTypes.filter(t => t !== type);
      await MESService.setMasterData({
        availableSkills,
        availableOperationTypes: newTypes
      });
      setAvailableOperationTypesState(newTypes);
    } catch (error) {
      console.error('❌ Error removing operation type:', error);
      throw error;
    }
  };

  const addWorkOrder = async (workOrder: WorkOrder) => {
    try {
      await MESService.addWorkOrder(workOrder);
      setWorkOrdersState(prev => [workOrder, ...prev]);
    } catch (error) {
      console.error('❌ Error adding work order:', error);
      throw error;
    }
  };

  const updateWorkOrder = async (id: string, updates: Partial<WorkOrder>) => {
    try {
      await MESService.updateWorkOrder(id, updates);
      setWorkOrdersState(prev => 
        prev.map(wo => wo.id === id ? { ...wo, ...updates } : wo)
      );
    } catch (error) {
      console.error('❌ Error updating work order:', error);
      throw error;
    }
  };

  const deleteWorkOrder = async (id: string) => {
    try {
      await MESService.deleteWorkOrder(id);
      setWorkOrdersState(prev => prev.filter(wo => wo.id !== id));
    } catch (error) {
      console.error('❌ Error deleting work order:', error);
      throw error;
    }
  };

  const updateOperationStatus = async (
    workOrderId: string,
    operationId: string,
    status: WorkOrderOperation["status"],
    actualTime?: number
  ) => {
    try {
      const workOrder = workOrders.find(wo => wo.id === workOrderId);
      if (!workOrder) throw new Error('Work order not found');
      
      const updatedOperations = workOrder.operations.map(op => {
        if (op.id === operationId) {
          const updates: Partial<WorkOrderOperation> = { 
            status,
            ...(actualTime !== undefined && { actualTime }),
            ...(status === 'in-progress' && { startTime: new Date() }),
            ...(status === 'completed' && { endTime: new Date() })
          };
          return { ...op, ...updates };
        }
        return op;
      });
      
      // Calculate progress
      const completedOps = updatedOperations.filter(op => op.status === 'completed');
      const progress = Math.round((completedOps.length / updatedOperations.length) * 100);
      
      // Check if all operations are completed
      const allOperationsCompleted = updatedOperations.length > 0 && 
                                   updatedOperations.every(op => op.status === 'completed');
      
      const updates = {
        operations: updatedOperations,
        progress,
        ...(allOperationsCompleted && { status: 'completed' as const }),
        updatedAt: new Date()
      };
      
      await updateWorkOrder(workOrderId, updates);
      
      // If all operations are completed and we have a workOrderCode, update production state
      if (allOperationsCompleted && workOrder.workOrderCode) {
        try {
          await updateProductionState(workOrder.workOrderCode, 'Üretim Tamamlandı');
          console.log(`Production state updated to 'Üretim Tamamlandı' for ${workOrder.workOrderCode}`);
        } catch (error) {
          console.error('❌ Error updating production state:', error);
          // Don't throw - the work order update was successful even if production state update failed
        }
      }
    } catch (error) {
      console.error('❌ Error updating operation status:', error);
      throw error;
    }
  };

  const completePackage = async (workOrderId: string) => {
    try {
      await updateWorkOrder(workOrderId, {
        status: 'completed',
        progress: 100,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('❌ Error completing package:', error);
      throw error;
    }
  };

  // ============================================================================
  // HELPER FUNCTIONS (sync - calculated from state)
  // ============================================================================

  const getWorkerById = (id: string): Worker | undefined => {
    return workers.find(w => w.id === id);
  };

  const getOperationById = (id: string): Operation | undefined => {
    return operations.find(op => op.id === id);
  };

  const getStationById = (id: string): Station | undefined => {
    return stations.find(s => s.id === id);
  };

  const getWorkOrdersByWorker = (workerId: string): WorkOrder[] => {
    return workOrders.filter(wo => wo.assignedWorkers.includes(workerId));
  };

  const getAvailableWorkers = (requiredSkills: string[]): Worker[] => {
    return workers.filter(worker => 
      worker.availability === 'available' && 
      requiredSkills.every(skill => worker.skills.includes(skill))
    );
  };

  const refreshData = async () => {
    await loadAllData();
  };

  // ============================================================================
  // CONTEXT VALUE
  // ============================================================================

  const contextValue: MESContextType = {
    // Master Data
    operations,
    workers,
    stations,
    availableSkills,
    availableOperationTypes,
    
    // Work Orders
    workOrders,
    
    // UI States
    loading,
    error,
    
    // CRUD Functions
    setOperations,
    setWorkers,
    setStations,
    addSkill,
    removeSkill,
    addOperationType,
    removeOperationType,
    
    // Work Order Functions
    addWorkOrder,
    updateWorkOrder,
    deleteWorkOrder,
    
    // Operation Updates
    updateOperationStatus,
    completePackage,
    
    // Helper Functions
    getWorkerById,
    getOperationById,
    getStationById,
    getWorkOrdersByWorker,
    getAvailableWorkers,
    
    // Refresh
    refreshData
  };

  return (
    <MESContext.Provider value={contextValue}>
      {children}
    </MESContext.Provider>
  );
};
