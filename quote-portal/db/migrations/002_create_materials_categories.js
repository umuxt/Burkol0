/**
 * Migration: Create materials_categories table
 * Converts Firebase 'materials-categories' collection to PostgreSQL
 */

export function up(knex) {
  return knex.schema.createTable('materials_categories', (table) => {
    // Primary key
    table.string('id', 100).primary();
    
    // Basic info
    table.string('name', 255).notNullable();
    table.text('description');
    
    // Hierarchy
    table.string('parent_category', 100);
    
    // Visual
    table.string('icon', 100);
    table.string('color', 7); // Hex color
    
    // Ordering
    table.integer('sort_order').defaultTo(0);
    
    // Status
    table.boolean('is_active').defaultTo(true);
    
    // Stats
    table.integer('material_count').defaultTo(0);
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index('name');
    table.index('parent_category');
    table.index(['is_active', 'sort_order']);
    
    // Foreign key
    table.foreign('parent_category').references('id').inTable('materials_categories').onDelete('SET NULL');
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('materials_categories');
}
