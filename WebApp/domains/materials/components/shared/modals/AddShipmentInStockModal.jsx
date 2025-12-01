import React, { useState, useEffect, useRef } from 'react'
import { shipmentsService } from '../../../services/shipments-service.js'
import { Truck, X, Package, ChevronDown, Search, Loader2 } from 'lucide-react'

/**
 * ShipmentModalInStock - Stok sayfasından sevkiyat oluşturma dropdown paneli
 * MES sistem tasarım diline uygun - mes-filter-select ve mes-filter-input sınıflarını kullanır
 * Verileri API'den çeker: approved quotes ve completed work orders
 */
export default function AddShipmentInStockModal({ 
  isOpen, 
  onClose, 
  material,
  anchorPosition,
  onSuccess
}) {
  const [formData, setFormData] = useState({
    shipmentQuantity: '',
    workOrderCode: '',
    quoteId: '',
    description: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const panelRef = useRef(null)
  
  // Data loading states
  const [workOrders, setWorkOrders] = useState([])
  const [quotes, setQuotes] = useState([])
  const [dataLoading, setDataLoading] = useState(false)
  
  // Dropdown states
  const [workOrderDropdownOpen, setWorkOrderDropdownOpen] = useState(false)
  const [quoteDropdownOpen, setQuoteDropdownOpen] = useState(false)
  const [workOrderSearch, setWorkOrderSearch] = useState('')
  const [quoteSearch, setQuoteSearch] = useState('')

  // Fetch approved quotes and completed work orders when panel opens
  useEffect(() => {
    if (isOpen && material) {
      setDataLoading(true)
      Promise.all([
        shipmentsService.getApprovedQuotes().catch(() => []),
        shipmentsService.getCompletedWorkOrders().catch(() => [])
      ]).then(([quotesData, workOrdersData]) => {
        setQuotes(quotesData)
        setWorkOrders(workOrdersData)
      }).finally(() => {
        setDataLoading(false)
      })
    }
  }, [isOpen, material?.code])

  // Reset form when panel opens
  useEffect(() => {
    if (isOpen && material) {
      setFormData({
        shipmentQuantity: '',
        workOrderCode: '',
        quoteId: '',
        description: ''
      })
      setError(null)
      setWorkOrderDropdownOpen(false)
      setQuoteDropdownOpen(false)
      setWorkOrderSearch('')
      setQuoteSearch('')
    }
  }, [isOpen, material?.code])

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose()
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  // ESC to close
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (workOrderDropdownOpen) setWorkOrderDropdownOpen(false)
        else if (quoteDropdownOpen) setQuoteDropdownOpen(false)
        else onClose()
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEsc)
      return () => document.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen, onClose, workOrderDropdownOpen, quoteDropdownOpen])

  if (!isOpen || !material) return null

  const availableStock = (material.stock || 0) - (material.reserved || 0) - (material.wipReserved || 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    const quantity = parseFloat(formData.shipmentQuantity)
    
    if (!quantity || quantity <= 0) {
      setError('Geçerli bir miktar giriniz')
      return
    }

    if (quantity > availableStock) {
      setError(`Yetersiz stok. Mevcut: ${availableStock}`)
      return
    }

    setLoading(true)

    try {
      // Use the new quick shipment endpoint (backwards compatible)
      const result = await shipmentsService.createQuickShipment({
        productCode: material.code,
        shipmentQuantity: quantity,
        workOrderCode: formData.workOrderCode || undefined,
        quoteId: formData.quoteId || undefined,
        description: formData.description || undefined
      })

      if (onSuccess) onSuccess(result)
      onClose()
    } catch (err) {
      setError(err.message || 'Sevkiyat oluşturulamadı')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field, value) => {
    // Sayısal alanlar için virgül → nokta dönüşümü
    if (field === 'shipmentQuantity') {
      let cleanValue = value.replace(/,/g, '.');
      if (!/^[0-9.]*$/.test(cleanValue)) return;
      if ((cleanValue.match(/\./g) || []).length > 1) return;
      setFormData(prev => ({ ...prev, [field]: cleanValue }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  }

  // Filter work orders based on search
  const filteredWorkOrders = workOrders.filter(wo => 
    wo.workOrderCode?.toLowerCase().includes(workOrderSearch.toLowerCase()) ||
    wo.productName?.toLowerCase().includes(workOrderSearch.toLowerCase())
  )

  // Filter quotes based on search
  const filteredQuotes = quotes.filter(q => 
    q.id?.toString().toLowerCase().includes(quoteSearch.toLowerCase()) ||
    q.customer_name?.toLowerCase().includes(quoteSearch.toLowerCase())
  )

  // Styles - MES System Design Language
  const panelStyle = {
    position: 'fixed',
    top: anchorPosition?.top || 100,
    left: anchorPosition?.left || 100,
    backgroundColor: 'var(--card-bg, #ffffff)',
    borderRadius: '8px',
    width: '340px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.15), 0 0 0 1px var(--border, #e5e7eb)',
    zIndex: 10000,
    maxHeight: '85vh',
    overflow: 'visible'
  }

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border, #e5e7eb)',
    backgroundColor: 'var(--card-header-bg, #f9fafb)',
    borderRadius: '8px 8px 0 0'
  }

  const bodyStyle = {
    padding: '16px',
    maxHeight: 'calc(85vh - 120px)',
    overflowY: 'auto'
  }

  const labelStyle = {
    display: 'block',
    fontSize: '12px',
    fontWeight: '500',
    color: 'var(--text-secondary, #6b7280)',
    marginBottom: '6px'
  }

  const dropdownContainerStyle = {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: 'var(--card-bg, #ffffff)',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: '6px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    zIndex: 10001,
    maxHeight: '200px',
    overflow: 'auto',
    marginTop: '4px'
  }

  const dropdownItemStyle = {
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: '13px',
    borderBottom: '1px solid var(--border, #f3f4f6)',
    transition: 'background-color 0.1s'
  }

  const buttonStyle = {
    padding: '10px 16px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    transition: 'all 0.15s',
    border: 'none'
  }

  return (
    <div ref={panelRef} style={panelStyle} onClick={e => e.stopPropagation()}>
      {/* Header */}
      <div style={headerStyle}>
        <div className="flex-center-gap-8">
          <Truck size={18} className="text-primary-var" />
          <div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary, #111827)' }}>
              Sevkiyat Oluştur
            </div>
            <div className="text-secondary-var">
              {material.code}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            color: 'var(--text-secondary, #9ca3af)'
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Body */}
      <div style={bodyStyle}>
        {/* Product Info Card */}
        <div style={{
          backgroundColor: 'var(--info-bg, #eff6ff)',
          border: '1px solid var(--info-border, #bfdbfe)',
          borderRadius: '6px',
          padding: '10px 12px',
          marginBottom: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Package size={14} style={{ color: 'var(--info-text, #2563eb)' }} />
            <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--info-text, #1e40af)' }}>
              {material.name}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
            <span style={{ color: 'var(--text-secondary, #6b7280)' }}>Mevcut Stok:</span>
            <span style={{ fontWeight: '600', color: 'var(--success, #16a34a)' }}>
              {availableStock.toLocaleString('tr-TR')} {material.unit || 'adet'}
            </span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            backgroundColor: 'var(--error-bg, #fef2f2)',
            border: '1px solid var(--error-border, #fecaca)',
            borderRadius: '6px',
            padding: '10px 12px',
            marginBottom: '16px',
            color: 'var(--error, #dc2626)',
            fontSize: '12px'
          }}>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* Data Loading Indicator */}
          {dataLoading && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              marginBottom: '12px',
              padding: '8px 12px',
              backgroundColor: 'var(--muted-bg, #f3f4f6)',
              borderRadius: '6px',
              fontSize: '12px',
              color: 'var(--text-secondary, #6b7280)'
            }}>
              <Loader2 size={14} className="animate-spin spin-animation" />
              Veriler yükleniyor...
            </div>
          )}

          {/* Quantity - using mes-filter-input is-compact */}
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Sevk Miktarı *</label>
            <div className="flex-gap-8">
              <input
                type="text"
                className="mes-filter-input is-compact flex-1"
                value={formData.shipmentQuantity}
                onChange={(e) => handleChange('shipmentQuantity', e.target.value)}
                placeholder="0"
                inputMode="decimal"
                pattern="[0-9]*\.?[0-9]*"
                required
                autoFocus
              />
              <div style={{
                padding: '8px 12px',
                backgroundColor: 'var(--muted-bg, #f3f4f6)',
                borderRadius: '6px',
                fontSize: '12px',
                color: 'var(--text-secondary, #6b7280)',
                display: 'flex',
                alignItems: 'center',
                minWidth: '50px',
                justifyContent: 'center'
              }}>
                {material.unit || 'adet'}
              </div>
            </div>
          </div>

          {/* Work Order Dropdown - using mes-filter-select */}
          <div className="mb-14-relative">
            <label style={labelStyle}>İş Emri (Tamamlanmış)</label>
            <button
              type="button"
              className="mes-filter-select"
              onClick={() => {
                setWorkOrderDropdownOpen(!workOrderDropdownOpen)
                setQuoteDropdownOpen(false)
              }}
              style={{ 
                width: '100%', 
                justifyContent: 'space-between',
                textAlign: 'left'
              }}
            >
              <span style={{ 
                color: formData.workOrderCode ? 'var(--text-primary, #111827)' : 'var(--text-muted, #9ca3af)',
                flex: 1
              }}>
                {formData.workOrderCode || 'İş emri seçin'}
              </span>
              <ChevronDown size={16} className="text-secondary-shrink" />
            </button>
            
            {workOrderDropdownOpen && (
              <div style={dropdownContainerStyle}>
                {/* Search */}
                <div className="p-8-border-var">
                  <div className="pos-relative">
                    <Search size={14} style={{ 
                      position: 'absolute', 
                      left: '10px', 
                      top: '50%', 
                      transform: 'translateY(-50%)',
                      color: 'var(--text-secondary, #9ca3af)'
                    }} />
                    <input
                      type="text"
                      className="mes-filter-input is-compact pl-32-full"
                      value={workOrderSearch}
                      onChange={(e) => setWorkOrderSearch(e.target.value)}
                      placeholder="Ara..."
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
                
                {/* Clear option */}
                <div
                  style={{ ...dropdownItemStyle, color: 'var(--text-secondary, #6b7280)', fontStyle: 'italic' }}
                  onClick={() => {
                    handleChange('workOrderCode', '')
                    setWorkOrderDropdownOpen(false)
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--hover-bg, #f3f4f6)'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                  Seçimi temizle
                </div>
                
                {/* Options */}
                {filteredWorkOrders.length > 0 ? (
                  filteredWorkOrders.map(wo => (
                    <div
                      key={wo.workOrderCode}
                      style={dropdownItemStyle}
                      onClick={() => {
                        handleChange('workOrderCode', wo.workOrderCode)
                        setWorkOrderDropdownOpen(false)
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--hover-bg, #f3f4f6)'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                    >
                      <div className="font-medium">{wo.workOrderCode}</div>
                      {wo.productName && <div className="text-secondary-var">{wo.productName}</div>}
                    </div>
                  ))
                ) : (
                  <div style={{ ...dropdownItemStyle, color: 'var(--text-secondary, #9ca3af)', textAlign: 'center' }}>
                    {dataLoading ? 'Yükleniyor...' : 'Tamamlanmış iş emri bulunamadı'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quote Dropdown - using mes-filter-select */}
          <div className="mb-14-relative">
            <label style={labelStyle}>Teklif (Onaylanmış)</label>
            <button
              type="button"
              className="mes-filter-select"
              onClick={() => {
                setQuoteDropdownOpen(!quoteDropdownOpen)
                setWorkOrderDropdownOpen(false)
              }}
              style={{ 
                width: '100%', 
                justifyContent: 'space-between',
                textAlign: 'left'
              }}
            >
              <span style={{ 
                color: formData.quoteId ? 'var(--text-primary, #111827)' : 'var(--text-muted, #9ca3af)',
                flex: 1
              }}>
                {formData.quoteId || 'Teklif seçin'}
              </span>
              <ChevronDown size={16} className="text-secondary-shrink" />
            </button>
            
            {quoteDropdownOpen && (
              <div style={dropdownContainerStyle}>
                {/* Search */}
                <div className="p-8-border-var">
                  <div className="pos-relative">
                    <Search size={14} style={{ 
                      position: 'absolute', 
                      left: '10px', 
                      top: '50%', 
                      transform: 'translateY(-50%)',
                      color: 'var(--text-secondary, #9ca3af)'
                    }} />
                    <input
                      type="text"
                      className="mes-filter-input is-compact pl-32-full"
                      value={quoteSearch}
                      onChange={(e) => setQuoteSearch(e.target.value)}
                      placeholder="Ara..."
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
                
                {/* Clear option */}
                <div
                  style={{ ...dropdownItemStyle, color: 'var(--text-secondary, #6b7280)', fontStyle: 'italic' }}
                  onClick={() => {
                    handleChange('quoteId', '')
                    setQuoteDropdownOpen(false)
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--hover-bg, #f3f4f6)'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                  Seçimi temizle
                </div>
                
                {/* Options */}
                {filteredQuotes.length > 0 ? (
                  filteredQuotes.map(q => (
                    <div
                      key={q.id}
                      style={dropdownItemStyle}
                      onClick={() => {
                        handleChange('quoteId', q.id)
                        setQuoteDropdownOpen(false)
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--hover-bg, #f3f4f6)'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                    >
                      <div className="font-medium">#{q.id}</div>
                      {q.customer_name && <div className="text-secondary-var">{q.customer_name}</div>}
                    </div>
                  ))
                ) : (
                  <div style={{ ...dropdownItemStyle, color: 'var(--text-secondary, #9ca3af)', textAlign: 'center' }}>
                    {dataLoading ? 'Yükleniyor...' : 'Onaylanmış teklif bulunamadı'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Description - using mes-filter-input is-compact */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Not</label>
            <input
              type="text"
              className="mes-filter-input is-compact w-full"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Sevkiyat notu..."
            />
          </div>

          {/* Buttons */}
          <div className="flex-gap-10">
            <button
              type="button"
              onClick={onClose}
              style={{
                ...buttonStyle,
                flex: 1,
                backgroundColor: 'var(--muted-bg, #f3f4f6)',
                color: 'var(--text-primary, #374151)',
                border: '1px solid var(--border, #d1d5db)'
              }}
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                ...buttonStyle,
                flex: 1,
                backgroundColor: loading ? 'var(--muted, #9ca3af)' : 'var(--primary, #3b82f6)',
                color: '#ffffff'
              }}
            >
              {loading ? (
                'Gönderiliyor...'
              ) : (
                <>
                  <Truck size={16} />
                  Gönder
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
