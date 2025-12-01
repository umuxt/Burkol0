import React, { useEffect } from 'react'

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
  // Dropdown positioning and toggle
  const toggleDropdown = (dropdownName, event) => {
    event.stopPropagation()
    
    const dropdown = document.getElementById(`${dropdownName}-dropdown`)
    const header = event.currentTarget
    
    if (dropdown) {
      const isVisible = !dropdown.classList.contains('d-none')
      // Close all other dropdowns first
      document.querySelectorAll('.multi-select-dropdown').forEach(d => {
        d.classList.add('d-none')
      })
      // Toggle this dropdown
      if (!isVisible) {
        // Position dropdown below the button
        const rect = header.getBoundingClientRect()
        dropdown.style.position = 'fixed'
        dropdown.style.top = `${rect.bottom + 6}px`
        
        // Check if dropdown would go off right edge of screen
        const dropdownWidth = 240 // default width from CSS
        const spaceOnRight = window.innerWidth - rect.left
        
        if (spaceOnRight < dropdownWidth) {
          // Align to right edge of button instead
          dropdown.style.left = 'auto'
          dropdown.style.right = `${window.innerWidth - rect.right}px`
        } else {
          dropdown.style.left = `${rect.left}px`
          dropdown.style.right = 'auto'
        }
        
        dropdown.classList.remove('d-none')
      } else {
        dropdown.classList.add('d-none')
      }
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.multi-select-container')) {
        document.querySelectorAll('.multi-select-dropdown').forEach(d => {
          d.classList.add('d-none')
        })
      }
    }

    const handleScroll = () => {
      document.querySelectorAll('.multi-select-dropdown').forEach(d => {
        d.classList.add('d-none')
      })
    }

    document.addEventListener('click', handleClickOutside)
    window.addEventListener('scroll', handleScroll, true)
    
    return () => {
      document.removeEventListener('click', handleClickOutside)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [])

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
    <div className="mes-filter-controls pos-relative">
      {/* Expand/Collapse Button */}
      <button
        type="button"
        className="mes-filter-button is-compact btn-expand-collapse"
        onClick={() => onToggleExpanded(!isExpanded)}
        title={isExpanded ? 'Daralt' : 'Genişlet'}
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
          className={`mes-filter-button is-compact ${filters.orderStatus?.length > 0 ? 'is-active' : ''}`}
          onClick={(e) => toggleDropdown('orderStatus', e)}
        >
          <span>Sipariş Durumu</span>
          <span className="mes-filter-caret">▾</span>
          {filters.orderStatus?.length > 0 && <span className="mes-filter-count">{filters.orderStatus.length}</span>}
        </button>
        <div 
          id="orderStatus-dropdown"
          className="multi-select-dropdown d-none"
        >
          <div className="mes-filter-panel-header">
            <button
              type="button"
              className="mes-filter-panel-button"
              onClick={() => onFilterChange('orderStatus', [])}
            >
              <span>Temizle</span>
            </button>
            <button
              type="button"
              className="mes-filter-panel-button"
              onClick={(e) => {
                e.stopPropagation()
                document.getElementById('orderStatus-dropdown').classList.add('d-none')
              }}
            >
              <span>Kapat</span>
            </button>
          </div>
          <div className="mes-filter-panel-content">
            {['Onay Bekliyor', 'Onaylandı', 'Yolda', 'Teslim Edildi', 'İptal Edildi'].map(status => (
              <label key={status}>
                <input
                  type="checkbox"
                  checked={filters.orderStatus?.includes(status) || false}
                  onChange={() => {
                    const current = filters.orderStatus || []
                    const newValue = current.includes(status)
                      ? current.filter(s => s !== status)
                      : [...current, status]
                    onFilterChange('orderStatus', newValue)
                  }}
                />
                <span className="flex-1-0">{status}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Satır Durumu */}
      <div className="multi-select-container">
        <button
          type="button"
          className={`mes-filter-button is-compact ${filters.itemStatus?.length > 0 ? 'is-active' : ''}`}
          onClick={(e) => toggleDropdown('itemStatus', e)}
        >
          <span>Satır Durumu</span>
          <span className="mes-filter-caret">▾</span>
          {filters.itemStatus?.length > 0 && <span className="mes-filter-count">{filters.itemStatus.length}</span>}
        </button>
        <div 
          id="itemStatus-dropdown"
          className="multi-select-dropdown d-none"
        >
          <div className="mes-filter-panel-header">
            <button
              type="button"
              className="mes-filter-panel-button"
              onClick={() => onFilterChange('itemStatus', [])}
            >
              <span>Temizle</span>
            </button>
            <button
              type="button"
              className="mes-filter-panel-button"
              onClick={(e) => {
                e.stopPropagation()
                document.getElementById('itemStatus-dropdown').classList.add('d-none')
              }}
            >
              <span>Kapat</span>
            </button>
          </div>
          <div className="mes-filter-panel-content">
            {['Onay Bekliyor', 'Onaylandı', 'Yolda', 'Teslim Edildi', 'İptal Edildi'].map(status => (
              <label key={status}>
                <input
                  type="checkbox"
                  checked={filters.itemStatus?.includes(status) || false}
                  onChange={() => {
                    const current = filters.itemStatus || []
                    const newValue = current.includes(status)
                      ? current.filter(s => s !== status)
                      : [...current, status]
                    onFilterChange('itemStatus', newValue)
                  }}
                />
                <span className="flex-1-0">{status}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Tarih Filtresi */}
      <div className="multi-select-container">
        <button
          type="button"
          className={`mes-filter-button is-compact ${filters.dateRange?.length > 0 ? 'is-active' : ''}`}
          onClick={(e) => toggleDropdown('dateRange', e)}
        >
          <span>Tarih</span>
          <span className="mes-filter-caret">▾</span>
          {filters.dateRange?.length > 0 && <span className="mes-filter-count">{filters.dateRange.length}</span>}
        </button>
        <div 
          id="dateRange-dropdown"
          className="multi-select-dropdown dropdown-hidden-auto"
        >
          <div className="mes-filter-panel-header">
            <button
              type="button"
              className="mes-filter-panel-button"
              onClick={() => onFilterChange('dateRange', [])}
            >
              <span>Temizle</span>
            </button>
            <button
              type="button"
              className="mes-filter-panel-button"
              onClick={(e) => {
                e.stopPropagation()
                document.getElementById('dateRange-dropdown').classList.add('d-none')
              }}
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
                  type="checkbox"
                  checked={filters.dateRange?.includes(value) || false}
                  onChange={() => {
                    const current = filters.dateRange || []
                    const newValue = current.includes(value)
                      ? current.filter(d => d !== value)
                      : [...current, value]
                    onFilterChange('dateRange', newValue)
                    // Clear custom date range when preset is selected
                    if (!current.includes(value)) {
                      onFilterChange('customDateRange', { startDate: '', endDate: '' })
                    }
                  }}
                />
                <span className="flex-1-0">{label}</span>
              </label>
            ))}
            <div className="dropdown-add-new">
              <div className="form-label-sm">Tarih Aralığı</div>
              <div className="flex-gap-8-mb-4">
                <input
                  type="date"
                  placeholder="Başlangıç"
                  value={filters.customDateRange?.startDate || ''}
                  onChange={(e) => {
                    const newRange = { ...filters.customDateRange, startDate: e.target.value }
                    onFilterChange('customDateRange', newRange)
                    // Clear preset date ranges when custom date is selected
                    if (e.target.value) {
                      onFilterChange('dateRange', [])
                    }
                  }}
                  className="mes-filter-input is-compact flex-1-xs"
                />
                <input
                  type="date"
                  placeholder="Bitiş"
                  value={filters.customDateRange?.endDate || ''}
                  onChange={(e) => {
                    const newRange = { ...filters.customDateRange, endDate: e.target.value }
                    onFilterChange('customDateRange', newRange)
                    // Clear preset date ranges when custom date is selected
                    if (e.target.value) {
                      onFilterChange('dateRange', [])
                    }
                  }}
                  className="mes-filter-input is-compact flex-1-xs"
                />
              </div>
            </div>
          </div>
        </div>
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
            {filters.materialType?.length > 0 && <span className="mes-filter-count">{filters.materialType.length}</span>}
          </button>
          <div 
            id="materialType-dropdown"
            className="multi-select-dropdown dropdown-hidden"
          >
            <div className="mes-filter-panel-header">
              <button
                type="button"
                className="mes-filter-panel-button"
                onClick={() => onFilterChange('materialType', [])}
              >
                <span>Temizle</span>
              </button>
              <button
                type="button"
                className="mes-filter-panel-button"
                onClick={(e) => {
                  e.stopPropagation()
                  document.getElementById('materialType-dropdown').classList.add('d-none')
                }}
              >
                <span>Kapat</span>
              </button>
            </div>
            <div className="mes-filter-panel-content scroll-container">
              {activeMaterials.map(material => (
                <label key={material.materialCode}>
                  <input
                    type="checkbox"
                    checked={filters.materialType?.includes(material.materialCode) || false}
                    onChange={() => {
                      const current = filters.materialType || []
                      const newValue = current.includes(material.materialCode)
                        ? current.filter(m => m !== material.materialCode)
                        : [...current, material.materialCode]
                      onFilterChange('materialType', newValue)
                    }}
                  />
                  <span className="flex-1-0-xs">{material.materialCode} - {material.materialName}</span>
                </label>
              ))}
            </div>
          </div>
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
            {filters.supplierType?.length > 0 && <span className="mes-filter-count">{filters.supplierType.length}</span>}
          </button>
          <div 
            id="supplierType-dropdown"
            className="multi-select-dropdown dropdown-hidden"
          >
            <div className="mes-filter-panel-header">
              <button
                type="button"
                className="mes-filter-panel-button"
                onClick={() => onFilterChange('supplierType', [])}
              >
                <span>Temizle</span>
              </button>
              <button
                type="button"
                className="mes-filter-panel-button"
                onClick={(e) => {
                  e.stopPropagation()
                  document.getElementById('supplierType-dropdown').classList.add('d-none')
                }}
              >
                <span>Kapat</span>
              </button>
            </div>
            <div className="mes-filter-panel-content scroll-container">
              {activeSuppliers.map(supplier => (
                <label key={supplier.supplierCode}>
                  <input
                    type="checkbox"
                    checked={filters.supplierType?.includes(supplier.supplierCode) || false}
                    onChange={() => {
                      const current = filters.supplierType || []
                      const newValue = current.includes(supplier.supplierCode)
                        ? current.filter(s => s !== supplier.supplierCode)
                        : [...current, supplier.supplierCode]
                      onFilterChange('supplierType', newValue)
                    }}
                  />
                  <span className="flex-1-0-xs">{supplier.supplierCode} - {supplier.supplierName}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Teslimat Durumu - only if expanded */}
      {isExpanded && (
        <div className="multi-select-container">
          <button
            type="button"
            className={`mes-filter-button is-compact ${filters.deliveryStatus?.length > 0 ? 'is-active' : ''}`}
            onClick={(e) => toggleDropdown('deliveryStatus', e)}
          >
            <span>Teslimat</span>
            <span className="mes-filter-caret">▾</span>
            {filters.deliveryStatus?.length > 0 && <span className="mes-filter-count">{filters.deliveryStatus.length}</span>}
          </button>
          <div 
            id="deliveryStatus-dropdown"
            className="multi-select-dropdown dropdown-hidden-auto"
          >
            <div className="mes-filter-panel-header">
              <button
                type="button"
                className="mes-filter-panel-button"
                onClick={() => onFilterChange('deliveryStatus', [])}
              >
                <span>Temizle</span>
              </button>
              <button
                type="button"
                className="mes-filter-panel-button"
                onClick={(e) => {
                  e.stopPropagation()
                  document.getElementById('deliveryStatus-dropdown').classList.add('d-none')
                }}
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
                    type="checkbox"
                    checked={filters.deliveryStatus?.includes(value) || false}
                    onChange={() => {
                      const current = filters.deliveryStatus || []
                      const newValue = current.includes(value)
                        ? current.filter(d => d !== value)
                        : [...current, value]
                      onFilterChange('deliveryStatus', newValue)
                      // Clear custom delivery date range when preset is selected
                      if (!current.includes(value)) {
                        onFilterChange('customDeliveryDateRange', { startDate: '', endDate: '' })
                      }
                    }}
                  />
                  <span className="flex-1-0">{label}</span>
                </label>
              ))}
              <div className="dropdown-add-new">
                <div className="form-label-sm">Teslimat Aralığı</div>
                <div className="flex-gap-8-mb-4">
                  <input
                    type="date"
                    placeholder="Başlangıç"
                    value={filters.customDeliveryDateRange?.startDate || ''}
                    onChange={(e) => {
                      const newRange = { ...filters.customDeliveryDateRange, startDate: e.target.value }
                      onFilterChange('customDeliveryDateRange', newRange)
                      // Clear preset delivery statuses when custom date is selected
                      if (e.target.value) {
                        onFilterChange('deliveryStatus', [])
                      }
                    }}
                    className="mes-filter-input is-compact flex-1-xs"
                  />
                  <input
                    type="date"
                    placeholder="Bitiş"
                    value={filters.customDeliveryDateRange?.endDate || ''}
                    onChange={(e) => {
                      const newRange = { ...filters.customDeliveryDateRange, endDate: e.target.value }
                      onFilterChange('customDeliveryDateRange', newRange)
                      // Clear preset delivery statuses when custom date is selected
                      if (e.target.value) {
                        onFilterChange('deliveryStatus', [])
                      }
                    }}
                    className="mes-filter-input is-compact flex-1-xs"
                  />
                </div>
              </div>
            </div>
          </div>
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
          <div 
            id="priceRange-dropdown"
            className="multi-select-dropdown dropdown-auto-width"
          >
            <div className="mes-filter-panel-header">
              <button
                type="button"
                className="mes-filter-panel-button"
                onClick={() => onFilterChange('priceRange', { min: '', max: '', mode: 'order' })}
              >
                <span>Temizle</span>
              </button>
              <button
                type="button"
                className="mes-filter-panel-button"
                onClick={(e) => {
                  e.stopPropagation()
                  document.getElementById('priceRange-dropdown').classList.add('d-none')
                }}
              >
                <span>Kapat</span>
              </button>
            </div>
            <div className="mes-filter-panel-content filter-panel-padded">
              <div className="flex-gap-8-mb-8">
                <input
                  type="text" inputMode="decimal"
                  placeholder="Min"
                  value={filters.priceRange.min}
                  onChange={(e) => {
                    let cleanValue = e.target.value.replace(/,/g, '.')
                    if (!/^[0-9.]*$/.test(cleanValue)) return
                    if ((cleanValue.match(/\./g) || []).length > 1) return
                    const newPriceRange = { ...filters.priceRange, min: cleanValue }
                    onFilterChange('priceRange', newPriceRange)
                  }}
                  className="mes-filter-input is-compact flex-1"
                  pattern="[0-9]*\.?[0-9]*"
                />
                <input
                  type="text" inputMode="decimal"
                  placeholder="Max"
                  value={filters.priceRange.max}
                  onChange={(e) => {
                    let cleanValue = e.target.value.replace(/,/g, '.')
                    if (!/^[0-9.]*$/.test(cleanValue)) return
                    if ((cleanValue.match(/\./g) || []).length > 1) return
                    const newPriceRange = { ...filters.priceRange, max: cleanValue }
                    onFilterChange('priceRange', newPriceRange)
                  }}
                  className="mes-filter-input is-compact flex-1"
                  pattern="[0-9]*\.?[0-9]*"
                />
              </div>
              <button
                type="button"
                className="mes-filter-button is-compact w-full"
                onClick={() => {
                  const newMode = filters.priceRange.mode === 'order' ? 'item' : 'order'
                  const newPriceRange = { ...filters.priceRange, mode: newMode }
                  onFilterChange('priceRange', newPriceRange)
                }}
              >
                <span>{filters.priceRange.mode === 'order' ? 'Sipariş Bazlı' : 'Ürün Bazlı'}</span>
              </button>
            </div>
          </div>
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
