/**
 * Price Parameters & Settings Routes - PostgreSQL
 * 
 * API routes for managing price parameters and settings
 * Updated for B0: Removed PriceFormulas (merged into PriceSettings)
 * Updated for Pre-D2-1: Added price_parameter_lookups support
 * Updated for Pre-D2-2: Refactored lookup save logic into helper functions
 */

import db from '../../../../db/connection.js';
import PriceParameters from '../../../../db/models/priceParameters.js';
import PriceParameterLookups from '../../../../db/models/priceParameterLookups.js';
import PriceSettings from '../services/priceSettingsService.js';
import { requireAuth } from '../../../../server/auth.js';
import logger from '../../utils/logger.js';

// ==================== HELPER FUNCTIONS ====================

/**
 * Convert frontend parameter format to database format
 * @param {Object} param - Frontend parameter object
 * @param {number} settingId - Price setting ID
 * @returns {Object} Database-ready parameter object
 */
function convertParamToDbFormat(param, settingId) {
  return {
    settingId,
    code: param.id || param.code,
    name: param.name,
    type: param.type === 'form' ? 'form_lookup' : param.type,
    fixedValue: param.type === 'fixed' ? (parseFloat(param.value || param.fixedValue) || 0) : null,
    formFieldCode: param.type === 'form' ? (param.formField || param.id) : null,
    unit: param.unit,
    description: param.description,
    isActive: true
  };
}

/**
 * Save lookups for inserted parameters
 * @param {Array} parameters - Frontend parameters with lookups
 * @param {Array} insertedParams - Inserted parameters with {id, code}
 */
async function saveParameterLookups(parameters, insertedParams) {
  for (const param of parameters) {
    if (param.lookups && param.lookups.length > 0) {
      const insertedParam = insertedParams.find(ip => ip.code === (param.id || param.code));
      if (insertedParam) {
        const lookupData = param.lookups.map(l => ({
          parameterId: insertedParam.id,
          optionCode: l.optionCode,
          value: parseFloat(l.value) || 0
        }));
        await db('quotes.price_parameter_lookups').insert(lookupData);
      }
    }
  }
}

/**
 * Delete all lookups for given parameter IDs
 * @param {Array<number>} paramIds - Parameter IDs
 */
async function deleteLookupsForParams(paramIds) {
  if (paramIds.length > 0) {
    await db('quotes.price_parameter_lookups')
      .whereIn('parameterId', paramIds)
      .delete();
  }
}

/**
 * Setup price routes
 */
export function setupPriceRoutes(app) {
  
  // ==================== PRICE PARAMETERS ====================
  
  // Get all parameters
  app.get('/api/price-parameters', requireAuth, async (req, res) => {
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

  // Get parameter with lookups (Pre-D2-1: Uses price_parameter_lookups table)
  app.get('/api/price-parameters/:id/with-prices', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`GET /api/price-parameters/${id}/with-prices`);
      
      const parameter = await PriceParameters.getById(id);
      
      if (!parameter) {
        logger.warning(`Parameter not found: ${id}`);
        return res.status(404).json({ error: 'Parameter not found' });
      }

      // If form-based parameter, get options from form_field_options and lookups from price_parameter_lookups
      if (parameter.type === 'form' && parameter.formFieldCode) {
        // Get form field options
        const options = await db('quotes.form_field_options as ffo')
          .join('quotes.form_fields as ff', 'ff.id', 'ffo.fieldId')
          .where('ff.fieldCode', parameter.formFieldCode)
          .where('ffo.isActive', true)
          .select(
            'ffo.id',
            'ffo.optionCode',
            'ffo.optionLabel',
            'ffo.sortOrder'
          )
          .orderBy('ffo.sortOrder');

        // Get lookup values for this parameter
        const lookups = await PriceParameterLookups.getByParameterId(id);
        const lookupMap = {};
        for (const lookup of lookups) {
          lookupMap[lookup.optionCode] = parseFloat(lookup.value) || 0;
        }

        // Combine options with their lookup values
        const priceOptions = options.map(opt => ({
          id: opt.id,
          optionCode: opt.optionCode,
          optionLabel: opt.optionLabel,
          sortOrder: opt.sortOrder,
          value: lookupMap[opt.optionCode] ?? null
        }));

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
  app.get('/api/price-parameters/:id', requireAuth, async (req, res) => {
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
  app.post('/api/price-parameters', requireAuth, async (req, res) => {
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
  app.patch('/api/price-parameters/:id', requireAuth, async (req, res) => {
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
  app.delete('/api/price-parameters/:id', requireAuth, async (req, res) => {
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

  // ==================== PARAMETER LOOKUPS (Pre-D2-1) ====================
  
  // Get lookups for a parameter
  app.get('/api/price-parameters/:id/lookups', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`GET /api/price-parameters/${id}/lookups`);
      
      const parameter = await PriceParameters.getById(id);
      if (!parameter) {
        logger.warning(`Parameter not found: ${id}`);
        return res.status(404).json({ error: 'Parameter not found' });
      }

      const lookups = await PriceParameterLookups.getWithOptionDetails(id);
      
      logger.success(`Found ${lookups.length} lookups for parameter ${id}`);
      res.json({
        parameterId: parseInt(id),
        parameterCode: parameter.code,
        parameterName: parameter.name,
        formFieldCode: parameter.formFieldCode,
        lookups
      });
    } catch (error) {
      logger.error('Failed to fetch lookups', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch lookups', message: error.message });
    }
  });

  // Save lookups for a parameter (bulk upsert)
  app.post('/api/price-parameters/:id/lookups', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { lookups } = req.body;
      
      logger.info(`POST /api/price-parameters/${id}/lookups`, { count: lookups?.length });
      
      const parameter = await PriceParameters.getById(id);
      if (!parameter) {
        logger.warning(`Parameter not found: ${id}`);
        return res.status(404).json({ error: 'Parameter not found' });
      }

      if (!lookups || !Array.isArray(lookups)) {
        return res.status(400).json({ 
          error: 'Invalid request', 
          details: ['lookups array is required'] 
        });
      }

      // Validate lookup entries
      for (const lookup of lookups) {
        if (!lookup.optionCode || lookup.value === undefined) {
          return res.status(400).json({ 
            error: 'Invalid lookup entry', 
            details: ['Each lookup must have optionCode and value'] 
          });
        }
      }

      const results = await PriceParameterLookups.bulkUpsert(parseInt(id), lookups);
      
      logger.success(`Saved ${results.length} lookups for parameter ${id}`);
      res.json({
        success: true,
        parameterId: parseInt(id),
        savedCount: results.length,
        lookups: results
      });
    } catch (error) {
      logger.error('Failed to save lookups', { error: error.message });
      res.status(500).json({ error: 'Failed to save lookups', message: error.message });
    }
  });

  // Update a single lookup
  app.patch('/api/price-parameters/:id/lookups/:optionCode', requireAuth, async (req, res) => {
    try {
      const { id, optionCode } = req.params;
      const { value } = req.body;
      
      logger.info(`PATCH /api/price-parameters/${id}/lookups/${optionCode}`, { value });
      
      if (value === undefined) {
        return res.status(400).json({ 
          error: 'Invalid request', 
          details: ['value is required'] 
        });
      }

      const lookup = await PriceParameterLookups.upsert({
        parameterId: parseInt(id),
        optionCode,
        value: parseFloat(value)
      });
      
      logger.success(`Updated lookup for parameter ${id}, option ${optionCode}`);
      res.json(lookup);
    } catch (error) {
      logger.error('Failed to update lookup', { error: error.message });
      res.status(500).json({ error: 'Failed to update lookup', message: error.message });
    }
  });

  // Delete a single lookup
  app.delete('/api/price-parameters/:id/lookups/:optionCode', requireAuth, async (req, res) => {
    try {
      const { id, optionCode } = req.params;
      
      logger.info(`DELETE /api/price-parameters/${id}/lookups/${optionCode}`);
      
      const success = await PriceParameterLookups.deleteByParameterAndOption(
        parseInt(id), 
        optionCode
      );
      
      if (!success) {
        logger.warning(`Lookup not found: parameter ${id}, option ${optionCode}`);
        return res.status(404).json({ error: 'Lookup not found' });
      }

      logger.success(`Deleted lookup for parameter ${id}, option ${optionCode}`);
      res.json({ success: true, message: 'Lookup deleted' });
    } catch (error) {
      logger.error('Failed to delete lookup', { error: error.message });
      res.status(500).json({ error: 'Failed to delete lookup', message: error.message });
    }
  });

  // Delete all lookups for a parameter
  app.delete('/api/price-parameters/:id/lookups', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      logger.info(`DELETE /api/price-parameters/${id}/lookups (all)`);
      
      const count = await PriceParameterLookups.deleteByParameterId(parseInt(id));
      
      logger.success(`Deleted ${count} lookups for parameter ${id}`);
      res.json({ success: true, deletedCount: count });
    } catch (error) {
      logger.error('Failed to delete lookups', { error: error.message });
      res.status(500).json({ error: 'Failed to delete lookups', message: error.message });
    }
  });

  // Get parameter with lookups (combined)
  app.get('/api/price-parameters/:id/with-lookups', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`GET /api/price-parameters/${id}/with-lookups`);
      
      const result = await PriceParameters.getWithLookups(parseInt(id));
      
      if (!result) {
        logger.warning(`Parameter not found: ${id}`);
        return res.status(404).json({ error: 'Parameter not found' });
      }

      logger.success(`Parameter fetched with ${result.lookups?.length || 0} lookups`);
      res.json(result);
    } catch (error) {
      logger.error('Failed to fetch parameter with lookups', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch parameter', message: error.message });
    }
  });

  // ==================== PRICE FORMULAS (DEPRECATED - REDIRECTS TO PRICE SETTINGS) ====================
  // B0: price_formulas table merged into price_settings
  // These routes are kept for backward compatibility

  // Get all formulas -> Returns price settings with formulaExpression
  app.get('/api/price-formulas', requireAuth, async (req, res) => {
    try {
      logger.info('GET /api/price-formulas - Redirecting to price settings (B0 migration)');
      
      const activeOnly = req.query.activeOnly === 'true';
      const settings = activeOnly 
        ? [await PriceSettings.getActive()]
        : await PriceSettings.getAll();
      
      // Transform to old formula format for backward compatibility
      const formulas = settings.filter(Boolean).map(s => ({
        id: s.id,
        settingId: s.id,
        code: s.code,
        name: s.name,
        formulaExpression: s.formulaExpression,
        description: s.description,
        isActive: s.isActive,
        version: s.version,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      }));
      
      logger.success(`Found ${formulas.length} formulas (from settings)`);
      res.json(formulas);
    } catch (error) {
      logger.error('Failed to fetch formulas', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch formulas', message: error.message });
    }
  });

  // Get formula with parameters -> Returns setting with details
  app.get('/api/price-formulas/:id/with-parameters', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`GET /api/price-formulas/${id}/with-parameters - Redirecting to price settings`);
      
      const setting = await PriceSettings.getWithDetails(parseInt(id));
      
      if (!setting) {
        logger.warning(`Setting not found: ${id}`);
        return res.status(404).json({ error: 'Formula not found' });
      }

      // Transform to old formula format
      const formula = {
        id: setting.id,
        settingId: setting.id,
        code: setting.code,
        name: setting.name,
        formulaExpression: setting.formulaExpression,
        description: setting.description,
        isActive: setting.isActive,
        version: setting.version,
        parameters: setting.parameters
      };

      logger.success(`Formula fetched with ${formula.parameters?.length || 0} parameters`);
      res.json(formula);
    } catch (error) {
      logger.error('Failed to fetch formula', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch formula', message: error.message });
    }
  });

  // Get single formula -> Returns setting
  app.get('/api/price-formulas/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`GET /api/price-formulas/${id} - Redirecting to price settings`);
      
      const setting = await PriceSettings.getById(parseInt(id));
      
      if (!setting) {
        logger.warning(`Setting not found: ${id}`);
        return res.status(404).json({ error: 'Formula not found' });
      }

      const formula = {
        id: setting.id,
        settingId: setting.id,
        code: setting.code,
        name: setting.name,
        formulaExpression: setting.formulaExpression,
        description: setting.description,
        isActive: setting.isActive,
        version: setting.version
      };

      logger.success(`Formula fetched: ${formula.code}`);
      res.json(formula);
    } catch (error) {
      logger.error('Failed to fetch formula', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch formula', message: error.message });
    }
  });

  // Create formula -> Creates setting with formulaExpression
  app.post('/api/price-formulas', requireAuth, async (req, res) => {
    try {
      const { code, name, formulaExpression, description, version, isActive, parameters } = req.body;
      
      logger.info('POST /api/price-formulas - Redirecting to price settings', { code, name });

      if (!code || !name || !formulaExpression) {
        return res.status(400).json({ 
          error: 'Missing required fields', 
          details: ['code, name, and formulaExpression are required'] 
        });
      }

      // Create price setting with formula
      const setting = await PriceSettings.create({
        code,
        name,
        formulaExpression,
        description,
        version: version || 1,
        isActive: isActive !== undefined ? isActive : false
      });

      // Add parameters if provided
      if (parameters && parameters.length > 0) {
        const paramData = parameters.map(p => ({
          settingId: setting.id,
          code: p.code,
          name: p.name,
          type: p.type,
          fixedValue: p.fixedValue,
          formFieldCode: p.formFieldCode,
          unit: p.unit,
          description: p.description,
          isActive: true
        }));

        await db('quotes.price_parameters').insert(paramData);
      }

      const formula = {
        id: setting.id,
        settingId: setting.id,
        code: setting.code,
        name: setting.name,
        formulaExpression: setting.formulaExpression,
        isActive: setting.isActive,
        version: setting.version
      };

      logger.success(`Formula created: ${formula.id}`);
      res.status(201).json(formula);
    } catch (error) {
      logger.error('Failed to create formula', { error: error.message });
      res.status(500).json({ error: 'Failed to create formula', message: error.message });
    }
  });

  // Update formula -> Updates setting
  app.patch('/api/price-formulas/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { code, name, formulaExpression, description, version, isActive } = req.body;
      
      logger.info(`PATCH /api/price-formulas/${id} - Redirecting to price settings`);

      const updates = {};
      if (code !== undefined) updates.code = code;
      if (name !== undefined) updates.name = name;
      if (formulaExpression !== undefined) updates.formulaExpression = formulaExpression;
      if (description !== undefined) updates.description = description;
      if (version !== undefined) updates.version = version;
      if (isActive !== undefined) updates.isActive = isActive;

      const setting = await PriceSettings.update(parseInt(id), updates);
      
      if (!setting) {
        logger.warning(`Setting not found: ${id}`);
        return res.status(404).json({ error: 'Formula not found' });
      }

      const formula = {
        id: setting.id,
        settingId: setting.id,
        code: setting.code,
        name: setting.name,
        formulaExpression: setting.formulaExpression,
        isActive: setting.isActive,
        version: setting.version
      };

      logger.success(`Formula updated: ${id}`);
      res.json(formula);
    } catch (error) {
      logger.error('Failed to update formula', { error: error.message });
      res.status(500).json({ error: 'Failed to update formula', message: error.message });
    }
  });

  // Delete formula -> Deletes setting
  app.delete('/api/price-formulas/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`DELETE /api/price-formulas/${id} - Redirecting to price settings`);

      await PriceSettings.delete(parseInt(id));

      logger.success(`Formula deleted: ${id}`);
      res.json({ success: true, message: 'Formula deleted' });
    } catch (error) {
      logger.error('Failed to delete formula', { error: error.message });
      res.status(500).json({ error: 'Failed to delete formula', message: error.message });
    }
  });

  // Get all versions of a formula -> Gets versions from settings
  app.get('/api/price-formulas/:code/versions', requireAuth, async (req, res) => {
    try {
      const { code } = req.params;
      logger.info(`GET /api/price-formulas/${code}/versions - Getting setting versions`);

      const versions = await db('quotes.price_settings')
        .where({ code })
        .orderBy('version', 'desc')
        .select('*');
      
      const formulas = versions.map(s => ({
        id: s.id,
        settingId: s.id,
        code: s.code,
        name: s.name,
        formulaExpression: s.formulaExpression,
        isActive: s.isActive,
        version: s.version
      }));

      logger.success(`Found ${formulas.length} versions for formula ${code}`);
      res.json(formulas);
    } catch (error) {
      logger.error('Failed to fetch formula versions', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch formula versions', message: error.message });
    }
  });

  // Create new version of formula -> Creates new setting version
  app.post('/api/price-formulas/:id/new-version', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { name } = req.body;
      
      logger.info(`POST /api/price-formulas/${id}/new-version - Creating new version`);

      const newSetting = await PriceSettings.createNewVersion(parseInt(id), name);

      const formula = {
        id: newSetting.id,
        settingId: newSetting.id,
        code: newSetting.code,
        name: newSetting.name,
        formulaExpression: newSetting.formulaExpression,
        isActive: newSetting.isActive,
        version: newSetting.version
      };

      logger.success(`New formula version created: ${formula.id} (version ${formula.version})`);
      res.status(201).json(formula);
    } catch (error) {
      logger.error('Failed to create new formula version', { error: error.message });
      res.status(500).json({ error: 'Failed to create new formula version', message: error.message });
    }
  });

  // Activate a specific formula version -> Activates setting
  app.patch('/api/price-formulas/:id/activate', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`PATCH /api/price-formulas/${id}/activate`);

      const setting = await PriceSettings.activate(parseInt(id));
      
      if (!setting) {
        logger.warning(`Setting not found: ${id}`);
        return res.status(404).json({ error: 'Formula not found' });
      }

      const formula = {
        id: setting.id,
        settingId: setting.id,
        code: setting.code,
        name: setting.name,
        formulaExpression: setting.formulaExpression,
        isActive: setting.isActive,
        version: setting.version
      };

      logger.success(`Formula activated: ${id}`);
      res.json(formula);
    } catch (error) {
      logger.error('Failed to activate formula', { error: error.message });
      res.status(500).json({ error: 'Failed to activate formula', message: error.message });
    }
  });

  // Calculate price with formula -> Uses PriceSettings.calculatePrice
  app.post('/api/price-formulas/:id/calculate', requireAuth, async (req, res) => {
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

      const result = await PriceSettings.calculatePrice(parseInt(id), formData);

      logger.success(`Price calculated: ${result.totalPrice}`);
      res.json(result);
    } catch (error) {
      logger.error('Failed to calculate price', { error: error.message });
      res.status(500).json({ error: 'Failed to calculate price', message: error.message });
    }
  });

  // ==================== FORMULA PARAMETERS (DEPRECATED) ====================
  // Parameters are now managed through price_parameters table with settingId

  // Add parameter to formula -> Adds parameter to setting
  app.post('/api/price-formulas/:formulaId/parameters', requireAuth, async (req, res) => {
    try {
      const { formulaId } = req.params;
      const { parameterId, code, name, type, fixedValue, formFieldCode, unit, description, sortOrder } = req.body;

      logger.info(`POST /api/price-formulas/${formulaId}/parameters`);

      // If parameterId provided, this is a link operation (legacy)
      // In B0, parameters are created directly with settingId
      const paramData = {
        settingId: parseInt(formulaId),
        code: code || `PARAM_${Date.now()}`,
        name: name || 'New Parameter',
        type: type || 'fixed',
        fixedValue: fixedValue,
        formFieldCode: formFieldCode,
        unit: unit,
        description: description,
        isActive: true
      };

      const [parameter] = await db('quotes.price_parameters')
        .insert(paramData)
        .returning('*');

      logger.success(`Parameter added to setting: ${parameter.id}`);
      res.status(201).json(parameter);
    } catch (error) {
      logger.error('Failed to add parameter to formula', { error: error.message });
      res.status(500).json({ error: 'Failed to add parameter to formula', message: error.message });
    }
  });

  // Remove parameter from formula -> Deletes parameter
  app.delete('/api/price-formulas/:formulaId/parameters/:parameterId', requireAuth, async (req, res) => {
    try {
      const { formulaId, parameterId } = req.params;
      logger.info(`DELETE /api/price-formulas/${formulaId}/parameters/${parameterId}`);

      const deleted = await db('quotes.price_parameters')
        .where({ id: parseInt(parameterId), settingId: parseInt(formulaId) })
        .delete();
      
      if (!deleted) {
        logger.warning(`Parameter not found`);
        return res.status(404).json({ error: 'Parameter not found' });
      }

      logger.success(`Parameter removed from setting`);
      res.json({ success: true, message: 'Parameter removed from formula' });
    } catch (error) {
      logger.error('Failed to remove parameter from formula', { error: error.message });
      res.status(500).json({ error: 'Failed to remove parameter from formula', message: error.message });
    }
  });

  // ==================== PRICE SETTINGS (VERSIONING) ====================

  // Get all price settings (base route - alias for /all)
  app.get('/api/price-settings', requireAuth, async (req, res) => {
    try {
      logger.info('GET /api/price-settings - Fetching all settings');
      const settings = await PriceSettings.getAll();
      logger.success(`Found ${settings.length} price settings`);
      res.json(settings);
    } catch (error) {
      logger.error('Failed to fetch price settings', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch price settings', message: error.message });
    }
  });

  // Get all price settings (all versions - same as base route)
  app.get('/api/price-settings/all', requireAuth, async (req, res) => {
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

  // Get active price setting with details (MUST be before /:id route)
  app.get('/api/price-settings/active', requireAuth, async (req, res) => {
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

  // C2: Calculate price using price setting and form data
  app.post('/api/price-settings/calculate', requireAuth, async (req, res) => {
    try {
      const { settingId, formData } = req.body;
      logger.info('POST /api/price-settings/calculate', { settingId, formData });

      // Get the price setting
      let setting;
      if (settingId) {
        setting = await PriceSettings.getWithDetails(parseInt(settingId));
      } else {
        setting = await PriceSettings.getActiveWithDetails();
      }

      if (!setting) {
        logger.warning('No price setting found');
        return res.status(400).json({ error: 'No price setting configured' });
      }

      // Extract formula and parameters
      const formula = setting.formulaExpression || setting.formula?.formulaExpression || setting.formula?.expression || '';
      const parameters = setting.parameters || [];

      // Build variable context from formData and parameters
      const context = {};
      
      // Add parameters with default values
      parameters.forEach(param => {
        const key = param.code || param.parameterCode || param.key;
        const defaultValue = param.fixedValue || param.defaultValue || param.value || 0;
        context[key] = parseFloat(defaultValue) || 0;
      });

      // Override with form data values
      if (formData) {
        Object.entries(formData).forEach(([key, value]) => {
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            context[key] = numValue;
          } else {
            context[key] = value;
          }
        });
      }

      let totalPrice = 0;

      // If no formula, try to calculate from parameters or return 0
      if (!formula) {
        logger.info('No formula defined, calculating from fixed parameters');
        // Sum all fixed value parameters as fallback
        parameters.forEach(param => {
          if (param.type === 'fixed' && param.fixedValue) {
            totalPrice += parseFloat(param.fixedValue) || 0;
          }
        });
      } else {
        // Evaluate the formula
        try {
          // Remove leading equals sign if present (Excel-style)
          let evaluatedFormula = formula.trim();
          if (evaluatedFormula.startsWith('=')) {
            evaluatedFormula = evaluatedFormula.substring(1).trim();
          }

          // Replace parameter codes with their values
          for (const [code, value] of Object.entries(context)) {
            if (typeof value === 'number') {
              const regex = new RegExp(`\\b${code}\\b`, 'g');
              evaluatedFormula = evaluatedFormula.replace(regex, value);
            }
          }

          // Convert Excel-style functions to JavaScript Math functions (case-insensitive)
          const excelToMath = {
            'SQRT': 'Math.sqrt',
            'ABS': 'Math.abs',
            'CEIL': 'Math.ceil',
            'CEILING': 'Math.ceil',
            'FLOOR': 'Math.floor',
            'ROUND': 'Math.round',
            'MAX': 'Math.max',
            'MIN': 'Math.min',
            'POW': 'Math.pow',
            'POWER': 'Math.pow',
            'SIN': 'Math.sin',
            'COS': 'Math.cos',
            'TAN': 'Math.tan',
            'LOG': 'Math.log',
            'LOG10': 'Math.log10',
            'EXP': 'Math.exp',
            'PI': 'Math.PI'
          };
          
          // Replace Excel functions with Math equivalents (case-insensitive)
          for (const [excel, math] of Object.entries(excelToMath)) {
            const regex = new RegExp(`\\b${excel}\\b`, 'gi');
            evaluatedFormula = evaluatedFormula.replace(regex, math);
          }

          // Replace any remaining unknown identifiers with 0 (undefined variables)
          // But keep Math and Math.* methods intact (sqrt, abs, floor, etc.)
          const mathMethods = ['sqrt', 'abs', 'ceil', 'floor', 'round', 'max', 'min', 'pow', 'sin', 'cos', 'tan', 'log', 'log10', 'exp', 'PI', 'E'];
          evaluatedFormula = evaluatedFormula.replace(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g, (match) => {
            // Don't replace Math or Math methods
            if (match === 'Math' || mathMethods.includes(match)) {
              return match;
            }
            // Replace unknown identifiers with 0
            return '0';
          });

          // Handle ^ as power operator (Excel-style)
          evaluatedFormula = evaluatedFormula.replace(/(\d+(?:\.\d+)?)\s*\^\s*(\d+(?:\.\d+)?)/g, 'Math.pow($1,$2)');

          // Evaluate the expression
          const evalFn = new Function(`return ${evaluatedFormula}`);
          totalPrice = evalFn();
          
          if (isNaN(totalPrice) || !isFinite(totalPrice)) {
            totalPrice = 0;
          }
          
          logger.info('Formula evaluated', { original: formula, evaluated: evaluatedFormula, result: totalPrice });
        } catch (evalError) {
          logger.warning('Formula evaluation failed', { error: evalError.message, formula });
          totalPrice = 0;
        }
      }

      logger.success('Price calculated', { totalPrice, formula: formula || '(no formula - sum of fixed params)' });
      res.json({ 
        totalPrice: Math.round(totalPrice * 100) / 100,
        breakdown: {
          formula: formula || null,
          context,
          settingId: setting.id,
          settingCode: setting.code,
          parametersUsed: parameters.length
        }
      });
    } catch (error) {
      logger.error('Failed to calculate price', { error: error.message });
      res.status(500).json({ error: 'Failed to calculate price', message: error.message });
    }
  });

  // Get specific price setting with details
  app.get('/api/price-settings/:id', requireAuth, async (req, res) => {
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
  app.post('/api/price-settings', requireAuth, async (req, res) => {
    try {
      const { name, description, parameters, formula } = req.body;
      
      logger.info('POST /api/price-settings - Creating new setting');

      if (!name) {
        return res.status(400).json({ error: 'Name is required' });
      }

      // Create setting with formula (B0: formulaExpression is now in price_settings)
      const setting = await PriceSettings.create({
        code: `PRICE_SETTING_${Date.now()}`,
        name,
        description,
        formulaExpression: formula || null,
        isActive: false,
        version: 1
      });

      // Add parameters if provided
      if (parameters && parameters.length > 0) {
        const paramData = parameters.map(p => convertParamToDbFormat(p, setting.id));
        const insertedParams = await db('quotes.price_parameters').insert(paramData).returning(['id', 'code']);
        
        // Pre-D2-2: Save lookups for each parameter
        await saveParameterLookups(parameters, insertedParams);
      }

      logger.success(`Price setting created: ${setting.id}`);
      res.status(201).json(setting);
    } catch (error) {
      logger.error('Failed to create price setting', { error: error.message });
      res.status(500).json({ error: 'Failed to create price setting', message: error.message });
    }
  });

  // Update existing price setting (current version only)
  app.patch('/api/price-settings/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, parameters, formula } = req.body;
      const settingId = parseInt(id);
      
      logger.info(`PATCH /api/price-settings/${id} - Updating setting`);

      // Update setting metadata (including formulaExpression if provided)
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (formula !== undefined) updateData.formulaExpression = formula;

      if (Object.keys(updateData).length > 0) {
        await PriceSettings.update(settingId, updateData);
      }

      // Update parameters - parameters are not referenced by FK, safe to delete/recreate
      if (parameters) {
        // Get existing parameter IDs to delete their lookups first
        const existingParams = await db('quotes.price_parameters')
          .where({ settingId })
          .select('id');
        
        // Delete lookups for existing parameters
        await deleteLookupsForParams(existingParams.map(p => p.id));
        
        // Delete existing parameters for this setting
        await db('quotes.price_parameters')
          .where({ settingId })
          .delete();

        // Insert new parameters with lookups
        if (parameters.length > 0) {
          const paramData = parameters.map(p => convertParamToDbFormat(p, settingId));
          const insertedParams = await db('quotes.price_parameters').insert(paramData).returning(['id', 'code']);
          
          // Save lookups for each parameter
          await saveParameterLookups(parameters, insertedParams);
        }
      }

      const updatedSetting = await PriceSettings.getWithDetails(settingId);
      logger.success(`Price setting updated: ${id}`);
      res.json(updatedSetting);
    } catch (error) {
      logger.error('Failed to update price setting', { error: error.message });
      res.status(500).json({ error: 'Failed to update price setting', message: error.message });
    }
  });

  // Create new version from existing setting
  app.post('/api/price-settings/:id/new-version', requireAuth, async (req, res) => {
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
  app.patch('/api/price-settings/:id/activate', requireAuth, async (req, res) => {
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

  // C3: Compare two price settings and return differences
  // Used to show what changed between quote's saved setting and current active setting
  app.post('/api/price-settings/compare', requireAuth, async (req, res) => {
    try {
      const { oldSettingId, newSettingId } = req.body;
      logger.info('POST /api/price-settings/compare', { oldSettingId, newSettingId });

      if (!oldSettingId || !newSettingId) {
        return res.status(400).json({ error: 'Both oldSettingId and newSettingId are required' });
      }

      // Get both settings with details
      const oldSetting = await PriceSettings.getWithDetails(parseInt(oldSettingId));
      const newSetting = await PriceSettings.getWithDetails(parseInt(newSettingId));

      if (!oldSetting) {
        return res.status(404).json({ error: 'Old price setting not found' });
      }
      if (!newSetting) {
        return res.status(404).json({ error: 'New price setting not found' });
      }

      const changes = {
        formulaChanged: false,
        oldFormula: null,
        newFormula: null,
        parameterChanges: []
      };

      // Compare formulas
      const oldFormula = oldSetting.formulaExpression || oldSetting.formula?.formulaExpression || '';
      const newFormula = newSetting.formulaExpression || newSetting.formula?.formulaExpression || '';
      
      // Get parameters first (needed for beautifyFormula)
      const oldParams = oldSetting.parameters || [];
      const newParams = newSetting.parameters || [];
      
      // Helper: Replace parameter codes with human-readable names in formula
      const beautifyFormula = (formula, params) => {
        if (!formula || !params || params.length === 0) return formula;
        let result = formula;
        // Sort by code length descending to avoid partial replacements
        const sortedParams = [...params].sort((a, b) => (b.code?.length || 0) - (a.code?.length || 0));
        sortedParams.forEach(param => {
          if (param.code && param.name) {
            // Replace all occurrences of param code with param name
            const regex = new RegExp(param.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            result = result.replace(regex, param.name);
          }
        });
        return result;
      };
      
      if (oldFormula !== newFormula) {
        changes.formulaChanged = true;
        // Return both raw and beautified versions
        changes.oldFormula = beautifyFormula(oldFormula, oldParams);
        changes.newFormula = beautifyFormula(newFormula, newParams);
        changes.oldFormulaRaw = oldFormula;
        changes.newFormulaRaw = newFormula;
      }

      // Build maps for easy comparison
      const oldParamMap = {};
      oldParams.forEach(p => {
        oldParamMap[p.code] = p;
      });

      const newParamMap = {};
      newParams.forEach(p => {
        newParamMap[p.code] = p;
      });

      // Check for changed or removed parameters
      oldParams.forEach(oldParam => {
        const newParam = newParamMap[oldParam.code];
        if (!newParam) {
          // Parameter removed
          changes.parameterChanges.push({
            type: 'removed',
            code: oldParam.code,
            name: oldParam.name,
            oldValue: oldParam.fixedValue,
            newValue: null,
            unit: oldParam.unit
          });
        } else if (oldParam.fixedValue !== newParam.fixedValue) {
          // Parameter value changed
          changes.parameterChanges.push({
            type: 'changed',
            code: newParam.code,
            name: newParam.name,
            oldValue: oldParam.fixedValue,
            newValue: newParam.fixedValue,
            unit: newParam.unit || oldParam.unit
          });
        }
      });

      // Check for added parameters
      newParams.forEach(newParam => {
        if (!oldParamMap[newParam.code]) {
          changes.parameterChanges.push({
            type: 'added',
            code: newParam.code,
            name: newParam.name,
            oldValue: null,
            newValue: newParam.fixedValue,
            unit: newParam.unit
          });
        }
      });

      const hasChanges = changes.formulaChanged || changes.parameterChanges.length > 0;

      logger.success('Price settings compared', {
        oldSettingId,
        newSettingId,
        formulaChanged: changes.formulaChanged,
        parameterChangesCount: changes.parameterChanges.length
      });

      res.json({
        hasChanges,
        changes
      });
    } catch (error) {
      logger.error('Failed to compare price settings', { error: error.message });
      res.status(500).json({ error: 'Failed to compare price settings', message: error.message });
    }
  });

  // Delete price setting
  app.delete('/api/price-settings/:id', requireAuth, async (req, res) => {
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
