#!/bin/bash

# 🕵️ ULTRA-DEEP PENETRATION TESTING
# Advanced edge case discovery and security analysis
# Author: AI Assistant
# Date: $(date)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:3002"
ADMIN_EMAIL="admin@burkol.com"
ADMIN_PASSWORD="admin123"
LOG_DIR="./logs/ultra-deep"

mkdir -p "$LOG_DIR"

echo -e "${PURPLE}🕵️ ULTRA-DEEP PENETRATION TESTING SUITE${NC}"
echo -e "${PURPLE}==========================================${NC}"
echo ""

# Function to log test results
log_result() {
    local test_name="$1"
    local status="$2"
    local details="$3"
    local log_file="$LOG_DIR/ultra-deep-test.log"
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$status] $test_name: $details" >> "$log_file"
    
    if [ "$status" = "CRITICAL" ]; then
        echo -e "${RED}🚨 CRITICAL: $test_name - $details${NC}"
    elif [ "$status" = "WARNING" ]; then
        echo -e "${YELLOW}⚠️  WARNING: $test_name - $details${NC}"
    elif [ "$status" = "INFO" ]; then
        echo -e "${BLUE}ℹ️  INFO: $test_name - $details${NC}"
    elif [ "$status" = "SUCCESS" ]; then
        echo -e "${GREEN}✅ SUCCESS: $test_name - $details${NC}"
    fi
}

# Get admin token
get_admin_token() {
    local response=$(curl -s -X POST "$BASE_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
    
    echo "$response" | jq -r '.token // empty' 2>/dev/null || echo ""
}

ADMIN_TOKEN=$(get_admin_token)

echo -e "${CYAN}🔐 Phase 1: Advanced Authentication Bypass Attempts${NC}"
echo "=================================================="

# Test 1: Header injection attacks
echo "Test 1.1: HTTP Header Injection"
response=$(curl -s -w "%{http_code}" \
    -H "Authorization: Bearer \r\nX-Admin: true" \
    -X GET "$BASE_URL/api/admin/quotes" 2>/dev/null || echo "000")

http_code="${response: -3}"
if [ "$http_code" = "200" ]; then
    log_result "HEADER_INJECTION" "CRITICAL" "Header injection bypass successful"
else
    log_result "HEADER_INJECTION" "SUCCESS" "Header injection blocked"
fi

# Test 2: Session fixation
echo "Test 1.2: Session Fixation Test"
fixed_token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhZG1pbiIsImVtYWlsIjoiYWRtaW5AYnVya29sLmNvbSIsInJvbGUiOiJhZG1pbiIsImlhdCI6OTk5OTk5OTk5OX0.fake"

response=$(curl -s -w "%{http_code}" \
    -H "Authorization: Bearer $fixed_token" \
    -X GET "$BASE_URL/api/admin/quotes")

http_code="${response: -3}"
if [ "$http_code" = "200" ]; then
    log_result "SESSION_FIXATION" "CRITICAL" "Fixed token accepted"
else
    log_result "SESSION_FIXATION" "SUCCESS" "Fixed token rejected" 
fi

echo ""
echo -e "${CYAN}💾 Phase 2: Database Injection & NoSQL Attacks${NC}"
echo "=============================================="

# Test 3: NoSQL injection attempts (for Firestore)
echo "Test 2.1: NoSQL Injection in Quote Search"
nosql_payloads=(
    '{"$ne": null}'
    '{"$gt": ""}'
    '{"$where": "this.password == \"admin\""}'
    '{"$regex": ".*"}'
)

for payload in "${nosql_payloads[@]}"; do
    encoded_payload=$(echo "$payload" | jq -R .)
    
    response=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/admin/quotes?search=$encoded_payload" \
        -H "Authorization: Bearer $ADMIN_TOKEN")
    
    http_code="${response: -3}"
    body="${response%???}"
    
    if [ "$http_code" = "200" ] && echo "$body" | jq -e '.quotes | length > 0' > /dev/null 2>&1; then
        log_result "NOSQL_INJECTION" "CRITICAL" "NoSQL injection successful with: $payload"
    else
        log_result "NOSQL_INJECTION" "SUCCESS" "NoSQL injection blocked for: $payload"
    fi
done

echo ""
echo -e "${CYAN}🧠 Phase 3: Business Logic Exploitation${NC}"
echo "======================================="

# Test 4: Price formula injection
echo "Test 3.1: Formula Injection Attack"
if [ -n "$ADMIN_TOKEN" ]; then
    malicious_formula='require("child_process").exec("touch /tmp/hacked")'
    
    response=$(curl -s -w "%{http_code}" -X PATCH "$BASE_URL/api/admin/settings/price" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"formula\": \"$malicious_formula\"}")
    
    http_code="${response: -3}"
    if [ "$http_code" = "200" ]; then
        # Test if the injection worked
        test_response=$(curl -s -X POST "$BASE_URL/api/calculate-price" \
            -H "Content-Type: application/json" \
            -d '{"customFields": {"qty": 1}}')
        
        if [ -f "/tmp/hacked" ]; then
            log_result "FORMULA_INJECTION" "CRITICAL" "Code execution via formula injection"
            rm -f "/tmp/hacked"
        else
            log_result "FORMULA_INJECTION" "WARNING" "Formula injection accepted but no code execution"
        fi
    else
        log_result "FORMULA_INJECTION" "SUCCESS" "Formula injection blocked"
    fi
fi

# Test 5: Parameter pollution
echo "Test 3.2: HTTP Parameter Pollution"
response=$(curl -s -X POST "$BASE_URL/api/quotes?admin=true&admin=false" \
    -H "Content-Type: application/json" \
    -d '{"customerInfo":{"name":"ParamPollution","email":"test@example.com","phone":"1234567890"},"customFields":{"material":"Steel","thickness":5,"qty":1}}')

if echo "$response" | jq -e '.adminPrivileges == true' > /dev/null 2>&1; then
    log_result "PARAM_POLLUTION" "CRITICAL" "Parameter pollution granted admin privileges"
else
    log_result "PARAM_POLLUTION" "SUCCESS" "Parameter pollution had no effect"
fi

echo ""
echo -e "${CYAN}⚡ Phase 4: Memory & Resource Exploitation${NC}"
echo "=========================================="

# Test 6: Memory exhaustion via deep nesting
echo "Test 4.1: Deep Object Nesting Attack"
deep_object='{"a":{"b":{"c":{"d":{"e":{"f":{"g":{"h":{"i":{"j":{"k":{"l":{"m":{"n":{"o":{"p":{"q":{"r":{"s":{"t":{"u":{"v":{"w":{"x":{"y":{"z":"value"}}}}}}}}}}}}}}}}}}}}}}}}}'

response=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/quotes" \
    -H "Content-Type: application/json" \
    -d "{\"customerInfo\":{\"name\":\"DeepNest\",\"email\":\"test@example.com\",\"phone\":\"1234567890\"},\"customFields\":$deep_object}")

http_code="${response: -3}"
if [ "$http_code" = "500" ]; then
    log_result "DEEP_NESTING" "WARNING" "Deep nesting caused server error"
elif [ "$http_code" = "400" ]; then
    log_result "DEEP_NESTING" "SUCCESS" "Deep nesting rejected"
else
    log_result "DEEP_NESTING" "INFO" "Deep nesting handled normally"
fi

# Test 7: Prototype pollution attempt
echo "Test 4.2: Prototype Pollution Attack"
pollution_payload='{"__proto__":{"isAdmin":true},"constructor":{"prototype":{"isAdmin":true}}}'

response=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/quotes" \
    -H "Content-Type: application/json" \
    -d "{\"customerInfo\":{\"name\":\"ProtoPollution\",\"email\":\"test@example.com\",\"phone\":\"1234567890\"},\"customFields\":$pollution_payload}")

http_code="${response: -3}"
body="${response%???}"

# Check if prototype pollution worked by creating another request
test_response=$(curl -s -X GET "$BASE_URL/api/admin/quotes")
if echo "$test_response" | jq -e '.isAdmin == true' > /dev/null 2>&1; then
    log_result "PROTOTYPE_POLLUTION" "CRITICAL" "Prototype pollution successful"
else
    log_result "PROTOTYPE_POLLUTION" "SUCCESS" "Prototype pollution blocked"
fi

echo ""
echo -e "${CYAN}🔄 Phase 5: State Manipulation & Race Conditions${NC}"
echo "=============================================="

# Test 8: State manipulation via concurrent requests
echo "Test 5.1: Concurrent State Manipulation"
if [ -n "$ADMIN_TOKEN" ]; then
    # Submit a quote and try to modify it concurrently
    quote_response=$(curl -s -X POST "$BASE_URL/api/quotes" \
        -H "Content-Type: application/json" \
        -d '{"customerInfo":{"name":"StateTest","email":"state@example.com","phone":"1234567890"},"customFields":{"material":"Steel","thickness":5,"qty":1}}')
    
    quote_id=$(echo "$quote_response" | jq -r '.id // empty' 2>/dev/null)
    
    if [ -n "$quote_id" ]; then
        # Launch concurrent modification attempts
        pids=()
        for i in {1..5}; do
            (
                curl -s -X PATCH "$BASE_URL/api/admin/quotes/$quote_id" \
                    -H "Authorization: Bearer $ADMIN_TOKEN" \
                    -H "Content-Type: application/json" \
                    -d "{\"status\": \"concurrent_$i\"}" > "$LOG_DIR/state_$i.tmp"
            ) &
            pids+=($!)
        done
        
        # Wait for all requests
        for pid in "${pids[@]}"; do
            wait "$pid"
        done
        
        # Check final state
        final_state=$(curl -s -X GET "$BASE_URL/api/admin/quotes/$quote_id" \
            -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.status // empty')
        
        if echo "$final_state" | grep -q "concurrent"; then
            log_result "CONCURRENT_STATE" "WARNING" "Race condition in state updates: $final_state"
        else
            log_result "CONCURRENT_STATE" "SUCCESS" "State updates handled atomically"
        fi
        
        # Cleanup temp files
        rm -f "$LOG_DIR/state_"*.tmp
    fi
fi

echo ""
echo -e "${CYAN}🎭 Phase 6: Logic Bomb & Time-based Attacks${NC}"
echo "=========================================="

# Test 9: Time-based blind injection
echo "Test 6.1: Time-based Blind Injection"
start_time=$(date +%s)

response=$(curl -s -X POST "$BASE_URL/api/quotes" \
    -H "Content-Type: application/json" \
    -d '{"customerInfo":{"name":"TimeTest","email":"time@example.com","phone":"1234567890"},"customFields":{"material":"Steel; sleep(5); --","thickness":5,"qty":1}}')

end_time=$(date +%s)
duration=$((end_time - start_time))

if [ "$duration" -gt 4 ]; then
    log_result "TIME_BLIND_INJECTION" "WARNING" "Potential time-based injection (${duration}s delay)"
else
    log_result "TIME_BLIND_INJECTION" "SUCCESS" "No time-based injection detected (${duration}s)"
fi

# Test 10: Logic bomb via scheduled task
echo "Test 6.2: Logic Bomb Detection"
bomb_payload='{"material":"Steel","thickness":5,"qty":1,"executeAt":"2025-12-31T23:59:59Z","command":"rm -rf /"}'

response=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/quotes" \
    -H "Content-Type: application/json" \
    -d "{\"customerInfo\":{\"name\":\"LogicBomb\",\"email\":\"bomb@example.com\",\"phone\":\"1234567890\"},\"customFields\":$bomb_payload}")

http_code="${response: -3}"
body="${response%???}"

if echo "$body" | jq -e '.customFields.executeAt' > /dev/null 2>&1; then
    log_result "LOGIC_BOMB" "CRITICAL" "Logic bomb data accepted and stored"
else
    log_result "LOGIC_BOMB" "SUCCESS" "Logic bomb data sanitized"
fi

echo ""
echo -e "${CYAN}🌐 Phase 7: API Versioning & Endpoint Discovery${NC}"
echo "=============================================="

# Test 11: API version manipulation
echo "Test 7.1: API Version Bypass"
versions=("v0" "v1" "v2" "v3" "v1.0" "v1.1" "v2.0" "beta" "alpha" "dev" "test")

for version in "${versions[@]}"; do
    response=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/$version/admin/quotes" \
        -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null || echo "000")
    
    http_code="${response: -3}"
    if [ "$http_code" = "200" ]; then
        log_result "API_VERSION_BYPASS" "WARNING" "Version $version accessible"
    fi
done

# Test 12: Hidden endpoint discovery
echo "Test 7.2: Hidden Endpoint Discovery"
hidden_endpoints=(
    "debug" "test" "dev" "admin/debug" "admin/test" "internal" 
    "backup" "export" "import" "migrate" "reset" "flush"
    "health" "status" "metrics" "logs" "config" "settings/all"
)

for endpoint in "${hidden_endpoints[@]}"; do
    response=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/$endpoint" \
        -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null || echo "000")
    
    http_code="${response: -3}"
    if [ "$http_code" = "200" ]; then
        body="${response%???}"
        if echo "$body" | jq -e '.' > /dev/null 2>&1; then
            log_result "HIDDEN_ENDPOINT" "WARNING" "Hidden endpoint /$endpoint exposed with data"
        else
            log_result "HIDDEN_ENDPOINT" "INFO" "Endpoint /$endpoint accessible but no data"
        fi
    fi
done

echo ""
echo -e "${CYAN}🔬 Phase 8: Advanced Price Calculation Exploits${NC}"
echo "=============================================="

# Test 13: Mathematical overflow exploitation
echo "Test 8.1: Mathematical Overflow Attacks"
overflow_cases=(
    '{"qty": 1e308}'
    '{"qty": "Infinity"}'  
    '{"qty": "-Infinity"}'
    '{"qty": "NaN"}'
    '{"width": 1e100, "height": 1e100, "thickness": 1e100, "qty": 1e100}'
)

for case in "${overflow_cases[@]}"; do
    payload="{\"customFields\": $case}"
    
    response=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/calculate-price" \
        -H "Content-Type: application/json" \
        -d "$payload")
    
    http_code="${response: -3}"
    body="${response%???}"
    
    if [ "$http_code" = "500" ]; then
        log_result "MATH_OVERFLOW" "WARNING" "Math overflow caused server error for: $case"
    elif echo "$body" | jq -e '.price' > /dev/null 2>&1; then
        price=$(echo "$body" | jq -r '.price')
        if [ "$price" = "Infinity" ] || [ "$price" = "-Infinity" ] || [ "$price" = "NaN" ]; then
            log_result "MATH_OVERFLOW" "WARNING" "Math overflow produced invalid result: $case -> $price"
        fi
    fi
done

# Test 14: Formula evaluation bypass
echo "Test 8.2: Formula Evaluation Bypass"
if [ -n "$ADMIN_TOKEN" ]; then
    # Try to inject code into formula parameters
    bypass_params='[
        {"id":"base_cost","value":"console.log(\"injected\")","name":"Base","type":"fixed"},
        {"id":"unit_cost","value":"process.exit(1)","name":"Unit","type":"fixed"},
        {"id":"margin","value":"require(\"fs\").writeFileSync(\"/tmp/pwned\",\"hacked\")","name":"Margin","type":"fixed"}
    ]'
    
    response=$(curl -s -w "%{http_code}" -X PATCH "$BASE_URL/api/admin/settings/price" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"parameters\": $bypass_params}")
    
    http_code="${response: -3}"
    if [ "$http_code" = "200" ]; then
        # Test if the injection worked
        test_calc=$(curl -s -X POST "$BASE_URL/api/calculate-price" \
            -H "Content-Type: application/json" \
            -d '{"customFields": {"qty": 1}}')
        
        if [ -f "/tmp/pwned" ]; then
            log_result "FORMULA_EVAL_BYPASS" "CRITICAL" "Code execution via parameter injection"
            rm -f "/tmp/pwned"
        else
            log_result "FORMULA_EVAL_BYPASS" "SUCCESS" "Parameter injection blocked"
        fi
    fi
fi

echo ""
echo -e "${PURPLE}📊 ULTRA-DEEP TESTING COMPLETE${NC}"
echo -e "${PURPLE}===============================${NC}"
echo "Ultra-deep test log: $LOG_DIR/ultra-deep-test.log"
echo "Completed: $(date)"

# Generate summary
if [ -f "$LOG_DIR/ultra-deep-test.log" ]; then
    critical_count=$(grep -c "CRITICAL" "$LOG_DIR/ultra-deep-test.log" || echo "0")
    warning_count=$(grep -c "WARNING" "$LOG_DIR/ultra-deep-test.log" || echo "0") 
    success_count=$(grep -c "SUCCESS" "$LOG_DIR/ultra-deep-test.log" || echo "0")
    
    echo ""
    echo -e "${CYAN}📋 ULTRA-DEEP SUMMARY${NC}"
    echo "====================="
    echo -e "${RED}🚨 Critical Issues: $critical_count${NC}"
    echo -e "${YELLOW}⚠️  Warnings: $warning_count${NC}"
    echo -e "${GREEN}✅ Successful Tests: $success_count${NC}"
    
    if [ "$critical_count" -gt 0 ]; then
        echo ""
        echo -e "${RED}🚨 CRITICAL ISSUES FOUND:${NC}"
        grep "CRITICAL" "$LOG_DIR/ultra-deep-test.log" | while read line; do
            echo -e "${RED}  • ${line}${NC}"
        done
    fi
    
    if [ "$warning_count" -gt 0 ]; then
        echo ""
        echo -e "${YELLOW}⚠️  WARNINGS FOUND:${NC}"
        grep "WARNING" "$LOG_DIR/ultra-deep-test.log" | while read line; do
            echo -e "${YELLOW}  • ${line}${NC}"
        done
    fi
fi