#!/bin/bash

# 🧪 MASTER TEST RUNNER - Tüm testleri çalıştıran ana script
# Bu script tüm test kategorilerini sırayla çalıştırır

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

TESTING_DIR="/Users/umutyalcin/Documents/Burkol/testing"
LOG_FILE="$TESTING_DIR/test-results-$(date +%Y%m%d-%H%M%S).log"

echo -e "${PURPLE}${BOLD}🧪 BURKOL QUOTE PORTAL - MASTER TEST SUITE${NC}"
echo -e "${PURPLE}${BOLD}===========================================${NC}"
echo ""

# Server check
echo -e "${BLUE}🔍 Pre-flight Checks${NC}"
echo "===================="

if ! curl -s http://localhost:3002/api/health > /dev/null 2>&1; then
    echo -e "${RED}❌ Server is not running on port 3002${NC}"
    echo "Please start the server first: cd quote-portal && node server.js"
    exit 1
fi

echo -e "${GREEN}✅ Server is running${NC}"
echo ""

# Log başlat
echo "BURKOL QUOTE PORTAL TEST RESULTS" > "$LOG_FILE"
echo "=================================" >> "$LOG_FILE"
echo "Test Date: $(date)" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# Test kategorileri
declare -A test_categories=(
    ["security"]="🔒 Security Tests"
    ["dynamic-system"]="🏗️ Dynamic System Tests"
)

total_tests=0
passed_tests=0
failed_tests=0

for category in "${!test_categories[@]}"; do
    echo -e "${BLUE}${BOLD}${test_categories[$category]}${NC}"
    echo "$(printf '=%.0s' {1..50})"
    
    category_dir="$TESTING_DIR/$category"
    
    if [ ! -d "$category_dir" ]; then
        echo -e "${RED}❌ Category directory not found: $category_dir${NC}"
        continue
    fi
    
    echo "Category: ${test_categories[$category]}" >> "$LOG_FILE"
    echo "$(printf '=%.0s' {1..30})" >> "$LOG_FILE"
    
    # Bu kategorideki tüm test scriptlerini çalıştır
    for test_script in "$category_dir"/*.sh; do
        if [ -f "$test_script" ]; then
            test_name=$(basename "$test_script" .sh)
            echo -e "${CYAN}🧪 Running: $test_name${NC}"
            
            # Test çalıştır ve output'u logla
            if timeout 300 "$test_script" >> "$LOG_FILE" 2>&1; then
                echo -e "${GREEN}✅ PASSED: $test_name${NC}"
                echo "PASSED: $test_name" >> "$LOG_FILE"
                ((passed_tests++))
            else
                echo -e "${RED}❌ FAILED: $test_name${NC}"
                echo "FAILED: $test_name" >> "$LOG_FILE"
                ((failed_tests++))
            fi
            
            ((total_tests++))
            echo "" >> "$LOG_FILE"
        fi
    done
    
    echo ""
done

# Özet rapor
echo -e "${PURPLE}${BOLD}📊 TEST SUMMARY${NC}"
echo -e "${PURPLE}${BOLD}===============${NC}"
echo -e "${BLUE}Total Tests: $total_tests${NC}"
echo -e "${GREEN}Passed: $passed_tests${NC}"
echo -e "${RED}Failed: $failed_tests${NC}"

success_rate=0
if [ $total_tests -gt 0 ]; then
    success_rate=$((passed_tests * 100 / total_tests))
fi

echo -e "${CYAN}Success Rate: $success_rate%${NC}"

# Log'a özet ekle
echo "" >> "$LOG_FILE"
echo "TEST SUMMARY" >> "$LOG_FILE"
echo "============" >> "$LOG_FILE"
echo "Total Tests: $total_tests" >> "$LOG_FILE"
echo "Passed: $passed_tests" >> "$LOG_FILE"
echo "Failed: $failed_tests" >> "$LOG_FILE"
echo "Success Rate: $success_rate%" >> "$LOG_FILE"

echo ""
echo -e "${CYAN}📋 Detailed log saved to: $LOG_FILE${NC}"

# Başarı durumuna göre exit code
if [ $failed_tests -eq 0 ]; then
    echo -e "${GREEN}${BOLD}🎉 All tests passed successfully!${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️ Some tests failed. Check the log for details.${NC}"
    exit 1
fi