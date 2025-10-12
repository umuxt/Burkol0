import React, { useState, useEffect } from 'react'
import { useMaterials } from '../hooks/useFirebaseMaterials'
import { useCategories } from '../hooks/useFirebaseCategories'

export default function SuppliersTable({ 
  suppliers = [],
  onEditSupplier, 
  onSupplierDetails,
  onAddNewMaterial,
  loading = false,
  onUpdateSupplier,
  onDeleteSupplier,
  onAddMaterialToSupplier,
  onRefreshSuppliers
}) {
  const { materials, loading: materialsLoading } = useMaterials(true)
  const { categories, loading: categoriesLoading } = useCategories(true)
  const [activeTab, setActiveTab] = useState('all')
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [selectedSupplierId, setSelectedSupplierId] = useState(null)
  const [showMaterialModal, setShowMaterialModal] = useState(false)
  const [sortField, setSortField] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({})

  // Firebase'den malzeme kategorilerini çıkar
  const materialCategories = React.useMemo(() => {
    // Önce Firebase categories kullan
    if (categories && categories.length > 0) {
      return categories.map(category => ({
        id: category.id,
        label: category.name || category.label || category.id
      }))
    }

    // Eğer categories yoksa, materials'dan çıkar
    if (!materials || materials.length === 0) return []
    
    // Benzersiz kategorileri topla ve daha anlamlı isimler oluştur
    const uniqueCategories = [...new Set(materials.map(material => material.category).filter(Boolean))]
    return uniqueCategories.map(category => {
      // Eğer category bir ID ise, daha kullanıcı dostu bir isim oluştur
      let displayName = category
      
      // Genel kategorileri tanı ve daha iyi isimler ver
      if (category.toLowerCase().includes('metal')) displayName = 'Metal Malzemeler'
      else if (category.toLowerCase().includes('plastik') || category.toLowerCase().includes('plastic')) displayName = 'Plastik Malzemeler'
      else if (category.toLowerCase().includes('celik') || category.toLowerCase().includes('steel')) displayName = 'Çelik Malzemeler'
      else if (category.toLowerCase().includes('alüminyum') || category.toLowerCase().includes('aluminum')) displayName = 'Alüminyum Malzemeler'
      else if (category.toLowerCase().includes('bakır') || category.toLowerCase().includes('copper')) displayName = 'Bakır Malzemeler'
      else if (category.toLowerCase().includes('paslanmaz') || category.toLowerCase().includes('stainless')) displayName = 'Paslanmaz Çelik'
      else if (category.length > 15) {
        // Eğer çok uzun bir ID ise, kısalt
        displayName = category.substring(0, 15) + '...'
      }
      
      return {
        id: category,
        label: displayName
      }
    })
  }, [categories, materials])

  // Tab yapısı - Firebase kategorilerini kullan
  const tabs = React.useMemo(() => [
    { id: 'all', label: 'Tümünü Göster' },
    ...materialCategories
  ], [materialCategories])

  // Sıralama fonksiyonu
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // Sıralama ikonu
  const getSortIcon = (field) => {
    if (sortField !== field) {
      return <span style={{ fontSize: '12px', opacity: 1, color: '#374151' }}>↕</span>
    }
    return sortDirection === 'asc' 
      ? <span style={{ fontSize: '12px', opacity: 1, color: '#007bff' }}>↑</span>
      : <span style={{ fontSize: '12px', opacity: 1, color: '#007bff' }}>↓</span>
  }

  // Tedarikçileri sadece seçili tabına göre filtrele
  const filteredSuppliers = React.useMemo(() => {
    if (activeTab === 'all') {
      return suppliers
    }
    return suppliers.filter(supplier => supplier.category === activeTab)
  }, [suppliers, activeTab])

  // Sıralama işlemi
  const filteredAndSortedSuppliers = [...filteredSuppliers].sort((a, b) => {
    if (!sortField) return 0
    
    let aValue = a[sortField]
    let bValue = b[sortField]

    // Kategori alanı için özel işlem
    if (sortField === 'category') {
      aValue = materialCategories.find(c => c.id === a.category)?.label || a.category
      bValue = materialCategories.find(c => c.id === b.category)?.label || b.category
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
    return materialCategories.find(c => c.id === categoryId)?.label || categoryId
  }

  const getStatusColor = (status) => {
    return status === 'Aktif' ? '#10b981' : '#ef4444'
  }

  const handleRowClick = (supplier) => {
    setSelectedSupplier(supplier)
    setSelectedSupplierId(supplier.id)
  }

  // Suppliers listesi değiştiğinde selectedSupplier'ı koru
  useEffect(() => {
    if (selectedSupplierId && suppliers && suppliers.length > 0) {
      const currentSupplier = suppliers.find(s => s.id === selectedSupplierId)
      if (currentSupplier) {
        // Mevcut selectedSupplier ile yeni bulunan supplier arasında fark varsa güncelle
        if (!selectedSupplier || selectedSupplier.id !== currentSupplier.id) {
          setSelectedSupplier(currentSupplier)
        } else {
          // ID aynı ama içerik güncellenmiş olabilir (örn: suppliedMaterials)
          setSelectedSupplier(currentSupplier)
        }
      }
    }
  }, [suppliers, selectedSupplierId])

  const handleCloseModal = () => {
    setIsDetailModalOpen(false)
    setSelectedSupplier(null)
    setSelectedSupplierId(null)
    setIsEditing(false)
  }

  // SupplierDetailPanel component
  const SupplierDetailPanel = () => {
    const [showExistingMaterials, setShowExistingMaterials] = useState(false)
    const [materialSearchTerm, setMaterialSearchTerm] = useState('')
    
    // Ortak stil tanımları
    const labelStyle = {
      fontSize: '12px',
      fontWeight: '500',
      color: '#374151',
      minWidth: '130px',
      flexShrink: 0
    }
    
    const inputStyle = {
      flex: 1,
      padding: '6px 8px',
      border: '1px solid #d1d5db',
      borderRadius: '4px',
      fontSize: '13px',
      boxSizing: 'border-box'
    }
    
    const getInputStyle = (editing) => ({
      ...inputStyle,
      background: !editing ? '#f3f4f6' : 'white',
      color: !editing ? '#374151' : '#111827'
    })
    
    const fieldContainerStyle = {
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }
    
    const [formData, setFormData] = useState({
      code: '',
      name: '',
      supplierType: '',
      category: '',
      businessRegistrationNumber: '',
      status: 'Aktif',
      contactPerson: '',
      emergencyContact: '',
      phone1: '',
      phone2: '',
      emergencyPhone: '',
      fax: '',
      email1: '',
      email2: '',
      website: '',
      preferredCommunication: 'email',
      address: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'Türkiye',
      taxNumber: '',
      taxOffice: '',
      currency: 'TRY',
      creditLimit: '',
      creditRating: '',
      annualRevenue: '',
      paymentTerms: '',
      paymentMethod: '',
      bankName: '',
      bankAccount: '',
      iban: '',
      deliveryCapability: '',
      leadTime: '',
      minimumOrderQuantity: '',
      qualityCertification: '',
      yearEstablished: '',
      employeeCount: '',
      riskLevel: 'low',
      complianceStatus: 'pending',
      lastOrderDate: 'Henüz sipariş yok',
      totalOrders: '0',
      notes: ''
    })

    // selectedSupplier değiştiğinde formData'yı güncelle
    useEffect(() => {
      if (selectedSupplier) {
        setFormData({
          code: selectedSupplier?.code || '',
          name: selectedSupplier?.name || '',
          supplierType: selectedSupplier?.supplierType || '',
          businessRegistrationNumber: selectedSupplier?.businessRegistrationNumber || '',
          status: selectedSupplier?.status || 'Aktif',
          contactPerson: selectedSupplier?.contactPerson || '',
          emergencyContact: selectedSupplier?.emergencyContact || '',
          phone1: selectedSupplier?.phone1 || '',
          phone2: selectedSupplier?.phone2 || '',
          emergencyPhone: selectedSupplier?.emergencyPhone || '',
          fax: selectedSupplier?.fax || '',
          email1: selectedSupplier?.email1 || '',
          email2: selectedSupplier?.email2 || '',
          website: selectedSupplier?.website || '',
          preferredCommunication: selectedSupplier?.preferredCommunication || '',
          address: selectedSupplier?.address || '',
          city: selectedSupplier?.city || '',
          state: selectedSupplier?.state || '',
          postalCode: selectedSupplier?.postalCode || '',
          country: selectedSupplier?.country || '',
          taxNumber: selectedSupplier?.taxNumber || '',
          taxOffice: selectedSupplier?.taxOffice || '',
          currency: selectedSupplier?.currency || '',
          creditLimit: selectedSupplier?.creditLimit || '',
          creditRating: selectedSupplier?.creditRating || '',
          annualRevenue: selectedSupplier?.annualRevenue || '',
          paymentTerms: selectedSupplier?.paymentTerms || '',
          paymentMethod: selectedSupplier?.paymentMethod || '',
          bankName: selectedSupplier?.bankName || '',
          bankAccount: selectedSupplier?.bankAccount || '',
          iban: selectedSupplier?.iban || '',
          deliveryCapability: selectedSupplier?.deliveryCapability || '',
          leadTime: selectedSupplier?.leadTime || '',
          minimumOrderQuantity: selectedSupplier?.minimumOrderQuantity || '',
          qualityCertification: selectedSupplier?.qualityCertification || '',
          yearEstablished: selectedSupplier?.yearEstablished || '',
          employeeCount: selectedSupplier?.employeeCount || '',
          riskLevel: selectedSupplier?.riskLevel || '',
          complianceStatus: selectedSupplier?.complianceStatus || '',
          lastOrderDate: selectedSupplier?.lastOrderDate || '',
          totalOrders: selectedSupplier?.totalOrders || '0',
          notes: selectedSupplier?.notes || ''
        })
        // setIsEditing(false) kaldırıldı - editing durumunu koru
      }
    }, [selectedSupplier?.id]) // sadece ID değiştiğinde tetikle

    // isEditing state değişimini takip et
    useEffect(() => {
      console.log('🟢 isEditing state değişti:', isEditing)
    }, [isEditing])

    const handleInputChange = (e) => {
      const { name, value } = e.target
      setFormData(prev => ({
        ...prev,
        [name]: value
      }))
    }

    const handleUnlock = (e) => {
      e.preventDefault()
      e.stopPropagation()
      console.log('🔵 Düzenle butonuna basıldı')
      console.log('🔵 Önceki isEditing değeri:', isEditing)
      setIsEditing(true)
      console.log('🔵 setIsEditing(true) çağrıldı')
    }

    const handleSave = async () => {
      try {
        if (onUpdateSupplier) {
          await onUpdateSupplier(selectedSupplier.id, formData)
        }
        setIsEditing(false)
      } catch (error) {
        console.error('Tedarikçi güncellenirken hata:', error)
        alert('Tedarikçi güncellenirken bir hata oluştu!')
      }
    }

    const handleCancel = () => {
      // Form verilerini orijinal değerlere geri yükle
      setFormData({
        code: selectedSupplier?.code || '',
        name: selectedSupplier?.name || '',
        supplierType: selectedSupplier?.supplierType || '',
        businessRegistrationNumber: selectedSupplier?.businessRegistrationNumber || '',
        status: selectedSupplier?.status || 'Aktif',
        contactPerson: selectedSupplier?.contactPerson || '',
        emergencyContact: selectedSupplier?.emergencyContact || '',
        phone1: selectedSupplier?.phone1 || '',
        phone2: selectedSupplier?.phone2 || '',
        emergencyPhone: selectedSupplier?.emergencyPhone || '',
        fax: selectedSupplier?.fax || '',
        email1: selectedSupplier?.email1 || '',
        email2: selectedSupplier?.email2 || '',
        website: selectedSupplier?.website || '',
        preferredCommunication: selectedSupplier?.preferredCommunication || '',
        address: selectedSupplier?.address || '',
        city: selectedSupplier?.city || '',
        state: selectedSupplier?.state || '',
        postalCode: selectedSupplier?.postalCode || '',
        country: selectedSupplier?.country || '',
        taxNumber: selectedSupplier?.taxNumber || '',
        taxOffice: selectedSupplier?.taxOffice || '',
        currency: selectedSupplier?.currency || '',
        creditLimit: selectedSupplier?.creditLimit || '',
        creditRating: selectedSupplier?.creditRating || '',
        annualRevenue: selectedSupplier?.annualRevenue || '',
        paymentTerms: selectedSupplier?.paymentTerms || '',
        leadTime: selectedSupplier?.leadTime || '',
        minimumOrderQuantity: selectedSupplier?.minimumOrderQuantity || '',
        yearEstablished: selectedSupplier?.yearEstablished || '',
        employeeCount: selectedSupplier?.employeeCount || '',
        certifications: selectedSupplier?.certifications || '',
        complianceStatus: selectedSupplier?.complianceStatus || '',
        lastOrderDate: selectedSupplier?.lastOrderDate || '',
        totalOrders: selectedSupplier?.totalOrders || '',
        notes: selectedSupplier?.notes || ''
      })
      setIsEditing(false)
    }

    const handleSaveSupplier = async (e) => {
      e.preventDefault()
      
      try {
        if (onUpdateSupplier && selectedSupplier) {
          await onUpdateSupplier(selectedSupplier.id, formData)
        }
        setIsEditing(false)
      } catch (error) {
        console.error('Tedarikçi güncellenirken hata:', error)
        alert('Tedarikçi güncellenirken bir hata oluştu.')
      }
    }

    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ 
          paddingBottom: '16px', 
          borderBottom: '1px solid #e5e7eb', 
          marginBottom: '20px',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111827' }}>
              {selectedSupplier.name}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {console.log('🟡 Button render - isEditing:', isEditing) || null}
              {!isEditing ? (
                <button 
                  type="button" 
                  onClick={handleUnlock}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    background: 'white',
                    color: '#374151',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  🔒 Düzenle
                </button>
              ) : (
                <button 
                  type="submit" 
                  form="supplier-detail-form"
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #3b82f6',
                    borderRadius: '6px',
                    background: '#3b82f6',
                    color: 'white',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  🔓 Kaydet
                </button>
              )}
              
              {/* İptal Butonu - sadece düzenleme modunda göster */}
              {isEditing && (
                <button 
                  type="button" 
                  onClick={handleCancel}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #6b7280',
                    borderRadius: '6px',
                    background: 'white',
                    color: '#6b7280',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  ❌ İptal
                </button>
              )}
              
              {/* Tedarikçiyi Sil Butonu */}
              <button 
                type="button" 
                onClick={() => {
                  if (window.confirm(`"${selectedSupplier.name}" tedarikçisini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`)) {
                    if (onDeleteSupplier) {
                      onDeleteSupplier(selectedSupplier.id)
                      setSelectedSupplier(null) // Silindikten sonra detay panelini kapat
                    }
                  }
                }}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #dc2626',
                  borderRadius: '6px',
                  background: '#dc2626',
                  color: 'white',
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#b91c1c'
                  e.target.style.borderColor = '#b91c1c'
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = '#dc2626'
                  e.target.style.borderColor = '#dc2626'
                }}
              >
                🗑️ Sil
              </button>
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>
            Kod: {selectedSupplier.code} | Kategori: {getCategoryLabel(selectedSupplier.category)}
          </div>
        </div>

        {/* Scrollable Content */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px' }}>
          <form onSubmit={handleSaveSupplier} id="supplier-detail-form">
            
            {/* Temel Bilgiler */}
            <div style={{ 
              marginBottom: '20px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                Temel Firma Bilgileri
              </h3>
              
              <div style={{ display: 'grid', gap: '8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '500', color: '#374151', minWidth: '130px', flexShrink: 0 }}>
                      Tedarikçi Kodu
                    </label>
                    <input
                      type="text"
                      name="code"
                      value={formData.code || ''}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '500', color: '#374151', minWidth: '130px', flexShrink: 0 }}>
                      Firma Adı
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name || ''}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Tedarikçi Tipi
                    </label>
                    {isEditing ? (
                      <select 
                        name="supplierType" 
                        value={formData.supplierType || ''} 
                        onChange={handleInputChange}
                        style={getInputStyle(isEditing)}
                      >
                        <option value="">Tedarikçi tipi seçin</option>
                        <option value="manufacturer">Üretici</option>
                        <option value="distributor">Distribütör</option>
                        <option value="wholesaler">Toptancı</option>
                        <option value="service_provider">Hizmet Sağlayıcı</option>
                        <option value="contractor">Yüklenici</option>
                        <option value="consultant">Danışman</option>
                      </select>
                    ) : (
                      <div style={getInputStyle(isEditing)}>
                        {formData.supplierType || ''}
                      </div>
                    )}
                  </div>

                </div>
                
                <div style={fieldContainerStyle}>
                  <label style={labelStyle}>
                    İş Kayıt Numarası
                  </label>
                  <input
                    type="text"
                    name="businessRegistrationNumber"
                    value={formData.businessRegistrationNumber || ''}
                    readOnly={!isEditing}
                    onChange={handleInputChange}
                    style={getInputStyle(isEditing)}
                  />
                </div>

                <div style={fieldContainerStyle}>
                  <label style={labelStyle}>
                    Durum
                  </label>
                  {isEditing ? (
                    <select 
                      name="status" 
                      value={formData.status || ''} 
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    >
                      <option value="Aktif">Aktif</option>
                      <option value="Pasif">Pasif</option>
                      <option value="Onay Bekliyor">Onay Bekliyor</option>
                      <option value="Askıda">Askıda</option>
                    </select>
                  ) : (
                    <span style={{ 
                      display: 'inline-block',
                      color: formData.status === 'Aktif' ? '#10b981' : '#ef4444',
                      fontWeight: '600',
                      padding: '6px 10px',
                      borderRadius: '12px',
                      background: formData.status === 'Aktif' ? '#dcfce7' : '#fee2e2',
                      fontSize: '12px'
                    }}>
                      {formData.status}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* İletişim Bilgileri */}
            <div style={{ 
              marginBottom: '20px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                İletişim Bilgileri
              </h3>
              
              <div style={{ display: 'grid', gap: '8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Yetkili Kişi
                    </label>
                    <input
                      type="text"
                      name="contactPerson"
                      value={formData.contactPerson || ''}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  </div>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Acil Durum İletişim
                    </label>
                    <input
                      type="text"
                      name="emergencyContact"
                      value={formData.emergencyContact || ''}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Telefon 1
                    </label>
                    <input
                      type="tel"
                      name="phone1"
                      value={formData.phone1 || ''}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  </div>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Telefon 2
                    </label>
                    <input
                      type="tel"
                      name="phone2"
                      value={formData.phone2 || ''}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Acil Durum Telefon
                    </label>
                    <input
                      type="tel"
                      name="emergencyPhone"
                      value={formData.emergencyPhone || ''}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  </div>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Faks
                    </label>
                    <input
                      type="tel"
                      name="fax"
                      value={formData.fax || ''}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      E-posta 1
                    </label>
                    <input
                      type="email"
                      name="email1"
                      value={formData.email1 || ''}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  </div>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      E-posta 2
                    </label>
                    <input
                      type="email"
                      name="email2"
                      value={formData.email2 || ''}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Web Sitesi
                    </label>
                    <input
                      type="url"
                      name="website"
                      value={formData.website || ''}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  </div>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Tercih Edilen İletişim
                    </label>
                    {isEditing ? (
                      <select 
                        name="preferredCommunication" 
                        value={formData.preferredCommunication || ''} 
                        onChange={handleInputChange}
                        style={getInputStyle(isEditing)}
                      >
                        <option value="email">E-posta</option>
                        <option value="phone">Telefon</option>
                        <option value="fax">Faks</option>
                        <option value="whatsapp">WhatsApp</option>
                      </select>
                    ) : (
                      <div style={getInputStyle(isEditing)}>
                        {formData.preferredCommunication}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Adres Bilgileri */}
            <div style={{ 
              marginBottom: '20px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                Adres Bilgileri
              </h3>
              
              <div style={{ display: 'grid', gap: '8px' }}>
                <div style={fieldContainerStyle}>
                  <label style={labelStyle}>
                    Adres
                  </label>
                  <textarea
                    name="address"
                    value={formData.address || ''}
                    readOnly={!isEditing}
                    onChange={handleInputChange}
                    rows="2"
                    style={{ 
                      ...getInputStyle(isEditing),
                      resize: 'vertical'
                    }}
                  />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Şehir
                    </label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city || ''}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  </div>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      İlçe/Bölge
                    </label>
                    <input
                      type="text"
                      name="state"
                      value={formData.state || ''}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Posta Kodu
                    </label>
                    <input
                      type="text"
                      name="postalCode"
                      value={formData.postalCode || ''}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  </div>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Ülke
                    </label>
                    {isEditing ? (
                      <select 
                        name="country" 
                        value={formData.country || ''} 
                        onChange={handleInputChange}
                        style={getInputStyle(isEditing)}
                      >
                        <option value="Türkiye">Türkiye</option>
                        <option value="Almanya">Almanya</option>
                        <option value="Fransa">Fransa</option>
                        <option value="İtalya">İtalya</option>
                        <option value="İngiltere">İngiltere</option>
                        <option value="ABD">ABD</option>
                        <option value="Çin">Çin</option>
                        <option value="Japonya">Japonya</option>
                        <option value="Other">Diğer</option>
                      </select>
                    ) : (
                      <div style={getInputStyle(isEditing)}>
                        {formData.country}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Mali Bilgiler */}
            <div style={{ 
              marginBottom: '20px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                Mali Bilgiler
              </h3>
              
              <div style={{ display: 'grid', gap: '8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Vergi Numarası
                    </label>
                    <input
                      type="text"
                      name="taxNumber"
                      value={formData.taxNumber || ''}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  </div>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Vergi Dairesi
                    </label>
                    <input
                      type="text"
                      name="taxOffice"
                      value={formData.taxOffice || ''}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Para Birimi
                    </label>
                    {isEditing ? (
                      <select 
                        name="currency" 
                        value={formData.currency || ''} 
                        onChange={handleInputChange}
                        style={getInputStyle(isEditing)}
                      >
                        <option value="">Para birimi seçin</option>
                        <option value="TRY">TRY - Türk Lirası</option>
                        <option value="USD">USD - Amerikan Doları</option>
                        <option value="EUR">EUR - Euro</option>
                        <option value="GBP">GBP - İngiliz Sterlini</option>
                      </select>
                    ) : (
                      <div style={getInputStyle(isEditing)}>
                        {formData.currency}
                      </div>
                    )}
                  </div>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Kredi Limiti
                    </label>
                    <input
                      type="number"
                      name="creditLimit"
                      value={formData.creditLimit || ''}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Kredi Notu
                    </label>
                    {isEditing ? (
                      <select 
                        name="creditRating" 
                        value={formData.creditRating || ''} 
                        onChange={handleInputChange}
                        style={getInputStyle(isEditing)}
                      >
                        <option value="">Kredi notu seçin</option>
                        <option value="A">A - Mükemmel</option>
                        <option value="B">B - İyi</option>
                        <option value="C">C - Orta</option>
                        <option value="D">D - Zayıf</option>
                        <option value="F">F - Riskli</option>
                      </select>
                    ) : (
                      <div style={getInputStyle(isEditing)}>
                        {formData.creditRating}
                      </div>
                    )}
                  </div>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Yıllık Ciro
                    </label>
                    <input
                      type="number"
                      name="annualRevenue"
                      value={formData.annualRevenue || ''}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  </div>
                </div>
                
                <div style={fieldContainerStyle}>
                  <label style={labelStyle}>
                    Ödeme Koşulları
                  </label>
                  {isEditing ? (
                    <select 
                      name="paymentTerms" 
                      value={formData.paymentTerms || ''} 
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    >
                      <option value="">Ödeme koşulu seçin</option>
                      <option value="Peşin">Peşin</option>
                      <option value="15 gün vade">15 gün vade</option>
                      <option value="30 gün vade">30 gün vade</option>
                      <option value="45 gün vade">45 gün vade</option>
                      <option value="60 gün vade">60 gün vade</option>
                      <option value="90 gün vade">90 gün vade</option>
                      <option value="120 gün vade">120 gün vade</option>
                    </select>
                  ) : (
                    <div style={getInputStyle(isEditing)}>
                      {formData.paymentTerms}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Ödeme Bilgileri */}
            <div style={{ 
              marginBottom: '20px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                Ödeme Bilgileri
              </h3>
              
              <div style={{ display: 'grid', gap: '8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Ödeme Yöntemi
                    </label>
                    {isEditing ? (
                      <select 
                        name="paymentMethod" 
                        value={formData.paymentMethod || ''} 
                        onChange={handleInputChange}
                        style={getInputStyle(isEditing)}
                      >
                        <option value="">Ödeme yöntemi seçin</option>
                        <option value="bank_transfer">Havale/EFT</option>
                        <option value="check">Çek</option>
                        <option value="cash">Nakit</option>
                        <option value="credit_card">Kredi Kartı</option>
                        <option value="letter_of_credit">Akreditif</option>
                        <option value="promissory_note">Senet</option>
                      </select>
                    ) : (
                      <div style={getInputStyle(isEditing)}>
                        {formData.paymentMethod}
                      </div>
                    )}
                  </div>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Banka Adı
                    </label>
                    <input
                      type="text"
                      name="bankName"
                      value={formData.bankName || ''}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Hesap Numarası
                    </label>
                    <input
                      type="text"
                      name="bankAccount"
                      value={formData.bankAccount || ''}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  </div>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      IBAN
                    </label>
                    <input
                      type="text"
                      name="iban"
                      value={formData.iban || ''}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Operasyonel Bilgiler */}
            <div style={{ 
              marginBottom: '20px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                Operasyonel Bilgiler
              </h3>
              
              <div style={{ display: 'grid', gap: '8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Teslimat Kapasitesi
                    </label>
                    <input
                      type="text"
                      name="deliveryCapability"
                      value={formData.deliveryCapability || ''}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  </div>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Tedarik Süresi (gün)
                    </label>
                    <input
                      type="number"
                      name="leadTime"
                      value={formData.leadTime || ''}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Minimum Sipariş Miktarı
                    </label>
                    <input
                      type="text"
                      name="minimumOrderQuantity"
                      value={formData.minimumOrderQuantity || ''}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  </div>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Kalite Sertifikası
                    </label>
                    {isEditing ? (
                      <select 
                        name="qualityCertification" 
                        value={formData.qualityCertification || ''} 
                        onChange={handleInputChange}
                        style={getInputStyle(isEditing)}
                      >
                        <option value="">Sertifika seçin</option>
                        <option value="ISO_9001">ISO 9001</option>
                        <option value="ISO_14001">ISO 14001</option>
                        <option value="TS_EN_ISO">TS EN ISO</option>
                        <option value="CE">CE İşareti</option>
                        <option value="TSE">TSE</option>
                        <option value="OHSAS_18001">OHSAS 18001</option>
                        <option value="other">Diğer</option>
                      </select>
                    ) : (
                      <div style={getInputStyle(isEditing)}>
                        {formData.qualityCertification}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Şirket Bilgileri */}
            <div style={{ 
              marginBottom: '20px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                Şirket Bilgileri
              </h3>
              
              <div style={{ display: 'grid', gap: '8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Kuruluş Yılı
                    </label>
                    <input
                      type="number"
                      name="yearEstablished"
                      value={formData.yearEstablished || ''}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      min="1900"
                      max="2025"
                      style={getInputStyle(isEditing)}
                    />
                  </div>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Çalışan Sayısı
                    </label>
                    {isEditing ? (
                      <select 
                        name="employeeCount" 
                        value={formData.employeeCount || ''} 
                        onChange={handleInputChange}
                        style={getInputStyle(isEditing)}
                      >
                        <option value="">Çalışan sayısı seçin</option>
                        <option value="1-10">1-10 kişi</option>
                        <option value="11-50">11-50 kişi</option>
                        <option value="51-100">51-100 kişi</option>
                        <option value="101-500">101-500 kişi</option>
                        <option value="501-1000">501-1000 kişi</option>
                        <option value="1000+">1000+ kişi</option>
                      </select>
                    ) : (
                      <div style={getInputStyle(isEditing)}>
                        {formData.employeeCount}
                      </div>
                    )}
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Risk Seviyesi
                    </label>
                    {isEditing ? (
                      <select 
                        name="riskLevel" 
                        value={formData.riskLevel || ''} 
                        onChange={handleInputChange}
                        style={getInputStyle(isEditing)}
                      >
                        <option value="">Risk seviyesi seçin</option>
                        <option value="low">Düşük Risk</option>
                        <option value="medium">Orta Risk</option>
                        <option value="high">Yüksek Risk</option>
                      </select>
                    ) : (
                      <div style={getInputStyle(isEditing)}>
                        {formData.riskLevel}
                      </div>
                    )}
                  </div>
                  <div style={fieldContainerStyle}>
                    <label style={labelStyle}>
                      Uyumluluk Durumu
                    </label>
                    {isEditing ? (
                      <select 
                        name="complianceStatus" 
                        value={formData.complianceStatus || ''} 
                        onChange={handleInputChange}
                        style={getInputStyle(isEditing)}
                      >
                        <option value="">Uyumluluk durumu seçin</option>
                        <option value="pending">Beklemede</option>
                        <option value="approved">Onaylandı</option>
                        <option value="rejected">Reddedildi</option>
                        <option value="under_review">İnceleniyor</option>
                      </select>
                    ) : (
                      <div style={getInputStyle(isEditing)}>
                        {formData.complianceStatus}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Notlar */}
            <div style={{ 
              marginBottom: '20px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                Notlar
              </h3>
              
              <div style={fieldContainerStyle}>
                <label style={labelStyle}>
                  Notlar
                </label>
                <textarea
                  name="notes"
                  value={formData.notes || ''}
                  readOnly={!isEditing}
                  onChange={handleInputChange}
                  rows="3"
                  placeholder="Tedarikçi hakkında notlar..."
                  style={{ 
                    ...getInputStyle(isEditing),
                    resize: 'vertical'
                  }}
                />
              </div>
            </div>

            {/* Malzemeler */}
            <div style={{ 
              marginBottom: '20px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                Tedarik Edilen Malzemeler
              </h3>
              
              {/* Malzeme Ekleme Butonları */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                <div style={{ width: '60%' }}>
                  <button 
                    type="button" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowExistingMaterials(true);
                    }}
                    style={{
                      padding: '12px 24px',
                      border: '2px dashed #d1d5db',
                      borderRadius: '8px',
                      background: '#f9fafb',
                      color: '#374151',
                      cursor: 'pointer',
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    <span style={{ fontSize: '18px' }}>📋</span>
                    Mevcut Malzeme Seç
                  </button>
                </div>
                <div style={{ width: '40%' }}>
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onAddNewMaterial) {
                        onAddNewMaterial(selectedSupplier, (materialOrCallbackData) => {
                          // Null check ekle
                          if (!materialOrCallbackData) {
                            console.error('❌ materialOrCallbackData null geldi:', materialOrCallbackData)
                            return
                          }
                          
                          // Hem eski format (direkt material) hem yeni format (callbackData) destekle
                          const newMaterial = materialOrCallbackData.material || materialOrCallbackData;
                          
                          // Material validation
                          if (!newMaterial || !newMaterial.id) {
                            console.error('❌ Geçersiz newMaterial:', newMaterial)
                            return
                          }
                          
                          console.log('✅ SuppliersTable: Tedarikçi detayında malzeme UI\'a ekleniyor:', newMaterial)
                          
                          // Yeni malzeme eklendikten sonra selectedSupplier'ın suppliedMaterials array'ini güncelle
                          setSelectedSupplier(prev => ({
                            ...prev,
                            suppliedMaterials: [...(prev.suppliedMaterials || []), {
                              materialId: newMaterial.id,
                              materialCode: newMaterial.code,
                              materialName: newMaterial.name,
                              price: 0,
                              deliveryTime: '',
                              minQuantity: 1,
                              addedAt: new Date().toISOString()
                            }]
                          }));
                          
                          // Ana suppliers listesini de güncelle
                          if (onRefreshSuppliers) {
                            console.log('🔄 SuppliersTable: Suppliers listesi yenileniyor...')
                            onRefreshSuppliers()
                          }
                        });
                      }
                    }}
                    style={{
                      padding: '12px 16px',
                      border: 'none',
                      borderRadius: '8px',
                      background: '#3b82f6',
                      color: 'white',
                      cursor: 'pointer',
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    <span style={{ fontSize: '18px' }}>➕</span>
                    Yeni Malzeme Ekle
                  </button>
                </div>
              </div>
              
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                {selectedSupplier?.suppliedMaterials && selectedSupplier.suppliedMaterials.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {selectedSupplier.suppliedMaterials.map((material, index) => (
                      <div 
                        key={index}
                        style={{ 
                          padding: '6px 8px', 
                          background: '#f8fafc', 
                          border: '1px solid #e5e7eb', 
                          borderRadius: '4px',
                          fontSize: '12px'
                        }}
                      >
                        <div style={{ fontWeight: '500', color: '#374151' }}>
                          {material.name || material.materialName}
                        </div>
                        {material.code && (
                          <div style={{ color: '#6b7280', fontSize: '11px' }}>
                            Kod: {material.code}
                          </div>
                        )}
                        {material.price && (
                          <div style={{ color: '#6b7280', fontSize: '11px' }}>
                            Fiyat: {material.price} {material.currency || 'TRY'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '20px', 
                    color: '#9ca3af',
                    fontStyle: 'italic'
                  }}>
                    Bu tedarikçiye henüz malzeme eklenmemiş
                  </div>
                )}
              </div>
            </div>

            {/* Mevcut Malzemeler Seçim Modalı */}
            {showExistingMaterials && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2000
              }}
              onClick={() => setShowExistingMaterials(false)}
              >
                <div style={{
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  width: '90%',
                  maxWidth: '800px',
                  maxHeight: '80vh',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column'
                }}
                onClick={(e) => e.stopPropagation()}
                >
                  {/* Modal Header */}
                  <div style={{
                    padding: '20px',
                    borderBottom: '1px solid #e5e7eb',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
                      Mevcut Malzemelerden Seç
                    </h3>
                    <button
                      onClick={() => setShowExistingMaterials(false)}
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: '24px',
                        cursor: 'pointer',
                        color: '#6b7280'
                      }}
                    >
                      ×
                    </button>
                  </div>

                  {/* Arama */}
                  <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb' }}>
                    <input
                      type="text"
                      placeholder="Malzeme ara..."
                      value={materialSearchTerm}
                      onChange={(e) => setMaterialSearchTerm(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {/* Malzemeler Listesi */}
                  <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
                    <div style={{ display: 'grid', gap: '12px' }}>
                      {/* Gerçek malzemeler listesi */}
                      {(materialsLoading ? [] : materials || [])
                        .filter(material => 
                          materialSearchTerm === '' || 
                          material.name?.toLowerCase().includes(materialSearchTerm.toLowerCase()) ||
                          material.code?.toLowerCase().includes(materialSearchTerm.toLowerCase())
                        )
                        .filter(material => 
                          // Zaten eklenmiş malzemeleri gösterme
                          !selectedSupplier?.suppliedMaterials?.some(m => m.materialId === material.id)
                        )
                        .map((material) => (
                        <div
                          key={material.id}
                          onClick={async () => {
                            try {
                              // Malzeme zaten ekli mi kontrol et
                              const isAlreadyAdded = selectedSupplier?.suppliedMaterials?.some(m => m.materialId === material.id);
                              if (isAlreadyAdded) {
                                alert('Bu malzeme zaten tedarikçiye eklenmiş!');
                                setShowExistingMaterials(false);
                                return;
                              }

                              // Malzemeyi tedarikçiye ekle
                              if (onAddMaterialToSupplier) {
                                await onAddMaterialToSupplier(selectedSupplier.id, {
                                  materialId: material.id,
                                  materialCode: material.code,
                                  materialName: material.name,
                                  price: 0,
                                  deliveryTime: '',
                                  minQuantity: 1
                                });
                                
                                // Başarılı olduğunda selectedSupplier'ın suppliedMaterials array'ini güncelle
                                setSelectedSupplier(prev => ({
                                  ...prev,
                                  suppliedMaterials: [...(prev.suppliedMaterials || []), {
                                    materialId: material.id,
                                    materialCode: material.code,
                                    materialName: material.name,
                                    price: 0,
                                    deliveryTime: '',
                                    minQuantity: 1,
                                    addedAt: new Date().toISOString()
                                  }]
                                }));
                                
                                // Ana suppliers listesini de güncelle
                                if (onRefreshSuppliers) {
                                  console.log('🔄 Mevcut malzeme eklendi - Suppliers listesi yenileniyor...')
                                  onRefreshSuppliers()
                                }
                              }
                              setShowExistingMaterials(false);
                            } catch (error) {
                              console.error('Malzeme eklenirken hata:', error);
                              alert('Malzeme eklenirken bir hata oluştu!');
                            }
                          }}
                          style={{
                            padding: '16px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            backgroundColor: '#f9fafb'
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.backgroundColor = '#f3f4f6';
                            e.target.style.borderColor = '#d1d5db';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.backgroundColor = '#f9fafb';
                            e.target.style.borderColor = '#e5e7eb';
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={fieldContainerStyle}>
                              <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>
                                {material.code} - {material.name}
                              </div>
                              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                Kategori: {getCategoryLabel(material.category)}
                              </div>
                            </div>
                            <div style={{ fontSize: '14px', fontWeight: '600', color: '#059669' }}>
                              {material.unitPrice || material.lastPrice || 0} ₺
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      {/* Yükleniyor durumu */}
                      {materialsLoading && (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                          Malzemeler yükleniyor...
                        </div>
                      )}
                      
                      {/* Malzeme bulunamadı */}
                      {!materialsLoading && materials && materials.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                          Henüz malzeme eklenmemiş.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div style={{
                    padding: '20px',
                    borderTop: '1px solid #e5e7eb',
                    display: 'flex',
                    justifyContent: 'end'
                  }}>
                    <button
                      onClick={() => setShowExistingMaterials(false)}
                      style={{
                        padding: '8px 16px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        background: 'white',
                        color: '#374151',
                        cursor: 'pointer'
                      }}
                    >
                      İptal
                    </button>
                  </div>
                </div>
              </div>
            )}

          </form>
        </div>
      </div>
    )
  }

  if (loading || materialsLoading || categoriesLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">
            {loading ? 'Tedarikçiler yükleniyor...' : 
             materialsLoading ? 'Malzemeler yükleniyor...' : 
             'Kategoriler yükleniyor...'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="suppliers-container" style={{ 
      display: 'flex', 
      gap: '20px', 
      height: 'calc(100vh - 200px)',
      flexDirection: window.innerWidth <= 768 ? 'column' : 'row'
    }}>
      {/* Sol Panel - Tablo */}
      <div className="suppliers-table-panel" style={{ 
        flex: window.innerWidth <= 768 ? 'none' : '1', 
        minWidth: window.innerWidth <= 768 ? 'auto' : '300px', 
        display: 'flex', 
        flexDirection: 'column',
        height: window.innerWidth <= 768 ? '50vh' : 'auto'
      }}>
        <div className="suppliers-table">
          {/* Tab Navigation - Yatayda Kaydırılabilir */}
          <div className="suppliers-tabs" style={{
            display: 'flex',
            background: '#f8fafc',
            borderBottom: '1px solid #e5e7eb',
            overflowX: 'auto',
            scrollbarWidth: 'thin',
            scrollbarColor: '#cbd5e1 #f1f5f9',
            whiteSpace: 'nowrap'
          }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '12px 16px',
                  border: 'none',
                  background: activeTab === tab.id ? 'white' : 'transparent',
                  color: activeTab === tab.id ? '#1e293b' : '#64748b',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
              >
                {tab.label}
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '20px',
                  height: '18px',
                  padding: '0 6px',
                  background: activeTab === tab.id ? '#dbeafe' : '#e2e8f0',
                  color: activeTab === tab.id ? '#1d4ed8' : '#64748b',
                  fontSize: '11px',
                  fontWeight: '600',
                  borderRadius: '9px'
                }}>
                  {tab.id === 'all' ? filteredSuppliers.length : suppliers.filter(s => s.category === tab.id).length}
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
              overflow: 'hidden',
              flex: 1,
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table 
                className="suppliers-table-grid"
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '13px',
                  backgroundColor: '#ffffff'
                }}
              >
          <thead className="suppliers-table-header">
            <tr className="suppliers-header-row"
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
                    color: sortField === 'name' ? '#007bff' : '#374151'
                  }}
                >
                  Firma Adı {getSortIcon('name')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="suppliers-table-body">
            {filteredAndSortedSuppliers.length === 0 ? (
              <tr>
                <td colSpan="2" style={{ 
                  textAlign: 'center', 
                  padding: '40px 20px', 
                  color: '#6b7280', 
                  fontSize: '13px'
                }}>
                  Henüz tedarikçi eklenmemiş.
                </td>
              </tr>
            ) : (
              filteredAndSortedSuppliers.map((supplier, index) => (
                <tr 
                  key={supplier.id} 
                  className={supplier.status === 'Pasif' ? 'inactive' : 'clickable-row'}
                  style={{
                    backgroundColor: selectedSupplier?.id === supplier.id ? '#f0f9ff' : 
                                   supplier.status === 'Pasif' ? '#fef2f2' : '#ffffff',
                    borderBottom: '1px solid #e2e8f0',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                    opacity: supplier.status === 'Pasif' ? 0.6 : 1
                  }}
                  onClick={() => handleRowClick(supplier)}
                >
                  <td style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid #e2e8f0',
                    fontSize: '13px',
                    color: '#000000',
                    fontWeight: '400'
                  }}>
                    {supplier.status === 'Pasif' ? (
                      <div className="material-name-cell">
                        {supplier.code}
                      </div>
                    ) : (
                      supplier.code
                    )}
                  </td>
                  <td style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid #e2e8f0',
                    fontSize: '13px',
                    color: '#000000',
                    fontWeight: '400'
                  }}>
                    {supplier.status === 'Pasif' ? (
                      <div className="material-name-cell">
                        {supplier.name}
                        <span style={{ 
                          backgroundColor: '#fee2e2',
                          color: '#dc2626',
                          padding: '2px 6px',
                          borderRadius: '8px',
                          fontSize: '10px',
                          fontWeight: '500',
                          marginLeft: '8px'
                        }}>
                          Pasif
                        </span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {supplier.name}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
            </div>
          </div>
        </div>
      </div>

      {/* Sağ Panel - Detaylar */}
      <div className="supplier-details-panel" style={{ 
        flex: window.innerWidth <= 768 ? 'none' : '3',
        width: window.innerWidth <= 768 ? '100%' : 'auto',
        height: window.innerWidth <= 768 ? '50vh' : 'auto',
        background: '#f8fafc', 
        border: '1px solid #e5e7eb', 
        borderRadius: '8px',
        padding: '20px',
        overflowY: 'auto'
      }}>
        {selectedSupplier ? (
          <SupplierDetailPanel />
        ) : (
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100%',
            color: '#6b7280',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '600' }}>
              Tedarikçi Seçin
            </h3>
            <p style={{ margin: 0, fontSize: '14px' }}>
              Detayları görüntülemek için sol taraftan bir tedarikçi seçin
            </p>
          </div>
        )}
      </div>
    </div>
  )
}