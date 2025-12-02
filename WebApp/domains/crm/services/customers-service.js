// Customers Service - Frontend API wrapper for customers endpoints

import { fetchWithTimeout } from '../../../shared/lib/api.js'

console.log('✅ Customers Service: Backend API kullanımı aktif');

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

export const customersService = {
  async getCustomers(filters = {}) {
    const params = new URLSearchParams(filters).toString()
    const url = params ? `/api/customers?${params}` : '/api/customers'
    const response = await fetchWithTimeout(url, { headers: withAuth() }, 10000)
    if (!response.ok) throw new Error('get_customers_failed')
    return response.json()
  },

  async getCustomer(id) {
    const response = await fetchWithTimeout(`/api/customers/${id}`, { headers: withAuth() }, 10000)
    if (!response.ok) throw new Error('get_customer_failed')
    return response.json()
  },

  async getCustomerWithStats(id) {
    const response = await fetchWithTimeout(`/api/customers/${id}/stats`, { headers: withAuth() }, 10000)
    if (!response.ok) throw new Error('get_customer_stats_failed')
    return response.json()
  },

  async searchCustomers(searchTerm, limit = 10) {
    const params = new URLSearchParams({ q: searchTerm, limit }).toString()
    const response = await fetchWithTimeout(`/api/customers/search?${params}`, { headers: withAuth() }, 10000)
    if (!response.ok) return []
    return response.json()
  },

  async createCustomer(customerData) {
    const response = await fetchWithTimeout('/api/customers', {
      method: 'POST',
      headers: withAuth(),
      body: JSON.stringify(customerData)
    }, 15000)
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || 'create_customer_failed')
    }
    return response.json()
  },

  async updateCustomer(id, updates) {
    const response = await fetchWithTimeout(`/api/customers/${id}`, {
      method: 'PATCH',
      headers: withAuth(),
      body: JSON.stringify(updates)
    }, 15000)
    if (!response.ok) throw new Error('update_customer_failed')
    return response.json()
  },

  async deleteCustomer(id) {
    const response = await fetchWithTimeout(`/api/customers/${id}`, {
      method: 'DELETE',
      headers: withAuth()
    }, 10000)
    if (!response.ok) throw new Error('delete_customer_failed')
    return response.json()
  },

  async permanentDeleteCustomer(id) {
    const response = await fetchWithTimeout(`/api/customers/${id}/permanent`, {
      method: 'DELETE',
      headers: withAuth()
    }, 10000)
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || 'permanent_delete_failed')
    }
    return response.json()
  }
}

export default customersService
