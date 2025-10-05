# 📋 BURKOL QUOTE PORTAL - COMPREHENSIVE USE CASES & TEST PLAN

## 🎯 Overview
This document outlines comprehensive use cases for both user and admin sides of the Burkol Quote Portal system, along with testing strategies and expected outcomes.

## 👤 USER SIDE USE CASES

### Use Case 1: New Quote Submission
**Actor:** Customer/Client  
**Goal:** Submit a new metal fabrication quote request  
**Preconditions:** User has project requirements and technical specifications  

**Main Flow:**
1. User navigates to quote portal homepage
2. Fills out quote form with project details:
   - Personal information (name, email, phone)
   - Project name and description
   - Material type (Çelik, Alüminyum, Paslanmaz Çelik)
   - Thickness specifications
   - Quantity requirements
   - Additional notes
3. Uploads technical drawings (optional)
4. Reviews price calculation preview
5. Submits quote request
6. Receives confirmation with quote ID

**Expected Results:**
- Quote saved to database with unique ID
- Price automatically calculated based on formula
- Email notification sent (if configured)
- Quote appears in admin dashboard

**Test Commands:**
```bash
# Test quote submission
curl -X POST http://localhost:3002/api/quotes \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@burkol.com",
    "phone": "+905551234567",
    "proj": "Metal Fabrication Project",
    "customFields": {
      "material": "Çelik",
      "thickness": 10,
      "qty": 25,
      "notes": "Laser cutting required"
    }
  }'
```

### Use Case 2: Price Estimation
**Actor:** Customer/Client  
**Goal:** Get real-time price estimation for their project  
**Preconditions:** Form configuration and pricing formulas are set up  

**Main Flow:**
1. User enters project specifications
2. System calculates price based on:
   - Base cost parameters
   - Material type multipliers
   - Quantity factors
   - Processing requirements
3. Price updates dynamically as user modifies inputs
4. User sees breakdown of pricing components

**Expected Results:**
- Accurate price calculation based on current settings
- Real-time updates as parameters change
- Price breakdown visibility
- Integration with quote submission

**Test Commands:**
```bash
# Test price calculation
curl -X POST http://localhost:3002/api/calculate-price \
  -H "Content-Type: application/json" \
  -d '{
    "customFields": {
      "material": "Alüminyum",
      "thickness": 5,
      "qty": 30
    }
  }'
```

### Use Case 3: Form Configuration Loading
**Actor:** Customer/Client  
**Goal:** Access properly configured quote form  
**Preconditions:** Admin has configured form structure  

**Main Flow:**
1. User visits quote portal
2. System loads dynamic form configuration
3. Form renders with appropriate fields, validation rules, and options
4. User interacts with form elements
5. Validation provides real-time feedback

**Expected Results:**
- Form loads with current configuration
- All required fields are marked appropriately
- Dropdown options populated correctly
- Validation rules enforced

**Test Commands:**
```bash
# Test form configuration retrieval
curl -X GET http://localhost:3002/api/form-config
```

## 👨‍💼 ADMIN SIDE USE CASES

### Use Case 4: Admin Authentication & Access Control
**Actor:** System Administrator  
**Goal:** Secure access to admin functionality  
**Preconditions:** Admin account exists in system  

**Main Flow:**
1. Admin navigates to admin panel (`/quote-dashboard.html`)
2. Enters credentials (email and password)
3. System validates credentials and role
4. JWT token issued for session management
5. Admin gains access to management features

**Expected Results:**
- Successful authentication with valid credentials
- Session management with JWT tokens
- Role-based access control enforcement
- Secure redirect to admin dashboard

**Test Commands:**
```bash
# Test admin authentication
curl -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "umutyalcin8@gmail.com",
    "password": "burkol123"
  }'
```

### Use Case 5: Quote Management & Status Updates
**Actor:** System Administrator  
**Goal:** Manage incoming quotes and update their status  
**Preconditions:** Admin is authenticated and quotes exist in system  

**Main Flow:**
1. Admin views list of all submitted quotes
2. Filters and searches quotes based on criteria
3. Reviews individual quote details
4. Updates quote status (new → review → approved/rejected)
5. Adds internal notes or comments
6. Generates reports and exports

**Expected Results:**
- Complete quote list with search/filter capabilities
- Status update functionality working
- Quote details accessible and editable
- Audit trail of status changes

**Test Commands:**
```bash
# Get authentication token first
TOKEN=$(curl -s -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "umutyalcin8@gmail.com", "password": "burkol123"}' | jq -r '.token')

# Test quote list retrieval
curl -X GET http://localhost:3002/api/quotes \
  -H "Authorization: Bearer $TOKEN"

# Test quote status update
curl -X PATCH http://localhost:3002/api/quotes/QUOTE_ID/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "review"}'
```

### Use Case 6: User Management
**Actor:** System Administrator  
**Goal:** Manage system users and their access rights  
**Preconditions:** Admin has appropriate permissions  

**Main Flow:**
1. Admin accesses user management section
2. Views list of existing users
3. Creates new admin users with credentials
4. Modifies user roles and permissions
5. Activates/deactivates user accounts
6. Resets passwords when needed

**Expected Results:**
- User list with role information
- User creation with proper validation
- Role assignment functionality
- Account status management

**Test Commands:**
```bash
# Test user list retrieval
curl -X GET http://localhost:3002/api/auth/users \
  -H "Authorization: Bearer $TOKEN"

# Test user creation
curl -X POST http://localhost:3002/api/auth/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newadmin@burkol.com",
    "password": "securepass123",
    "role": "admin"
  }'
```

### Use Case 7: System Configuration Management
**Actor:** System Administrator  
**Goal:** Configure pricing formulas and form structure  
**Preconditions:** Admin has system configuration access  

**Main Flow:**
1. Admin accesses settings panel
2. Modifies pricing formula parameters:
   - Base costs
   - Material multipliers
   - Labor rates
   - Margin calculations
3. Updates form configuration:
   - Field definitions
   - Validation rules
   - Display options
4. Tests configuration changes
5. Publishes updated configuration

**Expected Results:**
- Price settings update successfully
- Form configuration changes applied
- System uses new parameters for calculations
- Changes reflect immediately in user interface

**Test Commands:**
```bash
# Test price settings update
curl -X POST http://localhost:3002/api/price-settings \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "version": 2,
    "formula": "(base_cost + (qty * unit_cost)) * margin",
    "parameters": [
      {"id": "base_cost", "name": "Baz Maliyet", "type": "fixed", "value": 300},
      {"id": "unit_cost", "name": "Birim İşçilik", "type": "fixed", "value": 50},
      {"id": "margin", "name": "Kar Marjı", "type": "fixed", "value": 1.30}
    ]
  }'

# Test form configuration update
curl -X POST http://localhost:3002/api/form-config \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "formStructure": {
      "fields": [
        {
          "id": "material",
          "label": "Malzeme Türü", 
          "type": "dropdown",
          "required": true,
          "options": ["Çelik", "Alüminyum", "Paslanmaz Çelik"]
        }
      ]
    }
  }'
```

## 🧪 COMPREHENSIVE TEST SCENARIOS

### Scenario 1: End-to-End Quote Processing
**Objective:** Test complete quote lifecycle from submission to approval

**Steps:**
1. User submits quote with complete information
2. Admin receives and reviews quote
3. Admin updates status through various stages
4. Price calculations remain consistent
5. System maintains data integrity

### Scenario 2: Security & Access Control
**Objective:** Verify security measures and access restrictions

**Steps:**
1. Test unauthorized access attempts
2. Verify token expiration handling
3. Test role-based access restrictions
4. Validate input sanitization
5. Check for SQL injection protection

### Scenario 3: Performance & Load Testing
**Objective:** Ensure system handles concurrent users and requests

**Steps:**
1. Submit multiple quotes simultaneously
2. Test admin panel under load
3. Measure response times for key operations
4. Monitor memory and CPU usage
5. Verify data consistency under load

### Scenario 4: Error Handling & Recovery
**Objective:** Test system resilience and error handling

**Steps:**
1. Submit invalid data and verify rejection
2. Test server restart recovery
3. Simulate database connection issues
4. Test file upload error scenarios
5. Verify graceful degradation

## 📊 SUCCESS METRICS

### User Experience Metrics
- Quote submission completion rate > 95%
- Price calculation accuracy 100%
- Form validation feedback < 2 seconds
- File upload success rate > 98%

### Admin Efficiency Metrics
- Quote review time < 5 minutes average
- User management tasks < 30 seconds
- Configuration updates applied immediately
- Report generation < 10 seconds

### Technical Performance Metrics
- API response time < 500ms average
- Database query time < 100ms average
- Concurrent user support > 50 users
- System uptime > 99.5%

### Security Metrics
- Zero unauthorized access incidents
- All inputs properly sanitized
- Token expiration properly enforced
- Audit trail completeness 100%

## 🔧 TESTING TOOLS & COMMANDS

### Manual Testing Commands
```bash
# Run comprehensive test suite
./comprehensive-test.sh

# Individual test components
curl -X GET http://localhost:3002/api/test  # Health check
curl -X GET http://localhost:3002/api/quotes  # Data retrieval
curl -X POST http://localhost:3002/api/auth/login  # Authentication
```

### Automated Test Execution
```bash
# Start the system test
cd /Users/umutyalcin/Documents/Burkol
./comprehensive-test.sh

# View results
cat logs/user-test.log
cat logs/admin-test.log
cat logs/performance-test.log
cat test-summary-report.md
```

### Log Analysis Commands
```bash
# Monitor server logs
tail -f quote-portal/server.log

# Check error patterns
grep -i error logs/*.log

# Performance analysis
grep "response time" logs/performance-test.log
```

## 📈 CONTINUOUS IMPROVEMENT

### Monitoring Setup
- Implement automated health checks
- Set up performance monitoring dashboards
- Configure alert systems for failures
- Regular backup verification

### Testing Strategy
- Daily automated test runs
- Weekly load testing
- Monthly security audits
- Quarterly full system review

### Documentation Maintenance
- Keep use cases updated with feature changes
- Document new test scenarios
- Maintain troubleshooting guides
- Update performance baselines

---

**Last Updated:** $(date)  
**Version:** 1.0  
**Contact:** System Administrator