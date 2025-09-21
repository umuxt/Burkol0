// Field Editor - Individual field creation and editing
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
              React.createElement('div', { style: { display: 'flex', gap: '12px', marginBottom: '12px' } },
                React.createElement('div', { style: { flex: 1 } },
                  React.createElement('label', null, 'Min Değer/Uzunluk'),
                  React.createElement('input', {
                    type: 'number',
                    value: (fieldForm.validation && fieldForm.validation.min) || '',
                    onChange: (e) => updateNestedField('validation', 'min', e.target.value || null),
                    className: 'form-control'
                  })
                ),
                React.createElement('div', { style: { flex: 1 } },
                  React.createElement('label', null, 'Max Değer/Uzunluk'),
                  React.createElement('input', {
                    type: 'number',
                    value: (fieldForm.validation && fieldForm.validation.max) || '',
                    onChange: (e) => updateNestedField('validation', 'max', e.target.value || null),
                    className: 'form-control'
                  })
                )
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