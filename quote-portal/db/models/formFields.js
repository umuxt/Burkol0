import db from '../db.js';

/**
 * FormFields Model
 * Manages form fields and their options
 */

class FormFields {
  /**
   * Create a new form field
   */
  static async create({ templateId, fieldCode, fieldName, fieldType, sortOrder = 0, isRequired = false, placeholder, helpText, validationRule, defaultValue }) {
    const [field] = await db('quotes.form_fields')
      .insert({
        template_id: templateId,
        field_code: fieldCode,
        field_name: fieldName,
        field_type: fieldType,
        sort_order: sortOrder,
        is_required: isRequired,
        placeholder,
        help_text: helpText,
        validation_rule: validationRule,
        default_value: defaultValue,
        created_at: db.fn.now(),
        updated_at: db.fn.now()
      })
      .returning('*');
    
    return field;
  }

  /**
   * Get all fields for a template
   */
  static async getByTemplateId(templateId) {
    const fields = await db('quotes.form_fields')
      .where('template_id', templateId)
      .orderBy('sort_order');
    
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
        field_name: updates.fieldName,
        field_type: updates.fieldType,
        sort_order: updates.sortOrder,
        is_required: updates.isRequired,
        placeholder: updates.placeholder,
        help_text: updates.helpText,
        validation_rule: updates.validationRule,
        default_value: updates.defaultValue,
        updated_at: db.fn.now()
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
   */
  static async addOption({ fieldId, optionValue, optionLabel, sortOrder = 0, isActive = true, priceValue = null }) {
    const [option] = await db('quotes.form_field_options')
      .insert({
        field_id: fieldId,
        option_value: optionValue,
        option_label: optionLabel,
        sort_order: sortOrder,
        is_active: isActive,
        price_value: priceValue,
        created_at: db.fn.now(),
        updated_at: db.fn.now()
      })
      .returning('*');
    
    return option;
  }

  /**
   * Get all options for a field
   */
  static async getOptions(fieldId) {
    const options = await db('quotes.form_field_options')
      .where('field_id', fieldId)
      .orderBy('sort_order');
    
    return options;
  }

  /**
   * Update option
   */
  static async updateOption(optionId, updates) {
    const [option] = await db('quotes.form_field_options')
      .where('id', optionId)
      .update({
        option_value: updates.optionValue,
        option_label: updates.optionLabel,
        sort_order: updates.sortOrder,
        is_active: updates.isActive,
        price_value: updates.priceValue,
        updated_at: db.fn.now()
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
            template_id: templateId,
            field_code: fieldInfo.fieldCode,
            field_name: fieldInfo.fieldName,
            field_type: fieldInfo.fieldType,
            sort_order: fieldInfo.sortOrder || 0,
            is_required: fieldInfo.isRequired || false,
            placeholder: fieldInfo.placeholder,
            help_text: fieldInfo.helpText,
            validation_rule: fieldInfo.validationRule,
            default_value: fieldInfo.defaultValue,
            created_at: db.fn.now(),
            updated_at: db.fn.now()
          })
          .returning('*');

        // Create options if field is select/multiselect
        if (options && options.length > 0 && ['select', 'multiselect'].includes(fieldInfo.fieldType)) {
          const optionsToInsert = options.map((opt, idx) => ({
            field_id: field.id,
            option_value: opt.value,
            option_label: opt.label,
            sort_order: opt.sortOrder !== undefined ? opt.sortOrder : idx,
            is_active: opt.isActive !== undefined ? opt.isActive : true,
            price_value: opt.priceValue || null,
            created_at: db.fn.now(),
            updated_at: db.fn.now()
          }));

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
