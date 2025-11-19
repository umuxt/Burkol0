/**
 * Form Templates & Fields Routes - PostgreSQL
 * 
 * API routes for managing form templates and fields
 */

import FormTemplates from '../../../db/models/formTemplates.js';
import FormFields from '../../../db/models/formFields.js';
import { requireAuth } from '../../../server/auth.js';
import logger from './logger.js';

/**
 * Setup form routes
 */
export function setupFormRoutes(app) {
  
  // ==================== FORM TEMPLATES ====================
  
  // Get all templates
  app.get('/api/form-templates', async (req, res) => {
    try {
      logger.info('GET /api/form-templates - Fetching all templates');
      
      const activeOnly = req.query.activeOnly === 'true';
      const templates = activeOnly 
        ? [await FormTemplates.getActive()]
        : await FormTemplates.getAll();
      
      logger.success(`Found ${templates.length} templates`);
      res.json(templates.filter(Boolean));
    } catch (error) {
      logger.error('Failed to fetch templates', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch templates', message: error.message });
    }
  });

  // Get template with fields
  app.get('/api/form-templates/:id/with-fields', async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`GET /api/form-templates/${id}/with-fields`);
      
      const template = await FormTemplates.getWithFields(id);
      
      if (!template) {
        logger.warning(`Template not found: ${id}`);
        return res.status(404).json({ error: 'Template not found' });
      }

      logger.success(`Template fetched with ${template.fields?.length || 0} fields`);
      res.json(template);
    } catch (error) {
      logger.error('Failed to fetch template', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch template', message: error.message });
    }
  });

  // Get single template
  app.get('/api/form-templates/:id', async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`GET /api/form-templates/${id}`);
      
      const template = await FormTemplates.getById(id);
      
      if (!template) {
        logger.warning(`Template not found: ${id}`);
        return res.status(404).json({ error: 'Template not found' });
      }

      logger.success(`Template fetched: ${template.code}`);
      res.json(template);
    } catch (error) {
      logger.error('Failed to fetch template', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch template', message: error.message });
    }
  });

  // Create template
  app.post('/api/form-templates', async (req, res) => {
    try {
      const { code, name, description, version, isActive } = req.body;
      
      logger.info('POST /api/form-templates - Creating template', { code, name });

      if (!code || !name) {
        return res.status(400).json({ 
          error: 'Missing required fields', 
          details: ['code and name are required'] 
        });
      }

      const template = await FormTemplates.create({
        code,
        name,
        description,
        version: version || '1.0',
        is_active: isActive !== undefined ? isActive : false
      });

      logger.success(`Template created: ${template.id}`);
      res.status(201).json(template);
    } catch (error) {
      logger.error('Failed to create template', { error: error.message });
      res.status(500).json({ error: 'Failed to create template', message: error.message });
    }
  });

  // Update template
  app.patch('/api/form-templates/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { code, name, description, version, isActive } = req.body;
      
      logger.info(`PATCH /api/form-templates/${id}`);

      const updates = {};
      if (code !== undefined) updates.code = code;
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (version !== undefined) updates.version = version;
      if (isActive !== undefined) updates.is_active = isActive;

      const template = await FormTemplates.update(id, updates);
      
      if (!template) {
        logger.warning(`Template not found: ${id}`);
        return res.status(404).json({ error: 'Template not found' });
      }

      logger.success(`Template updated: ${id}`);
      res.json(template);
    } catch (error) {
      logger.error('Failed to update template', { error: error.message });
      res.status(500).json({ error: 'Failed to update template', message: error.message });
    }
  });

  // Set template as active
  app.patch('/api/form-templates/:id/activate', async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`PATCH /api/form-templates/${id}/activate`);

      const template = await FormTemplates.setActive(id);
      
      if (!template) {
        logger.warning(`Template not found: ${id}`);
        return res.status(404).json({ error: 'Template not found' });
      }

      logger.success(`Template activated: ${id}`);
      res.json(template);
    } catch (error) {
      logger.error('Failed to activate template', { error: error.message });
      res.status(500).json({ error: 'Failed to activate template', message: error.message });
    }
  });

  // Delete template
  app.delete('/api/form-templates/:id', async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`DELETE /api/form-templates/${id}`);

      const success = await FormTemplates.delete(id);
      
      if (!success) {
        logger.warning(`Template not found: ${id}`);
        return res.status(404).json({ error: 'Template not found' });
      }

      logger.success(`Template deleted: ${id}`);
      res.json({ success: true, message: 'Template deleted' });
    } catch (error) {
      logger.error('Failed to delete template', { error: error.message });
      res.status(500).json({ error: 'Failed to delete template', message: error.message });
    }
  });

  // ==================== FORM FIELDS ====================

  // Get fields by template
  app.get('/api/form-fields', async (req, res) => {
    try {
      const { templateId } = req.query;
      
      if (!templateId) {
        return res.status(400).json({ 
          error: 'Missing required parameter', 
          details: ['templateId query parameter is required'] 
        });
      }

      logger.info(`GET /api/form-fields?templateId=${templateId}`);
      
      const fields = await FormFields.getByTemplateId(templateId);
      
      logger.success(`Found ${fields.length} fields`);
      res.json(fields);
    } catch (error) {
      logger.error('Failed to fetch fields', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch fields', message: error.message });
    }
  });

  // Create field
  app.post('/api/form-fields', async (req, res) => {
    try {
      const {
        templateId,
        fieldCode,
        fieldName,
        fieldType,
        sortOrder,
        isRequired,
        validationRule,
        placeholder,
        defaultValue,
        options
      } = req.body;

      logger.info('POST /api/form-fields - Creating field', { fieldCode, fieldName });

      if (!templateId || !fieldCode || !fieldName || !fieldType) {
        return res.status(400).json({ 
          error: 'Missing required fields', 
          details: ['templateId, fieldCode, fieldName, and fieldType are required'] 
        });
      }

      // If options provided, use bulk create
      if (options && options.length > 0) {
        const field = await FormFields.bulkCreateWithOptions({
          template_id: templateId,
          field_code: fieldCode,
          field_name: fieldName,
          field_type: fieldType,
          sort_order: sortOrder,
          is_required: isRequired,
          validation_rule: validationRule,
          placeholder,
          default_value: defaultValue
        }, options);

        logger.success(`Field created with ${options.length} options: ${field.id}`);
        return res.status(201).json(field);
      }

      // Simple create without options
      const field = await FormFields.create({
        template_id: templateId,
        field_code: fieldCode,
        field_name: fieldName,
        field_type: fieldType,
        sort_order: sortOrder,
        is_required: isRequired,
        validation_rule: validationRule,
        placeholder,
        default_value: defaultValue
      });

      logger.success(`Field created: ${field.id}`);
      res.status(201).json(field);
    } catch (error) {
      logger.error('Failed to create field', { error: error.message });
      res.status(500).json({ error: 'Failed to create field', message: error.message });
    }
  });

  // Update field
  app.patch('/api/form-fields/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const {
        fieldCode,
        fieldName,
        fieldType,
        sortOrder,
        isRequired,
        validationRule,
        placeholder,
        defaultValue
      } = req.body;

      logger.info(`PATCH /api/form-fields/${id}`);

      const updates = {};
      if (fieldCode !== undefined) updates.field_code = fieldCode;
      if (fieldName !== undefined) updates.field_name = fieldName;
      if (fieldType !== undefined) updates.field_type = fieldType;
      if (sortOrder !== undefined) updates.sort_order = sortOrder;
      if (isRequired !== undefined) updates.is_required = isRequired;
      if (validationRule !== undefined) updates.validation_rule = validationRule;
      if (placeholder !== undefined) updates.placeholder = placeholder;
      if (defaultValue !== undefined) updates.default_value = defaultValue;

      const field = await FormFields.update(id, updates);
      
      if (!field) {
        logger.warning(`Field not found: ${id}`);
        return res.status(404).json({ error: 'Field not found' });
      }

      logger.success(`Field updated: ${id}`);
      res.json(field);
    } catch (error) {
      logger.error('Failed to update field', { error: error.message });
      res.status(500).json({ error: 'Failed to update field', message: error.message });
    }
  });

  // Delete field
  app.delete('/api/form-fields/:id', async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`DELETE /api/form-fields/${id}`);

      const success = await FormFields.delete(id);
      
      if (!success) {
        logger.warning(`Field not found: ${id}`);
        return res.status(404).json({ error: 'Field not found' });
      }

      logger.success(`Field deleted: ${id}`);
      res.json({ success: true, message: 'Field deleted' });
    } catch (error) {
      logger.error('Failed to delete field', { error: error.message });
      res.status(500).json({ error: 'Failed to delete field', message: error.message });
    }
  });

  // ==================== FIELD OPTIONS ====================

  // Get field options
  app.get('/api/form-fields/:fieldId/options', async (req, res) => {
    try {
      const { fieldId } = req.params;
      logger.info(`GET /api/form-fields/${fieldId}/options`);
      
      const options = await FormFields.getOptions(fieldId);
      
      logger.success(`Found ${options.length} options`);
      res.json(options);
    } catch (error) {
      logger.error('Failed to fetch options', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch options', message: error.message });
    }
  });

  // Add field option
  app.post('/api/form-fields/:fieldId/options', async (req, res) => {
    try {
      const { fieldId } = req.params;
      const { optionValue, optionLabel, sortOrder, isActive } = req.body;

      logger.info(`POST /api/form-fields/${fieldId}/options`, { optionValue, optionLabel });

      if (!optionValue || !optionLabel) {
        return res.status(400).json({ 
          error: 'Missing required fields', 
          details: ['optionValue and optionLabel are required'] 
        });
      }

      const option = await FormFields.addOption(fieldId, {
        option_value: optionValue,
        option_label: optionLabel,
        sort_order: sortOrder,
        is_active: isActive !== undefined ? isActive : true
      });

      logger.success(`Option added: ${option.id}`);
      res.status(201).json(option);
    } catch (error) {
      logger.error('Failed to add option', { error: error.message });
      res.status(500).json({ error: 'Failed to add option', message: error.message });
    }
  });

  // Update field option
  app.patch('/api/form-fields/:fieldId/options/:optionId', async (req, res) => {
    try {
      const { optionId } = req.params;
      const { optionValue, optionLabel, sortOrder, isActive } = req.body;

      logger.info(`PATCH /api/form-fields/options/${optionId}`);

      const updates = {};
      if (optionValue !== undefined) updates.option_value = optionValue;
      if (optionLabel !== undefined) updates.option_label = optionLabel;
      if (sortOrder !== undefined) updates.sort_order = sortOrder;
      if (isActive !== undefined) updates.is_active = isActive;

      const option = await FormFields.updateOption(optionId, updates);
      
      if (!option) {
        logger.warning(`Option not found: ${optionId}`);
        return res.status(404).json({ error: 'Option not found' });
      }

      logger.success(`Option updated: ${optionId}`);
      res.json(option);
    } catch (error) {
      logger.error('Failed to update option', { error: error.message });
      res.status(500).json({ error: 'Failed to update option', message: error.message });
    }
  });

  // Delete field option
  app.delete('/api/form-fields/:fieldId/options/:optionId', async (req, res) => {
    try {
      const { optionId } = req.params;
      logger.info(`DELETE /api/form-fields/options/${optionId}`);

      const success = await FormFields.deleteOption(optionId);
      
      if (!success) {
        logger.warning(`Option not found: ${optionId}`);
        return res.status(404).json({ error: 'Option not found' });
      }

      logger.success(`Option deleted: ${optionId}`);
      res.json({ success: true, message: 'Option deleted' });
    } catch (error) {
      logger.error('Failed to delete option', { error: error.message });
      res.status(500).json({ error: 'Failed to delete option', message: error.message });
    }
  });
}

export default setupFormRoutes;
