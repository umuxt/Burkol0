/**
 * Migration: Create tables for material tracking (no JSONB)
 * 
 * Uses existing materials.stock_movements for movement history
 * Only creates aggregation tables for plan material summary
 */

export function up(knex) {
  return knex.schema
    // Material Requirements - Aggregated material needs per plan
    .createTable('mes_plan_material_requirements', (table) => {
      table.increments('id').primary();
      table.string('plan_id', 100).notNullable()
        .references('id').inTable('mes_production_plans').onDelete('CASCADE');
      
      table.string('material_code', 100).notNullable();
      table.string('material_name', 255);
      table.decimal('required_quantity', 10, 2).notNullable();
      table.string('unit', 50);
      table.boolean('is_derived').defaultTo(false); // WIP from previous nodes
      table.boolean('has_shortage').defaultTo(false);
      
      table.timestamp('created_at').defaultTo(knex.fn.now());
      
      table.index(['plan_id', 'material_code']);
      table.index('material_code');
    })
    
    // WIP Outputs - Materials produced by this plan
    .createTable('mes_plan_wip_outputs', (table) => {
      table.increments('id').primary();
      table.string('plan_id', 100).notNullable()
        .references('id').inTable('mes_production_plans').onDelete('CASCADE');
      
      table.string('wip_code', 100).notNullable();
      table.string('wip_name', 255);
      table.decimal('quantity', 10, 2).notNullable();
      table.string('unit', 50);
      table.integer('source_node_id'); // Which node produces this (FK to mes_production_plan_nodes)
      table.string('source_operation_id', 100);
      
      table.timestamp('created_at').defaultTo(knex.fn.now());
      
      table.index(['plan_id', 'wip_code']);
      table.index('wip_code');
      
      // Foreign key to node
      table.foreign('source_node_id')
        .references('id')
        .inTable('mes_production_plan_nodes')
        .onDelete('SET NULL');
    });
  
  // Note: Stock movements use existing materials.stock_movements table
  // with related_plan_id and related_node_id fields for MES integration
}

export function down(knex) {
  return knex.schema
    .dropTableIfExists('mes_plan_wip_outputs')
    .dropTableIfExists('mes_plan_material_requirements');
}
