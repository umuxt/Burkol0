
const db = require('../WebApp/db/connection.js').default;
const service = require('../WebApp/domains/crm/api/services/quoteInvoiceService.js').default;

(async () => {
    const testId = 'TEST-' + Math.floor(Math.random() * 100000);
    console.log('🧪 7-Day Rule Logic Verification');
    console.log('--------------------------------');

    try {
        // SETUP: Create Quote
        await db('quotes.quotes').insert({
            id: testId,
            status: 'approved',
            createdAt: new Date(),
            updatedAt: new Date(),
            customerName: 'Test Corp',
            customerEmail: 'test@example.com'
        });

        // 1. NO SHIPMENTS
        let r1 = await service.checkSevenDayRule(testId);
        console.log('Test 1 (No Shipments):', !r1.hasWarning ? '✅ PASS' : '❌ FAIL');

        // 2. NEW SHIPMENT (Today)
        const today = new Date();
        await db('materials.shipments').insert({
            shipmentCode: 'S-' + testId,
            shipmentSequence: Math.floor(Math.random() * 100000),
            relatedQuoteId: testId,
            status: 'completed',
            externalDocNumber: 'DOC-001',
            importedAt: today,
            createdAt: today
        });

        let r2 = await service.checkSevenDayRule(testId);
        console.log('Test 2 (New Shipment - Info):', r2.warningLevel === 'info' ? '✅ PASS' : '❌ FAIL (' + r2.warningLevel + ')');

        // 3. WARNING (4 days ago)
        const dWarn = new Date();
        dWarn.setDate(dWarn.getDate() - 4);
        await db('materials.shipments').where('relatedQuoteId', testId).update({ importedAt: dWarn });

        // The service uses daysRemaining > 5 for info, >=3 for warning.
        // 4 days ago -> daysDiff = 4. daysRemaining = 7 - 4 = 3. 
        // 3 >= 3 -> warning. Correct.
        let r3 = await service.checkSevenDayRule(testId);
        console.log('Test 3 (4 Days Ago - Warning):', r3.warningLevel === 'warning' ? '✅ PASS' : '❌ FAIL (' + r3.warningLevel + ')');

        // 4. CRITICAL (8 days ago)
        const dCrit = new Date();
        dCrit.setDate(dCrit.getDate() - 8);
        await db('materials.shipments').where('relatedQuoteId', testId).update({ importedAt: dCrit });

        // 8 days ago -> daysDiff = 8. daysRemaining = 7 - 8 = -1.
        // -1 < 0 -> critical. Correct.
        let r4 = await service.checkSevenDayRule(testId);
        console.log('Test 4 (8 Days Ago - Critical):', r4.warningLevel === 'critical' ? '✅ PASS' : '❌ FAIL (' + r4.warningLevel + ')');

        // 5. SUCCESS (Invoice Imported)
        await db('quotes.quotes').where('id', testId).update({ invoiceImportedAt: new Date() });

        let r5 = await service.checkSevenDayRule(testId);
        console.log('Test 5 (Invoice Done - Success):', r5.warningLevel === 'success' ? '✅ PASS' : '❌ FAIL (' + r5.warningLevel + ')');

    } catch (e) {
        console.error('❌ ERROR:', e.message);
    }
    finally {
        // CLEANUP
        await db('materials.shipments').where('relatedQuoteId', testId).del();
        await db('quotes.quotes').where('id', testId).del();
        db.destroy();
    }
})();
