/**
 * Migration: Create MES stations table
 * Converts Firebase 'mes-stations' collection to PostgreSQL
 */

export function up(knex) {
  return knex.schema.createTable('mes_stations', (table) => {
    // Primary key
    table.string('id', 100).primary();
    
    // Basic info
    table.string('name', 255).notNullable();
    table.string('type', 50);
    table.text('description');
    
    // Capabilities
    table.jsonb('capabilities');
    
    // Status
    table.boolean('is_active').defaultTo(true);
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index('name');
    table.index('type');
    table.index('is_active');
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('mes_stations');
}
