import React, { useState, useEffect, useRef } from 'react'
import { shipmentsService } from '../../../services/shipments-service.js'
import { Truck, X, Package, Plus, Trash2, ChevronDown, Search, Loader2, AlertCircle, ArrowLeft, ArrowRight, Check } from 'lucide-react'

/**
 * CreateShipmentModal - 3 Aşamalı Wizard
 * Adım 1: Sevkiyat Bilgileri (İş Emri, Teklif, Müşteri, Adres)
 * Adım 2: Malzeme Ekleme (Kalemler)
 * Adım 3: Özet ve Onay
 */
export default function AddShipmentModal({ 
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
      className="modal-overlay-fixed"
      onClick={() => { closeAllDropdowns(); onClose(); }}
    >
      <div 
        ref={modalRef}
        onClick={(e) => { e.stopPropagation(); closeAllDropdowns(); }}
        className="shipment-modal-container"
      >
        {/* Header */}
        <div className="shipment-modal-header">
          <div className="flex-center-gap-10">
            <div className="shipment-header-icon">
              <Truck size={18} className="text-primary-var" />
            </div>
            <h2 className="shipment-modal-title">
              Yeni Sevkiyat
            </h2>
          </div>
          <button
            onClick={onClose}
            className="shipment-close-btn"
          >
            <X size={18} />
          </button>
        </div>

        {/* Steps Indicator */}
        <div className="shipment-steps-container">
          {steps.map((step, idx) => (
            <React.Fragment key={step.num}>
              {idx > 0 && (
                <div className={`step-connector ${currentStep > step.num - 1 ? 'active' : 'inactive'}`} />
              )}
              <div className="flex-center-gap-6">
                <div className={`step-circle ${currentStep >= step.num ? 'active' : 'inactive'}`}>
                  {currentStep > step.num ? <Check size={14} /> : step.num}
                </div>
                <span className={`step-label ${currentStep >= step.num ? 'active' : 'inactive'}`}>
                  {step.label}
                </span>
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* Body */}
        <div className="panel-content">
          {/* Error */}
          {error && (
            <div className="error-banner">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* Loading */}
          {dataLoading && (
            <div className="loading-center">
              <Loader2 size={18} className="spin-animation" />
              <span className="text-13">Veriler yükleniyor...</span>
            </div>
          )}

          {!dataLoading && (
            <>
              {/* ===== STEP 1: Sevkiyat Bilgileri ===== */}
              {currentStep === 1 && (
                <div>
                  <p className="text-xs-light-mb">
                    Sevkiyat için temel bilgileri girin. Bu alanlar opsiyoneldir.
                  </p>
                  
                  <div className="grid-2-gap-12">
                    {/* Row 1: İş Emri | Teklif */}
                    {/* Work Order */}
                    <div className="pos-z30">
                      <label className="supplier-label-block">
                        İş Emri
                      </label>
                      <button
                        type="button"
                        className="mes-filter-select full-justify-between"
                        onClick={(e) => { e.stopPropagation(); setWorkOrderDropdownOpen(!workOrderDropdownOpen); setQuoteDropdownOpen(false); }}
                      >
                        <span className={`text-conditional ${!headerData.workOrderCode ? 'placeholder' : ''}`}>
                          {headerData.workOrderCode || 'Seçin...'}
                        </span>
                        <ChevronDown size={14} />
                      </button>
                      {workOrderDropdownOpen && (
                        <div className="dropdown-menu-popup">
                          <div 
                            className="dropdown-item-muted"
                            onClick={() => { setHeaderData(prev => ({ ...prev, workOrderCode: '' })); setWorkOrderDropdownOpen(false); }}
                          >
                            Seçimi temizle
                          </div>
                          {workOrders.map(wo => (
                            <div
                              key={wo.code}
                              className="dropdown-item-action"
                              onClick={() => { setHeaderData(prev => ({ ...prev, workOrderCode: wo.code })); setWorkOrderDropdownOpen(false); }}
                            >
                              {wo.label || wo.code}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Quote */}
                    <div className="pos-z30">
                      <label className="supplier-label-block">
                        Teklif
                      </label>
                      <button
                        type="button"
                        className="mes-filter-select full-justify-between"
                        onClick={(e) => { e.stopPropagation(); setQuoteDropdownOpen(!quoteDropdownOpen); setWorkOrderDropdownOpen(false); }}
                      >
                        <span className={`text-conditional ${!headerData.quoteId ? 'placeholder' : ''}`}>
                          {headerData.quoteId || 'Seçin...'}
                        </span>
                        <ChevronDown size={14} />
                      </button>
                      {quoteDropdownOpen && (
                        <div className="dropdown-menu-popup">
                          <div 
                            className="dropdown-item-muted"
                            onClick={() => { setHeaderData(prev => ({ ...prev, quoteId: '' })); setQuoteDropdownOpen(false); }}
                          >
                            Seçimi temizle
                          </div>
                          {quotes.map(q => (
                            <div
                              key={q.id}
                              className="dropdown-item-action"
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
                    <div className="pos-relative-z1">
                      <label className="supplier-label-block">
                        Müşteri Adı
                      </label>
                      <input
                        type="text"
                        className="mes-filter-input is-compact w-full"
                        value={headerData.customerName}
                        onChange={(e) => setHeaderData(prev => ({ ...prev, customerName: e.target.value }))}
                        placeholder="Müşteri adı..."
                      />
                    </div>

                    {/* Customer Company */}
                    <div className="pos-relative-z1">
                      <label className="supplier-label-block">
                        Firma
                      </label>
                      <input
                        type="text"
                        className="mes-filter-input is-compact w-full"
                        value={headerData.customerCompany}
                        onChange={(e) => setHeaderData(prev => ({ ...prev, customerCompany: e.target.value }))}
                        placeholder="Firma adı..."
                      />
                    </div>

                    {/* Row 3: Teslimat Adresi | Notlar */}
                    {/* Delivery Address */}
                    <div className="pos-relative-z1">
                      <label className="supplier-label-block">
                        Teslimat Adresi
                      </label>
                      <input
                        type="text"
                        className="mes-filter-input is-compact w-full"
                        value={headerData.deliveryAddress}
                        onChange={(e) => setHeaderData(prev => ({ ...prev, deliveryAddress: e.target.value }))}
                        placeholder="Teslimat adresi..."
                      />
                    </div>

                    {/* Notes */}
                    <div className="pos-relative-z1">
                      <label className="supplier-label-block">
                        Notlar
                      </label>
                      <input
                        type="text"
                        className="mes-filter-input is-compact w-full"
                        value={headerData.notes}
                        onChange={(e) => setHeaderData(prev => ({ ...prev, notes: e.target.value }))}
                        placeholder="Sevkiyat notu..."
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ===== STEP 2: Kalemler ===== */}
              {currentStep === 2 && (
                <div>
                  <div className="section-header-with-action">
                    <p className="text-xs-gray">
                      Sevk edilecek malzemeleri ekleyin
                    </p>
                    <button
                      type="button"
                      onClick={addItem}
                      className="btn-add-item"
                    >
                      <Plus size={14} />
                      Ekle
                    </button>
                  </div>

                  {items.length === 0 ? (
                    <div className="empty-items-box">
                      <Package size={28} className="mb-8 opacity-50" />
                      <p className="text-xs-gray">Henüz kalem eklenmedi</p>
                    </div>
                  ) : (
                    <div className="flex-col-gap-8">
                      {items.map((item, index) => (
                        <div 
                          key={item.id} 
                          className="shipment-item-card"
                        >
                          {/* Material Select */}
                          <div className="pos-relative mb-8">
                            <button
                              type="button"
                              className="mes-filter-select full-justify-between"
                              onClick={(e) => { 
                                e.stopPropagation()
                                setItems(prev => prev.map((it, idx) => ({
                                  ...it,
                                  dropdownOpen: idx === index ? !it.dropdownOpen : false
                                })))
                              }}
                            >
                              <span className={`text-truncate text-13 ${item.materialCode ? 'text-conditional' : 'text-conditional placeholder'}`}>
                                {item.materialCode ? `${item.materialCode} - ${item.materialName}` : 'Malzeme seç...'}
                              </span>
                              <ChevronDown size={14} />
                            </button>
                            {item.dropdownOpen && (
                              <div className="material-dropdown-fixed">
                                {/* Search */}
                                <div className="dropdown-search-header">
                                  <div className="pos-relative">
                                    <Search size={14} className="search-icon-absolute" />
                                    <input
                                      type="text"
                                      className="mes-filter-input is-compact pl-32 w-full-12"
                                      value={item.searchTerm}
                                      onChange={(e) => updateItem(item.id, 'searchTerm', e.target.value)}
                                      placeholder="Malzeme ara..."
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
                                      className={`dropdown-option-item ${item.materialCode === m.code ? 'selected' : ''}`}
                                      onClick={(e) => { e.stopPropagation(); updateItem(item.id, 'materialCode', m.code); }}
                                    >
                                      <div className="dropdown-option-code">{m.code}</div>
                                      <div className="dropdown-option-meta">
                                        <span>{m.name}</span>
                                        <span className="dropdown-option-stock">Stok: {formatQty(m.availableStock)} {m.unit}</span>
                                      </div>
                                    </div>
                                  ))
                                }
                                {materials.filter(m => 
                                  !item.searchTerm || 
                                  m.code.toLowerCase().includes(item.searchTerm.toLowerCase()) ||
                                  m.name.toLowerCase().includes(item.searchTerm.toLowerCase())
                                ).length === 0 && (
                                  <div className="dropdown-empty-state">
                                    Malzeme bulunamadı
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Quantity & Actions Row */}
                          <div className="flex-center-gap-8">
                            <div className="qty-row-flex">
                              <input
                                type="text"
                                inputMode="decimal"
                                className="mes-filter-input is-compact qty-input"
                                value={item.quantity}
                                onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                                placeholder="Miktar"
                                pattern="[0-9]*\.?[0-9]*"
                              />
                              <span className="text-muted-xs">
                                {item.unit}
                              </span>
                            </div>
                            {item.materialCode && (
                              <span className="stock-badge">
                                Mevcut: {formatQty(item.availableStock)}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => removeItem(item.id)}
                              className="btn-remove-item"
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
                  <p className="text-xs-light-mb">
                    Sevkiyat bilgilerini kontrol edin ve onaylayın
                  </p>

                  {/* Header Info */}
                  {(headerData.workOrderCode || headerData.quoteId || headerData.customerName || headerData.customerCompany || headerData.deliveryAddress) && (
                    <div className="summary-info-box">
                      <h3 className="section-header">
                        Sevkiyat Bilgileri
                      </h3>
                      <div className="grid-2-gap-6">
                        {headerData.workOrderCode && (
                          <div><span className="text-muted">İş Emri:</span> {headerData.workOrderCode}</div>
                        )}
                        {headerData.quoteId && (
                          <div><span className="text-muted">Teklif:</span> #{headerData.quoteId}</div>
                        )}
                        {headerData.customerName && (
                          <div><span className="text-muted">Müşteri:</span> {headerData.customerName}</div>
                        )}
                        {headerData.customerCompany && (
                          <div><span className="text-muted">Firma:</span> {headerData.customerCompany}</div>
                        )}
                      </div>
                      {headerData.deliveryAddress && (
                        <div className="mt-6">
                          <span className="text-muted">Adres:</span> {headerData.deliveryAddress}
                        </div>
                      )}
                      {headerData.notes && (
                        <div className="mt-6 text-italic-muted">
                          Not: {headerData.notes}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Items Summary */}
                  <div className="bordered-container-rounded">
                    <div className="summary-header">
                      Kalemler ({totalItems})
                    </div>
                    {items.map((item, index) => (
                      <div 
                        key={item.id}
                        className="summary-item-row"
                      >
                        <div>
                          <div className="font-medium">{item.materialCode}</div>
                          <div className="text-muted-sm">{item.materialName}</div>
                        </div>
                        <div className="summary-item-qty">
                          {formatQty(item.quantity)} {item.unit}
                        </div>
                      </div>
                    ))}
                    <div className="summary-total-row">
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
        <div className="modal-footer-flex">
          {/* Left side - Back button or empty */}
          <div>
            {currentStep > 1 && (
              <button
                type="button"
                onClick={handleBack}
                className="btn-back"
              >
                <ArrowLeft size={14} />
                Geri
              </button>
            )}
          </div>
          
          {/* Right side - Next/Submit button */}
          <div className="flex-gap-10">
            <button
              type="button"
              onClick={onClose}
              className="btn-cancel"
            >
              İptal
            </button>
            
            {currentStep < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={currentStep === 2 && items.length === 0}
                className={`btn-next ${(currentStep === 2 && items.length === 0) ? 'disabled' : 'enabled'}`}
              >
                İleri
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className={`btn-submit ${loading ? 'disabled' : 'enabled'}`}
              >
                {loading ? (
                  <>
                    <Loader2 size={14} className="spin-animation" />
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
