/**
 * Migration 018: Add Missing Supplier Fields
 * Adds all Firebase supplier fields to PostgreSQL for full compatibility
 * Converts from minimal schema to full supplier management system
 */

export async function up(knex) {
  await knex.schema.alterTable('materials.suppliers', (table) => {
    // Additional contact fields
    table.string('phone2', 50);
    table.string('email2', 255);
    table.string('fax', 50);
    table.string('emergency_contact', 255);
    table.string('emergency_phone', 50);
    table.string('website', 500);
    table.string('preferred_communication', 50).defaultTo('email'); // email, phone, fax, whatsapp
    
    // Address details
    table.string('city', 100);
    table.string('state', 100);
    table.string('postal_code', 20);
    table.string('country', 100).defaultTo('Türkiye');
    
    // Tax and legal
    table.string('tax_number', 50);
    table.string('tax_office', 255);
    table.string('business_registration_number', 50);
    
    // Financial
    table.string('currency', 10).defaultTo('TRY');
    table.decimal('credit_limit', 15, 2);
    table.string('credit_rating', 50); // A, B, C, etc.
    table.string('payment_terms', 255); // "30 days", "Net 15", etc.
    table.string('payment_method', 100); // "Bank Transfer", "Cash", etc.
    table.string('bank_name', 255);
    table.string('bank_account', 100);
    table.string('iban', 50);
    
    // Supplier capabilities
    table.string('supplier_type', 100); // "Manufacturer", "Distributor", "Wholesaler"
    table.string('quality_certification', 255); // ISO certifications
    table.string('delivery_capability', 255);
    table.integer('lead_time_days');
    table.decimal('minimum_order_quantity', 15, 2);
    
    // Company details
    table.integer('year_established');
    table.integer('employee_count');
    table.decimal('annual_revenue', 18, 2);
    
    // Risk and compliance
    table.string('compliance_status', 50).defaultTo('pending'); // pending, approved, rejected
    table.string('risk_level', 50).defaultTo('medium'); // low, medium, high
    
    // General notes
    table.text('notes');
    
    // Rename/convert status field
    // is_active (boolean) will be kept for backward compatibility
    // But we'll add a status field for more granular control
    table.string('status', 50).defaultTo('Aktif'); // Aktif, Pasif, Askıda
  });
  
  // Update existing records to have status based on is_active
  await knex.raw(`
    UPDATE materials.suppliers 
    SET status = CASE 
      WHEN is_active = true THEN 'Aktif'
      ELSE 'Pasif'
    END
  `);
  
  // Add indexes for commonly queried fields
  await knex.schema.alterTable('materials.suppliers', (table) => {
    table.index('city');
    table.index('status');
    table.index('supplier_type');
    table.index('compliance_status');
  });
  
  console.log('✅ Migration 018: Added all missing supplier fields');
}

export async function down(knex) {
  await knex.schema.alterTable('materials.suppliers', (table) => {
    // Remove all added fields
    table.dropColumn('phone2');
    table.dropColumn('email2');
    table.dropColumn('fax');
    table.dropColumn('emergency_contact');
    table.dropColumn('emergency_phone');
    table.dropColumn('website');
    table.dropColumn('preferred_communication');
    
    table.dropColumn('city');
    table.dropColumn('state');
    table.dropColumn('postal_code');
    table.dropColumn('country');
    
    table.dropColumn('tax_number');
    table.dropColumn('tax_office');
    table.dropColumn('business_registration_number');
    
    table.dropColumn('currency');
    table.dropColumn('credit_limit');
    table.dropColumn('credit_rating');
    table.dropColumn('payment_terms');
    table.dropColumn('payment_method');
    table.dropColumn('bank_name');
    table.dropColumn('bank_account');
    table.dropColumn('iban');
    
    table.dropColumn('supplier_type');
    table.dropColumn('quality_certification');
    table.dropColumn('delivery_capability');
    table.dropColumn('lead_time_days');
    table.dropColumn('minimum_order_quantity');
    
    table.dropColumn('year_established');
    table.dropColumn('employee_count');
    table.dropColumn('annual_revenue');
    
    table.dropColumn('compliance_status');
    table.dropColumn('risk_level');
    
    table.dropColumn('notes');
    table.dropColumn('status');
  });
  
  console.log('✅ Migration 018 rolled back: Removed supplier fields');
}
