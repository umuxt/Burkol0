import db from '../connection.js';

const QuoteItems = {

    // Bir quote'un tüm kalemlerini getir
    async getByQuoteId(quoteId) {
        return await db('quotes.quote_items')
            .where('quoteId', quoteId)
            .orderBy('lineNumber', 'asc');
    },

    // Tek kalem getir
    async getById(id) {
        return await db('quotes.quote_items')
            .where('id', id)
            .first();
    },

    // Yeni kalem ekle (trigger hesaplamaları yapacak)
    async create(quoteId, itemData) {
        // lineNumber otomatik hesapla
        const [maxLine] = await db('quotes.quote_items')
            .where('quoteId', quoteId)
            .max('lineNumber as max');

        const [item] = await db('quotes.quote_items')
            .insert({
                quoteId,
                lineNumber: (maxLine?.max || 0) + 1,
                ...itemData,
                createdAt: new Date()
            })
            .returning('*');
        return item;
    },

    // Kalem güncelle
    async update(id, itemData) {
        const [item] = await db('quotes.quote_items')
            .where('id', id)
            .update({
                ...itemData,
                updatedAt: new Date()
            })
            .returning('*');
        return item;
    },

    // Kalem sil
    async delete(id) {
        return await db('quotes.quote_items')
            .where('id', id)
            .del();
    },

    // Quote toplamlarını hesapla
    async calculateQuoteTotals(quoteId) {
        const result = await db('quotes.quote_items')
            .where('quoteId', quoteId)
            .sum({
                subtotal: 'subtotal',
                discountTotal: 'discountAmount',
                taxTotal: 'taxAmount',
                grandTotal: 'totalAmount',
                withholdingTotal: 'withholdingAmount'
            })
            .first();
        return result;
    }
};

export default QuoteItems;
