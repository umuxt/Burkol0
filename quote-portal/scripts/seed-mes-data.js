/**
 * MES Seed Data Script - PostgreSQL
 * 
 * Creates initial test/demo data for MES system from scratch.
 * No Firebase dependency - pure SQL data creation.
 * 
 * Usage:
 *   node scripts/seed-mes-data.js [--clear] [--env=test|dev] [--minimal|--full]
 * 
 * Options:
 *   --clear: Delete existing MES data before seeding
 *   --env: Target environment (test or dev, default: test)
 *   --minimal: 3 workers, 2 stations, 1 plan
 *   --full: 50 workers, 20 stations, 100 plans
 */

import knex from '../db/knex.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CLEAR_DATA = process.argv.includes('--clear');
const ENV = process.argv.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'test';
const MINIMAL = process.argv.includes('--minimal');
const FULL = process.argv.includes('--full');

const DATASET_SIZE = MINIMAL ? 'minimal' : FULL ? 'full' : 'default';

console.log('🌱 MES Seed Data Script');
console.log('========================');
console.log('Environment:', ENV);
console.log('Dataset:', DATASET_SIZE);
if (CLEAR_DATA) console.log('⚠️  Will clear existing data first');
console.log('');

const stats = {
  workers: 0,
  stations: 0,
  operations: 0,
  substations: 0,
  plans: 0,
  nodes: 0,
  assignments: 0
};

// ============================================================================
// DATASET CONFIGURATIONS
// ============================================================================

const DATASETS = {
  minimal: {
    workers: 3,
    stations: 2,
    operations: 3,
    substations: 4,
    plans: 1
  },
  default: {
    workers: 10,
    stations: 5,
    operations: 10,
    substations: 15,
    plans: 5
  },
  full: {
    workers: 50,
    stations: 20,
    operations: 30,
    substations: 60,
    plans: 100
  }
};

const config = DATASETS[DATASET_SIZE];

// ============================================================================
// CLEAR DATA
// ============================================================================

async function clearData() {
  if (!CLEAR_DATA) return;
  
  console.log('🗑️  Clearing existing MES data...');
  
  await knex.transaction(async (trx) => {
    // Order matters due to foreign keys
    await trx('mes_node_predecessors').del();
    await trx('mes_node_material_inputs').del();
    await trx('mes_node_substations').del();
    await trx('mes_node_stations').del();
    await trx('mes_production_plan_nodes').del();
    await trx('mes_worker_assignments').del();
    await trx('mes_production_plans').del();
    await trx('mes_worker_stations').del();
    await trx('mes_worker_operations').del();
    await trx('mes_station_operations').del();
    await trx('mes_workers').del();
    await trx('mes_substations').del();
    await trx('mes_stations').del();
    await trx('mes_operations').del();
    
    console.log('  ✓ Cleared all MES tables\n');
  });
}

// ============================================================================
// SEED FUNCTIONS
// ============================================================================

/**
 * Create operations (master data)
 */
async function seedOperations() {
  console.log('📦 Creating operations...');
  
  const operations = [
    { id: 'OP-001', name: 'Kesim İşlemi', code: 'KESIM', description: 'Metal kesim operasyonu', nominal_time: 60 },
    { id: 'OP-002', name: 'Büküm İşlemi', code: 'BUKUM', description: 'Metal büküm operasyonu', nominal_time: 45 },
    { id: 'OP-003', name: 'Kaynak İşlemi', code: 'KAYNAK', description: 'Metal kaynak operasyonu', nominal_time: 90 },
    { id: 'OP-004', name: 'Montaj İşlemi', code: 'MONTAJ', description: 'Ürün montaj operasyonu', nominal_time: 120 },
    { id: 'OP-005', name: 'Boya İşlemi', code: 'BOYA', description: 'Ürün boyama operasyonu', nominal_time: 30 },
    { id: 'OP-006', name: 'Paketleme', code: 'PAKET', description: 'Ürün paketleme', nominal_time: 15 },
    { id: 'OP-007', name: 'Kalite Kontrol', code: 'QC', description: 'Kalite kontrol muayenesi', nominal_time: 20 },
    { id: 'OP-008', name: 'Tornalama', code: 'TORNA', description: 'CNC tornalama', nominal_time: 75 },
    { id: 'OP-009', name: 'Frezeleme', code: 'FREZE', description: 'CNC frezeleme', nominal_time: 85 },
    { id: 'OP-010', name: 'Taşlama', code: 'TASLA', description: 'Yüzey taşlama', nominal_time: 40 }
  ];
  
  const toInsert = operations.slice(0, config.operations);
  
  for (const op of toInsert) {
    await knex('mes_operations').insert(op).onConflict('id').merge();
    stats.operations++;
    console.log(`  ✓ ${op.id} - ${op.name}`);
  }
  
  console.log(`  Summary: ${stats.operations} operations created\n`);
}

/**
 * Create stations (master data)
 */
async function seedStations() {
  console.log('📦 Creating stations...');
  
  const stations = [
    { id: 'ST-001', name: 'Kesim İstasyonu', code: 'KESIM-ST', status: 'active' },
    { id: 'ST-002', name: 'Büküm İstasyonu', code: 'BUKUM-ST', status: 'active' },
    { id: 'ST-003', name: 'Kaynak İstasyonu', code: 'KAYNAK-ST', status: 'active' },
    { id: 'ST-004', name: 'Montaj İstasyonu', code: 'MONTAJ-ST', status: 'active' },
    { id: 'ST-005', name: 'Boya İstasyonu', code: 'BOYA-ST', status: 'active' },
    { id: 'ST-006', name: 'CNC İstasyonu', code: 'CNC-ST', status: 'active' },
    { id: 'ST-007', name: 'Kalite Kontrol', code: 'QC-ST', status: 'active' },
    { id: 'ST-008', name: 'Paketleme İstasyonu', code: 'PAKET-ST', status: 'active' },
    { id: 'ST-009', name: 'Taşlama İstasyonu', code: 'TASLA-ST', status: 'active' },
    { id: 'ST-010', name: 'Depolama', code: 'DEPO-ST', status: 'active' }
  ];
  
  const toInsert = stations.slice(0, config.stations);
  
  for (const station of toInsert) {
    await knex('mes_stations').insert(station).onConflict('id').merge();
    stats.stations++;
    console.log(`  ✓ ${station.id} - ${station.name}`);
  }
  
  console.log(`  Summary: ${stats.stations} stations created\n`);
}

/**
 * Create station-operation relationships
 */
async function seedStationOperations() {
  console.log('📦 Creating station-operation relationships...');
  
  const relationships = [
    { station_id: 'ST-001', operation_id: 'OP-001' }, // Kesim -> Kesim İşlemi
    { station_id: 'ST-002', operation_id: 'OP-002' }, // Büküm -> Büküm İşlemi
    { station_id: 'ST-003', operation_id: 'OP-003' }, // Kaynak -> Kaynak İşlemi
    { station_id: 'ST-004', operation_id: 'OP-004' }, // Montaj -> Montaj İşlemi
    { station_id: 'ST-005', operation_id: 'OP-005' }, // Boya -> Boya İşlemi
    { station_id: 'ST-006', operation_id: 'OP-008' }, // CNC -> Tornalama
    { station_id: 'ST-006', operation_id: 'OP-009' }, // CNC -> Frezeleme
    { station_id: 'ST-007', operation_id: 'OP-007' }, // QC -> Kalite Kontrol
    { station_id: 'ST-008', operation_id: 'OP-006' }, // Paketleme -> Paketleme
    { station_id: 'ST-009', operation_id: 'OP-010' }  // Taşlama -> Taşlama
  ];
  
  let count = 0;
  for (const rel of relationships) {
    // Only insert if both station and operation exist
    const stationExists = await knex('mes_stations').where('id', rel.station_id).first();
    const operationExists = await knex('mes_operations').where('id', rel.operation_id).first();
    
    if (stationExists && operationExists) {
      await knex('mes_station_operations').insert(rel).onConflict(['station_id', 'operation_id']).ignore();
      count++;
    }
  }
  
  console.log(`  ✓ ${count} relationships created\n`);
}

/**
 * Create substations
 */
async function seedSubstations() {
  console.log('📦 Creating substations...');
  
  const substations = [
    { id: 'SUB-001', name: 'Kesim Makinesi 1', code: 'KESIM-M1', station_id: 'ST-001', status: 'available' },
    { id: 'SUB-002', name: 'Kesim Makinesi 2', code: 'KESIM-M2', station_id: 'ST-001', status: 'available' },
    { id: 'SUB-003', name: 'Büküm Presi 1', code: 'BUKUM-P1', station_id: 'ST-002', status: 'available' },
    { id: 'SUB-004', name: 'Kaynak Makinesi 1', code: 'KAYNAK-M1', station_id: 'ST-003', status: 'available' },
    { id: 'SUB-005', name: 'Kaynak Makinesi 2', code: 'KAYNAK-M2', station_id: 'ST-003', status: 'available' },
    { id: 'SUB-006', name: 'Montaj Hattı 1', code: 'MONTAJ-H1', station_id: 'ST-004', status: 'available' },
    { id: 'SUB-007', name: 'Boya Kabini 1', code: 'BOYA-K1', station_id: 'ST-005', status: 'available' },
    { id: 'SUB-008', name: 'CNC Torna 1', code: 'CNC-T1', station_id: 'ST-006', status: 'available' },
    { id: 'SUB-009', name: 'CNC Freze 1', code: 'CNC-F1', station_id: 'ST-006', status: 'available' },
    { id: 'SUB-010', name: 'QC Tezgahı 1', code: 'QC-T1', station_id: 'ST-007', status: 'available' }
  ];
  
  let count = 0;
  for (const sub of substations) {
    // Only insert if station exists
    const stationExists = await knex('mes_stations').where('id', sub.station_id).first();
    if (stationExists) {
      await knex('mes_substations').insert(sub).onConflict('id').merge();
      stats.substations++;
      count++;
      console.log(`  ✓ ${sub.id} - ${sub.name}`);
    }
    
    if (count >= config.substations) break;
  }
  
  console.log(`  Summary: ${stats.substations} substations created\n`);
}

/**
 * Create workers
 */
async function seedWorkers() {
  console.log('📦 Creating workers...');
  
  const firstNames = ['Ahmet', 'Mehmet', 'Ali', 'Mustafa', 'Hasan', 'Hüseyin', 'İbrahim', 'Ömer', 'Yusuf', 'Ayşe', 'Fatma', 'Emine', 'Hatice', 'Zeynep'];
  const lastNames = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Aydın', 'Özdemir', 'Arslan', 'Doğan', 'Kılıç'];
  
  for (let i = 1; i <= config.workers; i++) {
    const workerId = `WORKER-${String(i).padStart(3, '0')}`;
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const tcNo = `${String(Math.floor(Math.random() * 90000000000) + 10000000000)}`;
    
    await knex('mes_workers').insert({
      id: workerId,
      first_name: firstName,
      last_name: lastName,
      tc_no: tcNo,
      status: 'active'
    }).onConflict('id').merge();
    
    stats.workers++;
    console.log(`  ✓ ${workerId} - ${firstName} ${lastName}`);
  }
  
  console.log(`  Summary: ${stats.workers} workers created\n`);
}

/**
 * Assign workers to stations
 */
async function seedWorkerStations() {
  console.log('📦 Assigning workers to stations...');
  
  const workers = await knex('mes_workers').select('id');
  const stations = await knex('mes_stations').select('id');
  
  let count = 0;
  for (const worker of workers) {
    // Each worker gets 1-3 random stations
    const numStations = Math.floor(Math.random() * 3) + 1;
    const shuffled = [...stations].sort(() => 0.5 - Math.random());
    const assigned = shuffled.slice(0, Math.min(numStations, stations.length));
    
    for (const station of assigned) {
      await knex('mes_worker_stations').insert({
        worker_id: worker.id,
        station_id: station.id
      }).onConflict(['worker_id', 'station_id']).ignore();
      count++;
    }
  }
  
  console.log(`  ✓ ${count} worker-station assignments created\n`);
}

/**
 * Assign workers to operations
 */
async function seedWorkerOperations() {
  console.log('📦 Qualifying workers for operations...');
  
  const workers = await knex('mes_workers').select('id');
  const operations = await knex('mes_operations').select('id');
  
  let count = 0;
  for (const worker of workers) {
    // Each worker qualifies for 2-5 random operations
    const numOps = Math.floor(Math.random() * 4) + 2;
    const shuffled = [...operations].sort(() => 0.5 - Math.random());
    const qualified = shuffled.slice(0, Math.min(numOps, operations.length));
    
    for (const operation of qualified) {
      await knex('mes_worker_operations').insert({
        worker_id: worker.id,
        operation_id: operation.id
      }).onConflict(['worker_id', 'operation_id']).ignore();
      count++;
    }
  }
  
  console.log(`  ✓ ${count} worker-operation qualifications created\n`);
}

/**
 * Create sample production plans
 */
async function seedProductionPlans() {
  console.log('📦 Creating production plans...');
  
  for (let i = 1; i <= config.plans; i++) {
    const planId = await knex.raw("SELECT mes.generate_production_plan_code() as id").then(r => r.rows[0].id);
    const workOrderCode = `WO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(i).padStart(3, '0')}`;
    
    await knex('mes_production_plans').insert({
      id: planId,
      work_order_code: workOrderCode,
      status: i === 1 ? 'production' : i <= 3 ? 'released' : 'draft',
      metadata: JSON.stringify({ quantity: Math.floor(Math.random() * 100) + 10 })
    });
    
    stats.plans++;
    console.log(`  ✓ ${planId} (${workOrderCode})`);
    
    // Create 2-5 nodes per plan
    const numNodes = Math.floor(Math.random() * 4) + 2;
    await seedPlanNodes(planId, numNodes);
  }
  
  console.log(`  Summary: ${stats.plans} plans with ${stats.nodes} nodes created\n`);
}

/**
 * Create nodes for a production plan
 */
async function seedPlanNodes(planId, numNodes) {
  const operations = await knex('mes_operations').select('*').limit(numNodes);
  
  for (let i = 0; i < numNodes; i++) {
    const operation = operations[i % operations.length];
    const nodeId = `node-${i + 1}`;
    
    const [nodeRecord] = await knex('mes_production_plan_nodes').insert({
      node_id: nodeId,
      plan_id: planId,
      name: operation.name,
      operation_id: operation.id,
      nominal_time: operation.nominal_time || 60,
      efficiency: 0.85,
      effective_time: (operation.nominal_time || 60) / 0.85,
      assignment_mode: 'auto',
      output_qty: Math.floor(Math.random() * 50) + 10,
      output_unit: 'adet',
      sequence_order: i
    }).returning('id');
    
    stats.nodes++;
    
    // Assign 1-2 stations to this node
    const stationOps = await knex('mes_station_operations')
      .where('operation_id', operation.id)
      .join('mes_stations', 'mes_station_operations.station_id', 'mes_stations.id')
      .select('mes_stations.id as station_id')
      .limit(2);
    
    for (let j = 0; j < stationOps.length; j++) {
      await knex('mes_node_stations').insert({
        node_id: nodeRecord.id,
        station_id: stationOps[j].station_id,
        priority: j + 1
      }).onConflict(['node_id', 'station_id']).ignore();
    }
    
    // Add predecessor for sequential nodes
    if (i > 0) {
      const prevNode = await knex('mes_production_plan_nodes')
        .where({ plan_id: planId, node_id: `node-${i}` })
        .first();
      
      if (prevNode) {
        await knex('mes_node_predecessors').insert({
          node_id: nodeRecord.id,
          predecessor_node_id: prevNode.id
        }).onConflict(['node_id', 'predecessor_node_id']).ignore();
      }
    }
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  try {
    console.log('⏱️  Starting seed process...\n');
    const startTime = Date.now();
    
    // Clear data if requested
    await clearData();
    
    // Master data
    await seedOperations();
    await seedStations();
    await seedStationOperations();
    await seedSubstations();
    await seedWorkers();
    await seedWorkerStations();
    await seedWorkerOperations();
    
    // Production plans
    await seedProductionPlans();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('✅ Seed complete!');
    console.log('==================');
    console.log(`Duration: ${duration}s`);
    console.log('');
    console.log('Summary:');
    console.log(`  Workers: ${stats.workers}`);
    console.log(`  Stations: ${stats.stations}`);
    console.log(`  Operations: ${stats.operations}`);
    console.log(`  Substations: ${stats.substations}`);
    console.log(`  Plans: ${stats.plans}`);
    console.log(`  Nodes: ${stats.nodes}`);
    console.log('');
    
    process.exit(0);
  } catch (error) {
    console.error('💥 Seed failed:', error);
    process.exit(1);
  }
}

main();
