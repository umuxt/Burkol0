import React, { useState, useRef } from 'react'
import MaterialsDashboard from './MaterialsDashboard.jsx'
import MaterialsFilters from './MaterialsFilters.jsx'
import MaterialsTable from './MaterialsTable.jsx'
import BulkProgressModal from './BulkProgressModal.jsx'

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

  // Helper function to get category name
  const getCategoryName = (categoryId) => {
    const category = categories.find(cat => cat.id === categoryId);
    return category ? category.name : categoryId || 'Kategori Yok';
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
    
    const selectedCount = selectedMaterials.size;
    const confirmMessage = `${selectedCount} malzemeyi silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`;
    
    if (!window.confirm(confirmMessage)) return;

    // Prepare material list with names for progress display
    const materialsList = Array.from(selectedMaterials).map(id => {
      const material = materials.find(m => m.id === id);
      return {
        id,
        name: material ? (material.name || material.code || id) : id
      };
    });

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
      cancelled: false,
      cancelling: false,
      errors: [],
      skipped: 0,
      title: 'Toplu Malzeme Silme',
      message: 'Malzemeler siliniyor...'
    });

    let processedCount = 0;
    let successCount = 0;
    const errors = [];

    // Process each material
    for (let i = 0; i < total; i++) {
      if (bulkCancelRef.current) {
        break;
      }

      const material = materialsList[i];
      setBulkProgress(prev => prev ? {
        ...prev,
        currentIndex: i,
        currentId: material.id,
        currentName: material.name,
        completed: processedCount
      } : prev);

      try {
        await handleDeleteMaterial(material.id, true); // skipConfirmation = true
        successCount += 1;
      } catch (error) {
        console.error('Bulk delete material error:', material.id, error);
        errors.push({ 
          id: material.id, 
          name: material.name,
          error: error?.message || 'Silme hatası' 
        });
      }

      processedCount += 1;
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
      errors
    } : prev);

    // Clear selection and refresh materials
    setSelectedMaterials(new Set());
    
    // Refresh materials after bulk operation
    try {
      // Since handleDeleteMaterial was called with skipConfirmation=true, 
      // we need to trigger a refresh here
      if (typeof refreshMaterials === 'function') {
        await refreshMaterials();
      }
    } catch (error) {
      console.error('Error refreshing materials after bulk delete:', error);
    }

    if (!cancelled) {
      const message = `${successCount} malzeme silindi`;
      const errorMessage = errors.length > 0 ? `, ${errors.length} hatada hata oluştu` : '';
      console.log(message + errorMessage);
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
      <div className="materials-header-section">
        <div className="materials-dashboard-container">
          <MaterialsDashboard materials={materials} />
        </div>
        <div className="materials-actions-container">
          <div className="materials-actions">
            <button 
              type="button" 
              className="add-material-btn"
              onClick={() => handleAddMaterial()}
            >
              + Yeni Malzeme
            </button>
            
            <button 
              type="button" 
              className="csv-export-btn"
              onClick={handleCSVExport}
              title={selectedMaterials.size > 0 ? `${selectedMaterials.size} seçili malzemeyi dışa aktar` : 'Tüm malzemeleri dışa aktar'}
            >
              📊 CSV {selectedMaterials.size > 0 ? `(${selectedMaterials.size})` : ''}
            </button>
            
            {selectedMaterials.size > 0 && (
              <button 
                type="button" 
                className="delete-selected-btn"
                onClick={handleBulkDelete}
                title={`${selectedMaterials.size} seçili malzemeyi sil`}
              >
                🗑️ Sil ({selectedMaterials.size})
              </button>
            )}
          </div>
        </div>
        <div className="materials-filters-container">
          <MaterialsFilters 
            categories={categories}
            types={materialTypes}
            onFilterChange={handleFilterChange}
          />
        </div>
      </div>
      
      {/* Malzeme tablosu */}
      <div className="materials-table-container">
        {materials.length === 0 ? (
          <div className="empty-state">
            <h3>Henüz malzeme bulunmuyor</h3>
            <p>İlk malzemenizi eklemek için "Yeni Malzeme" butonunu kullanın.</p>
            <button 
              className="add-material-btn primary"
              onClick={() => handleAddMaterial()}
            >
              + İlk Malzemeyi Ekle
            </button>
          </div>
        ) : (
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
          />
        )}
      </div>

      {/* Bulk Progress Modal */}
      {bulkProgress && (
        <BulkProgressModal
          progress={bulkProgress}
          onAction={handleBulkProgressAction}
        />
      )}
    </div>
  )
}