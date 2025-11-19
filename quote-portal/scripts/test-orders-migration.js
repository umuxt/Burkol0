/**
 * Test Orders Migration
 * Verifies PostgreSQL orders functionality
 */

import Orders from '../db/models/orders.js';
import OrderItems from '../db/models/orderItems.js';
import Materials from '../db/models/materials.js';
import Suppliers from '../db/models/suppliers.js';

async function testOrdersMigration() {
  console.log('🧪 Testing Orders Migration...\n');
  
  try {
    // Step 1: Get test supplier and material
    console.log('1️⃣ Finding test supplier and material...');
    const suppliers = await Suppliers.getAllSuppliers();
    const materials = await Materials.getAllMaterials();
    
    if (suppliers.length === 0) {
      console.error('❌ No suppliers found. Please create a supplier first.');
      return;
    }
    
    if (materials.length === 0) {
      console.error('❌ No materials found. Please create a material first.');
      return;
    }
    
    const testSupplier = suppliers[0];
    const testMaterial = materials[0];
    
    console.log(`✅ Using supplier: ${testSupplier.name} (ID: ${testSupplier.id})`);
    console.log(`✅ Using material: ${testMaterial.name} (ID: ${testMaterial.id})`);
    console.log(`✅ Current material stock: ${testMaterial.stock} ${testMaterial.unit}\n`);
    
    // Step 2: Create test order
    console.log('2️⃣ Creating test order...');
    const orderData = {
      supplierId: testSupplier.id,
      supplierName: testSupplier.name,
      orderDate: new Date(),
      expectedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      notes: 'Test order created by migration test script',
      createdBy: 'test-script'
    };
    
    const items = [
      {
        materialId: testMaterial.id,
        materialCode: testMaterial.code,
        materialName: testMaterial.name,
        quantity: 100,
        unit: testMaterial.unit,
        unitPrice: 10.50,
        totalPrice: 1050.00,
        notes: 'Test item 1'
      },
      {
        materialId: testMaterial.id,
        materialCode: testMaterial.code,
        materialName: testMaterial.name,
        quantity: 50,
        unit: testMaterial.unit,
        unitPrice: 10.50,
        totalPrice: 525.00,
        notes: 'Test item 2'
      }
    ];
    
    const order = await Orders.createOrder(orderData, items);
    console.log(`✅ Order created: ${order.order_code} (ID: ${order.id})`);
    console.log(`✅ Total amount: ${order.total_amount} TRY`);
    console.log(`✅ Item count: ${order.item_count}`);
    console.log(`✅ Items created: ${order.items.length}\n`);
    
    // Step 3: Get order stats
    console.log('3️⃣ Checking order statistics...');
    const stats = await Orders.getOrderStats();
    console.log(`✅ Total orders: ${stats.totalOrders}`);
    console.log(`✅ Total value: ${stats.totalValue} TRY`);
    console.log(`✅ Pending items: ${stats.pendingItems}`);
    console.log(`✅ By status:`, stats.byStatus);
    console.log();
    
    // Step 4: Deliver first item
    console.log('4️⃣ Delivering first item...');
    const firstItem = order.items[0];
    const deliveryResult = await OrderItems.deliverItem(firstItem.id, {
      deliveredBy: 'test-script',
      actualDeliveryDate: new Date(),
      notes: 'Test delivery'
    });
    
    console.log(`✅ Item delivered: ${deliveryResult.item.item_code}`);
    console.log(`✅ Stock updated:`);
    console.log(`   - Material: ${deliveryResult.stockUpdate.materialCode}`);
    console.log(`   - Previous stock: ${deliveryResult.stockUpdate.previousStock}`);
    console.log(`   - New stock: ${deliveryResult.stockUpdate.newStock}`);
    console.log(`   - Quantity added: ${deliveryResult.stockUpdate.quantityAdded}\n`);
    
    // Step 5: Update order status
    console.log('5️⃣ Updating order status based on items...');
    const updatedOrder = await Orders.updateOrderStatus(order.id);
    console.log(`✅ Order status updated to: ${updatedOrder.order_status}\n`);
    
    // Step 6: Deliver second item
    console.log('6️⃣ Delivering second item...');
    const secondItem = order.items[1];
    const secondDelivery = await OrderItems.deliverItem(secondItem.id, {
      deliveredBy: 'test-script',
      actualDeliveryDate: new Date()
    });
    
    console.log(`✅ Item delivered: ${secondDelivery.item.item_code}`);
    console.log(`✅ New stock: ${secondDelivery.stockUpdate.newStock}\n`);
    
    // Step 7: Final order status
    console.log('7️⃣ Checking final order status...');
    const finalOrder = await Orders.updateOrderStatus(order.id);
    console.log(`✅ Final order status: ${finalOrder.order_status}`);
    console.log(`✅ Expected: "Teslim Edildi" (all items delivered)\n`);
    
    // Step 8: Verify material stock
    console.log('8️⃣ Verifying material stock update...');
    const updatedMaterial = await Materials.getMaterialById(testMaterial.id);
    const expectedStock = parseFloat(testMaterial.stock) + 100 + 50; // Two deliveries
    console.log(`✅ Material stock: ${updatedMaterial.stock} ${updatedMaterial.unit}`);
    console.log(`✅ Expected: ${expectedStock} (original + 100 + 50)`);
    console.log(`✅ Match: ${Math.abs(parseFloat(updatedMaterial.stock) - expectedStock) < 0.01 ? 'YES ✅' : 'NO ❌'}\n`);
    
    // Step 9: Get order with items
    console.log('9️⃣ Fetching complete order...');
    const completeOrder = await Orders.getOrderById(order.id);
    console.log(`✅ Order: ${completeOrder.order_code}`);
    console.log(`✅ Status: ${completeOrder.order_status}`);
    console.log(`✅ Items: ${completeOrder.items.length}`);
    console.log(`✅ All items delivered: ${completeOrder.items.every(i => i.item_status === 'Teslim Edildi') ? 'YES ✅' : 'NO ❌'}\n`);
    
    console.log('✅ All tests passed! Orders migration successful! 🎉\n');
    
    console.log('📋 Test Order Details:');
    console.log(`   Order Code: ${order.order_code}`);
    console.log(`   Order ID: ${order.id}`);
    console.log(`   Supplier: ${order.supplier_name}`);
    console.log(`   Total: ${order.total_amount} TRY`);
    console.log(`   Status: ${finalOrder.order_status}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
  
  process.exit(0);
}

testOrdersMigration();
