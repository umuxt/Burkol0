import React, { useState, useEffect } from 'react'
import AddOrderModal from './AddOrderModal.jsx'
import { fetchWithTimeout, withAuth } from '../../../shared/lib/api.js'
import { materialsService } from '../../materials/services/materials-service.js'

// Shared helpers for delivery status across list and modal
function getDeliveryStatusColor(status) {
  const statusColors = {
    'bugün-teslim': { bg: '#fef3c7', text: '#d97706' },    // Sarı
    'bu-hafta-teslim': { bg: '#dbeafe', text: '#2563eb' }, // Mavi
    'gecikmiş': { bg: '#fee2e2', text: '#dc2626' },        // Kırmızı
    'gecikti': { bg: '#fee2e2', text: '#dc2626' },         // Kırmızı (alternatif anahtar)
    'zamanında': { bg: '#dcfce7', text: '#16a34a' },       // Yeşil
    'erken': { bg: '#f3e8ff', text: '#9333ea' },           // Mor
    'teslim-edildi': { bg: '#dcfce7', text: '#16a34a' },   // Yeşil
    'hesaplanıyor': { bg: '#f1f5f9', text: '#64748b' }     // Gri
  }
  return statusColors[status] || statusColors['hesaplanıyor']
}

function getDeliveryStatusText(status, daysRemaining = 0) {
  switch (status) {
    case 'bugün-teslim':
      return 'Bugün Teslim'
    case 'bu-hafta-teslim':
      return `${daysRemaining} gün kaldı`
    case 'gecikmiş':
    case 'gecikti':
      return `${Math.abs(daysRemaining)} gün gecikti`
    case 'zamanında':
      return 'Zamanında'
    case 'erken':
      return 'Erken teslim'
    case 'teslim-edildi':
      return 'Teslim edildi'
    case 'hesaplanıyor':
      return 'Teslimat tarihi belirsiz'
    default:
      return 'Hesaplanıyor'
  }
}

// Auth helper
async function fetchJsonWith401Retry(url, options = {}, timeoutMs = 10000) {
  const res = await fetchWithTimeout(url, options, timeoutMs)
  if (res.status !== 401) return res
  try {
    const host = typeof window !== 'undefined' ? window.location.hostname : ''
    const isLocal = host === 'localhost' || host === '127.0.0.1'
    if (!isLocal) return res
    localStorage.removeItem('bk_admin_token')
    const retry = await fetchWithTimeout(url, { ...(options || {}), headers: withAuth(options?.headers || {}) }, timeoutMs)
    return retry
  } catch {
    return res
  }
}

// Orders dashboard component with real data
function OrdersDashboard({ stats, loading }) {
  if (loading) {
    return (
      <section className="materials-dashboard">
        <div className="card">
          <h3>Yükleniyor...</h3>
          <p>...</p>
        </div>
      </section>
    )
  }

  return (
    <section className="materials-dashboard">
      <div className="card">
        <h3>Açık Siparişler</h3>
        <p>{stats.pendingOrders}</p>
      </div>
      <div className="card">
        <h3>Bu Ay Teslim</h3>
        <p>{stats.thisMonthOrders}</p>
      </div>
      <div className="card">
        <h3>Kısmi Teslimat</h3>
        <p className="warning">{stats.partialOrders}</p>
      </div>
    </section>
  )
}

// Orders filters component
function OrdersFilters({ 
  filters, 
  onFilterChange, 
  resultsCount, 
  hasActiveFilters,
  isExpanded,
  onToggleExpanded,
  activeMaterials = [],  // Aktif malzemeler prop'u
  activeSuppliers = [],   // Aktif tedarikçiler prop'u
  materialCategories = [] // Malzeme kategorileri prop'u
}) {
  return (
    <section className="materials-filters">
      <div style={{ 
        display: 'flex', 
        alignItems: 'flex-start', 
        gap: '8px',
        width: '100%'
      }}>
        {/* Sol taraf - Genişletme butonu */}
        <div style={{
          paddingLeft: '4px',
          paddingTop: '20px',
          display: 'flex',
          alignItems: 'center',
          height: '100%',
          order: 1,
          flexDirection: 'column',
          gap: '4px'
        }}>
          <button
            onClick={() => onToggleExpanded(!isExpanded)}
            style={{
              background: 'none',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              padding: '8px 6px',
              cursor: 'pointer',
              color: '#6b7280',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              minHeight: '40px'
            }}
            title={isExpanded ? 'Daralt' : 'Genişlet'}
          >
            {isExpanded ? '»' : '«'}
          </button>
          
          {/* Sonuç sayısı - kompakt */}
          {(resultsCount !== undefined) && (
            <div style={{
              fontSize: '11px',
              color: hasActiveFilters ? '#1e40af' : '#6b7280',
              fontWeight: hasActiveFilters ? '600' : '400',
              padding: '0 4px',
              textAlign: 'center',
              lineHeight: '1.2'
            }}>
              {resultsCount}
            </div>
          )}
        </div>

        {/* Sağ taraf - Filtre container */}
        <div className={`filters-container ${hasActiveFilters ? 'filters-active' : ''}`} style={{ order: 2 }}>
          <div className="search-section">
            <div className="search-input-container">
              <input 
                placeholder="Sipariş numarası veya tedarikçiye göre ara..." 
                className="search-input" 
                type="text"
                value={filters.search || ''}
                onChange={(e) => onFilterChange('search', e.target.value)}
              />
              <span className="search-icon">🔍</span>
            </div>
            {isExpanded && (
              <div className="filter-group price-range-group">
                <div className="multi-select-container">
                  <div className="multi-select-header price-range-header">
                    <span className="price-range-label">Tutar Aralığı</span>
                    <div className="price-range-inputs-inline">
                      <input
                        type="number"
                        placeholder="Min"
                        value={filters.priceRange.min}
                        onChange={(e) => {
                          const newPriceRange = { ...filters.priceRange, min: e.target.value };
                          onFilterChange('priceRange', newPriceRange);
                        }}
                        className="price-input-header"
                      />
                      <input
                        type="number"
                        placeholder="Max"
                        value={filters.priceRange.max}
                        onChange={(e) => {
                          const newPriceRange = { ...filters.priceRange, max: e.target.value };
                          onFilterChange('priceRange', newPriceRange);
                        }}
                        className="price-input-header"
                      />
                    </div>
                    <button 
                      className="price-toggle-button"
                      onClick={() => {
                        const newMode = filters.priceRange.mode === 'order' ? 'item' : 'order';
                        const newPriceRange = { ...filters.priceRange, mode: newMode };
                        onFilterChange('priceRange', newPriceRange);
                      }}
                    >
                      {filters.priceRange.mode === 'order' ? 'Sipariş' : 'Ürün'}
                    </button>
                    {(filters.priceRange.min || filters.priceRange.max) && (
                      <button 
                        className="price-clear-btn"
                        onClick={() => {
                          onFilterChange('priceRange', { min: '', max: '', mode: 'order' });
                        }}
                        title="Temizle"
                      >
                        ✕
                      </button>
                    )}
                    {/* Uygula butonu kaldırıldı; değişiklikler otomatik uygulanıyor */}
                  </div>
                </div>
              </div>
            )}
          </div>

        <div className={`dropdown-filters ${isExpanded ? 'expanded' : ''}`}>
          {/* Sipariş Durumu Filtresi */}
          <div className="filter-group">
            <div className="multi-select-container">
              <div className="multi-select-header" onClick={() => {
                const dropdown = document.getElementById('order-status-dropdown');
                dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
              }}>
                {filters.orderStatus || 'Sipariş Durumu'}
                <span className="dropdown-arrow">▼</span>
              </div>
              <div id="order-status-dropdown" className="multi-select-dropdown" style={{display: 'none'}}>
                <label className="multi-select-option">
                  <input
                    type="radio"
                    name="orderStatus"
                    value=""
                    checked={!filters.orderStatus}
                    onChange={(e) => onFilterChange('orderStatus', e.target.value)}
                  />
                  Tümü
                </label>
                <label className="multi-select-option">
                  <input
                    type="radio"
                    name="orderStatus"
                    value="Onay Bekliyor"
                    checked={filters.orderStatus === 'Onay Bekliyor'}
                    onChange={(e) => onFilterChange('orderStatus', e.target.value)}
                  />
                  Onay Bekliyor
                </label>
                <label className="multi-select-option">
                  <input
                    type="radio"
                    name="orderStatus"
                    value="Onaylandı"
                    checked={filters.orderStatus === 'Onaylandı'}
                    onChange={(e) => onFilterChange('orderStatus', e.target.value)}
                  />
                  Onaylandı
                </label>
                <label className="multi-select-option">
                  <input
                    type="radio"
                    name="orderStatus"
                    value="Yolda"
                    checked={filters.orderStatus === 'Yolda'}
                    onChange={(e) => onFilterChange('orderStatus', e.target.value)}
                  />
                  Yolda
                </label>
                <label className="multi-select-option">
                  <input
                    type="radio"
                    name="orderStatus"
                    value="Teslim Edildi"
                    checked={filters.orderStatus === 'Teslim Edildi'}
                    onChange={(e) => onFilterChange('orderStatus', e.target.value)}
                  />
                  Teslim Edildi
                </label>
                <label className="multi-select-option">
                  <input
                    type="radio"
                    name="orderStatus"
                    value="İptal Edildi"
                    checked={filters.orderStatus === 'İptal Edildi'}
                    onChange={(e) => onFilterChange('orderStatus', e.target.value)}
                  />
                  İptal Edildi
                </label>
              </div>
            </div>
          </div>

          {/* Satır Durumu Filtresi */}
          <div className="filter-group">
            <div className="multi-select-container">
              <div className="multi-select-header" onClick={() => {
                const dropdown = document.getElementById('item-status-dropdown');
                dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
              }}>
                {filters.itemStatus || 'Satır Durumu'}
                <span className="dropdown-arrow">▼</span>
              </div>
              <div id="item-status-dropdown" className="multi-select-dropdown" style={{display: 'none'}}>
                <label className="multi-select-option">
                  <input
                    type="radio"
                    name="itemStatus"
                    value=""
                    checked={!filters.itemStatus}
                    onChange={(e) => onFilterChange('itemStatus', e.target.value)}
                  />
                  Tümü
                </label>
                <label className="multi-select-option">
                  <input
                    type="radio"
                    name="itemStatus"
                    value="Onay Bekliyor"
                    checked={filters.itemStatus === 'Onay Bekliyor'}
                    onChange={(e) => onFilterChange('itemStatus', e.target.value)}
                  />
                  Onay Bekliyor
                </label>
                <label className="multi-select-option">
                  <input
                    type="radio"
                    name="itemStatus"
                    value="Onaylandı"
                    checked={filters.itemStatus === 'Onaylandı'}
                    onChange={(e) => onFilterChange('itemStatus', e.target.value)}
                  />
                  Onaylandı
                </label>
                <label className="multi-select-option">
                  <input
                    type="radio"
                    name="itemStatus"
                    value="Yolda"
                    checked={filters.itemStatus === 'Yolda'}
                    onChange={(e) => onFilterChange('itemStatus', e.target.value)}
                  />
                  Yolda
                </label>
                <label className="multi-select-option">
                  <input
                    type="radio"
                    name="itemStatus"
                    value="Teslim Edildi"
                    checked={filters.itemStatus === 'Teslim Edildi'}
                    onChange={(e) => onFilterChange('itemStatus', e.target.value)}
                  />
                  Teslim Edildi
                </label>
                <label className="multi-select-option">
                  <input
                    type="radio"
                    name="itemStatus"
                    value="İptal Edildi"
                    checked={filters.itemStatus === 'İptal Edildi'}
                    onChange={(e) => onFilterChange('itemStatus', e.target.value)}
                  />
                  İptal Edildi
                </label>
              </div>
            </div>
          </div>

          {/* Tarih Filtresi */}
          <div className="filter-group">
            <div className="multi-select-container">
              <div className="multi-select-header" onClick={() => {
                const dropdown = document.getElementById('date-range-dropdown');
                dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
              }}>
                {(() => {
                  const dateMap = {
                    'bugün': 'Bugün',
                    'bu-hafta': 'Bu Hafta', 
                    'bu-ay': 'Bu Ay',
                    'son-3-ay': 'Son 3 Ay'
                  };
                  return filters.dateRange ? dateMap[filters.dateRange] : 'Sipariş Tarihi';
                })()}
                <span className="dropdown-arrow">▼</span>
              </div>
              <div id="date-range-dropdown" className="multi-select-dropdown" style={{display: 'none'}}>
                <label className="multi-select-option">
                  <input
                    type="radio"
                    name="dateRange"
                    value=""
                    checked={!filters.dateRange}
                    onChange={(e) => onFilterChange('dateRange', e.target.value)}
                  />
                  Tümü
                </label>
                <label className="multi-select-option">
                  <input
                    type="radio"
                    name="dateRange"
                    value="bugün"
                    checked={filters.dateRange === 'bugün'}
                    onChange={(e) => onFilterChange('dateRange', e.target.value)}
                  />
                  Bugün
                </label>
                <label className="multi-select-option">
                  <input
                    type="radio"
                    name="dateRange"
                    value="bu-hafta"
                    checked={filters.dateRange === 'bu-hafta'}
                    onChange={(e) => onFilterChange('dateRange', e.target.value)}
                  />
                  Bu Hafta
                </label>
                <label className="multi-select-option">
                  <input
                    type="radio"
                    name="dateRange"
                    value="bu-ay"
                    checked={filters.dateRange === 'bu-ay'}
                    onChange={(e) => onFilterChange('dateRange', e.target.value)}
                  />
                  Bu Ay
                </label>
                <label className="multi-select-option">
                  <input
                    type="radio"
                    name="dateRange"
                    value="son-3-ay"
                    checked={filters.dateRange === 'son-3-ay'}
                    onChange={(e) => onFilterChange('dateRange', e.target.value)}
                  />
                  Son 3 Ay
                </label>
              </div>
            </div>
          </div>

          {/* Malzeme Tipi Filtresi */}
          <div className="filter-group">
            <div className="multi-select-container">
              <div 
                className={`multi-select-header ${filters.materialType ? 'has-selection' : ''}`}
                onClick={() => {
                  const dropdown = document.querySelector('.material-type-dropdown');
                  if (dropdown) {
                    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
                  }
                }}
              >
                <span>{filters.materialType ? 
                  (() => {
                    const selectedMaterial = activeMaterials.find(m => m.materialCode === filters.materialType);
                    return selectedMaterial ? `${selectedMaterial.materialCode} - ${selectedMaterial.materialName}` : filters.materialType;
                  })()
                  : 'Malzeme Tipi'}</span>
                <span className="dropdown-arrow">▼</span>
              </div>
              <div className="multi-select-dropdown material-type-dropdown" style={{ display: 'none' }}>
                <label className="multi-select-option">
                  <input
                    type="radio"
                    name="materialType"
                    value=""
                    checked={filters.materialType === ''}
                    onChange={(e) => onFilterChange('materialType', '')}
                  />
                  Tümü
                </label>
                {activeMaterials.map(material => (
                  <label key={material.materialCode} className="multi-select-option">
                    <input
                      type="radio"
                      name="materialType"
                      value={material.materialCode}
                      checked={filters.materialType === material.materialCode}
                      onChange={(e) => onFilterChange('materialType', e.target.value)}
                    />
                    {material.materialCode} - {material.materialName}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Tedarikçiler Filtresi */}
          <div className="filter-group">
            <div className="multi-select-container">
              <div 
                className={`multi-select-header ${filters.supplierType ? 'has-selection' : ''}`}
                onClick={() => {
                  const dropdown = document.querySelector('.supplier-type-dropdown');
                  if (dropdown) {
                    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
                  }
                }}
              >
                <span>{filters.supplierType ? 
                  (() => {
                    const selectedSupplier = activeSuppliers.find(s => s.supplierCode === filters.supplierType);
                    return selectedSupplier ? `${selectedSupplier.supplierCode} - ${selectedSupplier.supplierName}` : filters.supplierType;
                  })()
                  : 'Tedarikçiler'}</span>
                <span className="dropdown-arrow">▼</span>
              </div>
              <div className="multi-select-dropdown supplier-type-dropdown" style={{ display: 'none' }}>
                <label className="multi-select-option">
                  <input
                    type="radio"
                    name="supplierType"
                    value=""
                    checked={filters.supplierType === ''}
                    onChange={(e) => onFilterChange('supplierType', '')}
                  />
                  Tümü
                </label>
                {activeSuppliers.map(supplier => (
                  <label key={supplier.supplierCode} className="multi-select-option">
                    <input
                      type="radio"
                      name="supplierType"
                      value={supplier.supplierCode}
                      checked={filters.supplierType === supplier.supplierCode}
                      onChange={(e) => onFilterChange('supplierType', e.target.value)}
                    />
                    {supplier.supplierCode} - {supplier.supplierName}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Teslimat Durumu Filtresi (sadece genişletilmiş görünümde) */}
          {isExpanded && (
            <div className="filter-group">
              <div className="multi-select-container">
                <div 
                  className={`multi-select-header ${filters.deliveryStatus ? 'has-selection' : ''}`}
                  onClick={() => {
                    const dropdown = document.querySelector('.delivery-status-dropdown');
                    if (dropdown) {
                      dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
                    }
                  }}
                >
                  <span>{filters.deliveryStatus ? 
                    (() => {
                      switch(filters.deliveryStatus) {
                        case 'hesaplanıyor': return 'Teslimat tarihi belirsiz';
                        case 'bugün-teslim': return 'Bugün teslim';
                        case 'bu-hafta-teslim': return 'Bu hafta teslim';
                        case 'gecikmiş': return 'Gecikmiş';
                        case 'zamanında': return 'Zamanında';
                        case 'erken': return 'Erken teslim';
                        default: return filters.deliveryStatus;
                      }
                    })()
                    : 'Teslimat Durumu'}</span>
                  <span className="dropdown-arrow">▼</span>
                </div>
                <div className="multi-select-dropdown delivery-status-dropdown" style={{ display: 'none' }}>
                  <label className="multi-select-option">
                    <input
                      type="radio"
                      name="deliveryStatus"
                      value=""
                      checked={filters.deliveryStatus === ''}
                      onChange={(e) => onFilterChange('deliveryStatus', '')}
                    />
                    Tümü
                  </label>
                  <label className="multi-select-option">
                    <input
                      type="radio"
                      name="deliveryStatus"
                      value="hesaplanıyor"
                      checked={filters.deliveryStatus === 'hesaplanıyor'}
                      onChange={(e) => onFilterChange('deliveryStatus', e.target.value)}
                    />
                    Teslimat tarihi belirsiz
                  </label>
                  <label className="multi-select-option">
                    <input
                      type="radio"
                      name="deliveryStatus"
                      value="bugün-teslim"
                      checked={filters.deliveryStatus === 'bugün-teslim'}
                      onChange={(e) => onFilterChange('deliveryStatus', e.target.value)}
                    />
                    Bugün teslim
                  </label>
                  <label className="multi-select-option">
                    <input
                      type="radio"
                      name="deliveryStatus"
                      value="bu-hafta-teslim"
                      checked={filters.deliveryStatus === 'bu-hafta-teslim'}
                      onChange={(e) => onFilterChange('deliveryStatus', e.target.value)}
                    />
                    Bu hafta teslim
                  </label>
                  <label className="multi-select-option">
                    <input
                      type="radio"
                      name="deliveryStatus"
                      value="gecikmiş"
                      checked={filters.deliveryStatus === 'gecikmiş'}
                      onChange={(e) => onFilterChange('deliveryStatus', e.target.value)}
                    />
                    Gecikmiş
                  </label>
                  <label className="multi-select-option">
                    <input
                      type="radio"
                      name="deliveryStatus"
                      value="zamanında"
                      checked={filters.deliveryStatus === 'zamanında'}
                      onChange={(e) => onFilterChange('deliveryStatus', e.target.value)}
                    />
                    Zamanında
                  </label>
                  <label className="multi-select-option">
                    <input
                      type="radio"
                      name="deliveryStatus"
                      value="erken"
                      checked={filters.deliveryStatus === 'erken'}
                      onChange={(e) => onFilterChange('deliveryStatus', e.target.value)}
                    />
                    Erken teslim
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Malzeme Kategorisi Filtresi (sadece genişletilmiş görünümde) */}
          {isExpanded && (
            <div className="filter-group">
              <div className="multi-select-container">
                <div 
                  className={`multi-select-header ${filters.materialCategory ? 'has-selection' : ''}`}
                  onClick={() => {
                    const dropdown = document.querySelector('.material-category-dropdown');
                    if (dropdown) {
                      dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
                    }
                  }}
                >
                  <span>{filters.materialCategory ? 
                    (() => {
                      const selectedCategory = materialCategories.find(c => c.categoryId === filters.materialCategory);
                      return selectedCategory ? selectedCategory.categoryName : filters.materialCategory;
                    })()
                    : 'Malzeme Kategorisi'}</span>
                  <span className="dropdown-arrow">▼</span>
                </div>
                <div className="multi-select-dropdown material-category-dropdown" style={{ display: 'none' }}>
                  <label className="multi-select-option">
                    <input
                      type="radio"
                      name="materialCategory"
                      value=""
                      checked={filters.materialCategory === ''}
                      onChange={(e) => onFilterChange('materialCategory', '')}
                    />
                    Tümü
                  </label>
                  {materialCategories.map(category => (
                    <label key={category.categoryId} className="multi-select-option">
                      <input
                        type="radio"
                        name="materialCategory"
                        value={category.categoryId}
                        checked={filters.materialCategory === category.categoryId}
                        onChange={(e) => onFilterChange('materialCategory', e.target.value)}
                      />
                      {category.categoryName}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Aktif filtre temizleme */}
          {hasActiveFilters && (
            <div className="filter-group">
              <button
                onClick={() => {
                  onFilterChange('search', '');
                  onFilterChange('orderStatus', '');
                  onFilterChange('itemStatus', '');
                  onFilterChange('dateRange', '');
                  onFilterChange('deliveryStatus', '');
                  onFilterChange('materialType', '');
                  onFilterChange('supplierType', '');
                  onFilterChange('materialCategory', '');
                  onFilterChange('priceRange', { min: '', max: '', mode: 'order' });
                }}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                Filtreleri Temizle
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
    </section>
  )
}

// Orders table component
function OrdersTable({
  orders,
  loading,
  error,
  title,
  variant = 'pending',
  tabCounts,
  onChangeTab,
  onOrderClick,
  onUpdateOrderStatus,
  actionLoading = false,
  emptyMessage = 'Sipariş bulunamadı',
  deliveryStatuses = {},
  deliveryLoading = false,
  selectedOrderIds = new Set(),
  onToggleSelectOrder,
  onToggleSelectAll,
  materialNameMap = {}
}) {
  const [sortField, setSortField] = React.useState('orderDate')
  const [sortDirection, setSortDirection] = React.useState('desc')

  const handleSort = (field) => {
    setSortField(prev => {
      if (prev === field) {
        setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'))
        return prev
      }
      setSortDirection('asc')
      return field
    })
  }

  const getSortIndicator = (field) => {
    if (sortField !== field) return '↕'
    return sortDirection === 'asc' ? '↑' : '↓'
  }

  const getSortValue = (order, field) => {
    switch (field) {
      case 'orderCode': return order.orderCode || order.id || ''
      case 'supplier': return (order.supplierName || order.supplier?.name || order.supplierCode || '').toString()
      case 'status': return order.orderStatus || ''
      case 'total': return Number(order.totalAmount || order.totalPrice || 0)
      case 'items': return Number(order.items?.length || order.itemCount || 0)
      case 'orderDate':
      default:
        const d = order.orderDate instanceof Date ? order.orderDate : (order.orderDate ? new Date(order.orderDate) : new Date(0))
        return d.getTime()
    }
  }

  const visibleOrders = React.useMemo(() => {
    const base = Array.isArray(orders) ? orders.filter(o => {
      const isCompleted = o.orderStatus === 'Teslim Edildi'
      return variant === 'completed' ? isCompleted : variant === 'pending' ? !isCompleted : true
    }) : []

    const sorted = [...base].sort((a, b) => {
      const av = getSortValue(a, sortField)
      const bv = getSortValue(b, sortField)
      if (av < bv) return sortDirection === 'asc' ? -1 : 1
      if (av > bv) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [orders, variant, sortField, sortDirection])
  if (loading) {
    return (
      <div className="orders-table-placeholder">
        <p>Siparişler yükleniyor...</p>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="orders-table-placeholder">
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          color: '#ef4444'
        }}>
          <div style={{
            fontSize: '48px',
            marginBottom: '16px',
            opacity: 0.5
          }}>⚠️</div>
          <h3 style={{
            margin: '0 0 8px 0',
            fontSize: '18px',
            fontWeight: '600',
            color: '#dc2626'
          }}>
            Bağlantı Problemi
          </h3>
          <p style={{
            margin: '0 0 16px 0',
            fontSize: '14px',
            color: '#6b7280'
          }}>
            {error.includes('timeout') ? 
              'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.' : 
              `Siparişler yüklenirken hata oluştu: ${error}`
            }
          </p>
          <button 
            onClick={() => window.location.reload()} 
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Sayfayı Yenile
          </button>
        </div>
      </div>
    )
  }

  // Empty state component for different tabs
  const EmptyState = ({ variant, hasNoOrdersAtAll = false }) => {
    const emptyStateConfig = {
      pending: {
        icon: '⏳',
        title: 'Bekleyen sipariş bulunmuyor',
        message: hasNoOrdersAtAll 
          ? 'İlk siparişinizi oluşturmak için "Yeni Sipariş" butonunu kullanın'
          : 'Tüm siparişleriniz tamamlanmış durumda. Yeni sipariş oluşturabilirsiniz.'
      },
      completed: {
        icon: '✅',
        title: 'Tamamlanmış sipariş yok',
        message: hasNoOrdersAtAll
          ? 'Henüz tamamlanmış sipariş bulunmuyor'
          : 'Henüz tamamlanmış sipariş bulunmuyor. Bekleyen siparişlerinizi tamamlayabilirsiniz.'
      }
    }

    const config = emptyStateConfig[variant] || emptyStateConfig.pending

    return (
      <div style={{
        textAlign: 'center',
        padding: '40px 20px',
        color: '#6b7280'
      }}>
        <div style={{
          fontSize: '48px',
          marginBottom: '16px',
          opacity: 0.5
        }}>{config.icon}</div>
        <h3 style={{
          margin: '0 0 8px 0',
          fontSize: '18px',
          fontWeight: '600',
          color: '#374151'
        }}>
          {config.title}
        </h3>
        <p style={{
          margin: '0',
          fontSize: '14px',
          color: '#6b7280'
        }}>
          {config.message}
        </p>
      </div>
    )
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY'
    }).format(amount || 0)
  }

  const formatDate = (date) => {
    if (!date) return '-'
    const dateObj = date instanceof Date ? date : new Date(date)
    return dateObj.toLocaleDateString('tr-TR')
  }

  const getStatusColor = (status) => {
    const colors = {
      Taslak: '#6b7280',
      'Onay Bekliyor': '#f59e0b',
      'Onaylandı': '#3b82f6',
      'Kısmi Teslimat': '#f97316',
      Yolda: '#6366f1',
      'Teslim Edildi': '#10b981',
      Tamamlandı: '#10b981',
      'İptal Edildi': '#ef4444'
    }
    return colors[status] || '#6b7280'
  }

  // Teslimat durumu renk ve metin helper fonksiyonları
  const getDeliveryStatusColor = (status) => {
    const statusColors = {
      'bugün-teslim': { bg: '#fef3c7', text: '#d97706' },    // Sarı
      'bu-hafta-teslim': { bg: '#dbeafe', text: '#2563eb' }, // Mavi
      'gecikmiş': { bg: '#fee2e2', text: '#dc2626' },        // Kırmızı
      'zamanında': { bg: '#dcfce7', text: '#16a34a' },       // Yeşil
      'erken': { bg: '#f3e8ff', text: '#9333ea' },           // Mor
      'teslim-edildi': { bg: '#dcfce7', text: '#16a34a' },   // Yeşil
      'hesaplanıyor': { bg: '#f1f5f9', text: '#64748b' }     // Gri
    }
    return statusColors[status] || statusColors['hesaplanıyor']
  }

  const getDeliveryStatusText = (status, daysRemaining) => {
    switch (status) {
      case 'bugün-teslim':
        return 'Bugün Teslim'
      case 'bu-hafta-teslim':
        return `${daysRemaining} gün kaldı`
      case 'gecikmiş':
        return `${Math.abs(daysRemaining)} gün gecikti`
      case 'zamanında':
        return 'Zamanında'
      case 'erken':
        return 'Erken teslim'
      case 'teslim-edildi':
        return 'Teslim edildi'
      case 'hesaplanıyor':
        return 'Teslimat tarihi belirsiz'
      default:
        return 'Hesaplanıyor'
    }
  }

  const renderLineChips = (items = []) => (
    <div style={{
      display: 'inline-flex',
      flexWrap: 'nowrap',
      gap: '12px',
      alignItems: 'flex-start',
      whiteSpace: 'nowrap',
      overflowX: 'auto',
      maxWidth: '100%',
      WebkitOverflowScrolling: 'touch'
    }}>
      {items.map((item, index) => (
        <div
          key={item.id || item.lineId || index}
          style={{
            display: 'inline-flex',
            flexDirection: 'column',
            flex: '0 0 auto',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            background: '#fff',
            padding: '4px 6px',
            minWidth: 0,
            width: 'fit-content',
            maxWidth: '260px',
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)'
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              alignItems: 'center',
              marginBottom: '3px',
              gap: '6px'
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#1d4ed8' }}>
              {item.itemCode || item.lineId || `item-${String(index + 1).padStart(2, '0')}`}
            </span>
            <span
              style={{
                fontSize: '6px',
                fontWeight: 600,
                color: '#0f172a',
                background: '#e2e8f0',
                padding: '1px 6px',
                borderRadius: '999px',
                whiteSpace: 'nowrap'
              }}
            >
              {item.itemStatus || 'Onay Bekliyor'}
            </span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              color: '#475569',
            }}
          >
            <div style={{ fontWeight: 600 }}>{item.materialCode || '—'}</div>
            <div style={{ fontWeight: 500, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {materialNameMap[item.materialCode] || item.materialName || '-'}
            </div>
            <div style={{ textAlign: 'right', fontWeight: 600 }}>
              {item.quantity || 0} adet
            </div>
          </div>
        </div>
      ))}
    </div>
  )

  // Always render the table structure with tabs
  return (
    <section className="materials-table">
      {/* Tab Navigation - Always visible */}
      <div className="materials-tabs">
        <button
          type="button"
          className={`tab-button${variant === 'all' ? ' active' : ''}`}
          onClick={() => onChangeTab && onChangeTab('all')}
          disabled={loading}
        >
          Tümünü Göster
          <span className="tab-count">({tabCounts?.all ?? 0})</span>
        </button>
        <button
          type="button"
          className={`tab-button${variant === 'pending' ? ' active' : ''}`}
          onClick={() => onChangeTab && onChangeTab('pending')}
          disabled={loading}
        >
          Bekleyen Siparişler
          <span className="tab-count">({tabCounts?.pending ?? 0})</span>
        </button>
        <button
          type="button"
          className={`tab-button${variant === 'completed' ? ' active' : ''}`}
          onClick={() => onChangeTab && onChangeTab('completed')}
          disabled={loading}
        >
          Tamamlanan Siparişler
          <span className="tab-count">({tabCounts?.completed ?? 0})</span>
        </button>
      </div>

      {/* Table Container - Always visible */}
      <div className="table-container" style={{ width: '100%' }}>
        {loading ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px',
            color: '#6b7280'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
              <div>Siparişler yükleniyor...</div>
            </div>
          </div>
        ) : error ? (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: '#ef4444'
          }}>
            <div style={{
              fontSize: '48px',
              marginBottom: '16px',
              opacity: 0.5
            }}>⚠️</div>
            <h3 style={{
              margin: '0 0 8px 0',
              fontSize: '18px',
              fontWeight: '600',
              color: '#dc2626'
            }}>
              Bağlantı Problemi
            </h3>
            <p style={{
              margin: '0 0 16px 0',
              fontSize: '14px',
              color: '#6b7280'
            }}>
              {error.includes('timeout') ? 
                'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.' : 
                `Siparişler yüklenirken hata oluştu: ${error}`
              }
            </p>
            <button 
              onClick={() => window.location.reload()} 
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Sayfayı Yenile
            </button>
          </div>
        ) : (!orders || orders.length === 0) ? (
          // Show tab-specific empty state
          <EmptyState 
            variant={variant} 
            hasNoOrdersAtAll={true}
          />
        ) : (
          // Render the actual table with data
          <table style={{ tableLayout: 'fixed', width: '100%' }}>
            <colgroup>{[
              <col key="sel" style={{ width: '40px' }} />,
              <col key="code" style={{ width: '120px' }} />,
              <col key="supplier" style={{ width: '220px' }} />,
              ...(variant !== 'completed' ? [<col key="delivery" style={{ width: '180px' }} />] : []),
              <col key="items" style={{ width: 'auto' }} />,
              <col key="total" style={{ width: '120px' }} />,
              ...(variant !== 'completed' ? [<col key="status" style={{ width: '80px' }} />] : [])
            ]}</colgroup>
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      if (typeof onToggleSelectAll === 'function') {
                        onToggleSelectAll(orders, e.target.checked)
                      }
                    }}
                    checked={Array.isArray(orders) && orders.length > 0 && orders.every(o => selectedOrderIds?.has?.(o.id))}
                  />
                </th>
                <th style={{ width: '120px', minWidth: '120px', whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => handleSort('orderCode')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit', color: 'inherit' }}>
                    Sipariş Kodu
                    <span style={{ fontSize: '12px', opacity: 0.6 }}>{getSortIndicator('orderCode')}</span>
                  </button>
                </th>
                <th style={{ width: '220px', minWidth: '220px', whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => handleSort('supplier')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit', color: 'inherit' }}>
                    Tedarikçi
                    <span style={{ fontSize: '12px', opacity: 0.6 }}>{getSortIndicator('supplier')}</span>
                  </button>
                </th>
                {variant !== 'completed' && (
                  <th style={{ minWidth: '140px', maxWidth: '180px', whiteSpace: 'nowrap' }}>
                    <button type="button" onClick={() => handleSort('status')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit', color: 'inherit' }}>
                      Teslimat Durumu
                      <span style={{ fontSize: '12px', opacity: 0.6 }}>{getSortIndicator('status')}</span>
                    </button>
                  </th>
                )}
                <th style={{ minWidth: '220px', whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => handleSort('items')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit', color: 'inherit' }}>
                    Sipariş Satırları
                    <span style={{ fontSize: '12px', opacity: 0.6 }}>{getSortIndicator('items')}</span>
                  </button>
                </th>
                <th style={{ width: '120px', minWidth: '90px', maxWidth: '120px', textAlign: 'left', whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => handleSort('total')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit', color: 'inherit' }}>
                    Tutar
                    <span style={{ fontSize: '12px', opacity: 0.6 }}>{getSortIndicator('total')}</span>
                  </button>
                </th>
                {variant !== 'completed' && (
                  <th style={{ minWidth: '80px', maxWidth: '80px', whiteSpace: 'nowrap' }}>
                    <button type="button" onClick={() => handleSort('status')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit', color: 'inherit' }}>
                      Durum
                      <span style={{ fontSize: '12px', opacity: 0.6 }}>{getSortIndicator('status')}</span>
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {visibleOrders && visibleOrders.length > 0 ? visibleOrders.map((order) => {
                // Order status'a göre filtreleme yap - items'a değil
                const isPendingOrder = order.orderStatus !== 'Teslim Edildi'
                const isCompletedOrder = order.orderStatus === 'Teslim Edildi'
                
                // Items varsa kullan, yoksa boş array
                const items = order.items || []
                const relevantTotal = order.totalPrice || 0
                
                // TEMP DEBUG: Items kontrolü
                if (items.length === 0) {
                  console.log('❌ No items for order:', order.id, 'Order data:', {
                    hasItems: 'items' in order,
                    itemsValue: order.items,
                    itemsType: typeof order.items,
                    itemsLength: order.items?.length,
                    orderKeys: Object.keys(order)
                  })
                }
                
                return (
                  <tr
                    key={order.id}
                    onClick={() => onOrderClick && onOrderClick(order)}
                    style={{ cursor: onOrderClick ? 'pointer' : 'default' }}
                  >
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onToggleSelectOrder && onToggleSelectOrder(order.id, e.target.checked)}
                        checked={selectedOrderIds?.has?.(order.id) || false}
                      />
                    </td>
                    <td style={{ width: '120px', minWidth: '120px', whiteSpace: 'nowrap' }}>
                      <div className="material-name-cell" style={{ whiteSpace: 'nowrap' }}>
                        {order.orderCode || order.id}
                      </div>
                    </td>
                    <td style={{ width: '220px', minWidth: '220px', whiteSpace: 'nowrap' }}>
                      <div className="material-name-cell" style={{ whiteSpace: 'nowrap' }}>
                        {(order.supplierId || '').toString()} {order.supplierId ? ' / ' : ''}{order.supplierName || ''}
                      </div>
                    </td>
                    {variant !== 'completed' && (
                      <td style={{ width: '180px', maxWidth: '180px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600 }}>
                          {(() => {
                            // Debug: Order fields'ları kontrol et
                            console.log('🚚 Delivery debug for order:', order.id, {
                              expectedDeliveryDate: order.expectedDeliveryDate,
                              orderStatus: order.orderStatus,
                              deliveryDate: order.deliveryDate,
                              allOrderFields: Object.keys(order)
                            })
                            
                            // Basit teslimat durumu hesaplama - API'ye bağımlı değil
                            const today = new Date()
                            const deliveryDate = order.expectedDeliveryDate ? new Date(order.expectedDeliveryDate) : null
                            
                            let status = 'hesaplanıyor'
                            let daysRemaining = 0
                            
                            if (deliveryDate && !isNaN(deliveryDate.getTime())) {
                              const timeDiff = deliveryDate.getTime() - today.getTime()
                              daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24))
                              
                              if (order.orderStatus === 'Teslim Edildi') {
                                status = 'teslim-edildi'
                              } else if (daysRemaining < 0) {
                                status = 'gecikti'
                              } else if (daysRemaining === 0) {
                                status = 'bugün-teslim'
                              } else if (daysRemaining <= 7) {
                                status = 'bu-hafta-teslim'
                              } else {
                                status = 'zamanında'
                              }
                            } else {
                              console.log('🚚 No valid delivery date found for order:', order.id)
                            }

                            console.log('🚚 Final delivery status:', status, 'days:', daysRemaining)

                            return (
                              <span style={{
                                padding: '4px 8px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                fontWeight: 600,
                                backgroundColor: getDeliveryStatusColor(status).bg,
                                color: getDeliveryStatusColor(status).text
                              }}>
                                {getDeliveryStatusText(status, daysRemaining)}
                              </span>
                            )
                          })()}
                        </div>
                      </td>
                    )}
                    <td className="no-ellipsis" style={{ paddingTop: '4px', paddingBottom: '4px' }}>
                      {items.length > 0 ? renderLineChips(items) : (
                        <span style={{ fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>Sipariş satırı yok</span>
                      )}
                    </td>
                    <td style={{ width: '120px', textAlign: 'left', fontWeight: 600, paddingTop: '4px', paddingBottom: '4px' }}>
                      {formatCurrency(relevantTotal || order.totalAmount)}
                    </td>
                    {variant !== 'completed' && (
                      <td style={{ width: '80px', maxWidth: '80px', paddingTop: '4px', paddingBottom: '4px', whiteSpace: 'nowrap' }}>
                        {onUpdateOrderStatus ? (
                          <select
                            value={order.orderStatus}
                            disabled={actionLoading}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              console.log('🎯 ORDER STATUS DROPDOWN CHANGE:')
                              console.log('  - Order ID:', order.id)
                              console.log('  - Current Status:', order.orderStatus)
                              console.log('  - New Value:', e.target.value)
                              console.log('  - Event target:', e.target)
                              console.log('  - Value check:', e.target.value && e.target.value !== order.orderStatus)
                              console.log('  - onUpdateOrderStatus type:', typeof onUpdateOrderStatus)
                              
                              if (e.target.value && e.target.value !== order.orderStatus) {
                                console.log('✅ Calling onUpdateOrderStatus with args:', order.id, e.target.value)
                                onUpdateOrderStatus(order.id, e.target.value)
                              } else {
                                console.log('❌ Conditions not met - not calling update')
                                console.log('    - e.target.value truthy:', !!e.target.value)
                                console.log('    - values different:', e.target.value !== order.orderStatus)
                              }
                            }}
                            style={{
                              padding: '6px 10px',
                              fontSize: '11px',
                              fontWeight: 600,
                              border: '1px solid rgba(148, 163, 184, 0.6)',
                              borderRadius: '10px',
                              background: getStatusColor(order.orderStatus),
                              color: '#fff',
                              cursor: 'pointer'
                            }}
                          >
                            {['Onay Bekliyor', 'Onaylandı', 'Yolda', 'Teslim Edildi', 'İptal Edildi'].map(status => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        ) : (
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '4px 8px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 600,
                              color: 'white',
                              backgroundColor: getStatusColor(order.orderStatus)
                            }}
                          >
                            {order.orderStatus}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                )
              }) : (
                <tr>
                  <td colSpan={variant !== 'completed' ? 7 : 5} style={{ padding: 0, border: 'none' }}>
                    <EmptyState 
                      variant={variant} 
                      hasNoOrdersAtAll={false}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

export default function OrdersTabContent() {
  console.log('🎬 OrdersTabContent component rendered - FORCED LOG')
  
  const [activeOrdersTab, setActiveOrdersTab] = useState('pending') // 'pending' | 'completed' | 'all'

  // ✅ SMART TAB CHANGE: Tab değiştiğinde refresh tetikle
  const handleTabChange = async (newTab) => {
    console.log(`🔄 SMART REFRESH: Tab changed to ${newTab} - refreshing orders...`)
    setActiveOrdersTab(newTab)
    await refreshOrders() // Fresh data çek
  }
  const [isAddOrderModalOpen, setIsAddOrderModalOpen] = useState(false)
  const [isDeliveredRecordMode, setIsDeliveredRecordMode] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false)
  const [selectedOrderLoading, setSelectedOrderLoading] = useState(false)
  const [selectedOrderError, setSelectedOrderError] = useState(null)
  
  // Debug modal state
  useEffect(() => {
    console.log('🔥🔥🔥 OrdersTabContent: Modal state değişti:', isAddOrderModalOpen);
  }, [isAddOrderModalOpen])
  
  // Filter state
  const [filters, setFilters] = useState({
    search: '',
    orderStatus: '',
    itemStatus: '',
    dateRange: '',
    deliveryStatus: '', // Teslimat durumu filtresi
    materialType: '', // Malzeme tipi filtresi
    supplierType: '', // Tedarikçi filtresi
    materialCategory: '', // Malzeme kategorisi filtresi
    priceRange: {
      min: '',
      max: '',
      mode: 'order' // 'order' | 'item'
    }
  })

  // Stats hooks - Backend API kullanacağız
  const [stats, setStats] = useState({
    pendingOrders: 0,
    thisMonthOrders: 0,
    partialOrders: 0,
    totalOrders: 0,
    completedOrders: 0,
    totalAmount: 0
  })
  const [statsLoading, setStatsLoading] = useState(true)
  
  // Bulk selection state for CSV/bulk ops
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set())

  const handleToggleSelectOrder = (orderId, checked) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(orderId); else next.delete(orderId)
      return next
    })
  }

  // CSV Export for current tab (or selected orders if any)
  const handleExportCSV = () => {
    try {
      const ordersSource = selectedOrderIds.size > 0
        ? currentOrders.filter(o => selectedOrderIds.has(o.id))
        : currentOrders

      // Columns depend on variant (completed hides Durum in table)
      const includeStatusCol = activeOrdersTab !== 'completed'

      // Delimiter: Excel/TR çoğunlukla ';' bekler
      const userLocale = (typeof navigator !== 'undefined' ? navigator.language : 'tr-TR') || 'tr-TR'
      const delimiter = /^tr(-|_)/i.test(userLocale) ? ';' : ','

      const escapeCSV = (val) => {
        const s = (val ?? '').toString()
        const needsQuote = new RegExp(`["\n${delimiter === ';' ? ';' : ','}]`)
        if (needsQuote.test(s)) {
          return '"' + s.replace(/"/g, '""') + '"'
        }
        return s
      }

      // Determine max item count across export set
      const maxItemCount = (ordersSource || []).reduce((max, o) => {
        const c = Array.isArray(o.items) ? o.items.length : 0
        return Math.max(max, c)
      }, 0)

      // Group header (row 1) – emulate merged cells by repeating group labels
      const headerRow1Parts = [
        'Sipariş Bilgileri', // Sipariş Kodu
        '',                   // Sipariş ID
        '',                   // Sipariş Tarihi
        'Tedarikçi',          // Tedarikçi Kodu/ID
        '',                   // Tedarikçi Adı
        'Teslimat',           // Beklenen
        '',                   // Gerçekleşen
        'Teslimat Durumu',    // Özet
        'Özet',               // Satır Sayısı
        '',                   // placeholder (align)
        'Sipariş Toplamı',    // Para Birimi
        ''                    // Toplam Tutar
      ]
      if (includeStatusCol) headerRow1Parts.push('')
      for (let i = 1; i <= maxItemCount; i++) {
        headerRow1Parts.push(`Satır ${i}`, '', '', '', '', '')
      }

      // Detail header (row 2)
      const headerRow2Parts = [
        'Sipariş Kodu',
        'Sipariş ID',
        'Sipariş Tarihi',
        'Tedarikçi Kodu/ID',
        'Tedarikçi Adı',
        'Beklenen Teslim Tarihi',
        'Gerçekleşen Teslim Tarihi',
        'Teslimat Durumu (Özet)',
        'Satır Sayısı',
        '',
        'Para Birimi',
        'Toplam Tutar'
      ]
      if (includeStatusCol) headerRow2Parts.push('Sipariş Durumu')
      for (let i = 1; i <= maxItemCount; i++) {
        headerRow2Parts.push(
          `Satır ${i} Malzeme ID`,
          `Satır ${i} Malzeme Adı`,
          `Satır ${i} Miktar`,
          `Satır ${i} Birim Fiyat`,
          `Satır ${i} Para Birimi`,
          `Satır ${i} Satır Tutar`
        )
      }

      // summarizeItems no longer used (dynamic columns below)

      const computeDeliverySummary = (order) => {
        // Reuse same quick logic from table
        const today = new Date()
        const deliveryDate = order.expectedDeliveryDate ? new Date(order.expectedDeliveryDate) : null
        let status = 'hesaplanıyor'
        let daysRemaining = 0
        if (deliveryDate && !isNaN(deliveryDate.getTime())) {
          const diff = deliveryDate.getTime() - today.getTime()
          daysRemaining = Math.ceil(diff / (1000 * 3600 * 24))
          if (order.orderStatus === 'Teslim Edildi') status = 'teslim-edildi'
          else if (daysRemaining < 0) status = 'gecikmiş'
          else if (daysRemaining === 0) status = 'bugün-teslim'
          else if (daysRemaining <= 7) status = 'bu-hafta-teslim'
          else status = 'zamanında'
        }
        switch (status) {
          case 'bugün-teslim': return 'Bugün Teslim'
          case 'bu-hafta-teslim': return `${daysRemaining} gün kaldı`
          case 'gecikmiş': return `${Math.abs(daysRemaining)} gün gecikti`
          case 'zamanında': return 'Zamanında'
          case 'erken': return 'Erken teslim'
          case 'teslim-edildi': return 'Teslim edildi'
          default: return 'Teslimat tarihi belirsiz'
        }
      }

      const rows = ordersSource.map(order => {
        const items = Array.isArray(order.items) ? order.items : []
        const orderDate = order.orderDate ? (order.orderDate instanceof Date ? order.orderDate : new Date(order.orderDate)) : null
        const expected = order.expectedDeliveryDate ? (order.expectedDeliveryDate instanceof Date ? order.expectedDeliveryDate : new Date(order.expectedDeliveryDate)) : null
        const actual = order.deliveryDate ? (order.deliveryDate instanceof Date ? order.deliveryDate : new Date(order.deliveryDate)) : null
        const currency = (order.currency || 'TRY')
        const total = Number(order.totalPrice || order.totalAmount || 0)

        const base = [
          order.orderCode || '',
          order.id || '',
          orderDate ? orderDate.toLocaleDateString(userLocale) : '',
          order.supplierId || order.supplierCode || '',
          order.supplierName || '',
          expected ? expected.toLocaleDateString(userLocale) : '',
          actual ? actual.toLocaleDateString(userLocale) : '',
          computeDeliverySummary(order),
          items.length,
          '',
          currency,
          total
        ]
        if (includeStatusCol) base.push(order.orderStatus || '')
        // Append per-line dynamic columns normalized to maxItemCount
        for (let i = 0; i < maxItemCount; i++) {
          const it = items[i]
          if (it) {
            const code = it.materialCode || it.itemCode || it.lineId || ''
            const name = it.materialName || ''
            const qty = it.quantity != null ? Number(it.quantity) : ''
            const unitPrice = it.unitPrice != null ? Number(it.unitPrice) : ''
            const lineCurrency = it.currency || currency || 'TRY'
            const lineTotal = (it.quantity != null && it.unitPrice != null)
              ? Number(it.quantity) * Number(it.unitPrice)
              : ''
            base.push(code, name, qty, unitPrice, lineCurrency, lineTotal)
          } else {
            base.push('', '', '', '', '', '')
          }
        }
        return base.map(escapeCSV).join(delimiter)
      })

      const headerRow1 = headerRow1Parts.map(escapeCSV).join(delimiter)
      const headerRow2 = headerRow2Parts.map(escapeCSV).join(delimiter)
      const csv = ['\uFEFF' + headerRow1, headerRow2, ...rows].join('\n') // UTF-8 BOM ile Excel uyumu
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const suffix = selectedOrderIds.size > 0 ? '-selected' : ''
      const tabName = activeOrdersTab === 'pending' ? 'pending' : activeOrdersTab === 'completed' ? 'completed' : 'all'
      a.href = url
      a.download = `orders-${tabName}${suffix}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('CSV export error:', err)
      alert('CSV dışa aktarma sırasında hata oluştu: ' + (err?.message || err))
    }
  }

  const handleToggleSelectAll = (ordersInView = [], checked) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev)
      const idsInView = ordersInView.map(o => o.id)
      if (checked) {
        idsInView.forEach(id => next.add(id))
      } else {
        idsInView.forEach(id => next.delete(id))
      }
      return next
    })
  }

  // Stats API çağrısı
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setStatsLoading(true)
        
        const response = await fetchJsonWith401Retry('/api/orders/stats', { headers: withAuth({ 'Content-Type': 'application/json' }) })
        
        console.log('📊 Stats API response:', response.status, response.statusText)
        
        if (!response.ok) {
          console.warn('Stats API not available, using default values')
          return
        }
        
        const data = await response.json()
        console.log('📊 Stats data:', data)
        setStats(data.stats || stats)
      } catch (error) {
        console.error('Stats fetch error:', error)
      } finally {
        setStatsLoading(false)
      }
    }
    
    fetchStats()
  }, [])
  
  const updateOrder = async (orderId, updates) => {
    console.log('💾 UPDATE ORDER FUNCTION CALLED:')
    console.log('  - Order ID:', orderId)
    console.log('  - Updates:', JSON.stringify(updates, null, 2))
    
    try {
      const url = `/api/orders/${orderId}`
      console.log('📡 Making PUT request to:', url)
      
      const requestBody = JSON.stringify(updates)
      console.log('📤 Request body:', requestBody)
      
      const headers = withAuth({
        'Content-Type': 'application/json'
      })
      console.log('📤 Request headers:', headers)
      
      const response = await fetchWithTimeout(url, {
        method: 'PUT',
        headers: headers,
        body: requestBody
      })
      
      console.log('📥 Response received:')
      console.log('  - Status:', response.status)
      console.log('  - Status Text:', response.statusText)
      console.log('  - OK:', response.ok)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.log('❌ Response error text:', errorText)
        throw new Error(`API Error: ${response.status} - ${errorText}`)
      }
      
      const data = await response.json()
      console.log('📥 Response data:', data)
      return data.order || data
    } catch (error) {
      console.error('❌ Update order error:', error)
      throw error
    }
  }
  const actionLoading = false
  
  // Malzemeler için API state
  const [materials, setMaterials] = useState([])
  const [materialsLoading, setMaterialsLoading] = useState(true)
  const [materialsError, setMaterialsError] = useState(null)
  
  // Test: API endpoint'leri çalışıyor mu?
  useEffect(() => {
    const testEndpoints = async () => {
      console.log('🧪 Testing API endpoints...')
      
      try {
        // Test materials endpoint
        console.log('🧪 Testing /api/materials...')
        const materialsResponse = await fetchJsonWith401Retry('/api/materials', { headers: withAuth({ 'Content-Type': 'application/json' }) })
        console.log('📦 Materials response:', materialsResponse.status)
        if (materialsResponse.ok) {
          const materialsData = await materialsResponse.json()
          console.log('📦 Materials count:', materialsData.materials?.length || 0)
        }
        
        // Test orders endpoint  
        console.log('🧪 Testing /api/orders...')
        const ordersResponse = await fetchJsonWith401Retry('/api/orders', { headers: withAuth({ 'Content-Type': 'application/json' }) })
        console.log('📋 Orders response:', ordersResponse.status)
        if (ordersResponse.ok) {
          const ordersData = await ordersResponse.json()
          console.log('📋 Orders count:', ordersData.orders?.length || 0)
        }
        
        // Test stats endpoint
        console.log('🧪 Testing /api/orders/stats...')
        const statsResponse = await fetchJsonWith401Retry('/api/orders/stats', { headers: withAuth({ 'Content-Type': 'application/json' }) })
        console.log('📊 Stats response:', statsResponse.status)
        if (statsResponse.ok) {
          const statsData = await statsResponse.json()
          console.log('📊 Stats:', statsData.stats)
        }
        
      } catch (error) {
        console.error('🧪 API test error:', error)
      }
    }
    
    testEndpoints()
  }, [])

  // Malzemeleri API'den çek
  useEffect(() => {
    const fetchMaterials = async () => {
      try {
        setMaterialsLoading(true)
        
        // Tüm malzemeleri çek
        const response = await fetchWithTimeout('/api/materials', {
          headers: withAuth()
        })
        
        console.log('📡 Materials API response:', response.status, response.statusText)
        
        if (!response.ok) {
          if (response.status === 401) {
            setMaterials([])
            return
          }
          throw new Error(`API Error: ${response.status} - ${response.statusText}`)
        }
        
        const data = await response.json()
        console.log('📦 Materials data:', data)
        
        // Response'dan materials array'ini al (tümü, kategori filtreleme için)
        const allMaterials = Array.isArray(data) ? data : (data.materials || [])
        
        // Frontend format'ına çevir (TÜM malzemeler)
        const materialsWithCorrectFields = allMaterials.map(material => ({
          ...material,
          materialCode: material.code || material.materialCode,
          materialName: material.name || material.materialName
        }))
        
        setMaterials(materialsWithCorrectFields)
      } catch (error) {
        setMaterialsError(error.message)
        console.error('Materials fetch error:', error)
      } finally {
        setMaterialsLoading(false)
      }
    }
    
    fetchMaterials()
  }, [])

  // Tedarikçileri API'den çek
  const [suppliers, setSuppliers] = useState([])
  const [suppliersLoading, setSuppliersLoading] = useState(false)
  const [suppliersError, setSuppliersError] = useState(null)

  // Malzeme kategorilerini API'den çek
  const [materialCategories, setMaterialCategories] = useState([])
  const [categoriesLoading, setCategoriesLoading] = useState(false)
  const [categoriesError, setCategoriesError] = useState(null)

  useEffect(() => {
    const fetchSuppliers = async () => {
      try {
        setSuppliersLoading(true)
        
        const response = await fetchWithTimeout('/api/suppliers', {
          headers: withAuth()
        })
        
        console.log('📡 Suppliers API response:', response.status, response.statusText)
        
        if (!response.ok) {
          if (response.status === 401) {
            setSuppliers([])
            return
          }
          throw new Error(`API Error: ${response.status} - ${response.statusText}`)
        }
        
        const data = await response.json()
        console.log('🏢 Suppliers data:', data)
        
        // Response'dan suppliers array'ini al
        const allSuppliers = Array.isArray(data) ? data : (data.suppliers || [])
        
        // Frontend format'ına çevir
        const suppliersWithCorrectFields = allSuppliers.map(supplier => ({
          ...supplier,
          supplierCode: supplier.code || supplier.supplierCode,
          supplierName: supplier.name || supplier.companyName || supplier.supplierName
        }))
        
        setSuppliers(suppliersWithCorrectFields)
      } catch (error) {
        setSuppliersError(error.message)
        console.error('Suppliers fetch error:', error)
      } finally {
        setSuppliersLoading(false)
      }
    }
    
    fetchSuppliers()
  }, [])

  // Malzeme kategorilerini API'den çek
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setCategoriesLoading(true)
        
        const response = await fetchWithTimeout('/api/categories', {
          headers: withAuth()
        })
        
        console.log('📡 Categories API response:', response.status, response.statusText)
        
        if (!response.ok) {
          throw new Error(`API Error: ${response.status} - ${response.statusText}`)
        }
        
        const data = await response.json()
        console.log('🏷️ Categories data:', data)
        
        // Response'dan categories array'ini al
        const allCategories = Array.isArray(data) ? data : (data.categories || [])
        
        // Frontend format'ına çevir
        const categoriesWithCorrectFields = allCategories.map(category => ({
          ...category,
          categoryId: category.id || category.categoryId,
          categoryName: category.name || category.categoryName
        }))
        
        setMaterialCategories(categoriesWithCorrectFields)
      } catch (error) {
        setCategoriesError(error.message)
        console.error('Categories fetch error:', error)
      } finally {
        setCategoriesLoading(false)
      }
    }
    
    fetchCategories()
  }, [])
  
  // Orders hooks - Backend API kullanacağız
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [ordersError, setOrdersError] = useState(null)
  const [deliveryStatuses, setDeliveryStatuses] = useState({})
  const [deliveryLoading, setDeliveryLoading] = useState(false)
  const [materialNameMap, setMaterialNameMap] = useState({})
  
  // Orders API çağrısı - Basit test
  useEffect(() => {
    console.log('⚡️ Orders useEffect triggered!')
    
    const fetchOrders = async () => {
      try {
        console.log('🚀 Starting orders fetch... (REAL-TIME MODE)')
        setOrdersLoading(true)
        setOrdersError(null)
        
        // ✅ CACHE BUSTING: İlk load'da bile timestamp ekle
        const cacheBuster = Date.now()
        const url = `/api/orders?t=${cacheBuster}`
        console.log('🔥 INITIAL LOAD CACHE BUSTING URL:', url)
        
        const response = await fetchJsonWith401Retry(url, { 
          headers: withAuth({ 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }) 
        })
        console.log('� Response status:', response.status)
        console.log('📡 Response ok:', response.ok)
        console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()))
        
        if (!response.ok) {
          const errorText = await response.text()
          console.error('❌ Error response:', errorText)
          throw new Error(`Orders API Error: ${response.status} - ${errorText}`)
        }
        
        const data = await response.json()
        console.log('� Full response data:', data)
        console.log('� Orders array:', data.orders)
        console.log('� Orders count:', data.orders?.length || 0)
        
        setOrders(data.orders || [])
        console.log('✅ Orders state updated')
        
      } catch (error) {
        console.error('❌ Orders fetch error:', error)
        setOrdersError(error.message)
      } finally {
        setOrdersLoading(false)
        console.log('🏁 Orders fetch completed')
      }
    }
    
    fetchOrders()
  }, [])

  // Load material name map to ensure latest names reflect in order items
  useEffect(() => {
    let cancelled = false
    const buildMap = async () => {
      try {
        const list = await materialsService.getMaterials()
        if (cancelled) return
        const map = Object.create(null)
        for (const m of list) {
          if (m.code) map[m.code] = m.name || m.materialName || m.code
          if (m.id) map[m.id] = m.name || m.materialName || m.id
        }
        setMaterialNameMap(map)
      } catch (e) {
        // no-op
      }
    }
    buildMap()
    const onMaterialUpdated = () => buildMap()
    if (typeof window !== 'undefined') {
      window.addEventListener('materialUpdated', onMaterialUpdated)
    }
    return () => {
      cancelled = true
      if (typeof window !== 'undefined') {
        window.removeEventListener('materialUpdated', onMaterialUpdated)
      }
    }
  }, [])

  // ✅ SMART FOCUS REFRESH: Tab/pencere focus olduğunda refresh 
  useEffect(() => {
    const handleFocus = async () => {
      console.log('🔄 SMART REFRESH: Window focused - refreshing orders...')
      await refreshOrders()
    }
    
    const handleVisibilityChange = async () => {
      if (!document.hidden) {
        console.log('🔄 SMART REFRESH: Tab became visible - refreshing orders...')
        await refreshOrders()
      }
    }
    
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus)
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    }
  }, [])
  
  // Test: orders state'i değiştiğinde log
  useEffect(() => {
    console.log('🔥 ORDERS STATE CHANGED:', {
      ordersLength: orders.length,
      ordersLoading,
      ordersError,
      firstOrder: orders[0]
    })
  }, [orders, ordersLoading, ordersError])
  const refreshOrders = async () => {
    console.log('🔄 Refreshing orders... (REAL-TIME MODE)')
    try {
      setOrdersLoading(true)
      setOrdersError(null)
      
      // ✅ CACHE BUSTING: Timestamp ekleyerek browser cache'i bypass et
      const cacheBuster = Date.now()
      const url = `/api/orders?t=${cacheBuster}`
      console.log('🔥 CACHE BUSTING URL:', url)
      
      const response = await fetchJsonWith401Retry(url, { 
        headers: withAuth({ 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }) 
      })
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`)
      }
      
      const data = await response.json()
      setOrders(data.orders || [])
      console.log('✅ Orders refreshed')
    } catch (error) {
      console.error('❌ Orders refresh error:', error)
      setOrdersError(error.message)
    } finally {
      setOrdersLoading(false)
    }
  }
  
  const loadDeliveryStatuses = async () => {
    console.log('🚚 Loading delivery statuses...')
    // Load delivery statuses from API
  }

  // Materials Debug
  console.log('🔍 Materials API Debug:', {
    totalMaterials: materials.length,
    materialsLoading,
    materialsError,
    sampleMaterial: materials[0],
    allStatuses: [...new Set(materials.map(m => m.status))]
  });

  // Debug: State'leri logla
  useEffect(() => {
    console.log('🔍 Delivery state update:', {
      deliveryStatuses,
      deliveryLoading,
      statusCount: Object.keys(deliveryStatuses).length
    })
  }, [deliveryStatuses, deliveryLoading])

  // Debug: Orders state'ini logla
  useEffect(() => {
    console.log('📋 Orders state update:', {
      orders: orders.length,
      ordersLoading,
      ordersError,
      firstOrder: orders[0]?.id
    })
  }, [orders, ordersLoading, ordersError])

  // Aktif malzemeler - malzeme tipi filtresi için sadece aktif olanlar
  const activeMaterials = materials.filter(material => material.status === 'Aktif')
  
  console.log('🔍 Active Materials debug:', {
    totalActiveMaterials: activeMaterials.length,
    totalAllMaterials: materials.length,
    materialsLoading,
    sampleMaterial: activeMaterials[0],
    allCodes: activeMaterials.map(m => m.code).slice(0, 5) // İlk 5 code'u göster
  })

  // Teslimat durumlarını yükle - sadece bir kere
  useEffect(() => {
    if (orders.length > 0) {
      loadDeliveryStatuses()
    }
  }, [orders.length]) // loadDeliveryStatuses'u kaldırdık

  // Dropdown close handler like in MaterialsFilters
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.multi-select-container')) {
        document.querySelectorAll('.multi-select-dropdown').forEach(dropdown => {
          dropdown.style.display = 'none';
        });
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const ORDER_STATUS_OPTIONS = ['Onay Bekliyor', 'Onaylandı', 'Yolda', 'Teslim Edildi', 'İptal Edildi']
  const ITEM_STATUS_OPTIONS = ['Onay Bekliyor', 'Onaylandı', 'Yolda', 'Teslim Edildi', 'İptal Edildi']
  const [updatingItemIds, setUpdatingItemIds] = useState([])
  const [itemStatusUpdates, setItemStatusUpdates] = useState({}) // Optimistic updates for item statuses

  // ✅ SMART FILTER CHANGE: Critical filtreler değiştiğinde refresh tetikle
  const handleFilterChange = async (key, value) => {
    console.log('🔍 Order Filter değişti:', key, '=', value);
    setFilters(prev => ({ ...prev, [key]: value }));
    
    // Critical filter değişikliklerinde fresh data çek
    const criticalFilters = ['orderStatus', 'itemStatus', 'dateRange']
    if (criticalFilters.includes(key)) {
      console.log(`🔄 SMART REFRESH: Critical filter '${key}' changed - refreshing orders...`)
      await refreshOrders()
    }
  }

  // Check if filters are active
  const hasActiveFilters = () => {
    const hasPriceRange = !!(filters.priceRange.min || filters.priceRange.max);
    return !!(filters.search || filters.orderStatus || filters.itemStatus || filters.dateRange || filters.deliveryStatus || filters.materialType || filters.supplierType || filters.materialCategory || hasPriceRange);
  }

  // Apply filters to orders
  const applyFilters = (orders, materials) => {
    if (!orders) return [];

    return orders.filter(order => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matches = 
          (order.orderCode || order.id).toLowerCase().includes(searchLower) ||
          order.supplierName?.toLowerCase().includes(searchLower) ||
          order.supplierId?.toLowerCase().includes(searchLower);
        
        if (!matches) return false;
      }

      // Status filter
      if (filters.orderStatus && order.orderStatus !== filters.orderStatus) {
        return false;
      }

      // Item status filter
      if (filters.itemStatus) {
        const orderItems = Array.isArray(order.items) ? order.items : [];
        const hasMatchingItem = orderItems.some(item => item.itemStatus === filters.itemStatus);
        if (!hasMatchingItem) return false;
      }

      // Date range filter
      if (filters.dateRange && order.orderDate) {
        const orderDate = order.orderDate instanceof Date ? order.orderDate : new Date(order.orderDate);
        const now = new Date();
        
        switch (filters.dateRange) {
          case 'bugün':
            if (orderDate.toDateString() !== now.toDateString()) return false;
            break;
          case 'bu-hafta':
            const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
            if (orderDate < weekStart) return false;
            break;
          case 'bu-ay':
            if (orderDate.getMonth() !== now.getMonth() || orderDate.getFullYear() !== now.getFullYear()) return false;
            break;
          case 'son-3-ay':
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            if (orderDate < threeMonthsAgo) return false;
            break;
        }
      }

      // Price range filter
      if (filters.priceRange.min || filters.priceRange.max) {
        const min = parseFloat(filters.priceRange.min) || 0;
        const max = parseFloat(filters.priceRange.max) || Infinity;
        
        if (filters.priceRange.mode === 'order') {
          // Order total'a göre filtrele
          const orderTotal = Array.isArray(order.items) ? 
            order.items.reduce((sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0), 0) : 0;
          
          if (orderTotal < min || orderTotal > max) return false;
          
        } else if (filters.priceRange.mode === 'item') {
          // En az bir item'ın fiyatı aralıkta olmalı
          const orderItems = Array.isArray(order.items) ? order.items : [];
          const hasMatchingItem = orderItems.some(item => {
            const itemTotal = (item.quantity || 0) * (item.unitPrice || 0);
            return itemTotal >= min && itemTotal <= max;
          });
          
          if (!hasMatchingItem) return false;
        }
      }

      // Delivery status filter
      if (filters.deliveryStatus) {
        const deliveryStatus = deliveryStatuses[order.id];
        if (!deliveryStatus || deliveryStatus.status !== filters.deliveryStatus) {
          return false;
        }
      }

      // Material type filter
      if (filters.materialType) {
        const orderItems = Array.isArray(order.items) ? order.items : [];
        const hasMatchingMaterial = orderItems.some(item => 
          item.materialCode === filters.materialType || 
          item.materialName === filters.materialType
        );
        if (!hasMatchingMaterial) return false;
      }

      // Supplier type filter
      if (filters.supplierType) {
        const hasMatchingSupplier = 
          order.supplierCode === filters.supplierType ||
          order.supplierId === filters.supplierType;
        if (!hasMatchingSupplier) return false;
      }

      // Material category filter
      if (filters.materialCategory) {
        const orderItems = Array.isArray(order.items) ? order.items : [];
        const hasMatchingCategory = orderItems.some(item => {
          // Önce materialCode ile materials array'inde ilgili malzemeyi bul
          const material = materials.find(m => 
            (m.code === item.materialCode) || 
            (m.materialCode === item.materialCode) ||
            (m.code === item.materialName) ||
            (m.name === item.materialCode)
          );
          
          return material && material.category === filters.materialCategory;
        });
        if (!hasMatchingCategory) return false;
      }

      return true;
    });
  }

  const filteredOrders = applyFilters(orders, materials);

  // Basit order status based filtering - items'a bakmadan
  const pendingOrdersView = filteredOrders.filter(order => order.orderStatus !== 'Teslim Edildi');
  const completedOrdersView = filteredOrders.filter(order => order.orderStatus === 'Teslim Edildi');
  const allOrdersView = filteredOrders;

  const currentOrders = activeOrdersTab === 'pending' 
    ? pendingOrdersView 
    : activeOrdersTab === 'completed' 
      ? completedOrdersView 
      : allOrdersView;
  const currentLoading = ordersLoading;

  console.log('📊 Orders debug (simplified):', {
    totalOrders: orders.length,
    pendingOrders: orders.filter(o => o.orderStatus !== 'Teslim Edildi').length,
    completedOrders: orders.filter(o => o.orderStatus === 'Teslim Edildi').length,
    activeTab: activeOrdersTab,
    ordersLoading,
    sampleOrder: orders[0] ? {
      id: orders[0].id,
      orderStatus: orders[0].orderStatus,
      hasItems: Array.isArray(orders[0].items),
      itemsCount: orders[0].items?.length || 0
    } : 'No orders'
  });

  console.log('🎯 TABLE DEBUG - Passing to OrdersTable:', {
    ordersCount: orders.length,
    loading: currentLoading,
    variant: activeOrdersTab
  });

  const serializeItemsForOrder = (list = []) => (
    list.map(item => {
      const fallbackLineId = item.lineId || `${item.materialCode || item.itemCode || item.id}-${String(item.itemSequence || 1).padStart(2, '0')}`
      return {
        id: item.id,
        lineId: fallbackLineId,
        itemCode: item.itemCode,
        itemSequence: item.itemSequence,
        materialCode: item.materialCode,
        materialName: item.materialName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        itemStatus: item.itemStatus,
        expectedDeliveryDate: item.expectedDeliveryDate instanceof Date
          ? item.expectedDeliveryDate
          : (item.expectedDeliveryDate || null),
        actualDeliveryDate: item.actualDeliveryDate instanceof Date
          ? item.actualDeliveryDate
          : (item.actualDeliveryDate || null)
      }
    })
  )

  // Handle order click - Test için basitleştirildi
  const handleOrderClick = async (order) => {
    console.log('�🔥🔥 Sipariş tıklandı!!! Order:', order);
    console.log('🔥🔥🔥 Setting selectedOrder...');
    
    // Önce test için basit modal açalım
    setSelectedOrder(order)
    setSelectedOrderError(null)
    setSelectedOrderLoading(false)
    setUpdatingItemIds([])
    
    console.log('🔥🔥🔥 selectedOrder set edildi!');
  }

  const handleCloseOrderDetail = () => {
    setSelectedOrder(null)
    setSelectedOrderError(null)
    setSelectedOrderLoading(false)
    setUpdatingItemIds([])
  }

  // Handle order status update
  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    console.log('🔄 HANDLE UPDATE ORDER STATUS CALLED:')
    console.log('  - Order ID:', orderId)
    console.log('  - New Status:', newStatus)
    console.log('  - Type of orderId:', typeof orderId)
    console.log('  - Type of newStatus:', typeof newStatus)
    
    if (!newStatus) {
      console.log('❌ No newStatus provided - returning early')
      return;
    }
    
    if (!orderId) {
      console.log('❌ No orderId provided - returning early')
      return;
    }
    
    console.log('🔄 Proceeding with order status update...')
    
    try {
      // Reuse existing item-level status change logic for each item
      console.log('🔄 Bulk item status propagation via handleItemStatusChange for order:', orderId, '→', newStatus)

      // Determine items source
      let itemsSource = []
      if (selectedOrder && selectedOrder.id === orderId && Array.isArray(selectedOrder.items)) {
        itemsSource = selectedOrder.items
      } else {
        const orderInList = (orders || []).find(o => o.id === orderId)
        if (orderInList && Array.isArray(orderInList.items)) {
          itemsSource = orderInList.items
        } else {
          try {
            const resp = await fetchWithTimeout(`/api/orders/${orderId}`, { headers: withAuth() })
            if (resp.ok) {
              const data = await resp.json()
              const ord = data.order || data
              itemsSource = Array.isArray(ord.items) ? ord.items : []
            }
          } catch (e) {
            console.warn('⚠️ Failed to fetch order details for bulk item status change:', e?.message)
          }
        }
      }

      // Apply item-level status change for each item
      for (const it of (itemsSource || [])) {
        // Skip if already at desired status
        if ((it.itemStatus || 'Onay Bekliyor') === newStatus) continue
        try {
          await handleItemStatusChange(orderId, it, newStatus)
        } catch (e) {
          console.warn('⚠️ Item status change failed for', it.itemCode || it.id || it.lineId, e?.message)
        }
      }

      // Finalize order status to keep consistency (backend may already align it)
      console.log('📡 Finalizing order status to', newStatus, 'after item updates')
      const updatedOrder = await updateOrder(orderId, { orderStatus: newStatus })
      console.log('✅ updateOrder API call completed, result:', updatedOrder)

      // Update local state
      // 1) Optimistically update orders list to keep UI in sync immediately
      setOrders(prev => prev.map(o => {
        if (o.id !== orderId) return o;
        const baseItems = Array.isArray(o.items) ? o.items : [];
        const propagatedItems = baseItems.length > 0
          ? baseItems.map(it => ({
              ...it,
              itemStatus: newStatus,
              actualDeliveryDate: newStatus === 'Teslim Edildi' ? (it.actualDeliveryDate || new Date()) : null
            }))
          : baseItems;
        return { ...o, orderStatus: newStatus, items: propagatedItems };
      }))

      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(prev => {
          if (!prev) return prev;
          const baseItems = Array.isArray((updatedOrder && updatedOrder.items) || prev.items) 
            ? (updatedOrder.items || prev.items) 
            : [];
          const propagatedItems = baseItems.length > 0
            ? baseItems.map(it => ({
                ...it,
                itemStatus: newStatus,
                actualDeliveryDate: newStatus === 'Teslim Edildi' ? (it.actualDeliveryDate || new Date()) : null
              }))
            : baseItems;
          return { ...prev, orderStatus: newStatus, items: propagatedItems };
        })
      }
      
      await refreshOrders();

      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrderLoading(true);
        try {
          const response = await fetchWithTimeout(`/api/orders/${orderId}`, {
            headers: withAuth()
          })
          
          if (response.ok) {
            const data = await response.json()
            const refreshed = data.order || data
            setSelectedOrder(refreshed);
          }
        } catch (detailError) {
          console.error('❌ Detay güncellenirken hata:', detailError);
        } finally {
          setSelectedOrderLoading(false);
        }
      }

      console.log(`✅ Order ${orderId} status updated to ${newStatus}`);
    } catch (error) {
      console.error('❌ Error updating order status:', error);
      console.error('❌ Error details:', {
        orderId,
        newStatus,
        message: error.message,
        stack: error.stack
      });
      // Rollback optimistic update if needed
      setOrders(prev => prev.map(o => {
        if (o.id === orderId && selectedOrder && selectedOrder.id === orderId) {
          return { ...o, orderStatus: selectedOrder.orderStatus };
        }
        return o;
      }));
      
      alert(`Sipariş durumu güncellenemedi: ${error.message}`);
    }
  }

  const handleItemStatusChange = async (orderId, item, newStatus) => {
    console.log('🚀🚀🚀 HANDLE ITEM STATUS CHANGE FUNCTION CALLED!');
    console.log('🔍 Parameters received:', {
      orderId: orderId,
      item: item,
      newStatus: newStatus,
      itemCurrentStatus: item?.itemStatus
    });
    
    if (!newStatus || newStatus === item.itemStatus) {
      console.log('❌ Early return: no status change needed');
      return
    }

    // Item identifier - id, itemCode, lineId veya index-based
    const itemId = item.id || item.itemCode || item.lineId || `item-${item.materialCode || 'unknown'}`
    const itemKey = `${orderId}-${itemId}` // For optimistic updates
    
    // ✅ OPTIMISTIC UPDATE: Hemen UI'da değişikliği göster
    setItemStatusUpdates(prev => ({
      ...prev,
      [itemKey]: newStatus
    }))
    console.log('🎨 Optimistic update applied:', itemKey, '->', newStatus);
    
    console.log('🔍 Item status değişiyor:', {
      orderId,
      itemId: itemId,
      oldStatus: item.itemStatus,
      newStatus: newStatus,
      materialCode: item.materialCode,
      quantity: item.quantity,
      fullItem: item
    });

    console.log('🔍 DEBUG: API çağrısı detayları:', {
      url: `/api/orders/${orderId}/items/${itemId}`,
      method: 'PUT',
      body: { itemStatus: newStatus },
      fullUrl: window.location.origin + `/api/orders/${orderId}/items/${itemId}`,
      itemDetails: {
        itemId: itemId,
        itemCode: item.itemCode,
        lineId: item.lineId,
        id: item.id,
        materialCode: item.materialCode
      }
    });

    setUpdatingItemIds(prev => [...new Set([...prev, itemId])])

    try {
      // Directly call the stock update logic if becoming delivered
      const isBecomingDelivered = newStatus === 'Teslim Edildi' && item.itemStatus !== 'Teslim Edildi';
      
      console.log('🔍 DEBUG: Item status update check:', {
        newStatus: newStatus,
        oldStatus: item.itemStatus,
        isBecomingDelivered: isBecomingDelivered,
        materialCode: item.materialCode,
        quantity: item.quantity
      });

      // Backend API ile item status güncelle
      console.log('🚀 DEBUG: Making API call...')
      const response = await fetchWithTimeout(`/api/orders/${orderId}/items/${itemId}`, {
        method: 'PUT',
        headers: {
          ...withAuth(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ itemStatus: newStatus })
      })
      
      console.log('📡 DEBUG: API response:', response.status, response.statusText)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ DEBUG: API error response:', errorText)
        console.error('❌ DEBUG: Full response details:', {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          url: response.url
        })
        throw new Error(`API Error: ${response.status} - ${errorText}`)
      }
      
      const result = await response.json()
      console.log('✅ DEBUG: API success:', result)
      console.log('✅ DEBUG: Full API response analysis:', {
        item: result.item,
        orderStatus: result.orderStatus,
        orderStatusChanged: result.orderStatusChanged,
        message: result.message
      })

      // ✅ Backend'den dönen order status güncellemesi
      const updatedItem = result.item
      const backendOrderStatus = result.orderStatus
      const orderStatusChanged = result.orderStatusChanged
      
      console.log('🔍 DEBUG: Backend response analysis:', {
        orderStatusChanged,
        backendOrderStatus,
        currentOrderStatus: selectedOrder?.orderStatus,
        apiSuccess: true
      })

      // If item is delivered, update material stock via backend API
      if (isBecomingDelivered) {
        console.log('🚀 DEBUG: Starting stock update for delivered item:', {
          materialCode: item.materialCode,
          quantity: item.quantity,
          orderId: orderId,
          itemId: item.id
        });
        
        try {
          console.log('� DEBUG: Making API call to:', `/api/materials/${item.materialCode}/stock`);
          
          const response = await fetch(`/api/materials/${item.materialCode}/stock`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('bk_admin_token') || ''}`
            },
            body: JSON.stringify({
              quantity: item.quantity,
              operation: 'add',
              orderId: orderId,
              itemId: item.id,
              movementType: 'delivery',
              notes: `Sipariş kalemi teslimi: ${item.materialName} (${item.quantity} ${item.unit || 'adet'})`
            })
          });

          console.log('📡 DEBUG: API response status:', response.status);

          if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ DEBUG: API error response:', errorData);
            throw new Error(errorData.error || 'Stok güncellenemedi');
          }

          const result = await response.json();
          console.log('✅ DEBUG: API success response:', result);
          console.log(`✅ Stock updated via API for ${item.materialCode}: ${result.previousStock} → ${result.newStock}`);
          
          // Dispatch unified global stock update events
          // Primary: materialStockUpdated (used by useMaterials for instant local + force refresh)
          window.dispatchEvent(new CustomEvent('materialStockUpdated', {
            detail: {
              materialCode: item.materialCode,
              newStock: result.newStock,
              quantity: item.quantity,
              operation: 'add',
              context: 'orders-tab-item-delivery'
            }
          }));

          // Backward compatibility: stockUpdated (kept for existing listeners)
          window.dispatchEvent(new CustomEvent('stockUpdated', {
            detail: {
              materialCode: item.materialCode,
              previousStock: result.previousStock,
              newStock: result.newStock
            }
          }));
          
        } catch (stockError) {
          console.error('❌ DEBUG: Stock update error:', stockError);
        }
      }

      console.log('🔄 DEBUG: Starting order refresh...')
      
      // ✅ Backend'den order status değişikliği varsa local state'i güncelle
      if (orderStatusChanged && backendOrderStatus) {
        console.log(`🔄 SMART UPDATE: Backend order status changed to ${backendOrderStatus}`)
        
        // Orders listesini güncelle
        setOrders(prev => prev.map(o => 
          o.id === orderId ? { ...o, orderStatus: backendOrderStatus } : o
        ))
        
        // Selected order'ı da güncelle
        if (selectedOrder && selectedOrder.id === orderId) {
          setSelectedOrder(prev => prev ? { ...prev, orderStatus: backendOrderStatus } : prev)
        }
        
        console.log(`✅ Local state updated: Order ${orderId} status → ${backendOrderStatus}`)
      }
      
      await refreshOrders()
      console.log('✅ DEBUG: refreshOrders completed')

      // ✅ Sadece selectedOrder varsa ve aynı ID ise refresh et
      if (selectedOrder && selectedOrder.id === orderId) {
        console.log('� DEBUG: Updating selected order details...')
        setSelectedOrderLoading(true)
        try {
          const orderResponse = await fetchWithTimeout(`/api/orders/${orderId}?t=${Date.now()}`, {
            headers: withAuth()
          })
          
          if (orderResponse.ok) {
            const orderData = await orderResponse.json()
            const refreshed = orderData.order || orderData
            console.log('🔄 DEBUG: Order refreshed with status:', refreshed.orderStatus)
            setSelectedOrder(refreshed)
            
            // ✅ Clear optimistic update ONLY after selectedOrder is successfully updated
            setItemStatusUpdates(prev => {
              const updated = { ...prev }
              delete updated[itemKey]
              return updated
            })
          }
        } catch (detailError) {
          console.error('❌ Detay güncellenirken hata:', detailError)
        } finally {
          setSelectedOrderLoading(false)
        }
      } else {
        // ✅ If no selectedOrder to refresh, clear optimistic update immediately
        setItemStatusUpdates(prev => {
          const updated = { ...prev }
          delete updated[itemKey]
          return updated
        })
      }
    } catch (error) {
      console.error('❌ Error updating item status:', error)
      // ✅ ROLLBACK optimistic update on error
      setItemStatusUpdates(prev => {
        const updated = { ...prev }
        delete updated[itemKey]
        return updated
      })
      alert(`Item status güncellenemedi: ${error.message}`)
    } finally {
      setUpdatingItemIds(prev => prev.filter(id => id !== itemId))
    }
  }

  return (
    <div className="stocks-tab-content">
      <div className="materials-header-section">
        {!isFiltersExpanded && (
          <>
            <div className="materials-dashboard-container">
              <OrdersDashboard stats={stats} loading={statsLoading} />
            </div>
            <div className="materials-actions-container">
              <div className="materials-actions">
                <button 
                  type="button" 
                  className="add-material-btn"
                  onClick={() => {
                    console.log('🔥🔥🔥 Yeni Sipariş butonu tıklandı!');
                    setIsDeliveredRecordMode(false);
                    setIsAddOrderModalOpen(true);
                    console.log('🔥🔥🔥 Modal açılması için state güncellendi!');
                  }}
                  disabled={actionLoading}
                >
                  + Yeni Sipariş
                </button>
                <button
                  type="button"
                  className="add-material-btn"
                  title="Doğrudan sipariş kaydı oluştur"
                  onClick={() => {
                    console.log('⚡ Gerçekleşmiş Sipariş butonu tıklandı!');
                    setIsDeliveredRecordMode(true);
                    setIsAddOrderModalOpen(true);
                  }}
                  disabled={actionLoading}
                >
                  ⚡️ Doğrudan Ekle
                </button>
                <button 
                  type="button" 
                  className="csv-export-btn"
                  title="Siparişleri dışa aktar"
                  onClick={handleExportCSV}
                >
                  📊 CSV 
                </button>
              </div>
            </div>
          </>
        )}
        <div className="materials-filters-container">
          <OrdersFilters 
            filters={filters}
            onFilterChange={handleFilterChange}
            resultsCount={currentOrders.length}
            hasActiveFilters={hasActiveFilters()}
            isExpanded={isFiltersExpanded}
            onToggleExpanded={setIsFiltersExpanded}
            activeMaterials={activeMaterials}
            activeSuppliers={suppliers}
            materialCategories={materialCategories}
          />
        </div>
      </div>

      <OrdersTable 
        orders={currentOrders}
        loading={currentLoading}
        error={ordersError}
        variant={activeOrdersTab}
        tabCounts={{ 
          pending: pendingOrdersView.length, 
          completed: completedOrdersView.length,
          all: allOrdersView.length
        }}
        onChangeTab={handleTabChange}
        onOrderClick={handleOrderClick}
        onUpdateOrderStatus={handleUpdateOrderStatus}
        actionLoading={actionLoading}
        deliveryStatuses={deliveryStatuses}
        deliveryLoading={deliveryLoading}
        selectedOrderIds={selectedOrderIds}
        onToggleSelectOrder={handleToggleSelectOrder}
        onToggleSelectAll={handleToggleSelectAll}
        materialNameMap={materialNameMap}
        emptyMessage={
          activeOrdersTab === 'pending' 
            ? 'Bekleyen sipariş bulunamadı' 
            : activeOrdersTab === 'completed'
              ? 'Tamamlanan sipariş bulunamadı'
              : 'Sipariş bulunamadı'
        }
      />

      {/* Add Order Modal */}
      <AddOrderModal 
        isOpen={isAddOrderModalOpen}
        onClose={() => setIsAddOrderModalOpen(false)}
        deliveredRecordMode={isDeliveredRecordMode}
        onSave={async (newOrder) => {
          console.log('✅ New order created:', newOrder);
          console.log('🔄 IMMEDIATE REFRESH: Triggering aggressive refresh...');
          
          // ✅ IMMEDIATE REFRESH - Multiple attempts for real-time update
          await refreshOrders();
          
          // ✅ BACKUP REFRESH: 500ms sonra bir daha refresh (network gecikmeleri için)
          setTimeout(async () => {
            console.log('🔄 BACKUP REFRESH: Second refresh...');
            await refreshOrders();
          }, 500);
          
          // ✅ FINAL REFRESH: 1.5s sonra final refresh
          setTimeout(async () => {
            console.log('🔄 FINAL REFRESH: Third refresh...');
            await refreshOrders();
          }, 1500);
        }}
      />

      {/* TODO: Order Detail Modal */}
      {selectedOrder && (
        <div 
          onClick={handleCloseOrderDetail}
          style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
            background: 'white',
            padding: '0',
            borderRadius: '8px',
            maxWidth: '720px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'hidden',
            color: '#1f2937',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 10px 35px rgba(15, 23, 42, 0.25)'
          }}>
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>Sipariş Detayı</h3>
              </div>
              <button className="modal-close" onClick={handleCloseOrderDetail}>×</button>
            </div>

            <div style={{ padding: '16px 20px', background: '#f9fafb', maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ marginBottom: '16px', padding: '12px', background: '#fff', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>Sipariş Bilgileri</h3>
                {/* Sipariş Kodu + Durum seçimi (yan yana) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px', marginBottom: '8px' }}>
                  <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#6b7280', whiteSpace: 'nowrap', flex: '0 0 auto' }}>
                    {selectedOrder.orderCode || selectedOrder.id}
                  </p>
                  <select
                    value={selectedOrder.orderStatus || 'Onay Bekliyor'}
                    disabled={selectedOrderLoading || actionLoading}
                    onChange={(e) => handleUpdateOrderStatus(selectedOrder.id, e.target.value)}
                    style={{
                      padding: '6px 10px',
                      fontSize: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      background: '#fff',
                      minWidth: '120px',
                      maxWidth: '50%',
                      flex: '1 1 auto'
                    }}
                  >
                    {ORDER_STATUS_OPTIONS.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Tedarikçi</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', marginTop: '4px' }}>{selectedOrder.supplierName}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Oluşturulma Tarihi</div>
                    <div style={{ fontSize: '14px', marginTop: '4px' }}>
                      {selectedOrder.orderDate ? (new Date(selectedOrder.orderDate)).toLocaleDateString('tr-TR') : '-'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Toplam</div>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: '#059669', marginTop: '4px' }}>
                      {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: selectedOrder.currency || 'TRY' }).format(selectedOrder.totalAmount || 0)}
                    </div>
                  </div>
                  
                </div>
              </div>

              {/* Tarih ve Teslimat Zaman Çizelgesi */}
              <div style={{ marginBottom: '16px', padding: '12px', background: '#fff', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>Tarih Bilgileri</h3>
                <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    {/* Step 1 */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginRight: '24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#3b82f6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 600 }}>1</div>
                        <span style={{ marginLeft: '8px', fontSize: '14px', color: '#1f2937', fontWeight: 600 }}>Oluşturma</span>
                        <div style={{ width: '32px', height: '2px', background: '#e5e7eb', marginLeft: '16px' }}></div>
                      </div>
                      <div style={{ fontSize: '14px', marginTop: '8px' }}>{selectedOrder.orderDate ? (new Date(selectedOrder.orderDate)).toLocaleDateString('tr-TR') : '—'}</div>
                    </div>
                    {/* Step 2 */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginRight: '24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#e5e7eb', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 600 }}>2</div>
                        <span style={{ marginLeft: '8px', fontSize: '14px', color: '#6b7280', fontWeight: 400 }}>Tahmini Teslim</span>
                        <div style={{ width: '32px', height: '2px', background: '#e5e7eb', marginLeft: '16px' }}></div>
                      </div>
                      <div style={{ fontSize: '14px', marginTop: '8px' }}>{selectedOrder.expectedDeliveryDate ? (new Date(selectedOrder.expectedDeliveryDate)).toLocaleDateString('tr-TR') : '—'}</div>
                    </div>
                    {/* Step 3 */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginRight: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#e5e7eb', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 600 }}>3</div>
                        <span style={{ marginLeft: '8px', fontSize: '14px', color: '#6b7280', fontWeight: 400 }}>Teslim</span>
                      </div>
                      <div style={{ fontSize: '14px', marginTop: '8px' }}>{selectedOrder.deliveryDate ? (new Date(selectedOrder.deliveryDate)).toLocaleDateString('tr-TR') : '—'}</div>
                    </div>
                  </div>
                  {/* Right: Teslimat badge */}
                  <div style={{ marginLeft: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Teslimat</div>
                    <div style={{ marginTop: '4px' }}>
                      {(() => {
                        const today = new Date()
                        const deliveryDate = selectedOrder.expectedDeliveryDate ? new Date(selectedOrder.expectedDeliveryDate) : null
                        let status = 'hesaplanıyor'
                        let daysRemaining = 0
                        if (deliveryDate && !isNaN(deliveryDate.getTime())) {
                          const timeDiff = deliveryDate.getTime() - today.getTime()
                          daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24))
                          if (selectedOrder.orderStatus === 'Teslim Edildi') status = 'teslim-edildi'
                          else if (daysRemaining < 0) status = 'gecikmiş'
                          else if (daysRemaining === 0) status = 'bugün-teslim'
                          else if (daysRemaining <= 7) status = 'bu-hafta-teslim'
                          else status = 'zamanında'
                        }
                        return (
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 600,
                            backgroundColor: getDeliveryStatusColor(status).bg,
                            color: getDeliveryStatusColor(status).text
                          }}>
                            {getDeliveryStatusText(status, daysRemaining)}
                          </span>
                        )
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tedarikçi ve Not/Referans blokları */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                {/* Tedarikçi Kartı */}
                <div style={{ padding: '12px', background: '#fff', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#111827' }}>Tedarikçi</h3>
                    <button
                      type="button"
                      onClick={() => {
                        try { localStorage.setItem('bk_active_tab', 'suppliers'); } catch {}
                        const supplierId = selectedOrder.supplierId || selectedOrder.supplierCode || ''
                        const url = `materials.html#suppliers-tab&supplier-${encodeURIComponent(supplierId)}`
                        window.open(url, '_blank')
                      }}
                      style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', background: '#fff', fontSize: '12px', cursor: 'pointer' }}
                    >
                      Tedarikçi detayına git ↗
                    </button>
                  </div>
                  <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <span className="detail-label" style={{ fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>Tedarikçi ID/Kodu:</span>
                    <div style={{ flex: '1 1 0%' }}>{selectedOrder.supplierId || selectedOrder.supplierCode || '—'}</div>
                  </div>
                  <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <span className="detail-label" style={{ fontWeight: 600, fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>Tedarikçi Adı:</span>
                    <div style={{ flex: '1 1 0%', fontWeight: 600 }}>{selectedOrder.supplierName || '—'}</div>
                  </div>
                </div>
                {/* Not/Referans Kartı */}
                <div style={{ padding: '12px', background: '#fff', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600, color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>Not / Referans</h3>
                  <div style={{ fontSize: '13px', color: '#1f2937' }}>
                    {selectedOrder.notes || '—'}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '16px', padding: '12px', background: '#fff', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                  Sipariş Satırları ({selectedOrder.items?.length || selectedOrder.itemCount || 0})
                </h3>
                {selectedOrderLoading ? (
                  <p style={{ padding: '12px 0', color: '#6b7280' }}>Satırlar yükleniyor...</p>
                ) : selectedOrderError ? (
                  <p style={{ color: '#dc2626', padding: '12px 0' }}>Satırlar yüklenemedi: {selectedOrderError}</p>
                ) : (selectedOrder.items && selectedOrder.items.length > 0) ? (
                  <div style={{
                    display: 'inline-flex',
                    flexWrap: 'nowrap',
                    gap: '12px',
                    alignItems: 'flex-start',
                    whiteSpace: 'nowrap',
                    overflowX: 'auto',
                    maxWidth: '100%',
                    WebkitOverflowScrolling: 'touch'
                  }}>
                  {console.log('🔍 DEBUG: Rendering order items:', selectedOrder.items.length, 'items')}
                  {[...(selectedOrder.items || [])]
                    .sort((a, b) => (a.itemSequence || 0) - (b.itemSequence || 0))
                    .map((item, index) => {
                      const itemId = item.id || item.itemCode || item.lineId || `item-${item.materialCode || 'unknown'}`
                      const isItemUpdating = updatingItemIds.includes(itemId);
                      console.log('🔍 Rendering item:', {
                        itemId: itemId,
                        itemStatus: item.itemStatus,
                        materialCode: item.materialCode,
                        isUpdating: isItemUpdating
                      });
                      return (
                        <div
                          key={itemId}
                          style={{
                            display: 'inline-flex',
                            flexDirection: 'column',
                            flex: '0 0 auto',
                            border: '1px solid rgb(226, 232, 240)',
                            borderRadius: '8px',
                            background: 'rgb(255, 255, 255)',
                            padding: '6px 8px',
                            minWidth: 0,
                            width: 'fit-content',
                            maxWidth: '260px',
                            boxShadow: 'rgba(15, 23, 42, 0.05) 0px 1px 2px'
                          }}
                        >
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', marginBottom: '6px', gap: '6px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgb(29, 78, 216)' }}>
                              {item.itemCode || item.lineId || `item-${String(index + 1).padStart(2, '0')}`}
                            </span>
                            <span style={{ fontSize: '6px', fontWeight: 600, color: 'rgb(15, 23, 42)', background: 'rgb(226, 232, 240)', padding: '1px 6px', borderRadius: '999px', whiteSpace: 'nowrap' }}>
                              {(() => {
                                const itemKey = `${selectedOrder.id}-${item.id || item.itemCode || item.lineId || `item-${item.materialCode || 'unknown'}`}`
                                return itemStatusUpdates[itemKey] || item.itemStatus || 'Onay Bekliyor'
                              })()}
                            </span>
                            <select
                              value={(() => {
                                const itemKey = `${selectedOrder.id}-${item.id || item.itemCode || item.lineId || `item-${item.materialCode || 'unknown'}`}`
                                return itemStatusUpdates[itemKey] || item.itemStatus || 'Onay Bekliyor'
                              })()}
                              disabled={isItemUpdating}
                              onChange={(e) => {
                                console.log('�🔥🔥 DROPDOWN ITEM STATUS CHANGE TRIGGERED!');
                                console.log('�🔍 Item status değişiyor:', {
                                  itemId: item.id,
                                  itemLineId: item.lineId,
                                  itemCode: item.itemCode,
                                  oldStatus: item.itemStatus,
                                  newStatus: e.target.value,
                                  materialCode: item.materialCode,
                                  disabled: isItemUpdating,
                                  selectedOrderId: selectedOrder.id,
                                  fullItem: item
                                });
                                console.log('🔥🔥🔥 CALLING handleItemStatusChange...');
                                handleItemStatusChange(selectedOrder.id, item, e.target.value);
                              }}
                              style={{
                                padding: '2px 6px',
                                fontSize: '10px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                background: '#fff'
                              }}
                            >
                              {ITEM_STATUS_OPTIONS.map(status => (
                                <option key={status} value={status}>{status}</option>
                              ))}
                            </select>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '4px', fontSize: '11px', color: 'rgb(71, 85, 105)', alignItems: 'center' }}>
                            <div style={{ fontWeight: 600 }}>{item.materialCode || '—'}</div>
                            <div style={{ fontWeight: 500, color: 'rgb(17, 24, 39)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {item.materialName || '-'}
                            </div>
                            <div style={{ textAlign: 'right', fontWeight: 600 }}>
                              {item.quantity || 0} adet
                            </div>
                          </div>
                        </div>
                      )
                    })}
                </div>
              ) : (
                <p style={{ color: '#6b7280', fontStyle: 'italic' }}>Bu sipariş için kayıtlı kalem bulunamadı.</p>
              )}
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  )
}
