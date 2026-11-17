-- BizWave Seed 002: Realistic Multi-Tenant Nairobi SME Datasets (Savannah Urban Mart & Kijiji Flame Bistro)
-- All demo accounts use password: BizWave2026! (Argon2id hashed)

DO $$
DECLARE
  v_hash TEXT := '$argon2id$v=19$m=65536,t=3,p=4$ea2gd4tFZxfp2UYYKQNMDA$sjdovHBoh8bTroA9bCRbuvT5vvqE8YWsDCbFwUCKH8Y';

  -- Fixed deterministic UUIDs for reproducible integration tests & seeding
  t_savannah UUID := '11111111-1111-4111-8111-111111111111';
  t_kijiji   UUID := '22222222-2222-4222-8222-222222222222';

  b_westlands UUID := '11111111-aaaa-4111-8111-000000000001';
  b_kilimani  UUID := '11111111-aaaa-4111-8111-000000000002';
  b_lavington UUID := '22222222-aaaa-4222-8222-000000000001';

  u_amina  UUID := 'aaaaaaaa-0001-4000-8000-000000000001';
  u_david  UUID := 'aaaaaaaa-0002-4000-8000-000000000002';
  u_grace  UUID := 'aaaaaaaa-0003-4000-8000-000000000003';
  u_kelvin UUID := 'aaaaaaaa-0004-4000-8000-000000000004';
  u_faith  UUID := 'aaaaaaaa-0005-4000-8000-000000000005';
  u_brian  UUID := 'bbbbbbbb-0001-4000-8000-000000000001';

  v_plan_intel  UUID;
  v_plan_growth UUID;
  v_sub1 UUID;
  v_sub2 UUID;

  c_bev UUID; c_gro UUID; c_dai UUID; c_hom UUID;
  c_grill UUID; c_drinks UUID;
  s_sup1 UUID; s_sup2 UUID; s_sup3 UUID;

  p_coffee UUID; p_honey UUID; p_milk UUID; p_oil UUID; p_flour UUID; p_tea UUID; p_soap UUID; p_sugar UUID;
  p_nyama UUID; p_tilapia UUID; p_dawa UUID; p_platter UUID;

  ch_pos UUID; ch_del UUID; ch_pos2 UUID;
  ec_rent UUID; ec_util UUID; ec_pay UUID; ec_sup UUID; ec_mkt UUID;
  ec2_rent UUID; ec2_ing UUID; ec2_pay UUID;
  ca_mpesa1 UUID; ca_cash1 UUID; ca_mpesa2 UUID;

  cust_ids UUID[];
  cust2_ids UUID[];

  d INTEGER;
  v_date DATE;
  v_sale_id UUID;
  v_branch UUID;
  v_prod UUID;
  v_qty NUMERIC(12,2);
  v_price NUMERIC(14,2);
  v_cost NUMERIC(14,2);
  v_sub NUMERIC(14,2);
  v_tax NUMERIC(14,2);
  v_tot NUMERIC(14,2);
  v_cust UUID;
  v_pm TEXT;
  v_dow INTEGER;
  v_orders_today INTEGER;
  k INTEGER;
  v_prov_at UUID;
  v_prov_wa UUID;
  v_ch_sms UUID;
  v_ch_wa UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM tenants WHERE id = t_savannah) THEN
    RAISE NOTICE 'Demo tenants already seeded; skipping.';
    RETURN;
  END IF;

  SELECT id INTO v_plan_intel  FROM subscription_plans WHERE code = 'intelligence';
  SELECT id INTO v_plan_growth FROM subscription_plans WHERE code = 'growth';
  SELECT id INTO v_prov_at FROM communication_providers WHERE code = 'africas_talking';
  SELECT id INTO v_prov_wa FROM communication_providers WHERE code = 'meta_whatsapp';

  -- 1. Create Tenants
  INSERT INTO tenants (id, name, slug, display_name, industry_code, business_size, country_code, currency_code, timezone, preferred_language, business_email, phone_number, brand_color, onboarding_completed, onboarding_step)
  VALUES
  (t_savannah, 'Savannah Urban Mart Ltd', 'savannah-urban-mart', 'Savannah Urban Mart', 'retail', 'small', 'KE', 'KES', 'Africa/Nairobi', 'en', 'hello@savannahmart.co.ke', '+254712345001', '#0D9488', TRUE, 11),
  (t_kijiji, 'Kijiji Flame Bistro Ltd', 'kijiji-flame-bistro', 'Kijiji Flame Bistro', 'restaurant', 'small', 'KE', 'KES', 'Africa/Nairobi', 'en', 'bookings@kijijiflame.co.ke', '+254722889001', '#D97706', TRUE, 11);

  -- 2. Branches
  INSERT INTO branches (id, tenant_id, code, name, city, county, address, phone_number, is_headquarters) VALUES
  (b_westlands, t_savannah, 'WST-01', 'Westlands Flagship', 'Nairobi', 'Nairobi', 'Mpaka Road, Westlands', '+254712345010', TRUE),
  (b_kilimani,  t_savannah, 'KLM-02', 'Kilimani Express', 'Nairobi', 'Nairobi', 'Argwings Kodhek Rd, Kilimani', '+254712345020', FALSE),
  (b_lavington, t_kijiji,   'LVG-01', 'Lavington Courtyard', 'Nairobi', 'Nairobi', 'James Gichuru Rd, Lavington', '+254722889010', TRUE);

  INSERT INTO tenant_settings (tenant_id, default_branch_id, enabled_kpis) VALUES
  (t_savannah, b_westlands, '["total_revenue","gross_profit","net_profit","avg_order_value","order_volume","total_expenses"]'::jsonb),
  (t_kijiji, b_lavington, '["total_revenue","gross_profit","total_expenses","net_profit","avg_order_value"]'::jsonb);

  -- 3. Users & Roles
  INSERT INTO users (id, email, password_hash, first_name, last_name, phone_number, preferred_language, email_verified, email_verified_at) VALUES
  (u_amina,  'amina@savannahmart.co.ke',  v_hash, 'Amina',  'Wanjiku',  '+254712100001', 'en', TRUE, NOW()),
  (u_david,  'david@savannahmart.co.ke',  v_hash, 'David',  'Ochieng',  '+254712100002', 'en', TRUE, NOW()),
  (u_grace,  'grace@savannahmart.co.ke',  v_hash, 'Grace',  'Muthoni',  '+254712100003', 'sw', TRUE, NOW()),
  (u_kelvin, 'kelvin@savannahmart.co.ke', v_hash, 'Kelvin', 'Kamau',    '+254712100004', 'en', TRUE, NOW()),
  (u_faith,  'faith@savannahmart.co.ke',  v_hash, 'Faith',  'Chebet',   '+254712100005', 'sw', TRUE, NOW()),
  (u_brian,  'brian@kijijiflame.co.ke',   v_hash, 'Brian',  'Njoroge',  '+254722900001', 'en', TRUE, NOW());

  INSERT INTO user_profiles (user_id, job_title) VALUES
  (u_amina, 'Managing Director'), (u_david, 'Finance Officer'), (u_grace, 'Inventory Manager'),
  (u_kelvin, 'Kilimani Branch Manager'), (u_faith, 'Customer Experience Lead'), (u_brian, 'Founder & Head Chef');

  INSERT INTO user_roles (tenant_id, user_id, role_id)
  SELECT t_savannah, u_amina,  id FROM roles WHERE code = 'business_owner' AND tenant_id IS NULL UNION ALL
  SELECT t_kijiji,   u_amina,  id FROM roles WHERE code = 'read_only_auditor' AND tenant_id IS NULL UNION ALL
  SELECT t_savannah, u_david,  id FROM roles WHERE code = 'finance_officer' AND tenant_id IS NULL UNION ALL
  SELECT t_savannah, u_grace,  id FROM roles WHERE code = 'inventory_manager' AND tenant_id IS NULL UNION ALL
  SELECT t_savannah, u_kelvin, id FROM roles WHERE code = 'branch_manager' AND tenant_id IS NULL UNION ALL
  SELECT t_savannah, u_faith,  id FROM roles WHERE code = 'customer_service_agent' AND tenant_id IS NULL UNION ALL
  SELECT t_kijiji,   u_brian,  id FROM roles WHERE code = 'business_owner' AND tenant_id IS NULL;

  -- Branch scoping: Kelvin is restricted ONLY to Kilimani Express!
  INSERT INTO user_branch_assignments (tenant_id, user_id, branch_id, access_level) VALUES
  (t_savannah, u_kelvin, b_kilimani, 'manager'),
  (t_savannah, u_amina,  b_westlands, 'manager'),
  (t_savannah, u_amina,  b_kilimani,  'manager');

  -- 4. Subscriptions & Quotas
  INSERT INTO subscriptions (tenant_id, plan_id, status, billing_cycle)
  VALUES (t_savannah, v_plan_intel, 'active', 'monthly') RETURNING id INTO v_sub1;
  INSERT INTO subscriptions (tenant_id, plan_id, status, billing_cycle)
  VALUES (t_kijiji, v_plan_growth, 'active', 'monthly') RETURNING id INTO v_sub2;

  INSERT INTO subscription_invoices (tenant_id, subscription_id, invoice_number, amount_kes, tax_kes, total_kes, status, paid_at) VALUES
  (t_savannah, v_sub1, 'INV-BW-2026-001', 14000.00, 2240.00, 16240.00, 'paid', NOW() - INTERVAL '12 days'),
  (t_kijiji,   v_sub2, 'INV-BW-2026-002', 6000.00,  960.00,  6960.00,  'paid', NOW() - INTERVAL '9 days');

  INSERT INTO usage_quotas (tenant_id, metric_code, quota_limit, current_usage) VALUES
  (t_savannah, 'max_branches', 10, 2),
  (t_savannah, 'max_users', 25, 5),
  (t_savannah, 'imports_per_month', 500, 3),
  (t_savannah, 'ai_queries_per_month', 500, 4),
  (t_savannah, 'sms_included', 2000, 18),
  (t_kijiji, 'max_branches', 3, 1),
  (t_kijiji, 'max_users', 10, 2),
  (t_kijiji, 'imports_per_month', 100, 1),
  (t_kijiji, 'ai_queries_per_month', 0, 0),
  (t_kijiji, 'sms_included', 500, 0);

  -- 5. Categories, Suppliers & Products — Savannah Urban Mart
  INSERT INTO product_categories (tenant_id, name) VALUES (t_savannah, 'Specialty Beverages') RETURNING id INTO c_bev;
  INSERT INTO product_categories (tenant_id, name) VALUES (t_savannah, 'Pantry & Staples') RETURNING id INTO c_gro;
  INSERT INTO product_categories (tenant_id, name) VALUES (t_savannah, 'Fresh Dairy') RETURNING id INTO c_dai;
  INSERT INTO product_categories (tenant_id, name) VALUES (t_savannah, 'Household Care') RETURNING id INTO c_hom;

  INSERT INTO suppliers (tenant_id, name, contact_name, phone_number, lead_time_days) VALUES
  (t_savannah, 'Nyeri Highlands Coffee Roasters', 'Peter Mwangi', '+254720111222', 3) RETURNING id INTO s_sup1;
  INSERT INTO suppliers (tenant_id, name, contact_name, phone_number, lead_time_days) VALUES
  (t_savannah, 'Rift Valley Foods Distributors', 'Esther Kiprop', '+254720333444', 2) RETURNING id INTO s_sup2;

  INSERT INTO products (tenant_id, category_id, supplier_id, sku, name, cost_price, selling_price, reorder_level, reorder_quantity) VALUES
  (t_savannah, c_bev, s_sup1, 'SAV-COF-250', 'Kenyan AA Roast Coffee 250g',   520.00,  980.00, 18, 50) RETURNING id INTO p_coffee;
  INSERT INTO products (tenant_id, category_id, supplier_id, sku, name, cost_price, selling_price, reorder_level, reorder_quantity) VALUES
  (t_savannah, c_gro, s_sup1, 'SAV-HON-500', 'Baringo Raw Acacia Honey 500g', 610.00, 1150.00, 15, 40) RETURNING id INTO p_honey;
  INSERT INTO products (tenant_id, category_id, supplier_id, sku, name, cost_price, selling_price, reorder_level, reorder_quantity) VALUES
  (t_savannah, c_dai, s_sup2, 'SAV-MLK-1L',  'Highland Fresh Milk 1L',         92.00,  135.00, 35, 100) RETURNING id INTO p_milk;
  INSERT INTO products (tenant_id, category_id, supplier_id, sku, name, cost_price, selling_price, reorder_level, reorder_quantity) VALUES
  (t_savannah, c_gro, s_sup2, 'SAV-OIL-2L',  'Golden Sunflower Cooking Oil 2L',480.00, 690.00, 20, 60) RETURNING id INTO p_oil;
  INSERT INTO products (tenant_id, category_id, supplier_id, sku, name, cost_price, selling_price, reorder_level, reorder_quantity) VALUES
  (t_savannah, c_gro, s_sup2, 'SAV-FLR-2KG', 'Pembe Fortified Maize Flour 2kg',145.00, 210.00, 40, 120) RETURNING id INTO p_flour;
  INSERT INTO products (tenant_id, category_id, supplier_id, sku, name, cost_price, selling_price, reorder_level, reorder_quantity) VALUES
  (t_savannah, c_bev, s_sup1, 'SAV-TEA-500', 'Kericho Gold Loose Tea 500g',   310.00,  540.00, 20, 50) RETURNING id INTO p_tea;
  INSERT INTO products (tenant_id, category_id, supplier_id, sku, name, cost_price, selling_price, reorder_level, reorder_quantity) VALUES
  (t_savannah, c_hom, s_sup2, 'SAV-SOP-1L',  'EcoClean Dishwashing Liquid 1L', 190.00, 340.00, 15, 40) RETURNING id INTO p_soap;
  INSERT INTO products (tenant_id, category_id, supplier_id, sku, name, cost_price, selling_price, reorder_level, reorder_quantity) VALUES
  (t_savannah, c_gro, s_sup2, 'SAV-SUG-2KG', 'Mumias Brown Sugar 2kg',        270.00,  380.00, 25, 80) RETURNING id INTO p_sugar;

  -- Opening inventory via immutable movement ledger
  PERFORM fn_record_inventory_movement(t_savannah, b_westlands, p_coffee, 'opening', 12,  520, 'seed', NULL, 'Opening balance (low stock)', u_grace);
  PERFORM fn_record_inventory_movement(t_savannah, b_westlands, p_honey,  'opening', 6,   610, 'seed', NULL, 'Opening balance (critical stock)', u_grace);
  PERFORM fn_record_inventory_movement(t_savannah, b_westlands, p_milk,   'opening', 95,   92, 'seed', NULL, 'Opening balance', u_grace);
  PERFORM fn_record_inventory_movement(t_savannah, b_westlands, p_oil,    'opening', 14,  480, 'seed', NULL, 'Opening balance (low stock)', u_grace);
  PERFORM fn_record_inventory_movement(t_savannah, b_westlands, p_flour,  'opening', 110, 145, 'seed', NULL, 'Opening balance', u_grace);
  PERFORM fn_record_inventory_movement(t_savannah, b_westlands, p_tea,    'opening', 64,  310, 'seed', NULL, 'Opening balance', u_grace);
  PERFORM fn_record_inventory_movement(t_savannah, b_westlands, p_soap,   'opening', 42,  190, 'seed', NULL, 'Opening balance', u_grace);
  PERFORM fn_record_inventory_movement(t_savannah, b_westlands, p_sugar,  'opening', 55,  270, 'seed', NULL, 'Opening balance', u_grace);

  PERFORM fn_record_inventory_movement(t_savannah, b_kilimani, p_coffee,  'opening', 4,   520, 'seed', NULL, 'Opening balance (critical low)', u_grace);
  PERFORM fn_record_inventory_movement(t_savannah, b_kilimani, p_honey,   'opening', 28,  610, 'seed', NULL, 'Opening balance', u_grace);
  PERFORM fn_record_inventory_movement(t_savannah, b_kilimani, p_milk,    'opening', 40,   92, 'seed', NULL, 'Opening stock received', u_grace);
  PERFORM fn_record_inventory_movement(t_savannah, b_kilimani, p_milk,    'sale',   -40,   92, 'seed', NULL, 'Depleted by recent sales (stockout)', u_grace);
  PERFORM fn_record_inventory_movement(t_savannah, b_kilimani, p_oil,     'opening', 36,  480, 'seed', NULL, 'Opening balance', u_grace);
  PERFORM fn_record_inventory_movement(t_savannah, b_kilimani, p_flour,   'opening', 80,  145, 'seed', NULL, 'Opening balance', u_grace);
  PERFORM fn_record_inventory_movement(t_savannah, b_kilimani, p_tea,     'opening', 48,  310, 'seed', NULL, 'Opening balance', u_grace);

  INSERT INTO stock_alerts (tenant_id, branch_id, product_id, alert_type, severity, current_quantity, threshold_quantity, predicted_days_left, status) VALUES
  (t_savannah, b_kilimani,  p_milk,   'stockout',       'critical', 0,  35, 0, 'open'),
  (t_savannah, b_kilimani,  p_coffee, 'depletion_risk', 'critical', 4,  18, 2, 'open'),
  (t_savannah, b_westlands, p_honey,  'depletion_risk', 'warning',  6,  15, 3, 'open'),
  (t_savannah, b_westlands, p_oil,    'low_stock',      'warning',  14, 20, 5, 'open');

  -- 6. Customers & Consents — Savannah Urban Mart
  cust_ids := ARRAY[]::UUID[];
  FOR k IN 1..12 LOOP
    INSERT INTO customers (tenant_id, branch_id, external_ref, full_name, email, phone_number, preferred_language, preferred_channel, marketing_opt_in, status)
    VALUES (
      t_savannah,
      CASE WHEN k % 2 = 0 THEN b_kilimani ELSE b_westlands END,
      'SAV-CUST-' || lpad(k::text, 3, '0'),
      (ARRAY['Wanjiru Ndegwa','Samuel Kipchoge','Mercy Akinyi','Joseph Mutua','Beatrice Nyambura','Hassan Omar','Lilian Chepkoech','George Kariuki','Esther Achieng','Daniel Ruto','Caroline Wambui','Patrick Otieno'])[k],
      'customer' || k || '@example.co.ke',
      '+254710200' || lpad(k::text, 3, '0'),
      CASE WHEN k % 3 = 0 THEN 'sw' ELSE 'en' END,
      CASE WHEN k % 2 = 0 THEN 'whatsapp' ELSE 'sms' END,
      (k <= 8),
      CASE WHEN k >= 10 THEN 'churn_risk' ELSE 'active' END
    ) RETURNING id INTO v_cust;
    cust_ids := array_append(cust_ids, v_cust);

    INSERT INTO customer_consents (tenant_id, customer_id, channel, purpose, status, source) VALUES
    (t_savannah, v_cust, 'sms', 'transactional', 'granted', 'pos_checkout'),
    (t_savannah, v_cust, 'sms', 'marketing', CASE WHEN k <= 8 THEN 'granted' ELSE 'revoked' END, 'onboarding_form'),
    (t_savannah, v_cust, 'whatsapp', 'marketing', CASE WHEN k <= 6 THEN 'granted' ELSE 'revoked' END, 'whatsapp_optin');
  END LOOP;

  -- Sales Channels & Cash Accounts & Expense Categories
  INSERT INTO sales_channels (tenant_id, code, name) VALUES (t_savannah, 'in_store_pos', 'In-Store POS') RETURNING id INTO ch_pos;
  INSERT INTO sales_channels (tenant_id, code, name) VALUES (t_savannah, 'delivery', 'Nairobi Delivery') RETURNING id INTO ch_del;

  INSERT INTO cash_accounts (tenant_id, branch_id, name, account_type, account_number_masked, opening_balance) VALUES
  (t_savannah, b_westlands, 'Savannah M-Pesa Till 542188', 'mpesa_till', '****188', 245000.00) RETURNING id INTO ca_mpesa1;
  INSERT INTO cash_accounts (tenant_id, branch_id, name, account_type, account_number_masked, opening_balance) VALUES
  (t_savannah, b_westlands, 'Westlands Cash Drawer', 'petty_cash', 'CASH-WST', 45000.00) RETURNING id INTO ca_cash1;

  INSERT INTO expense_categories (tenant_id, name, category_type, is_recurring) VALUES (t_savannah, 'Shop Rent', 'rent', TRUE) RETURNING id INTO ec_rent;
  INSERT INTO expense_categories (tenant_id, name, category_type, is_recurring) VALUES (t_savannah, 'Electricity & Water (KPLC)', 'utilities', TRUE) RETURNING id INTO ec_util;
  INSERT INTO expense_categories (tenant_id, name, category_type, is_recurring) VALUES (t_savannah, 'Staff Payroll', 'payroll', TRUE) RETURNING id INTO ec_pay;
  INSERT INTO expense_categories (tenant_id, name, category_type, is_recurring) VALUES (t_savannah, 'Supplier Restocking', 'cogs', FALSE) RETURNING id INTO ec_sup;
  INSERT INTO expense_categories (tenant_id, name, category_type, is_recurring) VALUES (t_savannah, 'Local Marketing & Delivery', 'marketing', FALSE) RETURNING id INTO ec_mkt;

  -- 7. Generate 90 Days of Realistic Sales & Cash Transactions for Savannah Urban Mart
  -- Deliberate weekly seasonality (Fri/Sat peak), steady upward trend, and a noticeable revenue dip in the last 5 days (stockout + anomaly)
  FOR d IN REVERSE 89..0 LOOP
    v_date := (CURRENT_DATE - d);
    v_dow := EXTRACT(DOW FROM v_date)::INTEGER; -- 0=Sun, 5=Fri, 6=Sat

    -- Base daily orders: higher Fri/Sat, noticeable dip in last 5 days so "Why did sales drop this week?" has real data
    v_orders_today := CASE
      WHEN d <= 4 THEN 3
      WHEN v_dow IN (5, 6) THEN 8
      WHEN v_dow = 0 THEN 6
      ELSE 5
    END;

    FOR k IN 1..v_orders_today LOOP
      v_branch := CASE WHEN (k + d) % 3 = 0 THEN b_kilimani ELSE b_westlands END;
      -- Customers 10, 11, 12 stopped buying >45 days ago (genuine churn cohort!)
      IF d > 48 AND (k % 3 = 0) THEN
        v_cust := cust_ids[10 + ((d + k) % 3)];
      ELSE
        v_cust := cust_ids[1 + ((d * 3 + k) % 9)];
      END IF;

      -- Pick primary product with realistic volume distribution
      CASE ((d + k * 2) % 8)
        WHEN 0 THEN v_prod := p_coffee; v_price := 980;  v_cost := 520; v_qty := 2 + (k % 3);
        WHEN 1 THEN v_prod := p_honey;  v_price := 1150; v_cost := 610; v_qty := 1 + (k % 2);
        WHEN 2 THEN v_prod := p_milk;   v_price := 135;  v_cost := 92;  v_qty := 4 + (k % 4);
        WHEN 3 THEN v_prod := p_oil;    v_price := 690;  v_cost := 480; v_qty := 2 + (k % 2);
        WHEN 4 THEN v_prod := p_flour;  v_price := 210;  v_cost := 145; v_qty := 3 + (k % 4);
        WHEN 5 THEN v_prod := p_tea;    v_price := 540;  v_cost := 310; v_qty := 2 + (k % 3);
        WHEN 6 THEN v_prod := p_soap;   v_price := 340;  v_cost := 190; v_qty := 2 + (k % 2);
        ELSE        v_prod := p_sugar;  v_price := 380;  v_cost := 270; v_qty := 2 + (k % 3);
      END CASE;

      -- Slight boost in Westlands flagship and weekends
      IF v_branch = b_westlands AND v_dow IN (5, 6) THEN
        v_qty := v_qty + 1;
      END IF;

      v_sub := ROUND(v_qty * v_price, 2);
      v_tax := ROUND(v_sub * 0.16, 2);
      v_tot := v_sub + v_tax;
      v_pm := CASE WHEN (k + d) % 4 = 0 THEN 'cash' WHEN (k + d) % 7 = 0 THEN 'card' ELSE 'mpesa' END;

      INSERT INTO sales (
        tenant_id, branch_id, customer_id, channel_id, transaction_ref, source_system,
        transaction_date, payment_status, currency_code, subtotal, discount_amount, tax_amount,
        total_amount, cost_of_goods_sold, created_by
      ) VALUES (
        t_savannah, v_branch, v_cust, CASE WHEN k % 4 = 0 THEN ch_del ELSE ch_pos END,
        'SAV-' || to_char(v_date, 'YYYYMMDD') || '-' || lpad(k::text, 3, '0'),
        'pos_sync',
        (v_date + make_interval(hours => 9 + (k % 9), mins => (k * 7) % 60)) AT TIME ZONE 'Africa/Nairobi',
        'paid', 'KES', v_sub, 0, v_tax, v_tot, ROUND(v_qty * v_cost, 2), u_amina
      ) RETURNING id INTO v_sale_id;

      INSERT INTO sales_items (tenant_id, sale_id, product_id, product_name_snapshot, sku_snapshot, quantity, unit_price, unit_cost, tax_amount, line_total)
      SELECT t_savannah, v_sale_id, p.id, p.name, p.sku, v_qty, v_price, v_cost, v_tax, v_tot
      FROM products p WHERE p.id = v_prod;

      INSERT INTO sales_payments (tenant_id, sale_id, payment_method, amount, external_reference, reconciliation_status, paid_at)
      VALUES (
        t_savannah, v_sale_id, v_pm, v_tot,
        CASE WHEN v_pm = 'mpesa' THEN 'U' || to_char(v_date, 'YYMMDD') || 'MP' || lpad((d*10+k)::text, 4, '0') ELSE NULL END,
        CASE WHEN d > 3 THEN 'reconciled' ELSE 'recorded' END,
        (v_date + make_interval(hours => 9 + (k % 9))) AT TIME ZONE 'Africa/Nairobi'
      );

      INSERT INTO cash_transactions (tenant_id, cash_account_id, branch_id, direction, amount, mpesa_receipt_no, counterparty, transaction_date, record_status, matched_sale_id)
      VALUES (
        t_savannah,
        CASE WHEN v_pm = 'cash' THEN ca_cash1 ELSE ca_mpesa1 END,
        v_branch, 'inflow', v_tot,
        CASE WHEN v_pm = 'mpesa' THEN 'U' || to_char(v_date, 'YYMMDD') || 'MP' || lpad((d*10+k)::text, 4, '0') ELSE NULL END,
        'POS Customer Checkout',
        (v_date + make_interval(hours => 9 + (k % 9))) AT TIME ZONE 'Africa/Nairobi',
        CASE WHEN d > 3 THEN 'reconciled' ELSE 'recorded' END,
        v_sale_id
      );
    END LOOP;

    -- Monthly recurring expenses (on day 1 of each month) + weekly utilities/marketing + deliberate expense spike 8 days ago
    IF EXTRACT(DAY FROM v_date) = 1 THEN
      INSERT INTO expenses (tenant_id, branch_id, category_id, expense_ref, vendor_name, description, expense_date, amount, payment_method, reconciliation_status, is_recurring, created_by) VALUES
      (t_savannah, b_westlands, ec_rent, 'EXP-RENT-W-' || to_char(v_date,'YYYYMM'), 'Westlands Plaza Management', 'Monthly shop rent — Westlands Flagship', v_date, 85000.00, 'bank_transfer', 'reconciled', TRUE, u_david),
      (t_savannah, b_kilimani,  ec_rent, 'EXP-RENT-K-' || to_char(v_date,'YYYYMM'), 'Kilimani Arcade Ltd', 'Monthly shop rent — Kilimani Express', v_date, 55000.00, 'bank_transfer', 'reconciled', TRUE, u_david),
      (t_savannah, b_westlands, ec_pay,  'EXP-PAY-W-'  || to_char(v_date,'YYYYMM'), 'Savannah Payroll', 'Monthly staff salaries — Westlands', v_date, 110000.00, 'bank_transfer', 'reconciled', TRUE, u_david),
      (t_savannah, b_kilimani,  ec_pay,  'EXP-PAY-K-'  || to_char(v_date,'YYYYMM'), 'Savannah Payroll', 'Monthly staff salaries — Kilimani', v_date, 72000.00, 'bank_transfer', 'reconciled', TRUE, u_david);
    END IF;

    IF v_dow = 1 THEN
      INSERT INTO expenses (tenant_id, branch_id, category_id, expense_ref, vendor_name, description, expense_date, amount, payment_method, reconciliation_status, is_recurring, created_by) VALUES
      (t_savannah, b_westlands, ec_util, 'EXP-UTIL-' || to_char(v_date,'YYYYMMDD'), 'Kenya Power (KPLC)', 'Weekly prepaid electricity tokens & water', v_date, CASE WHEN d BETWEEN 6 AND 12 THEN 29500.00 ELSE 7800.00 END, 'mpesa', 'reconciled', TRUE, u_david),
      (t_savannah, b_kilimani,  ec_mkt,  'EXP-MKT-'  || to_char(v_date,'YYYYMMDD'), 'Nairobi Rider Logistics', 'Local delivery & flyer promotions', v_date, 6500.00, 'mpesa', 'reconciled', FALSE, u_david);

      INSERT INTO cash_transactions (tenant_id, cash_account_id, branch_id, direction, amount, counterparty, transaction_date, record_status)
      VALUES (t_savannah, ca_mpesa1, b_westlands, 'outflow', CASE WHEN d BETWEEN 6 AND 12 THEN 29500.00 ELSE 7800.00 END, 'Kenya Power (KPLC)', v_date::timestamptz, 'reconciled');
    END IF;
  END LOOP;

  -- Payables & Receivables for Cash-Flow Forecasting (confirmed obligations!)
  INSERT INTO payables (tenant_id, branch_id, supplier_id, bill_ref, description, amount_due, due_date, is_confirmed_obligation, status) VALUES
  (t_savannah, b_westlands, s_sup1, 'BILL-NYERI-2026-11', 'Coffee & Honey restock invoice (Net 14)', 78000.00, CURRENT_DATE + 7,  TRUE, 'open'),
  (t_savannah, b_westlands, s_sup2, 'BILL-RIFT-2026-11',  'Cooking oil & flour wholesale replenishment', 94500.00, CURRENT_DATE + 15, TRUE, 'open'),
  (t_savannah, b_westlands, NULL,   'BILL-RENT-DEC-2026', 'Upcoming December shop rent (both branches)', 140000.00, CURRENT_DATE + 18, TRUE, 'open');

  INSERT INTO receivables (tenant_id, branch_id, customer_id, invoice_ref, amount_due, due_date, status) VALUES
  (t_savannah, b_westlands, cust_ids[1], 'AR-CORP-001', 42000.00, CURRENT_DATE + 10, 'open'),
  (t_savannah, b_kilimani,  cust_ids[2], 'AR-CORP-002', 28500.00, CURRENT_DATE + 20, 'open');

  -- BizWave Connect channels & EN/SW templates for Savannah Urban Mart (honest: credentials missing until configured)
  INSERT INTO communication_channels (tenant_id, channel_type, provider_id, sender_id, is_enabled)
  VALUES (t_savannah, 'sms', v_prov_at, 'SAVANNAH', FALSE) RETURNING id INTO v_ch_sms;
  INSERT INTO communication_channels (tenant_id, channel_type, provider_id, sender_id, is_enabled)
  VALUES (t_savannah, 'whatsapp', v_prov_wa, '+254712345001', FALSE) RETURNING id INTO v_ch_wa;

  INSERT INTO communication_accounts (tenant_id, channel_id, account_label, credential_status) VALUES
  (t_savannah, v_ch_sms, 'Africa''s Talking SMS Gateway', 'missing_credentials'),
  (t_savannah, v_ch_wa,  'Meta WhatsApp Business Cloud', 'missing_credentials');

  INSERT INTO communication_templates (tenant_id, name, channel_type, language, purpose, body_template, variables) VALUES
  (t_savannah, 'Weekend Coffee Restock Offer', 'sms', 'en', 'marketing', 'Hi {{name}}, fresh Nyeri AA Roast Coffee is back at Savannah Urban Mart Westlands! Enjoy 10% off this weekend. Reply STOP to opt out.', '["name"]'::jsonb),
  (t_savannah, 'Ofa ya Wikendi ya Kahawa', 'sms', 'sw', 'marketing', 'Habari {{name}}, kahawa mpya ya Nyeri AA imewasili Savannah Urban Mart Westlands! Pata punguzo la 10% wikendi hii. Jibu STOP kujiondoa.', '["name"]'::jsonb),
  (t_savannah, 'Order Ready Notification', 'whatsapp', 'en', 'transactional', 'Hello {{name}}, your Savannah Urban Mart order {{order_ref}} is packed and ready for pickup or delivery.', '["name","order_ref"]'::jsonb),
  (t_savannah, 'Taarifa ya Oda Tayari', 'whatsapp', 'sw', 'transactional', 'Hujambo {{name}}, oda yako {{order_ref}} kutoka Savannah Urban Mart iko tayari kuchukuliwa au kuletwa.', '["name","order_ref"]'::jsonb);

  -- Initial grounded recommendations
  INSERT INTO recommendations (tenant_id, branch_id, category, priority, title, observation, estimate, suggested_action, evidence) VALUES
  (t_savannah, b_kilimani, 'inventory', 'urgent', 'Immediate restock needed for Highland Fresh Milk & Kenyan AA Coffee at Kilimani', 'Highland Fresh Milk 1L is currently out of stock (0 units) and Kenyan AA Roast Coffee has only 4 units remaining at Kilimani Express.', 'Preventing 4 days of stockout protects an estimated KES 24,800 in weekly gross sales.', 'Issue purchase order to Rift Valley Foods (100L milk) and transfer 10 units of Kenyan AA Coffee from Westlands today.', '{"branch":"Kilimani Express","skus":["SAV-MLK-1L","SAV-COF-250"]}'::jsonb),
  (t_savannah, b_westlands, 'marketing', 'high', 'Re-engage 3 high-value customers inactive for 45+ days', 'Customers Daniel Ruto, Caroline Wambui, and Patrick Otieno have had zero purchases over the last 45 days.', 'Reactivating 2 of 3 churn-risk buyers can recover ~KES 18,500/month.', 'Launch a consent-verified WhatsApp/SMS win-back message after configuring provider credentials.', '{"inactive_days_threshold":45,"customer_count":3}'::jsonb);

  -- ===================== TENANT 2: KIJIJI FLAME BISTRO (Restaurant, Growth Plan) =====================
  INSERT INTO product_categories (tenant_id, name) VALUES (t_kijiji, 'Signature Grills') RETURNING id INTO c_grill;
  INSERT INTO product_categories (tenant_id, name) VALUES (t_kijiji, 'Craft Drinks') RETURNING id INTO c_drinks;

  INSERT INTO suppliers (tenant_id, name, contact_name, phone_number, lead_time_days) VALUES
  (t_kijiji, 'Kiserian Prime Butchery', 'John Ole Sankale', '+254721445566', 1) RETURNING id INTO s_sup3;

  INSERT INTO products (tenant_id, category_id, supplier_id, sku, name, cost_price, selling_price, reorder_level, reorder_quantity) VALUES
  (t_kijiji, c_grill,  s_sup3, 'KFB-NYM-1KG', 'Mbuzi Choma Platter (1kg)', 820.00, 1850.00, 12, 30) RETURNING id INTO p_nyama;
  INSERT INTO products (tenant_id, category_id, supplier_id, sku, name, cost_price, selling_price, reorder_level, reorder_quantity) VALUES
  (t_kijiji, c_grill,  s_sup3, 'KFB-TIL-WHO', 'Lake Victoria Wet-Fry Tilapia', 540.00, 1350.00, 10, 25) RETURNING id INTO p_tilapia;
  INSERT INTO products (tenant_id, category_id, supplier_id, sku, name, cost_price, selling_price, reorder_level, reorder_quantity) VALUES
  (t_kijiji, c_drinks, s_sup3, 'KFB-DAW-GLS', 'Kenyan Honey & Lime Dawa', 140.00, 480.00, 25, 60) RETURNING id INTO p_dawa;
  INSERT INTO products (tenant_id, category_id, supplier_id, sku, name, cost_price, selling_price, reorder_level, reorder_quantity) VALUES
  (t_kijiji, c_grill,  s_sup3, 'KFB-PLT-FAM', 'Lavington Family Feast Platter', 1650.00, 3900.00, 6, 15) RETURNING id INTO p_platter;

  PERFORM fn_record_inventory_movement(t_kijiji, b_lavington, p_nyama,   'opening', 24,  820, 'seed', NULL, 'Opening kitchen stock', u_brian);
  PERFORM fn_record_inventory_movement(t_kijiji, b_lavington, p_tilapia, 'opening', 8,   540, 'seed', NULL, 'Low fish stock', u_brian);
  PERFORM fn_record_inventory_movement(t_kijiji, b_lavington, p_dawa,    'opening', 50,  140, 'seed', NULL, 'Opening bar ingredients', u_brian);
  PERFORM fn_record_inventory_movement(t_kijiji, b_lavington, p_platter, 'opening', 15, 1650, 'seed', NULL, 'Opening stock', u_brian);

  INSERT INTO sales_channels (tenant_id, code, name) VALUES (t_kijiji, 'dine_in', 'Dine-In Courtyard') RETURNING id INTO ch_pos2;
  INSERT INTO cash_accounts (tenant_id, branch_id, name, account_type, account_number_masked, opening_balance) VALUES
  (t_kijiji, b_lavington, 'Kijiji M-Pesa Till 881204', 'mpesa_till', '****204', 180000.00) RETURNING id INTO ca_mpesa2;

  INSERT INTO expense_categories (tenant_id, name, category_type, is_recurring) VALUES (t_kijiji, 'Courtyard Lease', 'rent', TRUE) RETURNING id INTO ec2_rent;
  INSERT INTO expense_categories (tenant_id, name, category_type, is_recurring) VALUES (t_kijiji, 'Fresh Kitchen Supplies', 'cogs', FALSE) RETURNING id INTO ec2_ing;
  INSERT INTO expense_categories (tenant_id, name, category_type, is_recurring) VALUES (t_kijiji, 'Kitchen & Wait Staff', 'payroll', TRUE) RETURNING id INTO ec2_pay;

  cust2_ids := ARRAY[]::UUID[];
  FOR k IN 1..5 LOOP
    INSERT INTO customers (tenant_id, branch_id, external_ref, full_name, phone_number, marketing_opt_in)
    VALUES (t_kijiji, b_lavington, 'KFB-CUST-' || lpad(k::text, 3, '0'),
      (ARRAY['Diana Mwikali','Kevin Onyango','Sharon Wairimu','Titus Koech','Brenda Nabwire'])[k],
      '+25472255500' || k, TRUE
    ) RETURNING id INTO v_cust;
    cust2_ids := array_append(cust2_ids, v_cust);
  END LOOP;

  -- 60 days of Restaurant Sales for Kijiji Flame Bistro
  FOR d IN REVERSE 59..0 LOOP
    v_date := (CURRENT_DATE - d);
    v_dow := EXTRACT(DOW FROM v_date)::INTEGER;
    v_orders_today := CASE WHEN v_dow IN (5, 6, 0) THEN 6 ELSE 3 END;

    FOR k IN 1..v_orders_today LOOP
      CASE ((d + k) % 4)
        WHEN 0 THEN v_prod := p_nyama;   v_price := 1850; v_cost := 820;  v_qty := 1 + (k % 2);
        WHEN 1 THEN v_prod := p_tilapia; v_price := 1350; v_cost := 540;  v_qty := 1 + (k % 2);
        WHEN 2 THEN v_prod := p_dawa;    v_price := 480;  v_cost := 140;  v_qty := 2 + (k % 3);
        ELSE        v_prod := p_platter; v_price := 3900; v_cost := 1650; v_qty := 1;
      END CASE;

      v_sub := ROUND(v_qty * v_price, 2);
      v_tax := ROUND(v_sub * 0.16, 2);
      v_tot := v_sub + v_tax;

      INSERT INTO sales (
        tenant_id, branch_id, customer_id, channel_id, transaction_ref, source_system,
        transaction_date, payment_status, currency_code, subtotal, discount_amount, tax_amount,
        total_amount, cost_of_goods_sold, created_by
      ) VALUES (
        t_kijiji, b_lavington, cust2_ids[1 + ((d + k) % 5)], ch_pos2,
        'KFB-' || to_char(v_date, 'YYYYMMDD') || '-' || lpad(k::text, 3, '0'),
        'pos_sync',
        (v_date + make_interval(hours => 12 + (k % 8))) AT TIME ZONE 'Africa/Nairobi',
        'paid', 'KES', v_sub, 0, v_tax, v_tot, ROUND(v_qty * v_cost, 2), u_brian
      ) RETURNING id INTO v_sale_id;

      INSERT INTO sales_items (tenant_id, sale_id, product_id, product_name_snapshot, sku_snapshot, quantity, unit_price, unit_cost, tax_amount, line_total)
      SELECT t_kijiji, v_sale_id, p.id, p.name, p.sku, v_qty, v_price, v_cost, v_tax, v_tot
      FROM products p WHERE p.id = v_prod;
    END LOOP;

    IF EXTRACT(DAY FROM v_date) = 1 THEN
      INSERT INTO expenses (tenant_id, branch_id, category_id, expense_ref, vendor_name, description, expense_date, amount, payment_method, is_recurring, created_by) VALUES
      (t_kijiji, b_lavington, ec2_rent, 'KFB-RENT-' || to_char(v_date,'YYYYMM'), 'Lavington Green Properties', 'Monthly courtyard restaurant lease', v_date, 120000.00, 'bank_transfer', TRUE, u_brian),
      (t_kijiji, b_lavington, ec2_pay,  'KFB-PAY-'  || to_char(v_date,'YYYYMM'), 'Kijiji Bistro Staff', 'Monthly kitchen & hospitality payroll', v_date, 95000.00, 'bank_transfer', TRUE, u_brian);
    END IF;
  END LOOP;

  -- Seed initial tamper-evident audit records
  PERFORM fn_append_audit_log(t_savannah, u_amina, 'amina@savannahmart.co.ke', 'tenant.initialized', 'tenant', t_savannah::text, '127.0.0.1'::inet, 'BizWave-Seeder', '{"plan":"intelligence","branches":2}'::jsonb);
  PERFORM fn_append_audit_log(t_kijiji,   u_brian, 'brian@kijijiflame.co.ke',  'tenant.initialized', 'tenant', t_kijiji::text,   '127.0.0.1'::inet, 'BizWave-Seeder', '{"plan":"growth","branches":1}'::jsonb);

  REFRESH MATERIALIZED VIEW mv_tenant_daily_analytics;
END $$;
