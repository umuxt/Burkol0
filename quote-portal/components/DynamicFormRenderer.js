import API from '../lib/api.js'
import { uid, ACCEPT_EXT, MAX_FILES, MAX_FILE_MB, extOf, readFileAsDataUrl, isImageExt } from '../lib/utils.js'

const { useState, useEffect } = React

export default function DynamicFormRenderer({ onSubmit, initialData = {}, showNotification, t }) {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [formConfig, setFormConfig] = useState(null)
  const [formData, setFormData] = useState(initialData)
  const [errors, setErrors] = useState({})
  const [uploadingFiles, setUploadingFiles] = useState(false)

  useEffect(() => {
    loadFormConfig()
  }, [])

  useEffect(() => {
    setFormData(initialData)
  }, [initialData])

  async function loadFormConfig() {
    try {
      setLoading(true)
      const config = await API.getFormConfig()
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

  function handleFieldChange(fieldId, value, isCustomField = false) {
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
    
    if (!formConfig) return newErrors

    // Validate default fields
    formConfig.defaultFields?.forEach(field => {
      if (field.required && !formData[field.id]?.toString().trim()) {
        newErrors[field.id] = `${field.label} alanı zorunludur`
      }

      // Type-specific validation
      if (formData[field.id]) {
        if (field.type === 'email' && formData[field.id]) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
          if (!emailRegex.test(formData[field.id])) {
            newErrors[field.id] = 'Geçerli bir e-posta adresi girin'
          }
        }

        if (field.type === 'number' && formData[field.id]) {
          if (isNaN(Number(formData[field.id]))) {
            newErrors[field.id] = 'Geçerli bir sayı girin'
          }
        }
      }
    })

    // Validate custom fields
    formConfig.fields?.forEach(field => {
      const value = formData.customFields?.[field.id]
      
      if (field.required) {
        if (Array.isArray(value)) {
          if (!value || value.length === 0) {
            newErrors[field.id] = `${field.label} alanı zorunludur`
          }
        } else {
          if (!value?.toString().trim()) {
            newErrors[field.id] = `${field.label} alanı zorunludur`
          }
        }
      }

      // Type-specific validation
      if (value) {
        if (field.type === 'email') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
          if (!emailRegex.test(value)) {
            newErrors[field.id] = 'Geçerli bir e-posta adresi girin'
          }
        }

        if (field.type === 'number') {
          if (isNaN(Number(value))) {
            newErrors[field.id] = 'Geçerli bir sayı girin'
          }
          
          // Min/Max validation
          const numValue = Number(value)
          if (field.validation?.min !== null && numValue < field.validation.min) {
            newErrors[field.id] = `Minimum değer: ${field.validation.min}`
          }
          if (field.validation?.max !== null && numValue > field.validation.max) {
            newErrors[field.id] = `Maksimum değer: ${field.validation.max}`
          }
        }

        if (field.type === 'text' && field.validation?.pattern) {
          const regex = new RegExp(field.validation.pattern)
          if (!regex.test(value)) {
            newErrors[field.id] = 'Geçersiz format'
          }
        }
      }
    })

    return newErrors
  }

  async function handleSubmit(e) {
    e.preventDefault()
    
    const validationErrors = validateForm()
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length > 0) {
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
        configVersion: formConfig.version,
        
        // Core fields
        ...Object.fromEntries(
          formConfig.defaultFields?.map(field => [field.id, formData[field.id] || '']) || []
        ),
        
        // Custom fields
        customFields: formData.customFields || {},
        
        // Pricing info (will be calculated by server)
        pricing: {
          calculatedPrice: 0,
          configVersion: formConfig.version,
          isLegacy: false,
          needsUpdate: false,
          pricingError: false,
          lastCalculated: new Date().toISOString()
        }
      }

      await onSubmit(quoteData)
      
      // Reset form
      setFormData({})
      setErrors({})
      
    } catch (error) {
      console.error('Submit error:', error)
      showNotification('Form gönderilemedi. Lütfen tekrar deneyin.', 'error')
    } finally {
      setSubmitting(false)
    }
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
      onChange: (e) => handleFieldChange(fieldId, e.target.value, isCustomField)
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
          placeholder: field.placeholder || field.label
        })
        break

      case 'textarea':
        inputElement = React.createElement('textarea', {
          ...commonProps,
          value: value || '',
          placeholder: field.placeholder || field.label,
          rows: 3
        })
        break

      case 'number':
        inputElement = React.createElement('input', {
          ...commonProps,
          type: 'number',
          value: value || '',
          placeholder: field.placeholder || field.label,
          min: field.validation?.min,
          max: field.validation?.max
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

  // Sort fields by form order
  const allFields = [
    ...fixedDefaultFields,
    ...(formConfig.fields || [])
  ].sort((a, b) => (a.display?.formOrder || 0) - (b.display?.formOrder || 0))

  return React.createElement('form', { onSubmit: handleSubmit, className: 'dynamic-form' },
    React.createElement('div', { className: 'form-fields' },
      allFields.map(field => {
        const isCustomField = !formConfig.defaultFields?.some(df => df.id === field.id)
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
}