/**
 * Migration: Create PostgreSQL sequences for MES counter system
 * 
 * Replaces Firebase atomic counters with PostgreSQL sequences:
 * - mes-counters.doc('work-orders') → mes.work_order_counter
 * - mes-counters.doc('plan-MMYY') → mes.production_plan_counter (monthly reset)
 * 
 * Also creates helper functions to generate formatted codes:
 * - generate_work_order_code() → 'WO-YYYYMMDD-XXX'
 * - generate_production_plan_code() → 'PPL-MMYY-XXX'
 */

export function up(knex) {
  return knex.raw(`
    -- Create sequences
    CREATE SEQUENCE IF NOT EXISTS mes.work_order_counter START 1;
    CREATE SEQUENCE IF NOT EXISTS mes.production_plan_counter START 1;
    
    -- Create function to generate work order codes
    -- Format: WO-YYYYMMDD-XXX (e.g., WO-20250115-001)
    CREATE OR REPLACE FUNCTION mes.generate_work_order_code()
    RETURNS VARCHAR(100) AS $$
    DECLARE
      date_str VARCHAR(8);
      next_num INTEGER;
    BEGIN
      date_str := TO_CHAR(NOW(), 'YYYYMMDD');
      next_num := nextval('mes.work_order_counter');
      RETURN 'WO-' || date_str || '-' || LPAD(next_num::TEXT, 3, '0');
    END;
    $$ LANGUAGE plpgsql;
    
    -- Create function to generate production plan codes
    -- Format: PPL-MMYY-XXX (e.g., PPL-0125-001)
    -- Auto-resets counter when month changes
    CREATE OR REPLACE FUNCTION mes.generate_production_plan_code()
    RETURNS VARCHAR(100) AS $$
    DECLARE
      month_year VARCHAR(4);
      next_num INTEGER;
      last_plan_month VARCHAR(4);
    BEGIN
      month_year := TO_CHAR(NOW(), 'MMYY');
      
      -- Check if there are any plans for this month
      SELECT SUBSTRING(id FROM 5 FOR 4) INTO last_plan_month
      FROM mes.mes_production_plans
      WHERE id LIKE 'PPL-' || month_year || '-%'
      ORDER BY created_at DESC
      LIMIT 1;
      
      -- Reset counter if new month or no plans found
      IF last_plan_month IS NULL OR last_plan_month != month_year THEN
        PERFORM setval('mes.production_plan_counter', 1, false);
      END IF;
      
      next_num := nextval('mes.production_plan_counter');
      RETURN 'PPL-' || month_year || '-' || LPAD(next_num::TEXT, 3, '0');
    END;
    $$ LANGUAGE plpgsql;
    
    -- Create function to generate work package IDs
    -- Format: {workOrderCode}-XXX (e.g., WO-20250115-001-001)
    CREATE OR REPLACE FUNCTION mes.generate_work_package_id(work_order_code VARCHAR)
    RETURNS VARCHAR(100) AS $$
    DECLARE
      next_num INTEGER;
    BEGIN
      -- Count existing assignments for this work order
      SELECT COUNT(*) + 1 INTO next_num
      FROM mes.mes_worker_assignments
      WHERE work_order_code = $1;
      
      RETURN work_order_code || '-' || LPAD(next_num::TEXT, 3, '0');
    END;
    $$ LANGUAGE plpgsql;
    
    -- Grant execute permissions
    GRANT EXECUTE ON FUNCTION mes.generate_work_order_code() TO PUBLIC;
    GRANT EXECUTE ON FUNCTION mes.generate_production_plan_code() TO PUBLIC;
    GRANT EXECUTE ON FUNCTION mes.generate_work_package_id(VARCHAR) TO PUBLIC;
    
    -- Grant usage on sequences
    GRANT USAGE, SELECT ON SEQUENCE mes.work_order_counter TO PUBLIC;
    GRANT USAGE, SELECT ON SEQUENCE mes.production_plan_counter TO PUBLIC;
    
    -- Add comment
    COMMENT ON FUNCTION mes.generate_work_order_code() IS 
      'Generates next work order code in format WO-YYYYMMDD-XXX';
    COMMENT ON FUNCTION mes.generate_production_plan_code() IS 
      'Generates next production plan code in format PPL-MMYY-XXX (resets monthly)';
    COMMENT ON FUNCTION mes.generate_work_package_id(VARCHAR) IS 
      'Generates work package ID by appending sequence to work order code';
  `);
}

export function down(knex) {
  return knex.raw(`
    -- Drop functions
    DROP FUNCTION IF EXISTS mes.generate_work_package_id(VARCHAR);
    DROP FUNCTION IF EXISTS mes.generate_production_plan_code();
    DROP FUNCTION IF EXISTS mes.generate_work_order_code();
    
    -- Drop sequences
    DROP SEQUENCE IF EXISTS mes.production_plan_counter;
    DROP SEQUENCE IF EXISTS mes.work_order_counter;
  `);
}
