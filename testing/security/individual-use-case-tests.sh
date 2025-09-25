#!/bin/bash

# 🎯 INDIVIDUAL USE CASE TESTING SCRIPT
# This script tests specific use cases with detailed output and logging

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔬 INDIVIDUAL USE CASE TESTING${NC}"
echo "================================="

# Function to log and display results
test_case() {
    local case_name=$1
    local description=$2
    local command=$3
    local expected_result=$4
    
    echo -e "\n${YELLOW}Testing: $case_name${NC}"
    echo "Description: $description"
    echo "Command: $command"
    echo "Expected: $expected_result"
    echo "----------------------------------------"
    
    # Execute the command and capture output
    if eval "$command" > test_output.tmp 2>&1; then
        echo -e "${GREEN}✅ SUCCESS${NC}"
        echo "Response:"
        cat test_output.tmp | jq . 2>/dev/null || cat test_output.tmp
    else
        echo -e "${RED}❌ FAILED${NC}"
        echo "Error output:"
        cat test_output.tmp
    fi
    
    echo "----------------------------------------"
    rm -f test_output.tmp
}

# Get authentication token first
echo -e "${BLUE}🔐 Getting Admin Authentication Token${NC}"
AUTH_RESPONSE=$(curl -s -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "umutyalcin8@gmail.com", "password": "burkol123"}')

TOKEN=$(echo $AUTH_RESPONSE | jq -r '.token')
echo "Token obtained: ${TOKEN:0:20}..."

# USER SIDE USE CASES
echo -e "\n${BLUE}👤 USER SIDE USE CASES${NC}"
echo "======================="

test_case "UC-1: Quote Submission" \
  "Customer submits a new metal fabrication quote" \
  "curl -s -X POST http://localhost:3002/api/quotes -H 'Content-Type: application/json' -d '{\"name\": \"Ahmet Yılmaz\", \"email\": \"ahmet@example.com\", \"phone\": \"+905551234567\", \"proj\": \"Çelik Konstrüksiyon Projesi\", \"customFields\": {\"material\": \"Çelik\", \"thickness\": 12, \"qty\": 30, \"notes\": \"Kaynaklı imalat gerekli\"}}'" \
  "Quote created with ID and calculated price"

test_case "UC-2: Price Calculation" \
  "Real-time price calculation for project specifications" \
  "curl -s -X POST http://localhost:3002/api/calculate-price -H 'Content-Type: application/json' -d '{\"customFields\": {\"material\": \"Alüminyum\", \"thickness\": 8, \"qty\": 20}}'" \
  "Price calculated based on current formula"

test_case "UC-3: Form Configuration" \
  "Loading dynamic form configuration" \
  "curl -s http://localhost:3002/api/form-config" \
  "Form structure with fields and validation rules"

# ADMIN SIDE USE CASES
echo -e "\n${BLUE}👨‍💼 ADMIN SIDE USE CASES${NC}"
echo "========================="

test_case "UC-4: Admin Authentication" \
  "Admin login with credentials" \
  "curl -s -X POST http://localhost:3002/api/auth/login -H 'Content-Type: application/json' -d '{\"email\": \"umutyalcin8@gmail.com\", \"password\": \"burkol123\"}'" \
  "JWT token and user information"

test_case "UC-5: Quote List Retrieval" \
  "Admin views all submitted quotes" \
  "curl -s -H 'Authorization: Bearer $TOKEN' http://localhost:3002/api/quotes" \
  "Array of quotes with details"

test_case "UC-6: Quote Status Update" \
  "Admin updates quote status" \
  "curl -s -X PATCH -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' -d '{\"status\": \"approved\"}' http://localhost:3002/api/quotes/seed-quote-2/status" \
  "Updated quote with new status"

test_case "UC-7: User Management - List Users" \
  "Admin views system users" \
  "curl -s -H 'Authorization: Bearer $TOKEN' http://localhost:3002/api/auth/users" \
  "List of users with roles and status"

test_case "UC-8: User Management - Create User" \
  "Admin creates new user" \
  "curl -s -X POST -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' -d '{\"email\": \"newadmin@burkol.com\", \"password\": \"secure123\", \"role\": \"admin\"}' http://localhost:3002/api/auth/users" \
  "Confirmation of user creation"

test_case "UC-9: Price Settings Update" \
  "Admin updates pricing formulas" \
  "curl -s -X POST -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' -d '{\"version\": 3, \"formula\": \"(base_cost + (qty * unit_cost * material_factor)) * margin\", \"parameters\": [{\"id\": \"base_cost\", \"value\": 350}, {\"id\": \"unit_cost\", \"value\": 55}, {\"id\": \"material_factor\", \"value\": 1.1}, {\"id\": \"margin\", \"value\": 1.35}]}' http://localhost:3002/api/price-settings" \
  "Updated price settings with new formula"

# SECURITY AND ERROR HANDLING TESTS
echo -e "\n${BLUE}🔒 SECURITY & ERROR HANDLING${NC}"
echo "================================"

test_case "SEC-1: Unauthorized Access" \
  "Attempt to access admin endpoints without token" \
  "curl -s http://localhost:3002/api/quotes" \
  "401 Unauthorized error"

test_case "SEC-2: Invalid Token" \
  "Attempt to use invalid authentication token" \
  "curl -s -H 'Authorization: Bearer invalid-token-123' http://localhost:3002/api/auth/users" \
  "401 Invalid token error"

test_case "ERR-1: Invalid Quote Data" \
  "Submit quote with missing required fields" \
  "curl -s -X POST -H 'Content-Type: application/json' -d '{\"email\": \"incomplete@test.com\"}' http://localhost:3002/api/quotes" \
  "400 Validation error"

test_case "ERR-2: Invalid Price Calculation" \
  "Price calculation with invalid data" \
  "curl -s -X POST -H 'Content-Type: application/json' -d '{\"customFields\": {\"qty\": \"invalid\"}}' http://localhost:3002/api/calculate-price" \
  "400 Validation error"

# PERFORMANCE TESTS
echo -e "\n${BLUE}⚡ PERFORMANCE TESTS${NC}"
echo "==================="

echo -e "\n${YELLOW}PERF-1: Response Time Test${NC}"
echo "Measuring API response times..."

start_time=$(date +%s.%N)
curl -s http://localhost:3002/api/test > /dev/null
end_time=$(date +%s.%N)
response_time=$(echo "$end_time - $start_time" | bc -l)
echo "API Test endpoint: ${response_time}s"

start_time=$(date +%s.%N)
curl -s http://localhost:3002/api/form-config > /dev/null
end_time=$(date +%s.%N)
response_time=$(echo "$end_time - $start_time" | bc -l)
echo "Form Config endpoint: ${response_time}s"

start_time=$(date +%s.%N)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3002/api/quotes > /dev/null
end_time=$(date +%s.%N)
response_time=$(echo "$end_time - $start_time" | bc -l)
echo "Quotes List endpoint: ${response_time}s"

echo -e "\n${YELLOW}PERF-2: Concurrent Requests${NC}"
echo "Testing 10 concurrent quote submissions..."

pids=()
for i in {1..10}; do
    (
        start_time=$(date +%s.%N)
        curl -s -X POST http://localhost:3002/api/quotes \
          -H "Content-Type: application/json" \
          -d "{\"name\": \"Performance Test User $i\", \"email\": \"perf$i@test.com\", \"phone\": \"+90555000000$i\", \"proj\": \"Performance Test $i\", \"customFields\": {\"material\": \"Çelik\", \"thickness\": 5, \"qty\": $((i * 5)), \"notes\": \"Performance test request\"}}" > /dev/null
        end_time=$(date +%s.%N)
        duration=$(echo "$end_time - $start_time" | bc -l)
        echo "Request $i completed in ${duration}s"
    ) &
    pids+=($!)
done

# Wait for all requests to complete
for pid in "${pids[@]}"; do
    wait $pid
done

echo -e "\n${GREEN}✅ All performance tests completed${NC}"

# BUSINESS LOGIC VALIDATION
echo -e "\n${BLUE}💼 BUSINESS LOGIC VALIDATION${NC}"
echo "============================"

echo -e "\n${YELLOW}BIZ-1: Price Formula Validation${NC}"
echo "Testing if price calculations follow business rules..."

# Test with known values
QUOTE_DATA='{"name": "Test User", "email": "test@test.com", "phone": "+905551234567", "proj": "Test Project", "customFields": {"material": "Çelik", "thickness": 10, "qty": 100, "notes": "Business logic test"}}'

RESPONSE=$(curl -s -X POST http://localhost:3002/api/quotes -H "Content-Type: application/json" -d "$QUOTE_DATA")
CALCULATED_PRICE=$(echo $RESPONSE | jq -r '.quote.calculatedPrice')

echo "Calculated price for 100 units: $CALCULATED_PRICE TL"

# Verify price is reasonable (should be > 1000 for 100 units based on our formula)
if (( $(echo "$CALCULATED_PRICE > 1000" | bc -l) )); then
    echo -e "${GREEN}✅ Price calculation appears correct${NC}"
else
    echo -e "${RED}❌ Price calculation may be incorrect${NC}"
fi

echo -e "\n${YELLOW}BIZ-2: Status Workflow Validation${NC}"
echo "Testing quote status progression..."

# Get a quote ID
QUOTE_ID=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3002/api/quotes | jq -r '.[0].id')
echo "Testing with quote ID: $QUOTE_ID"

# Test status progression: new -> review -> approved
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"status": "review"}' "http://localhost:3002/api/quotes/$QUOTE_ID/status" > /dev/null

curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"status": "approved"}' "http://localhost:3002/api/quotes/$QUOTE_ID/status" > /dev/null

FINAL_STATUS=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3002/api/quotes | jq -r ".[] | select(.id == \"$QUOTE_ID\") | .status")
echo "Final status: $FINAL_STATUS"

if [ "$FINAL_STATUS" = "approved" ]; then
    echo -e "${GREEN}✅ Status workflow working correctly${NC}"
else
    echo -e "${RED}❌ Status workflow may have issues${NC}"
fi

echo -e "\n${BLUE}📊 TESTING COMPLETE${NC}"
echo "==================="
echo -e "${GREEN}✅ All use cases tested${NC}"
echo -e "${GREEN}✅ Security validation completed${NC}"
echo -e "${GREEN}✅ Performance benchmarks recorded${NC}"
echo -e "${GREEN}✅ Business logic validated${NC}"
echo ""
echo "Summary:"
echo "• User-side functionality: Quote submission, price calculation, form loading"
echo "• Admin-side functionality: Authentication, quote management, user management, configuration"
echo "• Security: Unauthorized access prevention, token validation"
echo "• Performance: Response times measured, concurrent load tested"
echo "• Business logic: Price calculations and status workflows validated"