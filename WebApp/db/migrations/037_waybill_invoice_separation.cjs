/**
 * Migration: Waybill and Invoice Separation
 * 
 * This migration separates waybill (irsaliye) and invoice (fatura) functionality
 * by creating dedicated tables and managing relationships.
 */

exports.up = async function (knex) {
  // P1.2: materials.shipments tablosuna yeni alanlar ekle
  await knex.schema.alterTable('materials.shipments', (table) => {
    // Transport bilgileri için zaman alanları
    table.date('dispatchDate').nullable().comment('Fiili sevk tarihi');
    table.time('dispatchTime').nullable().comment('Fiili sevk saati');

    // Fiyat gösterimi kontrolü
    table.boolean('hidePrice').defaultTo(true).comment('Fiyat gizle/göster (true = fiyat gizli)');

    // Quote ilişkisi (1 Quote → N Shipments - parçalı sevkiyat desteği)
    table.string('relatedQuoteId', 50).nullable().comment('İlişkili teklif ID');
  });

  // Foreign key constraint ekle
  await knex.raw(`
    ALTER TABLE materials.shipments
    ADD CONSTRAINT fk_shipments_quote
    FOREIGN KEY ("relatedQuoteId") REFERENCES quotes.quotes(id)
    ON DELETE SET NULL
  `);

  // Index ekle (performans için)
  await knex.raw(`
    CREATE INDEX idx_shipments_related_quote
    ON materials.shipments("relatedQuoteId")
    WHERE "relatedQuoteId" IS NOT NULL
  `);

  // P1.3: quotes.quotes tablosuna proforma ve fatura alanlarını ekle
  await knex.schema.alterTable('quotes.quotes', (table) => {
    // Proforma bilgileri
    table.string('proformaNumber', 50).nullable().comment('Proforma numarası: PF-2025-0001');
    table.timestamp('proformaCreatedAt').nullable().comment('Proforma oluşturulma tarihi');

    // Fatura senaryosu ve tipi
    table.string('invoiceScenario', 20).nullable().comment('TEMEL | TICARI');
    table.string('invoiceType', 20).nullable().comment('SATIS | IADE | ISTISNA | OZELMATRAH');

    // Fatura bilgileri (Logo/Zirve'den gelen)
    table.string('invoiceNumber', 50).nullable().comment('Logo/Zirve fatura numarası');
    table.string('invoiceEttn', 50).nullable().comment('GİB ETTN (UUID formatı)');

    // Fatura export/import tarihleri
    table.timestamp('invoiceExportedAt').nullable().comment('Fatura export tarihi');
    table.timestamp('invoiceImportedAt').nullable().comment('Fatura import tarihi (ETTN alındı)');

    // Import edilen fatura dosyası (opsiyonel)
    table.binary('invoiceImportedFile').nullable().comment('Import edilen fatura dosyası');
    table.string('invoiceImportedFileName', 255).nullable().comment('Import edilen dosya adı');
  });

  // Para birimi ve kur bilgileri (IF NOT EXISTS ile - mevcut olabilir)
  await knex.raw(`
    ALTER TABLE quotes.quotes
    ADD COLUMN IF NOT EXISTS "currency" VARCHAR(10) DEFAULT 'TRY',
    ADD COLUMN IF NOT EXISTS "exchangeRate" NUMERIC(10,4) DEFAULT 1.0
  `);

  // Unique index ekle (proforma numarası tekil olmalı)
  await knex.raw(`
    CREATE UNIQUE INDEX idx_quotes_proforma_number
    ON quotes.quotes("proformaNumber")
    WHERE "proformaNumber" IS NOT NULL
  `);

  // P1.4: quotes.customers tablosuna e-fatura mükellefiyet alanlarını ekle
  await knex.schema.alterTable('quotes.customers', (table) => {
    // e-Fatura mükellefi mi?
    table.boolean('isEInvoiceTaxpayer').defaultTo(false).comment('e-Fatura mükellefi mi?');

    // GİB Posta Kutusu etiketi (e-fatura mükellefi için gerekli)
    table.string('gibPkLabel', 100).nullable().comment('GİB Posta Kutusu etiketi');

    // Varsayılan fatura senaryosu
    table.string('defaultInvoiceScenario', 20).defaultTo('TEMEL').comment('Varsayılan fatura senaryosu: TEMEL | TICARI');
  });

  // P1.5: quotes.quote_items tablosu oluştur
  await knex.schema.createTable('quotes.quote_items', (table) => {
    // Primary key
    table.increments('id').primary();

    // Quote ilişkisi
    table.string('quoteId', 50).notNullable().comment('İlişkili teklif ID');
    table.integer('lineNumber').defaultTo(1).comment('Satır numarası');

    // Ürün bilgileri
    table.string('stockCode', 100).nullable().comment('Stok kodu (opsiyonel - hizmet olabilir)');
    table.string('productName', 255).notNullable().comment('Ürün/Hizmet adı');
    table.text('description').nullable().comment('Açıklama');

    // Miktar ve birim
    table.decimal('quantity', 15, 4).notNullable().defaultTo(1).comment('Miktar');
    table.string('unit', 20).defaultTo('adet').comment('Birim');

    // Fiyat ve vergiler
    table.decimal('unitPrice', 15, 4).notNullable().comment('Birim fiyat');
    table.integer('taxRate').defaultTo(20).comment('KDV oranı (%)');
    table.decimal('discountPercent', 5, 2).defaultTo(0).comment('İskonto yüzdesi');

    // Hesaplanan değerler (trigger ile doldurulacak)
    table.decimal('subtotal', 15, 2).nullable().comment('Ara toplam (miktar × birim fiyat)');
    table.decimal('discountAmount', 15, 2).nullable().comment('İskonto tutarı');
    table.decimal('taxableAmount', 15, 2).nullable().comment('Vergi matrahı');
    table.decimal('taxAmount', 15, 2).nullable().comment('KDV tutarı');
    table.decimal('totalAmount', 15, 2).nullable().comment('Satır toplam');

    // Muafiyet ve tevkifat
    table.integer('vatExemptionId').nullable().comment('KDV muafiyet kodu');
    table.integer('withholdingRateId').nullable().comment('Tevkifat oranı');
    table.decimal('withholdingAmount', 15, 2).defaultTo(0).comment('Tevkifat tutarı');

    // Timestamps
    table.timestamp('createdAt').defaultTo(knex.fn.now()).comment('Oluşturulma tarihi');
    table.timestamp('updatedAt').defaultTo(knex.fn.now()).comment('Güncellenme tarihi');

    // Foreign keys
    table.foreign('quoteId').references('id').inTable('quotes.quotes').onDelete('CASCADE');
    table.foreign('vatExemptionId').references('id').inTable('materials.vat_exemption_codes');
    table.foreign('withholdingRateId').references('id').inTable('materials.withholding_rates');
  });

  // Index ekle
  await knex.raw('CREATE INDEX idx_quote_items_quote ON quotes.quote_items("quoteId")');

  // P1.6: Proforma numara sequence ve fonksiyon oluştur
  await knex.raw(`
    CREATE SEQUENCE IF NOT EXISTS quotes.proforma_number_seq
        START WITH 1
        INCREMENT BY 1
        NO MINVALUE
        NO MAXVALUE
        CACHE 1
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION quotes.generate_proforma_number()
    RETURNS VARCHAR(50) AS $$
    DECLARE
        year_str VARCHAR(4);
        seq_num INTEGER;
    BEGIN
        year_str := TO_CHAR(CURRENT_DATE, 'YYYY');
        seq_num := NEXTVAL('quotes.proforma_number_seq');
        RETURN 'PF-' || year_str || '-' || LPAD(seq_num::TEXT, 4, '0');
    END;
    $$ LANGUAGE plpgsql
  `);

  // P1.7: Quote items fiyat hesaplama trigger fonksiyonu
  await knex.raw(`
    CREATE OR REPLACE FUNCTION quotes.calculate_quote_item_totals()
    RETURNS TRIGGER AS $$
    DECLARE
        withholding_rate DECIMAL(5,4);
    BEGIN
        -- KDV istisnası varsa taxRate = 0
        IF NEW."vatExemptionId" IS NOT NULL THEN
            NEW."taxRate" := 0;
        END IF;
        
        -- 1. Ara toplam
        NEW."subtotal" := COALESCE(NEW."unitPrice", 0) * COALESCE(NEW.quantity, 0);
        
        -- 2. İskonto
        NEW."discountAmount" := NEW."subtotal" * (COALESCE(NEW."discountPercent", 0) / 100.0);
        
        -- 3. KDV matrahı
        NEW."taxableAmount" := NEW."subtotal" - COALESCE(NEW."discountAmount", 0);
        
        -- 4. KDV tutarı
        NEW."taxAmount" := NEW."taxableAmount" * (COALESCE(NEW."taxRate", 0) / 100.0);
        
        -- 5. Toplam
        NEW."totalAmount" := NEW."taxableAmount" + NEW."taxAmount";
        
        -- 6. Tevkifat (varsa)
        IF NEW."withholdingRateId" IS NOT NULL THEN
            SELECT rate INTO withholding_rate 
            FROM materials.withholding_rates 
            WHERE id = NEW."withholdingRateId";
            NEW."withholdingAmount" := NEW."taxAmount" * COALESCE(withholding_rate, 0);
        ELSE
            NEW."withholdingAmount" := 0;
        END IF;
        
        NEW."updatedAt" := CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  // Trigger oluştur
  await knex.raw(`
    CREATE TRIGGER trg_quote_item_calculate
        BEFORE INSERT OR UPDATE ON quotes.quote_items
        FOR EACH ROW
        EXECUTE FUNCTION quotes.calculate_quote_item_totals()
  `);
};

exports.down = async function (knex) {
  // P1.7 Rollback: Trigger ve fonksiyonu kaldır
  await knex.raw('DROP TRIGGER IF EXISTS trg_quote_item_calculate ON quotes.quote_items');
  await knex.raw('DROP FUNCTION IF EXISTS quotes.calculate_quote_item_totals()');

  // P1.6 Rollback: Proforma numara fonksiyon ve sequence'i kaldır
  await knex.raw('DROP FUNCTION IF EXISTS quotes.generate_proforma_number()');
  await knex.raw('DROP SEQUENCE IF EXISTS quotes.proforma_number_seq');

  // P1.5 Rollback: quotes.quote_items - Tabloyu ve index'i kaldır
  await knex.raw('DROP INDEX IF EXISTS quotes.idx_quote_items_quote');
  await knex.schema.dropTableIfExists('quotes.quote_items');

  // P1.4 Rollback: quotes.customers - Eklenen kolonları kaldır
  await knex.schema.alterTable('quotes.customers', (table) => {
    table.dropColumn('defaultInvoiceScenario');
    table.dropColumn('gibPkLabel');
    table.dropColumn('isEInvoiceTaxpayer');
  });

  // P1.3 Rollback: quotes.quotes - Eklenen index'i kaldır
  await knex.raw('DROP INDEX IF EXISTS quotes.idx_quotes_proforma_number');

  // P1.3 Rollback: quotes.quotes - Eklenen kolonları kaldır
  await knex.schema.alterTable('quotes.quotes', (table) => {
    table.dropColumn('exchangeRate');
    table.dropColumn('currency');
    table.dropColumn('invoiceImportedFileName');
    table.dropColumn('invoiceImportedFile');
    table.dropColumn('invoiceImportedAt');
    table.dropColumn('invoiceExportedAt');
    table.dropColumn('invoiceEttn');
    table.dropColumn('invoiceNumber');
    table.dropColumn('invoiceType');
    table.dropColumn('invoiceScenario');
    table.dropColumn('proformaCreatedAt');
    table.dropColumn('proformaNumber');
  });

  // P1.2 Rollback: Eklenen constraint ve index'leri kaldır
  await knex.raw('DROP INDEX IF EXISTS materials.idx_shipments_related_quote');
  await knex.raw('ALTER TABLE materials.shipments DROP CONSTRAINT IF EXISTS fk_shipments_quote');

  // Eklenen kolonları kaldır
  await knex.schema.alterTable('materials.shipments', (table) => {
    table.dropColumn('relatedQuoteId');
    table.dropColumn('hidePrice');
    table.dropColumn('dispatchTime');
    table.dropColumn('dispatchDate');
  });
};
