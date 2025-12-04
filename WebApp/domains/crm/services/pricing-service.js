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
  }
}

// priceApi alias for backward compatibility
export const priceApi = pricingService
