/**
 * Migration: Simplify Quotes System
 * 
 * Changes:
 * 1. Add price_value to form_field_options (eliminates price_parameter_lookups)
 * 2. Add version management to form_templates and price_formulas
 * 3. Add version snapshot fields to quotes table
 * 4. Add needs_recalculation flag to quotes
 * 5. Remove unnecessary tables
 */

export async function up(knex) {
  console.log('🔄 Starting quotes system simplification...');

  // ==================== 1. UPDATE form_field_options ====================
  console.log('📝 Adding price_value to form_field_options...');
  
  await knex.schema.withSchema('quotes').table('form_field_options', (table) => {
    table.decimal('price_value', 15, 4).comment('Direct price for this option (eliminates lookup table)');
  });
  
  console.log('  ✓ price_value column added (existing data will be re-entered)');

  // ==================== 2. UPDATE form_templates ====================
  console.log('📝 Adding version management to form_templates...');
  
  await knex.schema.withSchema('quotes').table('form_templates', (table) => {
    table.integer('supersedes_id').references('id').inTable('quotes.form_templates')
      .comment('Previous version that this template replaces');
  });

  // Add unique constraint for active templates
  await knex.raw(`
    CREATE UNIQUE INDEX form_templates_active_unique 
    ON quotes.form_templates (code) 
    WHERE is_active = true
  `);

  // ==================== 3. UPDATE price_formulas ====================
  console.log('📝 Adding version management to price_formulas...');
  
  await knex.schema.withSchema('quotes').table('price_formulas', (table) => {
    table.integer('supersedes_id').references('id').inTable('quotes.price_formulas')
      .comment('Previous version that this formula replaces');
  });

  // Add unique constraint for active formulas
  await knex.raw(`
    CREATE UNIQUE INDEX price_formulas_active_unique 
    ON quotes.price_formulas (code) 
    WHERE is_active = true
  `);

  // ==================== 4. UPDATE quotes ====================
  console.log('📝 Adding version tracking to quotes...');
  
  await knex.schema.withSchema('quotes').table('quotes', (table) => {
    table.integer('form_template_version').comment('Snapshot: which template version was used');
    table.integer('price_formula_version').comment('Snapshot: which formula version was used');
    table.boolean('needs_recalculation').defaultTo(false)
      .comment('Flag: formula changed, price should be recalculated');
    table.timestamp('last_calculated_at', { useTz: true }).comment('When was price last calculated');
  });

  // Populate version snapshots for existing quotes (if any)
  const quoteCount = await knex('quotes.quotes').count('* as count').first();
  console.log(`  ℹ️  Found ${quoteCount.count} existing quotes (versions will be null, can be updated manually if needed)`);

  // ==================== 5. UPDATE price_parameters ====================
  console.log('📝 Simplifying price_parameters...');
  
  // Add form_field_code column (if not exists)
  const hasFormFieldCode = await knex.schema.withSchema('quotes').hasColumn('price_parameters', 'form_field_code');
  
  if (!hasFormFieldCode) {
    await knex.schema.withSchema('quotes').table('price_parameters', (table) => {
      table.string('form_field_code', 100).comment('Reference to form_fields.field_code');
    });
    console.log('  ✓ form_field_code column added');
  }

  // Drop old form_field_id column if exists
  const hasFormFieldId = await knex.schema.withSchema('quotes').hasColumn('price_parameters', 'form_field_id');
  if (hasFormFieldId) {
    await knex.schema.withSchema('quotes').table('price_parameters', (table) => {
      table.dropColumn('form_field_id');
    });
    console.log('  ✓ form_field_id column removed');
  }

  // Clear existing data (will be re-entered)
  // First clear quote_price_details (foreign key dependency)
  const hasQuotePriceDetails = await knex.schema.withSchema('quotes').hasTable('quote_price_details');
  if (hasQuotePriceDetails) {
    await knex('quotes.quote_price_details').del();
    console.log('  ✓ Existing quote_price_details cleared');
  }
  
  await knex('quotes.price_parameters').del();
  console.log('  ✓ Existing parameters cleared (will be re-entered)');

  // Update check constraint (AFTER column is created and data is cleared)
  await knex.raw(`
    ALTER TABLE quotes.price_parameters
    DROP CONSTRAINT IF EXISTS price_parameters_type_check;
    
    ALTER TABLE quotes.price_parameters
    ADD CONSTRAINT price_parameters_type_check CHECK (
      (type = 'fixed' AND fixed_value IS NOT NULL) OR
      (type = 'form_lookup' AND form_field_code IS NOT NULL)
    )
  `);
  console.log('  ✓ Check constraint updated');

  // ==================== 6. CLEANUP - Drop unnecessary tables ====================
  console.log('🗑️  Removing unnecessary tables...');

  // Drop in order respecting foreign keys
  await knex.schema.withSchema('quotes').dropTableIfExists('price_parameter_lookups');
  console.log('  ✓ Dropped price_parameter_lookups (replaced by form_field_options.price_value)');

  await knex.schema.withSchema('quotes').dropTableIfExists('price_formula_parameters');
  console.log('  ✓ Dropped price_formula_parameters (parameters parsed from formula string)');

  await knex.schema.withSchema('quotes').dropTableIfExists('quote_price_details');
  console.log('  ✓ Dropped quote_price_details (calculation details not needed in DB)');

  await knex.schema.withSchema('quotes').dropTableIfExists('form_config_versions');
  console.log('  ✓ Dropped form_config_versions (using is_active boolean instead)');

  await knex.schema.withSchema('quotes').dropTableIfExists('price_settings_versions');
  console.log('  ✓ Dropped price_settings_versions (using is_active boolean instead)');

  console.log('✅ Quotes system simplification complete!');
  console.log('📊 Summary:');
  console.log('   - Removed 5 tables');
  console.log('   - Added price_value to form_field_options');
  console.log('   - Added version management (supersedes_id, is_active)');
  console.log('   - Added quote version snapshots');
}

export async function down(knex) {
  console.log('🔄 Rolling back quotes system simplification...');

  // Restore tables in reverse order
  await knex.schema.withSchema('quotes').createTable('price_settings_versions', (table) => {
    table.increments('id').primary();
    table.string('version_id', 50).unique().notNullable();
    table.integer('version_number').notNullable();
    table.string('date_key', 8);
    table.integer('daily_index');
    table.text('change_summary');
    table.text('notes');
    table.string('created_by', 100);
    table.timestamp('created_at').notNullable();
  });

  await knex.schema.withSchema('quotes').createTable('form_config_versions', (table) => {
    table.increments('id').primary();
    table.string('version_id', 50).unique().notNullable();
    table.integer('version_number').notNullable();
    table.integer('template_id').unsigned().references('id').inTable('quotes.form_templates');
    table.text('change_summary');
    table.text('notes');
    table.string('created_by', 100);
    table.timestamp('created_at').notNullable();
  });

  await knex.schema.withSchema('quotes').createTable('quote_price_details', (table) => {
    table.increments('id').primary();
    table.string('quote_id', 50).notNullable().references('id').inTable('quotes.quotes').onDelete('CASCADE');
    table.integer('parameter_id').unsigned().notNullable().references('id').inTable('quotes.price_parameters');
    table.string('parameter_code', 100).notNullable();
    table.string('parameter_name', 255).notNullable();
    table.decimal('parameter_value', 15, 4).notNullable();
    table.decimal('calculated_amount', 15, 4);
    table.string('source', 100);
    table.text('calculation_notes');
    table.timestamps(true, true);
  });

  await knex.schema.withSchema('quotes').createTable('price_formula_parameters', (table) => {
    table.increments('id').primary();
    table.integer('formula_id').unsigned().notNullable().references('id').inTable('quotes.price_formulas').onDelete('CASCADE');
    table.integer('parameter_id').unsigned().notNullable().references('id').inTable('quotes.price_parameters').onDelete('CASCADE');
    table.integer('sort_order').notNullable().defaultTo(0);
    table.timestamps(true, true);
  });

  await knex.schema.withSchema('quotes').createTable('price_parameter_lookups', (table) => {
    table.increments('id').primary();
    table.integer('parameter_id').unsigned().notNullable().references('id').inTable('quotes.price_parameters').onDelete('CASCADE');
    table.string('form_field_code', 100).notNullable();
    table.string('option_value', 255).notNullable();
    table.decimal('price_value', 15, 4).notNullable();
    table.string('currency', 10).defaultTo('TRY');
    table.date('valid_from');
    table.date('valid_to');
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
  });

  // Remove added columns
  await knex.schema.withSchema('quotes').table('quotes', (table) => {
    table.dropColumn('last_calculated_at');
    table.dropColumn('needs_recalculation');
    table.dropColumn('price_formula_version');
    table.dropColumn('form_template_version');
  });

  await knex.raw('DROP INDEX IF EXISTS quotes.price_formulas_active_unique');
  await knex.schema.withSchema('quotes').table('price_formulas', (table) => {
    table.dropColumn('supersedes_id');
  });

  await knex.raw('DROP INDEX IF EXISTS quotes.form_templates_active_unique');
  await knex.schema.withSchema('quotes').table('form_templates', (table) => {
    table.dropColumn('supersedes_id');
  });

  await knex.schema.withSchema('quotes').table('form_field_options', (table) => {
    table.dropColumn('price_value');
  });

  console.log('✅ Rollback complete');
}
