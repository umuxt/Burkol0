/**
 * Migration: Create MES operations table
 * Converts Firebase 'mes-operations' collection to PostgreSQL
 */

export function up(knex) {
  return knex.schema.createTable('mes_operations', (table) => {
    // Primary key
    table.string('id', 100).primary();
    
    // Basic info
    table.string('name', 255).notNullable();
    table.string('type', 50);
    
    // Output
    table.string('semi_output_code', 100);
    
    // Defect rate
    table.decimal('expected_defect_rate', 5, 2).defaultTo(0);
    
    // Skills required
    table.jsonb('skills'); // Array of required skills
    
    // Time tracking
    table.integer('nominal_time'); // Minutes
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index('name');
    table.index('type');
    table.index('semi_output_code');
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('mes_operations');
}
