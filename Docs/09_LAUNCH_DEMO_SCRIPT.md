# 09 — LAUNCH DEMO SCRIPT (Video + Live)

> Structured as a product launch, not a project demo. Target video: 3–4 min. Live slot: same beats, compressed to fit. Every beat has a recorded fallback (noted ▶). Record segments separately as they start working during the day; stitch once at 13:30.

## §1 — Stage/Recording Setup
- Screen A (main): **live Vercel Marketplace URL** in browser, terminal beneath (18pt+, dark, high contrast)
- Screen B (side/hidden): demo_cheatsheet.txt (with the real Azure + Vercel URLs baked in), sabotage curl command ready, external MCP client pointed at the live Azure MCP endpoint, pre-connected once
- `--demo` masking ON · DND ON · chat apps quit · mock site is internal routes on the live backend (always up, since it's production) · demo inputs verified TODAY
- Confirm both live URLs respond right now: `curl <azure-url>/health` and load the Vercel URL fresh

## §2 — The Script

### Beat 0 — The Problem (0:00–0:25)
Face/voiceover over a shot of a real janky portal:
> "The web has a billion workflows and almost no APIs. And now a billion AI agents need to use them. Today, every team re-automates the same websites, badly, and every script dies the moment a site changes. We built Forge — where you teach a workflow once, and it becomes a skill anyone and any agent can use. Forever."

### Beat 1 — Cold Boot (0:25–0:40)
Marketplace on screen (the live Vercel URL, visible in the address bar): **empty**.
> "This is our marketplace — live in production right now, not running off my laptop. It's empty, because Forge knows nothing until it's taught. Let's teach it."

### Beat 2 — The First Forge (0:40–1:25) ▶
Terminal: `forge new` → goal + URL (the pre-tested real site). Narration streams; the "forging…" card animates onto the shelf; agent proposes the contract; you confirm.
> "It explored the site, figured out the workflow, inferred the inputs and outputs — and asked when it wasn't sure. And now—" *(card flips live)* "—skill forged."

### Beat 3 — Three Surfaces, One Skill (1:25–2:15) ▶ **the thesis moment**
> "Here's the point of Forge. That skill is already three things at once."
1. **Button:** click Use tab → form → Run → result renders. "For a human: a button."
2. **API:** copy the curl from the API tab, paste, run. Typed JSON. "For a developer: an endpoint. We just gave a website with no API… an API."
3. **AI tool:** switch to the external MCP client (Claude/other): "check PNR 852… for me" → it discovers and calls `forge_check_pnr` → answers.
> "For an agent: a tool it didn't have sixty seconds ago. One connection to Forge, and any agent can use the web like a human. Nothing was deployed. Nothing was restarted. We taught it — once."

### Beat 4 — The API That Refuses to Die (2:15–3:15) ▶ **the unkillable moment**
Split view: curl loop hitting the mock-site skill on the **live Azure URL** on the left (`200 … 200 …`), sabotage terminal right.
> "But websites change. That's what kills every scraper ever written. So — I'm going to vandalize this website, in production, while the API is being called."
Type the `curl -X POST <azure-url>/admin/sabotage -d '{"variant":"v2"}'` command visibly. Loop: `200 · 200 · (healing…) · 200 healed_success`. Card badge flips to 🩹 **on the live Marketplace**.
> "Renamed the button, moved it, added a popup — the skill noticed, found the button by *meaning*, repaired itself, and versioned up. Callers never saw an error. This is running in production, right now — not a script on my laptop." *(If rung 3 is solid: sabotage v3 → re-forge beat: "and when the change is too big to patch, it re-teaches itself just the broken step.")*

### Beat 5 — Trust (3:15–3:35) ▶
Show the 🔒 skill card; curl it → `needs_human` envelope on screen.
> "And the scary question — what stops agents from doing dangerous things with all these hands? Architecture. Anything sensitive — logins, OTPs, payments, submissions — requires a human, everywhere, by design. Agents get hands. Humans keep the keys."

### Beat 6 — The Close (3:35–4:00)
Marketplace full screen: 4–5 cards, stats lines, a heal badge, a lock.
> "Every skill here was taught, not programmed. Each one is a button, an API, and an AI tool — and they stay alive on their own. Built on webcmd: explore once, learn the workflow, reuse it forever. **Forge — where agents get their hands.**"

## §3 — Delivery Notes
- The demo's rhythm is *reveal → consequence*: never explain a feature before showing it.
- Silence while narration streams is good television; resist filling it.
- Speeding up forging footage 2× is fine (label it "2×"); splicing fake output is never fine.
- If judges/audience: the "vandalize it live" line lands best with a beat of eye contact before typing.

## §4 — Contingency Tree
```
Real site down at demo/record time?
 ├─ recon alternate up → forge/use that (skills are site-agnostic machinery)
 └─ all down → Beat 2–3 use the mock-site skill live (on the production URL) + real-site 
    segment from morning recording, with the honest line: "the portal being down is, 
    honestly, the best ad for this product."
Azure backend unreachable (rare, but check it isn't the demo network)?
 └─ Recorded segments of every beat exist from morning testing — play those, narrate live.
    Never revert to a local/localhost fallback for the LIVE demo — it undercuts the whole 
    "production" claim. If production is truly down, lead with the recordings honestly.
MCP client flakes live → Beat 3.3 plays as recording; offer live retry in Q&A.
Sabotage cache glitch → retry the admin call once; else play rehearsal recording of the 
same sequence (also hit against production, from earlier).
Total laptop death → phone recordings + narrate; also: anyone can pull up the live 
Vercel URL on THEIR OWN device since it's public — mention this as a safety net out loud 
if it happens ("actually — pull it up yourself, it's live").
```

## §5 — T-30 Checklist
- [ ] Charger in; DND on; sleep off; chat apps quit
- [ ] `curl <azure-url>/health` → 200, right now
- [ ] Vercel URL loads fresh in an incognito window, cards populate
- [ ] Mock site reset to v1 via `/admin/sabotage {"variant":"reset"}`; sabotage tested once and RESET
- [ ] Demo inputs verified alive today; cheatsheet (with real URLs) open on Screen B
- [ ] One warm run of every beat's command against production
- [ ] External MCP client connected to the live Azure MCP endpoint once and responding
- [ ] Recordings play WITH AUDIO on this machine; phone backups exist
- [ ] Marketplace shows fresh real stats (not stale morning numbers)
- [ ] Water. Breathe. You're launching a product today — for real, it's live.
