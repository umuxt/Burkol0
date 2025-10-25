import React, { useState, useEffect } from 'react'
import { useSuppliers } from '../hooks/useSuppliers.js'
import { useMaterials } from '../hooks/useFirebaseMaterials.js'
import { useOrderActions } from '../hooks/useOrders.js'

export default function AddOrderModal({ isOpen, onClose, onSave, deliveredRecordMode = false }) {
  
  const [currentStep, setCurrentStep] = useState(1) // 1: Tedarikçi Seçimi, 2: Malzeme Ekleme, 3: Özet
  const [formData, setFormData] = useState({
    supplierId: '',
    supplierName: '',
    orderStatus: 'Taslak',
    expectedDeliveryDate: '',
    notes: ''
  })
  const [selectedMaterials, setSelectedMaterials] = useState([])
  const [availableMaterials, setAvailableMaterials] = useState([])
  const [supplierMaterials, setSupplierMaterials] = useState([])
  const [supplierMaterialsLoading, setSupplierMaterialsLoading] = useState(false)
  const [supplierMaterialsError, setSupplierMaterialsError] = useState(null)

  // Firebase hooks
  const { suppliers, loading: suppliersLoading, getMaterialsForSupplier } = useSuppliers()
  const { materials, loading: materialsLoading, initialized: materialsInitialized, loadMaterials } = useMaterials(true)
  const { createOrderWithItems, loading: orderLoading } = useOrderActions()

  // Debug hooks
  useEffect(() => {
    console.log('🔍 AddOrderModal: Hook durumları:', {
      suppliersLoading,
      materialsLoading,
      suppliersCount: suppliers?.length || 0,
      materialsCount: materials?.length || 0,
      suppliers: suppliers?.slice(0, 3).map(s => ({ id: s.id, code: s.code, name: s.name || s.companyName })),
      materials: materials?.slice(0, 3).map(m => ({ code: m.code, name: m.name }))
    });
  }, [suppliers, materials, suppliersLoading, materialsLoading])

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1)
      setFormData({
        supplierId: '',
        supplierName: '',
        orderStatus: 'Taslak',
        expectedDeliveryDate: '',
        notes: ''
      })
      setSelectedMaterials([])
      setAvailableMaterials([])
      setSupplierMaterials([])
      setSupplierMaterialsError(null)
      setSupplierMaterialsLoading(false)

      if (!materialsInitialized) {
        loadMaterials()
      }
    }
  }, [isOpen, materialsInitialized, loadMaterials])

  useEffect(() => {
    let isCancelled = false

    const fetchSupplierMaterials = async () => {
      if (!formData.supplierId) {
        setSupplierMaterials([])
        return
      }

      try {
        setSupplierMaterialsLoading(true)
        setSupplierMaterialsError(null)
        const response = await getMaterialsForSupplier(formData.supplierId)
        if (!isCancelled) {
          setSupplierMaterials(Array.isArray(response) ? response : [])
        }
      } catch (error) {
        if (!isCancelled) {
          setSupplierMaterials([])
          setSupplierMaterialsError(error.message)
        }
      } finally {
        if (!isCancelled) {
          setSupplierMaterialsLoading(false)
        }
      }
    }

    fetchSupplierMaterials()

    return () => {
      isCancelled = true
    }
  }, [formData.supplierId, getMaterialsForSupplier])

  // Update available materials when supplier changes
  useEffect(() => {
    console.log('� AddOrderModal useEffect tetiklendi!', {
      supplierId: formData.supplierId,
      suppliersCount: suppliers?.length || 0,
      materialsCount: materials?.length || 0,
      suppliers: suppliers ? 'var' : 'yok',
      materials: materials ? 'var' : 'yok'
    });
    
    if (formData.supplierId && suppliers && materials) {
      const selectedSupplier = suppliers.find(s => s.id === formData.supplierId)
      console.log('🔍 AddOrderModal: Seçilen tedarikçi:', {
        supplier: selectedSupplier,
        hasSuppliedMaterials: !!selectedSupplier?.suppliedMaterials,
        suppliedMaterialsCount: selectedSupplier?.suppliedMaterials?.length || 0
      });

      const supplierMaterialSource = supplierMaterials.length > 0
        ? supplierMaterials
        : selectedSupplier?.suppliedMaterials

      if (selectedSupplier && supplierMaterialSource) {
        console.log('🔍 AddOrderModal: Tedarikçi bulundu:', selectedSupplier.name || selectedSupplier.companyName);
        console.log('🔍 AddOrderModal: SuppliedMaterials ham data:', supplierMaterialSource);

        // Get active materials that this supplier can provide
        // SuppliedMaterials iki format destekler: {id, name, status} ve {materialId, materialCode}
        const normalizeStatus = (status) => {
          if (!status) return ''
          return String(status).toLowerCase()
        }

        const activeMaterialIds = supplierMaterialSource
          .filter(sm => {
            // Sadece aktif malzemeleri al (status kontrolü)
            const relationStatus = normalizeStatus(sm.status)
            const isActive = relationStatus === '' || relationStatus === 'aktif' || relationStatus === 'active'
            console.log('🔍 Material status check:', {
              id: sm.materialId || sm.id,
              name: sm.materialName || sm.name,
              status: sm.status,
              isActive
            });
            return isActive;
          })
          .map(sm => sm.materialId || sm.id) // Her iki formatı destekle
          .filter(Boolean); // undefined değerleri filtrele

        const activeMaterialCodes = supplierMaterialSource
          .map(sm => sm.materialCode || sm.code)
          .filter(Boolean);
          
        console.log('🔍 AddOrderModal: Aktif malzeme ID\'leri:', activeMaterialIds);
        console.log('🔍 AddOrderModal: Aktif malzeme kodları:', activeMaterialCodes);
        
        // Materials collection'ından bu ID'lere sahip malzemeleri bul
        const available = materials.filter(m => {
          const isIncludedById = activeMaterialIds.includes(m.id);
          const isIncludedByCode = activeMaterialCodes.includes(m.code);
          const materialStatus = normalizeStatus(m.status)
          const isMaterialActive = materialStatus === '' || materialStatus === 'aktif' || materialStatus === 'active'
          const isIncluded = (isIncludedById || isIncludedByCode) && isMaterialActive;
          if (isIncluded) {
            console.log('🔍 Eşleşen malzeme:', { id: m.id, code: m.code, name: m.name });
          }
          return isIncluded;
        });
        
        console.log('🔍 AddOrderModal: Final eşleşen malzemeler:', {
          availableCount: available.length,
          available: available.map(m => ({ id: m.id, code: m.code, name: m.name })),
          totalMaterialsInDB: materials.length,
          supplierMaterialCount: selectedSupplier.suppliedMaterials.length,
          activeMaterialCount: activeMaterialIds.length
        });
        
        setAvailableMaterials(available)
      } else {
        console.log('🔍 AddOrderModal: Tedarikçi suppliedMaterials yok');
        setAvailableMaterials([])
      }
    } else {
      console.log('🔍 AddOrderModal: Gerekli veriler eksik', {
        hasSupplierId: !!formData.supplierId,
        hasSuppliers: !!suppliers,
        hasMaterials: !!materials
      });
    }
  }, [formData.supplierId, suppliers, materials])

  // Debug: availableMaterials state'ini takip et
  useEffect(() => {
    console.log('🔍 AddOrderModal: availableMaterials state güncellendi:', {
      count: availableMaterials.length,
      materials: availableMaterials.map(m => ({ id: m.id, code: m.code, name: m.name }))
    });
  }, [availableMaterials])

  useEffect(() => {
    console.log('🔍 AddOrderModal: supplierMaterials state güncellendi:', {
      count: supplierMaterials.length,
      supplierMaterials
    })
  }, [supplierMaterials])

  if (!isOpen) return null

  // Handle supplier selection
  const handleSupplierChange = (supplierId) => {
    console.log('🔥 handleSupplierChange çağrıldı:', supplierId);
    const supplier = suppliers.find(s => s.id === supplierId)
    console.log('🔥 Bulunan supplier:', supplier);
    setFormData(prev => ({
      ...prev,
      supplierId,
      supplierName: supplier ? supplier.name || supplier.companyName : ''
    }))
    setSelectedMaterials([])
    setAvailableMaterials([])
    setSupplierMaterials([])
    setSupplierMaterialsError(null)
    console.log('🔥 FormData güncellendi, yeni supplierId:', supplierId);
  }

  // Add material to order
  const addMaterial = (material) => {
    // Get supplier-specific pricing if available
    const supplier = suppliers.find(s => s.id === formData.supplierId)
    const supplierMaterial = supplier?.suppliedMaterials?.find(sm => sm.materialCode === material.code)

    const occurrenceCount = selectedMaterials.filter(m => m.materialCode === material.code).length
    const lineIndex = occurrenceCount + 1
    const lineId = `${material.code}-${String(lineIndex).padStart(2, '0')}`

    const newMaterial = {
      lineId,
      lineIndex,
      materialCode: material.code,
      materialName: material.name,
      quantity: 1,
      unitPrice: supplierMaterial?.price || material.costPrice || 0,
      expectedDeliveryDate: deliveredRecordMode ? new Date() : (formData.expectedDeliveryDate || null),
      actualDeliveryDate: deliveredRecordMode ? new Date() : null,
      itemStatus: deliveredRecordMode ? 'Teslim Edildi' : 'Onay Bekliyor'
    }

    setSelectedMaterials(prev => [...prev, newMaterial])
  }

  // Remove material from order
  const removeMaterial = (lineId) => {
    setSelectedMaterials(prev => {
      const updated = prev.filter(m => m.lineId !== lineId)

      // Recalculate indices for remaining lines per material code
      const reindexed = []
      const codeCounters = {}
      updated.forEach(item => {
        const counter = (codeCounters[item.materialCode] || 0) + 1
        codeCounters[item.materialCode] = counter
        reindexed.push({
          ...item,
          lineIndex: counter,
          lineId: `${item.materialCode}-${String(counter).padStart(2, '0')}`
        })
      })

      return reindexed
    })
  }

  // Update material quantity or price
  const updateMaterial = (lineId, field, value) => {
    setSelectedMaterials(prev => 
      prev.map(m => 
        m.lineId === lineId 
          ? { ...m, [field]: field === 'quantity' || field === 'unitPrice' ? Number(value) : value }
          : m
      )
    )
  }

  // Calculate total amount
  const totalAmount = selectedMaterials.reduce((sum, material) => 
    sum + (material.quantity * material.unitPrice), 0
  )

  // Handle form submission
  const handleSubmit = async () => {
    try {
      
      if (selectedMaterials.length === 0) {
        alert('En az bir malzeme eklemelisiniz')
        return
      }

      // today string for expected delivery when delivered mode
      const today = new Date()
      const yyyy = today.getFullYear()
      const mm = String(today.getMonth() + 1).padStart(2, '0')
      const dd = String(today.getDate()).padStart(2, '0')
      const todayStr = `${yyyy}-${mm}-${dd}`

      const orderData = {
        ...formData,
        expectedDeliveryDate: deliveredRecordMode ? todayStr : formData.expectedDeliveryDate,
        orderStatus: deliveredRecordMode ? 'Teslim Edildi' : formData.orderStatus,
        totalAmount
      }

      console.log('📋 AddOrderModal: Order data hazırlandı:', orderData);
      console.log('📦 AddOrderModal: Selected materials:', selectedMaterials);

      const result = await createOrderWithItems(orderData, selectedMaterials, { deliveredRecordMode })
      
      console.log('✅ AddOrderModal: Order oluşturuldu:', result);
      
      if (onSave) {
        onSave(result)
      }
      
      onClose()
      
    } catch (error) {
      console.error('❌ AddOrderModal: Error creating order:', error)
      alert('Sipariş oluşturulurken hata oluştu: ' + error.message)
    }
  }

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY'
    }).format(amount || 0)
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'white',
        borderRadius: '8px',
        width: '90%',
        maxWidth: '900px',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        color: '#1f2937'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
            {deliveredRecordMode ? 'Doğrudan Sipariş Kaydı' : 'Yeni Sipariş Oluştur'}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ×
          </button>
        </div>

        {/* Steps Indicator */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'center'
        }}>
          {[1, 2, 3].map(step => (
            <div key={step} style={{
              display: 'flex',
              alignItems: 'center',
              marginRight: step < 3 ? '24px' : '0'
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: step <= currentStep ? '#3b82f6' : '#e5e7eb',
                color: step <= currentStep ? 'white' : '#6b7280',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                fontWeight: '600'
              }}>
                {step}
              </div>
              <span style={{
                marginLeft: '8px',
                fontSize: '14px',
                color: step <= currentStep ? '#1f2937' : '#6b7280',
                fontWeight: step === currentStep ? '600' : '400'
              }}>
                {step === 1 ? 'Tedarikçi' : step === 2 ? 'Malzemeler' : 'Özet'}
              </span>
              {step < 3 && (
                <div style={{
                  width: '32px',
                  height: '2px',
                  background: step < currentStep ? '#3b82f6' : '#e5e7eb',
                  marginLeft: '16px'
                }} />
              )}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '24px'
        }}>
          {/* Step 1: Supplier Selection */}
          {currentStep === 1 && (
            <div>
              <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Tedarikçi Seçimi</h3>
              
              {suppliersLoading ? (
                <p>Tedarikçiler yükleniyor...</p>
              ) : (
                <div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ 
                      display: 'block', 
                      marginBottom: '6px', 
                      fontSize: '14px', 
                      fontWeight: '600' 
                    }}>
                      Tedarikçi *
                    </label>
                    <select
                      value={formData.supplierId}
                      onChange={(e) => handleSupplierChange(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px'
                      }}
                    >
                      <option value="">Tedarikçi seçiniz</option>
                      {suppliers?.map(supplier => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name || supplier.companyName} ({supplier.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr 1fr', 
                    gap: '16px',
                    marginTop: '20px'
                  }}>
                    {!deliveredRecordMode && (
                    <div>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '6px', 
                        fontSize: '14px', 
                        fontWeight: '600' 
                      }}>
                        Sipariş Durumu
                      </label>
                      <select
                        value={formData.orderStatus}
                        onChange={(e) => setFormData(prev => ({ ...prev, orderStatus: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '14px'
                        }}
                      >
                        <option value="Taslak">Taslak</option>
                        <option value="Onay Bekliyor">Onay Bekliyor</option>
                        <option value="Onaylandı">Onaylandı</option>
                      </select>
                    </div>
                    )}

                    {!deliveredRecordMode && (
                    <div>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '6px', 
                        fontSize: '14px', 
                        fontWeight: '600' 
                      }}>
                        Beklenen Teslimat Tarihi
                      </label>
                      <input
                        type="date"
                        value={formData.expectedDeliveryDate}
                        onChange={(e) => setFormData(prev => ({ ...prev, expectedDeliveryDate: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '14px'
                        }}
                      />
                    </div>
                    )}
                  </div>

                  <div style={{ marginTop: '16px' }}>
                    <label style={{ 
                      display: 'block', 
                      marginBottom: '6px', 
                      fontSize: '14px', 
                      fontWeight: '600' 
                    }}>
                      Notlar
                    </label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Sipariş ile ilgili notlar..."
                      style={{
                        width: '100%',
                        minHeight: '80px',
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                        resize: 'vertical'
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Material Selection */}
          {currentStep === 2 && (
            <div>
              <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Malzeme Seçimi</h3>
              
              {/* Debug Info */}
              <div style={{ background: '#f0f9ff', padding: '8px', marginBottom: '16px', fontSize: '12px', borderRadius: '4px' }}>
                Debug: availableMaterials.length = {availableMaterials.length}, 
                materialsLoading = {materialsLoading.toString()},
                supplierMaterialsLoading = {supplierMaterialsLoading.toString()},
                currentStep = {currentStep}
              </div>
              
              {/* Available Materials */}
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ marginBottom: '12px' }}>Mevcut Malzemeler</h4>
                {materialsLoading || supplierMaterialsLoading ? (
                  <p>Malzemeler yükleniyor...</p>
                ) : supplierMaterialsError ? (
                  <p style={{ color: '#dc2626', fontStyle: 'italic' }}>
                    Malzemeler yüklenirken hata oluştu: {supplierMaterialsError}
                  </p>
                ) : availableMaterials.length === 0 ? (
                  <p style={{ color: '#6b7280', fontStyle: 'italic' }}>
                    Bu tedarikçi için mevcut malzeme bulunamadı.
                  </p>
                ) : (
                  <div style={{
                    maxHeight: '200px',
                    overflow: 'auto',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px'
                  }}>
                    {availableMaterials.map(material => (
                      <div
                        key={material.code}
                        style={{
                          padding: '12px',
                          borderBottom: '1px solid #f3f4f6',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: '600', fontSize: '14px' }}>
                            {material.name}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>
                            {material.code} • {material.unit}
                          </div>
                        </div>
                        <button
                          onClick={() => addMaterial(material)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            background: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          Ekle
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected Materials */}
              <div>
                <h4 style={{ marginBottom: '12px' }}>Seçilen Malzemeler</h4>
                {selectedMaterials.length === 0 ? (
                  <p style={{ color: '#6b7280', fontStyle: 'italic' }}>
                    Henüz malzeme eklenmemiş.
                  </p>
                ) : (
                  <div style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px'
                  }}>
                    {selectedMaterials.map((material, index) => (
                      <div
                        key={material.lineId}
                        style={{
                          padding: '16px',
                          borderBottom: index < selectedMaterials.length - 1 ? '1px solid #f3f4f6' : 'none'
                        }}
                      >
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '2fr 1fr 1fr 50px',
                          gap: '12px',
                          alignItems: 'center'
                        }}>
                          <div>
                            <div style={{ fontSize: '12px', color: '#3b82f6', fontWeight: '600', marginBottom: '4px' }}>
                              {material.lineId}
                            </div>
                          <div style={{ fontWeight: '600', fontSize: '14px' }}>
                            {material.materialName}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>
                            {material.materialCode}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>
                            Durum: {material.itemStatus}
                          </div>
                        </div>
                          <div>
                            <label style={{ fontSize: '12px', color: '#6b7280' }}>Miktar</label>
                            <input
                            type="number"
                            min="1"
                            value={material.quantity}
                            onChange={(e) => updateMaterial(material.lineId, 'quantity', e.target.value)}
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                fontSize: '13px'
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '12px', color: '#6b7280' }}>Birim Fiyat</label>
                            <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={material.unitPrice}
                            onChange={(e) => updateMaterial(material.lineId, 'unitPrice', e.target.value)}
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                fontSize: '13px'
                              }}
                            />
                          </div>
                          <button
                          onClick={() => removeMaterial(material.lineId)}
                          style={{
                              background: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '6px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            ×
                          </button>
                        </div>
                        <div style={{
                          marginTop: '8px',
                          textAlign: 'right',
                          fontSize: '14px',
                          fontWeight: '600'
                        }}>
                          Toplam: {formatCurrency(material.quantity * material.unitPrice)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Summary */}
          {currentStep === 3 && (
            <div>
              <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Sipariş Özeti</h3>
              
              <div style={{
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                padding: '20px'
              }}>
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ marginBottom: '12px' }}>Sipariş Bilgileri</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <strong>Tedarikçi:</strong> {formData.supplierName}
                    </div>
                    <div>
                      <strong>Durum:</strong> {formData.orderStatus}
                    </div>
                    <div>
                      <strong>Beklenen Teslimat:</strong> {formData.expectedDeliveryDate || 'Belirtilmemiş'}
                    </div>
                    <div>
                      <strong>Toplam Tutar:</strong> <span style={{ color: '#059669', fontWeight: '600' }}>{formatCurrency(totalAmount)}</span>
                    </div>
                  </div>
                  {formData.notes && (
                    <div style={{ marginTop: '12px' }}>
                      <strong>Notlar:</strong> {formData.notes}
                    </div>
                  )}
                </div>

                <div>
                  <h4 style={{ marginBottom: '12px' }}>Sipariş Satırları ({selectedMaterials.length})</h4>
                  {selectedMaterials.map((material, index) => (
                    <div
                      key={material.lineId}
                      style={{
                        padding: '12px',
                        background: '#f8f9fa',
                        borderRadius: '4px',
                        marginBottom: index < selectedMaterials.length - 1 ? '8px' : '0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '12px', color: '#3b82f6', fontWeight: '600' }}>{material.lineId}</div>
                        <div style={{ fontWeight: '600' }}>{material.materialName}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          {material.materialCode} • {material.quantity} adet × {formatCurrency(material.unitPrice)}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          Durum: {material.itemStatus}
                        </div>
                      </div>
                      <div style={{ fontWeight: '600' }}>
                        {formatCurrency(material.quantity * material.unitPrice)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            {currentStep > 1 && (
              <button
                onClick={() => setCurrentStep(prev => prev - 1)}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #d1d5db',
                  background: 'white',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                ← Geri
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                border: '1px solid #d1d5db',
                background: 'white',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              İptal
            </button>
            
            {currentStep < 3 ? (
              <button
                onClick={() => setCurrentStep(prev => prev + 1)}
                disabled={
                  (currentStep === 1 && !formData.supplierId) ||
                  (currentStep === 2 && selectedMaterials.length === 0)
                }
                style={{
                  padding: '8px 16px',
                  background: (currentStep === 1 && !formData.supplierId) || 
                             (currentStep === 2 && selectedMaterials.length === 0)
                    ? '#e5e7eb' : '#3b82f6',
                  color: (currentStep === 1 && !formData.supplierId) || 
                         (currentStep === 2 && selectedMaterials.length === 0)
                    ? '#6b7280' : 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: (currentStep === 1 && !formData.supplierId) || 
                           (currentStep === 2 && selectedMaterials.length === 0)
                    ? 'not-allowed' : 'pointer',
                  fontSize: '14px'
                }}
              >
                İleri →
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={orderLoading || selectedMaterials.length === 0}
                style={{
                  padding: '8px 16px',
                  background: orderLoading || selectedMaterials.length === 0 ? '#e5e7eb' : '#059669',
                  color: orderLoading || selectedMaterials.length === 0 ? '#6b7280' : 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: orderLoading || selectedMaterials.length === 0 ? 'not-allowed' : 'pointer',
                  fontSize: '14px'
                }}
              >
                {orderLoading ? (deliveredRecordMode ? 'Ekleniyor...' : 'Oluşturuluyor...') : (deliveredRecordMode ? 'Doğrudan Ekle' : 'Siparişi Oluştur')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
