# 12 — DEPLOYMENT (Azure Container Apps + Vercel)

> This supersedes every "local-first" assumption elsewhere in the pack. Forge ships as: **one backend container on Azure** (Forge Engine + Registry + REST Gateway + MCP Gateway + internal mock site + admin endpoint) and **one static frontend on Vercel** (the Marketplace UI) calling the backend's public URL. Read this before Prompt A in `08`.

## Why this split

| Piece | Where | Why |
|---|---|---|
| Backend (webcmd, registry, executor, healing, REST, MCP, mock site) | **Azure Container Apps** | Needs a real, persistent process running headless Chromium — not serverless-compatible. Container Apps gives a public HTTPS URL, autoscaling, and volume/env support with one CLI flow |
| Frontend (Marketplace UI) | **Vercel** | It's a static page polling a JSON endpoint — Vercel deploys it in one `git push`, free, instant HTTPS, zero server to manage |

The two talk over plain HTTPS + CORS. This is the same "everything calls run_skill()" architecture from `04` — only the transport between UI and backend is now the network instead of same-origin.

## §1 — Backend: Azure Container Apps

### Concept
One Docker image containing the whole backend (Node or Python, whichever the agent picked in Prompt A) with these route groups on one port:
```
GET  /registry              → marketplace data (cards)
GET|POST /skills/{id}       → REST gateway (run_skill)
POST /forge                 → admin-key-gated live forge endpoint (for the demo finale)
/mcp                         → MCP server (SSE or streamable-http, per webcmd/MCP SDK docs)
GET  /mock/hell-portal       → the parody mock site, served AS PART of this same app now
POST /admin/sabotage         → { variant: "v1"|"v2"|"v3" } — replaces sabotage.sh
GET  /health                 → liveness probe
```
**Why the mock site moved inside the backend:** it used to be `127.0.0.1:8000` reachable only from your laptop. In production there is no laptop in the loop — the mock site must be a route on the SAME public backend so the deployed executor can reach it, and so `sabotage.sh` (a local file-swap script) becomes `POST /admin/sabotage` (an in-memory or registry-stored variant flag flip). Same demo drama, cloud-shaped.

### Dockerfile (shape — agent fills in the exact base image per its language choice)
```dockerfile
FROM node:20-slim   # or python:3.12-slim — match Prompt A's language choice
# install chromium + webcmd's runtime deps per https://webcmd.dev/docs (READ THE REAL DOCS — don't guess apt packages)
WORKDIR /app
COPY package.json . 
RUN npm ci --omit=dev
COPY . .
# bake pre-forged skills into the image (see §3 storage strategy)
EXPOSE 8080
CMD ["node", "src/server.js"]
```
Keep the image lean; Container Apps cold-starts scale with image size, and you're setting min-replicas so cold start should barely matter (§4) — but don't tempt fate.

### Deploy flow (Azure CLI — run once, redeploy is `az acr build` + `az containerapp update` after)
```bash
az login
az group create --name forge-rg --location centralindia
az acr create --name forgeacr<uniquesuffix> --resource-group forge-rg --sku Basic --admin-enabled true
az acr build --registry forgeacr<uniquesuffix> --image forge-backend:latest .

az containerapp env create --name forge-env --resource-group forge-rg --location centralindia

az containerapp create \
  --name forge-backend \
  --resource-group forge-rg \
  --environment forge-env \
  --image forgeacr<uniquesuffix>.azurecr.io/forge-backend:latest \
  --registry-server forgeacr<uniquesuffix>.azurecr.io \
  --target-port 8080 \
  --ingress external \
  --min-replicas 1 --max-replicas 2 \
  --cpu 1.0 --memory 2.0Gi \
  --env-vars FORGE_ADMIN_KEY=secretref:admin-key MODEL_API_KEY=secretref:model-key \
  --secrets admin-key=<pick-a-string> model-key=<your-key>
```
This prints a public FQDN like `forge-backend.<region>.azurecontainerapps.io` — **this is your production API base.** Put it somewhere you won't lose it (cheatsheet, `.env.example`, README).

### Redeploy loop (use this all day as the agent ships changes)
```bash
az acr build --registry forgeacr<uniquesuffix> --image forge-backend:latest .
az containerapp update --name forge-backend --resource-group forge-rg \
  --image forgeacr<uniquesuffix>.azurecr.io/forge-backend:latest
```
Budget ~2–4 min per redeploy. **Deploy early and often** (first successful deploy by late morning, not saved for the end) — a working prod URL by lunchtime de-risks the entire afternoon; a first deploy attempted at 2 PM is how hackathon teams lose the day to a YAML typo.

### §1.1 — Non-negotiable settings
- `--min-replicas 1` — **critical.** Container Apps scales to zero by default; a scaled-to-zero app takes 10–30s to cold-start on the first request, which is exactly when a judge clicks your link. Never let this be 0 on demo day.
- `--ingress external` with HTTPS — Container Apps gives you TLS automatically on the generated domain. Don't bother with a custom domain today; no time value in it.
- Secrets via `--secrets` / `az containerapp secret set`, referenced in env vars — **never commit API keys to the repo**, even a hackathon one that's about to be public on GitHub (submission requirement!).

## §2 — Frontend: Vercel

- The Marketplace UI stays what `04_ARCHITECTURE.md` describes (single static HTML/CSS/JS, no build step) — Vercel deploys static output with zero config.
- Connect the GitHub repo in the Vercel dashboard → it auto-deploys on every push to main. Or `npx vercel --prod` from the repo root for a manual first deploy if the dashboard flow is slower to set up.
- The UI needs to know the backend URL. Since it's plain HTML/JS with no build step, hardcode it into a small `config.js` checked into the repo (`window.FORGE_API_BASE = "https://forge-backend.<region>.azurecontainerapps.io"`) rather than relying on a build-time env var substitution — simpler, and this is a hackathon day, not a 12-factor app.
- Vercel gives you `forge-<something>.vercel.app` — **this is your production frontend link**, the one you put in the submission form and the video.

## §3 — Storage Strategy (pick ONE, in order of speed)

**Primary (fast, recommended for today): bake skills into the image.**
Commit your forged `skills/*.skill.json` files to the repo. The Dockerfile `COPY`s them in. Every deploy ships with your core skills present — reliable for the demo, zero infra complexity. Skills forged live during a demo persist only until the next container restart, which is fine: you control when you redeploy, and you won't redeploy mid-demo (freeze rule from `06` still applies).

**Upgrade (if ahead of schedule, ~20–30 extra min): mount an Azure Files volume.**
```bash
az storage account create --name forgestorage<suffix> --resource-group forge-rg --sku Standard_LRS
az storage share create --name forge-skills --account-name forgestorage<suffix>
az containerapp env storage set --name forge-skills-storage --environment forge-env \
  --resource-group forge-rg --azure-file-account-name forgestorage<suffix> \
  --azure-file-share-name forge-skills --access-mode ReadWrite
# then reference this storage in the containerapp's volume mounts, mounted at /app/skills
```
This makes the registry genuinely persistent across restarts — closer to "real production." Do this only after the bake-in version is deployed and working; never let infra polish block the demo path.

**Do NOT** reach for a database today. Flat files on either strategy above are enough for the acid tests in `06` and reads honestly as an MVP choice, not a shortcut, if asked.

## §4 — CORS

The backend must allow the Vercel origin:
```
Access-Control-Allow-Origin: https://forge-<something>.vercel.app
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, X-Forge-Admin-Key
```
For speed today, a wildcard (`*`) on GET routes is acceptable and should be stated as a known simplification (see edge case #67) — tighten in Phase 1 of the roadmap, not today.

## §5 — What Changes in the Rest of the Pack (read these deltas)

- **`04_ARCHITECTURE.md`**: "Repo Layout" gains `Dockerfile`, `.dockerignore`, `frontend/` (Vercel root) split from backend root. Mock site section is now internal routes, not a separate localhost process.
- **`05_SELF_HEALING_AND_SAFETY.md` §F**: `sabotage.sh v2` becomes `curl -X POST $API/admin/sabotage -d '{"variant":"v2"}' -H "X-Forge-Admin-Key: ..."`. Same drama, works from anywhere including the demo laptop hitting the live prod URL.
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
| 67 | Wildcard CORS / open admin endpoints in "production" | Acceptable for demo day; disclose as a known simplification in KNOWN_ISSUES.md — honesty here reads as maturity, not a flaw |
| 68 🎯 | Judge tests the live link from their own device/network | This is now genuinely possible (it's public!) — treat it as upside, not a risk: your input validation and graceful failures (existing edge cases) protect you same as on stage |
| 69 | Container restarts mid-demo (Azure platform event, rare) | Baked-in skills (§3 primary strategy) mean a restart loses only same-session live-forged skills, not your core 4–5 — acceptable, mention if it happens: "that's the container restarting — the core skills persist, that one was live-forged this morning" |
| 70 🛡 | Public `/forge` (live-forge) endpoint abused by a stranger before your demo slot | Gate it behind `X-Forge-Admin-Key` from the start (already in the route list above) — don't ship it open even for a few hours |

## §8 — Pre-Demo Production Checklist (T-30, replaces/extends the local version in `09`)
- [ ] `az containerapp show --name forge-backend -o table` — confirm status Running, replicas ≥1
- [ ] `curl https://<azure-url>/health` returns 200 right now
- [ ] Open the Vercel URL in an incognito window — loads, cards populate
- [ ] Admin key works: one `/admin/sabotage` test call + `reset` back to v1 immediately after
- [ ] Repo is public, no secrets committed (grep check from #65)
- [ ] README has both URLs (Vercel = primary product link, Azure = API base for curl/MCP examples)
- [ ] One full acid-test pass against production, timestamped within the last hour
