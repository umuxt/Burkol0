/**
 * Migration 044: Create Node Predecessors Table
 * 
 * Purpose: Track dependency relationships between production plan nodes
 * Enables parallel execution with topological sort
 * 
 * Background:
 * - Originally created in Migration 023
 * - Dropped in Migration 034
 * - Recreating for PHASE 3 parallel execution support
 * 
 * Schema:
 * - node_id (FK → mes.production_plan_nodes) - Dependent node
 * - predecessor_node_id (FK → mes.production_plan_nodes) - Must complete first
 * 
 * Example:
 * - Node C depends on Node A and B completing first
 * - Rows: (C, A), (C, B)
 * - Topological sort ensures A and B execute before C
 * 
 * Created: 20 Kasım 2025
 */

export async function up(knex) {
  console.log('🔗 Migration 044: Creating mes.node_predecessors table...');
  
  // Create node_predecessors junction table
  await knex.schema.withSchema('mes').createTable('node_predecessors', (table) => {
    table.increments('id').primary();
    
    // Foreign keys (both reference production_plan_nodes)
    table.integer('node_id').notNullable()
      .references('id').inTable('mes.production_plan_nodes')
      .onDelete('CASCADE')
      .comment('Node that depends on predecessor');
    
    table.integer('predecessor_node_id').notNullable()
      .references('id').inTable('mes.production_plan_nodes')
      .onDelete('CASCADE')
      .comment('Node that must complete first');
    
    // Prevent duplicate dependencies
    table.unique(['node_id', 'predecessor_node_id']);
    
    // Indexes for performance
    table.index('node_id', 'idx_node_predecessors_node');
    table.index('predecessor_node_id', 'idx_node_predecessors_pred');
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
  
  console.log('✅ mes.node_predecessors table created');
  console.log('   → Enables parallel node execution with dependency tracking');
}

export async function down(knex) {
  console.log('⏪ Rolling back Migration 044...');
  
  await knex.schema.withSchema('mes').dropTableIfExists('node_predecessors');
  
  console.log('✅ mes.node_predecessors table dropped');
}
