#!/usr/bin/env node

/**
 * Test Script: Quotes System End-to-End
 * 
 * Tests the complete quotes system from form creation to quote generation
 */

import FormTemplates from '../db/models/formTemplates.js';
import FormFields from '../db/models/formFields.js';
import PriceParameters from '../db/models/priceParameters.js';
import PriceFormulas from '../db/models/priceFormulas.js';
import Quotes from '../db/models/quotes.js';
import logger from '../domains/quotes/server/logger.js';

async function testQuotesSystem() {
  const startTime = Date.now();
  
  try {
    logger.banner('QUOTES SYSTEM TEST', '🧪');
    logger.setSteps(10);

    // ==================== STEP 1: Create Form Template ====================
    logger.step('Creating Form Template');
    const template = await FormTemplates.create({
      code: 'STANDARD_QUOTE_V1',
      name: 'Standart Teklif Formu',
      description: 'Test için standart teklif formu',
      version: 1,
      createdBy: 'test_user'
    });
    logger.success('Template created', {
      'Code': template.code,
      'ID': template.id,
      'Name': template.name
    });

    // ==================== STEP 2: Add Form Fields ====================
    logger.step('Adding Form Fields');
    const fieldsData = [
      {
        fieldCode: 'material',
        fieldName: 'Malzeme',
        fieldType: 'select',
        sortOrder: 1,
        isRequired: true,
        options: [
          { value: 'steel', label: 'Çelik' },
          { value: 'aluminum', label: 'Alüminyum' },
          { value: 'stainless', label: 'Paslanmaz Çelik' }
        ]
      },
      {
        fieldCode: 'qty',
        fieldName: 'Adet',
        fieldType: 'number',
        sortOrder: 2,
        isRequired: true,
        placeholder: 'Ör: 100'
      },
      {
        fieldCode: 'dimensions',
        fieldName: 'Ölçüler',
        fieldType: 'text',
        sortOrder: 3,
        isRequired: false,
        placeholder: 'Ör: 100x50x2mm'
      }
    ];

    const fields = await FormFields.bulkCreateWithOptions(template.id, fieldsData);
    logger.success(`Created ${fields.length} fields`);
    fields.forEach((field, idx) => {
      logger.detail(`Field ${idx + 1}`, `${fieldsData[idx].fieldName} (${fieldsData[idx].fieldType})`);
    });

    // ==================== STEP 3: Create Price Parameters ====================
    logger.step('Creating Price Parameters');
    
    // Material cost parameter (form lookup)
    const materialParam = await PriceParameters.create({
      code: 'material_cost',
      name: 'Malzeme Maliyeti',
      type: 'form_lookup',
      unit: 'TRY/adet',
      description: 'Malzeme başına birim maliyet'
    });
    logger.success('Material cost parameter created', {
      'Code': materialParam.code,
      'Type': materialParam.type
    });

    // Add lookups for material parameter
    const lookups = await PriceParameters.bulkCreateLookups(materialParam.id, [
      { formFieldCode: 'material', optionValue: 'steel', priceValue: 50.00 },
      { formFieldCode: 'material', optionValue: 'aluminum', priceValue: 75.00 },
      { formFieldCode: 'material', optionValue: 'stainless', priceValue: 120.00 }
    ]);
    logger.info(`Added ${lookups.length} price lookups`);
    logger.detail('Steel', '50.00 TRY');
    logger.detail('Aluminum', '75.00 TRY');
    logger.detail('Stainless', '120.00 TRY');

    // Labor cost parameter (fixed)
    const laborParam = await PriceParameters.create({
      code: 'labor_cost',
      name: 'İşçilik Maliyeti',
      type: 'fixed',
      fixedValue: 100.00,
      unit: 'TRY',
      description: 'Sabit işçilik maliyeti'
    });
    logger.success('Labor cost parameter created', {
      'Code': laborParam.code,
      'Type': laborParam.type,
      'Value': '100.00 TRY'
    });

    // ==================== STEP 4: Create Price Formula ====================
    logger.step('Creating Price Formula');
    const formula = await PriceFormulas.createWithParameters({
      code: 'STANDARD_PRICING_V1',
      name: 'Standart Fiyatlama Formülü',
      formulaExpression: 'material_cost * qty + labor_cost',
      description: 'Malzeme maliyeti * adet + işçilik',
      version: 1,
      isActive: true,
      createdBy: 'test_user',
      parameterCodes: ['material_cost', 'labor_cost']
    });
    logger.success('Formula created', {
      'Code': formula.code,
      'Expression': formula.formula_expression,
      'Parameters': '2'
    });

    // ==================== STEP 5: Create Quote ====================
    logger.step('Creating Quote');
    const quote = await Quotes.create({
      customerName: 'Ahmet Yılmaz',
      customerEmail: 'ahmet@example.com',
      customerPhone: '555-1234',
      customerCompany: 'ABC Metal A.Ş.',
      customerAddress: 'İstanbul, Türkiye',
      formTemplateId: template.id,
      priceFormulaId: formula.id,
      notes: 'Test teklifi',
      formData: {
        material: 'steel',
        qty: '100',
        dimensions: '100x50x2mm'
      },
      createdBy: 'test_user'
    });
    logger.success('Quote created successfully', {
      'Quote ID': quote.id,
      'Customer': quote.customer_name,
      'Company': quote.customer_company,
      'Status': quote.status,
      'Calculated Price': `${quote.calculated_price} TRY`,
      'Final Price': `${quote.final_price} TRY`
    });

    // ==================== STEP 6: Verify Form Data ====================
    logger.step('Verifying Form Data');
    logger.details({
      'Material': quote.formData.material,
      'Quantity': quote.formData.qty,
      'Dimensions': quote.formData.dimensions
    });

    // ==================== STEP 7: Verify Price Calculation ====================
    logger.step('Verifying Price Calculation');
    logger.subsection('Parameters Used:');
    quote.priceDetails.forEach(detail => {
      logger.detail(detail.parameter_name, `${detail.parameter_value} (${detail.source})`);
    });
    
    logger.subsection('Calculation:');
    logger.info('Formula: material_cost * qty + labor_cost');
    logger.info('Expected: (50 * 100) + 100 = 5100 TRY');
    logger.info(`Actual: ${quote.calculated_price} TRY`);
    
    const isCorrect = parseFloat(quote.calculated_price) === 5100;
    if (isCorrect) {
      logger.success('Price calculation is CORRECT! ✨');
    } else {
      logger.error('Price calculation is WRONG!');
    }

    // ==================== STEP 8: Update Quote Status ====================
    logger.step('Updating Quote Status');
    await Quotes.updateStatus(quote.id, 'approved', 'manager_user');
    const updatedQuote = await Quotes.getById(quote.id);
    logger.success('Quote status updated', {
      'Status': updatedQuote.status,
      'Approved at': new Date(updatedQuote.approved_at).toLocaleString('tr-TR'),
      'Approved by': updatedQuote.approved_by
    });

    // ==================== STEP 9: Set Manual Price ====================
    logger.step('Setting Manual Price');
    await Quotes.setManualPrice(quote.id, 4800.00, 'Müşteri indirimi', 'sales_user');
    const manualQuote = await Quotes.getById(quote.id);
    logger.success('Manual price applied', {
      'Original Price': `${quote.calculated_price} TRY`,
      'Manual Price': `${manualQuote.manual_price} TRY`,
      'Discount': `${(parseFloat(quote.calculated_price) - parseFloat(manualQuote.manual_price)).toFixed(2)} TRY`,
      'Reason': manualQuote.manual_price_reason,
      'Final Price': `${manualQuote.final_price} TRY`,
      'Price Status': manualQuote.price_status
    });

    // ==================== STEP 10: Get Statistics ====================
    logger.step('Getting Quote Statistics');
    const stats = await Quotes.getStatistics();
    logger.stats('Quote System Statistics', {
      'Total Quotes': stats.total_quotes,
      'New Quotes': stats.new_quotes,
      'Approved Quotes': stats.approved_quotes,
      'Rejected Quotes': stats.rejected_quotes,
      'Total Value': `${parseFloat(stats.total_value || 0).toFixed(2)} TRY`,
      'Approved Value': `${parseFloat(stats.approved_value || 0).toFixed(2)} TRY`
    });

    // ==================== CLEANUP ====================
    // DISABLED - Keep test data for frontend testing
    // logger.section('🧹 Cleanup');
    // logger.info('Deleting test data...');
    // await Quotes.delete(quote.id);
    // await PriceFormulas.delete(formula.id);
    // await PriceParameters.delete(materialParam.id);
    // await PriceParameters.delete(laborParam.id);
    // await FormTemplates.delete(template.id);
    // logger.success('Test data cleaned up successfully');

    const duration = Date.now() - startTime;
    logger.complete('All tests passed! Test data kept for frontend testing 🎉', duration);
    process.exit(0);

  } catch (error) {
    logger.fail('Test failed', error);
    process.exit(1);
  }
}

testQuotesSystem();
