import React, { useState, useEffect, useMemo, useCallback } from 'react'
import SuppliersTable from './SuppliersTable'
import AddSupplierModal from './AddSupplierModal'
import { useCategories } from '../hooks/useCategories'
import { useSuppliers } from '../../domains/materials/hooks/useSuppliers'

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
function SuppliersFilters({ filters, onFilterChange, isExpanded, onToggleExpanded, resultsCount, hasActiveFilters }) {
  
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
    const nonTurkeyCountries = ['Almanya', 'İtalya', 'Çin']; // Gerçek ülke listesi
    
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

  // Clear all filters function (component içinde, prop olarak onFilterChange kullanır)
  const clearFilters = () => {
    console.log('🧹 Tüm filtreler temizleniyor...');
    console.log('🔍 Mevcut filters:', filters);
    console.log('🔍 Mevcut activeFilters:', activeFilters);
    
    // Tüm filter alanlarını sıfırla
    onFilterChange('search', '');
    onFilterChange('status', 'Tümü'); // Default status
    onFilterChange('supplierTypes', []);
    onFilterChange('countries', []);
    onFilterChange('paymentTerms', []);
    onFilterChange('deliveryTime', []);
    onFilterChange('creditRating', []);
    
    // ActiveFilters state'ini de sıfırla (quick filters için) - tüm alanları dahil et
    setActiveFilters({
      inactive: false,
      payment30Days: false,
      aCredit: false,
      manufacturers: false,
      international: false
    });
    
    console.log('✅ Tüm filtreler temizlendi');
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
        const nonTurkeyCountries = ['Almanya', 'İtalya', 'Çin']; // Gerçek ülke listesi
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
          paddingTop: '20px',
          display: 'flex',
          alignItems: 'center',
          height: '100%',
          order: 1,
          flexDirection: 'column',
          gap: '4px'
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
          
          {/* Sonuç sayısı - kompakt */}
          {(resultsCount !== undefined) && (
            <div style={{
              fontSize: '11px',
              color: hasActiveFilters ? '#1e40af' : '#6b7280',
              fontWeight: hasActiveFilters ? '600' : '400',
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
              <button 
                type="button" 
                className={`quick-filter-btn ${activeFilters.aCredit ? 'active' : ''}`}
                onClick={() => toggleQuickFilter('aCredit')}
              >
                ⭐ A Kredi Notu
              </button>
              {isExpanded && (
                <>
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
                  {filters.supplierTypes?.length > 0 
                    ? `${filters.supplierTypes.length} tip seçildi`
                    : 'Tedarikçi Tipi seçin...'
                  }
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
                <div className="multi-select-header" onClick={() => toggleDropdown('countries-dropdown')}>
                  {filters.countries?.length > 0 
                    ? `${filters.countries.length} ülke seçildi`
                    : 'Ülke seçin...'
                  }
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
                      checked={filters.countries.includes('İtalya')}
                      onChange={() => handleMultiSelectChange('countries', 'İtalya')}
                    />
                    <span>İtalya</span>
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
            <div className="filter-group">
              <div className="multi-select-container">
                <div className="multi-select-header" onClick={() => toggleDropdown('credit-rating-dropdown')}>
                  {filters.creditRating?.length > 0 
                    ? `${filters.creditRating.length} kredi notu seçildi`
                    : 'Kredi Notu seçin...'
                  }
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
            {isExpanded && (
              <>
                <div className="filter-group">
                  <div className="multi-select-container">
                    <div className="multi-select-header" onClick={() => toggleDropdown('payment-terms-dropdown')}>
                      {filters.paymentTerms?.length > 0 
                        ? `${filters.paymentTerms.length} ödeme koşulu seçildi`
                        : 'Ödeme Koşulları seçin...'
                      }
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
                      {filters.deliveryTime?.length > 0 
                        ? `${filters.deliveryTime.length} teslimat süresi seçildi`
                        : 'Teslimat Süresi seçin...'
                      }
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
                
              </>
            )}
            
            {/* Filtreleri Kaldır butonu - diğer filtrelerle aynı hizada */}
            {hasActiveFilters && (
              <div className="filter-group">
                <div className="multi-select-container">
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
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
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
  handleDeleteMaterial,
  isActive = false
}) {
  const [isAddSupplierModalOpen, setIsAddSupplierModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false)
  const [activeCategory, setActiveCategory] = useState('all')
  
  // Filter state - moved from SuppliersFilters
  const [filters, setFilters] = useState({
    search: '',
    status: 'Tümü', // Aktif, Pasif, Tümü - default Tümü
    supplierTypes: [],
    countries: [],
    paymentTerms: [],
    deliveryTime: [],
    creditRating: []
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
  
  // Backend API hooks - lazy loading based on active tab
  const { 
    suppliers, 
    loading: suppliersLoading, 
    error: suppliersError, 
    addSupplier: createSupplier, 
    updateSupplier, 
    deleteSupplier,
    refetch: refetchSuppliers
  } = useSuppliers(isActive)

  // Wrapper for updateSupplier to refresh suppliers after update
  const updateSupplierWithRefresh = useCallback(async (...args) => {
    try {
      const result = await updateSupplier(...args)
      // Başarılı update sonrası suppliers'ı refresh et
      await refetchSuppliers()
      return result
    } catch (error) {
      // Hata durumunda orijinal hatayı fırlat
      throw error
    }
  }, [updateSupplier, refetchSuppliers])

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

    // Credit rating filter
    const creditMatch = filters.creditRating.length === 0 || 
      filters.creditRating.includes(supplier.creditRating);

    return searchMatch && statusMatch && typeMatch && 
           paymentMatch && deliveryMatch && countryMatch && creditMatch;
  })

  // Apply category tab filter (All vs selected material category)
  const categoryFilteredSuppliers = useMemo(() => {
    if (activeCategory === 'all') return filteredSuppliers
    return filteredSuppliers.filter(s => (s.suppliedMaterials || []).some(m => m?.category === activeCategory))
  }, [filteredSuppliers, activeCategory])

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
      (filters.paymentTerms && filters.paymentTerms.length > 0) ||
      (filters.deliveryTime && filters.deliveryTime.length > 0) ||
      (filters.creditRating && filters.creditRating.length > 0)
    );
    
    return isActive;
  };

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

  // CSV Export (frontend; sadece mevcut backend'den gelen veriyi kullanır)
  const handleExportSuppliersCSV = () => {
    try {
      const rows = (categoryFilteredSuppliers || filteredSuppliers || suppliers || [])
      if (!rows || rows.length === 0) return

      // Dinamik başlık seti: tüm tedarikçi alanlarının birleşimi
      const headerSet = new Set()
      rows.forEach(s => Object.keys(s || {}).forEach(k => headerSet.add(k)))
      // Özel/hesaplanmış alanlar
      const extraHeaders = ['categories', 'suppliedMaterialsCount']
      extraHeaders.forEach(h => headerSet.add(h))

      // Başlık sıralamasını düzenle (önemli alanlar öne)
      const preferredOrder = [
        'id','code','companyName','name','contactPerson','phone1','phone2','email1','email2',
        'country','city','address','taxOffice','taxNumber','paymentTerms','leadTime','creditRating','status',
        'createdAt','updatedAt','categories','suppliedMaterialsCount','suppliedMaterials'
      ]
      const headers = [...new Set([...preferredOrder, ...headerSet])]

      const csvLines = []
      csvLines.push(headers.join(','))

      rows.forEach(s => {
        const categories = Array.from(new Set((s.suppliedMaterials || []).map(m => m?.category).filter(Boolean))).join(' | ')
        const suppliedMaterialsCount = (s.suppliedMaterials || []).length

        const rowObj = { ...s, categories, suppliedMaterialsCount }
        const vals = headers.map(h => {
          let v = rowObj[h]
          if (v == null) v = ''
          // Nesne/array alanları JSON string olarak yaz
          if (typeof v === 'object') {
            try { v = JSON.stringify(v) } catch { v = '' }
          }
          const str = String(v)
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"'
          }
          return str
        })
        csvLines.push(vals.join(','))
      })

      const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `tedarikciler_${new Date().toISOString().slice(0,10)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('CSV dışa aktarım hatası:', err)
      alert('CSV dışa aktarımında hata oluştu')
    }
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
                <button 
                  type="button" 
                  className="csv-export-btn"
                  title="Tüm tedarikçileri dışa aktar"
                  onClick={() => handleExportSuppliersCSV()}
                  disabled={suppliersLoading || (filteredSuppliers?.length || 0) === 0}
                >
                  📊 CSV
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
            resultsCount={filteredSuppliers?.length || 0}
            hasActiveFilters={hasActiveFilters()}
          />
        </div>
      </div>
      {/* Kategori Sekmeleri + Tablo: Stoklardaki gibi aynı kart içinde */}
      <section className="materials-table">
        <CategoryTabs suppliers={filteredSuppliers} activeCategory={activeCategory} onCategoryChange={setActiveCategory} />
        <div style={{ padding: 0 }}>
          <SuppliersTable 
            suppliers={categoryFilteredSuppliers}
            onSupplierDetails={handleSupplierDetails}
            loading={suppliersLoading}
            suppliersLoading={suppliersLoading}
            onUpdateSupplier={updateSupplierWithRefresh}
            onDeleteSupplier={deleteSupplier}
            onRefreshSuppliers={refetchSuppliers}
            handleDeleteMaterial={handleDeleteMaterial}
          />
        </div>
      </section>

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

      <AddSupplierModal
        isOpen={isAddSupplierModalOpen}
        onClose={() => {
          setIsAddSupplierModalOpen(false)
        }}
        onSave={handleAddSupplier}
      />
    </div>
  )
}

// Basit kategori sekmeleri (stoklar/siparişlerdeki görünümle uyumlu)
function CategoryTabs({ suppliers, activeCategory, onCategoryChange }) {
  const { categories, loading } = useCategories(true)
  const materialCategories = useMemo(() => (categories || []).filter(c => c.type === 'material' || !c.type), [categories])

  const counts = useMemo(() => {
    const map = { all: suppliers?.length || 0 }
    for (const cat of materialCategories) {
      const count = (suppliers || []).filter(s => (s.suppliedMaterials || []).some(m => m?.category === cat.id)).length
      map[cat.id] = count
    }
    return map
  }, [suppliers, materialCategories])

  const tabs = useMemo(() => [
    { id: 'all', label: 'Tümünü Göster' },
    ...materialCategories.map(c => ({ id: c.id, label: c.name || c.label || c.id }))
  ], [materialCategories])

  if (!suppliers) return null

  return (
    <div className="materials-tabs">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`tab-button ${activeCategory === tab.id ? 'active' : ''}`}
          onClick={() => onCategoryChange(tab.id)}
          disabled={loading && tab.id !== 'all'}
        >
          {tab.label}
          <span className="tab-count">({counts[tab.id] ?? 0})</span>
        </button>
      ))}
    </div>
  )
}
