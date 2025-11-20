/**
 * Migration: Create PostgreSQL triggers for real-time notifications
 * 
 * Replaces Firebase real-time listeners with PostgreSQL LISTEN/NOTIFY.
 * Creates triggers that emit notifications when MES data changes.
 * 
 * Frontend can subscribe via Server-Sent Events (SSE):
 * - EventSource('/api/mes/stream/plans')
 * - EventSource('/api/mes/stream/assignments')
 * - EventSource('/api/mes/stream/workers')
 */

export function up(knex) {
  return knex.raw(`
    -- ========================================================================
    -- NOTIFICATION FUNCTIONS
    -- ========================================================================
    
    -- Notify production plan changes
    CREATE OR REPLACE FUNCTION mes.notify_plan_change()
    RETURNS TRIGGER AS $$
    DECLARE
      payload JSON;
    BEGIN
      -- Build notification payload
      payload := json_build_object(
        'operation', TG_OP,
        'table', TG_TABLE_NAME,
        'id', COALESCE(NEW.id, OLD.id),
        'planId', COALESCE(NEW.id, OLD.id),
        'status', COALESCE(NEW.status, OLD.status),
        'orderCode', COALESCE(NEW.work_order_code, OLD.work_order_code),
        'timestamp', extract(epoch from now())
      );
      
      -- Send notification
      PERFORM pg_notify('mes_plan_updates', payload::text);
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    
    -- Notify worker assignment changes
    CREATE OR REPLACE FUNCTION mes.notify_assignment_change()
    RETURNS TRIGGER AS $$
    DECLARE
      payload JSON;
    BEGIN
      payload := json_build_object(
        'operation', TG_OP,
        'table', TG_TABLE_NAME,
        'id', COALESCE(NEW.id, OLD.id),
        'planId', COALESCE(NEW.plan_id, OLD.plan_id),
        'nodeId', COALESCE(NEW.node_id, OLD.node_id),
        'workerId', COALESCE(NEW.worker_id, OLD.worker_id),
        'status', COALESCE(NEW.status, OLD.status),
        'timestamp', extract(epoch from now())
      );
      
      PERFORM pg_notify('mes_assignment_updates', payload::text);
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    
    -- Notify worker status changes
    CREATE OR REPLACE FUNCTION mes.notify_worker_change()
    RETURNS TRIGGER AS $$
    DECLARE
      payload JSON;
    BEGIN
      payload := json_build_object(
        'operation', TG_OP,
        'table', TG_TABLE_NAME,
        'id', COALESCE(NEW.id, OLD.id),
        'workerId', COALESCE(NEW.id, OLD.id),
        'status', COALESCE(NEW.status, OLD.status),
        'currentTaskPlanId', NEW.current_task_plan_id,
        'currentTaskNodeId', NEW.current_task_node_id,
        'timestamp', extract(epoch from now())
      );
      
      PERFORM pg_notify('mes_worker_updates', payload::text);
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    
    -- Notify production plan node changes
    CREATE OR REPLACE FUNCTION mes.notify_node_change()
    RETURNS TRIGGER AS $$
    DECLARE
      payload JSON;
    BEGIN
      payload := json_build_object(
        'operation', TG_OP,
        'table', TG_TABLE_NAME,
        'id', COALESCE(NEW.id, OLD.id),
        'nodeId', COALESCE(NEW.node_id, OLD.node_id),
        'planId', COALESCE(NEW.plan_id, OLD.plan_id),
        'timestamp', extract(epoch from now())
      );
      
      PERFORM pg_notify('mes_node_updates', payload::text);
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    
    -- Notify station/substation status changes
    CREATE OR REPLACE FUNCTION mes.notify_station_change()
    RETURNS TRIGGER AS $$
    DECLARE
      payload JSON;
    BEGIN
      payload := json_build_object(
        'operation', TG_OP,
        'table', TG_TABLE_NAME,
        'id', COALESCE(NEW.id, OLD.id),
        'stationId', COALESCE(NEW.id, OLD.id),
        'status', COALESCE(NEW.status, OLD.status),
        'currentOperation', NEW.current_operation,
        'timestamp', extract(epoch from now())
      );
      
      PERFORM pg_notify('mes_station_updates', payload::text);
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    
    -- ========================================================================
    -- TRIGGERS
    -- ========================================================================
    
    -- Production plans
    CREATE TRIGGER plan_change_trigger
    AFTER INSERT OR UPDATE OR DELETE ON mes.production_plans
    FOR EACH ROW EXECUTE FUNCTION mes.notify_plan_change();
    
    -- Worker assignments
    CREATE TRIGGER assignment_change_trigger
    AFTER INSERT OR UPDATE OR DELETE ON mes.worker_assignments
    FOR EACH ROW EXECUTE FUNCTION mes.notify_assignment_change();
    
    -- Workers
    CREATE TRIGGER worker_change_trigger
    AFTER INSERT OR UPDATE OR DELETE ON mes.workers
    FOR EACH ROW EXECUTE FUNCTION mes.notify_worker_change();
    
    -- Production plan nodes
    CREATE TRIGGER node_change_trigger
    AFTER INSERT OR UPDATE OR DELETE ON mes.production_plan_nodes
    FOR EACH ROW EXECUTE FUNCTION mes.notify_node_change();
    
    -- Substations
    CREATE TRIGGER substation_change_trigger
    AFTER INSERT OR UPDATE OR DELETE ON mes.substations
    FOR EACH ROW EXECUTE FUNCTION mes.notify_station_change();
    
    -- ========================================================================
    -- COMMENTS
    -- ========================================================================
    
    COMMENT ON FUNCTION mes.notify_plan_change() IS 
      'Emits PostgreSQL notification on mes_plan_updates channel when production plan changes';
    COMMENT ON FUNCTION mes.notify_assignment_change() IS 
      'Emits PostgreSQL notification on mes_assignment_updates channel when assignment changes';
    COMMENT ON FUNCTION mes.notify_worker_change() IS 
      'Emits PostgreSQL notification on mes_worker_updates channel when worker status changes';
    COMMENT ON FUNCTION mes.notify_node_change() IS 
      'Emits PostgreSQL notification on mes_node_updates channel when node changes';
    COMMENT ON FUNCTION mes.notify_station_change() IS 
      'Emits PostgreSQL notification on mes_station_updates channel when station/substation changes';
  `);
}

export function down(knex) {
  return knex.raw(`
    -- Drop triggers
    DROP TRIGGER IF EXISTS substation_change_trigger ON mes.substations;
    DROP TRIGGER IF EXISTS node_change_trigger ON mes.production_plan_nodes;
    DROP TRIGGER IF EXISTS worker_change_trigger ON mes.workers;
    DROP TRIGGER IF EXISTS assignment_change_trigger ON mes.worker_assignments;
    DROP TRIGGER IF EXISTS plan_change_trigger ON mes.production_plans;
    
    -- Drop functions
    DROP FUNCTION IF EXISTS mes.notify_station_change();
    DROP FUNCTION IF EXISTS mes.notify_node_change();
    DROP FUNCTION IF EXISTS mes.notify_worker_change();
    DROP FUNCTION IF EXISTS mes.notify_assignment_change();
    DROP FUNCTION IF EXISTS mes.notify_plan_change();
  `);
}
