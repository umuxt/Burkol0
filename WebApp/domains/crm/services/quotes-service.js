// Quotes Service - Frontend API wrapper for quotes endpoints

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

export const quotesService = {
  async getQuotes(filters = {}) {
    const params = new URLSearchParams(filters).toString()
    const url = params ? `/api/quotes?${params}` : '/api/quotes'
    const response = await fetchWithTimeout(url, { headers: withAuth() }, 10000)
    if (!response.ok) throw new Error('get_quotes_failed')
    return response.json()
  },

  async getQuote(id) {
    const response = await fetchWithTimeout(`/api/quotes/${id}`, { headers: withAuth() }, 10000)
    if (!response.ok) throw new Error('get_quote_failed')
    return response.json()
  },

  async createQuote(quoteData) {
    const response = await fetchWithTimeout('/api/quotes', {
      method: 'POST',
      headers: withAuth(),
      body: JSON.stringify(quoteData)
    }, 15000)
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || 'create_quote_failed')
    }
    return response.json()
  },

  async updateQuote(id, updates) {
    const response = await fetchWithTimeout(`/api/quotes/${id}`, {
      method: 'PATCH',
      headers: withAuth(),
      body: JSON.stringify(updates)
    }, 15000)
    if (!response.ok) throw new Error('update_quote_failed')
    return response.json()
  },

  async deleteQuote(id) {
    const response = await fetchWithTimeout(`/api/quotes/${id}`, {
      method: 'DELETE',
      headers: withAuth()
    }, 10000)
    if (!response.ok) throw new Error('delete_quote_failed')
    return response.json()
  },

  async getStatistics(filters = {}) {
    const params = new URLSearchParams(filters).toString()
    const url = params ? `/api/quotes/stats?${params}` : '/api/quotes/stats'
    const response = await fetchWithTimeout(url, { headers: withAuth() }, 10000)
    if (!response.ok) throw new Error('get_stats_failed')
    return response.json()
  },

  async updateStatus(id, status) {
    const response = await fetchWithTimeout(`/api/quotes/${id}/status`, {
      method: 'PATCH',
      headers: withAuth(),
      body: JSON.stringify({ status })
    }, 10000)
    if (!response.ok) throw new Error('update_status_failed')
    return response.json()
  },

  async updateQuoteVersion(id) {
    // Update quote to use current price version
    const response = await fetchWithTimeout(`/api/quotes/${id}`, {
      method: 'PATCH',
      headers: withAuth(),
      body: JSON.stringify({ 
        priceVersionApplied: { 
          version: Date.now(), 
          versionId: `manual-${Date.now()}`,
          capturedAt: new Date().toISOString()
        },
        priceStatus: { status: 'current' }
      })
    }, 10000)
    if (!response.ok) throw new Error('update_version_failed')
    return response.json()
  },

  async hideVersionWarning(id) {
    const response = await fetchWithTimeout(`/api/quotes/${id}`, {
      method: 'PATCH',
      headers: withAuth(),
      body: JSON.stringify({ 
        versionWarningHidden: true,
        priceStatus: { status: 'current' }
      })
    }, 10000)
    if (!response.ok) throw new Error('hide_warning_failed')
    return response.json()
  },

  async getPriceComparison(id) {
    const response = await fetchWithTimeout(`/api/quotes/${id}/price-comparison`, {
      headers: withAuth()
    }, 10000)
    if (!response.ok) {
      // Fallback for compatibility
      return {
        needsUpdate: false,
        status: { status: 'current', message: 'API unavailable' }
      }
    }
    return response.json()
  },

  /**
   * Get edit status for a quote (checks work order lock)
   * @param {string} id - Quote ID
   * @returns {Promise<{canEdit: boolean, reason?: string, warning?: string, workOrderCode?: string, productionState?: string}>}
   */
  async getEditStatus(id) {
    const response = await fetchWithTimeout(`/api/quotes/${id}/edit-status`, {
      headers: withAuth()
    }, 10000)
    if (!response.ok) {
      // Fallback - allow edit if API fails
      console.warn('Edit status API failed, defaulting to editable')
      return { canEdit: true }
    }
    return response.json()
  },

  /**
   * C2: Update quote form data with new template
   * @param {string} id - Quote ID
   * @param {Object} updatePayload - Form update payload
   * @param {string} updatePayload.formTemplateId - New template ID
   * @param {number} updatePayload.formTemplateVersion - New template version
   * @param {string} updatePayload.formTemplateCode - New template code
   * @param {Object} updatePayload.formData - New form data
   * @param {number} updatePayload.calculatedPrice - Recalculated price
   * @param {string} updatePayload.priceSettingId - Price setting ID
   * @param {string} updatePayload.priceSettingCode - Price setting code
   * @returns {Promise<Object>} Updated quote
   */
  async updateQuoteForm(id, updatePayload) {
    const response = await fetchWithTimeout(`/api/quotes/${id}/form`, {
      method: 'PUT',
      headers: withAuth(),
      body: JSON.stringify(updatePayload)
    }, 15000)
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || 'update_quote_form_failed')
    }
    return response.json()
  }
}
