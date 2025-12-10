
import db from '../WebApp/db/connection.js';

// Helper for unique IDs
const generateId = () => Math.random().toString(36).substring(2, 10);
const uuidv4 = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
  var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
  return v.toString(16);
});

// Colors for output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function log(msg, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

function assert(condition, message) {
  if (!condition) {
    log(`❌ FAIL: ${message}`, colors.red);
    throw new Error(message);
  }
  log(`✅ PASS: ${message}`, colors.green);
}

async function runTests() {
  log("🚀 STARTING HARD INTEGRATION TESTS...\n", colors.magenta);

  const testId = uuidv4().substring(0, 8);
  // Customer ID will be integer from DB
  let customerId;
  const quoteId = 'TEST-QUOTE-' + testId;
  // Shipment ID will be integer from DB
  let shipmentId;

  try {
    // =========================================================================
    // 1. SETUP DATA
    // =========================================================================
    log(`--- STEP 1: Setting up Test Data (${testId}) ---`, colors.cyan);

    // Create Customer
    const [customer] = await db('quotes.customers').insert({
      name: 'Integration Test Customer ' + testId,
      company: 'Test Corp',
      email: `test-${testId}@example.com`,
      isEInvoiceTaxpayer: true,
      gibPkLabel: 'urn:mail:defaultpk@test.com',
      defaultInvoiceScenario: 'TICARI'
    }).returning('id');
    
    customerId = customer.id;
    log(`Created Customer: ${customerId}`);

    // Create Quote
    await db('quotes.quotes').insert({
      id: quoteId,
      customerId: customerId,
      status: 'new',
      createdAt: new Date(),
      currency: 'TRY'
    });
    log(`Created Quote: ${quoteId}`);


    // =========================================================================
    // 2. QUOTE ITEMS & TRIGGER CALCULATION TEST
    // =========================================================================
    log(`\n--- STEP 2: Testing Quote Items & Triggers ---`, colors.cyan);

    // Add Item 1: Standard Item (100 TL * 10 Qty + 20% Tax)
    await db('quotes.quote_items').insert({
      quoteId: quoteId,
      productName: 'Standard Widget',
      quantity: 10,
      unitPrice: 100,
      taxRate: 20,
      discountPercent: 0
    });

    // Add Item 2: Discounted Item (200 TL * 5 Qty - 10% Disc + 20% Tax)
    await db('quotes.quote_items').insert({
      quoteId: quoteId,
      productName: 'Discounted Widget',
      quantity: 5,
      unitPrice: 200,
      taxRate: 20,
      discountPercent: 10
    });

    // Verify Calculations
    const items = await db('quotes.quote_items').where('quoteId', quoteId).orderBy('id');
    assert(items.length === 2, "Should have 2 items");

    // Check Item 1
    const item1 = items.find(i => i.productName === 'Standard Widget');
    assert(Number(item1.subtotal) === 1000.00, "Item 1 Subtotal should be 1000"); // 10 * 100
    assert(Number(item1.taxAmount) === 200.00, "Item 1 Tax should be 200"); // 1000 * 0.20
    assert(Number(item1.totalAmount) === 1200.00, "Item 1 Total should be 1200");

    // Check Item 2
    const item2 = items.find(i => i.productName === 'Discounted Widget');
    // Subtotal: 5 * 200 = 1000
    // Discount: 1000 * 0.10 = 100
    // Taxable: 900
    // Tax: 900 * 0.20 = 180
    // Total: 900 + 180 = 1080
    assert(Number(item2.subtotal) === 1000.00, "Item 2 Subtotal should be 1000");
    assert(Number(item2.discountAmount) === 100.00, "Item 2 Discount should be 100");
    assert(Number(item2.taxableAmount) === 900.00, "Item 2 Taxable Amount should be 900");
    assert(Number(item2.taxAmount) === 180.00, "Item 2 Tax should be 180");
    assert(Number(item2.totalAmount) === 1080.00, "Item 2 Total should be 1080");


    // =========================================================================
    // 3. SHIPMENT & 7-DAY RULE TEST
    // =========================================================================
    log(`\n--- STEP 3: Testing Shipment & 7-Day Rule ---`, colors.cyan);

    // Create Shipment linked to Quote
    const [shipment] = await db('materials.shipments').insert({
      shipmentCode: 'SHP-' + testId,
      shipmentSequence: Math.floor(Math.random() * 10000), // Required field
      customerId: customerId,
      customerSnapshot: JSON.stringify({ name: 'Test' }),
      status: 'exported', // Important: must be exported/completed
      relatedQuoteId: quoteId,
      exportedAt: new Date(), // Initially today
      driverName: 'Test Driver',
      driverTc: '11111111111',
      plateNumber: '34TEST34',
      dispatchDate: new Date(),
      dispatchTime: '10:00:00'
    }).returning('id');
    
    shipmentId = shipment.id;
    log(`Created Shipment: ${shipmentId}`);

    // Helper to check rule
    const checkRule = async () => {
        // We simulate the logic from quoteInvoiceService.checkSevenDayRule
        const shipments = await db('materials.shipments')
            .where('relatedQuoteId', quoteId)
            .whereNotNull('exportedAt')
            .orderBy('exportedAt', 'asc');
        
        if (shipments.length === 0) return { status: 'none', diffDays: 0 };

        const oldestDate = new Date(shipments[0].exportedAt);
        const today = new Date();
        const diffTime = Math.abs(today - oldestDate);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 
        // Note: Logic in service uses Math.floor((today - shipmentDate)...)
        
        return { diffDays };
    };

    // Case A: Today (0 days diff)
    let rule = await checkRule();
    assert(rule.diffDays === 0, "Diff days should be 0 initially");

    // Case B: Backdate 5 days
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    await db('materials.shipments').where('id', shipmentId).update({
        exportedAt: fiveDaysAgo
    });
    
    rule = await checkRule();
    assert(rule.diffDays >= 5, `Diff days should be >= 5 (Actual: ${rule.diffDays})`);

    // Case C: Backdate 8 days (Overdue)
    const eightDaysAgo = new Date();
    eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
    await db('materials.shipments').where('id', shipmentId).update({
        exportedAt: eightDaysAgo
    });

    rule = await checkRule();
    assert(rule.diffDays >= 8, `Diff days should be >= 8 (Actual: ${rule.diffDays})`);


    // =========================================================================
    // 4. DOCUMENT WORKFLOW (Proforma -> Export -> Import)
    // =========================================================================
    log(`\n--- STEP 4: Testing Document Workflow ---`, colors.cyan);

    // A. Create Proforma
    // Simulate: quotes.generate_proforma_number()
    const { rows: [{ proforma_num }] } = await db.raw('SELECT quotes.generate_proforma_number() as proforma_num');
    assert(proforma_num.startsWith('PF-'), "Proforma number should start with PF-");

    // Create Document Record
    await db('quotes.quote_documents').insert({
        quoteId: quoteId,
        documentType: 'proforma',
        documentNumber: proforma_num,
        notes: 'Integration Test'
    });
    
    // Update Quote
    await db('quotes.quotes').where('id', quoteId).update({
        proformaNumber: proforma_num,
        proformaCreatedAt: new Date(),
        status: 'proformaSent'
    });
    log(`Generated Proforma: ${proforma_num}`);

    // B. Export Invoice
    await db('quotes.quote_documents').insert({
        quoteId: quoteId,
        documentType: 'export',
        invoiceScenario: 'TICARI',
        invoiceType: 'SATIS',
        exportFormat: 'xml',
        exportTarget: 'LOGO'
    });
    await db('quotes.quotes').where('id', quoteId).update({
        invoiceScenario: 'TICARI',
        invoiceType: 'SATIS',
        invoiceExportedAt: new Date(),
        status: 'invoiceExported'
    });
    log(`Exported Invoice (Simulated)`);

    // C. Import Invoice
    const invoiceNum = 'GIB202500000001';
    const ettn = uuidv4();

    await db('quotes.quote_documents').insert({
        quoteId: quoteId,
        documentType: 'import',
        documentNumber: invoiceNum,
        ettn: ettn,
        fileName: 'test_invoice.xml'
    });
    await db('quotes.quotes').where('id', quoteId).update({
        invoiceNumber: invoiceNum,
        invoiceEttn: ettn,
        invoiceImportedAt: new Date(),
        status: 'invoiceImported'
    });
    log(`Imported Invoice: ${invoiceNum} (ETTN: ${ettn})`);

    // Verify Final State
    const finalQuote = await db('quotes.quotes').where('id', quoteId).first();
    assert(finalQuote.status === 'invoiceImported', "Quote status should be 'invoiceImported'");
    assert(finalQuote.invoiceNumber === invoiceNum, "Quote invoice number mismatch");
    assert(finalQuote.proformaNumber === proforma_num, "Quote proforma number mismatch");


    // =========================================================================
    // CLEANUP
    // =========================================================================
    log(`\n--- Cleanup ---`, colors.yellow);
    if (customerId) await db('quotes.quote_items').where('quoteId', quoteId).del();
    if (customerId) await db('quotes.quote_documents').where('quoteId', quoteId).del();
    if (shipmentId) await db('materials.shipments').where('id', shipmentId).del();
    if (quoteId) await db('quotes.quotes').where('id', quoteId).del();
    if (customerId) await db('quotes.customers').where('id', customerId).del();
    log(`Cleanup completed.`);

    log(`\n✨ ALL TESTS PASSED SUCCESSFULLY! ✨`, colors.green);

  } catch (error) {
    console.error("\n❌ TEST FAILED:", error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

runTests();
