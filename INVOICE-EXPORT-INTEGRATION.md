# 📦 İrsaliye & Fatura Export Entegrasyonu

> **Branch**: `invoice-export`  
> **Tarih**: 8 Aralık 2025  
> **Versiyon**: 1.0  
> **Amaç**: BeePlan'da oluşturulan sevkiyatları Logo/Zirve/Excel'e aktarılabilir formatlarda (CSV/XML/PDF) export etmek

---

## 📋 İÇİNDEKİLER

1. [Genel Bakış](#1-genel-bakış)
2. [Veritabanı Yapısı](#2-veritabanı-yapısı)
3. [Backend API](#3-backend-api)
4. [Export Formatları](#4-export-formatları)
5. [UI/UX Akışları](#5-uiux-akışları)
6. [Implementation Plan](#6-implementation-plan)

---

## 1. GENEL BAKIŞ

### 1.1. Hedef Kullanıcı

**İmalat/Üretim sektöründeki KOBİ'ler**:
- Quote (Teklif) → WorkOrder (İş Emri) → Production (Üretim) akışı var
- Muhasebe programı: Logo Tiger/Go, Zirve, Mikro (veya Excel)
- e-Arşiv/e-Fatura/e-İrsaliye: Gelecekte (şu an manuel)
- Aylık 50-200 sevkiyat

### 1.2. Temel İhtiyaçlar

1. **Sevkiyat Oluşturma**: Stok sayfasından veya manuel sevkiyat sayfasından
2. **Müşteri Yönetimi**: CRM'den seç VEYA inline hızlı giriş
3. **Parçalı Sevkiyat**: Toplam sipariş 1000 adet → 3 sevkiyatta tamamla
4. **Belge Üretimi**: İrsaliye ve/veya Fatura
5. **Export Formatları**: CSV (Excel) → XML (Logo/Zirve) → PDF (Yazdırma)

### 1.3. Kapsam Dışı (v2.0'da)

- ❌ GİB e-İrsaliye/e-Fatura entegrasyonu
- ❌ Quote'tan direkt sevkiyat (şimdilik sadece stok ve manuel)
- ❌ Mobil/tablet UI optimizasyonu

---

## 2. VERİTABANI YAPISI

### 2.1. Migration: `035_invoice_export_integration.sql`

#### A) `materials.shipments` - Yeni Kolonlar

```sql
-- =====================================================
-- Müşteri İlişkisi ve Snapshot
-- =====================================================
ALTER TABLE materials.shipments

-- Foreign Key (quotes.customers'a referans)
ADD COLUMN customerId INTEGER REFERENCES quotes.customers(id),

-- JSONB Snapshot (müşteri bilgileri değişse bile irsaliye sabit kalır)
ADD COLUMN customerSnapshot JSONB,
/* Örnek:
{
  "name": "ABC Limited Şirketi",
  "company": "ABC Ltd.",
  "taxOffice": "Kadıköy Vergi Dairesi",
  "taxNumber": "1234567890",
  "city": "İstanbul",
  "district": "Kadıköy",
  "address": "Örnek Mah. Sanayi Cad. No:5",
  "phone": "+90 216 555 1234",
  "email": "info@abcltd.com",
  "iban": "TR330006100519786457841326"
}
*/

-- =====================================================
-- Quote İlişkisi (Parçalı Sevkiyat Takibi)
-- =====================================================
ADD COLUMN quoteId VARCHAR(50) REFERENCES quotes.quotes(id),
ADD COLUMN isPartialShipment BOOLEAN DEFAULT false,

-- =====================================================
-- Belge Bilgileri
-- =====================================================
ADD COLUMN documentType VARCHAR(20) DEFAULT 'waybill', 
-- Değerler: 'waybill' (sadece irsaliye), 'invoice' (sadece fatura), 'both' (ikisi birden)

ADD COLUMN includePrice BOOLEAN DEFAULT false,
-- true: fatura kesilecek, fiyatlar zorunlu
-- false: sadece irsaliye, fiyat opsiyonel

-- =====================================================
-- Fiyat Bilgileri (Fatura için)
-- =====================================================
ADD COLUMN currency VARCHAR(3) DEFAULT 'TRY',
ADD COLUMN subtotal DECIMAL(15,2), -- Ara toplam (KDV hariç)
ADD COLUMN taxTotal DECIMAL(15,2), -- Toplam KDV
ADD COLUMN grandTotal DECIMAL(15,2), -- Genel toplam (KDV dahil)

-- =====================================================
-- Export Durumu
-- =====================================================
ADD COLUMN exportedFormats JSONB,
-- Örnek: ["csv", "xml", "pdf"]

ADD COLUMN exportedAt TIMESTAMPTZ,

-- =====================================================
-- Denormalize Edilmiş Müşteri Bilgileri
-- (Export sırasında hızlı erişim için)
-- =====================================================
ADD COLUMN customerTaxOffice VARCHAR(200),
ADD COLUMN customerTaxNumber VARCHAR(11),
ADD COLUMN customerCity VARCHAR(100),
ADD COLUMN customerDistrict VARCHAR(100),
ADD COLUMN customerPhone VARCHAR(50),
ADD COLUMN customerEmail VARCHAR(255);

-- İndeksler
CREATE INDEX idx_shipments_customer ON materials.shipments(customerId);
CREATE INDEX idx_shipments_quote ON materials.shipments(quoteId);
CREATE INDEX idx_shipments_document_type ON materials.shipments(documentType);
CREATE INDEX idx_shipments_exported ON materials.shipments(exportedAt) WHERE exportedAt IS NOT NULL;
```

#### B) `materials.shipment_items` - Yeni Kolonlar

```sql
-- =====================================================
-- Fiyat Bilgileri (Fatura için)
-- =====================================================
ALTER TABLE materials.shipment_items

ADD COLUMN unitPrice DECIMAL(15,2) DEFAULT 0,
ADD COLUMN taxRate INTEGER DEFAULT 20, -- KDV oranı (0, 1, 8, 10, 18, 20)
ADD COLUMN lineSubtotal DECIMAL(15,2), -- unitPrice * quantity
ADD COLUMN lineTax DECIMAL(15,2), -- lineSubtotal * (taxRate/100)
ADD COLUMN lineTotal DECIMAL(15,2), -- lineSubtotal + lineTax

-- =====================================================
-- Parçalı Sevkiyat Takibi
-- =====================================================
ADD COLUMN quoteItemId INTEGER, -- İleride quote_items tablosu eklenirse
ADD COLUMN isPartial BOOLEAN DEFAULT false;

-- Trigger: Fiyat hesaplama (INSERT/UPDATE)
CREATE OR REPLACE FUNCTION materials.calculate_shipment_item_totals()
RETURNS TRIGGER AS $$
BEGIN
  -- Ara toplam
  NEW."lineSubtotal" := NEW."unitPrice" * NEW.quantity;
  
  -- KDV
  NEW."lineTax" := NEW."lineSubtotal" * (NEW."taxRate" / 100.0);
  
  -- Toplam
  NEW."lineTotal" := NEW."lineSubtotal" + NEW."lineTax";
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_item_totals
  BEFORE INSERT OR UPDATE ON materials.shipment_items
  FOR EACH ROW
  EXECUTE FUNCTION materials.calculate_shipment_item_totals();
```

#### C) `quotes.customers` - ERP Entegrasyonu

```sql
-- =====================================================
-- ERP (Logo/Zirve) Entegrasyonu
-- =====================================================
ALTER TABLE quotes.customers

ADD COLUMN IF NOT EXISTS erpAccountCode VARCHAR(50), 
-- Logo/Zirve'deki cari kodu (120.01.001 gibi)

ADD COLUMN IF NOT EXISTS erpSyncedAt TIMESTAMPTZ;
-- Son senkronizasyon zamanı

CREATE INDEX idx_customers_erp_code ON quotes.customers(erpAccountCode) 
WHERE erpAccountCode IS NOT NULL;
```

### 2.2. Veri Akışı Diagramı

```
┌─────────────────┐
│ quotes.customers│ ◄─── Foreign Key (customerId)
│ + erpAccountCode│
└────────┬────────┘
         │
         │ 1:N
         ▼
┌─────────────────────────┐
│ materials.shipments     │
│ + customerSnapshot JSONB│ ◄─── Tarihsel kayıt (değişmez)
│ + quoteId               │
│ + documentType          │
│ + subtotal, taxTotal    │
│ + exportedFormats       │
└────────┬────────────────┘
         │
         │ 1:N
         ▼
┌──────────────────────────┐
│ materials.shipment_items │
│ + unitPrice              │
│ + taxRate                │
│ + lineTotal (trigger)    │
└──────────────────────────┘
```

---

## 3. BACKEND API

### 3.1. Endpoint'ler

#### **Shipment Routes** (`/api/materials/shipments`)

```javascript
// shipmentRoutes.js

router.post('/', shipmentController.createShipment);
// Body: { customerId?, customerSnapshot?, items: [], documentType, includePrice }
// Response: { shipment, exportUrls: { csv, xml, pdf } }

router.post('/quick', shipmentController.createQuickShipment);
// Stok sayfasından hızlı sevkiyat
// Body: { customerId?, materialCode, quantity, documentType }

router.get('/', shipmentController.getShipments);
// Query: ?status=pending&customerId=5&startDate=2025-12-01

router.get('/:id', shipmentController.getShipmentDetails);
// Response: shipment + items + customer + exportedFiles

router.patch('/:id/cancel', shipmentController.cancelShipment);
// Sevkiyat iptal → stok geri gelir

router.get('/quote/:quoteId/summary', shipmentController.getQuoteShipmentSummary);
// Parçalı sevkiyat takibi için
// Response: { totalOrdered, totalShipped, remaining, shipments: [] }
```

#### **Export Routes** (`/api/materials/export`)

```javascript
// exportRoutes.js

router.get('/shipment/:id/:format', exportController.exportShipment);
// format: csv | xml | pdf | json
// Response: File download (Content-Disposition: attachment)

router.post('/batch', exportController.batchExport);
// Body: { shipmentIds: [1,2,3], format: 'csv' }
// Response: ZIP file with multiple exports
```

### 3.2. Service Layer

#### **shipmentService.js** (Güncellenecek)

```javascript
/**
 * Yeni sevkiyat oluştur
 * @param {Object} data
 * @param {number} data.customerId - quotes.customers.id (opsiyonel)
 * @param {Object} data.customerSnapshot - Müşteri bilgileri snapshot (zorunlu)
 * @param {Array} data.items - [{ materialCode, quantity, unitPrice?, taxRate? }]
 * @param {string} data.documentType - 'waybill' | 'invoice' | 'both'
 * @param {boolean} data.includePrice - Fiyat bilgileri dahil mi?
 */
async function createShipment(data, user) {
  const trx = await db.transaction();
  
  try {
    // 1. Shipment code oluştur (SHP-2025-0001)
    const shipmentCode = await generateShipmentCode();
    
    // 2. Customer snapshot hazırla
    let customerSnapshot = data.customerSnapshot;
    if (data.customerId && !customerSnapshot) {
      const customer = await db('quotes.customers')
        .where({ id: data.customerId })
        .first();
      customerSnapshot = {
        name: customer.name,
        company: customer.company,
        taxOffice: customer.taxOffice,
        taxNumber: customer.taxNumber,
        city: customer.city,
        district: customer.district,
        address: customer.address,
        phone: customer.phone,
        email: customer.email,
        iban: customer.iban
      };
    }
    
    // 3. Fiyat toplamlarını hesapla (fatura için)
    let subtotal = 0, taxTotal = 0, grandTotal = 0;
    if (data.includePrice) {
      data.items.forEach(item => {
        const lineSubtotal = item.unitPrice * item.quantity;
        const lineTax = lineSubtotal * (item.taxRate / 100);
        subtotal += lineSubtotal;
        taxTotal += lineTax;
      });
      grandTotal = subtotal + taxTotal;
    }
    
    // 4. Shipment kaydı oluştur
    const [shipment] = await trx('materials.shipments')
      .insert({
        shipmentCode,
        customerId: data.customerId || null,
        customerSnapshot,
        quoteId: data.quoteId || null,
        isPartialShipment: data.isPartialShipment || false,
        documentType: data.documentType,
        includePrice: data.includePrice,
        currency: data.currency || 'TRY',
        subtotal: data.includePrice ? subtotal : null,
        taxTotal: data.includePrice ? taxTotal : null,
        grandTotal: data.includePrice ? grandTotal : null,
        // Denormalize
        customerTaxOffice: customerSnapshot.taxOffice,
        customerTaxNumber: customerSnapshot.taxNumber,
        customerCity: customerSnapshot.city,
        customerDistrict: customerSnapshot.district,
        customerPhone: customerSnapshot.phone,
        customerEmail: customerSnapshot.email,
        status: 'pending',
        createdBy: user?.email || 'system'
      })
      .returning('*');
    
    // 5. Items ekle + stok düş
    for (const item of data.items) {
      await trx('materials.shipment_items').insert({
        shipmentId: shipment.id,
        materialCode: item.materialCode,
        quantity: item.quantity,
        unit: item.unit || 'adet',
        unitPrice: item.unitPrice || 0,
        taxRate: item.taxRate || 20,
        // lineSubtotal, lineTax, lineTotal → trigger otomatik hesaplar
        lotNumber: item.lotNumber,
        notes: item.notes
      });
      
      // Stok düşümü
      await StockMovements.createMovement({
        materialCode: item.materialCode,
        movementType: 'out',
        subType: 'shipment',
        quantity: item.quantity,
        referenceId: shipment.id,
        referenceType: 'shipment',
        notes: `Sevkiyat: ${shipmentCode}`
      }, trx);
    }
    
    await trx.commit();
    return shipment;
    
  } catch (error) {
    await trx.rollback();
    throw error;
  }
}

/**
 * Hızlı sevkiyat (stok sayfasından tek ürün)
 */
async function createQuickShipment(data, user) {
  return createShipment({
    customerId: data.customerId,
    customerSnapshot: data.customerSnapshot,
    items: [{
      materialCode: data.materialCode,
      quantity: data.quantity,
      unitPrice: data.unitPrice,
      taxRate: data.taxRate
    }],
    documentType: data.documentType || 'waybill',
    includePrice: !!data.unitPrice
  }, user);
}

/**
 * Sevkiyat iptal → stok geri
 */
async function cancelShipment(shipmentId, reason, user) {
  const trx = await db.transaction();
  
  try {
    const shipment = await trx('materials.shipments')
      .where({ id: shipmentId })
      .first();
    
    if (!shipment) throw new Error('Sevkiyat bulunamadı');
    if (shipment.status === 'cancelled') throw new Error('Zaten iptal edilmiş');
    
    // Items'ları al
    const items = await trx('materials.shipment_items')
      .where({ shipmentId });
    
    // Her item için stok geri ekle
    for (const item of items) {
      await StockMovements.createMovement({
        materialCode: item.materialCode,
        movementType: 'in',
        subType: 'shipment_cancellation',
        quantity: item.quantity,
        referenceId: shipmentId,
        referenceType: 'shipment',
        notes: `Sevkiyat iptali: ${shipment.shipmentCode} - ${reason}`
      }, trx);
    }
    
    // Status güncelle
    await trx('materials.shipments')
      .where({ id: shipmentId })
      .update({
        status: 'cancelled',
        notes: db.raw(`CONCAT(COALESCE(notes, ''), '\n[İPTAL] ${reason} - ${new Date().toISOString()}')`)
      });
    
    await trx.commit();
    return { success: true };
    
  } catch (error) {
    await trx.rollback();
    throw error;
  }
}
```

#### **exportService.js** (YENİ)

```javascript
// Export Service - Ana modül

import { generateCSV } from './generators/csvGenerator.js';
import { generateXML } from './generators/xmlGenerator.js';
import { generatePDF } from './generators/pdfGenerator.js';
import { generateJSON } from './generators/jsonGenerator.js';

/**
 * Sevkiyat export et
 * @param {number} shipmentId
 * @param {string} format - 'csv' | 'xml' | 'pdf' | 'json'
 */
async function exportShipment(shipmentId, format) {
  // 1. Shipment + Items + Customer verilerini al
  const shipment = await db('materials.shipments as s')
    .where({ 's.id': shipmentId })
    .first();
  
  const items = await db('materials.shipment_items as si')
    .join('materials.materials as m', 'si.materialCode', 'm.code')
    .where({ 'si.shipmentId': shipmentId })
    .select(
      'si.*',
      'm.name as materialName',
      'm.code as materialCode'
    );
  
  const data = {
    shipment,
    items,
    customer: shipment.customerSnapshot || {}
  };
  
  // 2. Format'a göre generate
  let result;
  switch (format.toLowerCase()) {
    case 'csv':
      result = await generateCSV(data);
      break;
    case 'xml':
      result = await generateXML(data);
      break;
    case 'pdf':
      result = await generatePDF(data);
      break;
    case 'json':
      result = generateJSON(data);
      break;
    default:
      throw new Error(`Desteklenmeyen format: ${format}`);
  }
  
  // 3. Export kaydını güncelle
  await db('materials.shipments')
    .where({ id: shipmentId })
    .update({
      exportedFormats: db.raw(`
        COALESCE("exportedFormats", '[]'::jsonb) || ?::jsonb
      `, [JSON.stringify([format])]),
      exportedAt: new Date()
    });
  
  return result;
}

export default {
  exportShipment
};
```

---

## 4. EXPORT FORMATLARI

### 4.1. CSV (Excel Import)

**Dosya**: `generators/csvGenerator.js`

```javascript
import { stringify } from 'csv-stringify/sync';

/**
 * CSV formatı oluştur
 * Excel'de açılabilir, manuel düzenleme kolay
 */
export async function generateCSV(data) {
  const { shipment, items, customer } = data;
  
  // Header satırı
  const records = [];
  
  // Müşteri bilgileri (ilk satırlar)
  records.push(['İrsaliye No', shipment.shipmentCode]);
  records.push(['Tarih', new Date(shipment.createdAt).toLocaleDateString('tr-TR')]);
  records.push(['Müşteri', customer.name || shipment.customerName]);
  records.push(['Vergi No', customer.taxNumber || shipment.customerTaxNumber]);
  records.push(['Vergi Dairesi', customer.taxOffice || shipment.customerTaxOffice]);
  records.push(['Adres', customer.address || shipment.deliveryAddress]);
  records.push([]); // Boş satır
  
  // Kalem başlıkları
  records.push([
    'Sıra',
    'Malzeme Kodu',
    'Malzeme Adı',
    'Miktar',
    'Birim',
    ...(shipment.includePrice ? ['Birim Fiyat', 'KDV %', 'Ara Toplam', 'KDV Tutarı', 'Toplam'] : [])
  ]);
  
  // Kalemler
  items.forEach((item, index) => {
    const row = [
      index + 1,
      item.materialCode,
      item.materialName,
      item.quantity,
      item.unit,
      ...(shipment.includePrice ? [
        item.unitPrice,
        item.taxRate,
        item.lineSubtotal,
        item.lineTax,
        item.lineTotal
      ] : [])
    ];
    records.push(row);
  });
  
  // Fatura ise toplamlar
  if (shipment.includePrice) {
    records.push([]);
    records.push(['', '', '', '', 'Ara Toplam:', shipment.subtotal]);
    records.push(['', '', '', '', 'KDV Toplam:', shipment.taxTotal]);
    records.push(['', '', '', '', 'Genel Toplam:', shipment.grandTotal, shipment.currency]);
  }
  
  const csv = stringify(records, {
    encoding: 'utf8',
    bom: true // Excel için UTF-8 BOM
  });
  
  return {
    content: csv,
    filename: `${shipment.shipmentCode}.csv`,
    mimeType: 'text/csv; charset=utf-8'
  };
}
```

### 4.2. XML (Logo/Zirve Import)

**Dosya**: `generators/xmlGenerator.js`

```javascript
import { create } from 'xmlbuilder2';

/**
 * Logo Tiger XML formatı oluştur
 * Logo'nun import standardına uygun
 */
export async function generateXML(data) {
  const { shipment, items, customer } = data;
  
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('Irsaliye')
      .ele('Baslik')
        .ele('BelgeNo').txt(shipment.shipmentCode).up()
        .ele('Tarih').txt(new Date(shipment.createdAt).toISOString().split('T')[0]).up()
        .ele('CariKodu').txt(customer.erpAccountCode || '').up()
        .ele('CariUnvan').txt(customer.name || shipment.customerName).up()
        .ele('VergiNo').txt(customer.taxNumber || shipment.customerTaxNumber).up()
        .ele('VergiDairesi').txt(customer.taxOffice || shipment.customerTaxOffice).up()
        .ele('Adres').txt(customer.address || shipment.deliveryAddress).up()
        .ele('Il').txt(customer.city || shipment.customerCity).up()
        .ele('Ilce').txt(customer.district || shipment.customerDistrict).up()
      .up()
      .ele('Satirlar');
  
  items.forEach((item, index) => {
    const satirNode = root.ele('Satir')
      .ele('SiraNo').txt(index + 1).up()
      .ele('StokKodu').txt(item.materialCode).up()
      .ele('StokAdi').txt(item.materialName).up()
      .ele('Miktar').txt(item.quantity).up()
      .ele('Birim').txt(item.unit).up();
    
    if (shipment.includePrice) {
      satirNode
        .ele('BirimFiyat').txt(item.unitPrice).up()
        .ele('KDVOrani').txt(item.taxRate).up()
        .ele('AraToplam').txt(item.lineSubtotal).up()
        .ele('KDVTutar').txt(item.lineTax).up()
        .ele('Toplam').txt(item.lineTotal).up();
    }
    
    satirNode.up();
  });
  
  if (shipment.includePrice) {
    root.up()
      .ele('Toplamlar')
        .ele('AraToplam').txt(shipment.subtotal).up()
        .ele('KDVToplam').txt(shipment.taxTotal).up()
        .ele('GenelToplam').txt(shipment.grandTotal).up()
        .ele('ParaBirimi').txt(shipment.currency).up();
  }
  
  const xml = root.end({ prettyPrint: true });
  
  return {
    content: xml,
    filename: `${shipment.shipmentCode}.xml`,
    mimeType: 'application/xml'
  };
}
```

### 4.3. PDF (Yazdırılabilir İrsaliye)

**Dosya**: `generators/pdfGenerator.js`

```javascript
import PDFDocument from 'pdfkit';

/**
 * PDF irsaliye/fatura oluştur
 */
export async function generatePDF(data) {
  const { shipment, items, customer } = data;
  
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      resolve({
        content: Buffer.concat(chunks),
        filename: `${shipment.shipmentCode}.pdf`,
        mimeType: 'application/pdf'
      });
    });
    doc.on('error', reject);
    
    // Başlık
    doc.fontSize(20).text(
      shipment.documentType === 'invoice' ? 'FATURA' : 'SEVKİYAT İRSALİYESİ',
      { align: 'center' }
    );
    doc.moveDown();
    
    // İrsaliye bilgileri
    doc.fontSize(10);
    doc.text(`İrsaliye No: ${shipment.shipmentCode}`);
    doc.text(`Tarih: ${new Date(shipment.createdAt).toLocaleDateString('tr-TR')}`);
    doc.moveDown();
    
    // Müşteri bilgileri
    doc.fontSize(12).text('Müşteri Bilgileri:', { underline: true });
    doc.fontSize(10);
    doc.text(`${customer.name || shipment.customerName}`);
    if (customer.company) doc.text(customer.company);
    doc.text(`VKN/TCKN: ${customer.taxNumber || shipment.customerTaxNumber}`);
    doc.text(`Vergi Dairesi: ${customer.taxOffice || shipment.customerTaxOffice}`);
    doc.text(`Adres: ${customer.address || shipment.deliveryAddress}`);
    doc.moveDown(2);
    
    // Kalemler tablosu
    const tableTop = doc.y;
    const col1 = 50;
    const col2 = 100;
    const col3 = 300;
    const col4 = 400;
    const col5 = 450;
    const col6 = shipment.includePrice ? 500 : null;
    
    // Tablo başlıkları
    doc.fontSize(10).fillColor('#000');
    doc.text('Sıra', col1, tableTop);
    doc.text('Kod', col2, tableTop);
    doc.text('Malzeme Adı', col3, tableTop);
    doc.text('Miktar', col4, tableTop);
    doc.text('Birim', col5, tableTop);
    if (shipment.includePrice) doc.text('Tutar', col6, tableTop);
    
    doc.moveTo(col1, tableTop + 15).lineTo(550, tableTop + 15).stroke();
    
    // Kalemler
    let y = tableTop + 25;
    items.forEach((item, index) => {
      doc.text(index + 1, col1, y);
      doc.text(item.materialCode, col2, y);
      doc.text(item.materialName.substring(0, 30), col3, y);
      doc.text(item.quantity, col4, y);
      doc.text(item.unit, col5, y);
      if (shipment.includePrice) {
        doc.text(`${item.lineTotal.toFixed(2)} TL`, col6, y);
      }
      y += 20;
    });
    
    // Fatura ise toplamlar
    if (shipment.includePrice) {
      doc.moveTo(col1, y).lineTo(550, y).stroke();
      y += 10;
      doc.fontSize(11);
      doc.text(`Ara Toplam: ${shipment.subtotal.toFixed(2)} ${shipment.currency}`, 400, y);
      y += 15;
      doc.text(`KDV Toplam: ${shipment.taxTotal.toFixed(2)} ${shipment.currency}`, 400, y);
      y += 15;
      doc.fontSize(12).fillColor('#c00');
      doc.text(`Genel Toplam: ${shipment.grandTotal.toFixed(2)} ${shipment.currency}`, 400, y);
    }
    
    doc.end();
  });
}
```

---

## 5. UI/UX AKIŞLARI

### 5.1. Stok Sayfasından Hızlı Sevkiyat

**Component**: `HizliSevkiyatModal.jsx`  
**Konum**: `/WebApp/domains/materials/components/shipments/HizliSevkiyatModal.jsx`  
**CSS**: Mevcut `materials.css` classları kullanılacak

```jsx
import React, { useState } from 'react';
import CustomerAutocomplete from '../../../shared/components/CustomerAutocomplete.jsx';

/**
 * Hızlı Sevkiyat Modal (Stok sayfasından)
 * Props:
 * - material: { code, name, stock, unit }
 * - onClose: () => void
 * - onSuccess: (shipment) => void
 */
export default function HizliSevkiyatModal({ material, onClose, onSuccess }) {
  const [customerId, setCustomerId] = useState(null);
  const [customerSnapshot, setCustomerSnapshot] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [documentType, setDocumentType] = useState('waybill');
  const [includePrice, setIncludePrice] = useState(false);
  const [unitPrice, setUnitPrice] = useState('');
  const [loading, setLoading] = useState(false);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const response = await fetch('/api/materials/shipments/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          customerSnapshot,
          materialCode: material.code,
          quantity: parseFloat(quantity),
          documentType,
          includePrice,
          unitPrice: includePrice ? parseFloat(unitPrice) : 0,
          taxRate: 20
        })
      });
      
      const result = await response.json();
      
      if (!response.ok) throw new Error(result.error);
      
      onSuccess(result);
      onClose();
      
    } catch (error) {
      alert('Hata: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Hızlı Sevkiyat</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="form-container">
          {/* Malzeme (disabled) */}
          <div className="form-group">
            <label>Malzeme</label>
            <input 
              type="text" 
              value={`${material.code} - ${material.name}`}
              disabled
              className="form-group-input"
            />
          </div>
          
          {/* Müşteri seçimi */}
          <div className="form-group">
            <label>Müşteri *</label>
            <CustomerAutocomplete
              onSelect={(customer) => {
                setCustomerId(customer.id);
                setCustomerSnapshot(customer);
              }}
            />
          </div>
          
          {/* Miktar */}
          <div className="form-group">
            <label>Miktar * (Max: {material.stock} {material.unit})</label>
            <input
              type="number"
              step="0.01"
              max={material.stock}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
              className="form-group-input"
            />
          </div>
          
          {/* Belge tipi */}
          <div className="form-group">
            <label>Belge Tipi</label>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  value="waybill"
                  checked={documentType === 'waybill'}
                  onChange={(e) => {
                    setDocumentType(e.target.value);
                    setIncludePrice(false);
                  }}
                />
                İrsaliye
              </label>
              <label>
                <input
                  type="radio"
                  value="invoice"
                  checked={documentType === 'invoice'}
                  onChange={(e) => {
                    setDocumentType(e.target.value);
                    setIncludePrice(true);
                  }}
                />
                Fatura
              </label>
              <label>
                <input
                  type="radio"
                  value="both"
                  checked={documentType === 'both'}
                  onChange={(e) => {
                    setDocumentType(e.target.value);
                    setIncludePrice(true);
                  }}
                />
                İkisi Birden
              </label>
            </div>
          </div>
          
          {/* Fiyat (fatura ise) */}
          {includePrice && (
            <div className="form-group">
              <label>Birim Fiyat (TL) *</label>
              <input
                type="number"
                step="0.01"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                required
                className="form-group-input"
              />
            </div>
          )}
          
          {/* Buttons */}
          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              İptal
            </button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Oluşturuluyor...' : 'Oluştur ve Export'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

### 5.2. Manuel Sevkiyat Wizard (3 Adım)

**Component**: `YeniSevkiyatWizard.jsx`  
**Konum**: `/WebApp/domains/materials/components/shipments/YeniSevkiyatWizard.jsx`

```jsx
import React, { useState } from 'react';

export default function YeniSevkiyatWizard({ onClose, onSuccess }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    customerId: null,
    customerSnapshot: null,
    items: [],
    documentType: 'waybill',
    includePrice: false
  });
  
  const steps = [
    { id: 1, title: 'Müşteri' },
    { id: 2, title: 'Ürünler' },
    { id: 3, title: 'Önizleme' }
  ];
  
  return (
    <div className="modal-overlay">
      <div className="modal-content modal-large">
        {/* Progress */}
        <div className="wizard-progress">
          {steps.map(step => (
            <div 
              key={step.id}
              className={`wizard-step ${currentStep >= step.id ? 'active' : ''}`}
            >
              <div className="step-number">{step.id}</div>
              <div className="step-title">{step.title}</div>
            </div>
          ))}
        </div>
        
        {/* Content */}
        <div className="wizard-body">
          {currentStep === 1 && <Step1Customer data={formData} onChange={setFormData} />}
          {currentStep === 2 && <Step2Items data={formData} onChange={setFormData} />}
          {currentStep === 3 && <Step3Preview data={formData} />}
        </div>
        
        {/* Navigation */}
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">İptal</button>
          
          {currentStep > 1 && (
            <button onClick={() => setCurrentStep(currentStep - 1)} className="btn btn-outline">
              ← Geri
            </button>
          )}
          
          {currentStep < 3 && (
            <button 
              onClick={() => setCurrentStep(currentStep + 1)}
              className="btn btn-primary"
            >
              İleri →
            </button>
          )}
          
          {currentStep === 3 && (
            <button onClick={handleSubmit} className="btn btn-success">
              Kaydet ve Export
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## 6. IMPLEMENTATION PLAN

### 6.1. Faz 1: Database & Backend (3 gün)

**Görevler:**
1. ✅ Migration oluştur: `035_invoice_export_integration.sql`
2. ✅ `shipmentService.js` güncelle (createShipment, cancelShipment)
3. ✅ `exportService.js` oluştur
4. ✅ CSV/XML generator'ları yaz
5. ✅ API endpoint'leri ekle (`shipmentRoutes.js`, `exportRoutes.js`)
6. ✅ Test: Postman ile API testleri

### 6.2. Faz 2: UI Components (2 gün)

**Görevler:**
1. ✅ `HizliSevkiyatModal.jsx` (stok sayfası butonu ile entegre)
2. ✅ `YeniSevkiyatWizard.jsx` (3 adımlı wizard)
3. ✅ Stok tablosuna "Sevk Et" butonu ekle
4. ✅ Sevkiyatlar sayfasına "Yeni İrsaliye" butonu ekle

### 6.3. Faz 3: Export & Polish (1 gün)

**Görevler:**
1. ✅ PDF generator (pdfkit entegrasyonu)
2. ✅ Export download logic (frontend)
3. ✅ Error handling & validation
4. ✅ UI polish (loading states, success messages)

### 6.4. Test Senaryoları

**Manuel Test Checklist:**

- [ ] Stok sayfasından hızlı sevkiyat
  - [ ] Kayıtlı müşteri ile
  - [ ] Yeni müşteri (inline form) ile
  - [ ] Sadece irsaliye (fiyatsız)
  - [ ] Fatura (fiyatlı)
  - [ ] CSV/XML/PDF export çalışıyor

- [ ] Manuel sevkiyat (wizard)
  - [ ] 3 adım sorunsuz geçiş
  - [ ] Çoklu ürün ekleme
  - [ ] Stok kontrolü çalışıyor
  - [ ] Önizleme doğru

- [ ] İptal işlemi
  - [ ] Stok geri geliyor
  - [ ] Movement kaydı oluşuyor

- [ ] Parçalı sevkiyat (elle test)
  - [ ] Quote'a 1000 adet atandı
  - [ ] 1. sevkiyat: 200 adet
  - [ ] 2. sevkiyat: 300 adet
  - [ ] Kalan: 500 adet gösterilmeli

---

## 7. ÖNEMLİ NOTLAR

### 7.1. CSS Sınıfları (materials.css'ten)

Kullanılacak mevcut classlar:
- `.modal-overlay`, `.modal-content`, `.modal-header`, `.modal-footer`
- `.form-group`, `.form-group-input`, `.radio-group`
- `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-success`
- `.wizard-progress`, `.wizard-step`, `.wizard-body`
- `.table-container`, `.materials-table`

### 7.2. Güvenlik

- ✅ SQL Injection: Parametreli sorgular (Knex ORM)
- ✅ XSS: React otomatik escape ediyor
- ✅ CSRF: Eski proje yapısında yok (eklenecek mi?)
- ✅ File Upload: Export'ta güvenli dosya adı oluştur

### 7.3. Performans

- ✅ Export büyük dosyalar için stream kullan (PDF)
- ✅ Batch export için queue sistemi düşün (RabbitMQ/Bull?)
- ✅ customerSnapshot JSONB indexing (GIN index)

---

**Son Güncelleme**: 8 Aralık 2025  
**Hazırlayan**: GitHub Copilot  
**Durum**: ✅ Dokümantasyon Tamamlandı - Implementation Başlayabilir
