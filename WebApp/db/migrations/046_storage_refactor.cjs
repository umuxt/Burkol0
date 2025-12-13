/**
 * Migration: Refactor file storage to use R2/URL
 */
exports.up = function (knex) {
    return knex.schema
        .alterTable('materials.shipments', function (table) {
            table.text('importedFileUrl').comment('R2/Storage URL for imported file');
        })
        .alterTable('quotes.quotes', function (table) {
            table.text('invoiceImportedFileUrl').comment('R2/Storage URL for imported invoice file');
        })
        .alterTable('quotes.quote_documents', function (table) {
            table.text('fileUrl').comment('R2/Storage URL for document file');
        });
};

exports.down = function (knex) {
    return knex.schema
        .alterTable('materials.shipments', function (table) {
            table.dropColumn('importedFileUrl');
        })
        .alterTable('quotes.quotes', function (table) {
            table.dropColumn('invoiceImportedFileUrl');
        })
        .alterTable('quotes.quote_documents', function (table) {
            table.dropColumn('fileUrl');
        });
};
