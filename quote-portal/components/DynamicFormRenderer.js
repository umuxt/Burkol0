import API from '../lib/api.js'
import { uid, ACCEPT_EXT, MAX_FILES, MAX_FILE_MB, extOf, readFileAsDataUrl, isImageExt } from '../lib/utils.js'

const { useState, useEffect } = React

export default function DynamicFormRenderer({ onSubmit, initialData = {}, showNotification, t }) {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [formConfig, setFormConfig] = useState(null)
  const [formData, setFormData] = useState({ ...initialData, customFields: initialData.customFields || {} })
  const [errors, setErrors] = useState({})
  const [uploadingFiles, setUploadingFiles] = useState(false)

  useEffect(() => {
    loadFormConfig()
  }, [])

  useEffect(() => {
    setFormData({ ...initialData, customFields: initialData.customFields || {} })
  }, [initialData])

  async function loadFormConfig() {
    try {
      setLoading(true)
      const config = await API.getFormConfig()
      console.log('DynamicFormRenderer: Loaded form config:', config)
      setFormConfig(config.formConfig)
    } catch (error) {
      console.error('Load form config error:', error)
      showNotification('Form konfigürasyonu yüklenemedi', 'error')
    } finally {
      setLoading(false)
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

    // Type-specific validation
    switch (fieldType) {
      case 'number':
        // Only allow numbers, decimal points, and minus sign
        if (value && !/^-?\d*\.?\d*$/.test(value)) {
          return { isValid: false, error: 'Sadece sayısal değer girebilirsiniz' }
        }
        
        const numValue = parseFloat(value)
        if (value && !isNaN(numValue)) {
          if (validation.min !== undefined && numValue < validation.min) {
            errors.push(`Minimum değer: ${validation.min}`)
          }
          if (validation.max !== undefined && numValue > validation.max) {
            errors.push(`Maximum değer: ${validation.max}`)
          }
        }
        break

      case 'email':
        if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          return { isValid: false, error: 'Geçerli bir e-posta adresi giriniz' }
        }
        break

      case 'phone':
        // Turkish phone number validation
        if (value && !/^(\+90|0)?[5][0-9]{9}$/.test(value.replace(/\s/g, ''))) {
          return { isValid: false, error: 'Geçerli bir telefon numarası giriniz (örn: 05551234567)' }
        }
        break

      case 'text':
      case 'textarea':
        // Text length validation
        if (validation.minLength && value && value.length < validation.minLength) {
          errors.push(`Minimum ${validation.minLength} karakter gerekli`)
        }
        if (validation.maxLength && value && value.length > validation.maxLength) {
          errors.push(`Maximum ${validation.maxLength} karakter`)
        }
        break
    }

    // Required field validation
    if (field.required && (!value || value.trim() === '')) {
      return { isValid: false, error: 'Bu alan zorunludur' }
    }

    return { 
      isValid: errors.length === 0, 
      error: errors.length > 0 ? errors[0] : null 
    }
  }

  // Real-time input filtering for number fields
  function filterNumericInput(value, field) {
    if (field.type !== 'number') return value
    
    // Allow empty, numbers, decimal point, and minus sign
    const filtered = value.replace(/[^0-9.-]/g, '')
    
    // Ensure only one decimal point
    const parts = filtered.split('.')
    if (parts.length > 2) {
      return parts[0] + '.' + parts.slice(1).join('')
    }
    
    // Ensure minus sign only at the beginning
    const minusCount = (filtered.match(/-/g) || []).length
    if (minusCount > 1) {
      return filtered.replace(/-/g, '').replace(/^/, filtered.startsWith('-') ? '-' : '')
    }
    
    return filtered
  }

  function handleFieldChange(fieldId, value, isCustomField = false, field = null) {
    // Apply input filtering for number fields
    if (field && field.type === 'number') {
      value = filterNumericInput(value, field)
    }

    // Perform real-time validation
    if (field) {
      const validation = validateFieldInput(field, value)
      if (!validation.isValid && value) {
        // For real-time feedback, only show error if there's a value
        setErrors(prev => ({
          ...prev,
          [fieldId]: validation.error
        }))
      } else {
        // Clear error if input is valid
        setErrors(prev => {
          const newErrors = { ...prev }
          delete newErrors[fieldId]
          return newErrors
        })
      }
    }

    if (isCustomField) {
      setFormData(prev => ({
        ...prev,
        customFields: {
          ...prev.customFields,
          [fieldId]: value
        }
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        [fieldId]: value
      }))
    }

    // Clear error when user starts typing
    if (errors[fieldId]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[fieldId]
        return newErrors
      })
    }
  }

  function validateForm() {
    const newErrors = {}
    
    // Get all fields (fixed + custom)
    const fixedDefaultFields = [
      { id: 'name', label: 'Müşteri Adı', type: 'text', required: true },
      { id: 'company', label: 'Şirket', type: 'text', required: false },
      { id: 'proj', label: 'Proje Adı', type: 'text', required: true },
      { id: 'phone', label: 'Telefon', type: 'phone', required: true },
      { id: 'email', label: 'E-posta', type: 'email', required: true }
    ]
    
    const customFields = formConfig?.fields || formConfig?.formStructure?.fields || []
    const allFields = [...fixedDefaultFields, ...customFields]

    allFields.forEach(field => {
      const isCustomField = !fixedDefaultFields.some(df => df.id === field.id)
      const value = isCustomField ? formData.customFields?.[field.id] : formData[field.id]
      // Use the enhanced validation function
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

      // Prepare quote data with current config version
      const quoteData = {
        id: uid(),
        createdAt: new Date().toISOString(),
        status: 'new',
        
        // Add fixed fields
        name: formData.name,
        company: formData.company,
        proj: formData.proj,
        phone: formData.phone,
        email: formData.email,
        
        // Add custom fields if any
        customFields: formData.customFields || {},
        
        // Add form metadata
        formVersion: formConfig?.version,
        formConfigSnapshot: formConfig
      }

      // Additional form data mapping for backward compatibility
      Object.entries(formData).forEach(([key, value]) => {
        if (!['name', 'company', 'proj', 'phone', 'email', 'customFields'].includes(key)) {
          quoteData[key] = value
        }
      })

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
    const fieldId = field.id
    const value = isCustomField ? formData.customFields?.[fieldId] : formData[fieldId]
    const error = errors[fieldId]
    
    const commonProps = {
      id: fieldId,
      name: fieldId,
      'data-field-id': fieldId,
      className: error ? 'error' : '',
      onChange: (e) => handleFieldChange(fieldId, e.target.value, isCustomField, field),
      onBlur: (e) => {
        // Validate on blur for better UX
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
          minLength: field.validation?.minLength
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
          inputMode: 'decimal',
          value: value || '',
          placeholder: field.placeholder || field.label,
          'data-min': field.validation?.min,
          'data-max': field.validation?.max,
          onKeyPress: (e) => {
            // Only allow numbers, decimal point, and minus sign
            const allowedChars = /[0-9.-]/
            if (!allowedChars.test(e.key) && e.key !== 'Backspace' && e.key !== 'Delete' && e.key !== 'Tab' && e.key !== 'Enter') {
              e.preventDefault()
            }
          },
          onPaste: (e) => {
            // Prevent paste of non-numeric content
            const paste = (e.clipboardData || window.clipboardData).getData('text')
            if (!/^-?\d*\.?\d*$/.test(paste)) {
              e.preventDefault()
            }
          }
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

    return React.createElement('div', { key: fieldId, className: 'field' },
      React.createElement('label', { htmlFor: fieldId },
        field.label,
        field.required && React.createElement('span', { className: 'required' }, ' *')
      ),
      inputElement,
      error && React.createElement('div', { className: 'field-error' }, error)
    )
  }

  if (loading) {
    return React.createElement('div', { className: 'loading' }, 'Form yükleniyor...')
  }

  if (!formConfig) {
    return React.createElement('div', { className: 'error' }, 'Form konfigürasyonu bulunamadı')
  }

  // Fixed default fields that admin cannot modify
  const fixedDefaultFields = [
    {
      id: 'name',
      label: 'Müşteri Adı',
      type: 'text',
      required: true,
      display: { formOrder: 1 }
    },
    {
      id: 'company',
      label: 'Şirket',
      type: 'text',
      required: false,
      display: { formOrder: 2 }
    },
    {
      id: 'proj',
      label: 'Proje Adı',
      type: 'text',
      required: true,
      display: { formOrder: 3 }
    },
    {
      id: 'phone',
      label: 'Telefon',
      type: 'phone',
      required: true,
      display: { formOrder: 4 }
    },
    {
      id: 'email',
      label: 'E-posta',
      type: 'email',
      required: true,
      display: { formOrder: 5 }
    }
  ]

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
    ...fixedDefaultFields,
    ...customFieldsWithOrder
  ].sort((a, b) => (a.display?.formOrder || 0) - (b.display?.formOrder || 0))
  
  return React.createElement('div', { className: 'container' },
    React.createElement('form', { onSubmit: handleSubmit, className: 'dynamic-form' },
      React.createElement('div', { className: 'form-fields' },
        allFields.map(field => {
          const isCustomField = !fixedDefaultFields.some(df => df.id === field.id)
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