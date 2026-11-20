-- Run as a PostgreSQL administrator after migrations. The API uses bizwave_app,
-- never the owner. Explicit ownership lets SECURITY DEFINER maintenance and
-- audit functions work with FORCE RLS; app is neither owner nor BYPASSRLS.
\set ON_ERROR_STOP on
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO bizwave_owner;', r.tablename);
  END LOOP;
  FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO bizwave_owner;', r.sequencename);
  END LOOP;
  FOR r IN SELECT viewname FROM pg_views WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER VIEW public.%I OWNER TO bizwave_owner;', r.viewname);
  END LOOP;
  FOR r IN SELECT matviewname FROM pg_matviews WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER MATERIALIZED VIEW public.%I OWNER TO bizwave_owner;', r.matviewname);
  END LOOP;
  FOR r IN
    SELECT p.oid::regprocedure AS fn FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND (p.proname LIKE 'fn_%' OR p.proname LIKE 'app_%')
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO bizwave_owner;', r.fn);
  END LOOP;
END $$;
ALTER SCHEMA public OWNER TO bizwave_owner;
GRANT USAGE ON SCHEMA public TO bizwave_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bizwave_app;
-- The runtime must not change the migration history used by future deployments.
REVOKE INSERT, UPDATE, DELETE ON public.schema_migrations FROM bizwave_app;
-- Materialized views cannot enforce RLS. The runtime does not query this
-- cross-tenant cache directly; only the owner-owned refresh function uses it.
REVOKE ALL ON public.mv_tenant_daily_analytics FROM bizwave_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bizwave_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO bizwave_app;
