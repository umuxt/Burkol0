#!/usr/bin/env node

/**
 * Migration Script: Update Material Types
 * 
 * Changes:
 * - type: 'wip' → 'semi_finished'
 * - type: 'wip_produced' → 'semi_finished'
 * - type: 'final_product' → 'finished_product'
 * - category: 'WIP' → 'SEMI_FINISHED'
 * - Add productionHistory: [] for semi_finished and finished_product types
 * - Add consumedBy: [] if not present (for backward compatibility)
 * 
 * Usage:
 *   npm run migrate:material-types           # Run migration
 *   npm run migrate:material-types -- --dry  # Dry run (preview only)
 *   npm run migrate:material-types -- --validate  # Validate after migration
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
const isValidate = args.includes('--validate')

// Initialize Firebase Admin
async function bootstrapAdmin() {
  if (admin.apps.length) return admin.app()
  const raw = await readFile(serviceAccountPath, 'utf8')
  const serviceAccount = JSON.parse(raw)
  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  })
}

// Migration type mappings
const TYPE_MIGRATIONS = {
  'wip': 'semi_finished',
  'wip_produced': 'semi_finished',
  'final_product': 'finished_product'
}

const CATEGORY_MIGRATIONS = {
  'WIP': 'SEMI_FINISHED'
}

async function migrateMaterialTypes() {
  const summary = {
    totalMaterials: 0,
    migratedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    errors: [],
    migrationDetails: []
  }

  try {
    console.log('🚀 Starting material type migration...\n')
    
    if (isDryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made\n')
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
      
      // Determine if migration is needed
      const needsMigration = 
        TYPE_MIGRATIONS.hasOwnProperty(data.type) ||
        CATEGORY_MIGRATIONS.hasOwnProperty(data.category) ||
        (data.type === 'semi_finished' && !data.hasOwnProperty('productionHistory')) ||
        (data.type === 'finished_product' && !data.hasOwnProperty('productionHistory'))

      if (!needsMigration) {
        summary.skippedCount++
        continue
      }

      // Build update data
      const updateData = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        migratedAt: new Date().toISOString()
      }

      // Migrate type
      let typeChanged = false
      if (TYPE_MIGRATIONS.hasOwnProperty(data.type)) {
        const oldType = data.type
        const newType = TYPE_MIGRATIONS[data.type]
        updateData.type = newType
        typeChanged = true
        
        console.log(`✓ Migrating ${materialCode}: type '${oldType}' → '${newType}'`)
      }

      // Migrate category
      let categoryChanged = false
      if (CATEGORY_MIGRATIONS.hasOwnProperty(data.category)) {
        const oldCategory = data.category
        const newCategory = CATEGORY_MIGRATIONS[data.category]
        updateData.category = newCategory
        categoryChanged = true
        
        console.log(`  └─ category '${oldCategory}' → '${newCategory}'`)
      }

      // Add productionHistory if needed (for semi_finished and finished_product)
      const finalType = updateData.type || data.type
      if ((finalType === 'semi_finished' || finalType === 'finished_product') && 
          !data.hasOwnProperty('productionHistory')) {
        updateData.productionHistory = []
        console.log(`  └─ Added productionHistory: []`)
      }

      // Add consumedBy if needed (for semi_finished, backward compatibility)
      if (finalType === 'semi_finished' && !data.hasOwnProperty('consumedBy')) {
        updateData.consumedBy = []
        console.log(`  └─ Added consumedBy: []`)
      }

      // Store migration detail
      summary.migrationDetails.push({
        materialCode,
        oldType: data.type,
        newType: updateData.type || data.type,
        oldCategory: data.category,
        newCategory: updateData.category || data.category,
        fieldsAdded: Object.keys(updateData).filter(k => 
          !data.hasOwnProperty(k) && k !== 'updatedAt' && k !== 'migratedAt'
        )
      })

      if (!isDryRun) {
        // Add update to batch
        batch.update(doc.ref, updateData)
        operationsInBatch++
        summary.migratedCount++

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
        summary.migratedCount++ // Count for dry run
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
    console.log('📊 Migration Summary')
    console.log('='.repeat(60))
    console.table({
      'Total Materials': summary.totalMaterials,
      'Migrated': summary.migratedCount,
      'Skipped (no changes needed)': summary.skippedCount,
      'Errors': summary.errorCount
    })

    if (summary.migrationDetails.length > 0 && !isDryRun) {
      console.log('\n📝 Migration Details:')
      summary.migrationDetails.slice(0, 10).forEach(detail => {
        console.log(`  ${detail.materialCode}:`)
        if (detail.oldType !== detail.newType) {
          console.log(`    type: ${detail.oldType} → ${detail.newType}`)
        }
        if (detail.oldCategory !== detail.newCategory) {
          console.log(`    category: ${detail.oldCategory} → ${detail.newCategory}`)
        }
        if (detail.fieldsAdded.length > 0) {
          console.log(`    added: ${detail.fieldsAdded.join(', ')}`)
        }
      })
      
      if (summary.migrationDetails.length > 10) {
        console.log(`  ... and ${summary.migrationDetails.length - 10} more`)
      }
    }

    if (summary.errors.length > 0) {
      console.log('\n⚠️  Errors encountered:')
      summary.errors.forEach(error => console.log(`   ${error}`))
    }

    if (isDryRun) {
      console.log('\n🔍 DRY RUN COMPLETE - No changes were made')
      console.log('   To apply these changes, run: npm run migrate:material-types')
    } else if (summary.migratedCount > 0) {
      console.log(`\n✅ Successfully migrated ${summary.migratedCount} materials`)
      console.log('   Run validation: npm run migrate:material-types -- --validate')
    } else {
      console.log('\nℹ️  No materials needed migration')
    }

    return summary

  } catch (error) {
    console.error('\n❌ Migration failed:', error)
    console.error('Stack trace:', error.stack)
    throw error
  }
}

async function validateMigration() {
  console.log('\n🔍 Validating migration...\n')
  
  try {
    await bootstrapAdmin()
    const db = admin.firestore()
    
    const materialsRef = db.collection('materials')
    const snapshot = await materialsRef.get()
    
    if (snapshot.empty) {
      console.log('ℹ️  No materials found in database')
      return { valid: true, issues: [] }
    }

    const validation = {
      totalMaterials: snapshot.size,
      valid: true,
      issues: [],
      stats: {
        raw_material: 0,
        semi_finished: 0,
        finished_product: 0,
        scrap: 0,
        legacy_types: 0,
        missing_productionHistory: 0,
        missing_consumedBy: 0
      }
    }

    for (const doc of snapshot.docs) {
      const data = doc.data()
      const materialCode = data.code || doc.id
      
      // Count by type
      if (data.type) {
        validation.stats[data.type] = (validation.stats[data.type] || 0) + 1
      }

      // Check for legacy types
      if (data.type === 'wip' || data.type === 'wip_produced' || data.type === 'final_product') {
        validation.valid = false
        validation.issues.push(`${materialCode}: Still has legacy type '${data.type}'`)
        validation.stats.legacy_types++
      }

      // Check for legacy category
      if (data.category === 'WIP') {
        validation.valid = false
        validation.issues.push(`${materialCode}: Still has legacy category 'WIP'`)
      }

      // Check productionHistory for semi_finished and finished_product
      if ((data.type === 'semi_finished' || data.type === 'finished_product') && 
          !data.hasOwnProperty('productionHistory')) {
        validation.valid = false
        validation.issues.push(`${materialCode}: Missing productionHistory field`)
        validation.stats.missing_productionHistory++
      }

      // Check consumedBy for semi_finished
      if (data.type === 'semi_finished' && !data.hasOwnProperty('consumedBy')) {
        validation.issues.push(`${materialCode}: Missing consumedBy field (optional warning)`)
        validation.stats.missing_consumedBy++
      }
    }

    // Print validation results
    console.log('📊 Material Type Distribution:')
    console.table(validation.stats)

    if (validation.valid) {
      console.log('\n✅ Validation passed! All materials use new type system')
    } else {
      console.log('\n⚠️  Validation found issues:')
      validation.issues.slice(0, 20).forEach(issue => console.log(`   ${issue}`))
      if (validation.issues.length > 20) {
        console.log(`   ... and ${validation.issues.length - 20} more issues`)
      }
      console.log('\n   Run migration again: npm run migrate:material-types')
    }

    return validation

  } catch (error) {
    console.error('❌ Validation failed:', error)
    throw error
  }
}

// Main execution
async function main() {
  try {
    if (isValidate) {
      const validation = await validateMigration()
      process.exit(validation.valid ? 0 : 1)
    } else {
      const summary = await migrateMaterialTypes()
      
      if (summary.errorCount > 0) {
        process.exit(1)
      } else if (isDryRun) {
        process.exit(0)
      } else {
        // Auto-validate after successful migration
        console.log('\n' + '='.repeat(60))
        await validateMigration()
        process.exit(0)
      }
    }
  } catch (error) {
    console.error('❌ Script failed:', error.message)
    process.exit(1)
  }
}

// Run the script
main()
