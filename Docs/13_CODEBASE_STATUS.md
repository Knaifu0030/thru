# 13 — Current Codebase Map and Status

Audit date: 2026-09-03. This document describes the checked-out THRU code, not the intended product or the historical hackathon state. NammaDocs was an isolated test application and has been removed from this repository and from THRU's local skill set.

## Executive status

THRU is a working single-team MVP with a validated Skill registry, Webcmd execution, REST/MCP/CLI surfaces, bounded selector healing, human safety gates with audited approval/resume, durable PostgreSQL records, scoped API keys, isolated guided teaching capture, and a React marketplace. It is not yet a complete multi-user production platform; the remaining gaps are external identity provisioning, richer capture UX, and centralized observability.

| Area | Current state | Evidence from this audit |
|---|---|---|
| Backend TypeScript | Builds | `npm run build` succeeds as part of the test run |
| Backend tests | Pass | 45/45 tests pass across HTTP/MCP, API-key/session auth, teaching replay and live capture, healing, queue backpressure/restart recovery, approval/resume, and browser fixtures; teardown now stops the local Webcmd daemon cleanly |
| Backend production dependencies | Clean | `npm audit --omit=dev` reports 0 vulnerabilities |
| Marketplace frontend | Builds | `npm run build` succeeds; Vite warns that the charts chunk is 522 kB |
| Frontend production dependencies | Clean | `npm audit --omit=dev` reports 0 vulnerabilities |
| Active API deployment | Reachable | `https://forge-backend.mangosmoke-65ea4a06.centralindia.azurecontainerapps.io/health` returns 200 and reports Webcmd and PostgreSQL ready |
| README API hostname | Was stale | The former `thru-backend...` `/health` and `/registry` routes return 404 |
| Live deployment contents | Current THRU scope | The deployed registry contains exactly the intended five THRU skills |
| Marketplace deployment | Verified | `https://thru-tawny.vercel.app` serves the current THRU SPA; the legacy NammaDocs origin is no longer allowed by Azure CORS |

## Runtime architecture

```text
Human browser                 Developer / agent                   Local operator
     |                               |                                  |
     v                               v                                  v
frontend/ React app          REST /skills + MCP /mcp               backend CLI
     |                               |                                  |
     +-------------------------------+----------------------------------+
                                     |
                               app.ts gateway
                                     |
                               RunManager queue
                                     |
                                SkillExecutor
                           validation -> safety gate
                                     |
                              WebcmdSession/browser
                                     |
                       verify -> retry/relocate/reforge
                                     |
                              SkillRegistry.save()
                                     |
                           skills/*.skill.json
```

Every execution surface ultimately reaches `SkillExecutor.runSkill`. REST uses `RunManager` with a PostgreSQL-backed durable queue (currently drained by the single MVP replica); MCP calls the executor directly, whose own promise tail still serializes browser work; CLI calls the same executor with a local human-gate callback.

## Repository map

### Root

- `README.md`: operator quickstart and public entry point.
- `PRODUCT.md`: concise product and design principles.
- `KNOWN_ISSUES.md`: short operational limitations; the detailed backlog is in `14_GAPS_AND_NEXT_STEPS.md`.
- `.env.example`: backend configuration example. Secrets must not be placed in Vite variables.
- `Docs/`: product vision, contracts, architecture, deployment history, this status report, and the recovery backlog.
- `deploy/`: PowerShell qualification scripts and historical acceptance evidence.
- `Assets/` and demo media: brand/demo assets; they are not runtime dependencies.

### Backend: `backend/`

| File or area | Responsibility |
|---|---|
| `src/server.ts` | Composition root: config, registry load, executor, teaching engine, queue, HTTP server, shutdown |
| `src/app.ts` | REST routing, CORS, error envelopes, body limits, admin routes, mock routes, async run polling, MCP dispatch |
| `src/config.ts` | Port, exact-origin allowlist, skill directory, admin key, and persistence settings |
| `src/types.ts` | Skill artifact, workflow step, run envelope, healing/history contracts |
| `src/skill-validation.ts` | Artifact shape checks plus AJV input/output validation |
| `src/registry.ts` | In-memory runtime index backed by JSON/Azure Files with PostgreSQL skill-version synchronization; validation, quarantine, backup restore, atomic writes, import collision handling |
| `src/execution-policy.ts` | Time budgets, sensitivity markers, manual-gate classification, preservation of prior safety flags |
| `src/executor.ts` | Shared execution entry point; input validation, gates, Webcmd call, output validation, verified patch persistence, vitals |
| `src/webcmd-runner.ts` | Webcmd process adapter and generated browser program: navigation, iframe/new-tab handling, expectations, extraction, retry and healing |
| `src/run-manager.ts` | Single-browser FIFO queue, PostgreSQL-backed run/event records, atomic claims, leases/heartbeats, bounded retry state, restart recovery, queue polling, backpressure, and queue metrics |
| `src/approval-store.ts` | Append-only, PostgreSQL-backed human-gate approval/denial audit records with JSON fallback |
| `src/teaching-sessions.ts` | Expiring owned teaching sessions, manual action review, isolated browser capture, bounded evidence/screenshot persistence, replay validation, and publish |
| `src/forge-engine.ts` | Two-phase teaching proposals: inspect one page, infer an artifact, optionally replace it with a validated model proposal, confirm/import |
| `src/forge-model.ts` | Optional Azure OpenAI structured-output client |
| `src/mcp.ts` | Stateless Streamable HTTP MCP server; rebuilds tools from the registry on each request |
| `src/cli.ts` | List, run, teach/forge, export, and import commands; exact `APPROVE` gate |
| `src/mock-portal.ts` | THRU-owned drift demo and browser edge-case fixtures |
| `src/webcmd-diagnostic.ts` | Cached Webcmd version/doctor health check |
| `src/qualify.ts` | Repeated public-skill qualification runner |
| `src/*.test.ts` | HTTP/MCP, registry, teaching, CLI, queue, healing, and browser behavior tests |
| `skills/` | Five local source-of-truth artifacts: three public read-only skills, one THRU mock healing skill, one sensitive-gate skill |
| `Dockerfile` | Node + Chromium/Xvfb container used for Azure Container Apps |

### Marketplace: `frontend/`

| File or area | Responsibility |
|---|---|
| `src/App.tsx` | Providers and routes: dashboard, marketplace, activity, connect, settings |
| `src/lib/api.ts` | Only HTTP client; registry, runs/polling, teaching, derived analytics/activity, session-held API keys |
| `src/lib/store.tsx` | Registry polling, teaching session state, drawer/search/modal UI state |
| `src/lib/types.ts` | Client mirror of backend and view-model contracts |
| `src/screens/` | Five product screens |
| `src/components/skills/` | Schema-generated run form, result renderer, card/drawer, API/MCP snippets, teaching state |
| `src/components/shell/` | Responsive application shell and gateway health indicator |
| `src/components/ui/` | Small shared controls, focus/loading/status primitives |
| `vite.config.ts`, `vercel.json` | Build setup and static SPA hosting configuration |

### Deployment and documentation

- `deploy/qualification-report.json` and `deploy/MVP_ACCEPTANCE.md` are historical evidence dated 2026-08-22, not live monitoring.
- `deploy/verify-*.ps1` are manual checks; `.github/workflows/ci.yml` now provides the baseline clean-install/build/test/audit/documentation gate.
- `Docs/01`–`12` mostly describe product intent and the hackathon delivery plan. Where they conflict with this file, this status file is the current implementation record.

## Implemented user journeys

1. Browse: the marketplace polls `/registry`, searches skills, and opens schema-driven cards.
2. Run: the UI posts inputs, accepts a synchronous envelope or polls a 202 run, then renders structured output and execution evidence.
3. Use as an API: each skill is addressable at `GET|POST /skills/{id}` and exportable as JSON.
4. Use as an agent tool: `/mcp` exposes one typed `thru_*` tool per installed skill.
5. Demonstrate healing: the admin sabotage route changes the THRU mock portal; fallback/semantic relocation is verified and persisted as a new skill version.
6. Protect sensitive actions: gateway surfaces return `needs_human`; the CLI requires explicit approval or manual completion.
7. Teach a draft: an administrator submits a goal and URL, receives an expiring proposal, then confirms or discards it.
8. Audit and resume a gate: an authenticated management key records an immutable approval or denial against a gated run; approval re-queues the run through a server-only local-human context, and the decision appears in activity events.
9. Manage lifecycle: authorized operators can inspect immutable versions, roll back to a stored version as a new version, and deprecate a skill; deprecated skills remain discoverable but cannot execute.

## Important implementation boundaries

- Teaching has an expiring session/action/review/validate/publish API plus an isolated browser capture lifecycle (`capture`, `capture/actions`, `capture/stop`); capture commands produce bounded DOM evidence and screenshots stored under the durable data volume. Validation replays the unpublished artifact before publication. The UI supports ordered navigate/fill/click/extract/wait/tab/frame capture, editable draft metadata/selectors/expectations, and explicit replay/publish confirmation; richer visual evidence editing remains a follow-up.
- Healing is selector relocation and a narrow single-button reforge heuristic. It is not a general model-driven workflow repair system. Navigation is constrained to the skill's configured host/subdomains and teaching capture enforces the same domain boundary.
- Runs/events, API keys, teaching sessions, teaching lifecycle events, and immutable skill versions are PostgreSQL-backed when `THRU_DATABASE_URL` is configured; JSON/Azure Files remains an export/fallback path during MVP soak testing. PostgreSQL migrations run idempotently at service startup.
- Azure production mounts the `thru-data` Azure Files share at `/app/data`, so runs, keys, teaching sessions, and local artifacts survive revision replacement. Retention, idempotency, cancellation, persisted run events, bounded portal retries, lease heartbeats, PostgreSQL queued-job recovery/polling, queue-depth backpressure (100), and queue metrics are enabled.
- API keys are hashed, revocable, and scoped (`run` or `manage`); teaching and key-management operations require `manage`.
- Server-issued hashed/revocable scoped API keys work for REST/MCP/run management; run and teaching records now carry an owner boundary and reject cross-owner access, while all current bootstrap identities map to the single-team operator account. A user-facing identity provider, organizations, and marketplace installation are still absent.
- Dashboard history uses persisted run records when available; richer event-level analytics remain a follow-up.
- Settings exchanges a server-issued API key for an 8-hour hashed/revocable browser session and stores only the short-lived session token in session storage. An approved gate now resumes through a server-only, bounded local-human context; a user-facing identity provider and true credential/browser handoff remain follow-ups.

## Configuration and external dependencies

- Node.js 20.6+ and npm.
- Webcmd 0.7.4 with its Chromium/Cloak runtime.
- Optional Azure OpenAI configuration for proposal generation.
- `THRU_ALLOWED_ORIGINS` is an exact allowlist; no origin means non-browser calls are allowed.
- `THRU_ADMIN_KEY` protects teach, import, and sabotage routes.
- `THRU_RUN_RETENTION_DAYS` bounds terminal run history (30 days by default).
- `THRU_APPROVALS_FILE` selects the JSON/Azure Files fallback for gate approval audit records.
- `THRU_RATE_LIMIT_PER_MINUTE` bounds requests per client window (120 in the live MVP).
- `THRU_DATABASE_URL` is an optional secret-only PostgreSQL connection string. When configured, startup verifies the connection and applies the idempotent baseline migration.
- `VITE_THRU_API_BASE` selects the browser-visible gateway at build time.

## Local verification commands

```powershell
cd backend
npm ci
npm test
npm audit --omit=dev

cd ..\frontend
npm ci
npm run build
npm audit --omit=dev
```

Treat public-site qualifications, Azure health, CORS, MCP interoperability, and Vercel route checks as separate release tests because they depend on external state.

## Azure deployment (2026-09-03)

- Container App: `forge-backend` in `forge-rg` / `forge-env`.
- Image: `forgeacraa8c18ec.azurecr.io/thru-backend:thru-mvp-20260903-r45` (digest `sha256:d04df520881fb17c588939873f3aac799ec5f72c32ee3cf98b84cbfcd21d8c08`).
- Current revision is `forge-backend--r45`, healthy and serving 100% traffic. It runs image r45 with queue-depth backpressure, queue metrics, skill lifecycle controls, and restart-safe lifecycle state, and intentionally caps the app at one 1 vCPU/2 GiB replica for the low-cost MVP tier, with a 120-request/minute per-client limiter.
- Live smoke checks passed for `/health`, `/registry` (five THRU skills), synchronous execution, asynchronous submission/polling, and MCP `tools/list`.
- Azure Database for PostgreSQL Flexible Server `thru-db-aa8c18ec` is online using the minimal Burstable B1ms tier, 32 GB minimum disk, 7-day local backups, and no high availability or geo-redundancy. `/health` reports `database: ready`; the secret is not stored in code or application configuration.
- A production-like restart proof created async run `a0a02c1f-63aa-4922-883e-0e384c373ab4`, replaced the backend revision, and retrieved the same completed run and three events afterward. This verifies the PostgreSQL run/event path.
- A post-deploy teaching restart proof preserved a review session and its recorded navigate action across revision replacement, then deleted the test session.
- A second restart proof preserved a guided extraction action, rebuilt the two-step workflow, replay-validated it successfully, and deleted the test session.
- A deletion/restart proof created and deleted a teaching session, replaced the revision, and confirmed the deleted session remained `404` afterward; database reconciliation no longer resurrects deleted rows.
- Live teaching validation now rejects a session without a user-recorded action (`400`) and successfully replays a recorded wait plus the automatic output extraction (`validated`, `healed_success`, three workflow steps); waits are bounded by the global run budget.
- Live cancellation proof requested cancellation during an active browser run and the durable poll result ended `cancelled` with an explicit cancellation event.
- Live key-scope proof created a key with an empty scope request, confirmed it was run-only (no management access), executed a skill successfully, and revoked it.
- Healing results now persist auditable step/rung/version evidence rows in PostgreSQL's `healing_attempts` table when a database is configured.
- Completed runs older than the configured retention window are deleted from PostgreSQL on worker startup (run events cascade with the run).
- Live sabotage/recovery verification returned `healed_success` and `/events` exposed a persisted `healing` event; the mock portal was restored to its baseline variant afterward.
- Live teaching navigation to `127.0.0.1` was rejected with HTTP 400, confirming private-network navigation protection on the deployed revision.
- Run cancellation now fails closed with HTTP 401 unless a run-scoped key or operator authorization is supplied.
- Azure scale is intentionally capped at one replica until distributed queue/locking is deployed; this prevents conflicting browser work against the file-backed MVP store.
- Live session smoke passed on `forge-backend--session25`: an operator key exchanged for a scoped session, `/auth/me` and `/keys` accepted the session, logout revoked it, and subsequent access returned 401. The revision also includes an idempotent migration repair for pre-existing `sessions` tables missing `created_at` and bounded bootstrap-key cleanup.
- Live activity smoke on `forge-backend--activity27` exposed a persisted `teaching_created` event from a new teaching session through `/events`; the test session was then deleted.
- Live safety-gate smoke on `forge-backend--gate28` returned `needs_human` for the sensitive skill and exposed the corresponding persisted `gate` event through `/events`.
- Revision `forge-backend--env29` adds the explicit `/app/data/sessions.json` Azure Files fallback path; `/health` remains `ok` with PostgreSQL ready and five skills.
- Revision `forge-backend--approvals30` adds `/app/data/approvals.json`; live approval smoke returned `denied` for a sensitive run and exposed a persisted `gate_denied` event. Teaching evidence smoke also survived the session API lifecycle and was deleted cleanly.
- Revision `forge-backend--gate31` rejects a second decision for the same gate with HTTP 409; live health remains `ok` with PostgreSQL ready and five skills.
- Revision `forge-backend--0000031` persists approval notes and authenticated approver IDs, applies the idempotency uniqueness boundary per user, and scopes run/event and teaching-session access checks. Live smoke passed session exchange, authenticated `hell-check`, async submission/polling, sensitive gate denial with its note, and teaching evidence capture/deletion; `/health` remains `ok` with PostgreSQL ready and five skills.
- Revision `forge-backend--0000032` is the current immutable deployment and adds the final invalid-bearer fail-closed response on run detail/cancellation routes; live `/health` reports `ok`, PostgreSQL `ready`, and five skills at 1 replica / 2 GiB.
- Revision `forge-backend--0000037` (image r42) was superseded by `forge-backend--r45` (image r45), which retains all prior persistence/auth/teaching/healing behavior and adds bounded queue backpressure, queue metrics, skill version inspection, rollback, deprecation, restart-safe lifecycle state, and per-skill navigation allowlists. Live r45 checks passed `/health`, synchronous execution, async submission/polling, MCP discovery, queue metrics, and exact-origin CORS. Exact-origin CORS is `https://thru-tawny.vercel.app` plus local development origins.
