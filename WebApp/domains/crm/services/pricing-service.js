// Pricing Service - Frontend API wrapper for pricing endpoints

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

export const pricingService = {
  async getActiveSetting() {
    const response = await fetchWithTimeout('/api/price-settings/active', { headers: withAuth() }, 10000)
    if (!response.ok) return null
    return response.json()
  },
  
  async getAllSettings() {
    const response = await fetchWithTimeout('/api/price-settings', { headers: withAuth() }, 10000)
    if (!response.ok) return []
    return response.json()
  },
  
  async getSetting(id) {
    const response = await fetchWithTimeout(`/api/price-settings/${id}`, { headers: withAuth() }, 10000)
    if (!response.ok) return null
    return response.json()
  },
  
  async createSetting(data) {
    const response = await fetchWithTimeout('/api/price-settings', {
      method: 'POST',
      headers: withAuth(),
      body: JSON.stringify(data)
    }, 15000)
    if (!response.ok) throw new Error('create_setting_failed')
    return response.json()
  },
  
  async updateSetting(id, updates) {
    const response = await fetchWithTimeout(`/api/price-settings/${id}`, {
      method: 'PATCH',
      headers: withAuth(),
      body: JSON.stringify(updates)
    }, 15000)
    if (!response.ok) throw new Error('update_setting_failed')
    return response.json()
  },
  
  async activateSetting(id) {
    const response = await fetchWithTimeout(`/api/price-settings/${id}/activate`, {
      method: 'PATCH',
      headers: withAuth()
    }, 10000)
    if (!response.ok) throw new Error('activate_setting_failed')
    return response.json()
  },

  /**
   * Calculate price using a price setting and form data
   * @param {string} settingId - Price setting ID
   * @param {Object} formData - Form field values
   * @returns {Promise<{totalPrice: number, breakdown?: Object}>}
   */
  async calculatePrice(settingId, formData) {
    const response = await fetchWithTimeout('/api/price-settings/calculate', {
      method: 'POST',
      headers: withAuth(),
      body: JSON.stringify({ settingId, formData })
    }, 10000)
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || 'calculate_price_failed')
    }
    return response.json()
  },

  /**
   * Compare two price settings and return differences
   * Used to show what changed between quote's saved setting and current active setting
   * @param {number} oldSettingId - The quote's original price setting ID
   * @param {number} newSettingId - The current active price setting ID
   * @returns {Promise<{hasChanges: boolean, changes: Object}>}
   */
  async comparePriceSettings(oldSettingId, newSettingId) {
    const response = await fetchWithTimeout('/api/price-settings/compare', {
      method: 'POST',
      headers: withAuth(),
      body: JSON.stringify({ oldSettingId, newSettingId })
    }, 10000)
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || 'compare_settings_failed')
    }
    return response.json()
  },

  // ==================== PARAMETER LOOKUPS (Pre-D2-2) ====================

  /**
   * Get lookup values for a parameter
   * @param {number} parameterId - Price parameter ID
   * @returns {Promise<{parameterId, parameterCode, parameterName, formFieldCode, lookups}>}
   */
  async getParameterLookups(parameterId) {
    const response = await fetchWithTimeout(`/api/price-parameters/${parameterId}/lookups`, {
      headers: withAuth()
    }, 10000)
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || 'get_lookups_failed')
    }
    return response.json()
  },

  /**
   * Save lookup values for a parameter (bulk upsert)
   * @param {number} parameterId - Price parameter ID
   * @param {Array<{optionCode: string, value: number}>} lookups - Lookup entries
   */
  async saveParameterLookups(parameterId, lookups) {
    const response = await fetchWithTimeout(`/api/price-parameters/${parameterId}/lookups`, {
      method: 'POST',
      headers: withAuth(),
      body: JSON.stringify({ lookups })
    }, 15000)
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || 'save_lookups_failed')
    }
    return response.json()
  },

  /**
   * Get parameter with price options (includes lookups for form-based parameters)
   * @param {number} parameterId - Price parameter ID
   */
  async getParameterWithPrices(parameterId) {
    const response = await fetchWithTimeout(`/api/price-parameters/${parameterId}/with-prices`, {
      headers: withAuth()
    }, 10000)
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || 'get_parameter_prices_failed')
    }
    return response.json()
  },

  /**
   * Get form field options with optionCode
   * @param {string} fieldCode - Form field code
   */
  async getFieldOptions(fieldCode) {
    const response = await fetchWithTimeout(`/api/form-fields/${fieldCode}/options`, {
      headers: withAuth()
    }, 10000)
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || 'get_field_options_failed')
    }
    return response.json()
  }
}

// priceApi alias for backward compatibility
export const priceApi = pricingService
