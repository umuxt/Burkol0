/**
 * PriceSettings Model - Master version control for pricing configurations
 */

import db from '../../../../db/db.js';

const PriceSettings = {
  /**
   * Get all price settings (all versions)
   */
  async getAll() {
    return db('quotes.price_settings')
      .select('*')
      .orderBy('created_at', 'desc');
  },

  /**
   * Get active price setting
   */
  async getActive() {
    return db('quotes.price_settings')
      .where({ is_active: true })
      .first();
  },

  /**
   * Get price setting with parameters and formula
   */
  async getWithDetails(id) {
    const setting = await db('quotes.price_settings')
      .where({ id })
      .first();

    if (!setting) {
      return null;
    }

    // Get parameters for this setting
    const parameters = await db('quotes.price_parameters')
      .where({ setting_id: id })
      .select('*');

    // Get formula for this setting
    const formula = await db('quotes.price_formulas')
      .where({ setting_id: id })
      .first();

    return {
      ...setting,
      parameters,
      formula
    };
  },

  /**
   * Get active setting with all details
   */
  async getActiveWithDetails() {
    const activeSetting = await this.getActive();
    
    if (!activeSetting) {
      return null;
    }

    return this.getWithDetails(activeSetting.id);
  },

  /**
   * Create new price setting
   */
  async create(data) {
    const [setting] = await db('quotes.price_settings')
      .insert({
        code: data.code,
        name: data.name,
        description: data.description,
        is_active: data.is_active || false,
        version: data.version || 1,
        created_by: data.created_by,
        supersedes_id: data.supersedes_id || null
      })
      .returning('*');

    return setting;
  },

  /**
   * Update price setting
   */
  async update(id, data) {
    const [setting] = await db('quotes.price_settings')
      .where({ id })
      .update({
        ...data,
        updated_at: db.fn.now()
      })
      .returning('*');

    return setting;
  },

  /**
   * Activate a price setting (deactivate all others)
   */
  async activate(id) {
    await db.transaction(async (trx) => {
      // Deactivate all
      await trx('quotes.price_settings')
        .update({ is_active: false });

      // Activate selected
      await trx('quotes.price_settings')
        .where({ id })
        .update({ is_active: true });
    });

    return this.getWithDetails(id);
  },

  /**
   * Create new version from existing setting
   */
  async createNewVersion(currentSettingId, newName) {
    return db.transaction(async (trx) => {
      // Get current setting
      const currentSetting = await trx('quotes.price_settings')
        .where({ id: currentSettingId })
        .first();

      if (!currentSetting) {
        throw new Error('Current setting not found');
      }

      // Get max version for this code
      const maxVersionResult = await trx('quotes.price_settings')
        .where({ code: currentSetting.code })
        .max('version as maxVersion')
        .first();

      const nextVersion = (maxVersionResult.maxVersion || 0) + 1;

      // Create new setting
      const [newSetting] = await trx('quotes.price_settings')
        .insert({
          code: currentSetting.code,
          name: newName || `${currentSetting.name} v${nextVersion}`,
          description: currentSetting.description,
          is_active: false,
          version: nextVersion,
          created_by: currentSetting.created_by,
          supersedes_id: currentSettingId
        })
        .returning('*');

      // Copy parameters
      const currentParams = await trx('quotes.price_parameters')
        .where({ setting_id: currentSettingId });

      if (currentParams.length > 0) {
        const newParams = currentParams.map(p => ({
          setting_id: newSetting.id,
          code: p.code,
          name: p.name,
          type: p.type,
          fixed_value: p.fixed_value,
          form_field_code: p.form_field_code,
          is_active: p.is_active
        }));

        await trx('quotes.price_parameters').insert(newParams);
      }

      // Copy formula
      const currentFormula = await trx('quotes.price_formulas')
        .where({ setting_id: currentSettingId })
        .first();

      if (currentFormula) {
        await trx('quotes.price_formulas').insert({
          setting_id: newSetting.id,
          code: currentFormula.code,
          name: currentFormula.name,
          formula_expression: currentFormula.formula_expression,
          description: currentFormula.description,
          is_active: currentFormula.is_active,
          version: currentFormula.version,
          created_by: currentFormula.created_by
        });
      }

      return newSetting;
    });
  },

  /**
   * Delete price setting (cascade deletes parameters and formula)
   */
  async delete(id) {
    await db('quotes.price_settings')
      .where({ id })
      .delete();
  }
};

export default PriceSettings;
