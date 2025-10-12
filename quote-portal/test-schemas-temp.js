// Schema validation test
const path = require('path');
const { fileURLToPath } = require('url');

// Import schemas using require (CommonJS)
const fs = require('fs');

// Read and evaluate the schema file
const schemaContent = fs.readFileSync('./src/lib/firestore-schemas.js', 'utf8');

// Extract validation functions (simplified for testing)
console.log('Testing schema file structure...');

// Check if file contains required exports
const requiredExports = [
    'MaterialSchema',
    'CategorySchema', 
    'StockMovementSchema',
    'validateMaterial',
    'validateStockMovement'
];

for (const exportName of requiredExports) {
    if (schemaContent.includes(exportName)) {
        console.log(`✓ Found: ${exportName}`);
    } else {
        console.log(`✗ Missing: ${exportName}`);
        process.exit(1);
    }
}

// Test basic validation logic patterns
const validationPatterns = [
    'if (!data)',
    'errors.push',
    'return errors'
];

for (const pattern of validationPatterns) {
    if (schemaContent.includes(pattern)) {
        console.log(`✓ Validation pattern: ${pattern}`);
    } else {
        console.log(`✗ Missing validation pattern: ${pattern}`);
        process.exit(1);
    }
}

console.log('✓ Schema structure validation passed');
