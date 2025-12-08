import React, { useState, useEffect, useRef } from 'react'
import { shipmentsService } from '../../../services/shipments-service.js'
import { customersService } from '../../../../crm/services/customers-service.js'
import { Truck, X, Package, Plus, Trash2, ChevronDown, ChevronRight, Search, Loader2, AlertCircle, ArrowLeft, ArrowRight, Check, UserPlus, DollarSign, Percent, FileText, Settings } from 'lucide-react'

/**
 * CreateShipmentModal - 3 Aşamalı Wizard (Invoice Export Entegrasyonu)
 * Adım 1: Sevkiyat Bilgileri (Müşteri, Belge Tipi, İş Emri, Teklif, Akordeonlar)
 * Adım 2: Malzeme Ekleme (Kalemler + Fiyat + Lot/Seri)
 * Adım 3: Özet ve Onay
 */
export default function AddShipmentModal({ 
  isOpen, 
  onClose, 
  onSuccess
}) {
  // Wizard state
  const [currentStep, setCurrentStep] = useState(1)
  
  // Accordion states
  const [openAccordions, setOpenAccordions] = useState({
    currency: false,
    discount: false,
    tax: false,
    extra: false,
    export: false
  })
  
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
    // Discount
    enableRowDiscount: false,
    enableGeneralDiscount: false,
    discountType: 'percent',  // percent | amount
    discountValue: 0,
    // Tax
    defaultTaxRate: 20,
    defaultWithholdingId: null,
    defaultVatExemptionId: null,
    // Export
    exportTarget: 'logo_tiger',
    exportFormats: ['csv'],  // csv, xml, pdf, json
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
  const [vatExemptions, setVatExemptions] = useState([])
  const [withholdingRates, setWithholdingRates] = useState([])
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
        customersService.getCustomers().catch(() => []),
        fetch('/api/materials/vat-exemptions').then(r => r.json()).catch(() => []),
        fetch('/api/materials/withholding-rates').then(r => r.json()).catch(() => [])
      ]).then(([materialsData, quotesData, workOrdersData, customersData, vatData, withholdingData]) => {
        setMaterials(materialsData)
        setQuotes(quotesData)
        setWorkOrders(workOrdersData)
        setCustomers(Array.isArray(customersData) ? customersData : (customersData?.customers || []))
        setVatExemptions(Array.isArray(vatData) ? vatData : [])
        setWithholdingRates(Array.isArray(withholdingData) ? withholdingData : [])
      }).finally(() => {
        setDataLoading(false)
      })
      
      // Reset form
      setCurrentStep(1)
      setOpenAccordions({
        currency: false,
        discount: false,
        tax: false,
        extra: false,
        export: false
      })
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
        enableRowDiscount: false,
        enableGeneralDiscount: false,
        discountType: 'percent',
        discountValue: 0,
        defaultTaxRate: 20,
        defaultWithholdingId: null,
        defaultVatExemptionId: null,
        exportTarget: 'logo_tiger',
        exportFormats: ['csv'],
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
      taxRate: headerData.defaultTaxRate || 20,
      discountPercent: 0,
      vatExemptionId: headerData.defaultVatExemptionId,
      withholdingRateId: headerData.defaultWithholdingId,
      lotNumber: '',
      serialNumber: '',
      availableStock: 0,
      notes: '',
      dropdownOpen: false,
      searchTerm: '',
      showDetails: false
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
        // Discount
        discountType: headerData.enableGeneralDiscount ? headerData.discountType : null,
        discountValue: headerData.enableGeneralDiscount ? headerData.discountValue : 0,
        // Export
        exportTarget: headerData.exportTarget,
        exportFormats: headerData.exportFormats,
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
          discountPercent: headerData.enableRowDiscount ? (parseFloat(item.discountPercent) || 0) : 0,
          vatExemptionId: item.vatExemptionId || null,
          withholdingRateId: item.withholdingRateId || null,
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
                    <div className="modal-section-header">
                      <label className="shipment-form-label shipment-form-label-required">Müşteri</label>
                      <button
                        type="button"
                        onClick={() => setShowNewCustomerForm(!showNewCustomerForm)}
                        className="btn-link-sm"
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
                            <div className="dropdown-menu dropdown-menu-scrollable">
                              {/* Search */}
                              <div className="dropdown-search-header">
                                <div className="pos-relative">
                                  <Search size={14} className="search-icon-absolute" />
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
                                  <div className="text-xs-muted">
                                    {c.taxNumber || c.vkn ? `VKN: ${c.taxNumber || c.vkn}` : c.email || ''}
                                  </div>
                                </div>
                              ))}
                              {filteredCustomers.length === 0 && (
                                <div className="dropdown-empty-state">Müşteri bulunamadı</div>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {/* Selected Customer Info */}
                        {headerData.customerSnapshot && (
                          <div className="customer-info-box">
                            <div className="customer-info-grid">
                              <div><span className="customer-info-label">Firma:</span> <span className="customer-info-value">{headerData.customerSnapshot.company || '-'}</span></div>
                              <div><span className="customer-info-label">VKN:</span> <span className="customer-info-value">{headerData.customerSnapshot.taxNumber || '-'}</span></div>
                              <div><span className="customer-info-label">VD:</span> <span className="customer-info-value">{headerData.customerSnapshot.taxOffice || '-'}</span></div>
                              <div><span className="customer-info-label">Tel:</span> <span className="customer-info-value">{headerData.customerSnapshot.phone || '-'}</span></div>
                            </div>
                            {/* Adres bilgisi - il/ilçe dahil */}
                            {(headerData.customerSnapshot.address || headerData.customerSnapshot.city) && (
                              <div className="customer-info-address">
                                <span className="customer-info-label">Adres:</span>{' '}
                                <span className="customer-info-value">
                                  {[
                                    headerData.customerSnapshot.address,
                                    headerData.customerSnapshot.district,
                                    headerData.customerSnapshot.city
                                  ].filter(Boolean).join(', ') || '-'}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      /* Inline New Customer Form */
                      <div className="new-customer-form">
                        <div className="form-grid-2">
                          <div>
                            <label className="shipment-form-label">Müşteri Adı</label>
                            <input
                              type="text"
                              className="mes-filter-input is-compact w-full"
                              value={newCustomerData.name}
                              onChange={(e) => setNewCustomerData(prev => ({ ...prev, name: e.target.value }))}
                              placeholder="Ad Soyad"
                            />
                          </div>
                          <div>
                            <label className="shipment-form-label shipment-form-label-required">Firma Adı</label>
                            <input
                              type="text"
                              className="mes-filter-input is-compact w-full"
                              value={newCustomerData.company}
                              onChange={(e) => setNewCustomerData(prev => ({ ...prev, company: e.target.value }))}
                              placeholder="Firma Ünvanı"
                            />
                          </div>
                          <div>
                            <label className="shipment-form-label">Vergi Dairesi</label>
                            <input
                              type="text"
                              className="mes-filter-input is-compact w-full"
                              value={newCustomerData.taxOffice}
                              onChange={(e) => setNewCustomerData(prev => ({ ...prev, taxOffice: e.target.value }))}
                              placeholder="Vergi Dairesi"
                            />
                          </div>
                          <div>
                            <label className="shipment-form-label">VKN/TCKN</label>
                            <input
                              type="text"
                              className="mes-filter-input is-compact w-full"
                              value={newCustomerData.taxNumber}
                              onChange={(e) => setNewCustomerData(prev => ({ ...prev, taxNumber: e.target.value }))}
                              placeholder="1234567890"
                            />
                          </div>
                          <div className="form-col-span-2">
                            <label className="shipment-form-label">Adres</label>
                            <input
                              type="text"
                              className="mes-filter-input is-compact w-full"
                              value={newCustomerData.address}
                              onChange={(e) => setNewCustomerData(prev => ({ ...prev, address: e.target.value }))}
                              placeholder="Adres"
                            />
                          </div>
                          <div>
                            <label className="shipment-form-label">Telefon</label>
                            <input
                              type="text"
                              className="mes-filter-input is-compact w-full"
                              value={newCustomerData.phone}
                              onChange={(e) => setNewCustomerData(prev => ({ ...prev, phone: e.target.value }))}
                              placeholder="+90 5XX XXX XXXX"
                            />
                          </div>
                          <div>
                            <label className="shipment-form-label">E-posta</label>
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
                          className="btn-primary-sm w-full"
                        >
                          Müşteriyi Oluştur ve Seç
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {/* BELGE TİPİ */}
                  <div className="mb-16">
                    <label className="shipment-form-label">Belge Tipi</label>
                    <div className="shipment-radio-group">
                      <label className="shipment-radio-label">
                        <input
                          type="radio"
                          name="documentType"
                          value="waybill"
                          checked={headerData.documentType === 'waybill'}
                          onChange={() => setHeaderData(prev => ({ ...prev, documentType: 'waybill', includePrice: false }))}
                          className="form-radio"
                        />
                        <span>İrsaliye (Fiyatsız)</span>
                      </label>
                      <label className="shipment-radio-label">
                        <input
                          type="radio"
                          name="documentType"
                          value="invoice"
                          checked={headerData.documentType === 'invoice'}
                          onChange={() => setHeaderData(prev => ({ ...prev, documentType: 'invoice', includePrice: true }))}
                          className="form-radio"
                        />
                        <span>Fatura (Fiyatlı)</span>
                      </label>
                      <label className="shipment-radio-label">
                        <input
                          type="radio"
                          name="documentType"
                          value="both"
                          checked={headerData.documentType === 'both'}
                          onChange={() => setHeaderData(prev => ({ ...prev, documentType: 'both', includePrice: true }))}
                          className="form-radio"
                        />
                        <span>İkisi Birden</span>
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
                  <div className="mb-16">
                    <label className="supplier-label-block">Sevkiyat Notu (Opsiyonel)</label>
                    <input
                      type="text"
                      className="mes-filter-input is-compact w-full"
                      value={headerData.notes}
                      onChange={(e) => setHeaderData(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Sevkiyat ile ilgili notlar..."
                    />
                  </div>
                  
                  {/* ===== AKORDEONLAR ===== */}
                  <div className="accordion-row">
                    
                    {/* PARA BİRİMİ & KUR AKORDEON */}
                    <div className="shipment-accordion">
                      <button
                        type="button"
                        className="shipment-accordion-header"
                        onClick={() => setOpenAccordions(prev => ({ ...prev, currency: !prev.currency }))}
                      >
                        <div className="shipment-accordion-header-left">
                          <DollarSign size={14} />
                          <span className="shipment-accordion-title">Para Birimi & Kur</span>
                        </div>
                        {openAccordions.currency ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      {openAccordions.currency && (
                        <div className="shipment-accordion-content">
                          <div className="accordion-grid-2">
                            <div>
                              <label className="shipment-form-label">Para Birimi</label>
                              <select
                                className="mes-filter-select w-full"
                                value={headerData.currency}
                                onChange={(e) => setHeaderData(prev => ({ ...prev, currency: e.target.value }))}
                              >
                                <option value="TRY">TRY - Türk Lirası</option>
                                <option value="USD">USD - Amerikan Doları</option>
                                <option value="EUR">EUR - Euro</option>
                                <option value="GBP">GBP - İngiliz Sterlini</option>
                              </select>
                            </div>
                            <div>
                              <label className="shipment-form-label">
                                Döviz Kuru {headerData.currency !== 'TRY' && <span className="text-error">*</span>}
                              </label>
                              <input
                                type="number"
                                step="0.0001"
                                className="mes-filter-input is-compact w-full"
                                value={headerData.exchangeRate}
                                onChange={(e) => setHeaderData(prev => ({ ...prev, exchangeRate: parseFloat(e.target.value) || 1 }))}
                                disabled={headerData.currency === 'TRY'}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* İSKONTO AYARLARI AKORDEON */}
                    <div className="shipment-accordion">
                      <button
                        type="button"
                        className="shipment-accordion-header"
                        onClick={() => setOpenAccordions(prev => ({ ...prev, discount: !prev.discount }))}
                      >
                        <div className="shipment-accordion-header-left">
                          <Percent size={14} />
                          <span className="shipment-accordion-title">İskonto Ayarları</span>
                        </div>
                        {openAccordions.discount ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      {openAccordions.discount && (
                        <div className="shipment-accordion-content">
                          <div className="accordion-row">
                            <label className="shipment-checkbox-label">
                              <input
                                type="checkbox"
                                checked={headerData.enableRowDiscount}
                                onChange={(e) => setHeaderData(prev => ({ ...prev, enableRowDiscount: e.target.checked }))}
                                className="form-checkbox"
                              />
                              <span>Satır İskontosu Uygula</span>
                              <span className="shipment-checkbox-hint">(Her kalemde % alanı açılır)</span>
                            </label>
                            
                            <label className="shipment-checkbox-label">
                              <input
                                type="checkbox"
                                checked={headerData.enableGeneralDiscount}
                                onChange={(e) => setHeaderData(prev => ({ ...prev, enableGeneralDiscount: e.target.checked }))}
                                className="form-checkbox"
                              />
                              <span>Genel İskonto Uygula</span>
                            </label>
                            
                            {headerData.enableGeneralDiscount && (
                              <div className="accordion-inline-row">
                                <div className="discount-inline-flex">
                                  <label className="shipment-radio-label">
                                    <input
                                      type="radio"
                                      name="discountType"
                                      checked={headerData.discountType === 'percent'}
                                      onChange={() => setHeaderData(prev => ({ ...prev, discountType: 'percent' }))}
                                      className="form-radio"
                                    />
                                    <span>Yüzde (%)</span>
                                  </label>
                                  <label className="shipment-radio-label">
                                    <input
                                      type="radio"
                                      name="discountType"
                                      checked={headerData.discountType === 'amount'}
                                      onChange={() => setHeaderData(prev => ({ ...prev, discountType: 'amount' }))}
                                      className="form-radio"
                                    />
                                    <span>Tutar (TL)</span>
                                  </label>
                                </div>
                                <input
                                  type="number"
                                  step="0.01"
                                  className="mes-filter-input is-compact discount-input"
                                  value={headerData.discountValue}
                                  onChange={(e) => setHeaderData(prev => ({ ...prev, discountValue: parseFloat(e.target.value) || 0 }))}
                                  placeholder="0"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* VERGİ DETAYLARI AKORDEON */}
                    <div className="shipment-accordion">
                      <button
                        type="button"
                        className="shipment-accordion-header"
                        onClick={() => setOpenAccordions(prev => ({ ...prev, tax: !prev.tax }))}
                      >
                        <div className="shipment-accordion-header-left">
                          <FileText size={14} />
                          <span className="shipment-accordion-title">Vergi Detayları</span>
                        </div>
                        {openAccordions.tax ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      {openAccordions.tax && (
                        <div className="shipment-accordion-content">
                          <div className="accordion-grid-3">
                            <div>
                              <label className="shipment-form-label">Varsayılan KDV</label>
                              <select
                                className="mes-filter-select w-full"
                                value={headerData.defaultTaxRate}
                                onChange={(e) => setHeaderData(prev => ({ ...prev, defaultTaxRate: parseInt(e.target.value) }))}
                              >
                                <option value={0}>%0</option>
                                <option value={1}>%1</option>
                                <option value={8}>%8</option>
                                <option value={10}>%10</option>
                                <option value={18}>%18</option>
                                <option value={20}>%20</option>
                              </select>
                            </div>
                            <div>
                              <label className="shipment-form-label">Tevkifat</label>
                              <select
                                className="mes-filter-select w-full"
                                value={headerData.defaultWithholdingId || ''}
                                onChange={(e) => setHeaderData(prev => ({ ...prev, defaultWithholdingId: e.target.value ? parseInt(e.target.value) : null }))}
                              >
                                <option value="">Yok</option>
                                {withholdingRates.map(w => (
                                  <option key={w.id} value={w.id}>{w.code} - {w.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="shipment-form-label">KDV Muafiyet</label>
                              <select
                                className="mes-filter-select w-full"
                                value={headerData.defaultVatExemptionId || ''}
                                onChange={(e) => setHeaderData(prev => ({ ...prev, defaultVatExemptionId: e.target.value ? parseInt(e.target.value) : null }))}
                              >
                                <option value="">Yok</option>
                                {vatExemptions.map(v => (
                                  <option key={v.id} value={v.id}>{v.code} - {v.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* EK BİLGİLER AKORDEON */}
                    <div className="shipment-accordion">
                      <button
                        type="button"
                        className="shipment-accordion-header"
                        onClick={() => setOpenAccordions(prev => ({ ...prev, extra: !prev.extra }))}
                      >
                        <div className="shipment-accordion-header-left">
                          <Settings size={14} />
                          <span className="shipment-accordion-title">Ek Bilgiler</span>
                        </div>
                        {openAccordions.extra ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      {openAccordions.extra && (
                        <div className="shipment-accordion-content">
                          <div className="accordion-grid-2">
                            <div>
                              <label className="shipment-form-label">Özel Kod</label>
                              <input
                                type="text"
                                className="mes-filter-input is-compact w-full"
                                value={headerData.specialCode}
                                onChange={(e) => setHeaderData(prev => ({ ...prev, specialCode: e.target.value }))}
                                placeholder="Özel kod..."
                              />
                            </div>
                            <div>
                              <label className="shipment-form-label">Maliyet Merkezi</label>
                              <input
                                type="text"
                                className="mes-filter-input is-compact w-full"
                                value={headerData.costCenter}
                                onChange={(e) => setHeaderData(prev => ({ ...prev, costCenter: e.target.value }))}
                                placeholder="Maliyet merkezi..."
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* EXPORT AYARLARI AKORDEON */}
                    <div className="shipment-accordion">
                      <button
                        type="button"
                        className="shipment-accordion-header"
                        onClick={() => setOpenAccordions(prev => ({ ...prev, export: !prev.export }))}
                      >
                        <div className="shipment-accordion-header-left">
                          <FileText size={14} />
                          <span className="shipment-accordion-title">Export Ayarları</span>
                        </div>
                        {openAccordions.export ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      {openAccordions.export && (
                        <div className="shipment-accordion-content">
                          <div className="accordion-section">
                            <label className="shipment-form-label">Hedef Program</label>
                            <select
                              className="mes-filter-select w-full"
                              value={headerData.exportTarget}
                              onChange={(e) => setHeaderData(prev => ({ ...prev, exportTarget: e.target.value }))}
                            >
                              <option value="logo_tiger">Logo Tiger</option>
                              <option value="logo_go">Logo GO</option>
                              <option value="zirve">Zirve</option>
                              <option value="excel">Excel</option>
                            </select>
                          </div>
                          <div className="accordion-section">
                            <label className="shipment-form-label">Export Formatları</label>
                            <div className="export-checkbox-group">
                              {['csv', 'xml', 'pdf', 'json'].map(format => (
                                <label key={format} className="shipment-checkbox-label">
                                  <input
                                    type="checkbox"
                                    checked={headerData.exportFormats.includes(format)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setHeaderData(prev => ({ ...prev, exportFormats: [...prev.exportFormats, format] }))
                                      } else {
                                        setHeaderData(prev => ({ ...prev, exportFormats: prev.exportFormats.filter(f => f !== format) }))
                                      }
                                    }}
                                    className="form-checkbox"
                                  />
                                  <span className="export-format-label">{format.toUpperCase()}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
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
                                  className="mes-filter-input is-compact price-input"
                                  value={item.unitPrice || ''}
                                  onChange={(e) => updateItem(item.id, 'unitPrice', e.target.value)}
                                  placeholder="Fiyat"
                                  pattern="[0-9]*\.?[0-9]*"
                                />
                                <span className="text-muted-xs">TL</span>
                              </div>
                            )}
                            
                            {/* İskonto % - Satır iskontosu açıksa göster */}
                            {headerData.enableRowDiscount && headerData.includePrice && (
                              <div className="qty-row-flex">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.1"
                                  className="mes-filter-input is-compact discount-percent-input"
                                  value={item.discountPercent || ''}
                                  onChange={(e) => updateItem(item.id, 'discountPercent', e.target.value)}
                                  placeholder="İsk%"
                                />
                                <span className="text-muted-xs">%</span>
                              </div>
                            )}
                            
                            {item.materialCode && (
                              <span className="mes-badge success">
                                Mevcut: {formatQty(item.availableStock)}
                              </span>
                            )}
                            
                            {/* Detay aç/kapa butonu */}
                            <button
                              type="button"
                              onClick={() => updateItem(item.id, 'showDetails', !item.showDetails)}
                              className="btn-link-sm"
                              title="Lot/Seri ve diğer detaylar"
                            >
                              {item.showDetails ? 'Gizle' : 'Detay'}
                            </button>
                            
                            <button
                              type="button"
                              onClick={() => removeItem(item.id)}
                              className="btn-remove-item"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                          
                          {/* Detay Alanları - Lot/Seri/KDV/Tevkifat */}
                          {item.showDetails && (
                            <div className="item-detail-panel">
                              <div className="item-detail-grid">
                                <div>
                                  <label className="item-detail-label">Lot No</label>
                                  <input
                                    type="text"
                                    className="mes-filter-input is-compact w-full"
                                    value={item.lotNumber || ''}
                                    onChange={(e) => updateItem(item.id, 'lotNumber', e.target.value)}
                                    placeholder="Lot..."
                                  />
                                </div>
                                <div>
                                  <label className="item-detail-label">Seri No</label>
                                  <input
                                    type="text"
                                    className="mes-filter-input is-compact w-full"
                                    value={item.serialNumber || ''}
                                    onChange={(e) => updateItem(item.id, 'serialNumber', e.target.value)}
                                    placeholder="Seri..."
                                  />
                                </div>
                                <div>
                                  <label className="item-detail-label">KDV %</label>
                                  <select
                                    className="mes-filter-select w-full"
                                    value={item.taxRate}
                                    onChange={(e) => updateItem(item.id, 'taxRate', parseInt(e.target.value))}
                                  >
                                    <option value={0}>%0</option>
                                    <option value={1}>%1</option>
                                    <option value={8}>%8</option>
                                    <option value={10}>%10</option>
                                    <option value={18}>%18</option>
                                    <option value={20}>%20</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="item-detail-label">Tevkifat</label>
                                  <select
                                    className="mes-filter-select w-full"
                                    value={item.withholdingRateId || ''}
                                    onChange={(e) => updateItem(item.id, 'withholdingRateId', e.target.value ? parseInt(e.target.value) : null)}
                                  >
                                    <option value="">Yok</option>
                                    {withholdingRates.map(w => (
                                      <option key={w.id} value={w.id}>{w.code}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              <div className="item-detail-note">
                                <label className="item-detail-label">Satır Notu</label>
                                <input
                                  type="text"
                                  className="mes-filter-input is-compact w-full"
                                  value={item.notes || ''}
                                  onChange={(e) => updateItem(item.id, 'notes', e.target.value)}
                                  placeholder="Bu kalem için not..."
                                />
                              </div>
                            </div>
                          )}
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
                      <div className="summary-customer-section">
                        <div className="summary-section-title">Müşteri Bilgileri</div>
                        <div className="grid-2-gap-6">
                          <div><span className="text-muted">Firma:</span> {headerData.customerSnapshot.company || '-'}</div>
                          <div><span className="text-muted">Yetkili:</span> {headerData.customerSnapshot.name || '-'}</div>
                          <div><span className="text-muted">VKN:</span> {headerData.customerSnapshot.taxNumber || '-'}</div>
                          <div><span className="text-muted">Vergi Dairesi:</span> {headerData.customerSnapshot.taxOffice || '-'}</div>
                          <div><span className="text-muted">Telefon:</span> {headerData.customerSnapshot.phone || '-'}</div>
                          <div><span className="text-muted">E-posta:</span> {headerData.customerSnapshot.email || '-'}</div>
                        </div>
                        {headerData.customerSnapshot.address && (
                          <div className="summary-address">
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
