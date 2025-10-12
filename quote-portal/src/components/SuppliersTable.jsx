import React, { useState } from 'react'
import { useMaterials } from '../hooks/useFirebaseMaterials'

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
  onSupplierDetails,
  onAddNewMaterial
}) {
  // Firebase'den malzemeleri getir
  const { materials, loading: materialsLoading } = useMaterials(true)
  
  const [activeTab, setActiveTab] = useState('all')
  const [sortField, setSortField] = useState('')
  const [sortDirection, setSortDirection] = useState('asc')
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [showMaterialAddOptions, setShowMaterialAddOptions] = useState(false)
  const [showExistingMaterials, setShowExistingMaterials] = useState(false)
  const [materialSearchTerm, setMaterialSearchTerm] = useState('')
  const [supplierMaterials, setSupplierMaterials] = useState([]) // Tedarikçiye eklenen malzemeler
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
    // Tedarikçi değiştiğinde malzemeler listesini temizle
    setSupplierMaterials([])
    setIsEditing(false)
    setIsDetailModalOpen(true)
  }

  // Mevcut malzeme ekleme fonksiyonu
  const handleAddExistingMaterial = (material) => {
    const isAlreadyAdded = supplierMaterials.some(sm => sm.id === material.id)
    
    if (isAlreadyAdded) {
      alert('Bu malzeme zaten eklenmiş!')
      return
    }

    const newSupplierMaterial = {
      ...material,
      addedDate: new Date().toISOString().split('T')[0],
      lastSupplyDate: formData.lastOrderDate || new Date().toISOString().split('T')[0],
      totalSupplied: 0,
      lastPrice: material.unitPrice || 0
    }

    setSupplierMaterials(prev => [...prev, newSupplierMaterial])
    setShowExistingMaterials(false)
    setMaterialSearchTerm('')
    
    // Otomatik kaydet - Firebase'e malzeme-tedarikçi ilişkisini kaydet
    saveSupplierMaterial(newSupplierMaterial)
    console.log('Tedarikçiye malzeme eklendi ve kaydedildi:', newSupplierMaterial)
  }

  // Yeni malzeme oluşturulduğunda çağırılacak
  const handleNewMaterialCreated = (newMaterial) => {
    // Yeni malzeme otomatik olarak tedarikçiye eklenir ve kaydedilir
    handleAddExistingMaterial(newMaterial)
  }

  // Tedarikçi-malzeme ilişkisini Firebase'e kaydetme
  const saveSupplierMaterial = async (supplierMaterial) => {
    try {
      // Firebase'e tedarikçi-malzeme ilişkisini kaydet
      const supplierMaterialData = {
        supplierId: selectedSupplier?.id,
        supplierCode: formData.code,
        materialId: supplierMaterial.id,
        materialCode: supplierMaterial.code,
        addedDate: supplierMaterial.addedDate,
        lastSupplyDate: supplierMaterial.lastSupplyDate,
        lastPrice: supplierMaterial.lastPrice,
        totalSupplied: supplierMaterial.totalSupplied,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      // API call yapılacak
      console.log('Firebase\'e kaydedilecek tedarikçi-malzeme ilişkisi:', supplierMaterialData)
      
      // Burada gerçek API call'u yapacağız:
      // const response = await fetch('/api/supplier-materials', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(supplierMaterialData)
      // })
      
    } catch (error) {
      console.error('Tedarikçi-malzeme ilişkisi kaydedilirken hata:', error)
      alert('Malzeme eklenirken bir hata oluştu!')
    }
  }

  // Malzeme silme fonksiyonu - sadece düzenleme modunda
  const handleRemoveMaterial = async (materialId) => {
    if (!isEditing) {
      alert('Malzeme silmek için önce düzenleme moduna geçin!')
      return
    }

    const confirmed = window.confirm('Bu malzemeyi tedarikçiden kaldırmak istediğinizden emin misiniz?')
    if (!confirmed) return

    try {
      // Firebase'den tedarikçi-malzeme ilişkisini sil
      await deleteSupplierMaterial(materialId)
      
      setSupplierMaterials(prev => prev.filter(sm => sm.id !== materialId))
      console.log('Malzeme tedarikçiden kaldırıldı:', materialId)
      
    } catch (error) {
      console.error('Malzeme silinirken hata:', error)
      alert('Malzeme silinirken bir hata oluştu!')
    }
  }

  // Tedarikçi-malzeme ilişkisini Firebase'den silme
  const deleteSupplierMaterial = async (materialId) => {
    try {
      console.log('Firebase\'den silinecek malzeme:', materialId)
      
      // Burada gerçek API call'u yapacağız:
      // const response = await fetch(`/api/supplier-materials/${selectedSupplier?.id}/${materialId}`, {
      //   method: 'DELETE'
      // })
      
    } catch (error) {
      throw error
    }
  }

  const handleCloseModal = () => {
    setIsDetailModalOpen(false)
    setSelectedSupplier(null)
    setIsEditing(false)
    setShowMaterialAddOptions(false)
    setShowExistingMaterials(false)
    setMaterialSearchTerm('') // Arama terimini temizle
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              
              {/* Üst Bölüm: Tedarik Edilen Malzemeler */}
              <div style={{ border: '1px solid #e0e0e0', padding: '15px', borderRadius: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', position: 'relative' }}>
                  <h3 style={{ margin: '0', fontSize: '14px', fontWeight: '600', color: '#374151' }}>Tedarik Edilen Malzemeler</h3>
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
                            if (onAddNewMaterial) {
                              onAddNewMaterial(handleNewMaterialCreated);
                            }
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
                
                {/* Malzemeler Listesi */}
                <div style={{ minHeight: '100px' }}>
                  {supplierMaterials.length === 0 ? (
                    <div style={{ 
                      textAlign: 'center', 
                      padding: '40px 20px', 
                      color: '#6b7280', 
                      fontSize: '13px',
                      border: '2px dashed #e5e7eb',
                      borderRadius: '6px',
                      backgroundColor: '#f9fafb'
                    }}>
                      <div style={{ fontSize: '24px', marginBottom: '8px' }}>📦</div>
                      <div style={{ fontWeight: '500', marginBottom: '4px' }}>Henüz malzeme eklenmedi</div>
                      <div style={{ fontSize: '11px', color: '#9ca3af' }}>Yukarıdaki "Malzeme Ekle" butonunu kullanarak malzeme ekleyebilirsiniz</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {supplierMaterials.map((material, index) => (
                        <div
                          key={material.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            backgroundColor: 'white',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.backgroundColor = '#f9fafb';
                            e.target.style.borderColor = '#d1d5db';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.backgroundColor = 'white';
                            e.target.style.borderColor = '#e5e7eb';
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '12px',
                              marginBottom: '4px'
                            }}>
                              <span style={{ 
                                fontWeight: '600', 
                                fontSize: '13px', 
                                color: '#111827' 
                              }}>
                                {material.code} - {material.name}
                              </span>
                              <span style={{
                                fontSize: '10px',
                                color: '#6b7280',
                                backgroundColor: '#f3f4f6',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontWeight: '500'
                              }}>
                                {getCategoryLabel(material.category)}
                              </span>
                            </div>
                            <div style={{ 
                              fontSize: '11px', 
                              color: '#6b7280',
                              display: 'flex',
                              gap: '12px'
                            }}>
                              <span>📦 {material.stock} {material.unit}</span>
                              <span>💰 {material.lastPrice || material.unitPrice || 0} ₺</span>
                              <span>📅 {material.addedDate}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveMaterial(material.id)}
                            disabled={!isEditing}
                            style={{
                              padding: '6px',
                              border: 'none',
                              background: 'transparent',
                              color: isEditing ? '#ef4444' : '#9ca3af',
                              cursor: isEditing ? 'pointer' : 'not-allowed',
                              borderRadius: '4px',
                              fontSize: '16px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              opacity: isEditing ? 1 : 0.5
                            }}
                            onMouseEnter={(e) => {
                              if (isEditing) {
                                e.target.style.backgroundColor = '#fef2f2'
                              }
                            }}
                            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                            title={isEditing ? "Malzemeyi kaldır" : "Düzenleme moduna geçin"}
                          >
                            🗑️
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Tedarik Özeti */}
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '8px', 
                  marginTop: '15px',
                  padding: '12px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '4px',
                  border: '1px solid #e5e7eb'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', minWidth: '120px', color: '#374151', fontSize: '12px' }}>Ödeme Koşulları:</span>
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
                      <span style={{ flex: 1, padding: '2px', color: '#1f2937', fontSize: '12px' }}>{formData.paymentTerms}</span>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', minWidth: '120px', color: '#374151', fontSize: '12px' }}>Son Sipariş Tarihi:</span>
                    <span style={{ flex: 1, padding: '2px', color: '#1f2937', fontSize: '12px' }}>{formData.lastOrderDate}</span>
                    <small style={{ color: '#9ca3af', fontSize: '10px', fontStyle: 'italic', marginLeft: '8px' }}>*Otomatik güncellenir</small>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', minWidth: '120px', color: '#374151', fontSize: '12px' }}>Toplam Sipariş:</span>
                    <span style={{ flex: 1, padding: '2px', color: '#1f2937', fontSize: '12px' }}>{formData.totalOrders}</span>
                    <small style={{ color: '#9ca3af', fontSize: '10px', fontStyle: 'italic', marginLeft: '8px' }}>*Otomatik hesaplanır</small>
                  </div>
                </div>
              </div>

              {/* Alt Bölüm: Tedarik Geçmişi */}
              <div style={{ border: '1px solid #e0e0e0', padding: '15px', borderRadius: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3 style={{ margin: '0', fontSize: '14px', fontWeight: '600', color: '#374151' }}>Tedarik Geçmişi</h3>
                  <div style={{ fontSize: '11px', color: '#6b7280', fontStyle: 'italic' }}>
                    Son 12 aylık tedarik hareketleri
                  </div>
                </div>
                
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc' }}>
                      <th style={{ border: '1px solid #e0e0e0', padding: '8px', textAlign: 'left' }}>Tarih</th>
                      <th style={{ border: '1px solid #e0e0e0', padding: '8px', textAlign: 'left' }}>Malzeme No</th>
                      <th style={{ border: '1px solid #e0e0e0', padding: '8px', textAlign: 'left' }}>Malzeme Adı</th>
                      <th style={{ border: '1px solid #e0e0e0', padding: '8px', textAlign: 'right' }}>Miktar</th>
                      <th style={{ border: '1px solid #e0e0e0', padding: '8px', textAlign: 'right' }}>Birim Fiyat</th>
                      <th style={{ border: '1px solid #e0e0e0', padding: '8px', textAlign: 'right' }}>Toplam</th>
                      <th style={{ border: '1px solid #e0e0e0', padding: '8px', textAlign: 'center' }}>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan="7" style={{ 
                        border: '1px solid #e0e0e0', 
                        padding: '40px 20px', 
                        textAlign: 'center',
                        color: '#6b7280',
                        fontSize: '13px',
                        backgroundColor: '#f9fafb'
                      }}>
                        <div style={{ fontSize: '20px', marginBottom: '8px' }}>📊</div>
                        <div style={{ fontWeight: '500', marginBottom: '4px' }}>Henüz tedarik geçmişi bulunmuyor</div>
                        <div style={{ fontSize: '11px', color: '#9ca3af' }}>İlk tedarik işleminizden sonra geçmiş burada görünecektir</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
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

    // Malzemeleri filtrele
    const filteredMaterials = materials.filter(material => {
      const searchLower = materialSearchTerm.toLowerCase();
      return material.code.toLowerCase().includes(searchLower) ||
             material.name.toLowerCase().includes(searchLower) ||
             material.category.toLowerCase().includes(searchLower);
    });

    return (
      <div className="modal-overlay" style={{ zIndex: 1002 }} onClick={() => setShowExistingMaterials(false)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', zIndex: 1002 }}>
          <div className="modal-header">
            <h2>Mevcut Malzemelerden Seç</h2>
            <button className="modal-close" onClick={() => setShowExistingMaterials(false)}>×</button>
          </div>
          
          <div className="modal-form">
            {/* Arama Kutusu */}
            <div style={{ marginBottom: '8px' }}>
              <input 
                type="text" 
                placeholder="Malzeme kodu veya adı ile ara..." 
                value={materialSearchTerm}
                onChange={(e) => setMaterialSearchTerm(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '6px 10px', 
                  border: '1px solid #e5e7eb', 
                  borderRadius: '4px',
                  fontSize: '12px',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              />
            </div>
            
            {/* Malzemeler Listesi */}
            <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
              {materialsLoading ? (
                <div style={{ textAlign: 'center', padding: '24px', color: '#6b7280', fontSize: '12px' }}>
                  <div style={{ fontSize: '14px', marginBottom: '4px' }}>🔄</div>
                  Malzemeler yükleniyor...
                </div>
              ) : filteredMaterials.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: '#6b7280', fontSize: '12px' }}>
                  <div style={{ fontSize: '16px', marginBottom: '4px' }}>📦</div>
                  {materialSearchTerm ? 'Arama kriterine uygun malzeme bulunamadı' : 'Hiç malzeme bulunamadı'}
                </div>
              ) : (
                filteredMaterials.map(material => {
                  const isInactive = material.status === 'Pasif';
                  return (
                    <div 
                      key={material.id}
                      style={{ 
                        padding: '8px', 
                        border: '1px solid #f3f4f6', 
                        borderRadius: '4px', 
                        marginBottom: '4px',
                        cursor: isInactive ? 'not-allowed' : 'pointer',
                        transition: 'all 0.1s ease',
                        background: isInactive ? '#fef7f7' : 'white',
                        opacity: isInactive ? 0.7 : 1,
                        color: isInactive ? '#9ca3af' : '#111827'
                      }}
                      onMouseEnter={(e) => {
                        if (!isInactive) {
                          e.target.style.backgroundColor = '#f9fafb';
                          e.target.style.borderColor = '#e5e7eb';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isInactive) {
                          e.target.style.backgroundColor = 'white';
                          e.target.style.borderColor = '#f3f4f6';
                        }
                      }}
                      onClick={() => {
                        if (!isInactive) {
                          handleAddExistingMaterial(material);
                        }
                      }}
                    >
                      {/* Malzeme Başlığı */}
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'flex-start',
                        marginBottom: '4px'
                      }}>
                        <div style={{ 
                          fontWeight: '600', 
                          fontSize: '12px',
                          color: isInactive ? '#9ca3af' : '#111827',
                          lineHeight: '1.3'
                        }}>
                          {material.code} - {material.name}
                        </div>
                        {isInactive && (
                          <span style={{
                            fontSize: '8px',
                            color: '#ef4444',
                            backgroundColor: '#fef2f2',
                            padding: '1px 4px',
                            borderRadius: '6px',
                            border: '1px solid #fecaca',
                            fontWeight: '600',
                            letterSpacing: '0.3px',
                            flexShrink: 0
                          }}>
                            PASİF
                          </span>
                        )}
                      </div>
                      
                      {/* Malzeme Detayları */}
                      <div style={{ 
                        fontSize: '10px', 
                        color: isInactive ? '#9ca3af' : '#6b7280',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '6px',
                        lineHeight: '1.2'
                      }}>
                        <span>📁 {material.category}</span>
                        <span>📦 {material.stock} {material.unit}</span>
                        {material.unitPrice && (
                          <span>💰 {material.unitPrice} ₺</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
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
                  onClick={() => handleSort('contactPerson')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    font: 'inherit',
                    color: sortField === 'contactPerson' ? '#007bff' : 'inherit'
                  }}
                >
                  Yetkili Kişi {getSortIcon('contactPerson')}
                </button>
              </th>
              <th style={{ whiteSpace: 'nowrap' }}>
                <button 
                  type="button"
                  onClick={() => handleSort('phone1')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    font: 'inherit',
                    color: sortField === 'phone1' ? '#007bff' : 'inherit'
                  }}
                >
                  Tel1 {getSortIcon('phone1')}
                </button>
              </th>
              <th style={{ whiteSpace: 'nowrap' }}>
                <button 
                  type="button"
                  onClick={() => handleSort('email1')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    font: 'inherit',
                    color: sortField === 'email1' ? '#007bff' : 'inherit'
                  }}
                >
                  Mail1 {getSortIcon('email1')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedSuppliers.map((supplier, index) => (
              <tr 
                key={supplier.id} 
                className="clickable-row"
                style={{
                  backgroundColor: '#ffffff',
                  borderBottom: '1px solid #e2e8f0',
                  cursor: 'pointer'
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent' }}>
                      <strong style={{ background: 'transparent' }}>{supplier.name}</strong>
                      <span 
                        className="status-badge"
                        style={{ 
                          backgroundColor: supplier.status === 'Aktif' ? '#dcfce7' : '#fee2e2',
                          color: getStatusColor(supplier.status),
                          padding: '2px 6px',
                          borderRadius: '8px',
                          fontSize: '10px',
                          fontWeight: '500',
                          flexShrink: 0
                        }}
                      >
                        {supplier.status}
                      </span>
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
                  <span style={{ background: 'transparent' }}>{supplier.contactPerson}</span>
                </td>
                <td
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid #e2e8f0',
                    fontSize: '13px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent' }}>
                    <span style={{ background: 'transparent' }}>{supplier.phone1}</span>
                    <button 
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '4px',
                        transition: 'background 0.2s'
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        window.open(`tel:${supplier.phone1}`)
                      }}
                      title={`Telefon: ${supplier.phone1}`}
                      onMouseOver={(e) => e.target.style.background = '#dbeafe'}
                      onMouseOut={(e) => e.target.style.background = 'none'}
                    >
                      📞
                    </button>
                  </div>
                </td>
                <td
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid #e2e8f0',
                    fontSize: '13px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent' }}>
                    <span style={{ background: 'transparent' }}>{supplier.email1}</span>
                    <button 
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '4px',
                        transition: 'background 0.2s'
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        window.open(`mailto:${supplier.email1}`)
                      }}
                      title={`Email: ${supplier.email1}`}
                      onMouseOver={(e) => e.target.style.background = '#fef3c7'}
                      onMouseOut={(e) => e.target.style.background = 'none'}
                    >
                      ✉️
                    </button>
                  </div>
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
    </div>
  )
}