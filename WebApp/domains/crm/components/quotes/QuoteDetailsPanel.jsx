import React, { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, Edit, Download, Trash2, Lock, Unlock, AlertTriangle, RefreshCw, Wallet } from '../../../../shared/components/Icons.jsx'
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
  // PROMPT-16: Dosyalar backend'den technicalFiles/productImages olarak ayrılmış geliyor
  const [techFiles, setTechFiles] = useState(quote?.technicalFiles || quote?.files || [])
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
      
      // Add customer fields to initialForm
      initialForm.customerName = quote.customerName || ''
      initialForm.customerEmail = quote.customerEmail || ''
      initialForm.customerPhone = quote.customerPhone || ''
      initialForm.customerCompany = quote.customerCompany || ''
      initialForm.customerAddress = quote.customerAddress || ''
      initialForm.deliveryDate = quote.deliveryDate ? quote.deliveryDate.split('T')[0] : ''
      initialForm.notes = quote.notes || ''
      
      console.log('📋 QuoteDetailsPanel: Form initialized', { initialForm })
      
      setForm(initialForm)
      setOriginalData(initialForm)

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

  // Dosya state'lerini SADECE quote.id değiştiğinde güncelle
  // Bu sayede dosya yükleme sonrası local state korunur
  const prevQuoteIdRef = React.useRef(null)
  React.useEffect(() => {
    if (quote?.id && quote.id !== prevQuoteIdRef.current) {
      console.log('📁 QuoteDetailsPanel: Setting files (quote changed)', {
        technicalFiles: quote.technicalFiles,
        files: quote.files,
        productImages: quote.productImages
      })
      setTechFiles(quote.technicalFiles || quote.files || [])
      setProdImgs(quote.productImages || [])
      prevQuoteIdRef.current = quote.id
    }
  }, [quote?.id, quote?.technicalFiles, quote?.productImages, quote?.files])

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
      for (const file of files) {
        const dataUrl = await readFileAsDataUrl(file)
        
        // Backend API'ye kaydet
        const fileData = {
          fileType: type === 'tech' ? 'technical' : 'product',
          fileName: file.name,
          filePath: dataUrl, // data URL olarak kaydet
          mimeType: file.type,
          fileSize: file.size,
          description: null
        }
        
        console.log('📁 Uploading file to backend:', { quoteId: quote.id, fileName: file.name, type })
        
        const response = await API.addQuoteFile(quote.id, fileData)
        
        console.log('📁 API Response:', response)
        
        if (response.success && response.file) {
          // Backend'den dönen dosyayı state'e ekle
          const newFile = response.file
          console.log('📁 Adding file to state:', newFile, 'type:', type)
          
          if (type === 'tech') {
            setTechFiles(prev => {
              console.log('📁 techFiles before:', prev.length, 'after:', prev.length + 1)
              return [...prev, newFile]
            })
          } else {
            setProdImgs(prev => {
              console.log('📁 prodImgs before:', prev.length, 'after:', prev.length + 1)
              return [...prev, newFile]
            })
          }
          console.log('✅ File saved to backend:', response.file)
        } else {
          throw new Error('File save failed')
        }
      }
      
      showToast(`${files.length} dosya yüklendi`, 'success')
    } catch (error) {
      console.error('File upload error:', error)
      showToast('Dosya yüklenirken hata oluştu', 'error')
    }
  }

  const handleFileDelete = async (fileId, type = 'tech') => {
    try {
      console.log('🗑️ Deleting file from backend:', { quoteId: quote.id, fileId, type })
      
      // Backend API'den sil
      const response = await API.deleteQuoteFile(quote.id, fileId)
      
      if (response.success) {
        // State'den kaldır
        if (type === 'tech') {
          setTechFiles(prev => prev.filter(f => f.id !== fileId))
        } else {
          setProdImgs(prev => prev.filter(f => f.id !== fileId))
        }
        showToast('Dosya silindi', 'success')
        console.log('✅ File deleted from backend')
      } else {
        throw new Error('File delete failed')
      }
    } catch (error) {
      console.error('File delete error:', error)
      showToast('Dosya silinirken hata oluştu', 'error')
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
  
  // PROMPT-13: Check if deliveryDate is missing for approve validation warning
  const missingDeliveryDate = !quote?.deliveryDate
  
  // PROMPT-14: Get price warning info for banner display
  const getPriceWarningInfo = () => {
    if (!quote || !quote.priceStatus) {
      return { type: 'none', color: null, priority: 0 }
    }

    const status = quote.priceStatus.status
    const diffSummary = quote.priceStatus.differenceSummary
    const priceDiff = Math.abs(diffSummary?.priceDiff || 0)
    
    // Eğer uyarı gizlenmişse warning yok
    if (quote.versionWarningHidden === true) {
      return { type: 'none', color: null, priority: 0 }
    }

    // Kırmızı uyarı: Fiyat farkı var
    if (priceDiff > 0 || status === 'price-drift') {
      return { 
        type: 'price', 
        color: '#dc3545',
        bgColor: 'rgba(220, 53, 69, 0.1)',
        borderColor: '#fecaca',
        icon: Wallet,
        message: `Fiyat güncel değil! Fark: ₺${priceDiff.toFixed(2)}`,
        priority: 2 
      }
    }

    // Sarı uyarı: Sadece versiyon/parametre farkı var, fiyat aynı
    if (status === 'content-drift' || status === 'outdated') {
      const hasParameterChanges = diffSummary?.parameterChanges && 
        (diffSummary.parameterChanges.added?.length > 0 ||
         diffSummary.parameterChanges.removed?.length > 0 ||
         diffSummary.parameterChanges.modified?.length > 0)
      const hasFormulaChange = diffSummary?.formulaChanged === true
      
      if (hasParameterChanges || hasFormulaChange) {
        return { 
          type: 'version', 
          color: '#ffc107',
          bgColor: 'rgba(255, 193, 7, 0.1)',
          borderColor: '#fde68a',
          icon: RefreshCw,
          message: 'Formül veya parametreler güncellendi. Fiyat kontrolü önerilir.',
          priority: 1 
        }
      }
    }

    return { type: 'none', color: null, priority: 0 }
  }
  
  const priceWarningInfo = getPriceWarningInfo()
  
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
      {/* PROMPT-13: Missing Delivery Date Warning Banner */}
      {missingDeliveryDate && quote?.status !== 'approved' && (
        <div style={{
          padding: '12px 16px',
          background: '#fef2f2',
          borderBottom: '1px solid #fecaca',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertTriangle size={16} style={{ color: '#dc2626' }} />
          <span style={{ fontSize: '13px', color: '#dc2626', fontWeight: '500' }}>
            Teslimat tarihi belirtilmemiş. Teklifi onaylamak için teslimat tarihi gereklidir.
          </span>
        </div>
      )}
      
      {/* PROMPT-14: Price Warning Banner */}
      {priceWarningInfo.priority > 0 && (
        <div style={{
          padding: '12px 16px',
          background: priceWarningInfo.bgColor,
          borderBottom: `1px solid ${priceWarningInfo.borderColor}`,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          {priceWarningInfo.icon && <priceWarningInfo.icon size={16} style={{ color: priceWarningInfo.color }} />}
          <span style={{ fontSize: '13px', color: priceWarningInfo.color, fontWeight: '500' }}>
            {priceWarningInfo.message}
          </span>
        </div>
      )}
      
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
                  {quote.createdAt ? new Date(quote.createdAt).toLocaleString('tr-TR', { 
                    year: 'numeric', 
                    month: '2-digit', 
                    day: '2-digit', 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  }) : ''}
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
                <div className="detail-item" style={{ display: 'flex', alignItems: 'center' }}>
                  <span className="detail-label" style={{ fontWeight: '600', fontSize: '12px', color: '#374151', minWidth: '100px' }}>
                    Teslimat Tarihi:
                  </span>
                  {editing ? (
                    <input
                      type="date"
                      name="deliveryDate"
                      value={form.deliveryDate || ''}
                      onChange={handleInputChange}
                      min={new Date().toISOString().split('T')[0]}
                      style={{
                        padding: '6px 10px',
                        border: '1px solid #3b82f6',
                        borderRadius: '4px',
                        fontSize: '12px',
                        background: 'white'
                      }}
                    />
                  ) : (
                    <span style={{ 
                      fontSize: '12px', 
                      color: form.deliveryDate || quote.deliveryDate ? '#111827' : '#ef4444',
                      fontWeight: form.deliveryDate || quote.deliveryDate ? 'normal' : '500'
                    }}>
                      {form.deliveryDate || (quote.deliveryDate ? quote.deliveryDate.split('T')[0] : 'Belirtilmedi')}
                    </span>
                  )}
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
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {isLocked ? <Lock size={12} style={{ color: '#f59e0b' }} /> : <Unlock size={12} style={{ color: '#6b7280' }} />}
                    {isLocked ? 'Manuel Fiyat Aktif' : 'Otomatik Fiyatlandırma'}
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

            {/* Dosyalar - PROMPT-16: Geliştirilmiş dosya görüntüleme */}
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
                  Teknik Dosyalar
                  {techFiles.length > 0 && (
                    <span style={{ 
                      marginLeft: '8px', 
                      fontSize: '11px', 
                      fontWeight: 'normal', 
                      color: '#6b7280',
                      background: '#f3f4f6',
                      padding: '2px 6px',
                      borderRadius: '10px'
                    }}>
                      {techFiles.length}
                    </span>
                  )}
                </h3>
              </div>

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
                  {console.log('🔍 Rendering techFiles:', techFiles.length, techFiles)}
                  {techFiles.map(file => {
                    const fileName = file.fileName || file.name || 'Dosya'
                    const fileUrl = file.filePath || file.url
                    const fileSize = file.fileSize || file.size
                    const uploadDate = file.createdAt || file.uploadedAt
                    const isImage = file.mimeType?.startsWith('image/') || isImageExt(fileName)
                    
                    // Format file size
                    const formatSize = (bytes) => {
                      if (!bytes) return ''
                      if (bytes < 1024) return bytes + ' B'
                      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
                      return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
                    }
                    
                    // Get file icon based on extension
                    const getFileIcon = (name) => {
                      const ext = name?.split('.').pop()?.toLowerCase()
                      if (['pdf'].includes(ext)) return '📄'
                      if (['dxf', 'dwg', 'step', 'stp', 'iges', 'igs'].includes(ext)) return '📐'
                      if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return '🖼️'
                      return '📎'
                    }
                    
                    return (
                      <div key={file.id} style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        background: '#f9fafb',
                        borderRadius: '6px',
                        border: '1px solid #e5e7eb'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: '18px' }}>{getFileIcon(fileName)}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ 
                              fontSize: '12px', 
                              fontWeight: '500', 
                              color: '#111827',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}>
                              {fileName}
                            </div>
                            <div style={{ fontSize: '10px', color: '#6b7280', display: 'flex', gap: '8px', marginTop: '2px' }}>
                              {fileSize && <span>{formatSize(fileSize)}</span>}
                              {uploadDate && <span>{new Date(uploadDate).toLocaleDateString('tr-TR')}</span>}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              if (fileUrl?.startsWith('data:')) {
                                downloadDataUrl(fileUrl, fileName)
                              } else if (fileUrl) {
                                window.open(`${API_BASE}${fileUrl}`, '_blank')
                              }
                            }}
                            style={{
                              padding: '5px 10px',
                              border: 'none',
                              borderRadius: '4px',
                              background: '#3b82f6',
                              color: 'white',
                              cursor: 'pointer',
                              fontSize: '11px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Download size={12} /> İndir
                          </button>
                          {editing && (
                            <button
                              type="button"
                              onClick={() => handleFileDelete(file.id, 'tech')}
                              style={{
                                padding: '5px 10px',
                                border: 'none',
                                borderRadius: '4px',
                                background: '#dc2626',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '11px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <Trash2 size={12} /> Sil
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{ 
                  padding: '20px', 
                  textAlign: 'center', 
                  background: '#f9fafb', 
                  borderRadius: '6px',
                  border: '1px dashed #d1d5db'
                }}>
                  <span style={{ fontSize: '24px', display: 'block', marginBottom: '8px' }}>📁</span>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>Teknik dosya yüklenmemiş</p>
                  {editing && (
                    <p style={{ fontSize: '11px', color: '#9ca3af', margin: '4px 0 0 0' }}>
                      PDF, DXF, DWG, STEP dosyaları yükleyebilirsiniz
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Ürün Görselleri - PROMPT-16: Geliştirilmiş görsel görüntüleme */}
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
                  Ürün Görselleri
                  {prodImgs.length > 0 && (
                    <span style={{ 
                      marginLeft: '8px', 
                      fontSize: '11px', 
                      fontWeight: 'normal', 
                      color: '#6b7280',
                      background: '#f3f4f6',
                      padding: '2px 6px',
                      borderRadius: '10px'
                    }}>
                      {prodImgs.length}
                    </span>
                  )}
                </h3>
              </div>

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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px' }}>
                  {prodImgs.map(img => {
                    const imgName = img.fileName || img.name || 'Görsel'
                    const imgUrl = img.filePath || img.url
                    const imgSrc = imgUrl?.startsWith('data:') ? imgUrl : `${API_BASE}${imgUrl}`
                    
                    return (
                      <div key={img.id} style={{ 
                        position: 'relative',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        border: '1px solid #e5e7eb',
                        background: '#f9fafb'
                      }}>
                        <img 
                          src={imgSrc} 
                          alt={imgName}
                          style={{ 
                            width: '100%', 
                            height: '100px', 
                            objectFit: 'cover',
                            cursor: 'pointer'
                          }}
                          onClick={() => window.open(imgSrc, '_blank')}
                          title="Tam boyut görmek için tıklayın"
                        />
                        <div style={{
                          padding: '6px 8px',
                          background: 'white',
                          borderTop: '1px solid #e5e7eb',
                          fontSize: '10px',
                          color: '#6b7280',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {imgName}
                        </div>
                        {editing && (
                          <button
                            type="button"
                            onClick={() => handleFileDelete(img.id, 'product')}
                            style={{
                              position: 'absolute',
                              top: '6px',
                              right: '6px',
                              padding: '4px 6px',
                              border: 'none',
                              borderRadius: '4px',
                              background: 'rgba(220, 38, 38, 0.9)',
                              color: 'white',
                              cursor: 'pointer',
                              fontSize: '10px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '2px'
                            }}
                          >
                            <Trash2 size={10} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{ 
                  padding: '20px', 
                  textAlign: 'center', 
                  background: '#f9fafb', 
                  borderRadius: '6px',
                  border: '1px dashed #d1d5db'
                }}>
                  <span style={{ fontSize: '24px', display: 'block', marginBottom: '8px' }}>🖼️</span>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>Ürün görseli yüklenmemiş</p>
                  {editing && (
                    <p style={{ fontSize: '11px', color: '#9ca3af', margin: '4px 0 0 0' }}>
                      PNG, JPG formatında görseller yükleyebilirsiniz
                    </p>
                  )}
                </div>
              )}
            </div>
          </form>
        </div>
    </div>
  )
}
