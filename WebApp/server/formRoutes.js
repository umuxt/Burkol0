/**
 * Form Templates Routes - PostgreSQL
 * 
 * API routes for managing form templates, fields, and options
 */

import FormTemplates from '../db/models/formTemplates.js';
import FormFields from '../db/models/formFields.js';
import { requireAuth } from './auth.js';
import logger from './utils/logger.js';

export function setupFormRoutes(app) {
  
  // ==================== GET ALL TEMPLATES ====================
  app.get('/api/form-templates', async (req, res) => {
    try {
      logger.info('GET /api/form-templates - Fetching all templates');
      
      const filters = {
        isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined
      };

      const templates = await FormTemplates.getAll(filters);
      
      logger.success(`Found ${templates.length} templates`);
      res.json(templates);
    } catch (error) {
      logger.error('Failed to fetch templates', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch templates', message: error.message });
    }
  });

  // ==================== GET ACTIVE TEMPLATE ====================
  app.get('/api/form-templates/active', async (req, res) => {
    try {
      logger.info('GET /api/form-templates/active - Fetching active template');
      
      const template = await FormTemplates.getActive();
      
      if (!template) {
        logger.warning('No active template found');
        return res.status(404).json({ error: 'No active template found' });
      }

      logger.success(`Active template: ${template.code}`);
      res.json(template);
    } catch (error) {
      logger.error('Failed to fetch active template', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch active template', message: error.message });
    }
  });

  // ==================== GET TEMPLATE WITH FIELDS ====================
  app.get('/api/form-templates/:id/with-fields', async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`GET /api/form-templates/${id}/with-fields - Fetching template with fields`);
      
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

  // ==================== CREATE TEMPLATE ====================
  app.post('/api/form-templates', requireAuth, async (req, res) => {
    try {
      const { code, name, description, version } = req.body;

      logger.info('POST /api/form-templates - Creating new template', { code });

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
        createdBy: req.user?.email || 'system'
      });

      logger.success('Template created', { templateId: template.id });
      res.status(201).json({ success: true, template });
    } catch (error) {
      logger.error('Failed to create template', { error: error.message });
      res.status(500).json({ error: 'Failed to create template', message: error.message });
    }
  });

  // ==================== UPDATE TEMPLATE ====================
  app.patch('/api/form-templates/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, isActive } = req.body;

      logger.info(`PATCH /api/form-templates/${id} - Updating template`);

      const template = await FormTemplates.update(id, { name, description, isActive });

      if (!template) {
        logger.warning(`Template not found: ${id}`);
        return res.status(404).json({ error: 'Template not found' });
      }

      logger.success('Template updated', { templateId: id });
      res.json({ success: true, template });
    } catch (error) {
      logger.error('Failed to update template', { error: error.message });
      res.status(500).json({ error: 'Failed to update template', message: error.message });
    }
  });

  // ==================== DELETE TEMPLATE ====================
  app.delete('/api/form-templates/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      logger.info(`DELETE /api/form-templates/${id} - Deleting template`);

      const deleted = await FormTemplates.delete(id);

      if (!deleted) {
        logger.warning(`Template not found: ${id}`);
        return res.status(404).json({ error: 'Template not found' });
      }

      logger.success('Template deleted', { templateId: id });
      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to delete template', { error: error.message });
      res.status(500).json({ error: 'Failed to delete template', message: error.message });
    }
  });

  // ==================== ACTIVATE TEMPLATE ====================
  app.patch('/api/form-templates/:id/activate', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      logger.info(`PATCH /api/form-templates/${id}/activate - Activating template`);

      // FormTemplates modelindeki activateVersion metodunu kullan
      const template = await FormTemplates.activateVersion(id);

      if (!template) {
        logger.warning(`Template not found: ${id}`);
        return res.status(404).json({ error: 'Template not found' });
      }

      logger.success('Template activated', { templateId: id });
      res.json({ success: true, template });
    } catch (error) {
      logger.error('Failed to activate template', { error: error.message });
      res.status(500).json({ error: 'Failed to activate template', message: error.message });
    }
  });

  // ==================== GET TEMPLATE FIELDS ====================
  app.get('/api/form-templates/:id/fields', async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`GET /api/form-templates/${id}/fields - Fetching template fields`);

      const fields = await FormFields.getByTemplateId(id);

      logger.success(`Found ${fields.length} fields for template ${id}`);
      res.json(fields);
    } catch (error) {
      logger.error('Failed to fetch template fields', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch template fields', message: error.message });
    }
  });

  // ==================== ADD FIELD TO TEMPLATE ====================
  app.post('/api/form-templates/:id/fields', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { fieldCode, fieldName, fieldType, sortOrder, isRequired, placeholder, helpText, validationRule, defaultValue, options } = req.body;

      logger.info(`POST /api/form-templates/${id}/fields - Adding field: ${fieldCode}`);

      if (!fieldCode || !fieldName || !fieldType) {
        return res.status(400).json({ 
          error: 'Missing required fields', 
          details: ['fieldCode, fieldName, and fieldType are required'] 
        });
      }

      const field = await FormFields.create({
        templateId: id,
        fieldCode,
        fieldName,
        fieldType,
        sortOrder: sortOrder || 0,
        isRequired: isRequired || false,
        placeholder,
        helpText,
        validationRule,
        defaultValue
      });

      // Add options if field is select/multiselect
      if (options && options.length > 0 && ['select', 'multiselect'].includes(fieldType)) {
        for (const opt of options) {
          await FormFields.addOption({
            fieldId: field.id,
            optionValue: opt.value,
            optionLabel: opt.label,
            sortOrder: opt.sortOrder || 0,
            isActive: opt.isActive !== false
          });
        }
      }

      logger.success('Field added to template', { fieldId: field.id });
      res.status(201).json({ success: true, field });
    } catch (error) {
      logger.error('Failed to add field', { error: error.message });
      res.status(500).json({ error: 'Failed to add field', message: error.message });
    }
  });

  // ==================== UPDATE FIELD ====================
  app.patch('/api/form-fields/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`PATCH /api/form-fields/${id} - Updating field`);

      const field = await FormFields.update(id, req.body);

      if (!field) {
        logger.warning(`Field not found: ${id}`);
        return res.status(404).json({ error: 'Field not found' });
      }

      logger.success('Field updated', { fieldId: id });
      res.json({ success: true, field });
    } catch (error) {
      logger.error('Failed to update field', { error: error.message });
      res.status(500).json({ error: 'Failed to update field', message: error.message });
    }
  });

  // ==================== DELETE FIELD ====================
  app.delete('/api/form-fields/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      logger.info(`DELETE /api/form-fields/${id} - Deleting field`);

      const deleted = await FormFields.delete(id);

      if (!deleted) {
        logger.warning(`Field not found: ${id}`);
        return res.status(404).json({ error: 'Field not found' });
      }

      logger.success('Field deleted', { fieldId: id });
      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to delete field', { error: error.message });
      res.status(500).json({ error: 'Failed to delete field', message: error.message });
    }
  });

  // ==================== CREATE FIELD (standalone) ====================
  app.post('/api/form-fields', requireAuth, async (req, res) => {
    try {
      const { templateId, fieldCode, fieldName, fieldType, sortOrder, isRequired, placeholder, helpText, validationRule, defaultValue } = req.body;

      logger.info(`POST /api/form-fields - Creating field: ${fieldCode} for template ${templateId}`);

      if (!templateId || !fieldCode || !fieldName || !fieldType) {
        return res.status(400).json({ 
          error: 'Missing required fields', 
          details: ['templateId, fieldCode, fieldName, and fieldType are required'] 
        });
      }

      const field = await FormFields.create({
        templateId,
        fieldCode,
        fieldName,
        fieldType,
        sortOrder: sortOrder || 0,
        isRequired: isRequired || false,
        placeholder,
        helpText,
        validationRule,
        defaultValue
      });

      logger.success('Field created', { fieldId: field.id });
      res.status(201).json({ success: true, field, id: field.id });
    } catch (error) {
      logger.error('Failed to create field', { error: error.message });
      res.status(500).json({ error: 'Failed to create field', message: error.message });
    }
  });

  // ==================== ADD OPTION TO FIELD ====================
  app.post('/api/form-fields/:fieldId/options', requireAuth, async (req, res) => {
    try {
      const { fieldId } = req.params;
      const { optionValue, optionLabel, sortOrder, priceValue } = req.body;

      logger.info(`POST /api/form-fields/${fieldId}/options - Adding option: ${optionValue}`);

      if (!optionValue || !optionLabel) {
        return res.status(400).json({ 
          error: 'Missing required fields', 
          details: ['optionValue and optionLabel are required'] 
        });
      }

      const option = await FormFields.addOption({
        fieldId,
        optionValue,
        optionLabel,
        sortOrder: sortOrder || 0,
        priceValue: priceValue || null,
        isActive: true
      });

      logger.success('Option added to field', { optionId: option.id });
      res.status(201).json({ success: true, option });
    } catch (error) {
      logger.error('Failed to add option', { error: error.message });
      res.status(500).json({ error: 'Failed to add option', message: error.message });
    }
  });
}

export default setupFormRoutes;
