import db from '../connection.js';

/**
 * FormFields Model
 * Manages form fields and their options
 * 
 * Updated for Pre-D2-1: optionCode system
 * - Options now have unique optionCode (FFOC-XXXX format)
 * - priceValue moved to price_parameter_lookups table
 */

class FormFields {
  /**
   * Generate unique option code
   * Format: FFOC-XXXX (e.g., FFOC-0001, FFOC-0002)
   * Uses database sequence for guaranteed uniqueness
   */
  static async generateOptionCode() {
    // Use sequence for guaranteed uniqueness
    const result = await db.raw(
      "SELECT nextval('quotes.form_field_option_code_seq') as next_val"
    );
    const nextVal = result.rows[0].next_val;
    return `FFOC-${String(nextVal).padStart(4, '0')}`;
  }

  /**
   * Create a new form field
   */
  static async create({ templateId, fieldCode, fieldName, fieldType, sortOrder = 0, isRequired = false, placeholder, helpText, validationRule, defaultValue }) {
    const [field] = await db('quotes.form_fields')
      .insert({
        templateId: templateId,
        fieldCode: fieldCode,
        fieldName: fieldName,
        fieldType: fieldType,
        sortOrder: sortOrder,
        isRequired: isRequired,
        placeholder,
        helpText: helpText,
        validationRule: validationRule,
        defaultValue: defaultValue,
        createdAt: db.fn.now(),
        updatedAt: db.fn.now()
      })
      .returning('*');
    
    return field;
  }

  /**
   * Get all fields for a template
   */
  static async getByTemplateId(templateId) {
    const fields = await db('quotes.form_fields')
      .where('templateId', templateId)
      .orderBy('sortOrder');
    
    return fields;
  }

  /**
   * Get field by ID
   */
  static async getById(id) {
    const field = await db('quotes.form_fields')
      .where('id', id)
      .first();
    
    return field;
  }

  /**
   * Update form field
   */
  static async update(id, updates) {
    const [field] = await db('quotes.form_fields')
      .where('id', id)
      .update({
        fieldName: updates.fieldName,
        fieldType: updates.fieldType,
        sortOrder: updates.sortOrder,
        isRequired: updates.isRequired,
        placeholder: updates.placeholder,
        helpText: updates.helpText,
        validationRule: updates.validationRule,
        defaultValue: updates.defaultValue,
        updatedAt: db.fn.now()
      })
      .returning('*');
    
    return field;
  }

  /**
   * Delete form field
   */
  static async delete(id) {
    const count = await db('quotes.form_fields')
      .where('id', id)
      .delete();
    
    return count > 0;
  }

  /**
   * Add option to a field
   * Pre-D2-1: Generates unique optionCode (FFOC-XXXX format)
   * @param {Object} params - Option parameters
   * @param {number} params.fieldId - Field ID
   * @param {string} params.optionLabel - Display label for the option
   * @param {number} [params.sortOrder=0] - Sort order
   * @param {boolean} [params.isActive=true] - Is active
   */
  static async addOption({ fieldId, optionLabel, sortOrder = 0, isActive = true }) {
    // Generate unique optionCode
    const optionCode = await this.generateOptionCode();
    
    const [option] = await db('quotes.form_field_options')
      .insert({
        fieldId: fieldId,
        optionCode: optionCode,
        optionLabel: optionLabel,
        sortOrder: sortOrder,
        isActive: isActive,
        createdAt: db.fn.now(),
        updatedAt: db.fn.now()
      })
      .returning('*');
    
    return option;
  }

  /**
   * Get all options for a field
   * Pre-D2-1: Returns optionCode instead of optionValue
   * @param {number} fieldId - Field ID
   * @param {boolean} [includeInactive=false] - Include inactive options
   */
  static async getOptions(fieldId, includeInactive = false) {
    let query = db('quotes.form_field_options')
      .where('fieldId', fieldId)
      .orderBy('sortOrder');
    
    if (!includeInactive) {
      query = query.where('isActive', true);
    }
    
    const options = await query.select(
      'id',
      'fieldId',
      'optionCode',
      'optionLabel',
      'sortOrder',
      'isActive',
      'createdAt',
      'updatedAt'
    );
    
    return options;
  }

  /**
   * Get option by optionCode
   * Pre-D2-1: Lookup by unique code
   */
  static async getOptionByCode(optionCode) {
    const option = await db('quotes.form_field_options')
      .where('optionCode', optionCode)
      .first();
    
    return option;
  }

  /**
   * Get options for a field code from a SPECIFIC template
   * Post-D2: Pricing stores which template version it's linked to
   * @param {string} fieldCode - Form field code
   * @param {number} templateId - Optional: specific template ID to get options from
   *                              If not provided, uses the active template
   * Returns: { optionCode, optionLabel, sortOrder }
   */
  static async getOptionsByFieldCode(fieldCode, templateId = null) {
    let query = db('quotes.form_field_options as ffo')
      .join('quotes.form_fields as ff', 'ff.id', 'ffo.fieldId')
      .join('quotes.form_templates as ft', 'ft.id', 'ff.templateId')
      .where('ff.fieldCode', fieldCode)
      .where('ffo.isActive', true)
      .select(
        'ffo.optionCode',
        'ffo.optionLabel',
        'ffo.sortOrder'
      )
      .orderBy('ffo.sortOrder');
    
    if (templateId) {
      // Get from specific template
      query = query.where('ft.id', templateId);
    } else {
      // Get from active template
      query = query.where('ft.isActive', true);
    }
    
    return query;
  }

  /**
   * Get the active form template info
   * Returns: { id, name, version, updatedAt }
   */
  static async getActiveFormTemplate() {
    const [template] = await db('quotes.form_templates')
      .where('isActive', true)
      .select('id', 'name', 'version', 'updatedAt')
      .limit(1);
    return template;
  }

  /**
   * Update option
   * Pre-D2-1: optionCode cannot be changed (immutable unique identifier)
   * Updateable fields: optionLabel, sortOrder, isActive
   */
  static async updateOption(optionId, updates) {
    // Prevent optionCode from being changed
    const { optionCode, ...safeUpdates } = updates;
    
    const [option] = await db('quotes.form_field_options')
      .where('id', optionId)
      .update({
        // optionCode: immutable - cannot be changed
        optionLabel: safeUpdates.optionLabel,
        sortOrder: safeUpdates.sortOrder,
        isActive: safeUpdates.isActive,
        updatedAt: db.fn.now()
      })
      .returning('*');
    
    return option;
  }

  /**
   * Delete option
   */
  static async deleteOption(optionId) {
    const count = await db('quotes.form_field_options')
      .where('id', optionId)
      .delete();
    
    return count > 0;
  }

  /**
   * Bulk create fields with options
   * Pre-D2-1: Now generates unique optionCode for each option
   */
  static async bulkCreateWithOptions(templateId, fieldsData) {
    const trx = await db.transaction();
    
    try {
      const createdFields = [];

      for (const fieldData of fieldsData) {
        const { options, ...fieldInfo } = fieldData;
        
        // Create field
        const [field] = await trx('quotes.form_fields')
          .insert({
            templateId: templateId,
            fieldCode: fieldInfo.fieldCode,
            fieldName: fieldInfo.fieldName,
            fieldType: fieldInfo.fieldType,
            sortOrder: fieldInfo.sortOrder || 0,
            isRequired: fieldInfo.isRequired || false,
            placeholder: fieldInfo.placeholder,
            helpText: fieldInfo.helpText,
            validationRule: fieldInfo.validationRule,
            defaultValue: fieldInfo.defaultValue,
            createdAt: db.fn.now(),
            updatedAt: db.fn.now()
          })
          .returning('*');

        // Create options if field is select/multiselect
        if (options && options.length > 0 && ['select', 'multiselect'].includes(fieldInfo.fieldType)) {
          // Pre-D2-1: Generate unique optionCode for each option
          const optionsToInsert = [];
          for (let idx = 0; idx < options.length; idx++) {
            const opt = options[idx];
            // Generate optionCode using sequence
            const seqResult = await trx.raw(
              "SELECT nextval('quotes.form_field_option_code_seq') as next_val"
            );
            const optionCode = `FFOC-${String(seqResult.rows[0].next_val).padStart(4, '0')}`;
            
            optionsToInsert.push({
              fieldId: field.id,
              optionCode: optionCode,
              optionLabel: opt.label,
              sortOrder: opt.sortOrder !== undefined ? opt.sortOrder : idx,
              isActive: opt.isActive !== undefined ? opt.isActive : true,
              createdAt: db.fn.now(),
              updatedAt: db.fn.now()
            });
          }

          await trx('quotes.form_field_options').insert(optionsToInsert);
        }

        createdFields.push(field);
      }

      await trx.commit();
      return createdFields;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }
}

export default FormFields;
