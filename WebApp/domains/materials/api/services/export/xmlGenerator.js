/**
 * XML Generator
 * Logo Tiger/Go ve Zirve için XML export (e-İrsaliye/e-Fatura formatı)
 * Referans: INVOICE-EXPORT-INTEGRATION.md Section 6.2
 * 
 * Logo XML Format (Basitleştirilmiş):
 * - INVOICE: Fatura
 * - WAYBILL: İrsaliye (Sevk İrsaliyesi)
 */

import db from '../../connection.js';

/**
 * Generate Logo/Zirve compatible XML
 * @param {number} shipmentId - Shipment ID
 * @param {string} type - 'invoice' | 'waybill'
 * @returns {string} XML content
 */
export async function generateXML(shipmentId, type = 'waybill') {
  // Get shipment with items
  const shipment = await db('materials.shipments')
    .where({ id: shipmentId })
    .first();
  
  if (!shipment) {
    throw new Error(`Shipment not found: ${shipmentId}`);
  }
  
  const items = await db('materials.shipment_items')
    .where({ shipmentId })
    .orderBy('id');
  
  // Get customer data
  const customerData = shipment.customerSnapshot || {
    name: shipment.customerName,
    company: shipment.customerCompany,
    taxOffice: shipment.customerTaxOffice,
    taxNumber: shipment.customerTaxNumber,
    city: shipment.customerCity,
    district: shipment.customerDistrict,
    address: shipment.deliveryAddress,
    phone: shipment.customerPhone,
    email: shipment.customerEmail
  };
  
  const docType = type === 'invoice' ? 'INVOICE' : 'WAYBILL';
  const docDate = formatXMLDate(shipment.createdAt);
  
  // Build XML
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += `<${docType}>\n`;
  xml += `  <HEADER>\n`;
  xml += `    <DOCUMENT_NO>${escapeXML(shipment.shipmentCode)}</DOCUMENT_NO>\n`;
  xml += `    <DOCUMENT_DATE>${docDate}</DOCUMENT_DATE>\n`;
  xml += `    <CURRENCY>${escapeXML(shipment.currency || 'TRY')}</CURRENCY>\n`;
  xml += `  </HEADER>\n`;
  
  xml += `  <CUSTOMER>\n`;
  xml += `    <NAME>${escapeXML(customerData.company || customerData.name || '')}</NAME>\n`;
  xml += `    <TAX_OFFICE>${escapeXML(customerData.taxOffice || '')}</TAX_OFFICE>\n`;
  xml += `    <TAX_NUMBER>${escapeXML(customerData.taxNumber || '')}</TAX_NUMBER>\n`;
  xml += `    <ADDRESS>${escapeXML(customerData.address || '')}</ADDRESS>\n`;
  xml += `    <CITY>${escapeXML(customerData.city || '')}</CITY>\n`;
  xml += `    <DISTRICT>${escapeXML(customerData.district || '')}</DISTRICT>\n`;
  xml += `    <PHONE>${escapeXML(customerData.phone || '')}</PHONE>\n`;
  xml += `    <EMAIL>${escapeXML(customerData.email || '')}</EMAIL>\n`;
  xml += `  </CUSTOMER>\n`;
  
  xml += `  <LINES>\n`;
  
  for (const item of items) {
    xml += `    <LINE>\n`;
    xml += `      <MATERIAL_CODE>${escapeXML(item.materialCode)}</MATERIAL_CODE>\n`;
    xml += `      <QUANTITY>${item.quantity || 0}</QUANTITY>\n`;
    xml += `      <UNIT>${escapeXML(item.unit || 'adet')}</UNIT>\n`;
    
    if (type === 'invoice') {
      xml += `      <UNIT_PRICE>${(item.unitPrice || 0).toFixed(2)}</UNIT_PRICE>\n`;
      xml += `      <VAT_RATE>${item.taxRate || 0}</VAT_RATE>\n`;
      xml += `      <LINE_TOTAL>${(item.lineTotal || 0).toFixed(2)}</LINE_TOTAL>\n`;
    }
    
    xml += `    </LINE>\n`;
  }
  
  xml += `  </LINES>\n`;
  
  if (type === 'invoice') {
    xml += `  <TOTALS>\n`;
    xml += `    <SUBTOTAL>${(shipment.subtotal || 0).toFixed(2)}</SUBTOTAL>\n`;
    xml += `    <VAT_TOTAL>${(shipment.taxTotal || 0).toFixed(2)}</VAT_TOTAL>\n`;
    xml += `    <GRAND_TOTAL>${(shipment.grandTotal || 0).toFixed(2)}</GRAND_TOTAL>\n`;
    xml += `  </TOTALS>\n`;
  }
  
  xml += `</${docType}>\n`;
  
  return xml;
}

/**
 * Escape XML special characters
 */
function escapeXML(str) {
  if (!str) return '';
  
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format date as YYYY-MM-DD (ISO 8601)
 */
function formatXMLDate(date) {
  if (!date) return '';
  
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

export default { generateXML };
