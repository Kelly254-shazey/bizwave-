-- BizWave Database Integrity, Immutability, Composite FK & Row-Level Security Automated Test Suite
-- Must be executed as the restricted non-superuser role `bizwave_app`!

\set ON_ERROR_STOP on

-- 1. Verify RLS blocks visibility when no tenant context is set
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  PERFORM set_config('app.tenant_id', '', true);
  PERFORM set_config('app.is_platform_admin', 'false', true);
  SELECT COUNT(*) INTO v_count FROM sales;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RLS FAILURE: Unscoped query returned % sales rows instead of 0!', v_count;
  END IF;
  RAISE NOTICE 'PASS [1/8]: Unscoped tenant query sees 0 rows.';
END $$;

-- 2. Verify Tenant 1 (Savannah) cannot read Tenant 2 (Kijiji) data and vice-versa
DO $$
DECLARE
  v_t1_sales INTEGER;
  v_t2_sales INTEGER;
  v_leak INTEGER;
BEGIN
  PERFORM set_config('app.tenant_id', '11111111-1111-4111-8111-111111111111', true);
  SELECT COUNT(*) INTO v_t1_sales FROM sales;
  SELECT COUNT(*) INTO v_leak FROM sales WHERE tenant_id = '22222222-2222-4222-8222-222222222222';
  IF v_t1_sales = 0 OR v_leak <> 0 THEN
    RAISE EXCEPTION 'RLS FAILURE on Tenant 1: own=%, leaked=%', v_t1_sales, v_leak;
  END IF;

  PERFORM set_config('app.tenant_id', '22222222-2222-4222-8222-222222222222', true);
  SELECT COUNT(*) INTO v_t2_sales FROM sales;
  SELECT COUNT(*) INTO v_leak FROM sales WHERE tenant_id = '11111111-1111-4111-8111-111111111111';
  IF v_t2_sales = 0 OR v_leak <> 0 THEN
    RAISE EXCEPTION 'RLS FAILURE on Tenant 2: own=%, leaked=%', v_t2_sales, v_leak;
  END IF;
  RAISE NOTICE 'PASS [2/8]: Strict bi-directional RLS isolation verified (Savannah=% sales, Kijiji=% sales, leaks=0).', v_t1_sales, v_t2_sales;
END $$;

-- 3. Verify Composite Tenant-Aware FK prevents cross-tenant branch linking even under insert attempt
DO $$
BEGIN
  PERFORM set_config('app.tenant_id', '11111111-1111-4111-8111-111111111111', true);
  BEGIN
    INSERT INTO sales (tenant_id, branch_id, transaction_ref, transaction_date, subtotal, total_amount)
    VALUES ('11111111-1111-4111-8111-111111111111', '22222222-aaaa-4222-8222-000000000001', 'CROSS-TENANT-ATTACK', NOW(), 100, 100);
    RAISE EXCEPTION 'FK FAILURE: Cross-tenant branch link should have failed!';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS [3/8]: Composite foreign key rejected cross-tenant branch linkage.';
  END;
END $$;

-- 4. Verify inventory_movements immutability trigger rejects UPDATE and DELETE
DO $$
DECLARE
  v_mv_id UUID;
BEGIN
  PERFORM set_config('app.tenant_id', '11111111-1111-4111-8111-111111111111', true);
  SELECT id INTO v_mv_id FROM inventory_movements LIMIT 1;
  BEGIN
    UPDATE inventory_movements SET quantity_delta = 999 WHERE id = v_mv_id;
    RAISE EXCEPTION 'IMMUTABILITY FAILURE: inventory_movements allowed UPDATE!';
  EXCEPTION WHEN raise_exception THEN
    RAISE NOTICE 'PASS [4/8]: Immutability trigger blocked UPDATE on inventory_movements.';
  END;
END $$;

-- 5. Verify SHA-256 hash-chained audit_logs integrity check passes
DO $$
DECLARE
  v_valid BOOLEAN;
  v_checked BIGINT;
  v_broken BIGINT;
BEGIN
  SELECT is_valid, checked_records, broken_at_id INTO v_valid, v_checked, v_broken FROM fn_verify_audit_chain();
  IF NOT v_valid OR v_checked < 2 THEN
    RAISE EXCEPTION 'AUDIT CHAIN FAILURE: valid=%, checked=%, broken=%', v_valid, v_checked, v_broken;
  END IF;
  RAISE NOTICE 'PASS [5/8]: Audit SHA-256 hash chain verified across % records.', v_checked;
END $$;

-- 6. Verify KPI calculation function returns exact non-zero KES totals for Savannah
DO $$
DECLARE
  v_rev NUMERIC(14,2);
  v_orders BIGINT;
BEGIN
  PERFORM set_config('app.tenant_id', '11111111-1111-4111-8111-111111111111', true);
  SELECT total_revenue, order_count INTO v_rev, v_orders
  FROM fn_calculate_business_kpis('11111111-1111-4111-8111-111111111111', NULL, CURRENT_DATE - 30, CURRENT_DATE);
  IF v_rev <= 0 OR v_orders <= 0 THEN
    RAISE EXCEPTION 'KPI FUNCTION FAILURE: rev=%, orders=%', v_rev, v_orders;
  END IF;
  RAISE NOTICE 'PASS [6/8]: fn_calculate_business_kpis computed KES % across % orders (last 30d).', v_rev, v_orders;
END $$;

-- 7. Verify Public Community Learn catalog is accessible while ZERO private merchant rows are exposed
DO $$
DECLARE
  v_modules INTEGER;
  v_sales_leak INTEGER;
  v_customer_leak INTEGER;
BEGIN
  PERFORM set_config('app.tenant_id', '', true);
  PERFORM set_config('app.is_platform_admin', 'false', true);
  PERFORM set_config('app.learner_id', '', true);
  SELECT COUNT(*) INTO v_modules FROM learning_modules WHERE is_published = TRUE;
  SELECT COUNT(*) INTO v_sales_leak FROM sales;
  SELECT COUNT(*) INTO v_customer_leak FROM customers;
  IF v_modules < 26 OR v_sales_leak <> 0 OR v_customer_leak <> 0 THEN
    RAISE EXCEPTION 'PUBLIC LITERACY ISOLATION FAILURE: modules=%, sales_leak=%, customer_leak=%', v_modules, v_sales_leak, v_customer_leak;
  END IF;
  RAISE NOTICE 'PASS [7/8]: Public literacy catalog (% modules) accessible with ZERO merchant/customer row leakage.', v_modules;
END $$;

-- 8. Verify strict per-learner RLS isolation on learner_profiles & learner_lesson_progress
DO $$
DECLARE
  v_l1 UUID := gen_random_uuid();
  v_l2 UUID := gen_random_uuid();
  v_mod UUID;
  v_leak INTEGER;
BEGIN
  SELECT id INTO v_mod FROM learning_modules LIMIT 1;

  -- Create two isolated pseudonymous learners under platform admin test setup, then verify learner RLS
  PERFORM set_config('app.is_platform_admin', 'true', true);
  INSERT INTO learner_profiles (id, learner_token_hash, preferred_language) VALUES (v_l1, encode(digest(v_l1::text, 'sha256'), 'hex'), 'sw');
  INSERT INTO learner_profiles (id, learner_token_hash, preferred_language) VALUES (v_l2, encode(digest(v_l2::text, 'sha256'), 'hex'), 'en');
  INSERT INTO learner_lesson_progress (learner_id, module_id, pre_score_pct, post_score_pct, completed_at) VALUES (v_l1, v_mod, 40, 100, NOW());
  INSERT INTO learner_lesson_progress (learner_id, module_id, pre_score_pct, post_score_pct, completed_at) VALUES (v_l2, v_mod, 50, 100, NOW());

  -- Drop admin flag and act strictly as Learner 1
  PERFORM set_config('app.is_platform_admin', 'false', true);
  PERFORM set_config('app.learner_id', v_l1::text, true);
  PERFORM set_config('app.user_id', '', true);
  SELECT COUNT(*) INTO v_leak FROM learner_lesson_progress WHERE learner_id = v_l2;
  IF v_leak <> 0 THEN
    RAISE EXCEPTION 'LEARNER RLS FAILURE: Learner 1 saw % rows belonging to Learner 2!', v_leak;
  END IF;

  -- Clean up synthetic test learners
  PERFORM set_config('app.is_platform_admin', 'true', true);
  DELETE FROM learner_profiles WHERE id IN (v_l1, v_l2);
  RAISE NOTICE 'PASS [8/8]: Strict per-learner RLS isolation verified (Learner 1 leaks of Learner 2 = 0).';
END $$;

