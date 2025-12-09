import React, { useState, useEffect, useRef } from 'react'
import { shipmentsService } from '../../../services/shipments-service.js'
import { customersService } from '../../../../crm/services/customers-service.js'
import { Truck, X, Package, Plus, Trash2, ChevronDown, ChevronRight, ChevronLeft, Search, Loader2, AlertCircle, ArrowLeft, ArrowRight, Check, UserPlus, Settings, FileText, Upload } from 'lucide-react'
import TransportAccordion from '../accordions/TransportAccordion.jsx'

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
    relatedQuoteId: '', // For 7-day rule linking (P3.3)
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
    notes: '',
    // Transport fields (P3.3)
    transport: {
      driverName: '',
      driverTc: '',
      plateNumber: '',
      deliveryPerson: '',
      receiverPerson: '',
      deliveryNote: ''
    },
    // Waybill date (P3.3)
    waybillDate: new Date().toISOString().split('T')[0]
  })

  // Items list
  const [items, setItems] = useState([])

  // Form states
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Step 4 & 5 states (Export/Import)
  const [createdShipmentId, setCreatedShipmentId] = useState(null)
  const [exportStatus, setExportStatus] = useState({ loading: false, success: false, fileName: null, error: null })
  const [importStatus, setImportStatus] = useState({ loading: false, success: false, error: null })
  // Step 5 - External Doc Number
  const [externalDocNumber, setExternalDocNumber] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)

  // Data for dropdowns
  const [materials, setMaterials] = useState([])
  const [workOrders, setWorkOrders] = useState([])
  const [quotes, setQuotes] = useState([])
  const [customers, setCustomers] = useState([])
  const [vatExemptions, setVatExemptions] = useState([])
  const [withholdingRates, setWithholdingRates] = useState([])
  const [dataLoading, setDataLoading] = useState(false)
  const [availableQuotes, setAvailableQuotes] = useState([]) // For relatedQuoteId (P3.3)

  // Dropdown states
  const [workOrderDropdownOpen, setWorkOrderDropdownOpen] = useState(false)
  const [quoteDropdownOpen, setQuoteDropdownOpen] = useState(false)
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false)
  const [customerSearchTerm, setCustomerSearchTerm] = useState('')
  const [relatedQuoteDropdownOpen, setRelatedQuoteDropdownOpen] = useState(false) // P3.3

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
    if (!isOpen) return

    setDataLoading(true)

    Promise.all([
      shipmentsService.getAvailableMaterials().catch(() => []),
      shipmentsService.getApprovedQuotes().catch(() => []),
      shipmentsService.getCompletedWorkOrders().catch(() => []),
      customersService.getCustomers().catch(() => []),
      // REMOVED (P3.1): VAT exemptions and withholding rates moved to Invoice Export panel
      // fetch('/api/materials/vat-exemptions').then(r => r.json()).catch(() => []),
      // fetch('/api/materials/withholding-rates').then(r => r.json()).catch(() => [])
    ]).then(([materialsData, quotesData, workOrdersData, customersData]) => {
      setMaterials(materialsData)
      setQuotes(quotesData)
      setWorkOrders(workOrdersData)
      setCustomers(Array.isArray(customersData) ? customersData : (customersData?.customers || []))
      // REMOVED (P3.1): setVatExemptions and setWithholdingRates
      // setVatExemptions(vatData)
      // setWithholdingRates(whData)
      setDataLoading(false)
    }).catch(err => {
      console.error('Failed to load data:', err)
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
      relatedQuoteId: '', // P3.3
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
      notes: '',
      // Transport fields (P3.3)
      transport: {
        driverName: '',
        driverTc: '',
        plateNumber: '',
        deliveryPerson: '',
        receiverPerson: '',
        deliveryNote: ''
      },
      // Waybill date (P3.3)
      waybillDate: new Date().toISOString().split('T')[0]
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

    // Reset Export/Import states
    setCreatedShipmentId(null)
    setExportStatus({ loading: false, success: false, fileName: null, error: null })
    setImportStatus({ loading: false, success: false, error: null })
    setExternalDocNumber('')
    setSelectedFile(null)

    setCustomerSearchTerm('')
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

  // Fetch customer quotes when customer is selected (P3.3)
  useEffect(() => {
    const fetchCustomerQuotes = async () => {
      if (!headerData.customerId) {
        setAvailableQuotes([])
        return
      }

      try {
        const url = `/api/quotes?customerId=${headerData.customerId}&status=approved`

        const response = await fetch(url)
        const data = await response.json()

        const quotes = Array.isArray(data) ? data : (data.quotes || [])

        setAvailableQuotes(quotes)
      } catch (error) {
        console.error('Failed to fetch customer quotes:', error)
        setAvailableQuotes([])
      }
    }

    fetchCustomerQuotes()
  }, [headerData.customerId])

  if (!isOpen) return null

  // Close all dropdowns
  const closeAllDropdowns = () => {
    setItems(prev => prev.map(item => ({ ...item, dropdownOpen: false })))
    setWorkOrderDropdownOpen(false)
    setQuoteDropdownOpen(false)
    setCustomerDropdownOpen(false)
    setRelatedQuoteDropdownOpen(false) // P3.3
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
      country: customer.country || 'Türkiye',
      city: customer.city || '',
      district: customer.district || '',
      neighborhood: customer.neighborhood || '',
      postalCode: customer.postalCode || '',
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
    // Validate driver TC if entered
    const driverTc = headerData.transport?.driverTc || ''
    if (driverTc && driverTc.length !== 11) {
      setError('Şoför TC kimlik numarası 11 haneli olmalıdır')
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
        // Transport fields (P3.3)
        driverName: headerData.transport.driverName,
        driverTc: headerData.transport.driverTc,
        plateNumber: headerData.transport.plateNumber,
        deliveryPerson: headerData.transport.deliveryPerson,
        receiverPerson: headerData.transport.receiverPerson,
        deliveryNote: headerData.transport.deliveryNote,
        // Waybill date (P3.3)
        waybillDate: headerData.waybillDate,
        // Related quote for 7-day rule (P3.3)
        relatedQuoteId: headerData.relatedQuoteId || null,
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

      // Save shipment ID for Steps 4 & 5
      setCreatedShipmentId(result.id || result.shipmentId)
      setLoading(false)

      // Don't close modal - show Step 3 with export/close options
      // User can choose to export (Step 4) or close
    } catch (err) {
      console.error('Shipment creation error:', err)
      setError(err.message || 'Sevkiyat oluşturulurken hata oluştu')
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

                  {/* BELGE TİPİ - REMOVED (P3.1) - Now always 'waybill' */}
                  {/* documentType is now hardcoded to 'waybill' in initial state */}
                  {/* Invoice/pricing moved to separate Invoice Export panel */}

                  {/* İŞ EMRİ & TEKLİF - REMOVED (P3.3) */}
                  {/* Legacy work order and quote fields removed - now using relatedQuoteId for 7-day rule */}

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

                  {/* FİYAT DAHİL ET CHECKBOX */}
                  <div className="mb-16">
                    <label className="shipment-checkbox-label">
                      <input
                        type="checkbox"
                        checked={headerData.includePrice}
                        onChange={(e) => setHeaderData(prev => ({ ...prev, includePrice: e.target.checked }))}
                        className="form-checkbox"
                      />
                      <span>Fiyat bilgisi dahil et</span>
                      <span className="shipment-checkbox-hint">(İrsaliyede fiyat gösterilsin)</span>
                    </label>
                  </div>

                  {/* BAĞLI TEKLİF (P3.3) - 7 Day Rule Linking */}
                  {headerData.customerId && (
                    <div className="mb-16">
                      <label className="supplier-label-block">
                        Bağlı Teklif (Opsiyonel)
                        <span className="text-xs text-gray-500 ml-8">- 7 gün kuralı için</span>
                      </label>
                      <div className="pos-z15">
                        <button
                          type="button"
                          className="mes-filter-select full-justify-between"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRelatedQuoteDropdownOpen(!relatedQuoteDropdownOpen);
                            setWorkOrderDropdownOpen(false);
                            setQuoteDropdownOpen(false);
                            setCustomerDropdownOpen(false);
                          }}
                        >
                          <span className={`text-conditional ${!headerData.relatedQuoteId ? 'placeholder' : ''}`}>
                            {headerData.relatedQuoteId ?
                              availableQuotes.find(q => q.id === headerData.relatedQuoteId)?.id || headerData.relatedQuoteId
                              : 'Teklif seçin...'}
                          </span>
                          <ChevronDown size={14} />
                        </button>
                        {relatedQuoteDropdownOpen && (
                          <div className="dropdown-menu">
                            <div
                              className="dropdown-item-muted"
                              onClick={() => {
                                setHeaderData(prev => ({ ...prev, relatedQuoteId: '' }));
                                setRelatedQuoteDropdownOpen(false);
                              }}
                            >
                              Seçimi temizle
                            </div>
                            {availableQuotes.length === 0 && (
                              <div className="dropdown-empty-state">
                                Bu müşteriye ait onaylanmış teklif bulunamadı
                              </div>
                            )}
                            {availableQuotes.map(q => (
                              <div
                                key={q.id}
                                className="dropdown-item-action"
                                onClick={() => {
                                  setHeaderData(prev => ({ ...prev, relatedQuoteId: q.id }));
                                  setRelatedQuoteDropdownOpen(false);
                                }}
                              >
                                <div className="font-medium">{q.id}</div>
                                <div className="text-xs-muted">
                                  {q.customerName} - {q.finalPrice ? `₺${q.finalPrice.toLocaleString('tr-TR')}` : ''}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-4">
                        İrsaliyeyi bir teklife bağlayarak 7 gün kuralı takibi yapılır
                      </p>
                    </div>
                  )}

                  {/* ===== AKORDEONLAR ===== */}
                  <div className="accordion-row">

                    {/* PARA BİRİMİ & KUR AKORDEON - REMOVED (P3.1) */}
                    {/* Currency/exchange rate moved to Invoice Export panel */}

                    {/* İSKONTO AYARLARI AKORDEON - REMOVED (P3.1) */}
                    {/* Discount settings moved to Invoice Export panel */}

                    {/* VERGİ DETAYLARI AKORDEON - REMOVED (P3.1) */}
                    {/* Tax/VAT/Withholding settings moved to Invoice Export panel */}

                    {/* TAŞIMA BİLGİLERİ AKORDEON (P3.3) */}
                    <TransportAccordion
                      driverName={headerData.transport.driverName}
                      driverTc={headerData.transport.driverTc}
                      plateNumber={headerData.transport.plateNumber}
                      deliveryPerson={headerData.transport.deliveryPerson}
                      receiverPerson={headerData.transport.receiverPerson}
                      deliveryNote={headerData.transport.deliveryNote}
                      waybillDate={headerData.waybillDate}
                      onChange={(field, value) => {
                        if (field === 'waybillDate') {
                          setHeaderData(prev => ({ ...prev, waybillDate: value }))
                        } else {
                          setHeaderData(prev => ({
                            ...prev,
                            transport: { ...prev.transport, [field]: value }
                          }))
                        }
                      }}
                      defaultOpen={false}
                    />

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

                    {/* EXPORT AYARLARI AKORDEON - REMOVED */}
                    {/* Export settings moved to Step 4 (when user actually wants to export) */}
                  </div>

                  {/* NOTLAR AKORDEON */}
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
                          {headerData.includePrice && item.unitPrice && (
                            <span className="text-muted-sm ml-8">
                              @ ₺{parseFloat(item.unitPrice).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          )}
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

              {/* ===== STEP 4: Export ===== */}
              {currentStep === 4 && (
                <div>
                  <p className="text-xs-light-mb">
                    İrsaliye belgesini dışa aktarın
                  </p>

                  <div className="summary-info-box">
                    <h3 className="section-header">Export Ayarları</h3>

                    {/* Hedef Program Seçimi */}
                    <div className="mb-16">
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

                    {/* Export Format Seçimi */}
                    <div className="mb-16">
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
                            <span>{format.toUpperCase()}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Export Butonu */}
                    <div className="mt-16">
                      <button
                        type="button"
                        onClick={async () => {
                          if (headerData.exportFormats.length === 0) {
                            setExportStatus({ loading: false, success: false, fileName: null, error: 'En az bir format seçmelisiniz' })
                            return
                          }

                          setExportStatus({ loading: true, success: false, fileName: null, error: null })
                          try {
                            const response = await fetch(`/api/materials/shipments/${createdShipmentId}/export`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                target: headerData.exportTarget,
                                formats: headerData.exportFormats
                              })
                            })

                            if (!response.ok) throw new Error('Export başarısız')

                            const blob = await response.blob()
                            const fileName = `irsaliye_${createdShipmentId}_${new Date().toISOString().split('T')[0]}.${headerData.exportFormats[0]}`
                            const url = window.URL.createObjectURL(blob)
                            const a = document.createElement('a')
                            a.href = url
                            a.download = fileName
                            document.body.appendChild(a)
                            a.click()
                            window.URL.revokeObjectURL(url)
                            document.body.removeChild(a)

                            setExportStatus({ loading: false, success: true, fileName, error: null })
                          } catch (err) {
                            setExportStatus({ loading: false, success: false, fileName: null, error: err.message })
                          }
                        }}
                        disabled={exportStatus.loading || headerData.exportFormats.length === 0}
                        className={`btn-submit ${(exportStatus.loading || headerData.exportFormats.length === 0) ? 'disabled' : 'enabled'} w-full`}
                      >
                        {exportStatus.loading ? (
                          <>
                            <Loader2 size={14} className="spin-animation" />
                            İndiriliyor...
                          </>
                        ) : exportStatus.success ? (
                          <>
                            <Check size={14} />
                            İndirildi
                          </>
                        ) : (
                          <>
                            <Package size={14} />
                            Belge İndir
                          </>
                        )}
                      </button>

                      {exportStatus.success && (
                        <div className="mt-8 p-8 bg-green-50 border border-green-200 rounded text-sm text-green-700">
                          ✓ Dosya indirildi: {exportStatus.fileName}
                        </div>
                      )}

                      {exportStatus.error && (
                        <div className="mt-8 p-8 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                          ✗ Hata: {exportStatus.error}
                        </div>
                      )}
                    </div>

                    {exportStatus.success && (
                      <div className="mt-16 pt-16 border-t border-gray-200">
                        <p className="text-sm text-gray-600 mb-12">
                          Export tamamlandı. Şimdi harici belge numarasını girerek sevkiyatı tamamlayabilirsiniz.
                        </p>
                        <button
                          type="button"
                          onClick={() => setCurrentStep(5)}
                          className="btn-secondary w-full"
                        >
                          <ArrowRight size={14} />
                          ETTN / Belge No Girişi
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ===== STEP 5: Document Import ===== */}
              {currentStep === 5 && (
                <div>
                  {/* Shipment Summary Card */}
                  <div style={{
                    background: '#f3f4f6',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    marginBottom: '20px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <FileText size={16} style={{ color: '#6b7280' }} />
                      <span style={{ fontWeight: 600, color: '#374151' }}>
                        {headerData.shipmentCode || `SHP-${createdShipmentId}`}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#6b7280', marginLeft: '24px' }}>
                      {headerData.customerSnapshot?.company || headerData.customerSnapshot?.name || 'Müşteri'}
                    </div>
                    {exportStatus.success && exportStatus.exportDate && (
                      <div style={{
                        fontSize: '12px',
                        color: '#059669',
                        marginLeft: '24px',
                        marginTop: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <Check size={12} />
                        Export edildi
                        <span>({new Date(exportStatus.exportDate).toLocaleDateString('tr-TR')})</span>
                      </div>
                    )}
                  </div>

                  {/* Import Section */}
                  <div style={{ marginBottom: '16px' }}>
                    <p style={{ fontSize: '14px', color: '#374151', marginBottom: '16px' }}>
                      Logo/Zirve'den aldığınız onay dosyasını yükleyin:
                    </p>

                    {/* Drag & Drop File Upload */}
                    <div
                      onClick={() => document.getElementById('import-file-input').click()}
                      onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#3b82f6'; }}
                      onDragLeave={(e) => { e.currentTarget.style.borderColor = '#d1d5db'; }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.style.borderColor = '#d1d5db';
                        const file = e.dataTransfer.files[0];
                        if (file) setSelectedFile(file);
                      }}
                      style={{
                        border: '2px dashed #d1d5db',
                        borderRadius: '8px',
                        padding: '24px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: '#f9fafb',
                        transition: 'all 0.2s',
                        marginBottom: '16px'
                      }}
                    >
                      <input
                        id="import-file-input"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.xml,.csv,.xls,.xlsx"
                        onChange={(e) => setSelectedFile(e.target.files[0])}
                        style={{ display: 'none' }}
                        disabled={importStatus.loading || importStatus.success}
                      />
                      <div>
                        <Upload size={32} style={{ color: '#9ca3af', marginBottom: '8px' }} />
                        <p style={{ margin: '0 0 4px 0', fontWeight: 500, color: '#374151' }}>
                          {selectedFile ? selectedFile.name : 'Dosya Seç veya Sürükle'}
                        </p>
                        <p style={{ margin: 0, fontSize: '12px', color: '#9ca3af' }}>
                          PDF, JPG, PNG, XML, CSV, XLS (Max 10MB)
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* External Document Number */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Resmi Belge No <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Örn: A-2025-001234"
                      className="mes-filter-input"
                      value={externalDocNumber}
                      onChange={(e) => setExternalDocNumber(e.target.value)}
                      disabled={importStatus.loading || importStatus.success}
                      style={{ width: '100%' }}
                    />
                    <p style={{
                      margin: '4px 0 0 0',
                      fontSize: '12px',
                      color: '#6b7280'
                    }}>
                      Logo/Zirve'den aldığınız fatura veya irsaliye numarası
                    </p>
                  </div>

                  {/* Warning */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '10px 12px',
                    background: '#fef3c7',
                    border: '1px solid #fcd34d',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#92400e',
                    marginBottom: '16px'
                  }}>
                    <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                    <span>
                      Import tamamlandığında stok otomatik olarak düşürülecektir.
                    </span>
                  </div>

                  {/* Import Button */}
                  <button
                    type="button"
                    onClick={async () => {
                      if (!externalDocNumber) {
                        setImportStatus({ loading: false, success: false, error: 'Harici belge numarası zorunludur' })
                        return
                      }

                      setImportStatus({ loading: true, success: false, error: null })

                      const formData = new FormData()
                      formData.append('externalDocNumber', externalDocNumber)
                      if (selectedFile) {
                        formData.append('file', selectedFile)
                      }

                      try {
                        const response = await fetch(`/api/materials/shipments/${createdShipmentId}/import`, {
                          method: 'POST',
                          body: formData
                        })

                        const result = await response.json()

                        if (!response.ok) throw new Error(result.error || result.message || 'Import başarısız')

                        setImportStatus({ loading: false, success: true, error: null })
                      } catch (err) {
                        setImportStatus({ loading: false, success: false, error: err.message })
                      }
                    }}
                    className={`btn-submit w-full mt-16 ${(importStatus.loading || importStatus.success) ? 'disabled' : 'enabled'}`}
                    disabled={importStatus.loading || importStatus.success}
                  >
                    {importStatus.loading ? (
                      <>
                        <Loader2 size={14} className="spin-animation" />
                        Yükleniyor...
                      </>
                    ) : importStatus.success ? (
                      <>
                        <Check size={14} />
                        Tamamlandı
                      </>
                    ) : (
                      <>
                        <Upload size={14} />
                        İçe Aktar
                      </>
                    )}
                  </button>

                  {/* Status Messages */}
                  {importStatus.loading && (
                    <div className="mt-8 p-8 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
                      <Loader2 size={14} className="spin-animation inline mr-4" />
                      Yükleniyor...
                    </div>
                  )}

                  {importStatus.success && (
                    <div className="mt-8 p-8 bg-green-50 border border-green-200 rounded text-sm text-green-700">
                      ✓ Belge başarıyla içe aktarıldı
                    </div>
                  )}

                  {importStatus.error && (
                    <div className="mt-8 p-8 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                      ✗ Hata: {importStatus.error}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer-flex">
          {/* Left side - Back button or empty */}
          <div>
            {currentStep > 1 && currentStep <= 3 && (
              <button
                type="button"
                onClick={handleBack}
                className="btn-back"
              >
                <ChevronLeft size={14} />
                Geri
              </button>
            )}
            {currentStep === 4 && (
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="btn-back"
              >
                <ChevronLeft size={14} />
                Özete Dön
              </button>
            )}
            {currentStep === 5 && (
              <button
                type="button"
                onClick={() => setCurrentStep(4)}
                className="btn-back"
              >
                <ChevronLeft size={14} />
                Export'a Dön
              </button>
            )}
          </div>

          {/* Right side - Next/Submit button */}
          <div className="flex-gap-10">
            {/* Only show İptal for Steps 1-3 */}
            {currentStep <= 3 && (
              <button
                type="button"
                onClick={onClose}
                className="btn-cancel"
              >
                İptal
              </button>
            )}

            {/* Step 4: No buttons (they're in the step content) */}
            {/* Step 5: Show Tamam button */}
            {currentStep === 5 && (
              <button
                type="button"
                onClick={() => {
                  if (onSuccess) onSuccess({ id: createdShipmentId })
                  onClose()
                }}
                className="btn-submit enabled"
              >
                <Check size={14} />
                Tamam
              </button>
            )}

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
            ) : currentStep === 3 && createdShipmentId ? (
              // After creation - show export/close options
              <div className="flex-center-gap-8">
                <button
                  type="button"
                  onClick={() => {
                    if (onSuccess) onSuccess({ id: createdShipmentId })
                    onClose()
                  }}
                  className="btn-secondary"
                >
                  <Check size={14} />
                  Tamam
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(4)}
                  className="btn-submit enabled"
                >
                  <ArrowRight size={14} />
                  Belge Çıkart
                </button>
              </div>
            ) : currentStep === 3 ? (
              // Before creation - show create button
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
            ) : null}
          </div>
        </div>
      </div>
    </div >
  )
}
