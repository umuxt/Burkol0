/**
 * Migration: Reorganize tables to correct schemas
 * Move tables to their logical domains based on usage
 */

export function up(knex) {
  return knex.schema
    // Create quotes schema if not exists
    .raw('CREATE SCHEMA IF NOT EXISTS quotes')
    
    // Move orders to MES (sipariş yönetimi MES'in parçası)
    .raw('ALTER TABLE orders SET SCHEMA mes')
    
    // Move price & form versions to quotes (teklif sistemiyle ilgili)
    .raw('ALTER TABLE price_settings_versions SET SCHEMA quotes')
    .raw('ALTER TABLE price_settings_meta SET SCHEMA quotes')
    .raw('ALTER TABLE form_versions SET SCHEMA quotes')
    .raw('ALTER TABLE form_versions_meta SET SCHEMA quotes')
    
    // Move settings and system_config to a settings schema
    .raw('CREATE SCHEMA IF NOT EXISTS settings')
    .raw('ALTER TABLE settings SET SCHEMA settings')
    .raw('ALTER TABLE system_config SET SCHEMA settings')
    .raw('ALTER TABLE audit_logs SET SCHEMA settings');
}

export function down(knex) {
  return knex.schema
    // Move everything back to public
    .raw('ALTER TABLE mes.orders SET SCHEMA public')
    .raw('ALTER TABLE quotes.price_settings_versions SET SCHEMA public')
    .raw('ALTER TABLE quotes.price_settings_meta SET SCHEMA public')
    .raw('ALTER TABLE quotes.form_versions SET SCHEMA public')
    .raw('ALTER TABLE quotes.form_versions_meta SET SCHEMA public')
    .raw('ALTER TABLE settings.settings SET SCHEMA public')
    .raw('ALTER TABLE settings.system_config SET SCHEMA public')
    .raw('ALTER TABLE settings.audit_logs SET SCHEMA public')
    
    // Drop schemas
    .raw('DROP SCHEMA IF EXISTS settings CASCADE')
    .raw('DROP SCHEMA IF EXISTS quotes CASCADE');
}
