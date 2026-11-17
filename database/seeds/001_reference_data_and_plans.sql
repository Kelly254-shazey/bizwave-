-- BizWave Seed 001: Reference Data, Industry Templates, 14 RBAC Roles, Permissions Matrix, Plans & Providers

-- ===================== 6 INDUSTRY WORKSPACE TEMPLATES =====================
INSERT INTO business_industries (
  code, name, name_sw, description, default_widgets, default_kpis,
  recommended_mappings, recommended_reports, suggested_questions_en, suggested_questions_sw, forecast_defaults
) VALUES
(
  'retail', 'Retail & Supermarkets', 'Biashara ya Rejareja',
  'Fast-moving consumer goods, mini-marts, pharmacies, boutiques and multi-branch shops.',
  '["kpi_summary","revenue_trend","top_products","inventory_alerts","branch_comparison","payment_mix"]'::jsonb,
  '["total_revenue","gross_profit","avg_order_value","stockout_rate","inventory_turnover","net_profit"]'::jsonb,
  '{"sales":["transaction_ref","transaction_date","product_sku","quantity","unit_price","payment_method","branch_code"],"inventory":["sku","name","cost_price","selling_price","on_hand_quantity","reorder_level"]}'::jsonb,
  '["sales_summary","inventory_valuation","branch_comparison","cashflow_statement"]'::jsonb,
  '["Why did my sales decrease this week?","Which products generate the highest profit?","Which products are likely to run out of stock?","Which branch is performing best?","How much cash might I need next month?"]'::jsonb,
  '["Kwa nini mauzo yangu yalipungua wiki hii?","Ni bidhaa zipi zinazalisha faida kubwa zaidi?","Ni bidhaa zipi zinakaribia kuisha stoo?","Ni tawi lipi linafanya vizuri zaidi?","Nitahitaji pesa kiasi gani mwezi ujao?"]'::jsonb,
  '{"horizon_days":30,"seasonality":"weekly","lead_time_days":3}'::jsonb
),
(
  'restaurant', 'Restaurants & Cafes', 'Migahawa na Mikahawa',
  'Restaurants, nyama choma joints, coffee houses, bakeries and food delivery kitchens.',
  '["kpi_summary","revenue_trend","top_products","expense_breakdown","peak_days","cashflow_pulse"]'::jsonb,
  '["total_revenue","gross_profit","food_cost_ratio","avg_order_value","total_expenses","net_profit"]'::jsonb,
  '{"sales":["transaction_ref","transaction_date","menu_item","quantity","unit_price","channel","payment_method"],"expenses":["expense_ref","expense_date","category","vendor","amount"]}'::jsonb,
  '["sales_summary","expense_ledger","cashflow_statement"]'::jsonb,
  '["Which menu items generate the highest profit?","Why did my sales decrease this week?","What are my biggest expense categories?","How much cash might I need next month?","Which customers have stopped purchasing?"]'::jsonb,
  '["Ni vyakula vipi vina faida kubwa zaidi?","Kwa nini mauzo yalishuka wiki hii?","Matumizi yangu makubwa ni yapi?","Nitahitaji fedha kiasi gani mwezi ujao?"]'::jsonb,
  '{"horizon_days":14,"seasonality":"weekly","lead_time_days":2}'::jsonb
),
(
  'wholesale', 'Wholesale & Distribution', 'Jumla na Usambazaji',
  'Distributors, hardware depots, agro-dealers and B2B suppliers serving regional stockists.',
  '["kpi_summary","revenue_trend","branch_comparison","inventory_alerts","top_customers","receivables_aging"]'::jsonb,
  '["total_revenue","gross_profit","avg_order_value","order_volume","inventory_value","net_profit"]'::jsonb,
  '{"sales":["invoice_ref","transaction_date","customer_name","sku","quantity","unit_price","payment_status"]}'::jsonb,
  '["sales_summary","inventory_valuation","customer_insights","cashflow_statement"]'::jsonb,
  '["Which customers have stopped purchasing?","Which products are likely to run out of stock?","Which branch is performing best?","How much cash might I need next month?"]'::jsonb,
  '["Ni wateja wepi wameacha kununua?","Ni bidhaa zipi zinakaribia kuisha stoo?","Tawi lipi linaongoza kwa mauzo?"]'::jsonb,
  '{"horizon_days":45,"seasonality":"monthly","lead_time_days":7}'::jsonb
),
(
  'salon', 'Salons & Wellness', 'Saluni na Urembo',
  'Hair salons, barbershops, spas and beauty studios managing services and retail products.',
  '["kpi_summary","revenue_trend","top_products","customer_retention","expense_breakdown"]'::jsonb,
  '["total_revenue","order_volume","avg_order_value","active_customers","net_profit"]'::jsonb,
  '{"sales":["receipt_no","transaction_date","service_name","amount","customer_phone","payment_method"]}'::jsonb,
  '["sales_summary","customer_insights","expense_ledger"]'::jsonb,
  '["Which customers have stopped purchasing?","Which services generate the highest profit?","What should I do to improve revenue?"]'::jsonb,
  '["Ni wateja wepi hawajarudi hivi karibuni?","Ni huduma zipi zina faida kubwa?","Nifanye nini kuongeza mapato?"]'::jsonb,
  '{"horizon_days":21,"seasonality":"weekly","lead_time_days":3}'::jsonb
),
(
  'professional_services', 'Professional Services', 'Huduma za Kitaalamu',
  'Consultancies, agencies, clinics, legal practices and accounting firms.',
  '["kpi_summary","revenue_trend","expense_breakdown","cashflow_pulse","top_customers"]'::jsonb,
  '["total_revenue","total_expenses","net_profit","avg_order_value","active_customers"]'::jsonb,
  '{"sales":["invoice_ref","invoice_date","client_name","service_name","amount","payment_status"]}'::jsonb,
  '["sales_summary","expense_ledger","cashflow_statement","customer_insights"]'::jsonb,
  '["How much cash might I need next month?","What are my biggest expense categories?","Which customers have stopped purchasing?","What should I do to improve revenue?"]'::jsonb,
  '["Nitahitaji fedha kiasi gani mwezi ujao?","Gharama kubwa zaidi ni zipi?","Nifanye nini kuongeza mapato?"]'::jsonb,
  '{"horizon_days":60,"seasonality":"monthly","lead_time_days":0}'::jsonb
),
(
  'general_sme', 'General SME', 'Biashara Ndogo na za Kati',
  'Flexible multi-purpose workspace tailored for growing Kenyan enterprises.',
  '["kpi_summary","revenue_trend","top_products","expense_breakdown","inventory_alerts","branch_comparison"]'::jsonb,
  '["total_revenue","total_expenses","gross_profit","net_profit","order_volume","avg_order_value"]'::jsonb,
  '{"sales":["transaction_ref","transaction_date","item_name","quantity","total_amount","payment_method"]}'::jsonb,
  '["sales_summary","expense_ledger","inventory_valuation","customer_insights"]'::jsonb,
  '["Why did my sales decrease this week?","Which products generate the highest profit?","Which products are likely to run out of stock?","What should I do to improve revenue?"]'::jsonb,
  '["Kwa nini mauzo yangu yalipungua wiki hii?","Ni bidhaa zipi zinazalisha faida kubwa?","Nifanye nini kuboresha mapato?"]'::jsonb,
  '{"horizon_days":30,"seasonality":"weekly","lead_time_days":3}'::jsonb
)
ON CONFLICT (code) DO NOTHING;

-- ===================== METRIC DEFINITIONS (DOCUMENTED FORMULAS) =====================
INSERT INTO metric_definitions (tenant_id, code, version, name, name_sw, formula_description, source_tables, unit) VALUES
(NULL, 'total_revenue', 1, 'Total Revenue', 'Jumla ya Mapato', 'SUM(sales.total_amount) excluding reversed/refunded transactions in selected period & branch scope.', '["sales"]'::jsonb, 'KES'),
(NULL, 'total_expenses', 1, 'Total Expenses', 'Jumla ya Matumizi', 'SUM(expenses.amount) recorded in selected period & branch scope.', '["expenses"]'::jsonb, 'KES'),
(NULL, 'gross_profit', 1, 'Gross Profit', 'Faida Ghafi', 'SUM(sales.total_amount - sales.cost_of_goods_sold) for non-reversed sales.', '["sales","sales_items"]'::jsonb, 'KES'),
(NULL, 'net_profit', 1, 'Net Profit', 'Faida Halisi', 'Gross Profit - Total Operating Expenses (reported only when both sales COGS and expenses are present).', '["sales","expenses"]'::jsonb, 'KES'),
(NULL, 'order_volume', 1, 'Order Volume', 'Idadi ya Oda', 'COUNT(sales.id) excluding reversed/refunded sales.', '["sales"]'::jsonb, 'orders'),
(NULL, 'avg_order_value', 1, 'Average Order Value', 'Wastani wa Oda', 'Total Revenue / Order Volume (0 if no orders).', '["sales"]'::jsonb, 'KES')
ON CONFLICT (tenant_id, code, version) DO NOTHING;

-- ===================== 14 RBAC ROLES (Section 6) =====================
INSERT INTO roles (tenant_id, code, name, scope, description, is_system) VALUES
(NULL, 'platform_super_admin', 'Platform Super Administrator', 'platform', 'Full platform governance, tenant lifecycle, and cross-tenant emergency audit access.', TRUE),
(NULL, 'platform_support_admin', 'Platform Support Administrator', 'platform', 'Tenant support diagnostics and controlled customer onboarding assistance.', TRUE),
(NULL, 'platform_analyst', 'Platform Analyst', 'platform', 'Aggregated anonymized platform telemetry and model governance.', TRUE),
(NULL, 'business_owner', 'Business Owner', 'business', 'Consolidated visibility across all business branches, financials, billing, and governance.', TRUE),
(NULL, 'business_admin', 'Business Administrator', 'business', 'Organization configuration, user/role administration, integrations, and branches.', TRUE),
(NULL, 'business_manager', 'Business Manager', 'business', 'Operational performance, sales, inventory alerts, analytics, and team oversight.', TRUE),
(NULL, 'branch_manager', 'Branch Manager', 'business', 'Operational control strictly scoped to assigned branches.', TRUE),
(NULL, 'finance_officer', 'Finance Officer', 'business', 'Revenue, expenses, M-Pesa reconciliation, financial reports, and cash-flow projections.', TRUE),
(NULL, 'inventory_manager', 'Inventory Manager', 'business', 'Products, stock levels, immutable stock movements, reorder alerts, and demand forecasts.', TRUE),
(NULL, 'sales_manager', 'Sales Manager', 'business', 'Sales analytics, branch sales performance, and revenue forecasting.', TRUE),
(NULL, 'marketing_officer', 'Marketing Officer', 'business', 'Customer segments, consent-verified campaigns, and engagement reports.', TRUE),
(NULL, 'customer_service_agent', 'Customer Service Agent', 'business', 'Authorized customer directory, interaction logs, and transactional messaging.', TRUE),
(NULL, 'staff_member', 'Staff Member', 'business', 'Frontline sales recording and basic branch lookup.', TRUE),
(NULL, 'read_only_auditor', 'Read-Only Auditor', 'business', 'Read-only inspection of analytics, reports, financial records, and audit logs.', TRUE)
ON CONFLICT DO NOTHING;

-- ===================== GRANULAR PERMISSIONS =====================
INSERT INTO permissions (code, module, action, description) VALUES
('org:read', 'organizations', 'read', 'View organization profile and settings'),
('org:manage', 'organizations', 'manage', 'Update organization profile, branding and workspace template'),
('branches:read', 'branches', 'read', 'View branches'),
('branches:manage', 'branches', 'manage', 'Create, update or archive branches'),
('users:read', 'users', 'read', 'View team members and roles'),
('users:manage', 'users', 'manage', 'Invite users, assign roles and manage branch access'),
('imports:read', 'imports', 'read', 'View data sources and import history'),
('imports:manage', 'imports', 'manage', 'Upload, map, validate and commit business data imports'),
('sales:read', 'sales', 'read', 'View sales transactions and sales analytics'),
('sales:write', 'sales', 'write', 'Create sales and process traceable returns'),
('inventory:read', 'inventory', 'read', 'View products, stock balances and stock movements'),
('inventory:write', 'inventory', 'write', 'Manage products and record stock adjustments'),
('finance:read', 'finance', 'read', 'View expenses, cash accounts and M-Pesa reconciliation'),
('finance:write', 'finance', 'write', 'Record expenses and reconcile cash transactions'),
('customers:read', 'customers', 'read', 'View customer profiles and purchase history'),
('customers:write', 'customers', 'write', 'Create/update customers and manage consent records'),
('analytics:read', 'analytics', 'read', 'Access BizWave Analytics dashboards and KPIs'),
('reports:read', 'reports', 'read', 'View and export reports'),
('reports:manage', 'reports', 'manage', 'Create and schedule recurring reports'),
('predict:sales', 'predict', 'sales', 'Run and view sales forecasts and anomalies'),
('predict:demand', 'predict', 'demand', 'Run and view inventory demand and depletion forecasts'),
('predict:cashflow', 'predict', 'cashflow', 'Run and view cash-flow projections'),
('ai:use', 'ai', 'use', 'Query BizWave AI business assistant'),
('connect:read', 'connect', 'read', 'View communication channels, templates, campaigns and logs'),
('connect:send', 'connect', 'send', 'Send messages and launch consent-checked campaigns'),
('connect:manage', 'connect', 'manage', 'Configure communication providers and templates'),
('billing:read', 'billing', 'read', 'View subscription plan, invoices and usage quotas'),
('billing:manage', 'billing', 'manage', 'Change plans and manage add-ons'),
('audit:read', 'audit', 'read', 'Inspect immutable audit logs and compliance records'),
('platform:admin', 'platform', 'admin', 'Platform-level administration and system health')
ON CONFLICT (code) DO NOTHING;

-- Map permissions to roles
WITH mapping(role_code, perm_code) AS (
  VALUES
  -- Platform Super Admin gets everything
  ('platform_super_admin','org:read'),('platform_super_admin','org:manage'),('platform_super_admin','branches:read'),('platform_super_admin','branches:manage'),
  ('platform_super_admin','users:read'),('platform_super_admin','users:manage'),('platform_super_admin','imports:read'),('platform_super_admin','imports:manage'),
  ('platform_super_admin','sales:read'),('platform_super_admin','sales:write'),('platform_super_admin','inventory:read'),('platform_super_admin','inventory:write'),
  ('platform_super_admin','finance:read'),('platform_super_admin','finance:write'),('platform_super_admin','customers:read'),('platform_super_admin','customers:write'),
  ('platform_super_admin','analytics:read'),('platform_super_admin','reports:read'),('platform_super_admin','reports:manage'),
  ('platform_super_admin','predict:sales'),('platform_super_admin','predict:demand'),('platform_super_admin','predict:cashflow'),
  ('platform_super_admin','ai:use'),('platform_super_admin','connect:read'),('platform_super_admin','connect:send'),('platform_super_admin','connect:manage'),
  ('platform_super_admin','billing:read'),('platform_super_admin','billing:manage'),('platform_super_admin','audit:read'),('platform_super_admin','platform:admin'),

  -- Business Owner gets all business permissions (NOT platform:admin)
  ('business_owner','org:read'),('business_owner','org:manage'),('business_owner','branches:read'),('business_owner','branches:manage'),
  ('business_owner','users:read'),('business_owner','users:manage'),('business_owner','imports:read'),('business_owner','imports:manage'),
  ('business_owner','sales:read'),('business_owner','sales:write'),('business_owner','inventory:read'),('business_owner','inventory:write'),
  ('business_owner','finance:read'),('business_owner','finance:write'),('business_owner','customers:read'),('business_owner','customers:write'),
  ('business_owner','analytics:read'),('business_owner','reports:read'),('business_owner','reports:manage'),
  ('business_owner','predict:sales'),('business_owner','predict:demand'),('business_owner','predict:cashflow'),
  ('business_owner','ai:use'),('business_owner','connect:read'),('business_owner','connect:send'),('business_owner','connect:manage'),
  ('business_owner','billing:read'),('business_owner','billing:manage'),('business_owner','audit:read'),

  -- Business Admin
  ('business_admin','org:read'),('business_admin','org:manage'),('business_admin','branches:read'),('business_admin','branches:manage'),
  ('business_admin','users:read'),('business_admin','users:manage'),('business_admin','imports:read'),('business_admin','imports:manage'),
  ('business_admin','sales:read'),('business_admin','inventory:read'),('business_admin','finance:read'),('business_admin','customers:read'),
  ('business_admin','analytics:read'),('business_admin','reports:read'),('business_admin','reports:manage'),
  ('business_admin','predict:sales'),('business_admin','predict:demand'),('business_admin','ai:use'),
  ('business_admin','connect:read'),('business_admin','connect:manage'),('business_admin','billing:read'),('business_admin','audit:read'),

  -- Business Manager
  ('business_manager','org:read'),('business_manager','branches:read'),('business_manager','users:read'),
  ('business_manager','imports:read'),('business_manager','imports:manage'),('business_manager','sales:read'),('business_manager','sales:write'),
  ('business_manager','inventory:read'),('business_manager','inventory:write'),('business_manager','finance:read'),('business_manager','customers:read'),
  ('business_manager','analytics:read'),('business_manager','reports:read'),('business_manager','reports:manage'),
  ('business_manager','predict:sales'),('business_manager','predict:demand'),('business_manager','ai:use'),('business_manager','connect:read'),

  -- Branch Manager (scoped to assigned branches by backend guard)
  ('branch_manager','org:read'),('branch_manager','branches:read'),('branch_manager','imports:read'),('branch_manager','imports:manage'),
  ('branch_manager','sales:read'),('branch_manager','sales:write'),('branch_manager','inventory:read'),('branch_manager','inventory:write'),
  ('branch_manager','finance:read'),('branch_manager','customers:read'),('branch_manager','analytics:read'),('branch_manager','reports:read'),
  ('branch_manager','predict:sales'),('branch_manager','predict:demand'),('branch_manager','ai:use'),

  -- Finance Officer (NO platform:admin, NO user management, YES finance + cashflow forecasting)
  ('finance_officer','org:read'),('finance_officer','branches:read'),('finance_officer','imports:read'),('finance_officer','imports:manage'),
  ('finance_officer','sales:read'),('finance_officer','finance:read'),('finance_officer','finance:write'),
  ('finance_officer','analytics:read'),('finance_officer','reports:read'),('finance_officer','reports:manage'),
  ('finance_officer','predict:cashflow'),('finance_officer','ai:use'),('finance_officer','billing:read'),('finance_officer','audit:read'),

  -- Inventory Manager (stock, movements, reorder, demand forecasting; NO finance/billing)
  ('inventory_manager','org:read'),('inventory_manager','branches:read'),('inventory_manager','imports:read'),('inventory_manager','imports:manage'),
  ('inventory_manager','inventory:read'),('inventory_manager','inventory:write'),('inventory_manager','sales:read'),
  ('inventory_manager','analytics:read'),('inventory_manager','reports:read'),('inventory_manager','predict:demand'),('inventory_manager','ai:use'),

  -- Sales Manager
  ('sales_manager','org:read'),('sales_manager','branches:read'),('sales_manager','sales:read'),('sales_manager','sales:write'),
  ('sales_manager','customers:read'),('sales_manager','analytics:read'),('sales_manager','reports:read'),
  ('sales_manager','predict:sales'),('sales_manager','ai:use'),

  -- Marketing Officer
  ('marketing_officer','org:read'),('marketing_officer','customers:read'),('marketing_officer','customers:write'),
  ('marketing_officer','analytics:read'),('marketing_officer','connect:read'),('marketing_officer','connect:send'),('marketing_officer','connect:manage'),

  -- Customer Service Agent (NO financial forecasting, NO expenses, YES customers + connect)
  ('customer_service_agent','org:read'),('customer_service_agent','branches:read'),('customer_service_agent','customers:read'),
  ('customer_service_agent','customers:write'),('customer_service_agent','connect:read'),('customer_service_agent','connect:send'),

  -- Staff Member
  ('staff_member','org:read'),('staff_member','branches:read'),('staff_member','sales:read'),('staff_member','sales:write'),('staff_member','inventory:read'),

  -- Read-Only Auditor
  ('read_only_auditor','org:read'),('read_only_auditor','branches:read'),('read_only_auditor','sales:read'),
  ('read_only_auditor','inventory:read'),('read_only_auditor','finance:read'),('read_only_auditor','customers:read'),
  ('read_only_auditor','analytics:read'),('read_only_auditor','reports:read'),('read_only_auditor','audit:read')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM mapping m
JOIN roles r ON r.code = m.role_code AND r.tenant_id IS NULL
JOIN permissions p ON p.code = m.perm_code
ON CONFLICT DO NOTHING;

-- ===================== SUBSCRIPTION PLANS & ENTITLEMENTS (Section 20) =====================
INSERT INTO subscription_plans (code, name, description, monthly_price_kes, price_range_label, sort_order) VALUES
('starter', 'Starter', 'Manual spreadsheet imports, essential sales & expense KPIs, clean dashboards, and monthly summaries.', 2000.00, 'KES 1,500–2,500 / mo', 1),
('growth', 'Growth', 'Automated data sync, sales & customer dashboards, inventory insights, weekly reports, alerts, and basic forecasts.', 6000.00, 'KES 4,500–7,500 / mo', 2),
('intelligence', 'Intelligence', 'Advanced forecasting, RFM customer segmentation, anomaly detection, BizWave AI (EN/SW), and scheduled management reports.', 14000.00, 'KES 10,000–18,000 / mo', 3),
('enterprise', 'Multi-Branch / Enterprise', 'Multi-branch consolidated analytics, custom KPIs, enterprise integrations, advanced RBAC, and tailored white-label controls.', 25000.00, 'From KES 25,000 / mo', 4)
ON CONFLICT (code) DO NOTHING;

WITH pf(plan_code, feature_code, feature_label) AS (
  VALUES
  ('starter','analytics_core','Essential Sales & Expense KPIs'),
  ('starter','manual_imports','CSV & Excel Spreadsheet Imports'),
  ('starter','monthly_reports','Monthly Business Summaries'),

  ('growth','analytics_core','Full Sales, Expense & Customer Analytics'),
  ('growth','manual_imports','CSV & Excel Spreadsheet Imports'),
  ('growth','automated_imports','Automated Data Sources & M-Pesa Sync'),
  ('growth','inventory_insights','Inventory Health & Stock Alerts'),
  ('growth','weekly_reports','Weekly Exportable Reports'),
  ('growth','predict_basic','Basic Sales & Demand Forecasting'),
  ('growth','connect_core','BizWave Connect (SMS/WhatsApp/Voice/USSD)'),

  ('intelligence','analytics_core','Full Analytics & Multi-Branch KPIs'),
  ('intelligence','manual_imports','CSV & Excel Spreadsheet Imports'),
  ('intelligence','automated_imports','Automated Data Sources & M-Pesa Sync'),
  ('intelligence','inventory_insights','Inventory Health & Depletion Alerts'),
  ('intelligence','weekly_reports','Weekly & Scheduled Management Reports'),
  ('intelligence','predict_basic','Sales & Demand Forecasting'),
  ('intelligence','predict_advanced','Cash-Flow Forecasting, Anomaly Detection & RFM Segmentation'),
  ('intelligence','ai_assistant','BizWave AI Natural-Language Assistant (EN/SW)'),
  ('intelligence','connect_core','BizWave Connect Omnichannel Campaigns'),

  ('enterprise','analytics_core','Multi-Branch Consolidated Analytics'),
  ('enterprise','manual_imports','Unlimited CSV & Excel Imports'),
  ('enterprise','automated_imports','POS, Accounting & M-Pesa Integrations'),
  ('enterprise','inventory_insights','Multi-Branch Inventory Optimization'),
  ('enterprise','weekly_reports','Tailored Scheduled Management Reports'),
  ('enterprise','predict_basic','Sales & Demand Forecasting'),
  ('enterprise','predict_advanced','Advanced Forecasting, Anomalies & Segmentation'),
  ('enterprise','ai_assistant','BizWave AI Assistant with Priority Quotas'),
  ('enterprise','connect_core','BizWave Connect Enterprise Omnichannel'),
  ('enterprise','custom_kpis','Custom KPI Definitions'),
  ('enterprise','white_label','Custom Domain & White-Label Workspace')
)
INSERT INTO plan_features (plan_id, feature_code, feature_label, is_enabled)
SELECT sp.id, pf.feature_code, pf.feature_label, TRUE
FROM pf JOIN subscription_plans sp ON sp.code = pf.plan_code
ON CONFLICT (plan_id, feature_code) DO NOTHING;

WITH pl(plan_code, metric_code, monthly_limit) AS (
  VALUES
  ('starter','max_branches',1),('starter','max_users',3),('starter','imports_per_month',15),('starter','ai_queries_per_month',0),('starter','sms_included',0),
  ('growth','max_branches',3),('growth','max_users',10),('growth','imports_per_month',100),('growth','ai_queries_per_month',0),('growth','sms_included',500),
  ('intelligence','max_branches',10),('intelligence','max_users',25),('intelligence','imports_per_month',500),('intelligence','ai_queries_per_month',500),('intelligence','sms_included',2000),
  ('enterprise','max_branches',100),('enterprise','max_users',250),('enterprise','imports_per_month',5000),('enterprise','ai_queries_per_month',5000),('enterprise','sms_included',10000)
)
INSERT INTO plan_limits (plan_id, metric_code, monthly_limit)
SELECT sp.id, pl.metric_code, pl.monthly_limit
FROM pl JOIN subscription_plans sp ON sp.code = pl.plan_code
ON CONFLICT (plan_id, metric_code) DO NOTHING;

INSERT INTO add_on_services (code, name, unit_label, unit_price_kes, description) VALUES
('sms_pack_1000', 'SMS Bundle (1,000 messages)', '1,000 SMS', 850.00, 'Kenya transactional & consented marketing SMS bundle via Africa''s Talking.'),
('whatsapp_conv_500', 'WhatsApp Conversations (500)', '500 conversations', 2200.00, 'Official Meta WhatsApp Business Cloud API conversation pack.'),
('voice_minutes_250', 'Voice Call Minutes (250 mins)', '250 minutes', 1500.00, 'Programmable inbound/outbound voice minutes.'),
('ussd_sessions_1000', 'USSD Interactions (1,000 sessions)', '1,000 sessions', 1200.00, 'Interactive USSD menu sessions for customer feedback & loyalty.'),
('extra_branch', 'Additional Branch Seat', '1 branch / month', 1500.00, 'Expand multi-branch analytics and stock tracking to another location.'),
('extra_users_5', 'Additional Team Pack (5 Users)', '5 users / month', 1200.00, 'Add five role-based team seats to your organization.')
ON CONFLICT (code) DO NOTHING;

-- ===================== PROVIDERS & FORECASTING MODEL CATALOG =====================
INSERT INTO integration_providers (code, name, category, required_credentials) VALUES
('csv_xlsx_upload', 'CSV / Excel Spreadsheet Upload', 'spreadsheet', '[]'::jsonb),
('mpesa_daraja', 'Safaricom M-Pesa Daraja API', 'payments', '["MPESA_CONSUMER_KEY","MPESA_CONSUMER_SECRET","MPESA_SHORTCODE","MPESA_PASSKEY"]'::jsonb),
('quickbooks_online', 'QuickBooks Online', 'accounting', '["QBO_CLIENT_ID","QBO_CLIENT_SECRET","QBO_REALM_ID"]'::jsonb),
('vend_pos', 'Retail POS API Connector', 'pos', '["POS_API_URL","POS_API_KEY"]'::jsonb)
ON CONFLICT (code) DO NOTHING;

INSERT INTO communication_providers (code, name, supported_channels, required_env_keys, webhook_signature_header) VALUES
('africas_talking', 'Africa''s Talking', '["sms","voice","ussd"]'::jsonb, '["AFRICASTALKING_USERNAME","AFRICASTALKING_API_KEY"]'::jsonb, 'x-at-signature'),
('meta_whatsapp', 'Meta WhatsApp Cloud API', '["whatsapp"]'::jsonb, '["META_WHATSAPP_ACCESS_TOKEN","META_WHATSAPP_PHONE_NUMBER_ID","META_WEBHOOK_APP_SECRET"]'::jsonb, 'x-hub-signature-256'),
('twilio', 'Twilio Programmable Messaging & Voice', '["sms","whatsapp","voice"]'::jsonb, '["TWILIO_ACCOUNT_SID","TWILIO_AUTH_TOKEN"]'::jsonb, 'x-twilio-signature')
ON CONFLICT (code) DO NOTHING;

INSERT INTO forecasting_models (code, name, domain, algorithm, min_history_days, description) VALUES
('bw_sales_ensemble', 'BizWave Adaptive Sales Forecaster', 'sales', 'holt_winters_or_ridge_backtested', 14, 'Evaluates Holt-Winters Exponential Smoothing, Weekly Seasonal Naive, and Ridge Trend via rolling backtest and selects lowest MAPE.'),
('bw_demand_stockout_aware', 'Stockout-Aware Product Demand Forecaster', 'demand', 'stockout_adjusted_ewma', 14, 'Imputes zero-sale stockout days using in-stock demand distribution before estimating depletion horizon.'),
('bw_cashflow_projector', 'Obligation-Aware Cash-Flow Projector', 'cashflow', 'confirmed_plus_estimated_cashflow', 14, 'Separates confirmed payables/receivables from statistically estimated operating cash inflows and outflows.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO model_versions (model_id, version_tag, hyperparameters, status)
SELECT id, 'v1.0.0', '{"confidence_level":0.90,"backtest_window_days":7}'::jsonb, 'active'
FROM forecasting_models
ON CONFLICT (model_id, version_tag) DO NOTHING;
