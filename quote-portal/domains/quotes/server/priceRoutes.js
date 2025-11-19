/**
 * Price Parameters & Formulas Routes - PostgreSQL
 * 
 * API routes for managing price parameters and formulas
 */

import PriceParameters from '../../../db/models/priceParameters.js';
import PriceFormulas from '../../../db/models/priceFormulas.js';
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
      
      const withLookups = req.query.withLookups === 'true';
      
      if (withLookups) {
        const parameters = await PriceParameters.getAll();
        const parametersWithLookups = await Promise.all(
          parameters.map(async (param) => {
            const lookups = await PriceParameters.getLookups(param.id);
            return { ...param, lookups };
          })
        );
        logger.success(`Found ${parametersWithLookups.length} parameters with lookups`);
        return res.json(parametersWithLookups);
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
  app.get('/api/price-parameters/:id/with-lookups', async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`GET /api/price-parameters/${id}/with-lookups`);
      
      const parameter = await PriceParameters.getWithLookups(id);
      
      if (!parameter) {
        logger.warning(`Parameter not found: ${id}`);
        return res.status(404).json({ error: 'Parameter not found' });
      }

      logger.success(`Parameter fetched with ${parameter.lookups?.length || 0} lookups`);
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
      const { code, name, type, fixedValue, unit, description, lookups } = req.body;
      
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
        unit
      };

      if (type === 'fixed') {
        if (fixedValue === undefined) {
          return res.status(400).json({ 
            error: 'Missing required field', 
            details: ['fixedValue is required for fixed type parameters'] 
          });
        }
        paramData.fixed_value = fixedValue;
      }

      const parameter = await PriceParameters.create(paramData);

      // Add lookups if provided
      if (lookups && lookups.length > 0) {
        await PriceParameters.bulkCreateLookups(parameter.id, lookups.map(lookup => ({
          form_field_code: lookup.formFieldCode,
          option_value: lookup.optionValue,
          price_value: lookup.priceValue,
          valid_from: lookup.validFrom,
          valid_to: lookup.validTo
        })));
        
        logger.success(`Parameter created with ${lookups.length} lookups: ${parameter.id}`);
      } else {
        logger.success(`Parameter created: ${parameter.id}`);
      }

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
      const { code, name, type, fixedValue, unit, description } = req.body;
      
      logger.info(`PATCH /api/price-parameters/${id}`);

      const updates = {};
      if (code !== undefined) updates.code = code;
      if (name !== undefined) updates.name = name;
      if (type !== undefined) updates.type = type;
      if (fixedValue !== undefined) updates.fixed_value = fixedValue;
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

  // ==================== PARAMETER LOOKUPS ====================

  // Get parameter lookups
  app.get('/api/price-parameters/:parameterId/lookups', async (req, res) => {
    try {
      const { parameterId } = req.params;
      logger.info(`GET /api/price-parameters/${parameterId}/lookups`);
      
      const lookups = await PriceParameters.getLookups(parameterId);
      
      logger.success(`Found ${lookups.length} lookups`);
      res.json(lookups);
    } catch (error) {
      logger.error('Failed to fetch lookups', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch lookups', message: error.message });
    }
  });

  // Add parameter lookup
  app.post('/api/price-parameters/:parameterId/lookups', async (req, res) => {
    try {
      const { parameterId } = req.params;
      const { formFieldCode, optionValue, priceValue, validFrom, validTo } = req.body;

      logger.info(`POST /api/price-parameters/${parameterId}/lookups`);

      if (!formFieldCode || !optionValue || priceValue === undefined) {
        return res.status(400).json({ 
          error: 'Missing required fields', 
          details: ['formFieldCode, optionValue, and priceValue are required'] 
        });
      }

      const lookup = await PriceParameters.addLookup(parameterId, {
        form_field_code: formFieldCode,
        option_value: optionValue,
        price_value: priceValue,
        valid_from: validFrom,
        valid_to: validTo
      });

      logger.success(`Lookup added: ${lookup.id}`);
      res.status(201).json(lookup);
    } catch (error) {
      logger.error('Failed to add lookup', { error: error.message });
      res.status(500).json({ error: 'Failed to add lookup', message: error.message });
    }
  });

  // Update parameter lookup
  app.patch('/api/price-parameters/:parameterId/lookups/:lookupId', async (req, res) => {
    try {
      const { lookupId } = req.params;
      const { formFieldCode, optionValue, priceValue, validFrom, validTo } = req.body;

      logger.info(`PATCH /api/price-parameters/lookups/${lookupId}`);

      const updates = {};
      if (formFieldCode !== undefined) updates.form_field_code = formFieldCode;
      if (optionValue !== undefined) updates.option_value = optionValue;
      if (priceValue !== undefined) updates.price_value = priceValue;
      if (validFrom !== undefined) updates.valid_from = validFrom;
      if (validTo !== undefined) updates.valid_to = validTo;

      const lookup = await PriceParameters.updateLookup(lookupId, updates);
      
      if (!lookup) {
        logger.warning(`Lookup not found: ${lookupId}`);
        return res.status(404).json({ error: 'Lookup not found' });
      }

      logger.success(`Lookup updated: ${lookupId}`);
      res.json(lookup);
    } catch (error) {
      logger.error('Failed to update lookup', { error: error.message });
      res.status(500).json({ error: 'Failed to update lookup', message: error.message });
    }
  });

  // Delete parameter lookup
  app.delete('/api/price-parameters/:parameterId/lookups/:lookupId', async (req, res) => {
    try {
      const { lookupId } = req.params;
      logger.info(`DELETE /api/price-parameters/lookups/${lookupId}`);

      const success = await PriceParameters.deleteLookup(lookupId);
      
      if (!success) {
        logger.warning(`Lookup not found: ${lookupId}`);
        return res.status(404).json({ error: 'Lookup not found' });
      }

      logger.success(`Lookup deleted: ${lookupId}`);
      res.json({ success: true, message: 'Lookup deleted' });
    } catch (error) {
      logger.error('Failed to delete lookup', { error: error.message });
      res.status(500).json({ error: 'Failed to delete lookup', message: error.message });
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
          formula_expression: formulaExpression,
          description,
          version: version || '1.0',
          is_active: isActive !== undefined ? isActive : false
        }, parameters);

        logger.success(`Formula created with ${parameters.length} parameters: ${formula.id}`);
        return res.status(201).json(formula);
      }

      const formula = await PriceFormulas.create({
        code,
        name,
        formula_expression: formulaExpression,
        description,
        version: version || '1.0',
        is_active: isActive !== undefined ? isActive : false
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
      if (formulaExpression !== undefined) updates.formula_expression = formulaExpression;
      if (description !== undefined) updates.description = description;
      if (version !== undefined) updates.version = version;
      if (isActive !== undefined) updates.is_active = isActive;

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
}

export default setupPriceRoutes;
