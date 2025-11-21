// Quotes Form Manager - Dynamic form configuration for quotes domain
import React from 'react';
import { formsApi } from '../api/index.js';
import { FormBuilderCompact } from '../../../src/components/formBuilder/FormBuilderCompact.js'

const { useState, useEffect } = React;

function FormManager({ t, showNotification, renderHeaderActions }) {
  const [formConfig, setFormConfig] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [templateId, setTemplateId] = useState(null)
  const [allTemplates, setAllTemplates] = useState([])
  const [activeTemplateId, setActiveTemplateId] = useState(null)
  const [currentTemplateId, setCurrentTemplateId] = useState(null)
  const [isNewDraftModalOpen, setIsNewDraftModalOpen] = useState(false)
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
  const [newDraftName, setNewDraftName] = useState('')

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
      
      if (!template) {
        console.warn('No active template found, creating default')
        showNotification('Aktif form şablonu bulunamadı', 'warning')
        setFormConfig({ fields: [] })
        return
      }

      setTemplateId(template.id)
      setActiveTemplateId(template.id)
      setCurrentTemplateId(template.id)
      
      // Convert PostgreSQL format to legacy format for FormBuilderCompact
      const legacyConfig = convertToLegacyFormat(template)
      console.log('🔄 FormManager - Converted to legacy format:', legacyConfig)
      setFormConfig(legacyConfig)
      
    } catch (e) {
      console.error('Form config load error:', e)
      showNotification('Form yapılandırması yüklenemedi!', 'error')
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
        showNotification('Form ismi gereklidir', 'error')
        return
      }

      const newTemplate = await formsApi.createTemplate({
        code: `QUOTE_FORM_${Date.now()}`,
        name: newDraftName.trim(),
        description: '',
        version: 1,
        isActive: false // Henüz aktif değil
      })

      // Yeni taslağı görüntüle
      setCurrentTemplateId(newTemplate.id)
      setTemplateId(newTemplate.id)
      setFormConfig({ fields: [] })
      
      // Template listesini güncelle
      await loadAllTemplates()
      
      setIsNewDraftModalOpen(false)
      setNewDraftName('')
      showNotification('Yeni taslak oluşturuldu', 'success')
    } catch (e) {
      console.error('Failed to create draft:', e)
      showNotification('Taslak oluşturulamadı: ' + e.message, 'error')
    }
  }

  async function switchToTemplate(selectedTemplateId) {
    try {
      const template = await formsApi.getTemplateWithFields(selectedTemplateId)
      
      setCurrentTemplateId(selectedTemplateId)
      setTemplateId(selectedTemplateId)
      
      const legacyConfig = convertToLegacyFormat(template)
      setFormConfig(legacyConfig)
      
      setIsHistoryModalOpen(false)
      showNotification('Taslak görüntüleniyor', 'info')
    } catch (e) {
      console.error('Failed to switch template:', e)
      showNotification('Taslak yüklenemedi: ' + e.message, 'error')
    }
  }

  async function switchActiveTemplate() {
    try {
      console.log('🔄 Activating template:', currentTemplateId)
      
      // Backend will deactivate all other templates and activate this one
      await formsApi.activateTemplate(currentTemplateId)
      
      // Reload all templates to get updated isActive flags
      await loadAllTemplates()
      
      // Reload current form config to reflect changes
      await loadFormConfig()
      
      setActiveTemplateId(currentTemplateId)
      
      showNotification('Aktif form değiştirildi!', 'success')
    } catch (e) {
      console.error('Failed to activate template:', e)
      showNotification('Form aktif edilemedi: ' + e.message, 'error')
    }
  }

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
      
      showNotification('Form yapılandırması kaydedildi!', 'success')
      
      // Reload to get updated data
      await loadFormConfig()
    } catch (e) {
      console.error('Form config save error:', e)
      showNotification('Form yapılandırması kaydedilemedi: ' + e.message, 'error')
    }
  }

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
      onSave: saveFormConfig,
      isDarkMode: false,
      t,
      showNotification,
      renderHeaderActions,
      // Versioning props
      allTemplates,
      activeTemplateId,
      currentTemplateId,
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