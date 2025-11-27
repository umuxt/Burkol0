/**
 * Migration 022: Cleanup worker_assignments columns
 * 
 * This migration:
 * 1. Removes duplicate/unused columns from mes.worker_assignments
 * 2. Adds optimizedEnd column for future optimization model
 * 
 * Removed columns:
 * - expectedStart (duplicate of estimatedStartTime)
 * - plannedEnd (duplicate of estimatedEndTime)
 * - assignedAt (never used)
 * - workerName (redundant - join with workers table)
 * - stationId (not used - using substationId)
 * - materials (replaced by node_material_inputs junction table)
 * - actualReservedAmounts (replaced by assignment_material_reservations)
 * - quantity (not used)
 * 
 * Final time columns structure:
 * - startedAt, completedAt: Actual execution times
 * - estimatedStartTime, estimatedEndTime: FIFO scheduler estimates
 * - optimizedStart, optimizedEnd: Future optimization model
 */

export async function up(knex) {
  console.log('🔄 Starting cleanup of mes.worker_assignments columns...');

  // Check if columns exist before dropping
  const hasColumn = async (columnName) => {
    const result = await knex.raw(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'mes' 
        AND table_name = 'worker_assignments' 
        AND column_name = ?
    `, [columnName]);
    return result.rows.length > 0;
  };

  // Columns to remove
  const columnsToRemove = [
    'expectedStart',
    'plannedEnd',
    'assignedAt',
    'workerName',
    'stationId',
    'materials',
    'actualReservedAmounts',
    'quantity'
  ];

  for (const col of columnsToRemove) {
    if (await hasColumn(col)) {
      await knex.schema.withSchema('mes').alterTable('worker_assignments', table => {
        table.dropColumn(col);
      });
      console.log(`  ✓ Dropped column: ${col}`);
    } else {
      console.log(`  ⚠ Column not found (already removed): ${col}`);
    }
  }

  // Add optimizedEnd column if it doesn't exist
  if (!(await hasColumn('optimizedEnd'))) {
    await knex.schema.withSchema('mes').alterTable('worker_assignments', table => {
      table.timestamp('optimizedEnd').nullable();
    });
    console.log('  ✓ Added column: optimizedEnd');
  }

  console.log('✅ Migration 022 completed successfully');
}

export async function down(knex) {
  console.log('🔄 Rolling back migration 022...');

  // Re-add removed columns
  await knex.schema.withSchema('mes').alterTable('worker_assignments', table => {
    table.timestamp('expectedStart').nullable();
    table.timestamp('plannedEnd').nullable();
    table.timestamp('assignedAt').nullable();
    table.string('workerName').nullable();
    table.string('stationId').nullable();
    table.jsonb('materials').nullable();
    table.jsonb('actualReservedAmounts').nullable();
    table.integer('quantity').nullable();
  });

  // Remove optimizedEnd
  await knex.schema.withSchema('mes').alterTable('worker_assignments', table => {
    table.dropColumn('optimizedEnd');
  });

  console.log('✅ Rollback completed');
}
