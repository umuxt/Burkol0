// Form Builder Compact - Main component using modular architecture
import { FieldEditor } from './FieldEditor.js'
import { FieldList } from './FieldList.js'
import { FormPreview } from './FormPreview.js'
import { FormBuilderUtils } from './FormBuilderUtils.js'

const { useState, useEffect } = React

export function FormBuilderCompact({ isDarkMode, t, showNotification }) {
  const [fields, setFields] = useState([])
  const [editingField, setEditingField] = useState(null)
  const [isFieldEditorOpen, setIsFieldEditorOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('builder')
  const [formSettings, setFormSettings] = useState({
    title: 'Yeni Form',
    description: '',
    submitButtonText: 'Gönder'
  })
  const [savedFields, setSavedFields] = useState([])

  // Load saved form configuration on mount
  useEffect(() => {
    const saved = localStorage.getItem('formBuilder_config')
    if (saved) {
      try {
        const config = JSON.parse(saved)
        if (config.fields) {
          setFields(config.fields)
          setSavedFields(config.fields)
        }
        if (config.settings) {
          setFormSettings(config.settings)
        }
      } catch (error) {
        console.error('Kaydedilmiş form yüklenirken hata:', error)
        showNotification('Kaydedilmiş form yüklenemedi', 'error')
      }
    }
  }, [])

  // Save form configuration
  function saveFormConfig() {
    try {
      const config = {
        fields,
        settings: formSettings,
        savedAt: new Date().toISOString()
      }
      localStorage.setItem('formBuilder_config', JSON.stringify(config))
      setSavedFields([...fields])
      showNotification('Form yapılandırması kaydedildi', 'success')
    } catch (error) {
      console.error('Form kaydedilirken hata:', error)
      showNotification('Form kaydedilemedi', 'error')
    }
  }

  // Add new field
  function handleAddField(fieldType) {
    try {
      const newField = FormBuilderUtils.createNewField(fieldType)
      setEditingField(newField)
      setIsFieldEditorOpen(true)
    } catch (error) {
      showNotification(error.message, 'error')
    }
  }

  // Edit existing field
  function handleEditField(field) {
    setEditingField({ ...field })
    setIsFieldEditorOpen(true)
  }

  // Save field (add or update)
  function handleSaveField(fieldData) {
    try {
      const errors = FormBuilderUtils.validateField(fieldData)
      if (errors.length > 0) {
        showNotification(errors[0], 'error')
        return
      }

      const existingIndex = fields.findIndex(f => f.id === fieldData.id)
      
      if (existingIndex >= 0) {
        // Update existing field
        const newFields = [...fields]
        newFields[existingIndex] = fieldData
        setFields(newFields)
        showNotification('Alan güncellendi', 'success')
      } else {
        // Add new field
        setFields(prev => [...prev, fieldData])
        showNotification('Yeni alan eklendi', 'success')
      }
      
      setIsFieldEditorOpen(false)
      setEditingField(null)
    } catch (error) {
      showNotification(error.message, 'error')
    }
  }

  // Delete field
  function handleDeleteField(fieldId) {
    setFields(prev => prev.filter(f => f.id !== fieldId))
    showNotification('Alan silindi', 'success')
  }

  // Reorder fields
  function handleReorderField(fromIndex, toIndex) {
    const reorderedFields = FormBuilderUtils.reorderFields(fields, fromIndex, toIndex)
    setFields(reorderedFields)
    showNotification('Alan sıralaması değiştirildi', 'info')
  }

  // Clone field
  function handleCloneField(field) {
    const clonedField = FormBuilderUtils.cloneField(field)
    setFields(prev => [...prev, clonedField])
    showNotification('Alan kopyalandı', 'success')
  }

  // Export form configuration
  function handleExportForm() {
    try {
      const configJson = FormBuilderUtils.exportFormConfig(fields, formSettings)
      const blob = new Blob([configJson], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `form-config-${Date.now()}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showNotification('Form yapılandırması dışa aktarıldı', 'success')
    } catch (error) {
      showNotification('Dışa aktarma başarısız', 'error')
    }
  }

  // Import form configuration
  function handleImportForm(event) {
    const file = event.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const result = FormBuilderUtils.importFormConfig(e.target.result)
        setFields(result.fields)
        setFormSettings({ ...formSettings, ...result.settings })
        showNotification('Form yapılandırması içe aktarıldı', 'success')
      } catch (error) {
        showNotification(error.message, 'error')
      }
    }
    reader.readAsText(file)
  }

  // Clear all fields
  function handleClearForm() {
    if (window.confirm('Tüm alanları silmek istediğinizden emin misiniz?')) {
      setFields([])
      showNotification('Tüm alanlar silindi', 'info')
    }
  }

  // Check for unsaved changes
  const hasUnsavedChanges = FormBuilderUtils.hasUnsavedChanges(fields, savedFields)
  const formStats = FormBuilderUtils.getFormStatistics(fields)

  return React.createElement('div', { className: 'form-builder-container' },
    // Header
    React.createElement('div', { 
      className: 'form-builder-header',
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px',
        backgroundColor: 'white',
        borderBottom: '1px solid #ddd',
        marginBottom: '20px'
      }
    },
      React.createElement('div', null,
        React.createElement('h2', { style: { margin: '0 0 4px 0' } }, 'Form Oluşturucu'),
        React.createElement('div', { style: { fontSize: '14px', color: '#666' } },
          `${formStats.totalFields} alan • ${formStats.requiredFields} zorunlu`,
          hasUnsavedChanges && React.createElement('span', { 
            style: { color: '#dc3545', marginLeft: '8px' } 
          }, '• Kaydedilmemiş değişiklikler')
        )
      ),
      
      React.createElement('div', { style: { display: 'flex', gap: '8px' } },
        React.createElement('button', {
          onClick: saveFormConfig,
          className: 'btn btn-success',
          disabled: !hasUnsavedChanges,
          style: {
            opacity: hasUnsavedChanges ? 1 : 0.6,
            cursor: hasUnsavedChanges ? 'pointer' : 'not-allowed'
          }
        }, 'Kaydet'),
        
        React.createElement('button', {
          onClick: handleExportForm,
          className: 'btn btn-primary'
        }, 'Dışa Aktar'),
        
        React.createElement('label', {
          className: 'btn btn-secondary',
          style: { cursor: 'pointer' }
        }, 
          'İçe Aktar',
          React.createElement('input', {
            type: 'file',
            accept: '.json',
            onChange: handleImportForm,
            style: { display: 'none' }
          })
        ),
        
        React.createElement('button', {
          onClick: handleClearForm,
          className: 'btn btn-danger'
        }, 'Temizle')
      )
    ),

    // Tab Navigation
    React.createElement('div', { 
      className: 'tab-navigation',
      style: {
        display: 'flex',
        borderBottom: '1px solid #ddd',
        marginBottom: '20px'
      }
    },
      ['builder', 'preview'].map(tab =>
        React.createElement('button', {
          key: tab,
          onClick: () => setActiveTab(tab),
          className: `tab-button ${activeTab === tab ? 'active' : ''}`,
          style: {
            padding: '12px 24px',
            border: 'none',
            backgroundColor: activeTab === tab ? '#007bff' : 'transparent',
            color: activeTab === tab ? 'white' : '#666',
            borderBottom: activeTab === tab ? '2px solid #007bff' : '2px solid transparent',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: activeTab === tab ? 'bold' : 'normal'
          }
        }, 
          tab === 'builder' ? 'Form Tasarımı' : 'Önizleme'
        )
      )
    ),

    // Tab Content
    React.createElement('div', { className: 'tab-content' },
      activeTab === 'builder' && React.createElement('div', { className: 'builder-content' },
        // Field Type Buttons
        React.createElement('div', {
          className: 'field-type-buttons',
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: '8px',
            marginBottom: '20px',
            padding: '16px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px'
          }
        },
          React.createElement('h4', { style: { gridColumn: '1 / -1', margin: '0 0 12px 0' } }, 'Yeni Alan Ekle'),
          ...Object.entries(FormBuilderUtils.fieldTypes).map(([type, config]) =>
            React.createElement('button', {
              key: type,
              onClick: () => handleAddField(type),
              className: 'btn btn-outline-primary',
              style: {
                padding: '8px',
                fontSize: '12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                minHeight: '60px'
              }
            },
              React.createElement('span', { style: { fontSize: '16px' } }, config.icon),
              React.createElement('span', null, config.label)
            )
          )
        ),

        // Field List
        React.createElement(FieldList, {
          fields,
          onEditField: handleEditField,
          onDeleteField: handleDeleteField,
          onReorderField: handleReorderField,
          showNotification
        })
      ),

      activeTab === 'preview' && React.createElement(FormPreview, {
        fields,
        isDarkMode,
        t,
        showNotification
      })
    ),

    // Field Editor Modal
    isFieldEditorOpen && React.createElement(FieldEditor, {
      field: editingField,
      isOpen: isFieldEditorOpen,
      onSave: handleSaveField,
      onClose: () => {
        setIsFieldEditorOpen(false)
        setEditingField(null)
      },
      showNotification
    })
  )
}