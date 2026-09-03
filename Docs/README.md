# THRU
### The place agents go to gain abilities.
**Teach it once. It's a button, an API, and an AI tool — forever. And it heals itself.**

---

## What This Pack Is

Complete documentation for THRU: the YC-grade product vision, the full product spec, the MVP build scope, technical contracts, and the hackathon execution layer (SLAB @ Christ University, powered by webcmd). Written for three readers: **you** (founder brain), **your coding agent** (build brain), and **a judge/investor** (the pitch itself lives in 01).

## Reading Order

| # | File | What it is | Primary reader |
|---|------|-----------|----------------|
| — | `README.md` | Navigation + the one-paragraph product | Everyone, first |
| 01 | `01_VISION_AND_PITCH.md` | The YC pitch: problem, why now, product, moat, market, model | Founder / judges |
| 02 | `02_PRODUCT_SPEC.md` | Full product: the three faces, user journeys, complete feature map | Founder + agent |
| 03 | `03_SKILL_ARTIFACT_SPEC.md` | The Skill file format — the platform bet. Exact JSON contracts | Coding agent |
| 04 | `04_ARCHITECTURE.md` | System design: THRU engine, Registry, REST + MCP Gateway, Marketplace UI | Coding agent |
| 05 | `05_SELF_HEALING_AND_SAFETY.md` | The healing ladder + human gates + trust model | Coding agent + Q&A |
| 06 | `06_MVP_SCOPE_AND_BUILD.md` | The one-day MVP cut, build order, timeline, definition of done | Both |
| 07 | `07_EDGE_CASES.md` | Acceptance-criteria edge registry (adapted for THRU) | Coding agent |
| 08 | `08_AGENT_PROMPTS.md` | Current build, verification, deployment, and audit prompts for a coding agent | You → agent |
| 09 | `09_LAUNCH_DEMO_SCRIPT.md` | The launch-style demo/video script + contingencies | You |
| 10 | `10_HACKATHON_COMPLIANCE.md` | SLAB/CAADS rules, judging map, submission checklist, deadlines | You (team lead) |
| 11 | `11_ROADMAP_AND_BUSINESS.md` | Post-MVP roadmap, business model, GTM, YC-application-style answers | Founder |
| 12 | `12_DEPLOYMENT.md` | **PRODUCTION HOSTING: Azure Container Apps (backend) + Vercel (frontend). Read this before Prompt A — it changes the architecture** | Coding agent, first day |
| 13 | `13_CODEBASE_STATUS.md` | Current implementation map, runtime paths, verification evidence, and boundaries | Everyone |
| 14 | `14_GAPS_AND_NEXT_STEPS.md` | Prioritized recovery backlog and delivery milestones | Team lead + coding agent |

## The Product in One Paragraph

The web has a billion workflows and almost no APIs — and now a billion AI agents need to use them. THRU lets anyone teach an agent a web workflow once, by demonstration and exploration (powered by webcmd). The result is a **Skill**: a portable artifact that is *simultaneously* a button a human can press, a typed REST endpoint a developer can call, and an MCP tool any AI agent can use — published to a marketplace where skills accumulate, and self-healing so that when websites change, skills repair themselves instead of dying. Supply side: people who demonstrate tasks. Demand side: every agent on earth, one MCP connection away from being able to act on the real web. **THRU is the app store for web capabilities.** Deployed live in production — backend on Azure Container Apps, Marketplace UI on Vercel — not a local demo.

## Ground Rules (unchanged from day one, still law)

1. The MVP scope in `06` is a contract. The WON'T list is load-bearing.
2. Record every working milestone immediately. Recordings compound; code regresses.
3. Human approval gates are a *product feature* (the agent-permission layer), never a workaround.
4. All demos are real executions. Speeding up is fine; faking is never.
5. Respect platform terms: own accounts, human-speed usage, read-mostly workflows, gates on anything that submits.
6. **Deploy early, deploy often.** Read `12_DEPLOYMENT.md` before Prompt A. A working production URL by mid-morning is a higher priority than any single feature — a broken deploy pipeline discovered at 2 PM loses the day regardless of how good the code is.
