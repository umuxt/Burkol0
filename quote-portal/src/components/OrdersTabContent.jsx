import React from 'react'

// Geçici orders dashboard component
function OrdersDashboard() {
  return (
    <section className="materials-dashboard">
      <div className="card">
        <h3>Açık Siparişler</h3>
        <p>5</p>
      </div>
      <div className="card">
        <h3>Bu Ay Teslim</h3>
        <p>18</p>
      </div>
      <div className="card">
        <h3>Geciken</h3>
        <p className="warning">2</p>
      </div>
    </section>
  )
}

// Geçici orders filters component
function OrdersFilters() {
  return (
    <section className="materials-filters">
      <div className="filters-container">
        <div className="search-section">
          <div className="search-input-container">
            <input 
              placeholder="Sipariş numarası veya tedarikçiye göre ara..." 
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

// Geçici orders table component
function OrdersTable() {
  return (
    <div className="orders-table-placeholder">
      <p>Sipariş tablosu burada görünecek...</p>
    </div>
  )
}

export default function OrdersTabContent() {
  return (
    <div className="stocks-tab-content">
      <div className="materials-header-section">
        <div className="materials-dashboard-container">
          <OrdersDashboard />
        </div>
        <div className="materials-actions-container">
          <div className="materials-actions">
            <button 
              type="button" 
              className="add-material-btn"
            >
              + Yeni Sipariş
            </button>
          </div>
        </div>
        <div className="materials-filters-container">
          <OrdersFilters />
        </div>
      </div>
      <OrdersTable />
    </div>
  )
}