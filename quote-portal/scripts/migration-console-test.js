// Simple migration test - paste this into browser console

// Quick migration test
async function quickMigrationTest() {
  try {
    const response = await fetch('/api/mes/migrate-assignment-ids', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('burkol_token') || 'dev-token'}`
      },
      body: JSON.stringify({ dryRun: true })
    });
    
    const result = await response.json();
    console.log('📊 Migration Preview:', result);
    
    if (result.migrationsNeeded > 0) {
      console.log(`\n🔄 Would migrate ${result.migrationsNeeded} assignments`);
      console.log(`📋 Affected work orders: ${result.workOrdersAffected}`);
      
      // Show sample migrations
      if (result.migrations) {
        console.log('\n📝 Sample changes:');
        result.migrations.slice(0, 5).forEach(m => {
          console.log(`  ${m.oldId} → ${m.newId}`);
        });
      }
      
      // Ask if they want to proceed
      if (confirm('Run actual migration?')) {
        const liveResponse = await fetch('/api/mes/migrate-assignment-ids', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('burkol_token') || 'dev-token'}`
          },
          body: JSON.stringify({ dryRun: false })
        });
        
        const liveResult = await liveResponse.json();
        console.log('✅ Migration completed:', liveResult);
        
        if (liveResult.success) {
          alert('Migration completed! Refreshing page...');
          location.reload();
        }
      }
    } else {
      console.log('✅ No migration needed - all assignments already in correct format');
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the test
quickMigrationTest();