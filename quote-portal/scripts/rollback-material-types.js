#!/usr/bin/env node

/**
 * Rollback Script: Revert Material Type Migration
 * 
 * Reverts changes made by migrate-material-types.js:
 * - type: 'semi_finished' → 'wip' (for materials migrated from wip/wip_produced)
 * - type: 'finished_product' → 'final_product' (for materials migrated from final_product)
 * - category: 'SEMI_FINISHED' → 'WIP'
 * - Removes productionHistory field (added during migration)
 * - Removes consumedBy field (added during migration)
 * 
 * ⚠️  WARNING: This script should only be used if migration needs to be rolled back.
 *     It will revert materials to their legacy types based on migration timestamp.
 * 
 * Usage:
 *   npm run rollback:material-types           # Run rollback
 *   npm run rollback:material-types -- --dry  # Dry run (preview only)
 *   npm run rollback:material-types -- --all  # Rollback ALL semi_finished/finished_product (not just migrated)
 */

import admin from 'firebase-admin'
import { readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.join(__dirname, '..')
const serviceAccountPath = path.join(projectRoot, 'config/serviceAccountKey.json')

// Check for CLI flags
const args = process.argv.slice(2)
const isDryRun = args.includes('--dry') || args.includes('--dry-run')
const rollbackAll = args.includes('--all')

// Initialize Firebase Admin
async function bootstrapAdmin() {
  if (admin.apps.length) return admin.app()
  const raw = await readFile(serviceAccountPath, 'utf8')
  const serviceAccount = JSON.parse(raw)
  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  })
}

// Rollback type mappings (reverse of migration)
const TYPE_ROLLBACKS = {
  'semi_finished': 'wip',
  'finished_product': 'final_product'
}

const CATEGORY_ROLLBACKS = {
  'SEMI_FINISHED': 'WIP'
}

async function rollbackMaterialTypes() {
  const summary = {
    totalMaterials: 0,
    rolledBackCount: 0,
    skippedCount: 0,
    errorCount: 0,
    errors: [],
    rollbackDetails: []
  }

  try {
    console.log('⏪ Starting material type rollback...\n')
    
    if (isDryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made\n')
    }

    if (rollbackAll) {
      console.log('⚠️  ROLLBACK ALL MODE - All semi_finished/finished_product materials will be reverted\n')
      console.log('   Waiting 5 seconds... Press Ctrl+C to cancel\n')
      await new Promise(resolve => setTimeout(resolve, 5000))
    }

    // Initialize Firebase
    await bootstrapAdmin()
    const db = admin.firestore()
    
    const materialsRef = db.collection('materials')
    const snapshot = await materialsRef.get()
    
    if (snapshot.empty) {
      console.log('ℹ️  No materials found in database')
      return summary
    }
    
    summary.totalMaterials = snapshot.size
    console.log(`📋 Found ${snapshot.size} materials to process\n`)

    // Process in batches (Firestore limit is 500 operations per batch)
    const BATCH_SIZE = 450
    let batch = db.batch()
    let batchCount = 0
    let operationsInBatch = 0

    for (const doc of snapshot.docs) {
      const data = doc.data()
      const materialCode = data.code || doc.id
      
      // Determine if rollback is needed
      const wasMigrated = data.hasOwnProperty('migratedAt')
      const needsRollback = rollbackAll 
        ? (TYPE_ROLLBACKS.hasOwnProperty(data.type) || CATEGORY_ROLLBACKS.hasOwnProperty(data.category))
        : (wasMigrated && (TYPE_ROLLBACKS.hasOwnProperty(data.type) || CATEGORY_ROLLBACKS.hasOwnProperty(data.category)))

      if (!needsRollback) {
        summary.skippedCount++
        continue
      }

      // Build update data
      const updateData = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }

      // Remove migration timestamp
      if (wasMigrated) {
        updateData.migratedAt = admin.firestore.FieldValue.delete()
      }

      // Rollback type
      if (TYPE_ROLLBACKS.hasOwnProperty(data.type)) {
        const currentType = data.type
        const oldType = TYPE_ROLLBACKS[data.type]
        updateData.type = oldType
        
        console.log(`⏪ Rolling back ${materialCode}: type '${currentType}' → '${oldType}'`)
      }

      // Rollback category
      if (CATEGORY_ROLLBACKS.hasOwnProperty(data.category)) {
        const currentCategory = data.category
        const oldCategory = CATEGORY_ROLLBACKS[data.category]
        updateData.category = oldCategory
        
        console.log(`  └─ category '${currentCategory}' → '${oldCategory}'`)
      }

      // Remove productionHistory if it was added during migration
      if (data.hasOwnProperty('productionHistory') && Array.isArray(data.productionHistory) && data.productionHistory.length === 0) {
        updateData.productionHistory = admin.firestore.FieldValue.delete()
        console.log(`  └─ Removed empty productionHistory field`)
      }

      // Remove consumedBy if it was added during migration
      if (data.hasOwnProperty('consumedBy') && Array.isArray(data.consumedBy) && data.consumedBy.length === 0) {
        updateData.consumedBy = admin.firestore.FieldValue.delete()
        console.log(`  └─ Removed empty consumedBy field`)
      }

      // Store rollback detail
      summary.rollbackDetails.push({
        materialCode,
        currentType: data.type,
        rolledBackType: updateData.type || data.type,
        currentCategory: data.category,
        rolledBackCategory: updateData.category || data.category,
        fieldsRemoved: Object.keys(updateData).filter(k => 
          updateData[k] === admin.firestore.FieldValue.delete()
        ),
        wasMigrated
      })

      if (!isDryRun) {
        // Add update to batch
        batch.update(doc.ref, updateData)
        operationsInBatch++
        summary.rolledBackCount++

        // Commit batch if we've hit the limit
        if (operationsInBatch >= BATCH_SIZE) {
          await batch.commit()
          batchCount++
          console.log(`\n📦 Committed batch ${batchCount} (${operationsInBatch} operations)\n`)
          
          // Start new batch
          batch = db.batch()
          operationsInBatch = 0
        }
      } else {
        summary.rolledBackCount++ // Count for dry run
      }
    }

    // Commit any remaining operations
    if (!isDryRun && operationsInBatch > 0) {
      await batch.commit()
      batchCount++
      console.log(`\n📦 Committed final batch ${batchCount} (${operationsInBatch} operations)\n`)
    }

    // Print summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 Rollback Summary')
    console.log('='.repeat(60))
    console.table({
      'Total Materials': summary.totalMaterials,
      'Rolled Back': summary.rolledBackCount,
      'Skipped': summary.skippedCount,
      'Errors': summary.errorCount
    })

    if (summary.rollbackDetails.length > 0) {
      console.log('\n📝 Rollback Details:')
      summary.rollbackDetails.slice(0, 10).forEach(detail => {
        console.log(`  ${detail.materialCode}:`)
        if (detail.currentType !== detail.rolledBackType) {
          console.log(`    type: ${detail.currentType} → ${detail.rolledBackType}`)
        }
        if (detail.currentCategory !== detail.rolledBackCategory) {
          console.log(`    category: ${detail.currentCategory} → ${detail.rolledBackCategory}`)
        }
        if (detail.fieldsRemoved.length > 0) {
          console.log(`    removed: ${detail.fieldsRemoved.join(', ')}`)
        }
        console.log(`    was migrated: ${detail.wasMigrated ? 'Yes' : 'No (manual rollback)'}`)
      })
      
      if (summary.rollbackDetails.length > 10) {
        console.log(`  ... and ${summary.rollbackDetails.length - 10} more`)
      }
    }

    if (summary.errors.length > 0) {
      console.log('\n⚠️  Errors encountered:')
      summary.errors.forEach(error => console.log(`   ${error}`))
    }

    if (isDryRun) {
      console.log('\n🔍 DRY RUN COMPLETE - No changes were made')
      console.log('   To apply rollback, run: npm run rollback:material-types')
    } else if (summary.rolledBackCount > 0) {
      console.log(`\n✅ Successfully rolled back ${summary.rolledBackCount} materials`)
    } else {
      console.log('\nℹ️  No materials needed rollback')
    }

    return summary

  } catch (error) {
    console.error('\n❌ Rollback failed:', error)
    console.error('Stack trace:', error.stack)
    throw error
  }
}

// Main execution
async function main() {
  try {
    const summary = await rollbackMaterialTypes()
    
    if (summary.errorCount > 0) {
      process.exit(1)
    } else {
      process.exit(0)
    }
  } catch (error) {
    console.error('❌ Script failed:', error.message)
    process.exit(1)
  }
}

// Run the script
main()
