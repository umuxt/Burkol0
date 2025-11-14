/**
 * Feature Flags Configuration
 * 
 * This module provides runtime feature flags for safe deployment and rollback.
 * Flags are controlled via environment variables and can be toggled without code changes.
 * 
 * Usage:
 *   const featureFlags = require('../config/featureFlags');
 *   if (featureFlags.USE_CANONICAL_NODES) {
 *     // Use canonical nodes[] model
 *   }
 * 
 * Environment Variables:
 *   FEATURE_USE_CANONICAL_NODES=true|false - Enable canonical node model (default: false)
 *   FEATURE_ENABLE_VALIDATION=true|false - Enable JSON schema validation (default: true)
 */

module.exports = {
  /**
   * USE_CANONICAL_NODES
   * 
   * Controls whether the system prefers canonical nodes[] over legacy executionGraph[].
   * 
   * When TRUE:
   * - Backend prefers plan.nodes[] as source of truth
   * - Launch endpoint uses nodes[] for scheduling and assignment creation
   * - executionGraph[] is only used as fallback for old plans
   * - Deprecation warnings logged when executionGraph is used
   * 
   * When FALSE:
   * - Backend prefers plan.executionGraph[] if available
   * - Falls back to plan.nodes[] if executionGraph missing
   * - Used for safe rollback during deployment
   * 
   * Rollout phases:
   * - Phase 1-2 (Dev/Staging): false (test both code paths)
   * - Phase 3 (Pilot): true (enable for pilot plans)
   * - Phase 4 (Full rollout): true (enable globally)
   * - Phase 5 (Cleanup): true (fallback code removed)
   * 
   * Default: false (safe default during migration)
   */
  USE_CANONICAL_NODES: process.env.FEATURE_USE_CANONICAL_NODES === 'true',

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
