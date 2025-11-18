/**
 * Migration: Create users table
 * Converts Firebase 'users' collection to PostgreSQL
 */

export function up(knex) {
  return knex.schema.createTable('users', (table) => {
    // Primary key
    table.increments('id').primary();
    
    // Basic info
    table.string('email', 255).notNullable().unique();
    table.string('name', 255);
    table.string('role', 50).defaultTo('admin');
    
    // Status
    table.boolean('active').defaultTo(true);
    
    // Authentication - Hash based
    table.text('pw_hash');
    table.text('pw_salt');
    
    // Plain password (temporary, for migration compatibility)
    table.string('plain_password', 255);
    
    // Worker reference (if user is a worker)
    table.string('worker_id', 100);
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('deactivated_at');
    
    // Indexes
    table.index('email');
    table.index('role');
    table.index('worker_id');
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('users');
}
