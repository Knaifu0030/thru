# Forge

Forge turns a learned website workflow into one portable Skill: a button for a human, a typed REST endpoint for a developer, and an MCP tool for an AI agent.

This repository currently contains **Gate 0**, the deploy skeleton that proves a public Azure Container Apps backend can communicate with a zero-build Vercel frontend over restricted CORS.

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

## Production links

- Marketplace: _set after the first Vercel production deployment_
- API base: _set after the first Azure Container Apps deployment_

Deployment and verification instructions are in [deploy/GATE_0.md](deploy/GATE_0.md). Product and architecture specifications are under [Docs](Docs/README.md).

## Security

Secrets belong in Azure Container Apps secret references, never in source or frontend configuration. `FORGE_ADMIN_KEY` and `MODEL_API_KEY` are reserved for later feature gates; Gate 0 neither reads nor exposes them.

