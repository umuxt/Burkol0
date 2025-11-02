// Form Builder Compact - Main component using modular architecture
import React from 'react';
import API from '../../../shared/lib/api.js'
import { FieldEditor } from './FieldEditor.js'
import { FieldList } from './FieldList.js'
import { FormBuilderUtils } from './FormBuilderUtils.js'

const { useState, useEffect } = React;

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
    console.log('FormBuilderUtils.fieldTypes:', FormBuilderUtils.fieldTypes)
    loadFormConfig()
  }, [])

  async function loadFormConfig() {
    try {
      // Try to load from API first
      const config = await API.getFormConfig()
      if (config.formConfig && config.formConfig.formStructure && config.formConfig.formStructure.fields) {
        setFields(config.formConfig.formStructure.fields)
        setSavedFields(config.formConfig.formStructure.fields)
        
        if (config.formConfig.formStructure.title || config.formConfig.formStructure.description) {
          setFormSettings({
            title: config.formConfig.formStructure.title || 'Yeni Form',
            description: config.formConfig.formStructure.description || '',
            submitButtonText: config.formConfig.formStructure.submitButtonText || 'Gönder'
          })
        }
      } else {
        // Fallback to localStorage if API doesn't have config
        const saved = localStorage.getItem('formBuilder_config')
        if (saved) {
          const localConfig = JSON.parse(saved)
          if (localConfig.fields) {
            setFields(localConfig.fields)
            setSavedFields(localConfig.fields)
          }
          if (localConfig.settings) {
            setFormSettings(localConfig.settings)
          }
        }
      }
    } catch (error) {
      console.error('Form yüklenirken hata:', error)
      // Try localStorage as backup
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
        } catch (localError) {
          console.error('Local storage yüklenirken hata:', localError)
          showNotification('Kaydedilmiş form yüklenemedi', 'error')
        }
      }
    }
  }

  // Save form configuration
  async function saveFormConfig() {
    try {
      const config = {
        formStructure: {
          title: formSettings.title,
          description: formSettings.description,
          submitButtonText: formSettings.submitButtonText,
          fields: fields
        },
        version: Date.now(), // Simple version based on timestamp
        lastModified: new Date().toISOString()
      }
      
      // Save both to API and localStorage (as backup)
      const result = await API.saveFormConfig(config)
      localStorage.setItem('formBuilder_config', JSON.stringify({
        fields,
        settings: formSettings,
        savedAt: new Date().toISOString()
      }))
      
      setSavedFields([...fields])
      
      if (result.structuralChange) {
        showNotification(
          `Form yapılandırması kaydedildi. ${result.quotesMarkedForUpdate || 0} teklif fiyat güncellemesi için işaretlendi.`, 
          'success'
        )
      } else {
        showNotification('Form yapılandırması kaydedildi', 'success')
      }
    } catch (error) {
      console.error('Form kaydedilirken hata:', error)
      showNotification('Form kaydedilemedi: ' + (error.message || 'Bilinmeyen hata'), 'error')
    }
  }

  // Add new field with default type (text)
  function handleAddNewField() {
    console.log('handleAddNewField called')
    try {
      const newField = FormBuilderUtils.createNewField('text')
      console.log('New field created:', newField)
      setEditingField(newField)
      setIsFieldEditorOpen(true)
    } catch (error) {
      console.error('Error in handleAddNewField:', error)
      showNotification(error.message, 'error')
    }
  }

  // Add new field
  function handleAddField(fieldType) {
    console.log('handleAddField called with:', fieldType)
    try {
      const newField = FormBuilderUtils.createNewField(fieldType)
      console.log('New field created:', newField)
      setEditingField(newField)
      setIsFieldEditorOpen(true)
    } catch (error) {
      console.error('Error in handleAddField:', error)
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

  // Duplicate field (alias for clone)
  function handleDuplicateField(field) {
    handleCloneField(field)
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
      activeTab === 'builder' && React.createElement('div', { 
        className: 'builder-content',
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: '8px', // Small consistent gap between elements
          minHeight: 'auto',
          height: 'auto' // Let content determine height
        }
      },
        // Existing Fields List
        React.createElement('div', {
          style: {
            flex: '0 0 auto' // Don't grow, natural height, no margin
          }
        },
          React.createElement(FieldList, {
            fields,
            onEditField: handleEditField,
            onDeleteField: handleDeleteField,
            onDuplicateField: handleDuplicateField,
            onReorderFields: handleReorderField
          })
        ),
        
        // Add New Field Button - Now closer to the field list
        React.createElement('div', { 
          style: { 
            flex: '0 0 auto', // Don't grow
            padding: '8px 16px', // Reduced padding
            borderTop: '2px dashed #dee2e6',
            textAlign: 'center',
            marginTop: '0' // No additional margin since we use gap
          }
        },
          React.createElement('button', {
            onClick: handleAddNewField,
            className: 'btn btn-primary',
            style: {
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: '600',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px'
            }
          },
            React.createElement('span', { style: { fontSize: '18px' } }, '+'),
            'Yeni Alan Ekle'
          )
        )
      ),

      activeTab === 'preview' && React.createElement(React.Fragment, null,
        React.createElement('h3', {
          style: {
            marginTop: '0',
            marginBottom: '20px',
            paddingBottom: '10px',
            borderBottom: '2px solid #007bff',
            color: '#333'
          }
        }, 'Form Önizlemesi'),
        
        React.createElement('form', null,
          ...fields.map(field => 
            React.createElement('div', {
              key: field.id,
              className: 'preview-field',
              style: {
                marginBottom: '20px',
                padding: '12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                backgroundColor: 'white'
              }
            },
              React.createElement('label', {
                style: {
                  display: 'block',
                  marginBottom: '6px',
                  fontWeight: '500',
                  color: '#333'
                }
              }, field.label),
              
              field.type === 'text' && React.createElement('input', {
                type: 'text',
                placeholder: field.placeholder,
                className: 'form-control',
                style: {
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '14px'
                }
              }),
              
              field.type === 'number' && React.createElement('input', {
                type: 'number',
                placeholder: field.placeholder,
                min: field.validation?.min || undefined,
                max: field.validation?.max || undefined,
                className: 'form-control',
                style: {
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '14px'
                }
              }),
              
              field.type === 'textarea' && React.createElement('textarea', {
                placeholder: field.placeholder,
                className: 'form-control',
                rows: 3,
                style: {
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '14px',
                  resize: 'vertical'
                }
              }),
              
              field.type === 'dropdown' && React.createElement('select', {
                className: 'form-control',
                style: {
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '14px'
                }
              },
                React.createElement('option', { value: '' }, field.placeholder || 'Seçiniz...'),
                ...field.options.map((option, index) =>
                  React.createElement('option', { key: index, value: option }, option)
                )
              )
            )
          ),
          
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
      )
    ),

    // Field Editor Modal
    isFieldEditorOpen && React.createElement(FieldEditor, {
      field: editingField,
      onSave: handleSaveField,
      onCancel: () => {
        setIsFieldEditorOpen(false)
        setEditingField(null)
      },
      showNotification
    })
  )
}