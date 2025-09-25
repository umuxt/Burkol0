#!/bin/bash

# 🔬 ADVANCED SYSTEM PENETRATION TESTING
# Deep analysis and edge case discovery for Burkol Quote Portal
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

# Configuration
BASE_URL="http://localhost:3002"
ADMIN_EMAIL="admin@burkol.com"
ADMIN_PASSWORD="admin123"
LOG_DIR="./logs/advanced"
TEST_DATA_DIR="./test-data"

# Create directories
mkdir -p "$LOG_DIR"
mkdir -p "$TEST_DATA_DIR"

echo -e "${PURPLE}🔬 ADVANCED PENETRATION TESTING SUITE${NC}"
echo -e "${PURPLE}======================================${NC}"
echo "Target: $BASE_URL"
echo "Log Directory: $LOG_DIR"
echo "Started: $(date)"
echo ""

# Function to log test results
log_result() {
    local test_name="$1"
    local status="$2"
    local details="$3"
    local log_file="$LOG_DIR/advanced-test.log"
    
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

# Function to get admin token
get_admin_token() {
    local response=$(curl -s -X POST "$BASE_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
    
    echo "$response" | jq -r '.token // empty' 2>/dev/null || echo ""
}

echo -e "${CYAN}🔑 Phase 1: Authentication & Security Penetration${NC}"
echo "=================================================="

# Test 1: SQL Injection attempts in login
echo "Test 1.1: SQL Injection in Authentication"
sql_payloads=("admin@burkol.com' OR '1'='1" "admin'; DROP TABLE users; --" "admin' UNION SELECT * FROM users --")

for payload in "${sql_payloads[@]}"; do
    response=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$payload\",\"password\":\"test\"}")
    
    http_code="${response: -3}"
    if [ "$http_code" = "200" ]; then
        log_result "SQL_INJECTION_LOGIN" "CRITICAL" "SQL injection successful with payload: $payload"
    else
        log_result "SQL_INJECTION_LOGIN" "SUCCESS" "SQL injection blocked for payload: $payload"
    fi
done

# Test 2: JWT Token manipulation
echo "Test 1.2: JWT Token Security"
ADMIN_TOKEN=$(get_admin_token)

if [ -n "$ADMIN_TOKEN" ]; then
    # Test with modified token
    modified_token="${ADMIN_TOKEN%?}X"  # Change last character
    response=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/admin/quotes" \
        -H "Authorization: Bearer $modified_token")
    
    http_code="${response: -3}"
    if [ "$http_code" = "200" ]; then
        log_result "JWT_MANIPULATION" "CRITICAL" "Modified JWT token accepted"
    else
        log_result "JWT_MANIPULATION" "SUCCESS" "Modified JWT token rejected"
    fi
    
    # Test with expired token simulation
    fake_token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
    response=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/admin/quotes" \
        -H "Authorization: Bearer $fake_token")
    
    http_code="${response: -3}"
    if [ "$http_code" = "200" ]; then
        log_result "FAKE_JWT" "CRITICAL" "Fake JWT token accepted"
    else
        log_result "FAKE_JWT" "SUCCESS" "Fake JWT token rejected"
    fi
fi

echo ""
echo -e "${CYAN}💣 Phase 2: Input Validation & XSS Testing${NC}"
echo "==========================================="

# Test 3: XSS in quote submissions
echo "Test 2.1: Cross-Site Scripting (XSS) Attacks"
xss_payloads=(
    "<script>alert('XSS')</script>"
    "javascript:alert('XSS')"
    "<img src=x onerror=alert('XSS')>"
    "'; DROP TABLE quotes; --"
    "<svg onload=alert('XSS')>"
)

for payload in "${xss_payloads[@]}"; do
    quote_data=$(cat <<EOF
{
    "customerInfo": {
        "name": "$payload",
        "email": "test@example.com",
        "phone": "1234567890"
    },
    "customFields": {
        "material": "$payload",
        "thickness": 5,
        "qty": 1,
        "notes": "$payload"
    }
}
EOF
)
    
    response=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/quotes" \
        -H "Content-Type: application/json" \
        -d "$quote_data")
    
    http_code="${response: -3}"
    body="${response%???}"
    
    if echo "$body" | grep -q "$payload"; then
        log_result "XSS_QUOTE_SUBMISSION" "CRITICAL" "XSS payload reflected: $payload"
    else
        log_result "XSS_QUOTE_SUBMISSION" "SUCCESS" "XSS payload sanitized: $payload"
    fi
done

echo ""
echo -e "${CYAN}🌪️ Phase 3: Resource Exhaustion & DoS Testing${NC}"
echo "=============================================="

# Test 4: Large payload attacks
echo "Test 3.1: Large Payload DoS Attack"
large_string=$(python3 -c "print('A' * 1000000)")  # 1MB string

large_payload=$(cat <<EOF
{
    "customerInfo": {
        "name": "$large_string",
        "email": "test@example.com",
        "phone": "1234567890"
    },
    "customFields": {
        "material": "Steel",
        "thickness": 5,
        "qty": 1,
        "notes": "$large_string"
    }
}
EOF
)

start_time=$(date +%s)
response=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/quotes" \
    -H "Content-Type: application/json" \
    -d "$large_payload" 2>/dev/null || echo "000")

end_time=$(date +%s)
duration=$((end_time - start_time))
http_code="${response: -3}"

if [ "$http_code" = "413" ] || [ "$http_code" = "400" ]; then
    log_result "LARGE_PAYLOAD_DOS" "SUCCESS" "Large payload rejected (${duration}s)"
elif [ "$duration" -gt 10 ]; then
    log_result "LARGE_PAYLOAD_DOS" "WARNING" "Server slow response to large payload (${duration}s)"
else
    log_result "LARGE_PAYLOAD_DOS" "INFO" "Large payload handled normally (${duration}s)"
fi

# Test 5: Rapid fire requests
echo "Test 3.2: Rapid Fire Request Attack"
echo "Sending 50 concurrent requests..."

pids=()
start_time=$(date +%s)

for i in {1..50}; do
    (
        response=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/quotes" \
            -H "Content-Type: application/json" \
            -d '{"customerInfo":{"name":"RapidTest'$i'","email":"test'$i'@example.com","phone":"1234567890"},"customFields":{"material":"Steel","thickness":5,"qty":1}}')
        echo "$response" > "$LOG_DIR/rapid_$i.tmp"
    ) &
    pids+=($!)
done

# Wait for all requests to complete
for pid in "${pids[@]}"; do
    wait "$pid"
done

end_time=$(date +%s)
duration=$((end_time - start_time))

# Count successful responses
success_count=0
error_count=0
for i in {1..50}; do
    if [ -f "$LOG_DIR/rapid_$i.tmp" ]; then
        http_code=$(tail -c 3 "$LOG_DIR/rapid_$i.tmp")
        if [ "$http_code" = "201" ] || [ "$http_code" = "200" ]; then
            ((success_count++))
        else
            ((error_count++))
        fi
        rm -f "$LOG_DIR/rapid_$i.tmp"
    fi
done

if [ $success_count -gt 45 ]; then
    log_result "RAPID_FIRE_ATTACK" "WARNING" "Server handled $success_count/50 requests in ${duration}s - no rate limiting"
elif [ $error_count -gt 40 ]; then
    log_result "RAPID_FIRE_ATTACK" "SUCCESS" "Server rejected $error_count/50 requests - rate limiting active"
else
    log_result "RAPID_FIRE_ATTACK" "INFO" "Mixed results: $success_count success, $error_count errors in ${duration}s"
fi

echo ""
echo -e "${CYAN}🧬 Phase 4: Data Integrity & Business Logic Testing${NC}"
echo "=================================================="

# Test 6: Price manipulation attempts
echo "Test 4.1: Price Manipulation Attack"
if [ -n "$ADMIN_TOKEN" ]; then
    # Try to submit quote with manipulated price
    manipulation_payload=$(cat <<EOF
{
    "customerInfo": {
        "name": "Price Hacker",
        "email": "hacker@example.com",
        "phone": "1234567890"
    },
    "customFields": {
        "material": "Steel",
        "thickness": 5,
        "qty": 1000000
    },
    "price": 0.01,
    "calculatedPrice": 999999.99
}
EOF
)
    
    response=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/quotes" \
        -H "Content-Type: application/json" \
        -d "$manipulation_payload")
    
    http_code="${response: -3}"
    body="${response%???}"
    
    # Check if the manipulated price was accepted
    if echo "$body" | jq -e '.price < 1' > /dev/null 2>&1; then
        log_result "PRICE_MANIPULATION" "CRITICAL" "Manipulated price accepted"
    else
        log_result "PRICE_MANIPULATION" "SUCCESS" "Price manipulation rejected"
    fi
fi

# Test 7: Negative quantity business logic
echo "Test 4.2: Negative Quantity Test"
negative_qty_payload=$(cat <<EOF
{
    "customerInfo": {
        "name": "Negative Test",
        "email": "negative@example.com",
        "phone": "1234567890"
    },
    "customFields": {
        "material": "Steel",
        "thickness": 5,
        "qty": -100
    }
}
EOF
)

response=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/quotes" \
    -H "Content-Type: application/json" \
    -d "$negative_qty_payload")

http_code="${response: -3}"
body="${response%???}"

if [ "$http_code" = "400" ]; then
    log_result "NEGATIVE_QUANTITY" "SUCCESS" "Negative quantity rejected"
else
    # Check if negative price was calculated
    if echo "$body" | jq -e '.price < 0' > /dev/null 2>&1; then
        log_result "NEGATIVE_QUANTITY" "CRITICAL" "Negative quantity resulted in negative price"
    else
        log_result "NEGATIVE_QUANTITY" "WARNING" "Negative quantity processed without validation"
    fi
fi

echo ""
echo -e "${CYAN}🔍 Phase 5: File Upload Security Testing${NC}"
echo "========================================"

# Test 8: Malicious file uploads
echo "Test 5.1: Malicious File Upload Test"

# Create malicious files for testing
echo '<?php system($_GET["cmd"]); ?>' > "$TEST_DATA_DIR/malicious.php"
echo '<script>alert("XSS")</script>' > "$TEST_DATA_DIR/malicious.html"
echo 'MZ' > "$TEST_DATA_DIR/malicious.exe"  # Basic PE header

malicious_files=("malicious.php" "malicious.html" "malicious.exe")

for file in "${malicious_files[@]}"; do
    if [ -f "$TEST_DATA_DIR/$file" ]; then
        # Try to upload malicious file
        response=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/upload" \
            -F "file=@$TEST_DATA_DIR/$file" 2>/dev/null || echo "000")
        
        http_code="${response: -3}"
        
        if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
            log_result "MALICIOUS_UPLOAD" "CRITICAL" "Malicious file $file uploaded successfully"
        else
            log_result "MALICIOUS_UPLOAD" "SUCCESS" "Malicious file $file rejected"
        fi
    fi
done

# Test 9: Oversized file upload
echo "Test 5.2: Oversized File Upload Test"
# Create a large file (10MB)
dd if=/dev/zero of="$TEST_DATA_DIR/large_file.txt" bs=1M count=10 2>/dev/null

if [ -f "$TEST_DATA_DIR/large_file.txt" ]; then
    start_time=$(date +%s)
    response=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/upload" \
        -F "file=@$TEST_DATA_DIR/large_file.txt" 2>/dev/null || echo "000")
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    
    http_code="${response: -3}"
    
    if [ "$http_code" = "413" ]; then
        log_result "OVERSIZED_UPLOAD" "SUCCESS" "Large file rejected (${duration}s)"
    elif [ "$http_code" = "200" ]; then
        log_result "OVERSIZED_UPLOAD" "WARNING" "Large file accepted - no size limit (${duration}s)"
    else
        log_result "OVERSIZED_UPLOAD" "INFO" "Large file upload failed with code $http_code (${duration}s)"
    fi
fi

echo ""
echo -e "${CYAN}⚡ Phase 6: Race Condition & Concurrency Testing${NC}"
echo "=============================================="

# Test 10: Race condition in quote ID generation
echo "Test 6.1: Quote ID Race Condition Test"
echo "Testing concurrent quote submissions for ID collisions..."

pids=()
for i in {1..20}; do
    (
        response=$(curl -s -X POST "$BASE_URL/api/quotes" \
            -H "Content-Type: application/json" \
            -d '{"customerInfo":{"name":"RaceTest'$i'","email":"race'$i'@example.com","phone":"1234567890"},"customFields":{"material":"Steel","thickness":5,"qty":1}}')
        
        quote_id=$(echo "$response" | jq -r '.id // empty' 2>/dev/null)
        if [ -n "$quote_id" ]; then
            echo "$quote_id" >> "$LOG_DIR/quote_ids.tmp"
        fi
    ) &
    pids+=($!)
done

# Wait for all requests
for pid in "${pids[@]}"; do
    wait "$pid"
done

if [ -f "$LOG_DIR/quote_ids.tmp" ]; then
    total_ids=$(wc -l < "$LOG_DIR/quote_ids.tmp")
    unique_ids=$(sort "$LOG_DIR/quote_ids.tmp" | uniq | wc -l)
    
    if [ "$total_ids" -ne "$unique_ids" ]; then
        log_result "RACE_CONDITION_IDS" "CRITICAL" "ID collision detected: $total_ids total, $unique_ids unique"
    else
        log_result "RACE_CONDITION_IDS" "SUCCESS" "No ID collisions: $unique_ids unique IDs generated"
    fi
    
    rm -f "$LOG_DIR/quote_ids.tmp"
fi

echo ""
echo -e "${CYAN}🎯 Phase 7: Advanced Price Calculation Testing${NC}"
echo "============================================="

# Test 11: Edge cases in price calculation
echo "Test 7.1: Price Calculation Edge Cases"

edge_cases=(
    '{"qty": 0}'
    '{"qty": 999999999}'
    '{"qty": 1.5}'
    '{"qty": "invalid"}'
    '{"width": -100, "height": -200, "qty": 5}'
    '{"width": 999999, "height": 999999, "thickness": 999999, "qty": 999999}'
)

for case in "${edge_cases[@]}"; do
    payload="{\"customFields\": $case}"
    
    response=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/calculate-price" \
        -H "Content-Type: application/json" \
        -d "$payload")
    
    http_code="${response: -3}"
    body="${response%???}"
    
    # Check for various edge case issues
    if echo "$body" | jq -e '.price' > /dev/null 2>&1; then
        price=$(echo "$body" | jq -r '.price')
        if [ "$price" = "null" ] || [ "$price" = "Infinity" ] || [ "$price" = "-Infinity" ] || [ "$price" = "NaN" ]; then
            log_result "PRICE_EDGE_CASE" "WARNING" "Invalid price result for case: $case -> $price"
        elif (( $(echo "$price < 0" | bc -l) )); then
            log_result "PRICE_EDGE_CASE" "WARNING" "Negative price for case: $case -> $price"
        elif (( $(echo "$price > 1000000" | bc -l) )); then
            log_result "PRICE_EDGE_CASE" "WARNING" "Extremely high price for case: $case -> $price"
        else
            log_result "PRICE_EDGE_CASE" "SUCCESS" "Edge case handled: $case -> $price"
        fi
    else
        log_result "PRICE_EDGE_CASE" "SUCCESS" "Edge case rejected: $case"
    fi
done

# Cleanup test files
rm -rf "$TEST_DATA_DIR"

echo ""
echo -e "${PURPLE}📊 ADVANCED TESTING COMPLETE${NC}"
echo -e "${PURPLE}=============================${NC}"
echo "Advanced test log: $LOG_DIR/advanced-test.log"
echo "Completed: $(date)"
echo ""
echo -e "${YELLOW}⚠️  Please review the log file for critical and warning issues!${NC}"

# Generate summary
echo ""
echo -e "${CYAN}📋 QUICK SUMMARY${NC}"
echo "==============="

if [ -f "$LOG_DIR/advanced-test.log" ]; then
    critical_count=$(grep -c "CRITICAL" "$LOG_DIR/advanced-test.log" || echo "0")
    warning_count=$(grep -c "WARNING" "$LOG_DIR/advanced-test.log" || echo "0")
    success_count=$(grep -c "SUCCESS" "$LOG_DIR/advanced-test.log" || echo "0")
    
    echo -e "${RED}🚨 Critical Issues: $critical_count${NC}"
    echo -e "${YELLOW}⚠️  Warnings: $warning_count${NC}"
    echo -e "${GREEN}✅ Successful Tests: $success_count${NC}"
    
    if [ "$critical_count" -gt 0 ]; then
        echo ""
        echo -e "${RED}Critical Issues Found:${NC}"
        grep "CRITICAL" "$LOG_DIR/advanced-test.log" | while read line; do
            echo -e "${RED}  • ${line}${NC}"
        done
    fi
    
    if [ "$warning_count" -gt 0 ]; then
        echo ""
        echo -e "${YELLOW}Warnings Found:${NC}"
        grep "WARNING" "$LOG_DIR/advanced-test.log" | while read line; do
            echo -e "${YELLOW}  • ${line}${NC}"
        done
    fi
fi