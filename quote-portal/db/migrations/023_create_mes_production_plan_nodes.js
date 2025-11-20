/**
 * Migration: Create MES production plan nodes table
 * 
 * This migration extracts the 'nodes' array from mes_production_plans.nodes (JSONB)
 * into a proper relational table with foreign keys and indexes.
 * 
 * Firebase structure:
 * mes-production-plans.nodes[] = [
 *   { nodeId, name, operationId, nominalTime, efficiency, assignedStations[], ... }
 * ]
 * 
 * SQL structure:
 * mes_production_plan_nodes (one row per node)
 *   ├─> mes_node_stations (many-to-many: node ↔ station)
 *   ├─> mes_node_substations (many-to-many: node ↔ substation)
 *   ├─> mes_node_material_inputs (one-to-many: node → materials)
 *   └─> mes_node_predecessors (many-to-many: node ↔ predecessor nodes)
 */

export function up(knex) {
  return knex.schema
    // Main production plan nodes table
    .createTable('mes_production_plan_nodes', (table) => {
      table.increments('id').primary();
      
      // Node identification
      table.string('node_id', 100).notNullable(); // nodeId from Firebase (e.g., "node-1")
      table.string('plan_id', 100).notNullable()
        .references('id').inTable('mes_production_plans').onDelete('CASCADE');
      
      // Operation details
      table.string('name', 255).notNullable();
      table.string('operation_id', 100)
        .references('id').inTable('mes_operations').onDelete('SET NULL');
      
      // Timing
      table.integer('nominal_time').notNullable(); // minutes
      table.decimal('efficiency', 4, 3).defaultTo(0.85); // 0.01-1.0 (e.g., 0.850)
      table.decimal('effective_time', 10, 2); // nominalTime / efficiency
      
      // Assignment
      table.string('assignment_mode', 20).defaultTo('auto'); // 'auto' or 'manual'
      table.string('assigned_worker_id', 100)
        .references('id').inTable('mes_workers').onDelete('SET NULL');
      
      // Output definition
      table.string('output_code', 100); // Material code for output (e.g., "WIP-001F")
      table.decimal('output_qty', 10, 2).notNullable();
      table.string('output_unit', 50);
      
      // Estimated timing (auto-calculated)
      table.timestamp('estimated_start_time');
      table.timestamp('estimated_end_time');
      
      // Ordering
      table.integer('sequence_order'); // Display order in UI
      
      // Metadata
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      // Constraints
      table.unique(['plan_id', 'node_id']); // Node ID must be unique within plan
      
      // Indexes
      table.index('plan_id');
      table.index('operation_id');
      table.index('assigned_worker_id');
      table.index(['plan_id', 'sequence_order']);
    })
    
    // Node-Station assignments (many-to-many with priority)
    .createTable('mes_node_stations', (table) => {
      table.increments('id').primary();
      table.integer('node_id').notNullable()
        .references('id').inTable('mes_production_plan_nodes').onDelete('CASCADE');
      table.string('station_id', 100).notNullable()
        .references('id').inTable('mes_stations').onDelete('CASCADE');
      
      table.integer('priority').defaultTo(1); // 1=primary, 2=fallback, etc.
      
      table.unique(['node_id', 'station_id']);
      table.index('node_id');
      table.index('station_id');
    })
    
    // Node-Substation assignments (many-to-many)
    .createTable('mes_node_substations', (table) => {
      table.increments('id').primary();
      table.integer('node_id').notNullable()
        .references('id').inTable('mes_production_plan_nodes').onDelete('CASCADE');
      table.string('substation_id', 100).notNullable()
        .references('id').inTable('mes_substations').onDelete('CASCADE');
      
      table.unique(['node_id', 'substation_id']);
      table.index('node_id');
      table.index('substation_id');
    })
    
    // Node material inputs (one-to-many)
    .createTable('mes_node_material_inputs', (table) => {
      table.increments('id').primary();
      table.integer('node_id').notNullable()
        .references('id').inTable('mes_production_plan_nodes').onDelete('CASCADE');
      
      table.string('material_code', 100).notNullable(); // References materials.code (SQL)
      table.decimal('required_quantity', 10, 2).notNullable();
      table.decimal('unit_ratio', 10, 4).defaultTo(1.0);
      table.boolean('is_derived').defaultTo(false); // true if WIP from previous node
      
      table.timestamp('created_at').defaultTo(knex.fn.now());
      
      table.index('node_id');
      table.index('material_code');
    })
    
    // Node predecessors (dependency graph, many-to-many)
    .createTable('mes_node_predecessors', (table) => {
      table.increments('id').primary();
      table.integer('node_id').notNullable()
        .references('id').inTable('mes_production_plan_nodes').onDelete('CASCADE');
      table.integer('predecessor_node_id').notNullable()
        .references('id').inTable('mes_production_plan_nodes').onDelete('CASCADE');
      
      table.unique(['node_id', 'predecessor_node_id']);
      table.index('node_id');
      table.index('predecessor_node_id');
    });
}

export function down(knex) {
  return knex.schema
    .dropTableIfExists('mes_node_predecessors')
    .dropTableIfExists('mes_node_material_inputs')
    .dropTableIfExists('mes_node_substations')
    .dropTableIfExists('mes_node_stations')
    .dropTableIfExists('mes_production_plan_nodes');
}
