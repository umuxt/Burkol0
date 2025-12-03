// Forms Service - Frontend API wrapper for form templates endpoints

import { fetchWithTimeout } from '../../../shared/lib/api.js'

// Auth helper
function withAuth(headers = {}) {
  try {
    const token = localStorage.getItem('bp_admin_token')
    if (!token && window.location.hostname === 'localhost') {
      return { ...headers, Authorization: 'Bearer dev-admin-token', 'Content-Type': 'application/json' }
    }
    return token ? { ...headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { ...headers, 'Content-Type': 'application/json' }
  } catch {
    return { ...headers, 'Content-Type': 'application/json' }
  }
}

export const formsService = {
  async getActiveTemplate() {
    const response = await fetchWithTimeout('/api/form-templates/active', { headers: withAuth() }, 10000)
    if (!response.ok) return null
    return response.json()
  },
  
  async getTemplates() {
    const response = await fetchWithTimeout('/api/form-templates', { headers: withAuth() }, 10000)
    if (!response.ok) return []
    return response.json()
  },
  
  async getTemplateWithFields(id) {
    const response = await fetchWithTimeout(`/api/form-templates/${id}/with-fields`, { headers: withAuth() }, 10000)
    if (!response.ok) return null
    return response.json()
  },
  
  async createTemplate(data) {
    const response = await fetchWithTimeout('/api/form-templates', {
      method: 'POST',
      headers: withAuth(),
      body: JSON.stringify(data)
    }, 15000)
    if (!response.ok) throw new Error('create_template_failed')
    return response.json()
  },
  
  async updateTemplate(id, updates) {
    const response = await fetchWithTimeout(`/api/form-templates/${id}`, {
      method: 'PATCH',
      headers: withAuth(),
      body: JSON.stringify(updates)
    }, 15000)
    if (!response.ok) throw new Error('update_template_failed')
    return response.json()
  },
  
  async activateTemplate(id) {
    const response = await fetchWithTimeout(`/api/form-templates/${id}/activate`, {
      method: 'PATCH',
      headers: withAuth()
    }, 10000)
    if (!response.ok) throw new Error('activate_template_failed')
    return response.json()
  },
  
  async getFields(templateId) {
    console.log(`📋 getFields called for templateId: ${templateId}`)
    const response = await fetchWithTimeout(`/api/form-templates/${templateId}/fields`, { headers: withAuth() }, 10000)
    console.log(`📋 getFields response status: ${response.status}`)
    if (!response.ok) {
      console.warn(`⚠️ getFields failed with status ${response.status}`)
      return []
    }
    const fields = await response.json()
    console.log(`📋 getFields returned ${fields.length} fields`)
    return fields
  },
  
  async createField(data) {
    const response = await fetchWithTimeout('/api/form-fields', {
      method: 'POST',
      headers: withAuth(),
      body: JSON.stringify(data)
    }, 15000)
    if (!response.ok) throw new Error('create_field_failed')
    return response.json()
  },
  
  async deleteField(id) {
    const response = await fetchWithTimeout(`/api/form-fields/${id}`, {
      method: 'DELETE',
      headers: withAuth()
    }, 10000)
    if (!response.ok) throw new Error('delete_field_failed')
    return response.json()
  },
  
  async addOption(fieldId, optionData) {
    const response = await fetchWithTimeout(`/api/form-fields/${fieldId}/options`, {
      method: 'POST',
      headers: withAuth(),
      body: JSON.stringify(optionData)
    }, 15000)
    if (!response.ok) throw new Error('add_option_failed')
    return response.json()
  }
}

// formsApi alias for backward compatibility
export const formsApi = formsService
