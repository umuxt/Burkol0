import React, { useState, useEffect } from 'react'

export default function SuppliersFilters({ filters, onFilterChange, onClearAll, suppliers = [] }) {
  // Check if any filter is active
  const hasActiveFilters = !!(
    filters.search || 
    (filters.status && filters.status !== 'Tümü' && filters.status !== '') ||
    filters.supplierTypes?.length > 0 ||
    filters.countries?.length > 0 ||
    filters.creditRating?.length > 0 ||
    filters.paymentTerms?.length > 0 ||
    filters.deliveryTime?.length > 0
  )

  // Status toggle handler
  const handleStatusToggle = () => {
    let nextStatus = ''
    if (filters.status === '' || filters.status === 'Tümü') {
      nextStatus = 'Aktif'
    } else if (filters.status === 'Aktif') {
      nextStatus = 'Pasif'
    } else if (filters.status === 'Pasif') {
      nextStatus = 'Tümü'
    } else {
      nextStatus = 'Aktif'
    }
    onFilterChange('status', nextStatus)
  }

  const getStatusLabel = () => {
    if (filters.status === '' || filters.status === 'Tümü') return 'Tümü'
    if (filters.status === 'Aktif') return 'Aktif'
    if (filters.status === 'Pasif') return 'Pasif'
    return 'Tümü'
  }

  // Multi-select handler
  const handleMultiSelectChange = (key, value) => {
    const currentValues = filters[key] || []
    let newValues
    
    if (currentValues.includes(value)) {
      newValues = currentValues.filter(item => item !== value)
    } else {
      newValues = [...currentValues, value]
    }
    
    onFilterChange(key, newValues)
  }

  // Clear filters - pass all cleared values at once to parent
  const clearFilters = () => {
    if (onClearAll) {
      // Use parent's clear function which updates all state at once
      onClearAll()
    } else {
      // Fallback: clear individually (slower)
      const clearedFilters = {
        search: '',
        status: 'Tümü',
        supplierTypes: [],
        countries: [],
        paymentTerms: [],
        deliveryTime: [],
        creditRating: []
      }
      
      Object.entries(clearedFilters).forEach(([key, value]) => {
        onFilterChange(key, value)
      })
    }
  }

  // Quick filter toggles
  const toggleQuickFilter = (filterName) => {
    const nonTurkeyCountries = ['Almanya', 'İtalya', 'Çin']
    
    switch (filterName) {
      case 'payment30Days':
        const current30Days = filters.paymentTerms?.includes('30 Gün Vade') || false
        if (current30Days) {
          onFilterChange('paymentTerms', filters.paymentTerms.filter(term => term !== '30 Gün Vade'))
        } else {
          onFilterChange('paymentTerms', [...(filters.paymentTerms || []), '30 Gün Vade'])
        }
        break

      case 'aCredit':
        const currentACredit = filters.creditRating?.includes('A - Mükemmel') || false
        if (currentACredit) {
          onFilterChange('creditRating', filters.creditRating.filter(rating => rating !== 'A - Mükemmel'))
        } else {
          onFilterChange('creditRating', [...(filters.creditRating || []), 'A - Mükemmel'])
        }
        break
      
      case 'manufacturers':
        const currentManufacturers = filters.supplierTypes?.includes('Üretici') || false
        if (currentManufacturers) {
          onFilterChange('supplierTypes', filters.supplierTypes.filter(type => type !== 'Üretici'))
        } else {
          onFilterChange('supplierTypes', [...(filters.supplierTypes || []), 'Üretici'])
        }
        break
      
      case 'international':
        const currentInternational = nonTurkeyCountries.some(country => filters.countries?.includes(country)) || false
        if (currentInternational) {
          onFilterChange('countries', (filters.countries || []).filter(country => !nonTurkeyCountries.includes(country)))
        } else {
          const uniqueCountries = [...new Set([...(filters.countries || []), ...nonTurkeyCountries])]
          onFilterChange('countries', uniqueCountries)
        }
        break
    }
  }

  // Dropdown positioning and toggle
  const toggleDropdown = (dropdownName, event) => {
    event.stopPropagation()
    
    const dropdown = document.getElementById(`${dropdownName}-dropdown`)
    const header = event.currentTarget
    
    if (dropdown) {
      const isVisible = dropdown.style.display === 'block'
      // Close all other dropdowns first
      document.querySelectorAll('.multi-select-dropdown').forEach(d => {
        d.style.display = 'none'
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
        
        dropdown.style.display = 'block'
      } else {
        dropdown.style.display = 'none'
      }
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.multi-select-container')) {
        document.querySelectorAll('.multi-select-dropdown').forEach(d => {
          d.style.display = 'none'
        })
      }
    }

    // Close on scroll
    const handleScroll = () => {
      document.querySelectorAll('.multi-select-dropdown').forEach(d => {
        d.style.display = 'none'
      })
    }

    document.addEventListener('click', handleClickOutside)
    window.addEventListener('scroll', handleScroll, true)
    
    return () => {
      document.removeEventListener('click', handleClickOutside)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [])

  // Clear dropdown selection
  const clearDropdown = (key) => {
    onFilterChange(key, [])
  }

  // Check if quick filters are active
  const payment30DaysActive = filters.paymentTerms?.includes('30 Gün Vade') || false
  const aCreditActive = filters.creditRating?.includes('A - Mükemmel') || false
  const manufacturersActive = filters.supplierTypes?.includes('Üretici') || false
  const internationalActive = ['Almanya', 'İtalya', 'Çin'].some(country => filters.countries?.includes(country)) || false

  // Dropdown options
  const supplierTypeOptions = ['Üretici', 'Distribütör', 'Toptancı', 'Hizmet Sağlayıcı', 'Yüklenici', 'Danışman']
  const countryOptions = ['Türkiye', 'Almanya', 'İtalya', 'Çin', 'Fransa', 'İspanya', 'Polonya', 'Romanya']
  const creditRatingOptions = ['A - Mükemmel', 'B - İyi', 'C - Orta', 'D - Zayıf', 'E - Risk']
  const paymentTermsOptions = ['Peşin', '15 Gün Vade', '30 Gün Vade', '45 Gün Vade', '60 Gün Vade', '90 Gün Vade', '120 Gün Vade']
  const deliveryTimeOptions = ['Hızlı (0-7 gün)', 'Normal (8-15 gün)', 'Uzun (15+ gün)']

  // Count helpers
  const getSupplierTypeCount = (type) => suppliers.filter(s => s.supplierType === type || s.type === type).length
  const getCountryCount = (country) => suppliers.filter(s => s.country === country).length
  const getCreditRatingCount = (rating) => suppliers.filter(s => s.creditRating === rating).length
  const getPaymentTermsCount = (term) => suppliers.filter(s => s.paymentTerms === term || s.paymentTerms?.includes(term)).length
  const getDeliveryTimeCount = (time) => {
    if (time === 'Hızlı (0-7 gün)') return suppliers.filter(s => (s.leadTime || 0) <= 7).length
    if (time === 'Normal (8-15 gün)') return suppliers.filter(s => (s.leadTime || 0) > 7 && (s.leadTime || 0) <= 15).length
    if (time === 'Uzun (15+ gün)') return suppliers.filter(s => (s.leadTime || 0) > 15).length
    return 0
  }

  return (
    <div className="mes-filter-controls">
      {/* Search Input */}
      <input
        type="text"
        className="mes-filter-input is-compact"
        placeholder="Tedarikçi ara..."
        value={filters.search}
        onChange={(e) => onFilterChange('search', e.target.value)}
      />

      {/* Status Toggle */}
      <button
        type="button"
        className={`mes-filter-button is-compact ${filters.status && filters.status !== 'Tümü' ? 'is-active' : ''}`}
        onClick={handleStatusToggle}
      >
        <span>{getStatusLabel()}</span>
      </button>

      {/* Quick Filter: 30 Gün Vade */}
      <button
        type="button"
        className={`mes-filter-button is-compact ${payment30DaysActive ? 'is-active' : ''}`}
        onClick={() => toggleQuickFilter('payment30Days')}
      >
        <span>30 Gün Vade</span>
      </button>

      {/* Quick Filter: A Kredi */}
      <button
        type="button"
        className={`mes-filter-button is-compact ${aCreditActive ? 'is-active' : ''}`}
        onClick={() => toggleQuickFilter('aCredit')}
      >
        <span>A Kredi Notu</span>
      </button>

      {/* Quick Filter: Üreticiler */}
      <button
        type="button"
        className={`mes-filter-button is-compact ${manufacturersActive ? 'is-active' : ''}`}
        onClick={() => toggleQuickFilter('manufacturers')}
      >
        <span>Üreticiler</span>
      </button>

      {/* Quick Filter: Yurtdışı */}
      <button
        type="button"
        className={`mes-filter-button is-compact ${internationalActive ? 'is-active' : ''}`}
        onClick={() => toggleQuickFilter('international')}
      >
        <span>Yurtdışı</span>
      </button>

      {/* Multi-select: Tedarikçi Tipi */}
      <div className="multi-select-container">
        <button
          type="button"
          className="mes-filter-button is-compact"
          onClick={(e) => toggleDropdown('supplierTypes', e)}
        >
          <span>Tip</span>
          <span className="mes-filter-caret">▾</span>
          {filters.supplierTypes?.length > 0 && (
            <span className="mes-filter-count">{filters.supplierTypes.length}</span>
          )}
        </button>
        <div 
          id="supplierTypes-dropdown"
          className="multi-select-dropdown"
          className="d-none"
          >
            <div className="mes-filter-panel-header">
              <button
                type="button"
                className="mes-filter-panel-button"
                onClick={() => clearDropdown('supplierTypes')}
              >
                <span>Temizle</span>
              </button>
              <button
                type="button"
                className="mes-filter-panel-button"
                onClick={(e) => {
                  e.stopPropagation()
                  document.getElementById('supplierTypes-dropdown').style.display = 'none'
                }}
              >
                <span>Kapat</span>
              </button>
            </div>
            <div className="mes-filter-panel-content">
              {supplierTypeOptions.map(option => (
                <label key={option}>
                  <input
                    type="checkbox"
                    checked={filters.supplierTypes?.includes(option) || false}
                    onChange={() => handleMultiSelectChange('supplierTypes', option)}
                  />
                  <span className="flex-1-0">{option}</span>
                  <span className="text-muted-var">({getSupplierTypeCount(option)})</span>
                </label>
              ))}
            </div>
        </div>
      </div>

      {/* Multi-select: Ülke */}
      <div className="multi-select-container">
        <button
          type="button"
          className="mes-filter-button is-compact"
          onClick={(e) => toggleDropdown('countries', e)}
        >
          <span>Ülke</span>
          <span className="mes-filter-caret">▾</span>
          {filters.countries?.length > 0 && (
            <span className="mes-filter-count">{filters.countries.length}</span>
          )}
        </button>
        <div 
          id="countries-dropdown"
          className="multi-select-dropdown"
          className="d-none"
          >
            <div className="mes-filter-panel-header">
              <button
                type="button"
                className="mes-filter-panel-button"
                onClick={() => clearDropdown('countries')}
              >
                <span>Temizle</span>
              </button>
              <button
                type="button"
                className="mes-filter-panel-button"
                onClick={(e) => {
                  e.stopPropagation()
                  document.getElementById('countries-dropdown').style.display = 'none'
                }}
              >
                <span>Kapat</span>
              </button>
            </div>
            <div className="mes-filter-panel-content">
              {countryOptions.map(option => (
                <label key={option}>
                  <input
                    type="checkbox"
                    checked={filters.countries?.includes(option) || false}
                    onChange={() => handleMultiSelectChange('countries', option)}
                  />
                  <span className="flex-1-0">{option}</span>
                  <span className="text-muted-var">({getCountryCount(option)})</span>
                </label>
              ))}
            </div>
        </div>
      </div>

      {/* Multi-select: Kredi Notu */}
      <div className="multi-select-container">
        <button
          type="button"
          className="mes-filter-button is-compact"
          onClick={(e) => toggleDropdown('creditRating', e)}
        >
          <span>Kredi Notu</span>
          <span className="mes-filter-caret">▾</span>
          {filters.creditRating?.length > 0 && (
            <span className="mes-filter-count">{filters.creditRating.length}</span>
          )}
        </button>
        <div 
          id="creditRating-dropdown"
          className="multi-select-dropdown"
          className="d-none"
          >
            <div className="mes-filter-panel-header">
              <button
                type="button"
                className="mes-filter-panel-button"
                onClick={() => clearDropdown('creditRating')}
              >
                <span>Temizle</span>
              </button>
              <button
                type="button"
                className="mes-filter-panel-button"
                onClick={(e) => {
                  e.stopPropagation()
                  document.getElementById('creditRating-dropdown').style.display = 'none'
                }}
              >
                <span>Kapat</span>
              </button>
            </div>
            <div className="mes-filter-panel-content">
              {creditRatingOptions.map(option => (
                <label key={option}>
                  <input
                    type="checkbox"
                    checked={filters.creditRating?.includes(option) || false}
                    onChange={() => handleMultiSelectChange('creditRating', option)}
                  />
                  <span className="flex-1-0">{option}</span>
                  <span className="text-muted-var">({getCreditRatingCount(option)})</span>
                </label>
              ))}
            </div>
        </div>
      </div>

      {/* Multi-select: Ödeme Koşulları */}
      <div className="multi-select-container">
        <button
          type="button"
          className="mes-filter-button is-compact"
          onClick={(e) => toggleDropdown('paymentTerms', e)}
        >
          <span>Ödeme</span>
          <span className="mes-filter-caret">▾</span>
          {filters.paymentTerms?.length > 0 && (
            <span className="mes-filter-count">{filters.paymentTerms.length}</span>
          )}
        </button>
        <div 
          id="paymentTerms-dropdown"
          className="multi-select-dropdown"
          className="d-none"
          >
            <div className="mes-filter-panel-header">
              <button
                type="button"
                className="mes-filter-panel-button"
                onClick={() => clearDropdown('paymentTerms')}
              >
                <span>Temizle</span>
              </button>
              <button
                type="button"
                className="mes-filter-panel-button"
                onClick={(e) => {
                  e.stopPropagation()
                  document.getElementById('paymentTerms-dropdown').style.display = 'none'
                }}
              >
                <span>Kapat</span>
              </button>
            </div>
            <div className="mes-filter-panel-content">
              {paymentTermsOptions.map(option => (
                <label key={option}>
                  <input
                    type="checkbox"
                    checked={filters.paymentTerms?.includes(option) || false}
                    onChange={() => handleMultiSelectChange('paymentTerms', option)}
                  />
                  <span className="flex-1-0">{option}</span>
                  <span className="text-muted-var">({getPaymentTermsCount(option)})</span>
                </label>
              ))}
            </div>
        </div>
      </div>

      {/* Multi-select: Teslimat Süresi */}
      <div className="multi-select-container">
        <button
          type="button"
          className="mes-filter-button is-compact"
          onClick={(e) => toggleDropdown('deliveryTime', e)}
        >
          <span>Teslimat</span>
          <span className="mes-filter-caret">▾</span>
          {filters.deliveryTime?.length > 0 && (
            <span className="mes-filter-count">{filters.deliveryTime.length}</span>
          )}
        </button>
        <div 
          id="deliveryTime-dropdown"
          className="multi-select-dropdown"
          className="d-none"
          >
            <div className="mes-filter-panel-header">
              <button
                type="button"
                className="mes-filter-panel-button"
                onClick={() => clearDropdown('deliveryTime')}
              >
                <span>Temizle</span>
              </button>
              <button
                type="button"
                className="mes-filter-panel-button"
                onClick={(e) => {
                  e.stopPropagation()
                  document.getElementById('deliveryTime-dropdown').style.display = 'none'
                }}
              >
                <span>Kapat</span>
              </button>
            </div>
            <div className="mes-filter-panel-content">
              {deliveryTimeOptions.map(option => (
                <label key={option}>
                  <input
                    type="checkbox"
                    checked={filters.deliveryTime?.includes(option) || false}
                    onChange={() => handleMultiSelectChange('deliveryTime', option)}
                  />
                  <span className="flex-1-0">{option}</span>
                  <span className="text-muted-var">({getDeliveryTimeCount(option)})</span>
                </label>
              ))}
            </div>
        </div>
      </div>

      {/* Clear All Filters Button */}
      {hasActiveFilters && (
        <button
          type="button"
          className="mes-filter-clear is-compact"
          onClick={clearFilters}
        >
          <span>Filtreleri Temizle</span>
        </button>
      )}
    </div>
  )
}
