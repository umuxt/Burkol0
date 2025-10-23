// Firebase Materials Service Layer
// Bu dosya tüm malzeme ile ilgili Firebase işlemlerini yönetir

import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  startAfter,
  writeBatch,
  increment,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  onSnapshot
} from 'firebase/firestore';

import { db, COLLECTIONS } from '../firebase-config.js';
import { validateMaterial } from './firestore-schemas.js';

// ================================
// MATERIAL CRUD OPERATIONS
// ================================

export class MaterialsService {
  
  // **CREATE MATERIAL**
  static async createMaterial(materialData, userId) {
    try {
      // Validation
      const errors = validateMaterial(materialData);
      if (errors.length > 0) {
        throw new Error(`Validation errors: ${errors.join(', ')}`);
      }
      
      // Check if code already exists
      const existingMaterial = await this.getMaterialByCode(materialData.code);
      if (existingMaterial) {
        throw new Error(`Malzeme kodu '${materialData.code}' zaten mevcut`);
      }
      
      // Generate next code if not provided
      if (!materialData.code) {
        materialData.code = await this.generateNextMaterialCode();
      }
      
      // Prepare data with timestamps and defaults
      const newMaterial = {
        ...materialData,
        reserved: materialData.reserved || 0,
        available: materialData.stock - (materialData.reserved || 0),
        isActive: true,
        status: materialData.status || 'Aktif',
        tags: materialData.tags || [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: userId,
        updatedBy: userId,
        lastMovement: null,
        alerts: {
          lowStockEnabled: true,
          expiryAlert: false,
          customThresholds: []
        }
      };
      
      // Add to Firestore
      const docRef = await addDoc(collection(db, COLLECTIONS.MATERIALS), newMaterial);
      
      // Check for low stock alert
      await this.checkAndCreateStockAlert(docRef.id, materialData);
      
      // Update category material count
      await this.updateCategoryMaterialCount(materialData.category);
      
      return {
        id: docRef.id,
        ...newMaterial
      };
      
    } catch (error) {
      console.error('Error creating material:', error);
      throw error;
    }
  }
  
  // **READ MATERIALS**
  static async getMaterials(filters = {}, pagination = {}) {
    try {
      let q = collection(db, COLLECTIONS.MATERIALS);
      
      // Apply filters
      const queries = [];
      
      if (filters.status) {
        queries.push(where('status', '==', filters.status));
      }
      
      if (filters.category) {
        queries.push(where('category', '==', filters.category));
      }
      
      if (filters.type) {
        queries.push(where('type', '==', filters.type));
      }
      
      if (filters.lowStock) {
        queries.push(where('stock', '<=', 'reorderPoint')); // Bu complex query, composite index gerekir
      }
      
      // Add order by
      queries.push(orderBy(pagination.orderBy || 'createdAt', pagination.order || 'desc'));
      
      // Add limit
      if (pagination.limit) {
        queries.push(limit(pagination.limit));
      }
      
      // Add start after for pagination
      if (pagination.startAfter) {
        queries.push(startAfter(pagination.startAfter));
      }
      
      // Build query
      q = query(q, ...queries);
      
      const snapshot = await getDocs(q);
      const materials = [];
      
      snapshot.forEach((doc) => {
        materials.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return materials;
      
    } catch (error) {
      console.error('Error getting materials:', error);
      throw error;
    }
  }
  
  // **GET SINGLE MATERIAL**
  static async getMaterial(materialId) {
    try {
      const docRef = doc(db, COLLECTIONS.MATERIALS, materialId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return {
          id: docSnap.id,
          ...docSnap.data()
        };
      } else {
        throw new Error('Malzeme bulunamadı');
      }
    } catch (error) {
      console.error('Error getting material:', error);
      throw error;
    }
  }
  
  // **GET MATERIAL BY CODE**
  static async getMaterialByCode(code) {
    try {
      const q = query(
        collection(db, COLLECTIONS.MATERIALS),
        where('code', '==', code),
        limit(1)
      );
      
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return {
          id: doc.id,
          ...doc.data()
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error getting material by code:', error);
      throw error;
    }
  }
  
  // **UPDATE MATERIAL**
  static async updateMaterial(materialId, updateData, userId) {
    try {
      // Check if this is a stock update - use backend API for consistency
      if (updateData.stock !== undefined) {
        console.log('📊 Stock update detected, using backend API for consistency...');
        
        const response = await fetch(`/api/materials/${materialId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('bk_admin_token') || ''}`
          },
          body: JSON.stringify({
            ...updateData,
            updatedBy: userId
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Malzeme güncellenemedi');
        }

        const result = await response.json();
        console.log(`✅ Material updated via backend API: ${materialId}`);
        return result;
        
      } else {
        // Direct Firebase update for non-stock changes
        const currentMaterial = await this.getMaterial(materialId);
        
        // Prepare update data
        const updates = {
          ...updateData,
          updatedAt: serverTimestamp(),
          updatedBy: userId
        };
        
        // Update computed fields (non-stock)
        if (updates.reserved !== undefined) {
          const newReserved = updates.reserved;
          updates.available = currentMaterial.stock - newReserved;
        }
        
        // Update document
        const docRef = doc(db, COLLECTIONS.MATERIALS, materialId);
        await updateDoc(docRef, updates);
        
        // Check for stock alerts
        const updatedMaterial = { ...currentMaterial, ...updates };
        await this.checkAndCreateStockAlert(materialId, updatedMaterial);
        
        console.log(`✅ Material updated (non-stock): ${materialId}`);
        return updatedMaterial;
      }
      
    } catch (error) {
      console.error('Error updating material:', error);
      throw error;
    }
  }
  
  // **DELETE MATERIAL** (Soft delete)
  static async deleteMaterial(materialId, userId) {
    try {
      const updates = {
        status: 'Kullanımdan Kaldırıldı',
        isActive: false,
        updatedAt: serverTimestamp(),
        updatedBy: userId
      };
      
      const docRef = doc(db, COLLECTIONS.MATERIALS, materialId);
      await updateDoc(docRef, updates);
      
      return true;
    } catch (error) {
      console.error('Error deleting material:', error);
      throw error;
    }
  }
  
  // **SEARCH MATERIALS**
  static async searchMaterials(searchTerm, filters = {}) {
    try {
      // Firebase doesn't support full-text search natively
      // We'll get all materials and filter client-side
      // For production, consider using Algolia or similar service
      
      const materials = await this.getMaterials(filters);
      
      if (!searchTerm) return materials;
      
      const term = searchTerm.toLowerCase();
      
      return materials.filter(material => 
        material.name.toLowerCase().includes(term) ||
        material.code.toLowerCase().includes(term) ||
        (material.description && material.description.toLowerCase().includes(term)) ||
        material.category.toLowerCase().includes(term)
      );
      
    } catch (error) {
      console.error('Error searching materials:', error);
      throw error;
    }
  }
  
  // ================================
  // STOCK MOVEMENT OPERATIONS
  // ================================
  
  // **LOG STOCK MOVEMENT**
  static async logStockMovement(movementData) {
    try {
      const errors = validateStockMovement(movementData);
      if (errors.length > 0) {
        throw new Error(`Validation errors: ${errors.join(', ')}`);
      }
      
      const movement = {
        ...movementData,
        createdAt: serverTimestamp(),
        approved: true,
        approvedBy: movementData.userId,
        approvedAt: serverTimestamp()
      };
      
      const docRef = await addDoc(collection(db, COLLECTIONS.STOCK_MOVEMENTS), movement);
      
      return {
        id: docRef.id,
        ...movement
      };
      
        } catch (error) {
      console.error('Error searching materials:', error);
      throw error;
    }
  }
  
  // ================================
  // UTILITY FUNCTIONS
  // ================================
  
  // **UPDATE STOCK VIA BACKEND API** (Recommended for production)
  static async updateStockViaAPI(materialCode, quantity, operation = 'add', details = {}) {
    try {
      const response = await fetch(`/api/materials/${materialCode}/stock`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('bk_admin_token') || ''}`
        },
        body: JSON.stringify({
          quantity: Math.abs(quantity),
          operation: operation,
          orderId: details.reference || '',
          itemId: details.itemId || '',
          movementType: details.referenceType || 'manual',
          notes: details.notes || ''
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Stok güncellenemedi');
      }

      const result = await response.json();
      console.log(`✅ Stock updated via API: ${materialCode} ${result.previousStock} → ${result.newStock}`);
      
      return {
        success: true,
        materialCode: result.materialCode,
        materialName: result.materialName,
        previousStock: result.previousStock,
        newStock: result.newStock,
        adjustment: result.adjustment
      };
      
    } catch (error) {
      console.error('Error updating stock via API:', error);
      throw error;
    }
  }
  
  // **UPDATE STOCK BY MATERIAL CODE** (With movement logging)
  static async updateStockByCode(materialCode, quantity, movementType, details = {}) {
    try {
      // First find the material by code
      const material = await this.getMaterialByCode(materialCode);
      if (!material) {
        throw new Error(`Malzeme bulunamadı: ${materialCode}`);
      }
      
      // Use the existing updateStock method with the found material ID
      return await this.updateStock(material.id, quantity, movementType, details);
      
    } catch (error) {
      console.error('Error updating stock by code:', error);
      throw error;
    }
  }

  // **UPDATE STOCK** (With movement logging)
  static async updateStock(materialId, quantity, movementType, details = {}) {
    try {
      const batch = writeBatch(db);
      
      // Get current material
      const material = await this.getMaterial(materialId);
      
      const newStock = material.stock + quantity;
      if (newStock < 0) {
        throw new Error('Stok miktarı negatif olamaz');
      }
      
      // Update material stock
      const materialRef = doc(db, COLLECTIONS.MATERIALS, materialId);
      batch.update(materialRef, {
        stock: newStock,
        available: newStock - material.reserved,
        updatedAt: serverTimestamp(),
        updatedBy: details.userId,
        lastMovement: {
          type: movementType,
          quantity: quantity,
          date: serverTimestamp(),
          reference: details.reference || '',
          userId: details.userId
        }
      });
      
      // Log movement
      const movementRef = doc(collection(db, COLLECTIONS.STOCK_MOVEMENTS));
      batch.set(movementRef, {
        materialId: materialId,
        materialCode: material.code,
        type: quantity > 0 ? 'in' : 'out',
        subType: movementType,
        quantity: Math.abs(quantity),
        unit: material.unit,
        stockBefore: material.stock,
        stockAfter: newStock,
        unitCost: details.unitCost || null,
        totalCost: details.unitCost ? details.unitCost * Math.abs(quantity) : null,
        currency: details.currency || 'TRY',
        reference: details.reference || '',
        referenceType: details.referenceType || 'manual',
        supplierId: details.supplierId || null,
        customerId: details.customerId || null,
        warehouse: details.warehouse || null,
        location: details.location || null,
        notes: details.notes || '',
        reason: details.reason || '',
        movementDate: details.movementDate || serverTimestamp(),
        createdAt: serverTimestamp(),
        userId: details.userId,
        userName: details.userName || 'Unknown',
        approved: true,
        approvedBy: details.userId,
        approvedAt: serverTimestamp()
      });
      
      await batch.commit();
      
      // Check for stock alerts
      const updatedMaterial = { ...material, stock: newStock };
      await this.checkAndCreateStockAlert(materialId, updatedMaterial);
      
      return updatedMaterial;
      
    } catch (error) {
      console.error('Error updating stock:', error);
      throw error;
    }
  }
  
  // **GET STOCK MOVEMENTS**
  static async getStockMovements(materialId, filters = {}) {
    try {
      let q = collection(db, COLLECTIONS.STOCK_MOVEMENTS);
      
      const queries = [];
      
      if (materialId) {
        queries.push(where('materialId', '==', materialId));
      }
      
      if (filters.type) {
        queries.push(where('type', '==', filters.type));
      }
      
      if (filters.userId) {
        queries.push(where('userId', '==', filters.userId));
      }
      
      queries.push(orderBy('movementDate', 'desc'));
      
      if (filters.limit) {
        queries.push(limit(filters.limit));
      }
      
      q = query(q, ...queries);
      
      const snapshot = await getDocs(q);
      const movements = [];
      
      snapshot.forEach((doc) => {
        movements.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return movements;
      
    } catch (error) {
      console.error('Error getting stock movements:', error);
      throw error;
    }
  }
  
  // ================================
  // STOCK ALERTS
  // ================================
  
  // **CHECK AND CREATE STOCK ALERT**
  static async checkAndCreateStockAlert(materialId, material) {
    try {
      // Check if material stock is at or below reorder point
      if (material.stock <= material.reorderPoint) {
        
        // Check if alert already exists
        const existingAlert = await this.getActiveStockAlert(materialId, 'low_stock');
        if (existingAlert) return;
        
        const alertData = {
          materialId: materialId,
          materialCode: material.code,
          materialName: material.name,
          alertType: 'low_stock',
          severity: material.stock === 0 ? 'critical' : 'warning',
          currentStock: material.stock,
          threshold: material.reorderPoint,
          message: material.stock === 0 
            ? `${material.name} stokta kalmadı!`
            : `${material.name} minimum stok seviyesinde (${material.stock}/${material.reorderPoint})`,
          isActive: true,
          isRead: false,
          readBy: [],
          createdAt: serverTimestamp()
        };
        
        await addDoc(collection(db, COLLECTIONS.STOCK_ALERTS), alertData);
      } else {
        // Stock is above reorder point, resolve any existing low stock alerts
        await this.resolveStockAlert(materialId, 'low_stock');
      }
      
    } catch (error) {
      console.error('Error checking stock alert:', error);
    }
  }
  
  // **GET ACTIVE STOCK ALERT**
  static async getActiveStockAlert(materialId, alertType) {
    try {
      const q = query(
        collection(db, COLLECTIONS.STOCK_ALERTS),
        where('materialId', '==', materialId),
        where('alertType', '==', alertType),
        where('isActive', '==', true),
        limit(1)
      );
      
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return {
          id: doc.id,
          ...doc.data()
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error getting active stock alert:', error);
      return null;
    }
  }
  
  // **RESOLVE STOCK ALERT**
  static async resolveStockAlert(materialId, alertType, userId = 'system') {
    try {
      const alert = await this.getActiveStockAlert(materialId, alertType);
      if (!alert) return;
      
      const alertRef = doc(db, COLLECTIONS.STOCK_ALERTS, alert.id);
      await updateDoc(alertRef, {
        isActive: false,
        resolvedAt: serverTimestamp(),
        resolvedBy: userId
      });
      
    } catch (error) {
      console.error('Error resolving stock alert:', error);
    }
  }
  
  // **GET STOCK ALERTS**
  static async getStockAlerts(filters = {}) {
    try {
      let q = collection(db, COLLECTIONS.STOCK_ALERTS);
      
      const queries = [];
      
      if (filters.isActive !== undefined) {
        queries.push(where('isActive', '==', filters.isActive));
      }
      
      if (filters.severity) {
        queries.push(where('severity', '==', filters.severity));
      }
      
      if (filters.alertType) {
        queries.push(where('alertType', '==', filters.alertType));
      }
      
      queries.push(orderBy('createdAt', 'desc'));
      
      if (filters.limit) {
        queries.push(limit(filters.limit));
      }
      
      q = query(q, ...queries);
      
      const snapshot = await getDocs(q);
      const alerts = [];
      
      snapshot.forEach((doc) => {
        alerts.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return alerts;
      
    } catch (error) {
      console.error('Error getting stock alerts:', error);
      throw error;
    }
  }
  
  // ================================
  // UTILITY FUNCTIONS
  // ================================
  
  // **GENERATE NEXT MATERIAL CODE**
  static async generateNextMaterialCode() {
    try {
      const q = query(
        collection(db, COLLECTIONS.MATERIALS),
        orderBy('code', 'desc'),
        limit(1)
      );
      
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        return 'M-001';
      }
      
      const lastDoc = snapshot.docs[0];
      const lastCode = lastDoc.data().code;
      const lastNumber = parseInt(lastCode.split('-')[1]) || 0;
      const nextNumber = lastNumber + 1;
      
      return `M-${String(nextNumber).padStart(3, '0')}`;
      
    } catch (error) {
      console.error('Error generating next material code:', error);
      return 'M-001';
    }
  }
  
  // **UPDATE CATEGORY MATERIAL COUNT**
  static async updateCategoryMaterialCount(categoryId) {
    try {
      const q = query(
        collection(db, COLLECTIONS.MATERIALS),
        where('category', '==', categoryId),
        where('isActive', '==', true)
      );
      
      const snapshot = await getDocs(q);
      const count = snapshot.size;
      
      const categoryRef = doc(db, COLLECTIONS.CATEGORIES, categoryId);
      await updateDoc(categoryRef, {
        materialCount: count,
        updatedAt: serverTimestamp()
      });
      
    } catch (error) {
      console.error('Error updating category material count:', error);
    }
  }
  
  // **GET LOW STOCK MATERIALS**
  static async getLowStockMaterials() {
    try {
      // This requires a composite index: ['stock', 'reorderPoint', 'isActive']
      // For now, we'll get all materials and filter client-side
      const materials = await this.getMaterials({ status: 'Aktif' });
      
      return materials.filter(material => material.stock <= material.reorderPoint);
      
    } catch (error) {
      console.error('Error getting low stock materials:', error);
      throw error;
    }
  }
  
  // **GET DASHBOARD STATS**
  static async getDashboardStats() {
    try {
      const materials = await this.getMaterials();
      
      const stats = {
        totalMaterials: materials.length,
        activeMaterials: materials.filter(m => m.status === 'Aktif').length,
        inactiveMaterials: materials.filter(m => m.status === 'Pasif').length,
        lowStockMaterials: materials.filter(m => m.stock <= m.reorderPoint).length,
        outOfStockMaterials: materials.filter(m => m.stock === 0).length,
        totalStockValue: materials.reduce((sum, m) => sum + (m.stock * (m.costPrice || 0)), 0),
        categories: {}
      };
      
      // Group by categories
      materials.forEach(material => {
        if (!stats.categories[material.category]) {
          stats.categories[material.category] = 0;
        }
        stats.categories[material.category]++;
      });
      
      return stats;
      
    } catch (error) {
      console.error('Error getting dashboard stats:', error);
      throw error;
    }
  }
  
  // **REAL-TIME SUBSCRIPTIONS**
  static subscribeToMaterials(callback, filters = {}) {
    try {
      let q = collection(db, COLLECTIONS.MATERIALS);
      
      if (filters.category) {
        q = query(q, where('category', '==', filters.category));
      }
      
      if (filters.status) {
        q = query(q, where('status', '==', filters.status));
      }
      
      q = query(q, orderBy('updatedAt', 'desc'));
      
      return onSnapshot(q, (snapshot) => {
        const materials = [];
        snapshot.forEach((doc) => {
          materials.push({
            id: doc.id,
            ...doc.data()
          });
        });
        callback(materials);
      });
      
    } catch (error) {
      console.error('Error subscribing to materials:', error);
      throw error;
    }
  }
  
  static subscribeToStockAlerts(callback, filters = {}) {
    try {
      let q = collection(db, COLLECTIONS.STOCK_ALERTS);
      
      q = query(
        q,
        where('isActive', '==', true),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      
      return onSnapshot(q, (snapshot) => {
        const alerts = [];
        snapshot.forEach((doc) => {
          alerts.push({
            id: doc.id,
            ...doc.data()
          });
        });
        callback(alerts);
      });
      
    } catch (error) {
      console.error('Error subscribing to stock alerts:', error);
      throw error;
    }
  }
}

// ================================
// CATEGORY SERVICE
// ================================

export class CategoriesService {
  
  // **GET CATEGORIES**
  static async getCategories() {
    try {
      const q = query(
        collection(db, COLLECTIONS.CATEGORIES),
        where('isActive', '==', true),
        orderBy('sortOrder', 'asc')
      );
      
      const snapshot = await getDocs(q);
      const categories = [];
      
      snapshot.forEach((doc) => {
        categories.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return categories;
      
    } catch (error) {
      console.error('Error getting categories:', error);
      throw error;
    }
  }
  
  // **CREATE CATEGORY**
  static async createCategory(categoryData) {
    try {
      const newCategory = {
        ...categoryData,
        materialCount: 0,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      const docRef = await addDoc(collection(db, COLLECTIONS.CATEGORIES), newCategory);
      
      return {
        id: docRef.id,
        ...newCategory
      };
      
    } catch (error) {
      console.error('Error creating category:', error);
      throw error;
    }
  }
  
  // **UPDATE CATEGORY**
  static async updateCategory(categoryId, updateData) {
    try {
      const updates = {
        ...updateData,
        updatedAt: serverTimestamp()
      };
      
      const docRef = doc(db, COLLECTIONS.CATEGORIES, categoryId);
      await updateDoc(docRef, updates);
      
      return updates;
      
    } catch (error) {
      console.error('Error updating category:', error);
      throw error;
    }
  }
  
  // **DELETE CATEGORY** (Soft delete)
  static async deleteCategory(categoryId) {
    try {
      const docRef = doc(db, COLLECTIONS.CATEGORIES, categoryId);
      await updateDoc(docRef, {
        isActive: false,
        updatedAt: serverTimestamp()
      });
      
      return true;
      
    } catch (error) {
      console.error('Error deleting category:', error);
      throw error;
    }
  }
}

export default MaterialsService;