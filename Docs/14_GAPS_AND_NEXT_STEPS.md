# 14 — Gaps and Next Steps

Audit date: 2026-09-03. This is the recovery backlog for turning the THRU MVP into a properly functional, maintainable product. Priorities are ordered by dependency and operational risk.

## P0 — Restore a truthful, reproducible release

| Gap | Why it blocks the project | Completion criteria |
|---|---|---|
| Deployment identity | Existing `forge-backend` Container App is now the documented canonical API | Keep the same hostname in Vercel and deployment scripts |
| PostgreSQL migration | Runs/events, keys, teaching sessions, and skill versions are persisted in PostgreSQL with Azure Files export/fallback | Add distributed leases, backups/restore drills, and retire fallback only after longer soak testing |
| Marketplace URL and CORS proof | Current THRU Marketplace is deployed at `https://thru-tawny.vercel.app` and exact-origin CORS is configured; the obsolete NammaDocs origin was removed | Keep route-refresh and mobile smoke checks in release verification; remove the obsolete Vercel project |
| CI release gate | CI now runs clean installs, builds, tests, audits, secret scanning, and documentation checks; deployment promotion remains manual | Make the release workflow required on the main branch and add environment smoke tests |
| Frontend dependency advisories | Current audit is clean | Re-run the audit in CI on every release |
| External qualification is stale | Public websites and browser runtimes drift | Re-run qualification today and store a dated report with environment/version metadata |

Recommended sequence: canonicalize hostname → fix frontend dependency → add CI → deploy backend → deploy frontend/CORS → run end-to-end qualification.

## P1 — Make execution durable and operable

| Gap | Current limitation | Target |
|---|---|---|
| Durable run store | Runs/events are PostgreSQL-backed with atomic claims, advisory worker locking, lease expiry, heartbeats, and restart requeue; the dev deployment remains one replica | Add retry/dead-letter policy, backups/restore drills, corruption recovery, and multi-replica soak verification |
| Queue architecture | PostgreSQL advisory worker lock, per-run atomic claims, lease expiry, heartbeats, bounded retries, a 5-second queue reaper/poller, and configurable in-process backpressure/metrics protect the one-replica MVP; dispatch still originates in memory | A shared queue with durable dispatch, dead-letter handling, and multi-replica recovery tests |
| Skill persistence | PostgreSQL versions and Azure Files exports are enabled, but restore/corruption drills are not automated | Backup/restore verification, corruption recovery, and a single authoritative repository policy |
| Authentication and authorization | Scoped server-issued API keys protect REST/MCP access and management operations; ownership and revocation are checked against PostgreSQL on every authenticated request; API keys can exchange for short-lived hashed browser sessions; gate decisions are authenticated, immutable, durable, and approved runs resume through a server-only context; a single-replica per-client request limiter is enabled | External user/service identity provisioning, distributed rate limiting, and credential-aware browser handoff |
| Observability | Health plus mutable counters; no central logs, traces, or alerts | Structured request/run logs, correlation IDs through browser steps, metrics, dashboards, alerting, and redaction |
| Run API lifecycle | List, cancellation, retention, restart recovery, idempotency, owner checks, atomic claims, leases, heartbeats, and one bounded portal retry exist; active-run cancellation is still cooperative | Dead-letter policy, operator recovery tooling, and multi-replica verification |

## P1 — Finish the core product promise

| Gap | Current limitation | Target |
|---|---|---|
| Real teaching | Backend sessions now start isolated Webcmd browser profiles, execute guided actions, capture bounded DOM evidence and screenshots, require a user action, append a safe output boundary, and replay drafts before publishing; the UI still primarily presents manual action entry | Browser-side event streaming, automatic selector/schema inference from live DOM events, and visual artifact editing |
| Draft editing | The public UI now edits draft name, description, step descriptions, URLs, selectors, and positive expectations, then explicitly saves the review before replay | Full schema/property editor, inline validation diagnostics, and richer evidence/screenshot review |
| General healing | Bounded retry/relocation/reforge with successor validation, rollback, and persisted step/rung evidence; candidate ranking is still narrow | Broader DOM/evidence candidate ranking, optional model assistance, richer before/after artifacts, and human escalation workflows |
| Sensitive-flow continuation | Sensitive runs stop at `needs_human`; authenticated approval records are immutable and approved runs rerun through a bounded server-only local-human context | Credential-aware browser/session handoff, expiring resume tokens, and operator UX for manual continuation |
| Browser isolation | Tenant/session security is not defined | Per-run or per-tenant isolated profiles, credential vault integration, cleanup, and network/domain policy |
| Skill lifecycle | Version listing, owner/operator rollback, and deprecation are implemented; rollback creates a new immutable version and deprecated skills are blocked from execution | Draft/published/quarantined transitions, provenance/signing, compatibility checks, install/update, and deletion policy |

## P2 — Replace simulated product surfaces

- Expand the persisted event model with rollback and operational events; authenticated gate approval/denial and teaching lifecycle events are now persisted and exposed through `/events`.
- Add a real login/session identity provider and per-user key ownership around the existing backend-managed key UI; current single-team records have owner boundaries, scopes, last-used, and revocation detail.
- Report real connected MCP clients or relabel/remove the empty connected-agent concept.
- Add registry pagination/filtering once skill counts grow.
- Add a real marketplace publication/installation flow, author profiles, access visibility, and moderation.
- Add notifications for healing, failures, gate requests, and skill-version changes.

## P2 — Quality, security, and contract hardening

- Add frontend component and end-to-end browser tests; today the marketplace has no automated tests.
- Generate a shared client/schema from the backend contract instead of maintaining duplicate TypeScript types.
- Expand the checked-in `openapi.yaml` with complete status/error schemas and generate shared client types from it.
- Add MCP interoperability tests using at least one external client, including tool-list refresh and long-running calls.
- Per-skill navigation/domain allow policies now apply to teaching and execution; add container-level outbound egress restrictions and network observability.
- Add egress restrictions, content-size limits, download handling, secret/PII redaction, and artifact signing/provenance.
- Define CAPTCHA, login, payment, upload, download, and cross-origin iframe policies explicitly.
- Add load, soak, crash-recovery, container-restart, storage-corruption, and queue-saturation tests.
- Split or lazy-load the frontend charts bundle; the current production build warns about a 522 kB chunk.
- Configuration names are now THRU-only in the checked-in app and deployment scripts; retain a release check so legacy `FORGE_*` variables cannot re-enter production configuration.

## Suggested delivery milestones

### Milestone 1: Releasable THRU baseline

- Canonical deployment names and URLs.
- React Router advisory resolved.
- CI green on a clean checkout.
- Current backend and five-skill registry deployed.
- Marketplace deployed at `https://thru-tawny.vercel.app` with exact CORS.
- Dated end-to-end verification report.

### Milestone 2: Durable single-team beta

The initial PostgreSQL schema contract at `backend/migrations/001_initial.sql` is deployed to the MVP/dev PostgreSQL instance and startup checks it. Run/event, API-key, teaching-session, and skill-version paths are PostgreSQL-backed when configured; Azure Files remains an export/fallback during soak testing.

- Persistent skills and runs.
- Authenticated users, scoped keys, rate limits.
- Shared worker queue and run lifecycle endpoints.
- Real logs/metrics/alerts.
- Honest dashboards based on events.

### Milestone 3: Teaching and recovery beta

- Guided action recording and editable proposals.
- Replay validation before publication.
- Evidence-rich model-assisted repair with rollback.
- Server-audited human approval and bounded resume (implemented); credential-aware browser handoff remains.

### Milestone 4: Multi-tenant marketplace

- Ownership, organizations, private/public skills, signed releases.
- Install/update/deprecate flows and moderation.
- Tenant-isolated browser profiles and credential vault.
- SLOs, billing/quotas, retention, compliance, and disaster recovery.

## Immediate next actions

1. Keep the documented `forge-backend...` hostname as the canonical MVP API until a planned rename.
2. Make the existing CI checks required for merges and add deployment smoke tests.
3. Keep the marketplace at `https://thru-tawny.vercel.app`, preserve exact-origin CORS, and delete the obsolete NammaDocs Vercel project.
4. Re-run the dated container, REST, async queue, MCP, healing, gate, and public-skill checks for each release.
5. Complete the remaining beta work: multi-replica queue/dead-letter soak, backup/restore drills, real user identity provisioning, richer guided capture, evidence-rich healing, and central observability.

Do not begin marketplace-growth features before Milestones 1 and 2. The highest-leverage work is making the existing execution core reproducible, durable, authenticated, and observable.
