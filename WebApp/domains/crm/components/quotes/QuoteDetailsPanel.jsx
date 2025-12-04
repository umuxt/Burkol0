import React, { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, Edit, Download, Trash2, Lock, Unlock, AlertTriangle, RefreshCw, Wallet, MapPin, FileText, Image, FolderOpen, Paperclip, PenTool, Calculator, Sliders } from '../../../../shared/components/Icons.jsx'
import { PriceStatusBadge } from '../pricing/PriceStatusBadge.js'
import API, { API_BASE } from '../../../../shared/lib/api.js'
import { uid, downloadDataUrl, ACCEPT_EXT, MAX_FILES, MAX_FILE_MB, MAX_PRODUCT_FILES, extOf, readFileAsDataUrl, isImageExt } from '../../../../shared/lib/utils.js'
import { statusLabel } from '../../../../shared/i18n.js'
import { showToast } from '../../../../shared/components/MESToast.js'
import { quotesService } from '../../services/quotes-service.js'
import { formsApi } from '../../services/forms-service.js'
import { priceApi } from '../../services/pricing-service.js'
import QuoteEditLockBanner from './QuoteEditLockBanner.jsx'
import FormUpdateModal from './FormUpdateModal.jsx'

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
  
  // D1: Separate form fields editing state
  const [formEditing, setFormEditing] = useState(false)
  const [formFieldsData, setFormFieldsData] = useState({})
  const [originalFormFieldsData, setOriginalFormFieldsData] = useState({})
  
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
  
  // D1: Quote's own form template (not active template)
  const [quoteFormTemplate, setQuoteFormTemplate] = useState(null)
  const [templateRefreshKey, setTemplateRefreshKey] = useState(0) // Force re-fetch trigger
  
  // C1: Version change detection state
  const [formChangeDetected, setFormChangeDetected] = useState(false)
  const [priceChangeDetected, setPriceChangeDetected] = useState(false)
  const [activeFormTemplate, setActiveFormTemplate] = useState(null)
  const [activePriceSetting, setActivePriceSetting] = useState(null)
  
  // C2: Form update modal state
  const [showFormUpdateModal, setShowFormUpdateModal] = useState(false)
  const [oldFormFields, setOldFormFields] = useState([])
  const [newFormFields, setNewFormFields] = useState([])
  
  // C3: Price recalculation modal state
  const [showPriceRecalcModal, setShowPriceRecalcModal] = useState(false)
  const [newCalculatedPrice, setNewCalculatedPrice] = useState(null)
  const [priceRecalcLoading, setPriceRecalcLoading] = useState(false)
  const [priceChanges, setPriceChanges] = useState(null) // { formulaChanged, oldFormula, newFormula, parameterChanges }
  
  // D1: Price confirm modal state for edit mode
  const [showPriceConfirmModal, setShowPriceConfirmModal] = useState(false)
  const [pendingChanges, setPendingChanges] = useState(null) // { formData, quoteData, newPrice, priceDiff, changedFields }
  
  // Fetch edit status when quote changes
  // C1: Optimized - only fetch form/price changes if canEdit=true
  useEffect(() => {
    if (quote?.id) {
      setEditStatusLoading(true)
      // Reset change detection states
      setFormChangeDetected(false)
      setPriceChangeDetected(false)
      setActiveFormTemplate(null)
      setActivePriceSetting(null)
      
      quotesService.getEditStatus(quote.id)
        .then(async (status) => {
          setEditStatus(status)
          
          // C1: Only check for form/price changes if quote is editable
          if (status.canEdit) {
            try {
              // Fetch active template and setting in parallel
              const [activeTemplate, activeSetting] = await Promise.all([
                formsApi.getActiveTemplate().catch(() => null),
                priceApi.getActiveSetting().catch(() => null)
              ])
              
              setActiveFormTemplate(activeTemplate)
              setActivePriceSetting(activeSetting)
              
              // Check for form template change
              if (activeTemplate && quote.formTemplateCode) {
                const formChanged = quote.formTemplateCode !== activeTemplate.code
                setFormChangeDetected(formChanged)
                if (formChanged) {
                  console.log('📋 Form template changed:', quote.formTemplateCode, '→', activeTemplate.code)
                }
              }
              
              // Check for price setting change
              if (activeSetting && quote.priceSettingCode) {
                const priceChanged = quote.priceSettingCode !== activeSetting.code
                setPriceChangeDetected(priceChanged)
                if (priceChanged) {
                  console.log('💰 Price setting changed:', quote.priceSettingCode, '→', activeSetting.code)
                }
              }
            } catch (err) {
              console.warn('Failed to check version changes:', err)
            }
          }
        })
        .catch(err => {
          console.error('Failed to fetch edit status:', err)
          setEditStatus({ canEdit: true }) // Default to editable on error
        })
        .finally(() => {
          setEditStatusLoading(false)
        })
    }
  }, [quote?.id, quote?.formTemplateCode, quote?.priceSettingCode])

  // D1: Fetch quote's own form template (not active template)
  useEffect(() => {
    if (quote?.formTemplateId) {
      console.log('📋 D1: Fetching quote template:', quote.formTemplateId, 'refreshKey:', templateRefreshKey)
      formsApi.getTemplateWithFields(quote.formTemplateId)
        .then(template => {
          console.log('📋 D1: Loaded quote\'s form template:', template?.id, template?.name)
          setQuoteFormTemplate(template)
        })
        .catch(err => {
          console.warn('Failed to fetch quote form template:', err)
          // Fall back to formConfig if fetch fails
          setQuoteFormTemplate(null)
        })
    } else {
      setQuoteFormTemplate(null)
    }
  }, [quote?.formTemplateId, templateRefreshKey])

  // Initialize form data when quote changes OR when quoteFormTemplate loads
  useEffect(() => {
    if (quote) {
      setCurrStatus(quote.status || 'new')
      
      // D1: Use quote's own form template fields, fallback to formConfig
      const initialForm = {}
      
      // Prefer quoteFormTemplate (quote's saved template), fallback to formConfig
      const fields = quoteFormTemplate?.fields || quoteFormTemplate?.formStructure?.fields ||
                     formConfig?.formStructure?.fields || formConfig?.fields || []
      
      // Debug log to see what data we have
      console.log('📋 QuoteDetailsPanel: Initializing form', {
        quoteId: quote.id,
        formData: quote.formData,
        usingQuoteTemplate: !!quoteFormTemplate,
        templateId: quoteFormTemplate?.id || formConfig?.id,
        fields: fields.map(f => ({ id: f.id, fieldCode: f.fieldCode, label: f.label || f.fieldName }))
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
      
      // D1: Initialize formFieldsData separately for dynamic form fields
      const dynamicFormData = {}
      fields.forEach(field => {
        dynamicFormData[field.id] = initialForm[field.id] || ''
      })
      setFormFieldsData(dynamicFormData)
      setOriginalFormFieldsData(dynamicFormData)

      const override = quote.manualOverride || null
      setManualOverride(override)
      // Use finalPrice or calculatedPrice as fallback for price
      const quotePrice = quote.finalPrice || quote.calculatedPrice || quote.price
      const initialManualPrice = override?.price ?? quotePrice
      setManualPriceInput(formatManualPriceInput(initialManualPrice))
      setManualNote(override?.note || '')
      setEditing(false)
      setFormEditing(false) // D1: Reset form editing state
    }
  }, [quote?.id, quote?.status, quote?.finalPrice, quote?.calculatedPrice, quote?.price, quote?.manualOverride, quoteFormTemplate, formConfig])

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
  
  // D1: Handle form field input change (separate from main edit)
  const handleFormFieldChange = (e) => {
    if (!formEditing) return
    
    const { name, value } = e.target
    setFormFieldsData(prev => ({ ...prev, [name]: value }))
  }
  
  // D1: Cancel form field editing
  const handleFormEditCancel = () => {
    setFormEditing(false)
    setFormFieldsData(originalFormFieldsData)
  }
  
  // D1: Save form fields with price check
  const handleFormFieldsSave = async () => {
    if (!formEditing) return
    
    try {
      // D1: Use quote's own form template fields
      const fields = quoteFormTemplate?.fields || quoteFormTemplate?.formStructure?.fields ||
                     formConfig?.formStructure?.fields || formConfig?.fields || []
      const fieldIdToCode = {}
      fields.forEach(field => {
        fieldIdToCode[field.id] = field.fieldCode || field.id
      })
      
      // Build formData with fieldCodes for backend
      const formData = {}
      Object.entries(formFieldsData).forEach(([key, value]) => {
        const fieldCode = fieldIdToCode[key] || key
        formData[fieldCode] = value
      })
      
      console.log('💾 D1: Saving form fields', { formData })
      
      // Check if price is locked
      const isLocked = manualOverride?.active === true
      
      // D1 FIX: Use quote's saved priceSettingId, NOT activePriceSetting
      // Form editing should use the quote's current pricing, not the latest admin setting
      if (!isLocked && quote.priceSettingId) {
        try {
          const priceResult = await priceApi.calculatePrice(quote.priceSettingId, formData)
          const newPrice = priceResult?.totalPrice || 0
          const oldPrice = parseFloat(quote.finalPrice || quote.calculatedPrice || 0)
          const priceDiff = newPrice - oldPrice
          
          console.log('💰 D1: Price calculation (using quote.priceSettingId)', { 
            priceSettingId: quote.priceSettingId, 
            oldPrice, 
            newPrice, 
            priceDiff 
          })
          
          // If price changed, show confirmation modal
          if (Math.abs(priceDiff) > 0.01) {
            // Find which fields changed
            const changedFields = []
            Object.entries(formFieldsData).forEach(([key, value]) => {
              if (originalFormFieldsData[key] !== value) {
                const field = fields.find(f => f.id === key)
                changedFields.push({
                  fieldName: field?.fieldName || field?.label || key,
                  oldValue: originalFormFieldsData[key] ?? '-',
                  newValue: value ?? '-'
                })
              }
            })
            
            // Prepare quoteData
            const quoteData = {
              formData: formData,
              calculatedPrice: newPrice
            }
            
            setPendingChanges({ formData, quoteData, newPrice, priceDiff, changedFields })
            setShowPriceConfirmModal(true)
            return
          }
          
          // Price same - save directly with new price
          await saveFormFields(formData, newPrice)
        } catch (priceErr) {
          console.warn('Could not calculate price:', priceErr)
          // Continue without price update
          await saveFormFields(formData, null)
        }
      } else {
        // Price locked or no active setting - save without price change
        await saveFormFields(formData, null)
      }
    } catch (error) {
      console.error('Form fields save error:', error)
      showToast('Form alanları kaydedilirken hata oluştu', 'error')
    }
  }
  
  // D1: Helper to save form fields
  const saveFormFields = async (formData, newPrice) => {
    const updatePayload = { formData }
    if (newPrice !== null) {
      updatePayload.calculatedPrice = newPrice
    }
    
    await onSave(quote.id, updatePayload)
    
    setFormEditing(false)
    
    // Update local state with new values immediately
    const newFormFieldsData = { ...formFieldsData }
    setOriginalFormFieldsData(newFormFieldsData)
    setForm(prev => ({ ...prev, ...newFormFieldsData }))
    setOriginalData(prev => ({ ...prev, ...newFormFieldsData }))
    
    showToast(newPrice !== null ? 'Form alanları ve fiyat güncellendi!' : 'Form alanları güncellendi!', 'success')
    
    if (onRefreshQuote) {
      await onRefreshQuote()
    }
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
      // D1: Main edit only handles customer fields, status, notes
      // Dynamic form fields are handled separately by formEditing
      
      // Prepare quote data for update (customer fields + status only)
      const quoteData = {
        // Customer fields
        customerName: form.customerName || quote.customerName,
        customerEmail: form.customerEmail || quote.customerEmail,
        customerPhone: form.customerPhone || quote.customerPhone,
        customerCompany: form.customerCompany || quote.customerCompany,
        customerAddress: form.customerAddress || quote.customerAddress,
        deliveryDate: form.deliveryDate || quote.deliveryDate,
        notes: form.notes || quote.notes,
        // Status
        status: currStatus
      }

      console.log('💾 QuoteDetailsPanel: Saving customer data:', { quoteId: quote.id, quoteData })

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

  // D1: Handle price confirm - save with new price (for form fields edit)
  const handlePriceConfirm = async () => {
    if (!pendingChanges) return
    
    try {
      const { formData, newPrice } = pendingChanges
      
      await saveFormFields(formData, newPrice)
      
      setShowPriceConfirmModal(false)
      setPendingChanges(null)
    } catch (error) {
      console.error('Quote update error:', error)
      showToast('Teklif güncellenirken hata oluştu', 'error')
    }
  }

  // D1: Handle price confirm cancel - keep form edit mode open
  const handlePriceConfirmCancel = () => {
    setShowPriceConfirmModal(false)
    setPendingChanges(null)
    // formEditing stays true
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

  // D1: Use quote's own form template fields, not active template
  // quoteFormTemplate = quote's saved template, formConfig = active template (for banner comparison)
  const formFields = quoteFormTemplate?.fields || quoteFormTemplate?.formStructure?.fields || 
                     formConfig?.formStructure?.fields || formConfig?.fields || []
  
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
  
  // C2: Handle form update when template changed
  const handleFormUpdateClick = async () => {
    if (!activeFormTemplate || !quote) return
    
    try {
      // Get old form template fields
      let oldFields = []
      if (quote.formTemplateId) {
        try {
          const oldTemplate = await formsApi.getTemplateWithFields(quote.formTemplateId)
          oldFields = oldTemplate?.fields || oldTemplate?.formStructure?.fields || []
        } catch (err) {
          console.warn('Could not fetch old template:', err)
          // Fall back to formConfig
          oldFields = formConfig?.formStructure?.fields || formConfig?.fields || []
        }
      } else {
        oldFields = formConfig?.formStructure?.fields || formConfig?.fields || []
      }
      
      // Get new form template fields
      const newFields = activeFormTemplate?.fields || activeFormTemplate?.formStructure?.fields || []
      
      setOldFormFields(oldFields)
      setNewFormFields(newFields)
      setShowFormUpdateModal(true)
    } catch (err) {
      console.error('Error opening form update modal:', err)
      showToast('Form güncelleme modalı açılamadı', 'error')
    }
  }
  
  // C2/C4: Handle form update save (also handles combined form+price update)
  const handleFormUpdateSave = async (quoteId, updatePayload) => {
    try {
      const result = await quotesService.updateQuoteForm(quoteId, updatePayload)
      
      // Update local state - reset both flags since FormUpdateModal handles combined updates
      setFormChangeDetected(false)
      setPriceChangeDetected(false) // C4: Reset price flag too when combined update
      
      // D1 FIX: Update local form state with new data from modal
      if (updatePayload.formData) {
        // Get new template fields to map fieldCode -> field.id
        const newFields = activeFormTemplate?.fields || activeFormTemplate?.formStructure?.fields || []
        const codeToId = {}
        newFields.forEach(field => {
          const fieldCode = field.fieldCode || field.id
          codeToId[fieldCode] = field.id
        })
        
        // Update form state with new values
        const newFormValues = {}
        Object.entries(updatePayload.formData).forEach(([fieldCode, value]) => {
          const fieldId = codeToId[fieldCode] || fieldCode
          newFormValues[fieldId] = value
        })
        
        setForm(prev => ({ ...prev, ...newFormValues }))
        setOriginalData(prev => ({ ...prev, ...newFormValues }))
        setFormFieldsData(newFormValues)
        setOriginalFormFieldsData(newFormValues)
      }
      
      // Force quoteFormTemplate refresh
      setQuoteFormTemplate(null)
      setTemplateRefreshKey(prev => prev + 1)
      
      // Refresh quote data
      if (onRefreshQuote) {
        await onRefreshQuote()
      }
      
      return result
    } catch (err) {
      console.error('Form update error:', err)
      throw err
    }
  }
  
  // C3: Handle price recalculation when setting changed
  const handlePriceRecalcClick = async () => {
    if (!activePriceSetting?.id || !quote) return
    
    try {
      setPriceRecalcLoading(true)
      
      // Get current form data
      const currentFormData = quote.formData || {}
      
      // Calculate new price with active price setting
      const result = await priceApi.calculatePrice(activePriceSetting.id, currentFormData)
      const newPrice = result.totalPrice || result.price || 0
      
      // Get current quote price
      const currentPrice = parseFloat(quote.finalPrice || quote.calculatedPrice || 0)
      
      // C3 Optimization: If price is the same, auto-update without modal
      if (Math.abs(newPrice - currentPrice) < 0.01) {
        // Price is the same - just update priceSettingCode silently
        await quotesService.updateQuoteForm(quote.id, {
          priceSettingId: activePriceSetting.id,
          priceSettingCode: activePriceSetting.code,
          calculatedPrice: newPrice,
          formData: quote.formData
        })
        
        // Reset state
        setPriceChangeDetected(false)
        
        showToast('Yapılan değişiklikler bu teklifi etkilemiyor. Ayarlar güncellendi.', 'info')
        
        // Refresh quote data
        if (onRefreshQuote) {
          await onRefreshQuote()
        }
        return
      }
      
      // Price is different - show modal with changes
      // C3: Get price changes (what caused the difference)
      if (quote.priceSettingId && activePriceSetting.id) {
        try {
          const compareResult = await priceApi.comparePriceSettings(quote.priceSettingId, activePriceSetting.id)
          setPriceChanges(compareResult.changes)
        } catch (compareErr) {
          console.warn('Could not compare price settings:', compareErr)
          setPriceChanges(null)
        }
      }
      
      setNewCalculatedPrice(newPrice)
      setShowPriceRecalcModal(true)
    } catch (err) {
      console.error('Price calculation error:', err)
      showToast('Fiyat hesaplanamadı: ' + err.message, 'error')
    } finally {
      setPriceRecalcLoading(false)
    }
  }
  
  // C3: Handle price recalculation confirm
  const handlePriceRecalcConfirm = async () => {
    if (!quote?.id || newCalculatedPrice === null) return
    
    try {
      setPriceRecalcLoading(true)
      
      // Update quote with new price and price setting
      await quotesService.updateQuoteForm(quote.id, {
        priceSettingId: activePriceSetting.id,
        priceSettingCode: activePriceSetting.code,
        calculatedPrice: newCalculatedPrice,
        formData: quote.formData // Keep existing form data
      })
      
      // Reset state
      setPriceChangeDetected(false)
      setShowPriceRecalcModal(false)
      setNewCalculatedPrice(null)
      setPriceChanges(null)
      
      showToast('Fiyat başarıyla güncellendi', 'success')
      
      // Refresh quote data
      if (onRefreshQuote) {
        await onRefreshQuote()
      }
    } catch (err) {
      console.error('Price update error:', err)
      showToast('Fiyat güncellenemedi: ' + err.message, 'error')
    } finally {
      setPriceRecalcLoading(false)
    }
  }
  
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
      
      {/* C1: Form/Price Version Change Banners - Only show if editable AND price not locked */}
      {editStatus?.canEdit && !isLocked && (formChangeDetected || priceChangeDetected) && (
        <div style={{
          padding: '12px 16px',
          background: formChangeDetected && priceChangeDetected ? '#fef3c7' : (formChangeDetected ? '#dbeafe' : '#dcfce7'),
          borderBottom: `1px solid ${formChangeDetected && priceChangeDetected ? '#fbbf24' : (formChangeDetected ? '#93c5fd' : '#86efac')}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <RefreshCw size={16} style={{ color: formChangeDetected && priceChangeDetected ? '#d97706' : (formChangeDetected ? '#2563eb' : '#16a34a') }} />
            <span style={{ fontSize: '13px', color: formChangeDetected && priceChangeDetected ? '#92400e' : (formChangeDetected ? '#1e40af' : '#166534'), fontWeight: '500' }}>
              {formChangeDetected && priceChangeDetected 
                ? 'Form ve fiyatlandırma ayarları güncellendi!' 
                : formChangeDetected 
                  ? 'Form şablonu güncellendi!' 
                  : 'Fiyatlandırma ayarları güncellendi!'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {formChangeDetected && priceChangeDetected ? (
              <button
                type="button"
                onClick={handleFormUpdateClick}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  borderRadius: '4px',
                  background: '#d97706',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500'
                }}
              >
                Formu ve Fiyatı Güncelle
              </button>
            ) : formChangeDetected ? (
              <button
                type="button"
                onClick={handleFormUpdateClick}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  borderRadius: '4px',
                  background: '#2563eb',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500'
                }}
              >
                Formu Güncelle
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePriceRecalcClick}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  borderRadius: '4px',
                  background: '#16a34a',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500'
                }}
              >
                Fiyatı Yeniden Hesapla
              </button>
            )}
          </div>
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
            </div>

            {/* D1: Form Bilgileri - Separate container with own edit state */}
            {formFields.length > 0 && (
              <div style={{ 
                marginBottom: '16px', 
                padding: '12px', 
                background: 'white', 
                borderRadius: '6px',
                border: formEditing ? '2px solid #3b82f6' : '1px solid #e5e7eb'
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
                    Form Bilgileri
                  </h3>
                  {!formEditing ? (
                    <button
                      type="button"
                      onClick={() => !isEditLocked && setFormEditing(true)}
                      disabled={isEditLocked}
                      style={{
                        padding: '4px 10px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        background: isEditLocked ? '#f3f4f6' : 'white',
                        color: isEditLocked ? '#9ca3af' : '#374151',
                        cursor: isEditLocked ? 'not-allowed' : 'pointer',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        opacity: isEditLocked ? 0.6 : 1
                      }}
                      title={isEditLocked ? 'İş emri üretimde - düzenleme kilitli' : 'Form alanlarını düzenle'}
                    >
                      <Edit size={12} /> Düzenle
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={handleFormEditCancel}
                        style={{
                          padding: '4px 10px',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          background: 'white',
                          color: '#374151',
                          cursor: 'pointer',
                          fontSize: '11px'
                        }}
                      >
                        İptal
                      </button>
                      <button
                        type="button"
                        onClick={handleFormFieldsSave}
                        style={{
                          padding: '4px 10px',
                          border: 'none',
                          borderRadius: '4px',
                          background: '#3b82f6',
                          color: 'white',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: '500'
                        }}
                      >
                        Kaydet
                      </button>
                    </div>
                  )}
                </div>
                
                {formFields.map(field => {
                  // D1 FIX: Always use formFieldsData for display (it's the source of truth for form fields)
                  const value = formFieldsData[field.id] || form[field.id] || ''
                  const label = field.label || field.fieldName || field.id

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
                      {formEditing ? (
                        field.type === 'textarea' ? (
                          <textarea
                            name={field.id}
                            value={value}
                            onChange={handleFormFieldChange}
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
                                  onChange={handleFormFieldChange}
                                />
                                <span style={{ fontSize: '12px' }}>{option}</span>
                              </label>
                            ))}
                          </div>
                        ) : field.type === 'select' && field.options ? (
                          <select
                            name={field.id}
                            value={value}
                            onChange={handleFormFieldChange}
                            style={{
                              padding: '8px 12px',
                              border: '1px solid #3b82f6',
                              borderRadius: '4px',
                              background: 'white',
                              width: '100%',
                              fontSize: '14px'
                            }}
                          >
                            <option value="">Seçiniz</option>
                            {field.options.map(option => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={field.type === 'number' ? 'number' : 'text'}
                            name={field.id}
                            value={value}
                            onChange={handleFormFieldChange}
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
            )}

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
                  {(quote.customer.city || quote.customer.country || quote.customer.postalCode || quote.customer.district || quote.customer.neighbourhood || quote.customer.address) && (
                    <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px dashed #e5e7eb' }}>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: '#6b7280', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} /> Adres Bilgileri</div>
                      
                      {/* Açık Adres */}
                      {quote.customer.address && (
                        <div style={{ fontSize: '12px', marginBottom: '8px', color: '#111827' }}>
                          {quote.customer.address}
                        </div>
                      )}
                      
                      {/* Konum Bilgileri - Compact */}
                      <div style={{ display: 'flex', gap: '12px', fontSize: '12px', flexWrap: 'wrap' }}>
                        {quote.customer.neighbourhood && (
                          <div>
                            <span style={{ color: '#6b7280' }}>Mahalle: </span>
                            <span style={{ color: '#111827' }}>{quote.customer.neighbourhood}</span>
                          </div>
                        )}
                        {quote.customer.district && (
                          <div>
                            <span style={{ color: '#6b7280' }}>İlçe: </span>
                            <span style={{ color: '#111827' }}>{quote.customer.district}</span>
                          </div>
                        )}
                        {quote.customer.city && (
                          <div>
                            <span style={{ color: '#6b7280' }}>İl: </span>
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
                      if (['pdf'].includes(ext)) return <FileText size={18} />
                      if (['dxf', 'dwg', 'step', 'stp', 'iges', 'igs'].includes(ext)) return <PenTool size={18} />
                      if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return <Image size={18} />
                      return <Paperclip size={18} />
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
                          <span style={{ fontSize: '18px', display: 'flex', alignItems: 'center' }}>{getFileIcon(fileName)}</span>
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
                  <span style={{ fontSize: '24px', display: 'flex', justifyContent: 'center', marginBottom: '8px' }}><FolderOpen size={24} /></span>
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
                  <span style={{ fontSize: '24px', display: 'flex', justifyContent: 'center', marginBottom: '8px' }}><Image size={24} /></span>
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
        
      {/* C2: Form Update Modal */}
      <FormUpdateModal
        isOpen={showFormUpdateModal}
        onClose={() => setShowFormUpdateModal(false)}
        quote={quote}
        oldFormData={quote?.formData || {}}
        oldFields={oldFormFields}
        newFields={newFormFields}
        activeFormTemplate={activeFormTemplate}
        activePriceSetting={activePriceSetting}
        onSave={handleFormUpdateSave}
      />
      
      {/* C3: Price Recalculation Confirmation Modal */}
      {showPriceRecalcModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
            width: '100%',
            maxWidth: '550px',
            maxHeight: '90vh',
            overflow: 'auto',
            padding: '24px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: '#dcfce7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <RefreshCw size={24} style={{ color: '#16a34a' }} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                  Fiyat Güncelleme
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#6b7280' }}>
                  Fiyatlandırma ayarları değişti
                </p>
              </div>
            </div>
            
            {/* C3: Show what changed */}
            {priceChanges && (priceChanges.formulaChanged || priceChanges.parameterChanges?.length > 0) && (
              <div style={{
                background: '#fffbeb',
                border: '1px solid #fcd34d',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '16px'
              }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={16} />
                  Değişiklikler
                </h4>
                
                {/* Formula change */}
                {priceChanges.formulaChanged && (
                  <div style={{ marginBottom: priceChanges.parameterChanges?.length > 0 ? '12px' : 0 }}>
                    <div style={{ fontSize: '12px', color: '#92400e', fontWeight: '500', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calculator size={14} />
                      Formül Değişti:
                    </div>
                    <div style={{ 
                      background: 'white', 
                      borderRadius: '6px', 
                      padding: '8px 12px',
                      fontSize: '13px',
                      fontFamily: 'monospace'
                    }}>
                      <div style={{ color: '#dc2626', marginBottom: '4px' }}>
                        <span style={{ opacity: 0.6 }}>Eski:</span> {priceChanges.oldFormula || '(yok)'}
                      </div>
                      <div style={{ color: '#16a34a' }}>
                        <span style={{ opacity: 0.6 }}>Yeni:</span> {priceChanges.newFormula || '(yok)'}
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Parameter changes */}
                {priceChanges.parameterChanges?.length > 0 && (
                  <div>
                    <div style={{ fontSize: '12px', color: '#92400e', fontWeight: '500', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sliders size={14} />
                      Parametre Değişiklikleri:
                    </div>
                    <div style={{ 
                      background: 'white', 
                      borderRadius: '6px', 
                      padding: '8px 12px',
                      fontSize: '13px'
                    }}>
                      {priceChanges.parameterChanges.map((change, idx) => (
                        <div 
                          key={idx} 
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '4px 0',
                            borderBottom: idx < priceChanges.parameterChanges.length - 1 ? '1px solid #f3f4f6' : 'none'
                          }}
                        >
                          <span style={{ fontWeight: '500', color: '#374151' }}>
                            {change.name || change.code}
                            {change.unit && <span style={{ opacity: 0.5, fontSize: '11px', marginLeft: '4px' }}>({change.unit})</span>}
                          </span>
                          <span style={{ fontFamily: 'monospace' }}>
                            {change.type === 'added' && (
                              <span style={{ color: '#16a34a' }}>
                                + {change.newValue}
                              </span>
                            )}
                            {change.type === 'removed' && (
                              <span style={{ color: '#dc2626', textDecoration: 'line-through' }}>
                                {change.oldValue}
                              </span>
                            )}
                            {change.type === 'changed' && (
                              <>
                                <span style={{ color: '#dc2626' }}>{change.oldValue}</span>
                                <span style={{ margin: '0 6px', color: '#9ca3af' }}>→</span>
                                <span style={{ color: '#16a34a' }}>{change.newValue}</span>
                              </>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            <div style={{
              background: '#f9fafb',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>Mevcut Fiyat:</span>
                <span style={{ fontSize: '16px', fontWeight: '500', color: '#374151' }}>
                  {parseFloat(quote?.finalPrice || quote?.calculatedPrice || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>Yeni Fiyat:</span>
                <span style={{ fontSize: '18px', fontWeight: '600', color: '#16a34a' }}>
                  {(newCalculatedPrice || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                </span>
              </div>
              {newCalculatedPrice !== null && quote?.finalPrice && (
                <div style={{
                  marginTop: '12px',
                  paddingTop: '12px',
                  borderTop: '1px solid #e5e7eb',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ fontSize: '13px', color: '#6b7280' }}>Fark:</span>
                  <span style={{
                    fontSize: '14px',
                    fontWeight: '500',
                    color: newCalculatedPrice > parseFloat(quote.finalPrice) ? '#dc2626' : '#16a34a'
                  }}>
                    {newCalculatedPrice > parseFloat(quote.finalPrice) ? '+' : ''}
                    {(newCalculatedPrice - parseFloat(quote.finalPrice)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    {' '}
                    ({newCalculatedPrice > parseFloat(quote.finalPrice) ? '↑' : '↓'} 
                    {Math.abs(((newCalculatedPrice - parseFloat(quote.finalPrice)) / parseFloat(quote.finalPrice)) * 100).toFixed(1)}%)
                  </span>
                </div>
              )}
            </div>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowPriceRecalcModal(false)
                  setNewCalculatedPrice(null)
                  setPriceChanges(null)
                }}
                style={{
                  padding: '10px 20px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  background: 'white',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                İptal
              </button>
              <button
                onClick={handlePriceRecalcConfirm}
                disabled={priceRecalcLoading}
                style={{
                  padding: '10px 20px',
                  border: 'none',
                  borderRadius: '6px',
                  background: '#16a34a',
                  color: 'white',
                  cursor: priceRecalcLoading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  opacity: priceRecalcLoading ? 0.6 : 1
                }}
              >
                {priceRecalcLoading ? 'Güncelleniyor...' : 'Fiyatı Güncelle'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* D1: Price Confirm Modal for Edit Mode */}
      {showPriceConfirmModal && pendingChanges && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
            width: '100%',
            maxWidth: '500px',
            maxHeight: '90vh',
            overflow: 'auto',
            padding: '24px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: pendingChanges.priceDiff > 0 ? '#fef3c7' : '#dcfce7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <AlertTriangle size={24} style={{ color: pendingChanges.priceDiff > 0 ? '#d97706' : '#16a34a' }} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                  Fiyat Değişikliği Onayı
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#6b7280' }}>
                  Form değişiklikleri fiyatı etkiledi
                </p>
              </div>
            </div>
            
            {/* Changed Fields */}
            {pendingChanges.changedFields?.length > 0 && (
              <div style={{
                background: '#f9fafb',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px'
              }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '8px' }}>
                  Değişen Alanlar:
                </div>
                {pendingChanges.changedFields.map((change, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 0',
                    borderBottom: idx < pendingChanges.changedFields.length - 1 ? '1px solid #e5e7eb' : 'none',
                    fontSize: '13px'
                  }}>
                    <span style={{ color: '#374151', fontWeight: '500' }}>{change.fieldName}:</span>
                    <span style={{ color: '#6b7280' }}>
                      <span style={{ textDecoration: 'line-through', marginRight: '8px' }}>{change.oldValue}</span>
                      <span style={{ color: '#16a34a', fontWeight: '500' }}>→ {change.newValue}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            
            {/* Price Change */}
            <div style={{
              background: pendingChanges.priceDiff > 0 ? '#fef3c7' : '#dcfce7',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>Mevcut Fiyat:</span>
                <span style={{ fontSize: '16px', fontWeight: '500', color: '#374151' }}>
                  {parseFloat(quote?.finalPrice || quote?.calculatedPrice || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>Yeni Fiyat:</span>
                <span style={{ fontSize: '18px', fontWeight: '600', color: pendingChanges.priceDiff > 0 ? '#d97706' : '#16a34a' }}>
                  {pendingChanges.newPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                </span>
              </div>
              <div style={{
                paddingTop: '8px',
                borderTop: '1px solid rgba(0,0,0,0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>Fark:</span>
                <span style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: pendingChanges.priceDiff > 0 ? '#dc2626' : '#16a34a'
                }}>
                  {pendingChanges.priceDiff > 0 ? '+' : ''}
                  {pendingChanges.priceDiff.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                </span>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={handlePriceConfirmCancel}
                style={{
                  padding: '10px 20px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  background: 'white',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                Düzenlemeye Dön
              </button>
              <button
                onClick={handlePriceConfirm}
                style={{
                  padding: '10px 20px',
                  border: 'none',
                  borderRadius: '6px',
                  background: pendingChanges.priceDiff > 0 ? '#d97706' : '#16a34a',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                Onayla ve Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
