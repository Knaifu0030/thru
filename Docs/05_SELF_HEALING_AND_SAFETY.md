# 05 — SELF-HEALING & SAFETY (The Immune System + The Permission Layer)

> Machinery inherited from the Sarkar-Proof design, re-scoped for THRU. Two systems, one file, because they interlock: healing must never "heal around" a safety gate.

## A. Drift Detection

After every step, evaluate `expect` (≥1 positive + ≥1 negative check per step — negatives catch silent failures like session-expired bounces). Classify divergence:

```
DRIFT_TIMEOUT   slow/absent           → network/load
DRIFT_MISSING   selector empty        → layout change
DRIFT_CHANGED   found, behaves wrong  → renamed/moved
DRIFT_BLOCKED   captcha/login/otp     → human territory
DRIFT_HOSTILE   error/maintenance/5xx → portal-side
```

## B. The Healing Ladder (cheapest first; narrate every rung)

**Rung 1 — RETRY** (TIMEOUT/HOSTILE): backoff 2s→5s→10s, max 3, re-navigate last. `⚠ Site slow (2/3). Waiting 5s…`

**Rung 2 — RELOCATE** (MISSING/CHANGED): fallback selectors → text-similarity vs `target_description` (normalized; threshold ≥0.8) → label-proximity for inputs. On success: append selector to fallbacks, bump version, log to history. `⚠ 'Get Status' missing. Scanning… ✓ 'Check Status' (0.92). Learned. v3→v4.`

**Rung 3 — RELEARN STEP** (relocate failed): targeted re-exploration of ONLY the failed step + successor, goal = the step's `target_description`. Timebox 45s. Success → rewrite steps, bump version, continue run. `⚠ Layout changed too much to patch. Re-teaching this step… ✓ New path. Continuing.`

**Rung 4 — HUMAN GATE** (BLOCKED always; rung-3 failure): see section C.

**Rung 5 — GRACEFUL ABORT**: envelope `status: portal_error` with full `healing` trail of every rung attempted; vitals updated honestly; card shows the failure. Honest failure is a feature.

## C. Human Gates (the Permission Layer)

Triggers: step flagged `sensitive: true`, or runtime detection of captcha / OTP / login form / payment markers / submit-with-side-effects.

**Local context** (CLI or Use tab, human present): pause + bell + plain ask (`⏸ This site wants a captcha. That's a human's job — by design.`) → human acts → **verify** the post-human state via the step's `expect` → continue. Submit-class steps require typed `APPROVE`, not just Enter.

**Gateway context** (REST/MCP, no human guaranteed): NEVER execute the sensitive step. Return `needs_human` envelope with instructions for a local, human-present run. This is the product answer to "what stops agents from doing dangerous things on the web": the marketplace can hand an agent a thousand hands, and every dangerous finger still requires a human. Sell this; don't bury it.

## D. Interlock Rules (healing × safety — the agent enforces ALL)

1. **Global healing budget 90s/run.** The ladder must not loop on stage or in an API call.
2. **Sensitive-context lockout:** relocation may never select a submit-like element on a page containing payment/OTP/password markers — route to gate instead. (Prevents "recovered" ≠ "clicked the wrong dangerous button".)
3. **Gate inheritance:** re-created steps inherit the sensitivity flags of what they replace; healing can ADD flags, never remove. Only an explicit author edit can de-flag, and it version-bumps with reason `author:deflag`.
4. **Rollback on failed fix:** a relocation whose step-level `expect` still fails is rolled back, never persisted; escalate to rung 3.
5. **Idempotence guard:** before retrying any click, check whether it already succeeded (evaluate `expect` first) — the anti-double-submission rule.
6. **Append-only history**, full previous step embedded, cap 10 — diff-able, revertible, judge-showable.

## E. Trust Surface (how safety is SHOWN, not just done)

- 🔒 on sensitive skill cards; gate events logged and visible on the card's history
- `healed_success` status never masquerades as plain success — the immune system advertises itself
- `thru doctor` verifies env + confirms zero code paths for captcha/OTP automation (greppable claim, and the Prompt-E audit in `08` produces file:line proof)
- Demo language: **"by design, not by limitation"** — every time a gate fires

## F. The Mock Site (test bed + finale stage)

Parody legacy portal ("DEMOLAND CERTIFICATE STATUS VERIFICATION" — marquee, gradient header, one form). Variants: v1 baseline · v2 button renamed+moved, cookie-popup added (exercises rung 2 + overlay dismissal) · v3 field ids changed, layout reflowed, decoy input (exercises rung 3).

**Production shape (per `12_DEPLOYMENT.md`):** served as internal routes on the SAME deployed backend (`GET /mock/hell-portal`), not a separate localhost process — the deployed executor must be able to reach it, and there's no laptop in the loop once it's live. The variant is a flag in memory/registry, flipped by `POST /admin/sabotage {"variant":"v2"}` behind the admin key, instead of a shell script swapping files. Same demo, cloud-shaped. (Local dev before first deploy can still use a quick localhost server for faster iteration — just don't let that be the thing you demo from.)

**Finale choreography (now against the production URL):** a curl loop running against `https://<azure-url>/skills/hell-check` on one screen → `curl -X POST https://<azure-url>/admin/sabotage -d '{"variant":"v2"}' -H "X-THRU-Admin-Key: ..."` typed visibly → loop prints `200 · 200 · (healing…) · 200(healed_success)` → card badge updates on the live Vercel Marketplace → optional v3 for the re-thru rung. An API that survives its backend being vandalized, live, in production.
