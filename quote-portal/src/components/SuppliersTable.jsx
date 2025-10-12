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
  const [showMaterialAddOptions, setShowMaterialAddOptions] = useState(false)
  const [showExistingMaterials, setShowExistingMaterials] = useState(false)
  const [showNewMaterialModal, setShowNewMaterialModal] = useState(false)
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
    setShowMaterialAddOptions(false)
    setShowExistingMaterials(false)
    setShowNewMaterialModal(false)
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
      <div className="modal-overlay" onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleCloseModal();
        }
      }}>
        <div className="modal-content" onClick={(e) => {
          e.stopPropagation();
          setShowMaterialAddOptions(false);
        }} style={{ display: 'flex', flexDirection: 'column', maxHeight: '90vh', position: 'relative' }}>
          <div className="modal-header" style={{ flexShrink: 0 }}>
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
          
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <form onSubmit={handleSubmit} className="modal-form" id="supplier-form" style={{ height: '100%' }}>
            {/* Üst Bölüm: Yan yana iki div - Firma Bilgileri ve İletişim */}
            <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
              
              {/* Sol Div: Firma Bilgileri */}
              <div style={{ flex: 1, border: '1px solid #e0e0e0', padding: '15px', borderRadius: '6px' }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '14px', fontWeight: '600', color: '#374151' }}>Firma Bilgileri</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', minWidth: '100px', color: '#374151' }}>Tedarikçi No:</span>
                    <input
                      type="text"
                      name="code"
                      value={formData.code}
                      readOnly
                      className="readonly-input"
                      style={{ border: 'none', background: 'transparent', padding: '2px', flex: 1 }}
                    />
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', minWidth: '100px', color: '#374151' }}>Firma Adı:</span>
                    {isEditing ? (
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        className="editable-input"
                        style={{ flex: 1 }}
                      />
                    ) : (
                      <span style={{ flex: 1, padding: '2px', color: '#1f2937' }}>{formData.name}</span>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', minWidth: '100px', color: '#374151' }}>Vergi No:</span>
                    {isEditing ? (
                      <input
                        type="text"
                        name="taxNumber"
                        value={formData.taxNumber}
                        onChange={handleInputChange}
                        className="editable-input"
                        style={{ flex: 1 }}
                      />
                    ) : (
                      <span style={{ flex: 1, padding: '2px', color: '#1f2937' }}>{formData.taxNumber}</span>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', minWidth: '100px', color: '#374151' }}>Yetkili Kişi:</span>
                    {isEditing ? (
                      <input
                        type="text"
                        name="contactPerson"
                        value={formData.contactPerson}
                        onChange={handleInputChange}
                        className="editable-input"
                        style={{ flex: 1 }}
                      />
                    ) : (
                      <span style={{ flex: 1, padding: '2px', color: '#1f2937' }}>{formData.contactPerson}</span>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', minWidth: '100px', color: '#374151' }}>Durum:</span>
                    {isEditing ? (
                      <select
                        name="status"
                        value={formData.status}
                        onChange={handleInputChange}
                        className="editable-input"
                        style={{ flex: 1 }}
                      >
                        <option value="Aktif">Aktif</option>
                        <option value="Pasif">Pasif</option>
                      </select>
                    ) : (
                      <span style={{ flex: 1, padding: '2px', color: '#1f2937' }}>{formData.status}</span>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Sağ Div: İletişim Bilgileri */}
              <div style={{ flex: 1, border: '1px solid #e0e0e0', padding: '15px', borderRadius: '6px' }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '14px', fontWeight: '600', color: '#374151' }}>İletişim</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', minWidth: '80px', color: '#374151' }}>Mail1:</span>
                    {isEditing ? (
                      <input
                        type="email"
                        name="email1"
                        value={formData.email1}
                        onChange={handleInputChange}
                        className="editable-input"
                        style={{ flex: 1 }}
                      />
                    ) : (
                      <span style={{ flex: 1, padding: '2px', color: '#1f2937' }}>{formData.email1}</span>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', minWidth: '80px', color: '#374151' }}>Mail2:</span>
                    {isEditing ? (
                      <input
                        type="email"
                        name="email2"
                        value={formData.email2}
                        onChange={handleInputChange}
                        className="editable-input"
                        style={{ flex: 1 }}
                      />
                    ) : (
                      <span style={{ flex: 1, padding: '2px', color: '#1f2937' }}>{formData.email2}</span>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', minWidth: '80px', color: '#374151' }}>Tel1:</span>
                    {isEditing ? (
                      <input
                        type="text"
                        name="phone1"
                        value={formData.phone1}
                        onChange={handleInputChange}
                        className="editable-input"
                        style={{ flex: 1 }}
                      />
                    ) : (
                      <span style={{ flex: 1, padding: '2px', color: '#1f2937' }}>{formData.phone1}</span>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', minWidth: '80px', color: '#374151' }}>Tel2:</span>
                    {isEditing ? (
                      <input
                        type="text"
                        name="phone2"
                        value={formData.phone2}
                        onChange={handleInputChange}
                        className="editable-input"
                        style={{ flex: 1 }}
                      />
                    ) : (
                      <span style={{ flex: 1, padding: '2px', color: '#1f2937' }}>{formData.phone2}</span>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', minWidth: '80px', color: '#374151' }}>Fax1:</span>
                    {isEditing ? (
                      <input
                        type="text"
                        name="fax1"
                        value={formData.fax1 || ''}
                        onChange={handleInputChange}
                        className="editable-input"
                        style={{ flex: 1 }}
                      />
                    ) : (
                      <span style={{ flex: 1, padding: '2px', color: '#1f2937' }}>{formData.fax1}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Orta Bölüm: Adres */}
            <div style={{ border: '1px solid #e0e0e0', padding: '15px', borderRadius: '6px', marginBottom: '20px' }}>
              <div>
                {isEditing ? (
                  <div>
                    <strong style={{ color: '#000000' }}>Adres:</strong>{' '}
                    <textarea
                      name="address"
                      value={formData.address}
                      onChange={handleInputChange}
                      className="editable-input"
                      rows="3"
                      style={{ width: '100%', resize: 'vertical', marginTop: '5px' }}
                    />
                  </div>
                ) : (
                  <div>
                    <strong style={{ color: '#000000' }}>Adres:</strong>{' '}
                    <span style={{ lineHeight: '1.4', color: '#1f2937' }}>{formData.address}</span>
                  </div>
                )}
              </div>
            </div>
            
            {/* Alt Bölüm: Tedarik Bilgileri */}
            <div style={{ border: '1px solid #e0e0e0', padding: '15px', borderRadius: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', position: 'relative' }}>
                <h3 style={{ margin: '0', fontSize: '14px', fontWeight: '600', color: '#374151' }}>Tedarik Bilgileri</h3>
                <div style={{ position: 'relative' }}>
                  <button 
                    type="button" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMaterialAddOptions(!showMaterialAddOptions);
                    }}
                    className="btn btn-primary btn-sm"
                    style={{ 
                      fontSize: '12px', 
                      padding: '6px 12px',
                      background: '#d4af37',
                      border: 'none',
                      borderRadius: '4px',
                      color: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    + Malzeme Ekle
                    <span style={{ fontSize: '10px' }}>
                      {showMaterialAddOptions ? '▲' : '▼'}
                    </span>
                  </button>
                  
                  {/* Malzeme Ekleme Seçenekleri Dropdown */}
                  {showMaterialAddOptions && (
                    <div 
                      style={{
                        position: 'absolute',
                        right: '0',
                        top: '100%',
                        background: 'white',
                        border: '1px solid #e0e0e0',
                        borderRadius: '6px',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                        zIndex: 1001,
                        minWidth: '200px',
                        marginTop: '4px'
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowMaterialAddOptions(false);
                          setShowExistingMaterials(true);
                        }}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          border: 'none',
                          background: 'white',
                          textAlign: 'left',
                          cursor: 'pointer',
                          borderBottom: '1px solid #f0f0f0',
                          borderRadius: '6px 6px 0 0'
                        }}
                        onMouseEnter={(e) => e.target.style.background = '#f8f9fa'}
                        onMouseLeave={(e) => e.target.style.background = 'white'}
                      >
                        📋 Mevcut Malzemelerden Seç
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowMaterialAddOptions(false);
                          setShowNewMaterialModal(true);
                        }}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          border: 'none',
                          background: 'white',
                          textAlign: 'left',
                          cursor: 'pointer',
                          borderRadius: '0 0 6px 6px'
                        }}
                        onMouseEnter={(e) => e.target.style.background = '#f8f9fa'}
                        onMouseLeave={(e) => e.target.style.background = 'white'}
                      >
                        ➕ Yeni Malzeme Ekle
                      </button>
                    </div>
                  )}
                </div>
              </div>
              
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '15px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc' }}>
                    <th style={{ border: '1px solid #e0e0e0', padding: '8px', textAlign: 'left' }}>Kategori</th>
                    <th style={{ border: '1px solid #e0e0e0', padding: '8px', textAlign: 'left' }}>Malzeme No</th>
                    <th style={{ border: '1px solid #e0e0e0', padding: '8px', textAlign: 'left' }}>Malzeme Adı</th>
                    <th style={{ border: '1px solid #e0e0e0', padding: '8px', textAlign: 'right' }}>Son Fiyat</th>
                    <th style={{ border: '1px solid #e0e0e0', padding: '8px', textAlign: 'center' }}>Son Tedarik</th>
                    <th style={{ border: '1px solid #e0e0e0', padding: '8px', textAlign: 'right' }}>Toplam Miktar</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ border: '1px solid #e0e0e0', padding: '8px' }}>{getCategoryLabel(formData.category)}</td>
                    <td style={{ border: '1px solid #e0e0e0', padding: '8px' }}>-</td>
                    <td style={{ border: '1px solid #e0e0e0', padding: '8px' }}>-</td>
                    <td style={{ border: '1px solid #e0e0e0', padding: '8px', textAlign: 'right' }}>-</td>
                    <td style={{ border: '1px solid #e0e0e0', padding: '8px', textAlign: 'center' }}>{formData.lastOrderDate}</td>
                    <td style={{ border: '1px solid #e0e0e0', padding: '8px', textAlign: 'right' }}>{formData.totalOrders}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #e0e0e0', padding: '8px' }}>-</td>
                    <td style={{ border: '1px solid #e0e0e0', padding: '8px' }}>-</td>
                    <td style={{ border: '1px solid #e0e0e0', padding: '8px' }}>-</td>
                    <td style={{ border: '1px solid #e0e0e0', padding: '8px' }}>-</td>
                    <td style={{ border: '1px solid #e0e0e0', padding: '8px' }}>-</td>
                    <td style={{ border: '1px solid #e0e0e0', padding: '8px' }}>-</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #e0e0e0', padding: '8px' }}>-</td>
                    <td style={{ border: '1px solid #e0e0e0', padding: '8px' }}>-</td>
                    <td style={{ border: '1px solid #e0e0e0', padding: '8px' }}>-</td>
                    <td style={{ border: '1px solid #e0e0e0', padding: '8px' }}>-</td>
                    <td style={{ border: '1px solid #e0e0e0', padding: '8px' }}>-</td>
                    <td style={{ border: '1px solid #e0e0e0', padding: '8px' }}>-</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #e0e0e0', padding: '8px' }}>-</td>
                    <td style={{ border: '1px solid #e0e0e0', padding: '8px' }}>-</td>
                    <td style={{ border: '1px solid #e0e0e0', padding: '8px' }}>-</td>
                    <td style={{ border: '1px solid #e0e0e0', padding: '8px' }}>-</td>
                    <td style={{ border: '1px solid #e0e0e0', padding: '8px' }}>-</td>
                    <td style={{ border: '1px solid #e0e0e0', padding: '8px' }}>-</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#f8fafc', fontWeight: '600' }}>
                    <td colSpan="5" style={{ border: '1px solid #e0e0e0', padding: '8px', textAlign: 'right' }}>#Toplam Tedarik</td>
                    <td style={{ border: '1px solid #e0e0e0', padding: '8px', textAlign: 'right' }}>{formData.totalOrders}</td>
                  </tr>
                </tfoot>
              </table>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontWeight: '600', minWidth: '120px', color: '#374151' }}>Ödeme Koşulları:</span>
                  {isEditing ? (
                    <input
                      type="text"
                      name="paymentTerms"
                      value={formData.paymentTerms}
                      onChange={handleInputChange}
                      className="editable-input"
                      style={{ flex: 1 }}
                    />
                  ) : (
                    <span style={{ flex: 1, padding: '2px', color: '#1f2937' }}>{formData.paymentTerms}</span>
                  )}
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontWeight: '600', minWidth: '120px', color: '#374151' }}>Son Sipariş Tarihi:</span>
                  <span style={{ flex: 1, padding: '2px', color: '#1f2937' }}>{formData.lastOrderDate}</span>
                  <small style={{ color: '#9ca3af', fontSize: '11px', fontStyle: 'italic', marginLeft: '8px' }}>*Otomatik güncellenir</small>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontWeight: '600', minWidth: '120px', color: '#374151' }}>Toplam Sipariş:</span>
                  <span style={{ flex: 1, padding: '2px', color: '#1f2937' }}>{formData.totalOrders}</span>
                  <small style={{ color: '#9ca3af', fontSize: '11px', fontStyle: 'italic', marginLeft: '8px' }}>*Otomatik hesaplanır</small>
                </div>
              </div>
            </div>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // Mevcut Malzemeler Modal'ı
  const ExistingMaterialsModal = () => {
    if (!showExistingMaterials) return null

    // Örnek malzemeler listesi - gerçekte stok tablosundan gelecek
    const existingMaterials = [
      { id: 1, code: 'MAL-001', name: 'Çelik Profil 40x40', category: 'Demir-Çelik' },
      { id: 2, code: 'MAL-002', name: 'Alüminyum Levha 2mm', category: 'Alüminyum' },
      { id: 3, code: 'MAL-003', name: 'Demir Çubuk 12mm', category: 'Demir-Çelik' },
      { id: 4, code: 'MAL-004', name: 'Bakır Boru 15mm', category: 'Bakır' }
    ]

    return (
      <div className="modal-overlay" style={{ zIndex: 1002 }} onClick={() => setShowExistingMaterials(false)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', zIndex: 1002 }}>
          <div className="modal-header">
            <h2>Mevcut Malzemelerden Seç</h2>
            <button className="modal-close" onClick={() => setShowExistingMaterials(false)}>×</button>
          </div>
          
          <div className="modal-form">
            <div style={{ marginBottom: '20px' }}>
              <input 
                type="text" 
                placeholder="Malzeme ara..." 
                style={{ 
                  width: '100%', 
                  padding: '10px', 
                  border: '1px solid #e0e0e0', 
                  borderRadius: '4px' 
                }}
              />
            </div>
            
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {existingMaterials.map(material => (
                <div 
                  key={material.id}
                  style={{ 
                    padding: '12px', 
                    border: '1px solid #f0f0f0', 
                    borderRadius: '4px', 
                    marginBottom: '8px',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#f8f9fa'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'white'}
                  onClick={() => {
                    // Malzemeyi tedarikçiye ekle
                    console.log('Malzeme eklendi:', material);
                    setShowExistingMaterials(false);
                  }}
                >
                  <div style={{ fontWeight: '600' }}>{material.code} - {material.name}</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>Kategori: {material.category}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Yeni Malzeme Modal'ı  
  const NewMaterialModal = () => {
    if (!showNewMaterialModal) return null

    return (
      <div className="modal-overlay" style={{ zIndex: 1002 }} onClick={() => setShowNewMaterialModal(false)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px', zIndex: 1002 }}>
          <div className="modal-header">
            <h2>Yeni Malzeme Ekle</h2>
            <button className="modal-close" onClick={() => setShowNewMaterialModal(false)}>×</button>
          </div>
          
          <div className="modal-form">
            <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Malzeme Kodu</label>
                <input 
                  type="text" 
                  placeholder="MAL-001" 
                  style={{ 
                    width: '100%', 
                    padding: '10px', 
                    border: '1px solid #e0e0e0', 
                    borderRadius: '4px' 
                  }}
                />
              </div>
              <div style={{ flex: 2 }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Malzeme Adı</label>
                <input 
                  type="text" 
                  placeholder="Çelik Profil 40x40" 
                  style={{ 
                    width: '100%', 
                    padding: '10px', 
                    border: '1px solid #e0e0e0', 
                    borderRadius: '4px' 
                  }}
                />
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Kategori</label>
                <select 
                  style={{ 
                    width: '100%', 
                    padding: '10px', 
                    border: '1px solid #e0e0e0', 
                    borderRadius: '4px' 
                  }}
                >
                  <option value="">Kategori seçin</option>
                  <option value="demir-celik">Demir-Çelik</option>
                  <option value="aluminyum">Alüminyum</option>
                  <option value="bakir">Bakır</option>
                  <option value="plastik">Plastik</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Birim</label>
                <select 
                  style={{ 
                    width: '100%', 
                    padding: '10px', 
                    border: '1px solid #e0e0e0', 
                    borderRadius: '4px' 
                  }}
                >
                  <option value="">Birim seçin</option>
                  <option value="kg">kg</option>
                  <option value="adet">Adet</option>
                  <option value="metre">Metre</option>
                  <option value="m2">m²</option>
                </select>
              </div>
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Açıklama</label>
              <textarea 
                rows="3" 
                placeholder="Malzeme açıklaması..." 
                style={{ 
                  width: '100%', 
                  padding: '10px', 
                  border: '1px solid #e0e0e0', 
                  borderRadius: '4px',
                  resize: 'vertical'
                }}
              />
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowNewMaterialModal(false)}
                style={{
                  padding: '10px 20px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '4px',
                  background: 'white',
                  cursor: 'pointer'
                }}
              >
                İptal
              </button>
              <button
                type="button"
                onClick={() => {
                  // Malzemeyi kaydet ve tedarikçiye ekle
                  console.log('Yeni malzeme kaydedildi ve tedarikçiye eklendi');
                  setShowNewMaterialModal(false);
                }}
                style={{
                  padding: '10px 20px',
                  border: 'none',
                  borderRadius: '4px',
                  background: '#d4af37',
                  color: 'white',
                  cursor: 'pointer'
                }}
              >
                Malzemeyi Kaydet ve Tedarikçiye Ekle
              </button>
            </div>
          </div>
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
      
      {/* Modal Renders */}
      <SupplierDetailModal 
        supplier={selectedSupplier}
        isOpen={isDetailModalOpen}
        onClose={handleCloseModal}
      />
      <ExistingMaterialsModal />
      <NewMaterialModal />
    </div>
  )
}