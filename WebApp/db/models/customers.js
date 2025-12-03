/**
 * Customers Model - PostgreSQL
 * 
 * Database operations for CRM customers
 */

import db from '../connection.js';

const TABLE = 'quotes.customers';

const Customers = {
  /**
   * Get all customers with quote count
   */
  async getAll(filters = {}) {
    let query = db(TABLE)
      .select(
        `${TABLE}.*`,
        db.raw('COALESCE(quote_counts.count, 0)::integer as "quoteCount"')
      )
      .leftJoin(
        db('quotes.quotes')
          .select('customerId')
          .count('* as count')
          .groupBy('customerId')
          .as('quote_counts'),
        `${TABLE}.id`,
        'quote_counts.customerId'
      )
      .where({ [`${TABLE}.isActive`]: true });

    // Apply filters
    if (filters.search) {
      const searchTerm = `%${filters.search}%`;
      query = query.where(function() {
        this.where(`${TABLE}.name`, 'ilike', searchTerm)
          .orWhere(`${TABLE}.email`, 'ilike', searchTerm)
          .orWhere(`${TABLE}.phone`, 'ilike', searchTerm)
          .orWhere(`${TABLE}.company`, 'ilike', searchTerm);
      });
    }

    if (filters.company) {
      query = query.where(`${TABLE}.company`, 'ilike', `%${filters.company}%`);
    }

    return query.orderBy(`${TABLE}.createdAt`, 'desc');
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
      notes,
      // New fields
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
        // New fields
        website: website || null,
        fax: fax || null,
        iban: iban || null,
        bankName: bankName || null,
        contactPerson: contactPerson || null,
        contactTitle: contactTitle || null,
        country: country || 'Türkiye',
        city: city || null,
        district: district || null,
        neighbourhood: neighbourhood || null,
        postalCode: postalCode || null,
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
      'isActive',
      // New fields
      'website',
      'fax',
      'iban',
      'bankName',
      'contactPerson',
      'contactTitle',
      'country',
      'city',
      'district',
      'neighbourhood',
      'postalCode'
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
