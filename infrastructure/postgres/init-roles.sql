-- Provision least-privilege PostgreSQL roles for BizWave
-- bizwave_owner: offline schema-owner & DR backup role (NOSUPERUSER BYPASSRLS so pg_dump captures all FORCE RLS tenant rows; NEVER used by the API)
-- bizwave_app: runtime application role with NOSUPERUSER NOBYPASSRLS (enforces FORCE ROW LEVEL SECURITY on every query)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bizwave_owner') THEN
    CREATE ROLE bizwave_owner LOGIN PASSWORD 'bizwave_owner_dev_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
  ELSE
    ALTER ROLE bizwave_owner NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bizwave_app') THEN
    CREATE ROLE bizwave_app LOGIN PASSWORD 'bizwave_app_dev_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  ELSE
    ALTER ROLE bizwave_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;

GRANT CONNECT ON DATABASE bizwave TO bizwave_owner, bizwave_app;
GRANT CREATE, USAGE ON SCHEMA public TO bizwave_owner;
GRANT USAGE ON SCHEMA public TO bizwave_app;
