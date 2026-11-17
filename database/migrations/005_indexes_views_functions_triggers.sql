-- BizWave Migration 005: Composite Indexes, Views, Materialized Views, Functions & Triggers (Section 9)

-- ===================== TARGETED COMPOSITE INDEXES =====================
CREATE INDEX IF NOT EXISTS idx_branches_tenant_status ON branches(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_tenant ON user_roles(user_id, tenant_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_branch_user_tenant ON user_branch_assignments(user_id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_sales_tenant_date ON sales(tenant_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_tenant_branch_date ON sales(tenant_id, branch_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_tenant_customer ON sales(tenant_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_items_tenant_sale ON sales_items(tenant_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_items_tenant_product ON sales_items(tenant_id, product_id);

CREATE INDEX IF NOT EXISTS idx_products_tenant_category ON products(tenant_id, category_id);
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_inventory_tenant_branch ON inventory(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_tenant_prod_date ON inventory_movements(tenant_id, product_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_alerts_tenant_open ON stock_alerts(tenant_id, status, severity) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_expenses_tenant_date ON expenses(tenant_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_branch_date ON expenses(tenant_id, branch_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_cash_tx_tenant_date ON cash_transactions(tenant_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_name_trgm ON customers USING gin(full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_phone ON customers(tenant_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_customer_consents_lookup ON customer_consents(tenant_id, customer_id, channel, purpose);

CREATE INDEX IF NOT EXISTS idx_comm_messages_tenant_created ON communication_messages(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_messages_tenant_campaign ON communication_messages(tenant_id, campaign_id);

CREATE INDEX IF NOT EXISTS idx_forecast_runs_tenant_type ON forecast_runs(tenant_id, forecast_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_events_tenant_date ON anomaly_events(tenant_id, event_date DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_records_tenant_period ON usage_records(tenant_id, metric_code, billing_period);

-- ===================== UPDATED_AT TRIGGER =====================
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'tenants','tenant_settings','users','user_profiles','roles','branches',
      'departments','data_sources','integration_connections','import_mappings',
      'data_import_jobs','customers','customer_segments','suppliers','products',
      'inventory','purchase_orders','sales','expenses','dashboard_configurations',
      'ai_conversations','subscriptions'
    ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;', tbl, tbl);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();', tbl, tbl);
  END LOOP;
END $$;

-- ===================== IMMUTABILITY TRIGGERS (Section 8.5 & 8.13) =====================
CREATE OR REPLACE FUNCTION fn_prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Table % is immutable: historical records cannot be modified or deleted. Record a reversal or adjustment event instead.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_movements_immutable ON inventory_movements;
CREATE TRIGGER trg_inventory_movements_immutable
  BEFORE UPDATE OR DELETE ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION fn_prevent_mutation();

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION fn_prevent_mutation();

-- ===================== AUDIT HASH CHAIN FUNCTION =====================
CREATE OR REPLACE FUNCTION fn_append_audit_log(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_actor_email VARCHAR,
  p_action VARCHAR,
  p_resource_type VARCHAR,
  p_resource_id VARCHAR,
  p_ip_address INET,
  p_user_agent TEXT,
  p_changes JSONB
) RETURNS BIGINT AS $$
DECLARE
  v_prev_hash CHAR(64);
  v_record_hash CHAR(64);
  v_id BIGINT;
  v_payload TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(918273645);
  SELECT record_hash INTO v_prev_hash FROM audit_logs ORDER BY id DESC LIMIT 1;
  IF v_prev_hash IS NULL THEN
    v_prev_hash := repeat('0', 64);
  END IF;

  v_payload := COALESCE(p_tenant_id::text, '') || '|' ||
               COALESCE(p_actor_user_id::text, '') || '|' ||
               COALESCE(p_action, '') || '|' ||
               COALESCE(p_resource_type, '') || '|' ||
               COALESCE(p_resource_id, '') || '|' ||
               COALESCE(p_changes::text, '{}') || '|' ||
               v_prev_hash;

  v_record_hash := encode(digest(v_payload, 'sha256'), 'hex');

  INSERT INTO audit_logs (
    tenant_id, actor_user_id, actor_email, action, resource_type,
    resource_id, ip_address, user_agent, changes, previous_hash, record_hash
  ) VALUES (
    p_tenant_id, p_actor_user_id, p_actor_email, p_action, p_resource_type,
    p_resource_id, p_ip_address, p_user_agent, COALESCE(p_changes, '{}'::jsonb), v_prev_hash, v_record_hash
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION fn_verify_audit_chain()
RETURNS TABLE (is_valid BOOLEAN, checked_records BIGINT, broken_at_id BIGINT) AS $$
DECLARE
  rec RECORD;
  v_expected_prev CHAR(64) := repeat('0', 64);
  v_calc_hash CHAR(64);
  v_count BIGINT := 0;
  v_payload TEXT;
BEGIN
  FOR rec IN SELECT * FROM audit_logs ORDER BY id ASC LOOP
    v_count := v_count + 1;
    IF rec.previous_hash <> v_expected_prev THEN
      RETURN QUERY SELECT FALSE, v_count, rec.id;
      RETURN;
    END IF;
    v_payload := COALESCE(rec.tenant_id::text, '') || '|' ||
                 COALESCE(rec.actor_user_id::text, '') || '|' ||
                 COALESCE(rec.action, '') || '|' ||
                 COALESCE(rec.resource_type, '') || '|' ||
                 COALESCE(rec.resource_id, '') || '|' ||
                 COALESCE(rec.changes::text, '{}') || '|' ||
                 rec.previous_hash;
    v_calc_hash := encode(digest(v_payload, 'sha256'), 'hex');
    IF rec.record_hash <> v_calc_hash THEN
      RETURN QUERY SELECT FALSE, v_count, rec.id;
      RETURN;
    END IF;
    v_expected_prev := rec.record_hash;
  END LOOP;
  RETURN QUERY SELECT TRUE, v_count, NULL::BIGINT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===================== INVENTORY BALANCE FUNCTION =====================
CREATE OR REPLACE FUNCTION fn_record_inventory_movement(
  p_tenant_id UUID,
  p_branch_id UUID,
  p_product_id UUID,
  p_movement_type VARCHAR,
  p_quantity_delta NUMERIC,
  p_unit_cost NUMERIC,
  p_reference_type VARCHAR,
  p_reference_id UUID,
  p_reason TEXT,
  p_created_by UUID
) RETURNS NUMERIC AS $$
DECLARE
  v_new_balance NUMERIC(12, 2);
BEGIN
  INSERT INTO inventory (tenant_id, branch_id, product_id, opening_quantity, on_hand_quantity)
  VALUES (p_tenant_id, p_branch_id, p_product_id, 0, 0)
  ON CONFLICT (tenant_id, branch_id, product_id) DO NOTHING;

  UPDATE inventory
  SET on_hand_quantity = on_hand_quantity + p_quantity_delta,
      updated_at = NOW()
  WHERE tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND product_id = p_product_id
  RETURNING on_hand_quantity INTO v_new_balance;

  INSERT INTO inventory_movements (
    tenant_id, branch_id, product_id, movement_type, quantity_delta,
    unit_cost, balance_after, reference_type, reference_id, reason, created_by
  ) VALUES (
    p_tenant_id, p_branch_id, p_product_id, p_movement_type, p_quantity_delta,
    COALESCE(p_unit_cost, 0), v_new_balance, p_reference_type, p_reference_id, p_reason, p_created_by
  );

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql;

-- ===================== BUSINESS KPI SUMMARY FUNCTION =====================
CREATE OR REPLACE FUNCTION fn_calculate_business_kpis(
  p_tenant_id UUID,
  p_branch_id UUID,
  p_start_date DATE,
  p_end_date DATE
) RETURNS TABLE (
  total_revenue NUMERIC(14,2),
  total_cogs NUMERIC(14,2),
  gross_profit NUMERIC(14,2),
  total_expenses NUMERIC(14,2),
  net_profit NUMERIC(14,2),
  order_count BIGINT,
  avg_order_value NUMERIC(14,2),
  active_customers BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH s AS (
    SELECT
      COALESCE(SUM(total_amount), 0)::NUMERIC(14,2) AS rev,
      COALESCE(SUM(cost_of_goods_sold), 0)::NUMERIC(14,2) AS cogs,
      COUNT(*)::BIGINT AS orders,
      COUNT(DISTINCT customer_id)::BIGINT AS custs
    FROM sales
    WHERE tenant_id = p_tenant_id
      AND payment_status NOT IN ('reversed', 'refunded')
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND (transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE BETWEEN p_start_date AND p_end_date
  ),
  e AS (
    SELECT COALESCE(SUM(amount), 0)::NUMERIC(14,2) AS exp
    FROM expenses
    WHERE tenant_id = p_tenant_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND expense_date BETWEEN p_start_date AND p_end_date
  )
  SELECT
    s.rev,
    s.cogs,
    (s.rev - s.cogs)::NUMERIC(14,2),
    e.exp,
    (s.rev - s.cogs - e.exp)::NUMERIC(14,2),
    s.orders,
    CASE WHEN s.orders > 0 THEN ROUND(s.rev / s.orders, 2) ELSE 0::NUMERIC(14,2) END,
    s.custs
  FROM s, e;
END;
$$ LANGUAGE plpgsql STABLE;

-- ===================== ANALYTICAL VIEWS (Section 9) =====================
CREATE OR REPLACE VIEW vw_daily_sales_summary WITH (security_invoker = true) AS
SELECT
  s.tenant_id,
  s.branch_id,
  b.name AS branch_name,
  (s.transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE AS sale_date,
  COUNT(*)::BIGINT AS order_count,
  COALESCE(SUM(s.subtotal), 0)::NUMERIC(14,2) AS gross_sales,
  COALESCE(SUM(s.discount_amount), 0)::NUMERIC(14,2) AS total_discounts,
  COALESCE(SUM(s.tax_amount), 0)::NUMERIC(14,2) AS total_tax,
  COALESCE(SUM(s.total_amount), 0)::NUMERIC(14,2) AS net_revenue,
  COALESCE(SUM(s.cost_of_goods_sold), 0)::NUMERIC(14,2) AS total_cogs,
  COALESCE(SUM(s.total_amount - s.cost_of_goods_sold), 0)::NUMERIC(14,2) AS gross_profit
FROM sales s
JOIN branches b ON b.tenant_id = s.tenant_id AND b.id = s.branch_id
WHERE s.payment_status NOT IN ('reversed', 'refunded')
GROUP BY s.tenant_id, s.branch_id, b.name, (s.transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE;

CREATE OR REPLACE VIEW vw_monthly_sales_summary WITH (security_invoker = true) AS
SELECT
  tenant_id,
  branch_id,
  branch_name,
  DATE_TRUNC('month', sale_date)::DATE AS sale_month,
  SUM(order_count)::BIGINT AS order_count,
  SUM(net_revenue)::NUMERIC(14,2) AS net_revenue,
  SUM(total_cogs)::NUMERIC(14,2) AS total_cogs,
  SUM(gross_profit)::NUMERIC(14,2) AS gross_profit
FROM vw_daily_sales_summary
GROUP BY tenant_id, branch_id, branch_name, DATE_TRUNC('month', sale_date)::DATE;

CREATE OR REPLACE VIEW vw_product_performance WITH (security_invoker = true) AS
SELECT
  si.tenant_id,
  p.id AS product_id,
  p.sku,
  p.name AS product_name,
  pc.name AS category_name,
  SUM(si.quantity)::NUMERIC(12,2) AS units_sold,
  SUM(si.line_total)::NUMERIC(14,2) AS total_revenue,
  SUM(si.quantity * si.unit_cost)::NUMERIC(14,2) AS total_cost,
  SUM(si.line_total - (si.quantity * si.unit_cost))::NUMERIC(14,2) AS gross_profit,
  CASE WHEN SUM(si.line_total) > 0
       THEN ROUND((SUM(si.line_total - (si.quantity * si.unit_cost)) / SUM(si.line_total)) * 100, 2)
       ELSE 0 END AS margin_pct
FROM sales_items si
JOIN sales s ON s.tenant_id = si.tenant_id AND s.id = si.sale_id
LEFT JOIN products p ON p.tenant_id = si.tenant_id AND p.id = si.product_id
LEFT JOIN product_categories pc ON pc.tenant_id = p.tenant_id AND pc.id = p.category_id
WHERE s.payment_status NOT IN ('reversed', 'refunded')
GROUP BY si.tenant_id, p.id, p.sku, p.name, pc.name;

CREATE OR REPLACE VIEW vw_branch_performance WITH (security_invoker = true) AS
SELECT
  b.tenant_id,
  b.id AS branch_id,
  b.code AS branch_code,
  b.name AS branch_name,
  b.city,
  COALESCE(rev.order_count, 0)::BIGINT AS order_count,
  COALESCE(rev.total_revenue, 0)::NUMERIC(14,2) AS total_revenue,
  COALESCE(rev.gross_profit, 0)::NUMERIC(14,2) AS gross_profit,
  COALESCE(exp.total_expenses, 0)::NUMERIC(14,2) AS total_expenses,
  (COALESCE(rev.gross_profit, 0) - COALESCE(exp.total_expenses, 0))::NUMERIC(14,2) AS net_contribution
FROM branches b
LEFT JOIN (
  SELECT tenant_id, branch_id, COUNT(*) AS order_count,
         SUM(total_amount) AS total_revenue,
         SUM(total_amount - cost_of_goods_sold) AS gross_profit
  FROM sales WHERE payment_status NOT IN ('reversed', 'refunded')
  GROUP BY tenant_id, branch_id
) rev ON rev.tenant_id = b.tenant_id AND rev.branch_id = b.id
LEFT JOIN (
  SELECT tenant_id, branch_id, SUM(amount) AS total_expenses
  FROM expenses GROUP BY tenant_id, branch_id
) exp ON exp.tenant_id = b.tenant_id AND exp.branch_id = b.id;

CREATE OR REPLACE VIEW vw_inventory_status WITH (security_invoker = true) AS
SELECT
  i.tenant_id,
  i.branch_id,
  b.name AS branch_name,
  p.id AS product_id,
  p.sku,
  p.name AS product_name,
  pc.name AS category_name,
  i.on_hand_quantity,
  i.reserved_quantity,
  i.available_quantity,
  p.reorder_level,
  p.cost_price,
  p.selling_price,
  (i.on_hand_quantity * p.cost_price)::NUMERIC(14,2) AS inventory_value_cost,
  CASE
    WHEN i.available_quantity <= 0 THEN 'stockout'
    WHEN i.available_quantity <= p.reorder_level THEN 'low_stock'
    ELSE 'healthy'
  END AS stock_status
FROM inventory i
JOIN branches b ON b.tenant_id = i.tenant_id AND b.id = i.branch_id
JOIN products p ON p.tenant_id = i.tenant_id AND p.id = i.product_id
LEFT JOIN product_categories pc ON pc.tenant_id = p.tenant_id AND pc.id = p.category_id;

CREATE OR REPLACE VIEW vw_customer_purchase_summary WITH (security_invoker = true) AS
SELECT
  c.tenant_id,
  c.id AS customer_id,
  c.full_name,
  c.phone_number,
  c.email,
  c.preferred_channel,
  c.marketing_opt_in,
  COUNT(s.id)::BIGINT AS total_orders,
  COALESCE(SUM(s.total_amount), 0)::NUMERIC(14,2) AS lifetime_value,
  MAX(s.transaction_date) AS last_purchase_at,
  EXTRACT(DAY FROM (NOW() - MAX(s.transaction_date)))::INTEGER AS days_since_last_purchase
FROM customers c
LEFT JOIN sales s ON s.tenant_id = c.tenant_id AND s.customer_id = c.id AND s.payment_status NOT IN ('reversed', 'refunded')
GROUP BY c.tenant_id, c.id, c.full_name, c.phone_number, c.email, c.preferred_channel, c.marketing_opt_in;

CREATE OR REPLACE VIEW vw_expense_summary WITH (security_invoker = true) AS
SELECT
  e.tenant_id,
  e.branch_id,
  ec.name AS category_name,
  ec.category_type,
  DATE_TRUNC('month', e.expense_date)::DATE AS expense_month,
  COUNT(*)::BIGINT AS entry_count,
  SUM(e.amount)::NUMERIC(14,2) AS total_amount
FROM expenses e
LEFT JOIN expense_categories ec ON ec.tenant_id = e.tenant_id AND ec.id = e.category_id
GROUP BY e.tenant_id, e.branch_id, ec.name, ec.category_type, DATE_TRUNC('month', e.expense_date)::DATE;

CREATE OR REPLACE VIEW vw_cashflow_reporting WITH (security_invoker = true) AS
SELECT
  ct.tenant_id,
  ct.branch_id,
  DATE_TRUNC('day', ct.transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE AS tx_date,
  ct.record_status,
  SUM(CASE WHEN ct.direction = 'inflow' THEN ct.amount ELSE 0 END)::NUMERIC(14,2) AS total_inflow,
  SUM(CASE WHEN ct.direction = 'outflow' THEN ct.amount ELSE 0 END)::NUMERIC(14,2) AS total_outflow,
  SUM(CASE WHEN ct.direction = 'inflow' THEN ct.amount ELSE -ct.amount END)::NUMERIC(14,2) AS net_cashflow
FROM cash_transactions ct
GROUP BY ct.tenant_id, ct.branch_id, DATE_TRUNC('day', ct.transaction_date AT TIME ZONE 'Africa/Nairobi')::DATE, ct.record_status;

CREATE OR REPLACE VIEW vw_stock_movement_summary WITH (security_invoker = true) AS
SELECT
  tenant_id,
  branch_id,
  product_id,
  movement_type,
  COUNT(*)::BIGINT AS event_count,
  SUM(quantity_delta)::NUMERIC(12,2) AS net_quantity_change,
  MAX(occurred_at) AS last_movement_at
FROM inventory_movements
GROUP BY tenant_id, branch_id, product_id, movement_type;

CREATE OR REPLACE VIEW vw_subscription_usage WITH (security_invoker = true) AS
SELECT
  s.tenant_id,
  sp.code AS plan_code,
  sp.name AS plan_name,
  sp.monthly_price_kes,
  s.status AS subscription_status,
  uq.metric_code,
  uq.quota_limit,
  uq.current_usage,
  uq.period_start
FROM subscriptions s
JOIN subscription_plans sp ON sp.id = s.plan_id
LEFT JOIN usage_quotas uq ON uq.tenant_id = s.tenant_id AND uq.period_start = DATE_TRUNC('month', NOW())::DATE;

-- Materialized view for fast multi-branch daily analytics (refreshed on import commit & schedule)
DROP MATERIALIZED VIEW IF EXISTS mv_tenant_daily_analytics;
CREATE MATERIALIZED VIEW mv_tenant_daily_analytics AS
SELECT
  tenant_id,
  branch_id,
  sale_date,
  order_count,
  net_revenue,
  total_cogs,
  gross_profit,
  NOW() AS refreshed_at
FROM vw_daily_sales_summary;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_tenant_daily_analytics_pk
  ON mv_tenant_daily_analytics(tenant_id, branch_id, sale_date);

INSERT INTO schema_migrations (version, description)
VALUES ('005', 'Composite indexes, views, materialized views, PL/pgSQL functions and immutability triggers')
ON CONFLICT (version) DO NOTHING;
