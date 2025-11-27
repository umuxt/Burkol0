/**
 * Migration: Create materials.shipments table
 * 
 * This table stores finished products with F-suffix for shipment tracking.
 * F-suffix products are ONLY stored here, not in materials.materials table.
 * 
 * Flow: M-XXX (raw) → processed materials → XXX-F (shipments only)
 */

exports.up = async function(knex) {
  // Create shipments table in materials schema
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS materials.shipments (
      id SERIAL PRIMARY KEY,
      
      -- Product identification
      "productCode" VARCHAR(50) NOT NULL,        -- The F-suffix code (e.g., "ABC-123F")
      "baseProductCode" VARCHAR(50) NOT NULL,    -- The original code without F (e.g., "ABC-123")
      
      -- Quantity tracking
      quantity NUMERIC(12,4) NOT NULL DEFAULT 0, -- Total produced quantity
      "shippedQuantity" NUMERIC(12,4) NOT NULL DEFAULT 0, -- Already shipped
      "availableQuantity" NUMERIC(12,4) GENERATED ALWAYS AS (quantity - "shippedQuantity") STORED,
      
      -- Source tracking
      "planId" INTEGER REFERENCES mes.production_plans(id) ON DELETE SET NULL,
      "workOrderCode" VARCHAR(50),
      "nodeId" VARCHAR(100),                     -- The final node that produced this
      
      -- Product details (copied from last node output)
      description TEXT,
      unit VARCHAR(20) DEFAULT 'adet',
      
      -- Timestamps
      "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      "lastShipmentAt" TIMESTAMP WITH TIME ZONE,
      
      -- Constraints
      CONSTRAINT positive_quantities CHECK (quantity >= 0 AND "shippedQuantity" >= 0),
      CONSTRAINT shipped_not_exceed_total CHECK ("shippedQuantity" <= quantity)
    );
    
    -- Index for fast lookups
    CREATE INDEX IF NOT EXISTS idx_shipments_product_code ON materials.shipments("productCode");
    CREATE INDEX IF NOT EXISTS idx_shipments_base_code ON materials.shipments("baseProductCode");
    CREATE INDEX IF NOT EXISTS idx_shipments_plan_id ON materials.shipments("planId");
    CREATE INDEX IF NOT EXISTS idx_shipments_work_order ON materials.shipments("workOrderCode");
    
    -- Unique constraint: one record per productCode per workOrder
    CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_unique_product_order 
      ON materials.shipments("productCode", "workOrderCode") 
      WHERE "workOrderCode" IS NOT NULL;
    
    -- Comment
    COMMENT ON TABLE materials.shipments IS 'Finished products (F-suffix) ready for shipment. Only table containing F-suffix products.';
  `);
  
  console.log('✅ Created materials.shipments table');
};

exports.down = async function(knex) {
  await knex.raw(`
    DROP TABLE IF EXISTS materials.shipments CASCADE;
  `);
  
  console.log('✅ Dropped materials.shipments table');
};
