# THRU

THRU turns a learned website workflow into one portable Skill: a button for a human, a typed REST endpoint for a developer, and an MCP tool for an AI agent.

The backend now uses one real Webcmd browser path for mock and public skills. It includes step evidence, bounded healing, human gates, an asynchronous one-browser queue, two-phase teaching, optional Azure OpenAI structured proposals with deterministic fallback, REST/MCP/CLI parity, crash-safe registry writes, and persistent healing history.

## Local quickstart

Requirements: Node.js 20.6+ and npm.

```powershell
cd backend
npm ci
npm run build
npm test
npm start
```

In another terminal, install and run the Vite frontend on an allowed origin:

```powershell
cd frontend
npm ci
npm run dev
```

Open `http://localhost:3000`. The page should report that the THRU deployment is online and show live backend/Webcmd status.

For a production build:

```powershell
cd frontend
npm run build
```

## Functional checks

```powershell
cd backend
npm run thru -- list
npm run thru -- run hell-check certificate=DEMO-1234
npm run thru -- run example-title
```

REST:

```powershell
curl "http://localhost:8080/skills/hell-check?certificate=DEMO-1234"
curl -X POST "http://localhost:8080/skills/sensitive-submit" -H "Content-Type: application/json" -d '{"certificate":"DEMO-1234"}'
```

The second call returns `needs_human` without executing its sensitive step. MCP Streamable HTTP is served at `/mcp`; installed skills appear as `thru_<skill_id>` tools and return the same envelope as REST and CLI.

Admin routes require `X-THRU-Admin-Key`:

- `POST /teach` with `{ "goal_text", "url", "sample_inputs?" }` creates a 15-minute unconfirmed proposal
- `POST /teach/{proposal_id}` confirms an optional edited `{ "artifact" }`
- `DELETE /teach/{proposal_id}` discards a proposal
- `POST /registry/import` with a skill artifact
- `POST /admin/sabotage` with `{ "variant": "v1" | "v2" | "v3" | "reset" }`

For normal operator use, create or bootstrap a server-issued API key, then exchange it for an 8-hour browser session with `POST /auth/session`. The marketplace Settings screen performs this exchange and stores only the short-lived session token in `sessionStorage`; revoked or expired tokens fail closed. Management-scoped access is required for teaching and key administration.

Send `Prefer: respond-async` to a skill route for HTTP 202 and poll `GET /runs/{run_id}`. Synchronous REST calls automatically fall back to 202 before the gateway deadline.

Run operations also support `DELETE /runs/{run_id}` cancellation and an `Idempotency-Key` request header for safe retries. Operators can inspect persisted activity with `GET /events` and real queue/run counters with `GET /metrics`.

When a run returns `needs_human`, a management-scoped key can append an auditable decision with `POST /runs/{run_id}/approval` and `{ "decision": "approved" | "denied", "note?": "..." }`. The decision is immutable and appears in `/events`; an approval re-queues the run through a bounded server-only local-human context, while denial leaves it stopped.

Guided teaching uses the authenticated `/teaching-sessions` lifecycle: create a session, start an isolated browser with `POST /teaching-sessions/{id}/capture`, send ordered `POST /capture/actions` commands (fill values are ephemeral and never persisted), review edits, replay-validate, then publish. Each captured action stores bounded DOM metadata and a screenshot reference. The manual `/actions` endpoint remains available for imported/replayed evidence. Invalid, expired, or unvalidated sessions cannot publish.

CLI exit codes are stable: `0` success/healed success, `1` portal or internal failure, `2` usage or invalid input, and `3` `needs_human` or declined approval. Narration is written to stderr; envelopes remain JSON on stdout.

The baked public workflows are `example-reference`, `httpbin-document`, and `cern-history`; each passed 10 warm runs in one Webcmd Session plus three independent fresh-session runs on 2026-08-22. Rejected candidates (Quotes to Scrape, Books to Scrape, and WorldTimeAPI) remain documented alternates and are not shipped.

## Current status

The current implementation map and audit evidence are in [Docs/13_CODEBASE_STATUS.md](Docs/13_CODEBASE_STATUS.md). The prioritized recovery backlog is in [Docs/14_GAPS_AND_NEXT_STEPS.md](Docs/14_GAPS_AND_NEXT_STEPS.md). Historical acceptance records are not live status pages.

As of 2026-09-03, the canonical THRU API responds at the `forge-backend` Container Apps hostname below. The live registry contains the five THRU skills, PostgreSQL persistence is enabled, and no NammaDocs artifacts are deployed.

## Production links

- Marketplace: https://thru-tawny.vercel.app
- API base: https://forge-backend.mangosmoke-65ea4a06.centralindia.azurecontainerapps.io

After deploying the frontend, append its exact origin to Azure with
`./deploy/set-cors-origin.ps1 -Origin https://your-app.vercel.app`.

Deployment and verification instructions are in [deploy/GATE_0.md](deploy/GATE_0.md). For a current CLI-driven Azure deployment, use [deploy/deploy-azure.ps1](</E:/WebCMD hackathon/deploy/deploy-azure.ps1>). Product and architecture specifications are under [Docs](Docs/README.md), and current limitations are tracked in [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

## Security

Secrets belong in Azure Container Apps secret references, never in source or frontend configuration. Configure Azure model assistance with `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`, and `AZURE_OPENAI_API_VERSION`. Model output is never saved before THRU artifact validation and explicit confirmation.
