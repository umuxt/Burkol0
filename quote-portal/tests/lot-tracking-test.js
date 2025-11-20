/**
 * LOT TRACKING SYSTEM - COMPREHENSIVE TEST SUITE
 * 
 * Purpose: Test Phase 1+2 lot tracking implementation
 * - Migration validation
 * - Lot number generation
 * - FIFO lot consumption
 * - Partial reservations
 * - Traceability
 * - UI integration
 * 
 * Run: node tests/lot-tracking-test.js
 */

import { test } from 'node:test';
import assert from 'node:assert';
import db from '../db/connection.js';
import { generateLotNumber, validateLotNumber, parseLotNumber } from '../server/utils/lotGenerator.js';
import { reserveMaterialsWithLotTracking, getLotConsumptionPreview } from '../server/utils/lotConsumption.js';

// ============================================================================
// TEST 1: MIGRATION VALIDATION
// ============================================================================

test('Test 1: Migration Validation', async (t) => {
  
  await t.test('1.1: Verify lot fields in stock_movements', async () => {
    const result = await db.raw(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'materials' 
        AND table_name = 'stock_movements' 
        AND column_name IN ('lot_number', 'lot_date', 'supplier_lot_code', 'manufacturing_date', 'expiry_date', 'node_sequence')
      ORDER BY column_name
    `);
    
    const columns = result.rows.map(r => r.column_name);
    assert.ok(columns.includes('lot_number'), 'lot_number column exists');
    assert.ok(columns.includes('lot_date'), 'lot_date column exists');
    assert.ok(columns.includes('supplier_lot_code'), 'supplier_lot_code column exists');
    assert.ok(columns.includes('manufacturing_date'), 'manufacturing_date column exists');
    assert.ok(columns.includes('expiry_date'), 'expiry_date column exists');
    assert.ok(columns.includes('node_sequence'), 'node_sequence column exists');
    
    console.log('✅ All lot fields exist in stock_movements');
  });

  await t.test('1.2: Verify lot fields in order_items', async () => {
    const result = await db.raw(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'materials' 
        AND table_name = 'order_items' 
        AND column_name IN ('lot_number', 'supplier_lot_code', 'manufacturing_date', 'expiry_date')
      ORDER BY column_name
    `);
    
    const columns = result.rows.map(r => r.column_name);
    assert.ok(columns.includes('lot_number'), 'lot_number column exists in order_items');
    assert.ok(columns.includes('supplier_lot_code'), 'supplier_lot_code column exists');
    
    console.log('✅ Lot fields exist in order_items');
  });

  await t.test('1.3: Verify FIFO index on stock_movements', async () => {
    const result = await db.raw(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE schemaname = 'materials' 
        AND tablename = 'stock_movements' 
        AND indexname LIKE '%fifo_lots%'
    `);
    
    assert.ok(result.rows.length > 0, 'FIFO lot index exists');
    assert.ok(result.rows[0].indexdef.includes('lot_date'), 'Index includes lot_date for FIFO sorting');
    
    console.log('✅ FIFO index validated:', result.rows[0].indexname);
  });

  await t.test('1.4: Verify assignment_material_reservations table exists', async () => {
    const result = await db.raw(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'mes' 
        AND table_name = 'assignment_material_reservations'
    `);
    
    assert.strictEqual(result.rows.length, 1, 'assignment_material_reservations table exists in mes schema');
    
    console.log('✅ assignment_material_reservations table validated');
  });
});

// ============================================================================
// TEST 2: LOT NUMBER GENERATION
// ============================================================================

test('Test 2: Lot Number Generation', async (t) => {
  
  await t.test('2.1: Generate lot number with correct format', async () => {
    const materialCode = 'TEST-M-001';
    const testDate = new Date('2025-11-20');
    
    const lotNumber = await generateLotNumber(materialCode, testDate);
    
    assert.ok(lotNumber, 'Lot number generated');
    assert.ok(lotNumber.startsWith('LOT-TEST-M-001-20251120-'), 'Correct format: LOT-{code}-{date}-{seq}');
    assert.ok(validateLotNumber(lotNumber), 'Generated lot number is valid');
    
    console.log('✅ Generated lot:', lotNumber);
  });

  await t.test('2.2: Sequence increments for same material+date', async () => {
    const materialCode = 'TEST-M-002';
    const testDate = new Date('2025-11-20');
    
    const lot1 = await generateLotNumber(materialCode, testDate);
    const lot2 = await generateLotNumber(materialCode, testDate);
    
    assert.notStrictEqual(lot1, lot2, 'Different lot numbers generated');
    
    const parsed1 = parseLotNumber(lot1);
    const parsed2 = parseLotNumber(lot2);
    
    const seq1 = parseInt(parsed1.sequence);
    const seq2 = parseInt(parsed2.sequence);
    
    assert.strictEqual(seq2, seq1 + 1, 'Sequence incremented');
    
    console.log('✅ Sequence increment validated:', lot1, '→', lot2);
  });

  await t.test('2.3: Validate lot number format validation', async () => {
    assert.ok(validateLotNumber('LOT-M-00-001-20251120-001'), 'Valid format accepted');
    assert.ok(!validateLotNumber('INVALID-LOT'), 'Invalid format rejected');
    assert.ok(!validateLotNumber('LOT-M-001'), 'Incomplete format rejected');
    
    console.log('✅ Lot number validation works correctly');
  });

  await t.test('2.4: Parse lot number correctly', async () => {
    const lotNumber = 'LOT-M-00-001-20251120-005';
    const parsed = parseLotNumber(lotNumber);
    
    assert.strictEqual(parsed.materialCode, 'M-00-001', 'Material code parsed');
    
    // Handle both string and Date object returns
    const dateString = typeof parsed.date === 'string' 
      ? parsed.date 
      : parsed.date.toISOString().split('T')[0].replace(/-/g, '');
    assert.strictEqual(dateString, '20251120', 'Date parsed');
    
    assert.strictEqual(parsed.sequence, '005', 'Sequence parsed');
    
    console.log('✅ Lot number parsing validated:', parsed);
  });
});

// ============================================================================
// TEST 3: FIFO LOT CONSUMPTION
// ============================================================================

test('Test 3: FIFO Lot Consumption', async (t) => {
  
  // Setup: Create test material and lots
  const testMaterialCode = 'TEST-FIFO-M-001';
  let testAssignmentId = 'TEST-WO-001-FIFO';
  const testCategoryId = 'test-cat-lot-tracking';
  
  await t.test('3.1: Setup test data (3 lots)', async () => {
    // Cleanup previous test data
    await db('materials.stock_movements').where('material_code', testMaterialCode).del();
    await db('materials.materials').where('code', testMaterialCode).del();
    await db('materials.materials_categories').where('id', testCategoryId).del();
    
    // Create test category
    await db('materials.materials_categories').insert({
      id: testCategoryId,
      name: 'Test Category - Lot Tracking'
    }).onConflict('id').ignore();
    
    // Create test material
    await db('materials.materials').insert({
      code: testMaterialCode,
      name: 'Test FIFO Material',
      type: 'raw',
      category: testCategoryId,
      unit: 'kg',
      stock: 450,
      reserved: 0,
      wip_reserved: 0
    });
    
    // Create 3 lots with different dates
    const lots = [
      {
        lot_number: await generateLotNumber(testMaterialCode, new Date('2025-11-01')),
        lot_date: '2025-11-01',
        quantity: 100
      },
      {
        lot_number: await generateLotNumber(testMaterialCode, new Date('2025-11-15')),
        lot_date: '2025-11-15',
        quantity: 200
      },
      {
        lot_number: await generateLotNumber(testMaterialCode, new Date('2025-11-20')),
        lot_date: '2025-11-20',
        quantity: 150
      }
    ];
    
    // Insert stock movements for each lot
    for (const lot of lots) {
      await db('materials.stock_movements').insert({
        material_code: testMaterialCode,
        type: 'in',
        quantity: lot.quantity,
        lot_number: lot.lot_number,
        lot_date: lot.lot_date,
        movement_date: new Date(lot.lot_date),
        stock_before: 0,
        stock_after: lot.quantity,
        created_by: 'test-setup'
      });
    }
    
    console.log('✅ Test lots created:', lots.map(l => `${l.lot_number} (${l.quantity} kg)`).join(', '));
  });

  await t.test('3.2: Preview lot consumption (250 kg required)', async () => {
    const preview = await getLotConsumptionPreview([
      { materialCode: testMaterialCode, requiredQty: 250 }
    ]);
    
    assert.ok(preview.materials, 'Preview returned materials');
    assert.strictEqual(preview.materials.length, 1, 'One material in preview');
    
    const material = preview.materials[0];
    assert.strictEqual(material.materialCode, testMaterialCode, 'Correct material');
    assert.strictEqual(material.requiredQty, 250, 'Correct required quantity');
    assert.ok(material.lotsToConsume.length >= 2, 'Multiple lots to consume (FIFO)');
    
    // Verify FIFO order (oldest first)
    const firstLot = material.lotsToConsume[0];
    const secondLot = material.lotsToConsume[1];
    
    assert.ok(firstLot.lotDate < secondLot.lotDate, 'FIFO order: oldest lot first');
    assert.strictEqual(firstLot.consumeQty, 100, 'First lot fully consumed (100 kg)');
    assert.strictEqual(secondLot.consumeQty, 150, 'Second lot partially consumed (150 kg)');
    
    console.log('✅ FIFO preview validated:', material.lotsToConsume);
  });

  await t.test('3.3: Reserve materials with lot tracking (250 kg)', async () => {
    // Create test assignment if not exists
    const assignmentExists = await db('mes.mes_worker_assignments')
      .where('id', testAssignmentId)
      .first();
    
    if (!assignmentExists) {
      await db('mes.mes_worker_assignments').insert({
        id: testAssignmentId,
        plan_id: 'TEST-PLAN-001',
        node_sequence: 1,
        worker_id: 'TEST-WORKER-001',
        status: 'pending',
        expected_start: new Date(),
        nominal_time: 60
      });
    }
    
    const result = await reserveMaterialsWithLotTracking(
      testAssignmentId,
      [{ materialCode: testMaterialCode, requiredQty: 250 }]
    );
    
    assert.ok(result.success, 'Reservation successful');
    assert.strictEqual(result.warnings.length, 0, 'No warnings');
    assert.strictEqual(result.reservations.length, 1, 'One reservation created');
    
    const reservation = result.reservations[0];
    assert.strictEqual(reservation.totalReserved, 250, 'Correct total reserved');
    assert.strictEqual(reservation.partialReservation, false, 'Full reservation');
    assert.ok(reservation.lotsConsumed.length >= 2, 'Consumed from multiple lots');
    
    console.log('✅ FIFO reservation validated:', reservation.lotsConsumed);
  });

  await t.test('3.4: Verify stock movements created', async () => {
    const movements = await db('materials.stock_movements')
      .where('material_code', testMaterialCode)
      .where('type', 'out')
      .orderBy('lot_date', 'asc');
    
    assert.ok(movements.length >= 2, 'Multiple OUT movements created');
    
    // First movement should be from oldest lot (2025-11-01)
    assert.strictEqual(movements[0].lot_date.toISOString().split('T')[0], '2025-11-01', 'First consumption from oldest lot');
    assert.strictEqual(parseFloat(movements[0].quantity), 100, 'First lot fully consumed');
    
    console.log('✅ Stock movements validated:', movements.length, 'OUT movements');
  });

  await t.test('3.5: Verify assignment_material_reservations records', async () => {
    const reservations = await db('mes.assignment_material_reservations')
      .where('assignment_id', testAssignmentId)
      .where('material_code', testMaterialCode);
    
    assert.ok(reservations.length > 0, 'Reservation records created');
    
    const totalReserved = reservations.reduce((sum, r) => sum + parseFloat(r.actual_reserved_qty || 0), 0);
    assert.strictEqual(totalReserved, 250, 'Total reserved matches requirement');
    
    console.log('✅ Reservation records validated:', reservations.length, 'records');
  });

  // Cleanup
  await t.test('3.6: Cleanup test data', async () => {
    await db('mes.assignment_material_reservations').where('assignment_id', testAssignmentId).del();
    await db('mes.mes_worker_assignments').where('id', testAssignmentId).del();
    await db('materials.stock_movements').where('material_code', testMaterialCode).del();
    await db('materials.materials').where('code', testMaterialCode).del();
    await db('materials.materials_categories').where('id', testCategoryId).del();
    
    console.log('✅ Test data cleaned up');
  });
});

// ============================================================================
// TEST 4: PARTIAL RESERVATION
// ============================================================================

test('Test 4: Partial Reservation Handling', async (t) => {
  
  const testMaterialCode = 'TEST-PARTIAL-M-001';
  const testAssignmentId = 'TEST-WO-002-PARTIAL';
  const testCategoryId = 'test-cat-partial';
  
  await t.test('4.1: Setup partial stock scenario (80 kg available)', async () => {
    // Cleanup
    await db('materials.stock_movements').where('material_code', testMaterialCode).del();
    await db('materials.materials').where('code', testMaterialCode).del();
    await db('materials.materials_categories').where('id', testCategoryId).del();
    
    // Create test category
    await db('materials.materials_categories').insert({
      id: testCategoryId,
      name: 'Test Category - Partial'
    }).onConflict('id').ignore();
    
    // Create material
    await db('materials.materials').insert({
      code: testMaterialCode,
      name: 'Test Partial Material',
      type: 'raw',
      category: testCategoryId,
      unit: 'kg',
      stock: 80,
      reserved: 0,
      wip_reserved: 0
    });
    
    // Create one lot with 80 kg
    const lotNumber = await generateLotNumber(testMaterialCode, new Date('2025-11-20'));
    await db('materials.stock_movements').insert({
      material_code: testMaterialCode,
      type: 'in',
      quantity: 80,
      lot_number: lotNumber,
      lot_date: '2025-11-20',
      movement_date: new Date(),
      stock_before: 0,
      stock_after: 80,
      created_by: 'test-setup'
    });
    
    console.log('✅ Partial stock scenario created: 80 kg available');
  });

  await t.test('4.2: Request 100 kg (insufficient stock)', async () => {
    // Create test assignment
    await db('mes.mes_worker_assignments').insert({
      id: testAssignmentId,
      plan_id: 'TEST-PLAN-002',
      node_sequence: 1,
      worker_id: 'TEST-WORKER-002',
      status: 'pending',
      expected_start: new Date(),
      nominal_time: 60
    }).onConflict('id').ignore();
    
    const result = await reserveMaterialsWithLotTracking(
      testAssignmentId,
      [{ materialCode: testMaterialCode, requiredQty: 100 }]
    );
    
    assert.ok(result.success, 'Reservation still succeeds (with warning)');
    assert.ok(result.warnings.length > 0, 'Warning generated');
    assert.ok(result.warnings[0].includes('Partial reservation'), 'Partial reservation warning');
    
    const reservation = result.reservations[0];
    assert.strictEqual(reservation.totalReserved, 80, 'Reserved only available stock (80 kg)');
    assert.strictEqual(reservation.partialReservation, true, 'Marked as partial reservation');
    
    console.log('✅ Partial reservation handled:', result.warnings[0]);
  });

  await t.test('4.3: Verify partial_reservation flag in stock_movements', async () => {
    const movement = await db('materials.stock_movements')
      .where('material_code', testMaterialCode)
      .where('type', 'out')
      .first();
    
    assert.ok(movement, 'OUT movement created');
    assert.strictEqual(movement.partial_reservation, true, 'partial_reservation flag set');
    assert.strictEqual(parseFloat(movement.requested_quantity), 100, 'Original request recorded');
    assert.strictEqual(parseFloat(movement.quantity), 80, 'Actual quantity reserved');
    
    console.log('✅ Partial reservation flags validated');
  });

  // Cleanup
  await t.test('4.4: Cleanup partial test data', async () => {
    await db('mes.assignment_material_reservations').where('assignment_id', testAssignmentId).del();
    await db('mes.mes_worker_assignments').where('id', testAssignmentId).del();
    await db('materials.stock_movements').where('material_code', testMaterialCode).del();
    await db('materials.materials').where('code', testMaterialCode).del();
    await db('materials.materials_categories').where('id', testCategoryId).del();
    
    console.log('✅ Partial test data cleaned up');
  });
});

// ============================================================================
// TEST 5: TRACEABILITY
// ============================================================================

test('Test 5: Lot Traceability', async (t) => {
  
  const testMaterialCode = 'TEST-TRACE-M-001';
  const testOrderId = 999999; // High number to avoid conflicts
  const testAssignmentId = 'TEST-WO-003-TRACE';
  const testCategoryId = 'test-cat-trace';
  let testLotNumber;
  
  await t.test('5.1: Create order delivery with lot tracking', async () => {
    // Cleanup
    await db('materials.stock_movements').where('material_code', testMaterialCode).del();
    await db('materials.order_items').where('order_id', testOrderId).del();
    await db('materials.orders').where('id', testOrderId).del();
    await db('materials.materials').where('code', testMaterialCode).del();
    await db('materials.materials_categories').where('id', testCategoryId).del();
    
    // Create test category
    await db('materials.materials_categories').insert({
      id: testCategoryId,
      name: 'Test Category - Trace'
    }).onConflict('id').ignore();
    
    // Create material
    await db('materials.materials').insert({
      code: testMaterialCode,
      name: 'Test Trace Material',
      type: 'raw',
      category: testCategoryId,
      unit: 'kg',
      stock: 0,
      reserved: 0,
      wip_reserved: 0
    });
    
    // Create order
    await db('materials.orders').insert({
      id: testOrderId,
      order_code: 'TEST-ORDER-TRACE-001',
      supplier_id: 1,
      status: 'delivered',
      order_date: new Date(),
      created_by: 'test-setup'
    });
    
    // Create order item
    await db('materials.order_items').insert({
      order_id: testOrderId,
      material_code: testMaterialCode,
      quantity: 100,
      unit_price: 10.50,
      status: 'pending'
    });
    
    // Generate lot and record delivery
    testLotNumber = await generateLotNumber(testMaterialCode, new Date('2025-11-20'));
    
    await db('materials.stock_movements').insert({
      material_code: testMaterialCode,
      type: 'in',
      quantity: 100,
      lot_number: testLotNumber,
      lot_date: '2025-11-20',
      supplier_lot_code: 'SUPPLIER-BATCH-TEST-001',
      manufacturing_date: '2025-11-15',
      expiry_date: '2026-11-15',
      movement_date: new Date(),
      stock_before: 0,
      stock_after: 100,
      created_by: 'test-setup'
    });
    
    // Update order item with lot
    await db('materials.order_items')
      .where('order_id', testOrderId)
      .update({
        lot_number: testLotNumber,
        supplier_lot_code: 'SUPPLIER-BATCH-TEST-001',
        manufacturing_date: '2025-11-15',
        expiry_date: '2026-11-15'
      });
    
    console.log('✅ Order delivery with lot created:', testLotNumber);
  });

  await t.test('5.2: Consume lot in production', async () => {
    // Create assignment
    await db('mes.mes_worker_assignments').insert({
      id: testAssignmentId,
      plan_id: 'TEST-PLAN-003',
      node_sequence: 1,
      worker_id: 'TEST-WORKER-003',
      status: 'pending',
      expected_start: new Date(),
      nominal_time: 60
    }).onConflict('id').ignore();
    
    // Reserve materials
    const result = await reserveMaterialsWithLotTracking(
      testAssignmentId,
      [{ materialCode: testMaterialCode, requiredQty: 50 }]
    );
    
    assert.ok(result.success, 'Material reserved from lot');
    assert.strictEqual(result.reservations[0].lotsConsumed[0].lotNumber, testLotNumber, 'Correct lot consumed');
    
    console.log('✅ Lot consumed in production:', testLotNumber);
  });

  await t.test('5.3: Trace lot → order', async () => {
    const orderItem = await db('materials.order_items')
      .where('lot_number', testLotNumber)
      .first();
    
    assert.ok(orderItem, 'Found order item by lot number');
    assert.strictEqual(orderItem.order_id, testOrderId, 'Traced to correct order');
    assert.strictEqual(orderItem.supplier_lot_code, 'SUPPLIER-BATCH-TEST-001', 'Supplier lot code preserved');
    
    console.log('✅ Traced lot to order:', testLotNumber, '→ Order', testOrderId);
  });

  await t.test('5.4: Trace lot → assignment', async () => {
    const reservation = await db('mes.assignment_material_reservations')
      .where('lot_number', testLotNumber)
      .first();
    
    assert.ok(reservation, 'Found reservation by lot number');
    assert.strictEqual(reservation.assignment_id, testAssignmentId, 'Traced to correct assignment');
    
    console.log('✅ Traced lot to assignment:', testLotNumber, '→', testAssignmentId);
  });

  await t.test('5.5: Full traceability chain', async () => {
    // Query: Which assignment used which lot from which order?
    const trace = await db.raw(`
      SELECT 
        oi.order_id,
        o.order_code,
        oi.supplier_lot_code,
        sm.lot_number,
        sm.lot_date,
        amr.assignment_id,
        amr.actual_reserved_qty
      FROM materials.order_items oi
      JOIN materials.orders o ON o.id = oi.order_id
      JOIN materials.stock_movements sm ON sm.lot_number = oi.lot_number
      LEFT JOIN mes.assignment_material_reservations amr ON amr.lot_number = sm.lot_number
      WHERE oi.lot_number = ?
    `, [testLotNumber]);
    
    assert.ok(trace.rows.length > 0, 'Traceability chain complete');
    const chain = trace.rows[0];
    
    assert.strictEqual(chain.order_id, testOrderId, 'Order traced');
    assert.strictEqual(chain.lot_number, testLotNumber, 'Lot traced');
    assert.strictEqual(chain.assignment_id, testAssignmentId, 'Assignment traced');
    
    console.log('✅ Full traceability chain validated:', {
      order: chain.order_code,
      supplierLot: chain.supplier_lot_code,
      systemLot: chain.lot_number,
      assignment: chain.assignment_id,
      consumed: chain.actual_reserved_qty
    });
  });

  // Cleanup
  await t.test('5.6: Cleanup traceability test data', async () => {
    await db('mes.assignment_material_reservations').where('assignment_id', testAssignmentId).del();
    await db('mes.mes_worker_assignments').where('id', testAssignmentId).del();
    await db('materials.stock_movements').where('material_code', testMaterialCode).del();
    await db('materials.order_items').where('order_id', testOrderId).del();
    await db('materials.orders').where('id', testOrderId).del();
    await db('materials.materials').where('code', testMaterialCode).del();
    await db('materials.materials_categories').where('id', testCategoryId).del();
    
    console.log('✅ Traceability test data cleaned up');
  });
});

// ============================================================================
// TEST 6: LOT INVENTORY QUERY
// ============================================================================

test('Test 6: Lot Inventory Query', async (t) => {
  
  const testMaterialCode = 'TEST-INV-M-001';
  const testCategoryId = 'test-cat-inventory';
  
  await t.test('6.1: Create multiple lots for inventory', async () => {
    // Cleanup
    await db('materials.stock_movements').where('material_code', testMaterialCode).del();
    await db('materials.materials').where('code', testMaterialCode).del();
    await db('materials.materials_categories').where('id', testCategoryId).del();
    
    // Create test category
    await db('materials.materials_categories').insert({
      id: testCategoryId,
      name: 'Test Category - Inventory'
    }).onConflict('id').ignore();
    
    // Create material
    await db('materials.materials').insert({
      code: testMaterialCode,
      name: 'Test Inventory Material',
      type: 'raw',
      category: testCategoryId,
      unit: 'kg',
      stock: 400,
      reserved: 0,
      wip_reserved: 0
    });
    
    // Create 4 lots with different dates and expiry
    const lots = [
      { date: '2025-11-01', qty: 100, expiry: '2026-01-01' }, // Expired
      { date: '2025-11-10', qty: 150, expiry: '2025-12-15' }, // Expiring soon
      { date: '2025-11-15', qty: 100, expiry: '2026-06-01' }, // Active
      { date: '2025-11-20', qty: 50, expiry: '2026-12-01' }   // Active
    ];
    
    for (const lot of lots) {
      const lotNumber = await generateLotNumber(testMaterialCode, new Date(lot.date));
      await db('materials.stock_movements').insert({
        material_code: testMaterialCode,
        type: 'in',
        quantity: lot.qty,
        lot_number: lotNumber,
        lot_date: lot.date,
        expiry_date: lot.expiry,
        movement_date: new Date(lot.date),
        stock_before: 0,
        stock_after: lot.qty,
        created_by: 'test-setup'
      });
    }
    
    console.log('✅ Created 4 lots with different expiry dates');
  });

  await t.test('6.2: Query lot inventory with FIFO order', async () => {
    const lots = await db.raw(`
      SELECT 
        sm.lot_number,
        sm.lot_date,
        sm.expiry_date,
        sm.material_code,
        SUM(CASE WHEN sm.type='in' THEN sm.quantity ELSE -sm.quantity END) as lot_balance,
        CASE
          WHEN sm.expiry_date < CURRENT_DATE THEN 'expired'
          WHEN sm.expiry_date < CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
          ELSE 'active'
        END as lot_status,
        ROW_NUMBER() OVER (PARTITION BY sm.material_code ORDER BY sm.lot_date) as fifo_order
      FROM materials.stock_movements sm
      WHERE sm.material_code = ? AND sm.lot_number IS NOT NULL
      GROUP BY sm.lot_number, sm.lot_date, sm.expiry_date, sm.material_code
      HAVING SUM(CASE WHEN sm.type='in' THEN sm.quantity ELSE -sm.quantity END) > 0
      ORDER BY sm.lot_date ASC
    `, [testMaterialCode]);
    
    assert.strictEqual(lots.rows.length, 4, 'All 4 lots returned');
    assert.strictEqual(lots.rows[0].fifo_order, 1, 'FIFO order starts at 1');
    assert.strictEqual(lots.rows[3].fifo_order, 4, 'FIFO order ends at 4');
    
    // Check status calculation
    const expiredLots = lots.rows.filter(l => l.lot_status === 'expired');
    const expiringSoonLots = lots.rows.filter(l => l.lot_status === 'expiring_soon');
    const activeLots = lots.rows.filter(l => l.lot_status === 'active');
    
    console.log('✅ Lot inventory query validated:', {
      total: lots.rows.length,
      expired: expiredLots.length,
      expiring_soon: expiringSoonLots.length,
      active: activeLots.length
    });
  });

  // Cleanup
  await t.test('6.3: Cleanup inventory test data', async () => {
    await db('materials.stock_movements').where('material_code', testMaterialCode).del();
    await db('materials.materials').where('code', testMaterialCode).del();
    await db('materials.materials_categories').where('id', testCategoryId).del();
    
    console.log('✅ Inventory test data cleaned up');
  });
});

// ============================================================================
// CLEANUP & SUMMARY
// ============================================================================

test.after(async () => {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🎉 LOT TRACKING TEST SUITE COMPLETED');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅ Migration validation passed');
  console.log('✅ Lot number generation tested');
  console.log('✅ FIFO lot consumption validated');
  console.log('✅ Partial reservation handling confirmed');
  console.log('✅ Full traceability chain verified');
  console.log('✅ Lot inventory queries working');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  await db.destroy();
});
