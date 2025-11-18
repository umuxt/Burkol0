import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Plus, Download, Trash2 } from '../../../shared/components/Icons.jsx'
import MaterialsDashboard from './MaterialsDashboard.jsx'
import MaterialsFilters from './MaterialsFilters.jsx'
import MaterialsTable from './MaterialsTable.jsx'
import BulkProgressModal from './BulkProgressModal.jsx'
import AddOrderModal from '../../orders/components/AddOrderModal.jsx'
import { materialsService } from '../services/materials-service.js'

export default function StocksTabContent({ 
  materials, 
  categories, 
  materialTypes, 
  handleFilterChange, 
  handleAddMaterial, 
  handleMaterialSelect,
  handleEditMaterial,
  handleDeleteMaterial,
  handleCategoryManage,
  refreshMaterials,
  loading = false,
  error = null
}) {
  const [selectedMaterials, setSelectedMaterials] = useState(new Set());
  const [bulkProgress, setBulkProgress] = useState(null);
  const bulkCancelRef = useRef(false);
  
  // Order modal state
  const [isAddOrderModalOpen, setIsAddOrderModalOpen] = useState(false);
  const [orderModalMaterial, setOrderModalMaterial] = useState(null);

  // Handle order button click
  const handleOrderClick = (material) => {
    console.log('🛒 Order button clicked for material:', material.name);
    setOrderModalMaterial(material);
    setIsAddOrderModalOpen(true);
  };

  // Global function to handle bulk delete from modal
  React.useEffect(() => {
    window.handleBulkDeleteFromModal = (materialsToDelete) => {
      performBulkDeleteOperation(materialsToDelete);
    };
    
    return () => {
      delete window.handleBulkDeleteFromModal;
    };
  }, [materials]);

  // Helper function to get category name
  const getCategoryName = (categoryId) => {
    // Kategori boşsa veya null ise
    if (!categoryId) return 'Kategori Yok';
    
    // Kategoriler listesinde ara
    const category = categories.find(cat => cat.id === categoryId);
    if (category) return category.name;
    
    // Kategori bulunamazsa - büyük ihtimalle silinmiş
    console.warn('🗑️ Kategori bulunamadı, büyük ihtimalle silinmiş:', categoryId);
    return 'Kategori artık mevcut değil';
  };

  // Helper function to get type label
  const getTypeLabel = (typeId) => {
    const type = materialTypes.find(t => t.id === typeId);
    return type ? type.label : typeId || 'Tip Yok';
  };

  // CSV Export fonksiyonu
  const handleCSVExport = () => {
    const materialsToExport = selectedMaterials.size > 0 
      ? materials.filter(m => selectedMaterials.has(m.id))
      : materials;
    
    if (materialsToExport.length === 0) {
      alert('Dışa aktarılacak malzeme bulunamadı.');
      return;
    }

    // Genişletilmiş CSV headers - tüm önemli malzeme bilgileri
    const headers = [
      'Kod', 
      'Malzeme Adı', 
      'Açıklama',
      'Kategori', 
      'Tür', 
      'Birim',
      'Stok Miktarı', 
      'Minimum Stok',
      'Rezerve Edilen',
      'Kullanılabilir',
      'Maliyet Fiyatı',
      'Satış Fiyatı', 
      'KDV Oranı',
      'Para Birimi',
      'Tedarikçiler',
      'Durum',
      'Oluşturma Tarihi',
      'Son Güncelleme'
    ];
    
    // CSV rows - tüm malzeme bilgileri ile
    const rows = materialsToExport.map(material => [
      material.code || '',
      material.name || '',
      material.description || '',
      getCategoryName(material.category),
      getTypeLabel(material.type),
      material.unit || '',
      material.stock || 0,
      material.reorderPoint || 0,
      material.reserved || 0,
      material.available || material.stock || 0,
      material.costPrice || 0,
      material.unitPrice || material.sellPrice || 0,
      material.taxRate || 0,
      material.currency || 'TL',
      material.suppliers ? material.suppliers.join(', ') : '',
      material.status || 'Aktif',
      material.createdAt ? new Date(material.createdAt.seconds * 1000).toLocaleDateString('tr-TR') : '',
      material.updatedAt ? new Date(material.updatedAt.seconds * 1000).toLocaleDateString('tr-TR') : ''
    ]);

    // UTF-8 BOM + CSV content oluştur (Türkçe karakter desteği için)
    const BOM = '\uFEFF';
    const csvContent = BOM + [headers, ...rows]
      .map(row => row.map(field => {
        // Tırnak içindeki tırnakları escape et
        const escapedField = String(field || '').replace(/"/g, '""');
        return `"${escapedField}"`;
      }).join(','))
      .join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `malzemeler_detay_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Bulk Progress Modal Actions
  const handleBulkProgressAction = (action) => {
    if (action === 'cancel') {
      setBulkProgress(prev => {
        if (!prev || prev.finished || prev.cancelling) return prev;
        bulkCancelRef.current = true;
        return { ...prev, cancelling: true };
      });
    } else if (action === 'close') {
      bulkCancelRef.current = false;
      setBulkProgress(null);
    }
  };

  // Bulk Delete fonksiyonu
  const handleBulkDelete = async () => {
    if (selectedMaterials.size === 0) return;
    
    // Prevent overlapping bulk operations
    if (bulkProgress && !bulkProgress.finished && !bulkProgress.cancelled) {
      return;
    }
    
    // Get selected materials for warning modal
    const selectedMaterialsList = Array.from(selectedMaterials).map(id => {
      return materials.find(m => m.id === id);
    }).filter(Boolean);
    
    // Trigger deletion warning modal for bulk delete
    if (typeof handleDeleteMaterial === 'function') {
      handleDeleteMaterial(selectedMaterialsList, false, true); // bulk delete flag
      return;
    }
  };

  // Perform actual bulk delete operation with progress tracking
  const performBulkDeleteOperation = async (materialsToDelete) => {
    if (!Array.isArray(materialsToDelete) || materialsToDelete.length === 0) return;

    const materialsList = materialsToDelete.map(material => ({
      id: material.id,
      name: material.name || material.code || material.id
    }));

    const total = materialsList.length;
    bulkCancelRef.current = false;

    // Initialize progress state
    setBulkProgress({
      active: true,
      total,
      completed: 0,
      currentIndex: 0,
      currentId: null,
      currentName: '',
      finished: false,
      cancelling: false,
      cancelled: false,
      errors: [],
      skipped: 0,
      title: 'Malzemeler Kaldırılıyor'
    });

    const errors = [];
    let successCount = 0;
    let skippedCount = 0;
    let processedCount = 0;

    // Process each material
    for (let i = 0; i < materialsList.length; i++) {
      if (bulkCancelRef.current) {
        console.log('🚫 Bulk delete cancelled by user');
        break;
      }

      const materialItem = materialsList[i];
      
      // Update progress state
      setBulkProgress(prev => prev ? {
        ...prev,
        currentIndex: i,
        currentId: materialItem.id,
        currentName: materialItem.name
      } : prev);

      try {
        console.log(`🗑️ Deleting material ${i + 1}/${total}: ${materialItem.name}`);
        
        // Call materials service directly to get detailed response
        const result = await materialsService.deleteMaterial(materialItem.id);
        
        if (result.alreadyRemoved) {
          console.log(`⚠️ Material already removed, skipped: ${materialItem.name}`);
          skippedCount++;
        } else {
          successCount++;
          console.log(`✅ Successfully deleted: ${materialItem.name}`);
        }
        
      } catch (error) {
        console.error(`❌ Failed to delete material ${materialItem.name}:`, error);
        errors.push({
          id: materialItem.id,
          name: materialItem.name,
          error: error.message || 'Silme işlemi başarısız'
        });
      }

      processedCount++;
      
      // Update progress
      setBulkProgress(prev => prev ? { ...prev, completed: processedCount } : prev);
    }

    const cancelled = bulkCancelRef.current;
    bulkCancelRef.current = false;

    // Finalize progress state
    setBulkProgress(prev => prev ? {
      ...prev,
      completed: processedCount,
      currentId: null,
      currentName: '',
      finished: true,
      active: false,
      cancelling: false,
      cancelled,
      errors,
      skipped: skippedCount
    } : prev);

    // Clear selection and refresh materials
    setSelectedMaterials(new Set());

    // Refresh materials after bulk operation
    try {
      if (typeof refreshMaterials === 'function') {
        await refreshMaterials();
      }
    } catch (error) {
      console.error('Error refreshing materials after bulk delete:', error);
    }

    if (!cancelled) {
      const message = `${successCount} malzeme kaldırıldı`;
      const skippedMessage = skippedCount > 0 ? `, ${skippedCount} zaten kaldırılmış (atlandı)` : '';
      const errorMessage = errors.length > 0 ? `, ${errors.length} hatada hata oluştu` : '';
      console.log(message + skippedMessage + errorMessage);
    }
  };
  
  // Loading state
  if (loading) {
    return (
      <div className="stocks-tab-content">
        <div className="loading-container">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>Malzemeler yükleniyor...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state  
  if (error) {
    return (
      <div className="stocks-tab-content">
        <div className="error-container">
          <h3>Veri Yükleme Hatası</h3>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>
            Sayfayı Yenile
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stocks-tab-content">
      {/* MES Style Filter Bar */}
      <div className="mes-filter-bar" style={{marginBottom: '24px'}}>
        {/* Indicators */}
        <div className="materials-dashboard-container">
          <MaterialsDashboard materials={materials} />
        </div>

        {/* Action Buttons - Outside filter-controls */}
        <button 
          type="button" 
          className="mes-primary-action is-compact"
          onClick={() => handleAddMaterial()}
          disabled={loading}
        >
          <Plus size={14} />
          <span>Yeni Malzeme</span>
        </button>
        
        <button 
          type="button" 
          className="mes-filter-button is-compact"
          onClick={handleCSVExport}
          title={selectedMaterials.size > 0 ? `${selectedMaterials.size} seçili malzemeyi dışa aktar` : 'Tüm malzemeleri dışa aktar'}
          disabled={loading}
        >
          <Download size={14} />
          <span>CSV {selectedMaterials.size > 0 ? `(${selectedMaterials.size})` : ''}</span>
        </button>
        
        {selectedMaterials.size > 0 && (
          <button 
            type="button" 
            className="mes-filter-clear is-compact"
            onClick={handleBulkDelete}
            title={`${selectedMaterials.size} seçili malzemeyi sil`}
            disabled={loading}
          >
            <Trash2 size={14} />
            <span>Sil ({selectedMaterials.size})</span>
          </button>
        )}

        {/* Filters - Inside filter-controls */}
        <MaterialsFilters 
          categories={categories}
          types={materialTypes}
          onFilterChange={handleFilterChange}
          materials={materials}
        />
      </div>
      
      {/* Malzeme tablosu */}
      <div className="materials-table-container">
        <MaterialsTable 
          materials={materials} 
          types={materialTypes} 
          categories={categories}
          onMaterialSelect={handleMaterialSelect}
          onEditMaterial={handleEditMaterial}
          onDeleteMaterial={handleDeleteMaterial}
          onCategoryManage={handleCategoryManage}
          selectedMaterials={selectedMaterials}
          onSelectedMaterialsChange={setSelectedMaterials}
          onOrderClick={handleOrderClick}
          loading={loading}
          error={error}
          onAddMaterial={handleAddMaterial}
        />
      </div>

      {/* Bulk Progress Modal */}
      {bulkProgress && (
        <BulkProgressModal
          progress={bulkProgress}
          onAction={handleBulkProgressAction}
        />
      )}
      
      {/* Add Order Modal */}
      <AddOrderModal 
        isOpen={isAddOrderModalOpen}
        onClose={() => {
          setIsAddOrderModalOpen(false);
          setOrderModalMaterial(null);
        }}
        initialMaterialId={orderModalMaterial?.id || null}
        onSave={async (newOrder) => {
          console.log('✅ New order created from materials table:', newOrder);
          // Materials'ı refresh et
          if (refreshMaterials) {
            refreshMaterials();
          }
        }}
      />
    </div>
  )
}