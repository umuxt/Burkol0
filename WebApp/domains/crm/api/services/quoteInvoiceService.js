/**
 * QuoteInvoice Service
 * Manages proforma and invoice operations for quotes
 * Updated: 2025-12-09 - Integrated with quote_documents table (P4.3)
 */

import db from '../../../../db/connection.js';
import QuoteItems from '../../../../db/models/quoteItems.js';
import QuoteDocuments from '../../../../db/models/quoteDocuments.js';
import PDFDocument from 'pdfkit';

const QuoteInvoiceService = {

    /**
     * Generate proforma number for a quote
     * @param {string} quoteId - Quote ID
     * @param {Object} options - { createdBy }
     * @returns {Object} { quote, document, isNew, message }
     */
    async generateProforma(quoteId, options = {}) {
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

            // Check if proforma already exists in quote_documents
            const existingProforma = await QuoteDocuments.getLatestDocument(quoteId, 'proforma');
            if (existingProforma) {
                return {
                    quote,
                    document: existingProforma,
                    isNew: false,
                    message: 'Proforma already exists'
                };
            }

            // Generate proforma number using database function
            const result = await trx.raw('SELECT quotes.generate_proforma_number() as proforma_number');
            const proformaNumber = result.rows[0].proforma_number;

            // Update quote with proforma details (backward compatibility)
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

            // Create document record in quote_documents table
            const document = await QuoteDocuments.createDocument(quoteId, 'proforma', {
                documentNumber: proformaNumber,
                createdBy: options.createdBy || 'system',
                notes: `Proforma oluşturuldu: ${proformaNumber}`
            });

            return {
                quote: updatedQuote,
                document,
                isNew: true,
                message: 'Proforma başarıyla oluşturuldu'
            };

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
            const exportTarget = options.exportTarget || 'LOGO';

            // Generate export based on format
            if (format === 'xml') {
                fileContent = this._generateXmlInvoice(quote, items, totals, invoiceScenario, invoiceType, exportTarget);
                fileName = `EXPORT-${exportTarget}-${quoteId}-${timestamp}.xml`;
                mimeType = 'application/xml';
            } else if (format === 'csv') {
                fileContent = this._generateCsvInvoice(quote, items, totals, exportTarget);
                fileName = `EXPORT-${exportTarget}-${quoteId}-${timestamp}.csv`;
                mimeType = 'text/csv';
            } else if (format === 'pdf') {
                // Generate real PDF using PDFKit
                fileContent = await this._generatePdfInvoice(quote, items, totals, invoiceScenario, invoiceType);
                fileName = `PROFORMA-${quote.proformaNumber || quoteId}-${timestamp}.pdf`;
                mimeType = 'application/pdf';
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

            // Create document record in quote_documents table
            const document = await QuoteDocuments.createDocument(quoteId, 'export', {
                invoiceScenario,
                invoiceType,
                exportFormat: format,
                exportTarget: options.exportTarget || 'LOGO',
                createdBy: options.createdBy || 'system',
                notes: `Export: ${format.toUpperCase()} for ${options.exportTarget || 'LOGO'}`
            });

            return {
                success: true,
                fileName,
                fileContent: Buffer.from(fileContent, 'utf-8'),
                mimeType,
                document
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

        // Validate ETTN format (UUID: 8-4-4-4-12) - DISABLED for now
        // const ettnRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        // if (!ettnRegex.test(invoiceEttn)) {
        //     const error = new Error('Invalid ETTN format. Expected UUID format (e.g., 550e8400-e29b-41d4-a716-446655440000)');
        //     error.code = 'INVALID_ETTN';
        //     throw error;
        // }

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

            // Create document record in quote_documents table (with file)
            const documentData = {
                documentNumber: invoiceNumber,
                ettn: invoiceEttn,
                invoiceScenario: quote.invoiceScenario,
                invoiceType: quote.invoiceType,
                createdBy: data.createdBy || 'system',
                notes: `Import: Fatura No: ${invoiceNumber}, ETTN: ${invoiceEttn}`
            };

            if (file && fileName) {
                documentData.fileData = file;
                documentData.fileName = fileName;
                documentData.mimeType = 'application/xml';
            }

            const document = await QuoteDocuments.createDocument(quoteId, 'import', documentData);

            return {
                quote: updatedQuote,
                document,
                message: 'ETTN başarıyla kaydedildi'
            };

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
     * Get document history for a quote
     * @param {string} quoteId - Quote ID
     * @param {string} documentType - Optional: 'proforma' | 'export' | 'import'
     * @returns {Object} { documents, stats }
     */
    async getDocumentHistory(quoteId, documentType = null) {
        try {
            const documents = await QuoteDocuments.getDocumentsByQuoteId(quoteId, documentType);
            const stats = await QuoteDocuments.getDocumentStats(quoteId);

            return {
                documents,
                stats
            };
        } catch (error) {
            console.error('Error getting document history:', error);
            throw error;
        }
    },

    /**
     * Get single document by ID
     * @param {number} docId - Document ID
     * @param {boolean} includeFileData - Include binary file data
     * @returns {Object} Document
     */
    async getDocumentById(docId, includeFileData = false) {
        try {
            const document = await QuoteDocuments.getDocumentById(docId, includeFileData);
            if (!document) {
                const error = new Error('Document not found');
                error.code = 'NOT_FOUND';
                throw error;
            }
            return document;
        } catch (error) {
            console.error('Error getting document:', error);
            throw error;
        }
    },

    /**
     * Get file data for download
     * @param {number} docId - Document ID
     * @returns {Object} { data, fileName, mimeType }
     */
    async getDocumentFile(docId) {
        try {
            return await QuoteDocuments.getFileData(docId);
        } catch (error) {
            console.error('Error getting document file:', error);
            throw error;
        }
    },

    /**
     * Generate XML invoice (Logo Tiger format)
     * @private
     */
    _generateXmlInvoice(quote, items, totals, invoiceScenario, invoiceType, exportTarget = 'LOGO') {
        const lines = items.map((item, index) => {
            return `    <FATURASATIR>
      <SATIRNO>${index + 1}</SATIRNO>
      <MALZEMEKODU>${this._escapeXml(item.stockCode || '')}</MALZEMEKODU>
      <MALZEMEADI>${this._escapeXml(item.productName)}</MALZEMEADI>
      <MIKTAR>${item.quantity}</MIKTAR>
      <BIRIM>${this._escapeXml(item.unit)}</BIRIM>
      <BIRIMFIYAT>${item.unitPrice}</BIRIMFIYAT>
      <ISKONTOYUZDE>${item.discountPercent || 0}</ISKONTOYUZDE>
      <KDVORANI>${item.taxRate || 0}</KDVORANI>
      <TUTAR>${item.subtotal || 0}</TUTAR>
      <KDVTUTARI>${item.taxAmount || 0}</KDVTUTARI>
      <TOPLAM>${item.totalAmount || 0}</TOPLAM>
    </FATURASATIR>`;
        }).join('\n');

        // Logo Tiger / Zirve compatible XML format
        return `<?xml version="1.0" encoding="UTF-8"?>
<!-- BeePlan ERP - ${exportTarget} Fatura Export -->
<!-- Export Tarihi: ${new Date().toISOString()} -->
<FATURA>
  <HEDEFPROGRAM>${exportTarget}</HEDEFPROGRAM>
  <FATURABILGI>
    <PROFORMANO>${this._escapeXml(quote.proformaNumber || '')}</PROFORMANO>
    <TEKLIFNO>${this._escapeXml(quote.id || '')}</TEKLIFNO>
    <FATURASRENARYOSU>${invoiceScenario}</FATURASRENARYOSU>
    <FATURATIPI>${invoiceType}</FATURATIPI>
    <PARABIRIMI>${quote.currency || 'TRY'}</PARABIRIMI>
    <DOVIZKURU>${quote.exchangeRate || 1.0}</DOVIZKURU>
    <FATURATARIHI>${new Date().toISOString().split('T')[0]}</FATURATARIHI>
  </FATURABILGI>
  <CARIKART>
    <CARIKODU>${this._escapeXml(quote.customerTaxNumber || quote.id || '')}</CARIKODU>
    <CARIADI>${this._escapeXml(quote.customerCompany || quote.customerName || '')}</CARIADI>
    <VERGINO>${this._escapeXml(quote.customerTaxNumber || '')}</VERGINO>
    <VERGIDAIRESI>${this._escapeXml(quote.customerTaxOffice || '')}</VERGIDAIRESI>
    <ADRES>${this._escapeXml(quote.customerAddress || '')}</ADRES>
    <SEHIR>${this._escapeXml(quote.customerCity || '')}</SEHIR>
    <EFATURAMUKELLEF>${quote.isEInvoiceTaxpayer ? 'EVET' : 'HAYIR'}</EFATURAMUKELLEF>
    <GIBPKETIKETI>${this._escapeXml(quote.gibPkLabel || '')}</GIBPKETIKETI>
  </CARIKART>
  <SATIRLAR>
${lines}
  </SATIRLAR>
  <TOPLAMLAR>
    <ARATOPLAM>${totals.subtotal || 0}</ARATOPLAM>
    <ISKONTOTOPLAM>${totals.discountTotal || 0}</ISKONTOTOPLAM>
    <KDVTOPLAM>${totals.taxTotal || 0}</KDVTOPLAM>
    <STOPAJTOPLAM>${totals.withholdingTotal || 0}</STOPAJTOPLAM>
    <GENELTOPLAM>${totals.grandTotal || 0}</GENELTOPLAM>
  </TOPLAMLAR>
</FATURA>`;
    },

    /**
     * Generate CSV invoice for Logo/Zirve import
     * @private
     */
    _generateCsvInvoice(quote, items, totals, exportTarget = 'LOGO') {
        // UTF-8 BOM for Excel compatibility
        let csv = '\uFEFF';

        // Export Header - for identification
        csv += `# BeePlan ERP - ${exportTarget} Fatura Export\n`;
        csv += `# Export Tarihi: ${new Date().toISOString()}\n`;
        csv += '\n';

        // Invoice Header
        csv += '# FATURA BILGILERI\n';
        csv += `HEDEF_PROGRAM,${exportTarget}\n`;
        csv += `PROFORMA_NO,${quote.proformaNumber || ''}\n`;
        csv += `TEKLIF_NO,${quote.id || ''}\n`;
        csv += `FATURA_TARIHI,${new Date().toISOString().split('T')[0]}\n`;
        csv += `FATURA_SENARYOSU,${quote.invoiceScenario || 'TEMEL'}\n`;
        csv += `FATURA_TIPI,${quote.invoiceType || 'SATIS'}\n`;
        csv += `PARA_BIRIMI,${quote.currency || 'TRY'}\n`;
        csv += `DOVIZ_KURU,${quote.exchangeRate || 1.0}\n`;
        csv += '\n';

        // Customer Info - Cari Kart bilgileri
        csv += '# CARI KART BILGILERI\n';
        csv += `CARI_KODU,${quote.customerTaxNumber || quote.id || ''}\n`;
        csv += `CARI_ADI,"${this._escapeCsv(quote.customerCompany || quote.customerName || '')}"\n`;
        csv += `VERGI_NO,${quote.customerTaxNumber || ''}\n`;
        csv += `VERGI_DAIRESI,"${this._escapeCsv(quote.customerTaxOffice || '')}"\n`;
        csv += `ADRES,"${this._escapeCsv(quote.customerAddress || '')}"\n`;
        csv += `SEHIR,"${this._escapeCsv(quote.customerCity || '')}"\n`;
        csv += `EFATURA_MUKELLEF,${quote.isEInvoiceTaxpayer ? 'EVET' : 'HAYIR'}\n`;
        csv += `GIB_PK_ETIKET,"${this._escapeCsv(quote.gibPkLabel || '')}"\n`;
        csv += '\n';

        // Items Header - Malzeme/Hizmet satırları
        csv += '# FATURA SATIRLARI\n';
        csv += 'SATIR_NO,MALZEME_KODU,MALZEME_ADI,MIKTAR,BIRIM,BIRIM_FIYAT,ISKONTO_YUZDE,KDV_ORANI,TUTAR,KDV_TUTARI,TOPLAM\n';

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
        csv += '# FATURA TOPLAMLARI\n';
        csv += `ARA_TOPLAM,${totals.subtotal || 0}\n`;
        csv += `ISKONTO_TOPLAM,${totals.discountTotal || 0}\n`;
        csv += `KDV_TOPLAM,${totals.taxTotal || 0}\n`;
        csv += `STOPAJ_TOPLAM,${totals.withholdingTotal || 0}\n`;
        csv += `GENEL_TOPLAM,${totals.grandTotal || 0}\n`;

        return csv;
    },

    /**
     * Generate PDF invoice (simple text-based for now)
     * Can be enhanced with pdfkit or puppeteer for better formatting
     * @private
     */
    _generatePdfInvoice(quote, items, totals, invoiceScenario, invoiceType) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ margin: 50, size: 'A4' });
                const chunks = [];

                doc.on('data', chunk => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));
                doc.on('error', reject);

                // Turkish character converter for PDF (Helvetica doesn't support Turkish)
                const tr = (str) => {
                    if (!str) return '-';
                    return String(str)
                        .replace(/İ/g, 'I')
                        .replace(/ı/g, 'i')
                        .replace(/Ş/g, 'S')
                        .replace(/ş/g, 's')
                        .replace(/Ğ/g, 'G')
                        .replace(/ğ/g, 'g')
                        .replace(/Ü/g, 'U')
                        .replace(/ü/g, 'u')
                        .replace(/Ö/g, 'O')
                        .replace(/ö/g, 'o')
                        .replace(/Ç/g, 'C')
                        .replace(/ç/g, 'c');
                };

                const formatPrice = (value) => {
                    return new Intl.NumberFormat('tr-TR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }).format(value || 0);
                };

                const formatDate = (date) => {
                    if (!date) return '-';
                    return new Date(date).toLocaleDateString('tr-TR');
                };

                // Header
                doc.fontSize(20).font('Helvetica-Bold').text('PROFORMA FATURA', { align: 'center' });
                doc.moveDown(0.5);
                doc.fontSize(10).font('Helvetica').text(`Belge No: ${quote.proformaNumber || quote.id}`, { align: 'center' });
                doc.text(`Tarih: ${formatDate(new Date())} | Senaryo: ${invoiceScenario} | Tip: ${invoiceType}`, { align: 'center' });
                doc.moveDown(1);

                // Line
                doc.strokeColor('#000').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
                doc.moveDown(0.5);

                // Customer Info - Using flat fields from JOIN
                doc.fontSize(12).font('Helvetica-Bold').text('MUSTERI BILGILERI');
                doc.fontSize(10).font('Helvetica');
                doc.text(`Firma: ${tr(quote.customerCompany || quote.customerName)}`);
                doc.text(`Vergi No: ${quote.customerTaxNumber || '-'}`);
                doc.text(`Vergi Dairesi: ${tr(quote.customerTaxOffice) || '-'}`);
                doc.text(`Adres: ${tr(quote.customerAddress)} ${tr(quote.customerCity) || ''}`);
                doc.moveDown(1);

                // Line
                doc.strokeColor('#000').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
                doc.moveDown(0.5);

                // Items Header
                doc.fontSize(12).font('Helvetica-Bold').text('FATURA KALEMLERI');
                doc.moveDown(0.5);

                // Table Header
                const tableTop = doc.y;
                doc.fontSize(9).font('Helvetica-Bold');
                doc.text('No', 50, tableTop, { width: 30 });
                doc.text('Urun/Hizmet', 80, tableTop, { width: 200 });
                doc.text('Miktar', 280, tableTop, { width: 50, align: 'right' });
                doc.text('Birim Fiyat', 340, tableTop, { width: 80, align: 'right' });
                doc.text('Tutar', 430, tableTop, { width: 80, align: 'right' });

                doc.moveDown(0.5);
                doc.strokeColor('#ccc').lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();

                // Table Rows
                doc.font('Helvetica').fontSize(9);
                let y = doc.y + 10;
                items.forEach((item, index) => {
                    if (y > 700) {
                        doc.addPage();
                        y = 50;
                    }
                    doc.text(String(index + 1), 50, y, { width: 30 });
                    doc.text(tr((item.productName || '').substring(0, 40)), 80, y, { width: 200 });
                    doc.text(String(item.quantity), 280, y, { width: 50, align: 'right' });
                    doc.text(formatPrice(item.unitPrice), 340, y, { width: 80, align: 'right' });
                    doc.text(formatPrice(item.totalAmount), 430, y, { width: 80, align: 'right' });
                    y += 18;
                });

                doc.y = y + 10;
                doc.strokeColor('#000').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
                doc.moveDown(1);

                // Totals
                doc.fontSize(10).font('Helvetica');
                doc.text(`Ara Toplam: ${formatPrice(totals.subtotal)} TL`, { align: 'right' });
                if (totals.discountTotal > 0) {
                    doc.text(`Iskonto: -${formatPrice(totals.discountTotal)} TL`, { align: 'right' });
                }
                doc.text(`KDV Toplam: ${formatPrice(totals.taxTotal)} TL`, { align: 'right' });
                doc.moveDown(0.3);
                doc.fontSize(14).font('Helvetica-Bold').text(`GENEL TOPLAM: ${formatPrice(totals.grandTotal)} TL`, { align: 'right' });

                doc.moveDown(2);

                // Footer
                doc.fontSize(8).font('Helvetica').fillColor('#666');
                doc.text('BeePlan ERP - Proforma Fatura', 50, 780, { align: 'center', width: 495 });
                doc.text(`Olusturulma: ${formatDate(new Date())}`, 50, 790, { align: 'center', width: 495 });

                doc.end();
            } catch (error) {
                reject(error);
            }
        });
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
