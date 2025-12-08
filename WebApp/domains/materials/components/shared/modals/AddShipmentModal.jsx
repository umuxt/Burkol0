import React, { useState, useEffect, useRef } from 'react'
import { shipmentsService } from '../../../services/shipments-service.js'
import { customersService } from '../../../../crm/services/customers-service.js'
import { Truck, X, Package, Plus, Trash2, ChevronDown, Search, Loader2, AlertCircle, ArrowLeft, ArrowRight, Check, UserPlus } from 'lucide-react'

/**
 * CreateShipmentModal - 3 Aşamalı Wizard (Invoice Export Entegrasyonu)
 * Adım 1: Sevkiyat Bilgileri (Müşteri, Belge Tipi, İş Emri, Teklif)
 * Adım 2: Malzeme Ekleme (Kalemler + Fiyat)
 * Adım 3: Özet ve Onay
 */
export default function AddShipmentModal({ 
  isOpen, 
  onClose, 
  onSuccess
}) {
  // Wizard state
  const [currentStep, setCurrentStep] = useState(1)
  
  // Shipment header data (updated for invoice export)
  const [headerData, setHeaderData] = useState({
    workOrderCode: '',
    quoteId: '',
    // Customer fields
    customerId: null,
    customerSnapshot: null,
    useAlternateDelivery: false,
    alternateDeliveryAddress: null,
    // Document type
    documentType: 'waybill',  // waybill | invoice | both
    includePrice: false,
    // Currency
    currency: 'TRY',
    exchangeRate: 1.0,
    // Export
    exportTarget: 'logo_tiger',
    // Extra
    specialCode: '',
    costCenter: '',
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
  const [customers, setCustomers] = useState([])
  const [dataLoading, setDataLoading] = useState(false)
  
  // Dropdown states
  const [workOrderDropdownOpen, setWorkOrderDropdownOpen] = useState(false)
  const [quoteDropdownOpen, setQuoteDropdownOpen] = useState(false)
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false)
  const [customerSearchTerm, setCustomerSearchTerm] = useState('')
  
  // Inline new customer mode
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false)
  const [newCustomerData, setNewCustomerData] = useState({
    name: '',
    company: '',
    taxOffice: '',
    taxNumber: '',
    address: '',
    city: '',
    district: '',
    phone: '',
    email: ''
  })
  
  const modalRef = useRef(null)

  // Load data when modal opens
  useEffect(() => {
    if (isOpen) {
      setDataLoading(true)
      Promise.all([
        shipmentsService.getAvailableMaterials().catch(() => []),
        shipmentsService.getApprovedQuotes().catch(() => []),
        shipmentsService.getCompletedWorkOrders().catch(() => []),
        customersService.getCustomers().catch(() => [])
      ]).then(([materialsData, quotesData, workOrdersData, customersData]) => {
        setMaterials(materialsData)
        setQuotes(quotesData)
        setWorkOrders(workOrdersData)
        setCustomers(Array.isArray(customersData) ? customersData : (customersData?.customers || []))
      }).finally(() => {
        setDataLoading(false)
      })
      
      // Reset form
      setCurrentStep(1)
      setHeaderData({
        workOrderCode: '',
        quoteId: '',
        customerId: null,
        customerSnapshot: null,
        useAlternateDelivery: false,
        alternateDeliveryAddress: null,
        documentType: 'waybill',
        includePrice: false,
        currency: 'TRY',
        exchangeRate: 1.0,
        exportTarget: 'logo_tiger',
        specialCode: '',
        costCenter: '',
        notes: ''
      })
      setItems([])
      setError(null)
      setShowNewCustomerForm(false)
      setNewCustomerData({
        name: '',
        company: '',
        taxOffice: '',
        taxNumber: '',
        address: '',
        city: '',
        district: '',
        phone: '',
        email: ''
      })
      setCustomerSearchTerm('')
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
    setCustomerDropdownOpen(false)
  }

  // Select customer from CRM
  const selectCustomer = (customer) => {
    const snapshot = {
      id: customer.id,
      name: customer.name || '',
      company: customer.company || customer.companyName || '',
      taxOffice: customer.taxOffice || '',
      taxNumber: customer.taxNumber || customer.vkn || '',
      address: customer.address || '',
      city: customer.city || '',
      district: customer.district || '',
      phone: customer.phone || '',
      email: customer.email || '',
      erpAccountCode: customer.erpAccountCode || ''
    }
    setHeaderData(prev => ({
      ...prev,
      customerId: customer.id,
      customerSnapshot: snapshot
    }))
    setCustomerDropdownOpen(false)
    setCustomerSearchTerm('')
  }

  // Create new inline customer
  const handleCreateInlineCustomer = async () => {
    if (!newCustomerData.name && !newCustomerData.company) {
      setError('Müşteri adı veya firma adı gerekli')
      return
    }
    
    try {
      // Create in CRM
      const created = await customersService.createCustomer({
        name: newCustomerData.name,
        companyName: newCustomerData.company,
        taxOffice: newCustomerData.taxOffice,
        taxNumber: newCustomerData.taxNumber,
        address: newCustomerData.address,
        city: newCustomerData.city,
        district: newCustomerData.district,
        phone: newCustomerData.phone,
        email: newCustomerData.email
      })
      
      // Select the new customer
      selectCustomer(created)
      setShowNewCustomerForm(false)
      setNewCustomerData({
        name: '',
        company: '',
        taxOffice: '',
        taxNumber: '',
        address: '',
        city: '',
        district: '',
        phone: '',
        email: ''
      })
      
      // Add to local list
      setCustomers(prev => [...prev, created])
    } catch (err) {
      setError('Müşteri oluşturulamadı: ' + err.message)
    }
  }

  // Filter customers by search term
  const filteredCustomers = customers.filter(c => {
    if (!customerSearchTerm) return true
    const term = customerSearchTerm.toLowerCase()
    return (
      (c.name || '').toLowerCase().includes(term) ||
      (c.company || c.companyName || '').toLowerCase().includes(term) ||
      (c.taxNumber || c.vkn || '').includes(term)
    )
  })

  // Add new item row
  const addItem = () => {
    setItems(prev => [...prev, {
      id: Date.now(),
      materialCode: '',
      materialName: '',
      quantity: '',
      unit: 'adet',
      unitPrice: '',
      taxRate: 20,
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
  const canProceedToStep2 = () => {
    // Müşteri zorunlu (invoice export için)
    if (!headerData.customerSnapshot) {
      setError('Müşteri seçimi zorunludur')
      return false
    }
    setError(null)
    return true
  }
  
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
      // Fatura seçildiyse fiyat zorunlu
      if (headerData.includePrice && (!item.unitPrice || parseFloat(item.unitPrice) <= 0)) {
        setError(`Kalem ${i + 1}: Fatura için birim fiyat zorunlu`)
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
        // Customer
        customerId: headerData.customerId,
        customerSnapshot: headerData.customerSnapshot,
        useAlternateDelivery: headerData.useAlternateDelivery,
        alternateDeliveryAddress: headerData.alternateDeliveryAddress,
        // Document type
        documentType: headerData.documentType,
        includePrice: headerData.includePrice,
        // Currency
        currency: headerData.currency,
        exchangeRate: headerData.exchangeRate,
        // Export
        exportTarget: headerData.exportTarget,
        // Extra
        specialCode: headerData.specialCode,
        costCenter: headerData.costCenter,
        notes: headerData.notes,
        // Legacy fields
        workOrderCode: headerData.workOrderCode,
        quoteId: headerData.quoteId,
        // Items
        items: items.map(item => ({
          materialCode: item.materialCode,
          materialId: item.materialId,
          materialName: item.materialName,
          quantity: parseFloat(item.quantity),
          unit: item.unit,
          unitPrice: item.unitPrice ? parseFloat(item.unitPrice) : null,
          taxRate: item.taxRate || 20,
          discountPercent: item.discountPercent || 0,
          lotNumber: item.lotNumber || '',
          serialNumber: item.serialNumber || '',
          itemNotes: item.notes || ''
        }))
      }
      
      // Remove empty/null fields
      Object.keys(shipmentData).forEach(key => {
        if (shipmentData[key] === '' || shipmentData[key] === null || shipmentData[key] === undefined) {
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
              <span className="text-base">Veriler yükleniyor...</span>
            </div>
          )}

          {!dataLoading && (
            <>
              {/* ===== STEP 1: Sevkiyat Bilgileri ===== */}
              {currentStep === 1 && (
                <div>
                  {/* MÜŞTERİ BİLGİLERİ */}
                  <div className="mb-16">
                    <div className="flex items-center justify-between mb-8">
                      <label className="font-medium text-sm">Müşteri *</label>
                      <button
                        type="button"
                        onClick={() => setShowNewCustomerForm(!showNewCustomerForm)}
                        className="flex items-center gap-4 text-xs text-blue-600 hover:text-blue-800"
                      >
                        <UserPlus size={14} />
                        {showNewCustomerForm ? 'Listeden Seç' : 'Yeni Müşteri'}
                      </button>
                    </div>
                    
                    {!showNewCustomerForm ? (
                      <>
                        {/* Customer Dropdown */}
                        <div className="pos-z30 mb-8">
                          <button
                            type="button"
                            className="mes-filter-select full-justify-between"
                            onClick={(e) => { e.stopPropagation(); setCustomerDropdownOpen(!customerDropdownOpen); setWorkOrderDropdownOpen(false); setQuoteDropdownOpen(false); }}
                          >
                            <span className={`text-conditional ${!headerData.customerSnapshot ? 'placeholder' : ''}`}>
                              {headerData.customerSnapshot 
                                ? `${headerData.customerSnapshot.company || headerData.customerSnapshot.name}` 
                                : 'Müşteri seçin...'}
                            </span>
                            <ChevronDown size={14} />
                          </button>
                          {customerDropdownOpen && (
                            <div className="dropdown-menu" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                              {/* Search */}
                              <div className="p-8 border-b border-gray-200">
                                <div className="relative">
                                  <Search size={14} className="absolute left-8 top-1/2 -translate-y-1/2 text-gray-400" />
                                  <input
                                    type="text"
                                    className="mes-filter-input is-compact w-full pl-28"
                                    value={customerSearchTerm}
                                    onChange={(e) => setCustomerSearchTerm(e.target.value)}
                                    placeholder="Müşteri ara..."
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>
                              </div>
                              {/* Clear */}
                              <div 
                                className="dropdown-item-muted"
                                onClick={() => { setHeaderData(prev => ({ ...prev, customerId: null, customerSnapshot: null })); setCustomerDropdownOpen(false); }}
                              >
                                Seçimi temizle
                              </div>
                              {/* Options */}
                              {filteredCustomers.slice(0, 50).map(c => (
                                <div
                                  key={c.id}
                                  className="dropdown-item-action"
                                  onClick={() => selectCustomer(c)}
                                >
                                  <div className="font-medium">{c.company || c.companyName || c.name}</div>
                                  <div className="text-xs text-gray-500">
                                    {c.taxNumber || c.vkn ? `VKN: ${c.taxNumber || c.vkn}` : c.email || ''}
                                  </div>
                                </div>
                              ))}
                              {filteredCustomers.length === 0 && (
                                <div className="p-12 text-center text-gray-500 text-xs">Müşteri bulunamadı</div>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {/* Selected Customer Info */}
                        {headerData.customerSnapshot && (
                          <div className="bg-gray-50 p-12 rounded-lg text-xs">
                            <div className="grid grid-cols-2 gap-6">
                              <div><span className="text-gray-500">Firma:</span> {headerData.customerSnapshot.company || '-'}</div>
                              <div><span className="text-gray-500">VKN:</span> {headerData.customerSnapshot.taxNumber || '-'}</div>
                              <div><span className="text-gray-500">VD:</span> {headerData.customerSnapshot.taxOffice || '-'}</div>
                              <div><span className="text-gray-500">Tel:</span> {headerData.customerSnapshot.phone || '-'}</div>
                            </div>
                            {/* Adres bilgisi - il/ilçe dahil */}
                            {(headerData.customerSnapshot.address || headerData.customerSnapshot.city) && (
                              <div className="mt-6">
                                <span className="text-gray-500">Adres:</span>{' '}
                                {[
                                  headerData.customerSnapshot.address,
                                  headerData.customerSnapshot.district,
                                  headerData.customerSnapshot.city
                                ].filter(Boolean).join(', ') || '-'}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      /* Inline New Customer Form */
                      <div className="bg-blue-50 p-12 rounded-lg">
                        <div className="grid grid-cols-2 gap-8 mb-8">
                          <div>
                            <label className="text-xs text-gray-600 mb-4 block">Müşteri Adı</label>
                            <input
                              type="text"
                              className="mes-filter-input is-compact w-full"
                              value={newCustomerData.name}
                              onChange={(e) => setNewCustomerData(prev => ({ ...prev, name: e.target.value }))}
                              placeholder="Ad Soyad"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600 mb-4 block">Firma Adı *</label>
                            <input
                              type="text"
                              className="mes-filter-input is-compact w-full"
                              value={newCustomerData.company}
                              onChange={(e) => setNewCustomerData(prev => ({ ...prev, company: e.target.value }))}
                              placeholder="Firma Ünvanı"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600 mb-4 block">Vergi Dairesi</label>
                            <input
                              type="text"
                              className="mes-filter-input is-compact w-full"
                              value={newCustomerData.taxOffice}
                              onChange={(e) => setNewCustomerData(prev => ({ ...prev, taxOffice: e.target.value }))}
                              placeholder="Vergi Dairesi"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600 mb-4 block">VKN/TCKN</label>
                            <input
                              type="text"
                              className="mes-filter-input is-compact w-full"
                              value={newCustomerData.taxNumber}
                              onChange={(e) => setNewCustomerData(prev => ({ ...prev, taxNumber: e.target.value }))}
                              placeholder="1234567890"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="text-xs text-gray-600 mb-4 block">Adres</label>
                            <input
                              type="text"
                              className="mes-filter-input is-compact w-full"
                              value={newCustomerData.address}
                              onChange={(e) => setNewCustomerData(prev => ({ ...prev, address: e.target.value }))}
                              placeholder="Adres"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600 mb-4 block">Telefon</label>
                            <input
                              type="text"
                              className="mes-filter-input is-compact w-full"
                              value={newCustomerData.phone}
                              onChange={(e) => setNewCustomerData(prev => ({ ...prev, phone: e.target.value }))}
                              placeholder="+90 5XX XXX XXXX"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600 mb-4 block">E-posta</label>
                            <input
                              type="text"
                              className="mes-filter-input is-compact w-full"
                              value={newCustomerData.email}
                              onChange={(e) => setNewCustomerData(prev => ({ ...prev, email: e.target.value }))}
                              placeholder="email@firma.com"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleCreateInlineCustomer}
                          className="w-full py-8 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700"
                        >
                          Müşteriyi Oluştur ve Seç
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {/* BELGE TİPİ */}
                  <div className="mb-16">
                    <label className="font-medium text-sm mb-8 block">Belge Tipi</label>
                    <div className="flex gap-12">
                      <label className="flex items-center gap-6 cursor-pointer">
                        <input
                          type="radio"
                          name="documentType"
                          value="waybill"
                          checked={headerData.documentType === 'waybill'}
                          onChange={() => setHeaderData(prev => ({ ...prev, documentType: 'waybill', includePrice: false }))}
                          className="form-radio"
                        />
                        <span className="text-sm">İrsaliye (Fiyatsız)</span>
                      </label>
                      <label className="flex items-center gap-6 cursor-pointer">
                        <input
                          type="radio"
                          name="documentType"
                          value="invoice"
                          checked={headerData.documentType === 'invoice'}
                          onChange={() => setHeaderData(prev => ({ ...prev, documentType: 'invoice', includePrice: true }))}
                          className="form-radio"
                        />
                        <span className="text-sm">Fatura (Fiyatlı)</span>
                      </label>
                      <label className="flex items-center gap-6 cursor-pointer">
                        <input
                          type="radio"
                          name="documentType"
                          value="both"
                          checked={headerData.documentType === 'both'}
                          onChange={() => setHeaderData(prev => ({ ...prev, documentType: 'both', includePrice: true }))}
                          className="form-radio"
                        />
                        <span className="text-sm">İkisi Birden</span>
                      </label>
                    </div>
                  </div>
                  
                  {/* İŞ EMRİ & TEKLİF */}
                  <div className="grid-2-gap-12 mb-16">
                    {/* Work Order */}
                    <div className="pos-z20">
                      <label className="supplier-label-block">İş Emri (Opsiyonel)</label>
                      <button
                        type="button"
                        className="mes-filter-select full-justify-between"
                        onClick={(e) => { e.stopPropagation(); setWorkOrderDropdownOpen(!workOrderDropdownOpen); setQuoteDropdownOpen(false); setCustomerDropdownOpen(false); }}
                      >
                        <span className={`text-conditional ${!headerData.workOrderCode ? 'placeholder' : ''}`}>
                          {headerData.workOrderCode || 'Seçin...'}
                        </span>
                        <ChevronDown size={14} />
                      </button>
                      {workOrderDropdownOpen && (
                        <div className="dropdown-menu">
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
                    <div className="pos-z20">
                      <label className="supplier-label-block">Teklif (Opsiyonel)</label>
                      <button
                        type="button"
                        className="mes-filter-select full-justify-between"
                        onClick={(e) => { e.stopPropagation(); setQuoteDropdownOpen(!quoteDropdownOpen); setWorkOrderDropdownOpen(false); setCustomerDropdownOpen(false); }}
                      >
                        <span className={`text-conditional ${!headerData.quoteId ? 'placeholder' : ''}`}>
                          {headerData.quoteId || 'Seçin...'}
                        </span>
                        <ChevronDown size={14} />
                      </button>
                      {quoteDropdownOpen && (
                        <div className="dropdown-menu">
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
                  </div>
                  
                  {/* NOTLAR */}
                  <div>
                    <label className="supplier-label-block">Sevkiyat Notu (Opsiyonel)</label>
                    <input
                      type="text"
                      className="mes-filter-input is-compact w-full"
                      value={headerData.notes}
                      onChange={(e) => setHeaderData(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Sevkiyat ile ilgili notlar..."
                    />
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
                              <span className={`text-truncate text-base ${item.materialCode ? 'text-conditional' : 'text-conditional placeholder'}`}>
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

                          {/* Quantity & Price Row */}
                          <div className="flex-center-gap-8 flex-wrap">
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
                            
                            {/* Birim Fiyat - Fatura seçiliyse göster */}
                            {headerData.includePrice && (
                              <div className="qty-row-flex">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  className="mes-filter-input is-compact"
                                  style={{ width: '80px' }}
                                  value={item.unitPrice || ''}
                                  onChange={(e) => updateItem(item.id, 'unitPrice', e.target.value)}
                                  placeholder="Fiyat"
                                  pattern="[0-9]*\.?[0-9]*"
                                />
                                <span className="text-muted-xs">TL</span>
                              </div>
                            )}
                            
                            {item.materialCode && (
                              <span className="mes-badge success">
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
                  <div className="summary-info-box">
                    <h3 className="section-header">
                      Sevkiyat Bilgileri
                    </h3>
                    <div className="grid-2-gap-6">
                      {/* Belge Tipi */}
                      <div>
                        <span className="text-muted">Belge Tipi:</span>{' '}
                        {headerData.documentType === 'waybill' ? 'İrsaliye' : 
                         headerData.documentType === 'invoice' ? 'Fatura' : 'İrsaliye + Fatura'}
                      </div>
                      {headerData.workOrderCode && (
                        <div><span className="text-muted">İş Emri:</span> {headerData.workOrderCode}</div>
                      )}
                      {headerData.quoteId && (
                        <div><span className="text-muted">Teklif:</span> #{headerData.quoteId}</div>
                      )}
                    </div>
                    
                    {/* Customer Snapshot Info */}
                    {headerData.customerSnapshot && (
                      <div className="mt-12 pt-12 border-t border-gray-200">
                        <div className="font-medium text-sm mb-8">Müşteri Bilgileri</div>
                        <div className="grid-2-gap-6">
                          <div><span className="text-muted">Firma:</span> {headerData.customerSnapshot.company || '-'}</div>
                          <div><span className="text-muted">Yetkili:</span> {headerData.customerSnapshot.name || '-'}</div>
                          <div><span className="text-muted">VKN:</span> {headerData.customerSnapshot.taxNumber || '-'}</div>
                          <div><span className="text-muted">Vergi Dairesi:</span> {headerData.customerSnapshot.taxOffice || '-'}</div>
                          <div><span className="text-muted">Telefon:</span> {headerData.customerSnapshot.phone || '-'}</div>
                          <div><span className="text-muted">E-posta:</span> {headerData.customerSnapshot.email || '-'}</div>
                        </div>
                        {headerData.customerSnapshot.address && (
                          <div className="mt-6">
                            <span className="text-muted">Adres:</span> {headerData.customerSnapshot.address}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {headerData.notes && (
                      <div className="mt-6 text-muted-italic">
                        Not: {headerData.notes}
                      </div>
                    )}
                  </div>

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
