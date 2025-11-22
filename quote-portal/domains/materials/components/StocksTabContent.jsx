import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Plus, Download, Trash2, ArrowLeft, Edit, Info, Phone, Mail, RotateCw, Package } from '../../../shared/components/Icons.jsx'
import MaterialsDashboard from './MaterialsDashboard.jsx'
import MaterialsFilters from './MaterialsFilters.jsx'
import MaterialsTable from './MaterialsTable.jsx'
import BulkProgressModal from './BulkProgressModal.jsx'
import AddOrderModal from '../../orders/components/AddOrderModal.jsx'
import AddMaterialModal from './AddMaterialModal.jsx'
import { materialsService } from '../services/materials-service.js'
import useMaterialProcurementHistory from '../hooks/useMaterialProcurementHistory.js'
import useMaterialProductionHistory from '../hooks/useMaterialProductionHistory.js'
import useMaterialLots from '../hooks/useMaterialLots.js'
import { useSuppliers } from '../hooks/useSuppliers.js'
import { useMaterialActions } from '../hooks/useMaterials.js'

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
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [isEditingMaterial, setIsEditingMaterial] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    type: '',
    category: '',
    unit: '',
    stock: '',
    reorder_point: '',
    status: 'Aktif',
    description: ''
  });
  const [bulkProgress, setBulkProgress] = useState(null);
  const bulkCancelRef = useRef(false);
  
  // Material actions
  const { updateMaterial } = useMaterialActions();
  
  // Update formData when selectedMaterial changes and editing starts
  useEffect(() => {
    if (selectedMaterial && isEditingMaterial) {
      const safeString = (value) => value || '';
      const safeNumber = (value) => {
        if (value === null || value === undefined || value === '' || Number.isNaN(value)) {
          return '';
        }
        const numValue = Number(value);
        return Number.isNaN(numValue) ? '' : numValue.toString();
      };
      
      setFormData({
        code: safeString(selectedMaterial.code),
        name: safeString(selectedMaterial.name),
        type: safeString(selectedMaterial.type),
        category: safeString(selectedMaterial.category),
        unit: safeString(selectedMaterial.unit),
        stock: safeNumber(selectedMaterial.stock),
        reorder_point: safeNumber(selectedMaterial.reorder_point),
        status: selectedMaterial.status || 'Aktif',
        description: safeString(selectedMaterial.description)
      });
    }
  }, [selectedMaterial, isEditingMaterial]);
  
  // Form submit handler
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    try {
      console.log('💾 Updating material:', formData);
      await updateMaterial(selectedMaterial.id, formData);
      setIsEditingMaterial(false);
      refreshMaterials && await refreshMaterials();
    } catch (error) {
      console.error('Material update error:', error);
      alert(`Malzeme güncellenirken hata: ${error.message}`);
    }
  };
  
  const handleFormChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };
  
  // Handle input change for form fields
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    handleFormChange(name, value);
  };
  
  // Order modal state
  const [isAddOrderModalOpen, setIsAddOrderModalOpen] = useState(false);
  const [orderModalMaterial, setOrderModalMaterial] = useState(null);

  // Material detail panel hooks - lazy loading
  const { items: procurementItems, loading: procurementLoading, error: procurementError, loadHistory: loadProcurementHistory } = useMaterialProcurementHistory(selectedMaterial);
  const { items: productionItems, loading: productionLoading, error: productionError, loadHistory: loadProductionHistory } = useMaterialProductionHistory(selectedMaterial);
  const { lots, loading: lotsLoading, error: lotsError, loadLots, hasLoaded: lotsHasLoaded } = useMaterialLots(selectedMaterial);
  const { suppliers: allSuppliers, loading: suppliersLoading } = useSuppliers(true);
  
  // Filter suppliers for selected material
  const materialSuppliers = useMemo(() => {
    if (!selectedMaterial || !allSuppliers) return [];
    return allSuppliers.filter(supplier => {
      const materials = supplier.suppliedMaterials || supplier.materials || [];
      return materials.some(m => m.id === selectedMaterial.id || m.code === selectedMaterial.code);
    });
  }, [selectedMaterial, allSuppliers]);

  // Handle order button click
  const handleOrderClick = (material) => {
    console.log('🛒 Order button clicked for material:', material.name);
    setOrderModalMaterial(material);
    setIsAddOrderModalOpen(true);
  };

  // Handle material row click - open detail panel
  const handleMaterialRowClick = (material) => {
    console.log('👁️ Material selected for detail view:', material.name);
    setSelectedMaterial(material);
    // Also call the original handler if exists
    if (handleMaterialSelect) {
      handleMaterialSelect(material);
    }
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
      material.reorder_point || 0,
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
      <div className="mes-filter-bar" style={{marginBottom: '24px', position: 'relative'}}>
        {/* Indicators */}
        <div className="materials-dashboard-container">
          <MaterialsDashboard materials={materials} />
        </div>

        {/* Action Buttons - Outside filter-controls */}
        <button 
          type="button" 
          className="mes-primary-action is-compact"
          onClick={() => setShowAddForm(!showAddForm)}
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


      
      {/* Materials container - table on left, detail panel on right */}
      <div className="materials-container">
        {/* Malzeme tablosu */}
        <div className="materials-table-container">
          <MaterialsTable 
            materials={materials} 
            types={materialTypes} 
            categories={categories}
            onMaterialSelect={handleMaterialRowClick}
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

        {/* Sağ Panel - Material Detayları */}
        {selectedMaterial && (
          <div className="material-detail-panel">
          <div style={{ 
            background: 'white', 
            borderRadius: '6px', 
            border: '1px solid #e5e7eb',
            height: '100%',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Header */}
            <div style={{ 
              padding: '16px 20px', 
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  onClick={() => setSelectedMaterial(null)}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    background: 'white',
                    color: '#374151',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                  title="Detayları Kapat"
                >
                  <ArrowLeft size={14} />
                </button>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                  Malzeme Detayları
                </h3>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {!isEditingMaterial ? (
                  <button
                    onClick={() => setIsEditingMaterial(true)}
                    style={{
                      padding: '6px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      background: 'white',
                      color: '#374151',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    <Edit size={14} style={{ marginRight: '4px' }} /> Düzenle
                  </button>
                ) : (
                  <>
                    <button
                      type="submit"
                      form="material-detail-form"
                      style={{
                        padding: '6px 12px',
                        border: 'none',
                        borderRadius: '4px',
                        background: '#3b82f6',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Download size={14} /> Kaydet
                    </button>
                    <button
                      onClick={() => setIsEditingMaterial(false)}
                      style={{
                        padding: '6px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        background: 'white',
                        color: '#374151',
                        cursor: 'pointer',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <ArrowLeft size={14} /> İptal
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    if (handleDeleteMaterial && confirm(`${selectedMaterial.name} malzemesini silmek istediğinizden emin misiniz?`)) {
                      handleDeleteMaterial(selectedMaterial.id);
                      setSelectedMaterial(null);
                    }
                  }}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #dc2626',
                    borderRadius: '4px',
                    background: 'white',
                    color: '#dc2626',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Trash2 size={14} /> Sil
                </button>
              </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
              <form id="material-detail-form" onSubmit={handleFormSubmit}>
              {/* Temel Bilgiler */}
              <div style={{ 
                marginBottom: '16px', 
                padding: '12px', 
                background: 'white', 
                borderRadius: '6px',
                border: '1px solid #e5e7eb'
              }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                  Temel Bilgiler
                </h3>
                
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                    Malzeme Kodu:
                  </span>
                  <span style={{ fontSize: '12px', color: '#111827' }}>
                    {selectedMaterial.code || '-'}
                  </span>
                </div>

                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                    Malzeme Adı:
                  </span>
                  {isEditingMaterial ? (
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #3b82f6',
                        borderRadius: '4px',
                        background: 'white',
                        width: '100%',
                        fontSize: '14px'
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: '12px', color: '#111827' }}>
                      {selectedMaterial.name || '-'}
                    </span>
                  )}
                </div>

                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                    Tip:
                  </span>
                  {isEditingMaterial ? (
                    <select
                      name="type"
                      value={formData.type}
                      onChange={handleInputChange}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #3b82f6',
                        borderRadius: '4px',
                        background: 'white',
                        width: '100%',
                        fontSize: '14px'
                      }}
                    >
                      {materialTypes.map(type => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span style={{ fontSize: '12px', color: '#111827' }}>
                      {getTypeLabel(selectedMaterial.type)}
                    </span>
                  )}
                </div>

                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                    Kategori:
                  </span>
                  {isEditingMaterial ? (
                    <select
                      name="category"
                      value={formData.category}
                      onChange={handleInputChange}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #3b82f6',
                        borderRadius: '4px',
                        background: 'white',
                        width: '100%',
                        fontSize: '14px'
                      }}
                    >
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  ) : (
                    <span style={{ fontSize: '12px', color: '#111827' }}>
                      {getCategoryName(selectedMaterial.category)}
                    </span>
                  )}
                </div>

                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '0' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                    Birim:
                  </span>
                  {isEditingMaterial ? (
                    <input
                      type="text"
                      name="unit"
                      value={formData.unit}
                      onChange={handleInputChange}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #3b82f6',
                        borderRadius: '4px',
                        background: 'white',
                        width: '100%',
                        fontSize: '14px'
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: '12px', color: '#111827' }}>
                      {selectedMaterial.unit || '-'}
                    </span>
                  )}
                </div>
              </div>

              {/* Stok Bilgileri */}
              <div style={{ 
                marginBottom: '16px', 
                padding: '12px', 
                background: 'white', 
                borderRadius: '6px',
                border: '1px solid #e5e7eb'
              }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                  Stok Bilgileri
                </h3>
                
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                    Mevcut Stok:
                  </span>
                  {isEditingMaterial ? (
                    <input
                      type="number"
                      name="stock"
                      value={formData.stock}
                      onChange={handleInputChange}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #3b82f6',
                        borderRadius: '4px',
                        background: 'white',
                        width: '100%',
                        fontSize: '14px'
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: '12px', color: '#111827', fontWeight: '600' }}>
                      {selectedMaterial.stock || 0} {selectedMaterial.unit}
                    </span>
                  )}
                </div>

                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                    Minimum Stok:
                  </span>
                  {isEditingMaterial ? (
                    <input
                      type="number"
                      name="reorder_point"
                      value={formData.reorder_point}
                      onChange={handleInputChange}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #3b82f6',
                        borderRadius: '4px',
                        background: 'white',
                        width: '100%',
                        fontSize: '14px'
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: '12px', color: '#111827' }}>
                      {selectedMaterial.reorder_point || 0} {selectedMaterial.unit}
                    </span>
                  )}
                </div>

                <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '0' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                    Durum:
                  </span>
                  {isEditingMaterial ? (
                    <select
                      name="status"
                      value={formData.status}
                      onChange={handleInputChange}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #3b82f6',
                        borderRadius: '4px',
                        background: 'white',
                        width: '100%',
                        fontSize: '14px'
                      }}
                    >
                      <option value="Aktif">Aktif</option>
                      <option value="Pasif">Pasif</option>
                      <option value="Kaldırıldı">Kaldırıldı</option>
                    </select>
                  ) : (
                    <span style={{ fontSize: '12px', color: '#111827' }}>
                      {selectedMaterial.status || 'Aktif'}
                    </span>
                  )}
                </div>
              </div>

              {/* Açıklama */}
              <div style={{ 
                marginBottom: '16px', 
                padding: '12px', 
                background: 'white', 
                borderRadius: '6px',
                border: '1px solid #e5e7eb'
              }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                  Açıklama
                </h3>
                {isEditingMaterial ? (
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows="3"
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #3b82f6',
                      borderRadius: '4px',
                      background: 'white',
                      width: '100%',
                      fontSize: '14px',
                      resize: 'vertical'
                    }}
                  />
                ) : (
                  <p style={{ margin: 0, fontSize: '12px', color: '#111827', lineHeight: '1.5' }}>
                    {selectedMaterial.description || '-'}
                  </p>
                )}
              </div>

              {/* Tedarikçiler */}
              <div style={{ 
                marginBottom: '16px', 
                padding: '12px', 
                background: 'white', 
                borderRadius: '6px',
                border: '1px solid #e5e7eb'
              }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                  Tedarikçiler
                </h3>
                
                {suppliersLoading ? (
                  <div style={{ textAlign: 'center', padding: '12px', fontSize: '11px', color: '#6b7280' }}>
                    🔄 Tedarikçiler yükleniyor...
                  </div>
                ) : materialSuppliers.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {materialSuppliers.map((supplier, index) => (
                      <div 
                        key={`material-${selectedMaterial?.id}-supplier-${supplier.id || index}`}
                        style={{
                          padding: '6px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          backgroundColor: '#ffffff',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          {/* Sol Taraf - Tedarikçi Adı */}
                          <div style={{ 
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            flex: 1,
                            minWidth: 0
                          }}>
                            <div style={{ 
                              fontWeight: '600', 
                              fontSize: '11px',
                              color: '#111827',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              flex: 1
                            }}>
                              {supplier.name || supplier.companyName}
                            </div>
                          </div>
                          
                          {/* Sağ Taraf - Butonlar */}
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center',
                            gap: '4px',
                            flexShrink: 0
                          }}>
                            {/* Info Butonu */}
                            <button
                              type="button"
                              style={{
                                background: '#f3f4f6',
                                border: '1px solid #d1d5db',
                                borderRadius: '3px',
                                padding: '2px 4px',
                                cursor: 'pointer',
                                fontSize: '8px',
                                fontWeight: '500',
                                color: '#374151',
                                transition: 'all 0.2s ease'
                              }}
                              onClick={() => {
                                window.open(`/materials.html#suppliers-tab&supplier-${supplier.id}`, '_blank');
                              }}
                              title={`${supplier.name || supplier.companyName} detaylarını görüntüle`}
                            >
                              <Info size={12} />
                            </button>
                            
                            {/* Telefon Butonu */}
                            {(supplier.phone1 || supplier.phone) && (
                              <button
                                type="button"
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '2px',
                                  borderRadius: '3px',
                                  fontSize: '10px',
                                  lineHeight: 1
                                }}
                                onClick={() => {
                                  window.open(`tel:${supplier.phone1 || supplier.phone}`);
                                }}
                                title={`Telefon: ${supplier.phone1 || supplier.phone}`}
                              >
                                <Phone size={12} />
                              </button>
                            )}
                            
                            {/* Email Butonu */}
                            {(supplier.email1 || supplier.email) && (
                              <button
                                type="button"
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '2px',
                                  borderRadius: '3px',
                                  fontSize: '10px',
                                  lineHeight: 1
                                }}
                                onClick={() => {
                                  window.open(`mailto:${supplier.email1 || supplier.email}`);
                                }}
                                title={`Email: ${supplier.email1 || supplier.email}`}
                              >
                                <Mail size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '12px', fontSize: '11px', color: '#9ca3af' }}>
                    Tedarikçi yok
                  </div>
                )}
              </div>

              {/* Lot Envanteri */}
              <div style={{ 
                marginBottom: '16px', 
                padding: '12px', 
                background: 'white', 
                borderRadius: '6px',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#111827', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Package size={16} /> Lot Envanteri
                  </h3>
                  <button
                    onClick={() => {
                      console.log('🔄 Lot envanteri yükleniyor...', selectedMaterial.code);
                      loadLots();
                    }}
                    disabled={lotsLoading || !selectedMaterial?.code}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: '1px solid #d1d5db',
                      background: lotsLoading ? '#e5e7eb' : '#f9fafb',
                      cursor: lotsLoading || !selectedMaterial?.code ? 'not-allowed' : 'pointer',
                      fontSize: '10px',
                      fontWeight: '600',
                      color: lotsLoading ? '#9ca3af' : '#374151',
                      opacity: lotsLoading || !selectedMaterial?.code ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <RotateCw size={12} className={lotsLoading ? 'animate-spin' : ''} />
                    {lotsLoading ? 'Yükleniyor...' : 'Lot Bilgilerini Yükle'}
                  </button>
                </div>
                
                {lotsError && (
                  <div style={{ padding: '8px', background: '#fee2e2', borderRadius: '4px', fontSize: '11px', color: '#dc2626', marginBottom: '8px' }}>
                    ❌ Hata: {lotsError}
                  </div>
                )}
                
                {lotsHasLoaded && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                          <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600' }}>Lot No</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600' }}>Lot Tarihi</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600' }}>Tedarikçi Lot</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600' }}>Üretim Tarihi</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '600' }}>Miktar</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600' }}>Durum</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lotsLoading && !lotsHasLoaded ? (
                          <tr>
                            <td colSpan="6" style={{ padding: '12px', textAlign: 'center', color: '#6b7280' }}>
                              Lot envanteri yükleniyor...
                            </td>
                          </tr>
                        ) : lotsError ? (
                          <tr>
                            <td colSpan="6" style={{ padding: '12px', textAlign: 'center', color: '#dc2626' }}>
                              Lot bilgileri yüklenemedi
                            </td>
                          </tr>
                        ) : lots && lots.length > 0 ? (
                          lots.map((lot, index) => {
                            const lotDate = lot.lotDate ? new Date(lot.lotDate) : null;
                            const manufacturingDate = lot.manufacturingDate ? new Date(lot.manufacturingDate) : null;
                            return (
                              <tr key={lot.id || lot.lotNumber || `lot-${index}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '6px 8px' }}>{lot.lotNumber || '-'}</td>
                                <td style={{ padding: '6px 8px' }}>{lotDate ? lotDate.toLocaleDateString('tr-TR') : '-'}</td>
                                <td style={{ padding: '6px 8px' }}>{lot.supplierLotCode || '-'}</td>
                                <td style={{ padding: '6px 8px' }}>{manufacturingDate ? manufacturingDate.toLocaleDateString('tr-TR') : '-'}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{lot.quantity || 0} {selectedMaterial.unit}</td>
                                <td style={{ padding: '6px 8px' }}>{lot.status || 'Aktif'}</td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan="6" style={{ padding: '12px', textAlign: 'center', color: '#9ca3af' }}>
                              Henüz lot kaydı bulunmuyor
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Üretim Geçmişi */}
              <div style={{ 
                marginBottom: '16px', 
                padding: '12px', 
                background: 'white', 
                borderRadius: '6px',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                    Üretim Geçmişi
                  </h3>
                  <button
                    onClick={() => {
                      console.log('🔄 Üretim geçmişi yükleniyor...', selectedMaterial.code);
                      loadProductionHistory();
                    }}
                    disabled={productionLoading || !selectedMaterial?.code}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: '1px solid #d1d5db',
                      background: productionLoading ? '#e5e7eb' : '#f9fafb',
                      cursor: productionLoading || !selectedMaterial?.code ? 'not-allowed' : 'pointer',
                      fontSize: '10px',
                      fontWeight: '600',
                      color: productionLoading ? '#9ca3af' : '#374151',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <RotateCw size={12} className={productionLoading ? 'animate-spin' : ''} />
                    {productionLoading ? 'Yükleniyor...' : 'Üretim Geçmişini Yükle'}
                  </button>
                </div>
                
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600' }}>Tarih</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600' }}>İş Emri</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '600' }}>Miktar</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600' }}>Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productionLoading ? (
                        <tr>
                          <td colSpan="4" style={{ padding: '12px', textAlign: 'center', color: '#6b7280' }}>
                            Üretim geçmişi yükleniyor...
                          </td>
                        </tr>
                      ) : productionError ? (
                        <tr>
                          <td colSpan="4" style={{ padding: '12px', textAlign: 'center', color: '#dc2626' }}>
                            {productionError}
                          </td>
                        </tr>
                      ) : productionItems && productionItems.length > 0 ? (
                        productionItems.map((item, idx) => (
                          <tr key={item.id || item.workOrderCode || `prod-${idx}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '6px 8px' }}>
                              {item.date ? new Date(item.date).toLocaleDateString('tr-TR') : '-'}
                            </td>
                            <td style={{ padding: '6px 8px' }}>{item.workOrderCode || '-'}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                              {item.quantity || 0} {selectedMaterial.unit}
                            </td>
                            <td style={{ padding: '6px 8px' }}>{item.status || '-'}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4" style={{ padding: '12px', textAlign: 'center', color: '#9ca3af' }}>
                            Henüz üretim geçmişi bulunmuyor
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tedarik Geçmişi */}
              <div style={{ 
                marginBottom: '0', 
                padding: '12px', 
                background: 'white', 
                borderRadius: '6px',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                    Tedarik Geçmişi
                  </h3>
                  <button
                    onClick={() => {
                      if (selectedMaterial?.id && loadProcurementHistory) {
                        console.log('🔄 Tedarik geçmişi yeniden yükleniyor...', selectedMaterial.id);
                        loadProcurementHistory();
                      }
                    }}
                    disabled={procurementLoading || !selectedMaterial?.id}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: '1px solid #d1d5db',
                      background: procurementLoading ? '#e5e7eb' : '#f9fafb',
                      cursor: procurementLoading || !selectedMaterial?.id ? 'not-allowed' : 'pointer',
                      fontSize: '10px',
                      fontWeight: '600',
                      color: procurementLoading ? '#9ca3af' : '#374151',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <RotateCw size={12} className={procurementLoading ? 'animate-spin' : ''} />
                    {procurementLoading ? 'Yükleniyor...' : 'Tedarik Geçmişini Yükle'}
                  </button>
                </div>
                
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600' }}>Tarih</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600' }}>Tedarikçi</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '600' }}>Miktar</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '600' }}>Birim Fiyat</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '600' }}>Toplam</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '600' }}>Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {procurementLoading ? (
                        <tr>
                          <td colSpan="6" style={{ padding: '12px', textAlign: 'center', color: '#6b7280' }}>
                            Tedarik geçmişi yükleniyor...
                          </td>
                        </tr>
                      ) : procurementError ? (
                        <tr>
                          <td colSpan="6" style={{ padding: '12px', textAlign: 'center', color: '#dc2626' }}>
                            {procurementError}
                          </td>
                        </tr>
                      ) : procurementItems && procurementItems.length > 0 ? (
                        procurementItems.map((row, idx) => {
                          const dateObj = row._sortDate || row.actualDeliveryDate || row.expectedDeliveryDate || row.orderDate || null;
                          const dateStr = dateObj ? new Date(dateObj).toLocaleDateString('tr-TR') : '-';
                          const qty = Number(row.quantity || 0);
                          const unit = selectedMaterial?.unit || '';
                          const unitPrice = Number(row.unitPrice || 0);
                          const total = !isNaN(qty) && !isNaN(unitPrice) ? (qty * unitPrice) : 0;
                          return (
                            <tr key={`${row.orderId}-${row.itemSequence}-${idx}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                              <td style={{ padding: '6px 8px' }}>{dateStr}</td>
                              <td style={{ padding: '6px 8px' }}>{row.supplierName || '-'}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                                {!isNaN(qty) ? `${qty} ${unit}`.trim() : '-'}
                              </td>
                              <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                                {!isNaN(unitPrice) ? `${unitPrice.toLocaleString('tr-TR')} ${row.currency || 'TRY'}` : '-'}
                              </td>
                              <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                                {!isNaN(total) ? `${total.toLocaleString('tr-TR')} ${row.currency || 'TRY'}` : '-'}
                              </td>
                              <td style={{ padding: '6px 8px' }}>{row.itemStatus || '-'}</td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan="6" style={{ padding: '12px', textAlign: 'center', color: '#9ca3af' }}>
                            Henüz tedarik geçmişi bulunmuyor
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        localStorage.setItem('bk_active_tab', 'orders');
                        window.open('materials.html#orders-tab', '_blank');
                      } catch (e) {
                        console.error('Order panelini açma hatası:', e);
                      }
                    }}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '4px',
                      border: '1px solid #e5e7eb',
                      background: '#f9fafb',
                      cursor: 'pointer',
                      fontSize: '10px',
                      fontWeight: 600,
                      color: '#374151'
                    }}
                  >
                    Tüm tedarik geçmişini gör
                  </button>
                </div>
              </div>
              </form>
            </div>
          </div>
        </div>
        )}
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
      
      {/* Add Material Modal - Fullscreen popup */}
      <AddMaterialModal
        isOpen={showAddForm}
        onClose={() => setShowAddForm(false)}
        onSave={async (material) => {
          await handleAddMaterial(material);
          setShowAddForm(false);
        }}
        categories={categories}
        types={materialTypes}
        materials={materials}
      />
    </div>
  )
}