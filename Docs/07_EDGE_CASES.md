# 07 — EDGE CASE REGISTRY (Forge Edition)

> Acceptance criteria for the coding agent. 🛡 = safety-critical (never ship without) · 🎯 = demo-critical. Cases carried over from the Sarkar-Proof registry keep their behaviors; new Forge-specific surfaces (Gateway, Marketplace, MCP, import/export) add sections F–I.
>
> ⚠️ **See also `12_DEPLOYMENT.md` §7 for cases 63–70** — Azure/Vercel production hosting edge cases (scale-to-zero, CORS, secrets in public repo, container restarts). Read those before Prompt A; they're as demo-critical as anything below.

## A. Network & Environment
| # | Case | Required behavior |
|---|---|---|
| 1 🎯 | Venue WiFi drops mid-run | Rung-1 retry; 2 failures → "check network/switch hotspot", pause for Enter locally; over Gateway → `portal_error` envelope with trail |
| 2 🎯 | Site at 10× latency | Per-step timeout 15s, ONE narrated auto-extension to 25s, then ladder |
| 3 | 5xx / maintenance page | Negative-check classify HOSTILE → rung 1 → graceful abort |
| 4 | Redirect chains (gov portals) | Follow; verify final page by `expect`; log chain |
| 5 | Cert errors on legacy sites | Never auto-ignore globally; local: human y/N; Gateway: `portal_error` |
| 6 | Laptop sleep mid-demo | OS sleep disabled (checklist); detect wall-clock jump >60s → restart current step |

## B. Page Structure & Selectors
| # | Case | Required behavior |
|---|---|---|
| 7 🎯 | Primary selector gone | Rung 2: fallbacks → text-sim ≥0.8 → label-proximity; learn fix; version bump |
| 8 | Element invisible/covered | Visibility check → scroll-into-view → overlay dismissal (#9) → rung 2 |
| 9 🎯 | Popup/cookie banner blocks | Dismissal heuristic: close-affordances INSIDE overlay only (✕/Close/Skip/No thanks); never overlay CTAs; unsure → gate |
| 10 | Dynamic IDs per session | Forging prefers stable attrs (name/label/aria/placeholder); flag ID-only selectors weak at forge time |
| 11 | Iframes | Record frame path at forge; re-resolve by URL/title, never index |
| 12 🎯 | Result opens new tab | Adopt newest tab if URL/title matches expect; close after extract |
| 13 | Lazy-load/infinite scroll | Scroll-and-settle: scroll, 500ms, check growth, max 5 |
| 14 | Legacy table-layout HTML | Extraction by header-map, never nth-child |
| 15 | Dropdown populated by JS | Wait for OPTIONS count>1, not element presence |
| 16 | XHR updates without navigation | Expects on content, never navigation events |
| 17 | Debounced inputs | If set-value fails verify → simulated typing w/ delays |
| 18 | Click races form-JS binding | Verify field stuck + 300ms settle before submit-class clicks |

## C. Auth, Sessions & Gates 🛡
| # | Case | Required behavior |
|---|---|---|
| 19 🛡 | Captcha (entry or submit) | ALWAYS gate. No solving, no services, no dodging. Post-human verify via expect |
| 20 🛡 | OTP required | Gate; agent never reads OTPs from anywhere (no mail/SMS integrations exist) |
| 21 🛡 | Unexpected login form | BLOCKED → gate; no stored credentials exist by design |
| 22 🛡 | Session expiry mid-run (login bounce) | Negative checks catch it → gate "session expired, please log in" → RESUME from failed step |
| 23 🛡 | Submit/pay/delete/send steps | Local: typed APPROVE required. Gateway: `needs_human`, never executed |
| 24 🛡 | Gateway call hits a gated/sensitive step | NEVER execute; `needs_human` envelope with local-run instructions (this is the permission layer working) |
| 25 | Existing browser-profile sessions | Reuse allowed; agent never creates sessions itself |

## D. Input & Data
| # | Case | Required behavior |
|---|---|---|
| 26 🎯 | Invalid input value (bad PNR) | Portal "invalid" text → clean `invalid_input` envelope, exit 0 locally; card shows honestly |
| 27 🎯 | Malformed input (fails schema) | Rejected at surface boundary (form validation / REST 400 / MCP error) BEFORE any browser launches |
| 28 | Unicode/Hindi in results | UTF-8 end-to-end; test once |
| 29 | Indian number formats (1,23,456) | Store raw + parsed |
| 30 | Ambiguous date formats | raw + ISO parsed; never guess mm/dd |
| 31 | Empty result set (valid query) | `success` with empty array + message; never a crash |

## E. Healing-Specific
| # | Case | Required behavior |
|---|---|---|
| 32 🎯 | Relocation finds wrong-but-plausible element | <0.8 similarity → never guess → rung 3; sensitive page → gate regardless (interlock rule 2) |
| 33 | Relocated fix still fails step expect | Roll back, never persist, escalate rung 3 (interlock 4) |
| 34 🎯 | Rung-3 exceeds 45s | Abort re-forge → gate with partial findings |
| 35 | Two drifts in one run | Ladder per-step re-entrant; 90s global budget; both narrated |
| 36 | Corrupted skill JSON | Validate on load → quarantine to `skills/_invalid/`, marketplace shows nothing broken; `.bak` restore path offered |
| 37 🎯 | Mock-site cache serves stale variant in finale | no-store meta + hard reload + `--fresh` flag; rehearse sequence 3× |

## F. Gateway (REST) — new
| # | Case | Required behavior |
|---|---|---|
| 38 🎯 | Two API calls arrive concurrently | MVP queue (one browser at a time): second gets `{queued: 1}` and waits (long-poll) or 202+retry hint; NEVER two browsers fighting |
| 39 | Call to nonexistent skill | 404 with `available_skills` list (agent-friendly) |
| 40 | Skill forged while server running | Hot route registration; no restart; `/registry` reflects within one poll |
| 41 | Caller sends extra/unknown params | Ignore unknowns; validate knowns; echo warnings in envelope |
| 42 | Long-running skill vs HTTP timeout | Respond within 60s: either envelope, or 202 + `run_id` and `GET /runs/{id}` (build the simplest that works; document which) |
| 43 🛡 | Port 7431 already taken | Fail loudly with the fix (`--port`); never silently bind elsewhere (breaks every printed curl) |

## G. Gateway (MCP) — new
| # | Case | Required behavior |
|---|---|---|
| 44 🎯 | Client connects before any skill exists | Empty tool list + one built-in `forge_help` tool describing the system (agent discovers what Forge IS) |
| 45 🎯 | Skill forged mid-session | Tool-list update notification; if client caches, next list call shows it — demo the propagation either way |
| 46 | Tool called with schema-invalid args | MCP error with the validation message; no browser launch (#27) |
| 47 | Envelope too verbose for model context | Tool result = compact envelope (status, data, one-line healing note); full trail via `forge_run_details` tool |
| 48 🛡 | MCP client tries a gated skill | `needs_human` as a normal tool RESULT (not protocol error) so the agent can relay instructions to its human |

## H. Marketplace UI — new
| # | Case | Required behavior |
|---|---|---|
| 49 🎯 | Registry changes while page open | 2s poll redraw; "forging…" stub card animates in — the growth heartbeat |
| 50 | Skill with huge/nested output | render_hint governs; fallback keyvalue with collapse; never wall-of-JSON in Use tab |
| 51 | Form for gated skill | Runs locally fine (human present); card wears 🔒; API/Agent tabs show needs_human note |
| 52 🎯 | Projector rendering | Cards legible at 1080p; test font sizes; demo dataset ≤6 cards so the shelf reads in one glance |
| 53 | XSS via skill description/site strings | Escape ALL registry strings in UI (skills are imported files = untrusted input) |

## I. Import/Export — new
| # | Case | Required behavior |
|---|---|---|
| 54 | Import id collision | Suffix `-2`; never overwrite |
| 55 🛡 | Imported skill has sensitive steps unflagged | Re-run sensitivity classifier on import; flag anything detected; imported trust is zero trust |
| 56 | Import invalid/older forge_spec | Reject with reason; quarantine copy |
| 57 | Export while skill mid-heal | Export last-committed version (atomic reads); never a half-written artifact |

## J. Demo-Day Human Factors 🎯
| # | Case | Required behavior |
|---|---|---|
| 58 🎯 | Live site down at demo time | Decision tree in `09` §4 — swap to recon alternate or recorded segment; mock-site beats run regardless (localhost can't be down) |
| 59 🎯 | Notification mid-demo | DND on, chat apps quit (checklist) |
| 60 🎯 | Typo under pressure | demo_cheatsheet.txt with exact commands; shell history pre-seeded |
| 61 | Judge: "forge MY site right now" | Offer as encore after scripted demo; pick simple public page; frame: "forging is exploratory — watch it think" (sets expectation that slow ≠ broken) |
| 62 🎯 | External MCP client misbehaves live | Recorded MCP segment as fallback; know your client's reconnect quirk in advance |
