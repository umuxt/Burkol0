/**
 * Migration: Modify existing MES tables for SQL normalization
 * 
 * Changes:
 * 1. mes_workers: Drop array columns, add current task tracking
 * 2. mes_stations: Drop operation_ids array
 * 3. mes_operations: Drop station_ids array
 * 4. mes_substations: Add current_operation tracking
 * 5. mes_production_plans: Drop nodes JSONB, add release metadata
 */

export function up(knex) {
  return knex.schema
    // 1. Modify mes_workers
    .alterTable('mes_workers', (table) => {
      // Drop array columns (data moved to junction tables)
      table.dropColumn('assigned_stations');
      table.dropColumn('qualified_operations');
      
      // Add current task tracking (replaces currentTask object)
      table.string('current_task_plan_id', 100);
      table.string('current_task_node_id', 100);
      table.string('current_task_assignment_id', 100);
      
      // Add name columns
      table.string('created_by_name', 255);
      table.string('updated_by_name', 255);
    })
    
    // 2. Modify mes_stations
    .alterTable('mes_stations', (table) => {
      // Drop operation_ids array (moved to mes_station_operations)
      table.dropColumn('operation_ids');
      
      // Add name columns
      table.string('created_by_name', 255);
      table.string('updated_by_name', 255);
    })
    
    // 3. Modify mes_operations
    .alterTable('mes_operations', (table) => {
      // Drop station_ids array (moved to mes_station_operations)
      table.dropColumn('station_ids');
      
      // Add name columns
      table.string('created_by_name', 255);
      table.string('updated_by_name', 255);
    })
    
    // 4. Modify mes_substations
    .alterTable('mes_substations', (table) => {
      // Add current operation tracking
      table.string('current_operation', 100); // nodeId of current operation
      
      // Add name columns
      table.string('created_by_name', 255);
      table.string('updated_by_name', 255);
    })
    
    // 5. Modify mes_production_plans
    .alterTable('mes_production_plans', (table) => {
      // Drop nodes JSONB (moved to mes_production_plan_nodes table)
      table.dropColumn('nodes');
      
      // Drop JSONB columns - will use separate tables
      table.dropColumn('material_summary');
      table.dropColumn('metadata');
      
      // Add release metadata
      table.timestamp('released_at');
      table.string('released_by', 255);
      table.string('released_by_name', 255);
      
      // Add name columns
      table.string('created_by_name', 255);
      table.string('updated_by_name', 255);
      
      // Add direct columns instead of JSONB metadata
      table.integer('quantity');
      table.string('launch_status', 50);
      table.boolean('auto_assign').defaultTo(false);
    });
}

export function down(knex) {
  return knex.schema
    // Rollback mes_production_plans
    .alterTable('mes_production_plans', (table) => {
      table.jsonb('nodes'); // Restore nodes
      table.jsonb('material_summary');
      table.jsonb('metadata');
      table.dropColumn('released_at');
      table.dropColumn('released_by');
      table.dropColumn('released_by_name');
      table.dropColumn('created_by_name');
      table.dropColumn('updated_by_name');
      table.dropColumn('quantity');
      table.dropColumn('launch_status');
      table.dropColumn('auto_assign');
    })
    
    // Rollback mes_substations
    .alterTable('mes_substations', (table) => {
      table.dropColumn('current_operation');
      table.dropColumn('created_by_name');
      table.dropColumn('updated_by_name');
    })
    
    // Rollback mes_operations
    .alterTable('mes_operations', (table) => {
      table.jsonb('station_ids');
      table.dropColumn('created_by_name');
      table.dropColumn('updated_by_name');
    })
    
    // Rollback mes_stations
    .alterTable('mes_stations', (table) => {
      table.jsonb('operation_ids');
      table.dropColumn('created_by_name');
      table.dropColumn('updated_by_name');
    })
    
    // Rollback mes_workers
    .alterTable('mes_workers', (table) => {
      table.jsonb('assigned_stations');
      table.jsonb('qualified_operations');
      table.dropColumn('current_task_plan_id');
      table.dropColumn('current_task_node_id');
      table.dropColumn('current_task_assignment_id');
      table.dropColumn('created_by_name');
      table.dropColumn('updated_by_name');
    });
}
