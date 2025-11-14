#!/usr/bin/env node

/**
 * Migration Script: executionGraph[] → canonical nodes[]
 * 
 * Purpose: Backfill canonical nodes[] from existing executionGraph[] in production plans
 * 
 * Usage:
 *   Dry-run (default):  node scripts/migrateExecutionGraphToNodes.js --dry-run
 *   Execute all:        node scripts/migrateExecutionGraphToNodes.js --execute
 *   Single plan:        node scripts/migrateExecutionGraphToNodes.js --execute --planId=PLAN-001
 * 
 * What it does:
 * - Converts executionGraph nodes to canonical schema
 * - Adds _migration metadata to track migration status
 * - Does NOT delete executionGraph (kept for 2 release cycles)
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '../config/serviceAccountKey.json');

try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('✅ Firebase Admin initialized');
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin:', error.message);
  console.error('   Make sure serviceAccountKey.json exists in /quote-portal/config/');
  process.exit(1);
}

const db = admin.firestore();

// Parse CLI arguments
const args = process.argv.slice(2);
const dryRun = !args.includes('--execute');
const planIdArg = args.find(arg => arg.startsWith('--planId='));
const singlePlanId = planIdArg ? planIdArg.split('=')[1] : null;

/**
 * Convert executionGraph node to canonical schema
 * @param {Object} node - executionGraph node
 * @returns {Object} - canonical node
 */
function convertNodeToCanonical(node) {
  const canonical = {
    id: node.id || node.nodeId,
    name: node.name,
    operationId: node.operationId,
    nominalTime: node.nominalTime || node.time || node.estimatedNominalTime || node.duration || 60,
    requiredSkills: node.requiredSkills || node.skills || [],
    assignedStations: node.assignedStationId 
      ? [{ stationId: node.assignedStationId, priority: 1 }] 
      : (node.assignedStations || []),
    assignedSubstations: node.assignedSubstations || [],
    assignmentMode: node.assignmentMode || node.allocationType || 'auto',
    assignedWorkerId: node.assignedWorkerId || node.workerHint?.workerId || null,
    predecessors: node.predecessors || [],
    materialInputs: node.materialInputs || [],
    outputCode: node.outputCode || null,
    outputQty: node.outputQty || 0
  };
  
  // Only include efficiency if present
  if (node.efficiency !== undefined && node.efficiency !== null) {
    canonical.efficiency = node.efficiency;
  }
  
  // Preserve additional fields that may exist
  const additionalFields = [
    'operationName', 'workerName', 'stationName', 'outputName', 
    'estimatedStartTime', 'estimatedEndTime', 'estimatedDuration',
    'effectiveTime', 'priorityIndex', 'hasOutputs'
  ];
  
  additionalFields.forEach(field => {
    if (node[field] !== undefined) {
      canonical[field] = node[field];
    }
  });
  
  return canonical;
}

/**
 * Convert executionGraph array to canonical nodes array
 * @param {Array} executionGraph - array of executionGraph nodes
 * @returns {Array} - array of canonical nodes
 */
function convertExecutionGraphToNodes(executionGraph) {
  if (!Array.isArray(executionGraph)) {
    return [];
  }
  
  return executionGraph.map(convertNodeToCanonical);
}

/**
 * Migrate a single plan
 * @param {string} planId - plan ID
 * @param {boolean} execute - whether to write to Firestore
 * @returns {Object} - migration result
 */
async function migratePlan(planId, execute = false) {
  try {
    const planRef = db.collection('mes-production-plans').doc(planId);
    const planSnap = await planRef.get();
    
    if (!planSnap.exists) {
      return {
        planId,
        status: 'not_found',
        error: 'Plan document not found'
      };
    }
    
    const planData = planSnap.data();
    
    // Check if already migrated
    if (planData.nodes && Array.isArray(planData.nodes) && planData.nodes.length > 0) {
      return {
        planId,
        status: 'already_migrated',
        nodeCount: planData.nodes.length,
        hasMigrationFlag: !!planData._migration?.executionGraphToNodes
      };
    }
    
    // Check if executionGraph exists
    if (!planData.executionGraph || !Array.isArray(planData.executionGraph) || planData.executionGraph.length === 0) {
      return {
        planId,
        status: 'no_execution_graph',
        message: 'Plan has no executionGraph to migrate'
      };
    }
    
    // Convert to canonical nodes
    const canonicalNodes = convertExecutionGraphToNodes(planData.executionGraph);
    
    if (execute) {
      // Write to Firestore
      await planRef.update({
        nodes: canonicalNodes,
        _migration: {
          executionGraphToNodes: true,
          migratedAt: new Date().toISOString(),
          migratedBy: 'migration-script',
          originalExecutionGraphNodeCount: planData.executionGraph.length
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return {
        planId,
        status: 'migrated',
        nodeCount: canonicalNodes.length,
        originalExecutionGraphCount: planData.executionGraph.length
      };
    } else {
      // Dry-run: just report what would be done
      return {
        planId,
        status: 'would_migrate',
        nodeCount: canonicalNodes.length,
        originalExecutionGraphCount: planData.executionGraph.length,
        sampleNode: canonicalNodes[0] ? {
          id: canonicalNodes[0].id,
          nominalTime: canonicalNodes[0].nominalTime,
          requiredSkills: canonicalNodes[0].requiredSkills,
          assignedStations: canonicalNodes[0].assignedStations
        } : null
      };
    }
  } catch (error) {
    return {
      planId,
      status: 'error',
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Main migration function
 */
async function runMigration() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  MES Production Plans: executionGraph → nodes Migration');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Mode: ${dryRun ? '🧪 DRY-RUN (no changes will be made)' : '🚀 EXECUTE (will write to Firestore)'}`);
  console.log(`Target: ${singlePlanId ? `Single plan (${singlePlanId})` : 'All plans'}`);
  console.log('');
  
  const results = {
    totalPlans: 0,
    alreadyMigrated: 0,
    migrated: 0,
    wouldMigrate: 0,
    noExecutionGraph: 0,
    errors: [],
    details: []
  };
  
  try {
    let plansToProcess = [];
    
    if (singlePlanId) {
      // Single plan migration
      plansToProcess = [{ id: singlePlanId }];
    } else {
      // All plans migration
      const snapshot = await db.collection('mes-production-plans').get();
      plansToProcess = snapshot.docs.map(doc => ({ id: doc.id }));
    }
    
    results.totalPlans = plansToProcess.length;
    console.log(`📊 Found ${results.totalPlans} plan(s) to process\n`);
    
    // Process each plan
    for (const plan of plansToProcess) {
      const result = await migratePlan(plan.id, !dryRun);
      results.details.push(result);
      
      switch (result.status) {
        case 'already_migrated':
          results.alreadyMigrated++;
          console.log(`✓ ${result.planId}: Already migrated (${result.nodeCount} nodes)`);
          break;
        
        case 'migrated':
          results.migrated++;
          console.log(`✅ ${result.planId}: Migrated ${result.nodeCount} nodes from executionGraph`);
          break;
        
        case 'would_migrate':
          results.wouldMigrate++;
          console.log(`🔄 ${result.planId}: Would migrate ${result.nodeCount} nodes`);
          if (result.sampleNode) {
            console.log(`   Sample node: ${result.sampleNode.id} (nominalTime: ${result.sampleNode.nominalTime})`);
          }
          break;
        
        case 'no_execution_graph':
          results.noExecutionGraph++;
          console.log(`⚠️  ${result.planId}: No executionGraph to migrate`);
          break;
        
        case 'not_found':
          results.errors.push(result);
          console.log(`❌ ${result.planId}: Not found`);
          break;
        
        case 'error':
          results.errors.push(result);
          console.log(`❌ ${result.planId}: Error - ${result.error}`);
          break;
      }
    }
    
    // Print summary
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  Migration Summary');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Total plans processed:     ${results.totalPlans}`);
    console.log(`Already migrated:          ${results.alreadyMigrated}`);
    console.log(`${dryRun ? 'Would migrate' : 'Successfully migrated'}:        ${dryRun ? results.wouldMigrate : results.migrated}`);
    console.log(`No executionGraph:         ${results.noExecutionGraph}`);
    console.log(`Errors:                    ${results.errors.length}`);
    console.log('');
    
    if (results.errors.length > 0) {
      console.log('Errors:');
      results.errors.forEach(err => {
        console.log(`  - ${err.planId}: ${err.error}`);
      });
      console.log('');
    }
    
    if (dryRun && results.wouldMigrate > 0) {
      console.log('💡 To execute the migration, run:');
      console.log(`   node scripts/migrateExecutionGraphToNodes.cjs --execute${singlePlanId ? ` --planId=${singlePlanId}` : ''}`);
      console.log('');
    }
    
    if (!dryRun && results.migrated > 0) {
      console.log('✅ Migration completed successfully!');
      console.log('');
      console.log('ℹ️  Note: executionGraph fields have been kept for backward compatibility.');
      console.log('   They can be removed after 2 release cycles.');
      console.log('');
    }
    
  } catch (error) {
    console.error('');
    console.error('❌ Fatal error during migration:');
    console.error(error);
    process.exit(1);
  }
  
  // Exit
  process.exit(results.errors.length > 0 ? 1 : 0);
}

// Run migration
runMigration();
