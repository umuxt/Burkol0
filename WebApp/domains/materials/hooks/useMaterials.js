import { useState, useEffect, useCallback } from 'react';
import { materialsService } from '../services/materials-service.js';

export function useMaterials(autoLoad = false) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [initialized, setInitialized] = useState(false);

  const loadMaterials = useCallback(async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🔍 useMaterials: Loading materials...', { forceRefresh });
      
      // Backend API'den tüm malzemeleri yükle (kaldırılanlar dahil)
      const materialsList = await materialsService.getAllMaterials(forceRefresh);
      
      setMaterials(materialsList);
      setInitialized(true);
      
      console.log('✅ useMaterials: Materials loaded:', { count: materialsList.length, forceRefresh });
      try {
        const evt = new CustomEvent('materialsUpdated', { detail: { count: materialsList.length } })
        window.dispatchEvent(evt)
      } catch {}
      
      // Response'u return et ki caller kullanabilsin
      return materialsList;
    } catch (err) {
      console.error('❌ Malzemeler yüklenirken hata:', err);
      setError(err.message);
      
      // Hata durumunda boş array döndür
      setMaterials([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoLoad && !initialized) {
      loadMaterials();
    }
  }, [autoLoad, initialized, loadMaterials]);

  // Global materials update event listener (simplified)
  useEffect(() => {
    const handleMaterialsUpdate = async (event) => {
      const { action, material } = event.detail || {};
      
      console.log('🔔 useMaterials: Global materials update event received:', {
        action,
        materialName: material?.name
      });
      
      if (action === 'add' && material) {
        // Add new material to local state
        setMaterials(prevMaterials => {
          // Check if material already exists
          const exists = prevMaterials.some(m => m.id === material.id);
          if (exists) {
            return prevMaterials;
          }
          return [material, ...prevMaterials];
        });
      } else if (action === 'update' && material) {
        // Update action - force refresh to get latest data
        console.log('🔄 useMaterials: Material updated, force refreshing...');
        try {
          await loadMaterials(true); // Force refresh to bypass cache
        } catch (error) {
          console.error('❌ useMaterials: Failed to refresh materials:', error);
        }
      }
      // Don't auto-refresh for other actions to avoid loops
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('materialsUpdated', handleMaterialsUpdate);
      return () => window.removeEventListener('materialsUpdated', handleMaterialsUpdate);
    }
  }, [loadMaterials]); // Add loadMaterials to dependencies

  // Global stock update event listener
  useEffect(() => {
    const handleStockUpdate = async (event) => {
      const { materialCode, newStock, quantity, operation, context } = event.detail;
      
      console.log('🔔 useMaterials: Global stock update event received:', {
        materialCode,
        newStock,
        quantity,
        operation,
        context
      });
      
      // İlk olarak local state'i güncelle (immediate feedback için)
      setMaterials(prevMaterials => {
        return prevMaterials.map(material => {
          if (material.code === materialCode) {
            console.log('🔄 useMaterials: Updating material stock locally:', {
              materialCode,
              oldStock: material.stock,
              newStock: newStock,
              materialName: material.name
            });
            
            return {
              ...material,
              stock: newStock
            };
          }
          return material;
        });
      });
      
      // Daha sonra backend'den fresh data çek (consistency için)
      try {
        console.log('🔄 useMaterials: Force refreshing materials from backend...');
        await loadMaterials(true); // Force refresh
      } catch (error) {
        console.error('❌ useMaterials: Failed to refresh materials:', error);
      }
    };

    // Event listener'ı ekle
    window.addEventListener('materialStockUpdated', handleStockUpdate);
    
    // Cleanup
    return () => {
      window.removeEventListener('materialStockUpdated', handleStockUpdate);
    };
  }, [loadMaterials]); // loadMaterials dependency'e eklendi

  const refreshMaterials = async (forceRefresh = false) => {
    await loadMaterials(forceRefresh);
  };

  return {
    materials,
    loading,
    error,
    initialized,
    loadMaterials,
    refreshMaterials
  };
}

export function useMaterialActions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const addMaterial = async (materialData) => {
    try {
      setLoading(true);
      setError(null);
      
      const newMaterial = await materialsService.addMaterial(materialData);
      
      // Trigger global event to notify all materials hooks
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('materialsUpdated', { 
          detail: { action: 'add', material: newMaterial } 
        }));
      }
      console.log('✅ Material added and global event dispatched:', newMaterial.name);
      
      return newMaterial;
    } catch (err) {
      console.error('Malzeme eklenirken hata:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateMaterial = async (id, materialData) => {
    try {
      setLoading(true);
      setError(null);
      
      const updatedMaterial = await materialsService.updateMaterial(id, materialData);
      return updatedMaterial;
    } catch (err) {
      console.error('Malzeme güncellenirken hata:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteMaterial = async (id) => {
    try {
      setLoading(true);
      setError(null);
      
      await materialsService.deleteMaterial(id);
    } catch (err) {
      console.error('Malzeme silinirken hata:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    addMaterial,
    updateMaterial,
    deleteMaterial,
    loading,
    error
  };
}
