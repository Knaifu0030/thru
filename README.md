# Forge

Forge turns a learned website workflow into one portable Skill: a button for a human, a typed REST endpoint for a developer, and an MCP tool for an AI agent.

The current build includes the production skeleton plus the functional MVP spine: flat-file Skill Registry, one shared executor, REST and MCP gateways, CLI, schema validation, safety gates, import/export, mock-site sabotage, and persistent healing history.

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

- `POST /forge` with `{ "artifact": <skill object> }`
- `POST /registry/import` with a skill artifact
- `POST /admin/sabotage` with `{ "variant": "v1" | "v2" | "v3" | "reset" }`

## Production links

- Marketplace: _set after the first Vercel production deployment_
- API base: _set after the first Azure Container Apps deployment_

Deployment and verification instructions are in [deploy/GATE_0.md](deploy/GATE_0.md). Product and architecture specifications are under [Docs](Docs/README.md).

## Security

Secrets belong in Azure Container Apps secret references, never in source or frontend configuration. `FORGE_ADMIN_KEY` and `MODEL_API_KEY` are reserved for later feature gates; Gate 0 neither reads nor exposes them.
