import db from '../connection.js';
import WorkOrders from './workOrders.js';
import PriceSettings from '../../domains/crm/api/services/priceSettingsService.js';

/**
 * Quotes Model
 * Main model for managing quotes with form data, pricing, and files
 */

class Quotes {
  /**
   * Helper to normalize deliveryDate to YYYY-MM-DD string format
   * Prevents timezone issues when date is stored as DATE type in PostgreSQL
   */
  static normalizeDeliveryDate(quote) {
    if (quote && quote.deliveryDate) {
      // If it's a Date object, convert to YYYY-MM-DD string
      if (quote.deliveryDate instanceof Date) {
        const year = quote.deliveryDate.getFullYear();
        const month = String(quote.deliveryDate.getMonth() + 1).padStart(2, '0');
        const day = String(quote.deliveryDate.getDate()).padStart(2, '0');
        quote.deliveryDate = `${year}-${month}-${day}`;
      } else if (typeof quote.deliveryDate === 'string' && quote.deliveryDate.includes('T')) {
        // If it's an ISO string, extract just the date part
        quote.deliveryDate = quote.deliveryDate.split('T')[0];
      }
    }
    return quote;
  }

  /**
   * Helper - priceStatus column removed in B0.2
   * This is a no-op now, kept for backward compatibility
   */
  static normalizePriceStatus(quote) {
    // priceStatus column removed - no normalization needed
    return quote;
  }

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
   * Updated for B0.2: uses priceSettingId instead of priceFormulaId
   */
  static async create({ customerName, customerEmail, customerPhone, customerCompany, customerAddress, deliveryDate, formTemplateId, priceSettingId, notes, formData, createdBy, isCustomer, customerId }) {
    const trx = await db.transaction();
    
    try {
      const quoteId = await this.generateQuoteId();

      // Get form template code for version tracking
      let formTemplateCode = null;
      if (formTemplateId) {
        const template = await trx('quotes.form_templates')
          .where('id', formTemplateId)
          .first();
        formTemplateCode = template?.code || null;
      }

      // Get price setting code for version tracking
      let priceSettingCode = null;
      if (priceSettingId) {
        const setting = await trx('quotes.price_settings')
          .where('id', priceSettingId)
          .first();
        priceSettingCode = setting?.code || null;
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
          formTemplateCode: formTemplateCode,
          priceSettingId: priceSettingId,
          priceSettingCode: priceSettingCode,
          status: 'new',
          notes,
          createdBy: createdBy,
          isCustomer: isCustomer || false,
          customerId: customerId || null,
          createdAt: db.fn.now(),
          updatedAt: db.fn.now()
        })
        .returning('*');

      // Save form data if provided
      if (formData && Object.keys(formData).length > 0) {
        await this._saveFormData(trx, quoteId, formData);
      }

      // Calculate price if setting is provided
      if (priceSettingId && formData) {
        const calculation = await PriceSettings.calculatePrice(priceSettingId, formData);
        
        // Update quote with calculated price
        await trx('quotes.quotes')
          .where('id', quoteId)
          .update({
            calculatedPrice: calculation.totalPrice,
            finalPrice: calculation.totalPrice,
            lastCalculatedAt: db.fn.now()
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
    
    // Normalize deliveryDate and priceStatus for all quotes
    quotes.forEach(quote => {
      this.normalizeDeliveryDate(quote);
      this.normalizePriceStatus(quote);
    });
    
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

    // Get files and separate by type
    const allFiles = await db('quotes.quote_files')
      .where('quoteId', id)
      .orderBy('createdAt');
    
    // Separate files by type
    const technicalFiles = allFiles.filter(f => f.fileType === 'technical' || f.fileType === 'tech');
    const productImages = allFiles.filter(f => f.fileType === 'product' || f.fileType === 'image');
    // Files without specific type go to technical files
    const otherFiles = allFiles.filter(f => !f.fileType || (f.fileType !== 'technical' && f.fileType !== 'tech' && f.fileType !== 'product' && f.fileType !== 'image'));

    // SYNC-FIX: Get full customer data if customerId exists
    let customer = null;
    if (quote.customerId) {
      customer = await db('quotes.customers')
        .where('id', quote.customerId)
        .first();
    }

    // Normalize deliveryDate and priceStatus
    this.normalizeDeliveryDate(quote);
    this.normalizePriceStatus(quote);

    return {
      ...quote,
      formData: formDataObj,
      priceDetails,
      files: [...technicalFiles, ...otherFiles], // Backward compatible - all tech files
      technicalFiles: [...technicalFiles, ...otherFiles],
      productImages: productImages,
      customer: customer // SYNC-FIX: Include full customer data for QuoteDetailsPanel
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
      if (updates.isCustomer !== undefined) updateData.isCustomer = updates.isCustomer;
      if (updates.customerId !== undefined) updateData.customerId = updates.customerId;
      
      // C2: Update form template fields
      if (updates.formTemplateId !== undefined) updateData.formTemplateId = updates.formTemplateId;
      if (updates.formTemplateCode !== undefined) updateData.formTemplateCode = updates.formTemplateCode;
      
      // C2: Update price setting fields
      if (updates.priceSettingId !== undefined) updateData.priceSettingId = updates.priceSettingId;
      if (updates.priceSettingCode !== undefined) updateData.priceSettingCode = updates.priceSettingCode;
      
      // C2: Update price fields
      if (updates.calculatedPrice !== undefined) updateData.calculatedPrice = updates.calculatedPrice;
      if (updates.finalPrice !== undefined) updateData.finalPrice = updates.finalPrice;
      if (updates.lastCalculatedAt !== undefined) updateData.lastCalculatedAt = updates.lastCalculatedAt;
      
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

        // C2: Only recalculate price if calculatedPrice was NOT provided in updates
        // (means caller wants auto-calculation, not manual override)
        if (updates.calculatedPrice === undefined && quote.priceSettingId) {
          const calculation = await PriceSettings.calculatePrice(quote.priceSettingId, updates.formData);
          
          await trx('quotes.quotes')
            .where('id', id)
            .update({
              calculatedPrice: calculation.totalPrice,
              finalPrice: quote.manualPrice || calculation.totalPrice,
              lastCalculatedAt: db.fn.now()
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
    // PROMPT-13: Validate deliveryDate before approval
    if (status === 'approved') {
      const quote = await db('quotes.quotes').where('id', id).first();
      if (!quote) {
        throw new Error('Teklif bulunamadı');
      }
      if (!quote.deliveryDate) {
        const error = new Error('Teslimat tarihi olmadan teklif onaylanamaz. Lütfen önce teslimat tarihi ekleyin.');
        error.code = 'MISSING_DELIVERY_DATE';
        throw error;
      }
    }

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
    
    // Normalize deliveryDate before returning
    this.normalizeDeliveryDate(quote);
    
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
        updatedBy: updatedBy,
        updatedAt: db.fn.now()
      })
      .returning('*');
    
    // Normalize deliveryDate before returning
    this.normalizeDeliveryDate(quote);
    
    return quote;
  }

  /**
   * Clear manual price - revert to calculated price
   */
  static async clearManualPrice(id, reason, updatedBy) {
    // Get the current quote to get calculatedPrice
    const currentQuote = await db('quotes.quotes').where('id', id).first();
    if (!currentQuote) return null;

    const [quote] = await db('quotes.quotes')
      .where('id', id)
      .update({
        manualPrice: null,
        manualPriceReason: null,
        finalPrice: currentQuote.calculatedPrice || 0,
        updatedBy: updatedBy,
        updatedAt: db.fn.now()
      })
      .returning('*');
    
    // Normalize deliveryDate before returning
    this.normalizeDeliveryDate(quote);
    
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
   * Mark quotes for recalculation when template/settings changes
   * NOTE: needsRecalculation column removed in B0.2
   * This method is deprecated - recalculation is done on-demand
   */
  static async markForRecalculation(criteria) {
    // No-op: needsRecalculation column removed
    // Recalculation is now done when quote is viewed/edited
    console.warn('DEPRECATED: Quotes.markForRecalculation() - column removed in B0.2');
    return 0;
  }

  /**
   * Get quotes that need recalculation
   * NOTE: needsRecalculation column removed in B0.2
   * This method is deprecated
   */
  static async getNeedingRecalculation() {
    // No-op: needsRecalculation column removed
    console.warn('DEPRECATED: Quotes.getNeedingRecalculation() - column removed in B0.2');
    return [];
  }

  /**
   * Recalculate a quote's price using current price setting
   */
  static async recalculate(id) {
    const trx = await db.transaction();
    
    try {
      const quote = await trx('quotes.quotes').where('id', id).first();
      
      if (!quote || !quote.priceSettingId) {
        throw new Error('Quote not found or has no price setting');
      }

      // Get form data
      const formDataRows = await trx('quotes.quote_form_data')
        .where('quoteId', id);
      
      const formData = {};
      formDataRows.forEach(row => {
        formData[row.fieldCode] = row.fieldValue;
      });

      // Calculate price
      const calculation = await PriceSettings.calculatePrice(quote.priceSettingId, formData);
      
      // Update quote
      await trx('quotes.quotes')
        .where('id', id)
        .update({
          calculatedPrice: calculation.totalPrice,
          finalPrice: quote.manualPrice || calculation.totalPrice,
          lastCalculatedAt: db.fn.now(),
          updatedAt: db.fn.now()
        });

      await trx.commit();
      return await this.getById(id);
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Check if quote can be edited
   * Returns edit status based on work order and production plan state
   */
  static async canEdit(id) {
    const quote = await this.getById(id);
    if (!quote) {
      return { canEdit: false, reason: 'not_found' };
    }

    // No work order = fully editable
    if (!quote.workOrderCode) {
      return { canEdit: true };
    }

    // Work order exists, check launch status
    const wo = await WorkOrders.getByCode(quote.workOrderCode);
    if (!wo) {
      // WO reference exists but WO not found - allow edit
      return { canEdit: true, warning: 'wo_not_found', workOrderCode: quote.workOrderCode };
    }

    // Check if there's a production plan for this work order
    const plan = await db('mes.production_plans')
      .where('workOrderCode', quote.workOrderCode)
      .first();

    if (plan) {
      // Check if plan is launched (active or completed)
      if (plan.status === 'active' || plan.status === 'completed') {
        // Check worker_assignments to determine actual production status
        // Worker assignments represent the actual work packages being executed
        const assignments = await db('mes.worker_assignments')
          .where('planId', plan.id)
          .select('status');
        
        const totalAssignments = assignments.length;
        const completedAssignments = assignments.filter(a => a.status === 'completed').length;
        const allCompleted = totalAssignments > 0 && completedAssignments === totalAssignments;
        
        if (allCompleted) {
          // All work packages completed
          return {
            canEdit: false,
            reason: 'production_completed',
            workOrderCode: wo.code,
            productionState: 'Tamamlandı',
            planId: plan.id,
            completedNodes: completedAssignments,
            totalNodes: totalAssignments
          };
        } else {
          // Production in progress (plan launched but not all assignments completed)
          return {
            canEdit: false,
            reason: 'production_in_progress',
            workOrderCode: wo.code,
            productionState: 'Üretiliyor',
            planId: plan.id,
            completedNodes: completedAssignments,
            totalNodes: totalAssignments
          };
        }
      }
    }

    // WO exists but plan not launched - allow edit with warning
    return { 
      canEdit: true, 
      warning: 'wo_exists', 
      workOrderCode: wo.code,
      productionState: wo.productionState || 'pending'
    };
  }

  /**
   * Get edit status for API response
   * Alias for canEdit with consistent response structure
   */
  static async getEditStatus(id) {
    return await this.canEdit(id);
  }
}

export default Quotes;
