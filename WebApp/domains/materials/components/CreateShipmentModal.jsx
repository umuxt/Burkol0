import React, { useState, useEffect, useRef } from 'react'
import { shipmentsService } from '../services/shipments-service.js'
import { Truck, X, Package, Plus, Trash2, ChevronDown, Search, Loader2, AlertCircle } from 'lucide-react'

/**
 * CreateShipmentModal - Shipment panelinden çoklu kalem destekli sevkiyat oluşturma
 * Sipariş oluşturma modalı gibi çalışır - birden fazla malzeme eklenebilir
 */
export default function CreateShipmentModal({ 
  isOpen, 
  onClose, 
  onSuccess
}) {
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
  
  // Dropdown states for header
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
      
      // If selecting a material, populate related fields
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
      
      // Sayısal alanlar için virgül → nokta dönüşümü
      if (field === 'quantity') {
        let cleanValue = value.replace(/,/g, '.');
        if (!/^[0-9.]*$/.test(cleanValue)) return item;
        if ((cleanValue.match(/\./g) || []).length > 1) return item;
        return { ...item, [field]: cleanValue }
      }
      
      return { ...item, [field]: value }
    }))
  }

  // Close all item dropdowns
  const closeAllDropdowns = () => {
    setItems(prev => prev.map(item => ({ ...item, dropdownOpen: false })))
    setWorkOrderDropdownOpen(false)
    setQuoteDropdownOpen(false)
  }

  // Validate form
  const validateForm = () => {
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
    
    return true
  }

  // Submit form
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    
    if (!validateForm()) return
    
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
          width: '90%',
          maxWidth: '800px',
          maxHeight: '90vh',
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
          borderBottom: '1px solid var(--border, #e5e7eb)',
          backgroundColor: 'var(--card-header-bg, #f9fafb)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: 'var(--primary-light, #dbeafe)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Truck size={20} style={{ color: 'var(--primary, #3b82f6)' }} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: 'var(--text-primary, #111827)' }}>
                Yeni Sevkiyat Oluştur
              </h2>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary, #6b7280)' }}>
                Birden fazla malzeme ekleyebilirsiniz
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '6px',
              display: 'flex',
              color: 'var(--text-secondary, #9ca3af)'
            }}
          >
            <X size={20} />
          </button>
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
              padding: '12px 16px',
              marginBottom: '20px',
              color: 'var(--error, #dc2626)',
              fontSize: '13px'
            }}>
              <AlertCircle size={16} />
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
              color: 'var(--text-secondary, #6b7280)'
            }}>
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
              Veriler yükleniyor...
            </div>
          )}

          {!dataLoading && (
            <form onSubmit={handleSubmit}>
              {/* Header Section */}
              <div style={{
                backgroundColor: 'var(--muted-bg, #f9fafb)',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '20px'
              }}>
                <h3 style={{ 
                  margin: '0 0 12px 0', 
                  fontSize: '13px', 
                  fontWeight: '600', 
                  color: 'var(--text-secondary, #6b7280)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Sevkiyat Bilgileri
                </h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {/* Work Order */}
                  <div style={{ position: 'relative' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary, #6b7280)', marginBottom: '4px' }}>
                      İş Emri
                    </label>
                    <button
                      type="button"
                      className="mes-filter-select"
                      onClick={(e) => { e.stopPropagation(); setWorkOrderDropdownOpen(!workOrderDropdownOpen); setQuoteDropdownOpen(false); }}
                      style={{ width: '100%', justifyContent: 'space-between' }}
                    >
                      <span style={{ color: headerData.workOrderCode ? 'var(--text-primary)' : 'var(--text-muted)' }}>
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
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        zIndex: 100,
                        maxHeight: '200px',
                        overflow: 'auto',
                        marginTop: '4px'
                      }}>
                        <div 
                          style={{ padding: '8px 12px', cursor: 'pointer', color: 'var(--text-secondary)', fontStyle: 'italic' }}
                          onClick={() => { setHeaderData(prev => ({ ...prev, workOrderCode: '' })); setWorkOrderDropdownOpen(false); }}
                        >
                          Seçimi temizle
                        </div>
                        {workOrders.map(wo => (
                          <div
                            key={wo.code}
                            style={{ padding: '8px 12px', cursor: 'pointer', borderTop: '1px solid var(--border, #f3f4f6)' }}
                            onClick={() => { setHeaderData(prev => ({ ...prev, workOrderCode: wo.code })); setWorkOrderDropdownOpen(false); }}
                          >
                            {wo.label || wo.code}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Quote */}
                  <div style={{ position: 'relative' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary, #6b7280)', marginBottom: '4px' }}>
                      Teklif
                    </label>
                    <button
                      type="button"
                      className="mes-filter-select"
                      onClick={(e) => { e.stopPropagation(); setQuoteDropdownOpen(!quoteDropdownOpen); setWorkOrderDropdownOpen(false); }}
                      style={{ width: '100%', justifyContent: 'space-between' }}
                    >
                      <span style={{ color: headerData.quoteId ? 'var(--text-primary)' : 'var(--text-muted)' }}>
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
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        zIndex: 100,
                        maxHeight: '200px',
                        overflow: 'auto',
                        marginTop: '4px'
                      }}>
                        <div 
                          style={{ padding: '8px 12px', cursor: 'pointer', color: 'var(--text-secondary)', fontStyle: 'italic' }}
                          onClick={() => { setHeaderData(prev => ({ ...prev, quoteId: '' })); setQuoteDropdownOpen(false); }}
                        >
                          Seçimi temizle
                        </div>
                        {quotes.map(q => (
                          <div
                            key={q.id}
                            style={{ padding: '8px 12px', cursor: 'pointer', borderTop: '1px solid var(--border, #f3f4f6)' }}
                            onClick={() => { setHeaderData(prev => ({ ...prev, quoteId: q.id })); setQuoteDropdownOpen(false); }}
                          >
                            {q.label || `#${q.id}`}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Customer Name */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary, #6b7280)', marginBottom: '4px' }}>
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
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary, #6b7280)', marginBottom: '4px' }}>
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

                  {/* Delivery Address */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary, #6b7280)', marginBottom: '4px' }}>
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
                </div>
              </div>

              {/* Items Section */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ 
                    margin: 0, 
                    fontSize: '13px', 
                    fontWeight: '600', 
                    color: 'var(--text-secondary, #6b7280)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Sevkiyat Kalemleri
                  </h3>
                  <button
                    type="button"
                    onClick={addItem}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
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
                    Kalem Ekle
                  </button>
                </div>

                {/* Items Table */}
                {items.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '40px 20px',
                    backgroundColor: 'var(--muted-bg, #f9fafb)',
                    borderRadius: '8px',
                    color: 'var(--text-secondary, #6b7280)'
                  }}>
                    <Package size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
                    <p style={{ margin: 0, fontSize: '13px' }}>Henüz kalem eklenmedi</p>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', opacity: 0.7 }}>
                      Yukarıdaki "Kalem Ekle" butonuna tıklayın
                    </p>
                  </div>
                ) : (
                  <div style={{ border: '1px solid var(--border, #e5e7eb)', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'var(--muted-bg, #f9fafb)' }}>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Malzeme</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', width: '100px' }}>Miktar</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', width: '80px' }}>Mevcut</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', width: '120px' }}>Not</th>
                          <th style={{ padding: '10px 12px', width: '40px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, index) => (
                          <tr key={item.id} style={{ borderTop: '1px solid var(--border, #e5e7eb)' }}>
                            {/* Material Select */}
                            <td style={{ padding: '8px 12px', position: 'relative' }}>
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
                                style={{ width: '100%', justifyContent: 'space-between', minWidth: '200px' }}
                              >
                                <span style={{ 
                                  color: item.materialCode ? 'var(--text-primary)' : 'var(--text-muted)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {item.materialCode ? `${item.materialCode} - ${item.materialName}` : 'Malzeme seç...'}
                                </span>
                                <ChevronDown size={14} style={{ flexShrink: 0 }} />
                              </button>
                              {item.dropdownOpen && (
                                <div style={{
                                  position: 'absolute',
                                  top: '100%',
                                  left: '12px',
                                  right: '12px',
                                  backgroundColor: 'white',
                                  border: '1px solid var(--border)',
                                  borderRadius: '6px',
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                  zIndex: 100,
                                  maxHeight: '250px',
                                  overflow: 'auto',
                                  marginTop: '4px'
                                }}>
                                  {/* Search */}
                                  <div style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
                                    <div style={{ position: 'relative' }}>
                                      <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                      <input
                                        type="text"
                                        className="mes-filter-input is-compact"
                                        value={item.searchTerm}
                                        onChange={(e) => updateItem(item.id, 'searchTerm', e.target.value)}
                                        placeholder="Malzeme ara..."
                                        style={{ paddingLeft: '32px', width: '100%' }}
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
                                          borderBottom: '1px solid var(--border, #f3f4f6)',
                                          backgroundColor: item.materialCode === m.code ? 'var(--primary-light, #dbeafe)' : 'transparent'
                                        }}
                                        onClick={(e) => { e.stopPropagation(); updateItem(item.id, 'materialCode', m.code); }}
                                      >
                                        <div style={{ fontWeight: '500', fontSize: '13px' }}>{m.code}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                                          <span>{m.name}</span>
                                          <span style={{ color: 'var(--success, #16a34a)' }}>Stok: {m.availableStock} {m.unit}</span>
                                        </div>
                                      </div>
                                    ))
                                  }
                                  {materials.filter(m => 
                                    !item.searchTerm || 
                                    m.code.toLowerCase().includes(item.searchTerm.toLowerCase()) ||
                                    m.name.toLowerCase().includes(item.searchTerm.toLowerCase())
                                  ).length === 0 && (
                                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                      Malzeme bulunamadı
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                            
                            {/* Quantity */}
                            <td style={{ padding: '8px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input
                                  type="text" inputMode="decimal"
                                  className="mes-filter-input is-compact"
                                  value={item.quantity}
                                  onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                                  placeholder="0"
                                  pattern="[0-9]*\.?[0-9]*"
                                  style={{ width: '70px', textAlign: 'right' }}
                                />
                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', minWidth: '30px' }}>
                                  {item.unit}
                                </span>
                              </div>
                            </td>
                            
                            {/* Available Stock */}
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                              <span style={{ 
                                fontSize: '12px', 
                                color: item.availableStock > 0 ? 'var(--success, #16a34a)' : 'var(--text-muted)',
                                fontWeight: '500'
                              }}>
                                {item.materialCode ? item.availableStock : '-'}
                              </span>
                            </td>
                            
                            {/* Notes */}
                            <td style={{ padding: '8px 12px' }}>
                              <input
                                type="text"
                                className="mes-filter-input is-compact"
                                value={item.notes}
                                onChange={(e) => updateItem(item.id, 'notes', e.target.value)}
                                placeholder="Not..."
                                style={{ width: '100%' }}
                              />
                            </td>
                            
                            {/* Remove */}
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => removeItem(item.id)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '4px',
                                  borderRadius: '4px',
                                  color: 'var(--error, #dc2626)'
                                }}
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary, #6b7280)', marginBottom: '4px' }}>
                  Genel Not
                </label>
                <textarea
                  className="mes-filter-input"
                  value={headerData.notes}
                  onChange={(e) => setHeaderData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Sevkiyat hakkında genel not..."
                  rows={2}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderTop: '1px solid var(--border, #e5e7eb)',
          backgroundColor: 'var(--card-bg, #ffffff)'
        }}>
          {/* Summary */}
          <div style={{ display: 'flex', gap: '20px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            <span><strong>{totalItems}</strong> kalem</span>
            <span>Toplam: <strong>{totalQuantity.toLocaleString('tr-TR')}</strong></span>
          </div>
          
          {/* Buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                backgroundColor: 'var(--muted-bg, #f3f4f6)',
                color: 'var(--text-primary, #374151)',
                border: '1px solid var(--border, #d1d5db)',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              İptal
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={loading || items.length === 0}
              style={{
                padding: '10px 20px',
                backgroundColor: loading || items.length === 0 ? 'var(--muted, #9ca3af)' : 'var(--primary, #3b82f6)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '500',
                cursor: loading || items.length === 0 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Oluşturuluyor...
                </>
              ) : (
                <>
                  <Truck size={16} />
                  Sevkiyat Oluştur
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
