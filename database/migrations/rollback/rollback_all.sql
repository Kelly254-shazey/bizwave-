-- BizWave Rollback Script (Development/Staging Controlled Reset)
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO PUBLIC;
