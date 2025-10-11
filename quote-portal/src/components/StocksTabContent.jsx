import React from 'react'
import MaterialsDashboard from './MaterialsDashboard.jsx'
import MaterialsFilters from './MaterialsFilters.jsx'
import MaterialsTable from './MaterialsTable.jsx'

export default function StocksTabContent({ 
  filteredMaterials, 
  categories, 
  materialTypes, 
  handleFilterChange, 
  handleAddMaterial, 
  handleEditMaterial, 
  handleCategoryManage 
}) {
  return (
    <div className="stocks-tab-content">
      <div className="materials-header-section">
        <div className="materials-dashboard-container">
          <MaterialsDashboard materials={filteredMaterials} />
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
      <MaterialsTable 
        materials={filteredMaterials} 
        types={materialTypes} 
        onEditMaterial={handleEditMaterial}
        onCategoryManage={handleCategoryManage}
      />
    </div>
  )
}