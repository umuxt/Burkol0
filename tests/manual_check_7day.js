
const db = require('../WebApp/db/connection.js').default;
const service = require('../WebApp/domains/crm/api/services/quoteInvoiceService.js').default;

(async () => {
    const testId = 'TEST-' + Math.floor(Math.random() * 100000);
    try {
        console.log('INIT DB TEST:', testId);
        await db('quotes.quotes').insert({
            id: testId,
            status: 'approved',
            createdAt: new Date(),
            updatedAt: new Date(),
            customerName: 'Test Corp',
            customerEmail: 'test@example.com'
        });

        let r1 = await service.checkSevenDayRule(testId);
        console.log('TEST 1 (No Shipments):', !r1.hasWarning);

        const newDate = new Date();
        await db('materials.shipments').insert({
            shipmentCode: 'S-' + testId,
            shipmentSequence: Math.floor(Math.random() * 100000),
            relatedQuoteId: testId,
            status: 'completed',
            externalDocNumber: '123',
            importedAt: newDate,
            createdAt: newDate
        });

        let r2 = await service.checkSevenDayRule(testId);
        console.log('TEST 2 (New Shipment - Info):', r2.warningLevel);

        const dWarn = new Date();
        dWarn.setDate(dWarn.getDate() - 4);
        await db('materials.shipments').where('relatedQuoteId', testId).update({ importedAt: dWarn });
        let r3 = await service.checkSevenDayRule(testId);
        console.log('TEST 3 (Warning, 4 days ago):', r3.warningLevel);

        const dCrit = new Date();
        dCrit.setDate(dCrit.getDate() - 8);
        await db('materials.shipments').where('relatedQuoteId', testId).update({ importedAt: dCrit });
        let r4 = await service.checkSevenDayRule(testId);
        console.log('TEST 4 (Overdue, 8 days ago - Critical):', r4.warningLevel);

        await db('quotes.quotes').where('id', testId).update({ invoiceImportedAt: new Date() });
        let r5 = await service.checkSevenDayRule(testId);
        console.log('TEST 5 (Invoice Done - Success):', r5.warningLevel);

    } catch (e) {
        console.error('ERROR:', e.message);
        if (e.code) console.error('DB Code:', e.code);
    }
    finally {
        await db('materials.shipments').where('relatedQuoteId', testId).del();
        await db('quotes.quotes').where('id', testId).del();
        console.log('CLEANUP DONE');
        db.destroy();
    }
})();
