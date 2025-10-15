import React, { useState, useEffect } from 'react'

export default function SuppliersTable({ 
  suppliers = [],
  loading = false,
  onUpdateSupplier,
  onDeleteSupplier
}) {
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [selectedSupplierId, setSelectedSupplierId] = useState(null)
  const [sortField, setSortField] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({})

  const handleRowClick = (supplier) => {
    setSelectedSupplier(supplier)
    setSelectedSupplierId(supplier.id)
  }

  // Suppliers listesi değiştiğinde selectedSupplier'ı koru ve güncelle
  useEffect(() => {
    if (selectedSupplierId && suppliers && suppliers.length > 0) {
      const currentSupplier = suppliers.find(s => s.id === selectedSupplierId)
      if (currentSupplier) {
        console.log('🔄 SuppliersTable: selectedSupplier güncelleniyor', {
          id: currentSupplier.id
        })
        setSelectedSupplier(currentSupplier)
      }
    }
  }, [suppliers, selectedSupplierId])

  const handleEdit = () => {
    if (selectedSupplier) {
      setFormData(selectedSupplier)
      setIsEditing(true)
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    setFormData({})
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSaveSupplier = async (e) => {
    e.preventDefault()
    if (onUpdateSupplier) {
      await onUpdateSupplier(selectedSupplier.id, formData)
      setIsEditing(false)
      setFormData({})
    }
  }

  const handleDeleteSupplier = async () => {
    if (selectedSupplier && confirm('Bu tedarikçiyi silmek istediğinizden emin misiniz?')) {
      if (onDeleteSupplier) {
        await onDeleteSupplier(selectedSupplier.id)
        setSelectedSupplier(null)
        setSelectedSupplierId(null)
      }
    }
  }

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const sortedSuppliers = React.useMemo(() => {
    if (!sortField) return suppliers

    return [...suppliers].sort((a, b) => {
      let aVal = a[sortField] || ''
      let bVal = b[sortField] || ''

      if (typeof aVal === 'string') aVal = aVal.toLowerCase()
      if (typeof bVal === 'string') bVal = bVal.toLowerCase()

      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1
      } else {
        return aVal < bVal ? 1 : -1
      }
    })
  }, [suppliers, sortField, sortDirection])

  const getInputStyle = (isEditing) => ({
    padding: '8px 12px',
    border: isEditing ? '1px solid #3b82f6' : '1px solid transparent',
    borderRadius: '4px',
    background: isEditing ? 'white' : 'transparent',
    width: '100%',
    fontSize: '14px'
  })

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Tedarikçiler yükleniyor...</span>
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
          <div className="table-container" style={{ 
            overflowY: 'auto',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            background: 'white'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ 
                background: 'rgb(248, 249, 250)', 
                position: 'sticky', 
                top: 0, 
                zIndex: 1 
              }}>
                <tr>
                  <th 
                    onClick={() => handleSort('code')}
                    style={{ 
                      padding: '12px 8px', 
                      textAlign: 'left', 
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: 'rgb(55, 65, 81)',
                      borderBottomWidth: '1px',
                      borderBottomStyle: 'solid',
                      borderBottomColor: 'rgb(229, 231, 235)'
                    }}
                  >
                    Kod <span style={{ fontSize: '12px', opacity: '0.6' }}>
                      {sortField === 'code' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </th>
                  <th 
                    onClick={() => handleSort('name')}
                    style={{ 
                      padding: '12px 8px', 
                      textAlign: 'left', 
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: 'rgb(55, 65, 81)',
                      borderBottomWidth: '1px',
                      borderBottomStyle: 'solid',
                      borderBottomColor: 'rgb(229, 231, 235)'
                    }}
                  >
                    Firma Adı <span style={{ fontSize: '12px', opacity: '0.6' }}>
                      {sortField === 'name' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </th>
                  <th 
                    onClick={() => handleSort('categories')}
                    style={{ 
                      padding: '12px 8px', 
                      textAlign: 'left', 
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: 'rgb(55, 65, 81)',
                      borderBottomWidth: '1px',
                      borderBottomStyle: 'solid',
                      borderBottomColor: 'rgb(229, 231, 235)'
                    }}
                  >
                    Kategoriler <span style={{ fontSize: '12px', opacity: '0.6' }}>
                      {sortField === 'categories' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </th>
                  {!selectedSupplier && (
                    <th 
                      style={{ 
                        padding: '12px 8px', 
                        textAlign: 'center', 
                        fontSize: '12px',
                        fontWeight: '600',
                        color: 'rgb(55, 65, 81)',
                        borderBottomWidth: '1px',
                        borderBottomStyle: 'solid',
                        borderBottomColor: 'rgb(229, 231, 235)',
                        width: '180px'
                      }}
                    >
                      Aksiyonlar
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {sortedSuppliers.map(supplier => (
                  <tr
                    key={supplier.id}
                    onClick={() => handleRowClick(supplier)}
                    style={{
                      cursor: 'pointer',
                      backgroundColor: selectedSupplier?.id === supplier.id ? 'rgb(239, 246, 255)' : 'white',
                      borderBottomWidth: '1px',
                      borderBottomStyle: 'solid',
                      borderBottomColor: 'rgb(243, 244, 246)'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedSupplier?.id !== supplier.id) {
                        e.currentTarget.style.backgroundColor = '#f9fafb'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedSupplier?.id !== supplier.id) {
                        e.currentTarget.style.backgroundColor = 'white'
                      }
                    }}
                  >
                    <td style={{ padding: '12px 8px', fontSize: '13px', fontWeight: '500', color: '#000' }}>
                      {supplier.code}
                    </td>
                    <td style={{ padding: '12px 8px', fontSize: '13px', color: '#000' }}>
                      {supplier.name || supplier.companyName}
                    </td>
                    <td style={{ padding: '12px 8px', fontSize: '13px' }}>
                      <span style={{ color: '#6b7280', fontStyle: 'italic' }}>
                        Kategoriler
                      </span>
                    </td>
                    {!selectedSupplier && (
                      <td style={{ padding: '12px 8px', fontSize: '13px', textAlign: 'center' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (supplier.phone1) {
                              window.open(`tel:${supplier.phone1}`, '_self');
                            }
                          }}
                          style={{
                            padding: '2px',
                            border: 'none',
                            borderRadius: '3px',
                            background: 'transparent',
                            color: '#374151',
                            fontSize: '10px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '16px',
                            height: '16px',
                            lineHeight: 1,
                            transition: 'all 0.2s ease',
                            marginRight: '4px'
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.transform = 'scale(1.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.transform = 'scale(1)';
                          }}
                          title={`Ara: ${supplier.phone1 || 'Telefon bulunamadı'}`}
                        >
                          📞
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (supplier.email1) {
                              window.open(`mailto:${supplier.email1}`, '_blank');
                            }
                          }}
                          style={{
                            padding: '2px',
                            border: 'none',
                            borderRadius: '3px',
                            background: 'transparent',
                            color: '#374151',
                            fontSize: '10px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '16px',
                            height: '16px',
                            lineHeight: 1,
                            transition: 'all 0.2s ease',
                            marginRight: '4px'
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.transform = 'scale(1.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.transform = 'scale(1)';
                          }}
                          title={`Mail At: ${supplier.email1 || 'Email bulunamadı'}`}
                        >
                          📧
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Sipariş ver fonksiyonu henüz atanmayacak
                          }}
                          style={{
                            padding: '2px',
                            border: 'none',
                            borderRadius: '3px',
                            background: 'transparent',
                            color: '#374151',
                            fontSize: '10px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '16px',
                            height: '16px',
                            lineHeight: 1,
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.transform = 'scale(1.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.transform = 'scale(1)';
                          }}
                          title="Sipariş Ver"
                        >
                          🛒
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Sağ Panel - Detaylar */}
      {selectedSupplier && (
        <div className="supplier-detail-panel" style={{ 
          flex: window.innerWidth <= 768 ? 'none' : '1',
          minWidth: window.innerWidth <= 768 ? 'auto' : '400px',
          height: window.innerWidth <= 768 ? '50vh' : 'auto'
        }}>
          <div style={{ 
            background: 'white', 
            borderRadius: '6px', 
            border: '1px solid #e5e7eb',
            height: '100%',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Header */}
            <div style={{ 
              padding: '16px 20px', 
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  onClick={() => setSelectedSupplier(null)}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    background: 'white',
                    color: '#374151',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                  title="Detayları Kapat"
                >
                  ←
                </button>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                  Tedarikçi Detayları
                </h3>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (selectedSupplier.phone1) {
                      window.open(`tel:${selectedSupplier.phone1}`, '_self');
                    }
                  }}
                  style={{
                    padding: '6px',
                    border: 'none',
                    borderRadius: '4px',
                    background: 'transparent',
                    color: '#374151',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '24px',
                    height: '24px',
                    lineHeight: 1,
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.transform = 'scale(1.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'scale(1)';
                  }}
                  title={`Ara: ${selectedSupplier.phone1 || 'Telefon bulunamadı'}`}
                >
                  📞
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (selectedSupplier.email1) {
                      window.open(`mailto:${selectedSupplier.email1}`, '_blank');
                    }
                  }}
                  style={{
                    padding: '6px',
                    border: 'none',
                    borderRadius: '4px',
                    background: 'transparent',
                    color: '#374151',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '24px',
                    height: '24px',
                    lineHeight: 1,
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.transform = 'scale(1.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'scale(1)';
                  }}
                  title={`Mail At: ${selectedSupplier.email1 || 'Email bulunamadı'}`}
                >
                  📧
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // Sipariş ver fonksiyonu henüz atanmayacak
                  }}
                  style={{
                    padding: '6px',
                    border: 'none',
                    borderRadius: '4px',
                    background: 'transparent',
                    color: '#374151',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '24px',
                    height: '24px',
                    lineHeight: 1,
                    transition: 'all 0.2s ease',
                    marginRight: '8px'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.transform = 'scale(1.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'scale(1)';
                  }}
                  title="Sipariş Ver"
                >
                  🛒
                </button>
                {!isEditing ? (
                  <button
                    onClick={handleEdit}
                    style={{
                      padding: '6px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      background: 'white',
                      color: '#374151',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    ✏️ Düzenle
                  </button>
                ) : (
                  <>
                    <button
                      type="submit"
                      form="supplier-detail-form"
                      style={{
                        padding: '6px 12px',
                        border: 'none',
                        borderRadius: '4px',
                        background: '#3b82f6',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      💾 Kaydet
                    </button>
                    <button
                      onClick={handleCancel}
                      style={{
                        padding: '6px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        background: 'white',
                        color: '#374151',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      ❌ İptal
                    </button>
                  </>
                )}
                <button
                  onClick={handleDeleteSupplier}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #dc2626',
                    borderRadius: '4px',
                    background: 'white',
                    color: '#dc2626',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  🗑️ Sil
                </button>
              </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
              <form onSubmit={handleSaveSupplier} id="supplier-detail-form" className="supplier-details-layout">
                {/* Temel Firma Bilgileri */}
                <div style={{ 
                  marginBottom: '16px', 
                  padding: '12px', 
                  background: 'white', 
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb'
                }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                    Temel Firma Bilgileri
                  </h3>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                        Tedarikçi Kodu:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="code"
                          value={formData.code || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.code || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                        Durum:
                      </span>
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
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.status || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                      Firma Adı:
                    </span>
                    {isEditing ? (
                      <input
                        type="text"
                        name="name"
                        value={formData.name || ''}
                        onChange={handleInputChange}
                        style={{ ...getInputStyle(isEditing), flex: 1 }}
                      />
                    ) : (
                      <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                        {selectedSupplier.name || selectedSupplier.companyName || '-'}
                      </span>
                    )}
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                        Tedarikçi Tipi:
                      </span>
                      {isEditing ? (
                        <select
                          name="supplierType"
                          value={formData.supplierType || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        >
                          <option value="">Seçin</option>
                          <option value="manufacturer">Üretici</option>
                          <option value="distributor">Distribütör</option>
                          <option value="wholesaler">Toptancı</option>
                          <option value="service_provider">Hizmet Sağlayıcı</option>
                          <option value="contractor">Yüklenici</option>
                          <option value="consultant">Danışman</option>
                        </select>
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.supplierType || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                        İş Kayıt No:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="businessRegistrationNumber"
                          value={formData.businessRegistrationNumber || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.businessRegistrationNumber || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* İletişim Bilgileri */}
                <div style={{ 
                  marginBottom: '16px', 
                  padding: '12px', 
                  background: 'white', 
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb'
                }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                    İletişim Bilgileri
                  </h3>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '8px' }}>
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                        Yetkili Kişi:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="contactPerson"
                          value={formData.contactPerson || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.contactPerson || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                        Acil Durum:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="emergencyContact"
                          value={formData.emergencyContact || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.emergencyContact || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '8px' }}>
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Telefon 1:
                      </span>
                      {isEditing ? (
                        <input
                          type="tel"
                          name="phone1"
                          value={formData.phone1 || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.phone1 || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Telefon 2:
                      </span>
                      {isEditing ? (
                        <input
                          type="tel"
                          name="phone2"
                          value={formData.phone2 || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.phone2 || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Acil Tel:
                      </span>
                      {isEditing ? (
                        <input
                          type="tel"
                          name="emergencyPhone"
                          value={formData.emergencyPhone || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.emergencyPhone || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '8px' }}>
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        E-posta 1:
                      </span>
                      {isEditing ? (
                        <input
                          type="email"
                          name="email1"
                          value={formData.email1 || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.email1 || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        E-posta 2:
                      </span>
                      {isEditing ? (
                        <input
                          type="email"
                          name="email2"
                          value={formData.email2 || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.email2 || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Faks:
                      </span>
                      {isEditing ? (
                        <input
                          type="tel"
                          name="fax"
                          value={formData.fax || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.fax || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                        Web Sitesi:
                      </span>
                      {isEditing ? (
                        <input
                          type="url"
                          name="website"
                          value={formData.website || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.website || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px' }}>
                        Tercih İletişim:
                      </span>
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
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.preferredCommunication || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Adres ve Mali Bilgiler - Üst Bölüm */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  {/* Adres Bilgileri */}
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                      Adres Bilgileri
                    </h3>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px', marginTop: '2px' }}>
                        Adres:
                      </span>
                      {isEditing ? (
                        <textarea
                          name="address"
                          value={formData.address || ''}
                          onChange={handleInputChange}
                          rows="2"
                          style={{ ...getInputStyle(isEditing), flex: 1, resize: 'vertical' }}
                        />
                      ) : (
                        <span className="detail-value description" style={{ fontSize: '12px', color: '#111827', flex: 1 }}>
                          {selectedSupplier.address || 'Adres girilmemiş'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Şehir:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="city"
                          value={formData.city || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.city || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        İlçe:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="state"
                          value={formData.state || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.state || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Posta Kodu:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="postalCode"
                          value={formData.postalCode || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.postalCode || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Ülke:
                      </span>
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
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.country || '-'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Mali Bilgiler */}
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                      Mali Bilgiler
                    </h3>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Vergi No:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="taxNumber"
                          value={formData.taxNumber || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.taxNumber || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Vergi Dairesi:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="taxOffice"
                          value={formData.taxOffice || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.taxOffice || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Para Birimi:
                      </span>
                      {isEditing ? (
                        <select
                          name="currency"
                          value={formData.currency || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        >
                          <option value="TRY">TRY</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                          <option value="GBP">GBP</option>
                        </select>
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.currency || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Kredi Limiti:
                      </span>
                      {isEditing ? (
                        <input
                          type="number"
                          name="creditLimit"
                          value={formData.creditLimit || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.creditLimit || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Kredi Notu:
                      </span>
                      {isEditing ? (
                        <select
                          name="creditRating"
                          value={formData.creditRating || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        >
                          <option value="">Seçin</option>
                          <option value="A">A - Mükemmel</option>
                          <option value="B">B - İyi</option>
                          <option value="C">C - Orta</option>
                          <option value="D">D - Zayıf</option>
                          <option value="F">F - Riskli</option>
                        </select>
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.creditRating || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Yıllık Ciro:
                      </span>
                      {isEditing ? (
                        <input
                          type="number"
                          name="annualRevenue"
                          value={formData.annualRevenue || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.annualRevenue || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Ödeme ve Operasyonel Bilgiler - Orta Bölüm */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  {/* Ödeme Bilgileri */}
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                      Ödeme Bilgileri
                    </h3>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Ödeme Koşul:
                      </span>
                      {isEditing ? (
                        <select
                          name="paymentTerms"
                          value={formData.paymentTerms || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        >
                          <option value="">Seçin</option>
                          <option value="Peşin">Peşin</option>
                          <option value="15 gün vade">15 gün</option>
                          <option value="30 gün vade">30 gün</option>
                          <option value="45 gün vade">45 gün</option>
                          <option value="60 gün vade">60 gün</option>
                          <option value="90 gün vade">90 gün</option>
                          <option value="120 gün vade">120 gün</option>
                        </select>
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.paymentTerms || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Ödeme Yöntem:
                      </span>
                      {isEditing ? (
                        <select
                          name="paymentMethod"
                          value={formData.paymentMethod || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        >
                          <option value="">Seçin</option>
                          <option value="bank_transfer">Havale/EFT</option>
                          <option value="check">Çek</option>
                          <option value="cash">Nakit</option>
                          <option value="credit_card">Kredi Kartı</option>
                          <option value="letter_of_credit">Akreditif</option>
                          <option value="promissory_note">Senet</option>
                        </select>
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.paymentMethod || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Banka:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="bankName"
                          value={formData.bankName || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.bankName || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Hesap No:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="bankAccount"
                          value={formData.bankAccount || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.bankAccount || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        IBAN:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="iban"
                          value={formData.iban || ''}
                          onChange={handleInputChange}
                          style={{ ...getInputStyle(isEditing), flex: 1 }}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.iban || '-'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Operasyonel Bilgiler */}
                  <div style={{ 
                    padding: '12px', 
                    background: 'white', 
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                      Operasyonel Bilgiler
                    </h3>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Teslimat:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="deliveryCapability"
                          value={formData.deliveryCapability || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.deliveryCapability || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Tedarik Süresi:
                      </span>
                      {isEditing ? (
                        <input
                          type="number"
                          name="leadTime"
                          value={formData.leadTime || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.leadTime ? `${selectedSupplier.leadTime} gün` : '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Min. Sipariş:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          name="minimumOrderQuantity"
                          value={formData.minimumOrderQuantity || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.minimumOrderQuantity || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '80px', marginRight: '8px' }}>
                        Sertifika:
                      </span>
                      {isEditing ? (
                        <select
                          name="qualityCertification"
                          value={formData.qualityCertification || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        >
                          <option value="">Seçin</option>
                          <option value="ISO_9001">ISO 9001</option>
                          <option value="ISO_14001">ISO 14001</option>
                          <option value="TS_EN_ISO">TS EN ISO</option>
                          <option value="CE">CE İşareti</option>
                          <option value="TSE">TSE</option>
                          <option value="OHSAS_18001">OHSAS 18001</option>
                          <option value="other">Diğer</option>
                        </select>
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.qualityCertification || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Şirket Bilgileri - Alt Bölüm */}
                <div style={{ 
                  marginBottom: '16px', 
                  padding: '12px', 
                  background: 'white', 
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb'
                }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                    Şirket Bilgileri
                  </h3>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px', marginRight: '8px' }}>
                        Kuruluş Yılı:
                      </span>
                      {isEditing ? (
                        <input
                          type="number"
                          name="yearEstablished"
                          value={formData.yearEstablished || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        />
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.yearEstablished || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px', marginRight: '8px' }}>
                        Çalışan Sayısı:
                      </span>
                      {isEditing ? (
                        <select
                          name="employeeCount"
                          value={formData.employeeCount || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        >
                          <option value="">Seçin</option>
                          <option value="1-10">1-10 kişi</option>
                          <option value="11-50">11-50 kişi</option>
                          <option value="51-100">51-100 kişi</option>
                          <option value="101-500">101-500 kişi</option>
                          <option value="501-1000">501-1000 kişi</option>
                          <option value="1000+">1000+ kişi</option>
                        </select>
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.employeeCount || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px', marginRight: '8px' }}>
                        Risk Seviyesi:
                      </span>
                      {isEditing ? (
                        <select
                          name="riskLevel"
                          value={formData.riskLevel || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        >
                          <option value="low">Düşük Risk</option>
                          <option value="medium">Orta Risk</option>
                          <option value="high">Yüksek Risk</option>
                        </select>
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.riskLevel || '-'}
                        </span>
                      )}
                    </div>
                    
                    <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px', marginRight: '8px' }}>
                        Uyumluluk:
                      </span>
                      {isEditing ? (
                        <select
                          name="complianceStatus"
                          value={formData.complianceStatus || ''}
                          onChange={handleInputChange}
                          style={getInputStyle(isEditing)}
                        >
                          <option value="pending">Beklemede</option>
                          <option value="approved">Onaylandı</option>
                          <option value="rejected">Reddedildi</option>
                          <option value="under_review">İnceleniyor</option>
                        </select>
                      ) : (
                        <span className="detail-value" style={{ fontSize: '12px', color: '#111827' }}>
                          {selectedSupplier.complianceStatus || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Supply History - Tedarik Geçmişi */}
                <div style={{ 
                  marginBottom: '16px', 
                  padding: '12px', 
                  background: 'white', 
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb'
                }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                    Tedarik Geçmişi
                  </h3>
                  
                  {/* Placeholder content - will be developed later */}
                  <div style={{ 
                    padding: '20px', 
                    textAlign: 'center', 
                    color: '#6b7280', 
                    fontSize: '12px',
                    fontStyle: 'italic'
                  }}>
                    Bu bölüm geliştirilme aşamasındadır.
                  </div>
                </div>

                {/* Ek Bilgiler */}
                <div style={{ 
                  marginBottom: '16px', 
                  padding: '12px', 
                  background: 'white', 
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb'
                }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px' }}>
                    Ek Bilgiler
                  </h3>
                  
                  <div className="detail-item" style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '120px', marginRight: '8px', marginTop: '2px' }}>
                      Notlar ve Açıklamalar:
                    </span>
                    {isEditing ? (
                      <textarea
                        name="notes"
                        value={formData.notes || ''}
                        onChange={handleInputChange}
                        rows="3"
                        style={{ ...getInputStyle(isEditing), flex: 1, resize: 'vertical' }}
                      />
                    ) : (
                      <span className="detail-value description" style={{ fontSize: '12px', color: '#111827', flex: 1 }}>
                        {selectedSupplier.notes || 'Ek bilgi girilmemiş'}
                      </span>
                    )}
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}