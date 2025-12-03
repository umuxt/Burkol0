import { showToast } from '../../../../shared/components/MESToast.js';
// Quotes Form Manager - Dynamic form configuration for quotes domain
import React from 'react';
import API from '../../../../shared/lib/api.js';
import { formsApi } from '../../services/forms-service.js';
import { FormBuilderCompact } from './formBuilder/FormBuilderCompact.js'

const { useState, useEffect, useCallback } = React;

function FormManager({ t, renderHeaderActions }) {
  const [formConfig, setFormConfig] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [templateId, setTemplateId] = useState(null)
  const [allTemplates, setAllTemplates] = useState([])
  const [activeTemplateId, setActiveTemplateId] = useState(null)
  const [currentTemplateId, setCurrentTemplateId] = useState(null)
  const [isNewDraftModalOpen, setIsNewDraftModalOpen] = useState(false)
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
  const [newDraftName, setNewDraftName] = useState('')
  // PROMPT-A1: Track if current template is a draft (isActive=false)
  const [isCurrentDraft, setIsCurrentDraft] = useState(false)
  // PROMPT-A1.1: Track changes for button visibility
  const [hasChanges, setHasChanges] = useState(false)
  const [originalFields, setOriginalFields] = useState([])

  useEffect(() => {
    loadFormConfig()
    loadAllTemplates()
  }, [])

  async function loadFormConfig() {
    try {
      setIsLoading(true)
      
      // Get active template with fields
      const template = await formsApi.getActiveTemplate()
      
      console.log('🔍 FormManager - Loaded template:', template)
      
      if (template) {
        setTemplateId(template.id)
        setActiveTemplateId(template.id)
        setCurrentTemplateId(template.id)
        setIsCurrentDraft(false) // Active template is not a draft
        
        // Convert PostgreSQL format to legacy format for FormBuilderCompact
        const legacyConfig = convertToLegacyFormat(template)
        // Template ismini settings'e ekle
        legacyConfig.settings = { 
          title: template.name, 
          description: template.description || '' 
        }
        console.log('🔄 FormManager - Converted to legacy format:', legacyConfig)
        setFormConfig(legacyConfig)
        // PROMPT-A1.1: Store original fields for change detection
        setOriginalFields(JSON.parse(JSON.stringify(legacyConfig.fields || [])))
        setHasChanges(false)
      } else {
        console.warn('No active template found, creating default')
        showToast('Aktif form şablonu bulunamadı', 'warning')
        setFormConfig({ fields: [] })
        setIsCurrentDraft(true) // No active = treat as draft
      }
      
    } catch (e) {
      console.error('Form config load error:', e)
      showToast('Form yapılandırması yüklenemedi!', 'error')
      setFormConfig({ fields: [] })
    } finally {
      setIsLoading(false)
    }
  }

  async function loadAllTemplates() {
    try {
      const templates = await formsApi.getTemplates()
      setAllTemplates(templates)
      console.log('📚 All templates loaded:', templates)
    } catch (e) {
      console.error('Failed to load templates:', e)
    }
  }

  async function createNewDraft() {
    try {
      if (!newDraftName || !newDraftName.trim()) {
        showToast('Form ismi gereklidir', 'error')
        return
      }

      const response = await formsApi.createTemplate({
        code: `QUOTE_FORM_${Date.now()}`,
        name: newDraftName.trim(),
        description: '',
        version: 1,
        isActive: false // PROMPT-A1: Yeni taslak her zaman inactive başlar
      })

      // API returns { success: true, template: {...} }
      const newTemplate = response.template || response

      // Yeni taslağı görüntüle - name'i de formConfig'e ekle
      setCurrentTemplateId(newTemplate.id)
      setTemplateId(newTemplate.id)
      setFormConfig({ 
        fields: [],
        settings: { title: newTemplate.name, description: '' }
      })
      setIsCurrentDraft(true) // PROMPT-A1: New draft
      
      // Template listesini güncelle
      await loadAllTemplates()
      
      setIsNewDraftModalOpen(false)
      setNewDraftName('')
      showToast(`Yeni taslak oluşturuldu: ${newTemplate.name}`, 'success')
    } catch (e) {
      console.error('Failed to create draft:', e)
      showToast('Taslak oluşturulamadı: ' + e.message, 'error')
    }
  }

  async function switchToTemplate(selectedTemplateId) {
    try {
      const template = await formsApi.getTemplateWithFields(selectedTemplateId)
      
      setCurrentTemplateId(selectedTemplateId)
      setTemplateId(selectedTemplateId)
      setIsCurrentDraft(!template.isActive) // PROMPT-A1: Track if it's a draft
      
      const legacyConfig = convertToLegacyFormat(template)
      // Template ismini settings'e ekle
      legacyConfig.settings = { 
        title: template.name, 
        description: template.description || '' 
      }
      setFormConfig(legacyConfig)
      // PROMPT-A1.1: Store original fields for change detection
      setOriginalFields(JSON.parse(JSON.stringify(legacyConfig.fields || [])))
      setHasChanges(false)
      
      setIsHistoryModalOpen(false)
      showToast(`${template.isActive ? 'Aktif form' : 'Taslak'} yüklendi: ${template.name}`, 'info')
    } catch (e) {
      console.error('Failed to switch template:', e)
      showToast('Taslak yüklenemedi: ' + e.message, 'error')
    }
  }

  // PROMPT-A1.1: Handle fields change from FormBuilderCompact
  const handleFieldsChange = useCallback((newFields) => {
    const changed = JSON.stringify(newFields) !== JSON.stringify(originalFields)
    setHasChanges(changed)
  }, [originalFields])

  // PROMPT-A1.1: Revert changes to original state
  const handleRevertChanges = useCallback(() => {
    if (originalFields.length > 0 || formConfig) {
      const revertedConfig = {
        ...formConfig,
        fields: JSON.parse(JSON.stringify(originalFields))
      }
      setFormConfig(revertedConfig)
      setHasChanges(false)
      showToast('Değişiklikler geri alındı', 'info')
    }
  }, [originalFields, formConfig])

  // PROMPT-A1: "Taslağı Kaydet" - Always saves as draft (isActive=false)
  async function saveDraft(config) {
    try {
      console.log('💾 Saving as draft:', config)
      console.log('💾 isCurrentDraft:', isCurrentDraft, 'currentTemplateId:', currentTemplateId)
      
      const templateData = convertFromLegacyFormat(config)
      
      if (isCurrentDraft && currentTemplateId) {
        // Mevcut taslağı güncelle (isActive=false kalır)
        await formsApi.updateTemplate(currentTemplateId, {
          name: templateData.name,
          description: templateData.description
        })
        
        // Delete existing fields and recreate
        const existingFields = await formsApi.getFields(currentTemplateId)
        for (const field of existingFields) {
          await formsApi.deleteField(field.id)
        }
        
        // Create new fields
        for (const field of templateData.fields) {
          const fieldResponse = await formsApi.createField({
            templateId: currentTemplateId,
            fieldCode: field.id,
            fieldName: field.label,
            fieldType: field.type,
            sortOrder: field.sortOrder || 0,
            isRequired: field.required || false,
            placeholder: field.placeholder,
            defaultValue: field.defaultValue,
            validationRule: field.validationRule,
            helpText: field.helpText || null
          })
          
          // API returns { success: true, field: {...}, id: ... }
          const createdField = fieldResponse.field || fieldResponse
          
          // Create field options if any
          if (field.options && field.options.length > 0) {
            for (const option of field.options) {
              await formsApi.addOption(createdField.id || fieldResponse.id, {
                optionValue: option.value,
                optionLabel: option.label,
                sortOrder: option.sortOrder || 0,
                priceValue: option.priceValue
              })
            }
          }
        }
        
        // PROMPT-A1.1: Update original fields after save
        setOriginalFields(JSON.parse(JSON.stringify(config.fields || [])))
        setHasChanges(false)
        showToast('Taslak güncellendi', 'success')
      } else {
        // Aktif form açıkken "Taslağı Kaydet" = YENİ taslak oluştur
        const response = await formsApi.createTemplate({
          code: `QUOTE_FORM_${Date.now()}`,
          name: templateData.name || `Taslak - ${new Date().toLocaleString('tr-TR')}`,
          description: templateData.description,
          version: 1,
          isActive: false // PROMPT-A1: Her zaman draft olarak kaydet
        })
        
        // API returns { success: true, template: {...} }
        const newTemplate = response.template || response
        
        // Create fields for new template
        for (const field of templateData.fields) {
          const fieldResponse = await formsApi.createField({
            templateId: newTemplate.id,
            fieldCode: field.id,
            fieldName: field.label,
            fieldType: field.type,
            sortOrder: field.sortOrder || 0,
            isRequired: field.required || false,
            placeholder: field.placeholder,
            defaultValue: field.defaultValue,
            validationRule: field.validationRule,
            helpText: field.helpText || null
          })
          
          // API returns { success: true, field: {...}, id: ... }
          const createdField = fieldResponse.field || fieldResponse
          
          // Create field options if any
          if (field.options && field.options.length > 0) {
            for (const option of field.options) {
              await formsApi.addOption(createdField.id || fieldResponse.id, {
                optionValue: option.value,
                optionLabel: option.label,
                sortOrder: option.sortOrder || 0,
                priceValue: option.priceValue
              })
            }
          }
        }
        
        setCurrentTemplateId(newTemplate.id)
        setTemplateId(newTemplate.id)
        setIsCurrentDraft(true)
        // PROMPT-A1.1: Update original fields after save
        setOriginalFields(JSON.parse(JSON.stringify(config.fields || [])))
        setHasChanges(false)
        
        showToast('Yeni taslak oluşturuldu', 'success')
      }
      
      await loadAllTemplates()
    } catch (e) {
      console.error('Draft save error:', e)
      showToast('Taslak kaydedilemedi: ' + e.message, 'error')
    }
  }

  // PROMPT-A1: "Aktif Et" - Saves and activates the template
  async function activateTemplate(config) {
    try {
      console.log('🚀 Activating template:', config)
      console.log('🚀 isCurrentDraft:', isCurrentDraft, 'currentTemplateId:', currentTemplateId)
      
      const templateData = convertFromLegacyFormat(config)
      let targetTemplateId = currentTemplateId
      
      if (isCurrentDraft && currentTemplateId) {
        // Taslak açık - önce kaydet, sonra aktif et
        await formsApi.updateTemplate(currentTemplateId, {
          name: templateData.name,
          description: templateData.description
        })
        
        // Delete existing fields and recreate
        const existingFields = await formsApi.getFields(currentTemplateId)
        for (const field of existingFields) {
          await formsApi.deleteField(field.id)
        }
        
        // Create new fields
        for (const field of templateData.fields) {
          const fieldResponse = await formsApi.createField({
            templateId: currentTemplateId,
            fieldCode: field.id,
            fieldName: field.label,
            fieldType: field.type,
            sortOrder: field.sortOrder || 0,
            isRequired: field.required || false,
            placeholder: field.placeholder,
            defaultValue: field.defaultValue,
            validationRule: field.validationRule,
            helpText: field.helpText || null
          })
          
          // API returns { success: true, field: {...}, id: ... }
          const createdField = fieldResponse.field || fieldResponse
          
          // Create field options if any
          if (field.options && field.options.length > 0) {
            for (const option of field.options) {
              await formsApi.addOption(createdField.id || fieldResponse.id, {
                optionValue: option.value,
                optionLabel: option.label,
                sortOrder: option.sortOrder || 0,
                priceValue: option.priceValue
              })
            }
          }
        }
      } else {
        // Aktif form açık - YENİ kayıt oluştur ve hemen aktif et
        const response = await formsApi.createTemplate({
          code: `QUOTE_FORM_${Date.now()}`,
          name: templateData.name || `Form v${allTemplates.length + 1}`,
          description: templateData.description,
          version: (allTemplates.length || 0) + 1,
          isActive: false // Önce false, sonra activate edeceğiz
        })
        
        // API returns { success: true, template: {...} }
        const newTemplate = response.template || response
        
        // Create fields for new template
        for (const field of templateData.fields) {
          const fieldResponse = await formsApi.createField({
            templateId: newTemplate.id,
            fieldCode: field.id,
            fieldName: field.label,
            fieldType: field.type,
            sortOrder: field.sortOrder || 0,
            isRequired: field.required || false,
            placeholder: field.placeholder,
            defaultValue: field.defaultValue,
            validationRule: field.validationRule,
            helpText: field.helpText || null
          })
          
          // API returns { success: true, field: {...}, id: ... }
          const createdField = fieldResponse.field || fieldResponse
          
          // Create field options if any
          if (field.options && field.options.length > 0) {
            for (const option of field.options) {
              await formsApi.addOption(createdField.id || fieldResponse.id, {
                optionValue: option.value,
                optionLabel: option.label,
                sortOrder: option.sortOrder || 0,
                priceValue: option.priceValue
              })
            }
          }
        }
        
        targetTemplateId = newTemplate.id
      }
      
      // Şimdi bu template'i aktif et (diğerlerini deaktif eder)
      await formsApi.activateTemplate(targetTemplateId)
      
      setCurrentTemplateId(targetTemplateId)
      setTemplateId(targetTemplateId)
      setActiveTemplateId(targetTemplateId)
      setIsCurrentDraft(false)
      // PROMPT-A1.1: Update original fields after activate
      setOriginalFields(JSON.parse(JSON.stringify(config.fields || [])))
      setHasChanges(false)
      
      await loadAllTemplates()
      showToast('Form aktif edildi!', 'success')
    } catch (e) {
      console.error('Activate error:', e)
      showToast('Form aktif edilemedi: ' + e.message, 'error')
    }
  }

  // Legacy switchActiveTemplate - for backward compatibility
  async function switchActiveTemplate() {
    try {
      console.log('🔄 Activating template:', currentTemplateId)
      await formsApi.activateTemplate(currentTemplateId)
      await loadAllTemplates()
      await loadFormConfig()
      setActiveTemplateId(currentTemplateId)
      setIsCurrentDraft(false)
      showToast('Aktif form değiştirildi!', 'success')
    } catch (e) {
      console.error('Failed to activate template:', e)
      showToast('Form aktif edilemedi: ' + e.message, 'error')
    }
  }

  // PROMPT-A1: Legacy saveFormConfig - replaced by saveDraft and activateTemplate
  // Kept for backward compatibility if needed
  /*
  async function saveFormConfig(config) {
    try {
      console.log('💾 Saving form config:', config)
      
      // Convert legacy format to PostgreSQL format
      const templateData = convertFromLegacyFormat(config)
      console.log('📦 Template data:', templateData)
      
      let currentTemplateId = templateId
      
      if (currentTemplateId) {
        // Update existing template
        await formsApi.updateTemplate(currentTemplateId, {
          name: templateData.name,
          description: templateData.description
        })
        
        // Delete existing fields and recreate (simple approach)
        const existingFields = await formsApi.getFields(currentTemplateId)
        for (const field of existingFields) {
          await formsApi.deleteField(field.id)
        }
      } else {
        // Create new template
        const newTemplate = await formsApi.createTemplate({
          code: `QUOTE_FORM_${Date.now()}`,
          name: templateData.name || 'Teklif Formu',
          description: templateData.description,
          version: 1,
          isActive: true
        })
        
        currentTemplateId = newTemplate.id
        setTemplateId(currentTemplateId)
      }
      
      // Create/recreate all fields
      console.log('📝 Creating fields:', templateData.fields)
      for (const field of templateData.fields) {
        console.log('🔍 Field to create:', {
          templateId: currentTemplateId,
          fieldCode: field.id,
          fieldName: field.label,
          fieldType: field.type,
          sortOrder: field.sortOrder,
          isRequired: field.required,
          placeholder: field.placeholder,
          defaultValue: field.defaultValue,
          validationRule: field.validationRule,
          helpText: field.helpText
        })
        
        const createdField = await formsApi.createField({
          templateId: currentTemplateId,
          fieldCode: field.id,
          fieldName: field.label,
          fieldType: field.type,
          sortOrder: field.sortOrder || 0,
          isRequired: field.required || false,
          placeholder: field.placeholder,
          defaultValue: field.defaultValue,
          validationRule: field.validationRule,
          helpText: field.helpText || null
        })
        
        console.log('✅ Field created:', createdField)
        
        // Create field options if any
        if (field.options && field.options.length > 0) {
          for (const option of field.options) {
            await formsApi.addOption(createdField.id, {
              optionValue: option.value,
              optionLabel: option.label,
              sortOrder: option.sortOrder || 0,
              priceValue: option.priceValue
            })
          }
        }
      }
      
      showToast('Form yapılandırması kaydedildi!', 'success')
      
      // Reload to get updated data
      await loadFormConfig()
    } catch (e) {
      console.error('Form config save error:', e)
      showToast('Form yapılandırması kaydedilemedi: ' + e.message, 'error')
    }
  }
  */

  // Convert PostgreSQL template to legacy format
  function convertToLegacyFormat(template) {
    console.log('🔧 Converting template fields:', template.fields)
    
    const converted = {
      fields: (template.fields || []).map((field, index) => ({
        id: field.fieldCode,
        label: field.fieldName,
        type: field.fieldType,
        required: field.isRequired || false,
        placeholder: field.placeholder,
        defaultValue: field.defaultValue,
        display: {
          formOrder: field.sortOrder || index + 1,
          tableOrder: field.sortOrder || index + 1,
          showInTable: true,
          showInFilter: false
        },
        validation: field.validation_rule ? JSON.parse(field.validation_rule) : {},
        options: (field.options || []).map(opt => ({
          value: opt.value,
          label: opt.label,
          price: opt.priceValue || null
        }))
      }))
    }
    
    console.log('✅ Converted fields:', converted.fields)
    return converted
  }

  // Convert legacy format to PostgreSQL format
  function convertFromLegacyFormat(config) {
    return {
      name: config.name || 'Teklif Formu',
      description: config.description,
      fields: (config.fields || []).map((field, index) => ({
        id: field.id,
        label: field.label,
        type: field.type,
        required: field.required,
        placeholder: field.placeholder,
        defaultValue: field.defaultValue,
        helpText: field.helpText || null,
        sortOrder: field.display?.formOrder || index + 1,
        validationRule: field.validation ? JSON.stringify(field.validation) : null,
        options: (field.options || []).map((opt, optIdx) => ({
          value: opt.value,
          label: opt.label,
          priceValue: opt.price || null,
          sortOrder: optIdx + 1
        }))
      }))
    }
  }

  if (isLoading) {
    return React.createElement('div', { className: 'form-tab loading' },
      React.createElement('div', { style: { textAlign: 'center', padding: '40px' } },
        React.createElement('div', { className: 'spinner' }),
        React.createElement('p', null, t.settings_form_loading || 'Form yapılandırması yükleniyor...')
      )
    )
  }

  return React.createElement(React.Fragment, null,
    React.createElement(FormBuilderCompact, {
      formConfig,
      onSave: saveDraft, // PROMPT-A1: "Taslağı Kaydet" için
      onActivate: activateTemplate, // PROMPT-A1: "Aktif Et" için
      onRevertChanges: handleRevertChanges, // PROMPT-A1.1: "Değişiklikleri Geri Al" için
      onFieldsChange: handleFieldsChange, // PROMPT-A1.1: Change detection
      hasChanges, // PROMPT-A1.1: Button visibility
      originalFields, // PROMPT-A1.1: For revert functionality
      isDarkMode: false,
      t,
      showToast,
      renderHeaderActions,
      // Versioning props
      allTemplates,
      activeTemplateId,
      currentTemplateId,
      isCurrentDraft, // PROMPT-A1: Track if current is draft
      isNewDraftModalOpen,
      isHistoryModalOpen,
      newDraftName,
      onCreateDraft: createNewDraft,
      onSwitchTemplate: switchToTemplate,
      onActivateTemplate: switchActiveTemplate,
      onOpenNewDraftModal: () => setIsNewDraftModalOpen(true),
      onCloseNewDraftModal: () => setIsNewDraftModalOpen(false),
      onOpenHistoryModal: () => setIsHistoryModalOpen(true),
      onCloseHistoryModal: () => setIsHistoryModalOpen(false),
      onDraftNameChange: (e) => setNewDraftName(e.target.value)
    })
  )
}

export default FormManager