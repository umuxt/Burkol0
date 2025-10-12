import React, { useState } from 'react'

const dummySuppliers = [
  {
    id: 1,
    code: 'TED-001',
    name: 'Kocaeli Metal San. A.Ş.',
    category: 'demir_celik',
    contactPerson: 'Mehmet Yılmaz',
    phone1: '+90 262 555 0101',
    phone2: '+90 262 555 0102',
    email1: 'mehmet@kocaelimetal.com',
    email2: 'info@kocaelimetal.com',
    address: 'Gebze OSB, Kocaeli',
    taxNumber: '1234567890',
    paymentTerms: '30 gün vade',
    rating: 4.8,
    status: 'Aktif',
    totalOrders: 45,
    lastOrderDate: '2024-10-08',
    creditLimit: 500000
  },
  {
    id: 2,
    code: 'TED-002',
    name: 'Ankara Plastik Ltd.',
    category: 'plastik',
    contactPerson: 'Ayşe Kaya',
    phone1: '+90 312 555 0202',
    phone2: '+90 312 555 0203',
    email1: 'ayse@ankaraplastik.com',
    email2: 'satis@ankaraplastik.com',
    address: 'Ostim OSB, Ankara',
    taxNumber: '2345678901',
    paymentTerms: '45 gün vade',
    rating: 4.5,
    status: 'Aktif',
    totalOrders: 32,
    lastOrderDate: '2024-10-05',
    creditLimit: 300000
  },
  {
    id: 3,
    code: 'TED-003',
    name: 'İzmir Alüminyum A.Ş.',
    category: 'aluminyum',
    contactPerson: 'Ali Demir',
    phone1: '+90 232 555 0303',
    phone2: '+90 232 555 0304',
    email1: 'ali@izmiraluminyum.com',
    email2: 'genel@izmiraluminyum.com',
    address: 'Atatürk OSB, İzmir',
    taxNumber: '3456789012',
    paymentTerms: '60 gün vade',
    rating: 4.9,
    status: 'Aktif',
    totalOrders: 67,
    lastOrderDate: '2024-10-10',
    creditLimit: 750000
  },
  {
    id: 4,
    code: 'TED-004',
    name: 'Bursa Bağlantı Elemanları',
    category: 'baglanti_elemani',
    contactPerson: 'Fatma Özkan',
    phone1: '+90 224 555 0404',
    phone2: '+90 224 555 0405',
    email1: 'fatma@bursabaglanti.com',
    email2: 'siparis@bursabaglanti.com',
    address: 'Nilüfer OSB, Bursa',
    taxNumber: '4567890123',
    paymentTerms: '15 gün vade',
    rating: 4.2,
    status: 'Aktif',
    totalOrders: 89,
    lastOrderDate: '2024-10-09',
    creditLimit: 200000
  },
  {
    id: 5,
    code: 'TED-005',
    name: 'Antalya Panel Sistemleri',
    category: 'panel_sistemleri',
    contactPerson: 'Hasan Çelik',
    phone1: '+90 242 555 0505',
    phone2: '+90 242 555 0506',
    email1: 'hasan@antalyapanel.com',
    email2: 'muhasebe@antalyapanel.com',
    address: 'AOSB, Antalya',
    taxNumber: '5678901234',
    paymentTerms: '30 gün vade',
    rating: 3.8,
    status: 'Pasif',
    totalOrders: 12,
    lastOrderDate: '2024-09-15',
    creditLimit: 150000
  }
]

export default function SuppliersTable({ 
  categories = [], 
  onEditSupplier, 
  onSupplierDetails 
}) {
  const [activeTab, setActiveTab] = useState('all')
  const [sortField, setSortField] = useState('')
  const [sortDirection, setSortDirection] = useState('asc')
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    category: '',
    contactPerson: '',
    phone1: '',
    phone2: '',
    email1: '',
    email2: '',
    address: '',
    taxNumber: '',
    paymentTerms: '',
    status: 'Aktif',
    totalOrders: 0,
    lastOrderDate: '',
    fax1: ''
  })

  // Dinamik kategoriler - main.jsx'den gelen categories kullanılacak
  const supplierCategories = categories.length > 0 ? categories : [
    { id: 'demir_celik', label: 'Demir-Çelik' },
    { id: 'plastik', label: 'Plastik' },
    { id: 'aluminyum', label: 'Alüminyum' },
    { id: 'baglanti_elemani', label: 'Bağlantı Elemanı' },
    { id: 'panel_sistemleri', label: 'Panel Sistemleri' }
  ]

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const getSortIcon = (field) => {
    if (sortField !== field) {
      return <span style={{ fontSize: '12px', opacity: 0.6 }}>↕</span>
    }
    return sortDirection === 'asc' 
      ? <span style={{ fontSize: '12px', opacity: 1 }}>↑</span>
      : <span style={{ fontSize: '12px', opacity: 1 }}>↓</span>
  }

  const tabs = [
    { id: 'all', label: 'Tümünü Göster' },
    ...supplierCategories.map(category => ({
      id: category.id,
      label: category.label
    }))
  ]

  const filteredSuppliers = activeTab === 'all' 
    ? dummySuppliers 
    : dummySuppliers.filter(supplier => supplier.category === activeTab)

  // Sıralama işlemi
  const filteredAndSortedSuppliers = [...filteredSuppliers].sort((a, b) => {
    if (!sortField) return 0
    
    let aValue = a[sortField]
    let bValue = b[sortField]

    // Kategori alanı için özel işlem
    if (sortField === 'category') {
      aValue = supplierCategories.find(c => c.id === a.category)?.label || a.category
      bValue = supplierCategories.find(c => c.id === b.category)?.label || b.category
    }

    // Numerik değerler için
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
    }

    // String değerler için
    const comparison = String(aValue).localeCompare(String(bValue))
    return sortDirection === 'asc' ? comparison : -comparison
  })

  const getCategoryLabel = (categoryId) => {
    return supplierCategories.find(c => c.id === categoryId)?.label || categoryId
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY'
    }).format(amount)
  }

  const getStatusColor = (status) => {
    return status === 'Aktif' ? '#10b981' : '#ef4444'
  }

  const getRatingStars = (rating) => {
    const fullStars = Math.floor(rating)
    const hasHalfStar = rating % 1 !== 0
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
        {'⭐'.repeat(fullStars)}
        {hasHalfStar && '⭐'}
        <span style={{ fontSize: '11px', color: '#6b7280', marginLeft: '4px' }}>({rating})</span>
      </div>
    )
  }

  const handleRowClick = (supplier) => {
    setSelectedSupplier(supplier)
    setFormData({
      code: supplier.code,
      name: supplier.name,
      category: supplier.category,
      contactPerson: supplier.contactPerson,
      phone1: supplier.phone1,
      phone2: supplier.phone2,
      email1: supplier.email1,
      email2: supplier.email2,
      address: supplier.address,
      taxNumber: supplier.taxNumber,
      paymentTerms: supplier.paymentTerms,
      status: supplier.status,
      totalOrders: supplier.totalOrders,
      lastOrderDate: supplier.lastOrderDate,
      fax1: supplier.fax1 || ''
    })
    setIsEditing(false)
    setIsDetailModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsDetailModalOpen(false)
    setSelectedSupplier(null)
    setIsEditing(false)
    setFormData({
      code: '',
      name: '',
      category: '',
      contactPerson: '',
      phone1: '',
      phone2: '',
      email1: '',
      email2: '',
      address: '',
      taxNumber: '',
      paymentTerms: '',
      status: 'Aktif',
      totalOrders: 0,
      lastOrderDate: '',
      fax1: ''
    })
  }

  const handleUnlock = () => {
    setIsEditing(true)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    
    // Sadece editing mode'dayken submit et
    if (!isEditing) {
      return
    }
    
    // Burada Firebase'e kaydetme işlemi yapılacak
    console.log('Tedarikçi kaydediliyor:', formData)
    
    // Şimdilik sadece state'i güncelleyelim
    setSelectedSupplier(formData)
    
    // Kaydet işleminden sonra kilitli moda dön
    setIsEditing(false)
    
    // onEditSupplier callback'ini çağır
    if (onEditSupplier) {
      onEditSupplier(formData)
    }
  }

  const handleInputChange = (e) => {
    // Sadece editing mode'dayken input değişikliğine izin ver
    if (!isEditing) {
      return
    }
    
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const SupplierDetailModal = ({ supplier, isOpen, onClose }) => {
    if (!isOpen || !supplier) return null

    return (
      <div className="modal-overlay" onClick={handleCloseModal}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Tedarikçi Detayları</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {!isEditing ? (
                <button type="button" onClick={(e) => { e.preventDefault(); handleUnlock(); }} className="btn-edit">
                  🔒 Düzenle
                </button>
              ) : (
                <button type="submit" form="supplier-form" className="btn-save">
                  🔓 Kaydet
                </button>
              )}
              <button className="modal-close" onClick={handleCloseModal}>×</button>
            </div>
          </div>
          
          <form onSubmit={handleSubmit} className="modal-form" id="supplier-form">
            <div className="form-row">
              <div className="form-group">
                <label>Tedarikçi Kodu</label>
                <input
                  type="text"
                  value={formData.code}
                  readOnly
                  className="readonly-input"
                />
                <small className="form-help">Tedarikçi kodu değiştirilemez</small>
              </div>
              
              <div className="form-group">
                <label>Firma Adı *</label>
                <input
                  type="text"
                  value={formData.name}
                  disabled={!isEditing}
                  className={isEditing ? "editable-input" : "readonly-input"}
                  onChange={(e) => isEditing && handleInputChange('name', e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Kategori *</label>
                <select
                  value={formData.category}
                  disabled={!isEditing}
                  className={isEditing ? "editable-input" : "readonly-input"}
                  onChange={(e) => isEditing && handleInputChange('category', e.target.value)}
                >
                  <option value="">Kategori seçin</option>
                  {supplierCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Yetkili Kişi</label>
                <input
                  type="text"
                  value={formData.contactPerson}
                  disabled={!isEditing}
                  className={isEditing ? "editable-input" : "readonly-input"}
                  onChange={(e) => isEditing && handleInputChange('contactPerson', e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Telefon 1</label>
                <input
                  type="text"
                  value={formData.phone1}
                  disabled={!isEditing}
                  className={isEditing ? "editable-input" : "readonly-input"}
                  onChange={(e) => isEditing && handleInputChange('phone1', e.target.value)}
                />
              </div>
              
              <div className="form-group">
                <label>Telefon 2</label>
                <input
                  type="text"
                  value={formData.phone2}
                  disabled={!isEditing}
                  className={isEditing ? "editable-input" : "readonly-input"}
                  onChange={(e) => isEditing && handleInputChange('phone2', e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Email 1</label>
                <input
                  type="email"
                  value={formData.email1}
                  disabled={!isEditing}
                  className={isEditing ? "editable-input" : "readonly-input"}
                  onChange={(e) => isEditing && handleInputChange('email1', e.target.value)}
                />
              </div>
              
              <div className="form-group">
                <label>Email 2</label>
                <input
                  type="email"
                  value={formData.email2}
                  disabled={!isEditing}
                  className={isEditing ? "editable-input" : "readonly-input"}
                  onChange={(e) => isEditing && handleInputChange('email2', e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Adres</label>
                <input
                  type="text"
                  value={formData.address}
                  disabled={!isEditing}
                  className={isEditing ? "editable-input" : "readonly-input"}
                  onChange={(e) => isEditing && handleInputChange('address', e.target.value)}
                />
              </div>
              
              <div className="form-group">
                <label>Vergi No</label>
                <input
                  type="text"
                  value={formData.taxNumber}
                  disabled={!isEditing}
                  className={isEditing ? "editable-input" : "readonly-input"}
                  onChange={(e) => isEditing && handleInputChange('taxNumber', e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Ödeme Koşulları</label>
                <input
                  type="text"
                  value={formData.paymentTerms}
                  disabled={!isEditing}
                  className={isEditing ? "editable-input" : "readonly-input"}
                  onChange={(e) => isEditing && handleInputChange('paymentTerms', e.target.value)}
                />
              </div>
              
              <div className="form-group">
                <label>Durum</label>
                <select
                  value={formData.status}
                  disabled={!isEditing}
                  className={isEditing ? "editable-input" : "readonly-input"}
                  onChange={(e) => isEditing && handleInputChange('status', e.target.value)}
                >
                  <option value="Aktif">Aktif</option>
                  <option value="Pasif">Pasif</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Toplam Sipariş</label>
                <input
                  type="number"
                  value={formData.totalOrders}
                  disabled
                  className="readonly-input"
                />
                <small className="form-help">Otomatik hesaplanır</small>
              </div>
              
              <div className="form-group">
                <label>Son Sipariş Tarihi</label>
                <input
                  type="text"
                  value={formData.lastOrderDate}
                  disabled
                  className="readonly-input"
                />
                <small className="form-help">Otomatik güncellenir</small>
              </div>
            </div>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="materials-table">
      {/* Tab Navigation */}
      <div className="materials-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            <span className="tab-count">
              ({tab.id === 'all' ? dummySuppliers.length : dummySuppliers.filter(s => s.category === tab.id).length})
            </span>
          </button>
        ))}
      </div>

      {/* Table Content */}
      <div 
        className="table-content"
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '0 0 8px 8px',
          overflow: 'hidden'
        }}
      >
        <table 
          className="table"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '13px',
            backgroundColor: '#ffffff'
          }}
        >
          <thead>
            <tr 
              style={{
                backgroundColor: '#f8fafc',
                borderBottom: '2px solid #e2e8f0'
              }}
            >
                            <th 
                style={{ 
                  whiteSpace: 'nowrap',
                  padding: '12px 8px',
                  textAlign: 'left',
                  fontWeight: '600',
                  fontSize: '12px',
                  color: '#374151',
                  borderBottom: '2px solid #e2e8f0'
                }}
              >
                <button 
                  type="button"
                  onClick={() => handleSort('code')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0',
                    margin: '0',
                    fontWeight: '600',
                    fontSize: '12px',
                    color: sortField === 'code' ? '#007bff' : '#374151',
                    fontFamily: 'inherit'
                  }}
                >
                  Kod
                  {getSortIcon('code')}
                </button>
              </th>
              <th style={{ whiteSpace: 'nowrap' }}>
                <button 
                  type="button"
                  onClick={() => handleSort('name')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    font: 'inherit',
                    color: sortField === 'name' ? '#007bff' : 'inherit'
                  }}
                >
                  Firma Adı {getSortIcon('name')}
                </button>
              </th>
              <th style={{ whiteSpace: 'nowrap' }}>
                <button 
                  type="button"
                  onClick={() => handleSort('category')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    font: 'inherit',
                    color: sortField === 'category' ? '#007bff' : 'inherit'
                  }}
                >
                  Kategori {getSortIcon('category')}
                </button>
              </th>
              <th>İletişim</th>
              <th style={{ whiteSpace: 'nowrap' }}>
                <button 
                  type="button"
                  onClick={() => handleSort('rating')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    font: 'inherit',
                    color: sortField === 'rating' ? '#007bff' : 'inherit'
                  }}
                >
                  Değerlendirme {getSortIcon('rating')}
                </button>
              </th>
              <th style={{ whiteSpace: 'nowrap' }}>
                <button 
                  type="button"
                  onClick={() => handleSort('totalOrders')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    font: 'inherit',
                    color: sortField === 'totalOrders' ? '#007bff' : 'inherit'
                  }}
                >
                  Sipariş Sayısı {getSortIcon('totalOrders')}
                </button>
              </th>
              <th 
                style={{ 
                  whiteSpace: 'nowrap',
                  padding: '12px 8px',
                  textAlign: 'left',
                  fontWeight: '600',
                  fontSize: '12px',
                  color: '#374151',
                  borderBottom: '2px solid #e2e8f0'
                }}
              >
                <button 
                  type="button"
                  onClick={() => handleSort('status')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0',
                    margin: '0',
                    fontWeight: '600',
                    fontSize: '12px',
                    color: sortField === 'status' ? '#007bff' : '#374151',
                    fontFamily: 'inherit'
                  }}
                >
                  Durum
                  {getSortIcon('status')}
                </button>
              </th>
              <th 
                style={{ 
                  whiteSpace: 'nowrap',
                  padding: '12px 8px',
                  textAlign: 'center',
                  fontWeight: '600',
                  fontSize: '12px',
                  color: '#374151',
                  borderBottom: '2px solid #e2e8f0'
                }}
              >
                İşlemler
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedSuppliers.map((supplier, index) => (
              <tr 
                key={supplier.id} 
                className={`clickable-row ${index % 2 === 0 ? 'even' : 'odd'}`}
                style={{
                  backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#f9fafb'
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = index % 2 === 0 ? '#ffffff' : '#f8fafc'
                }}
                onClick={() => handleRowClick(supplier)}
              >
                <td
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid #e2e8f0',
                    fontSize: '13px'
                  }}
                >
                  {supplier.code}
                </td>
                <td
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid #e2e8f0',
                    fontSize: '13px'
                  }}
                >
                  <div style={{ background: 'transparent' }}>
                    <strong>{supplier.name}</strong>
                    <div style={{ 
                      fontSize: '12px', 
                      color: '#6b7280', 
                      marginTop: '2px',
                      background: 'transparent'
                    }}>
                      {supplier.contactPerson}
                    </div>
                  </div>
                </td>
                <td
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid #e2e8f0',
                    fontSize: '13px'
                  }}
                >
                  <span className="material-type">
                    {getCategoryLabel(supplier.category)}
                  </span>
                </td>
                <td
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid #e2e8f0',
                    fontSize: '13px'
                  }}
                >
                  <div style={{ 
                    fontSize: '12px', 
                    lineHeight: '1.4',
                    background: 'transparent'
                  }}>
                    <div style={{ background: 'transparent' }}>{supplier.phone1}</div>
                    <div style={{ 
                      color: '#6b7280',
                      background: 'transparent'
                    }}>{supplier.email1}</div>
                  </div>
                </td>
                <td
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid #e2e8f0',
                    fontSize: '13px'
                  }}
                >
                  {getRatingStars(supplier.rating)}
                </td>
                <td 
                  style={{ 
                    textAlign: 'center',
                    padding: '8px 12px',
                    borderBottom: '1px solid #e2e8f0',
                    fontSize: '13px'
                  }}
                >
                  <strong>{supplier.totalOrders}</strong>
                  <div style={{ 
                    fontSize: '10px', 
                    color: '#6b7280', 
                    marginTop: '2px',
                    background: 'transparent'
                  }}>
                    Son: {supplier.lastOrderDate}
                  </div>
                </td>
                <td
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid #e2e8f0',
                    fontSize: '13px'
                  }}
                >
                  <span 
                    className="status-badge"
                    style={{ 
                      backgroundColor: supplier.status === 'Aktif' ? '#dcfce7' : '#fee2e2',
                      color: getStatusColor(supplier.status),
                      padding: '4px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: '500'
                    }}
                  >
                    {supplier.status}
                  </span>
                </td>
                <td 
                  style={{ 
                    textAlign: 'center',
                    padding: '8px 12px',
                    borderBottom: '1px solid #e2e8f0',
                    fontSize: '13px'
                  }}
                >
                  <button 
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      margin: '0 2px',
                      borderRadius: '4px',
                      transition: 'background 0.2s'
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      // Telefon arama işlemi
                      window.open(`tel:${supplier.phone1}`)
                    }}
                    title={`Telefon: ${supplier.phone1}`}
                    onMouseOver={(e) => e.target.style.background = '#dbeafe'}
                    onMouseOut={(e) => e.target.style.background = 'none'}
                  >
                    📞
                  </button>
                  <button 
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      margin: '0 2px',
                      borderRadius: '4px',
                      transition: 'background 0.2s'
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      // Mail gönderme işlemi
                      window.open(`mailto:${supplier.email1}`)
                    }}
                    title={`Email: ${supplier.email1}`}
                    onMouseOver={(e) => e.target.style.background = '#fef3c7'}
                    onMouseOut={(e) => e.target.style.background = 'none'}
                  >
                    ✉️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <SupplierDetailModal 
        supplier={selectedSupplier}
        isOpen={isDetailModalOpen}
        onClose={handleCloseModal}
      />
    </div>
  )
}