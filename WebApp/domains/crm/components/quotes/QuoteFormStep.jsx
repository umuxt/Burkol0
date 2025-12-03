import React, { useState, useEffect, useCallback } from 'react'
import { validateFieldValue } from '../../utils/quote-validation.js'
import { Paperclip, FileEdit } from '../../../../shared/components/Icons.jsx'

/**
 * QuoteFormStep - Step 2 of quote creation
 * Renders dynamic form fields from active form template
 */
export default function QuoteFormStep({
  formConfig,
  formData,
  onChange,
  errors = {},
  onFieldError
}) {
  // Local warnings for live validation
  const [warnings, setWarnings] = useState({})
  
  // Get fields from form config
  const getFields = useCallback(() => {
    if (!formConfig) return []
    return formConfig.formStructure?.fields || formConfig.fields || []
  }, [formConfig])

  // Group fields by category (if available)
  const getGroupedFields = useCallback(() => {
    const fields = getFields()
    const groups = {}
    
    fields.forEach(field => {
      const group = field.group || field.category || 'Genel Bilgiler'
      if (!groups[group]) {
        groups[group] = []
      }
      groups[group].push(field)
    })
    
    return groups
  }, [getFields])

  // Handle field change
  function handleFieldChange(fieldId, value, field) {
    // Create a synthetic event for compatibility with AddQuoteModal's handleInputChange
    const syntheticEvent = {
      target: {
        name: fieldId,
        value: value
      }
    }
    
    // Update form data via parent callback
    onChange(syntheticEvent)
    
    // Clear error for this field if valid
    const validation = validateFieldValue(field, value)
    if (validation.isValid && errors[fieldId]) {
      if (onFieldError) {
        onFieldError(fieldId, null)
      }
    }
    
    // Clear warning
    if (warnings[fieldId]) {
      setWarnings(prev => {
        const next = { ...prev }
        delete next[fieldId]
        return next
      })
    }
  }

  // Handle blur - validate field
  function handleBlur(field) {
    const value = formData[field.id]
    const validation = validateFieldValue(field, value)
    
    if (!validation.isValid && onFieldError) {
      onFieldError(field.id, validation.error)
    }
  }

  // Render single field
  function renderField(field) {
    const { id, label, type, required, placeholder, options, validation, readOnly, disabled } = field
    const value = formData[id] ?? ''
    const hasError = !!errors[id]
    const hasWarning = !!warnings[id]
    
    // Common input props
    const commonProps = {
      id,
      name: id,
      value,
      disabled: disabled || readOnly,
      className: `form-input ${hasError ? 'error' : ''} ${hasWarning ? 'warning' : ''}`,
      onChange: (e) => handleFieldChange(id, e.target.value, field),
      onBlur: () => handleBlur(field),
      placeholder: placeholder || label
    }

    let inputElement

    switch (type) {
      case 'textarea':
        inputElement = (
          <textarea
            {...commonProps}
            className={`form-textarea ${hasError ? 'error' : ''}`}
            rows={field.rows || 3}
            maxLength={validation?.maxLength}
          />
        )
        break

      case 'select':
        inputElement = (
          <select
            {...commonProps}
            className={`form-select ${hasError ? 'error' : ''}`}
          >
            <option value="">Seçiniz...</option>
            {(options || []).map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        )
        break

      case 'radio':
        inputElement = (
          <div className="radio-group">
            {(options || []).map(opt => (
              <label key={opt} className="radio-option">
                <input
                  type="radio"
                  name={id}
                  value={opt}
                  checked={value === opt}
                  onChange={(e) => handleFieldChange(id, e.target.value, field)}
                  disabled={disabled || readOnly}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        )
        break

      case 'checkbox':
      case 'multiselect':
        const selectedValues = Array.isArray(value) ? value : (value ? value.split(',').map(v => v.trim()) : [])
        inputElement = (
          <div className="checkbox-group">
            {(options || []).map(opt => (
              <label key={opt} className="checkbox-option">
                <input
                  type="checkbox"
                  name={id}
                  value={opt}
                  checked={selectedValues.includes(opt)}
                  onChange={(e) => {
                    let newValues
                    if (e.target.checked) {
                      newValues = [...selectedValues, opt]
                    } else {
                      newValues = selectedValues.filter(v => v !== opt)
                    }
                    handleFieldChange(id, newValues, field)
                  }}
                  disabled={disabled || readOnly}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        )
        break

      case 'number':
        inputElement = (
          <input
            {...commonProps}
            type="number"
            min={validation?.min}
            max={validation?.max}
            step={validation?.integer ? 1 : validation?.step || 'any'}
            onChange={(e) => {
              const val = e.target.value
              // Keep as string in state for controlled input, will be parsed on submit
              handleFieldChange(id, val, field)
            }}
          />
        )
        break

      case 'date':
        inputElement = (
          <input
            {...commonProps}
            type="date"
            min={validation?.minDate}
            max={validation?.maxDate}
          />
        )
        break

      case 'email':
        inputElement = (
          <input
            {...commonProps}
            type="email"
            autoComplete="email"
          />
        )
        break

      case 'phone':
        inputElement = (
          <input
            {...commonProps}
            type="tel"
            autoComplete="tel"
          />
        )
        break

      case 'url':
        inputElement = (
          <input
            {...commonProps}
            type="url"
            autoComplete="url"
          />
        )
        break

      case 'file':
        // File upload - handled separately in review step
        inputElement = (
          <div className="file-field-notice">
            <span className="file-icon"><Paperclip size={14} /></span>
            <span>Dosyalar Önizleme adımında yüklenebilir</span>
          </div>
        )
        break

      default:
        // text and fallback
        inputElement = (
          <input
            {...commonProps}
            type="text"
            maxLength={validation?.maxLength}
          />
        )
    }

    // Compute validation hints for placeholder
    const getHints = () => {
      if (!validation) return null
      const hints = []
      
      if (type === 'number') {
        if (validation.min !== undefined) hints.push(`min: ${validation.min}`)
        if (validation.max !== undefined) hints.push(`max: ${validation.max}`)
        if (validation.integer) hints.push('tam sayı')
      }
      
      if (type === 'text' || type === 'textarea') {
        if (validation.minLength) hints.push(`min ${validation.minLength} karakter`)
        if (validation.maxLength) hints.push(`max ${validation.maxLength} karakter`)
      }
      
      return hints.length > 0 ? `(${hints.join(', ')})` : null
    }

    const hints = getHints()

    return (
      <div 
        key={id} 
        className={`form-group ${type === 'textarea' ? 'full-width' : ''} ${hasError ? 'has-error' : ''}`}
      >
        <label className="form-label" htmlFor={id}>
          {label || id}
          {required && <span className="required">*</span>}
          {hints && <span className="field-hints">{hints}</span>}
        </label>
        
        {inputElement}
        
        {hasError && (
          <span className="field-error">{errors[id]}</span>
        )}
        
        {hasWarning && !hasError && (
          <span className="field-warning">{warnings[id]}</span>
        )}
        
        {field.description && (
          <span className="field-description">{field.description}</span>
        )}
      </div>
    )
  }

  // Render loading state
  if (!formConfig) {
    return (
      <div className="quote-form-step">
        <div className="form-loading">
          <div className="loading-spinner"></div>
          <span>Form yükleniyor...</span>
        </div>
      </div>
    )
  }

  const fields = getFields()
  const groupedFields = getGroupedFields()
  const groupKeys = Object.keys(groupedFields)
  
  // If single group, render flat
  const useSections = groupKeys.length > 1

  return (
    <div className="quote-form-step">
      {useSections ? (
        // Render grouped fields with sections
        groupKeys.map(groupName => (
          <div key={groupName} className="form-section">
            <h4 className="form-section-title">{groupName}</h4>
            <div className="form-fields-grid">
              {groupedFields[groupName].map(field => renderField(field))}
            </div>
          </div>
        ))
      ) : (
        // Render flat grid
        <div className="form-fields-grid">
          {fields.map(field => renderField(field))}
        </div>
      )}
      
      {fields.length === 0 && (
        <div className="form-empty-state">
          <span className="empty-icon"><FileEdit size={24} /></span>
          <span>Henüz form alanı tanımlanmamış.</span>
          <span className="empty-hint">Admin panelinden form alanları ekleyebilirsiniz.</span>
        </div>
      )}
    </div>
  )
}
