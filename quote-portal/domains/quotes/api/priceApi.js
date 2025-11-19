/**
 * Price API - PostgreSQL Backend
 * 
 * API wrapper for price parameters and formulas
 */

const PARAMETERS_URL = '/api/price-parameters';
const FORMULAS_URL = '/api/price-formulas';

export const priceApi = {
  // ==================== PARAMETERS ====================
  
  /**
   * Get all parameters
   */
  async getParameters(withLookups = false) {
    try {
      const url = withLookups ? `${PARAMETERS_URL}?withLookups=true` : PARAMETERS_URL;
      const response = await fetch(url);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch parameters');
      }
      
      return response.json();
    } catch (error) {
      console.error('getParameters error:', error.message);
      return [];
    }
  },

  /**
   * Get parameter by ID
   */
  async getParameter(id) {
    const response = await fetch(`${PARAMETERS_URL}/${id}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch parameter');
    }
    
    return response.json();
  },

  /**
   * Get parameter with lookups
   */
  async getParameterWithLookups(id) {
    const response = await fetch(`${PARAMETERS_URL}/${id}/with-lookups`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch parameter');
    }
    
    return response.json();
  },

  /**
   * Create parameter
   */
  async createParameter(parameterData) {
    const response = await fetch(PARAMETERS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(parameterData),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create parameter');
    }
    
    return response.json();
  },

  /**
   * Update parameter
   */
  async updateParameter(id, updates) {
    const response = await fetch(`${PARAMETERS_URL}/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update parameter');
    }
    
    return response.json();
  },

  /**
   * Delete parameter
   */
  async deleteParameter(id) {
    const response = await fetch(`${PARAMETERS_URL}/${id}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete parameter');
    }
    
    return response.json();
  },

  // ==================== PARAMETER LOOKUPS ====================

  /**
   * Get parameter lookups
   */
  async getLookups(parameterId) {
    const response = await fetch(`${PARAMETERS_URL}/${parameterId}/lookups`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch lookups');
    }
    
    return response.json();
  },

  /**
   * Add lookup
   */
  async addLookup(parameterId, lookupData) {
    const response = await fetch(`${PARAMETERS_URL}/${parameterId}/lookups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(lookupData),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to add lookup');
    }
    
    return response.json();
  },

  /**
   * Update lookup
   */
  async updateLookup(parameterId, lookupId, updates) {
    const response = await fetch(`${PARAMETERS_URL}/${parameterId}/lookups/${lookupId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update lookup');
    }
    
    return response.json();
  },

  /**
   * Delete lookup
   */
  async deleteLookup(parameterId, lookupId) {
    const response = await fetch(`${PARAMETERS_URL}/${parameterId}/lookups/${lookupId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete lookup');
    }
    
    return response.json();
  },

  // ==================== FORMULAS ====================

  /**
   * Get all formulas
   */
  async getFormulas(activeOnly = false) {
    const url = activeOnly ? `${FORMULAS_URL}?activeOnly=true` : FORMULAS_URL;
    const response = await fetch(url);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch formulas');
    }
    
    return response.json();
  },

  /**
   * Get formula by ID
   */
  async getFormula(id) {
    const response = await fetch(`${FORMULAS_URL}/${id}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch formula');
    }
    
    return response.json();
  },

  /**
   * Get formula with parameters
   */
  async getFormulaWithParameters(id) {
    const response = await fetch(`${FORMULAS_URL}/${id}/with-parameters`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch formula');
    }
    
    return response.json();
  },

  /**
   * Get active formula
   */
  async getActiveFormula() {
    try {
      const formulas = await this.getFormulas(true);
      if (formulas.length === 0) {
        return null;
      }
      return this.getFormulaWithParameters(formulas[0].id);
    } catch (error) {
      console.error('getActiveFormula error:', error.message);
      return null;
    }
  },

  /**
   * Create formula
   */
  async createFormula(formulaData) {
    const response = await fetch(FORMULAS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formulaData),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create formula');
    }
    
    return response.json();
  },

  /**
   * Update formula
   */
  async updateFormula(id, updates) {
    const response = await fetch(`${FORMULAS_URL}/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update formula');
    }
    
    return response.json();
  },

  /**
   * Delete formula
   */
  async deleteFormula(id) {
    const response = await fetch(`${FORMULAS_URL}/${id}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete formula');
    }
    
    return response.json();
  },

  /**
   * Calculate price
   */
  async calculatePrice(formulaId, formData) {
    const response = await fetch(`${FORMULAS_URL}/${formulaId}/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ formData }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to calculate price');
    }
    
    return response.json();
  },

  /**
   * Add parameter to formula
   */
  async addParameterToFormula(formulaId, parameterId, sortOrder) {
    const response = await fetch(`${FORMULAS_URL}/${formulaId}/parameters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parameterId, sortOrder }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to add parameter to formula');
    }
    
    return response.json();
  },

  /**
   * Remove parameter from formula
   */
  async removeParameterFromFormula(formulaId, parameterId) {
    const response = await fetch(`${FORMULAS_URL}/${formulaId}/parameters/${parameterId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to remove parameter from formula');
    }
    
    return response.json();
  },
};

export default priceApi;
