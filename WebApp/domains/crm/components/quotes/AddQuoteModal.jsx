import React, { useState, useEffect, useCallback } from 'react'
import quotesApi from '../../../../shared/lib/api.js'
import { uid, readFileAsDataUrl, ACCEPT_EXT, MAX_FILES, MAX_FILE_MB, MAX_PRODUCT_FILES } from '../../../../shared/lib/utils.js'
import { showToast } from '../../../../shared/components/MESToast.js'
import QuoteCustomerStep from './QuoteCustomerStep.jsx'
import QuoteFormStep from './QuoteFormStep.jsx'
import QuoteReviewStep from './QuoteReviewStep.jsx'
import { validateCustomerStep, validateFormStep } from '../../utils/quote-validation.js'
import { User, FileEdit, CheckCircle, Check, X, ClipboardList, ArrowRight, ArrowLeft } from '../../../../shared/components/Icons.jsx'

/**
 * AddQuoteModal - Step-based quote creation modal
 * 
 * Steps:
 * 1. Customer Selection (existing/new/without)
 * 2. Form Data (dynamic form fields)
 * 3. Review & Submit
 */
export default function AddQuoteModal({ 
  onClose, 
  onSaved, 
  formConfig,
  t,
  globalProcessing,
  setGlobalProcessing
}) {
  // Current step (1, 2, 3)
  const [currentStep, setCurrentStep] = useState(1)
  
  // Step 1: Customer data
  const [customerStepData, setCustomerStepData] = useState({
    customerType: 'existing',
    selectedCustomer: null,
    customerData: null,
    deliveryDate: ''
  })
  
  // Step 2: Form data
  const [formData, setFormData] = useState({})
  
  // Step 3: Files
  const [techFiles, setTechFiles] = useState([])
  const [prodImgs, setProdImgs] = useState([])
  
  // Notes (shown in step 3)
  const [notes, setNotes] = useState('')
  
  // Validation errors
  const [errors, setErrors] = useState({})
  
  // Saving state
  const [saving, setSaving] = useState(false)

  // Steps configuration
  const steps = [
    { number: 1, label: 'Müşteri', icon: <User size={16} /> },
    { number: 2, label: 'Form Bilgileri', icon: <FileEdit size={16} /> },
    { number: 3, label: 'Önizleme', icon: <CheckCircle size={16} /> }
  ]

  // Initialize form with default values when formConfig loads
  useEffect(() => {
    const fields = formConfig?.formStructure?.fields || formConfig?.fields || []
    const initialForm = {}
    
    fields.forEach(field => {
      // Use optionCode for initial radio selection
      if (field.type === 'radio' && field.options && field.options.length > 0) {
        const firstOption = field.options[0]
        initialForm[field.id] = firstOption.optionCode || firstOption || ''
      } else {
        initialForm[field.id] = ''
      }
    })
    
    setFormData(initialForm)
  }, [formConfig])

  // Validate Step 1 - using validation utility
  function validateStep1() {
    const result = validateCustomerStep(customerStepData)
    setErrors(result.errors)
    return result.isValid
  }

  // Validate Step 2 - using validation utility
  function validateStep2() {
    const fields = formConfig?.formStructure?.fields || formConfig?.fields || []
    const result = validateFormStep(fields, formData)
    setErrors(result.errors)
    return result.isValid
  }

  // Handle next step
  function handleNext() {
    if (currentStep === 1) {
      if (validateStep1()) {
        setCurrentStep(2)
      }
    } else if (currentStep === 2) {
      if (validateStep2()) {
        setCurrentStep(3)
      }
    }
  }

  // Handle back
  function handleBack() {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
      setErrors({})
    }
  }

  // Handle form field change (memoized for QuoteFormStep)
  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    // Clear error for this field
    setErrors(prev => {
      if (prev[name]) {
        return { ...prev, [name]: null }
      }
      return prev
    })
  }, [])

  // Handle file upload
  async function handleFileUpload(e, type = 'tech') {
    const files = Array.from(e.target.files)
    
    if (files.length === 0) return
    
    const maxFiles = type === 'tech' ? MAX_FILES : MAX_PRODUCT_FILES
    const currentCount = type === 'tech' ? techFiles.length : prodImgs.length
    
    if (currentCount + files.length > maxFiles) {
      showToast(`Maksimum ${maxFiles} dosya yükleyebilirsiniz`, 'error')
      return
    }
    
    try {
      const uploadPromises = files.map(async (file) => {
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          throw new Error(`${file.name} çok büyük (max ${MAX_FILE_MB}MB)`)
        }
        
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
      showToast(error.message || 'Dosya yüklenirken hata oluştu', 'error')
    }
  }

  // Handle file delete
  function handleFileDelete(fileId, type = 'tech') {
    if (type === 'tech') {
      setTechFiles(prev => prev.filter(f => f.id !== fileId))
    } else {
      setProdImgs(prev => prev.filter(f => f.id !== fileId))
    }
  }

  // Handle files change from QuoteReviewStep
  const handleFilesChange = useCallback((type, files) => {
    if (type === 'tech') {
      setTechFiles(files)
    } else {
      setProdImgs(files)
    }
  }, [])

  // Handle submit
  async function handleSubmit() {
    try {
      setSaving(true)
      if (setGlobalProcessing) {
        setGlobalProcessing(true)
      }
      
      // Build quote data based on customer type
      const { customerType, selectedCustomer, customerData, deliveryDate } = customerStepData
      
      const quotePayload = {
        // Customer type for new flow
        customerType,
        
        // Existing customer
        customerId: customerType === 'existing' ? selectedCustomer?.id : null,
        
        // New customer data
        newCustomerData: customerType === 'new' ? customerData : null,
        
        // Customer fields for display
        customerName: customerData?.name || selectedCustomer?.name || '',
        customerEmail: customerData?.email || selectedCustomer?.email || '',
        customerPhone: customerData?.phone || selectedCustomer?.phone || '',
        customerCompany: customerData?.company || selectedCustomer?.company || '',
        customerAddress: customerData?.address || selectedCustomer?.address || '',
        
        // Form data
        formData,
        
        // Files
        files: techFiles,
        productImages: prodImgs,
        
        // Other
        deliveryDate: deliveryDate || null,
        notes,
        status: 'new'
      }
      
      console.log('🔧 Creating quote with payload:', quotePayload)
      
      const response = await quotesApi.addQuote(quotePayload)
      
      if (response && (response.id || response.quote?.id || response.success)) {
        showToast('Teklif başarıyla oluşturuldu!', 'success')
        
        // Eğer yeni müşteri oluşturulduysa, customers listesini yenilemek için event dispatch et
        if (customerType === 'new') {
          window.dispatchEvent(new CustomEvent('customerCreated'))
        }
        
        if (onSaved) {
          await onSaved()
        }
        
        onClose()
      } else {
        throw new Error(response?.error || 'Teklif oluşturulamadı')
      }
    } catch (error) {
      console.error('Create quote error:', error)
      showToast(error.message || 'Teklif oluşturulurken hata oluştu', 'error')
    } finally {
      setSaving(false)
      if (setGlobalProcessing) {
        setGlobalProcessing(false)
      }
    }
  }

  // Render step indicator - Shipment Modal Style
  function renderStepIndicator() {
    return (
      <div className="quote-step-indicator">
        {steps.map((step, index) => (
          <React.Fragment key={step.number}>
            <div className="flex-center-gap-6">
              <div 
                className={`quote-step-number ${currentStep === step.number ? 'active' : ''} ${currentStep > step.number ? 'completed' : ''}`}
                style={{ 
                  backgroundColor: currentStep === step.number ? 'var(--primary, #3b82f6)' : 
                                   currentStep > step.number ? 'var(--success, #10b981)' : 
                                   'var(--muted, #e5e7eb)',
                  color: currentStep >= step.number ? '#fff' : '#9ca3af',
                  cursor: step.number < currentStep ? 'pointer' : 'default'
                }}
                onClick={() => {
                  if (step.number < currentStep) {
                    setCurrentStep(step.number)
                  }
                }}
              >
                {currentStep > step.number ? <Check size={12} /> : step.number}
              </div>
              <span 
                className={`quote-step-label ${currentStep === step.number ? 'active' : ''}`}
                style={{ 
                  color: currentStep === step.number ? '#111827' : '#9ca3af'
                }}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div 
                className={`quote-step-connector ${currentStep > step.number ? 'completed' : ''}`}
                style={{
                  backgroundColor: currentStep > step.number ? 'var(--success, #10b981)' : 'var(--border, #d1d5db)'
                }}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    )
  }

  return (
    <div 
      className="modal-overlay" 
      onClick={onClose}
    >
      <div 
        className="quote-modal-container" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Shipment Modal Style */}
        <div className="quote-modal-header">
          <div className="flex-center-gap-10">
            <div className="quote-header-icon">
              <ClipboardList size={18} className="text-primary-var" />
            </div>
            <h2 className="quote-modal-title">Yeni Teklif</h2>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="quote-close-btn"
          >
            <X size={18} />
          </button>
        </div>

        {/* Step Indicator */}
        {renderStepIndicator()}

        {/* Step Content */}
        <div className="quote-modal-content">
          {currentStep === 1 && (
            <QuoteCustomerStep
              data={customerStepData}
              onChange={setCustomerStepData}
              errors={errors}
            />
          )}
          
          {currentStep === 2 && (
            <QuoteFormStep
              formConfig={formConfig}
              formData={formData}
              onChange={handleInputChange}
              errors={errors}
              t={t}
            />
          )}
          
          {currentStep === 3 && (
            <QuoteReviewStep
              customerStepData={customerStepData}
              formData={formData}
              formConfig={formConfig}
              techFiles={techFiles}
              prodImgs={prodImgs}
              notes={notes}
              onFilesChange={handleFilesChange}
              onNotesChange={setNotes}
              onEditStep={setCurrentStep}
              t={t}
            />
          )}
        </div>

        {/* Footer Actions - Shipment Modal Style */}
        <div className="modal-footer-flex">
          <div>
            {currentStep > 1 && (
              <button
                type="button"
                onClick={handleBack}
                disabled={saving}
                className="btn-back"
              >
                <ArrowLeft size={14} />
                Geri
              </button>
            )}
          </div>
          
          <div className="flex-gap-10">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="btn-cancel"
            >
              İptal
            </button>
            
            {currentStep < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                className="btn-next enabled"
              >
                İleri
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className="btn-submit enabled"
              >
                {saving ? 'Kaydediliyor...' : 'Teklif Oluştur'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
