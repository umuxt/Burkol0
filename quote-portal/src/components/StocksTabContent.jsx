import React from 'react'
import MaterialsDashboard from './MaterialsDashboard.jsx'
import MaterialsFilters from './MaterialsFilters.jsx'
import MaterialsTable from './MaterialsTable.jsx'

export default function StocksTabContent({ 
  materials, 
  categories, 
  materialTypes, 
  handleFilterChange, 
  handleAddMaterial, 
  handleEditMaterial,
  handleDeleteMaterial,
  handleCategoryManage,
  loading = false,
  error = null
}) {
  
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
            onEditMaterial={handleEditMaterial}
            onDeleteMaterial={handleDeleteMaterial}
            onCategoryManage={handleCategoryManage}
          />
        )}
      </div>
    </div>
  )
}