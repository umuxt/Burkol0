/**
 * Quotes API
 * 
 * API wrapper for quotes CRUD operations using PostgreSQL backend
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

  // Backward Compatibility
  
  /**
   * Alias for getAll()
   */
  async listQuotes(filters) {
    return this.getAll(filters);
  },

  /**
   * Alias for create()
   */
  async addQuote(quoteData) {
    return this.create(quoteData);
  },

  /**
   * Alias for delete()
   */
  async remove(id) {
    return this.delete(id);
  },

  /**
   * Get form configuration
   */
  async getFormConfig() {
    const response = await fetch('/api/form-config');
    if (!response.ok) throw new Error('Failed to fetch form config');
    return response.json();
  },

  /**
   * Get quote price comparison
   */
  async getQuotePriceComparison(id) {
    const response = await fetch(`${BASE_URL}/${id}/price-comparison`);
    if (!response.ok) throw new Error('Failed to get price comparison');
    return response.json();
  },

  /**
   * Update quote version
   */
  async updateQuoteVersion(id) {
    const response = await fetch(`${BASE_URL}/${id}/update-version`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) throw new Error('Failed to update quote version');
    return response.json();
  },

  /**
   * Add user
   */
  async addUser(email, password, role) {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role })
    });
    if (!response.ok) throw new Error('Failed to add user');
    return response.json();
  },

  /**
   * Delete user
   */
  async deleteUser(email) {
    const response = await fetch(`/api/users/${email}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete user');
    return response.json();
  },

  /**
   * Calculate price locally using client-side formula evaluation
   */
  calculatePriceLocal(quote, priceSettings) {    
    if (!priceSettings || !priceSettings.parameters || !priceSettings.formula) {
      return quote.calculatedPrice || quote.price || 0
    }

    try {
      const paramValues = {}
      
      priceSettings.parameters.forEach(param => {
        if (!param || !param.id) return
        
        if (param.type === 'fixed') {
          paramValues[param.id] = parseFloat(param.value) || 0
        } else if (param.type === 'form') {
          let value = 0
          
          if (param.formField === 'qty') {
            value = parseFloat(quote.qty) || 0
          } else if (param.formField === 'thickness') {
            value = parseFloat(quote.thickness) || 0
          } else if (param.formField === 'dimensions') {
            const l = parseFloat(quote.dimsL)
            const w = parseFloat(quote.dimsW)
            if (!isNaN(l) && !isNaN(w)) {
              value = l * w
            } else {
              const dims = quote.dims || ''
              const match = String(dims).match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i)
              if (match) {
                value = (parseFloat(match[1]) || 0) * (parseFloat(match[2]) || 0)
              }
            }
          } else {
            let fieldValue = quote[param.formField] || quote.customFields?.[param.formField]
            
            if (Array.isArray(fieldValue)) {
              value = fieldValue.reduce((sum, opt) => {
                const lookup = param.lookupTable?.find(l => l.option === opt)
                return sum + (parseFloat(lookup?.value) || 0)
              }, 0)
            } else if (param.lookupTable && fieldValue) {
              const lookup = param.lookupTable.find(l => l.option === fieldValue)
              value = parseFloat(lookup?.value) || 0
            } else {
              value = parseFloat(fieldValue) || 0
            }
          }
          
          paramValues[param.id] = value
        }
      })

      let formula = priceSettings.formula
      
      Object.keys(paramValues).forEach(paramId => {
        const regex = new RegExp(`\\b${paramId}\\b`, 'g')
        formula = formula.replace(regex, paramValues[paramId])
      })

      formula = formula.trim()
      
      if (!formula || formula === '' || /[=;{}[\]<>]/.test(formula)) {
        console.warn('⚠️ Invalid formula detected:', formula)
        return quote.calculatedPrice || quote.price || 0
      }

      formula = formula.replace(/\bMARKUP\s*\(/g, 'MARKUP(')
      formula = formula.replace(/\bDISCOUNT\s*\(/g, 'DISCOUNT(')
      formula = formula.replace(/\bVAT\s*\(/g, 'VAT(')
      formula = formula.replace(/\bMAX\s*\(/g, 'Math.max(')
      formula = formula.replace(/\bMIN\s*\(/g, 'Math.min(')
      formula = formula.replace(/\bABS\s*\(/g, 'Math.abs(')
      formula = formula.replace(/\bSQRT\s*\(/g, 'Math.sqrt(')
      
      const mathContext = {
        MARKUP: (cost, markupPercent) => cost * (1 + markupPercent / 100),
        DISCOUNT: (price, discountPercent) => price * (1 - discountPercent / 100),
        VAT: (amount, vatRate) => amount * (1 + vatRate / 100),
        Math: Math
      }
      
      const contextKeys = Object.keys(mathContext).join(', ')
      
      const result = Function(contextKeys, `"use strict"; return (${formula})`)(
        ...Object.values(mathContext)
      )
      return isNaN(result) ? 0 : Number(result)
    } catch (error) {
      console.error('❌ Local price calculation error:', error)
      return quote.calculatedPrice || quote.price || 0
    }
  },

  /**
   * Clear localStorage quotes cache (development utility)
   */
  clearLocalStorageQuotes() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('quotes');
      return { success: true, message: 'localStorage quotes cleared' };
    }
    return { success: false, message: 'localStorage not available' };
  }
};

export default quotesApi;
