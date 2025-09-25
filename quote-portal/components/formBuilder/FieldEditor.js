// Field Editor - Individual field creation and editing
import React from 'react'
import { FormBuilderUtils } from './FormBuilderUtils.js'

const { useState, useEffect } = React

export function FieldEditor({ field, onSave, onCancel, fieldTypes = [], showNotification }) {
  const [fieldForm, setFieldForm] = useState({
    id: '',
    label: '',
    type: 'text',
    required: false,
    options: [],
    placeholder: '',
    validation: { min: null, max: null, pattern: null },
    display: {
      showInTable: true,
      showInFilter: false,
      tableOrder: 10,
      formOrder: 10
    }
  })

  const [newOption, setNewOption] = useState('')

  useEffect(() => {
    if (field) {
      setFieldForm({
        ...field,
        options: field.options || [],
        validation: field.validation || { min: null, max: null, pattern: null },
        display: field.display || {
          showInTable: true,
          showInFilter: false,
          tableOrder: 10,
          formOrder: 10
        }
      })
    }
  }, [field])

  function updateFieldForm(key, value) {
    setFieldForm(prev => ({ ...prev, [key]: value }))
  }

  function updateNestedField(parentKey, childKey, value) {
    setFieldForm(prev => ({
      ...prev,
      [parentKey]: { 
        ...(prev[parentKey] || {}), 
        [childKey]: value 
      }
    }))
  }

  function addOption() {
    if (!newOption.trim()) {
      showNotification('Seçenek değeri boş olamaz', 'error')
      return
    }

    if (fieldForm.options.includes(newOption.trim())) {
      showNotification('Bu seçenek zaten mevcut', 'error')
      return
    }

    setFieldForm(prev => ({
      ...prev,
      options: [...prev.options, newOption.trim()]
    }))
    setNewOption('')
  }

  function removeOption(index) {
    setFieldForm(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index)
    }))
  }

  function handleSave() {
    if (!fieldForm.label.trim()) {
      showNotification('Alan etiketi zorunludur', 'error')
      return
    }

    if (!fieldForm.id) {
      fieldForm.id = fieldForm.label.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_')
    }

    // Validate options for select-type fields
    if (['dropdown', 'multiselect', 'radio'].includes(fieldForm.type) && fieldForm.options.length === 0) {
      showNotification('Seçenek listesi boş olamaz', 'error')
      return
    }

    onSave(fieldForm)
  }

  const needsOptions = ['dropdown', 'multiselect', 'radio'].includes(fieldForm.type)

  return React.createElement('div', { className: 'field-editor' },
    React.createElement('div', { 
      className: 'modal-overlay',
      onClick: (e) => {
        if (e.target === e.currentTarget) {
          onCancel()
        }
      }
    },
      React.createElement('div', { 
        className: 'modal-content',
        style: { 
          maxWidth: '900px', 
          width: '90vw',
          maxHeight: '85vh', 
          overflow: 'auto',
          padding: '24px'
        },
        onClick: (e) => e.stopPropagation()
      },
        React.createElement('div', { 
          style: { 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            marginBottom: '20px' 
          } 
        },
          React.createElement('h3', { style: { margin: 0 } }, field ? 'Alan Düzenle' : 'Yeni Alan Ekle'),
          React.createElement('button', {
            onClick: onCancel,
            style: {
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: 'var(--text)',
              padding: '0',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              transition: 'background-color 0.2s'
            },
            onMouseEnter: (e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.1)',
            onMouseLeave: (e) => e.target.style.backgroundColor = 'transparent'
          }, '×')
        ),
        
        // Form container with two columns
        React.createElement('div', { 
          style: { 
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr', 
            gap: '24px',
            marginBottom: '20px'
          } 
        },
          // Left column
          React.createElement('div', { className: 'form-column' },
            // Basic field properties
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', null, 'Alan Etiketi *'),
              React.createElement('input', {
                type: 'text',
                value: fieldForm.label,
                onChange: (e) => updateFieldForm('label', e.target.value),
                placeholder: 'Örn: Müşteri Adı',
                className: 'form-control'
              })
            ),

            React.createElement('div', { className: 'form-group' },
              React.createElement('label', null, 'Alan ID'),
              React.createElement('input', {
                type: 'text',
                value: fieldForm.id,
                onChange: (e) => updateFieldForm('id', e.target.value),
                placeholder: 'Otomatik oluşturulur',
                className: 'form-control'
              })
            ),

            React.createElement('div', { className: 'form-group' },
              React.createElement('label', null, 'Alan Türü'),
              React.createElement('select', {
                value: fieldForm.type,
                onChange: (e) => updateFieldForm('type', e.target.value),
                className: 'form-control'
              },
                ...Object.entries(FormBuilderUtils.fieldTypes).map(([typeKey, typeConfig]) =>
                  React.createElement('option', { key: typeKey, value: typeKey }, typeConfig.label)
                )
              )
            ),

            React.createElement('div', { className: 'form-group' },
              React.createElement('label', null, 'Placeholder'),
              React.createElement('input', {
                type: 'text',
                value: fieldForm.placeholder,
                onChange: (e) => updateFieldForm('placeholder', e.target.value),
                placeholder: 'Alan için ipucu metni',
                className: 'form-control'
              })
            ),

            React.createElement('div', { className: 'form-group' },
              React.createElement('label', null,
                React.createElement('input', {
                  type: 'checkbox',
                  checked: fieldForm.required,
                  onChange: (e) => updateFieldForm('required', e.target.checked)
                }),
                ' Zorunlu alan'
              )
            )
          ),

          // Right column
          React.createElement('div', { className: 'form-column' },
            // Validation rules
            React.createElement('div', { className: 'form-group' },
              React.createElement('h4', null, 'Doğrulama Kuralları'),
              
              // Min/Max values for numbers and length for text
              React.createElement('div', { style: { display: 'flex', gap: '12px', marginBottom: '12px' } },
                React.createElement('div', { style: { flex: 1 } },
                  React.createElement('label', null, 
                    fieldForm.type === 'number' ? 'Min Değer' : 'Min Uzunluk'
                  ),
                  React.createElement('input', {
                    type: 'number',
                    value: (fieldForm.validation && (fieldForm.validation.min ?? fieldForm.validation.minLength)) || '',
                    onChange: (e) => {
                      const key = fieldForm.type === 'number' ? 'min' : 'minLength'
                      updateNestedField('validation', key, e.target.value ? parseInt(e.target.value) : null)
                    },
                    className: 'form-control'
                  })
                ),
                React.createElement('div', { style: { flex: 1 } },
                  React.createElement('label', null, 
                    fieldForm.type === 'number' ? 'Max Değer' : 'Max Uzunluk'
                  ),
                  React.createElement('input', {
                    type: 'number',
                    value: (fieldForm.validation && (fieldForm.validation.max ?? fieldForm.validation.maxLength)) || '',
                    onChange: (e) => {
                      const key = fieldForm.type === 'number' ? 'max' : 'maxLength'
                      updateNestedField('validation', key, e.target.value ? parseInt(e.target.value) : null)
                    },
                    className: 'form-control'
                  })
                )
              ),

              // Number-specific validations
              fieldForm.type === 'number' && React.createElement('div', { 
                style: { display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' } 
              },
                React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: fieldForm.validation?.integer || false,
                    onChange: (e) => updateNestedField('validation', 'integer', e.target.checked)
                  }),
                  'Sadece tam sayı'
                ),
                React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: fieldForm.validation?.positive || false,
                    onChange: (e) => updateNestedField('validation', 'positive', e.target.checked)
                  }),
                  'Sadece pozitif sayı'
                )
              ),

              // Text-specific validations
              (fieldForm.type === 'text' || fieldForm.type === 'textarea') && React.createElement('div', { 
                style: { display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' } 
              },
                React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: fieldForm.validation?.onlyLetters || false,
                    onChange: (e) => updateNestedField('validation', 'onlyLetters', e.target.checked)
                  }),
                  'Sadece harf'
                ),
                React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: fieldForm.validation?.noNumbers || false,
                    onChange: (e) => updateNestedField('validation', 'noNumbers', e.target.checked)
                  }),
                  'Sayı yok'
                ),
                React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: fieldForm.validation?.alphanumeric || false,
                    onChange: (e) => updateNestedField('validation', 'alphanumeric', e.target.checked)
                  }),
                  'Alfanumerik'
                )
              ),

              // Textarea-specific validations
              fieldForm.type === 'textarea' && React.createElement('div', { 
                style: { display: 'flex', gap: '12px', marginBottom: '12px' } 
              },
                React.createElement('div', { style: { flex: 1 } },
                  React.createElement('label', null, 'Min Kelime Sayısı'),
                  React.createElement('input', {
                    type: 'number',
                    value: fieldForm.validation?.minWords || '',
                    onChange: (e) => updateNestedField('validation', 'minWords', e.target.value ? parseInt(e.target.value) : null),
                    className: 'form-control'
                  })
                ),
                React.createElement('div', { style: { flex: 1 } },
                  React.createElement('label', null, 'Max Kelime Sayısı'),
                  React.createElement('input', {
                    type: 'number',
                    value: fieldForm.validation?.maxWords || '',
                    onChange: (e) => updateNestedField('validation', 'maxWords', e.target.value ? parseInt(e.target.value) : null),
                    className: 'form-control'
                  })
                )
              ),

              // Email-specific validations
              fieldForm.type === 'email' && React.createElement('div', { 
                style: { marginBottom: '12px' } 
              },
                React.createElement('label', null, 'İzin verilen domainler (virgülle ayırın)'),
                React.createElement('input', {
                  type: 'text',
                  value: fieldForm.validation?.allowedDomains?.join(', ') || '',
                  onChange: (e) => {
                    const domains = e.target.value.split(',').map(d => d.trim()).filter(d => d)
                    updateNestedField('validation', 'allowedDomains', domains.length > 0 ? domains : null)
                  },
                  placeholder: 'örn: example.com, company.org',
                  className: 'form-control'
                })
              ),

              // Date-specific validations
              fieldForm.type === 'date' && React.createElement('div', null,
                React.createElement('div', { style: { display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' } },
                  React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
                    React.createElement('input', {
                      type: 'checkbox',
                      checked: fieldForm.validation?.futureOnly || false,
                      onChange: (e) => updateNestedField('validation', 'futureOnly', e.target.checked)
                    }),
                    'Sadece gelecek tarihleri'
                  ),
                  React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
                    React.createElement('input', {
                      type: 'checkbox',
                      checked: fieldForm.validation?.pastOnly || false,
                      onChange: (e) => updateNestedField('validation', 'pastOnly', e.target.checked)
                    }),
                    'Sadece geçmiş tarihleri'
                  )
                ),
                React.createElement('div', { style: { display: 'flex', gap: '12px', marginBottom: '12px' } },
                  React.createElement('div', { style: { flex: 1 } },
                    React.createElement('label', null, 'En erken tarih'),
                    React.createElement('input', {
                      type: 'date',
                      value: fieldForm.validation?.minDate || '',
                      onChange: (e) => updateNestedField('validation', 'minDate', e.target.value || null),
                      className: 'form-control'
                    })
                  ),
                  React.createElement('div', { style: { flex: 1 } },
                    React.createElement('label', null, 'En geç tarih'),
                    React.createElement('input', {
                      type: 'date',
                      value: fieldForm.validation?.maxDate || '',
                      onChange: (e) => updateNestedField('validation', 'maxDate', e.target.value || null),
                      className: 'form-control'
                    })
                  )
                )
              ),

              // Multi-select validations
              (fieldForm.type === 'multiselect' || fieldForm.type === 'checkbox') && React.createElement('div', { 
                style: { display: 'flex', gap: '12px', marginBottom: '12px' } 
              },
                React.createElement('div', { style: { flex: 1 } },
                  React.createElement('label', null, 'Min Seçim Sayısı'),
                  React.createElement('input', {
                    type: 'number',
                    value: fieldForm.validation?.minSelections || '',
                    onChange: (e) => updateNestedField('validation', 'minSelections', e.target.value ? parseInt(e.target.value) : null),
                    className: 'form-control'
                  })
                ),
                React.createElement('div', { style: { flex: 1 } },
                  React.createElement('label', null, 'Max Seçim Sayısı'),
                  React.createElement('input', {
                    type: 'number',
                    value: fieldForm.validation?.maxSelections || '',
                    onChange: (e) => updateNestedField('validation', 'maxSelections', e.target.value ? parseInt(e.target.value) : null),
                    className: 'form-control'
                  })
                )
              ),

              // Custom pattern validation
              React.createElement('div', { style: { marginBottom: '12px' } },
                React.createElement('label', null, 'Özel Pattern (Regex)'),
                React.createElement('input', {
                  type: 'text',
                  value: fieldForm.validation?.pattern || '',
                  onChange: (e) => updateNestedField('validation', 'pattern', e.target.value || null),
                  placeholder: 'örn: ^[A-Z]{2}\\d{6}$ (2 harf + 6 rakam)',
                  className: 'form-control'
                })
              ),
              
              fieldForm.validation?.pattern && React.createElement('div', { style: { marginBottom: '12px' } },
                React.createElement('label', null, 'Pattern Hata Mesajı'),
                React.createElement('input', {
                  type: 'text',
                  value: fieldForm.validation?.patternMessage || '',
                  onChange: (e) => updateNestedField('validation', 'patternMessage', e.target.value || null),
                  placeholder: 'örn: Format: 2 harf + 6 rakam',
                  className: 'form-control'
                })
              )
            ),

            // Display options
            React.createElement('div', { className: 'form-group' },
              React.createElement('h4', null, 'Görünüm Ayarları'),
              React.createElement('div', { style: { display: 'flex', gap: '12px', marginBottom: '12px' } },
                React.createElement('label', null,
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: fieldForm.display?.showInTable || false,
                    onChange: (e) => updateNestedField('display', 'showInTable', e.target.checked)
                  }),
                  ' Tabloda göster'
                ),
                React.createElement('label', null,
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: fieldForm.display?.showInFilter || false,
                    onChange: (e) => updateNestedField('display', 'showInFilter', e.target.checked)
                  }),
                  ' Filtrede göster'
                )
              ),
              React.createElement('div', { style: { display: 'flex', gap: '12px' } },
                React.createElement('div', { style: { flex: 1 } },
                  React.createElement('label', null, 'Form Sırası'),
                  React.createElement('input', {
                    type: 'number',
                    value: fieldForm.display?.formOrder || 0,
                    onChange: (e) => updateNestedField('display', 'formOrder', parseInt(e.target.value) || 0),
                    className: 'form-control'
                  })
                ),
                React.createElement('div', { style: { flex: 1 } },
                  React.createElement('label', null, 'Tablo Sırası'),
                  React.createElement('input', {
                    type: 'number',
                    value: fieldForm.display?.tableOrder || 0,
                    onChange: (e) => updateNestedField('display', 'tableOrder', parseInt(e.target.value) || 0),
                    className: 'form-control'
                  })
                )
              )
            )
          )
        ),

        // Options for select-type fields (full width)
        needsOptions && React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Seçenekler'),
          React.createElement('div', { style: { display: 'flex', gap: '8px', marginBottom: '8px' } },
            React.createElement('input', {
              type: 'text',
              value: newOption,
              onChange: (e) => setNewOption(e.target.value),
              placeholder: 'Yeni seçenek',
              className: 'form-control',
              style: { flex: 1 }
            }),
            React.createElement('button', {
              type: 'button',
              onClick: addOption,
              className: 'btn btn-primary'
            }, 'Ekle')
          ),
          
          (fieldForm.options && fieldForm.options.length > 0) && React.createElement('ul', { 
            className: 'options-list'
          },
            ...fieldForm.options.map((option, index) =>
              React.createElement('li', { 
                key: index
              },
                React.createElement('span', null, option),
                React.createElement('button', {
                  type: 'button',
                  onClick: () => removeOption(index),
                  className: 'option-remove-btn'
                }, 'Sil')
              )
            )
          )
        ),

        // Action buttons
        React.createElement('div', { className: 'modal-actions', style: { marginTop: '20px', textAlign: 'right' } },
          React.createElement('button', {
            type: 'button',
            onClick: onCancel,
            className: 'btn btn-secondary',
            style: { marginRight: '10px' }
          }, 'İptal'),
          React.createElement('button', {
            type: 'button',
            onClick: handleSave,
            className: 'btn btn-primary'
          }, 'Kaydet')
        )
      )
    )
  )
}