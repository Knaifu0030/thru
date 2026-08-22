# Forge

Forge turns a learned website workflow into one portable Skill: a button for a human, a typed REST endpoint for a developer, and an MCP tool for an AI agent.

The backend now uses one real Webcmd browser path for mock and public skills. It includes step evidence, bounded healing, human gates, an asynchronous one-browser queue, two-phase forging, optional Azure OpenAI structured proposals with deterministic fallback, REST/MCP/CLI parity, crash-safe registry writes, and persistent healing history.

## Local quickstart

Requirements: Node.js 20.6+ and npm.

```powershell
cd backend
npm ci
npm run build
npm test
npm start
```

In another terminal, serve the frontend on an allowed origin:

```powershell
npx --yes serve@14 frontend -l 3000
```

Open `http://localhost:3000`. The page should report that the Forge deployment is online and show live backend/Webcmd status.

## Functional checks

```powershell
cd backend
npm run forge -- list
npm run forge -- run hell-check certificate=DEMO-1234
npm run forge -- run example-title
```

REST:

```powershell
curl "http://localhost:8080/skills/hell-check?certificate=DEMO-1234"
curl -X POST "http://localhost:8080/skills/sensitive-submit" -H "Content-Type: application/json" -d '{"certificate":"DEMO-1234"}'
```

The second call returns `needs_human` without executing its sensitive step. MCP Streamable HTTP is served at `/mcp`; installed skills appear as `forge_<skill_id>` tools and return the same envelope as REST and CLI.

Admin routes require `X-Forge-Admin-Key`:

- `POST /forge` with `{ "goal_text", "url", "sample_inputs?" }` creates a 15-minute unconfirmed proposal
- `POST /forge/{proposal_id}` confirms an optional edited `{ "artifact" }`
- `DELETE /forge/{proposal_id}` discards a proposal
- `POST /registry/import` with a skill artifact
- `POST /admin/sabotage` with `{ "variant": "v1" | "v2" | "v3" | "reset" }`

Send `Prefer: respond-async` to a skill route for HTTP 202 and poll `GET /runs/{run_id}`. Synchronous REST calls automatically fall back to 202 before the gateway deadline.

CLI exit codes are stable: `0` success/healed success, `1` portal or internal failure, `2` usage or invalid input, and `3` `needs_human` or declined approval. Narration is written to stderr; envelopes remain JSON on stdout.

The baked public workflows are `example-reference`, `httpbin-document`, and `cern-history`; each passed 10 warm runs in one Webcmd Session plus three independent fresh-session runs on 2026-08-22. Rejected candidates (Quotes to Scrape, Books to Scrape, and WorldTimeAPI) remain documented alternates and are not shipped.

## Production links

- Marketplace: _set after the first Vercel production deployment_
- API base: _set after the first Azure Container Apps deployment_

Deployment and verification instructions are in [deploy/GATE_0.md](deploy/GATE_0.md). Product and architecture specifications are under [Docs](Docs/README.md).

## Security

Secrets belong in Azure Container Apps secret references, never in source or frontend configuration. Configure Azure model assistance with `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`, and `AZURE_OPENAI_API_VERSION`. Model output is never saved before Forge artifact validation and explicit confirmation.
