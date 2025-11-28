/**
 * PriceSettings Model - Master version control for pricing configurations
 */

import db from '../../../../db/connection.js';

const PriceSettings = {
  /**
   * Get all price settings (all versions)
   */
  async getAll() {
    return db('quotes.price_settings')
      .select('*')
      .orderBy('createdAt', 'desc');
  },

  /**
   * Get active price setting
   */
  async getActive() {
    return db('quotes.price_settings')
      .where({ isActive: true })
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
      .where({ settingId: id })
      .select('*');

    // Get formula for this setting
    const formula = await db('quotes.price_formulas')
      .where({ settingId: id })
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
        isActive: data.isActive || data.is_active || false,
        version: data.version || 1,
        createdBy: data.createdBy || data.created_by,
        supersedesId: data.supersedesId || data.supersedes_id || null
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
        updatedAt: db.fn.now()
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
        .update({ isActive: false });

      // Activate selected
      await trx('quotes.price_settings')
        .where({ id })
        .update({ isActive: true });
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
          isActive: false,
          version: nextVersion,
          createdBy: currentSetting.createdBy,
          supersedesId: currentSettingId
        })
        .returning('*');

      // Copy parameters
      const currentParams = await trx('quotes.price_parameters')
        .where({ settingId: currentSettingId });

      if (currentParams.length > 0) {
        const newParams = currentParams.map(p => ({
          settingId: newSetting.id,
          code: p.code,
          name: p.name,
          type: p.type,
          fixedValue: p.fixedValue,
          formFieldCode: p.formFieldCode,
          isActive: p.isActive
        }));

        await trx('quotes.price_parameters').insert(newParams);
      }

      // Copy formula
      const currentFormula = await trx('quotes.price_formulas')
        .where({ settingId: currentSettingId })
        .first();

      if (currentFormula) {
        await trx('quotes.price_formulas').insert({
          settingId: newSetting.id,
          code: currentFormula.code,
          name: currentFormula.name,
          formulaExpression: currentFormula.formulaExpression,
          description: currentFormula.description,
          isActive: currentFormula.isActive,
          version: currentFormula.version,
          createdBy: currentFormula.createdBy
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
