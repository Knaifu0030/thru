# 02 — PRODUCT SPEC (Full Scope)

## The Three Faces (canonical definitions)

| Face | Audience | Surface | Verb |
|---|---|---|---|
| **The Forge** | Skill authors (power users, devs) | CLI (conversational) — later: web wizard | *teach* |
| **The Marketplace** | Everyone | Web UI (skill cards, search, try) | *browse / use / share* |
| **The Gateway** | Programs & agents | REST API + MCP server (same registry) | *call* |

One invariant rules the product: **everything is a view over the Skill Registry.** No face owns state; the skill artifact (see `03`) is the single source of truth. This keeps four surfaces from becoming four products.

---

## User Journeys (complete)

### J1 — Author forges a skill (supply)
1. `forge new` → conversational prompt: URL + goal ("check PNR status; input: 10-digit PNR; output: train, date, passenger statuses")
2. Agent explores via webcmd, narrating: what it's trying, what it found, what it's unsure about. On ambiguity it asks ("two similar buttons — 'Get Status' or 'Quick Check'?")
3. Agent proposes the skill contract: inferred input schema (types + validation), output schema, sensitivity flags per step
4. Author confirms → **"⚒ Skill forged: check-pnr v1"** → card appears on Marketplace, REST route registers hot, MCP tool list updates
5. Author runs it once from the card to verify. Stats begin accruing.

### J2 — Human uses a skill (demand, no code)
Opens Marketplace → searches "train" → card `check-pnr` → **Use tab**: auto-generated form (validated input) → Run → live narration streams → result rendered from output schema (table/values, not JSON). Total knowledge required: reading.

### J3 — Developer consumes a skill (demand, code)
Card → **API tab** → copy curl: `curl localhost:7431/skills/check-pnr?pnr=8524...` → typed JSON per the output schema. Errors are structured (`status: invalid_input | portal_error | needs_human | healed_success`). No SDK, no key (local MVP), no docs to read beyond the card.

### J4 — AI agent gains abilities (demand, the innovation)
Any MCP client adds one server: `forge gateway` URL. Instantly, every marketplace skill is a tool with name + description + input schema. Agent reasons "I need a PNR status → I have a tool for that" and calls it. **A skill forged at 10:14 is usable by every connected agent at 10:14.** Gated skills return `needs_human` with instructions rather than acting.

### J5 — A website changes (the immune system)
Skill run hits drift → healing ladder (retry → relocate-by-meaning → re-explore the broken step) → skill self-updates, version bumps → card badge: "🩹 self-healed 2m ago" → callers just see a slightly slower `healed_success`. Author gets a log entry, not a pager alert.

### J6 — Knowledge travels (portability)
`forge export check-pnr` → one `.skill.json` file → send to anyone → `forge import` → on their marketplace, instantly. Skills are files; knowledge is portable. (Future: `forge publish` to a shared cloud registry — see `11`.)

---

## Feature Map

### Core (MVP — the product IS this)
- **Forge engine**: goal+URL → exploration → skill artifact; conversational narration; ambiguity questions; schema inference (inputs typed + validated, outputs structured)
- **Skill Registry**: versioned artifacts, run stats, healing history, atomic writes, export/import
- **Executor**: fast replay, per-step verification (positive + negative checks), 90s budget
- **Healing ladder**: full 5 rungs + safety rules (`05`)
- **Human gates**: captcha/OTP/login/submit → pause+verify locally; `needs_human` over the Gateway
- **Marketplace UI**: cards (name, description, site, stats, heal badge), search, Use/API/Agent tabs, live "forging…" state, result rendering from output schema
- **REST Gateway**: hot-registered routes per skill, typed responses, structured errors
- **MCP Gateway**: skills-as-tools, live tool-list updates, schema passthrough

### Near-term (post-MVP, design for, don't build)
- **Composition**: skills calling skills; a composite skill type (chain w/ mapping) — pipes for the web
- **Watch mode**: any skill + schedule + change-condition = monitoring as a checkbox
- **Web-based forging wizard** (remove the CLI from J1 → authors go mainstream)
- **Shared registry** (`forge publish`): the marketplace stops being local — network effects switch on
- **Auth + API keys** on the Gateway; per-skill permissions ("this agent may read, not submit")
- **Skill test harness**: auto-generated smoke tests per skill, scheduled; heal proactively, not on-demand

### Later (the company)
Hosted gateways for teams · author revenue share per call · org-private skill libraries · skill certification/review · analytics ("your skill served 40k calls") · enterprise: legacy-system skills as an integration layer

### WON'T (MVP discipline — do not build, do not demo, do not imply built)
Cloud deployment · accounts/auth · payments · ratings/reviews backend · captcha/OTP automation (never, at any stage) · arbitrary-site guarantees · mobile

---

## Product Principles (tiebreakers when designing under pressure)

1. **The card is the product.** If a feature can't be felt from a marketplace card, it doesn't exist to users.
2. **Three-surface parity is sacred.** Any skill must work from button, curl, and MCP without author effort. A feature that breaks parity is wrong by definition.
3. **Narration over spinners.** The agent always says what it's doing in human sentences. Trust is built in the waiting moments.
4. **Honest failure is a feature.** `portal_error` with a recovery trail beats a fake 200. Never lie upward.
5. **Gates are visible, not buried.** Sensitive skills wear a 🔒 on their card. The permission layer is marketing, not fine print.
6. **MVP theater is allowed, deception isn't.** Grayed-out "future" UI (author avatars, install counts) shows the vision; claiming they work would cross the line.
