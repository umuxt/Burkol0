import { showToast } from '../../../../../shared/components/MESToast.js';
// Form Builder Compact - Main component using modular architecture
import React from 'react';
import API from '../../../../../shared/lib/api.js'
import { FieldEditor } from './FieldEditor.js'
import { FieldList } from './FieldList.js'
import { FormBuilderUtils } from './FormBuilderUtils.js'

const { useState, useEffect, useMemo, useRef } = React;

export function FormBuilderCompact({ 
  formConfig, 
  onSave, 
  onActivate,
  onRevertChanges,
  onFieldsChange,
  onDisplaySettingsChange, // QT-4: Display ayarları için ayrı callback (versioning tetiklemez)
  hasChanges = false,
  originalFields = [],
  isDarkMode, 
  t, 
  showNotification, 
  renderHeaderActions,
  // Versioning props
  allTemplates = [],
  activeTemplateId = null,
  currentTemplateId = null,
  isCurrentDraft = false,
  isNewDraftModalOpen = false,
  isHistoryModalOpen = false,
  newDraftName = '',
  onCreateDraft = () => {},
  onSwitchTemplate = () => {},
  onActivateTemplate = () => {},
  onOpenNewDraftModal = () => {},
  onCloseNewDraftModal = () => {},
  onOpenHistoryModal = () => {},
  onCloseHistoryModal = () => {},
  onDraftNameChange = () => {}
}) {
  const [fields, setFields] = useState([])
  const [editingField, setEditingField] = useState(null)
  const [isFieldEditorOpen, setIsFieldEditorOpen] = useState(false)
  const [formSettings, setFormSettings] = useState({
    title: 'Yeni Form',
    description: '',
    submitButtonText: 'Gönder'
  })
  const [savedFields, setSavedFields] = useState([])
  const fieldEditorRef = useRef(null)

  // Close field editor when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (isFieldEditorOpen && fieldEditorRef.current && !fieldEditorRef.current.contains(event.target)) {
        // Toast notification kontrolü - toast elementlerine tıklanırsa kapatma
        const toastContainer = document.getElementById('toast-container')
        if (toastContainer && toastContainer.contains(event.target)) {
          return // Toast'a tıklandıysa modal'ı kapatma
        }
        
        setIsFieldEditorOpen(false)
        setEditingField(null)
      }
    }

    if (isFieldEditorOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isFieldEditorOpen])

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

  // Notify parent when fields change for hasChanges tracking
  useEffect(() => {
    if (onFieldsChange) {
      onFieldsChange(fields)
    }
  }, [fields, onFieldsChange])

  // Memoize header buttons to prevent infinite re-renders
  // Button visibility matrix:
  // | isActive | hasChanges | Visible Buttons |
  // |----------|------------|-----------------|
  // | true     | false      | [+Yeni Taslak] |
  // | true     | true       | [Değişiklikleri Geri Al] [Yeni Taslak Olarak Kaydet] |
  // | false    | false      | [Aktif Et] [+Yeni Taslak] |
  // | false    | true       | [Değişiklikleri Geri Al] [Taslağı Güncelle] |
  const headerButtons = useMemo(() => {
    const isActive = !isCurrentDraft // isActive = NOT draft
    
    // Build dynamic buttons based on matrix
    const dynamicButtons = []
    
    // Status Badge - always visible with form name
    const formName = formSettings?.title || 'Form'
    dynamicButtons.push(
      React.createElement('span', {
        key: 'status-badge',
        style: {
          padding: '6px 12px',
          background: isCurrentDraft ? '#fef3c7' : '#d1fae5',
          color: isCurrentDraft ? '#92400e' : '#065f46',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '5px'
        }
      },
        // Icon: Pencil for draft, Check for active
        React.createElement('span', {
          key: 'status-icon',
          style: { display: 'flex', alignItems: 'center' },
          dangerouslySetInnerHTML: { 
            __html: isCurrentDraft 
              ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>'
              : '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
          }
        }),
        // Status text
        React.createElement('span', { key: 'status-text' }, isCurrentDraft ? 'Taslak' : 'Aktif'),
        // Separator
        React.createElement('span', { key: 'separator', style: { opacity: 0.6 } }, '•'),
        // Form name (bold)
        React.createElement('strong', { key: 'form-name' }, formName)
      )
    )
    
    // "Değişiklikleri Geri Al" - visible when hasChanges=true (any isActive state)
    if (hasChanges) {
      dynamicButtons.push(
        React.createElement('button', {
          key: 'revert-changes',
          onClick: () => onRevertChanges && onRevertChanges(),
          className: 'mes-btn mes-btn-lg',
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: '#fff',
            color: '#ef4444', // Red
            border: '2px solid #ef4444',
            fontWeight: 500
          }
        },
          React.createElement('span', {
            key: 'revert-icon',
            style: { display: 'flex', alignItems: 'center' },
            dangerouslySetInnerHTML: { __html: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>' }
          }),
          'Değişiklikleri Geri Al'
        )
      )
    }
    
    // Buttons based on isActive + hasChanges combinations
    if (isActive && hasChanges) {
      // isActive=true, hasChanges=true: "Yeni Taslak Olarak Kaydet" (yellow)
      dynamicButtons.push(
        React.createElement('button', {
          key: 'save-as-new-draft',
          onClick: handleSaveDraft,
          className: 'mes-btn mes-btn-lg',
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: '#f59e0b', // Yellow
            color: '#fff',
            border: 'none'
          }
        },
          React.createElement('span', {
            key: 'save-icon',
            style: { display: 'flex', alignItems: 'center' },
            dangerouslySetInnerHTML: { __html: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>' }
          }),
          'Yeni Taslak Olarak Kaydet'
        )
      )
    } else if (!isActive && hasChanges) {
      // isActive=false, hasChanges=true: "Taslağı Güncelle" (yellow)
      dynamicButtons.push(
        React.createElement('button', {
          key: 'update-draft',
          onClick: handleSaveDraft,
          className: 'mes-btn mes-btn-lg',
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: '#f59e0b', // Yellow
            color: '#fff',
            border: 'none'
          }
        },
          React.createElement('span', {
            key: 'save-icon',
            style: { display: 'flex', alignItems: 'center' },
            dangerouslySetInnerHTML: { __html: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>' }
          }),
          'Taslağı Güncelle'
        )
      )
    }
    
    // "Aktif Et" - visible when isActive=false AND hasChanges=false
    if (!isActive && !hasChanges) {
      dynamicButtons.push(
        React.createElement('button', {
          key: 'activate',
          onClick: handleActivate,
          className: 'mes-btn mes-btn-lg',
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: '#10b981', // Green
            color: '#fff',
            border: 'none'
          }
        },
          React.createElement('span', {
            key: 'activate-icon',
            style: { display: 'flex', alignItems: 'center' },
            dangerouslySetInnerHTML: { __html: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' }
          }),
          'Aktif Et'
        )
      )
    }
    
    // "+Yeni Taslak" - visible when hasChanges=false (any isActive state)
    if (!hasChanges) {
      dynamicButtons.push(
        React.createElement('button', {
          key: 'new-draft',
          onClick: onOpenNewDraftModal,
          className: 'mes-btn mes-btn-lg',
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'rgb(255, 255, 255)',
            color: 'rgb(0, 0, 0)',
            border: '1px solid rgb(229, 231, 235)'
          }
        },
          React.createElement('span', {
            key: 'draft-icon',
            style: { display: 'flex', alignItems: 'center' },
            dangerouslySetInnerHTML: { __html: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>' }
          }),
          'Yeni Taslak'
        )
      )
    }
    
    // Static buttons: Geçmiş, Dışa Aktar, İçe Aktar (always visible)
    dynamicButtons.push(
      // History button
      React.createElement('button', {
        key: 'history',
        onClick: onOpenHistoryModal,
        className: 'mes-btn mes-btn-lg',
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          background: 'rgb(255, 255, 255)',
          color: 'rgb(0, 0, 0)',
          border: '1px solid rgb(229, 231, 235)'
        }
      },
        React.createElement('span', {
          key: 'history-icon',
          style: { display: 'flex', alignItems: 'center' },
          dangerouslySetInnerHTML: { __html: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' }
        }),
        'Geçmiş'
      ),
      
      React.createElement('button', {
        key: 'export',
        onClick: handleExportForm,
        className: 'mes-btn mes-btn-lg',
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          background: 'rgb(255, 255, 255)',
          color: 'rgb(0, 0, 0)',
          border: '1px solid rgb(229, 231, 235)'
        }
      },
        React.createElement('span', {
          key: 'export-icon',
          style: { display: 'flex', alignItems: 'center' },
          dangerouslySetInnerHTML: { __html: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' }
        }),
        'Dışa Aktar'
      ),
      
      React.createElement('label', {
        key: 'import',
        className: 'mes-btn mes-btn-lg',
        style: {
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          background: 'rgb(255, 255, 255)',
          color: 'rgb(0, 0, 0) !important',
          border: '1px solid rgb(229, 231, 235)'
        }
      },
        React.createElement('span', {
          key: 'import-icon',
          style: { 
            display: 'flex', 
            alignItems: 'center',
            color: 'rgb(0, 0, 0)'
          },
          dangerouslySetInnerHTML: { __html: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' }
        }),
        React.createElement('span', {
          key: 'import-text',
          style: { color: 'rgb(0, 0, 0)' }
        }, 'İçe Aktar'),
        React.createElement('input', {
          type: 'file',
          accept: '.json',
          onChange: handleImportForm,
          style: { display: 'none' }
        })
      )
    )
    
    return dynamicButtons
  }, [fields, savedFields, currentTemplateId, activeTemplateId, isCurrentDraft, hasChanges, onRevertChanges])

  // Send header actions to parent via callback
  useEffect(() => {
    if (renderHeaderActions) {
      renderHeaderActions(headerButtons)
    }
  }, [headerButtons])

  // Handle draft save
  function handleSaveDraft() {
    if (onSave) {
      const config = {
        name: formSettings.title || 'Teklif Formu',
        description: formSettings.description,
        fields: fields
      }
      onSave(config)
      setSavedFields([...fields])
    }
  }

  // Handle template activation
  function handleActivate() {
    const config = {
      name: formSettings.title || 'Teklif Formu',
      description: formSettings.description,
      fields: fields
    }
    
    if (onActivate) {
      onActivate(config)
      setSavedFields([...fields])
    } else if (onSave) {
      // Fallback: use onSave if onActivate not provided
      onSave(config)
      setSavedFields([...fields])
    }
  }

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
          // Using showToast directly
          showToast('API bağlantısı yok - Yerel kayıt kullanılıyor', 'warning')
        } catch (localError) {
          console.error('Local storage yüklenirken hata:', localError)
          // Using showToast directly
          showToast('Form yapılandırması yüklenemedi', 'error')
        }
      } else {
        // localStorage de boş - boş formla devam et
        // Using showToast directly
        showToast('API bağlantısı yok - Boş formla başlatılıyor', 'info')
      }
    }
  }

  // Save form configuration
  async function saveFormConfig() {
    try {
      const config = {
        name: formSettings.title || 'Teklif Formu',
        description: formSettings.description,
        fields: fields
      }
      
      setSavedFields([...fields])
      
      // Use onSave prop if available, otherwise use API directly
      if (onSave && typeof onSave === 'function') {
        const result = await onSave(config)
        if (result && result.structuralChange) {
          showToast(
            `Form yapılandırması kaydedildi. ${result.quotesMarkedForUpdate || 0} teklif fiyat güncellemesi için işaretlendi.`, 
            'success'
          )
        } else {
          // Don't show notification here, FormManager will show it
          // showToast('Form yapılandırması kaydedildi', 'success')
        }
      } else {
        // Fallback to API if no onSave prop (legacy support)
        const legacyConfig = {
          formStructure: {
            title: formSettings.title,
            description: formSettings.description,
            submitButtonText: formSettings.submitButtonText,
            fields: fields
          },
          version: Date.now(),
          lastModified: new Date().toISOString()
        }
        const result = await API.saveFormConfig(legacyConfig)
        localStorage.setItem('formBuilder_config', JSON.stringify({
          fields,
          settings: formSettings,
          savedAt: new Date().toISOString()
        }))
        
        if (result.structuralChange) {
          showToast(
            `Form yapılandırması kaydedildi. ${result.quotesMarkedForUpdate || 0} teklif fiyat güncellemesi için işaretlendi.`, 
            'success'
          )
        } else {
          showToast('Form yapılandırması kaydedildi', 'success')
        }
      }
    } catch (error) {
      console.error('Form kaydedilirken hata:', error)
      showToast('Form kaydedilemedi: ' + (error.message || 'Bilinmeyen hata'), 'error')
    }
  }

  // Add new field with default type (text)
  function handleAddNewField() {
    console.log('handleAddNewField called')
    try {
      // Mevcut max form ve tablo sıralarını bul
      const maxFormOrder = fields.length > 0 
        ? Math.max(...fields.map(f => f.display?.formOrder || 0))
        : 0
      const maxTableOrder = fields.length > 0
        ? Math.max(...fields.map(f => f.display?.tableOrder || 0))
        : 0
      
      const newField = FormBuilderUtils.createNewField('text', {
        display: {
          showInTable: false,
          showInFilter: false,
          formOrder: maxFormOrder + 1,
          tableOrder: maxTableOrder + 1
        }
      })
      console.log('New field created:', newField)
      setEditingField(newField)
      setIsFieldEditorOpen(true)
    } catch (error) {
      console.error('Error in handleAddNewField:', error)
      showToast(error.message, 'error')
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
      showToast(error.message, 'error')
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
        showToast(errors[0], 'error')
        return
      }

      // Max sıraları bul (mevcut field hariç)
      const otherFields = fields.filter(f => f.id !== fieldData.id)
      const maxFormOrder = otherFields.length > 0 
        ? Math.max(...otherFields.map(f => f.display?.formOrder || 0))
        : 0
      const maxTableOrder = otherFields.length > 0
        ? Math.max(...otherFields.map(f => f.display?.tableOrder || 0))
        : 0
      
      // Kullanıcının girdiği sırayı normalize et
      let normalizedFormOrder = fieldData.display?.formOrder || (maxFormOrder + 1)
      let normalizedTableOrder = fieldData.display?.tableOrder || (maxTableOrder + 1)
      
      // Max'tan büyükse max+1 yap
      if (normalizedFormOrder > maxFormOrder + 1) {
        normalizedFormOrder = maxFormOrder + 1
      }
      if (normalizedTableOrder > maxTableOrder + 1) {
        normalizedTableOrder = maxTableOrder + 1
      }
      
      // Normalize edilmiş değerleri fieldData'ya uygula
      fieldData = {
        ...fieldData,
        display: {
          ...fieldData.display,
          formOrder: normalizedFormOrder,
          tableOrder: normalizedTableOrder
        }
      }

      const existingIndex = fields.findIndex(f => f.id === fieldData.id)
      
      if (existingIndex >= 0) {
        // Update existing field
        const oldField = fields[existingIndex]
        let newFields = [...fields]
        
        // Form sırası değiştiyse diğer alanları kaydır
        if (oldField.display?.formOrder !== normalizedFormOrder) {
          const oldOrder = oldField.display?.formOrder || 0
          const newOrder = normalizedFormOrder
          
          newFields = newFields.map((f, idx) => {
            if (f.id === fieldData.id) return fieldData
            
            const currentOrder = f.display?.formOrder || 0
            
            if (newOrder < oldOrder) {
              // Yukarı taşıma - araya girenler aşağı kayacak
              if (currentOrder >= newOrder && currentOrder < oldOrder) {
                return {
                  ...f,
                  display: { ...f.display, formOrder: currentOrder + 1 }
                }
              }
            } else if (newOrder > oldOrder) {
              // Aşağı taşıma - araya girenler yukarı kayacak
              if (currentOrder > oldOrder && currentOrder <= newOrder) {
                return {
                  ...f,
                  display: { ...f.display, formOrder: currentOrder - 1 }
                }
              }
            }
            
            return f
          })
        }
        
        // Tablo sırası değiştiyse diğer alanları kaydır
        if (oldField.display?.tableOrder !== normalizedTableOrder) {
          const oldOrder = oldField.display?.tableOrder || 0
          const newOrder = normalizedTableOrder
          
          newFields = newFields.map((f, idx) => {
            if (f.id === fieldData.id) {
              // Zaten yukarıda fieldData eklenmiş, sadece tableOrder'ı güncelle
              return {
                ...f,
                display: { ...f.display, tableOrder: newOrder }
              }
            }
            
            const currentOrder = f.display?.tableOrder || 0
            
            if (newOrder < oldOrder) {
              // Yukarı taşıma
              if (currentOrder >= newOrder && currentOrder < oldOrder) {
                return {
                  ...f,
                  display: { ...f.display, tableOrder: currentOrder + 1 }
                }
              }
            } else if (newOrder > oldOrder) {
              // Aşağı taşıma
              if (currentOrder > oldOrder && currentOrder <= newOrder) {
                return {
                  ...f,
                  display: { ...f.display, tableOrder: currentOrder - 1 }
                }
              }
            }
            
            return f
          })
        }
        
        // Eğer sıra değişmediyse sadece güncelle
        if (oldField.display?.formOrder === normalizedFormOrder && 
            oldField.display?.tableOrder === normalizedTableOrder) {
          newFields[existingIndex] = fieldData
        }
        
        setFields(newFields)
        showToast('Alan güncellendi', 'success')
      } else {
        // Add new field - araya giriyorsa diğer alanları kaydır
        const newFormOrder = normalizedFormOrder
        const newTableOrder = normalizedTableOrder
        
        // Yeni alan eklenirken araya girenler için shifting yap
        let newFields = fields.map(f => {
          const currentFormOrder = f.display?.formOrder || 0
          const currentTableOrder = f.display?.tableOrder || 0
          
          // Form sırası için kaydırma
          const updatedFormOrder = currentFormOrder >= newFormOrder 
            ? currentFormOrder + 1 
            : currentFormOrder
          
          // Tablo sırası için kaydırma
          const updatedTableOrder = currentTableOrder >= newTableOrder 
            ? currentTableOrder + 1 
            : currentTableOrder
          
          return {
            ...f,
            display: {
              ...f.display,
              formOrder: updatedFormOrder,
              tableOrder: updatedTableOrder
            }
          }
        })
        
        // Yeni alanı ekle
        newFields.push(fieldData)
        setFields(newFields)
        showToast('Yeni alan eklendi', 'success')
      }
      
      setIsFieldEditorOpen(false)
      setEditingField(null)
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  // Delete field
  function handleDeleteField(fieldId) {
    setFields(prev => prev.filter(f => f.id !== fieldId))
    showToast('Alan silindi', 'success')
  }

  // QT-4: Handle display settings change - wrapper that updates local state too
  function handleDisplaySettingsChangeLocal(fieldDbId, displaySettings) {
    // Local fields state'ini güncelle
    setFields(prev => prev.map(f => {
      if (f.dbId === fieldDbId) {
        return {
          ...f,
          display: {
            ...f.display,
            ...displaySettings
          }
        };
      }
      return f;
    }));
    
    // Parent'a (FormManager) bildir - API çağrısı yapacak
    if (onDisplaySettingsChange) {
      onDisplaySettingsChange(fieldDbId, displaySettings);
    }
    
    // Modal'ı kapat
    setIsFieldEditorOpen(false);
    setEditingField(null);
  }

  // Reorder fields
  function handleReorderField(fromIndex, toIndex) {
    // sortedFields üzerinde çalıştığımız için önce sıralanmış listeyi al
    const sortedFields = [...fields].sort((a, b) => {
      const orderA = a.display?.formOrder || 0
      const orderB = b.display?.formOrder || 0
      return orderA - orderB
    })
    
    // Sıralanmış liste üzerinde yeniden sırala
    const reorderedFields = [...sortedFields]
    const [movedField] = reorderedFields.splice(fromIndex, 1)
    reorderedFields.splice(toIndex, 0, movedField)
    
    // formOrder'ı güncelle
    const updatedFields = reorderedFields.map((field, index) => ({
      ...field,
      display: {
        ...field.display,
        formOrder: index + 1
      }
    }))
    
    setFields(updatedFields)
    showToast('Alan sıralaması değiştirildi', 'info')
  }

  // Clone field
  function handleCloneField(field) {
    const clonedField = FormBuilderUtils.cloneField(field)
    setFields(prev => [...prev, clonedField])
    showToast('Alan kopyalandı', 'success')
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
      showToast('Form yapılandırması dışa aktarıldı', 'success')
    } catch (error) {
      showToast('Dışa aktarma başarısız', 'error')
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
        showToast('Form yapılandırması içe aktarıldı', 'success')
      } catch (error) {
        showToast(error.message, 'error')
      }
    }
    reader.readAsText(file)
  }

  // Clear all fields
  function handleClearForm() {
    if (window.confirm('Tüm alanları silmek istediğinizden emin misiniz?')) {
      setFields([])
      showToast('Tüm alanlar silindi', 'info')
    }
  }

  // Check for unsaved changes
  const hasUnsavedChanges = FormBuilderUtils.hasUnsavedChanges(fields, savedFields)
  const formStats = FormBuilderUtils.getFormStatistics(fields)

  return React.createElement('div', { 
    className: 'form-builder-container pricing-parameters-column',
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }
  },
    // Header with Add Button
    React.createElement('div', { 
      style: { 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        gap: '12px',
        position: 'relative'  // For absolute positioning of FieldEditor
      } 
    },
      React.createElement('h3', { 
        className: 'pricing-section-title',
        style: { 
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        } 
      },
        React.createElement('span', {
          style: { display: 'flex', alignItems: 'center' },
          dangerouslySetInnerHTML: {
            __html: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 7h.01"/><path d="M17 7h.01"/><path d="M7 17h.01"/><path d="M17 17h.01"/></svg>'
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
      },
        React.createElement('span', {
          key: 'icon',
          style: { display: 'flex', alignItems: 'center' },
          dangerouslySetInnerHTML: {
            __html: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>'
          }
        }),
        React.createElement('span', { key: 'text' }, 'Yeni Alan Ekle')
      ),

      // Field Editor Modal - Dropdown style (like Parametre Ekle)
      isFieldEditorOpen && React.createElement(FieldEditor, {
        field: editingField,
        allFields: fields,
        onSave: handleSaveField,
        onCancel: () => {
          setIsFieldEditorOpen(false)
          setEditingField(null)
        },
        onDisplaySettingsChange: handleDisplaySettingsChangeLocal, // QT-4: Local state de güncelleyen wrapper
        showNotification,
        fieldEditorRef: fieldEditorRef
      })
    ),
    
    // Content Area
    React.createElement('div', {
      style: { marginTop: '20px' }
    },
      // Empty state or Field List
      fields.length === 0 ? React.createElement('div', { 
        style: { 
          textAlign: 'center', 
          padding: '60px 20px',
          background: '#fff',
          border: '1px solid #e5e7eb',
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
              color: '#000'
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
          onReorderField: handleReorderField
        })
    ),

    // New Draft Modal
    isNewDraftModalOpen && React.createElement('div', {
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
      },
      onClick: onCloseNewDraftModal
    },
      React.createElement('div', {
        style: {
          background: '#fff',
          padding: '24px',
          borderRadius: '8px',
          width: '400px',
          maxWidth: '90%'
        },
        onClick: (e) => e.stopPropagation()
      },
        React.createElement('h3', {
          style: { margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600 }
        }, 'Yeni Taslak Oluştur'),
        React.createElement('input', {
          type: 'text',
          value: newDraftName,
          onChange: onDraftNameChange,
          placeholder: 'Taslak ismi girin',
          style: {
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #e5e7eb',
            borderRadius: '4px',
            fontSize: '14px',
            marginBottom: '16px'
          }
        }),
        React.createElement('div', {
          style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' }
        },
          React.createElement('button', {
            onClick: onCloseNewDraftModal,
            className: 'mes-btn',
            style: { background: '#6b7280', color: '#fff' }
          }, 'İptal'),
          React.createElement('button', {
            onClick: onCreateDraft,
            className: 'mes-btn',
            style: { background: '#3b82f6', color: '#fff' }
          }, 'Oluştur')
        )
      )
    ),

    // History Modal
    isHistoryModalOpen && React.createElement('div', {
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
      },
      onClick: onCloseHistoryModal
    },
      React.createElement('div', {
        style: {
          background: '#fff',
          padding: '24px',
          borderRadius: '8px',
          width: '500px',
          maxWidth: '90%',
          maxHeight: '80vh',
          overflow: 'auto'
        },
        onClick: (e) => e.stopPropagation()
      },
        React.createElement('h3', {
          style: { margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600 }
        }, 'Geçmiş Taslaklar'),
        React.createElement('div', {
          style: { display: 'flex', flexDirection: 'column', gap: '8px' }
        },
          allTemplates.length === 0 
            ? React.createElement('p', { 
                style: { textAlign: 'center', color: '#6b7280', padding: '20px' } 
              }, 'Henüz taslak bulunmuyor')
            : allTemplates.map(template => 
                React.createElement('div', {
                  key: template.id,
                  style: {
                    padding: '12px',
                    border: `2px solid ${template.id === currentTemplateId ? '#3b82f6' : '#e5e7eb'}`,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: template.isActive ? '#f0f9ff' : '#fff',
                    transition: 'all 0.2s'
                  },
                  onClick: () => onSwitchTemplate(template.id)
                },
                  React.createElement('div', {
                    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
                  },
                    React.createElement('div', null,
                      React.createElement('div', {
                        style: { fontWeight: 600, fontSize: '14px' }
                      }, template.name),
                      React.createElement('div', {
                        style: { fontSize: '12px', color: '#6b7280', marginTop: '4px' }
                      }, `Versiyon: ${template.version}`)
                    ),
                    // Status badges
                    template.isActive 
                      ? React.createElement('span', {
                          style: {
                            background: '#10b981', // Yeşil - Aktif
                            color: '#fff',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600
                          }
                        }, 'AKTİF')
                      : React.createElement('span', {
                          style: {
                            background: '#f59e0b', // Sarı - Taslak
                            color: '#fff',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600
                          }
                        }, 'TASLAK')
                  )
                )
              )
        ),
        React.createElement('div', {
          style: { marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }
        },
          React.createElement('button', {
            onClick: onCloseHistoryModal,
            className: 'mes-btn',
            style: { background: '#6b7280', color: '#fff' }
          }, 'Kapat')
        )
      )
    )
  )
}
