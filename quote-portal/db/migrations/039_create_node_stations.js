/**
 * Migration 039: Create Node Stations Table
 * 
 * Purpose: Re-create mes.node_stations junction table for production plan nodes
 * 
 * Background:
 * - Migration 023 created node_stations originally
 * - Migration 034 dropped it in favor of polymorphic entity_relations
 * - Now recreating for Production Plans STEP 7 implementation
 * 
 * This table stores the possible stations that can execute each production node.
 * During plan launch, the system selects one of these stations based on availability.
 * 
 * Schema:
 * - node_id (FK → mes.production_plan_nodes)
 * - station_id (FK → mes.stations)
 * - priority (1=primary, 2=fallback, etc.)
 * 
 * Created: 20 Kasım 2025
 */

export async function up(knex) {
  console.log('🔧 Migration 039: Creating mes.node_stations table...');
  
  // Drop orphaned indexes if they exist (from previous failed migration)
  try {
    await knex.raw('DROP INDEX IF EXISTS mes.idx_node_stations_node_id');
    await knex.raw('DROP INDEX IF EXISTS mes.idx_node_stations_station_id');
    await knex.raw('DROP INDEX IF EXISTS mes.idx_node_stations_priority');
    await knex.raw('DROP INDEX IF EXISTS mes.node_stations_node_station_unique');
  } catch (err) {
    console.log('   Note: No orphaned indexes to clean up');
  }
  
  // Create node_stations junction table
  await knex.schema.withSchema('mes').createTable('node_stations', (table) => {
    table.increments('id').primary();
    
    // Foreign keys
    table.integer('node_id').notNullable()
      .references('id').inTable('mes.production_plan_nodes')
      .onDelete('CASCADE')
      .comment('Production plan node ID');
    
    table.string('station_id', 50).notNullable()
      .references('id').inTable('mes.stations')
      .onDelete('RESTRICT')
      .comment('Station that can execute this node');
    
    // Priority for station selection (lower number = higher priority)
    table.integer('priority').notNullable().defaultTo(1)
      .comment('Station selection priority (1=primary, 2=fallback, etc.)');
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Unique constraint: one station per node only once
    table.unique(['node_id', 'station_id'], 'node_stations_node_station_unique');
    
    // Indexes for performance
    table.index('node_id', 'idx_node_stations_node_id');
    table.index('station_id', 'idx_node_stations_station_id');
    table.index(['node_id', 'priority'], 'idx_node_stations_priority');
  });
  
  console.log('✅ Created mes.node_stations table');
  console.log('   - Foreign keys: production_plan_nodes, stations');
  console.log('   - Indexes: node_id, station_id, priority');
  console.log('   - Ready for STEP 7: Production Plans API');
}

export async function down(knex) {
  console.log('⏮️  Migration 039 rollback: Dropping mes.node_stations...');
  
  await knex.schema.withSchema('mes').dropTableIfExists('node_stations');
  
  console.log('✅ Dropped mes.node_stations table');
}
