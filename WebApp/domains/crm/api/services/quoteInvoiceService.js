/**
 * QuoteInvoice Service
 * Manages proforma and invoice operations for quotes
 */

import db from '../../../../db/connection.js';
import QuoteItems from '../../../../db/models/quoteItems.js';

const QuoteInvoiceService = {

    /**
     * Generate proforma number for a quote
     * @param {string} quoteId - Quote ID
     * @returns {Object} Updated quote with proforma number
     */
    async generateProforma(quoteId) {
        const trx = await db.transaction();

        try {
            // Get current quote
            const quote = await trx('quotes.quotes')
                .where('id', quoteId)
                .first();

            if (!quote) {
                const error = new Error('Quote not found');
                error.code = 'NOT_FOUND';
                throw error;
            }

            // Check if proforma already exists
            if (quote.proformaNumber) {
                const error = new Error('Proforma already generated for this quote');
                error.code = 'ALREADY_EXISTS';
                throw error;
            }

            // Generate proforma number using database function
            const result = await trx.raw('SELECT quotes.generate_proforma_number() as proforma_number');
            const proformaNumber = result.rows[0].proforma_number;

            // Update quote with proforma details
            const [updatedQuote] = await trx('quotes.quotes')
                .where('id', quoteId)
                .update({
                    proformaNumber,
                    proformaCreatedAt: new Date(),
                    status: 'proformaSent',
                    updatedAt: new Date()
                })
                .returning('*');

            await trx.commit();

            return updatedQuote;

        } catch (error) {
            await trx.rollback();
            console.error('Error generating proforma:', error);
            throw error;
        }
    },

    /**
     * Export invoice in specified format
     * @param {string} quoteId - Quote ID
     * @param {Object} options - Export options { format: 'xml'|'csv'|'pdf', invoiceScenario, invoiceType }
     * @returns {Object} { success, fileName, fileContent, mimeType }
     */
    async exportInvoice(quoteId, options = {}) {
        const { format = 'xml', invoiceScenario = 'TEMEL', invoiceType = 'SATIS' } = options;

        const trx = await db.transaction();

        try {
            // Get quote with customer data
            const quote = await trx('quotes.quotes as q')
                .leftJoin('quotes.customers as c', 'q.customerId', 'c.id')
                .where('q.id', quoteId)
                .select(
                    'q.*',
                    'c.name as customerName',
                    'c.company as customerCompany',
                    'c.taxNumber as customerTaxNumber',
                    'c.taxOffice as customerTaxOffice',
                    'c.address as customerAddress',
                    'c.city as customerCity',
                    'c.isEInvoiceTaxpayer',
                    'c.gibPkLabel',
                    'c.defaultInvoiceScenario'
                )
                .first();

            if (!quote) {
                const error = new Error('Quote not found');
                error.code = 'NOT_FOUND';
                throw error;
            }

            // Check if proforma exists
            if (!quote.proformaNumber) {
                const error = new Error('Please generate proforma first');
                error.code = 'PROFORMA_REQUIRED';
                throw error;
            }

            // Get quote items with calculated totals
            const items = await trx('quotes.quote_items')
                .where('quoteId', quoteId)
                .orderBy('lineNumber', 'asc');

            if (!items || items.length === 0) {
                const error = new Error('No items found for this quote');
                error.code = 'NO_ITEMS';
                throw error;
            }

            // Calculate totals
            const totals = await QuoteItems.calculateQuoteTotals(quoteId);

            let fileContent, fileName, mimeType;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

            // Generate export based on format
            if (format === 'xml') {
                fileContent = this._generateXmlInvoice(quote, items, totals, invoiceScenario, invoiceType);
                fileName = `INV-${quoteId}-${timestamp}.xml`;
                mimeType = 'application/xml';
            } else if (format === 'csv') {
                fileContent = this._generateCsvInvoice(quote, items, totals);
                fileName = `INV-${quoteId}-${timestamp}.csv`;
                mimeType = 'text/csv';
            } else if (format === 'pdf') {
                // PDF generation - stub for now
                const error = new Error('PDF export not yet implemented');
                error.code = 'NOT_IMPLEMENTED';
                throw error;
            } else {
                const error = new Error('Invalid export format');
                error.code = 'INVALID_FORMAT';
                throw error;
            }

            // Update quote with export details
            await trx('quotes.quotes')
                .where('id', quoteId)
                .update({
                    invoiceExportedAt: new Date(),
                    invoiceScenario,
                    invoiceType,
                    status: 'invoiceExported',
                    updatedAt: new Date()
                });

            await trx.commit();

            return {
                success: true,
                fileName,
                fileContent: Buffer.from(fileContent, 'utf-8'),
                mimeType
            };

        } catch (error) {
            await trx.rollback();
            console.error('Error exporting invoice:', error);
            throw error;
        }
    },

    /**
     * Import ETTN from external system (Logo/Zirve)
     * @param {string} quoteId - Quote ID
     * @param {Object} data - { invoiceNumber, invoiceEttn, file?, fileName? }
     * @returns {Object} Updated quote
     */
    async importEttn(quoteId, data) {
        const { invoiceNumber, invoiceEttn, file, fileName } = data;

        // Validate ETTN format (UUID: 8-4-4-4-12)
        const ettnRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!ettnRegex.test(invoiceEttn)) {
            const error = new Error('Invalid ETTN format. Expected UUID format (e.g., 550e8400-e29b-41d4-a716-446655440000)');
            error.code = 'INVALID_ETTN';
            throw error;
        }

        const trx = await db.transaction();

        try {
            // Get quote
            const quote = await trx('quotes.quotes')
                .where('id', quoteId)
                .first();

            if (!quote) {
                const error = new Error('Quote not found');
                error.code = 'NOT_FOUND';
                throw error;
            }

            // Check if invoice was exported
            if (!quote.invoiceExportedAt) {
                const error = new Error('Please export invoice first');
                error.code = 'EXPORT_REQUIRED';
                throw error;
            }

            // Prepare update data
            const updateData = {
                invoiceNumber,
                invoiceEttn,
                invoiceImportedAt: new Date(),
                status: 'invoiceImported',
                updatedAt: new Date()
            };

            // Add file if provided
            if (file && fileName) {
                updateData.invoiceImportedFile = file;
                updateData.invoiceImportedFileName = fileName;
            }

            // Update quote
            const [updatedQuote] = await trx('quotes.quotes')
                .where('id', quoteId)
                .update(updateData)
                .returning('*');

            await trx.commit();

            return updatedQuote;

        } catch (error) {
            await trx.rollback();
            console.error('Error importing ETTN:', error);
            throw error;
        }
    },

    /**
     * Check 7-day rule for invoice issuance after shipment
     * @param {string} quoteId - Quote ID
     * @returns {Object} { hasWarning, isOverdue, daysRemaining, shipments }
     */
    async checkSevenDayRule(quoteId) {
        try {
            // Get all shipments related to this quote
            const shipments = await db('materials.shipments')
                .where('relatedQuoteId', quoteId)
                .whereIn('status', ['exported', 'completed'])
                .orderBy('createdAt', 'asc');

            if (!shipments || shipments.length === 0) {
                return {
                    hasWarning: false,
                    isOverdue: false,
                    daysRemaining: null,
                    shipments: []
                };
            }

            // Find the oldest exported shipment
            const oldestShipment = shipments[0];
            const shipmentDate = new Date(oldestShipment.createdAt);
            const now = new Date();

            // Calculate days elapsed
            const daysDiff = Math.floor((now - shipmentDate) / (1000 * 60 * 60 * 24));
            const daysRemaining = 7 - daysDiff;

            // Check if invoice was imported (no warning needed if already invoiced)
            const quote = await db('quotes.quotes')
                .where('id', quoteId)
                .first();

            const hasInvoice = quote && quote.invoiceImportedAt;

            return {
                hasWarning: !hasInvoice && daysDiff >= 5, // Warning at 5 days
                isOverdue: !hasInvoice && daysDiff > 7,    // Overdue after 7 days
                daysRemaining: hasInvoice ? null : Math.max(0, daysRemaining),
                shipments: shipments.map(s => ({
                    id: s.id,
                    shipmentCode: s.shipmentCode,
                    status: s.status,
                    createdAt: s.createdAt,
                    daysAgo: Math.floor((now - new Date(s.createdAt)) / (1000 * 60 * 60 * 24))
                }))
            };

        } catch (error) {
            console.error('Error checking 7-day rule:', error);
            throw error;
        }
    },

    /**
     * Generate XML invoice (Logo Tiger format)
     * @private
     */
    _generateXmlInvoice(quote, items, totals, invoiceScenario, invoiceType) {
        const lines = items.map((item, index) => {
            return `    <InvoiceLine>
      <LineNumber>${index + 1}</LineNumber>
      <ProductCode>${this._escapeXml(item.stockCode || '')}</ProductCode>
      <ProductName>${this._escapeXml(item.productName)}</ProductName>
      <Quantity>${item.quantity}</Quantity>
      <Unit>${this._escapeXml(item.unit)}</Unit>
      <UnitPrice>${item.unitPrice}</UnitPrice>
      <DiscountPercent>${item.discountPercent || 0}</DiscountPercent>
      <TaxRate>${item.taxRate || 0}</TaxRate>
      <Subtotal>${item.subtotal || 0}</Subtotal>
      <TaxAmount>${item.taxAmount || 0}</TaxAmount>
      <TotalAmount>${item.totalAmount || 0}</TotalAmount>
    </InvoiceLine>`;
        }).join('\n');

        return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice>
  <InvoiceHeader>
    <ProformaNumber>${this._escapeXml(quote.proformaNumber || '')}</ProformaNumber>
    <InvoiceScenario>${invoiceScenario}</InvoiceScenario>
    <InvoiceType>${invoiceType}</InvoiceType>
    <Currency>${quote.currency || 'TRY'}</Currency>
    <ExchangeRate>${quote.exchangeRate || 1.0}</ExchangeRate>
    <IssueDate>${new Date().toISOString().split('T')[0]}</IssueDate>
  </InvoiceHeader>
  <CustomerInfo>
    <Name>${this._escapeXml(quote.customerName || quote.customerCompany || '')}</Name>
    <TaxNumber>${this._escapeXml(quote.customerTaxNumber || '')}</TaxNumber>
    <TaxOffice>${this._escapeXml(quote.customerTaxOffice || '')}</TaxOffice>
    <Address>${this._escapeXml(quote.customerAddress || '')}</Address>
    <City>${this._escapeXml(quote.customerCity || '')}</City>
    <IsEInvoiceTaxpayer>${quote.isEInvoiceTaxpayer ? 'true' : 'false'}</IsEInvoiceTaxpayer>
    <GibPkLabel>${this._escapeXml(quote.gibPkLabel || '')}</GibPkLabel>
  </CustomerInfo>
  <InvoiceLines>
${lines}
  </InvoiceLines>
  <Totals>
    <Subtotal>${totals.subtotal || 0}</Subtotal>
    <DiscountTotal>${totals.discountTotal || 0}</DiscountTotal>
    <TaxTotal>${totals.taxTotal || 0}</TaxTotal>
    <WithholdingTotal>${totals.withholdingTotal || 0}</WithholdingTotal>
    <GrandTotal>${totals.grandTotal || 0}</GrandTotal>
  </Totals>
</Invoice>`;
    },

    /**
     * Generate CSV invoice
     * @private
     */
    _generateCsvInvoice(quote, items, totals) {
        // UTF-8 BOM for Excel compatibility
        let csv = '\uFEFF';

        // Header
        csv += 'Line,Product Code,Product Name,Quantity,Unit,Unit Price,Discount %,Tax Rate,Subtotal,Tax Amount,Total\n';

        // Items
        items.forEach((item, index) => {
            csv += `${index + 1},`;
            csv += `"${this._escapeCsv(item.stockCode || '')}",`;
            csv += `"${this._escapeCsv(item.productName)}",`;
            csv += `${item.quantity},`;
            csv += `"${this._escapeCsv(item.unit)}",`;
            csv += `${item.unitPrice},`;
            csv += `${item.discountPercent || 0},`;
            csv += `${item.taxRate || 0},`;
            csv += `${item.subtotal || 0},`;
            csv += `${item.taxAmount || 0},`;
            csv += `${item.totalAmount || 0}\n`;
        });

        // Totals
        csv += '\n';
        csv += `Subtotal,,,,,,,,,${totals.subtotal || 0}\n`;
        csv += `Discount Total,,,,,,,,,${totals.discountTotal || 0}\n`;
        csv += `Tax Total,,,,,,,,,${totals.taxTotal || 0}\n`;
        csv += `Withholding Total,,,,,,,,,${totals.withholdingTotal || 0}\n`;
        csv += `Grand Total,,,,,,,,,${totals.grandTotal || 0}\n`;

        return csv;
    },

    /**
     * Escape XML special characters
     * @private
     */
    _escapeXml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    },

    /**
     * Escape CSV special characters
     * @private
     */
    _escapeCsv(str) {
        if (!str) return '';
        return String(str).replace(/"/g, '""');
    }
};

export default QuoteInvoiceService;
