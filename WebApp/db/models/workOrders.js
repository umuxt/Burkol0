import db from '../connection.js';

/**
 * WorkOrders Model
 * Manages MES work orders created from approved quotes
 */

class WorkOrders {
  /**
   * Generate next work order code (WO-001, WO-002, etc.)
   */
  static async generateWorkOrderCode() {
    const trx = await db.transaction();
    
    try {
      // Get or create counter
      let counter = await trx('mes.counters')
        .where('id', 'work-orders')
        .first();
      
      if (!counter) {
        // Initialize counter
        await trx('mes.counters').insert({
          id: 'work-orders',
          prefix: 'WO',
          nextCounter: 1,
          codes: JSON.stringify([]),
          updatedAt: db.fn.now()
        });
        counter = { nextCounter: 1 };
      }
      
      const nextNum = counter.nextCounter || 1;
      const code = `WO-${String(nextNum).padStart(3, '0')}`;
      
      // Update counter
      await trx('mes.counters')
        .where('id', 'work-orders')
        .update({
          nextCounter: nextNum + 1,
          updatedAt: db.fn.now()
        });
      
      await trx.commit();
      return code;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Create work order from approved quote
   * UPDATED: Simplified data - only stores quoteId and customerId
   */
  static async createFromQuote(quoteId) {
    const code = await this.generateWorkOrderCode();
    
    // Get full quote data
    const Quotes = (await import('./quotes.js')).default;
    const quoteData = await Quotes.getById(quoteId);
    
    if (!quoteData) {
      throw new Error(`Quote ${quoteId} not found`);
    }
    
    const workOrder = {
      id: code,
      code: code,
      quoteId: quoteId,
      status: 'approved',
      productionState: 'pending',
      productionLaunched: false,
      productionStateUpdatedAt: db.fn.now(),
      productionStateHistory: JSON.stringify([{
        state: 'pending',
        timestamp: new Date().toISOString(),
        note: 'Work order created from approved quote'
      }]),
      // SIMPLIFIED DATA: Only store references, fetch details on demand
      data: JSON.stringify({
        quoteId: quoteId,
        customerId: quoteData.customerId || null
      }),
      createdAt: db.fn.now(),
      updatedAt: db.fn.now()
    };
    
    const [created] = await db('mes.work_orders')
      .insert(workOrder)
      .returning('*');
    
    console.log(`✅ Work Order created: ${code} for quote ${quoteId}`);
    return created;
  }

  /**
   * Get work order by code
   */
  static async getByCode(code) {
    return await db('mes.work_orders')
      .where('code', code)
      .first();
  }

  /**
   * Get work order by quote ID
   */
  static async getByQuoteId(quoteId) {
    return await db('mes.work_orders')
      .where('quoteId', quoteId)
      .first();
  }

  /**
   * List all work orders
   */
  static async list({ status, limit = 100, offset = 0 } = {}) {
    let query = db('mes.work_orders')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .offset(offset);
    
    if (status) {
      query = query.where('status', status);
    }
    
    return await query;
  }

  /**
   * Update work order status
   */
  static async updateStatus(code, status) {
    const [updated] = await db('mes.work_orders')
      .where('code', code)
      .update({
        status,
        updatedAt: db.fn.now()
      })
      .returning('*');
    
    return updated;
  }

  /**
   * Update production state with history tracking
   */
  static async updateProductionState(code, newState, updatedBy = null, note = '') {
    // Get current work order
    const workOrder = await this.getByCode(code);
    if (!workOrder) {
      throw new Error(`Work order ${code} not found`);
    }

    // Parse existing history
    let history = [];
    try {
      history = typeof workOrder.productionStateHistory === 'string' 
        ? JSON.parse(workOrder.productionStateHistory)
        : (workOrder.productionStateHistory || []);
    } catch (e) {
      console.error('Failed to parse productionStateHistory:', e);
      history = [];
    }

    // Add new history entry
    const historyEntry = {
      state: newState,
      timestamp: new Date().toISOString(),
      updatedBy: updatedBy || 'system',
      note: note || ''
    };
    history.push(historyEntry);

    // Update work order
    const [updated] = await db('mes.work_orders')
      .where('code', code)
      .update({
        productionState: newState,
        productionStateUpdatedAt: db.fn.now(),
        productionStateUpdatedBy: updatedBy,
        productionStateHistory: JSON.stringify(history),
        updatedAt: db.fn.now()
      })
      .returning('*');

    console.log(`✅ Production state updated: ${code} -> ${newState}`);
    return updated;
  }

  /**
   * Launch production for a work order
   * Sets productionLaunched flag to true - this locks the quote from editing
   */
  static async launchProduction(code, launchedBy = null) {
    const workOrder = await this.getByCode(code);
    if (!workOrder) {
      throw new Error(`Work order ${code} not found`);
    }

    // Update production state and set launched flag
    const [updated] = await db('mes.work_orders')
      .where('code', code)
      .update({
        productionLaunched: true,
        productionLaunchedAt: db.fn.now(),
        productionState: 'Üretiliyor',
        productionStateUpdatedAt: db.fn.now(),
        productionStateUpdatedBy: launchedBy,
        updatedAt: db.fn.now()
      })
      .returning('*');

    console.log(`🚀 Production launched for work order: ${code}`);
    return updated;
  }

  /**
   * Check if production has been launched for a quote's work order
   */
  static async isProductionLaunched(quoteId) {
    const workOrder = await this.getByQuoteId(quoteId);
    return workOrder?.productionLaunched === true;
  }

  /**
   * Get work order with full quote and customer data
   * Fetches related data instead of reading from JSON snapshot
   */
  static async getWithQuoteAndCustomer(code) {
    const workOrder = await this.getByCode(code);
    if (!workOrder) {
      return null;
    }

    // Import models
    const Quotes = (await import('./quotes.js')).default;
    const Customers = (await import('./customers.js')).default;

    // Get quote data
    const quote = await Quotes.getById(workOrder.quoteId);

    // Get customer data if exists
    let customer = null;
    if (quote?.customerId) {
      customer = await Customers.getById(quote.customerId);
    }

    return {
      workOrder,
      quote,
      customer,
      // Computed fields for backward compatibility
      customerName: customer?.name || quote?.customerName,
      customerCompany: customer?.company || quote?.customerCompany,
      customerEmail: customer?.email || quote?.customerEmail,
      customerPhone: customer?.phone || quote?.customerPhone,
      deliveryDate: quote?.deliveryDate,
      price: quote?.finalPrice || quote?.calculatedPrice,
      formData: quote?.formData || {}
    };
  }
}

export default WorkOrders;
