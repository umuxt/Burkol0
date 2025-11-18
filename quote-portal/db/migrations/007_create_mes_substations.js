/**
 * Migration: Create MES substations table
 * Converts Firebase 'mes-substations' collection to PostgreSQL
 */

export function up(knex) {
  return knex.schema.createTable('mes_substations', (table) => {
    // Primary key
    table.string('id', 100).primary();
    
    // Basic info
    table.string('name', 255).notNullable();
    table.string('station_id', 100).notNullable();
    table.text('description');
    
    // Status
    table.boolean('is_active').defaultTo(true);
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index('station_id');
    table.index('name');
    table.index('is_active');
    
    // Foreign key
    table.foreign('station_id').references('id').inTable('mes_stations').onDelete('CASCADE');
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('mes_substations');
}
