/**
 * Form Templates & Fields Routes - PostgreSQL
 * 
 * API routes for managing form templates and fields
 */

import FormTemplates from '../../../../db/models/formTemplates.js';
import FormFields from '../../../../db/models/formFields.js';
import { requireAuth } from '../../../../server/auth.js';
import logger from '../../utils/logger.js';

/**
 * Setup form routes
 */
export function setupFormRoutes(app) {
  
  // ==================== FORM CONFIG (ACTIVE TEMPLATE) ====================
  
  // Get active form configuration (backward compatibility endpoint)
  app.get('/api/form-config', requireAuth, async (req, res) => {
    try {
      logger.info('GET /api/form-config - Fetching active form template');
      
      const template = await FormTemplates.getActive();
      
      if (!template) {
        logger.warning('No active form template found');
        return res.status(404).json({ error: 'No active form template found' });
      }

      // Get fields for the active template
      const fields = await FormFields.getByTemplateId(template.id);
      
      // Format as legacy formConfig structure
      const formConfig = {
        formStructure: {
          fields: fields.map(field => ({
            id: field.fieldCode,
            label: field.fieldName,
            type: field.fieldType,
            required: field.required,
            options: field.options,
            lookupTable: field.lookupTable,
            defaultValue: field.defaultValue
          }))
        },
        templateId: template.id,
        templateCode: template.templateCode,
        version: template.version
      };

      logger.success(`Form config returned with ${fields.length} fields`);
      res.json({ formConfig });
    } catch (error) {
      logger.error('Failed to fetch form config', { error: error.message });
      res.status(500).json({ error: 'Failed to load form config', message: error.message });
    }
  });
  
  // ==================== FORM TEMPLATES ====================
  
  // Get all templates
  app.get('/api/form-templates', requireAuth, async (req, res) => {
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

  // Get active template (MUST be before /:id route)
  app.get('/api/form-templates/active', requireAuth, async (req, res) => {
    try {
      logger.info('GET /api/form-templates/active - Fetching active template with fields');
      
      // First get the active template
      const template = await FormTemplates.getActive();
      
      if (!template) {
        logger.warning('No active form template found');
        return res.status(404).json({ error: 'No active form template found' });
      }

      // Now get it with fields for full data
      const templateWithFields = await FormTemplates.getWithFields(template.id);
      
      // Format response with formStructure for frontend compatibility
      const response = {
        ...templateWithFields,
        formStructure: {
          fields: (templateWithFields.fields || []).map(field => ({
            id: field.fieldCode,
            label: field.fieldName,
            type: field.fieldType,
            required: field.isRequired,
            placeholder: field.placeholder,
            helpText: field.helpText,
            defaultValue: field.defaultValue,
            // Post-D2: Return full option objects with optionCode and optionLabel
            options: field.options?.filter(o => o.id !== null) || [],
            sortOrder: field.sortOrder
          }))
        }
      };

      logger.success(`Active template found: ${template.id} with ${response.formStructure.fields.length} fields`);
      res.json(response);
    } catch (error) {
      logger.error('Failed to fetch active template', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch active template', message: error.message });
    }
  });

  // Get template with fields
  app.get('/api/form-templates/:id/with-fields', requireAuth, async (req, res) => {
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

  // Get fields for a template (by path param) - MUST be before /:id route
  app.get('/api/form-templates/:id/fields', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`GET /api/form-templates/${id}/fields`);
      
      const fields = await FormFields.getByTemplateId(id);
      
      logger.success(`Found ${fields.length} fields for template ${id}`);
      res.json(fields);
    } catch (error) {
      logger.error('Failed to fetch fields for template', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch fields', message: error.message });
    }
  });

  // Get single template
  app.get('/api/form-templates/:id', requireAuth, async (req, res) => {
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
  app.post('/api/form-templates', requireAuth, async (req, res) => {
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
        version: version || 1,
        isActive: isActive !== undefined ? isActive : false
      });

      logger.success(`Template created: ${template.id}`);
      res.status(201).json(template);
    } catch (error) {
      logger.error('Failed to create template', { error: error.message });
      res.status(500).json({ error: 'Failed to create template', message: error.message });
    }
  });

  // Update template
  app.patch('/api/form-templates/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { code, name, description, version, isActive } = req.body;
      
      logger.info(`PATCH /api/form-templates/${id}`);

      const updates = {};
      if (code !== undefined) updates.code = code;
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (version !== undefined) updates.version = version;
      if (isActive !== undefined) updates.isActive = isActive;

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
  app.patch('/api/form-templates/:id/activate', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`PATCH /api/form-templates/${id}/activate`);

      const template = await FormTemplates.activateVersion(parseInt(id));
      
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

  // Get all versions of a template
  app.get('/api/form-templates/:code/versions', requireAuth, async (req, res) => {
    try {
      const { code } = req.params;
      logger.info(`GET /api/form-templates/${code}/versions`);

      const versions = await FormTemplates.getVersions(code);
      
      logger.success(`Found ${versions.length} versions for template ${code}`);
      res.json(versions);
    } catch (error) {
      logger.error('Failed to fetch template versions', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch template versions', message: error.message });
    }
  });

  // Create new version of template
  app.post('/api/form-templates/:id/new-version', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, createdBy } = req.body;
      
      logger.info(`POST /api/form-templates/${id}/new-version`);

      const newTemplate = await FormTemplates.createNewVersion(parseInt(id), {
        name,
        description,
        createdBy
      });

      logger.success(`New template version created: ${newTemplate.id} (version ${newTemplate.version})`);
      res.status(201).json(newTemplate);
    } catch (error) {
      logger.error('Failed to create new template version', { error: error.message });
      res.status(500).json({ error: 'Failed to create new template version', message: error.message });
    }
  });

  // Delete template
  app.delete('/api/form-templates/:id', requireAuth, async (req, res) => {
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
  app.get('/api/form-fields', requireAuth, async (req, res) => {
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
  app.post('/api/form-fields', requireAuth, async (req, res) => {
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

      // Simple create without options
      const field = await FormFields.create({
        templateId: templateId,
        fieldCode: fieldCode,
        fieldName: fieldName,
        fieldType: fieldType,
        sortOrder: sortOrder,
        isRequired: isRequired,
        validationRule: validationRule,
        placeholder,
        defaultValue: defaultValue
      });

      logger.success(`Field created: ${field.id}`);
      res.status(201).json(field);
    } catch (error) {
      logger.error('Failed to create field', { error: error.message });
      res.status(500).json({ error: 'Failed to create field', message: error.message });
    }
  });

  // Update field
  app.patch('/api/form-fields/:id', requireAuth, async (req, res) => {
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
      if (fieldCode !== undefined) updates.fieldCode = fieldCode;
      if (fieldName !== undefined) updates.fieldName = fieldName;
      if (fieldType !== undefined) updates.fieldType = fieldType;
      if (sortOrder !== undefined) updates.sortOrder = sortOrder;
      if (isRequired !== undefined) updates.isRequired = isRequired;
      if (validationRule !== undefined) updates.validationRule = validationRule;
      if (placeholder !== undefined) updates.placeholder = placeholder;
      if (defaultValue !== undefined) updates.defaultValue = defaultValue;

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
  app.delete('/api/form-fields/:id', requireAuth, async (req, res) => {
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
  app.get('/api/form-fields/:fieldId/options', requireAuth, async (req, res) => {
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
  // Post-D2: optionValue and priceValue removed - optionCode is auto-generated, priceValue moved to lookups
  app.post('/api/form-fields/:fieldId/options', requireAuth, async (req, res) => {
    try {
      const { fieldId } = req.params;
      const { optionLabel, sortOrder, isActive } = req.body;

      logger.info(`POST /api/form-fields/${fieldId}/options`, { optionLabel });

      if (!optionLabel) {
        return res.status(400).json({ 
          error: 'Missing required fields', 
          details: ['optionLabel is required'] 
        });
      }

      const option = await FormFields.addOption({
        fieldId,
        optionLabel,
        sortOrder: sortOrder || 0,
        isActive: isActive !== undefined ? isActive : true
      });

      logger.success(`Option added: ${option.id}`);
      res.status(201).json(option);
    } catch (error) {
      logger.error('Failed to add option', { error: error.message });
      res.status(500).json({ error: 'Failed to add option', message: error.message });
    }
  });

  // Update field option
  // Post-D2: optionValue and priceValue removed - optionCode is immutable, priceValue moved to lookups
  app.patch('/api/form-fields/:fieldId/options/:optionId', requireAuth, async (req, res) => {
    try {
      const { optionId } = req.params;
      const { optionLabel, sortOrder, isActive } = req.body;

      logger.info(`PATCH /api/form-fields/options/${optionId}`);

      const updates = {};
      if (optionLabel !== undefined) updates.optionLabel = optionLabel;
      if (sortOrder !== undefined) updates.sortOrder = sortOrder;
      if (isActive !== undefined) updates.isActive = isActive;

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
  app.delete('/api/form-fields/:fieldId/options/:optionId', requireAuth, async (req, res) => {
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

  // ==================== FIELD OPTIONS BY CODE (Pre-D2-2) ====================

  // Get field options by fieldCode (returns optionCode for lookup)
  app.get('/api/form-fields/by-code/:fieldCode/options', requireAuth, async (req, res) => {
    try {
      const { fieldCode } = req.params;
      logger.info(`GET /api/form-fields/by-code/${fieldCode}/options`);
      
      const options = await FormFields.getOptionsByFieldCode(fieldCode);
      
      logger.success(`Found ${options.length} options for fieldCode ${fieldCode}`);
      res.json(options);
    } catch (error) {
      logger.error('Failed to fetch options by fieldCode', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch options', message: error.message });
    }
  });
}

export default setupFormRoutes;
