#!/usr/bin/env node

/**
 * Migration script to add manualOverride field to existing quotes
 * Ensures all quotes have the manualOverride: null field for new manual pricing feature
 */

import jsondb from '../src/lib/jsondb.js'

async function migrateManualOverride() {
  const summary = {
    totalQuotes: 0,
    quotesUpdated: 0,
    quotesSkipped: 0,
    errors: []
  }

  try {
    console.log('🚀 Starting manual override migration...\n')
    
    const quotes = jsondb.listQuotes()
    summary.totalQuotes = quotes.length
    
    if (quotes.length === 0) {
      console.log('ℹ️  No quotes found. Migration completed.')
      return summary
    }

    console.log(`📋 Found ${quotes.length} quotes to process\n`)

    quotes.forEach((quote, index) => {
      try {
        // Check if quote already has manualOverride field
        if (quote.hasOwnProperty('manualOverride')) {
          summary.quotesSkipped += 1
          console.log(`⏭️  Quote ${quote.id} already has manualOverride field`)
          return
        }

        // Add manualOverride field with null value
        const patch = {
          manualOverride: null
        }

        // Update the quote
        jsondb.patchQuote(quote.id, patch)
        summary.quotesUpdated += 1
        
        console.log(`✅ Updated quote ${quote.id} (${index + 1}/${quotes.length})`)
        
      } catch (error) {
        const errorMsg = `Failed to update quote ${quote.id}: ${error.message}`
        summary.errors.push(errorMsg)
        console.error(`❌ ${errorMsg}`)
      }
    })

    console.log('\n📊 Migration Summary:')
    console.table({
      'Total Quotes': summary.totalQuotes,
      'Updated': summary.quotesUpdated,
      'Skipped (already migrated)': summary.quotesSkipped,
      'Errors': summary.errors.length
    })

    if (summary.errors.length > 0) {
      console.log('\n⚠️  Errors encountered:')
      summary.errors.forEach(error => console.log(`   ${error}`))
    }

    if (summary.quotesUpdated > 0) {
      console.log(`\n✅ Successfully migrated ${summary.quotesUpdated} quotes with manualOverride field`)
    }

    if (summary.errors.length === 0) {
      console.log('\n🎉 Manual override migration completed successfully!')
      process.exit(0)
    } else {
      console.log('\n⚠️  Migration completed with errors')
      process.exit(1)
    }

  } catch (error) {
    console.error('❌ Migration failed:', error)
    console.error('Stack trace:', error.stack)
    process.exit(1)
  }
}

// Helper function to validate migration
async function validateMigration() {
  console.log('\n🔍 Validating migration...')
  
  const quotes = jsondb.listQuotes()
  const withoutManualOverride = quotes.filter(quote => !quote.hasOwnProperty('manualOverride'))
  
  if (withoutManualOverride.length === 0) {
    console.log('✅ All quotes have manualOverride field')
    return true
  } else {
    console.log(`❌ ${withoutManualOverride.length} quotes missing manualOverride field:`)
    withoutManualOverride.forEach(quote => {
      console.log(`   - ${quote.id}`)
    })
    return false
  }
}

// Run migration
if (process.argv.includes('--validate')) {
  validateMigration()
} else {
  migrateManualOverride().then(() => {
    // Auto-validate after migration
    setTimeout(validateMigration, 1000)
  })
}