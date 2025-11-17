import React, { useState, useEffect, useRef } from 'react'

export default function OrdersFilters({ 
  filters, 
  onFilterChange, 
  hasActiveFilters,
  isExpanded,
  onToggleExpanded,
  activeMaterials = [],
  activeSuppliers = [],
  materialCategories = []
}) {
  const [openDropdown, setOpenDropdown] = useState(null)
  const dropdownRefs = useRef({})

  // Dropdown positioning and toggle
  const toggleDropdown = (dropdownName, event) => {
    event.stopPropagation()
    
    if (openDropdown === dropdownName) {
      setOpenDropdown(null)
    } else {
      setOpenDropdown(dropdownName)
      
      setTimeout(() => {
        const button = event.currentTarget
        const dropdown = dropdownRefs.current[dropdownName]
        if (dropdown && button) {
          const rect = button.getBoundingClientRect()
          dropdown.style.top = `${rect.bottom + window.scrollY + 4}px`
          dropdown.style.left = `${rect.left + window.scrollX}px`
        }
      }, 0)
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openDropdown && !event.target.closest('.multi-select-container')) {
        setOpenDropdown(null)
      }
    }

    const handleScroll = () => {
      if (openDropdown) {
        setOpenDropdown(null)
      }
    }

    document.addEventListener('click', handleClickOutside)
    window.addEventListener('scroll', handleScroll, true)
    
    return () => {
      document.removeEventListener('click', handleClickOutside)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [openDropdown])

  // Clear all filters
  const clearAllFilters = () => {
    onFilterChange('search', '')
    onFilterChange('orderStatus', '')
    onFilterChange('itemStatus', '')
    onFilterChange('dateRange', '')
    onFilterChange('deliveryStatus', '')
    onFilterChange('materialType', '')
    onFilterChange('supplierType', '')
    onFilterChange('materialCategory', '')
    onFilterChange('priceRange', { min: '', max: '', mode: 'order' })
  }

  const getDateRangeLabel = () => {
    const dateMap = {
      'bugün': 'Bugün',
      'bu-hafta': 'Bu Hafta', 
      'bu-ay': 'Bu Ay',
      'son-3-ay': 'Son 3 Ay'
    }
    return filters.dateRange ? dateMap[filters.dateRange] : 'Tarih'
  }

  const getDeliveryStatusLabel = () => {
    const statusMap = {
      'hesaplanıyor': 'Teslimat belirsiz',
      'bugün-teslim': 'Bugün teslim',
      'bu-hafta-teslim': 'Bu hafta',
      'gecikmiş': 'Gecikmiş',
      'zamanında': 'Zamanında',
      'erken': 'Erken'
    }
    return filters.deliveryStatus ? statusMap[filters.deliveryStatus] : 'Teslimat'
  }

  return (
    <div className="mes-filter-controls" style={{ position: 'relative' }}>
      {/* Expand/Collapse Button */}
      <button
        type="button"
        className="mes-filter-button is-compact"
        onClick={() => onToggleExpanded(!isExpanded)}
        title={isExpanded ? 'Daralt' : 'Genişlet'}
        style={{ minWidth: '32px', padding: '0 8px' }}
      >
        <span>{isExpanded ? '»' : '«'}</span>
      </button>

      {/* Search Input */}
      <input
        type="text"
        className="mes-filter-input is-compact"
        placeholder="Sipariş numarası veya tedarikçi ara..."
        value={filters.search || ''}
        onChange={(e) => onFilterChange('search', e.target.value)}
      />

      {/* Sipariş Durumu */}
      <div className="multi-select-container">
        <button
          type="button"
          className={`mes-filter-button is-compact ${filters.orderStatus ? 'is-active' : ''}`}
          onClick={(e) => toggleDropdown('orderStatus', e)}
        >
          <span>{filters.orderStatus || 'Sipariş Durumu'}</span>
          <span className="mes-filter-caret">▾</span>
        </button>
        {openDropdown === 'orderStatus' && (
          <div 
            ref={el => dropdownRefs.current.orderStatus = el}
            className="multi-select-dropdown"
          >
            <div className="mes-filter-panel-header">
              <button
                type="button"
                className="mes-filter-panel-clear"
                onClick={() => onFilterChange('orderStatus', '')}
              >
                <span>Temizle</span>
              </button>
              <button
                type="button"
                className="mes-filter-panel-close"
                onClick={() => setOpenDropdown(null)}
              >
                <span>Kapat</span>
              </button>
            </div>
            <div className="mes-filter-panel-content">
              {['Onay Bekliyor', 'Onaylandı', 'Yolda', 'Teslim Edildi', 'İptal Edildi'].map(status => (
                <label key={status}>
                  <input
                    type="radio"
                    name="orderStatus"
                    checked={filters.orderStatus === status}
                    onChange={() => {
                      onFilterChange('orderStatus', status)
                      setOpenDropdown(null)
                    }}
                  />
                  <span>{status}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Satır Durumu */}
      <div className="multi-select-container">
        <button
          type="button"
          className={`mes-filter-button is-compact ${filters.itemStatus ? 'is-active' : ''}`}
          onClick={(e) => toggleDropdown('itemStatus', e)}
        >
          <span>{filters.itemStatus || 'Satır Durumu'}</span>
          <span className="mes-filter-caret">▾</span>
        </button>
        {openDropdown === 'itemStatus' && (
          <div 
            ref={el => dropdownRefs.current.itemStatus = el}
            className="multi-select-dropdown"
          >
            <div className="mes-filter-panel-header">
              <button
                type="button"
                className="mes-filter-panel-clear"
                onClick={() => onFilterChange('itemStatus', '')}
              >
                <span>Temizle</span>
              </button>
              <button
                type="button"
                className="mes-filter-panel-close"
                onClick={() => setOpenDropdown(null)}
              >
                <span>Kapat</span>
              </button>
            </div>
            <div className="mes-filter-panel-content">
              {['Onay Bekliyor', 'Onaylandı', 'Yolda', 'Teslim Edildi', 'İptal Edildi'].map(status => (
                <label key={status}>
                  <input
                    type="radio"
                    name="itemStatus"
                    checked={filters.itemStatus === status}
                    onChange={() => {
                      onFilterChange('itemStatus', status)
                      setOpenDropdown(null)
                    }}
                  />
                  <span>{status}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tarih Filtresi */}
      <div className="multi-select-container">
        <button
          type="button"
          className={`mes-filter-button is-compact ${filters.dateRange ? 'is-active' : ''}`}
          onClick={(e) => toggleDropdown('dateRange', e)}
        >
          <span>{getDateRangeLabel()}</span>
          <span className="mes-filter-caret">▾</span>
        </button>
        {openDropdown === 'dateRange' && (
          <div 
            ref={el => dropdownRefs.current.dateRange = el}
            className="multi-select-dropdown"
          >
            <div className="mes-filter-panel-header">
              <button
                type="button"
                className="mes-filter-panel-clear"
                onClick={() => onFilterChange('dateRange', '')}
              >
                <span>Temizle</span>
              </button>
              <button
                type="button"
                className="mes-filter-panel-close"
                onClick={() => setOpenDropdown(null)}
              >
                <span>Kapat</span>
              </button>
            </div>
            <div className="mes-filter-panel-content">
              {[
                { value: 'bugün', label: 'Bugün' },
                { value: 'bu-hafta', label: 'Bu Hafta' },
                { value: 'bu-ay', label: 'Bu Ay' },
                { value: 'son-3-ay', label: 'Son 3 Ay' }
              ].map(({ value, label }) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="dateRange"
                    checked={filters.dateRange === value}
                    onChange={() => {
                      onFilterChange('dateRange', value)
                      setOpenDropdown(null)
                    }}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Malzeme Tipi - only if expanded */}
      {isExpanded && activeMaterials.length > 0 && (
        <div className="multi-select-container">
          <button
            type="button"
            className={`mes-filter-button is-compact ${filters.materialType ? 'is-active' : ''}`}
            onClick={(e) => toggleDropdown('materialType', e)}
          >
            <span>Malzeme</span>
            <span className="mes-filter-caret">▾</span>
            {filters.materialType && <span className="mes-filter-count">1</span>}
          </button>
          {openDropdown === 'materialType' && (
            <div 
              ref={el => dropdownRefs.current.materialType = el}
              className="multi-select-dropdown"
              style={{ minWidth: '280px' }}
            >
              <div className="mes-filter-panel-header">
                <button
                  type="button"
                  className="mes-filter-panel-clear"
                  onClick={() => onFilterChange('materialType', '')}
                >
                  <span>Temizle</span>
                </button>
                <button
                  type="button"
                  className="mes-filter-panel-close"
                  onClick={() => setOpenDropdown(null)}
                >
                  <span>Kapat</span>
                </button>
              </div>
              <div className="mes-filter-panel-content" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {activeMaterials.map(material => (
                  <label key={material.materialCode}>
                    <input
                      type="radio"
                      name="materialType"
                      checked={filters.materialType === material.materialCode}
                      onChange={() => {
                        onFilterChange('materialType', material.materialCode)
                        setOpenDropdown(null)
                      }}
                    />
                    <span style={{ fontSize: '11px' }}>{material.materialCode} - {material.materialName}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tedarikçi - only if expanded */}
      {isExpanded && activeSuppliers.length > 0 && (
        <div className="multi-select-container">
          <button
            type="button"
            className={`mes-filter-button is-compact ${filters.supplierType ? 'is-active' : ''}`}
            onClick={(e) => toggleDropdown('supplierType', e)}
          >
            <span>Tedarikçi</span>
            <span className="mes-filter-caret">▾</span>
            {filters.supplierType && <span className="mes-filter-count">1</span>}
          </button>
          {openDropdown === 'supplierType' && (
            <div 
              ref={el => dropdownRefs.current.supplierType = el}
              className="multi-select-dropdown"
              style={{ minWidth: '280px' }}
            >
              <div className="mes-filter-panel-header">
                <button
                  type="button"
                  className="mes-filter-panel-clear"
                  onClick={() => onFilterChange('supplierType', '')}
                >
                  <span>Temizle</span>
                </button>
                <button
                  type="button"
                  className="mes-filter-panel-close"
                  onClick={() => setOpenDropdown(null)}
                >
                  <span>Kapat</span>
                </button>
              </div>
              <div className="mes-filter-panel-content" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {activeSuppliers.map(supplier => (
                  <label key={supplier.supplierCode}>
                    <input
                      type="radio"
                      name="supplierType"
                      checked={filters.supplierType === supplier.supplierCode}
                      onChange={() => {
                        onFilterChange('supplierType', supplier.supplierCode)
                        setOpenDropdown(null)
                      }}
                    />
                    <span style={{ fontSize: '11px' }}>{supplier.supplierCode} - {supplier.supplierName}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Teslimat Durumu - only if expanded */}
      {isExpanded && (
        <div className="multi-select-container">
          <button
            type="button"
            className={`mes-filter-button is-compact ${filters.deliveryStatus ? 'is-active' : ''}`}
            onClick={(e) => toggleDropdown('deliveryStatus', e)}
          >
            <span>{getDeliveryStatusLabel()}</span>
            <span className="mes-filter-caret">▾</span>
          </button>
          {openDropdown === 'deliveryStatus' && (
            <div 
              ref={el => dropdownRefs.current.deliveryStatus = el}
              className="multi-select-dropdown"
            >
              <div className="mes-filter-panel-header">
                <button
                  type="button"
                  className="mes-filter-panel-clear"
                  onClick={() => onFilterChange('deliveryStatus', '')}
                >
                  <span>Temizle</span>
                </button>
                <button
                  type="button"
                  className="mes-filter-panel-close"
                  onClick={() => setOpenDropdown(null)}
                >
                  <span>Kapat</span>
                </button>
              </div>
              <div className="mes-filter-panel-content">
                {[
                  { value: 'hesaplanıyor', label: 'Teslimat belirsiz' },
                  { value: 'bugün-teslim', label: 'Bugün teslim' },
                  { value: 'bu-hafta-teslim', label: 'Bu hafta teslim' },
                  { value: 'gecikmiş', label: 'Gecikmiş' },
                  { value: 'zamanında', label: 'Zamanında' },
                  { value: 'erken', label: 'Erken teslim' }
                ].map(({ value, label }) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="deliveryStatus"
                      checked={filters.deliveryStatus === value}
                      onChange={() => {
                        onFilterChange('deliveryStatus', value)
                        setOpenDropdown(null)
                      }}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Price Range - only if expanded */}
      {isExpanded && (
        <div className="multi-select-container">
          <button
            type="button"
            className={`mes-filter-button is-compact ${(filters.priceRange.min || filters.priceRange.max) ? 'is-active' : ''}`}
            onClick={(e) => toggleDropdown('priceRange', e)}
          >
            <span>Tutar Aralığı</span>
            <span className="mes-filter-caret">▾</span>
          </button>
          {openDropdown === 'priceRange' && (
            <div 
              ref={el => dropdownRefs.current.priceRange = el}
              className="multi-select-dropdown"
              style={{ minWidth: '220px' }}
            >
              <div className="mes-filter-panel-header">
                <button
                  type="button"
                  className="mes-filter-panel-clear"
                  onClick={() => onFilterChange('priceRange', { min: '', max: '', mode: 'order' })}
                >
                  <span>Temizle</span>
                </button>
                <button
                  type="button"
                  className="mes-filter-panel-close"
                  onClick={() => setOpenDropdown(null)}
                >
                  <span>Kapat</span>
                </button>
              </div>
              <div className="mes-filter-panel-content" style={{ padding: '12px' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="number"
                    placeholder="Min"
                    value={filters.priceRange.min}
                    onChange={(e) => {
                      const newPriceRange = { ...filters.priceRange, min: e.target.value }
                      onFilterChange('priceRange', newPriceRange)
                    }}
                    className="mes-filter-input is-compact"
                    style={{ flex: 1 }}
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    value={filters.priceRange.max}
                    onChange={(e) => {
                      const newPriceRange = { ...filters.priceRange, max: e.target.value }
                      onFilterChange('priceRange', newPriceRange)
                    }}
                    className="mes-filter-input is-compact"
                    style={{ flex: 1 }}
                  />
                </div>
                <button
                  type="button"
                  className="mes-filter-button is-compact"
                  onClick={() => {
                    const newMode = filters.priceRange.mode === 'order' ? 'item' : 'order'
                    const newPriceRange = { ...filters.priceRange, mode: newMode }
                    onFilterChange('priceRange', newPriceRange)
                  }}
                  style={{ width: '100%' }}
                >
                  <span>{filters.priceRange.mode === 'order' ? 'Sipariş Bazlı' : 'Ürün Bazlı'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Clear All Filters Button */}
      {hasActiveFilters && (
        <button
          type="button"
          className="mes-filter-clear is-compact"
          onClick={clearAllFilters}
        >
          <span>Filtreleri Temizle</span>
        </button>
      )}
    </div>
  )
}
