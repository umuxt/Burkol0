/**
 * Customer Service - Business Logic
 * 
 * Service layer for customer operations
 */

import Customers from '../../../../db/models/customers.js';

export const customerService = {
  /**
   * Get all customers with optional filters
   */
  async getCustomers(filters = {}) {
    return Customers.getAll(filters);
  },

  /**
   * Get single customer by ID
   */
  async getCustomerById(id) {
    return Customers.getById(id);
  },

  /**
   * Get customer with quote statistics
   */
  async getCustomerWithStats(id) {
    return Customers.getWithQuoteCount(id);
  },

  /**
   * Create new customer
   */
  async createCustomer(customerData) {
    // Validate required fields
    if (!customerData.name) {
      throw new Error('Customer name is required');
    }

    // Check if email already exists (optional - allow duplicates)
    if (customerData.email) {
      const existing = await Customers.getByEmail(customerData.email);
      if (existing) {
        console.warn(`Customer with email ${customerData.email} already exists`);
        // Not throwing error - allowing duplicate emails
      }
    }

    return Customers.create(customerData);
  },

  /**
   * Update customer
   */
  async updateCustomer(id, updates) {
    const customer = await Customers.getById(id);
    
    if (!customer) {
      throw new Error('Customer not found');
    }

    // Validate name if being updated
    if (updates.name !== undefined && !updates.name) {
      throw new Error('Customer name cannot be empty');
    }

    return Customers.update(id, updates);
  },

  /**
   * Delete customer (soft delete)
   */
  async deleteCustomer(id) {
    const customer = await Customers.getById(id);
    
    if (!customer) {
      throw new Error('Customer not found');
    }

    // Check if customer has quotes
    const customerWithStats = await Customers.getWithQuoteCount(id);
    if (customerWithStats.quoteCount > 0) {
      console.warn(`Customer ${id} has ${customerWithStats.quoteCount} quotes`);
      // Still allow deletion - just mark as inactive
    }

    return Customers.delete(id);
  },

  /**
   * Permanently delete customer
   */
  async permanentDeleteCustomer(id) {
    const customer = await Customers.getById(id);
    
    if (!customer) {
      throw new Error('Customer not found');
    }

    // Check if customer has quotes
    const customerWithStats = await Customers.getWithQuoteCount(id);
    if (customerWithStats.quoteCount > 0) {
      throw new Error(`Cannot permanently delete customer with ${customerWithStats.quoteCount} quotes`);
    }

    return Customers.permanentDelete(id);
  },

  /**
   * Search customers (for autocomplete)
   */
  async searchCustomers(searchTerm, limit = 10) {
    if (!searchTerm || searchTerm.length < 2) {
      return [];
    }

    return Customers.search(searchTerm, limit);
  }
};

export default customerService;
