import db from '../connection.js';

/**
 * Get system setting by key
 * @param {string} key - Setting key (e.g., 'system_config')
 * @returns {Promise<Object|null>} Setting value or null
 */
export async function getSetting(key) {
  try {
    const result = await db('settings.settings').where({ key }).first();
    return result ? result.value : null;
  } catch (error) {
    console.error(`Error getting setting ${key}:`, error);
    return null;
  }
}

/**
 * Set or update system setting
 * @param {string} key - Setting key
 * @param {Object} value - Setting value (JSON)
 * @param {string} updatedBy - User who updated the setting
 * @returns {Promise<Object>} Updated setting
 */
export async function setSetting(key, value, updatedBy) {
  try {
    const [updated] = await db('settings.settings')
      .insert({
        key,
        value,
        updatedAt: db.fn.now(),
        updatedBy: updatedBy
      })
      .onConflict('key')
      .merge(['value', 'updatedAt', 'updatedBy'])
      .returning('*');
    
    return updated;
  } catch (error) {
    console.error(`Error setting ${key}:`, error);
    throw error;
  }
}

// Helper to check if lot tracking is enabled (defaults to TRUE for safety)
export async function isLotTrackingEnabled() {
  const config = await getSetting('system_config');
  // Default to true if not set, to maintain backward compatibility
  return config?.lotTracking !== false; 
}

export default {
  getSetting,
  setSetting,
  isLotTrackingEnabled
};
