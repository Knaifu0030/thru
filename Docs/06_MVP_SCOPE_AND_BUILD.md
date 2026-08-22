# 06 — MVP SCOPE & BUILD PLAN

## Definition of the MVP (product language)

A local-first THRU where: a skill can be created conversationally on a real website; the instant it exists it is usable as a button (Marketplace), an endpoint (REST), and a tool (MCP); skills self-heal when sites change; sensitive actions are human-gated everywhere. Shipped with 4–5 skills spanning categories so the marketplace reads as a marketplace.

**MVP acid test (all must be true before "done" — run against the PRODUCTION URLs, per `12_DEPLOYMENT.md`, not localhost):**
1. `thru new` (or the admin `/teach` endpoint) → real site → skill card appears on the LIVE Vercel Marketplace without restarting anything
2. The SAME skill runs from: Use-tab button on the live Marketplace · curl against the Azure URL · an external MCP client connected to the Azure MCP endpoint — three surfaces, zero author effort
3. Sabotage the mock site (via `POST /admin/sabotage` on the live backend) while a curl loop runs against the production URL → `healed_success` appears, card badge updates on the live Marketplace
4. A gated skill over REST/MCP (hit against the production URL) returns `needs_human` (and works locally with a human present, run against the same production backend)
5. `thru export` → `thru import` → skill runs — demoable locally; production persistence strategy is the image-bake approach in `12` §3

## The MUST / SHOULD / THEATER / WON'T ledger

**MUST (the acid test, decomposed):** Registry (validate/quarantine/atomic/events) · THRU engine (explore, narrate, infer schemas, confirm, save) · Executor (verify, envelope, vitals) · Healing rungs 1–2 · Gates (local pause+verify; gateway needs_human) · REST gateway w/ hot routes + input validation + CORS · MCP gateway w/ tool-list updates · Marketplace page (cards, search, three tabs, form-gen, teaching state) · Mock site v1–v3 as internal routes + admin sabotage endpoint · 3 real skills + 1 mock skill · export/import · **production deploy: backend live on Azure Container Apps with min-replicas≥1, frontend live on Vercel, both reachable and CORS-connected** (see `12_DEPLOYMENT.md`)

**SHOULD (in descending value-per-hour):** Healing rung 3 (re-teach) · `healed_success` curl-loop demo polish · SSE narration streaming to the Use tab (else poll) · run queue w/ position feedback · `thru doctor` · 5th skill (one composition OR one more real site)

**THEATER (build only as static UI, clearly future):** author avatars · install counts · "Publish to cloud (coming soon)" button · ratings stars grayed

**WON'T:** cloud · auth · payments · captcha/OTP automation (never) · frameworks/build steps for the UI · DB · more than 5 skills

## Build Order (dependency-honest, deploy-skeleton-first, mock-site-second)

```
DEPLOY SKELETON (hello-world backend → Azure, hello-world frontend → Vercel, CORS proven)
  → mock_site as internal backend routes (zero external deps — dev target)
  → registry + skill schema validation
  → teach engine v0 (manual-assist teaching OK at first: agent explores, you confirm)
  → executor + envelope + vitals          ← develop against mock v1
  → REST gateway (hot routes)             ← curl works against PRODUCTION: first surface live
  → marketplace page (cards + Use tab)    ← deployed to Vercel: second surface
  → MCP gateway                           ← third surface (the innovation moment exists, in prod)
  → healing r1–r2 + gates                 ← sabotage v2 demo works against production
  → real skills: pnr → uni-results → (one more)
  → healing r3 · export/import · polish · theater elements
```

Rationale: the deploy skeleton goes FIRST now, before even the mock site — a broken CI/deploy pipeline discovered late is the single biggest risk in a production-hosted hackathon project, so it gets proven with nothing at stake before any real feature depends on it. Surfaces before healing remains true — the three-surface moment is the product's soul and de-risks the pitch earliest; healing then upgrades an already-demoable production product into an unkillable one.

## Hackathon-Day Timeline (9:00 → 3:00, two tracks from mid-morning)

| Time | Track A — build (agent, you verifying) | Track B — you, parallel |
|---|---|---|
| 9:00–9:30 | Prompt A bootstrap · read `12_DEPLOYMENT.md` · webcmd hello-world · repo scaffold (backend/ + frontend/) | Star/fork/repo form the moment link drops · portal recon · verify demo inputs |
| 9:30–10:00 | Azure account/CLI ready · Vercel account ready · Dockerfile skeleton | — |
| 10:00–10:20 | ✅ **GATE 0: deploy skeleton** — hello-world backend live on Azure, hello-world frontend live on Vercel, CORS proven between them. Do NOT skip this even if it feels early | — |
| 10:20–11:00 | Mock site as internal routes · registry · schemas · teach v0 + executor vs mock v1 (still redeployed to Azure as it's built, not left local) | — (watch, unblock) |
| 11:00–11:30 | **THRU first real skill (pnr)**, redeploy → ✅ **GATE 1: curl a real-site skill on the PRODUCTION Azure URL** — record it | Draft LinkedIn text + repo README skeleton (with URLs once known) |
| 11:30–12:15 | Marketplace page → Vercel deploy → MCP gateway → ✅ **GATE 2: three-surface moment, all against production** — record immediately, all three in one take | Prep external MCP client pointed at the Azure URL |
| 12:15–13:00 | Healing r1–r2 + gates + `/admin/sabotage` endpoint → ✅ **GATE 3: curl-loop sabotage demo against production** — record | Record B-roll: teaching narration, live Marketplace growing on Vercel |
| 13:00–13:30 | Skills 2–3 (uni-results + one more), redeploy · export/import · r3 if green | Gated-skill recording (needs_human + local human run against production) |
| 13:30–14:00 | Freeze · Prompt-G audit (incl. secrets/CORS checks) · KNOWN_ISSUES · cheatsheet with production URLs · final push+deploy | **Edit final video** (structure in `09`, using production URLs on screen) |
| 14:00–14:30 | Buffer for gate failures only | Upload video → LinkedIn post → submission form (Vercel URL as project link) → proofs → feedback form |
| 14:30–15:00 | — | Re-test every link in incognito, INCLUDING the production Vercel/Azure links. Internal deadline 14:30; hard 15:00 |

**Gate slip protocol (re-order, don't cut):** GATE 0 slipping is the one true emergency — if Azure/Vercel deploy isn't working by ~10:45, stop other work and get organizer/volunteer help immediately (per `10` §9), because everything downstream assumes a working production pipeline. GATE 1 slips → marketplace page gets built against mock-site skill while agent debugs the real site, still deployed. GATE 2 slips on MCP → demo two surfaces + MCP as recorded segment, agent keeps debugging in background. GATE 3 slips → healing demo = rung-2-only on v2 (skip v3), still a heal on camera, still in production. Only 15:00 is immovable.

## Definition of DONE checklist
- [ ] Acid tests 1–5 pass against PRODUCTION (Azure + Vercel URLs), each recorded
- [ ] Backend live on Azure Container Apps, `--min-replicas 1`, `/health` returns 200
- [ ] Frontend live on Vercel, loads in incognito, cards populate from the Azure `/registry`
- [ ] 4+ skills on the shelf (3 real sites + mock), one wearing 🔒
- [ ] Envelope statuses all reachable and honest (`success/healed_success/invalid_input/portal_error/needs_human`)
- [ ] Safety audit (Prompt G) clean: gates real, no captcha/OTP code paths, file:line proof, no secrets in the public repo
- [ ] Marketplace readable by a stranger in 10 seconds (the card-is-the-product test) — from their OWN device, since it's public now
- [ ] Video final cut done, shot against production URLs · everything in `10_HACKATHON_COMPLIANCE.md` ticked
