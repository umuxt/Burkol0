import { useState, useEffect, useCallback } from 'react';
import { materialsService } from '../services/materials-service.js';

export function useMaterials(autoLoad = false) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [initialized, setInitialized] = useState(false);

  const loadMaterials = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Backend API'den tüm malzemeleri yükle (kaldırılanlar dahil)
      const materialsList = await materialsService.getAllMaterials();
      
      setMaterials(materialsList);
      setInitialized(true);
      
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

  // Global stock update event listener
  useEffect(() => {
    const handleStockUpdate = (event) => {
      const { materialCode, newStock, quantity, operation, context } = event.detail;
      
      console.log('🔔 useMaterials: Global stock update event received:', {
        materialCode,
        newStock,
        quantity,
        operation,
        context
      });
      
      // Materials listesinde ilgili material'ı bul ve stock'ını güncelle
      setMaterials(prevMaterials => {
        return prevMaterials.map(material => {
          if (material.code === materialCode) {
            console.log('🔄 useMaterials: Updating material stock:', {
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
    };

    // Event listener'ı ekle
    window.addEventListener('materialStockUpdated', handleStockUpdate);
    
    // Cleanup
    return () => {
      window.removeEventListener('materialStockUpdated', handleStockUpdate);
    };
  }, []); // Dependency array boş - bir kere eklenip kalıcı olsun

  const refreshMaterials = async () => {
    await loadMaterials();
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
