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
          next_counter: 1,
          codes: JSON.stringify([]),
          updated_at: db.fn.now()
        });
        counter = { next_counter: 1 };
      }
      
      const nextNum = counter.next_counter || 1;
      const code = `WO-${String(nextNum).padStart(3, '0')}`;
      
      // Update counter
      await trx('mes.counters')
        .where('id', 'work-orders')
        .update({
          next_counter: nextNum + 1,
          updated_at: db.fn.now()
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
      quote_id: quoteId,
      status: 'approved',
      production_state: 'pending',
      production_state_updated_at: db.fn.now(),
      production_state_history: JSON.stringify([{
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
        formData: quoteData.formData || {},  // Form field values for production specs
        quoteSnapshot: quoteData  // Complete quote backup
      }),
      created_at: db.fn.now(),
      updated_at: db.fn.now()
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
      .where('quote_id', quoteId)
      .first();
  }

  /**
   * List all work orders
   */
  static async list({ status, limit = 100, offset = 0 } = {}) {
    let query = db('mes.work_orders')
      .orderBy('created_at', 'desc')
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
        updated_at: db.fn.now()
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
      history = typeof workOrder.production_state_history === 'string' 
        ? JSON.parse(workOrder.production_state_history)
        : (workOrder.production_state_history || []);
    } catch (e) {
      console.error('Failed to parse production_state_history:', e);
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
        production_state: newState,
        production_state_updated_at: db.fn.now(),
        production_state_updated_by: updatedBy,
        production_state_history: JSON.stringify(history),
        updated_at: db.fn.now()
      })
      .returning('*');

    console.log(`✅ Production state updated: ${code} -> ${newState}`);
    return updated;
  }
}

export default WorkOrders;
