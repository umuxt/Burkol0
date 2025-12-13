/**
 * Migration: Add 'reversed' status to shipments
 * P1.6.5: Ters Sevkiyat
 */

exports.up = async function (knex) {
    // Drop and recreate the check constraint with 'reversed' added
    await knex.raw(`
    ALTER TABLE materials.shipments 
    DROP CONSTRAINT IF EXISTS shipments_status_check;
  `);

    await knex.raw(`
    ALTER TABLE materials.shipments 
    ADD CONSTRAINT shipments_status_check 
    CHECK (status IN ('pending', 'shipped', 'delivered', 'cancelled', 'exported', 'completed', 'reversed'));
  `);

    console.log('✅ Added "reversed" status to shipments');
};

exports.down = async function (knex) {
    // Revert to original constraint without 'reversed'
    await knex.raw(`
    ALTER TABLE materials.shipments 
    DROP CONSTRAINT IF EXISTS shipments_status_check;
  `);

    await knex.raw(`
    ALTER TABLE materials.shipments 
    ADD CONSTRAINT shipments_status_check 
    CHECK (status IN ('pending', 'shipped', 'delivered', 'cancelled', 'exported', 'completed'));
  `);
};
