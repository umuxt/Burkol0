/**
 * Migration 040: Add Lifecycle Timestamps to Production Plans
 * 
 * Purpose: Add timestamp columns for plan lifecycle events
 * - launched_at: When plan was launched (status: draft → active)
 * - paused_at: When plan was paused (status: active → paused)
 * - resumed_at: When plan was resumed (status: paused → active)
 * 
 * These fields support STEP 7 Production Plans API endpoints:
 * - POST /production-plans/:id/launch
 * - POST /production-plans/:id/pause
 * - POST /production-plans/:id/resume
 * 
 * Created: 20 Kasım 2025
 */

export async function up(knex) {
  console.log('🔧 Migration 040: Adding lifecycle timestamps to production_plans...');
  
  await knex.schema.withSchema('mes').table('production_plans', (table) => {
    table.timestamp('launched_at')
      .comment('Timestamp when plan was launched (draft → active)');
    
    table.timestamp('paused_at')
      .comment('Timestamp when plan was paused (active → paused)');
    
    table.timestamp('resumed_at')
      .comment('Timestamp when plan was resumed (paused → active)');
  });
  
  console.log('✅ Added launched_at, paused_at, resumed_at columns');
  console.log('   Ready for Production Plans lifecycle management');
}

export async function down(knex) {
  console.log('⏮️  Migration 040 rollback: Removing lifecycle timestamps...');
  
  await knex.schema.withSchema('mes').table('production_plans', (table) => {
    table.dropColumn('launched_at');
    table.dropColumn('paused_at');
    table.dropColumn('resumed_at');
  });
  
  console.log('✅ Removed lifecycle timestamp columns');
}
