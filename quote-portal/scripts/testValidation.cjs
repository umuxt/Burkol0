/**
 * Test Script: Validation Enforcement
 * 
 * Tests that invalid production plans are rejected by the backend.
 * Run: node scripts/testValidation.js
 */

const axios = require('axios');

async function testInvalidPlan() {
  console.log('🧪 Testing validation enforcement...\n');
  
  const invalidPlan = {
    id: 'TEST-INVALID-001',
    name: 'Invalid Test Plan',
    orderCode: 'WO-TEST-001',
    quantity: 50,
    status: 'production',
    nodes: [
      {
        // Missing required field: 'id'
        name: 'Test Node',
        operationId: 'OP-001',
        nominalTime: -5,  // Invalid: must be >= 1
        requiredSkills: 'not-an-array',  // Invalid: must be array
        assignedStations: [],
        predecessors: []
      }
    ]
  };
  
  console.log('📤 Sending invalid plan to backend...');
  console.log('Expected issues:');
  console.log('  - Missing node.id field');
  console.log('  - nominalTime = -5 (must be >= 1)');
  console.log('  - requiredSkills is string (must be array)');
  console.log('');
  
  try {
    const response = await axios.post('http://localhost:3000/api/mes/production-plans', invalidPlan, {
      headers: { 
        'Content-Type': 'application/json'
      }
    });
    
    console.log('❌ FAIL: Invalid plan was accepted (should be rejected)');
    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
    process.exit(1);
    
  } catch (error) {
    if (error.response) {
      if (error.response.status === 400) {
        console.log('✅ PASS: Invalid plan rejected with 400 Bad Request');
        console.log('');
        console.log('Validation errors returned:');
        if (error.response.data.details) {
          console.log(JSON.stringify(error.response.data.details, null, 2));
        } else {
          console.log(error.response.data.message || error.response.data);
        }
        console.log('');
        console.log('✅ Validation is working correctly!');
        process.exit(0);
      } else {
        console.log(`❌ FAIL: Unexpected status code: ${error.response.status}`);
        console.log('Response data:', error.response.data);
        process.exit(1);
      }
    } else if (error.request) {
      console.log('❌ FAIL: No response from server');
      console.log('Is the backend running on http://localhost:3000?');
      console.log('Error:', error.message);
      process.exit(1);
    } else {
      console.log('❌ FAIL: Unexpected error:', error.message);
      process.exit(1);
    }
  }
}

// Run test
testInvalidPlan();
