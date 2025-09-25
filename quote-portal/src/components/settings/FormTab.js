// Form Configuration Tab - Dynamic form builder management
import React from 'react';
import API from '../../lib/api.js'
import { FormBuilderCompact } from '../formBuilder/FormBuilderCompact.js'

const { useState, useEffect } = React;

function FormTab({ t, showNotification }) {
  const [formConfig, setFormConfig] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadFormConfig()
  }, [])

  async function loadFormConfig() {
    try {
      setIsLoading(true)
      const config = await API.getFormConfig()
      setFormConfig(config.formConfig)
    } catch (e) {
      console.error('Form config load error:', e)
      showNotification('Form yapılandırması yüklenemedi!', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  async function saveFormConfig(config) {
    try {
      await API.saveFormConfig({ formConfig: config })
      setFormConfig(config)
      showNotification('Form yapılandırması kaydedildi!', 'success')
    } catch (e) {
      console.error('Form config save error:', e)
      showNotification('Form yapılandırması kaydedilemedi!', 'error')
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
    React.createElement('h3', null, t.settings_form_config || 'Form Yapılandırması'),
    React.createElement('p', { style: { color: '#666', marginBottom: '20px' } },
      t.settings_form_subtitle || 'Müşteri teklif formunda gösterilecek alanları ve seçenekleri yönetin.'
    ),
    
    React.createElement(FormBuilderCompact, {
      isDarkMode: false,
      t,
      showNotification
    })
  )
}

export default FormTab