/**
 * Script: Validate Existing Plans (Dry-Run)
 * 
 * Validates all existing production plans against canonical schema.
 * This is a dry-run script - it doesn't modify any data.
 * 
 * Run: node scripts/validateExistingPlans.cjs
 */

// Initialize Firebase Admin
const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase if not already initialized
if (!admin.apps.length) {
  const serviceAccount = require('../config/serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

/**
 * Simple validation function (mimics backend validation)
 * Note: This should ideally import the actual validation from mesRoutes,
 * but for now we'll do basic checks
 */
function validateProductionPlanNodes(nodes) {
  const errors = [];
  
  if (!Array.isArray(nodes)) {
    errors.push('nodes must be an array');
    return { valid: false, errors };
  }
  
  if (nodes.length === 0) {
    errors.push('nodes array cannot be empty');
    return { valid: false, errors };
  }
  
  const nodeIds = new Set();
  
  nodes.forEach((node, index) => {
    const nodeNum = index + 1;
    
    // Check required fields
    if (!node.id || typeof node.id !== 'string') {
      errors.push(`Node ${nodeNum}: missing or invalid 'id' field`);
    } else if (nodeIds.has(node.id)) {
      errors.push(`Node ${nodeNum}: duplicate id "${node.id}"`);
    } else {
      nodeIds.add(node.id);
    }
    
    if (!node.name || typeof node.name !== 'string') {
      errors.push(`Node ${nodeNum} (${node.id || 'unknown'}): missing or invalid 'name' field`);
    }
    
    // Check nominalTime (or time as fallback)
    const nominalTime = node.nominalTime || node.time;
    if (!Number.isFinite(nominalTime) || nominalTime <= 0) {
      errors.push(`Node ${nodeNum} (${node.id || 'unknown'}): nominalTime must be a number > 0`);
    }
    
    // Check requiredSkills (or skills as fallback)
    const skills = node.requiredSkills || node.skills;
    if (skills !== undefined && !Array.isArray(skills)) {
      errors.push(`Node ${nodeNum} (${node.id || 'unknown'}): requiredSkills must be an array`);
    }
    
    // Check predecessors
    if (node.predecessors !== undefined && !Array.isArray(node.predecessors)) {
      errors.push(`Node ${nodeNum} (${node.id || 'unknown'}): predecessors must be an array`);
    }
    
    // Check predecessor references
    if (Array.isArray(node.predecessors)) {
      node.predecessors.forEach(predId => {
        if (!nodes.find(n => n.id === predId)) {
          errors.push(`Node ${nodeNum} (${node.id || 'unknown'}): predecessor "${predId}" not found in plan`);
        }
      });
    }
    
    // Check assignedStations
    if (node.assignedStations !== undefined && !Array.isArray(node.assignedStations)) {
      errors.push(`Node ${nodeNum} (${node.id || 'unknown'}): assignedStations must be an array`);
    }
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
}

async function validateExistingPlans() {
  console.log('🔍 Validating existing production plans (dry-run)...\n');
  
  const plansSnapshot = await db.collection('mes-production-plans').get();
  
  const results = {
    total: 0,
    valid: 0,
    invalid: 0,
    noNodes: 0,
    invalidDetails: []
  };
  
  for (const doc of plansSnapshot.docs) {
    results.total++;
    const data = doc.data();
    
    // Prefer nodes, fallback to steps (legacy)
    let nodes = data.nodes;
    if (!nodes || nodes.length === 0) {
      nodes = data.steps; // Legacy field
    }
    
    if (!nodes || nodes.length === 0) {
      console.warn(`⚠️  Plan ${doc.id}: No nodes or steps found (empty plan)`);
      results.noNodes++;
      continue;
    }
    
    const validation = validateProductionPlanNodes(nodes);
    
    if (validation.valid) {
      results.valid++;
      console.log(`✅ Plan ${doc.id}: Valid (${nodes.length} nodes)`);
    } else {
      results.invalid++;
      console.error(`❌ Plan ${doc.id}: Invalid`);
      validation.errors.forEach(err => {
        console.error(`   - ${err}`);
      });
      results.invalidDetails.push({
        planId: doc.id,
        planName: data.name || 'Unnamed',
        errors: validation.errors
      });
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Validation Summary');
  console.log('='.repeat(60));
  console.log(`Total plans scanned:     ${results.total}`);
  console.log(`✅ Valid plans:          ${results.valid}`);
  console.log(`❌ Invalid plans:        ${results.invalid}`);
  console.log(`⚠️  Plans with no nodes: ${results.noNodes}`);
  console.log('='.repeat(60));
  
  if (results.invalid > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('Invalid Plans Details');
    console.log('='.repeat(60));
    results.invalidDetails.forEach(p => {
      console.log(`\n📋 Plan: ${p.planId} (${p.planName})`);
      p.errors.forEach(e => console.log(`   - ${e}`));
    });
    console.log('='.repeat(60));
    console.log('\n⚠️  Action required: Fix these plans before enabling strict validation');
  } else {
    console.log('\n✅ All plans are valid! Safe to enable strict validation.');
  }
  
  return results;
}

// Run validation
validateExistingPlans()
  .then(() => {
    console.log('\n✅ Validation check completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Validation check failed:', error);
    process.exit(1);
  });
