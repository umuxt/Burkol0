/**
 * Migration 034: Drop Old Junction Tables
 * 
 * Purpose: Remove 6 junction tables that have been replaced by mes_entity_relations
 * 
 * Tables to drop:
 * 1. mes_node_predecessors → entity_relations (source_type='node', relation_type='predecessor')
 * 2. mes_node_substations → entity_relations (source_type='node', relation_type='substation')
 * 3. mes_node_stations → entity_relations (source_type='node', relation_type='station')
 * 4. mes_worker_operations → entity_relations (source_type='worker', relation_type='operation')
 * 5. mes_station_operations → entity_relations (source_type='station', relation_type='operation')
 * 6. mes_worker_stations → entity_relations (source_type='worker', relation_type='station')
 * 
 * WARNING: This migration should only be run after:
 * 1. Migration 032 created mes_entity_relations
 * 2. All backend code updated to use polymorphic queries
 * 3. Data backup completed
 * 
 * Status: Junction tables are EMPTY (0 records verified)
 * Safe to drop: YES - no data loss
 * 
 * Created: 2025-11-20
 */

export async function up(knex) {
  console.log('🗑️  Migration 034: Dropping old junction tables...');
  
  // Drop tables in order (avoid FK constraint issues)
  // Tables with no FKs first, then tables with FKs
  
  // 1. mes_node_predecessors (no FK references to this table)
  console.log('   Dropping mes_node_predecessors...');
  await knex.schema.dropTableIfExists('mes_node_predecessors');
  
  // 2. mes_node_substations (FK to mes_production_plan_nodes, mes_substations)
  console.log('   Dropping mes_node_substations...');
  await knex.schema.dropTableIfExists('mes_node_substations');
  
  // 3. mes_node_stations (FK to mes_production_plan_nodes, mes_stations)
  console.log('   Dropping mes_node_stations...');
  await knex.schema.dropTableIfExists('mes_node_stations');
  
  // 4. mes_worker_operations (FK to mes_workers, mes_operations)
  console.log('   Dropping mes_worker_operations...');
  await knex.schema.dropTableIfExists('mes_worker_operations');
  
  // 5. mes_station_operations (FK to mes_stations, mes_operations)
  console.log('   Dropping mes_station_operations...');
  await knex.schema.dropTableIfExists('mes_station_operations');
  
  // 6. mes_worker_stations (FK to mes_workers, mes_stations)
  console.log('   Dropping mes_worker_stations...');
  await knex.schema.dropTableIfExists('mes_worker_stations');
  
  console.log('✅ Migration 034 complete: 6 junction tables dropped');
  console.log('   Database optimized: 24 → 18 tables (MES schema)');
  console.log('   All relationships now in mes_entity_relations');
}

export async function down(knex) {
  console.log('⏮️  Migration 034 rollback: Recreating junction tables...');
  
  // Recreate tables in reverse order (tables with FKs first)
  
  // 6. mes_worker_stations
  console.log('   Recreating mes_worker_stations...');
  await knex.schema.createTable('mes_worker_stations', (table) => {
    table.increments('id').primary();
    table.string('worker_id', 50).notNullable();
    table.string('station_id', 50).notNullable();
    table.timestamp('assigned_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Foreign keys
    table.foreign('worker_id').references('id').inTable('mes_workers').onDelete('CASCADE');
    table.foreign('station_id').references('id').inTable('mes_stations').onDelete('CASCADE');
    
    // Unique constraint
    table.unique(['worker_id', 'station_id']);
  });
  
  // 5. mes_station_operations
  console.log('   Recreating mes_station_operations...');
  await knex.schema.createTable('mes_station_operations', (table) => {
    table.increments('id').primary();
    table.string('station_id', 50).notNullable();
    table.string('operation_id', 50).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Foreign keys
    table.foreign('station_id').references('id').inTable('mes_stations').onDelete('CASCADE');
    table.foreign('operation_id').references('id').inTable('mes_operations').onDelete('CASCADE');
    
    // Unique constraint
    table.unique(['station_id', 'operation_id']);
  });
  
  // 4. mes_worker_operations
  console.log('   Recreating mes_worker_operations...');
  await knex.schema.createTable('mes_worker_operations', (table) => {
    table.increments('id').primary();
    table.string('worker_id', 50).notNullable();
    table.string('operation_id', 50).notNullable();
    table.timestamp('qualified_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Foreign keys
    table.foreign('worker_id').references('id').inTable('mes_workers').onDelete('CASCADE');
    table.foreign('operation_id').references('id').inTable('mes_operations').onDelete('CASCADE');
    
    // Unique constraint
    table.unique(['worker_id', 'operation_id']);
  });
  
  // 3. mes_node_stations
  console.log('   Recreating mes_node_stations...');
  await knex.schema.createTable('mes_node_stations', (table) => {
    table.increments('id').primary();
    table.integer('node_id').notNullable();
    table.string('station_id', 50).notNullable();
    table.integer('priority').defaultTo(1);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Foreign keys
    table.foreign('node_id').references('id').inTable('mes_production_plan_nodes').onDelete('CASCADE');
    table.foreign('station_id').references('id').inTable('mes_stations').onDelete('CASCADE');
    
    // Unique constraint
    table.unique(['node_id', 'station_id']);
  });
  
  // 2. mes_node_substations
  console.log('   Recreating mes_node_substations...');
  await knex.schema.createTable('mes_node_substations', (table) => {
    table.increments('id').primary();
    table.integer('node_id').notNullable();
    table.string('substation_id', 50).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Foreign keys
    table.foreign('node_id').references('id').inTable('mes_production_plan_nodes').onDelete('CASCADE');
    table.foreign('substation_id').references('id').inTable('mes_substations').onDelete('CASCADE');
    
    // Unique constraint
    table.unique(['node_id', 'substation_id']);
  });
  
  // 1. mes_node_predecessors
  console.log('   Recreating mes_node_predecessors...');
  await knex.schema.createTable('mes_node_predecessors', (table) => {
    table.increments('id').primary();
    table.integer('node_id').notNullable();
    table.integer('predecessor_node_id').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Foreign keys
    table.foreign('node_id').references('id').inTable('mes_production_plan_nodes').onDelete('CASCADE');
    table.foreign('predecessor_node_id').references('id').inTable('mes_production_plan_nodes').onDelete('CASCADE');
    
    // Unique constraint
    table.unique(['node_id', 'predecessor_node_id']);
  });
  
  console.log('✅ Migration 034 rollback complete: Junction tables recreated');
  console.log('   NOTE: Data NOT restored - use Migration 033 to restore data');
}
