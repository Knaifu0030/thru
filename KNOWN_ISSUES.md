# Known Issues

These are current MVP constraints, not hidden production claims.

- The Azure API hostname is inherited from the existing Container App (`forge-backend`); it is the canonical THRU endpoint for this MVP.
- The current deployment contains exactly the five THRU skills. NammaDocs was a test app and has been removed from the repository and image.
- The current Marketplace is `https://thru-tawny.vercel.app`; exact-origin CORS is configured. Delete the obsolete `thru-kap6.vercel.app` NammaDocs project from Vercel when convenient; it is no longer trusted by Azure.
- Frontend and backend production dependency audits currently report zero vulnerabilities.

- The public frontend can browse and run skills. Teaching and key management require a server-issued management API key entered into Settings; the admin secret is never part of the Vercel build.
- Teaching now records ordered actions in an isolated browser profile, captures bounded DOM/screenshot evidence, requires a user action, appends a safe output boundary, and replay-validates before publication; browser-side event streaming and visual artifact editing remain future work.
- Teaching review now exposes generated names, descriptions, URLs, selectors, and positive expectations before replay; advanced schema editing and visual evidence review are still limited.
- API keys are server-issued, hashed, scoped, revocable, and persisted to PostgreSQL when configured, with Azure Files retained as an export/fallback.
- Dashboard activity now consumes persisted run events; longer-range time-series and operational metrics still require a managed event/metrics backend.
- The backend runs one browser workflow at a time and queues concurrent work; PostgreSQL advisory worker locks, per-run leases, heartbeats, restart requeue, configurable queue backpressure (100), and queue metrics are enabled. A durable external dispatcher/dead-letter queue and multi-replica soak remain future work.
- Active cancellation is cooperative: the current browser step is allowed to finish safely, then the durable run is marked `cancelled`.
- Registry artifacts and teaching sessions are synchronized to PostgreSQL when configured; the mounted Azure Files JSON files remain as an export/fallback during MVP soak testing. Bundled five-skill artifacts are mirrored into PostgreSQL versions.
- Authorized operators can inspect skill versions, roll back by publishing a new immutable version, and deprecate skills. Full draft/quarantine/signing/install lifecycle remains future work.

The full prioritized backlog and completion criteria are in [Docs/14_GAPS_AND_NEXT_STEPS.md](Docs/14_GAPS_AND_NEXT_STEPS.md).
