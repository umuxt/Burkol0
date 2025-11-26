/**
 * Migration: Create assignment_status_history table
 */

export async function up(knex) {
  const hasTable = await knex.schema.withSchema('mes').hasTable('assignment_status_history');
  
  if (!hasTable) {
    // Create assignment_status_history table
    await knex.schema.withSchema('mes').createTable('assignment_status_history', (table) => {
      table.increments('id').primary();
      table.string('assignmentId', 100).notNullable();
      table.string('fromStatus', 50);
      table.string('toStatus', 50).notNullable();
      table.timestamp('changedAt').defaultTo(knex.fn.now()).notNullable();
      table.string('changedBy', 100); // workerId
      table.text('reason'); // Optional: why was it paused/resumed
      table.jsonb('metadata'); // Optional: extra data (e.g., break type, error details)
      
      // Indexes
      table.index('assignmentId', 'idx_status_history_assignment');
      table.index('changedAt', 'idx_status_history_changed_at');
      table.index(['assignmentId', 'toStatus'], 'idx_status_history_assignment_status');
      
      // Foreign key (note: worker_assignments.id is VARCHAR not serial)
      table.foreign('assignmentId')
        .references('id')
        .inTable('mes.worker_assignments')
        .onDelete('CASCADE');
    });
    
    console.log('✅ Created mes.assignment_status_history table');
  } else {
    console.log('ℹ️ mes.assignment_status_history table already exists, skipping');
  }
}

export async function down(knex) {
  await knex.schema.withSchema('mes').dropTableIfExists('assignment_status_history');
  console.log('✅ Dropped mes.assignment_status_history table');
}