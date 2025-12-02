/**
 * Form Service
 * Handles form templates and form field operations
 */

import FormTemplates from '../../../../db/models/formTemplates.js';
import FormFields from '../../../../db/models/formFields.js';

/**
 * Get all form templates
 */
export async function getFormTemplates() {
  return FormTemplates.getAll();
}

/**
 * Get form template by ID
 */
export async function getFormTemplateById(id) {
  return FormTemplates.getById(id);
}

/**
 * Create form template
 */
export async function createFormTemplate(data) {
  const templateData = {
    name: data.name,
    description: data.description,
    fields: data.fields,
    category: data.category,
    isActive: data.isActive !== undefined ? data.isActive : true
  };

  return FormTemplates.create(templateData);
}

/**
 * Update form template
 */
export async function updateFormTemplate(id, updates) {
  return FormTemplates.update(id, updates);
}

/**
 * Delete form template
 */
export async function deleteFormTemplate(id) {
  return FormTemplates.delete(id);
}

/**
 * Get all form fields
 */
export async function getFormFields() {
  return FormFields.getAll();
}

/**
 * Get form field by ID
 */
export async function getFormFieldById(id) {
  return FormFields.getById(id);
}

/**
 * Create form field
 */
export async function createFormField(data) {
  const fieldData = {
    name: data.name,
    label: data.label,
    type: data.type,
    required: data.required || false,
    options: data.options,
    validation: data.validation,
    defaultValue: data.defaultValue
  };

  return FormFields.create(fieldData);
}

/**
 * Update form field
 */
export async function updateFormField(id, updates) {
  return FormFields.update(id, updates);
}

/**
 * Delete form field
 */
export async function deleteFormField(id) {
  return FormFields.delete(id);
}

/**
 * Validate form data against template
 */
export function validateFormData(formData, template) {
  const errors = [];
  
  template.fields.forEach(field => {
    const value = formData[field.name];
    
    // Check required fields
    if (field.required && !value) {
      errors.push(`${field.label} is required`);
    }
    
    // Type validation
    if (value && field.type) {
      switch (field.type) {
        case 'number':
          if (isNaN(value)) {
            errors.push(`${field.label} must be a number`);
          }
          break;
        case 'email':
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            errors.push(`${field.label} must be a valid email`);
          }
          break;
        // Add more type validations as needed
      }
    }
  });
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
}
