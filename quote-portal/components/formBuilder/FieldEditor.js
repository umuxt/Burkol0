// Field Editor - Individual field creation and editing
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
      setFieldForm({ ...field })
    }
  }, [field])

  function updateFieldForm(key, value) {
    setFieldForm(prev => ({ ...prev, [key]: value }))
  }

  function updateNestedField(parentKey, childKey, value) {
    setFieldForm(prev => ({
      ...prev,
      [parentKey]: { ...prev[parentKey], [childKey]: value }
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
    React.createElement('div', { className: 'modal-overlay' },
      React.createElement('div', { 
        className: 'modal-content',
        style: { maxWidth: '600px', maxHeight: '80vh', overflow: 'auto' }
      },
        React.createElement('h3', null, field ? 'Alan Düzenle' : 'Yeni Alan Ekle'),
        
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
            ...(fieldTypes || []).map(type =>
              React.createElement('option', { key: type.value, value: type.value }, type.label)
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
        ),

        // Options for select-type fields
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
          
          fieldForm.options.length > 0 && React.createElement('ul', { 
            style: { 
              listStyle: 'none', 
              padding: 0, 
              border: '1px solid #ddd', 
              borderRadius: '4px',
              maxHeight: '150px',
              overflow: 'auto'
            } 
          },
            ...fieldForm.options.map((option, index) =>
              React.createElement('li', { 
                key: index,
                style: { 
                  padding: '8px 12px', 
                  borderBottom: '1px solid #eee',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }
              },
                React.createElement('span', null, option),
                React.createElement('button', {
                  type: 'button',
                  onClick: () => removeOption(index),
                  style: {
                    background: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    fontSize: '12px'
                  }
                }, 'Sil')
              )
            )
          )
        ),

        // Display options
        React.createElement('div', { className: 'form-group' },
          React.createElement('h4', null, 'Görünüm Ayarları'),
          React.createElement('label', null,
            React.createElement('input', {
              type: 'checkbox',
              checked: fieldForm.display.showInTable,
              onChange: (e) => updateNestedField('display', 'showInTable', e.target.checked)
            }),
            ' Tabloda göster'
          ),
          React.createElement('br'),
          React.createElement('label', null,
            React.createElement('input', {
              type: 'checkbox',
              checked: fieldForm.display.showInFilter,
              onChange: (e) => updateNestedField('display', 'showInFilter', e.target.checked)
            }),
            ' Filtrelerde göster'
          )
        ),

        // Validation rules
        React.createElement('div', { className: 'form-group' },
          React.createElement('h4', null, 'Doğrulama Kuralları'),
          React.createElement('div', { style: { display: 'flex', gap: '12px' } },
            React.createElement('div', { style: { flex: 1 } },
              React.createElement('label', null, 'Min Değer/Uzunluk'),
              React.createElement('input', {
                type: 'number',
                value: fieldForm.validation.min || '',
                onChange: (e) => updateNestedField('validation', 'min', e.target.value || null),
                className: 'form-control'
              })
            ),
            React.createElement('div', { style: { flex: 1 } },
              React.createElement('label', null, 'Max Değer/Uzunluk'),
              React.createElement('input', {
                type: 'number',
                value: fieldForm.validation.max || '',
                onChange: (e) => updateNestedField('validation', 'max', e.target.value || null),
                className: 'form-control'
              })
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