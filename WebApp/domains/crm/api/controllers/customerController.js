/**
 * Customer Controller
 * 
 * API routes for customer management
 */

import customerService from '../services/customerService.js';
import { requireAuth } from '../../../../server/auth.js';
import logger from '../../utils/logger.js';

/**
 * Setup customer routes
 */
export function setupCustomerRoutes(app) {

  // ==================== GET ALL CUSTOMERS ====================
  app.get('/api/customers', requireAuth, async (req, res) => {
    try {
      logger.info('GET /api/customers - Fetching all customers');

      const filters = {
        search: req.query.search,
        company: req.query.company
      };

      const customers = await customerService.getCustomers(filters);

      logger.success(`Found ${customers.length} customers`);
      res.json(customers);
    } catch (error) {
      logger.error('Failed to fetch customers', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch customers', message: error.message });
    }
  });

  // ==================== SEARCH CUSTOMERS (AUTOCOMPLETE) ====================
  app.get('/api/customers/search', requireAuth, async (req, res) => {
    try {
      const { q, limit } = req.query;
      logger.info(`GET /api/customers/search - Searching for: ${q}`);

      const customers = await customerService.searchCustomers(q, parseInt(limit) || 10);

      logger.success(`Found ${customers.length} matching customers`);
      res.json(customers);
    } catch (error) {
      logger.error('Failed to search customers', { error: error.message });
      res.status(500).json({ error: 'Failed to search customers', message: error.message });
    }
  });

  // ==================== GET SINGLE CUSTOMER ====================
  app.get('/api/customers/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`GET /api/customers/${id} - Fetching customer details`);

      const customer = await customerService.getCustomerById(id);

      if (!customer) {
        logger.warning(`Customer not found: ${id}`);
        return res.status(404).json({ error: 'Customer not found' });
      }

      logger.success(`Customer fetched: ${id}`);
      res.json(customer);
    } catch (error) {
      logger.error('Failed to fetch customer', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch customer', message: error.message });
    }
  });

  // ==================== GET CUSTOMER WITH STATS ====================
  app.get('/api/customers/:id/stats', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`GET /api/customers/${id}/stats - Fetching customer with stats`);

      const customer = await customerService.getCustomerWithStats(id);

      if (!customer) {
        logger.warning(`Customer not found: ${id}`);
        return res.status(404).json({ error: 'Customer not found' });
      }

      logger.success(`Customer stats fetched: ${id}`);
      res.json(customer);
    } catch (error) {
      logger.error('Failed to fetch customer stats', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch customer stats', message: error.message });
    }
  });

  // ==================== CREATE CUSTOMER ====================
  app.post('/api/customers', requireAuth, async (req, res) => {
    try {
      const {
        name,
        email,
        phone,
        company,
        taxOffice,
        taxNumber,
        address,
        notes,
        // New fields for CRM flow
        website,
        fax,
        iban,
        bankName,
        contactPerson,
        contactTitle,
        country,
        city,
        district,
        neighbourhood,
        postalCode,
        isEInvoiceTaxpayer,
        gibPkLabel,
        defaultInvoiceScenario,
        isEDespatchTaxpayer
      } = req.body;

      logger.info('POST /api/customers - Creating new customer', { name, company });

      if (!name) {
        return res.status(400).json({
          error: 'Missing required field',
          details: ['name is required']
        });
      }

      const customer = await customerService.createCustomer({
        name,
        email,
        phone,
        company,
        taxOffice,
        taxNumber,
        address,
        notes,
        // New fields for CRM flow
        website,
        fax,
        iban,
        bankName,
        contactPerson,
        contactTitle,
        country,
        city,
        district,
        neighbourhood,
        postalCode,
        isEInvoiceTaxpayer,
        gibPkLabel,
        defaultInvoiceScenario,
        isEDespatchTaxpayer
      });

      logger.success(`Customer created: ${customer.id}`);
      res.status(201).json(customer);
    } catch (error) {
      logger.error('Failed to create customer', { error: error.message });
      res.status(500).json({ error: 'Failed to create customer', message: error.message });
    }
  });

  // ==================== UPDATE CUSTOMER ====================
  app.patch('/api/customers/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name,
        email,
        phone,
        company,
        taxOffice,
        taxNumber,
        address,
        notes,
        isActive,
        // New fields for CRM flow
        website,
        fax,
        iban,
        bankName,
        contactPerson,
        contactTitle,
        country,
        city,
        district,
        neighbourhood,
        postalCode
      } = req.body;

      logger.info(`PATCH /api/customers/${id} - Updating customer`);

      const updates = {};
      if (name !== undefined) updates.name = name;
      if (email !== undefined) updates.email = email;
      if (phone !== undefined) updates.phone = phone;
      if (company !== undefined) updates.company = company;
      if (taxOffice !== undefined) updates.taxOffice = taxOffice;
      if (taxNumber !== undefined) updates.taxNumber = taxNumber;
      if (address !== undefined) updates.address = address;
      if (notes !== undefined) updates.notes = notes;
      if (isActive !== undefined) updates.isActive = isActive;
      // New fields for CRM flow
      if (website !== undefined) updates.website = website;
      if (fax !== undefined) updates.fax = fax;
      if (iban !== undefined) updates.iban = iban;
      if (bankName !== undefined) updates.bankName = bankName;
      if (contactPerson !== undefined) updates.contactPerson = contactPerson;
      if (contactTitle !== undefined) updates.contactTitle = contactTitle;
      if (country !== undefined) updates.country = country;
      if (city !== undefined) updates.city = city;
      if (district !== undefined) updates.district = district;
      if (neighbourhood !== undefined) updates.neighbourhood = neighbourhood;
      if (postalCode !== undefined) updates.postalCode = postalCode;
      // e-Document fields
      if (req.body.isEInvoiceTaxpayer !== undefined) updates.isEInvoiceTaxpayer = req.body.isEInvoiceTaxpayer;
      if (req.body.gibPkLabel !== undefined) updates.gibPkLabel = req.body.gibPkLabel;
      if (req.body.gibDespatchPkLabel !== undefined) updates.gibDespatchPkLabel = req.body.gibDespatchPkLabel;
      if (req.body.defaultInvoiceScenario !== undefined) updates.defaultInvoiceScenario = req.body.defaultInvoiceScenario;
      if (req.body.isEDespatchTaxpayer !== undefined) updates.isEDespatchTaxpayer = req.body.isEDespatchTaxpayer;

      const customer = await customerService.updateCustomer(id, updates);

      if (!customer) {
        logger.warning(`Customer not found: ${id}`);
        return res.status(404).json({ error: 'Customer not found' });
      }

      logger.success(`Customer updated: ${id}`);
      res.json(customer);
    } catch (error) {
      logger.error('Failed to update customer', { error: error.message });
      res.status(500).json({ error: 'Failed to update customer', message: error.message });
    }
  });

  // ==================== DELETE CUSTOMER (SOFT) ====================
  app.delete('/api/customers/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`DELETE /api/customers/${id} - Soft deleting customer`);

      const customer = await customerService.deleteCustomer(id);

      if (!customer) {
        logger.warning(`Customer not found: ${id}`);
        return res.status(404).json({ error: 'Customer not found' });
      }

      logger.success(`Customer deleted: ${id}`);
      res.json({ success: true, message: 'Customer deleted', customer });
    } catch (error) {
      logger.error('Failed to delete customer', { error: error.message });
      res.status(500).json({ error: 'Failed to delete customer', message: error.message });
    }
  });

  // ==================== PERMANENT DELETE CUSTOMER ====================
  app.delete('/api/customers/:id/permanent', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      logger.info(`DELETE /api/customers/${id}/permanent - Permanently deleting customer`);

      await customerService.permanentDeleteCustomer(id);

      logger.success(`Customer permanently deleted: ${id}`);
      res.json({ success: true, message: 'Customer permanently deleted' });
    } catch (error) {
      logger.error('Failed to permanently delete customer', { error: error.message });

      if (error.message.includes('Cannot permanently delete')) {
        return res.status(400).json({ error: error.message });
      }

      res.status(500).json({ error: 'Failed to permanently delete customer', message: error.message });
    }
  });
}

export default setupCustomerRoutes;
