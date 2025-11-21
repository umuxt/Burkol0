import Quotes from '../db/models/quotes.js';
import db from '../db/connection.js';

try {
  console.log('\n🧪 Testing Quote Status Update\n');
  
  // 1. Get a test quote
  const quotes = await Quotes.getAll();
  
  if (quotes.length === 0) {
    console.log('❌ No quotes found in database');
    await db.destroy();
    process.exit(1);
  }
  
  const quote = quotes[0];
  console.log(`📋 Test Quote: ${quote.id}`);
  console.log(`   Current Status: ${quote.status}`);
  console.log(`   Customer: ${quote.customer_name}`);
  
  // 2. Update status
  const newStatus = quote.status === 'approved' ? 'pending' : 'approved';
  console.log(`\n🔄 Updating status to: ${newStatus}`);
  
  const updated = await Quotes.updateStatus(quote.id, newStatus, 'test-script');
  
  if (!updated) {
    console.log('❌ Update failed - quote not returned');
    await db.destroy();
    process.exit(1);
  }
  
  console.log(`✅ Update successful!`);
  console.log(`   New Status: ${updated.status}`);
  console.log(`   Updated At: ${updated.updated_at}`);
  console.log(`   Updated By: ${updated.updated_by}`);
  
  if (newStatus === 'approved') {
    console.log(`   Approved At: ${updated.approved_at}`);
    console.log(`   Approved By: ${updated.approved_by}`);
    console.log(`   Work Order: ${updated.work_order_code || 'Not created yet (async)'}`);
  }
  
  // 3. Verify in database
  console.log(`\n🔍 Verifying in database...`);
  const verified = await db('quotes.quotes')
    .where('id', quote.id)
    .first();
  
  if (!verified) {
    console.log('❌ Quote not found in database');
    await db.destroy();
    process.exit(1);
  }
  
  console.log(`✅ Database verification:`);
  console.log(`   Status in DB: ${verified.status}`);
  console.log(`   Match: ${verified.status === newStatus ? '✅ YES' : '❌ NO'}`);
  
  if (newStatus === 'approved' && verified.work_order_code) {
    console.log(`\n📦 Work Order Created: ${verified.work_order_code}`);
    
    // Check work order in MES
    const wo = await db('mes.work_orders')
      .where('code', verified.work_order_code)
      .first();
    
    if (wo) {
      console.log(`   ✅ Work order exists in mes.work_orders`);
      console.log(`   Status: ${wo.status}`);
      console.log(`   Created: ${wo.created_at}`);
    } else {
      console.log(`   ❌ Work order NOT found in mes.work_orders`);
    }
  }
  
  console.log(`\n✅ Test completed successfully!\n`);
  await db.destroy();
} catch (err) {
  console.error('❌ Test failed:', err.message);
  console.error(err.stack);
  await db.destroy();
  process.exit(1);
}
