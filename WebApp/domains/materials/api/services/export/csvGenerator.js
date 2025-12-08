/**
 * CSV Generator
 * Logo/Zirve için CSV export (Excel uyumlu)
 * Referans: INVOICE-EXPORT-INTEGRATION.md Section 6.1
 */

import db from '../../connection.js';

/**
 * Generate CSV for shipment
 * @param {number} shipmentId - Shipment ID
 * @returns {string} CSV content
 */
export async function generateCSV(shipmentId) {
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
  
  // Get customer data (snapshot or denormalized fields)
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
  
  // CSV Header
  const header = [
    'İrsaliye No',
    'Tarih',
    'Müşteri Adı',
    'Vergi Dairesi',
    'VKN/TCKN',
    'Adres',
    'İl',
    'İlçe',
    'Telefon',
    'Malzeme Kodu',
    'Malzeme Adı',
    'Miktar',
    'Birim',
    'Birim Fiyat',
    'KDV %',
    'Toplam'
  ].join(';');
  
  // CSV Rows
  const rows = items.map(item => {
    return [
      shipment.shipmentCode || '',
      formatDate(shipment.createdAt),
      customerData.company || customerData.name || '',
      customerData.taxOffice || '',
      customerData.taxNumber || '',
      customerData.address || '',
      customerData.city || '',
      customerData.district || '',
      customerData.phone || '',
      item.materialCode || '',
      item.materialCode || '', // TODO: Join materials.materials for name
      item.quantity || 0,
      item.unit || 'adet',
      shipment.includePrice ? (item.unitPrice || 0).toFixed(2) : '',
      shipment.includePrice ? (item.taxRate || 0) : '',
      shipment.includePrice ? (item.lineTotal || 0).toFixed(2) : ''
    ].map(escapeCSV).join(';');
  });
  
  return [header, ...rows].join('\n');
}

/**
 * Escape CSV field (handle semicolon, quotes, newlines)
 */
function escapeCSV(field) {
  if (field === null || field === undefined) {
    return '';
  }
  
  const str = String(field);
  
  // If contains semicolon, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
}

/**
 * Format date as DD.MM.YYYY
 */
function formatDate(date) {
  if (!date) return '';
  
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  
  return `${day}.${month}.${year}`;
}

export default { generateCSV };
