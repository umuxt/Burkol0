/**
 * Migration Script: mes-outputCodes → mes-outputCodes-index
 * 
 * Migrates existing output codes from nested structure to queryable index collection
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
const serviceAccount = require(path.join(__dirname, '../config/serviceAccountKey.json'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// Helper: Decode signature to extract materials and ratios
function decodeSignatureForIndex(signature) {
  const result = {
    operationId: null,
    operationCode: null,
    stationId: null,
    materials: [],
    outputRatio: null,
    outputUnit: null
  };
  
  try {
    // Signature format: "op:{id}|code:{code}|st:{stationId}|mats:{materialCode}:{ratio}{unit},...|out:{ratio}{unit}"
    const parts = signature.split('|');
    
    for (const part of parts) {
      if (part.startsWith('op:')) {
        result.operationId = part.substring(3);
      } else if (part.startsWith('code:')) {
        result.operationCode = part.substring(5);
      } else if (part.startsWith('st:')) {
        result.stationId = part.substring(3);
      } else if (part.startsWith('mats:')) {
        const matsStr = part.substring(5);
        const matParts = matsStr.split(',');
        
        for (const matPart of matParts) {
          // Format: "M-001:1.000kg"
          const match = matPart.match(/^([^:]+):([0-9.]+)([a-zA-Z]+)$/);
          if (match) {
            result.materials.push({
              materialCode: match[1],
              ratio: parseFloat(match[2]),
              unit: match[3]
            });
          }
        }
      } else if (part.startsWith('out:')) {
        const outStr = part.substring(4);
        // Format: "2.000adet"
        const match = outStr.match(/^([0-9.]+)([a-zA-Z]+)$/);
        if (match) {
          result.outputRatio = parseFloat(match[1]);
          result.outputUnit = match[2];
        }
      }
    }
  } catch (error) {
    console.error('Error decoding signature:', signature, error);
  }
  
  return result;
}

async function migrateOutputCodesToIndex() {
  console.log('🔄 Starting migration: mes-outputCodes → mes-outputCodes-index\n');
  
  try {
    // 1. Read all existing output codes
    const codesSnapshot = await db.collection('mes-outputCodes').get();
    
    if (codesSnapshot.empty) {
      console.log('⚠️  No output codes found in mes-outputCodes collection');
      return;
    }
    
    console.log(`📦 Found ${codesSnapshot.size} prefix documents\n`);
    
    let totalCodes = 0;
    let migratedCodes = 0;
    let skippedCodes = 0;
    const errors = [];
    
    // 2. Process each prefix document
    for (const doc of codesSnapshot.docs) {
      const prefix = doc.id;
      const data = doc.data();
      const codes = data.codes || {};
      
      const codeCount = Object.keys(codes).length;
      totalCodes += codeCount;
      
      console.log(`\n📁 Processing prefix: ${prefix} (${codeCount} codes)`);
      
      // 3. Migrate each code to index collection
      for (const [signature, codeData] of Object.entries(codes)) {
        try {
          // Check if already exists in index
          const existingSnapshot = await db.collection('mes-outputCodes-index')
            .where('code', '==', codeData.code)
            .limit(1)
            .get();
          
          if (!existingSnapshot.empty) {
            console.log(`   ⏭️  Skipped ${codeData.code} (already exists)`);
            skippedCodes++;
            continue;
          }
          
          // Decode signature
          const decoded = decodeSignatureForIndex(signature);
          
          // Extract counter from code (e.g., "Cu-001" → 1)
          const counterMatch = codeData.code.match(/-(\d+)$/);
          const counter = counterMatch ? parseInt(counterMatch[1], 10) : 0;
          
          // Create index document
          const indexDoc = {
            code: codeData.code,
            signature: signature,
            prefix: prefix,
            counter: counter,
            
            // Queryable fields
            operationId: decoded.operationId || codeData.operationId || null,
            operationCode: decoded.operationCode || null,
            stationId: decoded.stationId || codeData.stationId || null,
            
            // Template metadata
            materials: decoded.materials,
            outputRatio: decoded.outputRatio,
            outputUnit: decoded.outputUnit,
            
            // Timestamps
            createdAt: codeData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
            lastUsed: null,
            usageCount: 0,
            
            // Legacy compatibility
            materialsHash: codeData.materialsHash || null
          };
          
          // Write to index collection
          await db.collection('mes-outputCodes-index').add(indexDoc);
          
          console.log(`   ✅ Migrated ${codeData.code}`);
          migratedCodes++;
          
        } catch (error) {
          console.error(`   ❌ Error migrating ${codeData.code}:`, error.message);
          errors.push({
            code: codeData.code,
            signature: signature,
            error: error.message
          });
        }
      }
    }
    
    // 4. Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total codes found:     ${totalCodes}`);
    console.log(`Successfully migrated: ${migratedCodes}`);
    console.log(`Skipped (existing):    ${skippedCodes}`);
    console.log(`Errors:                ${errors.length}`);
    
    if (errors.length > 0) {
      console.log('\n❌ ERRORS:');
      errors.forEach(err => {
        console.log(`   - ${err.code}: ${err.error}`);
      });
    }
    
    console.log('\n✅ Migration completed!\n');
    
  } catch (error) {
    console.error('💥 Migration failed:', error);
    throw error;
  }
}

// Run migration
if (require.main === module) {
  migrateOutputCodesToIndex()
    .then(() => {
      console.log('✨ Done!');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { migrateOutputCodesToIndex };
