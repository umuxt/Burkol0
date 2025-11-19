/**
 * Migration: Create Quotes System Tables
 * 
 * Full relational design - NO JSONB usage
 * All data stored in proper SQL tables with relationships
 */

export async function up(knex) {
  // Create quotes schema
  await knex.raw('CREATE SCHEMA IF NOT EXISTS quotes');

  // ==================== FORM SYSTEM ====================
  
  // 1. FORM TEMPLATES - Master form definitions
  await knex.schema.withSchema('quotes').createTable('form_templates', (table) => {
    table.increments('id').primary();
    table.string('code', 50).unique().notNullable().comment('e.g., QUOTE_FORM_V1');
    table.string('name', 255).notNullable();
    table.text('description');
    table.boolean('is_active').defaultTo(true);
    table.integer('version').notNullable().defaultTo(1);
    table.string('created_by', 100);
    table.timestamps(true, true);
    
    table.index('is_active');
    table.index('version');
  });

  // 2. FORM FIELDS - Individual form fields (reusable)
  await knex.schema.withSchema('quotes').createTable('form_fields', (table) => {
    table.increments('id').primary();
    table.integer('template_id').unsigned().notNullable().references('id').inTable('quotes.form_templates').onDelete('CASCADE');
    table.string('field_code', 100).notNullable().comment('e.g., material, qty, dimensions');
    table.string('field_name', 255).notNullable().comment('Display name');
    table.string('field_type', 50).notNullable().comment('text, number, select, multiselect, date, file');
    table.integer('sort_order').notNullable().defaultTo(0);
    table.boolean('is_required').defaultTo(false);
    table.text('placeholder');
    table.text('help_text');
    table.text('validation_rule').comment('Regex or rule expression');
    table.string('default_value', 255);
    table.timestamps(true, true);
    
    table.unique(['template_id', 'field_code']);
    table.index('template_id');
    table.index('field_type');
  });

  // 3. FORM FIELD OPTIONS - For select/multiselect fields
  await knex.schema.withSchema('quotes').createTable('form_field_options', (table) => {
    table.increments('id').primary();
    table.integer('field_id').unsigned().notNullable().references('id').inTable('quotes.form_fields').onDelete('CASCADE');
    table.string('option_value', 255).notNullable();
    table.string('option_label', 255).notNullable();
    table.integer('sort_order').notNullable().defaultTo(0);
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
    
    table.index('field_id');
    table.index(['field_id', 'is_active']);
  });

  // ==================== PRICING SYSTEM ====================
  
  // 4. PRICE PARAMETERS - Pricing calculation parameters
  await knex.schema.withSchema('quotes').createTable('price_parameters', (table) => {
    table.increments('id').primary();
    table.string('code', 100).unique().notNullable().comment('e.g., material_cost, labor_rate');
    table.string('name', 255).notNullable();
    table.string('type', 50).notNullable().comment('fixed, form_lookup, calculated, material_based');
    table.decimal('fixed_value', 15, 4).comment('For fixed type parameters');
    table.string('unit', 50).comment('kg, hour, m2, piece');
    table.text('description');
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
    
    table.index('type');
    table.index('is_active');
  });

  // 5. PRICE PARAMETER LOOKUPS - Lookup tables for form-based pricing
  await knex.schema.withSchema('quotes').createTable('price_parameter_lookups', (table) => {
    table.increments('id').primary();
    table.integer('parameter_id').unsigned().notNullable().references('id').inTable('quotes.price_parameters').onDelete('CASCADE');
    table.string('form_field_code', 100).notNullable().comment('Links to form_fields.field_code');
    table.string('option_value', 255).notNullable().comment('Form field option value');
    table.decimal('price_value', 15, 4).notNullable();
    table.string('currency', 10).defaultTo('TRY');
    table.date('valid_from');
    table.date('valid_to');
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
    
    table.index('parameter_id');
    table.index('form_field_code');
    table.index(['parameter_id', 'option_value']);
    table.index(['is_active', 'valid_from', 'valid_to']);
  });

  // 6. PRICE FORMULAS - Pricing calculation formulas
  await knex.schema.withSchema('quotes').createTable('price_formulas', (table) => {
    table.increments('id').primary();
    table.string('code', 100).unique().notNullable();
    table.string('name', 255).notNullable();
    table.text('formula_expression').notNullable().comment('e.g., material_cost * qty + labor_rate * hours');
    table.text('description');
    table.boolean('is_active').defaultTo(true);
    table.integer('version').notNullable().defaultTo(1);
    table.string('created_by', 100);
    table.timestamps(true, true);
    
    table.index('is_active');
    table.index('version');
  });

  // 7. PRICE FORMULA PARAMETERS - Links formulas to parameters
  await knex.schema.withSchema('quotes').createTable('price_formula_parameters', (table) => {
    table.increments('id').primary();
    table.integer('formula_id').unsigned().notNullable().references('id').inTable('quotes.price_formulas').onDelete('CASCADE');
    table.integer('parameter_id').unsigned().notNullable().references('id').inTable('quotes.price_parameters').onDelete('CASCADE');
    table.integer('sort_order').notNullable().defaultTo(0);
    table.timestamps(true, true);
    
    table.unique(['formula_id', 'parameter_id']);
    table.index('formula_id');
    table.index('parameter_id');
  });

  // ==================== QUOTES ====================
  
  // 8. QUOTES - Main quote records
  await knex.schema.withSchema('quotes').createTable('quotes', (table) => {
    table.string('id', 50).primary().comment('Quote ID: TKF-20241119-0001');
    
    // Customer Info
    table.string('customer_name', 255);
    table.string('customer_email', 255);
    table.string('customer_phone', 50);
    table.string('customer_company', 255);
    table.text('customer_address');
    
    // Form & Template
    table.integer('form_template_id').unsigned().references('id').inTable('quotes.form_templates');
    
    // Status
    table.string('status', 50).notNullable().defaultTo('new').comment('new, pending, approved, rejected');
    table.text('notes');
    
    // Pricing
    table.integer('price_formula_id').unsigned().references('id').inTable('quotes.price_formulas');
    table.decimal('calculated_price', 15, 2);
    table.decimal('manual_price', 15, 2);
    table.text('manual_price_reason');
    table.decimal('final_price', 15, 2).comment('manual_price or calculated_price');
    table.string('currency', 10).defaultTo('TRY');
    
    // Price Status Tracking
    table.string('price_status', 50).defaultTo('current').comment('current, outdated, recalculation_needed');
    table.text('price_difference_summary');
    table.timestamp('price_calculated_at');
    
    // Workflow
    table.string('work_order_code', 50);
    table.timestamp('approved_at');
    table.string('approved_by', 100);
    
    // Audit
    table.string('created_by', 100);
    table.string('updated_by', 100);
    table.timestamps(true, true);
    
    table.index('status');
    table.index('customer_email');
    table.index('customer_company');
    table.index('work_order_code');
    table.index('created_at');
    table.index(['status', 'created_at']);
    table.index('form_template_id');
    table.index('price_formula_id');
  });

  // 9. QUOTE FORM DATA - Actual form field values for quotes
  await knex.schema.withSchema('quotes').createTable('quote_form_data', (table) => {
    table.increments('id').primary();
    table.string('quote_id', 50).notNullable().references('id').inTable('quotes.quotes').onDelete('CASCADE');
    table.integer('field_id').unsigned().notNullable().references('id').inTable('quotes.form_fields');
    table.string('field_code', 100).notNullable();
    table.text('field_value').comment('Stored as text, cast based on field_type');
    table.timestamps(true, true);
    
    table.unique(['quote_id', 'field_id']);
    table.index('quote_id');
    table.index('field_code');
    table.index(['quote_id', 'field_code']);
  });

  // 10. QUOTE PRICE CALCULATION DETAILS - Breakdown of price calculation
  await knex.schema.withSchema('quotes').createTable('quote_price_details', (table) => {
    table.increments('id').primary();
    table.string('quote_id', 50).notNullable().references('id').inTable('quotes.quotes').onDelete('CASCADE');
    table.integer('parameter_id').unsigned().notNullable().references('id').inTable('quotes.price_parameters');
    table.string('parameter_code', 100).notNullable();
    table.string('parameter_name', 255).notNullable();
    table.decimal('parameter_value', 15, 4).notNullable().comment('Value used in calculation');
    table.decimal('calculated_amount', 15, 4).comment('Result after formula application');
    table.string('source', 100).comment('fixed, lookup, calculated, manual');
    table.text('calculation_notes');
    table.timestamps(true, true);
    
    table.index('quote_id');
    table.index('parameter_id');
    table.index(['quote_id', 'parameter_code']);
  });

  // 11. QUOTE FILES - File attachments for quotes
  await knex.schema.withSchema('quotes').createTable('quote_files', (table) => {
    table.increments('id').primary();
    table.string('quote_id', 50).notNullable().references('id').inTable('quotes.quotes').onDelete('CASCADE');
    table.string('file_type', 50).notNullable().comment('drawing, document, image, other');
    table.string('file_name', 255).notNullable();
    table.string('file_path', 500).notNullable();
    table.string('mime_type', 100);
    table.bigInteger('file_size').comment('Size in bytes');
    table.text('description');
    table.string('uploaded_by', 100);
    table.timestamps(true, true);
    
    table.index('quote_id');
    table.index('file_type');
    table.index(['quote_id', 'file_type']);
  });

  // ==================== VERSION TRACKING ====================
  
  // 12. PRICE SETTINGS VERSIONS - Historical snapshots
  await knex.schema.withSchema('quotes').createTable('price_settings_versions', (table) => {
    table.increments('id').primary();
    table.string('version_id', 50).unique().notNullable();
    table.integer('version_number').notNullable();
    table.string('date_key', 8).comment('YYYYMMDD');
    table.integer('daily_index');
    table.text('change_summary');
    table.text('notes');
    table.string('created_by', 100);
    table.timestamp('created_at').notNullable();
    
    table.index('version_number');
    table.index('date_key');
    table.index(['date_key', 'daily_index']);
  });

  // 13. FORM CONFIG VERSIONS - Historical snapshots
  await knex.schema.withSchema('quotes').createTable('form_config_versions', (table) => {
    table.increments('id').primary();
    table.string('version_id', 50).unique().notNullable();
    table.integer('version_number').notNullable();
    table.integer('template_id').unsigned().references('id').inTable('quotes.form_templates');
    table.text('change_summary');
    table.text('notes');
    table.string('created_by', 100);
    table.timestamp('created_at').notNullable();
    
    table.index('version_number');
    table.index('template_id');
  });

  console.log('✅ Quotes system tables created (relational design)');
}

export async function down(knex) {
  // Drop in reverse order (respecting foreign keys)
  await knex.schema.withSchema('quotes').dropTableIfExists('form_config_versions');
  await knex.schema.withSchema('quotes').dropTableIfExists('price_settings_versions');
  await knex.schema.withSchema('quotes').dropTableIfExists('quote_files');
  await knex.schema.withSchema('quotes').dropTableIfExists('quote_price_details');
  await knex.schema.withSchema('quotes').dropTableIfExists('quote_form_data');
  await knex.schema.withSchema('quotes').dropTableIfExists('quotes');
  await knex.schema.withSchema('quotes').dropTableIfExists('price_formula_parameters');
  await knex.schema.withSchema('quotes').dropTableIfExists('price_formulas');
  await knex.schema.withSchema('quotes').dropTableIfExists('price_parameter_lookups');
  await knex.schema.withSchema('quotes').dropTableIfExists('price_parameters');
  await knex.schema.withSchema('quotes').dropTableIfExists('form_field_options');
  await knex.schema.withSchema('quotes').dropTableIfExists('form_fields');
  await knex.schema.withSchema('quotes').dropTableIfExists('form_templates');
  await knex.raw('DROP SCHEMA IF EXISTS quotes CASCADE');
  console.log('✅ Quotes system tables dropped');
}
