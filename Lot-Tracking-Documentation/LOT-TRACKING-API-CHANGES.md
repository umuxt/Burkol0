# 🌐 LOT TRACKING - API CHANGES DOCUMENTATION

**Version:** Phase 1+2 (v1.0)  
**Date:** 20 Kasım 2025  
**Status:** ✅ Ready for Implementation

---

## 📊 OVERVIEW

This document details all API endpoint changes for the lot tracking system. Phase 1+2 implementation modifies 2 existing endpoints and creates 2 new endpoints.

**Summary:**
- **2 endpoints modified** (order delivery, production start)
- **2 endpoints created** (material lots, lot preview)
- **All changes backward compatible** (lot fields optional)

---

## 🔄 MODIFIED ENDPOINTS

### 1. POST /api/orders/:orderCode/items/:itemId/deliver

**Purpose:** Deliver order items with optional lot tracking information

**File:** `WebApp/server/ordersRoutes.js`

**Status:** ✅ Ready for modification

---

#### Request Changes

**New Optional Fields:**

```javascript
{
  // Existing fields (unchanged)
  "quantity": 500,                    // Required
  "deliveryDate": "2025-11-20",       // Optional
  
  // NEW: Lot tracking fields (all optional)
  "supplierLotCode": "BATCH-2025-789",     // Supplier's batch/lot code
  "manufacturingDate": "2025-11-15",        // Production date (ISO 8601)
  "expiryDate": "2026-11-15"                // Expiration date (ISO 8601)
}
```

**Field Specifications:**

| Field | Type | Required | Max Length | Validation |
|-------|------|----------|------------|------------|
| supplierLotCode | string | No | 100 | - |
| manufacturingDate | string (date) | No | - | Must be ≤ today |
| expiryDate | string (date) | No | - | Must be > today, > manufacturingDate |

**Backward Compatibility:** ✅ All lot fields are optional. Existing clients can continue sending requests without lot data.

---

#### Response Changes

**New Fields:**

```javascript
{
  // Existing fields (unchanged)
  "success": true,
  "message": "Order item delivered successfully",
  "orderCode": "ORD-001",
  "itemId": 123,
  "materialCode": "M-00-001",
  "quantity": 500,
  
  // NEW: Auto-generated lot number
  "lotNumber": "LOT-M-00-001-20251120-001",
  
  // NEW: Enhanced success message
  "message": "Delivered 500 kg with lot tracking - Lot: LOT-M-00-001-20251120-001"
}
```

**Field Specifications:**

| Field | Type | Always Present | Description |
|-------|------|----------------|-------------|
| lotNumber | string | Yes (if lot tracking used) | Auto-generated lot number |
| message | string | Yes | Includes lot number if generated |

---

#### Behavior Changes

**Auto-Lot Generation:**
- System automatically generates lot number using format: `LOT-{materialCode}-{YYYYMMDD}-{sequence}`
- Sequence increments for same material + same day
- Example: `LOT-M-00-001-20251120-001`, `LOT-M-00-001-20251120-002`

**Database Updates:**
1. Creates stock_movement (type='in') with lot fields:
   - lot_number (auto-generated)
   - lot_date (delivery date)
   - supplier_lot_code (from request)
   - manufacturing_date (from request)
   - expiry_date (from request)

2. Updates order_items table:
   - lot_number
   - supplier_lot_code
   - manufacturing_date
   - expiry_date

**Error Handling:**

```javascript
// Invalid manufacturing date (future date)
{
  "success": false,
  "error": "Manufacturing date cannot be in the future",
  "field": "manufacturingDate"
}

// Invalid expiry date (before manufacturing)
{
  "success": false,
  "error": "Expiry date must be after manufacturing date",
  "field": "expiryDate"
}
```

---

#### Example Requests/Responses

**Example 1: Order delivery WITH lot tracking**

```http
POST /api/orders/ORD-001/items/123/deliver
Content-Type: application/json

{
  "quantity": 500,
  "supplierLotCode": "SUPPLIER-BATCH-789",
  "manufacturingDate": "2025-11-15",
  "expiryDate": "2026-11-15"
}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "orderCode": "ORD-001",
  "itemId": 123,
  "materialCode": "M-00-001",
  "quantity": 500,
  "lotNumber": "LOT-M-00-001-20251120-001",
  "message": "Delivered 500 kg with lot tracking - Lot: LOT-M-00-001-20251120-001"
}
```

---

**Example 2: Order delivery WITHOUT lot tracking (backward compatible)**

```http
POST /api/orders/ORD-001/items/456/deliver
Content-Type: application/json

{
  "quantity": 200
}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "orderCode": "ORD-001",
  "itemId": 456,
  "materialCode": "M-00-002",
  "quantity": 200,
  "lotNumber": "LOT-M-00-002-20251120-001",
  "message": "Delivered 200 pcs with lot tracking - Lot: LOT-M-00-002-20251120-001"
}
```

**Note:** Lot number still generated even without supplier lot data. All lot fields except lot_number and lot_date will be NULL.

---

### 2. POST /api/mes/assignments/:assignmentId/start

**Purpose:** Start production task with FIFO lot consumption

**File:** `WebApp/server/mesRoutes.js`

**Status:** ✅ Ready for modification

---

#### Request Changes

**No request body changes.** Endpoint behavior changes internally.

```http
POST /api/mes/assignments/WO-001-001/start
Content-Type: application/json

{
  // No changes - request body unchanged
}
```

---

#### Response Changes

**New Fields:**

```javascript
{
  // Existing fields (unchanged)
  "success": true,
  "assignmentId": "WO-001-001",
  "taskName": "Kesme",
  "workerName": "Ali Yılmaz",
  "startTime": "2025-11-20T10:30:00Z",
  "status": "in_progress",
  
  // NEW: Lot consumption details
  "lotsConsumed": [
    {
      "materialCode": "M-00-001",
      "materialName": "Çelik Sac",
      "requiredQty": 100,
      "reservedQty": 100,
      "lotsUsed": [
        {
          "lotNumber": "LOT-M-00-001-20251101-001",
          "lotDate": "2025-11-01",
          "consumedQty": 50,
          "expiryDate": "2026-11-01"
        },
        {
          "lotNumber": "LOT-M-00-001-20251115-001",
          "lotDate": "2025-11-15",
          "consumedQty": 50,
          "expiryDate": null
        }
      ]
    }
  ],
  
  // NEW: Warnings for partial reservations
  "warnings": []
}
```

**Field Specifications:**

| Field | Type | Always Present | Description |
|-------|------|----------------|-------------|
| lotsConsumed | array | Yes | List of materials with lot consumption details |
| lotsConsumed[].materialCode | string | Yes | Material code |
| lotsConsumed[].materialName | string | Yes | Material name |
| lotsConsumed[].requiredQty | number | Yes | Quantity required by task |
| lotsConsumed[].reservedQty | number | Yes | Quantity actually reserved |
| lotsConsumed[].lotsUsed | array | Yes | Lots consumed (FIFO order) |
| lotsConsumed[].lotsUsed[].lotNumber | string | Yes | Lot number consumed |
| lotsConsumed[].lotsUsed[].lotDate | string | Yes | Lot receipt date |
| lotsConsumed[].lotsUsed[].consumedQty | number | Yes | Quantity consumed from this lot |
| lotsConsumed[].lotsUsed[].expiryDate | string | No | Expiry date (if available) |
| warnings | array | Yes | Warnings (e.g., partial reservations) |

---

#### Behavior Changes

**FIFO Lot Consumption:**
1. Queries available lots (ORDER BY lot_date ASC, created_at ASC)
2. Consumes from oldest lot first
3. Creates stock_movements (type='out') for each lot consumed
4. Records lot_number in assignment_material_reservations
5. Updates assignment status to 'in_progress'

**Multi-Lot Consumption:**
- If required quantity > single lot balance, consumes from multiple lots
- Example: Need 100 kg, Lot 1 has 50 kg, Lot 2 has 50 kg → consumes from both

**Partial Reservation Handling:**
- If insufficient stock, reserves maximum available
- Sets partial_reservation = true in stock_movements
- Includes warning in response
- Task still starts (with warning)

**Transaction Guarantees:**
- SERIALIZABLE isolation level
- Atomic transaction (all materials reserved or none)
- Rollback on any error

---

#### Error Handling

```javascript
// Error: No stock available
{
  "success": false,
  "error": "Insufficient stock for materials: M-00-001",
  "details": [
    {
      "materialCode": "M-00-001",
      "requiredQty": 100,
      "availableQty": 0
    }
  ]
}

// Error: No lots available
{
  "success": false,
  "error": "No active lots available for material M-00-001",
  "materialCode": "M-00-001"
}
```

---

#### Example Requests/Responses

**Example 1: Start task with FIFO lot consumption (full reservation)**

```http
POST /api/mes/assignments/WO-001-001/start
Content-Type: application/json

{}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "assignmentId": "WO-001-001",
  "taskName": "Kesme",
  "startTime": "2025-11-20T10:30:00Z",
  "status": "in_progress",
  "lotsConsumed": [
    {
      "materialCode": "M-00-001",
      "materialName": "Çelik Sac",
      "requiredQty": 100,
      "reservedQty": 100,
      "lotsUsed": [
        {
          "lotNumber": "LOT-M-00-001-20251101-001",
          "lotDate": "2025-11-01",
          "consumedQty": 50,
          "expiryDate": "2026-11-01"
        },
        {
          "lotNumber": "LOT-M-00-001-20251115-001",
          "lotDate": "2025-11-15",
          "consumedQty": 50,
          "expiryDate": null
        }
      ]
    }
  ],
  "warnings": []
}
```

---

**Example 2: Start task with partial reservation (insufficient stock)**

```http
POST /api/mes/assignments/WO-002-001/start
Content-Type: application/json

{}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "assignmentId": "WO-002-001",
  "taskName": "Montaj",
  "startTime": "2025-11-20T11:00:00Z",
  "status": "in_progress",
  "lotsConsumed": [
    {
      "materialCode": "M-00-002",
      "materialName": "Alüminyum Profil",
      "requiredQty": 100,
      "reservedQty": 80,
      "lotsUsed": [
        {
          "lotNumber": "LOT-M-00-002-20251118-001",
          "lotDate": "2025-11-18",
          "consumedQty": 80,
          "expiryDate": null
        }
      ]
    }
  ],
  "warnings": [
    "⚠️ Partial reservation: Material M-00-002 requested 100, reserved 80 (shortfall: 20)"
  ]
}
```

---

## ✨ NEW ENDPOINTS

### 3. GET /api/materials/:code/lots

**Purpose:** Get lot-level inventory for specific material

**File:** `WebApp/server/materialsRoutes.js`

**Status:** ✅ Ready for implementation

---

#### Request

```http
GET /api/materials/M-00-001/lots
```

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| code | string | Yes | Material code (e.g., M-00-001) |

**Query Parameters:** None

---

#### Response

```javascript
{
  "success": true,
  "materialCode": "M-00-001",
  "materialName": "Çelik Sac",
  "totalLots": 3,
  "totalBalance": 450.5,
  "lots": [
    {
      "lotNumber": "LOT-M-00-001-20251101-001",
      "lotDate": "2025-11-01",
      "supplierLotCode": "SUP-BATCH-001",
      "manufacturingDate": "2025-10-25",
      "expiryDate": "2026-10-25",
      "lotBalance": 150.5,
      "lotStatus": "active",
      "fifoOrder": 1                            // #1 = will be consumed first
    },
    {
      "lotNumber": "LOT-M-00-001-20251115-001",
      "lotDate": "2025-11-15",
      "supplierLotCode": "SUP-BATCH-002",
      "manufacturingDate": "2025-11-10",
      "expiryDate": "2025-12-15",
      "lotBalance": 200.0,
      "lotStatus": "expiring_soon",             // <30 days to expiry
      "fifoOrder": 2
    },
    {
      "lotNumber": "LOT-M-00-001-20251120-001",
      "lotDate": "2025-11-20",
      "supplierLotCode": null,
      "manufacturingDate": null,
      "expiryDate": null,
      "lotBalance": 100.0,
      "lotStatus": "active",
      "fifoOrder": 3
    }
  ]
}
```

**Field Specifications:**

| Field | Type | Always Present | Description |
|-------|------|----------------|-------------|
| success | boolean | Yes | Request success status |
| materialCode | string | Yes | Material code |
| materialName | string | Yes | Material name |
| totalLots | number | Yes | Total number of active lots |
| totalBalance | number | Yes | Sum of all lot balances |
| lots | array | Yes | Array of lot objects (FIFO order) |
| lots[].lotNumber | string | Yes | Unique lot number |
| lots[].lotDate | string | Yes | Lot receipt date (ISO 8601) |
| lots[].supplierLotCode | string | No | Supplier's batch code |
| lots[].manufacturingDate | string | No | Manufacturing date (ISO 8601) |
| lots[].expiryDate | string | No | Expiration date (ISO 8601) |
| lots[].lotBalance | number | Yes | Current lot balance (quantity) |
| lots[].lotStatus | string | Yes | active, expiring_soon, expired |
| lots[].fifoOrder | number | Yes | FIFO consumption order (1 = first) |

**Lot Status Values:**
- `active` - Normal lot, not expiring soon
- `expiring_soon` - Expires within 30 days
- `expired` - Expiry date has passed

**FIFO Order:**
- Lots sorted by lot_date ASC
- fifoOrder = 1 → will be consumed first
- fifoOrder = 2 → will be consumed second
- etc.

---

#### SQL Query

```sql
SELECT 
  sm.lot_number,
  sm.lot_date,
  sm.supplier_lot_code,
  sm.manufacturing_date,
  sm.expiry_date,
  SUM(CASE WHEN sm.type='in' THEN sm.quantity ELSE -sm.quantity END) as lot_balance,
  CASE
    WHEN sm.expiry_date < CURRENT_DATE THEN 'expired'
    WHEN sm.expiry_date < CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
    ELSE 'active'
  END as lot_status,
  ROW_NUMBER() OVER (PARTITION BY sm.material_code ORDER BY sm.lot_date) as fifo_order
FROM materials.stock_movements sm
WHERE sm.material_code = :code AND sm.lot_number IS NOT NULL
GROUP BY sm.lot_number, sm.lot_date, sm.supplier_lot_code, 
         sm.manufacturing_date, sm.expiry_date, sm.material_code
HAVING SUM(CASE WHEN sm.type='in' THEN sm.quantity ELSE -sm.quantity END) > 0
ORDER BY sm.lot_date ASC;
```

**Performance:** Uses `idx_fifo_lots` index (material_code, lot_date, type)

---

#### Error Handling

```javascript
// Error: Material not found
{
  "success": false,
  "error": "Material not found: M-99-999",
  "materialCode": "M-99-999"
}

// Success: Material exists but no lots
{
  "success": true,
  "materialCode": "M-00-003",
  "materialName": "Vida M8",
  "totalLots": 0,
  "totalBalance": 0,
  "lots": []
}
```

---

#### Example Requests/Responses

**Example 1: Get lots for material with multiple lots**

```http
GET /api/materials/M-00-001/lots
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "materialCode": "M-00-001",
  "materialName": "Çelik Sac",
  "totalLots": 2,
  "totalBalance": 350.5,
  "lots": [
    {
      "lotNumber": "LOT-M-00-001-20251101-001",
      "lotDate": "2025-11-01",
      "supplierLotCode": "BATCH-001",
      "manufacturingDate": "2025-10-25",
      "expiryDate": "2026-10-25",
      "lotBalance": 150.5,
      "lotStatus": "active",
      "fifoOrder": 1
    },
    {
      "lotNumber": "LOT-M-00-001-20251115-001",
      "lotDate": "2025-11-15",
      "supplierLotCode": null,
      "manufacturingDate": null,
      "expiryDate": null,
      "lotBalance": 200.0,
      "lotStatus": "active",
      "fifoOrder": 2
    }
  ]
}
```

---

**Example 2: Get lots for material with no lots**

```http
GET /api/materials/M-00-999/lots
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "materialCode": "M-00-999",
  "materialName": "Test Material",
  "totalLots": 0,
  "totalBalance": 0,
  "lots": []
}
```

---

### 4. GET /api/mes/assignments/:assignmentId/lot-preview

**Purpose:** Preview which lots will be consumed (read-only, no reservation)

**File:** `WebApp/server/mesRoutes.js` (line 8680)

**Status:** ✅ Endpoint already exists!

---

#### Request

```http
GET /api/mes/assignments/WO-001-001/lot-preview
```

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| assignmentId | string | Yes | Worker assignment ID (e.g., WO-001-001) |

**Query Parameters:** None

---

#### Response

```javascript
{
  "success": true,
  "assignmentId": "WO-001-001",
  "taskName": "Kesme",
  "materials": [
    {
      "materialCode": "M-00-001",
      "materialName": "Çelik Sac",
      "requiredQty": 100,
      "availableQty": 100,
      "lotsToConsume": [
        {
          "lotNumber": "LOT-M-00-001-20251101-001",
          "lotDate": "2025-11-01",
          "lotBalance": 150.5,
          "consumeQty": 50,
          "expiryDate": "2026-11-01",
          "fifoOrder": 1
        },
        {
          "lotNumber": "LOT-M-00-001-20251115-001",
          "lotDate": "2025-11-15",
          "lotBalance": 200.0,
          "consumeQty": 50,
          "expiryDate": null,
          "fifoOrder": 2
        }
      ],
      "shortfall": 0
    }
  ],
  "warnings": []
}
```

**Field Specifications:**

| Field | Type | Always Present | Description |
|-------|------|----------------|-------------|
| success | boolean | Yes | Request success status |
| assignmentId | string | Yes | Worker assignment ID |
| taskName | string | Yes | Task name |
| materials | array | Yes | List of materials required |
| materials[].materialCode | string | Yes | Material code |
| materials[].materialName | string | Yes | Material name |
| materials[].requiredQty | number | Yes | Quantity required by task |
| materials[].availableQty | number | Yes | Quantity available in stock |
| materials[].lotsToConsume | array | Yes | Lots that will be consumed (FIFO) |
| materials[].lotsToConsume[].lotNumber | string | Yes | Lot number |
| materials[].lotsToConsume[].lotDate | string | Yes | Lot receipt date |
| materials[].lotsToConsume[].lotBalance | number | Yes | Current lot balance |
| materials[].lotsToConsume[].consumeQty | number | Yes | Qty to consume from this lot |
| materials[].lotsToConsume[].expiryDate | string | No | Expiry date (if available) |
| materials[].lotsToConsume[].fifoOrder | number | Yes | FIFO order (1 = first) |
| materials[].shortfall | number | Yes | Quantity shortage (0 = no shortage) |
| warnings | array | Yes | Warnings (e.g., shortfall) |

---

#### Behavior

**Read-Only:**
- Does NOT reserve materials
- Does NOT create stock movements
- Does NOT update assignment status
- Only calculates which lots WOULD be consumed

**FIFO Calculation:**
- Same logic as actual reservation
- Shows lots in consumption order (oldest first)
- Shows partial consumption from lots

**Use Case:**
- Worker portal preview before starting task
- Shows which lots will be used
- Alerts if insufficient stock

---

#### Error Handling

```javascript
// Error: Assignment not found
{
  "success": false,
  "error": "Assignment not found: WO-999-999",
  "assignmentId": "WO-999-999"
}

// Error: Assignment already started
{
  "success": false,
  "error": "Assignment already in progress",
  "assignmentId": "WO-001-001",
  "status": "in_progress"
}
```

---

#### Example Requests/Responses

**Example 1: Preview with sufficient stock**

```http
GET /api/mes/assignments/WO-001-001/lot-preview
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "assignmentId": "WO-001-001",
  "taskName": "Kesme",
  "materials": [
    {
      "materialCode": "M-00-001",
      "materialName": "Çelik Sac",
      "requiredQty": 100,
      "availableQty": 350,
      "lotsToConsume": [
        {
          "lotNumber": "LOT-M-00-001-20251101-001",
          "lotDate": "2025-11-01",
          "lotBalance": 150,
          "consumeQty": 100,
          "expiryDate": "2026-11-01",
          "fifoOrder": 1
        }
      ],
      "shortfall": 0
    }
  ],
  "warnings": []
}
```

---

**Example 2: Preview with insufficient stock (shortfall)**

```http
GET /api/mes/assignments/WO-002-001/lot-preview
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "assignmentId": "WO-002-001",
  "taskName": "Montaj",
  "materials": [
    {
      "materialCode": "M-00-002",
      "materialName": "Alüminyum Profil",
      "requiredQty": 100,
      "availableQty": 80,
      "lotsToConsume": [
        {
          "lotNumber": "LOT-M-00-002-20251118-001",
          "lotDate": "2025-11-18",
          "lotBalance": 80,
          "consumeQty": 80,
          "expiryDate": null,
          "fifoOrder": 1
        }
      ],
      "shortfall": 20
    }
  ],
  "warnings": [
    "⚠️ Insufficient stock: Material M-00-002 has shortfall of 20 (required: 100, available: 80)"
  ]
}
```

---

## 🔄 BACKWARD COMPATIBILITY

### Principle: All Lot Fields Optional

**Design Decision:** Lot tracking is opt-in, not mandatory.

**Implications:**

1. **Order Delivery:**
   - Can be called without lot fields → works as before
   - Lot number still auto-generated, but supplier lot fields NULL
   - Existing clients don't need changes

2. **Production Start:**
   - Works even if materials don't have lot tracking
   - If lot_number is NULL, consumption still works (aggregated stock)
   - New lotsConsumed field always present (empty array if no lots)

3. **Material Lots:**
   - Returns empty array if material has no lots
   - Does NOT error if material exists but no lot tracking

4. **Lot Preview:**
   - Shows empty lotsToConsume if no lots available
   - Still shows requiredQty and availableQty

---

### Migration Strategy

**Phase 1: Enable lot tracking for new orders**
- Clients can optionally send lot fields
- System generates lot numbers
- No breaking changes

**Phase 2: Backfill existing stock**
```sql
UPDATE materials.stock_movements
SET lot_number = 'LEGACY-' || TO_CHAR(movement_date, 'YYYY-MM-DD') || '-' || id,
    lot_date = movement_date::DATE
WHERE type = 'in' AND lot_number IS NULL;
```

**Phase 3: Full lot tracking**
- All deliveries tracked by lot
- FIFO consumption active
- Lot reports available

---

## 📊 DATA TYPES & VALIDATION

### Date Formats

**All dates use ISO 8601 format:**
- Request: `"2025-11-20"` (YYYY-MM-DD)
- Response: `"2025-11-20T10:30:00Z"` (ISO 8601 with timezone)

**Validation:**
- manufacturingDate ≤ today
- expiryDate > today
- expiryDate > manufacturingDate

---

### Lot Number Format

**Pattern:** `LOT-{materialCode}-{YYYYMMDD}-{sequence}`

**Examples:**
- `LOT-M-00-001-20251120-001`
- `LOT-RAW-MAT-005-20251201-002`
- `LOT-FIN-PROD-010-20251220-010`

**Validation:**
- Auto-generated by server (cannot be manually set via API)
- Unique per material + date + sequence
- Max length: 100 characters

---

### Quantity Types

**All quantities use DECIMAL(15,3):**
- Supports up to 999,999,999,999.999
- 3 decimal places for precision
- JSON format: `100.500` (number type)

---

## 🔐 AUTHENTICATION & AUTHORIZATION

**No changes to authentication.**

All endpoints require existing authentication:
- JWT token in Authorization header
- Role-based access control (unchanged)

**Permissions:**
- Order delivery: Requires `orders:write` permission
- Production start: Requires `mes:write` permission
- Material lots: Requires `materials:read` permission
- Lot preview: Requires `mes:read` permission

---

## 📈 PERFORMANCE CONSIDERATIONS

### Critical Index

**FIFO Lot Query Performance:**
```sql
CREATE INDEX idx_fifo_lots ON materials.stock_movements(
  material_code, lot_date, type
) WHERE type='in' AND lot_number IS NOT NULL;
```

**Query Performance:**
- Lot inventory query: <100ms (indexed)
- FIFO consumption: <50ms (indexed)
- Lot preview: <100ms (read-only, no transaction)

---

### Caching Recommendations

**Material lots (GET /api/materials/:code/lots):**
- Cache for 5-10 seconds (inventory changes frequently)
- Invalidate on order delivery or production start

**Lot preview (GET /api/mes/assignments/:assignmentId/lot-preview):**
- Cache for 30-60 seconds (preview unlikely to change quickly)
- Invalidate on any stock movement

---

## 🐛 ERROR CODES

| HTTP Code | Error Type | Description |
|-----------|------------|-------------|
| 200 | Success | Request successful |
| 400 | Bad Request | Invalid request body (validation error) |
| 404 | Not Found | Material/Assignment not found |
| 409 | Conflict | Insufficient stock, assignment already started |
| 500 | Internal Error | Database error, transaction failure |

---

## 📚 ADDITIONAL RESOURCES

**Related Documentation:**
- Implementation Guide: `LOT-TRACKING-IMPLEMENTATION-COMPLETED.md`
- Database Schema: `LOT-TRACKING-DATABASE-SCHEMA.md` (to be created)
- User Guide (Turkish): `LOT-TRACKING-USER-GUIDE-TR.md` (to be created)
- Test Report: `LOT-TRACKING-STEP-14-TEST-REPORT.md`

**Code References:**
- Lot Generator: `WebApp/server/utils/lotGenerator.js`
- Lot Consumption: `WebApp/server/utils/lotConsumption.js`
- Orders Routes: `WebApp/server/ordersRoutes.js`
- MES Routes: `WebApp/server/mesRoutes.js`
- Materials Routes: `WebApp/server/materialsRoutes.js`

---

## ✅ SUMMARY

**API Changes Complete:**
- ✅ 2 endpoints modified (backward compatible)
- ✅ 2 endpoints created (new functionality)
- ✅ All lot fields optional (no breaking changes)
- ✅ FIFO logic documented
- ✅ Error handling specified
- ✅ Performance optimized (indexed queries)

**Next Steps:**
1. Implement endpoint modifications
2. Test with Postman/curl
3. Update API documentation portal
4. Train frontend developers on new fields
5. Deploy to staging environment

---

**Version:** Phase 1+2 (v1.0)  
**Status:** ✅ Ready for Implementation  
**Date:** 20 Kasım 2025
