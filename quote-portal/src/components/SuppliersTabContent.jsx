import React from 'react'

// Geçici suppliers dashboard component
function SuppliersDashboard() {
  return (
    <section className="materials-dashboard">
      <div className="card">
        <h3>Toplam Tedarikçi</h3>
        <p>8</p>
      </div>
      <div className="card">
        <h3>Aktif Tedarikçi</h3>
        <p>7</p>
      </div>
      <div className="card">
        <h3>Bu Ay Sipariş</h3>
        <p>12</p>
      </div>
    </section>
  )
}

// Geçici suppliers filters component
function SuppliersFilters() {
  return (
    <section className="materials-filters">
      <div className="filters-container">
        <div className="search-section">
          <div className="search-input-container">
            <input 
              placeholder="Tedarikçi adı veya kategoriye göre ara..." 
              className="search-input" 
              type="text" 
              readOnly
            />
            <span className="search-icon">🔍</span>
          </div>
        </div>
      </div>
    </section>
  )
}

// Geçici suppliers table component
function SuppliersTable() {
  return (
    <div className="suppliers-table-placeholder">
      <p>Tedarikçi tablosu burada görünecek...</p>
    </div>
  )
}

export default function SuppliersTabContent() {
  return (
    <div className="stocks-tab-content">
      <div className="materials-header-section">
        <div className="materials-dashboard-container">
          <SuppliersDashboard />
        </div>
        <div className="materials-actions-container">
          <div className="materials-actions">
            <button 
              type="button" 
              className="add-material-btn"
            >
              + Yeni Tedarikçi
            </button>
          </div>
        </div>
        <div className="materials-filters-container">
          <SuppliersFilters />
        </div>
      </div>
      <SuppliersTable />
    </div>
  )
}