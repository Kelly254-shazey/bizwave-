# Historical suites — not runnable against the current release

These pre-portal tests are retained for reference only. They expect the removed
Community Learn routes, an old demo-data seed and fixed accounts, and older plan
and reporting behavior. Some mutate data or create/drop a fixed restore database.
Do not run them against a real installation. They are not in the current CI or
release verification, and their old pass counts do not describe this release.

Current automated checks are `backend/test/api.integration.spec.ts`,
`backend/test/unit.spec.ts`, `frontend/test/unit.spec.ts`,
`intelligence/tests/test_intelligence.py`, `database/tests/test_database_integrity.sql`,
`tests/migration-regression.sh`, and the current architecture fitness audit.
