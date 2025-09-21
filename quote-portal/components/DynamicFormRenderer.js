import API from '../lib/api.js'
import { uid, ACCEPT_EXT, MAX_FILES, MAX_FILE_MB, extOf, readFileAsDataUrl, isImageExt } from '../lib/utils.js'

const { useState, useEffect } = React

// Fixed default fields that cannot be modified by admin
const FIXED_DEFAULT_FIELDS = [
  { id: 'name', label: 'Müşteri Adı', type: 'text', required: true },
  { id: 'company', label: 'Şirket', type: 'text', required: false },
  { id: 'proj', label: 'Proje Adı', type: 'text', required: true },
  { id: 'phone', label: 'Telefon', type: 'phone', required: true },
  { id: 'email', label: 'E-posta', type: 'email', required: true }
]

export default function DynamicFormRenderer({ onSubmit, initialData = {}, showNotification, t }) {
  console.log('🔧 DynamicFormRenderer: Component started rendering')
  
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [formConfig, setFormConfig] = useState(null)
  const [formData, setFormData] = useState({ ...initialData, customFields: initialData.customFields || {} })
  const [errors, setErrors] = useState({})
  const [uploadingFiles, setUploadingFiles] = useState(false)

  console.log('🔧 DynamicFormRenderer: Initial state set', { loading, formData })

  useEffect(() => {
    loadFormConfig()
  }, [])

  useEffect(() => {
    setFormData({ ...initialData, customFields: initialData.customFields || {} })
  }, [initialData])

  async function loadFormConfig() {
    console.log('🔧 DynamicFormRenderer: Loading form config...')
    try {
      setLoading(true)
      const config = await API.getFormConfig()
      console.log('🔧 DynamicFormRenderer: Form config loaded successfully', config)
      setFormConfig(config.formConfig)
    } catch (error) {
      console.error('🔧 DynamicFormRenderer: Load form config error:', error)
      showNotification('Form konfigürasyonu yüklenemedi', 'error')
    } finally {
      setLoading(false)
      console.log('🔧 DynamicFormRenderer: Loading completed')
    }
  }

  async function handleFileUpload(fieldId, files, isCustomField = false) {
    setUploadingFiles(true)
    try {
      const validFiles = []
      
      for (const file of Array.from(files)) {
        // Validate file extension
        const ext = extOf(file.name)
        if (!ACCEPT_EXT.includes(ext)) {
          showNotification(`Desteklenmeyen dosya türü: ${ext}`, 'error')
          continue
        }
        
        // Validate file size
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          showNotification(`Dosya çok büyük: ${file.name} (max ${MAX_FILE_MB}MB)`, 'error')
          continue
        }
        
        // Read file as data URL
        const dataUrl = await readFileAsDataUrl(file)
        validFiles.push({
          name: file.name,
          size: file.size,
          type: file.type,
          dataUrl: dataUrl
        })
      }
      
      if (validFiles.length > 0) {
        handleFieldChange(fieldId, validFiles, isCustomField)
        showNotification(`${validFiles.length} dosya yüklendi`, 'success')
      }
    } catch (error) {
      console.error('File upload error:', error)
      showNotification('Dosya yükleme hatası', 'error')
    } finally {
      setUploadingFiles(false)
    }
  }

  // Enhanced field validation based on type and admin rules
  function validateFieldInput(field, value) {
    const fieldType = field.type
    const validation = field.validation || {}
    const errors = []

    // Skip validation for empty values unless required
    if (!value || value.toString().trim() === '') {
      if (field.required) {
        return { isValid: false, error: 'Bu alan zorunludur' }
      }
      return { isValid: true, error: null }
    }

    // Type-specific validation
    switch (fieldType) {
      case 'number':
        // Only allow numbers, decimal points, and minus sign
        if (!/^-?\d*\.?\d*$/.test(value)) {
          return { isValid: false, error: 'Sadece sayısal değer girebilirsiniz' }
        }
        
        const numValue = parseFloat(value)
        if (isNaN(numValue)) {
          return { isValid: false, error: 'Geçerli bir sayı giriniz' }
        }
        
        // Min/Max validation
        if (validation.min !== undefined && numValue < validation.min) {
          errors.push(`Minimum değer: ${validation.min}`)
        }
        if (validation.max !== undefined && numValue > validation.max) {
          errors.push(`Maximum değer: ${validation.max}`)
        }
        
        // Integer validation if specified
        if (validation.integer && !Number.isInteger(numValue)) {
          errors.push('Tam sayı giriniz (ondalık kullanmayın)')
        }
        
        // Positive number validation
        if (validation.positive && numValue <= 0) {
          errors.push('Pozitif bir sayı giriniz')
        }
        break

      case 'email':
        // Enhanced email validation
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
        if (!emailRegex.test(value)) {
          return { isValid: false, error: 'Geçerli bir e-posta adresi giriniz (örn: ornek@email.com)' }
        }
        
        // Domain validation if specified
        if (validation.allowedDomains && validation.allowedDomains.length > 0) {
          const domain = value.split('@')[1]
          if (!validation.allowedDomains.includes(domain)) {
            errors.push(`Sadece şu domainler kabul edilir: ${validation.allowedDomains.join(', ')}`)
          }
        }
        break

      case 'phone':
        // Enhanced Turkish phone number validation
        const cleanPhone = value.replace(/[\s\-\(\)]/g, '')
        
        // Multiple format support
        const phonePatterns = [
          /^(\+90|90)?[5][0-9]{9}$/, // Turkish mobile: +905xxxxxxxxx, 905xxxxxxxxx, 5xxxxxxxxx
          /^(\+90|90|0)?[2-4][0-9]{9}$/, // Turkish landline: +90212xxxxxxx, 0212xxxxxxx
        ]
        
        const isValidPhone = phonePatterns.some(pattern => pattern.test(cleanPhone))
        if (!isValidPhone) {
          return { isValid: false, error: 'Geçerli bir telefon numarası giriniz (örn: +90 555 123 45 67 veya 0212 123 45 67)' }
        }
        break

      case 'text':
        // Text validation with special rules
        if (validation.minLength && value.length < validation.minLength) {
          errors.push(`En az ${validation.minLength} karakter giriniz`)
        }
        if (validation.maxLength && value.length > validation.maxLength) {
          errors.push(`En fazla ${validation.maxLength} karakter girebilirsiniz`)
        }
        
        // Only letters validation
        if (validation.onlyLetters && !/^[a-zA-ZğüşıöçĞÜŞİÖÇ\s]+$/.test(value)) {
          errors.push('Sadece harf girebilirsiniz')
        }
        
        // No numbers validation
        if (validation.noNumbers && /\d/.test(value)) {
          errors.push('Sayı karakteri kullanamaz')
        }
        
        // Alphanumeric validation
        if (validation.alphanumeric && !/^[a-zA-Z0-9ğüşıöçĞÜŞİÖÇ\s]+$/.test(value)) {
          errors.push('Sadece harf ve sayı kullanabilirsiniz')
        }
        
        // Pattern validation
        if (validation.pattern) {
          const regex = new RegExp(validation.pattern)
          if (!regex.test(value)) {
            errors.push(validation.patternMessage || 'Geçersiz format')
          }
        }
        break

      case 'textarea':
        // Textarea validation
        if (validation.minLength && value.length < validation.minLength) {
          errors.push(`En az ${validation.minLength} karakter giriniz`)
        }
        if (validation.maxLength && value.length > validation.maxLength) {
          errors.push(`En fazla ${validation.maxLength} karakter girebilirsiniz`)
        }
        
        // Word count validation
        if (validation.minWords) {
          const wordCount = value.trim().split(/\s+/).length
          if (wordCount < validation.minWords) {
            errors.push(`En az ${validation.minWords} kelime giriniz`)
          }
        }
        if (validation.maxWords) {
          const wordCount = value.trim().split(/\s+/).length
          if (wordCount > validation.maxWords) {
            errors.push(`En fazla ${validation.maxWords} kelime girebilirsiniz`)
          }
        }
        break

      case 'date':
        // Date validation
        const dateValue = new Date(value)
        if (isNaN(dateValue.getTime())) {
          return { isValid: false, error: 'Geçerli bir tarih giriniz' }
        }
        
        // Future date validation
        if (validation.futureOnly && dateValue <= new Date()) {
          errors.push('Gelecekteki bir tarih seçiniz')
        }
        
        // Past date validation
        if (validation.pastOnly && dateValue >= new Date()) {
          errors.push('Geçmişteki bir tarih seçiniz')
        }
        
        // Date range validation
        if (validation.minDate && dateValue < new Date(validation.minDate)) {
          errors.push(`En erken ${validation.minDate} tarihi seçebilirsiniz`)
        }
        if (validation.maxDate && dateValue > new Date(validation.maxDate)) {
          errors.push(`En geç ${validation.maxDate} tarihi seçebilirsiniz`)
        }
        break

      case 'dropdown':
      case 'radio':
        // Selection validation
        if (field.options && !field.options.includes(value)) {
          return { isValid: false, error: 'Geçerli bir seçenek seçiniz' }
        }
        break

      case 'multiselect':
      case 'checkbox':
        // Multiple selection validation
        if (validation.minSelections && Array.isArray(value) && value.length < validation.minSelections) {
          errors.push(`En az ${validation.minSelections} seçenek seçiniz`)
        }
        if (validation.maxSelections && Array.isArray(value) && value.length > validation.maxSelections) {
          errors.push(`En fazla ${validation.maxSelections} seçenek seçebilirsiniz`)
        }
        break

      case 'file':
        // File validation (if file info is passed as value)
        if (value && typeof value === 'object' && value.size) {
          if (validation.maxSize && value.size > validation.maxSize) {
            errors.push(`Dosya boyutu en fazla ${(validation.maxSize / (1024 * 1024)).toFixed(1)} MB olabilir`)
          }
          
          if (validation.allowedTypes && !validation.allowedTypes.includes(value.type)) {
            errors.push(`Sadece şu dosya türleri kabul edilir: ${validation.allowedTypes.join(', ')}`)
          }
        }
        break
    }

    return { 
      isValid: errors.length === 0, 
      error: errors.length > 0 ? errors[0] : null 
    }
  }

  // Real-time input filtering based on field type and validation rules
  function filterAndValidateInput(value, field) {
    console.log('🔧 DynamicFormRenderer: filterAndValidateInput called', { value, fieldType: field.type })
    
    // TEMPORARY: Return value as-is for all field types to test
    // This will help us identify if filtering is causing the issue
    return value
    
    /* ORIGINAL FILTERING CODE - TEMPORARILY DISABLED
    let filteredValue = value

    switch (field.type) {
      case 'number':
        // Allow only numbers, decimal point, and minus sign
        filteredValue = value.replace(/[^0-9.-]/g, '')
        
        // Ensure only one decimal point
        const parts = filteredValue.split('.')
        if (parts.length > 2) {
          filteredValue = parts[0] + '.' + parts.slice(1).join('')
        }
        
        // Ensure minus sign only at the beginning
        const minusCount = (filteredValue.match(/-/g) || []).length
        if (minusCount > 1) {
          filteredValue = filteredValue.replace(/-/g, '')
          if (value.startsWith('-')) {
            filteredValue = '-' + filteredValue
          }
        }
        
        // If integer only, remove decimal point
        if (field.validation?.integer && filteredValue.includes('.')) {
          filteredValue = filteredValue.split('.')[0]
        }
        break

      case 'text':
        // Apply text-specific filtering only if validation rules exist
        if (field.validation?.onlyLetters) {
          filteredValue = value.replace(/[^a-zA-ZğüşıöçĞÜŞİÖÇ\s]/g, '')
        } else if (field.validation?.noNumbers) {
          filteredValue = value.replace(/\d/g, '')
        } else if (field.validation?.alphanumeric) {
          filteredValue = value.replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ\s]/g, '')
        } else {
          // No special filtering for normal text fields - allow all characters
          filteredValue = value
        }
        
        // Apply max length if specified
        if (field.validation?.maxLength && filteredValue.length > field.validation.maxLength) {
          filteredValue = filteredValue.substring(0, field.validation.maxLength)
        }
        break

      case 'textarea':
        // For textarea, only apply max length filtering
        if (field.validation?.maxLength && filteredValue.length > field.validation.maxLength) {
          filteredValue = filteredValue.substring(0, field.validation.maxLength)
        }
        break

      case 'phone':
        // Format phone number as user types
        let cleanPhone = value.replace(/[^\d+]/g, '')
        
        // Turkish phone formatting
        if (cleanPhone.startsWith('90')) {
          cleanPhone = '+' + cleanPhone
        } else if (cleanPhone.startsWith('0') && cleanPhone.length > 1) {
          cleanPhone = '+90' + cleanPhone.substring(1)
        } else if (cleanPhone.startsWith('5') && cleanPhone.length <= 10) {
          cleanPhone = '+90' + cleanPhone
        }
        
        // Format with spaces for readability
        if (cleanPhone.startsWith('+90') && cleanPhone.length >= 6) {
          filteredValue = cleanPhone.replace(/(\+90)(\d{3})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5')
        } else {
          filteredValue = cleanPhone
        }
        break

      case 'email':
        // Convert to lowercase and remove spaces
        filteredValue = value.toLowerCase().replace(/\s/g, '')
        break

      default:
        // For all other field types, don't filter - just return original value
        filteredValue = value
        break
    }

    return filteredValue
    */
  }

  function handleFieldChange(fieldId, value, isCustomField = false, field = null) {
    console.log('� handleFieldChange CALLED!', { 
      fieldId, 
      value, 
      isCustomField, 
      fieldType: field?.type,
      formDataBefore: formData 
    })
    
    // Apply input filtering and formatting based on field type
    let filteredValue = value
    if (field) {
      filteredValue = filterAndValidateInput(value, field)
      console.log('🔧 DynamicFormRenderer: Value filtered', { original: value, filtered: filteredValue })
    }

    // Update form data
    if (isCustomField) {
      console.log('📝 Updating custom field:', fieldId, filteredValue)
      setFormData(prev => ({
        ...prev,
        customFields: {
          ...prev.customFields,
          [fieldId]: filteredValue
        }
      }))
    } else {
      console.log('📝 Updating regular field:', fieldId, filteredValue)
      setFormData(prev => ({
        ...prev,
        [fieldId]: filteredValue
      }))
    }

    // Perform real-time validation if field exists
    if (field) {
      const validation = validateFieldInput(field, filteredValue)
      
      // Update errors state
      setErrors(prev => {
        const newErrors = { ...prev }
        if (!validation.isValid) {
          newErrors[fieldId] = validation.error
        } else {
          delete newErrors[fieldId]
        }
        return newErrors
      })
    }
  }

  function validateForm() {
    const newErrors = {}
    
    // Get all fields (fixed + custom)
    const customFields = formConfig?.fields || formConfig?.formStructure?.fields || []
    const allFields = [...FIXED_DEFAULT_FIELDS, ...customFields]

    allFields.forEach(field => {
      const isCustomField = !FIXED_DEFAULT_FIELDS.some(df => df.id === field.id)
      const value = isCustomField ? formData.customFields?.[field.id] : formData[field.id]
      
      const validation = validateFieldInput(field, value)
      if (!validation.isValid) {
        newErrors[field.id] = validation.error
      }
    })
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    
    const isValid = validateForm()
    if (!isValid) {
      showNotification('Lütfen form hatalarını düzeltin', 'error')
      return
    }

    try {
      setSubmitting(true)

      // Prepare quote data
      const quoteData = {
        id: uid(),
        createdAt: new Date().toISOString(),
        status: 'new',
        
        // Fixed fields
        name: formData.name,
        company: formData.company,
        proj: formData.proj,
        phone: formData.phone,
        email: formData.email,
        
        // Custom fields
        customFields: formData.customFields || {},
        
        // Form metadata
        formVersion: formConfig?.version,
        formConfigSnapshot: formConfig
      }

      await onSubmit(quoteData)
      showNotification('Teklif başarıyla gönderildi!', 'success')
    } catch (error) {
      console.error('Submit error:', error)
      showNotification('Form gönderilemedi. Lütfen tekrar deneyin.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Show loading state
  if (loading) {
    return React.createElement('div', { className: 'loading-state' },
      React.createElement('div', { style: { textAlign: 'center', padding: '40px' } },
        React.createElement('p', null, 'Form yükleniyor...'),
        React.createElement('p', { style: { fontSize: '12px', color: '#666' } }, 'Form konfigürasyonu API\'den alınıyor...')
      )
    )
  }

  // Show error state if config couldn't be loaded
  if (!loading && !formConfig) {
    return React.createElement('div', { className: 'error-state' },
      React.createElement('div', { style: { textAlign: 'center', padding: '40px' } },
        React.createElement('p', { style: { color: 'red' } }, 'Form konfigürasyonu yüklenemedi'),
        React.createElement('p', { style: { fontSize: '12px', color: '#666' } }, 'Lütfen sayfayı yenileyin veya admin ile iletişime geçin.')
      )
    )
  }

  function renderField(field, isCustomField = false) {
    console.log('🔧 DynamicFormRenderer: Rendering field', { field: field.id, type: field.type, isCustomField })
    
    const fieldId = field.id
    const value = isCustomField ? formData.customFields?.[fieldId] : formData[fieldId]
    const error = errors[fieldId]
    
    console.log('🔧 DynamicFormRenderer: Field data', { fieldId, value, error })
    
    const commonProps = {
      id: fieldId,
      name: fieldId,
      'data-field-id': fieldId,
      className: error ? 'error' : '',
      tabIndex: 0,
      autoComplete: 'off',
      onChange: (e) => {
        console.log('🔥🔥 onChange EVENT FIRED!', { 
          fieldId, 
          inputValue: e.target.value, 
          event: e.type 
        })
        handleFieldChange(fieldId, e.target.value, isCustomField, field)
      },
      onInput: (e) => {
        console.log('🔥🔥 onInput EVENT FIRED!', { 
          fieldId, 
          inputValue: e.target.value, 
          event: e.type 
        })
        handleFieldChange(fieldId, e.target.value, isCustomField, field)
      },
      onKeyDown: (e) => {
        console.log('🔥🔥 onKeyDown EVENT FIRED!', { 
          fieldId, 
          key: e.key, 
          inputValue: e.target.value 
        })
      },
      onBlur: (e) => {
        const validation = validateFieldInput(field, e.target.value)
        if (!validation.isValid) {
          setErrors(prev => ({
            ...prev,
            [fieldId]: validation.error
          }))
        }
      }
    }

    let inputElement

    switch (field.type) {
      case 'text':
      case 'email':
      case 'phone':
        inputElement = React.createElement('input', {
          ...commonProps,
          type: field.type === 'phone' ? 'tel' : field.type,
          value: value || '',
          placeholder: field.placeholder || field.label,
          maxLength: field.validation?.maxLength,
          minLength: field.validation?.minLength,
          autoFocus: field.autoFocus || false
        })
        break

      case 'textarea':
        inputElement = React.createElement('textarea', {
          ...commonProps,
          value: value || '',
          placeholder: field.placeholder || field.label,
          rows: 3,
          maxLength: field.validation?.maxLength
        })
        break

      case 'number':
        inputElement = React.createElement('input', {
          ...commonProps,
          type: 'text', // Use text type to have full control over input
          inputMode: field.validation?.integer ? 'numeric' : 'decimal',
          value: value || '',
          placeholder: field.placeholder || field.label,
          'data-min': field.validation?.min,
          'data-max': field.validation?.max,
          'data-integer': field.validation?.integer || false,
          onKeyDown: (e) => {
            // Allowed keys: numbers, backspace, delete, tab, enter, arrows, decimal point, minus
            const allowedKeys = [
              'Backspace', 'Delete', 'Tab', 'Enter', 'Escape',
              'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
              'Home', 'End'
            ]
            
            const isNumber = /^[0-9]$/.test(e.key)
            const isDecimal = e.key === '.' && !field.validation?.integer
            const isMinus = e.key === '-' && !field.validation?.positive
            const isAllowed = allowedKeys.includes(e.key)
            
            // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
            if (e.ctrlKey || e.metaKey) {
              return
            }
            
            if (!isNumber && !isDecimal && !isMinus && !isAllowed) {
              e.preventDefault()
              // Visual feedback for invalid key press
              const element = e.target
              element.style.borderColor = '#ff4444'
              setTimeout(() => {
                element.style.borderColor = ''
              }, 200)
            }
            
            // Prevent multiple decimal points
            if (isDecimal && (value || '').includes('.')) {
              e.preventDefault()
            }
            
            // Prevent multiple minus signs or minus not at the beginning
            if (isMinus && ((value || '').includes('-') || e.target.selectionStart > 0)) {
              e.preventDefault()
            }
          },
          onPaste: (e) => {
            e.preventDefault()
            const paste = (e.clipboardData || window.clipboardData).getData('text')
            const cleanPaste = filterAndValidateInput(paste, field)
            
            // Update the field with cleaned paste content
            handleFieldChange(fieldId, cleanPaste, isCustomField, field)
          },
          // Add visual hints for number constraints
          title: (() => {
            const hints = []
            if (field.validation?.min !== undefined) hints.push(`Min: ${field.validation.min}`)
            if (field.validation?.max !== undefined) hints.push(`Max: ${field.validation.max}`)
            if (field.validation?.integer) hints.push('Tam sayı')
            if (field.validation?.positive) hints.push('Pozitif sayı')
            return hints.length > 0 ? hints.join(', ') : ''
          })()
        })
        break

      case 'date':
        inputElement = React.createElement('input', {
          ...commonProps,
          type: 'date',
          value: value || ''
        })
        break

      case 'dropdown':
        inputElement = React.createElement('select', {
          ...commonProps,
          value: value || ''
        },
          React.createElement('option', { value: '' }, field.placeholder || `${field.label} seçin`),
          field.options?.map(option => 
            React.createElement('option', { key: option, value: option }, option)
          )
        )
        break

      case 'radio':
        inputElement = React.createElement('div', { className: 'radio-group' },
          field.options?.map(option => 
            React.createElement('label', { key: option, className: 'radio-option' },
              React.createElement('input', {
                type: 'radio',
                name: fieldId,
                value: option,
                checked: value === option,
                onChange: (e) => handleFieldChange(fieldId, e.target.value, isCustomField)
              }),
              React.createElement('span', null, option)
            )
          )
        )
        break

      case 'multiselect':
      case 'checkbox':
        if (field.type === 'checkbox' && field.options?.length === 1) {
          // Single checkbox
          inputElement = React.createElement('label', { className: 'checkbox-single' },
            React.createElement('input', {
              type: 'checkbox',
              checked: !!value,
              onChange: (e) => handleFieldChange(fieldId, e.target.checked, isCustomField)
            }),
            React.createElement('span', null, field.options[0])
          )
        } else {
          // Multiple checkboxes
          inputElement = React.createElement('div', { className: 'checkbox-group' },
            field.options?.map(option => 
              React.createElement('label', { key: option, className: 'checkbox-option' },
                React.createElement('input', {
                  type: 'checkbox',
                  value: option,
                  checked: Array.isArray(value) ? value.includes(option) : false,
                  onChange: (e) => {
                    const currentValues = Array.isArray(value) ? value : []
                    const newValues = e.target.checked 
                      ? [...currentValues, option]
                      : currentValues.filter(v => v !== option)
                    handleFieldChange(fieldId, newValues, isCustomField)
                  }
                }),
                React.createElement('span', null, option)
              )
            )
          )
        }
        break

      case 'file':
        const currentFiles = isCustomField ? formData.customFields?.[fieldId] : formData[fieldId]
        inputElement = React.createElement('div', { className: 'file-upload-container' },
          React.createElement('div', {
            className: 'file-upload-area',
            onDragOver: (e) => {
              e.preventDefault()
              e.currentTarget.classList.add('dragover')
            },
            onDragLeave: (e) => {
              e.currentTarget.classList.remove('dragover')
            },
            onDrop: (e) => {
              e.preventDefault()
              e.currentTarget.classList.remove('dragover')
              handleFileUpload(fieldId, e.dataTransfer.files, isCustomField)
            },
            onClick: () => document.getElementById(`file-input-${fieldId}`).click()
          },
            React.createElement('input', {
              id: `file-input-${fieldId}`,
              type: 'file',
              multiple: true,
              accept: ACCEPT_EXT.map(ext => `.${ext}`).join(','),
              style: { display: 'none' },
              onChange: (e) => handleFileUpload(fieldId, e.target.files, isCustomField)
            }),
            React.createElement('div', { className: 'upload-text' },
              uploadingFiles ? 'Yükleniyor...' : 'Dosya seçin veya sürükleyip bırakın',
              React.createElement('div', { className: 'upload-help' },
                `Desteklenen formatlar: ${ACCEPT_EXT.join(', ')}`
              )
            )
          ),
          currentFiles && currentFiles.length > 0 && 
          React.createElement('div', { className: 'file-preview' },
            currentFiles.map((file, index) => 
              React.createElement('div', { key: index, className: 'file-item' },
                React.createElement('div', { className: 'file-icon' },
                  isImageExt(file.type) ? 
                    React.createElement('img', { 
                      src: file.dataUrl, 
                      alt: file.name,
                      style: { width: '40px', height: '40px', objectFit: 'cover' }
                    }) :
                    React.createElement('span', null, extOf(file.name).toUpperCase())
                ),
                React.createElement('div', { className: 'file-info' },
                  React.createElement('div', { className: 'file-name' }, file.name),
                  React.createElement('div', { className: 'file-size' }, 
                    `${(file.size / 1024).toFixed(1)} KB`
                  )
                ),
                React.createElement('button', {
                  type: 'button',
                  className: 'btn-remove',
                  onClick: () => {
                    const newFiles = currentFiles.filter((_, i) => i !== index)
                    handleFieldChange(fieldId, newFiles, isCustomField)
                  }
                }, '×')
              )
            )
          )
        )
        break

      default:
        inputElement = React.createElement('input', {
          ...commonProps,
          type: 'text',
          value: value || '',
          placeholder: field.placeholder || field.label
        })
    }

    // Create validation icon
    const validationIcon = (() => {
      if (!value) return null
      
      const validation = validateFieldInput(field, value)
      if (validation.isValid) {
        return React.createElement('span', { 
          className: 'validation-icon success',
          title: 'Geçerli' 
        }, '✓')
      } else if (validation.error) {
        return React.createElement('span', { 
          className: 'validation-icon error',
          title: validation.error 
        }, '✗')
      }
      return null
    })()

    // Add number field tooltip for constraints
    const numberTooltip = field.type === 'number' && (field.validation?.min !== undefined || field.validation?.max !== undefined) ?
      React.createElement('div', { className: 'number-field-tooltip' },
        (() => {
          const hints = []
          if (field.validation?.min !== undefined) hints.push(`Min: ${field.validation.min}`)
          if (field.validation?.max !== undefined) hints.push(`Max: ${field.validation.max}`)
          if (field.validation?.integer) hints.push('Tam sayı')
          if (field.validation?.positive) hints.push('Pozitif sayı')
          return hints.join(', ')
        })()
      ) : null

    return React.createElement('div', { 
      key: fieldId, 
      className: `field ${error ? 'has-error' : ''} ${value && !error ? 'has-success' : ''}` 
    },
      React.createElement('label', { htmlFor: fieldId },
        field.label,
        field.required && React.createElement('span', { className: 'required' }, ' *')
      ),
      React.createElement('div', { className: 'input-container', style: { position: 'relative' } },
        inputElement,
        validationIcon,
        numberTooltip
      ),
      error && React.createElement('div', { className: 'field-error' }, error)
    )
  }

  if (loading) {
    return React.createElement('div', { className: 'loading' }, 'Form yükleniyor...')
  }

  if (!formConfig) {
    return React.createElement('div', { className: 'error' }, 'Form konfigürasyonu bulunamadı')
  }

  // Use the globally defined fixed fields with display order
  const fixedFieldsWithOrder = FIXED_DEFAULT_FIELDS.map((field, index) => ({
    ...field,
    display: { formOrder: index + 1 },
    autoFocus: index === 0 // First field gets auto focus
  }))

  // Get custom fields from form config
  const customFields = formConfig?.fields || formConfig?.formStructure?.fields || []
  
  // Assign proper form order to custom fields that don't have one
  const customFieldsWithOrder = customFields.map((field, index) => ({
    ...field,
    display: {
      ...field.display,
      formOrder: field.display?.formOrder ?? (10 + index) // Start custom fields from order 10
    }
  }))

  // Sort fields by form order
  const allFields = [
    ...fixedFieldsWithOrder,
    ...customFieldsWithOrder
  ].sort((a, b) => (a.display?.formOrder || 0) - (b.display?.formOrder || 0))
  
  return React.createElement('div', { className: 'container' },
    React.createElement('form', { onSubmit: handleSubmit, className: 'dynamic-form' },
      React.createElement('div', { className: 'form-fields' },
        allFields.map(field => {
          const isCustomField = !FIXED_DEFAULT_FIELDS.some(df => df.id === field.id)
          return renderField(field, isCustomField)
        })
      ),

      React.createElement('div', { className: 'form-actions' },
        React.createElement('button', {
          type: 'submit',
          className: 'btn accent',
          disabled: submitting
        }, submitting ? 'Gönderiliyor...' : 'Teklif Gönder')
      )
    )
  )
}