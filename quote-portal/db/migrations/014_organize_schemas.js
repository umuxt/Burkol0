/**
 * Migration: Create schemas for better organization
 * Organize tables into logical schemas:
 * - public: Core tables (users, sessions)
 * - materials: Material management
 * - mes: Manufacturing Execution System
 * - quotes: Quote management
 */

export function up(knex) {
  return knex.schema
    // Create schemas
    .raw('CREATE SCHEMA IF NOT EXISTS materials')
    .raw('CREATE SCHEMA IF NOT EXISTS mes')
    .raw('CREATE SCHEMA IF NOT EXISTS quotes')
    
    // Move materials tables
    .raw('ALTER TABLE materials_categories SET SCHEMA materials')
    .raw('ALTER TABLE suppliers SET SCHEMA materials')
    .raw('ALTER TABLE materials SET SCHEMA materials')
    
    // Move MES tables
    .raw('ALTER TABLE mes_workers SET SCHEMA mes')
    .raw('ALTER TABLE mes_stations SET SCHEMA mes')
    .raw('ALTER TABLE mes_substations SET SCHEMA mes')
    .raw('ALTER TABLE mes_operations SET SCHEMA mes')
    .raw('ALTER TABLE mes_production_plans SET SCHEMA mes')
    .raw('ALTER TABLE mes_worker_assignments SET SCHEMA mes')
    .raw('ALTER TABLE mes_approved_quotes SET SCHEMA mes')
    .raw('ALTER TABLE mes_alerts SET SCHEMA mes')
    .raw('ALTER TABLE mes_work_orders SET SCHEMA mes')
    .raw('ALTER TABLE mes_settings SET SCHEMA mes')
    .raw('ALTER TABLE mes_counters SET SCHEMA mes')
    
    // Move quotes table
    .raw('ALTER TABLE quotes SET SCHEMA quotes');
    
    // users and sessions stay in public schema
}

export function down(knex) {
  return knex.schema
    // Move tables back to public
    .raw('ALTER TABLE materials.materials_categories SET SCHEMA public')
    .raw('ALTER TABLE materials.suppliers SET SCHEMA public')
    .raw('ALTER TABLE materials.materials SET SCHEMA public')
    
    .raw('ALTER TABLE mes.mes_workers SET SCHEMA public')
    .raw('ALTER TABLE mes.mes_stations SET SCHEMA public')
    .raw('ALTER TABLE mes.mes_substations SET SCHEMA public')
    .raw('ALTER TABLE mes.mes_operations SET SCHEMA public')
    .raw('ALTER TABLE mes.mes_production_plans SET SCHEMA public')
    .raw('ALTER TABLE mes.mes_worker_assignments SET SCHEMA public')
    .raw('ALTER TABLE mes.mes_approved_quotes SET SCHEMA public')
    .raw('ALTER TABLE mes.mes_alerts SET SCHEMA public')
    .raw('ALTER TABLE mes.mes_work_orders SET SCHEMA public')
    .raw('ALTER TABLE mes.mes_settings SET SCHEMA public')
    .raw('ALTER TABLE mes.mes_counters SET SCHEMA public')
    
    .raw('ALTER TABLE quotes.quotes SET SCHEMA public')
    
    // Drop schemas
    .raw('DROP SCHEMA IF EXISTS quotes CASCADE')
    .raw('DROP SCHEMA IF EXISTS mes CASCADE')
    .raw('DROP SCHEMA IF EXISTS materials CASCADE');
}
