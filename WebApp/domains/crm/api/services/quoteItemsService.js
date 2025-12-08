/**
 * QuoteItems Service
 * Business logic layer for quote items CRUD operations
 */

import QuoteItems from '../../../../db/models/quoteItems.js';

/**
 * Get all items for a quote with totals
 * @param {string} quoteId - Quote ID
 * @returns {Object} { items, totals }
 */
export async function getQuoteItems(quoteId) {
    const items = await QuoteItems.getByQuoteId(quoteId);
    const totals = await QuoteItems.calculateQuoteTotals(quoteId);
    return { items, totals };
}

/**
 * Add new item to quote
 * @param {string} quoteId - Quote ID
 * @param {Object} itemData - Item data
 * @param {Object} user - Current user
 * @returns {Object} Created item
 */
export async function addQuoteItem(quoteId, itemData, user) {
    // Validasyon
    if (!itemData.productName) {
        const error = new Error('Ürün adı zorunludur');
        error.code = 'VALIDATION_ERROR';
        throw error;
    }

    if (!itemData.unitPrice || itemData.unitPrice <= 0) {
        const error = new Error('Geçerli birim fiyat giriniz');
        error.code = 'VALIDATION_ERROR';
        throw error;
    }

    if (!itemData.quantity || itemData.quantity <= 0) {
        const error = new Error('Geçerli miktar giriniz');
        error.code = 'VALIDATION_ERROR';
        throw error;
    }

    const item = await QuoteItems.create(quoteId, {
        ...itemData,
        createdBy: user?.email
    });

    return item;
}

/**
 * Update existing quote item
 * @param {number} itemId - Item ID
 * @param {Object} itemData - Updated item data
 * @param {Object} user - Current user
 * @returns {Object} Updated item
 */
export async function updateQuoteItem(itemId, itemData, user) {
    // Validasyon (opsiyonel alanlar için)
    if (itemData.productName !== undefined && !itemData.productName) {
        const error = new Error('Ürün adı boş olamaz');
        error.code = 'VALIDATION_ERROR';
        throw error;
    }

    if (itemData.unitPrice !== undefined && itemData.unitPrice <= 0) {
        const error = new Error('Birim fiyat 0\'dan büyük olmalıdır');
        error.code = 'VALIDATION_ERROR';
        throw error;
    }

    if (itemData.quantity !== undefined && itemData.quantity <= 0) {
        const error = new Error('Miktar 0\'dan büyük olmalıdır');
        error.code = 'VALIDATION_ERROR';
        throw error;
    }

    const item = await QuoteItems.update(itemId, {
        ...itemData,
        updatedBy: user?.email
    });

    return item;
}

/**
 * Delete quote item
 * @param {number} itemId - Item ID
 * @returns {boolean} Success
 */
export async function deleteQuoteItem(itemId) {
    return await QuoteItems.delete(itemId);
}

/**
 * Get single quote item
 * @param {number} itemId - Item ID
 * @returns {Object} Quote item
 */
export async function getQuoteItem(itemId) {
    const item = await QuoteItems.getById(itemId);

    if (!item) {
        const error = new Error('Quote item not found');
        error.code = 'NOT_FOUND';
        throw error;
    }

    return item;
}
