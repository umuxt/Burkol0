/**
 * Export Service
 * Generates export files for shipments (CSV, XML, PDF, JSON)
 * 
 * Created for Invoice Export Integration (8 Aralık 2025)
 */

import db from '#db/connection';
import PDFDocument from 'pdfkit';

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Normalize Turkish characters to ASCII equivalents for PDF
 * PDFKit's Helvetica font doesn't support Turkish characters
 * @param {string} text - Text with Turkish characters
 * @returns {string} Normalized text
 */
function normalizeTurkish(text) {
  if (!text) return '';
  return String(text)
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'U')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 'S')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'O')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'C');
}

// ============================================
// SETTINGS HELPER
// ============================================

/**
 * Get setting value from shipment_settings table
 * @param {string} key - Setting key
 * @param {string} defaultValue - Default if not found
 * @returns {string} Setting value
 */
async function getSetting(key, defaultValue = '') {
  const setting = await db('materials.shipment_settings')
    .where('key', key)
    .first();
  return setting?.value || defaultValue;
}

/**
 * Get all company settings for PDF header
 * @returns {Object} Company settings
 */
async function getCompanySettings() {
  const settings = await db('materials.shipment_settings')
    .whereIn('key', ['company_name', 'company_address', 'company_tax_office', 'company_tax_number'])
    .select('key', 'value');
  
  const result = {};
  settings.forEach(s => {
    result[s.key] = s.value;
  });
  return result;
}

// ============================================
// CSV GENERATOR
// ============================================

/**
 * Generate CSV export for a shipment
 * @param {Object} shipment - Shipment with items
 * @returns {Object} { content: string, filename: string, mimeType: string }
 */
export async function generateCSV(shipment) {
  // Get delimiter from settings
  let delimiter = await getSetting('csv_delimiter', ';');
  if (delimiter === 'tab') delimiter = '\t';
  
  const d = delimiter;
  
  // UTF-8 BOM for Excel compatibility
  const BOM = '\uFEFF';
  
  // Header row
  const headers = [
    'Belge No', 'Tarih', 'Cari Kodu', 'Cari Ünvan', 'VKN', 'Vergi Dairesi',
    'Adres', 'Şehir', 'İlçe', 'Telefon', 'Email',
    'Stok Kodu', 'Stok Adı', 'Miktar', 'Birim', 'Birim Fiyat',
    'İskonto %', 'İskonto Tutar', 'KDV %', 'KDV Tutar',
    'Tevkifat Oranı', 'Tevkifat Tutar', 'Satır Toplam',
    'Lot No', 'Seri No', 'Para Birimi', 'Döviz Kuru',
    'Genel İskonto', 'Ara Toplam', 'Toplam KDV', 'Toplam Tevkifat', 'Genel Toplam'
  ].join(d);
  
  // Customer info from snapshot
  const customer = shipment.customerSnapshot || {};
  const erpCode = customer.erpAccountCode || '';
  
  // Data rows (one per item)
  const rows = (shipment.items || []).map(item => {
    return [
      shipment.shipmentCode || '',
      formatDate(shipment.createdAt),
      erpCode,
      customer.company || customer.name || '',
      customer.taxNumber || '',
      customer.taxOffice || '',
      customer.address || '',
      customer.city || '',
      customer.district || '',
      customer.phone || '',
      customer.email || '',
      item.materialCode || '',
      item.materialName || '',
      item.quantity || 0,
      item.unit || 'adet',
      item.unitPrice || 0,
      item.discountPercent || 0,
      item.discountAmount || 0,
      item.taxRate || 20,
      item.taxAmount || 0,
      item.withholdingRate || '',
      item.withholdingAmount || 0,
      item.totalAmount || 0,
      item.lotNumber || '',
      item.serialNumber || '',
      shipment.currency || 'TRY',
      shipment.exchangeRate || 1,
      shipment.discountTotal || 0,
      shipment.subtotal || 0,
      shipment.taxTotal || 0,
      shipment.withholdingTotal || 0,
      shipment.grandTotal || 0
    ].map(v => escapeCSV(v, d)).join(d);
  });
  
  const content = BOM + headers + '\n' + rows.join('\n');
  
  return {
    content,
    filename: `${shipment.shipmentCode || 'export'}.csv`,
    mimeType: 'text/csv; charset=utf-8'
  };
}

/**
 * Escape CSV value (handle delimiter and quotes)
 */
function escapeCSV(value, delimiter) {
  const str = String(value ?? '');
  if (str.includes(delimiter) || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// ============================================
// XML GENERATOR (Logo Tiger Format)
// ============================================

/**
 * Generate XML export for a shipment (Logo Tiger/GO format)
 * @param {Object} shipment - Shipment with items
 * @param {string} target - 'logo_tiger' | 'logo_go' | 'zirve'
 * @returns {Object} { content: string, filename: string, mimeType: string }
 */
export async function generateXML(shipment, target = 'logo_tiger') {
  const customer = shipment.customerSnapshot || {};
  const items = shipment.items || [];
  
  // Determine document type for XML
  const docType = shipment.documentType === 'invoice' ? 'FATURA' : 
                  shipment.documentType === 'both' ? 'FATURA' : 'SEVK_IRSALIYESI';
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<BELGE>
  <TIP>${docType}</TIP>
  <NUMARA>${escapeXML(shipment.shipmentCode || '')}</NUMARA>
  <TARIH>${formatDate(shipment.createdAt)}</TARIH>
  <PARA_BIRIMI>${shipment.currency || 'TRY'}</PARA_BIRIMI>
  <DOVIZ_KURU>${Number(shipment.exchangeRate || 1).toFixed(6)}</DOVIZ_KURU>
  
  <CARI>
    <KODU>${escapeXML(customer.erpAccountCode || '')}</KODU>
    <UNVAN>${escapeXML(customer.company || customer.name || '')}</UNVAN>
    <VKN>${escapeXML(customer.taxNumber || '')}</VKN>
    <VERGI_DAIRESI>${escapeXML(customer.taxOffice || '')}</VERGI_DAIRESI>
    <ADRES>${escapeXML(customer.address || '')}</ADRES>
    <IL>${escapeXML(customer.city || '')}</IL>
    <ILCE>${escapeXML(customer.district || '')}</ILCE>
    <TELEFON>${escapeXML(customer.phone || '')}</TELEFON>
    <EMAIL>${escapeXML(customer.email || '')}</EMAIL>
  </CARI>
  
  <TESLIM_ADRESI>`;
  
  // Alternate delivery address if used
  if (shipment.useAlternateDelivery && shipment.alternateDeliveryAddress) {
    const addr = shipment.alternateDeliveryAddress;
    xml += `
    <ADRES>${escapeXML(addr.address || '')}</ADRES>
    <IL>${escapeXML(addr.city || '')}</IL>
    <ILCE>${escapeXML(addr.district || '')}</ILCE>
    <POSTA_KODU>${escapeXML(addr.postalCode || '')}</POSTA_KODU>`;
  }
  
  xml += `
  </TESLIM_ADRESI>
  
  <SATIRLAR>`;
  
  // Add each item
  items.forEach((item, index) => {
    xml += `
    <SATIR>
      <SIRA>${index + 1}</SIRA>
      <STOK_KODU>${escapeXML(item.materialCode || '')}</STOK_KODU>
      <STOK_ADI><![CDATA[${item.materialName || ''}]]></STOK_ADI>
      <MIKTAR>${Number(item.quantity || 0)}</MIKTAR>
      <BIRIM>${escapeXML(item.unit || 'adet')}</BIRIM>
      <BIRIM_FIYAT>${Number(item.unitPrice || 0).toFixed(2)}</BIRIM_FIYAT>
      <ISKONTO_ORAN>${Number(item.discountPercent || 0)}</ISKONTO_ORAN>
      <ISKONTO_TUTAR>${Number(item.discountAmount || 0).toFixed(2)}</ISKONTO_TUTAR>
      <KDV_ORANI>${Number(item.taxRate || 20)}</KDV_ORANI>
      <KDV_MUAFIYET>${escapeXML(item.vatExemptionCode || '')}</KDV_MUAFIYET>
      <TEVKIFAT_ORAN>${escapeXML(item.withholdingCode || '')}</TEVKIFAT_ORAN>
      <TEVKIFAT_TUTAR>${Number(item.withholdingAmount || 0).toFixed(2)}</TEVKIFAT_TUTAR>
      <ARA_TOPLAM>${Number(item.subtotal || 0).toFixed(2)}</ARA_TOPLAM>
      <KDV_TUTAR>${Number(item.taxAmount || 0).toFixed(2)}</KDV_TUTAR>
      <TOPLAM>${Number(item.totalAmount || 0).toFixed(2)}</TOPLAM>
      <LOT_NO>${escapeXML(item.lotNumber || '')}</LOT_NO>
      <SERI_NO>${escapeXML(item.serialNumber || '')}</SERI_NO>
      <NOT>${escapeXML(item.itemNotes || '')}</NOT>
    </SATIR>`;
  });
  
  xml += `
  </SATIRLAR>
  
  <OZET>
    <GENEL_ISKONTO_TIP>${escapeXML(shipment.discountType || '')}</GENEL_ISKONTO_TIP>
    <GENEL_ISKONTO_DEGER>${Number(shipment.discountValue || 0)}</GENEL_ISKONTO_DEGER>
    <GENEL_ISKONTO_TUTAR>${Number(shipment.discountTotal || 0).toFixed(2)}</GENEL_ISKONTO_TUTAR>
    <ARA_TOPLAM>${Number(shipment.subtotal || 0).toFixed(2)}</ARA_TOPLAM>
    <KDV_TOPLAM>${Number(shipment.taxTotal || 0).toFixed(2)}</KDV_TOPLAM>
    <TEVKIFAT_TOPLAM>${Number(shipment.withholdingTotal || 0).toFixed(2)}</TEVKIFAT_TOPLAM>
    <GENEL_TOPLAM>${Number(shipment.grandTotal || 0).toFixed(2)}</GENEL_TOPLAM>
  </OZET>
  
  <EK_BILGILER>
    <OZEL_KOD>${escapeXML(shipment.specialCode || '')}</OZEL_KOD>
    <MALIYET_MERKEZI>${escapeXML(shipment.costCenter || '')}</MALIYET_MERKEZI>
    <BELGE_NOTU>${escapeXML(shipment.documentNotes || '')}</BELGE_NOTU>
  </EK_BILGILER>
</BELGE>`;

  return {
    content: xml,
    filename: `${shipment.shipmentCode || 'export'}.xml`,
    mimeType: 'application/xml; charset=utf-8'
  };
}

/**
 * Escape XML special characters
 */
function escapeXML(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================
// PDF GENERATOR
// ============================================

/**
 * Generate PDF export for a shipment
 * @param {Object} shipment - Shipment with items
 * @returns {Object} { buffer: Buffer, filename: string, mimeType: string }
 */
export async function generatePDF(shipment) {
  const company = await getCompanySettings();
  const customer = shipment.customerSnapshot || {};
  const items = shipment.items || [];
  
  // Determine document title (already ASCII-safe for PDF)
  const docTitle = shipment.documentType === 'invoice' ? 'FATURA' : 
                   shipment.documentType === 'both' ? 'FATURA / IRSALIYE' : 'SEVK IRSALIYESI';
  
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        size: 'A4', 
        margin: 50,
        bufferPages: true
      });
      
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          buffer,
          filename: `${shipment.shipmentCode || 'export'}.pdf`,
          mimeType: 'application/pdf'
        });
      });
      doc.on('error', reject);
      
      // ===== HEADER =====
      // Note: Using Helvetica which has limited Turkish support
      // For full Turkish support, register a custom font like 'DejaVu Sans'
      // Company info (left)
      doc.fontSize(14).font('Helvetica-Bold')
         .text(normalizeTurkish(company.company_name || 'Firma Adi'), 50, 50);
      doc.fontSize(9).font('Helvetica')
         .text(normalizeTurkish(company.company_address || ''), 50, 68)
         .text(`VD: ${normalizeTurkish(company.company_tax_office || '')} / VKN: ${company.company_tax_number || ''}`, 50, 80);
      
      // Document title and info (right)
      doc.fontSize(16).font('Helvetica-Bold')
         .text(normalizeTurkish(docTitle), 350, 50, { width: 200, align: 'right' });
      doc.fontSize(10).font('Helvetica')
         .text(`Belge No: ${shipment.shipmentCode || ''}`, 350, 75, { width: 200, align: 'right' })
         .text(`Tarih: ${formatDate(shipment.createdAt)}`, 350, 90, { width: 200, align: 'right' });
      
      // ===== CUSTOMER INFO =====
      doc.moveTo(50, 115).lineTo(545, 115).stroke();
      
      doc.fontSize(10).font('Helvetica-Bold')
         .text('MUSTERI BILGILERI', 50, 125);
      doc.fontSize(9).font('Helvetica')
         .text(`Firma: ${normalizeTurkish(customer.company || customer.name || '')}`, 50, 140)
         .text(`VKN: ${customer.taxNumber || ''} / VD: ${normalizeTurkish(customer.taxOffice || '')}`, 50, 152)
         .text(`Adres: ${normalizeTurkish(customer.address || '')}`, 50, 164)
         .text(`${normalizeTurkish(customer.city || '')} ${normalizeTurkish(customer.district || '')}`, 50, 176)
         .text(`Tel: ${customer.phone || ''} / Email: ${customer.email || ''}`, 50, 188);
      
      // ===== ITEMS TABLE =====
      doc.moveTo(50, 210).lineTo(545, 210).stroke();
      
      const tableTop = 220;
      const colWidths = shipment.includePrice 
        ? [30, 80, 150, 50, 40, 60, 45, 60] // with price columns
        : [30, 100, 200, 80, 80];           // without price
      
      // Table header
      doc.fontSize(8).font('Helvetica-Bold');
      if (shipment.includePrice) {
        doc.text('#', 50, tableTop)
           .text('Kod', 80, tableTop)
           .text('Urun Adi', 160, tableTop)
           .text('Miktar', 310, tableTop)
           .text('Birim', 360, tableTop)
           .text('B.Fiyat', 400, tableTop)
           .text('KDV%', 460, tableTop)
           .text('Toplam', 505, tableTop);
      } else {
        doc.text('#', 50, tableTop)
           .text('Kod', 80, tableTop)
           .text('Urun Adi', 180, tableTop)
           .text('Miktar', 380, tableTop)
           .text('Birim', 460, tableTop);
      }
      
      doc.moveTo(50, tableTop + 12).lineTo(545, tableTop + 12).stroke();
      
      // Table rows
      let y = tableTop + 20;
      doc.fontSize(8).font('Helvetica');
      
      items.forEach((item, index) => {
        if (y > 700) {
          doc.addPage();
          y = 50;
        }
        
        if (shipment.includePrice) {
          doc.text(String(index + 1), 50, y)
             .text(item.materialCode || '', 80, y, { width: 75 })
             .text(normalizeTurkish(item.materialName || ''), 160, y, { width: 145 })
             .text(formatNumber(item.quantity), 310, y)
             .text(normalizeTurkish(item.unit || 'adet'), 360, y)
             .text(formatNumber(item.unitPrice), 400, y)
             .text(String(item.taxRate || 20), 460, y)
             .text(formatNumber(item.totalAmount), 505, y);
        } else {
          doc.text(String(index + 1), 50, y)
             .text(item.materialCode || '', 80, y, { width: 95 })
             .text(normalizeTurkish(item.materialName || ''), 180, y, { width: 195 })
             .text(formatNumber(item.quantity), 380, y)
             .text(normalizeTurkish(item.unit || 'adet'), 460, y);
        }
        
        y += 15;
      });
      
      // ===== TOTALS (if price included) =====
      if (shipment.includePrice) {
        y += 10;
        doc.moveTo(350, y).lineTo(545, y).stroke();
        y += 10;
        
        doc.fontSize(9).font('Helvetica')
           .text('Ara Toplam:', 350, y)
           .text(formatCurrency(shipment.subtotal, shipment.currency), 480, y, { width: 65, align: 'right' });
        y += 15;
        
        if (shipment.discountTotal > 0) {
          doc.text('Iskonto:', 350, y)
             .text('-' + formatCurrency(shipment.discountTotal, shipment.currency), 480, y, { width: 65, align: 'right' });
          y += 15;
        }
        
        doc.text('KDV Toplam:', 350, y)
           .text(formatCurrency(shipment.taxTotal, shipment.currency), 480, y, { width: 65, align: 'right' });
        y += 15;
        
        if (shipment.withholdingTotal > 0) {
          doc.text('Tevkifat:', 350, y)
             .text('-' + formatCurrency(shipment.withholdingTotal, shipment.currency), 480, y, { width: 65, align: 'right' });
          y += 15;
        }
        
        doc.font('Helvetica-Bold')
           .text('GENEL TOPLAM:', 350, y)
           .text(formatCurrency(shipment.grandTotal, shipment.currency), 480, y, { width: 65, align: 'right' });
      }
      
      // ===== FOOTER =====
      doc.fontSize(8).font('Helvetica')
         .text('BeePlan tarafindan olusturuldu', 50, 780, { align: 'center', width: 495 });
      
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// ============================================
// JSON GENERATOR
// ============================================

/**
 * Generate JSON export for a shipment
 * @param {Object} shipment - Shipment with items
 * @returns {Object} { content: string, filename: string, mimeType: string }
 */
export async function generateJSON(shipment) {
  // Clean shipment object for export
  const exportData = {
    shipmentCode: shipment.shipmentCode,
    createdAt: shipment.createdAt,
    status: shipment.status,
    documentType: shipment.documentType,
    
    customer: shipment.customerSnapshot || {
      name: shipment.customerName,
      company: shipment.customerCompany,
      address: shipment.deliveryAddress
    },
    
    currency: shipment.currency || 'TRY',
    exchangeRate: shipment.exchangeRate || 1,
    
    items: (shipment.items || []).map(item => ({
      materialCode: item.materialCode,
      materialName: item.materialName,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      taxRate: item.taxRate,
      discountPercent: item.discountPercent,
      discountAmount: item.discountAmount,
      taxAmount: item.taxAmount,
      withholdingAmount: item.withholdingAmount,
      subtotal: item.subtotal,
      totalAmount: item.totalAmount,
      lotNumber: item.lotNumber,
      serialNumber: item.serialNumber
    })),
    
    totals: {
      subtotal: shipment.subtotal || 0,
      discountTotal: shipment.discountTotal || 0,
      taxTotal: shipment.taxTotal || 0,
      withholdingTotal: shipment.withholdingTotal || 0,
      grandTotal: shipment.grandTotal || 0
    },
    
    metadata: {
      exportedAt: new Date().toISOString(),
      exportTarget: shipment.exportTarget,
      specialCode: shipment.specialCode,
      costCenter: shipment.costCenter,
      notes: shipment.documentNotes
    }
  };
  
  const content = JSON.stringify(exportData, null, 2);
  
  return {
    content,
    filename: `${shipment.shipmentCode || 'export'}.json`,
    mimeType: 'application/json; charset=utf-8'
  };
}

// ============================================
// MAIN EXPORT FUNCTION
// ============================================

/**
 * Generate export in specified format
 * @param {Object} shipment - Shipment with items
 * @param {string} format - 'csv' | 'xml' | 'pdf' | 'json'
 * @param {string} target - Target program for XML (logo_tiger, logo_go, zirve)
 * @returns {Object} Export result with content/buffer, filename, mimeType
 */
export async function generateExport(shipment, format, target = 'logo_tiger') {
  switch (format.toLowerCase()) {
    case 'csv':
      return generateCSV(shipment);
    case 'xml':
      return generateXML(shipment, target);
    case 'pdf':
      return generatePDF(shipment);
    case 'json':
      return generateJSON(shipment);
    default:
      throw new Error(`Desteklenmeyen format: ${format}`);
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Format date as DD.MM.YYYY
 */
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
}

/**
 * Format number with Turkish locale
 */
function formatNumber(num) {
  if (num === null || num === undefined) return '';
  return Number(num).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Format currency with symbol
 */
function formatCurrency(num, currency = 'TRY') {
  if (num === null || num === undefined) return '';
  const formatted = Number(num).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const symbols = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };
  return `${formatted} ${symbols[currency] || currency}`;
}
