// Test migration endpoint
async function testMigration() {
  try {
    // First run dry-run to see what would change
    console.log('🔍 Running migration dry-run...');
    
    const dryRunResponse = await fetch('/api/mes/migrate-assignment-ids', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('burkol_token') || 'dev-token'}`
      },
      body: JSON.stringify({ dryRun: true })
    });
    
    if (!dryRunResponse.ok) {
      throw new Error(`HTTP ${dryRunResponse.status}: ${dryRunResponse.statusText}`);
    }
    
    const dryRunResult = await dryRunResponse.json();
    console.log('📊 Dry Run Result:', dryRunResult);
    
    if (dryRunResult.migrationsNeeded === 0) {
      console.log('✅ No migrations needed - all assignments already in correct format');
      return;
    }
    
    // Show migration preview
    console.log(`\n📋 Migration Preview:`);
    console.log(`Total assignments: ${dryRunResult.totalAssignments}`);
    console.log(`Migrations needed: ${dryRunResult.migrationsNeeded}`);
    console.log(`Work orders affected: ${dryRunResult.workOrdersAffected}`);
    
    if (dryRunResult.migrations && dryRunResult.migrations.length > 0) {
      console.log('\n🔄 Sample migrations:');
      dryRunResult.migrations.slice(0, 10).forEach(m => {
        console.log(`  ${m.oldId} → ${m.newId} (${m.workOrderCode})`);
      });
      
      if (dryRunResult.migrations.length > 10) {
        console.log(`  ... and ${dryRunResult.migrations.length - 10} more`);
      }
    }
    
    // Ask for confirmation
    const confirmed = confirm(`Proceed with migrating ${dryRunResult.migrationsNeeded} assignments?`);
    
    if (!confirmed) {
      console.log('❌ Migration cancelled by user');
      return;
    }
    
    // Run actual migration
    console.log('\n🚀 Running actual migration...');
    
    const migrationResponse = await fetch('/api/mes/migrate-assignment-ids', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('burkol_token') || 'dev-token'}`
      },
      body: JSON.stringify({ dryRun: false })
    });
    
    if (!migrationResponse.ok) {
      throw new Error(`HTTP ${migrationResponse.status}: ${migrationResponse.statusText}`);
    }
    
    const migrationResult = await migrationResponse.json();
    console.log('✅ Migration Result:', migrationResult);
    
    // Refresh the page to see changes
    if (migrationResult.success && migrationResult.migrated > 0) {
      console.log('🔄 Refreshing page to show new assignment IDs...');
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    alert(`Migration failed: ${error.message}`);
  }
}

// Make it globally accessible for console testing
window.testMigration = testMigration;

console.log('🛠️ Migration test function loaded. Run window.testMigration() to start.');