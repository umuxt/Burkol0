import db from '../connection.js';
import PriceFormulas from './priceFormulas.js';
import WorkOrders from './workOrders.js';

/**
 * Quotes Model
 * Main model for managing quotes with form data, pricing, and files
 */

class Quotes {
  /**
   * Generate quote ID (TKF-YYYYMMDD-NNNN)
   */
  static async generateQuoteId() {
    const today = new Date();
    const dateKey = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    
    // Get count of quotes created today
    const count = await db('quotes.quotes')
      .where('id', 'like', `TKF-${dateKey}-%`)
      .count('* as count');
    
    const nextNumber = (parseInt(count[0].count) || 0) + 1;
    return `TKF-${dateKey}-${String(nextNumber).padStart(4, '0')}`;
  }

  /**
   * Create a new quote
   */
  static async create({ customerName, customerEmail, customerPhone, customerCompany, customerAddress, deliveryDate, formTemplateId, priceFormulaId, notes, formData, createdBy }) {
    const trx = await db.transaction();
    
    try {
      const quoteId = await this.generateQuoteId();

      // Get current versions to snapshot
      let formTemplateVersion = null;
      let priceFormulaVersion = null;

      if (formTemplateId) {
        const template = await trx('quotes.form_templates')
          .where('id', formTemplateId)
          .first();
        formTemplateVersion = template?.version || null;
      }

      if (priceFormulaId) {
        const formula = await trx('quotes.price_formulas')
          .where('id', priceFormulaId)
          .first();
        priceFormulaVersion = formula?.version || null;
      }

      // Create quote
      const [quote] = await trx('quotes.quotes')
        .insert({
          id: quoteId,
          customerName: customerName,
          customerEmail: customerEmail,
          customerPhone: customerPhone,
          customerCompany: customerCompany,
          customerAddress: customerAddress,
          deliveryDate: deliveryDate,
          formTemplateId: formTemplateId,
          priceFormulaId: priceFormulaId,
          formTemplateVersion: formTemplateVersion,
          priceFormulaVersion: priceFormulaVersion,
          status: 'new',
          notes,
          createdBy: createdBy,
          createdAt: db.fn.now(),
          updatedAt: db.fn.now()
        })
        .returning('*');

      // Save form data if provided
      if (formData && Object.keys(formData).length > 0) {
        await this._saveFormData(trx, quoteId, formData);
      }

      // Calculate price if formula is provided
      if (priceFormulaId && formData) {
        const calculation = await PriceFormulas.calculatePrice(priceFormulaId, formData);
        
        // Update quote with calculated price
        await trx('quotes.quotes')
          .where('id', quoteId)
          .update({
            calculatedPrice: calculation.totalPrice,
            finalPrice: calculation.totalPrice,
            lastCalculatedAt: db.fn.now(),
            needsRecalculation: false,
            priceStatus: 'current'
          });
      }

      await trx.commit();
      
      // Return full quote with related data
      return await this.getById(quoteId);
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Internal: Save form data
   */
  static async _saveFormData(trx, quoteId, formData) {
    // Get form fields for this quote's template
    const quote = await trx('quotes.quotes')
      .where('id', quoteId)
      .first();

    const fields = await trx('quotes.form_fields')
      .where('templateId', quote.formTemplateId)
      .select('id', 'fieldCode');

    const formDataEntries = Object.entries(formData).map(([fieldCode, value]) => {
      const field = fields.find(f => f.fieldCode === fieldCode);
      if (!field) {
        return null;
      }
      return {
        quoteId: quoteId,
        fieldId: field.id,
        fieldCode: fieldCode,
        fieldValue: String(value),
        createdAt: db.fn.now(),
        updatedAt: db.fn.now()
      };
    }).filter(Boolean);

    if (formDataEntries.length > 0) {
      await trx('quotes.quote_form_data').insert(formDataEntries);
    }
  }

  /**
   * Internal: Save price calculation details
   * Note: quote_price_details table removed in redesign
   * Calculation details are not stored in DB anymore
   */
  static async _savePriceDetails(trx, quoteId, calculationDetails) {
    // No-op: We don't store calculation details anymore
    // The final calculated_price is stored in quotes table
    // If detailed breakdown is needed, it can be recalculated from form data
  }

  /**
   * Get all quotes
   */
  static async getAll(filters = {}) {
    let query = db('quotes.quotes');

    if (filters.status) {
      query = query.where('status', filters.status);
    }

    if (filters.customerEmail) {
      query = query.where('customerEmail', filters.customerEmail);
    }

    if (filters.customerCompany) {
      query = query.whereILike('customerCompany', `%${filters.customerCompany}%`);
    }

    if (filters.fromDate) {
      query = query.where('createdAt', '>=', filters.fromDate);
    }

    if (filters.toDate) {
      query = query.where('createdAt', '<=', filters.toDate);
    }

    const quotes = await query.orderBy('createdAt', 'desc');
    return quotes;
  }

  /**
   * Get quote by ID with all related data
   */
  static async getById(id) {
    const quote = await db('quotes.quotes')
      .where('id', id)
      .first();
    
    if (!quote) {
      return null;
    }

    // Get form data
    const formData = await db('quotes.quote_form_data')
      .where('quoteId', id)
      .select('fieldCode', 'fieldValue');
    
    const formDataObj = {};
    formData.forEach(item => {
      formDataObj[item.fieldCode] = item.fieldValue;
    });

    // Get price calculation details
    // Note: quote_price_details table removed - details not stored in DB anymore
    const priceDetails = [];

    // Get files
    const files = await db('quotes.quote_files')
      .where('quoteId', id)
      .orderBy('createdAt');

    return {
      ...quote,
      formData: formDataObj,
      priceDetails,
      files
    };
  }

  /**
   * Update quote
   */
  static async update(id, updates) {
    const trx = await db.transaction();
    
    try {
      const updateData = {};
      
      // Update basic fields
      if (updates.customerName) updateData.customerName = updates.customerName;
      if (updates.customerEmail) updateData.customerEmail = updates.customerEmail;
      if (updates.customerPhone) updateData.customerPhone = updates.customerPhone;
      if (updates.customerCompany) updateData.customerCompany = updates.customerCompany;
      if (updates.customerAddress) updateData.customerAddress = updates.customerAddress;
      if (updates.deliveryDate !== undefined) updateData.deliveryDate = updates.deliveryDate;
      if (updates.notes !== undefined) updateData.notes = updates.notes;
      if (updates.updatedBy) updateData.updatedBy = updates.updatedBy;
      
      updateData.updatedAt = db.fn.now();

      const [quote] = await trx('quotes.quotes')
        .where('id', id)
        .update(updateData)
        .returning('*');

      // Update form data if provided
      if (updates.formData) {
        // Delete old form data
        await trx('quotes.quote_form_data')
          .where('quoteId', id)
          .delete();
        
        // Insert new form data
        await this._saveFormData(trx, id, updates.formData);

        // Recalculate price if formula exists
        if (quote.priceFormulaId) {
          const calculation = await PriceFormulas.calculatePrice(quote.priceFormulaId, updates.formData);
          
          await trx('quotes.quotes')
            .where('id', id)
            .update({
              calculatedPrice: calculation.totalPrice,
              finalPrice: quote.manualPrice || calculation.totalPrice,
              lastCalculatedAt: db.fn.now(),
              needsRecalculation: false,
              priceStatus: quote.manualPrice ? 'manual' : 'current'
            });

          // Note: quote_price_details table removed - details not stored anymore
        } else {
          // Mark as needing recalculation if no formula
          await trx('quotes.quotes')
            .where('id', id)
            .update({
              needsRecalculation: true
            });
        }
      }

      await trx.commit();
      
      return await this.getById(id);
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Update quote status
   */
  static async updateStatus(id, status, updatedBy) {
    const updateData = {
      status,
      updatedBy: updatedBy,
      updatedAt: db.fn.now()
    };

    if (status === 'approved') {
      updateData.approvedAt = db.fn.now();
      updateData.approvedBy = updatedBy;
    }

    const [quote] = await db('quotes.quotes')
      .where('id', id)
      .update(updateData)
      .returning('*');
    
    // Create MES work order when quote approved
    if (status === 'approved' && quote) {
      try {
        console.log(`🔍 Quote ${id} approved, creating MES work order...`);
        
        // Get full quote data including form data for work order creation
        const fullQuote = await this.getById(id);
        
        const workOrder = await WorkOrders.createFromQuote(id, fullQuote);
        console.log(`✅ Work order ${workOrder.code} created for quote ${id}`);
        
        // Store WO code in quote for reference
        await db('quotes.quotes')
          .where('id', id)
          .update({
            workOrderCode: workOrder.code,
            updatedAt: db.fn.now()
          });
      } catch (error) {
        console.error(`❌ Failed to create work order for quote ${id}:`, error);
        // Don't fail the quote approval, just log the error
      }
    }
    
    return quote;
  }

  /**
   * Set manual price
   */
  static async setManualPrice(id, manualPrice, reason, updatedBy) {
    const [quote] = await db('quotes.quotes')
      .where('id', id)
      .update({
        manualPrice: manualPrice,
        manualPriceReason: reason,
        finalPrice: manualPrice,
        priceStatus: 'manual',
        updatedBy: updatedBy,
        updatedAt: db.fn.now()
      })
      .returning('*');
    
    return quote;
  }

  /**
   * Add file to quote
   */
  static async addFile({ quoteId, fileType, fileName, filePath, mimeType, fileSize, description, uploadedBy }) {
    const [file] = await db('quotes.quote_files')
      .insert({
        quoteId: quoteId,
        fileType: fileType,
        fileName: fileName,
        filePath: filePath,
        mimeType: mimeType,
        fileSize: fileSize,
        description,
        uploadedBy: uploadedBy,
        createdAt: db.fn.now(),
        updatedAt: db.fn.now()
      })
      .returning('*');
    
    return file;
  }

  /**
   * Delete file from quote
   */
  static async deleteFile(fileId) {
    const count = await db('quotes.quote_files')
      .where('id', fileId)
      .delete();
    
    return count > 0;
  }

  /**
   * Delete quote
   */
  static async delete(id) {
    const count = await db('quotes.quotes')
      .where('id', id)
      .delete();
    
    return count > 0;
  }

  /**
   * Get quotes summary statistics
   */
  static async getStatistics(filters = {}) {
    let query = db('quotes.quotes');

    if (filters.fromDate) {
      query = query.where('createdAt', '>=', filters.fromDate);
    }

    if (filters.toDate) {
      query = query.where('createdAt', '<=', filters.toDate);
    }

    const stats = await query
      .select(
        db.raw('COUNT(*) as "totalQuotes"'),
        db.raw("COUNT(*) FILTER (WHERE status = 'new') as \"newQuotes\""),
        db.raw("COUNT(*) FILTER (WHERE status = 'pending') as \"pendingQuotes\""),
        db.raw("COUNT(*) FILTER (WHERE status = 'approved') as \"approvedQuotes\""),
        db.raw("COUNT(*) FILTER (WHERE status = 'rejected') as \"rejectedQuotes\""),
        db.raw('SUM("finalPrice") as "totalValue"'),
        db.raw("SUM(\\\"finalPrice\\\") FILTER (WHERE status = 'approved') as \"approvedValue\"")
      )
      .first();

    return stats;
  }

  /**
   * Mark quotes for recalculation when template/formula changes
   */
  static async markForRecalculation(criteria) {
    let query = db('quotes.quotes');

    if (criteria.formTemplateId) {
      query = query.where('formTemplateId', criteria.formTemplateId);
    }

    if (criteria.priceFormulaId) {
      query = query.where('priceFormulaId', criteria.priceFormulaId);
    }

    const count = await query.update({
      needsRecalculation: true,
      updatedAt: db.fn.now()
    });

    return count;
  }

  /**
   * Get quotes that need recalculation
   */
  static async getNeedingRecalculation() {
    const quotes = await db('quotes.quotes')
      .where('needsRecalculation', true)
      .whereNotIn('status', ['cancelled', 'rejected'])
      .orderBy('createdAt', 'desc');
    
    return quotes;
  }

  /**
   * Recalculate a quote's price
   */
  static async recalculate(id) {
    const trx = await db.transaction();
    
    try {
      const quote = await trx('quotes.quotes').where('id', id).first();
      
      if (!quote || !quote.priceFormulaId) {
        throw new Error('Quote not found or has no formula');
      }

      // Get form data
      const formDataRows = await trx('quotes.quote_form_data')
        .where('quoteId', id);
      
      const formData = {};
      formDataRows.forEach(row => {
        formData[row.fieldCode] = row.fieldValue;
      });

      // Calculate price
      const calculation = await PriceFormulas.calculatePrice(quote.priceFormulaId, formData);
      
      // Update quote
      await trx('quotes.quotes')
        .where('id', id)
        .update({
          calculatedPrice: calculation.totalPrice,
          finalPrice: quote.manualPrice || calculation.totalPrice,
          lastCalculatedAt: db.fn.now(),
          needsRecalculation: false,
          priceStatus: quote.manualPrice ? 'manual' : 'current',
          updatedAt: db.fn.now()
        });

      await trx.commit();
      return await this.getById(id);
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }
}

export default Quotes;
