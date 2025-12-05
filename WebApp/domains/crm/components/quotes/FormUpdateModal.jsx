import React, { useState, useEffect, useMemo } from 'react'
import { X, Copy, ChevronRight, AlertTriangle, CheckCircle, RefreshCw } from '../../../../shared/components/Icons.jsx'
import { priceApi } from '../../services/pricing-service.js'
import { showToast } from '../../../../shared/components/MESToast.js'

/**
 * FormUpdateModal - C2/C4: Modal for updating quote form when template changed
 * 
 * Features:
 * - Left panel: Old form values (readonly)
 * - Right panel: New form fields (editable)
 * - "Copy Matching" button to auto-fill matching fieldCodes
 * - Dynamic price calculation at bottom
 * - C4: Combined form+price update - sends both formTemplateCode and priceSettingCode
 */
export default function FormUpdateModal({
  isOpen,
  onClose,
  quote,
  oldFormData = {},
  oldFields = [],
  newFields = [],
  activeFormTemplate,
  activePriceSetting,
  onSave
}) {
  const [newFormData, setNewFormData] = useState({})
  const [calculatedPrice, setCalculatedPrice] = useState(null)
  const [priceLoading, setPriceLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Initialize new form data when modal opens
  useEffect(() => {
    if (isOpen && newFields.length > 0) {
      const initialData = {}
      newFields.forEach(field => {
        const fieldCode = field.fieldCode || field.id
        // Check if old form has this field
        const oldValue = oldFormData[fieldCode] || oldFormData[field.id] || ''
        initialData[fieldCode] = oldValue
      })
      setNewFormData(initialData)
      setCalculatedPrice(null)
    }
  }, [isOpen, newFields, oldFormData])

  // Calculate price when form data changes
  useEffect(() => {
    if (!isOpen || !activePriceSetting?.id || Object.keys(newFormData).length === 0) return

    const debounceTimer = setTimeout(async () => {
      try {
        setPriceLoading(true)
        const result = await priceApi.calculatePrice(activePriceSetting.id, newFormData)
        setCalculatedPrice(result.totalPrice || result.price || 0)
      } catch (err) {
        console.error('Price calculation error:', err)
        setCalculatedPrice(null)
      } finally {
        setPriceLoading(false)
      }
    }, 500)

    return () => clearTimeout(debounceTimer)
  }, [isOpen, activePriceSetting?.id, newFormData])

  // Find matching fields between old and new templates
  const matchingFields = useMemo(() => {
    const matches = []
    newFields.forEach(newField => {
      const newCode = newField.fieldCode || newField.id
      const oldField = oldFields.find(f => (f.fieldCode || f.id) === newCode)
      if (oldField && oldFormData[newCode]) {
        matches.push({
          fieldCode: newCode,
          oldValue: oldFormData[newCode],
          newField,
          oldField
        })
      }
    })
    return matches
  }, [oldFields, newFields, oldFormData])

  // Copy all matching field values
  const handleCopyMatching = () => {
    const updates = {}
    matchingFields.forEach(match => {
      const fieldType = match.newField?.fieldType || match.newField?.type || 'text'
      const oldValue = match.oldValue
      
      // For select/dropdown/radio, match by optionLabel to find corresponding optionCode in new form
      if ((fieldType === 'select' || fieldType === 'dropdown' || fieldType === 'radio') && match.oldField?.options && match.newField?.options) {
        // Find the old option to get its label
        const oldOptions = (match.oldField.options || []).filter(opt => opt != null)
        const oldOption = oldOptions.find(opt => opt.optionCode === oldValue)
        const oldLabel = oldOption?.optionLabel
        
        if (oldLabel) {
          // Find the new option with the same label
          const newOptions = (match.newField.options || []).filter(opt => opt != null)
          const newOption = newOptions.find(opt => opt.optionLabel === oldLabel)
          if (newOption) {
            updates[match.fieldCode] = newOption.optionCode
          } else {
            // No matching label in new options, skip
            console.log(`No matching option found for label "${oldLabel}" in field ${match.fieldCode}`)
          }
        }
      } else {
        // For other field types, copy directly
        updates[match.fieldCode] = oldValue
      }
    })
    
    const copiedCount = Object.keys(updates).length
    setNewFormData(prev => ({ ...prev, ...updates }))
    showToast(`${copiedCount} alan kopyalandı`, 'success')
  }

  // Handle input change
  const handleInputChange = (fieldCode, value) => {
    setNewFormData(prev => ({ ...prev, [fieldCode]: value }))
  }

  // Handle save
  const handleSave = async () => {
    try {
      setSaving(true)
      
      const updatePayload = {
        formTemplateId: activeFormTemplate.id,
        formTemplateVersion: activeFormTemplate.version,
        formTemplateCode: activeFormTemplate.code,
        formData: newFormData,
        calculatedPrice: calculatedPrice,
        priceSettingId: activePriceSetting?.id,
        priceSettingCode: activePriceSetting?.code
      }

      await onSave(quote.id, updatePayload)
      showToast('Teklif başarıyla güncellendi', 'success')
      onClose()
    } catch (err) {
      console.error('Save error:', err)
      showToast('Kaydetme sırasında hata oluştu', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Render field input based on type
  const renderFieldInput = (field, value, onChange) => {
    const fieldCode = field.fieldCode || field.id
    const fieldType = field.fieldType || field.type || 'text'

    switch (fieldType) {
      case 'select':
      case 'dropdown':
        return (
          <select
            value={value || ''}
            onChange={(e) => onChange(fieldCode, e.target.value)}
            style={inputStyle}
          >
            <option value="">Seçiniz...</option>
            {(field.options || []).map((opt, i) => (
              <option key={opt.optionCode || opt.id || i} value={opt.optionCode || (typeof opt === 'object' ? opt.value : opt)}>
                {opt.optionLabel || (typeof opt === 'object' ? opt.label : opt)}
              </option>
            ))}
          </select>
        )
      
      case 'radio':
        return (
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {(field.options || []).map((opt, i) => {
              const optCode = opt.optionCode || (typeof opt === 'object' ? opt.value : opt)
              const optLabel = opt.optionLabel || (typeof opt === 'object' ? opt.label : opt)
              return (
                <label key={optCode || i} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name={fieldCode}
                    value={optCode}
                    checked={value === optCode}
                    onChange={(e) => onChange(fieldCode, e.target.value)}
                  />
                  <span style={{ fontSize: '13px' }}>{optLabel}</span>
                </label>
              )
            })}
          </div>
        )
      
      case 'number':
        return (
          <input
            type="number"
            value={value || ''}
            onChange={(e) => onChange(fieldCode, e.target.value)}
            placeholder={field.placeholder || ''}
            step="any"
            style={inputStyle}
          />
        )
      
      case 'textarea':
        return (
          <textarea
            value={value || ''}
            onChange={(e) => onChange(fieldCode, e.target.value)}
            placeholder={field.placeholder || ''}
            style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }}
          />
        )
      
      case 'email':
        return (
          <input
            type="email"
            value={value || ''}
            onChange={(e) => onChange(fieldCode, e.target.value)}
            placeholder={field.placeholder || 'ornek@email.com'}
            style={inputStyle}
          />
        )
      
      case 'phone':
      case 'tel':
        return (
          <input
            type="tel"
            value={value || ''}
            onChange={(e) => onChange(fieldCode, e.target.value)}
            placeholder={field.placeholder || '05XX XXX XX XX'}
            style={inputStyle}
          />
        )
      
      case 'date':
        return (
          <input
            type="date"
            value={value || ''}
            onChange={(e) => onChange(fieldCode, e.target.value)}
            style={inputStyle}
          />
        )
      
      case 'checkbox':
        return (
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={value === true || value === 'true' || value === 1}
              onChange={(e) => onChange(fieldCode, e.target.checked)}
            />
            <span style={{ fontSize: '13px' }}>{field.placeholder || 'Evet'}</span>
          </label>
        )
      
      default:
        return (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => onChange(fieldCode, e.target.value)}
            placeholder={field.placeholder || ''}
            style={inputStyle}
          />
        )
    }
  }

  if (!isOpen) return null

  const formatPrice = (price) => {
    if (price === null || price === undefined) return '—'
    return parseFloat(price).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺'
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <RefreshCw size={20} style={{ color: '#2563eb' }} />
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111827' }}>
              Form Güncelleme
            </h2>
          </div>
          <button onClick={onClose} style={closeButtonStyle}>
            <X size={20} />
          </button>
        </div>

        {/* Info Banner */}
        <div style={infoBannerStyle}>
          <AlertTriangle size={16} style={{ color: '#d97706', flexShrink: 0 }} />
          <span>
            Form şablonu güncellendi. Lütfen yeni alanları doldurun. 
            Eşleşen alanlar otomatik olarak kopyalanabilir.
          </span>
        </div>

        {/* Content */}
        <div style={contentStyle}>
          {/* Left Panel - Old Values */}
          <div style={panelStyle}>
            <div style={panelHeaderStyle}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#6b7280' }}>
                Mevcut Değerler
              </h3>
              <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                (Salt Okunur)
              </span>
            </div>
            <div style={fieldsContainerStyle}>
              {oldFields.length > 0 ? oldFields.map(field => {
                const fieldCode = field.fieldCode || field.id
                const rawValue = oldFormData[fieldCode] || '—'
                const label = field.fieldName || field.label || fieldCode
                
                // PROMPT-D2: For select/radio fields, show optionLabel instead of optionCode
                const getDisplayValue = (val, fld) => {
                  if (!val || val === '—') return val
                  const fieldType = fld?.type || fld?.fieldType || 'text'
                  if ((fieldType === 'select' || fieldType === 'dropdown' || fieldType === 'radio') && fld?.options) {
                    const validOptions = (fld.options || []).filter(opt => opt != null)
                    const selectedOption = validOptions.find(opt => opt.optionCode === val)
                    return selectedOption?.optionLabel || val
                  }
                  return val
                }
                
                const displayValue = getDisplayValue(rawValue, field)
                
                return (
                  <div key={fieldCode} style={fieldRowStyle}>
                    <label style={labelStyle}>{label}</label>
                    <div style={readonlyValueStyle}>{displayValue}</div>
                  </div>
                )
              }) : (
                <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                  Eski form alanları bulunamadı
                </div>
              )}
            </div>
          </div>

          {/* Arrow */}
          <ArrowDivider />

          {/* Right Panel - New Fields */}
          <div style={panelStyle}>
            <div style={panelHeaderStyle}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                Yeni Form
              </h3>
              {matchingFields.length > 0 && (
                <button onClick={handleCopyMatching} style={copyButtonStyle}>
                  <Copy size={12} />
                  Eşleşenleri Kopyala ({matchingFields.length})
                </button>
              )}
            </div>
            <div style={fieldsContainerStyle}>
              {newFields.length > 0 ? newFields.map(field => {
                const fieldCode = field.fieldCode || field.id
                const value = newFormData[fieldCode] || ''
                const label = field.fieldName || field.label || fieldCode
                const isRequired = field.isRequired || field.required
                const hasMatch = matchingFields.some(m => m.fieldCode === fieldCode)
                
                return (
                  <div key={fieldCode} style={fieldRowStyle}>
                    <label style={labelStyle}>
                      {label}
                      {isRequired && <span style={{ color: '#dc2626', marginLeft: '2px' }}>*</span>}
                      {hasMatch && (
                        <CheckCircle size={12} style={{ color: '#16a34a', marginLeft: '4px' }} />
                      )}
                    </label>
                    {renderFieldInput(field, value, handleInputChange)}
                  </div>
                )
              }) : (
                <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                  Yeni form alanları bulunamadı
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Price Section */}
        <div style={priceSectionStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
              Hesaplanan Fiyat:
            </span>
            {priceLoading ? (
              <span style={{ fontSize: '14px', color: '#9ca3af' }}>Hesaplanıyor...</span>
            ) : (
              <span style={{ fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                {formatPrice(calculatedPrice)}
              </span>
            )}
          </div>
          {quote?.finalPrice && calculatedPrice && calculatedPrice !== parseFloat(quote.finalPrice) && (
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              Önceki: {formatPrice(quote.finalPrice)}
              {calculatedPrice > parseFloat(quote.finalPrice) 
                ? <span style={{ color: '#dc2626', marginLeft: '8px' }}>↑ Artış</span>
                : <span style={{ color: '#16a34a', marginLeft: '8px' }}>↓ Azalış</span>
              }
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <button onClick={onClose} style={cancelButtonStyle}>
            İptal
          </button>
          <button 
            onClick={handleSave} 
            disabled={saving || priceLoading || calculatedPrice === null}
            title={calculatedPrice === null ? 'Fiyat hesaplanıyor...' : ''}
            style={{
              ...saveButtonStyle,
              opacity: saving || priceLoading || calculatedPrice === null ? 0.6 : 1,
              cursor: saving || priceLoading || calculatedPrice === null ? 'not-allowed' : 'pointer'
            }}
          >
            {saving ? 'Kaydediliyor...' : priceLoading ? 'Fiyat Hesaplanıyor...' : 'Kaydet ve Güncelle'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Styles
const overlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '20px'
}

const modalStyle = {
  background: 'white',
  borderRadius: '12px',
  boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
  width: '100%',
  maxWidth: '900px',
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden'
}

const headerStyle = {
  padding: '16px 20px',
  borderBottom: '1px solid #e5e7eb',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
}

const closeButtonStyle = {
  padding: '6px',
  border: 'none',
  borderRadius: '6px',
  background: 'transparent',
  color: '#6b7280',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
}

const infoBannerStyle = {
  padding: '12px 20px',
  background: '#fef3c7',
  borderBottom: '1px solid #fbbf24',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  fontSize: '13px',
  color: '#92400e'
}

const contentStyle = {
  flex: 1,
  overflow: 'auto',
  padding: '20px',
  display: 'flex',
  gap: '16px',
  alignItems: 'flex-start'
}

const panelStyle = {
  flex: 1,
  background: '#f9fafb',
  borderRadius: '8px',
  border: '1px solid #e5e7eb',
  overflow: 'hidden'
}

const panelHeaderStyle = {
  padding: '12px 16px',
  borderBottom: '1px solid #e5e7eb',
  background: 'white',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
}

const fieldsContainerStyle = {
  padding: '12px 16px',
  maxHeight: '400px',
  overflowY: 'auto'
}

const fieldRowStyle = {
  marginBottom: '12px'
}

const labelStyle = {
  display: 'flex',
  alignItems: 'center',
  fontSize: '12px',
  fontWeight: '500',
  color: '#374151',
  marginBottom: '4px'
}

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '13px',
  background: 'white'
}

const readonlyValueStyle = {
  padding: '8px 12px',
  background: '#e5e7eb',
  borderRadius: '6px',
  fontSize: '13px',
  color: '#374151'
}

const arrowContainerStyle = {
  display: 'flex',
  alignItems: 'center',
  padding: '0 8px'
}

// Arrow component using ChevronRight
const ArrowDivider = () => (
  <div style={arrowContainerStyle}>
    <ChevronRight size={24} style={{ color: '#d1d5db' }} />
  </div>
)

const copyButtonStyle = {
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
}

const priceSectionStyle = {
  padding: '16px 20px',
  borderTop: '1px solid #e5e7eb',
  background: '#f9fafb',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
}

const footerStyle = {
  padding: '16px 20px',
  borderTop: '1px solid #e5e7eb',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '12px'
}

const cancelButtonStyle = {
  padding: '10px 20px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  background: 'white',
  color: '#374151',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: '500'
}

const saveButtonStyle = {
  padding: '10px 20px',
  border: 'none',
  borderRadius: '6px',
  background: '#2563eb',
  color: 'white',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: '500'
}
