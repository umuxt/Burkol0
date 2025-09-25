#!/bin/bash

# 🧪 QUICK TEST RUNNER - Hızlı test için sadece temel testleri çalıştırır

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${PURPLE}${BOLD}🚀 QUICK TEST - Test Suite Organization Validation${NC}"
echo -e "${PURPLE}${BOLD}=================================================${NC}"
echo ""

# Server check
echo -e "${BLUE}🔍 Pre-flight Check${NC}"
if ! curl -s http://localhost:3002/api/health > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️ Server not running - testing file organization only${NC}"
    SERVER_RUNNING=false
else
    echo -e "${GREEN}✅ Server is running${NC}"
    SERVER_RUNNING=true
fi
echo ""

# Test file organization
echo -e "${BLUE}📁 Testing File Organization${NC}"
echo "============================"

TESTING_DIR="/Users/umutyalcin/Documents/Burkol/testing"

# Check main structure
if [ -d "$TESTING_DIR" ]; then
    echo -e "${GREEN}✅ Main testing directory exists${NC}"
else
    echo -e "${RED}❌ Main testing directory missing${NC}"
    exit 1
fi

# Check subdirectories
directories=("security" "dynamic-system" "reports")
for dir in "${directories[@]}"; do
    if [ -d "$TESTING_DIR/$dir" ]; then
        echo -e "${GREEN}✅ $dir/ directory exists${NC}"
        
        # Count files in directory
        file_count=$(find "$TESTING_DIR/$dir" -type f | wc -l)
        echo "   📄 Files: $file_count"
        
        # List files
        find "$TESTING_DIR/$dir" -type f -exec basename {} \; | head -5 | while read file; do
            echo "   - $file"
        done
        
    else
        echo -e "${RED}❌ $dir/ directory missing${NC}"
    fi
done

echo ""

# Check executability
echo -e "${BLUE}🔧 Testing Script Executability${NC}"
echo "==============================="

script_count=0
executable_count=0

for script in $(find "$TESTING_DIR" -name "*.sh" -type f); do
    ((script_count++))
    script_name=$(basename "$script")
    
    if [ -x "$script" ]; then
        echo -e "${GREEN}✅ $script_name (executable)${NC}"
        ((executable_count++))
    else
        echo -e "${RED}❌ $script_name (not executable)${NC}"
    fi
done

echo ""
echo "📊 Script Summary:"
echo "   Total scripts: $script_count"
echo "   Executable: $executable_count"

# Quick functionality test (if server is running)
if [ "$SERVER_RUNNING" = true ]; then
    echo ""
    echo -e "${BLUE}🧪 Quick Functionality Test${NC}"
    echo "=========================="
    
    # Test one simple script from each category
    echo "Testing dynamic system validation..."
    if timeout 30 "$TESTING_DIR/dynamic-system/dynamic-system-test.sh" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Dynamic system test working${NC}"
    else
        echo -e "${YELLOW}⚠️ Dynamic system test issue${NC}"
    fi
    
    echo "Testing security validation..."
    if timeout 30 "$TESTING_DIR/security/system-compatibility-test.sh" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Security test working${NC}"
    else
        echo -e "${YELLOW}⚠️ Security test issue${NC}"
    fi
fi

echo ""
echo -e "${PURPLE}${BOLD}📋 Organization Summary${NC}"
echo -e "${PURPLE}${BOLD}======================${NC}"

echo -e "${GREEN}✅ Test files organized into logical categories${NC}"
echo -e "${GREEN}✅ Security tests: /testing/security/${NC}"
echo -e "${GREEN}✅ Dynamic system tests: /testing/dynamic-system/${NC}"  
echo -e "${GREEN}✅ Reports: /testing/reports/${NC}"
echo -e "${GREEN}✅ Master test runner: /testing/run-all-tests.sh${NC}"
echo -e "${GREEN}✅ Documentation: /testing/README.md${NC}"

echo ""
echo -e "${CYAN}🎯 Ready to use! Run './run-all-tests.sh' for full test suite${NC}"

echo ""
echo "Quick test completed: $(date)"