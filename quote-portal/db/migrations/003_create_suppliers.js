/**
 * Migration: Create suppliers table
 * Converts Firebase 'suppliers' collection to PostgreSQL
 */

export function up(knex) {
  return knex.schema.createTable('suppliers', (table) => {
    // Primary key
    table.increments('id').primary();
    
    // Basic info
    table.string('code', 50).unique();
    table.string('name', 255).notNullable();
    
    // Contact info
    table.string('contact_person', 255);
    table.string('email', 255);
    table.string('phone', 50);
    table.text('address');
    
    // Status
    table.boolean('is_active').defaultTo(true);
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index('code');
    table.index('name');
    table.index('is_active');
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('suppliers');
}
