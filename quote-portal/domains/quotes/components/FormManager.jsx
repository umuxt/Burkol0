// Quotes Form Manager - Dynamic form configuration for quotes domain
import React from 'react';
import { formsApi } from '../api/index.js';
import { FormBuilderCompact } from '../../../src/components/formBuilder/FormBuilderCompact.js'

const { useState, useEffect } = React;

function FormManager({ t, showNotification, renderHeaderActions }) {
  const [formConfig, setFormConfig] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [templateId, setTemplateId] = useState(null)

  useEffect(() => {
    loadFormConfig()
  }, [])

  async function loadFormConfig() {
    try {
      setIsLoading(true)
      
      // Get active template with fields
      const template = await formsApi.getActiveTemplate()
      
      if (!template) {
        console.warn('No active template found, creating default')
        showNotification('Aktif form şablonu bulunamadı', 'warning')
        setFormConfig({ fields: [] })
        return
      }

      setTemplateId(template.id)
      
      // Convert PostgreSQL format to legacy format for FormBuilderCompact
      const legacyConfig = convertToLegacyFormat(template)
      setFormConfig(legacyConfig)
      
    } catch (e) {
      console.error('Form config load error:', e)
      showNotification('Form yapılandırması yüklenemedi!', 'error')
      setFormConfig({ fields: [] })
    } finally {
      setIsLoading(false)
    }
  }

  async function saveFormConfig(config) {
    try {
      // Convert legacy format to PostgreSQL format
      const templateData = convertFromLegacyFormat(config)
      
      if (templateId) {
        // Update existing template
        await formsApi.updateTemplate(templateId, {
          name: templateData.name,
          description: templateData.description
        })
        
        // TODO: Update fields (complex operation, needs field diff logic)
        // For now, just update template metadata
      } else {
        // Create new template
        const newTemplate = await formsApi.createTemplate({
          code: `QUOTE_FORM_${Date.now()}`,
          name: templateData.name || 'Teklif Formu',
          description: templateData.description,
          version: '1.0',
          isActive: true
        })
        
        setTemplateId(newTemplate.id)
        
        // Create fields
        for (const field of templateData.fields) {
          await formsApi.createField({
            templateId: newTemplate.id,
            fieldCode: field.id,
            fieldName: field.label,
            fieldType: field.type,
            sortOrder: field.sortOrder || 0,
            isRequired: field.required || false,
            placeholder: field.placeholder,
            defaultValue: field.defaultValue,
            options: field.options || []
          })
        }
      }
      
      setFormConfig(config)
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
    return {
      formConfig: {
        fields: (template.fields || []).map((field, index) => ({
          id: field.field_code,
          label: field.field_name,
          type: field.field_type,
          required: field.is_required || false,
          placeholder: field.placeholder,
          defaultValue: field.default_value,
          sortOrder: field.sort_order || index,
          options: (field.options || []).map(opt => ({
            value: opt.option_value,
            label: opt.option_label
          }))
        }))
      }
    }
  }

  // Convert legacy format to PostgreSQL format
  function convertFromLegacyFormat(config) {
    return {
      name: config.name || 'Teklif Formu',
      description: config.description,
      fields: (config.formConfig?.fields || config.fields || []).map((field, index) => ({
        id: field.id,
        label: field.label,
        type: field.type,
        required: field.required,
        placeholder: field.placeholder,
        defaultValue: field.defaultValue,
        sortOrder: field.sortOrder !== undefined ? field.sortOrder : index,
        options: field.options || []
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
      renderHeaderActions
    })
  )
}

export default FormManager