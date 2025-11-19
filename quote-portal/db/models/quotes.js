import db from '../db.js';
import PriceFormulas from './priceFormulas.js';

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
  static async create({ customerName, customerEmail, customerPhone, customerCompany, customerAddress, formTemplateId, priceFormulaId, notes, formData, createdBy }) {
    const trx = await db.transaction();
    
    try {
      const quoteId = await this.generateQuoteId();

      // Create quote
      const [quote] = await trx('quotes.quotes')
        .insert({
          id: quoteId,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
          customer_company: customerCompany,
          customer_address: customerAddress,
          form_template_id: formTemplateId,
          price_formula_id: priceFormulaId,
          status: 'new',
          notes,
          created_by: createdBy,
          created_at: db.fn.now(),
          updated_at: db.fn.now()
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
            calculated_price: calculation.totalPrice,
            final_price: calculation.totalPrice,
            price_calculated_at: db.fn.now(),
            price_status: 'current'
          });

        // Save price calculation details
        await this._savePriceDetails(trx, quoteId, calculation.calculationDetails);
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
      .where('template_id', quote.form_template_id)
      .select('id', 'field_code');

    const formDataEntries = Object.entries(formData).map(([fieldCode, value]) => {
      const field = fields.find(f => f.field_code === fieldCode);
      if (!field) {
        return null;
      }
      return {
        quote_id: quoteId,
        field_id: field.id,
        field_code: fieldCode,
        field_value: String(value),
        created_at: db.fn.now(),
        updated_at: db.fn.now()
      };
    }).filter(Boolean);

    if (formDataEntries.length > 0) {
      await trx('quotes.quote_form_data').insert(formDataEntries);
    }
  }

  /**
   * Internal: Save price calculation details
   */
  static async _savePriceDetails(trx, quoteId, calculationDetails) {
    const priceDetails = calculationDetails.map(detail => ({
      quote_id: quoteId,
      parameter_id: detail.parameterId,
      parameter_code: detail.parameterCode,
      parameter_name: detail.parameterName,
      parameter_value: detail.parameterValue,
      calculated_amount: detail.parameterValue, // Can be enhanced with actual calculation
      source: detail.source,
      created_at: db.fn.now(),
      updated_at: db.fn.now()
    }));

    if (priceDetails.length > 0) {
      await trx('quotes.quote_price_details').insert(priceDetails);
    }
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
      query = query.where('customer_email', filters.customerEmail);
    }

    if (filters.customerCompany) {
      query = query.whereILike('customer_company', `%${filters.customerCompany}%`);
    }

    if (filters.fromDate) {
      query = query.where('created_at', '>=', filters.fromDate);
    }

    if (filters.toDate) {
      query = query.where('created_at', '<=', filters.toDate);
    }

    const quotes = await query.orderBy('created_at', 'desc');
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
      .where('quote_id', id)
      .select('field_code', 'field_value');
    
    const formDataObj = {};
    formData.forEach(item => {
      formDataObj[item.field_code] = item.field_value;
    });

    // Get price calculation details
    const priceDetails = await db('quotes.quote_price_details')
      .where('quote_id', id)
      .orderBy('id');

    // Get files
    const files = await db('quotes.quote_files')
      .where('quote_id', id)
      .orderBy('created_at');

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
      if (updates.customerName) updateData.customer_name = updates.customerName;
      if (updates.customerEmail) updateData.customer_email = updates.customerEmail;
      if (updates.customerPhone) updateData.customer_phone = updates.customerPhone;
      if (updates.customerCompany) updateData.customer_company = updates.customerCompany;
      if (updates.customerAddress) updateData.customer_address = updates.customerAddress;
      if (updates.notes !== undefined) updateData.notes = updates.notes;
      if (updates.updatedBy) updateData.updated_by = updates.updatedBy;
      
      updateData.updated_at = db.fn.now();

      const [quote] = await trx('quotes.quotes')
        .where('id', id)
        .update(updateData)
        .returning('*');

      // Update form data if provided
      if (updates.formData) {
        // Delete old form data
        await trx('quotes.quote_form_data')
          .where('quote_id', id)
          .delete();
        
        // Insert new form data
        await this._saveFormData(trx, id, updates.formData);

        // Recalculate price if formula exists
        if (quote.price_formula_id) {
          const calculation = await PriceFormulas.calculatePrice(quote.price_formula_id, updates.formData);
          
          await trx('quotes.quotes')
            .where('id', id)
            .update({
              calculated_price: calculation.totalPrice,
              final_price: quote.manual_price || calculation.totalPrice,
              price_calculated_at: db.fn.now(),
              price_status: quote.manual_price ? 'manual' : 'current'
            });

          // Delete old price details
          await trx('quotes.quote_price_details')
            .where('quote_id', id)
            .delete();
          
          // Insert new price details
          await this._savePriceDetails(trx, id, calculation.calculationDetails);
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
      updated_by: updatedBy,
      updated_at: db.fn.now()
    };

    if (status === 'approved') {
      updateData.approved_at = db.fn.now();
      updateData.approved_by = updatedBy;
    }

    const [quote] = await db('quotes.quotes')
      .where('id', id)
      .update(updateData)
      .returning('*');
    
    return quote;
  }

  /**
   * Set manual price
   */
  static async setManualPrice(id, manualPrice, reason, updatedBy) {
    const [quote] = await db('quotes.quotes')
      .where('id', id)
      .update({
        manual_price: manualPrice,
        manual_price_reason: reason,
        final_price: manualPrice,
        price_status: 'manual',
        updated_by: updatedBy,
        updated_at: db.fn.now()
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
        quote_id: quoteId,
        file_type: fileType,
        file_name: fileName,
        file_path: filePath,
        mime_type: mimeType,
        file_size: fileSize,
        description,
        uploaded_by: uploadedBy,
        created_at: db.fn.now(),
        updated_at: db.fn.now()
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
      query = query.where('created_at', '>=', filters.fromDate);
    }

    if (filters.toDate) {
      query = query.where('created_at', '<=', filters.toDate);
    }

    const stats = await query
      .select(
        db.raw('COUNT(*) as total_quotes'),
        db.raw("COUNT(*) FILTER (WHERE status = 'new') as new_quotes"),
        db.raw("COUNT(*) FILTER (WHERE status = 'pending') as pending_quotes"),
        db.raw("COUNT(*) FILTER (WHERE status = 'approved') as approved_quotes"),
        db.raw("COUNT(*) FILTER (WHERE status = 'rejected') as rejected_quotes"),
        db.raw('SUM(final_price) as total_value'),
        db.raw("SUM(final_price) FILTER (WHERE status = 'approved') as approved_value")
      )
      .first();

    return stats;
  }
}

export default Quotes;
