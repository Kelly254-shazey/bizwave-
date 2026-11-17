-- BizWave Migration 003: Customers/CRM (8.7), Products/Inventory (8.5), Sales (8.4), Financial Tables (8.6)
-- Exact NUMERIC(14,2) financial arithmetic | Immutable inventory movements | Idempotent source provenance

-- ===================== CUSTOMERS & CRM (8.7) =====================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID,
  external_ref VARCHAR(120),
  customer_code VARCHAR(64),
  full_name VARCHAR(180) NOT NULL,
  email VARCHAR(255),
  phone_number VARCHAR(32),
  preferred_language VARCHAR(8) NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en', 'sw')),
  preferred_channel VARCHAR(24) NOT NULL DEFAULT 'sms' CHECK (preferred_channel IN ('sms', 'whatsapp', 'voice', 'ussd', 'email')),
  acquisition_source VARCHAR(64) DEFAULT 'walk_in',
  marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'churn_risk', 'anonymized')),
  notes TEXT,
  import_job_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, external_ref),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, import_job_id) REFERENCES data_import_jobs(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS customer_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  contact_type VARCHAR(24) NOT NULL CHECK (contact_type IN ('phone', 'whatsapp', 'email')),
  contact_value VARCHAR(255) NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  label VARCHAR(64) DEFAULT 'Primary',
  street_address TEXT,
  city VARCHAR(100) DEFAULT 'Nairobi',
  county VARCHAR(100) DEFAULT 'Nairobi',
  country_code CHAR(2) DEFAULT 'KE',
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customer_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_dynamic BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS customer_segment_members (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  rfm_score JSONB NOT NULL DEFAULT '{}'::jsonb,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, segment_id, customer_id),
  FOREIGN KEY (tenant_id, segment_id) REFERENCES customer_segments(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customer_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  branch_id UUID,
  channel VARCHAR(24) NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'voice', 'ussd', 'in_store', 'email')),
  direction VARCHAR(16) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  summary TEXT NOT NULL,
  handled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS customer_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID,
  branch_id UUID,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  channel VARCHAR(24) DEFAULT 'sms',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS customer_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  channel VARCHAR(24) NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'voice', 'ussd', 'email')),
  purpose VARCHAR(48) NOT NULL CHECK (purpose IN ('marketing', 'transactional', 'service_alerts', 'analytics')),
  status VARCHAR(24) NOT NULL CHECK (status IN ('granted', 'revoked', 'pending')),
  legal_basis VARCHAR(64) NOT NULL DEFAULT 'kenya_dpa_2019_consent',
  source VARCHAR(64) NOT NULL DEFAULT 'portal',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  UNIQUE (tenant_id, customer_id, channel, purpose),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customer_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(64) NOT NULL,
  color VARCHAR(7) DEFAULT '#0D9488',
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS customer_tag_assignments (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  tag_id UUID NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, customer_id, tag_id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, tag_id) REFERENCES customer_tags(tenant_id, id) ON DELETE CASCADE
);

-- ===================== PRODUCTS & INVENTORY (8.5) =====================
CREATE TABLE IF NOT EXISTS product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  parent_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, name),
  FOREIGN KEY (tenant_id, parent_id) REFERENCES product_categories(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS product_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(24) NOT NULL,
  name VARCHAR(64) NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  contact_name VARCHAR(120),
  phone_number VARCHAR(32),
  email VARCHAR(255),
  lead_time_days INTEGER NOT NULL DEFAULT 3 CHECK (lead_time_days >= 0),
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id UUID,
  unit_id UUID,
  supplier_id UUID,
  sku VARCHAR(64) NOT NULL,
  barcode VARCHAR(64),
  name VARCHAR(180) NOT NULL,
  description TEXT,
  cost_price NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  selling_price NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 16.00 CHECK (tax_rate BETWEEN 0 AND 100),
  reorder_level NUMERIC(12, 2) NOT NULL DEFAULT 10 CHECK (reorder_level >= 0),
  reorder_quantity NUMERIC(12, 2) NOT NULL DEFAULT 25 CHECK (reorder_quantity >= 0),
  track_inventory BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  import_job_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, sku),
  FOREIGN KEY (tenant_id, category_id) REFERENCES product_categories(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, unit_id) REFERENCES product_units(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, import_job_id) REFERENCES data_import_jobs(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  sku VARCHAR(64) NOT NULL,
  variant_name VARCHAR(120) NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  cost_price NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  selling_price NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, sku),
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE CASCADE
);

-- Current stock balances: available_quantity = GREATEST(0, on_hand_quantity - reserved_quantity)
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  product_id UUID NOT NULL,
  variant_id UUID,
  opening_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0,
  on_hand_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0,
  reserved_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  available_quantity NUMERIC(12, 2) GENERATED ALWAYS AS (on_hand_quantity - reserved_quantity) STORED,
  last_counted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, branch_id, product_id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, variant_id) REFERENCES product_variants(tenant_id, id) ON DELETE SET NULL
);

-- Auditable IMMUTABLE stock ledger (protected by trigger against UPDATE/DELETE)
CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  product_id UUID NOT NULL,
  movement_type VARCHAR(32) NOT NULL CHECK (movement_type IN ('opening', 'purchase', 'sale', 'return', 'transfer_in', 'transfer_out', 'adjustment')),
  quantity_delta NUMERIC(12, 2) NOT NULL CHECK (quantity_delta <> 0),
  unit_cost NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  balance_after NUMERIC(12, 2) NOT NULL,
  reference_type VARCHAR(48),
  reference_id UUID,
  reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  product_id UUID NOT NULL,
  adjustment_quantity NUMERIC(12, 2) NOT NULL CHECK (adjustment_quantity <> 0),
  reason_code VARCHAR(48) NOT NULL CHECK (reason_code IN ('damaged', 'expired', 'shrinkage', 'recount', 'reversal', 'other')),
  notes TEXT,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  supplier_id UUID NOT NULL,
  po_number VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ordered', 'partially_received', 'received', 'cancelled')),
  expected_delivery_date DATE,
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, po_number),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL,
  product_id UUID NOT NULL,
  ordered_quantity NUMERIC(12, 2) NOT NULL CHECK (ordered_quantity > 0),
  received_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  unit_cost NUMERIC(14, 2) NOT NULL CHECK (unit_cost >= 0),
  line_total NUMERIC(14, 2) NOT NULL CHECK (line_total >= 0),
  FOREIGN KEY (tenant_id, purchase_order_id) REFERENCES purchase_orders(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS goods_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  purchase_order_id UUID NOT NULL,
  receipt_number VARCHAR(64) NOT NULL,
  received_by UUID REFERENCES users(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, receipt_number),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, purchase_order_id) REFERENCES purchase_orders(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reorder_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  product_id UUID NOT NULL,
  min_stock_level NUMERIC(12, 2) NOT NULL CHECK (min_stock_level >= 0),
  target_stock_level NUMERIC(12, 2) NOT NULL CHECK (target_stock_level >= min_stock_level),
  lead_time_days INTEGER NOT NULL DEFAULT 3 CHECK (lead_time_days >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, branch_id, product_id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stock_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  product_id UUID NOT NULL,
  alert_type VARCHAR(32) NOT NULL CHECK (alert_type IN ('low_stock', 'stockout', 'overstock', 'depletion_risk')),
  severity VARCHAR(16) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  current_quantity NUMERIC(12, 2) NOT NULL,
  threshold_quantity NUMERIC(12, 2) NOT NULL,
  predicted_days_left INTEGER,
  status VARCHAR(24) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE CASCADE
);

-- ===================== SALES (8.4) =====================
CREATE TABLE IF NOT EXISTS sales_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(48) NOT NULL,
  name VARCHAR(96) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  customer_id UUID,
  channel_id UUID,
  transaction_ref VARCHAR(120) NOT NULL,
  source_system VARCHAR(48) NOT NULL DEFAULT 'manual',
  source_record_id VARCHAR(128),
  import_job_id UUID,
  transaction_date TIMESTAMPTZ NOT NULL,
  payment_status VARCHAR(24) NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('paid', 'partial', 'unpaid', 'refunded', 'reversed')),
  currency_code CHAR(3) NOT NULL DEFAULT 'KES',
  subtotal NUMERIC(14, 2) NOT NULL CHECK (subtotal >= 0),
  discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount NUMERIC(14, 2) NOT NULL CHECK (total_amount >= 0),
  cost_of_goods_sold NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (cost_of_goods_sold >= 0),
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, transaction_ref),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, channel_id) REFERENCES sales_channels(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, import_job_id) REFERENCES data_import_jobs(tenant_id, id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_source_idempotency
  ON sales(tenant_id, source_system, source_record_id)
  WHERE source_record_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS sales_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL,
  product_id UUID,
  product_name_snapshot VARCHAR(180) NOT NULL,
  sku_snapshot VARCHAR(64),
  quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
  unit_cost NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  line_total NUMERIC(14, 2) NOT NULL CHECK (line_total >= 0),
  FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sales_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL,
  payment_method VARCHAR(32) NOT NULL CHECK (payment_method IN ('mpesa', 'cash', 'card', 'bank_transfer', 'credit')),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  external_reference VARCHAR(120),
  reconciliation_status VARCHAR(24) NOT NULL DEFAULT 'recorded' CHECK (reconciliation_status IN ('recorded', 'reconciled', 'disputed')),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sales_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  return_ref VARCHAR(120) NOT NULL,
  reason TEXT NOT NULL,
  refund_amount NUMERIC(14, 2) NOT NULL CHECK (refund_amount >= 0),
  processed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  returned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, return_ref),
  FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS sales_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sales_return_id UUID NOT NULL,
  product_id UUID,
  quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
  refund_amount NUMERIC(14, 2) NOT NULL CHECK (refund_amount >= 0),
  FOREIGN KEY (tenant_id, sales_return_id) REFERENCES sales_returns(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sales_tax_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL,
  tax_code VARCHAR(32) NOT NULL DEFAULT 'VAT_16',
  taxable_amount NUMERIC(14, 2) NOT NULL CHECK (taxable_amount >= 0),
  tax_rate NUMERIC(5, 2) NOT NULL CHECK (tax_rate >= 0),
  tax_amount NUMERIC(14, 2) NOT NULL CHECK (tax_amount >= 0),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, sale_id) REFERENCES sales(tenant_id, id) ON DELETE CASCADE
);

-- ===================== FINANCIAL TABLES (8.6) =====================
CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(96) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  category_type VARCHAR(32) NOT NULL DEFAULT 'operating' CHECK (category_type IN ('operating', 'cogs', 'payroll', 'rent', 'utilities', 'marketing', 'tax', 'other')),
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  category_id UUID,
  expense_ref VARCHAR(120) NOT NULL,
  vendor_name VARCHAR(160),
  description TEXT NOT NULL,
  expense_date DATE NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'KES',
  payment_method VARCHAR(32) NOT NULL DEFAULT 'mpesa',
  reconciliation_status VARCHAR(24) NOT NULL DEFAULT 'recorded' CHECK (reconciliation_status IN ('recorded', 'reconciled', 'estimated')),
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  import_job_id UUID,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, expense_ref),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, category_id) REFERENCES expense_categories(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, import_job_id) REFERENCES data_import_jobs(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS expense_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expense_id UUID NOT NULL,
  external_ref VARCHAR(120),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, expense_id) REFERENCES expenses(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cash_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID,
  name VARCHAR(140) NOT NULL,
  account_type VARCHAR(32) NOT NULL CHECK (account_type IN ('mpesa_till', 'mpesa_paybill', 'bank', 'petty_cash')),
  account_number_masked VARCHAR(64),
  currency_code CHAR(3) NOT NULL DEFAULT 'KES',
  opening_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  is_verified_bank_feed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS cash_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cash_account_id UUID NOT NULL,
  branch_id UUID,
  direction VARCHAR(16) NOT NULL CHECK (direction IN ('inflow', 'outflow')),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  mpesa_receipt_no VARCHAR(64),
  counterparty VARCHAR(160),
  transaction_date TIMESTAMPTZ NOT NULL,
  record_status VARCHAR(24) NOT NULL DEFAULT 'recorded' CHECK (record_status IN ('recorded', 'reconciled', 'estimated')),
  matched_sale_id UUID,
  matched_expense_id UUID,
  import_job_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, cash_account_id) REFERENCES cash_accounts(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, matched_sale_id) REFERENCES sales(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, matched_expense_id) REFERENCES expenses(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, import_job_id) REFERENCES data_import_jobs(tenant_id, id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_mpesa_receipt
  ON cash_transactions(tenant_id, mpesa_receipt_no)
  WHERE mpesa_receipt_no IS NOT NULL;

CREATE TABLE IF NOT EXISTS receivables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID,
  customer_id UUID,
  invoice_ref VARCHAR(96) NOT NULL,
  amount_due NUMERIC(14, 2) NOT NULL CHECK (amount_due > 0),
  amount_paid NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  due_date DATE NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partial', 'paid', 'overdue', 'written_off')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, invoice_ref),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS payables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID,
  supplier_id UUID,
  bill_ref VARCHAR(96) NOT NULL,
  description TEXT NOT NULL,
  amount_due NUMERIC(14, 2) NOT NULL CHECK (amount_due > 0),
  amount_paid NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  due_date DATE NOT NULL,
  is_confirmed_obligation BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(24) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partial', 'paid', 'overdue')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, bill_ref),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS financial_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(64) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  CHECK (end_date >= start_date),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  financial_period_id UUID NOT NULL,
  branch_id UUID,
  name VARCHAR(120) NOT NULL,
  total_budget NUMERIC(14, 2) NOT NULL CHECK (total_budget >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, financial_period_id) REFERENCES financial_periods(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS budget_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  budget_id UUID NOT NULL,
  expense_category_id UUID,
  allocated_amount NUMERIC(14, 2) NOT NULL CHECK (allocated_amount >= 0),
  FOREIGN KEY (tenant_id, budget_id) REFERENCES budgets(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, expense_category_id) REFERENCES expense_categories(tenant_id, id) ON DELETE SET NULL
);

INSERT INTO schema_migrations (version, description)
VALUES ('003', 'CRM, products/inventory, sales and financial tables')
ON CONFLICT (version) DO NOTHING;
