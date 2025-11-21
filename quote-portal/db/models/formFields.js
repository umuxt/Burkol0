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
   */
  static async addOption({ fieldId, optionValue, optionLabel, sortOrder = 0, isActive = true, priceValue = null }) {
    const [option] = await db('quotes.form_field_options')
      .insert({
        fieldId: fieldId,
        optionValue: optionValue,
        optionLabel: optionLabel,
        sortOrder: sortOrder,
        isActive: isActive,
        priceValue: priceValue,
        createdAt: db.fn.now(),
        updatedAt: db.fn.now()
      })
      .returning('*');
    
    return option;
  }

  /**
   * Get all options for a field
   */
  static async getOptions(fieldId) {
    const options = await db('quotes.form_field_options')
      .where('fieldId', fieldId)
      .orderBy('sortOrder');
    
    return options;
  }

  /**
   * Update option
   */
  static async updateOption(optionId, updates) {
    const [option] = await db('quotes.form_field_options')
      .where('id', optionId)
      .update({
        optionValue: updates.optionValue,
        optionLabel: updates.optionLabel,
        sortOrder: updates.sortOrder,
        isActive: updates.isActive,
        priceValue: updates.priceValue,
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
          const optionsToInsert = options.map((opt, idx) => ({
            fieldId: field.id,
            optionValue: opt.value,
            optionLabel: opt.label,
            sortOrder: opt.sortOrder !== undefined ? opt.sortOrder : idx,
            isActive: opt.isActive !== undefined ? opt.isActive : true,
            priceValue: opt.priceValue || null,
            createdAt: db.fn.now(),
            updatedAt: db.fn.now()
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
