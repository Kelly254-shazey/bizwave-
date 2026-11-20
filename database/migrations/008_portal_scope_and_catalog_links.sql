-- Preserve the authorization scope of newly-created AI threads. Legacy threads
-- retain their records but are not exposed until an administrator has reviewed
-- their original access scope; an old response can contain broader-branch data.
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS security_scope JSONB;

-- Map a published website's own items to products that BizWave created for that
-- source. This lets repeat syncs update those items without overwriting unrelated
-- products that happen to use the same SKU.
CREATE TABLE IF NOT EXISTS website_catalog_links (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  data_source_id UUID NOT NULL,
  external_key VARCHAR(200) NOT NULL,
  product_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, data_source_id, external_key),
  UNIQUE (tenant_id, data_source_id, product_id),
  FOREIGN KEY (tenant_id, data_source_id) REFERENCES data_sources(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE CASCADE
);
ALTER TABLE website_catalog_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_catalog_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON website_catalog_links;
CREATE POLICY tenant_isolation_policy ON website_catalog_links
  USING (tenant_id = app_current_tenant_id() OR app_is_platform_admin())
  WITH CHECK (tenant_id = app_current_tenant_id() OR app_is_platform_admin());

INSERT INTO schema_migrations (version, description)
VALUES ('008', 'Permission-aware AI history and source-owned website catalog links')
ON CONFLICT (version) DO NOTHING;
