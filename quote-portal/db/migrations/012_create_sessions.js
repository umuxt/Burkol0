/**
 * Migration: Create sessions table
 * Converts Firebase 'sessions' collection to PostgreSQL
 */

export function up(knex) {
  return knex.schema.createTable('sessions', (table) => {
    // Primary key
    table.string('session_id', 100).primary();
    
    // Authentication
    table.string('token', 255).notNullable().unique();
    table.string('email', 255).notNullable();
    table.string('user_name', 255);
    table.string('worker_id', 100);
    
    // Session timing
    table.timestamp('login_time').notNullable();
    table.date('login_date').notNullable();
    table.timestamp('expires').notNullable();
    table.timestamp('last_activity_at');
    table.timestamp('logout_time');
    
    // Status
    table.boolean('is_active').defaultTo(true);
    
    // Activity log
    table.jsonb('activity_log'); // Array of activity records
    
    // Indexes
    table.index('token');
    table.index('email');
    table.index('worker_id');
    table.index(['is_active', 'expires']);
    table.index('login_date');
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('sessions');
}
