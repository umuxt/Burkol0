/**
 * Migration: Create materials table
 * Converts Firebase 'materials' collection to PostgreSQL
 * This is the most complex table with inventory tracking
 */

export function up(knex) {
  return knex.schema.createTable('materials', (table) => {
    // Primary key
    table.increments('id').primary();
    
    // Basic info
    table.string('code', 50).notNullable().unique();
    table.string('name', 255).notNullable();
    table.text('description');
    
    // Categorization
    table.string('type', 50).notNullable(); // raw_material, semi_finished, finished_product, scrap, wip
    table.string('category', 100).notNullable();
    table.string('subcategory', 100);
    
    // Stock tracking
    table.decimal('stock', 15, 3).defaultTo(0);
    table.decimal('reserved', 15, 3).defaultTo(0);
    table.decimal('wip_reserved', 15, 3).defaultTo(0);
    // available is computed: stock - reserved - wip_reserved
    
    table.decimal('reorder_point', 15, 3).defaultTo(0);
    table.decimal('max_stock', 15, 3);
    
    // Units
    table.string('unit', 20).notNullable(); // kg, adet, m, m², m³, litre, ton
    
    // Pricing
    table.decimal('cost_price', 15, 2);
    table.decimal('average_cost', 15, 2);
    table.string('currency', 3).defaultTo('TRY');
    
    // Supplier
    table.integer('primary_supplier_id').unsigned();
    
    // Identification
    table.string('barcode', 100);
    table.string('qr_code', 255);
    
    // Status
    table.string('status', 20).defaultTo('Aktif'); // Aktif, Kaldırıldı
    table.boolean('is_active').defaultTo(true);
    
    // Scrap specific
    table.string('scrap_type', 50); // input_damaged, production_scrap, output_scrap
    table.string('parent_material', 50);
    
    // JSON fields for complex data
    table.jsonb('specifications'); // Technical specs
    table.jsonb('storage'); // Storage location info
    table.jsonb('production_history'); // Production records
    table.jsonb('suppliers_data'); // Supplier details array
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.string('created_by', 255);
    table.string('updated_by', 255);
    
    // Indexes
    table.index('code');
    table.index('name');
    table.index('type');
    table.index('category');
    table.index('status');
    table.index(['type', 'status']);
    table.index(['category', 'status']);
    table.index('barcode');
    
    // Foreign keys
    table.foreign('category').references('id').inTable('materials_categories').onDelete('RESTRICT');
    table.foreign('primary_supplier_id').references('id').inTable('suppliers').onDelete('SET NULL');
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('materials');
}
