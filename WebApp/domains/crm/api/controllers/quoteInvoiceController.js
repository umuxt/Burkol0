/**
 * QuoteInvoice Controller
 * HTTP request handlers for proforma, invoice, and quote items operations
 */

import express from 'express';
import multer from 'multer';
import * as quoteInvoiceService from '../services/quoteInvoiceService.js';
import * as quoteItemsService from '../services/quoteItemsService.js';
import { requireAuth } from '../../../../server/auth.js';

// Multer configuration for file uploads (ETTN XML files)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/xml' || file.originalname.endsWith('.xml')) {
            cb(null, true);
        } else {
            cb(new Error('Sadece XML dosyası yüklenebilir'), false);
        }
    }
});

/**
 * Setup quote invoice routes
 */
export function setupQuoteInvoiceRoutes(app) {
    // Proforma operations
    app.post('/api/quotes/:id/proforma', requireAuth, generateProforma);

    // Invoice operations
    app.post('/api/quotes/:id/invoice/export', requireAuth, exportInvoice);
    app.post('/api/quotes/:id/invoice/import', requireAuth, upload.single('file'), importEttn);

    // 7-day rule check
    app.get('/api/quotes/:id/seven-day-check', requireAuth, checkSevenDayRule);

    // Quote items CRUD
    app.get('/api/quotes/:id/items', requireAuth, getQuoteItems);
    app.get('/api/quotes/items/:itemId', requireAuth, getQuoteItem);
    app.post('/api/quotes/:id/items', requireAuth, addQuoteItem);
    app.put('/api/quotes/items/:itemId', requireAuth, updateQuoteItem);
    app.delete('/api/quotes/items/:itemId', requireAuth, deleteQuoteItem);

    console.log('✓ Quote invoice routes configured');
}

/**
 * Generate proforma number for a quote
 * POST /api/quotes/:id/proforma
 */
export async function generateProforma(req, res) {
    try {
        const { id } = req.params;
        const result = await quoteInvoiceService.generateProforma(id);
        res.json({
            success: true,
            data: result,
            message: 'Proforma başarıyla oluşturuldu'
        });
    } catch (error) {
        console.error('Error generating proforma:', error);
        const statusCode = error.code === 'NOT_FOUND' ? 404 :
            error.code === 'ALREADY_EXISTS' ? 409 : 400;
        res.status(statusCode).json({
            success: false,
            error: error.message,
            code: error.code
        });
    }
}

/**
 * Export invoice in specified format
 * POST /api/quotes/:id/invoice/export
 * Body: { format: 'xml'|'csv'|'pdf', invoiceScenario, invoiceType }
 */
export async function exportInvoice(req, res) {
    try {
        const { id } = req.params;
        const options = req.body; // { format, invoiceScenario, invoiceType }

        const result = await quoteInvoiceService.exportInvoice(id, options);

        // Set headers for file download
        res.setHeader('Content-Type', result.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
        res.send(result.fileContent);

    } catch (error) {
        console.error('Error exporting invoice:', error);
        const statusCode = error.code === 'NOT_FOUND' ? 404 :
            error.code === 'PROFORMA_REQUIRED' ? 400 :
                error.code === 'NO_ITEMS' ? 400 :
                    error.code === 'NOT_IMPLEMENTED' ? 501 : 400;
        res.status(statusCode).json({
            success: false,
            error: error.message,
            code: error.code
        });
    }
}

/**
 * Import ETTN from external system
 * POST /api/quotes/:id/invoice/import
 * Body: { invoiceNumber, invoiceEttn }
 * File: invoiceImportedFile (optional, via multer)
 */
export async function importEttn(req, res) {
    try {
        const { id } = req.params;
        const data = req.body; // { invoiceNumber, invoiceEttn }

        // Handle file upload if present (multer middleware)
        const fileData = req.file ? {
            file: req.file.buffer,
            fileName: req.file.originalname
        } : {};

        const result = await quoteInvoiceService.importEttn(id, {
            ...data,
            ...fileData
        });

        res.json({
            success: true,
            data: result,
            message: 'ETTN başarıyla kaydedildi'
        });
    } catch (error) {
        console.error('Error importing ETTN:', error);
        const statusCode = error.code === 'NOT_FOUND' ? 404 :
            error.code === 'INVALID_ETTN' ? 400 :
                error.code === 'EXPORT_REQUIRED' ? 400 : 400;
        res.status(statusCode).json({
            success: false,
            error: error.message,
            code: error.code
        });
    }
}

/**
 * Check 7-day rule for invoice issuance
 * GET /api/quotes/:id/seven-day-check
 */
export async function checkSevenDayRule(req, res) {
    try {
        const { id } = req.params;
        const result = await quoteInvoiceService.checkSevenDayRule(id);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error checking seven-day rule:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
}

// ==================== QUOTE ITEMS CRUD ====================

/**
 * Get all items for a quote
 * GET /api/quotes/:id/items
 */
export async function getQuoteItems(req, res) {
    try {
        const { id } = req.params;
        const result = await quoteItemsService.getQuoteItems(id);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error getting quote items:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Get single quote item
 * GET /api/quotes/items/:itemId
 */
export async function getQuoteItem(req, res) {
    try {
        const { itemId } = req.params;
        const result = await quoteItemsService.getQuoteItem(itemId);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error getting quote item:', error);
        const statusCode = error.code === 'NOT_FOUND' ? 404 : 400;
        res.status(statusCode).json({
            success: false,
            error: error.message,
            code: error.code
        });
    }
}

/**
 * Add new item to quote
 * POST /api/quotes/:id/items
 * Body: { productName, stockCode?, quantity, unit, unitPrice, taxRate, discountPercent?, ... }
 */
export async function addQuoteItem(req, res) {
    try {
        const { id } = req.params;
        const itemData = req.body;
        const user = req.user; // From auth middleware

        const result = await quoteItemsService.addQuoteItem(id, itemData, user);
        res.status(201).json({
            success: true,
            data: result,
            message: 'Kalem başarıyla eklendi'
        });
    } catch (error) {
        console.error('Error adding quote item:', error);
        const statusCode = error.code === 'VALIDATION_ERROR' ? 400 : 400;
        res.status(statusCode).json({
            success: false,
            error: error.message,
            code: error.code
        });
    }
}

/**
 * Update existing quote item
 * PUT /api/quotes/items/:itemId
 * Body: { productName?, quantity?, unitPrice?, ... }
 */
export async function updateQuoteItem(req, res) {
    try {
        const { itemId } = req.params;
        const itemData = req.body;
        const user = req.user; // From auth middleware

        const result = await quoteItemsService.updateQuoteItem(itemId, itemData, user);
        res.json({
            success: true,
            data: result,
            message: 'Kalem başarıyla güncellendi'
        });
    } catch (error) {
        console.error('Error updating quote item:', error);
        const statusCode = error.code === 'VALIDATION_ERROR' ? 400 :
            error.code === 'NOT_FOUND' ? 404 : 400;
        res.status(statusCode).json({
            success: false,
            error: error.message,
            code: error.code
        });
    }
}

/**
 * Delete quote item
 * DELETE /api/quotes/items/:itemId
 */
export async function deleteQuoteItem(req, res) {
    try {
        const { itemId } = req.params;
        await quoteItemsService.deleteQuoteItem(itemId);
        res.json({
            success: true,
            message: 'Kalem başarıyla silindi'
        });
    } catch (error) {
        console.error('Error deleting quote item:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
}
