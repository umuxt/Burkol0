#!/usr/bin/env node

/**
 * RESET MES DATA SCRIPT
 * ======================
 * 
 * This script deletes all documents from MES-related Firestore collections
 * to provide a clean slate for testing and QA purposes.
 * 
 * WARNING: THIS IS A DESTRUCTIVE OPERATION!
 * All MES data will be permanently deleted and cannot be recovered.
 * 
 * USAGE:
 * ------
 * To prevent accidental deletion, this script requires an environment flag:
 * 
 *   RESET_MES=1 node quote-portal/scripts/reset-mes-data.js
 * 
 * COLLECTIONS PURGED:
 * -------------------
 * - mes-production-plans
 * - mes-worker-assignments
 * - mes-approved-quotes
 * - mes-workers
 * - mes-stations
 * - mes-substations
 * - mes-operations
 * - mes-alerts
 * - mes-work-orders
 * - mes-settings
 * - mes-counters
 * - mes-templates
 * - mes-orders
 */

import admin from 'firebase-admin';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const serviceAccountPath = path.join(projectRoot, 'config/serviceAccountKey.json');

// MES collections to purge
const MES_COLLECTIONS = [
  'mes-production-plans',
  'mes-worker-assignments',
  'mes-approved-quotes',
  'mes-workers',
  'mes-stations',
  'mes-substations',
  'mes-operations',
  'mes-alerts',
  'mes-work-orders',
  'mes-settings',
  'mes-counters',
  'mes-templates',
  'mes-orders'
];

/**
 * Initialize Firebase Admin SDK
 */
async function bootstrapAdmin() {
  if (admin.apps.length) return admin.app();
  
  try {
    const raw = await readFile(serviceAccountPath, 'utf8');
    const serviceAccount = JSON.parse(raw);
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin SDK');
    console.error('   Make sure serviceAccountKey.json exists in config/ directory');
    throw error;
  }
}

/**
 * Delete all documents from a collection in batches
 * @param {admin.firestore.CollectionReference} collectionRef - Firestore collection reference
 * @param {number} batchSize - Number of documents to delete per batch
 * @returns {Promise<number>} Total number of documents deleted
 */
async function deleteCollection(collectionRef, batchSize = 100) {
  let totalDeleted = 0;
  let hasMore = true;

  while (hasMore) {
    const snapshot = await collectionRef.limit(batchSize).get();
    
    if (snapshot.empty) {
      hasMore = false;
      continue;
    }

    const batch = collectionRef.firestore.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    
    await batch.commit();
    totalDeleted += snapshot.size;
    
    // Show progress for large collections
    if (totalDeleted % 500 === 0) {
      process.stdout.write('.');
    }
  }

  return totalDeleted;
}

/**
 * Main execution function
 */
async function main() {
  // Safety check: require RESET_MES=1 environment variable
  if (process.env.RESET_MES !== '1') {
    console.error('❌ SAFETY CHECK FAILED');
    console.error('');
    console.error('   This script will DELETE ALL MES DATA from Firestore.');
    console.error('   To confirm you want to proceed, run:');
    console.error('');
    console.error('   RESET_MES=1 node quote-portal/scripts/reset-mes-data.js');
    console.error('');
    process.exit(1);
  }

  console.log('🔥 MES DATA RESET SCRIPT');
  console.log('========================\n');

  try {
    // Initialize Firebase
    await bootstrapAdmin();
    const db = admin.firestore();
    
    console.log('✅ Connected to Firestore\n');
    console.log('⚠️  WARNING: This will delete all data from MES collections!');
    console.log('   Collections to purge:', MES_COLLECTIONS.length);
    console.log('');
    
    // Wait 3 seconds to allow user to cancel
    console.log('   Starting in 3 seconds... (Press Ctrl+C to cancel)');
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('');

    let totalCollections = 0;
    let totalDocuments = 0;

    // Delete each collection
    for (const collectionName of MES_COLLECTIONS) {
      process.stdout.write(`📦 ${collectionName.padEnd(30)} `);
      
      try {
        const collectionRef = db.collection(collectionName);
        const deletedCount = await deleteCollection(collectionRef);
        
        if (deletedCount > 0) {
          console.log(` ✅ Deleted ${deletedCount} documents`);
          totalCollections++;
          totalDocuments += deletedCount;
        } else {
          console.log(` ⚪ Already empty`);
        }
      } catch (error) {
        console.log(` ❌ Error: ${error.message}`);
      }
    }

    console.log('');
    console.log('═'.repeat(60));
    console.log('✅ MES DATA RESET COMPLETE');
    console.log('═'.repeat(60));
    console.log(`   Collections processed: ${MES_COLLECTIONS.length}`);
    console.log(`   Collections purged:    ${totalCollections}`);
    console.log(`   Total documents:       ${totalDocuments}`);
    console.log('');
    console.log('🎯 MES is now ready for fresh testing!');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ RESET FAILED');
    console.error('═'.repeat(60));
    console.error('Error:', error.message);
    console.error('');
    if (error.stack) {
      console.error('Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
