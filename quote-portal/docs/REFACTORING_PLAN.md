# 🚀 Firebase Cleanup & Backend Refactoring Plan

## 📋 Overview
Remove `stockMovements` and `orderItemCounters` from Firebase and move logic to backend.

## 🎯 Goals
- ✅ Remove unnecessary Firebase collections
- ✅ Move counter logic to backend  
- ✅ Simplify order/stock management
- ✅ Keep auditLogs for critical events
- ✅ Backend handles stock updates on delivery

## 📊 Current Analysis

### 🗂️ Files Using `stockMovements`:
- `src/firebase-config.js` - Collection definition
- `src/lib/firestore-schemas.js` - Collection definition  
- `src/lib/materials-service.js` - StockMovements CRUD operations
- `firestore.rules` - Security rules

### 🗂️ Files Using `orderItemCounters`:
- `src/lib/orders-service.js` - generateItemCodes function
- `functions/index.js` - Cloud Functions (will be removed)

### 🗂️ Files Using `ORDER_ITEMS` collection:
- Multiple files in orders-service.js - Will be refactored

## 🔧 Refactoring Steps

### Phase 1: Backend Counter Implementation
**Target:** Move orderItemCounter logic to backend

1. **Create backend endpoint for order creation**
   - Generate item codes server-side
   - Use in-memory or database sequence
   - Return complete order with item codes

2. **Update order creation flow**
   - Frontend calls backend API
   - Backend generates codes and saves to Firebase
   - No more separate orderItemCounters collection

### Phase 2: Remove stockMovements
**Target:** Eliminate stockMovements collection entirely

1. **Remove stockMovements references**
   - Clean from firebase-config.js
   - Remove from firestore-schemas.js
   - Delete stockMovements methods in materials-service.js

2. **Keep stock info in materials only**
   - Use material.lastStockUpdate for recent activity
   - Use auditLogs for critical stock events

### Phase 3: Backend Stock Management
**Target:** Handle stock updates via backend API

1. **Create stock update endpoint**
   - `/api/orders/:orderId/items/:itemId/deliver`
   - Backend updates material.stock directly
   - Creates auditLog entry if significant

2. **Remove Cloud Functions**
   - Delete functions/index.js
   - All stock logic moves to backend APIs

### Phase 4: orderItems Structure Decision
**Target:** Decide on embedded vs separate collection

Option A: Keep orderItems separate (current)
Option B: Embed items in orders.items array

**Recommendation:** Keep separate for now, can optimize later

## 🚧 Implementation Order

### Step 1: Analyze Current Dependencies ✅
### Step 2: Create Backend Counter Logic
### Step 3: Remove stockMovements References  
### Step 4: Update Stock Management
### Step 5: Remove Cloud Functions
### Step 6: Clean Firebase Schema
### Step 7: Test & Validate

## 🔍 Files to Modify

### High Priority:
1. `src/lib/orders-service.js` - Remove orderItemCounters
2. `src/lib/materials-service.js` - Remove stockMovements  
3. `server.js` - Add new backend endpoints
4. `functions/index.js` - Delete file
5. `src/firebase-config.js` - Clean collections

### Medium Priority:
6. `firestore.rules` - Remove unused collections
7. `src/lib/firestore-schemas.js` - Clean schemas
8. Frontend components using these services

## ⚠️ Risks & Considerations

1. **Data Migration**: Existing stockMovements data
2. **In-flight Orders**: Orders with pending items
3. **Frontend Dependencies**: Components expecting current structure
4. **Testing**: Ensure no regression in order flow

## 🧪 Testing Strategy

1. **Unit Tests**: New backend counter logic
2. **Integration Tests**: Order creation flow  
3. **E2E Tests**: Complete order-to-delivery flow
4. **Data Consistency**: Stock accuracy validation

## 📅 Timeline Estimate

- **Phase 1**: 2-3 hours (Backend counter)
- **Phase 2**: 1-2 hours (Remove stockMovements)  
- **Phase 3**: 2-3 hours (Backend stock management)
- **Phase 4**: 1 hour (Cloud Functions removal)
- **Testing**: 2-3 hours
- **Total**: 8-12 hours

Would you like to start with any specific phase?