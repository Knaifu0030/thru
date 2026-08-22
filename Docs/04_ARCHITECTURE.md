# 04 — ARCHITECTURE

## The One Diagram

```
                    ┌────────────────────────────────────────────┐
                    │              SKILL REGISTRY                 │
                    │   skills/*.skill.json  (source of truth)    │
                    │   atomic writes · .bak · versioned · stats  │
                    └────────┬──────────────┬──────────────┬─────┘
             reads/writes    │        reads │        reads │
        ┌────────────────────┴───┐   ┌──────┴───────┐  ┌───┴──────────────┐
        │      FORGE ENGINE       │   │   GATEWAY     │  │  MARKETPLACE UI   │
        │ explore (webcmd) ·      │   │ REST :7431    │  │ static page +     │
        │ schema inference ·      │   │ MCP  server   │  │ poll /registry    │
        │ narration · questions   │   │ hot routes ·  │  │ cards · search ·  │
        └───────────┬────────────┘   │ tool-list     │  │ Use/API/Agent tabs│
                    │                 │ updates       │  └──────────────────┘
                    ▼                 └──────┬───────┘
        ┌────────────────────────┐          │ every call
        │       EXECUTOR          │◄─────────┘
        │ replay · per-step verify│
        └───────────┬────────────┘
                    │ drift
                    ▼
        ┌────────────────────────┐     ┌────────────────────┐
        │    HEALING LADDER       │────►│   HUMAN GATES       │
        │ retry→relocate→reforge  │     │ local: pause+verify │
        │ →gate→graceful abort    │     │ gateway: needs_human│
        └────────────────────────┘     └────────────────────┘
```

**The architectural law:** all four consumer surfaces (CLI, REST, MCP, UI) call ONE function — `run_skill(id, inputs, context)` — and render its envelope. Context says who's asking (`local_human | rest | mcp`), which is how gates decide pause-vs-`needs_human`. One bug can't become four; one feature instantly becomes four.

## Components (contracts, not code)

### Skill Registry (`registry.*`)
- CRUD over `skills/*.skill.json` per `03` spec; schema-validate on load; quarantine invalid files (`skills/_invalid/`) rather than crash
- Emits change events (new/updated skill) → Gateway hot-reloads routes + MCP tool list; UI picks up via poll
- `export(id) → file`, `import(file) → id` with collision suffixing
- Atomic writes: temp + rename, `.bak` of last-good

### Forge Engine (`forge.*`)
- Input: `{goal_text, url, sample_inputs?}` → Output: a valid skill artifact
- Loop: webcmd exploration toward the goal → capture steps → for each step derive: `target_description` (plain English — this powers healing later), selector + ≥2 fallbacks (prefer stable attrs: name/label/aria/placeholder over ids), positive+negative expects, timeout, sensitivity classification
- **Schema inference**: from goal text + observed inputs/outputs, draft `contract.inputs` (with patterns where evident, e.g., 10 digits) and `contract.outputs` (from extracted structure). Present to author for confirm/edit before saving — inference proposes, human disposes.
- **Narration protocol**: every action → one line <80 chars, present tense ("Trying the search box… ✓"). Ambiguity → a QUESTION, not a guess, when the choice touches anything sensitive; otherwise best-guess + note.
- Sensitivity classifier: page/step containing password/otp/captcha/payment markers, or submit-class actions with side effects → `sensitive: true`. Over-flag, never under-flag.

### Executor (`executor.*`)
- Replays `workflow.steps` with per-step expects; 90s global budget; new-tab adoption; iframe re-resolution; scroll-and-settle extraction; idempotence guard before click-retries (verify expect first)
- On drift → classify (`TIMEOUT|MISSING|CHANGED|BLOCKED|HOSTILE`) → Healing Ladder
- Always returns the envelope (`03`), always updates vitals

### Healing Ladder + Gates → full spec in `05` (unchanged machinery, Forge-branded: rung 3 is "re-forge step")

### Gateway (`gateway.*`)
- **REST** (production: the single Azure public port, routed): `GET /registry` (marketplace data) · `GET|POST /skills/{id}` (query params or JSON body per input schema; validate BEFORE launching a browser) · `GET /skills/{id}/card` (single-skill metadata) · CORS allowing the Vercel origin (see `12_DEPLOYMENT.md` §4)
- **MCP**: SSE or streamable-http (per webcmd/MCP SDK docs) on the same public backend, exposing each non-quarantined skill as tool `forge_{id}` with description + input schema from the contract; tool result = the envelope. Registry change → tool-list update notification.
- Concurrency: MVP runs ONE browser workflow at a time (queue with position feedback: `{queued: 2}`). State it honestly; it's an MVP, not infinite-scale infra — and the queue is trivially demoable ("agents wait their turn politely").
- Gated skills over Gateway: never execute the sensitive step; return `needs_human` envelope with local-run instructions.
- `POST /forge` (live-forge for the demo finale) and `POST /admin/sabotage` are gated behind `X-Forge-Admin-Key` — public but not open (edge case #70).

### Marketplace UI (`marketplace/`)
- ONE static HTML file + fetch polling `GET /registry` every 2s. No framework, no build step (see `06` scope rules)
- Card: name · description · site · stats line ("17 runs · 94% · avg 6.1s") · version badge · 🩹 last-heal badge · 🔒 if sensitive
- Tabs per card: **Use** (form auto-generated from input schema w/ validation; Run streams narration via `GET /skills/{id}/stream` SSE if trivial, else poll a run-status endpoint; result rendered per `render_hint`) · **API** (curl snippet, pre-filled) · **Agent** (MCP tool name + one-line connect instructions)
- "Forging…" live card state while Forge Engine runs (registry writes a `_forging` stub) — the marketplace visibly *grows*, which is the product's heartbeat on screen
- MVP theater (allowed): grayed author avatar, grayed "Install count", grayed "Publish to cloud" button labeled *coming soon* — vision made visible, never claimed as working

## Repo Layout
```
forge/
├── backend/                 # deploys to Azure Container Apps as one Docker image
│   ├── Dockerfile
│   ├── src/ (registry, forge_engine, executor, healing, gates, gateway_rest, gateway_mcp, narrator, envelope, mock_portal_routes, admin_routes)
│   ├── skills/               # *.skill.json — THE PRODUCT. committed, baked into image (see docs/12 §3)
│   └── logs/ outputs/ recordings/
├── frontend/                 # deploys to Vercel as a static site
│   ├── index.html            # the Marketplace UI
│   └── config.js             # window.FORGE_API_BASE = "<azure-url>" — the only "wiring"
├── deploy/                   # az CLI scripts / notes, per docs/12
└── docs/                     # this pack
```

> ⚠️ **Production note (read `12_DEPLOYMENT.md` before building):** the backend is ONE deployed container on Azure Container Apps serving REST + MCP + the mock site + an admin endpoint, all as routes on one public HTTPS URL. The frontend is a separate static deploy on Vercel calling that URL over CORS. The "mock site" below is no longer a separate `127.0.0.1` process — it's internal routes on the same backend (`/mock/hell-portal`), and `sabotage.sh` becomes `POST /admin/sabotage` so the executor (also running on Azure) can reach it. Everything else in this file describes the LOGICAL architecture, which is unchanged — only the transport between the Marketplace UI and the backend is now the network instead of same-origin.

## Tech Rules
Boring wins: Python or Node (agent's choice, whichever integrates webcmd smoothest) · stdlib/minimal-dep HTTP server · static UI, zero build step · flat files (baked into the Docker image; optional Azure Files volume for real persistence, see `12` §3) · webcmd APIs from live docs (https://webcmd.dev/docs), never from memory · mock site now internal routes on the deployed backend, not a separate localhost process.
