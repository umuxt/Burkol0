/**
 * Migration: Create material_supplier_relation junction table
 * Establishes many-to-many relationship between materials and suppliers
 */

export function up(knex) {
  return knex.schema.withSchema('materials').createTable('material_supplier_relation', (table) => {
    // Composite primary key
    table.integer('material_id').unsigned().notNullable();
    table.integer('supplier_id').unsigned().notNullable();
    
    // Foreign keys
    table.foreign('material_id')
      .references('id')
      .inTable('materials.materials')
      .onDelete('CASCADE'); // If material deleted, remove relations
    
    table.foreign('supplier_id')
      .references('id')
      .inTable('materials.suppliers')
      .onDelete('CASCADE'); // If supplier deleted, remove relations
    
    // Relation metadata
    table.boolean('is_primary').defaultTo(false); // Primary supplier flag
    table.decimal('cost_price', 15, 2); // Supplier-specific price
    table.integer('lead_time_days'); // Delivery time in days
    table.decimal('minimum_order_quantity', 15, 3); // MOQ
    table.string('supplier_material_code', 100); // Supplier's code for this material
    table.text('notes'); // Additional notes
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Composite primary key (material_id, supplier_id)
    table.primary(['material_id', 'supplier_id']);
    
    // Indexes for performance
    table.index('material_id');
    table.index('supplier_id');
    table.index('is_primary');
  });
}

export function down(knex) {
  return knex.schema.withSchema('materials').dropTableIfExists('material_supplier_relation');
}
