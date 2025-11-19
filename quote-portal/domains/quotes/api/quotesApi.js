/**
 * Quotes API - PostgreSQL Backend
 * 
 * API wrapper for quotes CRUD operations
 */

const BASE_URL = '/api/quotes';

export const quotesApi = {
  /**
   * Get all quotes with optional filters
   */
  async getAll(filters = {}) {
    const params = new URLSearchParams();
    
    if (filters.status) params.append('status', filters.status);
    if (filters.customerEmail) params.append('customerEmail', filters.customerEmail);
    if (filters.customerCompany) params.append('customerCompany', filters.customerCompany);
    if (filters.fromDate) params.append('fromDate', filters.fromDate);
    if (filters.toDate) params.append('toDate', filters.toDate);
    
    const url = params.toString() ? `${BASE_URL}?${params}` : BASE_URL;
    const response = await fetch(url);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch quotes');
    }
    
    return response.json();
  },

  /**
   * Get single quote by ID
   */
  async getById(id) {
    const response = await fetch(`${BASE_URL}/${id}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch quote');
    }
    
    return response.json();
  },

  /**
   * Create new quote
   */
  async create(quoteData) {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(quoteData),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create quote');
    }
    
    return response.json();
  },

  /**
   * Update quote
   */
  async update(id, updates) {
    const response = await fetch(`${BASE_URL}/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update quote');
    }
    
    return response.json();
  },

  /**
   * Update quote status
   */
  async updateStatus(id, status, userId = null, note = null) {
    const response = await fetch(`${BASE_URL}/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status, userId, note }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update status');
    }
    
    return response.json();
  },

  /**
   * Set manual price
   */
  async setManualPrice(id, manualPrice, reason = null, userId = null) {
    const response = await fetch(`${BASE_URL}/${id}/manual-price`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ manualPrice, reason, userId }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to set manual price');
    }
    
    return response.json();
  },

  /**
   * Delete quote
   */
  async delete(id) {
    const response = await fetch(`${BASE_URL}/${id}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete quote');
    }
    
    return response.json();
  },

  /**
   * Get statistics
   */
  async getStatistics(filters = {}) {
    const params = new URLSearchParams();
    
    if (filters.fromDate) params.append('fromDate', filters.fromDate);
    if (filters.toDate) params.append('toDate', filters.toDate);
    
    const url = params.toString() ? `${BASE_URL}/stats?${params}` : `${BASE_URL}/stats`;
    const response = await fetch(url);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch statistics');
    }
    
    return response.json();
  },
};

export default quotesApi;
