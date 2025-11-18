// Form Builder Compact - Main component using modular architecture
import React from 'react';
import API from '../../../shared/lib/api.js'
import { FieldEditor } from './FieldEditor.js'
import { FieldList } from './FieldList.js'
import { FormBuilderUtils } from './FormBuilderUtils.js'

const { useState, useEffect, useMemo } = React;

export function FormBuilderCompact({ formConfig, onSave, isDarkMode, t, showNotification, renderHeaderActions }) {
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

  // Load form configuration from prop or API
  useEffect(() => {
    console.log('FormBuilderUtils.fieldTypes:', FormBuilderUtils.fieldTypes)
    if (formConfig) {
      // Use formConfig from props if available
      setFields(formConfig.fields || [])
      setSavedFields(formConfig.fields || [])
      setFormSettings(formConfig.settings || formSettings)
    } else {
      // Otherwise load from API
      loadFormConfig()
    }
  }, [formConfig])

  // Memoize header buttons to prevent infinite re-renders
  const headerButtons = useMemo(() => {
    const hasUnsavedChanges = FormBuilderUtils.hasUnsavedChanges(fields, savedFields)
    
    return [
      React.createElement('button', {
        key: 'save',
        onClick: saveFormConfig,
        className: 'mes-btn mes-btn-lg mes-btn-success',
        disabled: !hasUnsavedChanges,
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          opacity: hasUnsavedChanges ? 1 : 0.5,
          cursor: hasUnsavedChanges ? 'pointer' : 'not-allowed'
        }
      }, [
        React.createElement('span', {
          key: 'save-icon',
          style: { display: 'flex', alignItems: 'center' },
          dangerouslySetInnerHTML: { __html: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>' }
        }),
        'Kaydet'
      ]),
      
      React.createElement('button', {
        key: 'export',
        onClick: handleExportForm,
        className: 'mes-btn mes-btn-lg',
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgb(0, 0, 0)',
          color: 'rgb(255, 255, 255)'
        }
      }, [
        React.createElement('span', {
          key: 'export-icon',
          style: { display: 'flex', alignItems: 'center' },
          dangerouslySetInnerHTML: { __html: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' }
        }),
        'Dışa Aktar'
      ]),
      
      React.createElement('label', {
        key: 'import',
        className: 'mes-btn mes-btn-lg',
        style: {
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgb(0, 0, 0)',
          color: 'rgb(255, 255, 255)'
        }
      }, [
        React.createElement('span', {
          key: 'import-icon',
          style: { display: 'flex', alignItems: 'center' },
          dangerouslySetInnerHTML: { __html: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' }
        }),
        'İçe Aktar',
        React.createElement('input', {
          type: 'file',
          accept: '.json',
          onChange: handleImportForm,
          style: { display: 'none' }
        })
      ]),
      
      React.createElement('button', {
        key: 'clear',
        onClick: handleClearForm,
        className: 'mes-btn mes-btn-lg mes-btn-danger',
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }
      }, [
        React.createElement('span', {
          key: 'delete-icon',
          style: { display: 'flex', alignItems: 'center' },
          dangerouslySetInnerHTML: { __html: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>' }
        }),
        'Temizle'
      ])
    ]
  }, [fields, savedFields])

  // Send header actions to parent via callback
  useEffect(() => {
    if (renderHeaderActions) {
      renderHeaderActions(headerButtons)
    }
  }, [headerButtons])

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
      // API'ye bağlanılamadı, localStorage fallback kullan
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
          if (showNotification) {
            showNotification('API bağlantısı yok - Yerel kayıt kullanılıyor', 'warning')
          }
        } catch (localError) {
          console.error('Local storage yüklenirken hata:', localError)
          if (showNotification) {
            showNotification('Form yapılandırması yüklenemedi', 'error')
          }
        }
      } else {
        // localStorage de boş - boş formla devam et
        if (showNotification) {
          showNotification('API bağlantısı yok - Boş formla başlatılıyor', 'info')
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
      
      setSavedFields([...fields])
      
      // Use onSave prop if available, otherwise use API directly
      if (onSave && typeof onSave === 'function') {
        const result = await onSave(config)
        if (result && result.structuralChange) {
          showNotification(
            `Form yapılandırması kaydedildi. ${result.quotesMarkedForUpdate || 0} teklif fiyat güncellemesi için işaretlendi.`, 
            'success'
          )
        } else {
          showNotification('Form yapılandırması kaydedildi', 'success')
        }
      } else {
        // Fallback to API if no onSave prop
        const result = await API.saveFormConfig(config)
        localStorage.setItem('formBuilder_config', JSON.stringify({
          fields,
          settings: formSettings,
          savedAt: new Date().toISOString()
        }))
        
        if (result.structuralChange) {
          showNotification(
            `Form yapılandırması kaydedildi. ${result.quotesMarkedForUpdate || 0} teklif fiyat güncellemesi için işaretlendi.`, 
            'success'
          )
        } else {
          showNotification('Form yapılandırması kaydedildi', 'success')
        }
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

  return React.createElement('div', { 
    className: 'form-builder-container',
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '0'
    }
  },
    // Tab Navigation
    React.createElement('div', { 
      className: 'tab-navigation',
      style: {
        display: 'flex',
        borderBottom: '2px solid #e5e7eb',
        marginTop: '20px',
        marginBottom: '0',
        gap: '4px',
        background: '#fff',
        padding: '0 20px',
        borderRadius: '6px',
        border: '2px solid #e5e7eb'
      }
    },
      ['builder', 'preview'].map(tab =>
        React.createElement('button', {
          key: tab,
          onClick: () => setActiveTab(tab),
          className: `tab-button ${activeTab === tab ? 'active' : ''}`,
          style: {
            padding: '10px 20px',
            border: 'none',
            backgroundColor: activeTab === tab ? '#111827' : 'transparent',
            color: activeTab === tab ? '#fff' : '#6b7280',
            borderBottom: activeTab === tab ? '2px solid #111827' : 'none',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: activeTab === tab ? '600' : '500',
            borderRadius: '6px 6px 0 0',
            transition: 'all 0.2s'
          }
        }, 
          tab === 'builder' ? 'Form Tasarımı' : 'Önizleme'
        )
      )
    ),

    // Tab Content
    React.createElement('div', { 
      className: 'tab-content',
      style: {
        background: '#fff',
        border: '2px solid #e5e7eb',
        borderRadius: '6px',
        padding: '20px',
        minHeight: '400px'
      }
    },
      activeTab === 'builder' && React.createElement('div', { 
        className: 'builder-content',
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          minHeight: 'auto',
          height: 'auto'
        }
      },
        // Header with Add Button
        React.createElement('div', { 
          style: { 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '8px'
          } 
        },
          React.createElement('h3', { 
            style: { 
              margin: 0, 
              fontSize: '16px', 
              fontWeight: '600', 
              color: '#111827',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            } 
          },
            React.createElement('span', {
              dangerouslySetInnerHTML: {
                __html: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 7h.01"/><path d="M17 7h.01"/><path d="M7 17h.01"/><path d="M17 17h.01"/></svg>'
              }
            }),
            'Form Alanları'
          ),
          
          React.createElement('button', {
            onClick: handleAddNewField,
            className: 'mes-primary-action is-compact',
            style: {
              minWidth: 'fit-content',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }
          }, [
            React.createElement('span', {
              key: 'icon',
              style: { display: 'flex', alignItems: 'center' },
              dangerouslySetInnerHTML: {
                __html: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>'
              }
            }),
            React.createElement('span', { key: 'text' }, 'Yeni Alan Ekle')
          ])
        ),
        
        // Empty state or Field List
        fields.length === 0 ? React.createElement('div', { 
          style: { 
            textAlign: 'center', 
            padding: '60px 20px',
            background: '#f9fafb',
            border: '2px dashed #e5e7eb',
            borderRadius: '8px',
            marginTop: '20px'
          }
        },
          React.createElement('div', { 
            style: { 
              width: '48px', 
              height: '48px', 
              margin: '0 auto 16px',
              color: '#9ca3af'
            },
            dangerouslySetInnerHTML: { 
              __html: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 7h.01"/><path d="M17 7h.01"/><path d="M7 17h.01"/><path d="M17 17h.01"/></svg>'
            }
          }),
          React.createElement('p', { 
            style: { 
              margin: '0 0 8px 0', 
              fontSize: '15px', 
              fontWeight: 600, 
              color: '#111827' 
            } 
          }, 'Henüz Form Alanı Eklenmedi'),
          React.createElement('p', { 
            style: { 
              margin: 0, 
              fontSize: '13px', 
              color: '#6b7280' 
            } 
          }, 'Yukarıdaki "Yeni Alan Ekle" butonunu kullanarak form alanları ekleyin')
        ) : React.createElement(FieldList, {
          fields,
          onEditField: handleEditField,
          onDeleteField: handleDeleteField,
          onDuplicateField: handleDuplicateField,
          onReorderFields: handleReorderField
        })
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

    // Field Editor Modal - Overlay style like PricingManager
    isFieldEditorOpen && React.createElement('div', {
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '20px'
      },
      onClick: (e) => {
        if (e.target === e.currentTarget) {
          setIsFieldEditorOpen(false)
          setEditingField(null)
        }
      }
    },
      React.createElement('div', {
        style: {
          background: '#fff',
          borderRadius: '8px',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
        },
        onClick: (e) => e.stopPropagation()
      },
        React.createElement(FieldEditor, {
          field: editingField,
          onSave: handleSaveField,
          onCancel: () => {
            setIsFieldEditorOpen(false)
            setEditingField(null)
          },
          showNotification
        })
      )
    )
  )
}