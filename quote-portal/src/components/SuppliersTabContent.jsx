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
function SuppliersFilters({ onSearch, searchQuery, isExpanded, onToggleExpanded }) {
  
  // Quick filter state
  const [activeFilters, setActiveFilters] = useState({
    inactive: false,
    payment30Days: false,
    fastDelivery: false,
    aCredit: false,
    manufacturers: false,
    international: false
  });

  // Quick filter handler
  const toggleQuickFilter = (filterName) => {
    setActiveFilters(prev => ({
      ...prev,
      [filterName]: !prev[filterName]
    }));
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
        <div className="filters-container" style={{ order: 2 }}>
          <div className="search-section">
            <div className="search-input-container">
              <input 
                placeholder="Tedarikçi adı, kodu veya kategoriye göre ara..." 
                className="search-input" 
                type="text" 
                value={searchQuery}
                onChange={(e) => onSearch(e.target.value)}
              />
              <span className="search-icon">🔍</span>
            </div>
            <div className="quick-filters">
              <button 
                type="button" 
                className={`quick-filter-btn ${activeFilters.inactive ? 'active' : ''}`}
                onClick={() => toggleQuickFilter('inactive')}
              >
                🔴 Pasif Tedarikçiler
              </button>
              <button 
                type="button" 
                className={`quick-filter-btn ${activeFilters.payment30Days ? 'active' : ''}`}
                onClick={() => toggleQuickFilter('payment30Days')}
              >
                💰 30 Gün Vade
              </button>
              <button 
                type="button" 
                className={`quick-filter-btn ${activeFilters.fastDelivery ? 'active' : ''}`}
                onClick={() => toggleQuickFilter('fastDelivery')}
              >
                ⚡ Hızlı Teslimat
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
                    <input type="checkbox" />
                    <span>Üretici</span>
                  </label>
                  <label className="multi-select-option">
                    <input type="checkbox" />
                    <span>Distribütör</span>
                  </label>
                  <label className="multi-select-option">
                    <input type="checkbox" />
                    <span>Toptancı</span>
                  </label>
                  <label className="multi-select-option">
                    <input type="checkbox" />
                    <span>Hizmet Sağlayıcı</span>
                  </label>
                  <label className="multi-select-option">
                    <input type="checkbox" />
                    <span>Yüklenici</span>
                  </label>
                  <label className="multi-select-option">
                    <input type="checkbox" />
                    <span>Danışman</span>
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
                    <input type="checkbox" />
                    <span>Türkiye</span>
                  </label>
                  <label className="multi-select-option">
                    <input type="checkbox" />
                    <span>Almanya</span>
                  </label>
                  <label className="multi-select-option">
                    <input type="checkbox" />
                    <span>Fransa</span>
                  </label>
                  <label className="multi-select-option">
                    <input type="checkbox" />
                    <span>İtalya</span>
                  </label>
                  <label className="multi-select-option">
                    <input type="checkbox" />
                    <span>ABD</span>
                  </label>
                  <label className="multi-select-option">
                    <input type="checkbox" />
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
                        <input type="checkbox" />
                        <span>A - Mükemmel</span>
                      </label>
                      <label className="multi-select-option">
                        <input type="checkbox" />
                        <span>B - İyi</span>
                      </label>
                      <label className="multi-select-option">
                        <input type="checkbox" />
                        <span>C - Orta</span>
                      </label>
                      <label className="multi-select-option">
                        <input type="checkbox" />
                        <span>D - Zayıf</span>
                      </label>
                      <label className="multi-select-option">
                        <input type="checkbox" />
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
                        <input type="checkbox" />
                        <span>Düşük Risk</span>
                      </label>
                      <label className="multi-select-option">
                        <input type="checkbox" />
                        <span>Orta Risk</span>
                      </label>
                      <label className="multi-select-option">
                        <input type="checkbox" />
                        <span>Yüksek Risk</span>
                      </label>
                    </div>
                  </div>
                </div>
              </>
            )}
            
            {/* Yeni Eklenen Filtreler */}
            <div className="filter-group">
              <div className="multi-select-container">
                <div className="multi-select-header" onClick={() => toggleDropdown('certificates-dropdown')}>
                  Sertifikalar seçin...
                  <span className="dropdown-arrow">▼</span>
                </div>
                <div id="certificates-dropdown" className="multi-select-dropdown" style={{ display: 'none' }}>
                  <label className="multi-select-option">
                    <input type="checkbox" />
                    <span>ISO 9001</span>
                  </label>
                  <label className="multi-select-option">
                    <input type="checkbox" />
                    <span>ISO 14001</span>
                  </label>
                  <label className="multi-select-option">
                    <input type="checkbox" />
                    <span>CE Belgesi</span>
                  </label>
                  <label className="multi-select-option">
                    <input type="checkbox" />
                    <span>TSE Belgesi</span>
                  </label>
                  <label className="multi-select-option">
                    <input type="checkbox" />
                    <span>OHSAS 18001</span>
                  </label>
                  <label className="multi-select-option">
                    <input type="checkbox" />
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
                    <input type="checkbox" />
                    <span>1.000 TL ve altı</span>
                  </label>
                  <label className="multi-select-option">
                    <input type="checkbox" />
                    <span>1.000 - 5.000 TL</span>
                  </label>
                  <label className="multi-select-option">
                    <input type="checkbox" />
                    <span>5.000 - 10.000 TL</span>
                  </label>
                  <label className="multi-select-option">
                    <input type="checkbox" />
                    <span>10.000 - 50.000 TL</span>
                  </label>
                  <label className="multi-select-option">
                    <input type="checkbox" />
                    <span>50.000 TL ve üzeri</span>
                  </label>
                  <label className="multi-select-option">
                    <input type="checkbox" />
                    <span>Minimum yok</span>
                  </label>
                </div>
              </div>
            </div>
            
            <div className="filter-group">
              <div className="status-toggle-container">
                <div className="status-toggle-header ">
                  <span className="status-icon">🔄</span>
                  <span>Filtresiz</span>
                  <span className="toggle-arrow">🔄</span>
                </div>
              </div>
            </div>
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
  categories
}) {
  const [isAddSupplierModalOpen, setIsAddSupplierModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false)
  
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

  // Filter suppliers based on search query
  const filteredSuppliers = suppliers.filter(supplier => 
    supplier.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    supplier.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    supplier.contactPerson?.toLowerCase().includes(searchQuery.toLowerCase())
  )

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
            onSearch={setSearchQuery}
            searchQuery={searchQuery}
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