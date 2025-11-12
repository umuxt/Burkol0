#!/usr/bin/env node

/**
 * Migration utility to check existing plan codes and update to new format
 * Old format: prod-plan-YYYY-xxxxx
 * New format: PPL-MMYY-XXX
 */

import admin from 'firebase-admin';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

// Initialize Firebase Admin
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceAccountPath = path.join(__dirname, '../config/serviceAccountKey.json');

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing Firebase Admin:', error.message);
    process.exit(1);
  }
}

const db = admin.firestore();

async function checkExistingPlanCodes() {
  try {
    console.log('🔍 Checking existing plan codes...\n');
    
    // Check production plans collection
    const plansSnapshot = await db.collection('mes-production-plans').get();
    const oldFormatPlans = [];
    const newFormatPlans = [];
    
    plansSnapshot.forEach(doc => {
      const planId = doc.id;
      
      if (planId.startsWith('prod-plan-')) {
        oldFormatPlans.push({
          id: planId,
          data: doc.data()
        });
      } else if (planId.match(/^PPL-\d{4}-\d{3}$/)) {
        newFormatPlans.push({
          id: planId,
          data: doc.data()
        });
      }
    });
    
    console.log(`📊 Plan Code Analysis:`);
    console.log(`   Old format (prod-plan-YYYY-xxxxx): ${oldFormatPlans.length} plans`);
    console.log(`   New format (PPL-MMYY-XXX): ${newFormatPlans.length} plans`);
    
    if (oldFormatPlans.length > 0) {
      console.log('\n📝 Old format plans found:');
      oldFormatPlans.slice(0, 5).forEach(plan => {
        console.log(`   - ${plan.id} (status: ${plan.data.status || 'unknown'})`);
      });
      
      if (oldFormatPlans.length > 5) {
        console.log(`   ... and ${oldFormatPlans.length - 5} more`);
      }
    }
    
    if (newFormatPlans.length > 0) {
      console.log('\n✨ New format plans found:');
      newFormatPlans.slice(0, 5).forEach(plan => {
        console.log(`   - ${plan.id} (status: ${plan.data.status || 'unknown'})`);
      });
    }
    
    // Check counters collection
    console.log('\n🔢 Checking plan counters...');
    const countersSnapshot = await db.collection('mes-counters').get();
    const oldCounters = [];
    const newCounters = [];
    
    countersSnapshot.forEach(doc => {
      const counterId = doc.id;
      
      if (counterId.startsWith('prod-plan-')) {
        oldCounters.push({
          id: counterId,
          data: doc.data()
        });
      } else if (counterId.startsWith('plan-')) {
        newCounters.push({
          id: counterId,
          data: doc.data()
        });
      }
    });
    
    console.log(`   Old format counters: ${oldCounters.length}`);
    console.log(`   New format counters: ${newCounters.length}`);
    
    if (oldCounters.length > 0) {
      console.log('\n   Old counters:');
      oldCounters.forEach(counter => {
        console.log(`   - ${counter.id}: next = ${counter.data.next || 'unknown'}`);
      });
    }
    
    return {
      oldFormatPlans,
      newFormatPlans,
      oldCounters,
      newCounters
    };
    
  } catch (error) {
    console.error('❌ Error checking plan codes:', error);
    throw error;
  }
}

function convertDateToNewFormat(oldId) {
  // Extract date from old format: prod-plan-2025-00016
  const match = oldId.match(/^prod-plan-(\d{4})-(\d{5})$/);
  if (!match) return null;
  
  const year = match[1];
  const sequence = parseInt(match[2], 10);
  
  // For migration, we'll use current month/year for new format
  // This is a limitation since old format doesn't contain month info
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const yearSuffix = year.slice(-2);
  
  return `PPL-${month}${yearSuffix}-${String(sequence).padStart(3, '0')}`;
}

async function suggestMigrationStrategy() {
  const analysis = await checkExistingPlanCodes();
  
  console.log('\n🔧 Migration Strategy Suggestions:');
  
  if (analysis.oldFormatPlans.length === 0) {
    console.log('✅ No old format plans found. New format can be implemented directly.');
    return;
  }
  
  console.log(`\n⚠️  Found ${analysis.oldFormatPlans.length} plans in old format.`);
  console.log('\nRecommended migration approaches:');
  
  console.log('\n1️⃣  Dual Format Support (Recommended):');
  console.log('   - Keep existing old format plans as-is');
  console.log('   - Use new format for new plans only');
  console.log('   - Update UI to handle both formats');
  
  console.log('\n2️⃣  Full Migration:');
  console.log('   - Create new documents with new IDs');
  console.log('   - Update all references to plan IDs');
  console.log('   - Migration script required');
  
  console.log('\n3️⃣  Display-Only Migration:');
  console.log('   - Keep old IDs in database');
  console.log('   - Show new format in UI only');
  console.log('   - Map display codes to actual IDs');
  
  console.log('\n📋 Example conversions:');
  analysis.oldFormatPlans.slice(0, 3).forEach(plan => {
    const suggested = convertDateToNewFormat(plan.id);
    console.log(`   ${plan.id} → ${suggested || 'conversion needed'}`);
  });
}

// Run the check
if (import.meta.url === `file://${process.argv[1]}`) {
  suggestMigrationStrategy()
    .then(() => {
      console.log('\n✅ Analysis complete');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Analysis failed:', error);
      process.exit(1);
    });
}

export {
  checkExistingPlanCodes,
  convertDateToNewFormat,
  suggestMigrationStrategy
};