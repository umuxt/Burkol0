/**
 * Feature Flags Configuration
 * 
 * This module manages feature flags to enable safe rollout and rollback of new features.
 * 
 * Usage:
 *   const { FEATURE_USE_CANONICAL_NODES } = require('../config/featureFlags');
 *   if (FEATURE_USE_CANONICAL_NODES) { ... }
 */

module.exports = {
  /**
   * FEATURE_USE_CANONICAL_NODES
   * 
   * Controls whether to use canonical nodes[] as the primary source of truth for production plans.
   * 
   * When true (default):
   *   - Prefer plan.nodes over plan.executionGraph
   *   - Use nodes[] for assignment, scheduling, and material consumption
   *   - executionGraph is deprecated but preserved for backward compatibility
   * 
   * When false:
   *   - Prefer plan.executionGraph over plan.nodes
   *   - Use legacy data structure for critical operations
   *   - Enables rollback if issues occur after migration
   * 
   * This flag should be set to false if:
   *   - Critical issues discovered after migration
   *   - Need to revert to legacy behavior temporarily
   *   - Testing new code paths in staging environment
   * 
   * Environment variable: FEATURE_USE_CANONICAL_NODES (set to "false" to disable)
   */
  FEATURE_USE_CANONICAL_NODES: process.env.FEATURE_USE_CANONICAL_NODES !== 'false'
};
