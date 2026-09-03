# 12 — DEPLOYMENT (Azure Container Apps + Vercel)

> Current MVP note (2026-09-03): the live canonical resources are `forge-rg` / `forge-backend` in Central India, with one 1 vCPU / 2 GiB replica and a 32 GB B1ms PostgreSQL server. Use [deploy/deploy-azure.ps1](../deploy/deploy-azure.ps1) for current names and settings; the generic commands below are retained as historical deployment guidance.

> This supersedes every "local-first" assumption elsewhere in the pack. THRU ships as: **one backend container on Azure** (THRU Engine + Registry + REST Gateway + MCP Gateway + internal mock site + admin endpoint) and **one Vite-built static frontend on Vercel** (the Marketplace UI) calling the backend's public URL. Read this before Prompt A in `08_AGENT_PROMPTS.md`.

## Why this split

| Piece | Where | Why |
|---|---|---|
| Backend (webcmd, registry, executor, healing, REST, MCP, mock site) | **Azure Container Apps** | Needs a real, persistent process running headless Chromium — not serverless-compatible. Container Apps gives a public HTTPS URL, autoscaling, and volume/env support with one CLI flow |
| Frontend (Marketplace UI) | **Vercel** | It's a static page polling a JSON endpoint — Vercel deploys it in one `git push`, free, instant HTTPS, zero server to manage |

The two talk over plain HTTPS + CORS. This is the same "everything calls run_skill()" architecture from `04` — only the transport between UI and backend is now the network instead of same-origin.

## §1 — Backend: Azure Container Apps

### Concept
One Docker image containing the Node/TypeScript backend with these route groups on one port:
```
GET  /registry              → marketplace data (cards)
GET|POST /skills/{id}       → REST gateway (run_skill)
POST /teach                 → admin-key-gated live teach endpoint (for the demo finale)
/mcp                         → MCP server (SSE or streamable-http, per webcmd/MCP SDK docs)
GET  /mock/hell-portal       → the parody mock site, served AS PART of this same app now
POST /admin/sabotage         → { variant: "v1"|"v2"|"v3" } — replaces sabotage.sh
GET  /health                 → liveness probe
```
**Why the mock site moved inside the backend:** it used to be `127.0.0.1:8000` reachable only from your laptop. In production there is no laptop in the loop — the mock site must be a route on the SAME public backend so the deployed executor can reach it, and so `sabotage.sh` (a local file-swap script) becomes `POST /admin/sabotage` (an in-memory or registry-stored variant flag flip). Same demo drama, cloud-shaped.

### Dockerfile

The production file is `backend/Dockerfile`. It uses a Node 20 multi-stage build, compiles TypeScript, prunes development dependencies, installs Chromium runtime dependencies and CloakBrowser, runs as the unprivileged `node` user, and exposes port 8080. Build it from the repository root so the `backend/` paths in the file resolve:

```powershell
docker build -f backend/Dockerfile -t thru-backend:latest .
```

Its runtime entry point is:

```dockerfile
EXPOSE 8080
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["sh", "-c", "Xvfb :99 -screen 0 1280x720x24 -nolisten tcp & until [ -S /tmp/.X11-unix/X99 ]; do sleep 0.1; done; exec node dist/server.js"]
```

Treat `backend/Dockerfile` as the source of truth; do not copy the abbreviated entry point above into a second Dockerfile.

### Deploy flow (Azure CLI — run once, redeploy is `az acr build` + `az containerapp update` after)
```bash
az login
az group create --name thru-rg --location centralindia
az acr create --name thruacr<uniquesuffix> --resource-group thru-rg --sku Basic --admin-enabled true
az acr build --registry thruacr<uniquesuffix> --image thru-backend:latest .

az containerapp env create --name thru-env --resource-group thru-rg --location centralindia

az containerapp create \
  --name thru-backend \
  --resource-group thru-rg \
  --environment thru-env \
  --image thruacr<uniquesuffix>.azurecr.io/thru-backend:latest \
  --registry-server thruacr<uniquesuffix>.azurecr.io \
  --target-port 8080 \
  --ingress external \
  --min-replicas 1 --max-replicas 1 \
  --cpu 1.0 --memory 2.0Gi \
  --env-vars THRU_ADMIN_KEY=secretref:admin-key THRU_DATABASE_URL=secretref:thru-database-url MODEL_API_KEY=secretref:model-key \
  --secrets admin-key=<pick-a-string> thru-database-url=<postgresql-url> model-key=<your-key>
```
This prints a public FQDN like `thru-backend.<region>.azurecontainerapps.io` — **this is your production API base.** Put it somewhere you won't lose it (cheatsheet, `.env.example`, README).

### Redeploy loop (use this all day as the agent ships changes)
```bash
az acr build --registry thruacr<uniquesuffix> --image thru-backend:latest .
az containerapp update --name thru-backend --resource-group thru-rg \
  --image thruacr<uniquesuffix>.azurecr.io/thru-backend:latest
```
Budget ~2–4 min per redeploy. **Deploy early and often** (first successful deploy by late morning, not saved for the end) — a working prod URL by lunchtime de-risks the entire afternoon; a first deploy attempted at 2 PM is how hackathon teams lose the day to a YAML typo.

### §1.1 — Non-negotiable settings
- `--min-replicas 1` — **critical.** Container Apps scales to zero by default; a scaled-to-zero app takes 10–30s to cold-start on the first request, which is exactly when a judge clicks your link. Never let this be 0 on demo day.
- `--ingress external` with HTTPS — Container Apps gives you TLS automatically on the generated domain. Don't bother with a custom domain today; no time value in it.
- Secrets via `--secrets` / `az containerapp secret set`, referenced in env vars — **never commit API keys to the repo**, even a hackathon one that's about to be public on GitHub (submission requirement!).

## §2 — Frontend: Vercel

- The Marketplace is a Vite-built React/TypeScript app under `frontend/`. In Vercel, set the **Root Directory** to `frontend`; the framework preset should resolve to Vite, the build command to `npm run build`, and the output directory to `dist`.
- Set `VITE_THRU_API_BASE` to the public Azure backend URL before building. Vite embeds `VITE_*` values into the browser bundle, so never put a secret in one. Teaching and key management use a server-issued management API key entered in Settings; keep `THRU_ADMIN_KEY` for Azure operator/CLI operations only.
- `frontend/vercel.json` supplies the SPA rewrite so direct visits to `/marketplace`, `/activity`, `/connect`, and `/settings` resolve to `index.html`.
- Connect the GitHub repository in Vercel for automatic deploys from `main`, or run `npx vercel --prod` from `frontend/` for a manual deploy.
- Vercel gives you `thru-<something>.vercel.app` — **this is your production frontend link**, the one you put in the submission form and the video.

## §3 — Storage Strategy (pick ONE, in order of speed)

**Primary:** use the managed PostgreSQL Flexible Server plus the mounted Azure Files share. PostgreSQL stores runs/events, API keys, teaching sessions, and immutable skill versions; Azure Files keeps JSON exports and browser artifacts. The current dev tier is one Container Apps replica (1 vCPU/2 GiB) and a 32 GB B1ms PostgreSQL disk, suitable for roughly ten concurrent users.
The five baseline `skills/*.skill.json` files are still baked into each image, so a clean revision always has a usable catalog. Live-created skills are also persisted through the PostgreSQL version table and Azure Files export in the current MVP deployment.

**Upgrade (if ahead of schedule, ~20–30 extra min): mount an Azure Files volume.**
```bash
az storage account create --name thrustorage<suffix> --resource-group thru-rg --sku Standard_LRS
az storage share create --name thru-skills --account-name thrustorage<suffix>
az containerapp env storage set --name thru-skills-storage --environment thru-env \
  --resource-group thru-rg --azure-file-account-name thrustorage<suffix> \
  --azure-file-share-name thru-skills --access-mode ReadWrite
# then reference this storage in the containerapp's volume mounts, mounted at /app/skills
```
The mounted share keeps artifacts available across revision replacement; keep it enabled while distributed worker leases and restore drills are added.

## §4 — CORS

The backend must allow the Vercel origin:
```
Access-Control-Allow-Origin: https://thru-<something>.vercel.app
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-THRU-Admin-Key
```
The current backend uses an explicit allowlist from `THRU_ALLOWED_ORIGINS` and echoes an allowed origin with `Vary: Origin`. Add the exact Vercel production origin before deployment; requests from other browser origins receive HTTP 403.

## §5 — What Changes in the Rest of the Pack (read these deltas)

- **`04_ARCHITECTURE.md`**: "Repo Layout" gains `Dockerfile`, `.dockerignore`, `frontend/` (Vercel root) split from backend root. Mock site section is now internal routes, not a separate localhost process.
- **`05_SELF_HEALING_AND_SAFETY.md` §F**: `sabotage.sh v2` becomes `curl -X POST $API/admin/sabotage -d '{"variant":"v2"}' -H "X-THRU-Admin-Key: ..."`. Same drama, works from anywhere including the demo laptop hitting the live prod URL.
- **`06_MVP_SCOPE_AND_BUILD.md`**: add "first successful deploy" as a named gate (§ below); acid tests now run against the **production URL**, not localhost.
- **`09_LAUNCH_DEMO_SCRIPT.md`**: every `localhost` reference becomes the Azure/Vercel URLs. This is strictly better on camera — a judge can open the Vercel link on their own phone mid-demo.
- **`10_HACKATHON_COMPLIANCE.md`**: the submission form's "project link" is now unambiguous — the Vercel Marketplace URL (primary) with the Azure API URL noted in the README for anyone testing curl/MCP directly.

## §6 — Revised Timeline Insert (slots into `06`'s table)

| When | Add this |
|---|---|
| ~10:00–10:20 | **Deploy skeleton EARLY**: an empty/hello-world backend to Azure + empty frontend to Vercel, just to prove the pipeline works before real features exist. This is the single highest-leverage 20 minutes of the day — a broken deploy pipeline discovered at 2 PM is a lost hackathon. |
| Every 60–90 min after | Redeploy backend with whatever's working (`az acr build` + `containerapp update`); Vercel redeploys itself on every git push — just keep pushing |
| ~13:00 | **GATE: production acid test** — run the 5 acid tests from `06` against the live URLs, not localhost. Record the finale sabotage sequence hitting the PRODUCTION `/admin/sabotage` endpoint — that recording is strictly more impressive than a local one |

## §7 — Deployment-Specific Edge Cases (append to `07`'s registry)

| # | Case | Required behavior |
|---|---|---|
| 63 🎯🛡 | Container Apps scaled to 0 right before demo/judging | `--min-replicas 1` set from the FIRST deploy, not added later; verify with `az containerapp show` at T-30 |
| 64 🎯 | Vercel deploy lags behind latest backend changes | Confirm both are actually live post-push: hit the Vercel URL AND curl the Azure `/health` right before demo, not "it should be fine" |
| 65 🛡 | API keys/admin key visible in a public GitHub repo | Verify `.env`, secrets, and keys are in `.gitignore` AND never appear in committed docker/CI files — grep the repo before making it public (submission requires public repo!) |
| 66 | CORS blocks the Vercel frontend from calling Azure | Test cross-origin call from the actual deployed Vercel URL, not from localhost pretending to be it — CORS bugs only show up cross-domain |
| 67 | Vercel origin missing from the CORS allowlist | Set the exact origin in `THRU_ALLOWED_ORIGINS`, redeploy, then verify `/health` and `/registry` from the deployed frontend. Keep admin endpoints protected by `X-THRU-Admin-Key`. |
| 68 🎯 | Judge tests the live link from their own device/network | This is now genuinely possible (it's public!) — treat it as upside, not a risk: your input validation and graceful failures (existing edge cases) protect you same as on stage |
| 69 | Container restarts mid-demo (Azure platform event, rare) | Baked-in skills (§3 primary strategy) mean a restart loses only skills taught during the current session, not your core 4–5 — acceptable, mention if it happens: "that's the container restarting — the core skills persist; that one was taught live this morning" |
| 70 🛡 | Public `/teach` (live-teach) endpoint abused by a stranger before your demo slot | Gate it behind `X-THRU-Admin-Key` from the start (already in the route list above) — don't ship it open even for a few hours |

## §8 — Pre-Demo Production Checklist (T-30, replaces/extends the local version in `09`)
- [ ] `az containerapp show --name thru-backend -o table` — confirm status Running, replicas ≥1
- [ ] `curl https://<azure-url>/health` returns 200 right now
- [ ] Open the Vercel URL in an incognito window — loads, cards populate
- [ ] Admin key works: one `/admin/sabotage` test call + `reset` back to v1 immediately after
- [ ] Repo is public, no secrets committed (grep check from #65)
- [ ] README has both URLs (Vercel = primary product link, Azure = API base for curl/MCP examples)
- [ ] One full acid-test pass against production, timestamped within the last hour
