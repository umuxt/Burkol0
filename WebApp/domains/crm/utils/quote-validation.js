/**
 * Quote Validation Utilities
 * Centralized validation functions for quote creation flow
 */

// Email regex pattern
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Phone regex pattern (Turkish format)
const PHONE_REGEX = /^[\d\s\-\+\(\)]{7,20}$/

/**
 * Validate a single field value
 * @param {Object} field - Field definition
 * @param {any} value - Field value
 * @returns {{ isValid: boolean, error?: string }}
 */
export function validateFieldValue(field, value) {
  const { type, required, validation, label, id } = field
  const fieldLabel = label || id
  
  // Check required
  if (required) {
    if (value === undefined || value === null || value === '') {
      return { isValid: false, error: `${fieldLabel} zorunludur` }
    }
    if (Array.isArray(value) && value.length === 0) {
      return { isValid: false, error: `${fieldLabel} zorunludur` }
    }
    if (typeof value === 'string' && value.trim() === '') {
      return { isValid: false, error: `${fieldLabel} zorunludur` }
    }
  }
  
  // If not required and empty, skip validation
  if (!value || (typeof value === 'string' && value.trim() === '')) {
    return { isValid: true }
  }
  
  // Type-specific validation
  switch (type) {
    case 'email':
      if (!EMAIL_REGEX.test(value)) {
        return { isValid: false, error: 'Geçerli bir e-posta adresi girin' }
      }
      break
      
    case 'phone':
      if (!PHONE_REGEX.test(value)) {
        return { isValid: false, error: 'Geçerli bir telefon numarası girin' }
      }
      break
      
    case 'number':
      const numVal = parseFloat(value)
      if (isNaN(numVal)) {
        return { isValid: false, error: 'Geçerli bir sayı girin' }
      }
      if (validation?.min !== undefined && numVal < validation.min) {
        return { isValid: false, error: `Minimum değer: ${validation.min}` }
      }
      if (validation?.max !== undefined && numVal > validation.max) {
        return { isValid: false, error: `Maksimum değer: ${validation.max}` }
      }
      if (validation?.integer && !Number.isInteger(numVal)) {
        return { isValid: false, error: 'Tam sayı girin' }
      }
      break
      
    case 'text':
    case 'textarea':
      if (validation?.minLength && value.length < validation.minLength) {
        return { isValid: false, error: `Minimum ${validation.minLength} karakter gerekli` }
      }
      if (validation?.maxLength && value.length > validation.maxLength) {
        return { isValid: false, error: `Maksimum ${validation.maxLength} karakter` }
      }
      if (validation?.pattern) {
        try {
          const regex = new RegExp(validation.pattern)
          if (!regex.test(value)) {
            return { isValid: false, error: validation.patternMessage || 'Geçersiz format' }
          }
        } catch (e) {
          console.warn('Invalid regex pattern:', validation.pattern)
        }
      }
      break
      
    case 'date':
      const dateVal = new Date(value)
      if (isNaN(dateVal.getTime())) {
        return { isValid: false, error: 'Geçerli bir tarih girin' }
      }
      if (validation?.minDate) {
        const minDate = new Date(validation.minDate)
        if (dateVal < minDate) {
          return { isValid: false, error: `Tarih ${validation.minDate} sonrası olmalı` }
        }
      }
      if (validation?.maxDate) {
        const maxDate = new Date(validation.maxDate)
        if (dateVal > maxDate) {
          return { isValid: false, error: `Tarih ${validation.maxDate} öncesi olmalı` }
        }
      }
      break
      
    case 'select':
    case 'radio':
      if (field.options && !field.options.includes(value)) {
        return { isValid: false, error: 'Geçerli bir seçenek seçin' }
      }
      break
      
    case 'multiselect':
    case 'checkbox':
      if (Array.isArray(value)) {
        if (validation?.minItems && value.length < validation.minItems) {
          return { isValid: false, error: `En az ${validation.minItems} seçim yapın` }
        }
        if (validation?.maxItems && value.length > validation.maxItems) {
          return { isValid: false, error: `En fazla ${validation.maxItems} seçim yapabilirsiniz` }
        }
      }
      break
  }
  
  return { isValid: true }
}

/**
 * Validate Step 1 - Customer data
 * @param {Object} data - Customer step data
 * @returns {{ isValid: boolean, errors: Object }}
 */
export function validateCustomerStep(data) {
  const errors = {}
  const { customerType, selectedCustomer, customerData, projectName } = data
  
  // Proje adı zorunlu - YENİ QT-3
  if (!projectName || !projectName.trim()) {
    errors.projectName = 'Proje adı zorunludur'
  }
  
  if (customerType === 'existing') {
    if (!selectedCustomer) {
      errors.selectedCustomer = 'Lütfen bir müşteri seçin'
    }
  } else {
    // new or without - name is required
    if (!customerData?.name?.trim()) {
      errors.name = 'Müşteri adı zorunludur'
    }
    
    // Email validation (if provided)
    if (customerData?.email && !EMAIL_REGEX.test(customerData.email)) {
      errors.email = 'Geçerli bir e-posta adresi girin'
    }
    
    // Phone validation (if provided)
    if (customerData?.phone && !PHONE_REGEX.test(customerData.phone)) {
      errors.phone = 'Geçerli bir telefon numarası girin'
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  }
}

/**
 * Validate Step 2 - Form fields
 * @param {Array} fields - Form field definitions
 * @param {Object} formData - Form data values
 * @returns {{ isValid: boolean, errors: Object }}
 */
export function validateFormStep(fields, formData) {
  const errors = {}
  
  for (const field of fields) {
    const value = formData[field.id]
    const validation = validateFieldValue(field, value)
    
    if (!validation.isValid) {
      errors[field.id] = validation.error
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  }
}

/**
 * Validate full quote data before submit
 * @param {Object} quoteData - Complete quote data
 * @param {Array} fields - Form field definitions
 * @returns {{ isValid: boolean, errors: Object, step?: number }}
 */
export function validateQuoteData(quoteData, fields) {
  // Validate customer step
  const customerValidation = validateCustomerStep({
    customerType: quoteData.customerType,
    selectedCustomer: quoteData.selectedCustomer,
    customerData: quoteData.customerData
  })
  
  if (!customerValidation.isValid) {
    return {
      isValid: false,
      errors: customerValidation.errors,
      step: 1
    }
  }
  
  // Validate form step
  const formValidation = validateFormStep(fields, quoteData.formData || {})
  
  if (!formValidation.isValid) {
    return {
      isValid: false,
      errors: formValidation.errors,
      step: 2
    }
  }
  
  return { isValid: true, errors: {} }
}

/**
 * Get field display value for review
 * @param {Object} field - Field definition
 * @param {any} value - Field value
 * @returns {string}
 */
export function getFieldDisplayValue(field, value) {
  if (value === undefined || value === null || value === '') {
    return '-'
  }
  
  switch (field.type) {
    case 'date':
      try {
        return new Date(value).toLocaleDateString('tr-TR')
      } catch {
        return value
      }
      
    case 'number':
      if (field.validation?.currency) {
        return new Intl.NumberFormat('tr-TR', { 
          style: 'currency', 
          currency: field.validation.currency 
        }).format(value)
      }
      return value.toString()
      
    case 'multiselect':
    case 'checkbox':
      if (Array.isArray(value)) {
        return value.join(', ')
      }
      return value
      
    case 'radio':
    case 'select':
      return value
      
    default:
      return value.toString()
  }
}

export default {
  validateFieldValue,
  validateCustomerStep,
  validateFormStep,
  validateQuoteData,
  getFieldDisplayValue
}
