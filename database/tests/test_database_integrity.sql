-- Transaction-only integrity and isolation tests for the CURRENT BizWave schema.
-- Run as bizwave_app after migrations and grants. Fixtures are rolled back; no
-- demo data or disabled immutability triggers are required.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMPORARY TABLE bw_test_ids (
  tenant_a uuid, tenant_b uuid, branch_a uuid, branch_b uuid,
  product_a uuid, product_b uuid, source_a uuid, source_b uuid
) ON COMMIT DROP;
INSERT INTO bw_test_ids SELECT gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),
  gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid();

-- Test setup represents the API's explicit system transaction. Restrict the
-- application context again before testing every RLS boundary.
SELECT set_config('app.is_platform_admin','true',true);
INSERT INTO tenants (id,name,slug,display_name,business_email)
SELECT tenant_a,'QA A','qa-a-'||tenant_a::text,'QA A','qa-a@example.test' FROM bw_test_ids
UNION ALL
SELECT tenant_b,'QA B','qa-b-'||tenant_b::text,'QA B','qa-b@example.test' FROM bw_test_ids;
INSERT INTO branches (id,tenant_id,code,name)
SELECT branch_a,tenant_a,'A','Branch A' FROM bw_test_ids
UNION ALL SELECT branch_b,tenant_b,'B','Branch B' FROM bw_test_ids;
INSERT INTO products (id,tenant_id,sku,name,selling_price)
SELECT product_a,tenant_a,'QA-A','Product A',100 FROM bw_test_ids
UNION ALL SELECT product_b,tenant_b,'QA-B','Product B',200 FROM bw_test_ids;
INSERT INTO sales (tenant_id,branch_id,transaction_ref,transaction_date,subtotal,total_amount)
SELECT tenant_a,branch_a,'QA-ISOLATION-A',NOW(),100,100 FROM bw_test_ids
UNION ALL SELECT tenant_b,branch_b,'QA-ISOLATION-B',NOW(),200,200 FROM bw_test_ids;
INSERT INTO inventory_movements (tenant_id,branch_id,product_id,movement_type,quantity_delta,balance_after)
SELECT tenant_a,branch_a,product_a,'opening',1,1 FROM bw_test_ids;
-- The opt-in directory has its own policy and does not use the system flag.
SELECT set_config('app.tenant_id',(SELECT tenant_a::text FROM bw_test_ids),true);
INSERT INTO business_directory_profiles (tenant_id,display_name,sector,county,contact_email,is_published)
SELECT tenant_a,'QA A','Retail','Nairobi','published@example.test',TRUE FROM bw_test_ids;
SELECT set_config('app.tenant_id',(SELECT tenant_b::text FROM bw_test_ids),true);
INSERT INTO business_directory_profiles (tenant_id,display_name,sector,county,contact_email,is_published)
SELECT tenant_b,'QA B','Retail','Nairobi','private@example.test',FALSE FROM bw_test_ids;
INSERT INTO data_sources (id,tenant_id,branch_id,name,source_type)
SELECT source_a,tenant_a,branch_a,'Source A','json_api' FROM bw_test_ids
UNION ALL SELECT source_b,tenant_b,branch_b,'Source B','json_api' FROM bw_test_ids;
INSERT INTO website_catalog_links (tenant_id,data_source_id,external_key,product_id)
SELECT tenant_a,source_a,'a',product_a FROM bw_test_ids
UNION ALL SELECT tenant_b,source_b,'b',product_b FROM bw_test_ids;
SELECT fn_append_audit_log(tenant_a,NULL,'qa@example.test','qa.integrity','test','1',NULL,NULL,'{}') FROM bw_test_ids;
SELECT set_config('app.is_platform_admin','false',true);
SELECT set_config('app.tenant_id','',true);

DO $$
DECLARE n int; is_super boolean; bypass boolean;
BEGIN
  SELECT rolsuper,rolbypassrls INTO is_super,bypass FROM pg_roles WHERE rolname=current_user;
  IF current_user <> 'bizwave_app' OR is_super OR bypass THEN
    RAISE EXCEPTION 'Must run as non-superuser bizwave_app with NOBYPASSRLS';
  END IF;
  SELECT count(*) INTO n FROM sales;
  IF n <> 0 THEN RAISE EXCEPTION 'Unscoped sales leaked % rows',n; END IF;
  SELECT count(*) INTO n FROM vw_daily_sales_summary;
  IF n <> 0 THEN RAISE EXCEPTION 'Unscoped sales view leaked % rows',n; END IF;
  IF has_table_privilege(current_user,'public.mv_tenant_daily_analytics','SELECT') THEN
    RAISE EXCEPTION 'Runtime role must not read the cross-tenant materialized cache';
  END IF;
  IF has_table_privilege(current_user,'public.schema_migrations','INSERT') THEN
    RAISE EXCEPTION 'Runtime role must not modify migration history';
  END IF;
  SELECT count(*) INTO n FROM website_catalog_links;
  IF n <> 0 THEN RAISE EXCEPTION 'Unscoped website links leaked % rows',n; END IF;
  RAISE NOTICE 'PASS: restricted application role, unscoped RLS and protected cache';
END $$;

DO $$
DECLARE a uuid; b uuid; n int;
BEGIN
  SELECT tenant_a,tenant_b INTO a,b FROM bw_test_ids;
  PERFORM set_config('app.tenant_id',a::text,true);
  SELECT count(*) INTO n FROM sales WHERE tenant_id=b;
  IF n <> 0 THEN RAISE EXCEPTION 'Tenant A saw tenant B sales'; END IF;
  SELECT count(*) INTO n FROM sales WHERE tenant_id=a AND transaction_ref='QA-ISOLATION-A' AND cost_basis='unknown';
  IF n <> 1 THEN RAISE EXCEPTION 'Own sale missing or unknown cost not preserved'; END IF;
  SELECT count(*) INTO n FROM website_catalog_links WHERE tenant_id=b;
  IF n <> 0 THEN RAISE EXCEPTION 'Tenant A saw tenant B catalog links'; END IF;
  PERFORM set_config('app.tenant_id',b::text,true);
  SELECT count(*) INTO n FROM sales WHERE tenant_id=a;
  IF n <> 0 THEN RAISE EXCEPTION 'Tenant B saw tenant A sales'; END IF;
  RAISE NOTICE 'PASS: bidirectional tenant isolation, catalog RLS and unknown cost';
END $$;

DO $$
DECLARE a uuid; b uuid; branch_b uuid; blocked boolean := false;
BEGIN
  SELECT tenant_a,tenant_b,bw_test_ids.branch_b INTO a,b,branch_b FROM bw_test_ids;
  PERFORM set_config('app.tenant_id',a::text,true);
  BEGIN
    INSERT INTO sales (tenant_id,branch_id,transaction_ref,transaction_date,subtotal,total_amount)
    VALUES (a,branch_b,'QA-CROSS-TENANT',NOW(),10,10);
  EXCEPTION WHEN foreign_key_violation THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Composite FK permitted a cross-tenant branch'; END IF;
  RAISE NOTICE 'PASS: composite FK rejects cross-tenant branch';
END $$;

DO $$
DECLARE a uuid; b uuid; n int;
BEGIN
  SELECT tenant_a,tenant_b INTO a,b FROM bw_test_ids;
  PERFORM set_config('app.tenant_id',b::text,true);
  SELECT count(*) INTO n FROM business_directory_profiles WHERE tenant_id=a AND contact_email='published@example.test';
  IF n <> 1 THEN RAISE EXCEPTION 'Published profile not discoverable'; END IF;
  UPDATE business_directory_profiles SET display_name='tampered' WHERE tenant_id=a;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'Cross-tenant directory update succeeded'; END IF;
  PERFORM set_config('app.tenant_id',a::text,true);
  SELECT count(*) INTO n FROM business_directory_profiles WHERE tenant_id=b;
  IF n <> 0 THEN RAISE EXCEPTION 'Unpublished profile visible across tenants'; END IF;
  RAISE NOTICE 'PASS: opt-in directory publish, private profile and cross-tenant write isolation';
END $$;

DO $$
DECLARE a uuid; mv uuid; blocked boolean;
BEGIN
  SELECT tenant_a INTO a FROM bw_test_ids;
  PERFORM set_config('app.tenant_id',a::text,true);
  SELECT id INTO mv FROM inventory_movements WHERE tenant_id=a LIMIT 1;
  IF mv IS NULL THEN RAISE EXCEPTION 'Inventory fixture missing'; END IF;
  blocked := false;
  BEGIN UPDATE inventory_movements SET quantity_delta=99 WHERE id=mv;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'Table inventory_movements is immutable:%' THEN blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Inventory UPDATE was not blocked'; END IF;
  blocked := false;
  BEGIN DELETE FROM inventory_movements WHERE id=mv;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'Table inventory_movements is immutable:%' THEN blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Inventory DELETE was not blocked'; END IF;
  RAISE NOTICE 'PASS: immutable inventory ledger rejects UPDATE and DELETE';
END $$;

DO $$
DECLARE valid boolean; checked bigint; broken bigint; blocked boolean := false; audit_id bigint;
BEGIN
  SELECT is_valid,checked_records,broken_at_id INTO valid,checked,broken FROM fn_verify_audit_chain();
  IF NOT valid OR checked < 1 THEN RAISE EXCEPTION 'Audit chain invalid or empty: valid %, checked %, broken %',valid,checked,broken; END IF;
  SELECT id INTO audit_id FROM audit_logs ORDER BY id DESC LIMIT 1;
  BEGIN DELETE FROM audit_logs WHERE id=audit_id;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'Table audit_logs is immutable:%' THEN blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Audit DELETE was not blocked'; END IF;
  RAISE NOTICE 'PASS: % audit records validate and immutable audit rejects DELETE',checked;
END $$;
ROLLBACK;
