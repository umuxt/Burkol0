import React, { useState, useEffect } from 'react'
import SuppliersTable from './SuppliersTable'
import AddSupplierModal from './AddSupplierModal'
import { useSuppliers } from '../hooks/useSuppliers'
import { useSupplierCategories } from '../hooks/useSupplierCategories'

// Suppliers dashboard component with real data
function SuppliersDashboard({ suppliers }) {
  const totalSuppliers = suppliers.length
  const activeSuppliers = suppliers.filter(s => s.status === 'active').length
  const thisMonthOrders = suppliers.reduce((acc, s) => acc + (s.monthlyOrders || 0), 0)

  return (
    <section className="materials-dashboard">
      <div className="card">
        <h3>Toplam Tedarikçi</h3>
        <p>{totalSuppliers}</p>
      </div>
      <div className="card">
        <h3>Aktif Tedarikçi</h3>
        <p>{activeSuppliers}</p>
      </div>
      <div className="card">
        <h3>Bu Ay Sipariş</h3>
        <p>{thisMonthOrders}</p>
      </div>
    </section>
  )
}

// Suppliers filters component with search functionality
function SuppliersFilters({ filters, onFilterChange, isExpanded, onToggleExpanded }) {
  
  // Quick filter state (kept locally for UI state)
  const [activeFilters, setActiveFilters] = useState({
    inactive: false,
    payment30Days: false,
    aCredit: false,
    manufacturers: false,
    international: false
  });

  // Sync activeFilters with actual filter state
  useEffect(() => {
    const nonTurkeyCountries = ['Almanya', 'Fransa', 'İtalya', 'ABD', 'Çin'];
    
    setActiveFilters({
      inactive: filters.status === 'Pasif',
      payment30Days: filters.paymentTerms?.includes('30 Gün Vade') || false,
      aCredit: filters.creditRating?.includes('A - Mükemmel') || false,
      manufacturers: filters.supplierTypes?.includes('Üretici') || false,
      international: nonTurkeyCountries.some(country => filters.countries?.includes(country)) || false
    });
  }, [filters]);

  // Status toggle handler (like MaterialsFilters)
  const handleStatusToggle = () => {
    let nextStatus = '';
    if (filters.status === '' || filters.status === 'Tümü') {
      nextStatus = 'Aktif'; // Tümü -> Aktif
    } else if (filters.status === 'Aktif') {
      nextStatus = 'Pasif'; // Aktif -> Pasif  
    } else if (filters.status === 'Pasif') {
      nextStatus = 'Tümü'; // Pasif -> Tümü
    } else {
      nextStatus = 'Aktif'; // Fallback
    }
    
    onFilterChange('status', nextStatus);
  };

  const getStatusLabel = () => {
    if (filters.status === '' || filters.status === 'Tümü') return 'Tümü';
    if (filters.status === 'Aktif') return 'Aktif';
    if (filters.status === 'Pasif') return 'Pasif';
    return 'Tümü'; // Fallback
  };

  const getStatusIcon = () => {
    if (filters.status === '' || filters.status === 'Tümü') return '🔄';
    if (filters.status === 'Aktif') return '✅';
    if (filters.status === 'Pasif') return '❌';
    return '🔄'; // Fallback
  };

  // Clear all filters function
  const clearFilters = () => {
    console.log('🧹 Tüm filtreler temizleniyor...');
    
    // Tüm filter alanlarını sıfırla
    onFilterChange('search', '');
    onFilterChange('status', 'Tümü'); // Default status
    onFilterChange('supplierTypes', []);
    onFilterChange('countries', []);
    onFilterChange('compliance', []);
    onFilterChange('paymentTerms', []);
    onFilterChange('deliveryTime', []);
    onFilterChange('certificates', []);
    onFilterChange('creditRating', []);
    onFilterChange('riskLevel', []);
    onFilterChange('minOrderAmount', []);
    
    // activeFilters otomatik olarak useEffect ile senkronize olacak
    console.log('✅ Tüm filtreler temizlendi');
  };

  // Check if any filter is applied
  const hasActiveFilters = () => {
    const isActive = !!(
      // Arama filtresi
      filters.search ||
      // Status filtresi (varsayılan 'Tümü' değilse)
      (filters.status && filters.status !== '' && filters.status !== 'Tümü') ||
      // Array filtrelerinin hepsi
      (filters.supplierTypes && filters.supplierTypes.length > 0) ||
      (filters.countries && filters.countries.length > 0) ||
      (filters.compliance && filters.compliance.length > 0) ||
      (filters.paymentTerms && filters.paymentTerms.length > 0) ||
      (filters.deliveryTime && filters.deliveryTime.length > 0) ||
      (filters.certificates && filters.certificates.length > 0) ||
      (filters.creditRating && filters.creditRating.length > 0) ||
      (filters.riskLevel && filters.riskLevel.length > 0) ||
      (filters.minOrderAmount && filters.minOrderAmount.length > 0)
    );
    
    console.log('🔍 hasActiveFilters kontrol:', {
      search: !!filters.search,
      status: filters.status !== '' && filters.status !== 'Tümü',
      supplierTypes: filters.supplierTypes?.length > 0,
      countries: filters.countries?.length > 0,
      result: isActive
    });
    
    return isActive;
  };

  // Multi-select handler for dropdowns
  const handleMultiSelectChange = (key, value) => {
    const currentValues = filters[key] || [];
    let newValues;
    
    if (currentValues.includes(value)) {
      // Remove if already selected
      newValues = currentValues.filter(item => item !== value);
    } else {
      // Add if not selected
      newValues = [...currentValues, value];
    }
    
    onFilterChange(key, newValues);
  };

  // Quick filter handler - simplified, no need to manage activeFilters manually
  const toggleQuickFilter = (filterName) => {
    console.log('🔘 Quick filter toggled:', filterName, 'Current state:', activeFilters[filterName]);

    switch (filterName) {
      case 'payment30Days':
        const current30Days = filters.paymentTerms?.includes('30 Gün Vade') || false;
        if (current30Days) {
          onFilterChange('paymentTerms', filters.paymentTerms.filter(term => term !== '30 Gün Vade'));
        } else {
          onFilterChange('paymentTerms', [...(filters.paymentTerms || []), '30 Gün Vade']);
        }
        break;

      case 'aCredit':
        const currentACredit = filters.creditRating?.includes('A - Mükemmel') || false;
        if (currentACredit) {
          onFilterChange('creditRating', filters.creditRating.filter(rating => rating !== 'A - Mükemmel'));
        } else {
          onFilterChange('creditRating', [...(filters.creditRating || []), 'A - Mükemmel']);
        }
        break;
      
      case 'manufacturers':
        const currentManufacturers = filters.supplierTypes?.includes('Üretici') || false;
        if (currentManufacturers) {
          onFilterChange('supplierTypes', filters.supplierTypes.filter(type => type !== 'Üretici'));
        } else {
          onFilterChange('supplierTypes', [...(filters.supplierTypes || []), 'Üretici']);
        }
        break;
      
      case 'international':
        const nonTurkeyCountries = ['Almanya', 'Fransa', 'İtalya', 'ABD', 'Çin'];
        const currentInternational = nonTurkeyCountries.some(country => filters.countries?.includes(country)) || false;
        if (currentInternational) {
          // Remove all international countries
          onFilterChange('countries', (filters.countries || []).filter(country => !nonTurkeyCountries.includes(country)));
        } else {
          // Add all international countries
          const uniqueCountries = [...new Set([...(filters.countries || []), ...nonTurkeyCountries])];
          onFilterChange('countries', uniqueCountries);
        }
        break;
    }
  };
  
  // Dropdown toggle functionality
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

  const toggleDropdown = (dropdownId) => {
    const dropdown = document.getElementById(dropdownId);
    const isVisible = dropdown.style.display === 'block';
    
    // Close all dropdowns first
    document.querySelectorAll('.multi-select-dropdown').forEach(dd => {
      dd.style.display = 'none';
    });
    
    // Toggle current dropdown
    dropdown.style.display = isVisible ? 'none' : 'block';
  };
  
  const toggleExpanded = () => {
    onToggleExpanded(!isExpanded)
  }

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
          display: 'flex',
          alignItems: 'center',
          height: '100%',
          order: 1
        }}>
          <button
            onClick={toggleExpanded}
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
        </div>

        {/* Sağ taraf - Filtre container */}
        <div className={`filters-container ${hasActiveFilters() ? 'filters-active' : ''}`} style={{ order: 2 }}>
          <div className="search-section">
            <div className="search-input-container">
              <input 
                placeholder="Tedarikçi adı, kodu veya kategoriye göre ara..." 
                className="search-input" 
                type="text" 
                value={filters.search}
                onChange={(e) => {
                  onFilterChange('search', e.target.value);
                }}
              />
              <span className="search-icon">🔍</span>
            </div>
            

            
            <div className="quick-filters">
              <div className="status-toggle-container">
                <div 
                  className={`status-toggle-header ${filters.status ? 'active' : ''} ${
                    filters.status === 'Aktif' ? 'status-aktif' : 
                    filters.status === 'Pasif' ? 'status-pasif' : 
                    'status-tumü'
                  }`}
                  onClick={handleStatusToggle}
                >
                  <span className="status-icon">{getStatusIcon()}</span>
                  <span style={{ color: 'black' }}>{getStatusLabel()}</span>
                  <span className="toggle-arrow">🔄</span>
                </div>
              </div>
              <button 
                type="button" 
                className={`quick-filter-btn ${activeFilters.payment30Days ? 'active' : ''}`}
                onClick={() => toggleQuickFilter('payment30Days')}
              >
                💰 30 Gün Vade
              </button>
              {isExpanded && (
                <>
                  <button 
                    type="button" 
                    className={`quick-filter-btn ${activeFilters.aCredit ? 'active' : ''}`}
                    onClick={() => toggleQuickFilter('aCredit')}
                  >
                    ⭐ A Kredi Notu
                  </button>
                  <button 
                    type="button" 
                    className={`quick-filter-btn ${activeFilters.manufacturers ? 'active' : ''}`}
                    onClick={() => toggleQuickFilter('manufacturers')}
                  >
                    🏭 Üreticiler
                  </button>
                  <button 
                    type="button" 
                    className={`quick-filter-btn ${activeFilters.international ? 'active' : ''}`}
                    onClick={() => toggleQuickFilter('international')}
                  >
                    🌍 Yurtdışı
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="dropdown-filters">
            <div className="filter-group">
              <div className="multi-select-container">
                <div className="multi-select-header" onClick={() => toggleDropdown('supplier-types-dropdown')}>
                  Tedarikçi Tipi seçin...
                  <span className="dropdown-arrow">▼</span>
                </div>
                <div id="supplier-types-dropdown" className="multi-select-dropdown" style={{ display: 'none' }}>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.supplierTypes.includes('Üretici')}
                      onChange={() => handleMultiSelectChange('supplierTypes', 'Üretici')}
                    />
                    <span>Üretici</span>
                  </label>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.supplierTypes.includes('Distribütör')}
                      onChange={() => handleMultiSelectChange('supplierTypes', 'Distribütör')}
                    />
                    <span>Distribütör</span>
                  </label>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.supplierTypes.includes('Toptancı')}
                      onChange={() => handleMultiSelectChange('supplierTypes', 'Toptancı')}
                    />
                    <span>Toptancı</span>
                  </label>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.supplierTypes.includes('Hizmet Sağlayıcı')}
                      onChange={() => handleMultiSelectChange('supplierTypes', 'Hizmet Sağlayıcı')}
                    />
                    <span>Hizmet Sağlayıcı</span>
                  </label>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.supplierTypes.includes('Yüklenici')}
                      onChange={() => handleMultiSelectChange('supplierTypes', 'Yüklenici')}
                    />
                    <span>Yüklenici</span>
                  </label>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.supplierTypes.includes('Danışman')}
                      onChange={() => handleMultiSelectChange('supplierTypes', 'Danışman')}
                    />
                    <span>Danışman</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="filter-group">
              <div className="multi-select-container">
                <div className="multi-select-header" onClick={() => toggleDropdown('compliance-dropdown')} style={{ whiteSpace: 'nowrap' }}>
                  Uyumluluk Durumu seçin...<span className="dropdown-arrow">▼</span>
                </div>
                <div id="compliance-dropdown" className="multi-select-dropdown" style={{ display: 'none' }}>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.compliance.includes('Onaylandı')}
                      onChange={() => handleMultiSelectChange('compliance', 'Onaylandı')}
                    />
                    <span>Onaylandı</span>
                  </label>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.compliance.includes('İnceleniyor')}
                      onChange={() => handleMultiSelectChange('compliance', 'İnceleniyor')}
                    />
                    <span>İnceleniyor</span>
                  </label>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.compliance.includes('Beklemede')}
                      onChange={() => handleMultiSelectChange('compliance', 'Beklemede')}
                    />
                    <span>Beklemede</span>
                  </label>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.compliance.includes('Reddedildi')}
                      onChange={() => handleMultiSelectChange('compliance', 'Reddedildi')}
                    />
                    <span>Reddedildi</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="filter-group">
              <div className="multi-select-container">
                <div className="multi-select-header" onClick={() => toggleDropdown('countries-dropdown')}>
                  Ülke seçin...
                  <span className="dropdown-arrow">▼</span>
                </div>
                <div id="countries-dropdown" className="multi-select-dropdown" style={{ display: 'none' }}>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.countries.includes('Türkiye')}
                      onChange={() => handleMultiSelectChange('countries', 'Türkiye')}
                    />
                    <span>Türkiye</span>
                  </label>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.countries.includes('Almanya')}
                      onChange={() => handleMultiSelectChange('countries', 'Almanya')}
                    />
                    <span>Almanya</span>
                  </label>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.countries.includes('Fransa')}
                      onChange={() => handleMultiSelectChange('countries', 'Fransa')}
                    />
                    <span>Fransa</span>
                  </label>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.countries.includes('İtalya')}
                      onChange={() => handleMultiSelectChange('countries', 'İtalya')}
                    />
                    <span>İtalya</span>
                  </label>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.countries.includes('ABD')}
                      onChange={() => handleMultiSelectChange('countries', 'ABD')}
                    />
                    <span>ABD</span>
                  </label>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.countries.includes('Çin')}
                      onChange={() => handleMultiSelectChange('countries', 'Çin')}
                    />
                    <span>Çin</span>
                  </label>
                </div>
              </div>
            </div>
            {isExpanded && (
              <>
                <div className="filter-group">
                  <div className="multi-select-container">
                    <div className="multi-select-header" onClick={() => toggleDropdown('credit-rating-dropdown')}>
                      Kredi Notu seçin...
                      <span className="dropdown-arrow">▼</span>
                    </div>
                    <div id="credit-rating-dropdown" className="multi-select-dropdown" style={{ display: 'none' }}>
                      <label className="multi-select-option">
                        <input 
                          type="checkbox" 
                          checked={filters.creditRating.includes('A - Mükemmel')}
                          onChange={() => handleMultiSelectChange('creditRating', 'A - Mükemmel')}
                        />
                        <span>A - Mükemmel</span>
                      </label>
                      <label className="multi-select-option">
                        <input 
                          type="checkbox" 
                          checked={filters.creditRating.includes('B - İyi')}
                          onChange={() => handleMultiSelectChange('creditRating', 'B - İyi')}
                        />
                        <span>B - İyi</span>
                      </label>
                      <label className="multi-select-option">
                        <input 
                          type="checkbox" 
                          checked={filters.creditRating.includes('C - Orta')}
                          onChange={() => handleMultiSelectChange('creditRating', 'C - Orta')}
                        />
                        <span>C - Orta</span>
                      </label>
                      <label className="multi-select-option">
                        <input 
                          type="checkbox" 
                          checked={filters.creditRating.includes('D - Zayıf')}
                          onChange={() => handleMultiSelectChange('creditRating', 'D - Zayıf')}
                        />
                        <span>D - Zayıf</span>
                      </label>
                      <label className="multi-select-option">
                        <input 
                          type="checkbox" 
                          checked={filters.creditRating.includes('F - Riskli')}
                          onChange={() => handleMultiSelectChange('creditRating', 'F - Riskli')}
                        />
                        <span>F - Riskli</span>
                      </label>
                    </div>
                  </div>
                </div>
                <div className="filter-group">
                  <div className="multi-select-container">
                    <div className="multi-select-header" onClick={() => toggleDropdown('risk-level-dropdown')}>
                      Risk Seviyesi seçin...
                      <span className="dropdown-arrow">▼</span>
                    </div>
                    <div id="risk-level-dropdown" className="multi-select-dropdown" style={{ display: 'none' }}>
                      <label className="multi-select-option">
                        <input 
                          type="checkbox" 
                          checked={filters.riskLevel.includes('Düşük Risk')}
                          onChange={() => handleMultiSelectChange('riskLevel', 'Düşük Risk')}
                        />
                        <span>Düşük Risk</span>
                      </label>
                      <label className="multi-select-option">
                        <input 
                          type="checkbox" 
                          checked={filters.riskLevel.includes('Orta Risk')}
                          onChange={() => handleMultiSelectChange('riskLevel', 'Orta Risk')}
                        />
                        <span>Orta Risk</span>
                      </label>
                      <label className="multi-select-option">
                        <input 
                          type="checkbox" 
                          checked={filters.riskLevel.includes('Yüksek Risk')}
                          onChange={() => handleMultiSelectChange('riskLevel', 'Yüksek Risk')}
                        />
                        <span>Yüksek Risk</span>
                      </label>
                    </div>
                  </div>
                </div>
              </>
            )}
            
            {isExpanded && (
              <>
                <div className="filter-group">
                  <div className="multi-select-container">
                    <div className="multi-select-header" onClick={() => toggleDropdown('payment-terms-dropdown')}>
                      Ödeme Koşulları seçin...
                      <span className="dropdown-arrow">▼</span>
                    </div>
                    <div id="payment-terms-dropdown" className="multi-select-dropdown" style={{ display: 'none' }}>
                      <label className="multi-select-option">
                        <input 
                          type="checkbox" 
                          checked={filters.paymentTerms.includes('Peşin')}
                          onChange={() => handleMultiSelectChange('paymentTerms', 'Peşin')}
                        />
                        <span>Peşin</span>
                      </label>
                      <label className="multi-select-option">
                        <input 
                          type="checkbox" 
                          checked={filters.paymentTerms.includes('15 Gün Vade')}
                          onChange={() => handleMultiSelectChange('paymentTerms', '15 Gün Vade')}
                        />
                        <span>15 Gün Vade</span>
                      </label>
                      <label className="multi-select-option">
                        <input 
                          type="checkbox" 
                          checked={filters.paymentTerms.includes('30 Gün Vade')}
                          onChange={() => handleMultiSelectChange('paymentTerms', '30 Gün Vade')}
                        />
                        <span>30 Gün Vade</span>
                      </label>
                      <label className="multi-select-option">
                        <input 
                          type="checkbox" 
                          checked={filters.paymentTerms.includes('45+ Gün Vade')}
                          onChange={() => handleMultiSelectChange('paymentTerms', '45+ Gün Vade')}
                        />
                        <span>45+ Gün Vade</span>
                      </label>
                    </div>
                  </div>
                </div>
                <div className="filter-group">
                  <div className="multi-select-container">
                    <div className="multi-select-header" onClick={() => toggleDropdown('delivery-time-dropdown')}>
                      Teslimat Süresi seçin...
                      <span className="dropdown-arrow">▼</span>
                    </div>
                    <div id="delivery-time-dropdown" className="multi-select-dropdown" style={{ display: 'none' }}>
                      <label className="multi-select-option">
                        <input 
                          type="checkbox" 
                          checked={filters.deliveryTime.includes('Hızlı (0-7 gün)')}
                          onChange={() => handleMultiSelectChange('deliveryTime', 'Hızlı (0-7 gün)')}
                        />
                        <span>Hızlı (0-7 gün)</span>
                      </label>
                      <label className="multi-select-option">
                        <input 
                          type="checkbox" 
                          checked={filters.deliveryTime.includes('Normal (8-15 gün)')}
                          onChange={() => handleMultiSelectChange('deliveryTime', 'Normal (8-15 gün)')}
                        />
                        <span>Normal (8-15 gün)</span>
                      </label>
                      <label className="multi-select-option">
                        <input 
                          type="checkbox" 
                          checked={filters.deliveryTime.includes('Uzun (15+ gün)')}
                          onChange={() => handleMultiSelectChange('deliveryTime', 'Uzun (15+ gün)')}
                        />
                        <span>Uzun (15+ gün)</span>
                      </label>
                    </div>
                  </div>
                </div>
                <div className="filter-group">
                  <div className="multi-select-container">
                    <div className="multi-select-header" onClick={() => toggleDropdown('certificates-dropdown')}>
                      Sertifikalar seçin...
                      <span className="dropdown-arrow">▼</span>
                    </div>
                <div id="certificates-dropdown" className="multi-select-dropdown" style={{ display: 'none' }}>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.certificates.includes('ISO 9001')}
                      onChange={() => handleMultiSelectChange('certificates', 'ISO 9001')}
                    />
                    <span>ISO 9001</span>
                  </label>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.certificates.includes('ISO 14001')}
                      onChange={() => handleMultiSelectChange('certificates', 'ISO 14001')}
                    />
                    <span>ISO 14001</span>
                  </label>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.certificates.includes('CE Belgesi')}
                      onChange={() => handleMultiSelectChange('certificates', 'CE Belgesi')}
                    />
                    <span>CE Belgesi</span>
                  </label>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.certificates.includes('TSE Belgesi')}
                      onChange={() => handleMultiSelectChange('certificates', 'TSE Belgesi')}
                    />
                    <span>TSE Belgesi</span>
                  </label>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.certificates.includes('OHSAS 18001')}
                      onChange={() => handleMultiSelectChange('certificates', 'OHSAS 18001')}
                    />
                    <span>OHSAS 18001</span>
                  </label>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.certificates.includes('Diğer')}
                      onChange={() => handleMultiSelectChange('certificates', 'Diğer')}
                    />
                    <span>Diğer</span>
                  </label>
                </div>
              </div>
            </div>
            
            <div className="filter-group">
              <div className="multi-select-container">
                <div className="multi-select-header" onClick={() => toggleDropdown('min-order-dropdown')}>
                  Min. Sipariş Tutarı...
                  <span className="dropdown-arrow">▼</span>
                </div>
                <div id="min-order-dropdown" className="multi-select-dropdown" style={{ display: 'none' }}>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.minOrderAmount.includes('1.000 TL ve altı')}
                      onChange={() => handleMultiSelectChange('minOrderAmount', '1.000 TL ve altı')}
                    />
                    <span>1.000 TL ve altı</span>
                  </label>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.minOrderAmount.includes('1.000 - 5.000 TL')}
                      onChange={() => handleMultiSelectChange('minOrderAmount', '1.000 - 5.000 TL')}
                    />
                    <span>1.000 - 5.000 TL</span>
                  </label>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.minOrderAmount.includes('5.000 - 10.000 TL')}
                      onChange={() => handleMultiSelectChange('minOrderAmount', '5.000 - 10.000 TL')}
                    />
                    <span>5.000 - 10.000 TL</span>
                  </label>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.minOrderAmount.includes('10.000 - 50.000 TL')}
                      onChange={() => handleMultiSelectChange('minOrderAmount', '10.000 - 50.000 TL')}
                    />
                    <span>10.000 - 50.000 TL</span>
                  </label>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.minOrderAmount.includes('50.000 TL ve üzeri')}
                      onChange={() => handleMultiSelectChange('minOrderAmount', '50.000 TL ve üzeri')}
                    />
                    <span>50.000 TL ve üzeri</span>
                  </label>
                  <label className="multi-select-option">
                    <input 
                      type="checkbox" 
                      checked={filters.minOrderAmount.includes('Minimum yok')}
                      onChange={() => handleMultiSelectChange('minOrderAmount', 'Minimum yok')}
                    />
                    <span>Minimum yok</span>
                  </label>
                </div>
              </div>
            </div>
            
              </>
            )}
            
            {/* Filtreleri Kaldır butonu - her zaman görünür */}
            {hasActiveFilters() && (
              <div className="filter-group" style={{
                position: 'sticky',
                bottom: '0',
                backgroundColor: 'white',
                padding: '8px',
                borderTop: '1px solid #e5e7eb',
                marginTop: '8px'
              }}>
                <button 
                  type="button" 
                  className="clear-filters-btn"
                  onClick={clearFilters}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #ef4444',
                    borderRadius: '4px',
                    background: '#fef2f2',
                    color: '#dc2626',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontWeight: '500',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    e.target.style.background = '#fee2e2';
                    e.target.style.borderColor = '#dc2626';
                  }}
                  onMouseOut={(e) => {
                    e.target.style.background = '#fef2f2';
                    e.target.style.borderColor = '#ef4444';
                  }}
                >
                  🗑️ Filtreleri Kaldır
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

// Geçici suppliers table component
function SuppliersTablePlaceholder() {
  return <SuppliersTable />
}

export default function SuppliersTabContent({ 
  categories,
  handleDeleteMaterial
}) {
  const [isAddSupplierModalOpen, setIsAddSupplierModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false)
  
  // Filter state - moved from SuppliersFilters
  const [filters, setFilters] = useState({
    search: '',
    status: 'Tümü', // Aktif, Pasif, Tümü - default Tümü
    supplierTypes: [],
    countries: [],
    compliance: [],
    paymentTerms: [],
    deliveryTime: [],
    certificates: [],
    creditRating: [],
    riskLevel: [],
    minOrderAmount: []
  })

  // Filter change handler
  const handleFilterChange = (key, value) => {
    console.log('🔍 Filter değişti:', key, '=', value);
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    
    // Search için backward compatibility
    if (key === 'search') {
      setSearchQuery(value);
    }
  }
  
  // Firebase hooks
  const { 
    suppliers, 
    loading: suppliersLoading, 
    error: suppliersError, 
    addSupplier: createSupplier, 
    updateSupplier, 
    deleteSupplier,
    refetch: refetchSuppliers
  } = useSuppliers()
  
  const { 
    categories: supplierCategories, 
    addCategory: createSupplierCategory 
  } = useSupplierCategories()

  // Hash-based supplier detail açma event listener
  useEffect(() => {
    const handleOpenSupplierDetail = (event) => {
      const { supplierId } = event.detail;
      
      // Suppliers listesi varsa direkt supplier detayını aç
      if (suppliers && suppliers.length > 0) {
        const supplier = suppliers.find(s => s.id === supplierId);
        if (supplier) {
          // SuppliersTable'a supplier seçimini bildir
          setTimeout(() => {
            window.location.hash = `supplier-${supplierId}`;
            setTimeout(() => {
              window.history.replaceState(null, null, window.location.pathname);
            }, 50);
          }, 50);
        }
      }
    };
    
    window.addEventListener('openSupplierDetail', handleOpenSupplierDetail);
    return () => window.removeEventListener('openSupplierDetail', handleOpenSupplierDetail);
  }, [suppliers]);

  // Filter suppliers based on all filters
  const filteredSuppliers = suppliers.filter(supplier => {
    console.log('📊 Filtering supplier:', supplier.companyName, 'with filters:', filters);
    // Search filter
    const searchMatch = !filters.search || 
      supplier.companyName?.toLowerCase().includes(filters.search.toLowerCase()) ||
      supplier.category?.toLowerCase().includes(filters.search.toLowerCase()) ||
      supplier.contactPerson?.toLowerCase().includes(filters.search.toLowerCase()) ||
      supplier.code?.toLowerCase().includes(filters.search.toLowerCase());

    // Status filter
    let statusMatch = true;
    if (filters.status === 'Aktif') {
      statusMatch = supplier.status === 'Aktif' || supplier.status === 'active';
    } else if (filters.status === 'Pasif') {
      statusMatch = supplier.status === 'Pasif' || supplier.status === 'inactive';
    }
    // Tümü durumunda tüm supplier'lar gösterilir

    // Supplier type filter
    const typeMatch = filters.supplierTypes.length === 0 || 
      filters.supplierTypes.includes(supplier.supplierType) ||
      filters.supplierTypes.includes(supplier.type);

    // Compliance filter
    const complianceMatch = filters.compliance.length === 0 || 
      filters.compliance.includes(supplier.complianceStatus) ||
      filters.compliance.includes(supplier.compliance);

    // Payment terms filter
    const paymentMatch = filters.paymentTerms.length === 0 || 
      filters.paymentTerms.includes(supplier.paymentTerms) ||
      filters.paymentTerms.some(term => supplier.paymentTerms?.includes(term));

    // Delivery time filter
    const deliveryMatch = filters.deliveryTime.length === 0 || 
      filters.deliveryTime.some(time => {
        const leadTime = supplier.leadTime || 0;
        if (time === 'Hızlı (0-7 gün)') return leadTime <= 7;
        if (time === 'Normal (8-15 gün)') return leadTime > 7 && leadTime <= 15;
        if (time === 'Uzun (15+ gün)') return leadTime > 15;
        return false;
      });

    // Countries filter
    const countryMatch = filters.countries.length === 0 || 
      filters.countries.includes(supplier.country);

    // Certificates filter
    const certificateMatch = filters.certificates.length === 0 || 
      filters.certificates.includes(supplier.qualityCertification) ||
      filters.certificates.some(cert => supplier.certificates?.includes(cert));

    // Credit rating filter
    const creditMatch = filters.creditRating.length === 0 || 
      filters.creditRating.includes(supplier.creditRating);

    // Risk level filter
    const riskMatch = filters.riskLevel.length === 0 || 
      filters.riskLevel.includes(supplier.riskLevel);

    // Min order amount filter (simplified - would need supplier.minOrderAmount field)
    const minOrderMatch = filters.minOrderAmount.length === 0 || 
      filters.minOrderAmount.includes(supplier.minOrderAmount) ||
      (filters.minOrderAmount.includes('Minimum yok') && !supplier.minOrderAmount);

    return searchMatch && statusMatch && typeMatch && complianceMatch && 
           paymentMatch && deliveryMatch && countryMatch && certificateMatch && 
           creditMatch && riskMatch && minOrderMatch;
  })

  const handleAddSupplier = async (supplierData, newCategory) => {
    try {
      console.log('📝 Yeni tedarikçi ekleniyor:', supplierData)
      
      // Yeni kategori varsa önce onu ekle
      if (newCategory?.name) {
        console.log('📝 Yeni kategori ekleniyor:', newCategory)
        await createSupplierCategory(newCategory)
      }
      
      // Tedarikçiyi ekle
      await createSupplier(supplierData)
      console.log('✅ Tedarikçi başarıyla eklendi')
      
      setIsAddSupplierModalOpen(false)
    } catch (error) {
      console.error('❌ Tedarikçi ekleme hatası:', error)
      alert('Tedarikçi eklenirken bir hata oluştu: ' + error.message)
    }
  }



  // Tedarikçi detaylarını görüntüle
  const handleSupplierDetails = (supplier) => {
    console.log('👁️ Tedarikçi detayları görüntüleniyor:', supplier)
    // SuppliersTable'daki modal handleRowClick fonksiyonu ile otomatik açılacak
    // Bu fonksiyon artık gerekli değil çünkü modal SuppliersTable içinde
  }

  return (
    <div className="stocks-tab-content">
      <div className="materials-header-section">
        {!isFiltersExpanded && (
          <>
            <div className="materials-dashboard-container">
              <SuppliersDashboard suppliers={filteredSuppliers} />
            </div>
            <div className="materials-actions-container">
              <div className="materials-actions">
                <button 
                  type="button" 
                  className="add-material-btn"
                  onClick={() => setIsAddSupplierModalOpen(true)}
                  disabled={suppliersLoading}
                >
                  + Yeni Tedarikçi
                </button>
              </div>
            </div>
          </>
        )}
        <div className="materials-filters-container">
          <SuppliersFilters 
            filters={filters}
            onFilterChange={handleFilterChange}
            isExpanded={isFiltersExpanded}
            onToggleExpanded={setIsFiltersExpanded}
          />
        </div>
      </div>
      
      {suppliersError && (
        <div className="error-message" style={{ 
          padding: '1rem', 
          margin: '1rem 0', 
          backgroundColor: '#fee', 
          border: '1px solid #fcc', 
          borderRadius: '4px',
          color: '#c33'
        }}>
          Tedarikçiler yüklenirken hata oluştu: {suppliersError}
        </div>
      )}
      
      <SuppliersTable 
        suppliers={filteredSuppliers}
        categories={supplierCategories} 
        onSupplierDetails={handleSupplierDetails}
        loading={suppliersLoading}
        suppliersLoading={suppliersLoading}
        onUpdateSupplier={updateSupplier}
        onDeleteSupplier={deleteSupplier}
        onRefreshSuppliers={refetchSuppliers}
        handleDeleteMaterial={handleDeleteMaterial}
      />
      
      <AddSupplierModal
        isOpen={isAddSupplierModalOpen}
        onClose={() => {
          setIsAddSupplierModalOpen(false)
        }}
        onSave={handleAddSupplier}
        categories={supplierCategories}
      />
    </div>
  )
}