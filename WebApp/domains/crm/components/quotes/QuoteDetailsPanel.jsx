import React, { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, Edit, Download, Trash2, Lock, Unlock } from '../../../../shared/components/Icons.jsx'
import { PriceStatusBadge } from '../pricing/PriceStatusBadge.js'
import API, { API_BASE } from '../../../../shared/lib/api.js'
import { uid, downloadDataUrl, ACCEPT_EXT, MAX_FILES, MAX_FILE_MB, MAX_PRODUCT_FILES, extOf, readFileAsDataUrl, isImageExt } from '../../../../shared/lib/utils.js'
import { statusLabel } from '../../../../shared/i18n.js'
import { showToast } from '../../../../shared/components/MESToast.js'
import { quotesService } from '../../services/quotes-service.js'
import QuoteEditLockBanner from './QuoteEditLockBanner.jsx'

export default function QuoteDetailsPanel({ 
  quote,
  onClose, 
  onSave,
  onDelete,
  onStatusChange,
  formConfig,
  t,
  loading = false,
  onRefreshQuote,
  globalProcessing,
  setGlobalProcessing,
  checkAndProcessVersionUpdates,
  currentQuotes
}) {
  const [currStatus, setCurrStatus] = useState(quote?.status || 'new')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [techFiles, setTechFiles] = useState(quote?.files || [])
  const [prodImgs, setProdImgs] = useState(quote?.productImages || [])
  const [manualOverride, setManualOverride] = useState(quote?.manualOverride || null)
  const [manualPriceInput, setManualPriceInput] = useState('')
  const [manualNote, setManualNote] = useState(quote?.manualOverride?.note || '')
  const [manualLoading, setManualLoading] = useState(false)
  const [originalData, setOriginalData] = useState(null)
  
  // Edit lock state
  const [editStatus, setEditStatus] = useState(null)
  const [editStatusLoading, setEditStatusLoading] = useState(false)
  
  // Fetch edit status when quote changes
  useEffect(() => {
    if (quote?.id) {
      setEditStatusLoading(true)
      quotesService.getEditStatus(quote.id)
        .then(status => {
          setEditStatus(status)
        })
        .catch(err => {
          console.error('Failed to fetch edit status:', err)
          setEditStatus({ canEdit: true }) // Default to editable on error
        })
        .finally(() => {
          setEditStatusLoading(false)
        })
    }
  }, [quote?.id])

  // Initialize form data when quote changes
  useEffect(() => {
    if (quote) {
      setCurrStatus(quote.status || 'new')
      
      // Initialize form with dynamic fields based on formConfig
      const initialForm = {}
      
      // Support both old and new formConfig structures
      const fields = formConfig?.formStructure?.fields || formConfig?.fields || []
      
      // Debug log to see what data we have
      console.log('📋 QuoteDetailsPanel: Initializing form', {
        quoteId: quote.id,
        formData: quote.formData,
        customFields: quote.customFields,
        fields: fields.map(f => ({ id: f.id, fieldCode: f.fieldCode, label: f.label }))
      })
      
      if (fields && fields.length > 0) {
        fields.forEach(field => {
          // Check multiple sources for the value:
          // 1. quote.formData[field.fieldCode] - backend uses fieldCode
          // 2. quote.formData[field.id] - fallback to field.id
          // 3. quote.customFields[field.id] - legacy support
          // 4. quote[field.id] - direct property
          const fieldCode = field.fieldCode || field.id
          let value = quote.formData?.[fieldCode] || 
                      quote.formData?.[field.id] || 
                      quote.customFields?.[field.id] || 
                      quote[field.id] || 
                      ''
          
          // Handle special field types
          if (field.type === 'multiselect' && Array.isArray(value)) {
            value = value.join(', ')
          } else if (field.type === 'radio' && !value) {
            value = field.options?.[0] || ''
          }
          
          initialForm[field.id] = value
        })
      }
      
      console.log('📋 QuoteDetailsPanel: Form initialized', { initialForm })
      
      setForm(initialForm)
      setOriginalData(initialForm)
      setTechFiles(quote.files || [])
      setProdImgs(quote.productImages || [])

      const override = quote.manualOverride || null
      setManualOverride(override)
      // Use finalPrice or calculatedPrice as fallback for price
      const quotePrice = quote.finalPrice || quote.calculatedPrice || quote.price
      const initialManualPrice = override?.price ?? quotePrice
      setManualPriceInput(formatManualPriceInput(initialManualPrice))
      setManualNote(override?.note || '')
      setEditing(false)
    }
  }, [quote?.id, quote?.status, quote?.finalPrice, quote?.calculatedPrice, quote?.price, quote?.manualOverride, formConfig])

  const formatManualPriceInput = (price) => {
    if (price === null || price === undefined || price === '') return ''
    const numPrice = parseFloat(price)
    if (isNaN(numPrice)) return ''
    return numPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const handleInputChange = (e) => {
    if (!editing) return
    
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const handleUnlock = () => {
    // Check if editing is locked
    if (editStatus && !editStatus.canEdit) {
      showToast('Bu teklif düzenlenemez - iş emri üretimde', 'error')
      return
    }
    setEditing(true)
  }
  
  // Computed: is editing disabled due to WO lock?
  const isEditLocked = editStatus && !editStatus.canEdit

  const handleCancel = () => {
    setEditing(false)
    setForm(originalData || {})
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!editing) return

    try {
      // Separate form fields into customer fields and dynamic form fields
      const customerFields = ['customerName', 'customerEmail', 'customerPhone', 'customerCompany', 'customerAddress', 'deliveryDate', 'notes']
      
      // Get form field definitions to map field.id -> field.fieldCode
      const fields = formConfig?.formStructure?.fields || formConfig?.fields || []
      const fieldIdToCode = {}
      fields.forEach(field => {
        fieldIdToCode[field.id] = field.fieldCode || field.id
      })
      
      // Build formData object from dynamic fields (excluding customer fields)
      // Convert field.id keys to field.fieldCode for backend compatibility
      const formData = {}
      Object.entries(form).forEach(([key, value]) => {
        if (!customerFields.includes(key)) {
          // Map field.id to field.fieldCode if mapping exists
          const fieldCode = fieldIdToCode[key] || key
          formData[fieldCode] = value
        }
      })

      // Prepare quote data for update with formData
      const quoteData = {
        // Customer fields
        customerName: form.customerName || quote.customerName,
        customerEmail: form.customerEmail || quote.customerEmail,
        customerPhone: form.customerPhone || quote.customerPhone,
        customerCompany: form.customerCompany || quote.customerCompany,
        customerAddress: form.customerAddress || quote.customerAddress,
        deliveryDate: form.deliveryDate || quote.deliveryDate,
        notes: form.notes || quote.notes,
        // Dynamic form fields
        formData: formData,
        // Status
        status: currStatus
      }

      console.log('💾 QuoteDetailsPanel: Saving quote with formData:', { quoteId: quote.id, formData, quoteData })

      // Save the quote
      await onSave(quote.id, quoteData)
      
      setEditing(false)
      setOriginalData(form)
      
      showToast('Teklif güncellendi!', 'success')
      
      if (onRefreshQuote) {
        onRefreshQuote()
      }
    } catch (error) {
      console.error('Quote update error:', error)
      showToast('Teklif güncellenirken hata oluştu', 'error')
    }
  }

  const handleClose = () => {
    setForm({})
    setOriginalData(null)
    setEditing(false)
    onClose()
  }

  const handleStatusChange = async (newStatus) => {
    try {
      await onStatusChange(quote.id, newStatus)
      setCurrStatus(newStatus)
      showToast('Durum güncellendi!', 'success')
    } catch (error) {
      console.error('Status update error:', error)
      showToast('Durum güncellenirken hata oluştu', 'error')
    }
  }

  const handleDelete = () => {
    if (confirm(`${quote.id} numaralı teklifi silmek istediğinizden emin misiniz?`)) {
      onDelete(quote.id)
      handleClose()
    }
  }

  const handleManualPriceToggle = async () => {
    if (!quote) return
    
    const isCurrentlyLocked = manualOverride?.active === true
    
    if (isCurrentlyLocked) {
      // Unlock - remove manual override
      if (!confirm('Manuel fiyatı kaldırıp otomatik fiyatlandırmaya dönmek istiyor musunuz?')) {
        return
      }
      
      try {
        setManualLoading(true)
        const response = await API.clearManualPrice(quote.id)
        
        if (response.success) {
          setManualOverride(null)
          const quotePrice = quote.finalPrice || quote.calculatedPrice || quote.price
          setManualPriceInput(formatManualPriceInput(quotePrice))
          setManualNote('')
          showToast('Manuel fiyat kaldırıldı', 'success')
          
          if (onRefreshQuote) {
            onRefreshQuote()
          }
        }
      } catch (error) {
        console.error('Clear manual price error:', error)
        showToast('Manuel fiyat kaldırılırken hata oluştu', 'error')
      } finally {
        setManualLoading(false)
      }
    } else {
      // Lock - set manual override
      const parsedPrice = parseFloat(manualPriceInput.replace(/\./g, '').replace(',', '.'))
      
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        showToast('Geçerli bir fiyat girin', 'error')
        return
      }
      
      try {
        setManualLoading(true)
        const response = await API.setManualPrice(quote.id, {
          price: parsedPrice,
          note: manualNote || 'Manuel fiyat belirlendi'
        })
        
        if (response.success) {
          setManualOverride(response.manualOverride)
          showToast('Manuel fiyat ayarlandı', 'success')
          
          if (onRefreshQuote) {
            onRefreshQuote()
          }
        }
      } catch (error) {
        console.error('Set manual price error:', error)
        showToast('Manuel fiyat ayarlanırken hata oluştu', 'error')
      } finally {
        setManualLoading(false)
      }
    }
  }

  const handleFileUpload = async (e, type = 'tech') => {
    const files = Array.from(e.target.files)
    
    if (files.length === 0) return
    
    try {
      const uploadPromises = files.map(async (file) => {
        const dataUrl = await readFileAsDataUrl(file)
        return {
          id: uid(),
          name: file.name,
          url: dataUrl,
          type: file.type,
          size: file.size,
          uploadedAt: new Date().toISOString()
        }
      })
      
      const uploadedFiles = await Promise.all(uploadPromises)
      
      if (type === 'tech') {
        setTechFiles(prev => [...prev, ...uploadedFiles])
      } else {
        setProdImgs(prev => [...prev, ...uploadedFiles])
      }
      
      showToast(`${files.length} dosya yüklendi`, 'success')
    } catch (error) {
      console.error('File upload error:', error)
      showToast('Dosya yüklenirken hata oluştu', 'error')
    }
  }

  const handleFileDelete = (fileId, type = 'tech') => {
    if (type === 'tech') {
      setTechFiles(prev => prev.filter(f => f.id !== fileId))
    } else {
      setProdImgs(prev => prev.filter(f => f.id !== fileId))
    }
  }

  if (!quote) return null

  const formFields = formConfig?.formStructure?.fields || formConfig?.fields || []
  
  const formatPriceDisplay = (price) => {
    if (price === null || price === undefined || price === '') return '—'
    const numPrice = parseFloat(price)
    if (isNaN(numPrice)) return '—'
    return numPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺'
  }

  const isLocked = manualOverride?.active === true
  
  // Handle navigation to work order
  const handleViewWorkOrder = (woCode) => {
    // Navigate to production page with work order filter
    if (woCode) {
      window.location.href = `/pages/production.html?tab=approved&wo=${woCode}`
    }
  }
  
  // Handle navigation to customer details
  const handleViewCustomer = () => {
    if (quote?.customerId) {
      // Navigate to customers tab with customer selected
      window.location.href = `/pages/quote-dashboard.html?tab=customers&id=${quote.customerId}`
    }
  }

  return (
    <div className="quote-detail-panel">
      {/* Edit Lock Banner - Show when WO exists */}
      <QuoteEditLockBanner 
        editStatus={editStatus} 
        onViewWorkOrder={handleViewWorkOrder}
      />
      
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
              onClick={handleClose}
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
              <ArrowLeft size={14} />
            </button>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#111827' }}>
              Teklif Detayları {isLocked && <span style={{ color: '#f59e0b', fontSize: '14px' }}>(Kilitli)</span>}
              {isEditLocked && <span style={{ color: '#dc2626', fontSize: '14px', marginLeft: '8px' }}>(Düzenleme Kilitli)</span>}
            </h3>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {!editing ? (
              <button
                onClick={handleUnlock}
                disabled={isEditLocked}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  background: isEditLocked ? '#f3f4f6' : 'white',
                  color: isEditLocked ? '#9ca3af' : '#374151',
                  cursor: isEditLocked ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  opacity: isEditLocked ? 0.6 : 1
                }}
                title={isEditLocked ? 'İş emri üretimde - düzenleme kilitli' : 'Düzenle'}
              >
                <Edit size={14} /> Düzenle
              </button>
            ) : (
              <>
                <button
                  type="submit"
                  form="quote-detail-form"
                  style={{
                    padding: '6px 12px',
                    border: 'none',
                    borderRadius: '4px',
                    background: '#3b82f6',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Download size={14} /> Kaydet
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
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <ArrowLeft size={14} /> İptal
                </button>
              </>
            )}
            {onDelete && (
              <button
                onClick={handleDelete}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #dc2626',
                  borderRadius: '4px',
                  background: 'white',
                  color: '#dc2626',
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Trash2 size={14} /> Sil
              </button>
            )}
          </div>
        </div>

        {/* Content - Scrollable */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          <form id="quote-detail-form" onSubmit={handleSubmit}>
            {/* Temel Bilgiler */}
            <div style={{ 
              marginBottom: '16px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ 
                margin: '0 0 12px 0', 
                fontSize: '14px', 
                fontWeight: '600', 
                color: '#111827', 
                borderBottom: '1px solid #e5e7eb', 
                paddingBottom: '6px' 
              }}>
                Temel Bilgiler
              </h3>
              
              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ 
                  fontWeight: '600', 
                  fontSize: '12px', 
                  color: '#374151', 
                  minWidth: '120px', 
                  marginRight: '8px' 
                }}>
                  Teklif ID:
                </span>
                <span style={{ fontSize: '12px', color: '#111827' }}>
                  {quote.id}
                </span>
              </div>

              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ 
                  fontWeight: '600', 
                  fontSize: '12px', 
                  color: '#374151', 
                  minWidth: '120px', 
                  marginRight: '8px' 
                }}>
                  Tarih:
                </span>
                <span style={{ fontSize: '12px', color: '#111827' }}>
                  {(quote.createdAt || '').replace('T', ' ').slice(0, 16)}
                </span>
              </div>

              {/* Durum */}
              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ 
                  fontWeight: '600', 
                  fontSize: '12px', 
                  color: '#374151', 
                  minWidth: '120px', 
                  marginRight: '8px' 
                }}>
                  Durum:
                </span>
                {editing ? (
                  <select
                    value={currStatus}
                    onChange={(e) => setCurrStatus(e.target.value)}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #3b82f6',
                      borderRadius: '4px',
                      background: 'white',
                      fontSize: '14px'
                    }}
                  >
                    <option value="new">Yeni</option>
                    <option value="pending">Beklemede</option>
                    <option value="approved">Onaylandı</option>
                    <option value="rejected">Reddedildi</option>
                  </select>
                ) : (
                  <span style={{ fontSize: '12px', color: '#111827' }}>
                    {statusLabel[currStatus] || currStatus}
                  </span>
                )}
              </div>

              {/* Dynamic Form Fields */}
              {formFields.map(field => {
                let value = form[field.id] || ''
                const label = field.label || field.id

                return (
                  <div key={field.id} className="detail-item" style={{ 
                    display: 'flex', 
                    alignItems: field.type === 'textarea' ? 'flex-start' : 'center', 
                    marginBottom: '8px' 
                  }}>
                    <span className="detail-label" style={{ 
                      fontWeight: '600', 
                      fontSize: '12px', 
                      color: '#374151', 
                      minWidth: '120px', 
                      marginRight: '8px' 
                    }}>
                      {label}:
                    </span>
                    {editing ? (
                      field.type === 'textarea' ? (
                        <textarea
                          name={field.id}
                          value={value}
                          onChange={handleInputChange}
                          style={{
                            padding: '8px 12px',
                            border: '1px solid #3b82f6',
                            borderRadius: '4px',
                            background: 'white',
                            width: '100%',
                            fontSize: '14px',
                            minHeight: '80px',
                            resize: 'vertical'
                          }}
                        />
                      ) : field.type === 'radio' && field.options ? (
                        <div style={{ display: 'flex', gap: '12px' }}>
                          {field.options.map(option => (
                            <label key={option} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <input
                                type="radio"
                                name={field.id}
                                value={option}
                                checked={value === option}
                                onChange={handleInputChange}
                              />
                              <span style={{ fontSize: '12px' }}>{option}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <input
                          type={field.type === 'number' ? 'number' : 'text'}
                          name={field.id}
                          value={value}
                          onChange={handleInputChange}
                          style={{
                            padding: '8px 12px',
                            border: '1px solid #3b82f6',
                            borderRadius: '4px',
                            background: 'white',
                            width: '100%',
                            fontSize: '14px'
                          }}
                        />
                      )
                    ) : (
                      <span style={{ fontSize: '12px', color: '#111827' }}>
                        {value || '—'}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Müşteri Bilgileri */}
            <div style={{ 
              marginBottom: '16px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                margin: '0 0 12px 0', 
                borderBottom: '1px solid #e5e7eb', 
                paddingBottom: '6px' 
              }}>
                <h3 style={{ 
                  margin: 0, 
                  fontSize: '14px', 
                  fontWeight: '600', 
                  color: '#111827'
                }}>
                  Müşteri Bilgileri
                  {quote.customerId && (
                    <span style={{ 
                      fontSize: '11px', 
                      fontWeight: 'normal', 
                      color: '#6b7280', 
                      marginLeft: '8px' 
                    }}>
                      (Kayıtlı Müşteri)
                    </span>
                  )}
                </h3>
                {quote.customerId && (
                  <button
                    type="button"
                    onClick={handleViewCustomer}
                    style={{
                      padding: '4px 8px',
                      border: '1px solid #3b82f6',
                      borderRadius: '4px',
                      background: 'white',
                      color: '#3b82f6',
                      cursor: 'pointer',
                      fontSize: '11px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    Müşteri Detayı →
                  </button>
                )}
              </div>

              {/* Temel Müşteri Bilgileri */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px' }}>
                    Ad Soyad:
                  </span>
                  <span style={{ fontSize: '12px', color: '#111827' }}>
                    {quote.customerName || '—'}
                  </span>
                </div>
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px' }}>
                    Şirket:
                  </span>
                  <span style={{ fontSize: '12px', color: '#111827' }}>
                    {quote.customerCompany || '—'}
                  </span>
                </div>
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px' }}>
                    E-posta:
                  </span>
                  <span style={{ fontSize: '12px', color: '#111827' }}>
                    {quote.customerEmail || '—'}
                  </span>
                </div>
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px' }}>
                    Telefon:
                  </span>
                  <span style={{ fontSize: '12px', color: '#111827' }}>
                    {quote.customerPhone || '—'}
                  </span>
                </div>
              </div>

              {/* Adres */}
              {quote.customerAddress && (
                <div className="detail-item" style={{ display: 'flex', alignItems: 'flex-start', marginTop: '8px' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px' }}>
                    Adres:
                  </span>
                  <span style={{ fontSize: '12px', color: '#111827' }}>
                    {quote.customerAddress}
                  </span>
                </div>
              )}

              {/* Ek Müşteri Bilgileri (Kayıtlı müşteri varsa) */}
              {quote.customer && (
                <>
                  {/* İletişim Bilgileri */}
                  {(quote.customer.contactPerson || quote.customer.contactTitle || quote.customer.website || quote.customer.fax) && (
                    <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px dashed #e5e7eb' }}>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '6px' }}>İletişim</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        {quote.customer.contactPerson && (
                          <div style={{ fontSize: '12px' }}>
                            <span style={{ color: '#6b7280' }}>Yetkili: </span>
                            <span style={{ color: '#111827' }}>{quote.customer.contactPerson}</span>
                            {quote.customer.contactTitle && <span style={{ color: '#9ca3af' }}> ({quote.customer.contactTitle})</span>}
                          </div>
                        )}
                        {quote.customer.website && (
                          <div style={{ fontSize: '12px' }}>
                            <span style={{ color: '#6b7280' }}>Web: </span>
                            <a href={quote.customer.website} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>
                              {quote.customer.website}
                            </a>
                          </div>
                        )}
                        {quote.customer.fax && (
                          <div style={{ fontSize: '12px' }}>
                            <span style={{ color: '#6b7280' }}>Fax: </span>
                            <span style={{ color: '#111827' }}>{quote.customer.fax}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Finans Bilgileri */}
                  {(quote.customer.iban || quote.customer.bankName || quote.customer.taxOffice || quote.customer.taxNumber) && (
                    <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px dashed #e5e7eb' }}>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '6px' }}>Finans</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        {quote.customer.taxOffice && (
                          <div style={{ fontSize: '12px' }}>
                            <span style={{ color: '#6b7280' }}>Vergi Dairesi: </span>
                            <span style={{ color: '#111827' }}>{quote.customer.taxOffice}</span>
                          </div>
                        )}
                        {quote.customer.taxNumber && (
                          <div style={{ fontSize: '12px' }}>
                            <span style={{ color: '#6b7280' }}>Vergi No: </span>
                            <span style={{ color: '#111827' }}>{quote.customer.taxNumber}</span>
                          </div>
                        )}
                        {quote.customer.bankName && (
                          <div style={{ fontSize: '12px' }}>
                            <span style={{ color: '#6b7280' }}>Banka: </span>
                            <span style={{ color: '#111827' }}>{quote.customer.bankName}</span>
                          </div>
                        )}
                        {quote.customer.iban && (
                          <div style={{ fontSize: '12px', gridColumn: 'span 2' }}>
                            <span style={{ color: '#6b7280' }}>IBAN: </span>
                            <span style={{ color: '#111827', fontFamily: 'monospace' }}>{quote.customer.iban}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Adres Bilgileri */}
                  {(quote.customer.city || quote.customer.country || quote.customer.postalCode) && (
                    <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px dashed #e5e7eb' }}>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '6px' }}>Konum</div>
                      <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
                        {quote.customer.city && (
                          <div>
                            <span style={{ color: '#6b7280' }}>Şehir: </span>
                            <span style={{ color: '#111827' }}>{quote.customer.city}</span>
                          </div>
                        )}
                        {quote.customer.country && (
                          <div>
                            <span style={{ color: '#6b7280' }}>Ülke: </span>
                            <span style={{ color: '#111827' }}>{quote.customer.country}</span>
                          </div>
                        )}
                        {quote.customer.postalCode && (
                          <div>
                            <span style={{ color: '#6b7280' }}>Posta Kodu: </span>
                            <span style={{ color: '#111827' }}>{quote.customer.postalCode}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Fiyat Bilgileri */}
            <div style={{ 
              marginBottom: '16px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ 
                margin: '0 0 12px 0', 
                fontSize: '14px', 
                fontWeight: '600', 
                color: '#111827', 
                borderBottom: '1px solid #e5e7eb', 
                paddingBottom: '6px' 
              }}>
                Fiyat Bilgileri
              </h3>

              <div className="detail-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span className="detail-label" style={{ 
                  fontWeight: '600', 
                  fontSize: '12px', 
                  color: '#374151', 
                  minWidth: '120px', 
                  marginRight: '8px' 
                }}>
                  Fiyat:
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                    {formatPriceDisplay(quote.finalPrice || quote.calculatedPrice || quote.price)}
                  </span>
                  {quote.priceStatus && (
                    <PriceStatusBadge priceStatus={quote.priceStatus} />
                  )}
                </div>
              </div>

              {/* Manuel Fiyat Kontrolü */}
              <div style={{ 
                marginTop: '12px', 
                padding: '12px', 
                background: isLocked ? '#fef3c7' : '#f3f4f6', 
                borderRadius: '4px',
                border: `1px solid ${isLocked ? '#fbbf24' : '#d1d5db'}`
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                    {isLocked ? '🔒 Manuel Fiyat Aktif' : '🔓 Otomatik Fiyatlandırma'}
                  </span>
                  <button
                    type="button"
                    onClick={handleManualPriceToggle}
                    disabled={manualLoading}
                    style={{
                      padding: '4px 8px',
                      border: 'none',
                      borderRadius: '4px',
                      background: isLocked ? '#dc2626' : '#3b82f6',
                      color: 'white',
                      cursor: manualLoading ? 'not-allowed' : 'pointer',
                      fontSize: '11px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {isLocked ? <Unlock size={12} /> : <Lock size={12} />}
                    {manualLoading ? 'İşleniyor...' : (isLocked ? 'Kilidi Kaldır' : 'Manuel Fiyat Belirle')}
                  </button>
                </div>

                {!isLocked && (
                  <>
                    <input
                      type="text"
                      value={manualPriceInput}
                      onChange={(e) => setManualPriceInput(e.target.value)}
                      placeholder="Manuel fiyat girin"
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '12px',
                        marginBottom: '8px'
                      }}
                    />
                    <textarea
                      value={manualNote}
                      onChange={(e) => setManualNote(e.target.value)}
                      placeholder="Not (opsiyonel)"
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '12px',
                        minHeight: '60px',
                        resize: 'vertical'
                      }}
                    />
                  </>
                )}

                {isLocked && manualOverride && (
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                    <div>Not: {manualOverride.note || 'Yok'}</div>
                    <div>Tarih: {new Date(manualOverride.timestamp).toLocaleString('tr-TR')}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Dosyalar */}
            <div style={{ 
              marginBottom: '16px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ 
                margin: '0 0 12px 0', 
                fontSize: '14px', 
                fontWeight: '600', 
                color: '#111827', 
                borderBottom: '1px solid #e5e7eb', 
                paddingBottom: '6px' 
              }}>
                Teknik Dosyalar
              </h3>

              {editing && (
                <div style={{ marginBottom: '12px' }}>
                  <input
                    type="file"
                    multiple
                    accept={ACCEPT_EXT}
                    onChange={(e) => handleFileUpload(e, 'tech')}
                    style={{ fontSize: '12px' }}
                  />
                </div>
              )}

              {techFiles.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {techFiles.map(file => (
                    <div key={file.id} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      padding: '8px',
                      background: '#f9fafb',
                      borderRadius: '4px',
                      border: '1px solid #e5e7eb'
                    }}>
                      <span style={{ fontSize: '12px' }}>{file.name}</span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => downloadDataUrl(file.url, file.name)}
                          style={{
                            padding: '4px 8px',
                            border: 'none',
                            borderRadius: '4px',
                            background: '#3b82f6',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '11px'
                          }}
                        >
                          İndir
                        </button>
                        {editing && (
                          <button
                            type="button"
                            onClick={() => handleFileDelete(file.id, 'tech')}
                            style={{
                              padding: '4px 8px',
                              border: 'none',
                              borderRadius: '4px',
                              background: '#dc2626',
                              color: 'white',
                              cursor: 'pointer',
                              fontSize: '11px'
                            }}
                          >
                            Sil
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>Dosya yok</p>
              )}
            </div>

            {/* Ürün Görselleri */}
            <div style={{ 
              marginBottom: '16px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ 
                margin: '0 0 12px 0', 
                fontSize: '14px', 
                fontWeight: '600', 
                color: '#111827', 
                borderBottom: '1px solid #e5e7eb', 
                paddingBottom: '6px' 
              }}>
                Ürün Görselleri
              </h3>

              {editing && (
                <div style={{ marginBottom: '12px' }}>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e, 'product')}
                    style={{ fontSize: '12px' }}
                  />
                </div>
              )}

              {prodImgs.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px' }}>
                  {prodImgs.map(img => (
                    <div key={img.id} style={{ position: 'relative' }}>
                      <img 
                        src={img.url} 
                        alt={img.name}
                        style={{ 
                          width: '100%', 
                          height: '100px', 
                          objectFit: 'cover', 
                          borderRadius: '4px',
                          border: '1px solid #e5e7eb'
                        }}
                      />
                      {editing && (
                        <button
                          type="button"
                          onClick={() => handleFileDelete(img.id, 'product')}
                          style={{
                            position: 'absolute',
                            top: '4px',
                            right: '4px',
                            padding: '4px',
                            border: 'none',
                            borderRadius: '4px',
                            background: '#dc2626',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '10px'
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>Görsel yok</p>
              )}
            </div>
          </form>
        </div>
    </div>
  )
}
