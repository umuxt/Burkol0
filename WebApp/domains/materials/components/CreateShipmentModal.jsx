import React, { useState, useEffect, useRef } from 'react'
import { shipmentsService } from '../services/shipments-service.js'
import { Truck, X, Package, Plus, Trash2, ChevronDown, Search, Loader2, AlertCircle, ArrowLeft, ArrowRight, Check } from 'lucide-react'

/**
 * CreateShipmentModal - 3 Aşamalı Wizard
 * Adım 1: Sevkiyat Bilgileri (İş Emri, Teklif, Müşteri, Adres)
 * Adım 2: Malzeme Ekleme (Kalemler)
 * Adım 3: Özet ve Onay
 */
export default function CreateShipmentModal({ 
  isOpen, 
  onClose, 
  onSuccess
}) {
  // Wizard state
  const [currentStep, setCurrentStep] = useState(1)
  
  // Shipment header data
  const [headerData, setHeaderData] = useState({
    workOrderCode: '',
    quoteId: '',
    customerName: '',
    customerCompany: '',
    deliveryAddress: '',
    notes: ''
  })
  
  // Items list
  const [items, setItems] = useState([])
  
  // Form states
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  // Data for dropdowns
  const [materials, setMaterials] = useState([])
  const [workOrders, setWorkOrders] = useState([])
  const [quotes, setQuotes] = useState([])
  const [dataLoading, setDataLoading] = useState(false)
  
  // Dropdown states
  const [workOrderDropdownOpen, setWorkOrderDropdownOpen] = useState(false)
  const [quoteDropdownOpen, setQuoteDropdownOpen] = useState(false)
  
  const modalRef = useRef(null)

  // Load data when modal opens
  useEffect(() => {
    if (isOpen) {
      setDataLoading(true)
      Promise.all([
        shipmentsService.getAvailableMaterials().catch(() => []),
        shipmentsService.getApprovedQuotes().catch(() => []),
        shipmentsService.getCompletedWorkOrders().catch(() => [])
      ]).then(([materialsData, quotesData, workOrdersData]) => {
        setMaterials(materialsData)
        setQuotes(quotesData)
        setWorkOrders(workOrdersData)
      }).finally(() => {
        setDataLoading(false)
      })
      
      // Reset form
      setCurrentStep(1)
      setHeaderData({
        workOrderCode: '',
        quoteId: '',
        customerName: '',
        customerCompany: '',
        deliveryAddress: '',
        notes: ''
      })
      setItems([])
      setError(null)
    }
  }, [isOpen])

  // ESC to close
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEsc)
      return () => document.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  // Close all dropdowns
  const closeAllDropdowns = () => {
    setItems(prev => prev.map(item => ({ ...item, dropdownOpen: false })))
    setWorkOrderDropdownOpen(false)
    setQuoteDropdownOpen(false)
  }

  // Add new item row
  const addItem = () => {
    setItems(prev => [...prev, {
      id: Date.now(),
      materialCode: '',
      materialName: '',
      quantity: '',
      unit: 'adet',
      availableStock: 0,
      notes: '',
      dropdownOpen: false,
      searchTerm: ''
    }])
  }

  // Remove item
  const removeItem = (itemId) => {
    setItems(prev => prev.filter(item => item.id !== itemId))
  }

  // Update item field
  const updateItem = (itemId, field, value) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item
      
      if (field === 'materialCode') {
        const selectedMaterial = materials.find(m => m.code === value)
        if (selectedMaterial) {
          return {
            ...item,
            materialCode: value,
            materialName: selectedMaterial.name,
            unit: selectedMaterial.unit || 'adet',
            availableStock: selectedMaterial.availableStock,
            dropdownOpen: false,
            searchTerm: ''
          }
        }
      }
      
      if (field === 'quantity') {
        let cleanValue = value.replace(/,/g, '.')
        if (!/^[0-9.]*$/.test(cleanValue)) return item
        if ((cleanValue.match(/\./g) || []).length > 1) return item
        return { ...item, [field]: cleanValue }
      }
      
      return { ...item, [field]: value }
    }))
  }

  // Step validation
  const canProceedToStep2 = () => true // Step 1 fields are optional
  
  const canProceedToStep3 = () => {
    if (items.length === 0) {
      setError('En az bir kalem eklemelisiniz')
      return false
    }
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item.materialCode) {
        setError(`Kalem ${i + 1}: Malzeme seçilmemiş`)
        return false
      }
      const qty = parseFloat(item.quantity)
      if (!qty || qty <= 0) {
        setError(`Kalem ${i + 1}: Geçerli bir miktar giriniz`)
        return false
      }
      if (qty > item.availableStock) {
        setError(`Kalem ${i + 1}: Yetersiz stok (Mevcut: ${item.availableStock})`)
        return false
      }
    }
    setError(null)
    return true
  }

  // Navigation
  const handleNext = () => {
    if (currentStep === 1 && canProceedToStep2()) {
      setCurrentStep(2)
      setError(null)
    } else if (currentStep === 2 && canProceedToStep3()) {
      setCurrentStep(3)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
      setError(null)
    }
  }

  // Submit form
  const handleSubmit = async () => {
    setError(null)
    setLoading(true)
    
    try {
      const shipmentData = {
        ...headerData,
        items: items.map(item => ({
          materialCode: item.materialCode,
          quantity: parseFloat(item.quantity),
          unit: item.unit,
          notes: item.notes || undefined
        }))
      }
      
      // Remove empty header fields
      Object.keys(shipmentData).forEach(key => {
        if (shipmentData[key] === '' || shipmentData[key] === undefined) {
          delete shipmentData[key]
        }
      })
      
      const result = await shipmentsService.createShipment(shipmentData)
      
      if (onSuccess) onSuccess(result)
      onClose()
    } catch (err) {
      setError(err.message || 'Sevkiyat oluşturulamadı')
    } finally {
      setLoading(false)
    }
  }

  // Calculate totals
  const totalItems = items.length
  const totalQuantity = items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0)

  // Format quantity for display
  const formatQty = (qty) => {
    if (!qty && qty !== 0) return '-'
    const num = parseFloat(qty)
    return Number.isInteger(num) ? num : num.toFixed(2).replace(/\.?0+$/, '')
  }

  // Step labels
  const steps = [
    { num: 1, label: 'Bilgiler' },
    { num: 2, label: 'Kalemler' },
    { num: 3, label: 'Özet' }
  ]

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
      }}
      onClick={() => { closeAllDropdowns(); onClose(); }}
    >
      <div 
        ref={modalRef}
        onClick={(e) => { e.stopPropagation(); closeAllDropdowns(); }}
        style={{
          backgroundColor: 'var(--card-bg, #ffffff)',
          borderRadius: '12px',
          width: '480px',
          maxWidth: '95vw',
          maxHeight: '85vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0,0,0,0.2)'
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border, #e5e7eb)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: 'var(--primary-light, #dbeafe)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Truck size={18} style={{ color: 'var(--primary, #3b82f6)' }} />
            </div>
            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: '#111827' }}>
              Yeni Sevkiyat
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              color: '#9ca3af'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Steps Indicator */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '8px',
          padding: '16px 20px',
          backgroundColor: 'var(--muted-bg, #f9fafb)',
          borderBottom: '1px solid var(--border, #e5e7eb)'
        }}>
          {steps.map((step, idx) => (
            <React.Fragment key={step.num}>
              {idx > 0 && (
                <div style={{
                  width: '24px',
                  height: '2px',
                  backgroundColor: currentStep > step.num - 1 ? 'var(--primary, #3b82f6)' : 'var(--border, #d1d5db)'
                }} />
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: currentStep >= step.num ? 'var(--primary, #3b82f6)' : 'var(--muted, #e5e7eb)',
                  color: currentStep >= step.num ? '#fff' : '#9ca3af',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: '600'
                }}>
                  {currentStep > step.num ? <Check size={14} /> : step.num}
                </div>
                <span style={{
                  fontSize: '12px',
                  fontWeight: '500',
                  color: currentStep >= step.num ? '#111827' : '#9ca3af'
                }}>
                  {step.label}
                </span>
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          {/* Error */}
          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'var(--error-bg, #fef2f2)',
              border: '1px solid var(--error-border, #fecaca)',
              borderRadius: '8px',
              padding: '10px 14px',
              marginBottom: '16px',
              color: 'var(--error, #dc2626)',
              fontSize: '12px'
            }}>
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* Loading */}
          {dataLoading && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              gap: '10px', 
              padding: '40px',
              color: '#6b7280'
            }}>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: '13px' }}>Veriler yükleniyor...</span>
            </div>
          )}

          {!dataLoading && (
            <>
              {/* ===== STEP 1: Sevkiyat Bilgileri ===== */}
              {currentStep === 1 && (
                <div>
                  <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#6b7280' }}>
                    Sevkiyat için temel bilgileri girin. Bu alanlar opsiyoneldir.
                  </p>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {/* Row 1: İş Emri | Teklif */}
                    {/* Work Order */}
                    <div style={{ position: 'relative', zIndex: 30 }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                        İş Emri
                      </label>
                      <button
                        type="button"
                        className="mes-filter-select"
                        onClick={(e) => { e.stopPropagation(); setWorkOrderDropdownOpen(!workOrderDropdownOpen); setQuoteDropdownOpen(false); }}
                        style={{ width: '100%', justifyContent: 'space-between' }}
                      >
                        <span style={{ color: headerData.workOrderCode ? '#1f2937' : '#9ca3af' }}>
                          {headerData.workOrderCode || 'Seçin...'}
                        </span>
                        <ChevronDown size={14} />
                      </button>
                      {workOrderDropdownOpen && (
                        <div style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          backgroundColor: 'white',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                          zIndex: 9999,
                          maxHeight: '180px',
                          overflow: 'auto',
                          marginTop: '4px'
                        }}>
                          <div 
                            style={{ padding: '8px 12px', cursor: 'pointer', color: '#6b7280', fontStyle: 'italic', fontSize: '12px' }}
                            onClick={() => { setHeaderData(prev => ({ ...prev, workOrderCode: '' })); setWorkOrderDropdownOpen(false); }}
                          >
                            Seçimi temizle
                          </div>
                          {workOrders.map(wo => (
                            <div
                              key={wo.code}
                              style={{ padding: '8px 12px', cursor: 'pointer', borderTop: '1px solid #e5e7eb', fontSize: '13px', color: '#1f2937' }}
                              onClick={() => { setHeaderData(prev => ({ ...prev, workOrderCode: wo.code })); setWorkOrderDropdownOpen(false); }}
                            >
                              {wo.label || wo.code}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Quote */}
                    <div style={{ position: 'relative', zIndex: 30 }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                        Teklif
                      </label>
                      <button
                        type="button"
                        className="mes-filter-select"
                        onClick={(e) => { e.stopPropagation(); setQuoteDropdownOpen(!quoteDropdownOpen); setWorkOrderDropdownOpen(false); }}
                        style={{ width: '100%', justifyContent: 'space-between' }}
                      >
                        <span style={{ color: headerData.quoteId ? '#1f2937' : '#9ca3af' }}>
                          {headerData.quoteId || 'Seçin...'}
                        </span>
                        <ChevronDown size={14} />
                      </button>
                      {quoteDropdownOpen && (
                        <div style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          backgroundColor: 'white',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                          zIndex: 9999,
                          maxHeight: '180px',
                          overflow: 'auto',
                          marginTop: '4px'
                        }}>
                          <div 
                            style={{ padding: '8px 12px', cursor: 'pointer', color: '#6b7280', fontStyle: 'italic', fontSize: '12px' }}
                            onClick={() => { setHeaderData(prev => ({ ...prev, quoteId: '' })); setQuoteDropdownOpen(false); }}
                          >
                            Seçimi temizle
                          </div>
                          {quotes.map(q => (
                            <div
                              key={q.id}
                              style={{ padding: '8px 12px', cursor: 'pointer', borderTop: '1px solid #e5e7eb', fontSize: '13px', color: '#1f2937' }}
                              onClick={() => { setHeaderData(prev => ({ ...prev, quoteId: q.id })); setQuoteDropdownOpen(false); }}
                            >
                              {q.label || `#${q.id}`}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Row 2: Müşteri Adı | Firma */}
                    {/* Customer Name */}
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                        Müşteri Adı
                      </label>
                      <input
                        type="text"
                        className="mes-filter-input is-compact"
                        value={headerData.customerName}
                        onChange={(e) => setHeaderData(prev => ({ ...prev, customerName: e.target.value }))}
                        placeholder="Müşteri adı..."
                        style={{ width: '100%' }}
                      />
                    </div>

                    {/* Customer Company */}
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                        Firma
                      </label>
                      <input
                        type="text"
                        className="mes-filter-input is-compact"
                        value={headerData.customerCompany}
                        onChange={(e) => setHeaderData(prev => ({ ...prev, customerCompany: e.target.value }))}
                        placeholder="Firma adı..."
                        style={{ width: '100%' }}
                      />
                    </div>

                    {/* Row 3: Teslimat Adresi | Notlar */}
                    {/* Delivery Address */}
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                        Teslimat Adresi
                      </label>
                      <input
                        type="text"
                        className="mes-filter-input is-compact"
                        value={headerData.deliveryAddress}
                        onChange={(e) => setHeaderData(prev => ({ ...prev, deliveryAddress: e.target.value }))}
                        placeholder="Teslimat adresi..."
                        style={{ width: '100%' }}
                      />
                    </div>

                    {/* Notes */}
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                        Notlar
                      </label>
                      <input
                        type="text"
                        className="mes-filter-input is-compact"
                        value={headerData.notes}
                        onChange={(e) => setHeaderData(prev => ({ ...prev, notes: e.target.value }))}
                        placeholder="Sevkiyat notu..."
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ===== STEP 2: Kalemler ===== */}
              {currentStep === 2 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
                      Sevk edilecek malzemeleri ekleyin
                    </p>
                    <button
                      type="button"
                      onClick={addItem}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '6px 10px',
                        backgroundColor: 'var(--primary, #3b82f6)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                    >
                      <Plus size={14} />
                      Ekle
                    </button>
                  </div>

                  {items.length === 0 ? (
                    <div style={{
                      textAlign: 'center',
                      padding: '32px 20px',
                      backgroundColor: '#f9fafb',
                      borderRadius: '8px',
                      color: '#6b7280'
                    }}>
                      <Package size={28} style={{ marginBottom: '8px', opacity: 0.5 }} />
                      <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>Henüz kalem eklenmedi</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {items.map((item, index) => (
                        <div 
                          key={item.id} 
                          style={{
                            backgroundColor: 'var(--muted-bg, #f9fafb)',
                            borderRadius: '8px',
                            padding: '12px',
                            border: '1px solid var(--border, #e5e7eb)'
                          }}
                        >
                          {/* Material Select */}
                          <div style={{ position: 'relative', marginBottom: '8px' }}>
                            <button
                              type="button"
                              className="mes-filter-select"
                              onClick={(e) => { 
                                e.stopPropagation()
                                setItems(prev => prev.map((it, idx) => ({
                                  ...it,
                                  dropdownOpen: idx === index ? !it.dropdownOpen : false
                                })))
                              }}
                              style={{ width: '100%', justifyContent: 'space-between' }}
                            >
                              <span style={{ 
                                color: item.materialCode ? '#1f2937' : '#9ca3af',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontSize: '13px'
                              }}>
                                {item.materialCode ? `${item.materialCode} - ${item.materialName}` : 'Malzeme seç...'}
                              </span>
                              <ChevronDown size={14} />
                            </button>
                            {item.dropdownOpen && (
                              <div style={{
                                position: 'fixed',
                                top: 'auto',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                width: '420px',
                                backgroundColor: 'white',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                                zIndex: 99999,
                                maxHeight: '250px',
                                overflow: 'auto',
                                marginTop: '4px'
                              }}>
                                {/* Search */}
                                <div style={{ padding: '8px', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, backgroundColor: 'white' }}>
                                  <div style={{ position: 'relative' }}>
                                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                                    <input
                                      type="text"
                                      className="mes-filter-input is-compact"
                                      value={item.searchTerm}
                                      onChange={(e) => updateItem(item.id, 'searchTerm', e.target.value)}
                                      placeholder="Malzeme ara..."
                                      style={{ paddingLeft: '32px', width: '100%', fontSize: '12px', color: '#1f2937' }}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </div>
                                </div>
                                {/* Options */}
                                {materials
                                  .filter(m => 
                                    !item.searchTerm || 
                                    m.code.toLowerCase().includes(item.searchTerm.toLowerCase()) ||
                                    m.name.toLowerCase().includes(item.searchTerm.toLowerCase())
                                  )
                                  .map(m => (
                                    <div
                                      key={m.code}
                                      style={{ 
                                        padding: '8px 12px', 
                                        cursor: 'pointer', 
                                        borderBottom: '1px solid #f3f4f6',
                                        backgroundColor: item.materialCode === m.code ? '#dbeafe' : 'transparent'
                                      }}
                                      onClick={(e) => { e.stopPropagation(); updateItem(item.id, 'materialCode', m.code); }}
                                    >
                                      <div style={{ fontWeight: '500', fontSize: '12px', color: '#1f2937' }}>{m.code}</div>
                                      <div style={{ fontSize: '11px', color: '#6b7280', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{m.name}</span>
                                        <span style={{ color: '#16a34a' }}>Stok: {formatQty(m.availableStock)} {m.unit}</span>
                                      </div>
                                    </div>
                                  ))
                                }
                                {materials.filter(m => 
                                  !item.searchTerm || 
                                  m.code.toLowerCase().includes(item.searchTerm.toLowerCase()) ||
                                  m.name.toLowerCase().includes(item.searchTerm.toLowerCase())
                                ).length === 0 && (
                                  <div style={{ padding: '16px', textAlign: 'center', color: '#9ca3af', fontSize: '12px' }}>
                                    Malzeme bulunamadı
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Quantity & Actions Row */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <input
                                type="text"
                                inputMode="decimal"
                                className="mes-filter-input is-compact"
                                value={item.quantity}
                                onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                                placeholder="Miktar"
                                pattern="[0-9]*\.?[0-9]*"
                                style={{ width: '80px', textAlign: 'right', fontSize: '13px' }}
                              />
                              <span style={{ fontSize: '12px', color: '#6b7280' }}>
                                {item.unit}
                              </span>
                            </div>
                            {item.materialCode && (
                              <span style={{ 
                                fontSize: '11px', 
                                color: 'var(--success, #16a34a)',
                                backgroundColor: 'var(--success-bg, #dcfce7)',
                                padding: '2px 6px',
                                borderRadius: '4px'
                              }}>
                                Mevcut: {formatQty(item.availableStock)}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => removeItem(item.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '4px',
                                color: 'var(--error, #dc2626)'
                              }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ===== STEP 3: Özet ===== */}
              {currentStep === 3 && (
                <div>
                  <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#6b7280' }}>
                    Sevkiyat bilgilerini kontrol edin ve onaylayın
                  </p>

                  {/* Header Info */}
                  {(headerData.workOrderCode || headerData.quoteId || headerData.customerName || headerData.customerCompany || headerData.deliveryAddress) && (
                    <div style={{
                      backgroundColor: 'var(--muted-bg, #f9fafb)',
                      borderRadius: '8px',
                      padding: '12px',
                      marginBottom: '16px',
                      fontSize: '13px'
                    }}>
                      <h4 style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: '600', color: '#374151', textTransform: 'uppercase' }}>
                        Sevkiyat Bilgileri
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        {headerData.workOrderCode && (
                          <div><span style={{ color: '#6b7280' }}>İş Emri:</span> {headerData.workOrderCode}</div>
                        )}
                        {headerData.quoteId && (
                          <div><span style={{ color: '#6b7280' }}>Teklif:</span> #{headerData.quoteId}</div>
                        )}
                        {headerData.customerName && (
                          <div><span style={{ color: '#6b7280' }}>Müşteri:</span> {headerData.customerName}</div>
                        )}
                        {headerData.customerCompany && (
                          <div><span style={{ color: '#6b7280' }}>Firma:</span> {headerData.customerCompany}</div>
                        )}
                      </div>
                      {headerData.deliveryAddress && (
                        <div style={{ marginTop: '6px' }}>
                          <span style={{ color: '#6b7280' }}>Adres:</span> {headerData.deliveryAddress}
                        </div>
                      )}
                      {headerData.notes && (
                        <div style={{ marginTop: '6px', fontStyle: 'italic', color: '#6b7280' }}>
                          Not: {headerData.notes}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Items Summary */}
                  <div style={{
                    border: '1px solid var(--border, #e5e7eb)',
                    borderRadius: '8px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      backgroundColor: 'var(--muted-bg, #f9fafb)',
                      padding: '10px 12px',
                      borderBottom: '1px solid var(--border)',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#374151',
                      textTransform: 'uppercase'
                    }}>
                      Kalemler ({totalItems})
                    </div>
                    {items.map((item, index) => (
                      <div 
                        key={item.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 12px',
                          borderBottom: index < items.length - 1 ? '1px solid var(--border, #f3f4f6)' : 'none',
                          fontSize: '13px'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: '500' }}>{item.materialCode}</div>
                          <div style={{ fontSize: '11px', color: '#6b7280' }}>{item.materialName}</div>
                        </div>
                        <div style={{ fontWeight: '600', color: 'var(--primary, #3b82f6)' }}>
                          {formatQty(item.quantity)} {item.unit}
                        </div>
                      </div>
                    ))}
                    <div style={{
                      backgroundColor: 'var(--primary-light, #dbeafe)',
                      padding: '10px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '13px',
                      fontWeight: '600'
                    }}>
                      <span>Toplam</span>
                      <span>{formatQty(totalQuantity)}</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 20px',
          borderTop: '1px solid var(--border, #e5e7eb)',
          backgroundColor: 'var(--card-bg, #ffffff)'
        }}>
          {/* Left side - Back button or empty */}
          <div>
            {currentStep > 1 && (
              <button
                type="button"
                onClick={handleBack}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '8px 14px',
                  backgroundColor: 'transparent',
                  color: '#6b7280',
                  border: '1px solid var(--border, #d1d5db)',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                <ArrowLeft size={14} />
                Geri
              </button>
            )}
          </div>
          
          {/* Right side - Next/Submit button */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 14px',
                backgroundColor: 'transparent',
                color: '#6b7280',
                border: '1px solid var(--border, #d1d5db)',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              İptal
            </button>
            
            {currentStep < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={currentStep === 2 && items.length === 0}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '8px 14px',
                  backgroundColor: (currentStep === 2 && items.length === 0) ? 'var(--muted, #9ca3af)' : 'var(--primary, #3b82f6)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: (currentStep === 2 && items.length === 0) ? 'not-allowed' : 'pointer'
                }}
              >
                İleri
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  backgroundColor: loading ? 'var(--muted, #9ca3af)' : 'var(--success, #16a34a)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? (
                  <>
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    Oluşturuluyor...
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    Sevkiyat Oluştur
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
