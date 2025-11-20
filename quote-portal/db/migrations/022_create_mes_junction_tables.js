/**
 * Migration: Create MES junction tables for many-to-many relationships
 * 
 * This migration extracts array fields from master data tables into proper
 * relational junction tables:
 * - workers.assignedStations[] → mes_worker_stations
 * - workers.qualifiedOperations[] → mes_worker_operations
 * - stations.operationIds[] → mes_station_operations
 * - operations.stationIds[] → mes_station_operations (same table)
 */

export function up(knex) {
  return knex.schema
    // Worker-Station assignments (many-to-many)
    .createTable('mes_worker_stations', (table) => {
      table.increments('id').primary();
      table.string('worker_id', 100).notNullable()
        .references('id').inTable('mes_workers').onDelete('CASCADE');
      table.string('station_id', 100).notNullable()
        .references('id').inTable('mes_stations').onDelete('CASCADE');
      
      table.timestamp('assigned_at').defaultTo(knex.fn.now());
      
      table.unique(['worker_id', 'station_id']);
      table.index('worker_id');
      table.index('station_id');
    })
    
    // Worker-Operation qualifications (many-to-many)
    .createTable('mes_worker_operations', (table) => {
      table.increments('id').primary();
      table.string('worker_id', 100).notNullable()
        .references('id').inTable('mes_workers').onDelete('CASCADE');
      table.string('operation_id', 100).notNullable()
        .references('id').inTable('mes_operations').onDelete('CASCADE');
      
      table.timestamp('qualified_at').defaultTo(knex.fn.now());
      
      table.unique(['worker_id', 'operation_id']);
      table.index('worker_id');
      table.index('operation_id');
    })
    
    // Station-Operation capabilities (many-to-many)
    .createTable('mes_station_operations', (table) => {
      table.increments('id').primary();
      table.string('station_id', 100).notNullable()
        .references('id').inTable('mes_stations').onDelete('CASCADE');
      table.string('operation_id', 100).notNullable()
        .references('id').inTable('mes_operations').onDelete('CASCADE');
      
      table.timestamp('created_at').defaultTo(knex.fn.now());
      
      table.unique(['station_id', 'operation_id']);
      table.index('station_id');
      table.index('operation_id');
    });
}

export function down(knex) {
  return knex.schema
    .dropTableIfExists('mes_station_operations')
    .dropTableIfExists('mes_worker_operations')
    .dropTableIfExists('mes_worker_stations');
}
