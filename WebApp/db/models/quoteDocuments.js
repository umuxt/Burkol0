/**
 * Quote Documents Model
 * Manages proforma, export, and import document records for quotes
 * Table: quotes.quote_documents
 */

import db from '../connection.js';

const QuoteDocuments = {
    /**
     * Generate proforma number using PostgreSQL function
     * Format: PF-YYYY-XXXX
     * @returns {string} Generated proforma number
     */
    async generateProformaNumber() {
        try {
            const result = await db.raw('SELECT quotes.generate_proforma_number() as proforma_number');
            return result.rows[0].proforma_number;
        } catch (error) {
            console.error('Error generating proforma number:', error);
            throw error;
        }
    },

    /**
     * Create a new document record
     * @param {string} quoteId - Quote ID (FK to quotes.quotes)
     * @param {string} documentType - 'proforma' | 'export' | 'import'
     * @param {Object} data - Document data
     * @returns {Object} Created document
     */
    async createDocument(quoteId, documentType, data = {}) {
        // Validate documentType
        const validTypes = ['proforma', 'export', 'import'];
        if (!validTypes.includes(documentType)) {
            const error = new Error(`Invalid documentType: ${documentType}. Must be one of: ${validTypes.join(', ')}`);
            error.code = 'INVALID_DOCUMENT_TYPE';
            throw error;
        }

        // Build insert data
        const insertData = {
            quoteId,
            documentType,
            documentNumber: data.documentNumber || null,
            ettn: data.ettn || null,
            invoiceScenario: data.invoiceScenario || null,
            invoiceType: data.invoiceType || null,
            exportFormat: data.exportFormat || null,
            exportTarget: data.exportTarget || null,
            exportTarget: data.exportTarget || null,
            fileData: data.fileData || null,
            fileUrl: data.fileUrl || null,
            fileName: data.fileName || null,
            mimeType: data.mimeType || null,
            createdBy: data.createdBy || null,
            notes: data.notes || null,
            createdAt: new Date()
        };

        try {
            const [document] = await db('quotes.quote_documents')
                .insert(insertData)
                .returning('*');

            return document;
        } catch (error) {
            console.error('Error creating document:', error);
            throw error;
        }
    },

    /**
     * Get all documents for a quote
     * @param {string} quoteId - Quote ID
     * @param {string|null} documentType - Optional filter by type
     * @returns {Array} Array of documents
     */
    async getDocumentsByQuoteId(quoteId, documentType = null) {
        try {
            let query = db('quotes.quote_documents')
                .where({ quoteId })
                .orderBy('createdAt', 'desc');

            if (documentType) {
                query = query.andWhere({ documentType });
            }

            const documents = await query;

            // Don't include fileData in list queries (too large)
            return documents.map(doc => ({
                ...doc,
                fileData: doc.fileData ? '[BINARY DATA]' : null,
                hasFile: !!doc.fileData || !!doc.fileUrl
            }));
        } catch (error) {
            console.error('Error getting documents by quoteId:', error);
            throw error;
        }
    },

    /**
     * Get a single document by ID
     * @param {number} id - Document ID
     * @param {boolean} includeFileData - Whether to include binary file data
     * @returns {Object|null} Document or null
     */
    async getDocumentById(id, includeFileData = false) {
        try {
            const columns = includeFileData
                ? '*'
                : [
                    'id', 'quoteId', 'documentType', 'documentNumber', 'ettn',
                    'invoiceScenario', 'invoiceType', 'exportFormat', 'exportTarget',
                    'fileName', 'fileUrl', 'mimeType', 'createdAt', 'createdBy', 'notes'
                ];

            const document = await db('quotes.quote_documents')
                .select(columns)
                .where({ id })
                .first();

            if (!document) {
                return null;
            }

            // Add hasFile indicator if fileData not included
            if (!includeFileData) {
                const [fileCheck] = await db('quotes.quote_documents')
                    .select(db.raw('"fileData" IS NOT NULL OR "fileUrl" IS NOT NULL as "hasFile"'))
                    .where({ id });
                document.hasFile = fileCheck?.hasFile || false;
            }

            return document;
        } catch (error) {
            console.error('Error getting document by ID:', error);
            throw error;
        }
    },

    /**
     * Get the latest document of a specific type for a quote
     * @param {string} quoteId - Quote ID
     * @param {string} documentType - 'proforma' | 'export' | 'import'
     * @returns {Object|null} Latest document or null
     */
    async getLatestDocument(quoteId, documentType) {
        try {
            const document = await db('quotes.quote_documents')
                .where({ quoteId, documentType })
                .orderBy('createdAt', 'desc')
                .first();

            if (!document) {
                return null;
            }

            return {
                ...document,
                fileData: document.fileData ? '[BINARY DATA]' : null,
                hasFile: !!document.fileData
            };
        } catch (error) {
            console.error('Error getting latest document:', error);
            throw error;
        }
    },

    /**
     * Update a document
     * @param {number} id - Document ID
     * @param {Object} data - Fields to update
     * @returns {Object} Updated document
     */
    async updateDocument(id, data) {
        // Fields that can be updated
        const allowedFields = [
            'documentNumber', 'ettn', 'invoiceScenario', 'invoiceType',
            'exportFormat', 'exportTarget', 'fileData', 'fileName',
            'mimeType', 'notes'
        ];

        const updateData = {};
        for (const field of allowedFields) {
            if (data[field] !== undefined) {
                updateData[field] = data[field];
            }
        }

        if (Object.keys(updateData).length === 0) {
            const error = new Error('No valid fields to update');
            error.code = 'NO_UPDATE_FIELDS';
            throw error;
        }

        try {
            const [updated] = await db('quotes.quote_documents')
                .where({ id })
                .update(updateData)
                .returning('*');

            if (!updated) {
                const error = new Error('Document not found');
                error.code = 'NOT_FOUND';
                throw error;
            }

            return {
                ...updated,
                fileData: updated.fileData ? '[BINARY DATA]' : null,
                hasFile: !!updated.fileData
            };
        } catch (error) {
            console.error('Error updating document:', error);
            throw error;
        }
    },

    /**
     * Delete a document
     * @param {number} id - Document ID
     * @returns {boolean} Success
     */
    async deleteDocument(id) {
        try {
            const deleted = await db('quotes.quote_documents')
                .where({ id })
                .delete();

            if (deleted === 0) {
                const error = new Error('Document not found');
                error.code = 'NOT_FOUND';
                throw error;
            }

            return true;
        } catch (error) {
            console.error('Error deleting document:', error);
            throw error;
        }
    },

    /**
     * Get file data for download
     * @param {number} id - Document ID
     * @returns {Object} File data with buffer, name, and mimeType
     */
    async getFileData(id) {
        try {
            const document = await db('quotes.quote_documents')
                .select('fileData', 'fileUrl', 'fileName', 'mimeType')
                .where({ id })
                .first();

            if (!document) {
                const error = new Error('Document not found');
                error.code = 'NOT_FOUND';
                throw error;
            }

            if (!document.fileData && !document.fileUrl) {
                const error = new Error('No file data available');
                error.code = 'NO_FILE';
                throw error;
            }

            return {
                data: document.fileData,
                url: document.fileUrl,
                fileName: document.fileName || `document-${id}`,
                mimeType: document.mimeType || 'application/octet-stream'
            };
        } catch (error) {
            console.error('Error getting file data:', error);
            throw error;
        }
    },

    /**
     * Get document statistics for a quote
     * @param {string} quoteId - Quote ID
     * @returns {Object} Statistics
     */
    async getDocumentStats(quoteId) {
        try {
            const stats = await db('quotes.quote_documents')
                .select('documentType')
                .count('* as count')
                .where({ quoteId })
                .groupBy('documentType');

            const latestProforma = await this.getLatestDocument(quoteId, 'proforma');
            const latestExport = await this.getLatestDocument(quoteId, 'export');
            const latestImport = await this.getLatestDocument(quoteId, 'import');

            return {
                counts: stats.reduce((acc, row) => {
                    acc[row.documentType] = parseInt(row.count, 10);
                    return acc;
                }, { proforma: 0, export: 0, import: 0 }),
                latestProforma,
                latestExport,
                latestImport,
                hasProforma: !!latestProforma,
                hasExport: !!latestExport,
                hasImport: !!latestImport
            };
        } catch (error) {
            console.error('Error getting document stats:', error);
            throw error;
        }
    }
};

export default QuoteDocuments;
