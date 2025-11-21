import db from '../db.js';

/**
 * FormTemplates Model
 * Manages form templates for quotes system
 */

class FormTemplates {
  /**
   * Create a new form template
   */
  static async create({ code, name, description, version = 1, is_active = false, createdBy }) {
    const [template] = await db('quotes.form_templates')
      .insert({
        code,
        name,
        description,
        version,
        is_active,
        created_by: createdBy,
        created_at: db.fn.now(),
        updated_at: db.fn.now()
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
      query = query.where('is_active', filters.isActive);
    }

    if (filters.code) {
      query = query.where('code', filters.code);
    }

    const templates = await query.orderBy('created_at', 'desc');
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
      .where('is_active', true)
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
        updated_at: db.fn.now()
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
        is_active: isActive,
        updated_at: db.fn.now()
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
      .where('ff.template_id', templateId)
      .leftJoin('quotes.form_field_options as ffo', 'ffo.field_id', 'ff.id')
      .select(
        'ff.id',
        'ff.field_code',
        'ff.field_name',
        'ff.field_type',
        'ff.sort_order',
        'ff.is_required',
        'ff.placeholder',
        'ff.help_text',
        'ff.validation_rule',
        'ff.default_value',
        db.raw(`
          json_agg(
            json_build_object(
              'id', ffo.id,
              'value', ffo.option_value,
              'label', ffo.option_label,
              'sortOrder', ffo.sort_order,
              'isActive', ffo.is_active
            ) ORDER BY ffo.sort_order
          ) FILTER (WHERE ffo.id IS NOT NULL) as options
        `)
      )
      .groupBy('ff.id')
      .orderBy('ff.sort_order');

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
        .update({ is_active: false, updated_at: db.fn.now() });

      // Create new version
      const [newTemplate] = await trx('quotes.form_templates')
        .insert({
          code: currentTemplate.code,
          name: name || currentTemplate.name,
          description: description || currentTemplate.description,
          version: currentTemplate.version + 1,
          is_active: true,
          supersedes_id: templateId,
          created_by: createdBy,
          created_at: db.fn.now(),
          updated_at: db.fn.now()
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
        .update({ is_active: false, updated_at: db.fn.now() });

      // Activate this specific template
      await trx('quotes.form_templates')
        .where('id', templateId)
        .update({ is_active: true, updated_at: db.fn.now() });

      await trx.commit();
      return await this.getById(templateId);
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }
}

export default FormTemplates;
