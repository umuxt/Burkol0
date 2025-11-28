/**
 * Forms API - PostgreSQL Backend
 * 
 * API wrapper for form templates and fields
 */

const TEMPLATES_URL = '/api/form-templates';
const FIELDS_URL = '/api/form-fields';

export const formsApi = {
  // ==================== TEMPLATES ====================
  
  /**
   * Get all templates
   */
  async getTemplates(activeOnly = false) {
    const url = activeOnly ? `${TEMPLATES_URL}?activeOnly=true` : TEMPLATES_URL;
    const response = await fetch(url);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch templates');
    }
    
    return response.json();
  },

  /**
   * Get template by ID
   */
  async getTemplate(id) {
    const response = await fetch(`${TEMPLATES_URL}/${id}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch template');
    }
    
    return response.json();
  },

  /**
   * Get template with all fields
   */
  async getTemplateWithFields(id) {
    const response = await fetch(`${TEMPLATES_URL}/${id}/with-fields`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch template');
    }
    
    return response.json();
  },

  /**
   * Get active template with fields
   */
  async getActiveTemplate() {
    try {
      const templates = await this.getTemplates(true);
      if (templates.length === 0) {
        return null;
      }
      return this.getTemplateWithFields(templates[0].id);
    } catch (error) {
      console.error('getActiveTemplate error:', error.message);
      return null;
    }
  },

  /**
   * Create template
   */
  async createTemplate(templateData) {
    const response = await fetch(TEMPLATES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(templateData),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create template');
    }
    
    return response.json();
  },

  /**
   * Update template
   */
  async updateTemplate(id, updates) {
    const response = await fetch(`${TEMPLATES_URL}/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update template');
    }
    
    return response.json();
  },

  /**
   * Activate template
   */
  async activateTemplate(id) {
    const response = await fetch(`${TEMPLATES_URL}/${id}/activate`, {
      method: 'PATCH',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to activate template');
    }
    
    return response.json();
  },

  /**
   * Delete template
   */
  async deleteTemplate(id) {
    const response = await fetch(`${TEMPLATES_URL}/${id}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete template');
    }
    
    return response.json();
  },

  // ==================== FIELDS ====================

  /**
   * Get fields by template ID
   */
  async getFields(templateId) {
    const response = await fetch(`${FIELDS_URL}?templateId=${templateId}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch fields');
    }
    
    return response.json();
  },

  /**
   * Create field
   */
  async createField(fieldData) {
    const response = await fetch(FIELDS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(fieldData),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create field');
    }
    
    return response.json();
  },

  /**
   * Update field
   */
  async updateField(id, updates) {
    const response = await fetch(`${FIELDS_URL}/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update field');
    }
    
    return response.json();
  },

  /**
   * Delete field
   */
  async deleteField(id) {
    const response = await fetch(`${FIELDS_URL}/${id}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete field');
    }
    
    return response.json();
  },

  // ==================== FIELD OPTIONS ====================

  /**
   * Get field options
   */
  async getOptions(fieldId) {
    const response = await fetch(`${FIELDS_URL}/${fieldId}/options`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch options');
    }
    
    return response.json();
  },

  /**
   * Add field option
   */
  async addOption(fieldId, optionData) {
    const response = await fetch(`${FIELDS_URL}/${fieldId}/options`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(optionData),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to add option');
    }
    
    return response.json();
  },

  /**
   * Update field option
   */
  async updateOption(fieldId, optionId, updates) {
    const response = await fetch(`${FIELDS_URL}/${fieldId}/options/${optionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update option');
    }
    
    return response.json();
  },

  /**
   * Delete field option
   */
  async deleteOption(fieldId, optionId) {
    const response = await fetch(`${FIELDS_URL}/${fieldId}/options/${optionId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete option');
    }
    
    return response.json();
  },
};

export default formsApi;
