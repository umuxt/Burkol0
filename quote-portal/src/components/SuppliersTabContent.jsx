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
  const toggleExpanded = () => {
    onToggleExpanded(!isExpanded)
  }

  return (
    <section className="materials-filters">
      <div style={{ 
        display: 'flex', 
        alignItems: 'flex-start', 
        gap: '8px',
        width: '100%',
        flexDirection: isExpanded ? 'row' : 'row-reverse'
      }}>
        {/* Sol taraf - Genişletme butonu */}
        <div style={{
          paddingLeft: '4px',
          display: 'flex',
          alignItems: 'center',
          height: '100%'
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
        <div className="filters-container" style={{ 
          flex: isExpanded ? 1 : 'none',
          width: isExpanded ? '100%' : 'auto'
        }}>
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
              <button type="button" className="quick-filter-btn ">🔴 Pasif Tedarikçiler</button>
              {isExpanded && (
                <>
                  <button type="button" className="quick-filter-btn ">⭐ A Kredi Notu</button>
                  <button type="button" className="quick-filter-btn ">🏭 Üreticiler</button>
                  <button type="button" className="quick-filter-btn ">🌍 Yurtdışı</button>
                </>
              )}
            </div>
          </div>
          <div className="dropdown-filters">
            <div className="filter-group">
              <div className="multi-select-container">
                <div className="multi-select-header">
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
                <div className="multi-select-header">
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
                    <div className="multi-select-header">
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
                    <div className="multi-select-header">
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

export default function SuppliersTabContent({ categories, handleAddMaterial }) {
  const [isAddSupplierModalOpen, setIsAddSupplierModalOpen] = useState(false)
  const [isTransitioningToMaterial, setIsTransitioningToMaterial] = useState(false)
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
    addMaterialToSupplier 
  } = useSuppliers()
  
  const { 
    categories: supplierCategories, 
    addCategory: createSupplierCategory 
  } = useSupplierCategories()

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

  // Tedarikçi modalından yeni malzeme ekleme
  const handleAddMaterialFromSupplier = (onMaterialCreated) => {
    console.log('🔄 Tedarikçi modalından malzeme ekleme modalına geçiş yapılıyor...')
    setIsTransitioningToMaterial(true)
    setIsAddSupplierModalOpen(false) // Önce tedarikçi modalını kapat
    
    // DOM güncellemesini bekle
    requestAnimationFrame(() => {
      setTimeout(() => {
        console.log('🔄 Malzeme ekleme modalı açılıyor...')
        setIsTransitioningToMaterial(false)
        // Yeni malzeme oluşturulduktan sonra callback'i de ilet
        handleAddMaterial(onMaterialCreated) // Sonra malzeme modalını aç
      }, 100)
    })
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
        <div className="materials-filters-container" style={{ 
          flex: isFiltersExpanded ? 1 : 'initial',
          maxWidth: isFiltersExpanded ? '100%' : 'initial'
        }}>
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
        onAddNewMaterial={handleAddMaterialFromSupplier}
        loading={suppliersLoading}
        onUpdateSupplier={updateSupplier}
        onDeleteSupplier={deleteSupplier}
        onAddMaterialToSupplier={addMaterialToSupplier}
      />
      
      <AddSupplierModal
        isOpen={isAddSupplierModalOpen}
        onClose={() => setIsAddSupplierModalOpen(false)}
        onSave={handleAddSupplier}
        onAddNewMaterial={handleAddMaterialFromSupplier}
        categories={supplierCategories}
      />
    </div>
  )
}