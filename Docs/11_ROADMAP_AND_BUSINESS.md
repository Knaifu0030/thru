# 11 — ROADMAP & BUSINESS (Beyond the Hackathon)

> The "this could be a real product" layer: where it goes after today, how it makes money, and YC-application-style answers ready to adapt. Also your Q&A ammo for "what's next?"

## §1 — Roadmap

### Phase 0 — Today (hackathon MVP)
Local Forge · marketplace · REST+MCP gateway · self-healing · gates · 4–5 skills. Proof: the loop works and demos irresistibly.

### Phase 1 — The Sharable Registry (weeks)
`forge publish` → skills go to a shared cloud registry; `forge install <skill>` pulls them. Execution stays LOCAL (your browser, your sessions) — only the knowledge travels. This is the moment network effects switch on: every author makes every user's Forge more capable. Add: skill pages on the web, install counts (real now), author profiles, basic search/tags.

### Phase 2 — The Hosted Gateway (months)
Teams get a cloud gateway: one URL + API key, org-private skill libraries, managed browser execution for non-sensitive skills, audit logs of every agent call, per-skill permissions ("this agent may read, never submit"). This is the first *paid* product — it sells to agent-building teams as "hands-as-a-service with a permission layer."
Parallel: **skill test harness** — scheduled smoke runs per skill; heal proactively; uptime badges become trustworthy ("this skill: 99.2% over 30 days").

### Phase 3 — The Economy (the company)
Marketplace monetization: skill authors earn per call (App Store economics for web capabilities). Certification tier for high-stakes skills (reviewed, permission-audited). Enterprise: legacy systems without APIs get skill layers instead of integration projects — the sleeper market where six-figure integration budgets currently go.

### Threaded through all phases (never deferred)
The safety posture: human gates on sensitive actions at every tier, including hosted. It's the durable differentiator as agent-safety scrutiny grows — and the reason enterprises can say yes.

## §2 — Business Model

| Layer | Free | Paid |
|---|---|---|
| Local Forge (engine, your skills, your machine) | ✅ forever — this is distribution | — |
| Shared registry (publish/install public skills) | ✅ | — |
| Hosted Gateway (teams, keys, audit, private libraries) | trial | per-seat + metered skill calls |
| Marketplace economy | consume free tier | per-call pricing, author rev-share |
| Enterprise (private registries, certified skills, SLAs) | — | contracts |

Unit logic: a skill call replaces either an eng-maintained scraper (costly, brittle) or a human doing clicks (slow). Willingness to pay anchors to maintenance-hours saved, and healing directly attacks the #1 cost driver of the category.

## §3 — YC-Style Q&A (adapt, don't recite)

**What do you do?** Forge lets anyone teach an AI agent a website workflow once; it becomes a Skill — simultaneously a button, a REST API, and an MCP tool — published to a marketplace and self-healing when sites change. Agents connect once and can act on the API-less web.

**What's the insight others miss?** Learned browser workflows are *knowledge*, not code — so they should be acquired by demonstration, shared as artifacts, consumed on every surface, and kept alive automatically. Everyone else ships either a scraping API or a do-my-task agent; nobody ships the knowledge layer.

**Why now?** MCP standardized how tools reach agents; self-learning browser infra (webcmd) made explore-once-reuse a primitive; agents crossed into deployment and hit the actuation wall. The bottleneck moved from thinking to hands.

**Who needs this most?** Agent-building teams whose products die at the edge of the API'd web. Today they hand-roll Playwright per site and bleed maintenance. We're one URL.

**What have you built?** A working end-to-end MVP in a day: live forging on real sites, three-surface consumption, an API that survived its website being vandalized on camera, and a permission layer that keeps humans on every sensitive action. (Link video.)

**Competition, honestly?** Cloud website-to-API products (Parse.bot, Browsable, Browse AI, WrapAPI) validate demand. They're cloud-first (can't touch logged-in/personal/gov workflows), break silently on site changes, and serve one surface. We're local-first, self-healing, and one artifact serves humans+devs+agents. The compounding moat is the living skill library.

**Biggest risk?** (Say it before they do.) Site operators' tolerance of automation. Mitigations: human-speed local execution on the user's own sessions, gates on all side-effecting actions, terms-respect policy at forge time — and structurally, we're aligned with where the web must land as agents become normal users. Second risk: forging quality on hostile/complex sites — the healing ladder plus human-in-the-loop forging keeps the floor high while models raise the ceiling.

**Why you?** We built the working loop in six hours because we'd already engineered the hard part — verification-first execution and safety-bounded self-healing — before making it a platform. (True story. Tell it.)

## §4 — Post-Hackathon Week-One Checklist (momentum protocol)
- [ ] Clean the repo: real README, GIFs of beats 3–4, install instructions someone else can follow
- [ ] Publish the LinkedIn video natively on other channels (X, YouTube) — the vandalize-and-heal clip is the shareable atom
- [ ] Ship Phase-1 `forge publish/install` against a dead-simple hosted registry (even static hosting works)
- [ ] Get 3 outside users to forge one skill each; watch silently; fix the top 3 papercuts
- [ ] Write the launch post: "We taught websites to be APIs — and made the APIs immortal"
- [ ] THEN decide: side project, open-source play, or application season
