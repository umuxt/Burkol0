#!/bin/bash

# Test script for new architecture endpoints - Phase A Complete
# Run after server is started with npm run dev

BASE_URL="http://localhost:5173"
echo "🏗️ Testing New Architecture Endpoints (Phase A Complete)"
echo "========================================================="

# Test 1: Create quote with status
echo ""
echo "Test 1: Creating quote with new architecture..."
curl -s -X POST "$BASE_URL/api/quotes/create-with-status" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Architecture Test Quote",
    "qty": 100,
    "thickness": 5,
    "width": 10,
    "height": 10
  }' | python3 -m json.tool

# Test 2: Trigger price settings change event
echo ""
echo "Test 2: Triggering price settings change event..."
curl -s -X POST "$BASE_URL/api/price-settings/changed" \
  -H "Content-Type: application/json" | python3 -m json.tool

# Test 3: Get current quotes to find an ID for testing
echo ""
echo "Test 3: Getting current quotes to find test ID..."
QUOTE_RESPONSE=$(curl -s -X GET "$BASE_URL/api/quotes")
QUOTE_ID=$(echo "$QUOTE_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if isinstance(data, list) and len(data) > 0:
        print(data[0]['id'])
    else:
        print('NO_QUOTES')
except:
    print('ERROR')
")

if [ "$QUOTE_ID" != "NO_QUOTES" ] && [ "$QUOTE_ID" != "ERROR" ]; then
    echo "Found quote ID: $QUOTE_ID"
    
    # Test 4: Get price status for quote
    echo ""
    echo "Test 4: Getting price status for quote $QUOTE_ID..."
    curl -s -X GET "$BASE_URL/api/quotes/$QUOTE_ID/price-status" | python3 -m json.tool
    
    # Test 5: Calculate price for quote
    echo ""
    echo "Test 5: Calculating price for quote $QUOTE_ID..."
    curl -s -X POST "$BASE_URL/api/quotes/$QUOTE_ID/calculate-price" \
      -H "Content-Type: application/json" | python3 -m json.tool
    
    # Test 6: Apply price to quote
    echo ""
    echo "Test 6: Applying price to quote $QUOTE_ID..."
    curl -s -X POST "$BASE_URL/api/quotes/$QUOTE_ID/apply-price" \
      -H "Content-Type: application/json" | python3 -m json.tool
    
    # Test 7: Batch calculate
    echo ""
    echo "Test 7: Batch calculating quotes..."
    curl -s -X POST "$BASE_URL/api/quotes/batch-calculate" \
      -H "Content-Type: application/json" \
      -d "{\"quoteIds\": [\"$QUOTE_ID\"]}" | python3 -m json.tool
      
else
    echo "❌ No quotes found or error getting quotes. Create a quote first."
fi

echo ""
echo "========================================================="
echo "🏗️ Architecture testing completed!"
echo ""
echo "✅ PHASE A COMPLETE:"
echo "   - New architecture implemented"
echo "   - Legacy endpoints removed"
echo "   - Duplicate endpoints resolved"
echo "   - Clean API structure established"
echo ""
echo "🚀 READY FOR PHASE B: UI Integration"
echo ""
echo "If you see clean JSON responses above, the new architecture is working!"
echo "If you see errors, check the server logs for details."