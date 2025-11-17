import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus, Download } from 'lucide-react'
import SuppliersTable from './SuppliersTable'
import AddSupplierModal from './AddSupplierModal'
import SuppliersFilters from './SuppliersFilters'
import { useCategories } from '../hooks/useCategories'
import { useSuppliers } from '../hooks/useSuppliers'

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

  // Clear all filters at once
  const handleClearAllFilters = () => {
    setFilters({
      search: '',
      status: 'Tümü',
      supplierTypes: [],
      countries: [],
      paymentTerms: [],
      deliveryTime: [],
      creditRating: []
    })
    setSearchQuery('')
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

  // Dashboard calculations
  const activeSuppliers = filteredSuppliers?.filter(s => s.status === 'active' || s.status === 'Aktif').length || 0
  const thisMonthOrders = filteredSuppliers?.reduce((acc, s) => acc + (s.monthlyOrders || 0), 0) || 0

  return (
    <div className="stocks-tab-content">
      {/* MES Filter Bar: Dashboard + Actions + Filters */}
      <div className="mes-filter-bar" style={{marginBottom: '24px'}}>
        {/* Dashboard - Inline Single Line */}
        <div className="materials-dashboard-container">
          <section className="materials-dashboard is-inline">
            <div className="stat">
              <span className="stat-label">Aktif Tedarikçi</span>
              <span className="stat-value">{activeSuppliers}</span>
            </div>
            <div className="divider"></div>
            <div className="stat">
              <span className="stat-label">Bu Ay Sipariş</span>
              <span className="stat-value">{thisMonthOrders}</span>
            </div>
          </section>
        </div>

        {/* Action Buttons */}
        <button
          type="button"
          className="mes-primary-action is-compact"
          onClick={() => setIsAddSupplierModalOpen(true)}
          disabled={suppliersLoading}
        >
          <Plus size={14} />
          <span>Yeni Tedarikçi</span>
        </button>
        <button
          type="button"
          className="mes-filter-button is-compact"
          onClick={handleExportSuppliersCSV}
          disabled={suppliersLoading || activeSuppliers === 0}
          title="Tüm tedarikçileri dışa aktar"
        >
          <Download size={14} />
          <span>CSV</span>
        </button>

        {/* Filters Component */}
        <SuppliersFilters
          filters={filters}
          onFilterChange={handleFilterChange}
          onClearAll={handleClearAllFilters}
        />
      </div>

      {/* Suppliers Table */}
      <div className="materials-table-container">
        <SuppliersTable 
          suppliers={categoryFilteredSuppliers}
          onSupplierDetails={handleSupplierDetails}
          loading={suppliersLoading}
          suppliersLoading={suppliersLoading}
          onUpdateSupplier={updateSupplierWithRefresh}
          onDeleteSupplier={deleteSupplier}
          onRefreshSuppliers={refetchSuppliers}
          handleDeleteMaterial={handleDeleteMaterial}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          categories={categories}
        />
      </div>

      <AddSupplierModal
        isOpen={isAddSupplierModalOpen}
        onClose={() => setIsAddSupplierModalOpen(false)}
        onSave={handleAddSupplier}
      />
    </div>
  )
}
