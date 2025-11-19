/**
 * Test Stock Movements Migration
 * Verifies stock movement creation on order delivery
 */

import Orders from '../db/models/orders.js';
import OrderItems from '../db/models/orderItems.js';
import StockMovements from '../db/models/stockMovements.js';
import Materials from '../db/models/materials.js';
import Suppliers from '../db/models/suppliers.js';

async function testStockMovements() {
  console.log('🧪 Testing Stock Movements Migration...\n');
  
  try {
    // Step 1: Get existing test data
    console.log('1️⃣ Finding existing order with pending item...');
    const orders = await Orders.getAllOrders({ includeItems: true });
    
    let testOrder = null;
    let testItem = null;
    
    // Find an order with pending item
    for (const order of orders) {
      const pendingItem = order.items?.find(item => 
        item.item_status !== 'Teslim Edildi'
      );
      if (pendingItem) {
        testOrder = order;
        testItem = pendingItem;
        break;
      }
    }
    
    // If no pending items, create a new order
    if (!testOrder || !testItem) {
      console.log('📦 No pending items found, creating test order...');
      
      const suppliers = await Suppliers.getAllSuppliers();
      const materials = await Materials.getAllMaterials();
      
      if (suppliers.length === 0 || materials.length === 0) {
        console.error('❌ Need at least one supplier and material for testing');
        return;
      }
      
      const testSupplier = suppliers[0];
      const testMaterial = materials[0];
      
      testOrder = await Orders.createOrder({
        supplierId: testSupplier.id,
        supplierName: testSupplier.name,
        orderDate: new Date(),
        expectedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        notes: 'Test order for stock movements migration',
        createdBy: 'test-script'
      }, [{
        materialId: testMaterial.id,
        materialCode: testMaterial.code,
        materialName: testMaterial.name,
        quantity: 50,
        unit: testMaterial.unit,
        unitPrice: 15.00,
        totalPrice: 750.00,
        notes: 'Test item for stock movements'
      }]);
      
      testItem = testOrder.items[0];
    }
    
    console.log(`✅ Using order: ${testOrder.order_code} (ID: ${testOrder.id})`);
    console.log(`✅ Test item: ${testItem.item_code} - ${testItem.material_name}`);
    console.log(`✅ Quantity: ${testItem.quantity} ${testItem.unit}\n`);
    
    // Step 2: Check material stock before delivery
    console.log('2️⃣ Checking material stock before delivery...');
    const materialBefore = await Materials.getMaterialById(testItem.material_id);
    console.log(`📊 Current stock: ${materialBefore.stock} ${materialBefore.unit}\n`);
    
    // Step 3: Check existing stock movements
    console.log('3️⃣ Checking existing stock movements for this material...');
    const movementsBefore = await StockMovements.getMovementsByMaterial(
      testItem.material_id,
      { limit: 5 }
    );
    console.log(`📋 Existing movements: ${movementsBefore.length}\n`);
    
    // Step 4: Deliver the item
    console.log('4️⃣ Delivering order item...');
    const deliveryResult = await OrderItems.deliverItem(testItem.id, {
      deliveredBy: 'test-script',
      actualDeliveryDate: new Date(),
      notes: 'Stock movements migration test delivery'
    });
    
    console.log(`✅ Item delivered: ${deliveryResult.item.item_code}`);
    console.log(`✅ Stock update:`);
    console.log(`   - Previous: ${deliveryResult.stockUpdate.previousStock}`);
    console.log(`   - New: ${deliveryResult.stockUpdate.newStock}`);
    console.log(`   - Added: ${deliveryResult.stockUpdate.quantityAdded}\n`);
    
    // Step 5: Verify stock movement was created
    console.log('5️⃣ Verifying stock movement creation...');
    if (deliveryResult.movement) {
      console.log(`✅ Stock movement created!`);
      console.log(`   - ID: ${deliveryResult.movement.id}`);
      console.log(`   - Type: ${deliveryResult.movement.type}`);
      console.log(`   - Sub-type: ${deliveryResult.movement.sub_type}`);
      console.log(`   - Status: ${deliveryResult.movement.status}`);
      console.log(`   - Quantity: ${deliveryResult.movement.quantity}`);
      console.log(`   - Reference: ${deliveryResult.movement.reference}`);
      console.log(`   - Stock before: ${deliveryResult.movement.stock_before}`);
      console.log(`   - Stock after: ${deliveryResult.movement.stock_after}\n`);
    } else {
      console.error('❌ Stock movement NOT created!');
      return;
    }
    
    // Step 6: Query movements by reference
    console.log('6️⃣ Querying movements by order reference...');
    const orderMovements = await StockMovements.getMovementsByReference(
      testOrder.order_code,
      'order_delivery'
    );
    console.log(`✅ Found ${orderMovements.length} movement(s) for order ${testOrder.order_code}\n`);
    
    // Step 7: Query movements by material
    console.log('7️⃣ Querying movements by material...');
    const materialMovements = await StockMovements.getMovementsByMaterial(
      testItem.material_id,
      { limit: 10 }
    );
    console.log(`✅ Found ${materialMovements.length} movement(s) for material ${testItem.material_code}`);
    
    if (materialMovements.length > 0) {
      console.log('\n   Recent movements:');
      materialMovements.slice(0, 3).forEach((m, i) => {
        console.log(`   ${i + 1}. ${m.sub_type}: ${m.type === 'in' ? '+' : '-'}${m.quantity} ${m.unit} (${new Date(m.movement_date).toLocaleString('tr-TR')})`);
      });
    }
    console.log();
    
    // Step 8: Get statistics
    console.log('8️⃣ Getting movement statistics...');
    const stats = await StockMovements.getStatistics({
      materialId: testItem.material_id
    });
    console.log(`✅ Statistics for ${testItem.material_code}:`);
    console.log(`   - Total movements: ${stats.totalMovements}`);
    console.log(`   - Stock in: ${stats.totalIn} movements (${stats.totalInQuantity} ${testItem.unit})`);
    console.log(`   - Stock out: ${stats.totalOut} movements (${stats.totalOutQuantity} ${testItem.unit})`);
    console.log(`   - Total value in: ${stats.totalInValue.toFixed(2)} TRY`);
    console.log(`   - Total value out: ${stats.totalOutValue.toFixed(2)} TRY\n`);
    
    // Step 9: Verify material stock updated
    console.log('9️⃣ Verifying final material stock...');
    const materialAfter = await Materials.getMaterialById(testItem.material_id);
    const expectedStock = parseFloat(materialBefore.stock) + parseFloat(testItem.quantity);
    const actualStock = parseFloat(materialAfter.stock);
    
    console.log(`✅ Material stock updated:`);
    console.log(`   - Before delivery: ${materialBefore.stock}`);
    console.log(`   - Quantity delivered: ${testItem.quantity}`);
    console.log(`   - Expected: ${expectedStock}`);
    console.log(`   - Actual: ${actualStock}`);
    console.log(`   - Match: ${Math.abs(actualStock - expectedStock) < 0.01 ? '✅ YES' : '❌ NO'}\n`);
    
    console.log('✅ All tests passed! Stock movements migration successful! 🎉\n');
    
    console.log('📋 Summary:');
    console.log(`   - Order: ${testOrder.order_code}`);
    console.log(`   - Item: ${testItem.item_code}`);
    console.log(`   - Material: ${testItem.material_code} - ${testItem.material_name}`);
    console.log(`   - Quantity: ${testItem.quantity} ${testItem.unit}`);
    console.log(`   - Stock movement ID: ${deliveryResult.movement.id}`);
    console.log(`   - Movement type: ${deliveryResult.movement.sub_type}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
  
  process.exit(0);
}

testStockMovements();
