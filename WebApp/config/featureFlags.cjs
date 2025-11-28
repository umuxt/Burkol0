/**
 * Feature Flags Configuration
 * 
 * This module provides runtime feature flags for safe deployment and rollback.
 * Flags are controlled via environment variables and can be toggled without code changes.
 * 
 * Usage:
 *   const featureFlags = require('../config/featureFlags');
 *   if (featureFlags.ENABLE_VALIDATION) {
 *     // Use validation
 *   }
 * 
 * Environment Variables:
 *   FEATURE_ENABLE_VALIDATION=true|false - Enable JSON schema validation (default: true)
 */

module.exports = {
  /**
   * ENABLE_VALIDATION
   * 
   * Controls whether JSON Schema validation is enforced on plan creation/update.
   * 
   * When TRUE:
   * - validateProductionPlanNodes() is called on POST/PUT
   * - Invalid plans are rejected with 400 error
   * - Validation errors are logged and counted in metrics
   * 
   * When FALSE:
   * - Validation is skipped (permissive mode)
   * - Used only for emergency situations or debugging
   * - NOT recommended for production
   * 
   * Default: true (validation enabled by default)
   * Can be disabled by explicitly setting to 'false' in environment
   */
  ENABLE_VALIDATION: process.env.FEATURE_ENABLE_VALIDATION !== 'false',

  /**
   * Helper function to check if a feature flag is enabled
   * Useful for conditional logging or metrics
   */
  isEnabled(flagName) {
    return this[flagName] === true;
  },

  /**
   * Get all feature flags as object (for debugging or status endpoint)
   */
  getAll() {
    return {
      USE_CANONICAL_NODES: this.USE_CANONICAL_NODES,
      ENABLE_VALIDATION: this.ENABLE_VALIDATION,
    };
  },

  /**
   * Log current feature flag status (call on server startup)
   */
  logStatus() {
    console.log('🚩 Feature Flags Configuration:');
    console.log(`   USE_CANONICAL_NODES: ${this.USE_CANONICAL_NODES ? '✅ ENABLED' : '❌ DISABLED'}`);
    console.log(`   ENABLE_VALIDATION: ${this.ENABLE_VALIDATION ? '✅ ENABLED' : '❌ DISABLED'}`);
    
    if (!this.USE_CANONICAL_NODES) {
      console.warn('⚠️  Canonical nodes disabled - using executionGraph fallback');
    }
    
    if (!this.ENABLE_VALIDATION) {
      console.warn('⚠️  Validation disabled - accepting invalid plans (not recommended for production)');
    }
  }
};
