/**
 * Customers Model - PostgreSQL
 * 
 * Database operations for CRM customers
 */

import db from '../connection.js';

const TABLE = 'quotes.customers';

const Customers = {
  /**
   * Get all customers
   */
  async getAll(filters = {}) {
    let query = db(TABLE).where({ isActive: true });

    // Apply filters
    if (filters.search) {
      const searchTerm = `%${filters.search}%`;
      query = query.where(function() {
        this.where('name', 'ilike', searchTerm)
          .orWhere('email', 'ilike', searchTerm)
          .orWhere('phone', 'ilike', searchTerm)
          .orWhere('company', 'ilike', searchTerm);
      });
    }

    if (filters.company) {
      query = query.where('company', 'ilike', `%${filters.company}%`);
    }

    return query.orderBy('createdAt', 'desc');
  },

  /**
   * Get customer by ID
   */
  async getById(id) {
    return db(TABLE).where({ id }).first();
  },

  /**
   * Get customer by email
   */
  async getByEmail(email) {
    return db(TABLE).where({ email, isActive: true }).first();
  },

  /**
   * Create new customer
   */
  async create(customerData) {
    const {
      name,
      email,
      phone,
      company,
      taxOffice,
      taxNumber,
      address,
      notes
    } = customerData;

    const [customer] = await db(TABLE)
      .insert({
        name,
        email: email || null,
        phone: phone || null,
        company: company || null,
        taxOffice: taxOffice || null,
        taxNumber: taxNumber || null,
        address: address || null,
        notes: notes || null,
        isActive: true,
        createdAt: db.fn.now(),
        updatedAt: db.fn.now()
      })
      .returning('*');

    return customer;
  },

  /**
   * Update customer
   */
  async update(id, updates) {
    const allowedFields = [
      'name',
      'email',
      'phone',
      'company',
      'taxOffice',
      'taxNumber',
      'address',
      'notes',
      'isActive'
    ];

    const updateData = {};
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    });

    updateData.updatedAt = db.fn.now();

    const [customer] = await db(TABLE)
      .where({ id })
      .update(updateData)
      .returning('*');

    return customer;
  },

  /**
   * Soft delete customer
   */
  async delete(id) {
    const [customer] = await db(TABLE)
      .where({ id })
      .update({
        isActive: false,
        updatedAt: db.fn.now()
      })
      .returning('*');

    return customer;
  },

  /**
   * Permanently delete customer
   */
  async permanentDelete(id) {
    return db(TABLE).where({ id }).del();
  },

  /**
   * Get customer with quote count
   */
  async getWithQuoteCount(id) {
    const customer = await db(TABLE).where({ id }).first();
    
    if (!customer) return null;

    const [{ count }] = await db('quotes.quotes')
      .where({ customerId: id })
      .count('* as count');

    return {
      ...customer,
      quoteCount: parseInt(count)
    };
  },

  /**
   * Search customers for autocomplete
   */
  async search(searchTerm, limit = 10) {
    const term = `%${searchTerm}%`;
    
    return db(TABLE)
      .where({ isActive: true })
      .where(function() {
        this.where('name', 'ilike', term)
          .orWhere('email', 'ilike', term)
          .orWhere('company', 'ilike', term)
          .orWhere('phone', 'ilike', term);
      })
      .limit(limit)
      .orderBy('name', 'asc');
  }
};

export default Customers;
