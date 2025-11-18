/**
 * Migration: Create MES workers table
 * Converts Firebase 'mes-workers' collection to PostgreSQL
 */

export function up(knex) {
  return knex.schema.createTable('mes_workers', (table) => {
    // Primary key
    table.string('id', 100).primary();
    
    // Basic info
    table.string('name', 255).notNullable();
    table.string('employee_id', 50).unique();
    
    // Skills and capabilities
    table.jsonb('skills'); // Array of skill strings
    table.jsonb('personal_schedule'); // Work schedule data
    
    // Status
    table.boolean('is_active').defaultTo(true);
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index('employee_id');
    table.index('is_active');
    table.index('name');
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('mes_workers');
}
