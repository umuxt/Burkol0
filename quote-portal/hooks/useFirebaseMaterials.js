// Firebase React Hooks for Materials Management
// Bu dosya React uygulamasında Firebase ile çalışmak için hook'lar sağlar

import { useState, useEffect, useCallback, useRef } from 'react';
import { MaterialsService, CategoriesService } from '../src/lib/materials-service.js';
import { useNotifications } from './useNotifications.js';

// ================================
// MATERIALS HOOKS
// ================================

// **USE MATERIALS HOOK**
export function useMaterials(filters = {}, options = {}) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    limit: options.limit || 20,
    hasMore: true
  });
  
  const { showNotification } = useNotifications();
  const unsubscribeRef = useRef(null);
  
  // **LOAD MATERIALS**
  const loadMaterials = useCallback(async (append = false) => {
    try {
      if (!append) setLoading(true);
      setError(null);
      
      const paginationOptions = {
        limit: pagination.limit,
        orderBy: options.orderBy || 'updatedAt',
        order: options.order || 'desc'
      };
      
      // Add pagination for append mode
      if (append && materials.length > 0) {
        const lastMaterial = materials[materials.length - 1];
        paginationOptions.startAfter = lastMaterial[options.orderBy || 'updatedAt'];
      }
      
      const result = await MaterialsService.getMaterials(filters, paginationOptions);
      
      if (append) {
        setMaterials(prev => [...prev, ...result]);
        setPagination(prev => ({
          ...prev,
          currentPage: prev.currentPage + 1,
          hasMore: result.length === pagination.limit
        }));
      } else {
        setMaterials(result);
        setPagination(prev => ({
          ...prev,
          currentPage: 1,
          hasMore: result.length === pagination.limit
        }));
      }
      
    } catch (err) {
      setError(err.message);
      showNotification('Malzemeler yüklenirken hata oluştu', 'error');
    } finally {
      setLoading(false);
    }
  }, [filters, options, pagination.limit, materials.length, showNotification]);
  
  // **LOAD MORE (PAGINATION)**
  const loadMore = useCallback(() => {
    if (!loading && pagination.hasMore) {
      loadMaterials(true);
    }
  }, [loading, pagination.hasMore, loadMaterials]);
  
  // **REFRESH**
  const refresh = useCallback(() => {
    loadMaterials(false);
  }, [loadMaterials]);
  
  // **REAL-TIME SUBSCRIPTION**
  const startRealTimeSync = useCallback(() => {
    if (options.realTime && typeof MaterialsService.subscribeToMaterials === 'function') {
      try {
        unsubscribeRef.current = MaterialsService.subscribeToMaterials(
          (updatedMaterials) => {
            setMaterials(updatedMaterials);
            setLoading(false);
          },
          filters
        );
      } catch (err) {
        console.error('Real-time subscription failed:', err);
        // Fallback to regular loading
        loadMaterials();
      }
    } else {
      loadMaterials();
    }
  }, [options.realTime, filters, loadMaterials]);
  
  // **STOP REAL-TIME SUBSCRIPTION**
  const stopRealTimeSync = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
  }, []);
  
  // **INITIAL LOAD**
  useEffect(() => {
    startRealTimeSync();
    
    return () => {
      stopRealTimeSync();
    };
  }, [startRealTimeSync, stopRealTimeSync]);
  
  // **CLEANUP ON UNMOUNT**
  useEffect(() => {
    return () => {
      stopRealTimeSync();
    };
  }, [stopRealTimeSync]);
  
  return {
    materials,
    loading,
    error,
    pagination,
    loadMore,
    refresh,
    startRealTimeSync,
    stopRealTimeSync
  };
}

// **USE SINGLE MATERIAL HOOK**
export function useMaterial(materialId) {
  const [material, setMaterial] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const { showNotification } = useNotifications();
  
  const loadMaterial = useCallback(async () => {
    if (!materialId) {
      setMaterial(null);
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      const result = await MaterialsService.getMaterial(materialId);
      setMaterial(result);
      
    } catch (err) {
      setError(err.message);
      showNotification('Malzeme bilgileri yüklenirken hata oluştu', 'error');
    } finally {
      setLoading(false);
    }
  }, [materialId, showNotification]);
  
  useEffect(() => {
    loadMaterial();
  }, [loadMaterial]);
  
  return {
    material,
    loading,
    error,
    reload: loadMaterial
  };
}

// **USE MATERIAL ACTIONS HOOK**
export function useMaterialActions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const { showNotification } = useNotifications();
  
  // **CREATE MATERIAL**
  const createMaterial = useCallback(async (materialData, userId = 'current-user') => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await MaterialsService.createMaterial(materialData, userId);
      
      showNotification('Malzeme başarıyla oluşturuldu', 'success');
      return result;
      
    } catch (err) {
      setError(err.message);
      showNotification(`Malzeme oluşturulamadı: ${err.message}`, 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [showNotification]);
  
  // **UPDATE MATERIAL**
  const updateMaterial = useCallback(async (materialId, updateData, userId = 'current-user') => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await MaterialsService.updateMaterial(materialId, updateData, userId);
      
      showNotification('Malzeme başarıyla güncellendi', 'success');
      return result;
      
    } catch (err) {
      setError(err.message);
      showNotification(`Malzeme güncellenemedi: ${err.message}`, 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [showNotification]);
  
  // **DELETE MATERIAL**
  const deleteMaterial = useCallback(async (materialId, userId = 'current-user') => {
    try {
      setLoading(true);
      setError(null);
      
      await MaterialsService.deleteMaterial(materialId, userId);
      
      showNotification('Malzeme başarıyla silindi', 'success');
      return true;
      
    } catch (err) {
      setError(err.message);
      showNotification(`Malzeme silinemedi: ${err.message}`, 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [showNotification]);
  
  // **UPDATE STOCK**
  const updateStock = useCallback(async (materialId, quantity, movementType, details = {}) => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await MaterialsService.updateStock(materialId, quantity, movementType, {
        ...details,
        userId: details.userId || 'current-user'
      });
      
      const action = quantity > 0 ? 'Stok girişi' : 'Stok çıkışı';
      showNotification(`${action} başarıyla kaydedildi`, 'success');
      return result;
      
    } catch (err) {
      setError(err.message);
      showNotification(`Stok güncellenemedi: ${err.message}`, 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [showNotification]);
  
  return {
    loading,
    error,
    createMaterial,
    updateMaterial,
    deleteMaterial,
    updateStock
  };
}

// ================================
// CATEGORIES HOOKS
// ================================

// **USE CATEGORIES HOOK**
export function useCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const { showNotification } = useNotifications();
  
  const loadCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await CategoriesService.getCategories();
      setCategories(result);
      
    } catch (err) {
      setError(err.message);
      showNotification('Kategoriler yüklenirken hata oluştu', 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);
  
  useEffect(() => {
    loadCategories();
  }, [loadCategories]);
  
  return {
    categories,
    loading,
    error,
    reload: loadCategories
  };
}

// **USE CATEGORY ACTIONS HOOK**
export function useCategoryActions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const { showNotification } = useNotifications();
  
  const createCategory = useCallback(async (categoryData) => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await CategoriesService.createCategory(categoryData);
      
      showNotification('Kategori başarıyla oluşturuldu', 'success');
      return result;
      
    } catch (err) {
      setError(err.message);
      showNotification(`Kategori oluşturulamadı: ${err.message}`, 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [showNotification]);
  
  const updateCategory = useCallback(async (categoryId, updateData) => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await CategoriesService.updateCategory(categoryId, updateData);
      
      showNotification('Kategori başarıyla güncellendi', 'success');
      return result;
      
    } catch (err) {
      setError(err.message);
      showNotification(`Kategori güncellenemedi: ${err.message}`, 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [showNotification]);
  
  const deleteCategory = useCallback(async (categoryId) => {
    try {
      setLoading(true);
      setError(null);
      
      await CategoriesService.deleteCategory(categoryId);
      
      showNotification('Kategori başarıyla silindi', 'success');
      return true;
      
    } catch (err) {
      setError(err.message);
      showNotification(`Kategori silinemedi: ${err.message}`, 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [showNotification]);
  
  return {
    loading,
    error,
    createCategory,
    updateCategory,
    deleteCategory
  };
}

// ================================
// SEARCH HOOKS
// ================================

// **USE MATERIAL SEARCH HOOK**
export function useMaterialSearch() {
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const { showNotification } = useNotifications();
  
  const search = useCallback(async (term, filters = {}) => {
    if (!term || term.length < 2) {
      setSearchResults([]);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      setSearchTerm(term);
      
      const result = await MaterialsService.searchMaterials(term, filters);
      setSearchResults(result);
      
    } catch (err) {
      setError(err.message);
      showNotification('Arama sırasında hata oluştu', 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);
  
  const clearSearch = useCallback(() => {
    setSearchResults([]);
    setSearchTerm('');
    setError(null);
  }, []);
  
  return {
    searchResults,
    loading,
    error,
    searchTerm,
    search,
    clearSearch
  };
}

// ================================
// DASHBOARD HOOKS
// ================================

// **USE DASHBOARD STATS HOOK**
export function useDashboardStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const { showNotification } = useNotifications();
  
  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await MaterialsService.getDashboardStats();
      setStats(result);
      
    } catch (err) {
      setError(err.message);
      showNotification('Dashboard istatistikleri yüklenirken hata oluştu', 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);
  
  useEffect(() => {
    loadStats();
  }, [loadStats]);
  
  // **AUTO REFRESH EVERY 5 MINUTES**
  useEffect(() => {
    const interval = setInterval(loadStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadStats]);
  
  return {
    stats,
    loading,
    error,
    reload: loadStats
  };
}

// ================================
// UTILITY HOOKS
// ================================

// **USE DEBOUNCED SEARCH**
export function useDebouncedSearch(delay = 300) {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTerm(searchTerm);
    }, delay);
    
    return () => clearTimeout(timer);
  }, [searchTerm, delay]);
  
  return {
    searchTerm,
    debouncedTerm,
    setSearchTerm
  };
}

// **USE LOCAL STORAGE STATE**
export function useLocalStorageState(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return defaultValue;
    }
  });
  
  const setStoredValue = useCallback((newValue) => {
    try {
      setValue(newValue);
      window.localStorage.setItem(key, JSON.stringify(newValue));
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  }, [key]);
  
  return [value, setStoredValue];
}

export default {
  useMaterials,
  useMaterial,
  useMaterialActions,
  useCategories,
  useCategoryActions,
  useMaterialSearch,
  useDashboardStats,
  useDebouncedSearch,
  useLocalStorageState
};