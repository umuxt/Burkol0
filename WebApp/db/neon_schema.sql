--
-- PostgreSQL database dump
--

\restrict YN38SNTcfSxyk5ikZ6xyJjHTQp0GgGSHXTfZKJQSa1HktWnZPNR7cc1QcLlb51b

-- Dumped from database version 15.15 (Homebrew)
-- Dumped by pg_dump version 15.15 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: address_data; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA address_data;


--
-- Name: SCHEMA address_data; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA address_data IS 'Türkiye adres verileri - il, ilçe, semt, mahalle, posta kodu';


--
-- Name: materials; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA materials;


--
-- Name: mes; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA mes;


--
-- Name: quotes; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA quotes;


--
-- Name: settings; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA settings;


--
-- Name: calculate_shipment_item_totals(); Type: FUNCTION; Schema: materials; Owner: -
--

CREATE FUNCTION materials.calculate_shipment_item_totals() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    withholding_rate DECIMAL(5,4);
    net_subtotal DECIMAL(15,2);
BEGIN
    -- 1. Ara toplam (miktar * birim fiyat)
    NEW."subtotal" := COALESCE(NEW."unitPrice", 0) * COALESCE(NEW.quantity, 0);
    
    -- 2. Satır iskontosu
    IF COALESCE(NEW."discountPercent", 0) > 0 THEN
        NEW."discountAmount" := NEW."subtotal" * (NEW."discountPercent" / 100.0);
    ELSE
        NEW."discountAmount" := COALESCE(NEW."discountAmount", 0);
    END IF;
    
    -- 3. Net ara toplam (iskonto sonrası)
    net_subtotal := NEW."subtotal" - COALESCE(NEW."discountAmount", 0);
    
    -- 4. KDV hesabı (muafiyet varsa 0)
    IF NEW."vatExemptionId" IS NOT NULL THEN
        NEW."taxAmount" := 0;
    ELSE
        NEW."taxAmount" := net_subtotal * (COALESCE(NEW."taxRate", 20) / 100.0);
    END IF;
    
    -- 5. Tevkifat hesabı
    IF NEW."withholdingRateId" IS NOT NULL THEN
        SELECT rate INTO withholding_rate 
        FROM materials.withholding_rates 
        WHERE id = NEW."withholdingRateId";
        NEW."withholdingAmount" := NEW."taxAmount" * COALESCE(withholding_rate, 0);
    ELSE
        NEW."withholdingAmount" := 0;
    END IF;
    
    -- 6. Satır toplam (net + kdv - tevkifat)
    NEW."totalAmount" := net_subtotal + NEW."taxAmount" - COALESCE(NEW."withholdingAmount", 0);
    
    RETURN NEW;
END;
$$;


--
-- Name: generate_order_code(integer); Type: FUNCTION; Schema: materials; Owner: -
--

CREATE FUNCTION materials.generate_order_code(order_year integer) RETURNS character varying
    LANGUAGE plpgsql
    AS $$
      DECLARE
        sequence_name TEXT;
        next_sequence INTEGER;
        order_code VARCHAR;
      BEGIN
        -- Determine full sequence name with schema
        sequence_name := 'materials.order_sequence_' || order_year::TEXT;
        
        -- Get next sequence value (create sequence if doesn't exist)
        BEGIN
          EXECUTE 'SELECT nextval(' || quote_literal(sequence_name) || ')' INTO next_sequence;
        EXCEPTION WHEN undefined_table THEN
          EXECUTE 'CREATE SEQUENCE ' || sequence_name || ' START 1';
          EXECUTE 'SELECT nextval(' || quote_literal(sequence_name) || ')' INTO next_sequence;
        END;
        
        -- Format: ORD-2025-0001
        order_code := 'ORD-' || order_year::TEXT || '-' || LPAD(next_sequence::TEXT, 4, '0');
        
        RETURN order_code;
      END;
      $$;


--
-- Name: increment_template_usage(integer); Type: FUNCTION; Schema: materials; Owner: -
--

CREATE FUNCTION materials.increment_template_usage(template_id integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE materials.shipment_templates
    SET 
        "usageCount" = "usageCount" + 1,
        "lastUsedAt" = NOW()
    WHERE id = template_id;
END;
$$;


--
-- Name: update_material_lot_summary(); Type: FUNCTION; Schema: materials; Owner: -
--

CREATE FUNCTION materials.update_material_lot_summary() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_material_code VARCHAR(50);
BEGIN
  -- Determine which material to update
  IF TG_OP = 'DELETE' THEN
    v_material_code := OLD."materialCode";
  ELSE
    v_material_code := NEW."materialCode";
  END IF;
  
  -- Update materials table with fresh lot summary
  UPDATE materials.materials
  SET 
    "activeLotCount" = (
      -- Count distinct active lots (with positive balance)
      SELECT COUNT(DISTINCT "lotNumber")
      FROM materials.stock_movements
      WHERE "materialCode" = v_material_code
        AND "lotNumber" IS NOT NULL
        AND type = 'in'
    ),
    "oldestLotDate" = (
      -- Find oldest lot date from active lots
      SELECT MIN("lotDate")
      FROM materials.stock_movements
      WHERE "materialCode" = v_material_code
        AND "lotNumber" IS NOT NULL
        AND type = 'in'
    ),
    "nearestExpiryDate" = (
      -- Find nearest expiry date from active lots
      SELECT MIN("expiryDate")
      FROM materials.stock_movements
      WHERE "materialCode" = v_material_code
        AND "lotNumber" IS NOT NULL
        AND "expiryDate" IS NOT NULL
        AND type = 'in'
    )
  WHERE code = v_material_code;
  
  RETURN NEW;
END;
$$;


--
-- Name: update_service_cards_timestamp(); Type: FUNCTION; Schema: materials; Owner: -
--

CREATE FUNCTION materials.update_service_cards_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_shipment_templates_timestamp(); Type: FUNCTION; Schema: materials; Owner: -
--

CREATE FUNCTION materials.update_shipment_templates_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: generate_production_plan_code(); Type: FUNCTION; Schema: mes; Owner: -
--

CREATE FUNCTION mes.generate_production_plan_code() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
    DECLARE
      month_year VARCHAR(4);
      next_num INTEGER;
      last_plan_month VARCHAR(4);
    BEGIN
      month_year := TO_CHAR(NOW(), 'MMYY');
      
      -- Check if there are any plans for this month
      SELECT SUBSTRING(id FROM 5 FOR 4) INTO last_plan_month
      FROM mes.production_plans
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
    $$;


--
-- Name: FUNCTION generate_production_plan_code(); Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON FUNCTION mes.generate_production_plan_code() IS 'Generates next production plan code in format PPL-MMYY-XXX (resets monthly)';


--
-- Name: generate_work_order_code(); Type: FUNCTION; Schema: mes; Owner: -
--

CREATE FUNCTION mes.generate_work_order_code() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
    DECLARE
      date_str VARCHAR(8);
      next_num INTEGER;
    BEGIN
      date_str := TO_CHAR(NOW(), 'YYYYMMDD');
      next_num := nextval('mes.work_order_counter');
      RETURN 'WO-' || date_str || '-' || LPAD(next_num::TEXT, 3, '0');
    END;
    $$;


--
-- Name: FUNCTION generate_work_order_code(); Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON FUNCTION mes.generate_work_order_code() IS 'Generates next work order code in format WO-YYYYMMDD-XXX';


--
-- Name: generate_work_package_id(character varying); Type: FUNCTION; Schema: mes; Owner: -
--

CREATE FUNCTION mes.generate_work_package_id(work_order_code character varying) RETURNS character varying
    LANGUAGE plpgsql
    AS $_$
    DECLARE
      next_num INTEGER;
    BEGIN
      -- Count existing assignments for this work order
      SELECT COUNT(*) + 1 INTO next_num
      FROM mes.worker_assignments
      WHERE work_order_code = $1;
      
      RETURN work_order_code || '-' || LPAD(next_num::TEXT, 3, '0');
    END;
    $_$;


--
-- Name: FUNCTION generate_work_package_id(work_order_code character varying); Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON FUNCTION mes.generate_work_package_id(work_order_code character varying) IS 'Generates work package ID by appending sequence to work order code';


--
-- Name: notify_assignment_change(); Type: FUNCTION; Schema: mes; Owner: -
--

CREATE FUNCTION mes.notify_assignment_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  payload JSON;
BEGIN
  payload := json_build_object(
    'operation', TG_OP,
    'table', TG_TABLE_NAME,
    'id', COALESCE(NEW.id, OLD.id),
    'planId', COALESCE(NEW."planId", OLD."planId"),
    'nodeId', COALESCE(NEW."nodeId", OLD."nodeId"),
    'workerId', COALESCE(NEW."workerId", OLD."workerId"),
    'status', COALESCE(NEW.status, OLD.status),
    'timestamp', extract(epoch from now())
  );
  
  PERFORM pg_notify('mes_assignment_updates', payload::text);
  
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION notify_assignment_change(); Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON FUNCTION mes.notify_assignment_change() IS 'Emits PostgreSQL notification on mes_assignment_updates channel when assignment changes';


--
-- Name: notify_node_change(); Type: FUNCTION; Schema: mes; Owner: -
--

CREATE FUNCTION mes.notify_node_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  payload JSON;
BEGIN
  payload := json_build_object(
    'operation', TG_OP,
    'table', TG_TABLE_NAME,
    'id', COALESCE(NEW.id, OLD.id),
    'nodeId', COALESCE(NEW."nodeId", OLD."nodeId"),
    'planId', COALESCE(NEW."planId", OLD."planId"),
    'timestamp', extract(epoch from now())
  );
  
  PERFORM pg_notify('mes_node_updates', payload::text);
  
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION notify_node_change(); Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON FUNCTION mes.notify_node_change() IS 'Emits PostgreSQL notification on mes_node_updates channel when node changes';


--
-- Name: notify_plan_change(); Type: FUNCTION; Schema: mes; Owner: -
--

CREATE FUNCTION mes.notify_plan_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  payload JSON;
BEGIN
  payload := json_build_object(
    'operation', TG_OP,
    'table', TG_TABLE_NAME,
    'id', COALESCE(NEW.id, OLD.id),
    'planId', COALESCE(NEW.id, OLD.id),
    'status', COALESCE(NEW.status, OLD.status),
    'orderCode', COALESCE(NEW."workOrderCode", OLD."workOrderCode"),
    'timestamp', extract(epoch from now())
  );
  
  PERFORM pg_notify('mes_plan_updates', payload::text);
  
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION notify_plan_change(); Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON FUNCTION mes.notify_plan_change() IS 'Emits PostgreSQL notification on mes_plan_updates channel when production plan changes';


--
-- Name: notify_station_change(); Type: FUNCTION; Schema: mes; Owner: -
--

CREATE FUNCTION mes.notify_station_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  payload JSON;
BEGIN
  payload := json_build_object(
    'operation', TG_OP,
    'table', TG_TABLE_NAME,
    'id', COALESCE(NEW.id, OLD.id),
    'stationId', COALESCE(NEW.id, OLD.id),
    'status', COALESCE(NEW.status, OLD.status),
    'currentOperation', NEW."currentOperation",
    'timestamp', extract(epoch from now())
  );
  
  PERFORM pg_notify('mes_station_updates', payload::text);
  
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION notify_station_change(); Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON FUNCTION mes.notify_station_change() IS 'Emits PostgreSQL notification on mes_station_updates channel when station/substation changes';


--
-- Name: notify_worker_change(); Type: FUNCTION; Schema: mes; Owner: -
--

CREATE FUNCTION mes.notify_worker_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  payload JSON;
BEGIN
  payload := json_build_object(
    'operation', TG_OP,
    'table', TG_TABLE_NAME,
    'id', COALESCE(NEW.id, OLD.id),
    'workerId', COALESCE(NEW.id, OLD.id),
    'isActive', NEW."isActive",
    'currentTaskPlanId', NEW."currentTaskPlanId",
    'currentTaskNodeId', NEW."currentTaskNodeId",
    'timestamp', extract(epoch from now())
  );
  
  PERFORM pg_notify('mes_worker_updates', payload::text);
  
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION notify_worker_change(); Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON FUNCTION mes.notify_worker_change() IS 'Emits PostgreSQL notification on mes_worker_updates channel when worker status changes';


--
-- Name: notify_station_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_station_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      payload JSON;
    BEGIN
      -- Handle both stations (status field) and substations (is_active field)
      payload := json_build_object(
        'operation', TG_OP,
        'table', TG_TABLE_NAME,
        'id', COALESCE(NEW.id, OLD.id),
        'stationId', COALESCE(NEW.id, OLD.id),
        'status', COALESCE(NEW.status, CASE WHEN NEW.is_active THEN 'active' ELSE 'inactive' END),
        'currentOperation', NEW.current_operation,
        'timestamp', extract(epoch from now())
      );
      
      PERFORM pg_notify('mes_station_updates', payload::text);
      
      RETURN NEW;
    END;
    $$;


--
-- Name: notify_substation_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_substation_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      payload JSON;
    BEGIN
      payload := json_build_object(
        'operation', TG_OP,
        'table', 'substations',
        'id', COALESCE(NEW.id, OLD.id),
        'substationId', COALESCE(NEW.id, OLD.id),
        'stationId', COALESCE(NEW."stationId", OLD."stationId"),
        'isActive', COALESCE(NEW."isActive", OLD."isActive"),
        'timestamp', extract(epoch from now())
      );
     
      PERFORM pg_notify('mes_substation_updates', payload::text);
     
      RETURN NEW;
    END;
    $$;


--
-- Name: calculate_quote_item_totals(); Type: FUNCTION; Schema: quotes; Owner: -
--

CREATE FUNCTION quotes.calculate_quote_item_totals() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
        withholding_rate DECIMAL(5,4);
    BEGIN
        -- KDV istisnası varsa taxRate = 0
        IF NEW."vatExemptionId" IS NOT NULL THEN
            NEW."taxRate" := 0;
        END IF;
        
        -- 1. Ara toplam
        NEW."subtotal" := COALESCE(NEW."unitPrice", 0) * COALESCE(NEW.quantity, 0);
        
        -- 2. İskonto
        NEW."discountAmount" := NEW."subtotal" * (COALESCE(NEW."discountPercent", 0) / 100.0);
        
        -- 3. KDV matrahı
        NEW."taxableAmount" := NEW."subtotal" - COALESCE(NEW."discountAmount", 0);
        
        -- 4. KDV tutarı
        NEW."taxAmount" := NEW."taxableAmount" * (COALESCE(NEW."taxRate", 0) / 100.0);
        
        -- 5. Toplam
        NEW."totalAmount" := NEW."taxableAmount" + NEW."taxAmount";
        
        -- 6. Tevkifat (varsa)
        IF NEW."withholdingRateId" IS NOT NULL THEN
            SELECT rate INTO withholding_rate 
            FROM materials.withholding_rates 
            WHERE id = NEW."withholdingRateId";
            NEW."withholdingAmount" := NEW."taxAmount" * COALESCE(withholding_rate, 0);
        ELSE
            NEW."withholdingAmount" := 0;
        END IF;
        
        NEW."updatedAt" := CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$;


--
-- Name: generate_proforma_number(); Type: FUNCTION; Schema: quotes; Owner: -
--

CREATE FUNCTION quotes.generate_proforma_number() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
    next_num INTEGER;
    year_str VARCHAR(4);
BEGIN
    SELECT nextval('quotes.proforma_number_seq') INTO next_num;
    year_str := to_char(CURRENT_DATE, 'YYYY');
    RETURN 'PF-' || year_str || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: cities; Type: TABLE; Schema: address_data; Owner: -
--

CREATE TABLE address_data.cities (
    id integer NOT NULL,
    country_id integer DEFAULT 1 NOT NULL,
    name character varying(100) NOT NULL
);


--
-- Name: TABLE cities; Type: COMMENT; Schema: address_data; Owner: -
--

COMMENT ON TABLE address_data.cities IS 'Türkiye illeri (81 il)';


--
-- Name: cities_id_seq; Type: SEQUENCE; Schema: address_data; Owner: -
--

CREATE SEQUENCE address_data.cities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cities_id_seq; Type: SEQUENCE OWNED BY; Schema: address_data; Owner: -
--

ALTER SEQUENCE address_data.cities_id_seq OWNED BY address_data.cities.id;


--
-- Name: counties; Type: TABLE; Schema: address_data; Owner: -
--

CREATE TABLE address_data.counties (
    id integer NOT NULL,
    city_id integer NOT NULL,
    name character varying(100) NOT NULL
);


--
-- Name: TABLE counties; Type: COMMENT; Schema: address_data; Owner: -
--

COMMENT ON TABLE address_data.counties IS 'Türkiye ilçeleri (973 ilçe)';


--
-- Name: counties_id_seq; Type: SEQUENCE; Schema: address_data; Owner: -
--

CREATE SEQUENCE address_data.counties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: counties_id_seq; Type: SEQUENCE OWNED BY; Schema: address_data; Owner: -
--

ALTER SEQUENCE address_data.counties_id_seq OWNED BY address_data.counties.id;


--
-- Name: countries; Type: TABLE; Schema: address_data; Owner: -
--

CREATE TABLE address_data.countries (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    phone_code character varying(10),
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 999
);


--
-- Name: TABLE countries; Type: COMMENT; Schema: address_data; Owner: -
--

COMMENT ON TABLE address_data.countries IS 'Ülkeler listesi';


--
-- Name: countries_id_seq; Type: SEQUENCE; Schema: address_data; Owner: -
--

CREATE SEQUENCE address_data.countries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: countries_id_seq; Type: SEQUENCE OWNED BY; Schema: address_data; Owner: -
--

ALTER SEQUENCE address_data.countries_id_seq OWNED BY address_data.countries.id;


--
-- Name: districts; Type: TABLE; Schema: address_data; Owner: -
--

CREATE TABLE address_data.districts (
    id integer NOT NULL,
    county_id integer NOT NULL,
    name character varying(150) NOT NULL
);


--
-- Name: TABLE districts; Type: COMMENT; Schema: address_data; Owner: -
--

COMMENT ON TABLE address_data.districts IS 'Semtler (2771 semt)';


--
-- Name: districts_id_seq; Type: SEQUENCE; Schema: address_data; Owner: -
--

CREATE SEQUENCE address_data.districts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: districts_id_seq; Type: SEQUENCE OWNED BY; Schema: address_data; Owner: -
--

ALTER SEQUENCE address_data.districts_id_seq OWNED BY address_data.districts.id;


--
-- Name: neighbourhoods; Type: TABLE; Schema: address_data; Owner: -
--

CREATE TABLE address_data.neighbourhoods (
    id integer NOT NULL,
    district_id integer NOT NULL,
    name character varying(150) NOT NULL,
    post_code character varying(10)
);


--
-- Name: TABLE neighbourhoods; Type: COMMENT; Schema: address_data; Owner: -
--

COMMENT ON TABLE address_data.neighbourhoods IS 'Mahalleler ve posta kodları (73304 mahalle)';


--
-- Name: neighbourhoods_id_seq; Type: SEQUENCE; Schema: address_data; Owner: -
--

CREATE SEQUENCE address_data.neighbourhoods_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: neighbourhoods_id_seq; Type: SEQUENCE OWNED BY; Schema: address_data; Owner: -
--

ALTER SEQUENCE address_data.neighbourhoods_id_seq OWNED BY address_data.neighbourhoods.id;


--
-- Name: material_supplier_relation; Type: TABLE; Schema: materials; Owner: -
--

CREATE TABLE materials.material_supplier_relation (
    "materialId" integer NOT NULL,
    "supplierId" integer NOT NULL,
    "isPrimary" boolean DEFAULT false,
    "costPrice" numeric(15,2),
    "leadTimeDays" integer,
    "minimumOrderQuantity" numeric(15,3),
    "supplierMaterialCode" character varying(100),
    notes text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: materials; Type: TABLE; Schema: materials; Owner: -
--

CREATE TABLE materials.materials (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    type character varying(50) NOT NULL,
    category character varying(100) NOT NULL,
    subcategory character varying(100),
    stock numeric(15,4) DEFAULT '0'::numeric,
    reserved numeric(15,4) DEFAULT '0'::numeric,
    "wipReserved" numeric(15,4) DEFAULT '0'::numeric,
    "reorderPoint" numeric(15,4) DEFAULT '0'::numeric,
    "maxStock" numeric(15,3),
    unit character varying(20) NOT NULL,
    "costPrice" numeric(15,2),
    "averageCost" numeric(15,2),
    currency character varying(3) DEFAULT 'TRY'::character varying,
    "primarySupplierId" integer,
    barcode character varying(100),
    "qrCode" character varying(255),
    status character varying(20) DEFAULT 'Aktif'::character varying,
    "isActive" boolean DEFAULT true,
    "scrapType" character varying(50),
    "parentMaterial" character varying(50),
    specifications jsonb,
    storage jsonb,
    "productionHistory" jsonb,
    "suppliersData" jsonb,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "createdBy" character varying(255),
    "updatedBy" character varying(255),
    "activeLotCount" integer DEFAULT 0,
    "oldestLotDate" date,
    "nearestExpiryDate" date
);


--
-- Name: COLUMN materials."activeLotCount"; Type: COMMENT; Schema: materials; Owner: -
--

COMMENT ON COLUMN materials.materials."activeLotCount" IS 'Number of active lots for this material. Auto-updated by trigger. Denormalized for performance.';


--
-- Name: COLUMN materials."oldestLotDate"; Type: COMMENT; Schema: materials; Owner: -
--

COMMENT ON COLUMN materials.materials."oldestLotDate" IS 'Date of oldest active lot (for FIFO indicator). Auto-updated by trigger. Displays "oldest lot: 2025-11-01" in UI.';


--
-- Name: COLUMN materials."nearestExpiryDate"; Type: COMMENT; Schema: materials; Owner: -
--

COMMENT ON COLUMN materials.materials."nearestExpiryDate" IS 'Nearest expiry date across all active lots. Auto-updated by trigger. Used for expiry alerts.';


--
-- Name: materials_categories; Type: TABLE; Schema: materials; Owner: -
--

CREATE TABLE materials.materials_categories (
    id character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    "parentCategory" character varying(100),
    icon character varying(100),
    color character varying(7),
    "sortOrder" integer DEFAULT 0,
    "isActive" boolean DEFAULT true,
    "materialCount" integer DEFAULT 0,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: materials_id_seq; Type: SEQUENCE; Schema: materials; Owner: -
--

CREATE SEQUENCE materials.materials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: materials_id_seq; Type: SEQUENCE OWNED BY; Schema: materials; Owner: -
--

ALTER SEQUENCE materials.materials_id_seq OWNED BY materials.materials.id;


--
-- Name: order_items; Type: TABLE; Schema: materials; Owner: -
--

CREATE TABLE materials.order_items (
    id integer NOT NULL,
    "itemCode" character varying(50) NOT NULL,
    "itemSequence" integer NOT NULL,
    "orderId" integer NOT NULL,
    "orderCode" character varying(50) NOT NULL,
    "materialId" integer NOT NULL,
    "materialCode" character varying(50) NOT NULL,
    "materialName" character varying(255),
    quantity numeric(15,3) NOT NULL,
    unit character varying(20),
    "unitPrice" numeric(15,2),
    "totalPrice" numeric(15,2),
    "itemStatus" character varying(50) DEFAULT 'Onay Bekliyor'::character varying,
    "expectedDeliveryDate" date,
    "actualDeliveryDate" timestamp with time zone,
    "deliveredBy" character varying(100),
    notes text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "lotNumber" character varying(100),
    "supplierLotCode" character varying(100),
    "manufacturingDate" date,
    "expiryDate" date
);


--
-- Name: COLUMN order_items."lotNumber"; Type: COMMENT; Schema: materials; Owner: -
--

COMMENT ON COLUMN materials.order_items."lotNumber" IS 'Lot number assigned to this order delivery. Links to stock_movements.lot_number. Set when order is delivered.';


--
-- Name: COLUMN order_items."supplierLotCode"; Type: COMMENT; Schema: materials; Owner: -
--

COMMENT ON COLUMN materials.order_items."supplierLotCode" IS 'Supplier batch code copied from delivery paperwork. For reference and traceability.';


--
-- Name: COLUMN order_items."manufacturingDate"; Type: COMMENT; Schema: materials; Owner: -
--

COMMENT ON COLUMN materials.order_items."manufacturingDate" IS 'Manufacturing date from supplier. Used for shelf-life tracking.';


--
-- Name: COLUMN order_items."expiryDate"; Type: COMMENT; Schema: materials; Owner: -
--

COMMENT ON COLUMN materials.order_items."expiryDate" IS 'Expiry date from supplier. Used for expiry alerts.';


--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: materials; Owner: -
--

CREATE SEQUENCE materials.order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: materials; Owner: -
--

ALTER SEQUENCE materials.order_items_id_seq OWNED BY materials.order_items.id;


--
-- Name: order_sequence_2025; Type: SEQUENCE; Schema: materials; Owner: -
--

CREATE SEQUENCE materials.order_sequence_2025
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orders; Type: TABLE; Schema: materials; Owner: -
--

CREATE TABLE materials.orders (
    id integer NOT NULL,
    "orderCode" character varying(50) NOT NULL,
    "orderSequence" integer NOT NULL,
    "supplierId" integer,
    "supplierName" character varying(255),
    "orderStatus" character varying(50) DEFAULT 'Taslak'::character varying,
    "orderDate" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "expectedDeliveryDate" date,
    "totalAmount" numeric(15,2) DEFAULT '0'::numeric,
    currency character varying(3) DEFAULT 'TRY'::character varying,
    "itemCount" integer DEFAULT 0,
    notes text,
    "createdBy" character varying(100),
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: materials; Owner: -
--

CREATE SEQUENCE materials.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: materials; Owner: -
--

ALTER SEQUENCE materials.orders_id_seq OWNED BY materials.orders.id;


--
-- Name: service_cards; Type: TABLE; Schema: materials; Owner: -
--

CREATE TABLE materials.service_cards (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    category character varying(50) DEFAULT 'Other'::character varying,
    unit character varying(20) DEFAULT 'Adet'::character varying,
    "defaultPrice" numeric(15,2),
    "vatRate" integer DEFAULT 20,
    "taxExempt" boolean DEFAULT false,
    "isActive" boolean DEFAULT true,
    "glCode" character varying(50),
    notes text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: service_cards_id_seq; Type: SEQUENCE; Schema: materials; Owner: -
--

CREATE SEQUENCE materials.service_cards_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: service_cards_id_seq; Type: SEQUENCE OWNED BY; Schema: materials; Owner: -
--

ALTER SEQUENCE materials.service_cards_id_seq OWNED BY materials.service_cards.id;


--
-- Name: shipment_items; Type: TABLE; Schema: materials; Owner: -
--

CREATE TABLE materials.shipment_items (
    id integer NOT NULL,
    "shipmentId" integer NOT NULL,
    "itemCode" character varying(100),
    "itemSequence" integer,
    "shipmentCode" character varying(50),
    "materialId" integer,
    "materialCode" character varying(100) NOT NULL,
    "materialName" character varying(255),
    quantity numeric(15,4) NOT NULL,
    unit character varying(50) DEFAULT 'adet'::character varying,
    "lotNumber" character varying(100),
    "stockMovementId" integer,
    "itemStatus" character varying(50) DEFAULT 'pending'::character varying,
    notes text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "itemType" character varying(20) DEFAULT 'material'::character varying,
    "serviceCardId" integer,
    "quoteItemId" integer,
    "unitPrice" numeric(15,2),
    "taxRate" integer DEFAULT 20,
    "discountPercent" numeric(5,2) DEFAULT 0,
    "discountAmount" numeric(15,2) DEFAULT 0,
    subtotal numeric(15,2),
    "taxAmount" numeric(15,2),
    "totalAmount" numeric(15,2),
    "serialNumbers" text[],
    "expiryDate" date,
    "productionDate" date,
    "erpItemCode" character varying(100),
    "erpLineNumber" integer,
    "itemNotes" text,
    "vatExemptionId" integer,
    "withholdingRateId" integer,
    "withholdingAmount" numeric(15,2) DEFAULT 0,
    "serialNumber" character varying(100),
    CONSTRAINT chk_item_type CHECK ((("itemType")::text = ANY ((ARRAY['material'::character varying, 'service'::character varying])::text[]))),
    CONSTRAINT chk_tax_rate CHECK (("taxRate" = ANY (ARRAY[0, 1, 8, 10, 18, 20]))),
    CONSTRAINT shipment_items_quantity_check CHECK ((quantity > (0)::numeric))
);


--
-- Name: shipment_items_id_seq; Type: SEQUENCE; Schema: materials; Owner: -
--

CREATE SEQUENCE materials.shipment_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shipment_items_id_seq; Type: SEQUENCE OWNED BY; Schema: materials; Owner: -
--

ALTER SEQUENCE materials.shipment_items_id_seq OWNED BY materials.shipment_items.id;


--
-- Name: shipment_settings; Type: TABLE; Schema: materials; Owner: -
--

CREATE TABLE materials.shipment_settings (
    id integer NOT NULL,
    key character varying(100) NOT NULL,
    value text NOT NULL,
    description text,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" integer
);


--
-- Name: shipment_settings_id_seq; Type: SEQUENCE; Schema: materials; Owner: -
--

CREATE SEQUENCE materials.shipment_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shipment_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: materials; Owner: -
--

ALTER SEQUENCE materials.shipment_settings_id_seq OWNED BY materials.shipment_settings.id;


--
-- Name: shipment_templates; Type: TABLE; Schema: materials; Owner: -
--

CREATE TABLE materials.shipment_templates (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    "templateData" jsonb NOT NULL,
    "isActive" boolean DEFAULT true,
    "usageCount" integer DEFAULT 0,
    "lastUsedAt" timestamp with time zone,
    "createdBy" character varying(100),
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: shipment_templates_id_seq; Type: SEQUENCE; Schema: materials; Owner: -
--

CREATE SEQUENCE materials.shipment_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shipment_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: materials; Owner: -
--

ALTER SEQUENCE materials.shipment_templates_id_seq OWNED BY materials.shipment_templates.id;


--
-- Name: shipments; Type: TABLE; Schema: materials; Owner: -
--

CREATE TABLE materials.shipments (
    id integer NOT NULL,
    "shipmentCode" character varying(50) NOT NULL,
    "shipmentSequence" integer NOT NULL,
    "workOrderCode" character varying(100),
    "quoteId" character varying(50),
    "planId" integer,
    "customerName" character varying(200),
    "customerCompany" character varying(200),
    "deliveryAddress" text,
    status character varying(50) DEFAULT 'pending'::character varying,
    notes text,
    "createdBy" character varying(100),
    "updatedBy" character varying(100),
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "shipmentCompletedAt" timestamp with time zone,
    "documentStatus" character varying(20) DEFAULT 'draft'::character varying,
    "externalDocumentId" character varying(100),
    "waybillDate" timestamp with time zone,
    "waybillTime" time without time zone,
    currency character varying(3) DEFAULT 'TRY'::character varying,
    "exchangeRate" numeric(10,4) DEFAULT 1.0,
    "transportType" character varying(20) DEFAULT 'OWN_VEHICLE'::character varying,
    "driverName" character varying(100),
    "driverTc" character varying(11),
    "plateNumber" character varying(20),
    "carrierCompany" character varying(255),
    "carrierTcVkn" character varying(11),
    "shipmentType" character varying(20) DEFAULT 'standard'::character varying,
    "sourceDocument" character varying(50),
    "sourceDocumentId" integer,
    "netWeight" numeric(10,2),
    "grossWeight" numeric(10,2),
    "packageCount" integer,
    "packageType" character varying(50),
    "uploadedDocumentPath" text,
    "uploadedAt" timestamp with time zone,
    "exportedAt" timestamp with time zone,
    "archivedAt" timestamp with time zone,
    "customerId" integer,
    "customerSnapshot" jsonb,
    "useAlternateDelivery" boolean DEFAULT false,
    "alternateDeliveryAddress" jsonb,
    "documentType" character varying(20) DEFAULT 'waybill'::character varying,
    "includePrice" boolean DEFAULT false,
    "discountType" character varying(20),
    "discountValue" numeric(15,2) DEFAULT 0,
    "discountTotal" numeric(15,2) DEFAULT 0,
    subtotal numeric(15,2) DEFAULT 0,
    "taxTotal" numeric(15,2) DEFAULT 0,
    "withholdingTotal" numeric(15,2) DEFAULT 0,
    "grandTotal" numeric(15,2) DEFAULT 0,
    "exportHistory" jsonb DEFAULT '{}'::jsonb,
    "lastExportedAt" timestamp with time zone,
    "exportTarget" character varying(50),
    "importedAt" timestamp with time zone,
    "importedBy" integer,
    "importedFile" bytea,
    "importedFileName" character varying(255),
    "externalDocNumber" character varying(100),
    "specialCode" character varying(100),
    "costCenter" character varying(100),
    "documentNotes" text,
    "dispatchDate" date,
    "dispatchTime" time without time zone,
    "hidePrice" boolean DEFAULT true,
    "relatedQuoteId" character varying(50),
    transport jsonb DEFAULT '{}'::jsonb,
    "cancellationReason" text,
    "cancelledAt" timestamp with time zone,
    "cancelledBy" character varying(255),
    "lastModifiedAt" timestamp with time zone,
    CONSTRAINT chk_document_status CHECK ((("documentStatus")::text = ANY ((ARRAY['draft'::character varying, 'finalized'::character varying, 'exported'::character varying, 'archived'::character varying])::text[]))),
    CONSTRAINT chk_transport_type CHECK ((("transportType")::text = ANY ((ARRAY['OWN_VEHICLE'::character varying, 'LOGISTICS_COMPANY'::character varying])::text[])))
);


--
-- Name: COLUMN shipments."dispatchDate"; Type: COMMENT; Schema: materials; Owner: -
--

COMMENT ON COLUMN materials.shipments."dispatchDate" IS 'Fiili sevk tarihi';


--
-- Name: COLUMN shipments."dispatchTime"; Type: COMMENT; Schema: materials; Owner: -
--

COMMENT ON COLUMN materials.shipments."dispatchTime" IS 'Fiili sevk saati';


--
-- Name: COLUMN shipments."hidePrice"; Type: COMMENT; Schema: materials; Owner: -
--

COMMENT ON COLUMN materials.shipments."hidePrice" IS 'Fiyat gizle/göster (true = fiyat gizli)';


--
-- Name: COLUMN shipments."relatedQuoteId"; Type: COMMENT; Schema: materials; Owner: -
--

COMMENT ON COLUMN materials.shipments."relatedQuoteId" IS 'İlişkili teklif ID';


--
-- Name: shipments_id_seq; Type: SEQUENCE; Schema: materials; Owner: -
--

CREATE SEQUENCE materials.shipments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shipments_id_seq; Type: SEQUENCE OWNED BY; Schema: materials; Owner: -
--

ALTER SEQUENCE materials.shipments_id_seq OWNED BY materials.shipments.id;


--
-- Name: stock_movements; Type: TABLE; Schema: materials; Owner: -
--

CREATE TABLE materials.stock_movements (
    id integer NOT NULL,
    "materialId" integer,
    "materialCode" character varying(50) NOT NULL,
    "materialName" character varying(255),
    type text NOT NULL,
    "subType" character varying(50) NOT NULL,
    status character varying(50),
    quantity numeric(15,3) NOT NULL,
    unit character varying(20),
    "stockBefore" numeric(15,3),
    "stockAfter" numeric(15,3),
    "actualOutput" numeric(15,3),
    "defectQuantity" numeric(15,3),
    "plannedOutput" numeric(15,3),
    "unitCost" numeric(15,2),
    "totalCost" numeric(15,2),
    currency character varying(10) DEFAULT 'TRY'::character varying,
    reference character varying(100),
    "referenceType" character varying(50),
    "relatedPlanId" character varying(50),
    "relatedNodeId" character varying(50),
    warehouse character varying(100),
    location character varying(255),
    notes text,
    reason character varying(255),
    "movementDate" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    approved boolean DEFAULT true,
    "userId" character varying(100),
    "userName" character varying(255),
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "requestedQuantity" numeric(15,3),
    "partialReservation" boolean DEFAULT false,
    warning text,
    "assignmentId" integer,
    "lotNumber" character varying(100),
    "lotDate" date,
    "supplierLotCode" character varying(100),
    "manufacturingDate" date,
    "expiryDate" date,
    "nodeSequence" integer,
    CONSTRAINT chk_partial_reservation_logic CHECK ((("partialReservation" = false) OR ("partialReservation" IS NULL) OR (("requestedQuantity" IS NOT NULL) AND (quantity < "requestedQuantity")))),
    CONSTRAINT chk_partial_warning_message CHECK ((("partialReservation" = false) OR ("partialReservation" IS NULL) OR (warning IS NOT NULL))),
    CONSTRAINT chk_requested_quantity_positive CHECK ((("requestedQuantity" IS NULL) OR ("requestedQuantity" > (0)::numeric))),
    CONSTRAINT stock_movements_type_check CHECK ((type = ANY (ARRAY['in'::text, 'out'::text])))
);


--
-- Name: COLUMN stock_movements."requestedQuantity"; Type: COMMENT; Schema: materials; Owner: -
--

COMMENT ON COLUMN materials.stock_movements."requestedQuantity" IS 'Original quantity requested before shortage check. NULL for non-reservation movements.';


--
-- Name: COLUMN stock_movements."partialReservation"; Type: COMMENT; Schema: materials; Owner: -
--

COMMENT ON COLUMN materials.stock_movements."partialReservation" IS 'TRUE if could not fulfill full request due to shortage. FALSE or NULL if full reservation successful.';


--
-- Name: COLUMN stock_movements.warning; Type: COMMENT; Schema: materials; Owner: -
--

COMMENT ON COLUMN materials.stock_movements.warning IS 'Human-readable warning message about partial reservation. Example: "Partial reservation: requested 100 kg, reserved 80 kg".';


--
-- Name: COLUMN stock_movements."assignmentId"; Type: COMMENT; Schema: materials; Owner: -
--

COMMENT ON COLUMN materials.stock_movements."assignmentId" IS 'Foreign key to mes.worker_assignments(id). Links stock movement to MES task. NULL for non-MES movements.';


--
-- Name: COLUMN stock_movements."lotNumber"; Type: COMMENT; Schema: materials; Owner: -
--

COMMENT ON COLUMN materials.stock_movements."lotNumber" IS 'Lot number (auto-generated or manual). Format: LOT-{materialCode}-{YYYYMMDD}-{seq}. Example: LOT-M-00-001-20251120-001';


--
-- Name: COLUMN stock_movements."lotDate"; Type: COMMENT; Schema: materials; Owner: -
--

COMMENT ON COLUMN materials.stock_movements."lotDate" IS 'Lot date (CRITICAL for FIFO sorting). For IN movements: delivery date. For OUT movements: lot_date of consumed lot. FIFO query: ORDER BY lot_date ASC.';


--
-- Name: COLUMN stock_movements."supplierLotCode"; Type: COMMENT; Schema: materials; Owner: -
--

COMMENT ON COLUMN materials.stock_movements."supplierLotCode" IS 'Supplier batch/lot code from delivery paperwork. Optional: links to supplier internal tracking.';


--
-- Name: COLUMN stock_movements."manufacturingDate"; Type: COMMENT; Schema: materials; Owner: -
--

COMMENT ON COLUMN materials.stock_movements."manufacturingDate" IS 'Manufacturing date (when supplier produced this lot). Optional: for traceability and shelf-life calculation.';


--
-- Name: COLUMN stock_movements."expiryDate"; Type: COMMENT; Schema: materials; Owner: -
--

COMMENT ON COLUMN materials.stock_movements."expiryDate" IS 'Expiry date (when this lot expires). Optional: for expiry alerts and FEFO (First Expired First Out).';


--
-- Name: COLUMN stock_movements."nodeSequence"; Type: COMMENT; Schema: materials; Owner: -
--

COMMENT ON COLUMN materials.stock_movements."nodeSequence" IS 'Production node sequence that created this lot. Links to mes_production_plan_nodes.sequence. For internal production lot tracking.';


--
-- Name: stock_movements_id_seq; Type: SEQUENCE; Schema: materials; Owner: -
--

CREATE SEQUENCE materials.stock_movements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_movements_id_seq; Type: SEQUENCE OWNED BY; Schema: materials; Owner: -
--

ALTER SEQUENCE materials.stock_movements_id_seq OWNED BY materials.stock_movements.id;


--
-- Name: suppliers; Type: TABLE; Schema: materials; Owner: -
--

CREATE TABLE materials.suppliers (
    id integer NOT NULL,
    code character varying(50),
    name character varying(255) NOT NULL,
    "contactPerson" character varying(255),
    email character varying(255),
    phone character varying(50),
    address text,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    phone2 character varying(50),
    email2 character varying(255),
    fax character varying(50),
    "emergencyContact" character varying(255),
    "emergencyPhone" character varying(50),
    website character varying(500),
    "preferredCommunication" character varying(50) DEFAULT 'email'::character varying,
    city character varying(100),
    state character varying(100),
    "postalCode" character varying(20),
    country character varying(100) DEFAULT 'Türkiye'::character varying,
    "taxNumber" character varying(50),
    "taxOffice" character varying(255),
    "businessRegistrationNumber" character varying(50),
    currency character varying(10) DEFAULT 'TRY'::character varying,
    "creditLimit" numeric(15,2),
    "creditRating" character varying(50),
    "paymentTerms" character varying(255),
    "paymentMethod" character varying(100),
    "bankName" character varying(255),
    "bankAccount" character varying(100),
    iban character varying(50),
    "supplierType" character varying(100),
    "qualityCertification" character varying(255),
    "deliveryCapability" character varying(255),
    "leadTimeDays" integer,
    "minimumOrderQuantity" numeric(15,2),
    "yearEstablished" integer,
    "employeeCount" integer,
    "annualRevenue" numeric(18,2),
    "complianceStatus" character varying(50) DEFAULT 'pending'::character varying,
    "riskLevel" character varying(50) DEFAULT 'medium'::character varying,
    notes text,
    status character varying(50) DEFAULT 'Aktif'::character varying
);


--
-- Name: suppliers_id_seq; Type: SEQUENCE; Schema: materials; Owner: -
--

CREATE SEQUENCE materials.suppliers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: suppliers_id_seq; Type: SEQUENCE OWNED BY; Schema: materials; Owner: -
--

ALTER SEQUENCE materials.suppliers_id_seq OWNED BY materials.suppliers.id;


--
-- Name: vat_exemption_codes; Type: TABLE; Schema: materials; Owner: -
--

CREATE TABLE materials.vat_exemption_codes (
    id integer NOT NULL,
    code character varying(10) NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: vat_exemption_codes_id_seq; Type: SEQUENCE; Schema: materials; Owner: -
--

CREATE SEQUENCE materials.vat_exemption_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vat_exemption_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: materials; Owner: -
--

ALTER SEQUENCE materials.vat_exemption_codes_id_seq OWNED BY materials.vat_exemption_codes.id;


--
-- Name: withholding_rates; Type: TABLE; Schema: materials; Owner: -
--

CREATE TABLE materials.withholding_rates (
    id integer NOT NULL,
    code character varying(20) NOT NULL,
    rate numeric(5,4) NOT NULL,
    name character varying(200) NOT NULL,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: withholding_rates_id_seq; Type: SEQUENCE; Schema: materials; Owner: -
--

CREATE SEQUENCE materials.withholding_rates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: withholding_rates_id_seq; Type: SEQUENCE OWNED BY; Schema: materials; Owner: -
--

ALTER SEQUENCE materials.withholding_rates_id_seq OWNED BY materials.withholding_rates.id;


--
-- Name: alerts; Type: TABLE; Schema: mes; Owner: -
--

CREATE TABLE mes.alerts (
    id character varying(100) NOT NULL,
    type character varying(50) NOT NULL,
    severity character varying(50),
    title character varying(255) NOT NULL,
    message text,
    metadata jsonb,
    "isRead" boolean DEFAULT false,
    "isResolved" boolean DEFAULT false,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" timestamp with time zone,
    "resolvedBy" character varying(255)
);


--
-- Name: assignment_material_reservations; Type: TABLE; Schema: mes; Owner: -
--

CREATE TABLE mes.assignment_material_reservations (
    id integer NOT NULL,
    "assignmentId" integer NOT NULL,
    "materialCode" character varying(100) NOT NULL,
    "preProductionQty" numeric(10,2) NOT NULL,
    "actualReservedQty" numeric(10,2),
    "consumedQty" numeric(10,2),
    "reservationStatus" character varying(20) DEFAULT 'pending'::character varying,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "lotNumber" character varying(100),
    CONSTRAINT chk_quantities_positive CHECK ((("preProductionQty" > (0)::numeric) AND (("actualReservedQty" IS NULL) OR ("actualReservedQty" >= (0)::numeric)) AND (("consumedQty" IS NULL) OR ("consumedQty" >= (0)::numeric)))),
    CONSTRAINT chk_reservation_status CHECK ((("reservationStatus")::text = ANY ((ARRAY['pending'::character varying, 'reserved'::character varying, 'consumed'::character varying, 'released'::character varying])::text[]))),
    CONSTRAINT chk_status_consistency CHECK ((((("reservationStatus")::text <> 'reserved'::text) OR ("actualReservedQty" IS NOT NULL)) AND ((("reservationStatus")::text <> 'consumed'::text) OR ("consumedQty" IS NOT NULL))))
);


--
-- Name: TABLE assignment_material_reservations; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON TABLE mes.assignment_material_reservations IS 'Material reservations for MES worker assignments. Replaces JSONB pre_production_reserved_amount with normalized relational model.';


--
-- Name: COLUMN assignment_material_reservations."assignmentId"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.assignment_material_reservations."assignmentId" IS 'Foreign key to mes.worker_assignments(id). Which task is reserving materials.';


--
-- Name: COLUMN assignment_material_reservations."materialCode"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.assignment_material_reservations."materialCode" IS 'Foreign key to materials.materials(code). Which material is being reserved.';


--
-- Name: COLUMN assignment_material_reservations."preProductionQty"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.assignment_material_reservations."preProductionQty" IS 'Planned material requirement calculated at plan launch from BOM. Always set.';


--
-- Name: COLUMN assignment_material_reservations."actualReservedQty"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.assignment_material_reservations."actualReservedQty" IS 'Actual quantity reserved from inventory at task start. May be < pre_production_qty due to shortage. NULL until task starts.';


--
-- Name: COLUMN assignment_material_reservations."consumedQty"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.assignment_material_reservations."consumedQty" IS 'Final consumed quantity recorded at task completion. Usually equals actual_reserved_qty but may differ due to waste. NULL until task completes.';


--
-- Name: COLUMN assignment_material_reservations."reservationStatus"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.assignment_material_reservations."reservationStatus" IS 'Lifecycle status: pending (calculated) → reserved (materials locked) → consumed (materials used) or released (cancelled).';


--
-- Name: COLUMN assignment_material_reservations."lotNumber"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.assignment_material_reservations."lotNumber" IS 'Which lot was consumed by this assignment. Links to stock_movements.lot_number. Enables traceability: which task used which lot.';


--
-- Name: assignment_material_reservations_id_seq; Type: SEQUENCE; Schema: mes; Owner: -
--

CREATE SEQUENCE mes.assignment_material_reservations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: assignment_material_reservations_id_seq; Type: SEQUENCE OWNED BY; Schema: mes; Owner: -
--

ALTER SEQUENCE mes.assignment_material_reservations_id_seq OWNED BY mes.assignment_material_reservations.id;


--
-- Name: assignment_status_history; Type: TABLE; Schema: mes; Owner: -
--

CREATE TABLE mes.assignment_status_history (
    id integer NOT NULL,
    "assignmentId" integer NOT NULL,
    "fromStatus" character varying(50),
    "toStatus" character varying(50) NOT NULL,
    "changedAt" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "changedBy" character varying(100),
    reason text,
    metadata jsonb
);


--
-- Name: assignment_status_history_id_seq; Type: SEQUENCE; Schema: mes; Owner: -
--

CREATE SEQUENCE mes.assignment_status_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: assignment_status_history_id_seq; Type: SEQUENCE OWNED BY; Schema: mes; Owner: -
--

ALTER SEQUENCE mes.assignment_status_history_id_seq OWNED BY mes.assignment_status_history.id;


--
-- Name: counters; Type: TABLE; Schema: mes; Owner: -
--

CREATE TABLE mes.counters (
    id character varying(100) NOT NULL,
    prefix character varying(50) NOT NULL,
    "nextCounter" integer DEFAULT 1,
    codes jsonb,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: entity_relations; Type: TABLE; Schema: mes; Owner: -
--

CREATE TABLE mes.entity_relations (
    id integer NOT NULL,
    "sourceType" character varying(50) NOT NULL,
    "sourceId" character varying(100) NOT NULL,
    "relationType" character varying(50) NOT NULL,
    "targetId" character varying(100) NOT NULL,
    priority integer,
    quantity numeric(10,2),
    "unitRatio" numeric(10,4),
    "isDerived" boolean,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_priority_positive CHECK (((priority IS NULL) OR (priority > 0))),
    CONSTRAINT chk_quantity_positive CHECK (((quantity IS NULL) OR (quantity > (0)::numeric))),
    CONSTRAINT chk_relation_type CHECK ((("relationType")::text = ANY ((ARRAY['station'::character varying, 'operation'::character varying, 'substation'::character varying, 'material'::character varying, 'predecessor'::character varying])::text[]))),
    CONSTRAINT chk_source_type CHECK ((("sourceType")::text = ANY ((ARRAY['worker'::character varying, 'station'::character varying, 'node'::character varying])::text[]))),
    CONSTRAINT chk_unit_ratio_positive CHECK ((("unitRatio" IS NULL) OR ("unitRatio" > (0)::numeric)))
);


--
-- Name: TABLE entity_relations; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON TABLE mes.entity_relations IS 'Polymorphic table consolidating 6 junction tables: worker_stations, worker_operations, station_operations, node_stations, node_substations, node_predecessors. Created in Migration 032.';


--
-- Name: COLUMN entity_relations."sourceType"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.entity_relations."sourceType" IS 'Type of source entity: worker, station, or node';


--
-- Name: COLUMN entity_relations."sourceId"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.entity_relations."sourceId" IS 'ID of source entity (references mes.workers.id, mes.stations.id, or mes.production_plan_nodes.id)';


--
-- Name: COLUMN entity_relations."relationType"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.entity_relations."relationType" IS 'Type of relationship: station, operation, substation, material, or predecessor';


--
-- Name: COLUMN entity_relations."targetId"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.entity_relations."targetId" IS 'ID of target entity (varies by relation_type)';


--
-- Name: COLUMN entity_relations.priority; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.entity_relations.priority IS 'Priority for station assignments (1=primary, 2=fallback). Used only for node→station relations.';


--
-- Name: COLUMN entity_relations.quantity; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.entity_relations.quantity IS 'Quantity of material required. Used only for node→material relations.';


--
-- Name: COLUMN entity_relations."unitRatio"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.entity_relations."unitRatio" IS 'Unit conversion ratio. Used only for node→material relations.';


--
-- Name: COLUMN entity_relations."isDerived"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.entity_relations."isDerived" IS 'TRUE if material is WIP from previous node. Used only for node→material relations.';


--
-- Name: entity_relations_id_seq; Type: SEQUENCE; Schema: mes; Owner: -
--

CREATE SEQUENCE mes.entity_relations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: entity_relations_id_seq; Type: SEQUENCE OWNED BY; Schema: mes; Owner: -
--

ALTER SEQUENCE mes.entity_relations_id_seq OWNED BY mes.entity_relations.id;


--
-- Name: node_material_inputs; Type: TABLE; Schema: mes; Owner: -
--

CREATE TABLE mes.node_material_inputs (
    id integer NOT NULL,
    "nodeId" character varying(100) NOT NULL,
    "materialCode" character varying(100) NOT NULL,
    "requiredQuantity" numeric(10,2) NOT NULL,
    "unitRatio" numeric(10,4) DEFAULT '1'::numeric,
    "isDerived" boolean DEFAULT false,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: node_material_inputs_id_seq; Type: SEQUENCE; Schema: mes; Owner: -
--

CREATE SEQUENCE mes.node_material_inputs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: node_material_inputs_id_seq; Type: SEQUENCE OWNED BY; Schema: mes; Owner: -
--

ALTER SEQUENCE mes.node_material_inputs_id_seq OWNED BY mes.node_material_inputs.id;


--
-- Name: node_predecessors; Type: TABLE; Schema: mes; Owner: -
--

CREATE TABLE mes.node_predecessors (
    id integer NOT NULL,
    "nodeId" character varying(100) NOT NULL,
    "predecessorNodeId" character varying(100) NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: COLUMN node_predecessors."nodeId"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.node_predecessors."nodeId" IS 'Node that depends on predecessor';


--
-- Name: COLUMN node_predecessors."predecessorNodeId"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.node_predecessors."predecessorNodeId" IS 'Node that must complete first';


--
-- Name: node_predecessors_id_seq; Type: SEQUENCE; Schema: mes; Owner: -
--

CREATE SEQUENCE mes.node_predecessors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: node_predecessors_id_seq; Type: SEQUENCE OWNED BY; Schema: mes; Owner: -
--

ALTER SEQUENCE mes.node_predecessors_id_seq OWNED BY mes.node_predecessors.id;


--
-- Name: node_stations; Type: TABLE; Schema: mes; Owner: -
--

CREATE TABLE mes.node_stations (
    id integer NOT NULL,
    "nodeId" character varying(100) NOT NULL,
    "stationId" character varying(50) NOT NULL,
    priority integer DEFAULT 1 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: COLUMN node_stations."nodeId"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.node_stations."nodeId" IS 'Production plan node ID';


--
-- Name: COLUMN node_stations."stationId"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.node_stations."stationId" IS 'Station that can execute this node';


--
-- Name: COLUMN node_stations.priority; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.node_stations.priority IS 'Station selection priority (1=primary, 2=fallback, etc.)';


--
-- Name: node_stations_id_seq; Type: SEQUENCE; Schema: mes; Owner: -
--

CREATE SEQUENCE mes.node_stations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: node_stations_id_seq; Type: SEQUENCE OWNED BY; Schema: mes; Owner: -
--

ALTER SEQUENCE mes.node_stations_id_seq OWNED BY mes.node_stations.id;


--
-- Name: operations; Type: TABLE; Schema: mes; Owner: -
--

CREATE TABLE mes.operations (
    id character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    type character varying(50),
    "semiOutputCode" character varying(100),
    "expectedDefectRate" numeric(5,2) DEFAULT '0'::numeric,
    skills jsonb,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "createdByName" character varying(255),
    "updatedByName" character varying(255),
    "defaultEfficiency" numeric(4,2) DEFAULT '1'::numeric,
    "supervisorId" character varying(100)
);


--
-- Name: plan_material_requirements; Type: TABLE; Schema: mes; Owner: -
--

CREATE TABLE mes.plan_material_requirements (
    id integer NOT NULL,
    "planId" character varying(100) NOT NULL,
    "materialCode" character varying(100) NOT NULL,
    "materialName" character varying(255),
    "requiredQuantity" numeric(10,2) NOT NULL,
    unit character varying(50),
    "isDerived" boolean DEFAULT false,
    "hasShortage" boolean DEFAULT false,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: plan_material_requirements_id_seq; Type: SEQUENCE; Schema: mes; Owner: -
--

CREATE SEQUENCE mes.plan_material_requirements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: plan_material_requirements_id_seq; Type: SEQUENCE OWNED BY; Schema: mes; Owner: -
--

ALTER SEQUENCE mes.plan_material_requirements_id_seq OWNED BY mes.plan_material_requirements.id;


--
-- Name: plan_wip_outputs; Type: TABLE; Schema: mes; Owner: -
--

CREATE TABLE mes.plan_wip_outputs (
    id integer NOT NULL,
    "planId" character varying(100) NOT NULL,
    "wipCode" character varying(100) NOT NULL,
    "wipName" character varying(255),
    quantity numeric(10,2) NOT NULL,
    unit character varying(50),
    "sourceNodeId" integer,
    "sourceOperationId" character varying(100),
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: plan_wip_outputs_id_seq; Type: SEQUENCE; Schema: mes; Owner: -
--

CREATE SEQUENCE mes.plan_wip_outputs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: plan_wip_outputs_id_seq; Type: SEQUENCE OWNED BY; Schema: mes; Owner: -
--

ALTER SEQUENCE mes.plan_wip_outputs_id_seq OWNED BY mes.plan_wip_outputs.id;


--
-- Name: production_plan_counter; Type: SEQUENCE; Schema: mes; Owner: -
--

CREATE SEQUENCE mes.production_plan_counter
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: production_plan_nodes; Type: TABLE; Schema: mes; Owner: -
--

CREATE TABLE mes.production_plan_nodes (
    id integer NOT NULL,
    "nodeId" character varying(100) NOT NULL,
    "planId" character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    "operationId" character varying(100),
    "nominalTime" integer NOT NULL,
    efficiency numeric(4,3) DEFAULT 0.85,
    "effectiveTime" numeric(10,2),
    "assignmentMode" character varying(20) DEFAULT 'auto'::character varying,
    "assignedWorkerId" character varying(100),
    "outputCode" character varying(100),
    "outputQty" numeric(10,2) NOT NULL,
    "outputUnit" character varying(50),
    "estimatedStartTime" timestamp with time zone,
    "estimatedEndTime" timestamp with time zone,
    "sequenceOrder" integer,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "workOrderCode" character varying(50),
    status character varying(20) DEFAULT 'pending'::character varying,
    "startedAt" timestamp with time zone,
    "completedAt" timestamp with time zone,
    "actualQuantity" numeric(12,2),
    x integer DEFAULT 80,
    y integer DEFAULT 80
);


--
-- Name: COLUMN production_plan_nodes."workOrderCode"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.production_plan_nodes."workOrderCode" IS 'Work order code - denormalized from plan for easier access';


--
-- Name: COLUMN production_plan_nodes.status; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.production_plan_nodes.status IS 'Node status: pending|in_progress|completed|paused';


--
-- Name: COLUMN production_plan_nodes."startedAt"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.production_plan_nodes."startedAt" IS 'Actual start time (when first worker started)';


--
-- Name: COLUMN production_plan_nodes."completedAt"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.production_plan_nodes."completedAt" IS 'Actual completion time (when node fully completed)';


--
-- Name: COLUMN production_plan_nodes."actualQuantity"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.production_plan_nodes."actualQuantity" IS 'Actual quantity produced (may differ from output_qty)';


--
-- Name: production_plan_nodes_id_seq; Type: SEQUENCE; Schema: mes; Owner: -
--

CREATE SEQUENCE mes.production_plan_nodes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: production_plan_nodes_id_seq; Type: SEQUENCE OWNED BY; Schema: mes; Owner: -
--

ALTER SEQUENCE mes.production_plan_nodes_id_seq OWNED BY mes.production_plan_nodes.id;


--
-- Name: production_plans; Type: TABLE; Schema: mes; Owner: -
--

CREATE TABLE mes.production_plans (
    id character varying(100) NOT NULL,
    "workOrderCode" character varying(100),
    "quoteId" character varying(100),
    status character varying(50) DEFAULT 'draft'::character varying,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "createdBy" character varying(255),
    "releasedAt" timestamp with time zone,
    "releasedBy" character varying(255),
    "releasedByName" character varying(255),
    "createdByName" character varying(255),
    "updatedByName" character varying(255),
    quantity integer,
    "launchStatus" character varying(50),
    "autoAssign" boolean DEFAULT false,
    "launchedAt" timestamp with time zone,
    "pausedAt" timestamp with time zone,
    "resumedAt" timestamp with time zone,
    "planName" character varying(255),
    description text,
    "timingSummary" jsonb,
    "materialSummary" jsonb
);


--
-- Name: COLUMN production_plans."launchedAt"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.production_plans."launchedAt" IS 'Timestamp when plan was launched (draft → active)';


--
-- Name: COLUMN production_plans."pausedAt"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.production_plans."pausedAt" IS 'Timestamp when plan was paused (active → paused)';


--
-- Name: COLUMN production_plans."resumedAt"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.production_plans."resumedAt" IS 'Timestamp when plan was resumed (paused → active)';


--
-- Name: settings; Type: TABLE; Schema: mes; Owner: -
--

CREATE TABLE mes.settings (
    id character varying(100) NOT NULL,
    key character varying(255) NOT NULL,
    value jsonb,
    description text,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" character varying(255)
);


--
-- Name: skills; Type: TABLE; Schema: mes; Owner: -
--

CREATE TABLE mes.skills (
    id character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "createdBy" character varying(255),
    "updatedBy" character varying(255)
);


--
-- Name: COLUMN skills.id; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.skills.id IS 'Skill key (skill-001, skill-002)';


--
-- Name: COLUMN skills.name; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.skills.name IS 'Display name (user customizable)';


--
-- Name: COLUMN skills.description; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.skills.description IS 'Optional skill description';


--
-- Name: COLUMN skills."isActive"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.skills."isActive" IS 'Soft delete flag';


--
-- Name: COLUMN skills."createdBy"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.skills."createdBy" IS 'User who created this skill';


--
-- Name: COLUMN skills."updatedBy"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.skills."updatedBy" IS 'User who last updated this skill';


--
-- Name: stations; Type: TABLE; Schema: mes; Owner: -
--

CREATE TABLE mes.stations (
    id character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    type character varying(50),
    description text,
    capabilities jsonb,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "createdByName" character varying(255),
    "updatedByName" character varying(255),
    substations jsonb DEFAULT '[]'::jsonb,
    location character varying(255),
    "operationIds" jsonb DEFAULT '[]'::jsonb,
    "subSkills" jsonb DEFAULT '[]'::jsonb
);


--
-- Name: substations; Type: TABLE; Schema: mes; Owner: -
--

CREATE TABLE mes.substations (
    id character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    "stationId" character varying(100) NOT NULL,
    description text,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "currentOperation" character varying(100),
    "createdByName" character varying(255),
    "updatedByName" character varying(255),
    status character varying(20) DEFAULT 'available'::character varying,
    "currentAssignmentId" integer,
    "assignedWorkerId" character varying(50),
    "reservedAt" timestamp with time zone,
    "inUseSince" timestamp with time zone,
    "currentExpectedEnd" timestamp with time zone,
    "technicalStatus" character varying(20) DEFAULT 'active'::character varying
);


--
-- Name: COLUMN substations.status; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.substations.status IS 'Substation status: available, reserved, in_use, maintenance';


--
-- Name: COLUMN substations."currentAssignmentId"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.substations."currentAssignmentId" IS 'ID of current production plan node assignment';


--
-- Name: COLUMN substations."assignedWorkerId"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.substations."assignedWorkerId" IS 'Worker currently using this substation';


--
-- Name: COLUMN substations."reservedAt"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.substations."reservedAt" IS 'When substation was reserved';


--
-- Name: COLUMN substations."inUseSince"; Type: COMMENT; Schema: mes; Owner: -
--

COMMENT ON COLUMN mes.substations."inUseSince" IS 'When current operation started';


--
-- Name: work_order_counter; Type: SEQUENCE; Schema: mes; Owner: -
--

CREATE SEQUENCE mes.work_order_counter
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: work_orders; Type: TABLE; Schema: mes; Owner: -
--

CREATE TABLE mes.work_orders (
    id character varying(100) NOT NULL,
    code character varying(100) NOT NULL,
    "quoteId" character varying(100),
    status character varying(50),
    data jsonb,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "productionState" character varying(255) DEFAULT 'pending'::character varying,
    "productionStateUpdatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "productionStateUpdatedBy" character varying(255),
    "productionStateHistory" jsonb DEFAULT '[]'::jsonb,
    "productionLaunched" boolean DEFAULT false,
    "productionLaunchedAt" timestamp without time zone
);


--
-- Name: worker_assignments; Type: TABLE; Schema: mes; Owner: -
--

CREATE TABLE mes.worker_assignments (
    id integer NOT NULL,
    "planId" character varying(255) NOT NULL,
    "workOrderCode" character varying(255) NOT NULL,
    "nodeId" integer NOT NULL,
    "operationId" character varying(255),
    "workerId" character varying(255),
    "stationId" character varying(255),
    "substationId" character varying(255),
    status character varying(50) DEFAULT 'pending'::character varying,
    "schedulingMode" character varying(50) DEFAULT 'fifo'::character varying,
    "sequenceNumber" integer,
    priority integer DEFAULT 0,
    "isUrgent" boolean DEFAULT false,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "startedAt" timestamp with time zone,
    "completedAt" timestamp with time zone,
    "estimatedStartTime" timestamp with time zone,
    "estimatedEndTime" timestamp with time zone,
    "optimizedStart" timestamp with time zone,
    "optimizedEnd" timestamp with time zone,
    "nominalTime" integer,
    "effectiveTime" integer,
    "preProductionReservedAmount" jsonb,
    "actualReservedAmounts" jsonb,
    "materialReservationStatus" character varying(50),
    "inputScrapCount" jsonb DEFAULT '{}'::jsonb,
    "productionScrapCount" jsonb DEFAULT '{}'::jsonb,
    "actualQuantity" numeric,
    "defectQuantity" numeric DEFAULT 0,
    "plannedOutput" jsonb,
    notes text,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: worker_assignments_id_seq; Type: SEQUENCE; Schema: mes; Owner: -
--

CREATE SEQUENCE mes.worker_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: worker_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: mes; Owner: -
--

ALTER SEQUENCE mes.worker_assignments_id_seq OWNED BY mes.worker_assignments.id;


--
-- Name: workers; Type: TABLE; Schema: mes; Owner: -
--

CREATE TABLE mes.workers (
    id character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    skills jsonb,
    "personalSchedule" jsonb,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "currentTaskPlanId" character varying(100),
    "currentTaskNodeId" character varying(100),
    "currentTaskAssignmentId" character varying(100),
    "createdByName" character varying(255),
    "updatedByName" character varying(255),
    email character varying(255),
    phone character varying(50),
    absences jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: knex_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knex_migrations (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knex_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knex_migrations_id_seq OWNED BY public.knex_migrations.id;


--
-- Name: knex_migrations_lock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knex_migrations_lock (
    index integer NOT NULL,
    is_locked integer
);


--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knex_migrations_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knex_migrations_lock_index_seq OWNED BY public.knex_migrations_lock.index;


--
-- Name: migration_tracker; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migration_tracker (
    id integer NOT NULL,
    phase character varying(50) NOT NULL,
    "entityType" character varying(50) NOT NULL,
    "oldName" character varying(255) NOT NULL,
    "newName" character varying(255) NOT NULL,
    "filePath" text,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    "migratedAt" timestamp with time zone,
    "verifiedAt" timestamp with time zone,
    notes text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: COLUMN migration_tracker.phase; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.migration_tracker.phase IS 'Migration phase (Phase_0, Phase_1, etc.)';


--
-- Name: COLUMN migration_tracker."entityType"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.migration_tracker."entityType" IS 'Type: table, column, variable, function, etc.';


--
-- Name: COLUMN migration_tracker."oldName"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.migration_tracker."oldName" IS 'Original snake_case name';


--
-- Name: COLUMN migration_tracker."newName"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.migration_tracker."newName" IS 'New camelCase name';


--
-- Name: COLUMN migration_tracker."filePath"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.migration_tracker."filePath" IS 'File path for code changes';


--
-- Name: COLUMN migration_tracker.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.migration_tracker.status IS 'pending, in_progress, completed, verified';


--
-- Name: COLUMN migration_tracker."migratedAt"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.migration_tracker."migratedAt" IS 'When migration was applied';


--
-- Name: COLUMN migration_tracker."verifiedAt"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.migration_tracker."verifiedAt" IS 'When migration was verified';


--
-- Name: COLUMN migration_tracker.notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.migration_tracker.notes IS 'Additional notes or issues';


--
-- Name: migration_tracker_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.migration_tracker_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: migration_tracker_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.migration_tracker_id_seq OWNED BY public.migration_tracker.id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    "sessionId" character varying(100) NOT NULL,
    token character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    "userName" character varying(255),
    "workerId" character varying(100),
    "loginTime" timestamp with time zone NOT NULL,
    "loginDate" date NOT NULL,
    expires timestamp with time zone NOT NULL,
    "lastActivityAt" timestamp with time zone,
    "logoutTime" timestamp with time zone,
    "isActive" boolean DEFAULT true,
    "activityLog" jsonb
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    name character varying(255),
    role character varying(50) DEFAULT 'admin'::character varying,
    active boolean DEFAULT true,
    "pwHash" text,
    "pwSalt" text,
    "plainPassword" character varying(255),
    "workerId" character varying(100),
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" timestamp with time zone
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: customers; Type: TABLE; Schema: quotes; Owner: -
--

CREATE TABLE quotes.customers (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255),
    phone character varying(50),
    company character varying(255),
    "taxOffice" character varying(255),
    "taxNumber" character varying(50),
    address text,
    notes text,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    website character varying(255),
    fax character varying(50),
    iban character varying(50),
    "bankName" character varying(255),
    "contactPerson" character varying(255),
    "contactTitle" character varying(100),
    country character varying(100) DEFAULT 'Türkiye'::character varying,
    city character varying(100),
    "postalCode" character varying(20),
    district character varying(100),
    neighbourhood character varying(100),
    "accountCode" character varying(50),
    "isCorporate" boolean DEFAULT true,
    "eInvoiceUser" boolean DEFAULT false,
    "swiftCode" character varying(11),
    "paymentTerms" integer DEFAULT 30,
    "creditLimit" numeric(15,2),
    "addressCity" character varying(50),
    "addressDistrict" character varying(50),
    "addressPostalCode" character varying(10),
    "erpAccountCode" character varying(50),
    "erpSyncedAt" timestamp with time zone,
    "isEInvoiceTaxpayer" boolean DEFAULT false,
    "gibPkLabel" character varying(100),
    "defaultInvoiceScenario" character varying(20) DEFAULT 'TEMEL'::character varying,
    "isEDespatchTaxpayer" boolean DEFAULT false,
    "gibDespatchPkLabel" character varying(255) DEFAULT NULL::character varying
);


--
-- Name: COLUMN customers."isEInvoiceTaxpayer"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.customers."isEInvoiceTaxpayer" IS 'e-Fatura mükellefi mi$1';


--
-- Name: COLUMN customers."gibPkLabel"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.customers."gibPkLabel" IS 'GİB Posta Kutusu etiketi';


--
-- Name: COLUMN customers."defaultInvoiceScenario"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.customers."defaultInvoiceScenario" IS 'Varsayılan fatura senaryosu: TEMEL | TICARI';


--
-- Name: customers_id_seq; Type: SEQUENCE; Schema: quotes; Owner: -
--

CREATE SEQUENCE quotes.customers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customers_id_seq; Type: SEQUENCE OWNED BY; Schema: quotes; Owner: -
--

ALTER SEQUENCE quotes.customers_id_seq OWNED BY quotes.customers.id;


--
-- Name: form_field_option_code_seq; Type: SEQUENCE; Schema: quotes; Owner: -
--

CREATE SEQUENCE quotes.form_field_option_code_seq
    START WITH 10000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: form_field_options; Type: TABLE; Schema: quotes; Owner: -
--

CREATE TABLE quotes.form_field_options (
    id integer NOT NULL,
    "fieldId" integer NOT NULL,
    "optionLabel" character varying(255) NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "optionCode" character varying(20) NOT NULL
);


--
-- Name: form_field_options_id_seq; Type: SEQUENCE; Schema: quotes; Owner: -
--

CREATE SEQUENCE quotes.form_field_options_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: form_field_options_id_seq; Type: SEQUENCE OWNED BY; Schema: quotes; Owner: -
--

ALTER SEQUENCE quotes.form_field_options_id_seq OWNED BY quotes.form_field_options.id;


--
-- Name: form_fields; Type: TABLE; Schema: quotes; Owner: -
--

CREATE TABLE quotes.form_fields (
    id integer NOT NULL,
    "templateId" integer NOT NULL,
    "fieldCode" character varying(100) NOT NULL,
    "fieldName" character varying(255) NOT NULL,
    "fieldType" character varying(50) NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "isRequired" boolean DEFAULT false,
    placeholder text,
    "helpText" text,
    "validationRule" text,
    "defaultValue" character varying(255),
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "showInTable" boolean DEFAULT false,
    "showInFilter" boolean DEFAULT false,
    "tableOrder" integer DEFAULT 0,
    "filterOrder" integer DEFAULT 0
);


--
-- Name: COLUMN form_fields."fieldCode"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.form_fields."fieldCode" IS 'e.g., material, qty, dimensions';


--
-- Name: COLUMN form_fields."fieldName"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.form_fields."fieldName" IS 'Display name';


--
-- Name: COLUMN form_fields."fieldType"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.form_fields."fieldType" IS 'text, number, select, multiselect, date, file';


--
-- Name: COLUMN form_fields."validationRule"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.form_fields."validationRule" IS 'Regex or rule expression';


--
-- Name: form_fields_id_seq; Type: SEQUENCE; Schema: quotes; Owner: -
--

CREATE SEQUENCE quotes.form_fields_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: form_fields_id_seq; Type: SEQUENCE OWNED BY; Schema: quotes; Owner: -
--

ALTER SEQUENCE quotes.form_fields_id_seq OWNED BY quotes.form_fields.id;


--
-- Name: form_templates; Type: TABLE; Schema: quotes; Owner: -
--

CREATE TABLE quotes.form_templates (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    "isActive" boolean DEFAULT true,
    "createdBy" character varying(100),
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: COLUMN form_templates.code; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.form_templates.code IS 'e.g., QUOTE_FORM_V1';


--
-- Name: form_templates_id_seq; Type: SEQUENCE; Schema: quotes; Owner: -
--

CREATE SEQUENCE quotes.form_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: form_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: quotes; Owner: -
--

ALTER SEQUENCE quotes.form_templates_id_seq OWNED BY quotes.form_templates.id;


--
-- Name: price_parameter_lookups; Type: TABLE; Schema: quotes; Owner: -
--

CREATE TABLE quotes.price_parameter_lookups (
    id integer NOT NULL,
    "parameterId" integer NOT NULL,
    "optionCode" character varying(20) NOT NULL,
    value numeric(15,4) NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: price_parameter_lookups_id_seq; Type: SEQUENCE; Schema: quotes; Owner: -
--

CREATE SEQUENCE quotes.price_parameter_lookups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: price_parameter_lookups_id_seq; Type: SEQUENCE OWNED BY; Schema: quotes; Owner: -
--

ALTER SEQUENCE quotes.price_parameter_lookups_id_seq OWNED BY quotes.price_parameter_lookups.id;


--
-- Name: price_parameters; Type: TABLE; Schema: quotes; Owner: -
--

CREATE TABLE quotes.price_parameters (
    id integer NOT NULL,
    code character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    type character varying(50) NOT NULL,
    "fixedValue" numeric(15,4),
    unit character varying(50),
    description text,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "formFieldCode" character varying(100),
    "settingId" integer NOT NULL,
    CONSTRAINT price_parameters_type_check CHECK (((((type)::text = 'fixed'::text) AND ("fixedValue" IS NOT NULL)) OR (((type)::text = 'form_lookup'::text) AND ("formFieldCode" IS NOT NULL))))
);


--
-- Name: COLUMN price_parameters.code; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.price_parameters.code IS 'e.g., material_cost, labor_rate';


--
-- Name: COLUMN price_parameters.type; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.price_parameters.type IS 'fixed, form_lookup, calculated, material_based';


--
-- Name: COLUMN price_parameters."fixedValue"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.price_parameters."fixedValue" IS 'For fixed type parameters';


--
-- Name: COLUMN price_parameters.unit; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.price_parameters.unit IS 'kg, hour, m2, piece';


--
-- Name: COLUMN price_parameters."formFieldCode"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.price_parameters."formFieldCode" IS 'Reference to form_fields.field_code';


--
-- Name: price_parameters_id_seq; Type: SEQUENCE; Schema: quotes; Owner: -
--

CREATE SEQUENCE quotes.price_parameters_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: price_parameters_id_seq; Type: SEQUENCE OWNED BY; Schema: quotes; Owner: -
--

ALTER SEQUENCE quotes.price_parameters_id_seq OWNED BY quotes.price_parameters.id;


--
-- Name: price_settings; Type: TABLE; Schema: quotes; Owner: -
--

CREATE TABLE quotes.price_settings (
    id integer NOT NULL,
    code character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    "isActive" boolean DEFAULT false NOT NULL,
    "createdBy" character varying(255),
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "formulaExpression" text,
    "linkedFormTemplateId" integer
);


--
-- Name: COLUMN price_settings."linkedFormTemplateId"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.price_settings."linkedFormTemplateId" IS 'Form template ID that this pricing version is synced with. Used to detect form changes.';


--
-- Name: price_settings_id_seq; Type: SEQUENCE; Schema: quotes; Owner: -
--

CREATE SEQUENCE quotes.price_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: price_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: quotes; Owner: -
--

ALTER SEQUENCE quotes.price_settings_id_seq OWNED BY quotes.price_settings.id;


--
-- Name: proforma_number_seq; Type: SEQUENCE; Schema: quotes; Owner: -
--

CREATE SEQUENCE quotes.proforma_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quote_documents; Type: TABLE; Schema: quotes; Owner: -
--

CREATE TABLE quotes.quote_documents (
    id integer NOT NULL,
    "quoteId" character varying(50) NOT NULL,
    "documentType" character varying(20) NOT NULL,
    "documentNumber" character varying(50),
    ettn character varying(50),
    "invoiceScenario" character varying(20),
    "invoiceType" character varying(20),
    "exportFormat" character varying(20),
    "exportTarget" character varying(50),
    "fileData" bytea,
    "fileName" character varying(255),
    "mimeType" character varying(100),
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "createdBy" character varying(100),
    notes text,
    CONSTRAINT valid_document_type CHECK ((("documentType")::text = ANY ((ARRAY['proforma'::character varying, 'export'::character varying, 'import'::character varying])::text[])))
);


--
-- Name: quote_documents_id_seq; Type: SEQUENCE; Schema: quotes; Owner: -
--

CREATE SEQUENCE quotes.quote_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quote_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: quotes; Owner: -
--

ALTER SEQUENCE quotes.quote_documents_id_seq OWNED BY quotes.quote_documents.id;


--
-- Name: quote_files; Type: TABLE; Schema: quotes; Owner: -
--

CREATE TABLE quotes.quote_files (
    id integer NOT NULL,
    "quoteId" character varying(50) NOT NULL,
    "fileType" character varying(50) NOT NULL,
    "fileName" character varying(255) NOT NULL,
    "filePath" text NOT NULL,
    "mimeType" character varying(100),
    "fileSize" bigint,
    description text,
    "uploadedBy" character varying(100),
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: COLUMN quote_files."fileType"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quote_files."fileType" IS 'drawing, document, image, other';


--
-- Name: COLUMN quote_files."fileSize"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quote_files."fileSize" IS 'Size in bytes';


--
-- Name: quote_files_id_seq; Type: SEQUENCE; Schema: quotes; Owner: -
--

CREATE SEQUENCE quotes.quote_files_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quote_files_id_seq; Type: SEQUENCE OWNED BY; Schema: quotes; Owner: -
--

ALTER SEQUENCE quotes.quote_files_id_seq OWNED BY quotes.quote_files.id;


--
-- Name: quote_form_data; Type: TABLE; Schema: quotes; Owner: -
--

CREATE TABLE quotes.quote_form_data (
    id integer NOT NULL,
    "quoteId" character varying(50) NOT NULL,
    "fieldId" integer,
    "fieldCode" character varying(100) NOT NULL,
    "fieldValue" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: COLUMN quote_form_data."fieldValue"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quote_form_data."fieldValue" IS 'Stored as text, cast based on field_type';


--
-- Name: quote_form_data_id_seq; Type: SEQUENCE; Schema: quotes; Owner: -
--

CREATE SEQUENCE quotes.quote_form_data_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quote_form_data_id_seq; Type: SEQUENCE OWNED BY; Schema: quotes; Owner: -
--

ALTER SEQUENCE quotes.quote_form_data_id_seq OWNED BY quotes.quote_form_data.id;


--
-- Name: quote_items; Type: TABLE; Schema: quotes; Owner: -
--

CREATE TABLE quotes.quote_items (
    id integer NOT NULL,
    "quoteId" character varying(50) NOT NULL,
    "lineNumber" integer DEFAULT 1,
    "stockCode" character varying(100),
    "productName" character varying(255) NOT NULL,
    description text,
    quantity numeric(15,4) DEFAULT '1'::numeric NOT NULL,
    unit character varying(20) DEFAULT 'adet'::character varying,
    "unitPrice" numeric(15,4) NOT NULL,
    "taxRate" integer DEFAULT 20,
    "discountPercent" numeric(5,2) DEFAULT '0'::numeric,
    subtotal numeric(15,2),
    "discountAmount" numeric(15,2),
    "taxableAmount" numeric(15,2),
    "taxAmount" numeric(15,2),
    "totalAmount" numeric(15,2),
    "vatExemptionId" integer,
    "withholdingRateId" integer,
    "withholdingAmount" numeric(15,2) DEFAULT '0'::numeric,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: COLUMN quote_items."quoteId"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quote_items."quoteId" IS 'İlişkili teklif ID';


--
-- Name: COLUMN quote_items."lineNumber"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quote_items."lineNumber" IS 'Satır numarası';


--
-- Name: COLUMN quote_items."stockCode"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quote_items."stockCode" IS 'Stok kodu (opsiyonel - hizmet olabilir)';


--
-- Name: COLUMN quote_items."productName"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quote_items."productName" IS 'Ürün/Hizmet adı';


--
-- Name: COLUMN quote_items.description; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quote_items.description IS 'Açıklama';


--
-- Name: COLUMN quote_items.quantity; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quote_items.quantity IS 'Miktar';


--
-- Name: COLUMN quote_items.unit; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quote_items.unit IS 'Birim';


--
-- Name: COLUMN quote_items."unitPrice"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quote_items."unitPrice" IS 'Birim fiyat';


--
-- Name: COLUMN quote_items."taxRate"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quote_items."taxRate" IS 'KDV oranı (%)';


--
-- Name: COLUMN quote_items."discountPercent"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quote_items."discountPercent" IS 'İskonto yüzdesi';


--
-- Name: COLUMN quote_items.subtotal; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quote_items.subtotal IS 'Ara toplam (miktar × birim fiyat)';


--
-- Name: COLUMN quote_items."discountAmount"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quote_items."discountAmount" IS 'İskonto tutarı';


--
-- Name: COLUMN quote_items."taxableAmount"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quote_items."taxableAmount" IS 'Vergi matrahı';


--
-- Name: COLUMN quote_items."taxAmount"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quote_items."taxAmount" IS 'KDV tutarı';


--
-- Name: COLUMN quote_items."totalAmount"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quote_items."totalAmount" IS 'Satır toplam';


--
-- Name: COLUMN quote_items."vatExemptionId"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quote_items."vatExemptionId" IS 'KDV muafiyet kodu';


--
-- Name: COLUMN quote_items."withholdingRateId"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quote_items."withholdingRateId" IS 'Tevkifat oranı';


--
-- Name: COLUMN quote_items."withholdingAmount"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quote_items."withholdingAmount" IS 'Tevkifat tutarı';


--
-- Name: COLUMN quote_items."createdAt"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quote_items."createdAt" IS 'Oluşturulma tarihi';


--
-- Name: COLUMN quote_items."updatedAt"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quote_items."updatedAt" IS 'Güncellenme tarihi';


--
-- Name: quote_items_id_seq; Type: SEQUENCE; Schema: quotes; Owner: -
--

CREATE SEQUENCE quotes.quote_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quote_items_id_seq; Type: SEQUENCE OWNED BY; Schema: quotes; Owner: -
--

ALTER SEQUENCE quotes.quote_items_id_seq OWNED BY quotes.quote_items.id;


--
-- Name: quotes; Type: TABLE; Schema: quotes; Owner: -
--

CREATE TABLE quotes.quotes (
    id character varying(50) NOT NULL,
    status character varying(50) DEFAULT 'new'::character varying NOT NULL,
    "customerId" integer,
    "isCustomer" boolean DEFAULT false,
    "customerName" character varying(255),
    "customerEmail" character varying(255),
    "customerPhone" character varying(50),
    "customerCompany" character varying(255),
    "customerAddress" text,
    "formTemplateId" integer,
    "formTemplateCode" character varying(100),
    "priceSettingId" integer,
    "priceSettingCode" character varying(100),
    "calculatedPrice" numeric,
    "manualPrice" numeric,
    "manualPriceReason" text,
    "finalPrice" numeric,
    "lastCalculatedAt" timestamp with time zone,
    "workOrderCode" character varying(50),
    "deliveryDate" timestamp with time zone,
    "approvedAt" timestamp with time zone,
    "approvedBy" character varying(100),
    notes text,
    "createdBy" character varying(100),
    "updatedBy" character varying(100),
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "projectName" character varying(255) DEFAULT 'oldStructure'::character varying,
    "forceCompleted" boolean DEFAULT false,
    "forceCompleteReason" text,
    "forceCompletedAt" timestamp without time zone,
    "proformaNumber" character varying(50),
    "proformaCreatedAt" timestamp with time zone,
    "invoiceScenario" character varying(20),
    "invoiceType" character varying(20),
    "invoiceNumber" character varying(50),
    "invoiceEttn" character varying(50),
    "invoiceExportedAt" timestamp with time zone,
    "invoiceImportedAt" timestamp with time zone,
    "invoiceImportedFile" bytea,
    "invoiceImportedFileName" character varying(255),
    currency character varying(10) DEFAULT 'TRY'::character varying,
    "exchangeRate" numeric(10,4) DEFAULT 1.0
);


--
-- Name: COLUMN quotes."proformaNumber"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quotes."proformaNumber" IS 'Proforma numarası: PF-2025-0001';


--
-- Name: COLUMN quotes."proformaCreatedAt"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quotes."proformaCreatedAt" IS 'Proforma oluşturulma tarihi';


--
-- Name: COLUMN quotes."invoiceScenario"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quotes."invoiceScenario" IS 'TEMEL | TICARI';


--
-- Name: COLUMN quotes."invoiceType"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quotes."invoiceType" IS 'SATIS | IADE | ISTISNA | OZELMATRAH';


--
-- Name: COLUMN quotes."invoiceNumber"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quotes."invoiceNumber" IS 'Logo/Zirve fatura numarası';


--
-- Name: COLUMN quotes."invoiceEttn"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quotes."invoiceEttn" IS 'GİB ETTN (UUID formatı)';


--
-- Name: COLUMN quotes."invoiceExportedAt"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quotes."invoiceExportedAt" IS 'Fatura export tarihi';


--
-- Name: COLUMN quotes."invoiceImportedAt"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quotes."invoiceImportedAt" IS 'Fatura import tarihi (ETTN alındı)';


--
-- Name: COLUMN quotes."invoiceImportedFile"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quotes."invoiceImportedFile" IS 'Import edilen fatura dosyası';


--
-- Name: COLUMN quotes."invoiceImportedFileName"; Type: COMMENT; Schema: quotes; Owner: -
--

COMMENT ON COLUMN quotes.quotes."invoiceImportedFileName" IS 'Import edilen dosya adı';


--
-- Name: audit_logs; Type: TABLE; Schema: settings; Owner: -
--

CREATE TABLE settings.audit_logs (
    id integer NOT NULL,
    "entityType" character varying(100) NOT NULL,
    "entityId" character varying(100) NOT NULL,
    action character varying(50) NOT NULL,
    changes jsonb,
    "userId" character varying(255),
    "userEmail" character varying(255),
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" character varying(50)
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: settings; Owner: -
--

CREATE SEQUENCE settings.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: settings; Owner: -
--

ALTER SEQUENCE settings.audit_logs_id_seq OWNED BY settings.audit_logs.id;


--
-- Name: settings; Type: TABLE; Schema: settings; Owner: -
--

CREATE TABLE settings.settings (
    key character varying(50) NOT NULL,
    value jsonb NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" character varying(100)
);


--
-- Name: TABLE settings; Type: COMMENT; Schema: settings; Owner: -
--

COMMENT ON TABLE settings.settings IS 'Stores global system settings and configurations.';


--
-- Name: system_config; Type: TABLE; Schema: settings; Owner: -
--

CREATE TABLE settings.system_config (
    id character varying(100) NOT NULL,
    key character varying(255) NOT NULL,
    value jsonb,
    description text,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: cities id; Type: DEFAULT; Schema: address_data; Owner: -
--

ALTER TABLE ONLY address_data.cities ALTER COLUMN id SET DEFAULT nextval('address_data.cities_id_seq'::regclass);


--
-- Name: counties id; Type: DEFAULT; Schema: address_data; Owner: -
--

ALTER TABLE ONLY address_data.counties ALTER COLUMN id SET DEFAULT nextval('address_data.counties_id_seq'::regclass);


--
-- Name: countries id; Type: DEFAULT; Schema: address_data; Owner: -
--

ALTER TABLE ONLY address_data.countries ALTER COLUMN id SET DEFAULT nextval('address_data.countries_id_seq'::regclass);


--
-- Name: districts id; Type: DEFAULT; Schema: address_data; Owner: -
--

ALTER TABLE ONLY address_data.districts ALTER COLUMN id SET DEFAULT nextval('address_data.districts_id_seq'::regclass);


--
-- Name: neighbourhoods id; Type: DEFAULT; Schema: address_data; Owner: -
--

ALTER TABLE ONLY address_data.neighbourhoods ALTER COLUMN id SET DEFAULT nextval('address_data.neighbourhoods_id_seq'::regclass);


--
-- Name: materials id; Type: DEFAULT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.materials ALTER COLUMN id SET DEFAULT nextval('materials.materials_id_seq'::regclass);


--
-- Name: order_items id; Type: DEFAULT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.order_items ALTER COLUMN id SET DEFAULT nextval('materials.order_items_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.orders ALTER COLUMN id SET DEFAULT nextval('materials.orders_id_seq'::regclass);


--
-- Name: service_cards id; Type: DEFAULT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.service_cards ALTER COLUMN id SET DEFAULT nextval('materials.service_cards_id_seq'::regclass);


--
-- Name: shipment_items id; Type: DEFAULT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.shipment_items ALTER COLUMN id SET DEFAULT nextval('materials.shipment_items_id_seq'::regclass);


--
-- Name: shipment_settings id; Type: DEFAULT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.shipment_settings ALTER COLUMN id SET DEFAULT nextval('materials.shipment_settings_id_seq'::regclass);


--
-- Name: shipment_templates id; Type: DEFAULT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.shipment_templates ALTER COLUMN id SET DEFAULT nextval('materials.shipment_templates_id_seq'::regclass);


--
-- Name: shipments id; Type: DEFAULT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.shipments ALTER COLUMN id SET DEFAULT nextval('materials.shipments_id_seq'::regclass);


--
-- Name: stock_movements id; Type: DEFAULT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.stock_movements ALTER COLUMN id SET DEFAULT nextval('materials.stock_movements_id_seq'::regclass);


--
-- Name: suppliers id; Type: DEFAULT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.suppliers ALTER COLUMN id SET DEFAULT nextval('materials.suppliers_id_seq'::regclass);


--
-- Name: vat_exemption_codes id; Type: DEFAULT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.vat_exemption_codes ALTER COLUMN id SET DEFAULT nextval('materials.vat_exemption_codes_id_seq'::regclass);


--
-- Name: withholding_rates id; Type: DEFAULT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.withholding_rates ALTER COLUMN id SET DEFAULT nextval('materials.withholding_rates_id_seq'::regclass);


--
-- Name: assignment_material_reservations id; Type: DEFAULT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.assignment_material_reservations ALTER COLUMN id SET DEFAULT nextval('mes.assignment_material_reservations_id_seq'::regclass);


--
-- Name: assignment_status_history id; Type: DEFAULT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.assignment_status_history ALTER COLUMN id SET DEFAULT nextval('mes.assignment_status_history_id_seq'::regclass);


--
-- Name: entity_relations id; Type: DEFAULT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.entity_relations ALTER COLUMN id SET DEFAULT nextval('mes.entity_relations_id_seq'::regclass);


--
-- Name: node_material_inputs id; Type: DEFAULT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.node_material_inputs ALTER COLUMN id SET DEFAULT nextval('mes.node_material_inputs_id_seq'::regclass);


--
-- Name: node_predecessors id; Type: DEFAULT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.node_predecessors ALTER COLUMN id SET DEFAULT nextval('mes.node_predecessors_id_seq'::regclass);


--
-- Name: node_stations id; Type: DEFAULT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.node_stations ALTER COLUMN id SET DEFAULT nextval('mes.node_stations_id_seq'::regclass);


--
-- Name: plan_material_requirements id; Type: DEFAULT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.plan_material_requirements ALTER COLUMN id SET DEFAULT nextval('mes.plan_material_requirements_id_seq'::regclass);


--
-- Name: plan_wip_outputs id; Type: DEFAULT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.plan_wip_outputs ALTER COLUMN id SET DEFAULT nextval('mes.plan_wip_outputs_id_seq'::regclass);


--
-- Name: production_plan_nodes id; Type: DEFAULT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.production_plan_nodes ALTER COLUMN id SET DEFAULT nextval('mes.production_plan_nodes_id_seq'::regclass);


--
-- Name: worker_assignments id; Type: DEFAULT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.worker_assignments ALTER COLUMN id SET DEFAULT nextval('mes.worker_assignments_id_seq'::regclass);


--
-- Name: knex_migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_id_seq'::regclass);


--
-- Name: knex_migrations_lock index; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_lock_index_seq'::regclass);


--
-- Name: migration_tracker id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_tracker ALTER COLUMN id SET DEFAULT nextval('public.migration_tracker_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: customers id; Type: DEFAULT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.customers ALTER COLUMN id SET DEFAULT nextval('quotes.customers_id_seq'::regclass);


--
-- Name: form_field_options id; Type: DEFAULT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.form_field_options ALTER COLUMN id SET DEFAULT nextval('quotes.form_field_options_id_seq'::regclass);


--
-- Name: form_fields id; Type: DEFAULT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.form_fields ALTER COLUMN id SET DEFAULT nextval('quotes.form_fields_id_seq'::regclass);


--
-- Name: form_templates id; Type: DEFAULT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.form_templates ALTER COLUMN id SET DEFAULT nextval('quotes.form_templates_id_seq'::regclass);


--
-- Name: price_parameter_lookups id; Type: DEFAULT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.price_parameter_lookups ALTER COLUMN id SET DEFAULT nextval('quotes.price_parameter_lookups_id_seq'::regclass);


--
-- Name: price_parameters id; Type: DEFAULT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.price_parameters ALTER COLUMN id SET DEFAULT nextval('quotes.price_parameters_id_seq'::regclass);


--
-- Name: price_settings id; Type: DEFAULT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.price_settings ALTER COLUMN id SET DEFAULT nextval('quotes.price_settings_id_seq'::regclass);


--
-- Name: quote_documents id; Type: DEFAULT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.quote_documents ALTER COLUMN id SET DEFAULT nextval('quotes.quote_documents_id_seq'::regclass);


--
-- Name: quote_files id; Type: DEFAULT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.quote_files ALTER COLUMN id SET DEFAULT nextval('quotes.quote_files_id_seq'::regclass);


--
-- Name: quote_form_data id; Type: DEFAULT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.quote_form_data ALTER COLUMN id SET DEFAULT nextval('quotes.quote_form_data_id_seq'::regclass);


--
-- Name: quote_items id; Type: DEFAULT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.quote_items ALTER COLUMN id SET DEFAULT nextval('quotes.quote_items_id_seq'::regclass);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: settings; Owner: -
--

ALTER TABLE ONLY settings.audit_logs ALTER COLUMN id SET DEFAULT nextval('settings.audit_logs_id_seq'::regclass);


--
-- Name: cities cities_pkey; Type: CONSTRAINT; Schema: address_data; Owner: -
--

ALTER TABLE ONLY address_data.cities
    ADD CONSTRAINT cities_pkey PRIMARY KEY (id);


--
-- Name: counties counties_pkey; Type: CONSTRAINT; Schema: address_data; Owner: -
--

ALTER TABLE ONLY address_data.counties
    ADD CONSTRAINT counties_pkey PRIMARY KEY (id);


--
-- Name: countries countries_pkey; Type: CONSTRAINT; Schema: address_data; Owner: -
--

ALTER TABLE ONLY address_data.countries
    ADD CONSTRAINT countries_pkey PRIMARY KEY (id);


--
-- Name: districts districts_pkey; Type: CONSTRAINT; Schema: address_data; Owner: -
--

ALTER TABLE ONLY address_data.districts
    ADD CONSTRAINT districts_pkey PRIMARY KEY (id);


--
-- Name: neighbourhoods neighbourhoods_pkey; Type: CONSTRAINT; Schema: address_data; Owner: -
--

ALTER TABLE ONLY address_data.neighbourhoods
    ADD CONSTRAINT neighbourhoods_pkey PRIMARY KEY (id);


--
-- Name: material_supplier_relation material_supplier_relation_pkey; Type: CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.material_supplier_relation
    ADD CONSTRAINT material_supplier_relation_pkey PRIMARY KEY ("materialId", "supplierId");


--
-- Name: materials_categories materials_categories_pkey; Type: CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.materials_categories
    ADD CONSTRAINT materials_categories_pkey PRIMARY KEY (id);


--
-- Name: materials materials_code_unique; Type: CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.materials
    ADD CONSTRAINT materials_code_unique UNIQUE (code);


--
-- Name: materials materials_pkey; Type: CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.materials
    ADD CONSTRAINT materials_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_item_code_unique; Type: CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.order_items
    ADD CONSTRAINT order_items_item_code_unique UNIQUE ("itemCode");


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_order_code_unique; Type: CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.orders
    ADD CONSTRAINT orders_order_code_unique UNIQUE ("orderCode");


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: service_cards service_cards_code_key; Type: CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.service_cards
    ADD CONSTRAINT service_cards_code_key UNIQUE (code);


--
-- Name: service_cards service_cards_pkey; Type: CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.service_cards
    ADD CONSTRAINT service_cards_pkey PRIMARY KEY (id);


--
-- Name: shipment_items shipment_items_pkey; Type: CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.shipment_items
    ADD CONSTRAINT shipment_items_pkey PRIMARY KEY (id);


--
-- Name: shipment_settings shipment_settings_key_key; Type: CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.shipment_settings
    ADD CONSTRAINT shipment_settings_key_key UNIQUE (key);


--
-- Name: shipment_settings shipment_settings_pkey; Type: CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.shipment_settings
    ADD CONSTRAINT shipment_settings_pkey PRIMARY KEY (id);


--
-- Name: shipment_templates shipment_templates_pkey; Type: CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.shipment_templates
    ADD CONSTRAINT shipment_templates_pkey PRIMARY KEY (id);


--
-- Name: shipments shipments_pkey; Type: CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.shipments
    ADD CONSTRAINT shipments_pkey PRIMARY KEY (id);


--
-- Name: shipments shipments_shipmentCode_key; Type: CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.shipments
    ADD CONSTRAINT "shipments_shipmentCode_key" UNIQUE ("shipmentCode");


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_code_unique; Type: CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.suppliers
    ADD CONSTRAINT suppliers_code_unique UNIQUE (code);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: vat_exemption_codes vat_exemption_codes_code_key; Type: CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.vat_exemption_codes
    ADD CONSTRAINT vat_exemption_codes_code_key UNIQUE (code);


--
-- Name: vat_exemption_codes vat_exemption_codes_pkey; Type: CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.vat_exemption_codes
    ADD CONSTRAINT vat_exemption_codes_pkey PRIMARY KEY (id);


--
-- Name: withholding_rates withholding_rates_code_key; Type: CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.withholding_rates
    ADD CONSTRAINT withholding_rates_code_key UNIQUE (code);


--
-- Name: withholding_rates withholding_rates_pkey; Type: CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.withholding_rates
    ADD CONSTRAINT withholding_rates_pkey PRIMARY KEY (id);


--
-- Name: assignment_material_reservations assignment_material_reservations_pkey; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.assignment_material_reservations
    ADD CONSTRAINT assignment_material_reservations_pkey PRIMARY KEY (id);


--
-- Name: assignment_status_history assignment_status_history_pkey; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.assignment_status_history
    ADD CONSTRAINT assignment_status_history_pkey PRIMARY KEY (id);


--
-- Name: entity_relations entity_relations_pkey; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.entity_relations
    ADD CONSTRAINT entity_relations_pkey PRIMARY KEY (id);


--
-- Name: alerts mes_alerts_pkey; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.alerts
    ADD CONSTRAINT mes_alerts_pkey PRIMARY KEY (id);


--
-- Name: counters mes_counters_pkey; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.counters
    ADD CONSTRAINT mes_counters_pkey PRIMARY KEY (id);


--
-- Name: operations mes_operations_pkey; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.operations
    ADD CONSTRAINT mes_operations_pkey PRIMARY KEY (id);


--
-- Name: production_plans mes_production_plans_pkey; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.production_plans
    ADD CONSTRAINT mes_production_plans_pkey PRIMARY KEY (id);


--
-- Name: settings mes_settings_key_unique; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.settings
    ADD CONSTRAINT mes_settings_key_unique UNIQUE (key);


--
-- Name: settings mes_settings_pkey; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.settings
    ADD CONSTRAINT mes_settings_pkey PRIMARY KEY (id);


--
-- Name: stations mes_stations_pkey; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.stations
    ADD CONSTRAINT mes_stations_pkey PRIMARY KEY (id);


--
-- Name: substations mes_substations_pkey; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.substations
    ADD CONSTRAINT mes_substations_pkey PRIMARY KEY (id);


--
-- Name: work_orders mes_work_orders_code_unique; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.work_orders
    ADD CONSTRAINT mes_work_orders_code_unique UNIQUE (code);


--
-- Name: work_orders mes_work_orders_pkey; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.work_orders
    ADD CONSTRAINT mes_work_orders_pkey PRIMARY KEY (id);


--
-- Name: workers mes_workers_pkey; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.workers
    ADD CONSTRAINT mes_workers_pkey PRIMARY KEY (id);


--
-- Name: node_material_inputs node_material_inputs_pkey; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.node_material_inputs
    ADD CONSTRAINT node_material_inputs_pkey PRIMARY KEY (id);


--
-- Name: node_predecessors node_predecessors_node_id_predecessor_node_id_unique; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.node_predecessors
    ADD CONSTRAINT node_predecessors_node_id_predecessor_node_id_unique UNIQUE ("nodeId", "predecessorNodeId");


--
-- Name: node_predecessors node_predecessors_pkey; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.node_predecessors
    ADD CONSTRAINT node_predecessors_pkey PRIMARY KEY (id);


--
-- Name: node_stations node_stations_node_station_unique; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.node_stations
    ADD CONSTRAINT node_stations_node_station_unique UNIQUE ("nodeId", "stationId");


--
-- Name: node_stations node_stations_pkey; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.node_stations
    ADD CONSTRAINT node_stations_pkey PRIMARY KEY (id);


--
-- Name: plan_material_requirements plan_material_requirements_pkey; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.plan_material_requirements
    ADD CONSTRAINT plan_material_requirements_pkey PRIMARY KEY (id);


--
-- Name: plan_wip_outputs plan_wip_outputs_pkey; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.plan_wip_outputs
    ADD CONSTRAINT plan_wip_outputs_pkey PRIMARY KEY (id);


--
-- Name: production_plan_nodes production_plan_nodes_node_id_unique; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.production_plan_nodes
    ADD CONSTRAINT production_plan_nodes_node_id_unique UNIQUE ("nodeId");


--
-- Name: production_plan_nodes production_plan_nodes_pkey; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.production_plan_nodes
    ADD CONSTRAINT production_plan_nodes_pkey PRIMARY KEY (id);


--
-- Name: production_plan_nodes production_plan_nodes_plan_id_node_id_unique; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.production_plan_nodes
    ADD CONSTRAINT production_plan_nodes_plan_id_node_id_unique UNIQUE ("planId", "nodeId");


--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);


--
-- Name: assignment_material_reservations uk_assignment_material_lot; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.assignment_material_reservations
    ADD CONSTRAINT uk_assignment_material_lot UNIQUE ("assignmentId", "materialCode", "lotNumber");


--
-- Name: entity_relations uk_entity_relation; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.entity_relations
    ADD CONSTRAINT uk_entity_relation UNIQUE ("sourceType", "sourceId", "relationType", "targetId");


--
-- Name: worker_assignments worker_assignments_pkey; Type: CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.worker_assignments
    ADD CONSTRAINT worker_assignments_pkey PRIMARY KEY (id);


--
-- Name: knex_migrations_lock knex_migrations_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations_lock
    ADD CONSTRAINT knex_migrations_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations knex_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations
    ADD CONSTRAINT knex_migrations_pkey PRIMARY KEY (id);


--
-- Name: migration_tracker migration_tracker_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_tracker
    ADD CONSTRAINT migration_tracker_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY ("sessionId");


--
-- Name: sessions sessions_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_token_unique UNIQUE (token);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: form_field_options form_field_options_code_unique; Type: CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.form_field_options
    ADD CONSTRAINT form_field_options_code_unique UNIQUE ("optionCode");


--
-- Name: form_field_options form_field_options_pkey; Type: CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.form_field_options
    ADD CONSTRAINT form_field_options_pkey PRIMARY KEY (id);


--
-- Name: form_fields form_fields_pkey; Type: CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.form_fields
    ADD CONSTRAINT form_fields_pkey PRIMARY KEY (id);


--
-- Name: form_fields form_fields_template_id_field_code_unique; Type: CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.form_fields
    ADD CONSTRAINT form_fields_template_id_field_code_unique UNIQUE ("templateId", "fieldCode");


--
-- Name: form_templates form_templates_pkey; Type: CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.form_templates
    ADD CONSTRAINT form_templates_pkey PRIMARY KEY (id);


--
-- Name: price_parameter_lookups price_parameter_lookups_pkey; Type: CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.price_parameter_lookups
    ADD CONSTRAINT price_parameter_lookups_pkey PRIMARY KEY (id);


--
-- Name: price_parameter_lookups price_parameter_lookups_unique; Type: CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.price_parameter_lookups
    ADD CONSTRAINT price_parameter_lookups_unique UNIQUE ("parameterId", "optionCode");


--
-- Name: price_parameters price_parameters_code_setting_unique; Type: CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.price_parameters
    ADD CONSTRAINT price_parameters_code_setting_unique UNIQUE (code, "settingId");


--
-- Name: price_parameters price_parameters_pkey; Type: CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.price_parameters
    ADD CONSTRAINT price_parameters_pkey PRIMARY KEY (id);


--
-- Name: price_settings price_settings_pkey; Type: CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.price_settings
    ADD CONSTRAINT price_settings_pkey PRIMARY KEY (id);


--
-- Name: quote_documents quote_documents_pkey; Type: CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.quote_documents
    ADD CONSTRAINT quote_documents_pkey PRIMARY KEY (id);


--
-- Name: quote_files quote_files_pkey; Type: CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.quote_files
    ADD CONSTRAINT quote_files_pkey PRIMARY KEY (id);


--
-- Name: quote_form_data quote_form_data_pkey; Type: CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.quote_form_data
    ADD CONSTRAINT quote_form_data_pkey PRIMARY KEY (id);


--
-- Name: quote_form_data quote_form_data_quote_id_field_id_unique; Type: CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.quote_form_data
    ADD CONSTRAINT quote_form_data_quote_id_field_id_unique UNIQUE ("quoteId", "fieldId");


--
-- Name: quote_items quote_items_pkey; Type: CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.quote_items
    ADD CONSTRAINT quote_items_pkey PRIMARY KEY (id);


--
-- Name: quotes quotes_new_pkey; Type: CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.quotes
    ADD CONSTRAINT quotes_new_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: settings; Owner: -
--

ALTER TABLE ONLY settings.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: settings; Owner: -
--

ALTER TABLE ONLY settings.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (key);


--
-- Name: system_config system_config_key_unique; Type: CONSTRAINT; Schema: settings; Owner: -
--

ALTER TABLE ONLY settings.system_config
    ADD CONSTRAINT system_config_key_unique UNIQUE (key);


--
-- Name: system_config system_config_pkey; Type: CONSTRAINT; Schema: settings; Owner: -
--

ALTER TABLE ONLY settings.system_config
    ADD CONSTRAINT system_config_pkey PRIMARY KEY (id);


--
-- Name: idx_cities_country; Type: INDEX; Schema: address_data; Owner: -
--

CREATE INDEX idx_cities_country ON address_data.cities USING btree (country_id);


--
-- Name: idx_cities_name; Type: INDEX; Schema: address_data; Owner: -
--

CREATE INDEX idx_cities_name ON address_data.cities USING btree (name);


--
-- Name: idx_counties_city; Type: INDEX; Schema: address_data; Owner: -
--

CREATE INDEX idx_counties_city ON address_data.counties USING btree (city_id);


--
-- Name: idx_counties_name; Type: INDEX; Schema: address_data; Owner: -
--

CREATE INDEX idx_counties_name ON address_data.counties USING btree (name);


--
-- Name: idx_districts_county; Type: INDEX; Schema: address_data; Owner: -
--

CREATE INDEX idx_districts_county ON address_data.districts USING btree (county_id);


--
-- Name: idx_neighbourhoods_district; Type: INDEX; Schema: address_data; Owner: -
--

CREATE INDEX idx_neighbourhoods_district ON address_data.neighbourhoods USING btree (district_id);


--
-- Name: idx_neighbourhoods_name; Type: INDEX; Schema: address_data; Owner: -
--

CREATE INDEX idx_neighbourhoods_name ON address_data.neighbourhoods USING btree (name);


--
-- Name: idx_neighbourhoods_postcode; Type: INDEX; Schema: address_data; Owner: -
--

CREATE INDEX idx_neighbourhoods_postcode ON address_data.neighbourhoods USING btree (post_code);


--
-- Name: idx_assignment_movements; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_assignment_movements ON materials.stock_movements USING btree ("assignmentId") WHERE ("assignmentId" IS NOT NULL);


--
-- Name: idx_expiry; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_expiry ON materials.stock_movements USING btree ("expiryDate") WHERE ("expiryDate" IS NOT NULL);


--
-- Name: idx_fifo_lots; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_fifo_lots ON materials.stock_movements USING btree ("materialCode", "lotDate", type) WHERE ((type = 'in'::text) AND ("lotNumber" IS NOT NULL));


--
-- Name: idx_lot; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_lot ON materials.order_items USING btree ("lotNumber") WHERE ("lotNumber" IS NOT NULL);


--
-- Name: idx_lot_number; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_lot_number ON materials.stock_movements USING btree ("lotNumber") WHERE ("lotNumber" IS NOT NULL);


--
-- Name: idx_material_lot; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_material_lot ON materials.stock_movements USING btree ("materialCode", "lotNumber") WHERE ("lotNumber" IS NOT NULL);


--
-- Name: idx_node_sequence; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_node_sequence ON materials.stock_movements USING btree ("relatedPlanId", "nodeSequence") WHERE ("nodeSequence" IS NOT NULL);


--
-- Name: idx_partial_warnings; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_partial_warnings ON materials.stock_movements USING btree ("partialReservation") WHERE ("partialReservation" = true);


--
-- Name: idx_service_cards_active; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_service_cards_active ON materials.service_cards USING btree ("isActive");


--
-- Name: idx_service_cards_category; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_service_cards_category ON materials.service_cards USING btree (category);


--
-- Name: idx_service_cards_code; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_service_cards_code ON materials.service_cards USING btree (code);


--
-- Name: idx_shipment_items_lot; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_shipment_items_lot ON materials.shipment_items USING btree ("lotNumber");


--
-- Name: idx_shipment_items_material; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_shipment_items_material ON materials.shipment_items USING btree ("materialCode");


--
-- Name: idx_shipment_items_quote_item; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_shipment_items_quote_item ON materials.shipment_items USING btree ("quoteItemId");


--
-- Name: idx_shipment_items_service_card; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_shipment_items_service_card ON materials.shipment_items USING btree ("serviceCardId");


--
-- Name: idx_shipment_items_shipment; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_shipment_items_shipment ON materials.shipment_items USING btree ("shipmentId");


--
-- Name: idx_shipment_items_type; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_shipment_items_type ON materials.shipment_items USING btree ("itemType");


--
-- Name: idx_shipment_templates_active; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_shipment_templates_active ON materials.shipment_templates USING btree ("isActive");


--
-- Name: idx_shipment_templates_created_by; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_shipment_templates_created_by ON materials.shipment_templates USING btree ("createdBy");


--
-- Name: idx_shipment_templates_usage_count; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_shipment_templates_usage_count ON materials.shipment_templates USING btree ("usageCount" DESC);


--
-- Name: idx_shipments_code; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_shipments_code ON materials.shipments USING btree ("shipmentCode");


--
-- Name: idx_shipments_customer_id; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_shipments_customer_id ON materials.shipments USING btree ("customerId");


--
-- Name: idx_shipments_document_status; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_shipments_document_status ON materials.shipments USING btree ("documentStatus");


--
-- Name: idx_shipments_document_type; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_shipments_document_type ON materials.shipments USING btree ("documentType");


--
-- Name: idx_shipments_external_doc; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_shipments_external_doc ON materials.shipments USING btree ("externalDocNumber") WHERE ("externalDocNumber" IS NOT NULL);


--
-- Name: idx_shipments_related_quote; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_shipments_related_quote ON materials.shipments USING btree ("relatedQuoteId") WHERE ("relatedQuoteId" IS NOT NULL);


--
-- Name: idx_shipments_source_document; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_shipments_source_document ON materials.shipments USING btree ("sourceDocument", "sourceDocumentId");


--
-- Name: idx_shipments_status; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_shipments_status ON materials.shipments USING btree (status);


--
-- Name: idx_shipments_transport_type; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_shipments_transport_type ON materials.shipments USING btree ("transportType");


--
-- Name: idx_shipments_waybill_date; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX idx_shipments_waybill_date ON materials.shipments USING btree ("waybillDate");


--
-- Name: material_supplier_relation_is_primary_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX material_supplier_relation_is_primary_index ON materials.material_supplier_relation USING btree ("isPrimary");


--
-- Name: material_supplier_relation_material_id_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX material_supplier_relation_material_id_index ON materials.material_supplier_relation USING btree ("materialId");


--
-- Name: material_supplier_relation_supplier_id_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX material_supplier_relation_supplier_id_index ON materials.material_supplier_relation USING btree ("supplierId");


--
-- Name: materials_barcode_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX materials_barcode_index ON materials.materials USING btree (barcode);


--
-- Name: materials_categories_is_active_sort_order_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX materials_categories_is_active_sort_order_index ON materials.materials_categories USING btree ("isActive", "sortOrder");


--
-- Name: materials_categories_name_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX materials_categories_name_index ON materials.materials_categories USING btree (name);


--
-- Name: materials_categories_parent_category_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX materials_categories_parent_category_index ON materials.materials_categories USING btree ("parentCategory");


--
-- Name: materials_category_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX materials_category_index ON materials.materials USING btree (category);


--
-- Name: materials_category_status_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX materials_category_status_index ON materials.materials USING btree (category, status);


--
-- Name: materials_code_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX materials_code_index ON materials.materials USING btree (code);


--
-- Name: materials_name_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX materials_name_index ON materials.materials USING btree (name);


--
-- Name: materials_status_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX materials_status_index ON materials.materials USING btree (status);


--
-- Name: materials_suppliers_city_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX materials_suppliers_city_index ON materials.suppliers USING btree (city);


--
-- Name: materials_suppliers_compliance_status_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX materials_suppliers_compliance_status_index ON materials.suppliers USING btree ("complianceStatus");


--
-- Name: materials_suppliers_status_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX materials_suppliers_status_index ON materials.suppliers USING btree (status);


--
-- Name: materials_suppliers_supplier_type_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX materials_suppliers_supplier_type_index ON materials.suppliers USING btree ("supplierType");


--
-- Name: materials_type_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX materials_type_index ON materials.materials USING btree (type);


--
-- Name: materials_type_status_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX materials_type_status_index ON materials.materials USING btree (type, status);


--
-- Name: order_items_actual_delivery_date_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX order_items_actual_delivery_date_index ON materials.order_items USING btree ("actualDeliveryDate");


--
-- Name: order_items_item_status_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX order_items_item_status_index ON materials.order_items USING btree ("itemStatus");


--
-- Name: order_items_material_id_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX order_items_material_id_index ON materials.order_items USING btree ("materialId");


--
-- Name: order_items_order_id_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX order_items_order_id_index ON materials.order_items USING btree ("orderId");


--
-- Name: order_items_order_id_item_status_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX order_items_order_id_item_status_index ON materials.order_items USING btree ("orderId", "itemStatus");


--
-- Name: orders_order_date_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX orders_order_date_index ON materials.orders USING btree ("orderDate");


--
-- Name: orders_order_date_order_status_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX orders_order_date_order_status_index ON materials.orders USING btree ("orderDate", "orderStatus");


--
-- Name: orders_order_status_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX orders_order_status_index ON materials.orders USING btree ("orderStatus");


--
-- Name: orders_supplier_id_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX orders_supplier_id_index ON materials.orders USING btree ("supplierId");


--
-- Name: stock_movements_material_code_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX stock_movements_material_code_index ON materials.stock_movements USING btree ("materialCode");


--
-- Name: stock_movements_material_id_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX stock_movements_material_id_index ON materials.stock_movements USING btree ("materialId");


--
-- Name: stock_movements_material_id_movement_date_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX stock_movements_material_id_movement_date_index ON materials.stock_movements USING btree ("materialId", "movementDate");


--
-- Name: stock_movements_movement_date_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX stock_movements_movement_date_index ON materials.stock_movements USING btree ("movementDate");


--
-- Name: stock_movements_reference_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX stock_movements_reference_index ON materials.stock_movements USING btree (reference);


--
-- Name: stock_movements_reference_reference_type_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX stock_movements_reference_reference_type_index ON materials.stock_movements USING btree (reference, "referenceType");


--
-- Name: stock_movements_reference_type_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX stock_movements_reference_type_index ON materials.stock_movements USING btree ("referenceType");


--
-- Name: stock_movements_status_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX stock_movements_status_index ON materials.stock_movements USING btree (status);


--
-- Name: stock_movements_sub_type_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX stock_movements_sub_type_index ON materials.stock_movements USING btree ("subType");


--
-- Name: stock_movements_type_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX stock_movements_type_index ON materials.stock_movements USING btree (type);


--
-- Name: suppliers_code_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX suppliers_code_index ON materials.suppliers USING btree (code);


--
-- Name: suppliers_is_active_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX suppliers_is_active_index ON materials.suppliers USING btree ("isActive");


--
-- Name: suppliers_name_index; Type: INDEX; Schema: materials; Owner: -
--

CREATE INDEX suppliers_name_index ON materials.suppliers USING btree (name);


--
-- Name: idx_assignment_lot; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_assignment_lot ON mes.assignment_material_reservations USING btree ("assignmentId", "lotNumber") WHERE ("lotNumber" IS NOT NULL);


--
-- Name: idx_assignment_reservations; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_assignment_reservations ON mes.assignment_material_reservations USING btree ("assignmentId");


--
-- Name: idx_composite; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_composite ON mes.entity_relations USING btree ("sourceType", "sourceId", "relationType");


--
-- Name: idx_material_reservations; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_material_reservations ON mes.assignment_material_reservations USING btree ("materialCode");


--
-- Name: idx_material_status_qty; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_material_status_qty ON mes.assignment_material_reservations USING btree ("materialCode", "reservationStatus", "actualReservedQty") WHERE ("actualReservedQty" < "preProductionQty");


--
-- Name: idx_node_predecessors; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_node_predecessors ON mes.entity_relations USING btree ("sourceId", "targetId") WHERE ((("sourceType")::text = 'node'::text) AND (("relationType")::text = 'predecessor'::text));


--
-- Name: idx_node_predecessors_graph; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_node_predecessors_graph ON mes.entity_relations USING btree ("sourceId", "targetId") WHERE ((("sourceType")::text = 'node'::text) AND (("relationType")::text = 'predecessor'::text));


--
-- Name: idx_node_predecessors_node; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_node_predecessors_node ON mes.node_predecessors USING btree ("nodeId");


--
-- Name: idx_node_predecessors_pred; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_node_predecessors_pred ON mes.node_predecessors USING btree ("predecessorNodeId");


--
-- Name: idx_node_stations; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_node_stations ON mes.entity_relations USING btree ("sourceId", "targetId", priority) WHERE ((("sourceType")::text = 'node'::text) AND (("relationType")::text = 'station'::text));


--
-- Name: idx_node_stations_node_id; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_node_stations_node_id ON mes.node_stations USING btree ("nodeId");


--
-- Name: idx_node_stations_priority; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_node_stations_priority ON mes.node_stations USING btree ("nodeId", priority);


--
-- Name: idx_node_stations_station_id; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_node_stations_station_id ON mes.node_stations USING btree ("stationId");


--
-- Name: idx_node_substations; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_node_substations ON mes.entity_relations USING btree ("sourceId", "targetId") WHERE ((("sourceType")::text = 'node'::text) AND (("relationType")::text = 'substation'::text));


--
-- Name: idx_node_substations_fast; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_node_substations_fast ON mes.entity_relations USING btree ("sourceId", "targetId") WHERE ((("sourceType")::text = 'node'::text) AND (("relationType")::text = 'substation'::text));


--
-- Name: idx_nodes_plan_status; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_nodes_plan_status ON mes.production_plan_nodes USING btree ("planId", status);


--
-- Name: idx_nodes_status; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_nodes_status ON mes.production_plan_nodes USING btree (status);


--
-- Name: idx_nodes_work_order_code; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_nodes_work_order_code ON mes.production_plan_nodes USING btree ("workOrderCode");


--
-- Name: idx_reservation_status; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_reservation_status ON mes.assignment_material_reservations USING btree ("reservationStatus");


--
-- Name: idx_reverse_lookup; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_reverse_lookup ON mes.entity_relations USING btree ("relationType", "targetId", "sourceType", "sourceId") WHERE (("relationType")::text = ANY ((ARRAY['station'::character varying, 'operation'::character varying])::text[]));


--
-- Name: idx_skills_is_active; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_skills_is_active ON mes.skills USING btree ("isActive");


--
-- Name: idx_skills_name; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_skills_name ON mes.skills USING btree (name);


--
-- Name: idx_source; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_source ON mes.entity_relations USING btree ("sourceType", "sourceId");


--
-- Name: idx_station_operations; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_station_operations ON mes.entity_relations USING btree ("sourceId", "targetId") WHERE ((("sourceType")::text = 'station'::text) AND (("relationType")::text = 'operation'::text));


--
-- Name: idx_station_operations_fast; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_station_operations_fast ON mes.entity_relations USING btree ("sourceId", "targetId") WHERE ((("sourceType")::text = 'station'::text) AND (("relationType")::text = 'operation'::text));


--
-- Name: idx_status_history_assignment; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_status_history_assignment ON mes.assignment_status_history USING btree ("assignmentId");


--
-- Name: idx_status_history_assignment_status; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_status_history_assignment_status ON mes.assignment_status_history USING btree ("assignmentId", "toStatus");


--
-- Name: idx_status_history_changed_at; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_status_history_changed_at ON mes.assignment_status_history USING btree ("changedAt");


--
-- Name: idx_substations_station_status; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_substations_station_status ON mes.substations USING btree ("stationId", status);


--
-- Name: idx_substations_status; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_substations_status ON mes.substations USING btree (status);


--
-- Name: idx_substations_worker; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_substations_worker ON mes.substations USING btree ("assignedWorkerId");


--
-- Name: idx_target; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_target ON mes.entity_relations USING btree ("relationType", "targetId");


--
-- Name: idx_work_orders_production_launched; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_work_orders_production_launched ON mes.work_orders USING btree ("productionLaunched");


--
-- Name: idx_worker_operations; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_worker_operations ON mes.entity_relations USING btree ("sourceId", "targetId") WHERE ((("sourceType")::text = 'worker'::text) AND (("relationType")::text = 'operation'::text));


--
-- Name: idx_worker_operations_fast; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_worker_operations_fast ON mes.entity_relations USING btree ("sourceId", "targetId") WHERE ((("sourceType")::text = 'worker'::text) AND (("relationType")::text = 'operation'::text));


--
-- Name: idx_worker_stations; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_worker_stations ON mes.entity_relations USING btree ("sourceId", "targetId") WHERE ((("sourceType")::text = 'worker'::text) AND (("relationType")::text = 'station'::text));


--
-- Name: idx_worker_stations_fast; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX idx_worker_stations_fast ON mes.entity_relations USING btree ("sourceId", "targetId") WHERE ((("sourceType")::text = 'worker'::text) AND (("relationType")::text = 'station'::text));


--
-- Name: mes_alerts_is_read_created_at_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX mes_alerts_is_read_created_at_index ON mes.alerts USING btree ("isRead", "createdAt");


--
-- Name: mes_alerts_is_resolved_created_at_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX mes_alerts_is_resolved_created_at_index ON mes.alerts USING btree ("isResolved", "createdAt");


--
-- Name: mes_alerts_severity_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX mes_alerts_severity_index ON mes.alerts USING btree (severity);


--
-- Name: mes_alerts_type_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX mes_alerts_type_index ON mes.alerts USING btree (type);


--
-- Name: mes_counters_prefix_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX mes_counters_prefix_index ON mes.counters USING btree (prefix);


--
-- Name: mes_operations_name_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX mes_operations_name_index ON mes.operations USING btree (name);


--
-- Name: mes_operations_semi_output_code_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX mes_operations_semi_output_code_index ON mes.operations USING btree ("semiOutputCode");


--
-- Name: mes_operations_type_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX mes_operations_type_index ON mes.operations USING btree (type);


--
-- Name: mes_production_plans_quote_id_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX mes_production_plans_quote_id_index ON mes.production_plans USING btree ("quoteId");


--
-- Name: mes_production_plans_status_created_at_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX mes_production_plans_status_created_at_index ON mes.production_plans USING btree (status, "createdAt");


--
-- Name: mes_production_plans_status_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX mes_production_plans_status_index ON mes.production_plans USING btree (status);


--
-- Name: mes_production_plans_work_order_code_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX mes_production_plans_work_order_code_index ON mes.production_plans USING btree ("workOrderCode");


--
-- Name: mes_production_plans_work_order_code_unique; Type: INDEX; Schema: mes; Owner: -
--

CREATE UNIQUE INDEX mes_production_plans_work_order_code_unique ON mes.production_plans USING btree ("workOrderCode") WHERE ("workOrderCode" IS NOT NULL);


--
-- Name: mes_settings_key_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX mes_settings_key_index ON mes.settings USING btree (key);


--
-- Name: mes_stations_is_active_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX mes_stations_is_active_index ON mes.stations USING btree ("isActive");


--
-- Name: mes_stations_name_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX mes_stations_name_index ON mes.stations USING btree (name);


--
-- Name: mes_stations_type_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX mes_stations_type_index ON mes.stations USING btree (type);


--
-- Name: mes_substations_is_active_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX mes_substations_is_active_index ON mes.substations USING btree ("isActive");


--
-- Name: mes_substations_name_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX mes_substations_name_index ON mes.substations USING btree (name);


--
-- Name: mes_substations_station_id_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX mes_substations_station_id_index ON mes.substations USING btree ("stationId");


--
-- Name: mes_work_orders_code_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX mes_work_orders_code_index ON mes.work_orders USING btree (code);


--
-- Name: mes_work_orders_production_state_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX mes_work_orders_production_state_index ON mes.work_orders USING btree ("productionState");


--
-- Name: mes_work_orders_quote_id_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX mes_work_orders_quote_id_index ON mes.work_orders USING btree ("quoteId");


--
-- Name: mes_work_orders_status_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX mes_work_orders_status_index ON mes.work_orders USING btree (status);


--
-- Name: mes_workers_is_active_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX mes_workers_is_active_index ON mes.workers USING btree ("isActive");


--
-- Name: mes_workers_name_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX mes_workers_name_index ON mes.workers USING btree (name);


--
-- Name: node_material_inputs_material_code_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX node_material_inputs_material_code_index ON mes.node_material_inputs USING btree ("materialCode");


--
-- Name: node_material_inputs_node_id_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX node_material_inputs_node_id_index ON mes.node_material_inputs USING btree ("nodeId");


--
-- Name: plan_material_requirements_material_code_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX plan_material_requirements_material_code_index ON mes.plan_material_requirements USING btree ("materialCode");


--
-- Name: plan_material_requirements_plan_id_material_code_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX plan_material_requirements_plan_id_material_code_index ON mes.plan_material_requirements USING btree ("planId", "materialCode");


--
-- Name: plan_wip_outputs_plan_id_wip_code_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX plan_wip_outputs_plan_id_wip_code_index ON mes.plan_wip_outputs USING btree ("planId", "wipCode");


--
-- Name: plan_wip_outputs_wip_code_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX plan_wip_outputs_wip_code_index ON mes.plan_wip_outputs USING btree ("wipCode");


--
-- Name: production_plan_nodes_assigned_worker_id_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX production_plan_nodes_assigned_worker_id_index ON mes.production_plan_nodes USING btree ("assignedWorkerId");


--
-- Name: production_plan_nodes_operation_id_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX production_plan_nodes_operation_id_index ON mes.production_plan_nodes USING btree ("operationId");


--
-- Name: production_plan_nodes_plan_id_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX production_plan_nodes_plan_id_index ON mes.production_plan_nodes USING btree ("planId");


--
-- Name: production_plan_nodes_plan_id_sequence_order_index; Type: INDEX; Schema: mes; Owner: -
--

CREATE INDEX production_plan_nodes_plan_id_sequence_order_index ON mes.production_plan_nodes USING btree ("planId", "sequenceOrder");


--
-- Name: migration_tracker_entity_type_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX migration_tracker_entity_type_index ON public.migration_tracker USING btree ("entityType");


--
-- Name: migration_tracker_phase_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX migration_tracker_phase_index ON public.migration_tracker USING btree (phase);


--
-- Name: migration_tracker_phase_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX migration_tracker_phase_status_index ON public.migration_tracker USING btree (phase, status);


--
-- Name: migration_tracker_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX migration_tracker_status_index ON public.migration_tracker USING btree (status);


--
-- Name: sessions_email_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_email_index ON public.sessions USING btree (email);


--
-- Name: sessions_is_active_expires_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_is_active_expires_index ON public.sessions USING btree ("isActive", expires);


--
-- Name: sessions_login_date_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_login_date_index ON public.sessions USING btree ("loginDate");


--
-- Name: sessions_token_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_token_index ON public.sessions USING btree (token);


--
-- Name: sessions_worker_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_worker_id_index ON public.sessions USING btree ("workerId");


--
-- Name: users_email_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_email_index ON public.users USING btree (email);


--
-- Name: users_role_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_role_index ON public.users USING btree (role);


--
-- Name: users_worker_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_worker_id_index ON public.users USING btree ("workerId");


--
-- Name: form_field_options_field_id_index; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX form_field_options_field_id_index ON quotes.form_field_options USING btree ("fieldId");


--
-- Name: form_field_options_field_id_is_active_index; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX form_field_options_field_id_is_active_index ON quotes.form_field_options USING btree ("fieldId", "isActive");


--
-- Name: form_fields_field_type_index; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX form_fields_field_type_index ON quotes.form_fields USING btree ("fieldType");


--
-- Name: form_fields_template_id_index; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX form_fields_template_id_index ON quotes.form_fields USING btree ("templateId");


--
-- Name: form_templates_active_unique; Type: INDEX; Schema: quotes; Owner: -
--

CREATE UNIQUE INDEX form_templates_active_unique ON quotes.form_templates USING btree (code) WHERE ("isActive" = true);


--
-- Name: form_templates_is_active_index; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX form_templates_is_active_index ON quotes.form_templates USING btree ("isActive");


--
-- Name: idx_customers_account_code; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_customers_account_code ON quotes.customers USING btree ("accountCode");


--
-- Name: idx_customers_active; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_customers_active ON quotes.customers USING btree ("isActive");


--
-- Name: idx_customers_city; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_customers_city ON quotes.customers USING btree (city);


--
-- Name: idx_customers_company; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_customers_company ON quotes.customers USING btree (company);


--
-- Name: idx_customers_corporate; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_customers_corporate ON quotes.customers USING btree ("isCorporate");


--
-- Name: idx_customers_country; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_customers_country ON quotes.customers USING btree (country);


--
-- Name: idx_customers_email; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_customers_email ON quotes.customers USING btree (email);


--
-- Name: idx_customers_erp_code; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_customers_erp_code ON quotes.customers USING btree ("erpAccountCode") WHERE ("erpAccountCode" IS NOT NULL);


--
-- Name: idx_customers_phone; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_customers_phone ON quotes.customers USING btree (phone);


--
-- Name: idx_customers_tax_number; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_customers_tax_number ON quotes.customers USING btree ("taxNumber");


--
-- Name: idx_form_field_options_code; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_form_field_options_code ON quotes.form_field_options USING btree ("optionCode");


--
-- Name: idx_form_fields_show_in_filter; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_form_fields_show_in_filter ON quotes.form_fields USING btree ("templateId", "showInFilter") WHERE ("showInFilter" = true);


--
-- Name: idx_form_fields_show_in_table; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_form_fields_show_in_table ON quotes.form_fields USING btree ("templateId", "showInTable") WHERE ("showInTable" = true);


--
-- Name: idx_param_lookups_option_code; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_param_lookups_option_code ON quotes.price_parameter_lookups USING btree ("optionCode");


--
-- Name: idx_param_lookups_param_id; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_param_lookups_param_id ON quotes.price_parameter_lookups USING btree ("parameterId");


--
-- Name: idx_price_settings_linked_form; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_price_settings_linked_form ON quotes.price_settings USING btree ("linkedFormTemplateId");


--
-- Name: idx_quote_documents_created_at; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_quote_documents_created_at ON quotes.quote_documents USING btree ("createdAt" DESC);


--
-- Name: idx_quote_documents_ettn; Type: INDEX; Schema: quotes; Owner: -
--

CREATE UNIQUE INDEX idx_quote_documents_ettn ON quotes.quote_documents USING btree (ettn) WHERE ((("documentType")::text = 'import'::text) AND (ettn IS NOT NULL));


--
-- Name: idx_quote_documents_proforma_number; Type: INDEX; Schema: quotes; Owner: -
--

CREATE UNIQUE INDEX idx_quote_documents_proforma_number ON quotes.quote_documents USING btree ("documentNumber") WHERE ((("documentType")::text = 'proforma'::text) AND ("documentNumber" IS NOT NULL));


--
-- Name: idx_quote_documents_quote_id; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_quote_documents_quote_id ON quotes.quote_documents USING btree ("quoteId");


--
-- Name: idx_quote_documents_type; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_quote_documents_type ON quotes.quote_documents USING btree ("documentType");


--
-- Name: idx_quote_items_quote; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_quote_items_quote ON quotes.quote_items USING btree ("quoteId");


--
-- Name: idx_quotes_created_at; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_quotes_created_at ON quotes.quotes USING btree ("createdAt");


--
-- Name: idx_quotes_customer_id; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_quotes_customer_id ON quotes.quotes USING btree ("customerId");


--
-- Name: idx_quotes_delivery_date; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_quotes_delivery_date ON quotes.quotes USING btree ("deliveryDate");


--
-- Name: idx_quotes_force_completed; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_quotes_force_completed ON quotes.quotes USING btree ("forceCompleted") WHERE ("forceCompleted" = true);


--
-- Name: idx_quotes_form_template_code; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_quotes_form_template_code ON quotes.quotes USING btree ("formTemplateCode");


--
-- Name: idx_quotes_form_template_id; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_quotes_form_template_id ON quotes.quotes USING btree ("formTemplateId");


--
-- Name: idx_quotes_price_setting_code; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_quotes_price_setting_code ON quotes.quotes USING btree ("priceSettingCode");


--
-- Name: idx_quotes_price_setting_id; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_quotes_price_setting_id ON quotes.quotes USING btree ("priceSettingId");


--
-- Name: idx_quotes_proforma_number; Type: INDEX; Schema: quotes; Owner: -
--

CREATE UNIQUE INDEX idx_quotes_proforma_number ON quotes.quotes USING btree ("proformaNumber") WHERE ("proformaNumber" IS NOT NULL);


--
-- Name: idx_quotes_project_name; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_quotes_project_name ON quotes.quotes USING btree ("projectName");


--
-- Name: idx_quotes_status; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_quotes_status ON quotes.quotes USING btree (status);


--
-- Name: idx_quotes_status_created_at; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_quotes_status_created_at ON quotes.quotes USING btree (status, "createdAt");


--
-- Name: idx_quotes_work_order_code; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX idx_quotes_work_order_code ON quotes.quotes USING btree ("workOrderCode");


--
-- Name: price_parameters_is_active_index; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX price_parameters_is_active_index ON quotes.price_parameters USING btree ("isActive");


--
-- Name: price_parameters_setting_id_index; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX price_parameters_setting_id_index ON quotes.price_parameters USING btree ("settingId");


--
-- Name: price_parameters_type_index; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX price_parameters_type_index ON quotes.price_parameters USING btree (type);


--
-- Name: price_settings_is_active_index; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX price_settings_is_active_index ON quotes.price_settings USING btree ("isActive");


--
-- Name: quote_files_file_type_index; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX quote_files_file_type_index ON quotes.quote_files USING btree ("fileType");


--
-- Name: quote_files_quote_id_file_type_index; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX quote_files_quote_id_file_type_index ON quotes.quote_files USING btree ("quoteId", "fileType");


--
-- Name: quote_files_quote_id_index; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX quote_files_quote_id_index ON quotes.quote_files USING btree ("quoteId");


--
-- Name: quote_form_data_field_code_index; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX quote_form_data_field_code_index ON quotes.quote_form_data USING btree ("fieldCode");


--
-- Name: quote_form_data_quote_id_field_code_index; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX quote_form_data_quote_id_field_code_index ON quotes.quote_form_data USING btree ("quoteId", "fieldCode");


--
-- Name: quote_form_data_quote_id_index; Type: INDEX; Schema: quotes; Owner: -
--

CREATE INDEX quote_form_data_quote_id_index ON quotes.quote_form_data USING btree ("quoteId");


--
-- Name: audit_logs_action_index; Type: INDEX; Schema: settings; Owner: -
--

CREATE INDEX audit_logs_action_index ON settings.audit_logs USING btree (action);


--
-- Name: audit_logs_created_at_index; Type: INDEX; Schema: settings; Owner: -
--

CREATE INDEX audit_logs_created_at_index ON settings.audit_logs USING btree ("createdAt");


--
-- Name: audit_logs_entity_id_index; Type: INDEX; Schema: settings; Owner: -
--

CREATE INDEX audit_logs_entity_id_index ON settings.audit_logs USING btree ("entityId");


--
-- Name: audit_logs_entity_type_entity_id_index; Type: INDEX; Schema: settings; Owner: -
--

CREATE INDEX audit_logs_entity_type_entity_id_index ON settings.audit_logs USING btree ("entityType", "entityId");


--
-- Name: audit_logs_entity_type_index; Type: INDEX; Schema: settings; Owner: -
--

CREATE INDEX audit_logs_entity_type_index ON settings.audit_logs USING btree ("entityType");


--
-- Name: system_config_key_index; Type: INDEX; Schema: settings; Owner: -
--

CREATE INDEX system_config_key_index ON settings.system_config USING btree (key);


--
-- Name: service_cards service_cards_updated_at; Type: TRIGGER; Schema: materials; Owner: -
--

CREATE TRIGGER service_cards_updated_at BEFORE UPDATE ON materials.service_cards FOR EACH ROW EXECUTE FUNCTION materials.update_service_cards_timestamp();


--
-- Name: shipment_items shipment_items_calculate_totals; Type: TRIGGER; Schema: materials; Owner: -
--

CREATE TRIGGER shipment_items_calculate_totals BEFORE INSERT OR UPDATE ON materials.shipment_items FOR EACH ROW EXECUTE FUNCTION materials.calculate_shipment_item_totals();


--
-- Name: shipment_templates shipment_templates_updated_at; Type: TRIGGER; Schema: materials; Owner: -
--

CREATE TRIGGER shipment_templates_updated_at BEFORE UPDATE ON materials.shipment_templates FOR EACH ROW EXECUTE FUNCTION materials.update_shipment_templates_timestamp();


--
-- Name: stock_movements trg_update_lot_summary; Type: TRIGGER; Schema: materials; Owner: -
--

CREATE TRIGGER trg_update_lot_summary AFTER INSERT OR DELETE OR UPDATE ON materials.stock_movements FOR EACH ROW EXECUTE FUNCTION materials.update_material_lot_summary();


--
-- Name: production_plan_nodes node_change_trigger; Type: TRIGGER; Schema: mes; Owner: -
--

CREATE TRIGGER node_change_trigger AFTER INSERT OR DELETE OR UPDATE ON mes.production_plan_nodes FOR EACH ROW EXECUTE FUNCTION mes.notify_node_change();


--
-- Name: production_plans plan_change_trigger; Type: TRIGGER; Schema: mes; Owner: -
--

CREATE TRIGGER plan_change_trigger AFTER INSERT OR DELETE OR UPDATE ON mes.production_plans FOR EACH ROW EXECUTE FUNCTION mes.notify_plan_change();


--
-- Name: substations substation_change_trigger; Type: TRIGGER; Schema: mes; Owner: -
--

CREATE TRIGGER substation_change_trigger AFTER INSERT OR DELETE OR UPDATE ON mes.substations FOR EACH ROW EXECUTE FUNCTION public.notify_substation_change();


--
-- Name: workers worker_change_trigger; Type: TRIGGER; Schema: mes; Owner: -
--

CREATE TRIGGER worker_change_trigger AFTER INSERT OR DELETE OR UPDATE ON mes.workers FOR EACH ROW EXECUTE FUNCTION mes.notify_worker_change();


--
-- Name: quote_items trg_quote_item_calculate; Type: TRIGGER; Schema: quotes; Owner: -
--

CREATE TRIGGER trg_quote_item_calculate BEFORE INSERT OR UPDATE ON quotes.quote_items FOR EACH ROW EXECUTE FUNCTION quotes.calculate_quote_item_totals();


--
-- Name: counties counties_city_id_fkey; Type: FK CONSTRAINT; Schema: address_data; Owner: -
--

ALTER TABLE ONLY address_data.counties
    ADD CONSTRAINT counties_city_id_fkey FOREIGN KEY (city_id) REFERENCES address_data.cities(id);


--
-- Name: districts districts_county_id_fkey; Type: FK CONSTRAINT; Schema: address_data; Owner: -
--

ALTER TABLE ONLY address_data.districts
    ADD CONSTRAINT districts_county_id_fkey FOREIGN KEY (county_id) REFERENCES address_data.counties(id);


--
-- Name: neighbourhoods neighbourhoods_district_id_fkey; Type: FK CONSTRAINT; Schema: address_data; Owner: -
--

ALTER TABLE ONLY address_data.neighbourhoods
    ADD CONSTRAINT neighbourhoods_district_id_fkey FOREIGN KEY (district_id) REFERENCES address_data.districts(id);


--
-- Name: shipments fk_shipments_quote; Type: FK CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.shipments
    ADD CONSTRAINT fk_shipments_quote FOREIGN KEY ("relatedQuoteId") REFERENCES quotes.quotes(id) ON DELETE SET NULL;


--
-- Name: material_supplier_relation material_supplier_relation_material_id_foreign; Type: FK CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.material_supplier_relation
    ADD CONSTRAINT material_supplier_relation_material_id_foreign FOREIGN KEY ("materialId") REFERENCES materials.materials(id) ON DELETE CASCADE;


--
-- Name: material_supplier_relation material_supplier_relation_supplier_id_foreign; Type: FK CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.material_supplier_relation
    ADD CONSTRAINT material_supplier_relation_supplier_id_foreign FOREIGN KEY ("supplierId") REFERENCES materials.suppliers(id) ON DELETE CASCADE;


--
-- Name: materials_categories materials_categories_parent_category_foreign; Type: FK CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.materials_categories
    ADD CONSTRAINT materials_categories_parent_category_foreign FOREIGN KEY ("parentCategory") REFERENCES materials.materials_categories(id) ON DELETE SET NULL;


--
-- Name: materials materials_category_foreign; Type: FK CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.materials
    ADD CONSTRAINT materials_category_foreign FOREIGN KEY (category) REFERENCES materials.materials_categories(id) ON DELETE RESTRICT;


--
-- Name: materials materials_primary_supplier_id_foreign; Type: FK CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.materials
    ADD CONSTRAINT materials_primary_supplier_id_foreign FOREIGN KEY ("primarySupplierId") REFERENCES materials.suppliers(id) ON DELETE SET NULL;


--
-- Name: order_items order_items_material_id_foreign; Type: FK CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.order_items
    ADD CONSTRAINT order_items_material_id_foreign FOREIGN KEY ("materialId") REFERENCES materials.materials(id) ON DELETE RESTRICT;


--
-- Name: order_items order_items_order_id_foreign; Type: FK CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.order_items
    ADD CONSTRAINT order_items_order_id_foreign FOREIGN KEY ("orderId") REFERENCES materials.orders(id) ON DELETE CASCADE;


--
-- Name: orders orders_supplier_id_foreign; Type: FK CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.orders
    ADD CONSTRAINT orders_supplier_id_foreign FOREIGN KEY ("supplierId") REFERENCES materials.suppliers(id) ON DELETE RESTRICT;


--
-- Name: shipment_items shipment_items_serviceCardId_fkey; Type: FK CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.shipment_items
    ADD CONSTRAINT "shipment_items_serviceCardId_fkey" FOREIGN KEY ("serviceCardId") REFERENCES materials.service_cards(id) ON DELETE SET NULL;


--
-- Name: shipment_items shipment_items_shipmentId_fkey; Type: FK CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.shipment_items
    ADD CONSTRAINT "shipment_items_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES materials.shipments(id) ON DELETE CASCADE;


--
-- Name: shipment_items shipment_items_vatExemptionId_fkey; Type: FK CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.shipment_items
    ADD CONSTRAINT "shipment_items_vatExemptionId_fkey" FOREIGN KEY ("vatExemptionId") REFERENCES materials.vat_exemption_codes(id);


--
-- Name: shipment_items shipment_items_withholdingRateId_fkey; Type: FK CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.shipment_items
    ADD CONSTRAINT "shipment_items_withholdingRateId_fkey" FOREIGN KEY ("withholdingRateId") REFERENCES materials.withholding_rates(id);


--
-- Name: shipments shipments_customerId_fkey; Type: FK CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.shipments
    ADD CONSTRAINT "shipments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES quotes.customers(id) ON DELETE SET NULL;


--
-- Name: stock_movements stock_movements_material_id_foreign; Type: FK CONSTRAINT; Schema: materials; Owner: -
--

ALTER TABLE ONLY materials.stock_movements
    ADD CONSTRAINT stock_movements_material_id_foreign FOREIGN KEY ("materialId") REFERENCES materials.materials(id) ON DELETE RESTRICT;


--
-- Name: assignment_material_reservations fk_material; Type: FK CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.assignment_material_reservations
    ADD CONSTRAINT fk_material FOREIGN KEY ("materialCode") REFERENCES materials.materials(code) ON DELETE RESTRICT;


--
-- Name: substations mes_substations_station_id_foreign; Type: FK CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.substations
    ADD CONSTRAINT mes_substations_station_id_foreign FOREIGN KEY ("stationId") REFERENCES mes.stations(id) ON DELETE CASCADE;


--
-- Name: node_material_inputs node_material_inputs_node_id_foreign; Type: FK CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.node_material_inputs
    ADD CONSTRAINT node_material_inputs_node_id_foreign FOREIGN KEY ("nodeId") REFERENCES mes.production_plan_nodes("nodeId") ON DELETE CASCADE;


--
-- Name: node_predecessors node_predecessors_node_id_foreign; Type: FK CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.node_predecessors
    ADD CONSTRAINT node_predecessors_node_id_foreign FOREIGN KEY ("nodeId") REFERENCES mes.production_plan_nodes("nodeId") ON DELETE CASCADE;


--
-- Name: node_predecessors node_predecessors_predecessor_node_id_foreign; Type: FK CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.node_predecessors
    ADD CONSTRAINT node_predecessors_predecessor_node_id_foreign FOREIGN KEY ("predecessorNodeId") REFERENCES mes.production_plan_nodes("nodeId") ON DELETE CASCADE;


--
-- Name: node_stations node_stations_node_id_foreign; Type: FK CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.node_stations
    ADD CONSTRAINT node_stations_node_id_foreign FOREIGN KEY ("nodeId") REFERENCES mes.production_plan_nodes("nodeId") ON DELETE CASCADE;


--
-- Name: node_stations node_stations_station_id_foreign; Type: FK CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.node_stations
    ADD CONSTRAINT node_stations_station_id_foreign FOREIGN KEY ("stationId") REFERENCES mes.stations(id) ON DELETE RESTRICT;


--
-- Name: operations operations_supervisor_id_foreign; Type: FK CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.operations
    ADD CONSTRAINT operations_supervisor_id_foreign FOREIGN KEY ("supervisorId") REFERENCES mes.workers(id) ON DELETE SET NULL;


--
-- Name: plan_material_requirements plan_material_requirements_plan_id_foreign; Type: FK CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.plan_material_requirements
    ADD CONSTRAINT plan_material_requirements_plan_id_foreign FOREIGN KEY ("planId") REFERENCES mes.production_plans(id) ON DELETE CASCADE;


--
-- Name: plan_wip_outputs plan_wip_outputs_plan_id_foreign; Type: FK CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.plan_wip_outputs
    ADD CONSTRAINT plan_wip_outputs_plan_id_foreign FOREIGN KEY ("planId") REFERENCES mes.production_plans(id) ON DELETE CASCADE;


--
-- Name: plan_wip_outputs plan_wip_outputs_source_node_id_foreign; Type: FK CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.plan_wip_outputs
    ADD CONSTRAINT plan_wip_outputs_source_node_id_foreign FOREIGN KEY ("sourceNodeId") REFERENCES mes.production_plan_nodes(id) ON DELETE SET NULL;


--
-- Name: production_plan_nodes production_plan_nodes_assigned_worker_id_foreign; Type: FK CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.production_plan_nodes
    ADD CONSTRAINT production_plan_nodes_assigned_worker_id_foreign FOREIGN KEY ("assignedWorkerId") REFERENCES mes.workers(id) ON DELETE SET NULL;


--
-- Name: production_plan_nodes production_plan_nodes_operation_id_foreign; Type: FK CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.production_plan_nodes
    ADD CONSTRAINT production_plan_nodes_operation_id_foreign FOREIGN KEY ("operationId") REFERENCES mes.operations(id) ON DELETE SET NULL;


--
-- Name: production_plan_nodes production_plan_nodes_plan_id_foreign; Type: FK CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.production_plan_nodes
    ADD CONSTRAINT production_plan_nodes_plan_id_foreign FOREIGN KEY ("planId") REFERENCES mes.production_plans(id) ON DELETE CASCADE;


--
-- Name: substations substations_assigned_worker_id_foreign; Type: FK CONSTRAINT; Schema: mes; Owner: -
--

ALTER TABLE ONLY mes.substations
    ADD CONSTRAINT substations_assigned_worker_id_foreign FOREIGN KEY ("assignedWorkerId") REFERENCES mes.workers(id) ON DELETE SET NULL;


--
-- Name: form_field_options form_field_options_field_id_foreign; Type: FK CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.form_field_options
    ADD CONSTRAINT form_field_options_field_id_foreign FOREIGN KEY ("fieldId") REFERENCES quotes.form_fields(id) ON DELETE CASCADE;


--
-- Name: form_fields form_fields_template_id_foreign; Type: FK CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.form_fields
    ADD CONSTRAINT form_fields_template_id_foreign FOREIGN KEY ("templateId") REFERENCES quotes.form_templates(id) ON DELETE CASCADE;


--
-- Name: price_parameter_lookups price_parameter_lookups_parameterId_fkey; Type: FK CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.price_parameter_lookups
    ADD CONSTRAINT "price_parameter_lookups_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES quotes.price_parameters(id) ON DELETE CASCADE;


--
-- Name: price_parameters price_parameters_setting_id_foreign; Type: FK CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.price_parameters
    ADD CONSTRAINT price_parameters_setting_id_foreign FOREIGN KEY ("settingId") REFERENCES quotes.price_settings(id) ON DELETE CASCADE;


--
-- Name: price_settings price_settings_linkedFormTemplateId_fkey; Type: FK CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.price_settings
    ADD CONSTRAINT "price_settings_linkedFormTemplateId_fkey" FOREIGN KEY ("linkedFormTemplateId") REFERENCES quotes.form_templates(id);


--
-- Name: quote_documents quote_documents_quoteId_fkey; Type: FK CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.quote_documents
    ADD CONSTRAINT "quote_documents_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES quotes.quotes(id) ON DELETE CASCADE;


--
-- Name: quote_form_data quote_form_data_field_id_fk; Type: FK CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.quote_form_data
    ADD CONSTRAINT quote_form_data_field_id_fk FOREIGN KEY ("fieldId") REFERENCES quotes.form_fields(id) ON DELETE SET NULL;


--
-- Name: quotes quotes_new_customerId_fkey; Type: FK CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.quotes
    ADD CONSTRAINT "quotes_new_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES quotes.customers(id);


--
-- Name: quotes quotes_new_formTemplateId_fkey; Type: FK CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.quotes
    ADD CONSTRAINT "quotes_new_formTemplateId_fkey" FOREIGN KEY ("formTemplateId") REFERENCES quotes.form_templates(id);


--
-- Name: quotes quotes_new_priceSettingId_fkey; Type: FK CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.quotes
    ADD CONSTRAINT "quotes_new_priceSettingId_fkey" FOREIGN KEY ("priceSettingId") REFERENCES quotes.price_settings(id);


--
-- Name: quote_items quotes_quote_items_quoteid_foreign; Type: FK CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.quote_items
    ADD CONSTRAINT quotes_quote_items_quoteid_foreign FOREIGN KEY ("quoteId") REFERENCES quotes.quotes(id) ON DELETE CASCADE;


--
-- Name: quote_items quotes_quote_items_vatexemptionid_foreign; Type: FK CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.quote_items
    ADD CONSTRAINT quotes_quote_items_vatexemptionid_foreign FOREIGN KEY ("vatExemptionId") REFERENCES materials.vat_exemption_codes(id);


--
-- Name: quote_items quotes_quote_items_withholdingrateid_foreign; Type: FK CONSTRAINT; Schema: quotes; Owner: -
--

ALTER TABLE ONLY quotes.quote_items
    ADD CONSTRAINT quotes_quote_items_withholdingrateid_foreign FOREIGN KEY ("withholdingRateId") REFERENCES materials.withholding_rates(id);


--
-- PostgreSQL database dump complete
--

\unrestrict YN38SNTcfSxyk5ikZ6xyJjHTQp0GgGSHXTfZKJQSa1HktWnZPNR7cc1QcLlb51b

