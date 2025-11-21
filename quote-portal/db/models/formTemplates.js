import db from '../db.js';

/**
 * FormTemplates Model
 * Manages form templates for quotes system
 */

class FormTemplates {
  /**
   * Create a new form template
   */
  static async create({ code, name, description, version = 1, isActive = false, is_active, createdBy }) {
    const [template] = await db('quotes.form_templates')
      .insert({
        code,
        name,
        description,
        version,
        isActive: isActive || is_active || false,
        createdBy: createdBy,
        createdAt: db.fn.now(),
        updatedAt: db.fn.now()
      })
      .returning('*');
    
    return template;
  }

  /**
   * Get all form templates
   */
  static async getAll(filters = {}) {
    let query = db('quotes.form_templates');

    if (filters.isActive !== undefined) {
      query = query.where('isActive', filters.isActive);
    }

    if (filters.code) {
      query = query.where('code', filters.code);
    }

    const templates = await query.orderBy('createdAt', 'desc');
    return templates;
  }

  /**
   * Get form template by ID
   */
  static async getById(id) {
    const template = await db('quotes.form_templates')
      .where('id', id)
      .first();
    
    return template;
  }

  /**
   * Get form template by code
   */
  static async getByCode(code) {
    const template = await db('quotes.form_templates')
      .where('code', code)
      .first();
    
    return template;
  }

  /**
   * Get active template (latest version)
   */
  static async getActive() {
    const template = await db('quotes.form_templates')
      .where('isActive', true)
      .orderBy('version', 'desc')
      .first();
    
    return template;
  }

  /**
   * Update form template
   */
  static async update(id, updates) {
    const [template] = await db('quotes.form_templates')
      .where('id', id)
      .update({
        ...updates,
        updatedAt: db.fn.now()
      })
      .returning('*');
    
    return template;
  }

  /**
   * Activate/Deactivate template
   */
  static async setActive(id, isActive) {
    const [template] = await db('quotes.form_templates')
      .where('id', id)
      .update({
        isActive: isActive,
        updatedAt: db.fn.now()
      })
      .returning('*');
    
    return template;
  }

  /**
   * Delete form template
   */
  static async delete(id) {
    const count = await db('quotes.form_templates')
      .where('id', id)
      .delete();
    
    return count > 0;
  }

  /**
   * Get template with all fields and options
   */
  static async getWithFields(templateId) {
    const template = await this.getById(templateId);
    
    if (!template) {
      return null;
    }

    // Get all fields for this template with their options
    const fields = await db('quotes.form_fields as ff')
      .where('ff.templateId', templateId)
      .leftJoin('quotes.form_field_options as ffo', 'ffo.fieldId', 'ff.id')
      .select(
        'ff.id',
        'ff.fieldCode',
        'ff.fieldName',
        'ff.fieldType',
        'ff.sortOrder',
        'ff.isRequired',
        'ff.placeholder',
        'ff.helpText',
        'ff.validationRule',
        'ff.defaultValue',
        db.raw(`
          json_agg(
            json_build_object(
              'id', ffo.id,
              'value', ffo."optionValue",
              'label', ffo."optionLabel",
              'sortOrder', ffo."sortOrder",
              'isActive', ffo."isActive"
            ) ORDER BY ffo."sortOrder"
          ) FILTER (WHERE ffo.id IS NOT NULL) as options
        `)
      )
      .groupBy('ff.id')
      .orderBy('ff.sortOrder');

    return {
      ...template,
      fields
    };
  }

  /**
   * Create new version of a template
   */
  static async createNewVersion(templateId, { name, description, createdBy }) {
    const trx = await db.transaction();
    
    try {
      // Get current template
      const currentTemplate = await trx('quotes.form_templates')
        .where('id', templateId)
        .first();
      
      if (!currentTemplate) {
        throw new Error('Template not found');
      }

      // Deactivate current template
      await trx('quotes.form_templates')
        .where('id', templateId)
        .update({ isActive: false, updatedAt: db.fn.now() });

      // Create new version
      const [newTemplate] = await trx('quotes.form_templates')
        .insert({
          code: currentTemplate.code,
          name: name || currentTemplate.name,
          description: description || currentTemplate.description,
          version: currentTemplate.version + 1,
          isActive: true,
          supersedesId: templateId,
          createdBy: createdBy,
          createdAt: db.fn.now(),
          updatedAt: db.fn.now()
        })
        .returning('*');

      await trx.commit();
      return newTemplate;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Get all versions of a template
   */
  static async getVersions(code) {
    const versions = await db('quotes.form_templates')
      .where('code', code)
      .orderBy('version', 'desc');
    
    return versions;
  }

  /**
   * Activate a specific version
   */
  static async activateVersion(templateId) {
    const trx = await db.transaction();
    
    try {
      // Get the template to activate
      const template = await trx('quotes.form_templates')
        .where('id', templateId)
        .first();
      
      if (!template) {
        throw new Error('Template not found');
      }

      // Deactivate ALL templates (only one can be active at a time)
      await trx('quotes.form_templates')
        .update({ isActive: false, updatedAt: db.fn.now() });

      // Activate this specific template
      await trx('quotes.form_templates')
        .where('id', templateId)
        .update({ isActive: true, updatedAt: db.fn.now() });

      await trx.commit();
      return await this.getById(templateId);
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }
}

export default FormTemplates;
