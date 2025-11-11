#!/usr/bin/env node

/**
 * Migration Script: Update Assignment IDs to Work Order Based Format
 * 
 * This script migrates existing work packages (assignments) from the old ID format:
 * `planId-nodeId-timestamp-random` 
 * 
 * To the new work order based format:
 * `WO-001-01`, `WO-001-02`, etc.
 * 
 * Usage: node migrate-assignment-ids.js [--dry-run] [--backup]
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
let app;
try {
  // Try to load service account key
  const serviceAccountPath = path.join(__dirname, 'config', 'serviceAccountKey.json');
  let credential = undefined;
  
  if (fs.existsSync(serviceAccountPath)) {
    const { cert } = await import('firebase-admin/app');
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    credential = cert(serviceAccount);
    console.log('✅ Using service account key');
  } else {
    console.log('⚠️  No service account key found, using default credentials');
  }
  
  app = initializeApp({
    credential,
    projectId: process.env.FIREBASE_PROJECT_ID || 'burkol-metal-quote'
  });
  console.log('✅ Firebase Admin initialized');
} catch (error) {
  console.error('❌ Failed to initialize Firebase:', error.message);
  process.exit(1);
}

const db = getFirestore();

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const shouldBackup = args.includes('--backup');

console.log('🚀 Assignment ID Migration Script');
console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE MIGRATION'}`);
console.log(`Backup: ${shouldBackup ? 'YES' : 'NO'}`);
console.log('');

// Generate new work package ID based on work order code
async function generateWorkPackageId(workOrderCode, db, existingCounters = new Map()) {
  if (!workOrderCode) {
    throw new Error('workOrderCode is required for generating work package ID');
  }
  
  const counterKey = `workpackage-${workOrderCode}`;
  let counter = existingCounters.get(counterKey) || 0;
  counter++;
  existingCounters.set(counterKey, counter);
  
  return `${workOrderCode}-${String(counter).padStart(2, '0')}`;
}

async function migrateAssignmentIds() {
  console.log('📋 Fetching existing assignments...');
  
  // Fetch all assignments
  const assignmentsSnapshot = await db.collection('mes-worker-assignments').get();
  const assignments = assignmentsSnapshot.docs.map(doc => ({
    id: doc.id,
    ref: doc.ref,
    ...doc.data()
  }));
  
  console.log(`Found ${assignments.length} assignments to process`);
  
  if (assignments.length === 0) {
    console.log('No assignments found. Exiting.');
    return;
  }
  
  // Create backup if requested
  if (shouldBackup) {
    const backupData = {
      timestamp: new Date().toISOString(),
      assignments: assignments.map(a => ({ id: a.id, ...a }))
    };
    
    const backupPath = path.join(__dirname, `assignment-backup-${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
    console.log(`✅ Backup created: ${backupPath}`);
  }
  
  // Get unique plan IDs to fetch plan data
  const planIds = [...new Set(assignments.map(a => a.planId).filter(Boolean))];
  console.log(`Fetching ${planIds.length} production plans...`);
  
  // Fetch plan data to get work order codes
  const plansMap = new Map();
  for (const planId of planIds) {
    try {
      const planDoc = await db.collection('mes-production-plans').doc(planId).get();
      if (planDoc.exists) {
        const planData = planDoc.data();
        plansMap.set(planId, planData);
      }
    } catch (error) {
      console.warn(`Failed to fetch plan ${planId}:`, error.message);
    }
  }
  
  console.log(`Loaded ${plansMap.size} plans`);
  
  // Group assignments by work order code
  const assignmentGroups = new Map();
  const counters = new Map();
  
  for (const assignment of assignments) {
    const plan = plansMap.get(assignment.planId);
    const workOrderCode = plan?.orderCode || assignment.workOrderCode || assignment.planId || 'UNKNOWN';
    
    if (!assignmentGroups.has(workOrderCode)) {
      assignmentGroups.set(workOrderCode, []);
    }
    assignmentGroups.get(workOrderCode).push(assignment);
  }
  
  console.log(`Grouped assignments into ${assignmentGroups.size} work orders:`);
  for (const [workOrderCode, assignments] of assignmentGroups) {
    console.log(`  ${workOrderCode}: ${assignments.length} assignments`);
  }
  
  // Process migrations
  const migrations = [];
  let totalMigrations = 0;
  
  for (const [workOrderCode, workOrderAssignments] of assignmentGroups) {
    console.log(`\n📝 Processing work order: ${workOrderCode}`);
    
    for (const assignment of workOrderAssignments) {
      const oldId = assignment.id;
      
      // Skip if already in new format
      if (oldId.startsWith(workOrderCode + '-') && /\d{2}$/.test(oldId)) {
        console.log(`  ⏭️  Skipping ${oldId} (already in new format)`);
        continue;
      }
      
      const newId = await generateWorkPackageId(workOrderCode, db, counters);
      
      migrations.push({
        oldId,
        newId,
        workOrderCode,
        assignment,
        ref: assignment.ref
      });
      
      console.log(`  🔄 ${oldId} → ${newId}`);
      totalMigrations++;
    }
  }
  
  console.log(`\n📊 Migration Summary:`);
  console.log(`Total assignments: ${assignments.length}`);
  console.log(`Assignments to migrate: ${totalMigrations}`);
  console.log(`Work orders affected: ${assignmentGroups.size}`);
  
  if (isDryRun) {
    console.log('\n🏃 DRY RUN - No changes will be made');
    console.log('\nMigration plan:');
    for (const migration of migrations) {
      console.log(`  ${migration.oldId} → ${migration.newId}`);
    }
    return;
  }
  
  if (totalMigrations === 0) {
    console.log('\n✅ No migrations needed - all assignments already in correct format');
    return;
  }
  
  // Confirm before proceeding
  console.log(`\n⚠️  About to migrate ${totalMigrations} assignments`);
  console.log('This will:');
  console.log('1. Create new documents with new IDs');
  console.log('2. Delete old documents');
  console.log('3. Update counter documents');
  
  // In a real environment, you might want to prompt for confirmation
  // For now, we'll proceed automatically
  
  console.log('\n🔧 Starting migration...');
  
  // Batch the migrations to avoid transaction limits
  const BATCH_SIZE = 450; // Keep under Firestore's 500 operation limit
  const migrationBatches = [];
  for (let i = 0; i < migrations.length; i += BATCH_SIZE) {
    migrationBatches.push(migrations.slice(i, i + BATCH_SIZE));
  }
  
  let processedCount = 0;
  
  for (let batchIndex = 0; batchIndex < migrationBatches.length; batchIndex++) {
    const batch = migrationBatches[batchIndex];
    console.log(`\nProcessing batch ${batchIndex + 1}/${migrationBatches.length} (${batch.length} items)...`);
    
    const firestoreBatch = db.batch();
    
    // Add operations for this batch
    for (const migration of batch) {
      const { oldId, newId, assignment, ref } = migration;
      
      // Create new document
      const newRef = db.collection('mes-worker-assignments').doc(newId);
      const newData = { ...assignment };
      newData.id = newId;
      delete newData.ref; // Remove ref property if it exists
      firestoreBatch.set(newRef, newData);
      
      // Delete old document
      firestoreBatch.delete(ref);
    }
    
    try {
      await firestoreBatch.commit();
      processedCount += batch.length;
      console.log(`✅ Batch ${batchIndex + 1} completed (${processedCount}/${totalMigrations})`);
    } catch (error) {
      console.error(`❌ Batch ${batchIndex + 1} failed:`, error.message);
      throw error;
    }
  }
  
  // Update counters
  console.log('\n🔢 Updating counters...');
  const counterBatch = db.batch();
  
  for (const [counterKey, count] of counters) {
    const counterRef = db.collection('mes-counters').doc(counterKey);
    counterBatch.set(counterRef, { 
      next: count + 1, 
      updatedAt: new Date(),
      migratedAt: new Date()
    }, { merge: true });
  }
  
  await counterBatch.commit();
  console.log(`✅ Updated ${counters.size} counters`);
  
  console.log(`\n🎉 Migration completed successfully!`);
  console.log(`Migrated ${totalMigrations} assignments`);
  console.log(`Updated ${counters.size} counters`);
}

// Main execution
async function main() {
  try {
    await migrateAssignmentIds();
    console.log('\n✅ Migration script completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

main();