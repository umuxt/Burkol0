// Form Builder Utilities - Helper functions and validation
export const FormBuilderUtils = {
  // Generate unique field ID
  generateFieldId: () => {
    return 'field_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  },

  // Field type definitions with properties
  fieldTypes: {
    text: {
      label: 'Metin',
      icon: '📝',
      hasOptions: false,
      hasPlaceholder: true,
      hasValidation: true,
      defaultProps: {
        type: 'text',
        required: false,
        placeholder: '',
        validation: { min: 0, max: 255 }
      }
    },
    textarea: {
      label: 'Uzun Metin',
      icon: '📄',
      hasOptions: false,
      hasPlaceholder: true,
      hasValidation: true,
      defaultProps: {
        type: 'textarea',
        required: false,
        placeholder: '',
        validation: { min: 0, max: 1000 }
      }
    },
    number: {
      label: 'Sayı',
      icon: '🔢',
      hasOptions: false,
      hasPlaceholder: true,
      hasValidation: true,
      defaultProps: {
        type: 'number',
        required: false,
        placeholder: '',
        validation: { min: 0, max: 999999 }
      }
    },
    email: {
      label: 'E-posta',
      icon: '📧',
      hasOptions: false,
      hasPlaceholder: true,
      hasValidation: false,
      defaultProps: {
        type: 'email',
        required: false,
        placeholder: 'ornek@email.com'
      }
    },
    phone: {
      label: 'Telefon',
      icon: '📞',
      hasOptions: false,
      hasPlaceholder: true,
      hasValidation: true,
      defaultProps: {
        type: 'phone',
        required: false,
        placeholder: '+90 555 123 45 67',
        validation: { min: 10, max: 15 }
      }
    },
    dropdown: {
      label: 'Açılır Liste',
      icon: '📋',
      hasOptions: true,
      hasPlaceholder: false,
      hasValidation: false,
      defaultProps: {
        type: 'dropdown',
        required: false,
        options: ['Seçenek 1', 'Seçenek 2', 'Seçenek 3']
      }
    },
    multiselect: {
      label: 'Çoklu Seçim',
      icon: '☑️',
      hasOptions: true,
      hasPlaceholder: false,
      hasValidation: false,
      defaultProps: {
        type: 'multiselect',
        required: false,
        options: ['Seçenek 1', 'Seçenek 2', 'Seçenek 3']
      }
    },
    radio: {
      label: 'Seçenek Butonları',
      icon: '🔘',
      hasOptions: true,
      hasPlaceholder: false,
      hasValidation: false,
      defaultProps: {
        type: 'radio',
        required: false,
        options: ['Seçenek 1', 'Seçenek 2', 'Seçenek 3']
      }
    },
    checkbox: {
      label: 'Onay Kutusu',
      icon: '☑️',
      hasOptions: false,
      hasPlaceholder: true,
      hasValidation: false,
      defaultProps: {
        type: 'checkbox',
        required: false,
        placeholder: 'Şartları kabul ediyorum'
      }
    },
    date: {
      label: 'Tarih',
      icon: '📅',
      hasOptions: false,
      hasPlaceholder: false,
      hasValidation: false,
      defaultProps: {
        type: 'date',
        required: false
      }
    },
    file: {
      label: 'Dosya',
      icon: '📎',
      hasOptions: false,
      hasPlaceholder: false,
      hasValidation: false,
      defaultProps: {
        type: 'file',
        required: false
      }
    }
  },

  // Create new field with default properties
  createNewField: (type, customProps = {}) => {
    const fieldType = FormBuilderUtils.fieldTypes[type]
    if (!fieldType) {
      throw new Error(`Desteklenmeyen alan türü: ${type}`)
    }

    return {
      id: FormBuilderUtils.generateFieldId(),
      label: `Yeni ${fieldType.label}`,
      ...fieldType.defaultProps,
      display: {
        showInTable: true,
        showInFilter: false,
        order: 0
      },
      ...customProps
    }
  },

  // Validate field configuration
  validateField: (field) => {
    const errors = []

    if (!field.id) {
      errors.push('Alan ID\'si gereklidir')
    }

    if (!field.label || field.label.trim() === '') {
      errors.push('Alan etiketi gereklidir')
    }

    if (!field.type) {
      errors.push('Alan türü gereklidir')
    }

    const fieldType = FormBuilderUtils.fieldTypes[field.type]
    if (!fieldType) {
      errors.push(`Desteklenmeyen alan türü: ${field.type}`)
    }

    // Options validation for fields that require them
    if (fieldType?.hasOptions && (!field.options || field.options.length === 0)) {
      errors.push('Bu alan türü için seçenekler gereklidir')
    }

    // Validation rules check
    if (field.validation) {
      if (field.validation.min !== undefined && field.validation.max !== undefined) {
        if (field.validation.min > field.validation.max) {
          errors.push('Minimum değer maksimum değerden büyük olamaz')
        }
      }
    }

    return errors
  },

  // Validate entire form configuration
  validateForm: (fields) => {
    const errors = []
    const usedIds = new Set()

    if (!fields || fields.length === 0) {
      errors.push('Form en az bir alan içermelidir')
      return errors
    }

    fields.forEach((field, index) => {
      // Check for duplicate IDs
      if (usedIds.has(field.id)) {
        errors.push(`Alan ${index + 1}: Dublicate ID "${field.id}"`)
      } else {
        usedIds.add(field.id)
      }

      // Validate individual field
      const fieldErrors = FormBuilderUtils.validateField(field)
      fieldErrors.forEach(error => {
        errors.push(`Alan ${index + 1} (${field.label}): ${error}`)
      })
    })

    return errors
  },

  // Export form configuration as JSON
  exportFormConfig: (fields, formSettings = {}) => {
    const config = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      settings: {
        title: formSettings.title || 'Yeni Form',
        description: formSettings.description || '',
        submitButtonText: formSettings.submitButtonText || 'Gönder',
        ...formSettings
      },
      fields: fields.map(field => ({
        ...field,
        // Ensure all required properties exist
        display: {
          showInTable: true,
          showInFilter: false,
          order: 0,
          ...field.display
        }
      }))
    }

    return JSON.stringify(config, null, 2)
  },

  // Import form configuration from JSON
  importFormConfig: (jsonString) => {
    try {
      const config = JSON.parse(jsonString)
      
      if (!config.fields || !Array.isArray(config.fields)) {
        throw new Error('Geçersiz form yapılandırması: fields array bulunamadı')
      }

      // Validate imported fields
      const validationErrors = FormBuilderUtils.validateForm(config.fields)
      if (validationErrors.length > 0) {
        throw new Error('İçe aktarılan form geçersiz:\n' + validationErrors.join('\n'))
      }

      return {
        fields: config.fields,
        settings: config.settings || {}
      }
    } catch (error) {
      throw new Error(`Form içe aktarılırken hata: ${error.message}`)
    }
  },

  // Reorder fields
  reorderFields: (fields, fromIndex, toIndex) => {
    const newFields = [...fields]
    const [movedField] = newFields.splice(fromIndex, 1)
    newFields.splice(toIndex, 0, movedField)
    
    // Update order property
    return newFields.map((field, index) => ({
      ...field,
      display: {
        ...field.display,
        order: index
      }
    }))
  },

  // Clone field
  cloneField: (field) => {
    const clonedField = {
      ...field,
      id: FormBuilderUtils.generateFieldId(),
      label: `${field.label} (Kopya)`
    }
    return clonedField
  },

  // Get field summary for display
  getFieldSummary: (field) => {
    const summary = {
      id: field.id,
      label: field.label,
      type: field.type,
      typeLabel: FormBuilderUtils.fieldTypes[field.type]?.label || field.type,
      required: field.required,
      hasOptions: field.options && field.options.length > 0,
      optionsCount: field.options ? field.options.length : 0,
      showInTable: field.display?.showInTable,
      showInFilter: field.display?.showInFilter
    }
    return summary
  },

  // Generate form statistics
  getFormStatistics: (fields) => {
    const stats = {
      totalFields: fields.length,
      requiredFields: fields.filter(f => f.required).length,
      optionalFields: fields.filter(f => !f.required).length,
      tableFields: fields.filter(f => f.display?.showInTable).length,
      filterFields: fields.filter(f => f.display?.showInFilter).length,
      fieldTypes: {}
    }

    // Count field types
    fields.forEach(field => {
      const typeLabel = FormBuilderUtils.fieldTypes[field.type]?.label || field.type
      stats.fieldTypes[typeLabel] = (stats.fieldTypes[typeLabel] || 0) + 1
    })

    return stats
  },

  // Check if form has unsaved changes
  hasUnsavedChanges: (currentFields, savedFields) => {
    return JSON.stringify(currentFields) !== JSON.stringify(savedFields)
  }
}