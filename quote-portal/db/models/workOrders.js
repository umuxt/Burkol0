import db from '../db.js';

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
   */
  static async createFromQuote(quoteId) {
    const code = await this.generateWorkOrderCode();
    
    // Get full quote data
    const Quotes = (await import('./quotes.js')).default;
    const quoteData = await Quotes.getById(quoteId);
    
    if (!quoteData) {
      throw new Error(`Quote ${quoteId} not found`);
    }
    
    // Format delivery date for JSON storage
    let deliveryDate = null;
    if (quoteData.delivery_date) {
      deliveryDate = new Date(quoteData.delivery_date).toISOString();
    } else if (quoteData.deliveryDate) {
      deliveryDate = new Date(quoteData.deliveryDate).toISOString();
    }
    
    const workOrder = {
      id: code,
      code: code,
      quoteId: quoteId,
      status: 'approved',
      productionState: 'pending',
      productionStateUpdatedAt: db.fn.now(),
      productionStateHistory: JSON.stringify([{
        state: 'pending',
        timestamp: new Date().toISOString(),
        note: 'Work order created from approved quote'
      }]),
      data: JSON.stringify({
        customer: quoteData.customer_name || quoteData.name,
        company: quoteData.customer_company || quoteData.company,
        email: quoteData.customer_email || quoteData.email,
        phone: quoteData.customer_phone || quoteData.phone,
        deliveryDate,
        price: quoteData.final_price ?? quoteData.price ?? quoteData.calculatedPrice,
        formData: quoteData.formData || {},
        quoteSnapshot: quoteData
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
}

export default WorkOrders;
