/**
 * Migration: Add sessionId column to audit_logs table
 * This allows linking audit logs to specific user sessions
 */

exports.up = async function (knex) {
    // Add sessionId column to audit_logs
    await knex.schema.withSchema('settings').alterTable('audit_logs', table => {
        table.string('sessionId', 100).nullable();
    });

    // Create index for faster session-based queries
    await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_sessionid 
    ON settings.audit_logs("sessionId")
  `);

    console.log('✅ Added sessionId column to settings.audit_logs');
};

exports.down = async function (knex) {
    await knex.raw(`DROP INDEX IF EXISTS settings.idx_audit_logs_sessionid`);

    await knex.schema.withSchema('settings').alterTable('audit_logs', table => {
        table.dropColumn('sessionId');
    });

    console.log('⬇️ Removed sessionId column from settings.audit_logs');
};
