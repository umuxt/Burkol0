// Test PostgreSQL Connection
import { testConnection, closeConnection } from './connection.js';

async function main() {
  console.log('🔌 Testing BeePlan PostgreSQL connection...\n');
  
  const success = await testConnection();
  
  if (success) {
    console.log('\n✅ Connection test passed!');
    console.log('📦 Database: beeplan_dev');
    console.log('🚀 Ready to create tables');
  } else {
    console.log('\n❌ Connection test failed!');
    console.log('Please check your .env configuration');
  }
  
  await closeConnection();
  process.exit(success ? 0 : 1);
}

main();
