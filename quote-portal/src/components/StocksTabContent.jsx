import React, { useState } from 'react'
import MaterialsDashboard from './MaterialsDashboard.jsx'
import MaterialsFilters from './MaterialsFilters.jsx'
import MaterialsTable from './MaterialsTable.jsx'

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
  loading = false,
  error = null
}) {
  const [selectedMaterials, setSelectedMaterials] = useState(new Set());

  // CSV Export fonksiyonu
  const handleCSVExport = () => {
    const materialsToExport = selectedMaterials.size > 0 
      ? materials.filter(m => selectedMaterials.has(m.id))
      : materials;
    
    if (materialsToExport.length === 0) {
      alert('Dışa aktarılacak malzeme bulunamadı.');
      return;
    }

    // CSV headers
    const headers = ['Kod', 'Malzeme Adı', 'Kategori', 'Tür', 'Stok', 'Birim', 'Birim Fiyat', 'Durum'];
    
    // CSV rows
    const rows = materialsToExport.map(material => [
      material.code || '',
      material.name || '',
      material.category || '',
      material.type || '',
      material.stock || 0,
      material.unit || '',
      material.unitPrice || 0,
      material.status || 'Aktif'
    ]);

    // CSV content oluştur
    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `malzemeler_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Bulk Delete fonksiyonu
  const handleBulkDelete = async () => {
    if (selectedMaterials.size === 0) return;
    
    const selectedCount = selectedMaterials.size;
    const confirmMessage = `${selectedCount} malzemeyi silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`;
    
    if (window.confirm(confirmMessage)) {
      try {
        // Her seçili malzeme için delete fonksiyonunu çağır
        for (const materialId of selectedMaterials) {
          await handleDeleteMaterial(materialId); // Sadece ID gönder
        }
        
        // Seçimi temizle
        setSelectedMaterials(new Set());
        console.log(`${selectedCount} malzeme başarıyla silindi.`);
      } catch (error) {
        console.error('Bulk delete error:', error);
        alert('Malzemeler silinirken bir hata oluştu. Lütfen tekrar deneyin.');
      }
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
              onClick={handleAddMaterial}
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
              onClick={handleAddMaterial}
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
    </div>
  )
}