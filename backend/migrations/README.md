# THRU database migrations

`001_initial.sql` is the baseline PostgreSQL schema for the durable multi-replica phase. Apply migrations in lexical order with a PostgreSQL 15+ client:

```powershell
$env:PGSSLMODE = "require"
psql $env:THRU_DATABASE_URL -f backend/migrations/001_initial.sql
```

The current Azure MVP intentionally uses Azure Files JSON persistence and does not set `THRU_DATABASE_URL`. Runtime database adapters and an automated migration runner must be added before increasing `maxReplicas`.
