# 01 — VISION & PITCH (YC-Grade)

## One-liner
**THRU turns any website into a skill any AI agent can use — taught by demonstration, shared through a marketplace, self-healing when sites change.**

## The Problem

Three collisions happening right now:

1. **The web is API-poor.** The overwhelming majority of web workflows — government portals, university systems, small-business dashboards, booking flows, legacy enterprise tools — have no API and never will. The interface is clicking, and clicking doesn't compose.
2. **Agents are exploding, but they're handless.** Every company is shipping AI agents. Those agents can reason, plan, and write — but the moment a task touches a website without an API, they're stuck. Browser automation exists, but it's bespoke, brittle, and rebuilt from scratch by every team for every site.
3. **The knowledge doesn't accumulate.** When one developer painstakingly automates a workflow, that knowledge dies in their repo. The next team re-learns the same website from zero. Humanity keeps re-solving solved websites.

The result: millions of developer-hours spent writing scrapers that break in two weeks, and millions of agents that can think but cannot act on most of the web.

## The Insight

A learned browser workflow is not code — it's **knowledge**. And knowledge wants three properties code doesn't have:
- It should be **acquirable by demonstration** ("watch me / figure it out"), not programming.
- It should be **usable by anyone** — human, program, or AI — once acquired by one.
- It should be **self-repairing**, because the thing it describes (a website) constantly changes.

Nobody has built the system where web-workflow knowledge is created once, shared like an artifact, consumed on every surface, and kept alive automatically. That's THRU.

## The Product (three faces, one system)

**① Teach — supply.** Point THRU at a URL with a plain-English goal. The agent explores (powered by webcmd's self-learning browser infrastructure), narrates what it learns, asks when unsure, and produces a **Skill**: name, description, typed inputs/outputs, learned workflow inside. Teaching feels like onboarding a capable operator, not writing a script.

**② The Marketplace — the shelf.** Every skill is a card: what it does, which site, live stats (runs, success rate, last self-heal), and three tabs — **Use** (a form + button for humans), **API** (copy-paste curl for developers), **Agent** (the MCP tool for AIs). One artifact, three audiences, zero translation. Browse, search, try, import.

**③ The Gateway — demand, and the core innovation.** One MCP endpoint. Any agent that connects gains *every skill in the marketplace as callable tools* — and every newly created skill propagates to all connected agents instantly. The same gateway speaks REST, so "turn any website into an API" is just the marketplace viewed through curl. **One connection, and your agent can use the web like a human.**

**The immune system:** skills verify every step when they run; when a website changes, a healing ladder (retry → relocate elements by meaning → re-explore the broken step) repairs the skill and writes the fix back. Marketplace cards wear "self-healed 2h ago" badges. Skills are alive.

**The permission layer:** any step involving login, OTP, captcha, payment, or submission is human-gated by construction. When an agent calls a gated skill, the Gateway returns "human approval required" rather than acting. This answers the question the entire agent ecosystem is nervously asking — *what stops agents from doing dangerous things on the web?* — with architecture, not policy.

## Why Now

- MCP is becoming the USB port of the agent world — a standard way to hand tools to any model. A skill marketplace exposed over MCP was not possible to distribute two years ago; now it's one URL.
- Self-learning browser infrastructure (webcmd) just made "explore once, reuse as a command" a primitive. THRU is the platform that primitive was waiting for.
- Agent adoption crossed from demos to deployment; the bottleneck moved from reasoning to *actuation*. Hands are the scarce resource. We sell hands.

## Why Us / Why This Wins

- **Local-first**: skills run in your browser with your sessions. Data never leaves. For logged-in, personal, or government workflows this isn't a preference — it's the requirement cloud competitors (Parse.bot, Browsable, Browse AI) structurally can't meet.
- **Self-healing as default**: competitors' endpoints break silently when sites change; ours re-learn. The maintenance cost that kills scraper products is our headline feature.
- **Multi-surface from one artifact**: others ship an API. We ship the same skill as button + API + AI tool, which means every created skill serves three markets at once.
- **Network effects in the artifact**: every skill created makes the marketplace more valuable to every connected agent. Supply compounds; the moat is the accumulated, living skill library — knowledge that stays repaired.

## Market (who pays, honestly)

Beachhead: **AI-agent builders** — teams shipping agents that need to act on API-less websites. They currently burn eng-months on brittle browser code. We're one MCP URL. (This is also exactly webcmd's audience — aligned incentives for partnership.)
Second: **developers & SMBs** replacing scraper maintenance and portal-heavy back-office chores.
Third (consume-only): **non-technical users** pressing buttons on skills others created — the accessibility surface, not the revenue engine, until the library is deep.

## Business Model (v1 hypothesis)

Free local core (teach + run your own skills). Paid: hosted Gateway (teams share a skill library; agents connect with an API key), usage-metered skill calls, and eventually a revenue-shared marketplace where skill authors earn per call — the App Store economics, applied to web capabilities. (Detail in `11_ROADMAP_AND_BUSINESS.md`.)

## The Demo That Proves It (90 seconds)

Empty marketplace → teach a skill live on a real site → the card appears → press its button (human) → curl it (developer) → connect a *separate* agent to the Gateway and watch it use the skill (AI) → then vandalize the website live and watch the skill heal while a curl loop prints `200 → healing → 200`. Taught, not programmed. Shared, not siloed. Alive, not brittle.

## The Sentence to Leave In the Room

**"Every agent can think. Almost none can act on the real web. THRU is where agents get their hands."**
