-- ============================================================================
-- FULL MES & MATERIALS DATA CLEANUP
-- ============================================================================

BEGIN;

-- MES SCHEMA CLEANUP
TRUNCATE TABLE mes.assignment_material_reservations CASCADE;
TRUNCATE TABLE mes.worker_assignments CASCADE;
TRUNCATE TABLE mes.production_plan_nodes CASCADE;
TRUNCATE TABLE mes.node_material_inputs CASCADE;
TRUNCATE TABLE mes.node_predecessors CASCADE;
TRUNCATE TABLE mes.node_stations CASCADE;
TRUNCATE TABLE mes.production_plans CASCADE;

-- Reset substations to available (camelCase columns!)
UPDATE mes.substations SET 
  status = 'available',
  "currentAssignmentId" = NULL,
  "assignedWorkerId" = NULL,
  "currentOperation" = NULL,
  "reservedAt" = NULL,
  "updatedAt" = NOW();

-- MATERIALS SCHEMA CLEANUP
TRUNCATE TABLE materials.stock_movements CASCADE;

-- Reset all material stocks to 0
UPDATE materials.materials SET 
  stock = 0,
  reserved = 0,
  "wipReserved" = 0;

-- Delete scrap materials (codes ending with -H)
DELETE FROM materials.materials WHERE code LIKE '%-H';

-- Delete semi-finished and finished products
DELETE FROM materials.materials WHERE type IN ('semi_finished', 'finished_product');

-- SUMMARY
DO $$
DECLARE
  assignments_count INTEGER;
  plans_count INTEGER;
  movements_count INTEGER;
  substations_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO assignments_count FROM mes.worker_assignments;
  SELECT COUNT(*) INTO plans_count FROM mes.production_plans;
  SELECT COUNT(*) INTO movements_count FROM materials.stock_movements;
  SELECT COUNT(*) INTO substations_count FROM mes.substations WHERE status = 'available';
  
  RAISE NOTICE '============================================';
  RAISE NOTICE '✅ CLEANUP COMPLETED SUCCESSFULLY';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Worker Assignments: % (should be 0)', assignments_count;
  RAISE NOTICE 'Production Plans: % (should be 0)', plans_count;
  RAISE NOTICE 'Stock Movements: % (should be 0)', movements_count;
  RAISE NOTICE 'Substations Available: %', substations_count;
  RAISE NOTICE 'Raw Materials: Stock reset to 0';
  RAISE NOTICE 'Scrap/WIP Materials: Deleted';
  RAISE NOTICE '============================================';
END $$;

COMMIT;
