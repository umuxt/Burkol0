import { useState, useEffect } from 'react';
import { categoriesService } from '../services/categories-service.js';

export function useCategories(autoLoad = false) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [initialized, setInitialized] = useState(false);

  const loadCategories = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);
      
      // Backend API'den kategorileri yükle
      const categoriesList = await categoriesService.getCategories(forceRefresh);
      setCategories(categoriesList);
      setInitialized(true);
    } catch (err) {
      console.error('Kategoriler yüklenirken hata:', err);
      setError(err.message);
      
      // Hata durumunda varsayılan kategoriler
      setCategories([
        { id: 'insaat', name: 'İnşaat Malzemeleri' },
        { id: 'elektrik', name: 'Elektrik Malzemeleri' },
        { id: 'tesisat', name: 'Tesisat Malzemeleri' }
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoLoad && !initialized) {
      loadCategories();
    }
  }, [autoLoad, initialized]);

  const refreshCategories = async () => {
    await loadCategories(true);
  };

  return {
    categories,
    loading,
    error,
    initialized,
    loadCategories,
    refreshCategories
  };
}

export function useCategoryActions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const addCategory = async (categoryData) => {
    try {
      setLoading(true);
      setError(null);
      
      const newCategory = await categoriesService.addCategory(categoryData);
      return newCategory;
    } catch (err) {
      console.error('Kategori eklenirken hata:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateCategory = async (id, categoryData) => {
    try {
      setLoading(true);
      setError(null);
      
      const updatedCategory = await categoriesService.updateCategory(id, categoryData);
      return updatedCategory;
    } catch (err) {
      console.error('Kategori güncellenirken hata:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteCategory = async (id, updateRemoved = false) => {
    try {
      setLoading(true);
      setError(null);
      
      await categoriesService.deleteCategory(id, updateRemoved);
    } catch (err) {
      console.error('Kategori silinirken hata:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    addCategory,
    updateCategory,
    deleteCategory,
    loading,
    error
  };
}
