import API from '../lib/api.js'

const { useState, useEffect } = React

export default function FormBuilder({ onClose, showNotification, t }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formConfig, setFormConfig] = useState(null)
  const [fields, setFields] = useState([])
  const [editingField, setEditingField] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [migrationStatus, setMigrationStatus] = useState(null)

  // Field editing states
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

  const fieldTypes = [
    { value: 'text', label: 'Metin' },
    { value: 'textarea', label: 'Uzun Metin' },
    { value: 'number', label: 'Sayı' },
    { value: 'email', label: 'E-posta' },
    { value: 'phone', label: 'Telefon' },
    { value: 'dropdown', label: 'Açılır Liste (Tekli Seçim)' },
    { value: 'multiselect', label: 'Çoklu Seçim' },
    { value: 'radio', label: 'Seçenek Butonları' },
    { value: 'checkbox', label: 'Onay Kutusu' },
    { value: 'date', label: 'Tarih' },
    { value: 'file', label: 'Dosya' }
  ]

  useEffect(() => {
    loadFormConfig()
  }, [])

  async function loadFormConfig() {
    try {
      setLoading(true)
      const config = await API.getFormConfig()
      setFormConfig(config.formConfig)
      setFields(config.formConfig.fields || [])
      setMigrationStatus({
        pricingConfigured: config.pricingConfig.isConfigured,
        migrationStatus: config.migrationStatus
      })
    } catch (error) {
      console.error('Load form config error:', error)
      showNotification('Form konfigürasyonu yüklenemedi', 'error')
    } finally {
      setLoading(false)
    }
  }

  function resetFieldForm() {
    setFieldForm({
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
        tableOrder: Math.max(...fields.map(f => f.display?.tableOrder || 0), 10) + 1,
        formOrder: Math.max(...fields.map(f => f.display?.formOrder || 0), 10) + 1
      }
    })
  }

  function startAddField() {
    resetFieldForm()
    setEditingField(null)
    setShowAddModal(true)
  }

  function startEditField(field) {
    setFieldForm({
      ...field,
      options: field.options ? [...field.options] : []
    })
    setEditingField(field.id)
    setShowAddModal(true)
  }

  function generateFieldId(label) {
    return 'field_' + label.toLowerCase()
      .replace(/[üğıöç]/g, (m) => ({ ü: 'u', ğ: 'g', ı: 'i', ö: 'o', ç: 'c' }[m]))
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
  }

  function handleFieldFormChange(key, value) {
    if (key === 'label' && !editingField) {
      // Auto-generate ID for new fields
      setFieldForm(prev => ({
        ...prev,
        [key]: value,
        id: generateFieldId(value)
      }))
    } else {
      setFieldForm(prev => ({
        ...prev,
        [key]: value
      }))
    }
  }

  function handleNestedChange(path, value) {
    setFieldForm(prev => {
      const keys = path.split('.')
      const newObj = { ...prev }
      let current = newObj
      
      for (let i = 0; i < keys.length - 1; i++) {
        current[keys[i]] = { ...current[keys[i]] }
        current = current[keys[i]]
      }
      
      current[keys[keys.length - 1]] = value
      return newObj
    })
  }

  function addOption() {
    if (!fieldForm.newOption?.trim()) return
    
    setFieldForm(prev => ({
      ...prev,
      options: [...(prev.options || []), prev.newOption.trim()],
      newOption: ''
    }))
  }

  function removeOption(index) {
    setFieldForm(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index)
    }))
  }

  function validateField() {
    const errors = []
    
    if (!fieldForm.label?.trim()) {
      errors.push('Alan adı zorunludur')
    }
    
    if (!fieldForm.id?.trim()) {
      errors.push('Alan ID\'si zorunludur')
    }
    
    if (editingField !== fieldForm.id && fields.some(f => f.id === fieldForm.id)) {
      errors.push('Bu ID zaten kullanılıyor')
    }
    
    if (['dropdown', 'multiselect', 'radio'].includes(fieldForm.type) && 
        (!fieldForm.options || fieldForm.options.length === 0)) {
      errors.push('Bu alan tipi için seçenekler gereklidir')
    }
    
    return errors
  }

  async function saveField() {
    const errors = validateField()
    if (errors.length > 0) {
      showNotification(errors.join(', '), 'error')
      return
    }

    const cleanFieldForm = {
      ...fieldForm,
      createdAt: editingField ? fields.find(f => f.id === editingField)?.createdAt : new Date().toISOString(),
      modifiedAt: new Date().toISOString()
    }
    delete cleanFieldForm.newOption

    let newFields
    if (editingField) {
      newFields = fields.map(f => f.id === editingField ? cleanFieldForm : f)
    } else {
      newFields = [...fields, cleanFieldForm]
    }

    setFields(newFields)
    setShowAddModal(false)
    resetFieldForm()
    setEditingField(null)
    
    showNotification(editingField ? 'Alan güncellendi' : 'Alan eklendi', 'success')
  }

  function deleteField(fieldId) {
    if (!confirm('Bu alanı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz ve tüm ilgili veriler silinecektir.')) {
      return
    }

    const newFields = fields.filter(f => f.id !== fieldId)
    setFields(newFields)
    showNotification('Alan silindi', 'success')
  }

  async function saveFormConfig() {
    try {
      setSaving(true)
      const result = await API.saveFormConfig({ fields })
      
      if (result.pricingReset) {
        showNotification('Form konfigürasyonu kaydedildi. Fiyat hesaplama ayarları sıfırlandı!', 'warning')
      } else {
        showNotification('Form konfigürasyonu kaydedildi', 'success')
      }
      
      // Reload to get updated status
      await loadFormConfig()
    } catch (error) {
      console.error('Save form config error:', error)
      showNotification('Form konfigürasyonu kaydedilemedi', 'error')
    } finally {
      setSaving(false)
    }
  }

  function moveField(fieldId, direction) {
    const fieldIndex = fields.findIndex(f => f.id === fieldId)
    if (fieldIndex === -1) return

    const newFields = [...fields]
    const targetIndex = direction === 'up' ? fieldIndex - 1 : fieldIndex + 1

    if (targetIndex >= 0 && targetIndex < newFields.length) {
      [newFields[fieldIndex], newFields[targetIndex]] = [newFields[targetIndex], newFields[fieldIndex]]
      
      // Update form orders
      newFields.forEach((field, index) => {
        field.display.formOrder = index + 1
      })
      
      setFields(newFields)
    }
  }

  if (loading) {
    return React.createElement('div', { className: 'loading' }, 'Form konfigürasyonu yükleniyor...')
  }

  return React.createElement('div', { className: 'form-builder' },
    // Header
    React.createElement('div', { className: 'form-builder-header' },
      React.createElement('h2', null, 'Form Alanları Düzenleme'),
      React.createElement('div', { className: 'form-builder-actions' },
        React.createElement('button', {
          className: 'btn',
          onClick: onClose
        }, 'Kapat'),
        React.createElement('button', {
          className: 'btn accent',
          onClick: saveFormConfig,
          disabled: saving
        }, saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet')
      )
    ),

    // Warning about pricing reset
    !migrationStatus?.pricingConfigured && React.createElement('div', { 
      className: 'notice warning',
      style: { marginBottom: '1rem' }
    }, '⚠️ Fiyat hesaplama ayarları yapılandırılmamış. Form değişiklikleri sonrası fiyat ayarlarını tekrar yapılandırmanız gerekecek.'),

    // Default fields info
    React.createElement('div', { className: 'default-fields-info' },
      React.createElement('h3', null, 'Sabit Alanlar (Silinemez)'),
      React.createElement('div', { className: 'field-grid' },
        formConfig?.defaultFields?.map(field => 
          React.createElement('div', { key: field.id, className: 'field-item readonly' },
            React.createElement('div', { className: 'field-header' },
              React.createElement('span', { className: 'field-label' }, field.label),
              React.createElement('span', { className: 'field-type' }, field.type),
              field.required && React.createElement('span', { className: 'required-badge' }, 'Zorunlu')
            )
          )
        )
      )
    ),

    // Custom fields
    React.createElement('div', { className: 'custom-fields' },
      React.createElement('div', { className: 'section-header' },
        React.createElement('h3', null, 'Özel Alanlar'),
        React.createElement('button', {
          className: 'btn accent',
          onClick: startAddField
        }, '+ Yeni Alan Ekle')
      ),

      fields.length === 0 ? 
        React.createElement('div', { className: 'empty-state' }, 
          'Henüz özel alan eklenmemiş. "Yeni Alan Ekle" butonuna tıklayarak başlayın.'
        ) :
        React.createElement('div', { className: 'field-grid' },
          fields.map((field, index) => 
            React.createElement('div', { key: field.id, className: 'field-item' },
              React.createElement('div', { className: 'field-header' },
                React.createElement('span', { className: 'field-label' }, field.label),
                React.createElement('span', { className: 'field-type' }, 
                  fieldTypes.find(t => t.value === field.type)?.label || field.type
                ),
                field.required && React.createElement('span', { className: 'required-badge' }, 'Zorunlu')
              ),
              
              React.createElement('div', { className: 'field-info' },
                React.createElement('div', null, `ID: ${field.id}`),
                field.options && field.options.length > 0 && 
                  React.createElement('div', null, `Seçenekler: ${field.options.join(', ')}`),
                React.createElement('div', null, 
                  `Tablo: ${field.display?.showInTable ? 'Göster' : 'Gizle'} | `,
                  `Filtre: ${field.display?.showInFilter ? 'Var' : 'Yok'}`
                )
              ),

              React.createElement('div', { className: 'field-actions' },
                React.createElement('button', {
                  className: 'btn-icon',
                  onClick: () => moveField(field.id, 'up'),
                  disabled: index === 0,
                  title: 'Yukarı taşı'
                }, '↑'),
                React.createElement('button', {
                  className: 'btn-icon',
                  onClick: () => moveField(field.id, 'down'),
                  disabled: index === fields.length - 1,
                  title: 'Aşağı taşı'
                }, '↓'),
                React.createElement('button', {
                  className: 'btn small',
                  onClick: () => startEditField(field)
                }, 'Düzenle'),
                React.createElement('button', {
                  className: 'btn small danger',
                  onClick: () => deleteField(field.id)
                }, 'Sil')
              )
            )
          )
        )
    ),

    // Add/Edit Modal
    showAddModal && React.createElement('div', { className: 'modal-overlay', onClick: () => setShowAddModal(false) },
      React.createElement('div', { className: 'modal large', onClick: (e) => e.stopPropagation() },
        React.createElement('div', { className: 'modal-header' },
          React.createElement('h3', null, editingField ? 'Alan Düzenle' : 'Yeni Alan Ekle'),
          React.createElement('button', { className: 'btn-close', onClick: () => setShowAddModal(false) }, '×')
        ),
        
        React.createElement('div', { className: 'modal-body' },
          React.createElement('div', { className: 'grid two' },
            // Basic Info
            React.createElement('div', { className: 'field' },
              React.createElement('label', null, 'Alan Adı *'),
              React.createElement('input', {
                type: 'text',
                value: fieldForm.label,
                onChange: (e) => handleFieldFormChange('label', e.target.value),
                placeholder: 'Örn: Malzeme Türü'
              })
            ),
            
            React.createElement('div', { className: 'field' },
              React.createElement('label', null, 'Alan ID *'),
              React.createElement('input', {
                type: 'text',
                value: fieldForm.id,
                onChange: (e) => handleFieldFormChange('id', e.target.value),
                placeholder: 'Örn: field_material_type',
                disabled: !!editingField
              })
            ),

            React.createElement('div', { className: 'field' },
              React.createElement('label', null, 'Alan Tipi *'),
              React.createElement('select', {
                value: fieldForm.type,
                onChange: (e) => handleFieldFormChange('type', e.target.value)
              },
                fieldTypes.map(type => 
                  React.createElement('option', { key: type.value, value: type.value }, type.label)
                )
              )
            ),

            React.createElement('div', { className: 'field' },
              React.createElement('label', null, 'Placeholder'),
              React.createElement('input', {
                type: 'text',
                value: fieldForm.placeholder,
                onChange: (e) => handleFieldFormChange('placeholder', e.target.value),
                placeholder: 'Kullanıcının göreceği ipucu metni'
              })
            )
          ),

          // Options for select types
          ['dropdown', 'multiselect', 'radio'].includes(fieldForm.type) &&
            React.createElement('div', { className: 'field' },
              React.createElement('label', null, 'Seçenekler *'),
              React.createElement('div', { className: 'options-editor' },
                React.createElement('div', { className: 'add-option' },
                  React.createElement('input', {
                    type: 'text',
                    value: fieldForm.newOption || '',
                    onChange: (e) => handleFieldFormChange('newOption', e.target.value),
                    placeholder: 'Yeni seçenek ekle',
                    onKeyPress: (e) => e.key === 'Enter' && addOption()
                  }),
                  React.createElement('button', {
                    type: 'button',
                    className: 'btn small',
                    onClick: addOption
                  }, 'Ekle')
                ),
                React.createElement('div', { className: 'options-list' },
                  fieldForm.options?.map((option, index) =>
                    React.createElement('div', { key: index, className: 'option-item' },
                      React.createElement('span', null, option),
                      React.createElement('button', {
                        type: 'button',
                        className: 'btn-remove',
                        onClick: () => removeOption(index)
                      }, '×')
                    )
                  )
                )
              )
            ),

          // Settings
          React.createElement('div', { className: 'grid three' },
            React.createElement('div', { className: 'field' },
              React.createElement('label', { className: 'checkbox' },
                React.createElement('input', {
                  type: 'checkbox',
                  checked: fieldForm.required,
                  onChange: (e) => handleFieldFormChange('required', e.target.checked)
                }),
                React.createElement('span', null, 'Zorunlu Alan')
              )
            ),

            React.createElement('div', { className: 'field' },
              React.createElement('label', { className: 'checkbox' },
                React.createElement('input', {
                  type: 'checkbox',
                  checked: fieldForm.display?.showInTable,
                  onChange: (e) => handleNestedChange('display.showInTable', e.target.checked)
                }),
                React.createElement('span', null, 'Tabloda Göster')
              )
            ),

            React.createElement('div', { className: 'field' },
              React.createElement('label', { className: 'checkbox' },
                React.createElement('input', {
                  type: 'checkbox',
                  checked: fieldForm.display?.showInFilter,
                  onChange: (e) => handleNestedChange('display.showInFilter', e.target.checked)
                }),
                React.createElement('span', null, 'Filtreleme Var')
              )
            )
          )
        ),

        React.createElement('div', { className: 'modal-footer' },
          React.createElement('button', {
            className: 'btn',
            onClick: () => setShowAddModal(false)
          }, 'İptal'),
          React.createElement('button', {
            className: 'btn accent',
            onClick: saveField
          }, editingField ? 'Güncelle' : 'Ekle')
        )
      )
    )
  )
}