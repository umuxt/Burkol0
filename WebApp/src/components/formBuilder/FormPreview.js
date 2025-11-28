import { showToast } from '../../../shared/components/MESToast.js';
// Form Preview Component - Live preview of the form being built
import React from 'react';
const { useState } = React;

export function FormPreview({ fields, isDarkMode, t }) {
  const [formData, setFormData] = useState({})
  const [errors, setErrors] = useState({})

  function handleInputChange(fieldId, value) {
    setFormData(prev => ({
      ...prev,
      [fieldId]: value
    }))
    
    // Clear error when user starts typing
    if (errors[fieldId]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[fieldId]
        return newErrors
      })
    }
  }

  function validateField(field) {
    const value = formData[field.id]
    
    if (field.required && (!value || value.toString().trim() === '')) {
      return `${field.label} alanı zorunludur`
    }
    
    if (field.validation && value) {
      if (field.validation.min && value.length < field.validation.min) {
        return `${field.label} en az ${field.validation.min} karakter olmalıdır`
      }
      if (field.validation.max && value.length > field.validation.max) {
        return `${field.label} en fazla ${field.validation.max} karakter olabilir`
      }
      if (field.type === 'email' && value && !/\S+@\S+\.\S+/.test(value)) {
        return 'Geçerli bir e-posta adresi giriniz'
      }
    }
    
    return null
  }

  function handlePreviewSubmit(e) {
    e.preventDefault()
    
    const newErrors = {}
    fields.forEach(field => {
      const error = validateField(field)
      if (error) {
        newErrors[field.id] = error
      }
    })
    
    setErrors(newErrors)
    
    if (Object.keys(newErrors).length === 0) {
      showToast('Önizleme formu başarıyla doğrulandı!', 'success')
      console.log('Form Data:', formData)
    } else {
      showToast('Lütfen hataları düzeltin', 'error')
    }
  }

  function renderField(field) {
    const value = formData[field.id] || ''
    const error = errors[field.id]
    
    const fieldWrapper = (children) => React.createElement('div', {
      key: field.id,
      className: 'preview-field',
      style: {
        marginBottom: '20px',
        padding: '12px',
        border: error ? '1px solid #dc3545' : '1px solid #ddd',
        borderRadius: '6px',
        backgroundColor: error ? '#fff5f5' : 'white'
      }
    },
      React.createElement('label', {
        style: {
          display: 'block',
          marginBottom: '6px',
          fontWeight: '500',
          color: error ? '#dc3545' : '#333'
        }
      }, 
        field.label,
        field.required && React.createElement('span', { style: { color: '#dc3545', marginLeft: '4px' } }, '*')
      ),
      children,
      error && React.createElement('div', {
        style: {
          color: '#dc3545',
          fontSize: '12px',
          marginTop: '4px'
        }
      }, error)
    )
    
    switch (field.type) {
      case 'text':
      case 'email':
      case 'phone':
        return fieldWrapper(
          React.createElement('input', {
            type: field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text',
            value,
            onChange: (e) => handleInputChange(field.id, e.target.value),
            placeholder: field.placeholder || '',
            className: 'form-control',
            style: {
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '14px'
            }
          })
        )
        
      case 'number':
        return fieldWrapper(
          React.createElement('input', {
            type: 'number',
            value,
            onChange: (e) => handleInputChange(field.id, e.target.value),
            placeholder: field.placeholder || '',
            min: field.validation?.min,
            max: field.validation?.max,
            className: 'form-control',
            style: {
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '14px'
            }
          })
        )
        
      case 'textarea':
        return fieldWrapper(
          React.createElement('textarea', {
            value,
            onChange: (e) => handleInputChange(field.id, e.target.value),
            placeholder: field.placeholder || '',
            rows: 4,
            className: 'form-control',
            style: {
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '14px',
              resize: 'vertical'
            }
          })
        )
        
      case 'dropdown':
        return fieldWrapper(
          React.createElement('select', {
            value,
            onChange: (e) => handleInputChange(field.id, e.target.value),
            className: 'form-control',
            style: {
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '14px'
            }
          },
            React.createElement('option', { value: '' }, 'Seçiniz...'),
            ...(field.options || []).map(option =>
              React.createElement('option', { key: option, value: option }, option)
            )
          )
        )
        
      case 'radio':
        return fieldWrapper(
          React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
            ...(field.options || []).map(option =>
              React.createElement('label', {
                key: option,
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer'
                }
              },
                React.createElement('input', {
                  type: 'radio',
                  name: field.id,
                  value: option,
                  checked: value === option,
                  onChange: (e) => handleInputChange(field.id, e.target.value)
                }),
                React.createElement('span', { style: { fontSize: '14px' } }, option)
              )
            )
          )
        )
        
      case 'checkbox':
        return fieldWrapper(
          React.createElement('label', {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer'
            }
          },
            React.createElement('input', {
              type: 'checkbox',
              checked: !!value,
              onChange: (e) => handleInputChange(field.id, e.target.checked)
            }),
            React.createElement('span', { style: { fontSize: '14px' } }, field.placeholder || 'Kabul ediyorum')
          )
        )
        
      case 'date':
        return fieldWrapper(
          React.createElement('input', {
            type: 'date',
            value,
            onChange: (e) => handleInputChange(field.id, e.target.value),
            className: 'form-control',
            style: {
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '14px'
            }
          })
        )
        
      case 'file':
        return fieldWrapper(
          React.createElement('input', {
            type: 'file',
            onChange: (e) => handleInputChange(field.id, e.target.files[0]?.name || ''),
            className: 'form-control',
            style: {
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '14px'
            }
          })
        )
        
      default:
        return fieldWrapper(
          React.createElement('div', {
            style: {
              padding: '12px',
              backgroundColor: '#f8f9fa',
              border: '1px dashed #ccc',
              borderRadius: '4px',
              textAlign: 'center',
              color: '#666'
            }
          }, `Desteklenmeyen alan türü: ${field.type}`)
        )
    }
  }

  if (fields.length === 0) {
    return React.createElement('div', {
      className: 'preview-container',
      style: {
        padding: '20px',
        border: '1px solid #ddd',
        borderRadius: '8px',
        backgroundColor: '#f8f9fa',
        textAlign: 'center'
      }
    },
      React.createElement('div', {
        style: {
          color: '#666',
          fontSize: '16px'
        }
      },
        React.createElement('div', { style: { marginBottom: '8px' } }, '📝'),
        React.createElement('p', null, 'Form önizlemesi için alan ekleyin'),
        React.createElement('p', { style: { fontSize: '14px', margin: 0 } }, 'Eklediğiniz alanlar burada görünecek')
      )
    )
  }

  return React.createElement('div', { className: 'preview-container' },
    React.createElement('div', {
      style: {
        backgroundColor: 'white',
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '24px',
        marginBottom: '20px'
      }
    },
      React.createElement('h3', {
        style: {
          marginTop: 0,
          marginBottom: '20px',
          paddingBottom: '10px',
          borderBottom: '2px solid #007bff',
          color: '#333'
        }
      }, 'Form Önizlemesi'),
      
      React.createElement('form', { onSubmit: handlePreviewSubmit },
        ...fields.map(renderField),
        
        React.createElement('div', {
          style: {
            marginTop: '30px',
            paddingTop: '20px',
            borderTop: '1px solid #eee',
            display: 'flex',
            gap: '12px'
          }
        },
          React.createElement('button', {
            type: 'submit',
            className: 'btn btn-primary',
            style: {
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '4px',
              cursor: 'pointer'
            }
          }, 'Formu Doğrula'),
          
          React.createElement('button', {
            type: 'button',
            onClick: () => {
              setFormData({})
              setErrors({})
              showToast('Form temizlendi', 'info')
            },
            className: 'btn btn-secondary',
            style: {
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '4px',
              cursor: 'pointer'
            }
          }, 'Temizle')
        )
      )
    ),
    
    React.createElement('div', {
      style: {
        fontSize: '12px',
        color: '#666',
        backgroundColor: '#f8f9fa',
        padding: '12px',
        borderRadius: '4px',
        border: '1px solid #e9ecef'
      }
    },
      React.createElement('strong', null, 'ℹ️ Önizleme Bilgisi:'),
      React.createElement('ul', { style: { margin: '8px 0 0 0', paddingLeft: '20px' } },
        React.createElement('li', null, 'Bu önizleme gerçek form değildir'),
        React.createElement('li', null, 'Sadece alanların nasıl görüneceğini gösterir'),
        React.createElement('li', null, 'Doğrulama kuralları test edilebilir'),
        React.createElement('li', null, `Toplam ${fields.length} alan tanımlanmış`)
      )
    )
  )
}