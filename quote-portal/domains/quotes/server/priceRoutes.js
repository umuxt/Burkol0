/**
 * Price Parameters & Formulas Routes - PostgreSQL
 * 
 * API routes for managing price parameters and formulas
 */

import db from '../../../db/connection.js';
import PriceParameters from '../../../db/models/priceParameters.js';
import PriceFormulas from '../../../db/models/priceFormulas.js';
import PriceSettings from './models/PriceSettings.js';
import { requireAuth } from '../../../server/auth.js';
import logger from './logger.js';

/**
 * Setup price routes
 */
export function setupPriceRoutes(app) {
  
  // ==================== PRICE PARAMETERS ====================
  
  // Get all parameters
  app.get('/api/price-parameters', async (req, res) => {
    try {
      logger.info('GET /api/price-parameters - Fetching all parameters');
      
      const withPrices = req.query.withPrices === 'true';
      
      if (withPrices) {
        // Get form-based parameters with their price mappings from form_field_options
        const parameters = await PriceParameters.getFormBasedParameters();
        logger.success(`Found ${parameters.length} parameters with price mappings`);
        return res.json(parameters);
      }
      
      const parameters = await PriceParameters.getAll();
      logger.success(`Found ${parameters.length} parameters`);
      res.json(parameters);
    } catch (error) {
      logger.error('Failed to fetch parameters', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch parameters', message: error.message });
    }
  });

  // Get parameter with lookups
  // Note: Lookups removed - prices now in form_field_options.price_value
  app.get('/api/price-parameters/:id/with-prices', async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`GET /api/price-parameters/${id}/with-prices`);
      
      const parameter = await PriceParameters.getById(id);
      
      if (!parameter) {
        logger.warning(`Parameter not found: ${id}`);
        return res.status(404).json({ error: 'Parameter not found' });
      }

      // If form-based parameter, get price options from form_field_options
      if (parameter.type === 'form' && parameter.formFieldCode) {
        const priceOptions = await db('quotes.form_field_options as ffo')
          .join('quotes.form_fields as ff', 'ff.id', 'ffo.fieldId')
          .where('ff.fieldCode', parameter.formFieldCode)
          .where('ffo.isActive', true)
          .select(
            'ffo.id',
            'ffo.optionValue',
            'ffo.optionLabel',
            'ffo.priceValue'
          )
          .orderBy('ffo.sortOrder');

        logger.success(`Parameter fetched with ${priceOptions.length} price options`);
        return res.json({ ...parameter, priceOptions });
      }

      logger.success(`Parameter fetched: ${parameter.code}`);
      res.json(parameter);
    } catch (error) {
      logger.error('Failed to fetch parameter', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch parameter', message: error.message });
    }
  });

  // Get single parameter
  app.get('/api/price-parameters/:id', async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`GET /api/price-parameters/${id}`);
      
      const parameter = await PriceParameters.getById(id);
      
      if (!parameter) {
        logger.warning(`Parameter not found: ${id}`);
        return res.status(404).json({ error: 'Parameter not found' });
      }

      logger.success(`Parameter fetched: ${parameter.code}`);
      res.json(parameter);
    } catch (error) {
      logger.error('Failed to fetch parameter', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch parameter', message: error.message });
    }
  });

  // Create parameter
  app.post('/api/price-parameters', async (req, res) => {
    try {
      const { code, name, type, formFieldCode, fixedValue, unit, description } = req.body;
      
      logger.info('POST /api/price-parameters - Creating parameter', { code, name, type });

      if (!code || !name || !type) {
        return res.status(400).json({ 
          error: 'Missing required fields', 
          details: ['code, name, and type are required'] 
        });
      }

      const paramData = {
        code,
        name,
        type,
        description,
        unit,
        formFieldCode: formFieldCode || null
      };

      if (type === 'fixed') {
        if (fixedValue === undefined) {
          return res.status(400).json({ 
            error: 'Missing required field', 
            details: ['fixedValue is required for fixed type parameters'] 
          });
        }
        paramData.fixedValue = fixedValue;
      } else if (type === 'form') {
        if (!formFieldCode) {
          return res.status(400).json({ 
            error: 'Missing required field', 
            details: ['formFieldCode is required for form type parameters'] 
          });
        }
      }

      const parameter = await PriceParameters.create(paramData);

      logger.success(`Parameter created: ${parameter.id}`);
      res.status(201).json(parameter);
    } catch (error) {
      logger.error('Failed to create parameter', { error: error.message });
      res.status(500).json({ error: 'Failed to create parameter', message: error.message });
    }
  });

  // Update parameter
  app.patch('/api/price-parameters/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { code, name, type, formFieldCode, fixedValue, unit, description } = req.body;
      
      logger.info(`PATCH /api/price-parameters/${id}`);

      const updates = {};
      if (code !== undefined) updates.code = code;
      if (name !== undefined) updates.name = name;
      if (type !== undefined) updates.type = type;
      if (formFieldCode !== undefined) updates.formFieldCode = formFieldCode;
      if (fixedValue !== undefined) updates.fixedValue = fixedValue;
      if (unit !== undefined) updates.unit = unit;
      if (description !== undefined) updates.description = description;

      const parameter = await PriceParameters.update(id, updates);
      
      if (!parameter) {
        logger.warning(`Parameter not found: ${id}`);
        return res.status(404).json({ error: 'Parameter not found' });
      }

      logger.success(`Parameter updated: ${id}`);
      res.json(parameter);
    } catch (error) {
      logger.error('Failed to update parameter', { error: error.message });
      res.status(500).json({ error: 'Failed to update parameter', message: error.message });
    }
  });

  // Delete parameter
  app.delete('/api/price-parameters/:id', async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`DELETE /api/price-parameters/${id}`);

      const success = await PriceParameters.delete(id);
      
      if (!success) {
        logger.warning(`Parameter not found: ${id}`);
        return res.status(404).json({ error: 'Parameter not found' });
      }

      logger.success(`Parameter deleted: ${id}`);
      res.json({ success: true, message: 'Parameter deleted' });
    } catch (error) {
      logger.error('Failed to delete parameter', { error: error.message });
      res.status(500).json({ error: 'Failed to delete parameter', message: error.message });
    }
  });

  // ==================== PRICE FORMULAS ====================

  // Get all formulas
  app.get('/api/price-formulas', async (req, res) => {
    try {
      logger.info('GET /api/price-formulas - Fetching all formulas');
      
      const activeOnly = req.query.activeOnly === 'true';
      const formulas = activeOnly 
        ? [await PriceFormulas.getActive()]
        : await PriceFormulas.getAll();
      
      logger.success(`Found ${formulas.length} formulas`);
      res.json(formulas.filter(Boolean));
    } catch (error) {
      logger.error('Failed to fetch formulas', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch formulas', message: error.message });
    }
  });

  // Get formula with parameters
  app.get('/api/price-formulas/:id/with-parameters', async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`GET /api/price-formulas/${id}/with-parameters`);
      
      const formula = await PriceFormulas.getWithParameters(id);
      
      if (!formula) {
        logger.warning(`Formula not found: ${id}`);
        return res.status(404).json({ error: 'Formula not found' });
      }

      logger.success(`Formula fetched with ${formula.parameters?.length || 0} parameters`);
      res.json(formula);
    } catch (error) {
      logger.error('Failed to fetch formula', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch formula', message: error.message });
    }
  });

  // Get single formula
  app.get('/api/price-formulas/:id', async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`GET /api/price-formulas/${id}`);
      
      const formula = await PriceFormulas.getById(id);
      
      if (!formula) {
        logger.warning(`Formula not found: ${id}`);
        return res.status(404).json({ error: 'Formula not found' });
      }

      logger.success(`Formula fetched: ${formula.code}`);
      res.json(formula);
    } catch (error) {
      logger.error('Failed to fetch formula', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch formula', message: error.message });
    }
  });

  // Create formula
  app.post('/api/price-formulas', async (req, res) => {
    try {
      const { code, name, formulaExpression, description, version, isActive, parameters } = req.body;
      
      logger.info('POST /api/price-formulas - Creating formula', { code, name });

      if (!code || !name || !formulaExpression) {
        return res.status(400).json({ 
          error: 'Missing required fields', 
          details: ['code, name, and formulaExpression are required'] 
        });
      }

      // If parameters provided, use createWithParameters
      if (parameters && parameters.length > 0) {
        const formula = await PriceFormulas.createWithParameters({
          code,
          name,
          formulaExpression: formulaExpression,
          description,
          version: version || '1.0',
          isActive: isActive !== undefined ? isActive : false
        }, parameters);

        logger.success(`Formula created with ${parameters.length} parameters: ${formula.id}`);
        return res.status(201).json(formula);
      }

      const formula = await PriceFormulas.create({
        code,
        name,
        formulaExpression: formulaExpression,
        description,
        version: version || '1.0',
        isActive: isActive !== undefined ? isActive : false
      });

      logger.success(`Formula created: ${formula.id}`);
      res.status(201).json(formula);
    } catch (error) {
      logger.error('Failed to create formula', { error: error.message });
      res.status(500).json({ error: 'Failed to create formula', message: error.message });
    }
  });

  // Update formula
  app.patch('/api/price-formulas/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { code, name, formulaExpression, description, version, isActive } = req.body;
      
      logger.info(`PATCH /api/price-formulas/${id}`);

      const updates = {};
      if (code !== undefined) updates.code = code;
      if (name !== undefined) updates.name = name;
      if (formulaExpression !== undefined) updates.formulaExpression = formulaExpression;
      if (description !== undefined) updates.description = description;
      if (version !== undefined) updates.version = version;
      if (isActive !== undefined) updates.isActive = isActive;

      const formula = await PriceFormulas.update(id, updates);
      
      if (!formula) {
        logger.warning(`Formula not found: ${id}`);
        return res.status(404).json({ error: 'Formula not found' });
      }

      logger.success(`Formula updated: ${id}`);
      res.json(formula);
    } catch (error) {
      logger.error('Failed to update formula', { error: error.message });
      res.status(500).json({ error: 'Failed to update formula', message: error.message });
    }
  });

  // Delete formula
  app.delete('/api/price-formulas/:id', async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`DELETE /api/price-formulas/${id}`);

      const success = await PriceFormulas.delete(id);
      
      if (!success) {
        logger.warning(`Formula not found: ${id}`);
        return res.status(404).json({ error: 'Formula not found' });
      }

      logger.success(`Formula deleted: ${id}`);
      res.json({ success: true, message: 'Formula deleted' });
    } catch (error) {
      logger.error('Failed to delete formula', { error: error.message });
      res.status(500).json({ error: 'Failed to delete formula', message: error.message });
    }
  });

  // Get all versions of a formula
  app.get('/api/price-formulas/:code/versions', async (req, res) => {
    try {
      const { code } = req.params;
      logger.info(`GET /api/price-formulas/${code}/versions`);

      const versions = await PriceFormulas.getVersions(code);
      
      logger.success(`Found ${versions.length} versions for formula ${code}`);
      res.json(versions);
    } catch (error) {
      logger.error('Failed to fetch formula versions', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch formula versions', message: error.message });
    }
  });

  // Create new version of formula
  app.post('/api/price-formulas/:id/new-version', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, formulaExpression, description, createdBy } = req.body;
      
      logger.info(`POST /api/price-formulas/${id}/new-version`);

      const newFormula = await PriceFormulas.createNewVersion(parseInt(id), {
        name,
        formulaExpression,
        description,
        createdBy
      });

      logger.success(`New formula version created: ${newFormula.id} (version ${newFormula.version})`);
      res.status(201).json(newFormula);
    } catch (error) {
      logger.error('Failed to create new formula version', { error: error.message });
      res.status(500).json({ error: 'Failed to create new formula version', message: error.message });
    }
  });

  // Activate a specific formula version
  app.patch('/api/price-formulas/:id/activate', async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`PATCH /api/price-formulas/${id}/activate`);

      const formula = await PriceFormulas.activateVersion(parseInt(id));
      
      if (!formula) {
        logger.warning(`Formula not found: ${id}`);
        return res.status(404).json({ error: 'Formula not found' });
      }

      logger.success(`Formula activated: ${id}`);
      res.json(formula);
    } catch (error) {
      logger.error('Failed to activate formula', { error: error.message });
      res.status(500).json({ error: 'Failed to activate formula', message: error.message });
    }
  });

  // Calculate price with formula
  app.post('/api/price-formulas/:id/calculate', async (req, res) => {
    try {
      const { id } = req.params;
      const { formData } = req.body;

      logger.info(`POST /api/price-formulas/${id}/calculate`);

      if (!formData) {
        return res.status(400).json({ 
          error: 'Missing required field', 
          details: ['formData is required'] 
        });
      }

      const result = await PriceFormulas.calculatePrice(id, formData);

      logger.success(`Price calculated: ${result.totalPrice} ${result.currency}`);
      res.json(result);
    } catch (error) {
      logger.error('Failed to calculate price', { error: error.message });
      res.status(500).json({ error: 'Failed to calculate price', message: error.message });
    }
  });

  // ==================== FORMULA PARAMETERS ====================

  // Add parameter to formula
  app.post('/api/price-formulas/:formulaId/parameters', async (req, res) => {
    try {
      const { formulaId } = req.params;
      const { parameterId, sortOrder } = req.body;

      logger.info(`POST /api/price-formulas/${formulaId}/parameters`);

      if (!parameterId) {
        return res.status(400).json({ 
          error: 'Missing required field', 
          details: ['parameterId is required'] 
        });
      }

      const link = await PriceFormulas.addParameter(formulaId, parameterId, sortOrder);

      logger.success(`Parameter linked to formula: ${link.id}`);
      res.status(201).json(link);
    } catch (error) {
      logger.error('Failed to add parameter to formula', { error: error.message });
      res.status(500).json({ error: 'Failed to add parameter to formula', message: error.message });
    }
  });

  // Remove parameter from formula
  app.delete('/api/price-formulas/:formulaId/parameters/:parameterId', async (req, res) => {
    try {
      const { formulaId, parameterId } = req.params;
      logger.info(`DELETE /api/price-formulas/${formulaId}/parameters/${parameterId}`);

      const success = await PriceFormulas.removeParameter(formulaId, parameterId);
      
      if (!success) {
        logger.warning(`Parameter link not found`);
        return res.status(404).json({ error: 'Parameter link not found' });
      }

      logger.success(`Parameter unlinked from formula`);
      res.json({ success: true, message: 'Parameter removed from formula' });
    } catch (error) {
      logger.error('Failed to remove parameter from formula', { error: error.message });
      res.status(500).json({ error: 'Failed to remove parameter from formula', message: error.message });
    }
  });

  // ==================== PRICE SETTINGS (VERSIONING) ====================

  // Get all price settings (all versions)
  app.get('/api/price-settings/all', async (req, res) => {
    try {
      logger.info('GET /api/price-settings/all - Fetching all versions');
      const settings = await PriceSettings.getAll();
      logger.success(`Found ${settings.length} price settings`);
      res.json(settings);
    } catch (error) {
      logger.error('Failed to fetch price settings', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch price settings', message: error.message });
    }
  });

  // Get active price setting with details
  app.get('/api/price-settings/active', async (req, res) => {
    try {
      logger.info('GET /api/price-settings/active - Fetching active setting');
      const setting = await PriceSettings.getActiveWithDetails();
      
      if (!setting) {
        logger.info('No active price setting found');
        return res.json({ parameters: [], formula: null });
      }

      logger.success(`Active setting found: ${setting.id}`);
      res.json(setting);
    } catch (error) {
      logger.error('Failed to fetch active price setting', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch active price setting', message: error.message });
    }
  });

  // Get specific price setting with details
  app.get('/api/price-settings/:id', async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`GET /api/price-settings/${id} - Fetching setting`);
      
      const setting = await PriceSettings.getWithDetails(parseInt(id));
      
      if (!setting) {
        return res.status(404).json({ error: 'Price setting not found' });
      }

      logger.success(`Setting found: ${setting.id}`);
      res.json(setting);
    } catch (error) {
      logger.error('Failed to fetch price setting', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch price setting', message: error.message });
    }
  });

  // Create new price setting
  app.post('/api/price-settings', async (req, res) => {
    try {
      const { name, description, parameters, formula } = req.body;
      
      logger.info('POST /api/price-settings - Creating new setting');

      if (!name) {
        return res.status(400).json({ error: 'Name is required' });
      }

      // Create setting
      const setting = await PriceSettings.create({
        code: `PRICE_SETTING_${Date.now()}`,
        name,
        description,
        isActive: false,
        version: 1
      });

      // Add parameters if provided
      if (parameters && parameters.length > 0) {
        const paramData = parameters.map(p => ({
          settingId: setting.id,
          code: p.id || p.code,
          name: p.name,
          type: p.type === 'form' ? 'form_lookup' : p.type,
          fixedValue: p.type === 'fixed' ? (parseFloat(p.value || p.fixedValue) || 0) : null,
          formFieldCode: p.type === 'form' ? (p.formField || p.id) : null,
          isActive: true
        }));

        await db('quotes.price_parameters').insert(paramData);
      }

      // Add formula if provided
      if (formula && formula.trim()) {
        await db('quotes.price_formulas').insert({
          settingId: setting.id,
          code: 'MAIN_FORMULA',
          name: 'Main Pricing Formula',
          formulaExpression: formula,
          isActive: true,
          version: 1
        });
      }

      logger.success(`Price setting created: ${setting.id}`);
      res.status(201).json(setting);
    } catch (error) {
      logger.error('Failed to create price setting', { error: error.message });
      res.status(500).json({ error: 'Failed to create price setting', message: error.message });
    }
  });

  // Update existing price setting (current version only)
  app.patch('/api/price-settings/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, parameters, formula } = req.body;
      
      logger.info(`PATCH /api/price-settings/${id} - Updating setting`);

      // Update setting metadata
      if (name || description) {
        await PriceSettings.update(parseInt(id), {
          name,
          description
        });
      }

      // Update parameters
      if (parameters) {
        // Delete existing parameters for this setting
        await db('quotes.price_parameters')
          .where({ settingId: parseInt(id) })
          .delete();

        // Insert new parameters
        if (parameters.length > 0) {
          const paramData = parameters.map(p => ({
            settingId: parseInt(id),
            code: p.id || p.code,
            name: p.name,
            type: p.type === 'form' ? 'form_lookup' : p.type,
            fixedValue: p.type === 'fixed' ? (parseFloat(p.value || p.fixedValue) || 0) : null,
            formFieldCode: p.type === 'form' ? (p.formField || p.id) : null,
            isActive: true
          }));

          await db('quotes.price_parameters').insert(paramData);
        }
      }

      // Update formula
      if (formula !== undefined) {
        // Delete existing formula
        await db('quotes.price_formulas')
          .where({ settingId: parseInt(id) })
          .delete();

        // Insert new formula if not empty
        if (formula && formula.trim()) {
          await db('quotes.price_formulas').insert({
            settingId: parseInt(id),
            code: 'MAIN_FORMULA',
            name: 'Main Pricing Formula',
            formulaExpression: formula,
            isActive: true,
            version: 1
          });
        }
      }

      const updatedSetting = await PriceSettings.getWithDetails(parseInt(id));
      logger.success(`Price setting updated: ${id}`);
      res.json(updatedSetting);
    } catch (error) {
      logger.error('Failed to update price setting', { error: error.message });
      res.status(500).json({ error: 'Failed to update price setting', message: error.message });
    }
  });

  // Create new version from existing setting
  app.post('/api/price-settings/:id/new-version', async (req, res) => {
    try {
      const { id } = req.params;
      const { name } = req.body;
      
      logger.info(`POST /api/price-settings/${id}/new-version - Creating new version`);

      const newSetting = await PriceSettings.createNewVersion(parseInt(id), name);
      
      logger.success(`New version created: ${newSetting.id} (v${newSetting.version})`);
      res.status(201).json(newSetting);
    } catch (error) {
      logger.error('Failed to create new version', { error: error.message });
      res.status(500).json({ error: 'Failed to create new version', message: error.message });
    }
  });

  // Activate a price setting
  app.patch('/api/price-settings/:id/activate', async (req, res) => {
    try {
      const { id } = req.params;
      
      logger.info(`PATCH /api/price-settings/${id}/activate - Activating setting`);

      const setting = await PriceSettings.activate(parseInt(id));
      
      logger.success(`Price setting activated: ${id}`);
      res.json(setting);
    } catch (error) {
      logger.error('Failed to activate price setting', { error: error.message });
      res.status(500).json({ error: 'Failed to activate price setting', message: error.message });
    }
  });

  // Delete price setting
  app.delete('/api/price-settings/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      logger.info(`DELETE /api/price-settings/${id} - Deleting setting`);

      await PriceSettings.delete(parseInt(id));
      
      logger.success(`Price setting deleted: ${id}`);
      res.json({ success: true, message: 'Price setting deleted' });
    } catch (error) {
      logger.error('Failed to delete price setting', { error: error.message });
      res.status(500).json({ error: 'Failed to delete price setting', message: error.message });
    }
  });
}

export default setupPriceRoutes;
