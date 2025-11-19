/**
 * Migration: Create orders and order_items tables
 * Establishes order management system with individual item tracking
 */

export function up(knex) {
  return knex.schema
    // Orders table under materials schema (part of materials/inventory system)
    .withSchema('materials').createTable('orders', (table) => {
      table.increments('id').primary();
      table.string('order_code', 50).unique().notNullable(); // ORD-2025-0001
      table.integer('order_sequence').notNullable();
      
      // Supplier relationship
      table.integer('supplier_id').unsigned();
      table.foreign('supplier_id')
        .references('id')
        .inTable('materials.suppliers')
        .onDelete('RESTRICT'); // Can't delete supplier with active orders
      table.string('supplier_name', 255); // Denormalized - maps to suppliers.name
      
      // Order details
      table.string('order_status', 50).defaultTo('Taslak');
      table.timestamp('order_date').defaultTo(knex.fn.now());
      table.date('expected_delivery_date');
      
      // Financial
      table.decimal('total_amount', 15, 2).defaultTo(0);
      table.string('currency', 3).defaultTo('TRY');
      table.integer('item_count').defaultTo(0);
      
      // Additional info
      table.text('notes');
      
      // Audit fields
      table.string('created_by', 100);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      // Indexes
      table.index('supplier_id');
      table.index('order_status');
      table.index('order_date');
      table.index(['order_date', 'order_status']); // Composite for reporting
    })
    
    // Order items table under materials schema
    .withSchema('materials').createTable('order_items', (table) => {
      table.increments('id').primary();
      table.string('item_code', 50).unique().notNullable(); // item-01, item-02
      table.integer('item_sequence').notNullable();
      
      // Order relationship
      table.integer('order_id').unsigned().notNullable();
      table.foreign('order_id')
        .references('id')
        .inTable('materials.orders')
        .onDelete('CASCADE'); // Delete items when order deleted
      table.string('order_code', 50).notNullable(); // Denormalized
      
      // Material relationship
      table.integer('material_id').unsigned().notNullable();
      table.foreign('material_id')
        .references('id')
        .inTable('materials.materials')
        .onDelete('RESTRICT'); // Can't delete material with order items
      table.string('material_code', 50).notNullable(); // Denormalized - maps to materials.code
      table.string('material_name', 255); // Denormalized - maps to materials.name
      
      // Quantity and pricing
      table.decimal('quantity', 15, 3).notNullable();
      table.string('unit', 20);
      table.decimal('unit_price', 15, 2);
      table.decimal('total_price', 15, 2);
      
      // Item status tracking
      table.string('item_status', 50).defaultTo('Onay Bekliyor');
      table.date('expected_delivery_date');
      table.timestamp('actual_delivery_date');
      table.string('delivered_by', 100);
      
      // Additional info
      table.text('notes');
      
      // Audit fields
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      // Indexes for performance
      table.index('order_id'); // Fast lookup by order
      table.index('material_id'); // Fast lookup by material
      table.index('item_status'); // Fast filtering by status
      table.index('actual_delivery_date'); // Stock movement tracking
      table.index(['order_id', 'item_status']); // Order status calculation
    })
    
    // Create function to generate order code under materials schema
    .raw(`
      CREATE OR REPLACE FUNCTION materials.generate_order_code(order_year INTEGER)
      RETURNS VARCHAR AS $$
      DECLARE
        sequence_name TEXT;
        next_sequence INTEGER;
        order_code VARCHAR;
      BEGIN
        -- Determine full sequence name with schema
        sequence_name := 'materials.order_sequence_' || order_year::TEXT;
        
        -- Get next sequence value (create sequence if doesn't exist)
        BEGIN
          EXECUTE 'SELECT nextval(' || quote_literal(sequence_name) || ')' INTO next_sequence;
        EXCEPTION WHEN undefined_table THEN
          EXECUTE 'CREATE SEQUENCE ' || sequence_name || ' START 1';
          EXECUTE 'SELECT nextval(' || quote_literal(sequence_name) || ')' INTO next_sequence;
        END;
        
        -- Format: ORD-2025-0001
        order_code := 'ORD-' || order_year::TEXT || '-' || LPAD(next_sequence::TEXT, 4, '0');
        
        RETURN order_code;
      END;
      $$ LANGUAGE plpgsql;
    `);
}

export function down(knex) {
  return knex.schema
    .raw('DROP FUNCTION IF EXISTS materials.generate_order_code(INTEGER)')
    .raw('DROP SEQUENCE IF EXISTS materials.order_sequence_2025 CASCADE')
    .raw('DROP SEQUENCE IF EXISTS materials.order_sequence_2026 CASCADE')
    .withSchema('materials').dropTableIfExists('order_items')
    .withSchema('materials').dropTableIfExists('orders');
}
