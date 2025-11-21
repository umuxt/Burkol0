/**
 * Migration: Create orders and order_items tables
 * Establishes order management system with individual item tracking
 */

export function up(knex) {
  return knex.schema
    // Orders table under materials schema (part of materials/inventory system)
    .withSchema('materials').createTable('orders', (table) => {
      table.increments('id').primary();
      table.string('orderCode', 50).unique().notNullable(); // ORD-2025-0001
      table.integer('orderSequence').notNullable();
      
      // Supplier relationship
      table.integer('supplierId').unsigned();
      table.foreign('supplierId')
        .references('id')
        .inTable('materials.suppliers')
        .onDelete('RESTRICT'); // Can't delete supplier with active orders
      table.string('supplierName', 255); // Denormalized - maps to suppliers.name
      
      // Order details
      table.string('orderStatus', 50).defaultTo('Taslak');
      table.timestamp('orderDate').defaultTo(knex.fn.now());
      table.date('expectedDeliveryDate');
      
      // Financial
      table.decimal('totalAmount', 15, 2).defaultTo(0);
      table.string('currency', 3).defaultTo('TRY');
      table.integer('itemCount').defaultTo(0);
      
      // Additional info
      table.text('notes');
      
      // Audit fields
      table.string('createdBy', 100);
      table.timestamp('createdAt').defaultTo(knex.fn.now());
      table.timestamp('updatedAt').defaultTo(knex.fn.now());
      
      // Indexes
      table.index('supplierId');
      table.index('orderStatus');
      table.index('orderDate');
      table.index(['orderDate', 'orderStatus']); // Composite for reporting
    })
    
    // Order items table under materials schema
    .withSchema('materials').createTable('order_items', (table) => {
      table.increments('id').primary();
      table.string('itemCode', 50).unique().notNullable(); // item-01, item-02
      table.integer('itemSequence').notNullable();
      
      // Order relationship
      table.integer('orderId').unsigned().notNullable();
      table.foreign('orderId')
        .references('id')
        .inTable('materials.orders')
        .onDelete('CASCADE'); // Delete items when order deleted
      table.string('orderCode', 50).notNullable(); // Denormalized
      
      // Material relationship
      table.integer('materialId').unsigned().notNullable();
      table.foreign('materialId')
        .references('id')
        .inTable('materials.materials')
        .onDelete('RESTRICT'); // Can't delete material with order items
      table.string('materialCode', 50).notNullable(); // Denormalized - maps to materials.code
      table.string('materialName', 255); // Denormalized - maps to materials.name
      
      // Quantity and pricing
      table.decimal('quantity', 15, 3).notNullable();
      table.string('unit', 20);
      table.decimal('unitPrice', 15, 2);
      table.decimal('totalPrice', 15, 2);
      
      // Item status tracking
      table.string('itemStatus', 50).defaultTo('Onay Bekliyor');
      table.date('expectedDeliveryDate');
      table.timestamp('actualDeliveryDate');
      table.string('deliveredBy', 100);
      
      // Additional info
      table.text('notes');
      
      // Audit fields
      table.timestamp('createdAt').defaultTo(knex.fn.now());
      table.timestamp('updatedAt').defaultTo(knex.fn.now());
      
      // Indexes for performance
      table.index('orderId'); // Fast lookup by order
      table.index('materialId'); // Fast lookup by material
      table.index('itemStatus'); // Fast filtering by status
      table.index('actualDeliveryDate'); // Stock movement tracking
      table.index(['orderId', 'itemStatus']); // Order status calculation
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
