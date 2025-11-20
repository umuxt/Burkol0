/**
 * Migration 041: Add work_order_code to production_plan_nodes
 * 
 * Purpose: Add work_order_code to nodes for easier querying and reporting
 * 
 * Benefits:
 * - Direct access to work order from node without joining to plan
 * - Better for material tracking and reporting
 * - Simpler queries in worker portal and production tracking
 * 
 * Created: 20 Kasım 2025
 */

export async function up(knex) {
  console.log('🔧 Migration 041: Adding work_order_code to production_plan_nodes...');
  
  await knex.schema.withSchema('mes').table('production_plan_nodes', (table) => {
    table.string('work_order_code', 50)
      .comment('Work order code - denormalized from plan for easier access');
    
    // Add index for quick lookups by work order
    table.index('work_order_code', 'idx_nodes_work_order_code');
  });
  
  // Backfill existing nodes with work_order_code from their plans
  await knex.raw(`
    UPDATE mes.production_plan_nodes n
    SET work_order_code = p.work_order_code
    FROM mes.production_plans p
    WHERE n.plan_id = p.id
      AND n.work_order_code IS NULL
  `);
  
  console.log('✅ Added work_order_code to production_plan_nodes');
  console.log('   Backfilled existing records from plans');
}

export async function down(knex) {
  console.log('⏮️  Migration 041 rollback: Removing work_order_code...');
  
  await knex.schema.withSchema('mes').table('production_plan_nodes', (table) => {
    table.dropIndex('work_order_code', 'idx_nodes_work_order_code');
    table.dropColumn('work_order_code');
  });
  
  console.log('✅ Removed work_order_code from production_plan_nodes');
}
