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
              <form onSubmit={handleSaveSupplier} id="supplier-detail-form">
                {/* Temel Bilgiler */}
                <div style={{ 
                  marginBottom: '20px', 
                  padding: '12px', 
                  background: 'white', 
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb'
                }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                    Temel Bilgiler
                  </h4>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                        Tedarikçi Kodu
                      </label>
                      <input
                        type="text"
                        name="code"
                        value={isEditing ? (formData.code || '') : (selectedSupplier.code || '')}
                        readOnly={!isEditing}
                        onChange={handleInputChange}
                        style={getInputStyle(isEditing)}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
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
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={selectedSupplier.status || ''}
                          readOnly
                          style={getInputStyle(false)}
                        />
                      )}
                    </div>
                  </div>
                  
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                      Firma Adı
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={isEditing ? (formData.name || '') : (selectedSupplier.name || selectedSupplier.companyName || '')}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      style={getInputStyle(isEditing)}
                    />
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                        Yetkili Kişi
                      </label>
                      <input
                        type="text"
                        name="contactPerson"
                        value={isEditing ? (formData.contactPerson || '') : (selectedSupplier.contactPerson || '')}
                        readOnly={!isEditing}
                        onChange={handleInputChange}
                        style={getInputStyle(isEditing)}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                        Telefon
                      </label>
                      <input
                        type="text"
                        name="phone1"
                        value={isEditing ? (formData.phone1 || '') : (selectedSupplier.phone1 || '')}
                        readOnly={!isEditing}
                        onChange={handleInputChange}
                        style={getInputStyle(isEditing)}
                      />
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
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                    İletişim Bilgileri
                  </h4>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                        E-posta 1
                      </label>
                      <input
                        type="email"
                        name="email1"
                        value={isEditing ? (formData.email1 || '') : (selectedSupplier.email1 || '')}
                        readOnly={!isEditing}
                        onChange={handleInputChange}
                        style={getInputStyle(isEditing)}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                        E-posta 2
                      </label>
                      <input
                        type="email"
                        name="email2"
                        value={isEditing ? (formData.email2 || '') : (selectedSupplier.email2 || '')}
                        readOnly={!isEditing}
                        onChange={handleInputChange}
                        style={getInputStyle(isEditing)}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                      Adres
                    </label>
                    <textarea
                      name="address"
                      value={isEditing ? (formData.address || '') : (selectedSupplier.address || '')}
                      readOnly={!isEditing}
                      onChange={handleInputChange}
                      rows="2"
                      style={{
                        ...getInputStyle(isEditing),
                        resize: 'vertical'
                      }}
                    />
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