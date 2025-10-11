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
    creditLimit: 500000,
    balance: 125000
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
    creditLimit: 300000,
    balance: 75000
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
    creditLimit: 750000,
    balance: 200000
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
    creditLimit: 200000,
    balance: 45000
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
    creditLimit: 150000,
    balance: 0
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
              <th style={{ whiteSpace: 'nowrap' }}>
                <button 
                  type="button"
                  onClick={() => handleSort('balance')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    font: 'inherit',
                    color: sortField === 'balance' ? '#007bff' : 'inherit'
                  }}
                >
                  Bakiye {getSortIcon('balance')}
                </button>
              </th>
              <th style={{ whiteSpace: 'nowrap' }}>
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
                    padding: 0,
                    font: 'inherit',
                    color: sortField === 'status' ? '#007bff' : 'inherit'
                  }}
                >
                  Durum {getSortIcon('status')}
                </button>
              </th>
              <th>İşlemler</th>
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
                onClick={() => {
                  onSupplierDetails && onSupplierDetails(supplier)
                }}
              >
                <td
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid #e2e8f0',
                    fontSize: '13px'
                  }}
                >
                  <span style={{ fontFamily: 'monospace', fontWeight: '600' }}>
                    {supplier.code}
                  </span>
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
                    textAlign: 'right',
                    padding: '8px 12px',
                    borderBottom: '1px solid #e2e8f0',
                    fontSize: '13px'
                  }}
                >
                  <div style={{ 
                    fontWeight: '600', 
                    color: '#059669',
                    background: 'transparent'
                  }}>
                    {formatCurrency(supplier.balance)}
                  </div>
                  <div style={{ 
                    fontSize: '10px', 
                    color: '#6b7280', 
                    marginTop: '2px',
                    background: 'transparent'
                  }}>
                    Limit: {formatCurrency(supplier.creditLimit)}
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
                      onEditSupplier && onEditSupplier(supplier)
                    }}
                    title="Tedarikçiyi Düzenle"
                    onMouseOver={(e) => e.target.style.background = '#fef3c7'}
                    onMouseOut={(e) => e.target.style.background = 'none'}
                  >
                    ✏️
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
                      // İletişim modal'ı açılacak
                    }}
                    title="İletişim Bilgileri"
                    onMouseOver={(e) => e.target.style.background = '#d1fae5'}
                    onMouseOut={(e) => e.target.style.background = 'none'}
                  >
                    📞
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}