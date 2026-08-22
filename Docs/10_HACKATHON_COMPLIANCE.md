# 10 — HACKATHON COMPLIANCE (SLAB × CAADS @ Christ University)

> The external constraints layer. Organizers stated failure to follow instructions may lead to disqualification, and projects without WebCMD will not be evaluated. Team lead owns this file.

## §1 — Event Facts
- Host: webcmd (self-learning browser infra) · Venue: Christ University, Bangalore · Solo or team ≤4
- Theme: build an agent solving a meaningful real-world browser workflow; official statement says **build-your-own-solution** — Forge qualifies directly (real problem, WebCMD-core, working prototype)
- Day shape: arrive 8:50 · start 9:00 · may leave after 13:00 if all submissions done · **hard deadline 15:00, no late submissions** (internal deadline 14:30)

## §2 — Judging (100 pts) → Forge mapping
| Criterion | Pts | Forge's answer | Demo beat |
|---|---|---|---|
| Live Reliability | 30 | Warm runs · stats lines on cards · curl wall-of-200s · queue discipline | Beats 3–4 |
| Real-World Usefulness | 25 | "No-API web + handless agents" problem; three audiences served per skill | Beats 0, 3 |
| Technical Depth & Recovery | 20 | Healing ladder live + interlock safety rules + version history | Beat 4 |
| Creativity | 15 | Meta-tool: marketplace of living skills; agents granting agents abilities | Beats 1, 3, 5 |
| Demo & Storytelling | 10 | Launch-structured script; growth arc from empty shelf | All |

**WebCMD centrality (evaluation gate):** webcmd is the Forge engine's exploration/execution core — name it in the video, the README, and be ready with file:line of every webcmd call (Prompt F audit output).

**Event hard rules honored by construction:** demos live or real-execution recordings only (no fakes, speed-ups labeled) · responsible building: own accounts, human approval on payments/messages/submissions/deletions (our Gates ARE this rule, productized — say so).

## §3 — Mandatory Submission Items
1. **WebCMD usage** — see above. Non-negotiable.
2. **Working solution** — acid tests in `06`.
3. **Demo video** — clear, shows solution + features + how it works; per `09`; uploaded, link public (test in incognito).
4. **LinkedIn post (compulsory)** — team leader only (solo: yourself). Must include: demo video, brief description, organizer/WebCMD tags (announced at venue — ask a volunteer by 13:00 if not shared). Public visibility. Draft ready by 11:30:
   > Launched **Forge** today at the CAADS × WebCMD SLAB Hackathon @ Christ University ⚒️ — teach it any website workflow once, and it becomes a Skill: a button for humans, a REST API for developers, and an MCP tool for AI agents. Skills live on a marketplace, and they self-heal when websites change — watch an API survive its own website being vandalized live in the video 👇 Sensitive actions stay human-approved by design. Built on [tags]. #SLABHackathon
5. **GitHub star + fork (compulsory, EVERY member)** — the official repo link drops at the venue → star, fork (button), complete the Google Form immediately (~9:15). Leader verifies all members' forks visible by 9:30.
6. **Project Submission Form** — leader only; every link tested in incognito first; our repo public with README (pitch line, **live Vercel URL as the primary product link**, Azure API base URL for anyone testing curl/MCP directly, quickstart, architecture, responsible-building section, KNOWN_ISSUES link). If the form asks for a "production link" or "live demo link" specifically — that's the Vercel URL. Verify it loads on a phone, not just your laptop, since it's genuinely public now.
7. **Proof screenshots uploaded with submission**: completed form · starred state · forked repo (recommended — do it). Named clearly, phone-backed.
8. **Feedback form (compulsory, EVERY member)** — gates attendance/Yellow Form. Do at 14:15, not "later".

## §4 — T-45 Final Sweep (14:15, read aloud together)
```
[ ] Code pushed · repo public · README has video link
[ ] Video uploaded · plays in incognito
[ ] LinkedIn post live · public · tagged · video attached · link in form
[ ] Submission form submitted (leader)
[ ] Proof screenshots uploaded: form ✓ star ✓ fork ✓
[ ] Star + fork + Google Form: EVERY member
[ ] Feedback form: EVERY member
[ ] All links re-tested in incognito AFTER submitting
[ ] Phone backups: video, screenshots, recordings
```

## §5 — Admin Failure Modes
| Risk | Mitigation |
|---|---|
| WiFi dies in the 14:00 upload window | First-cut video uploaded by 13:45; hotspot tested at 9:00 |
| LinkedIn video stuck processing | Upload by 13:45; ask volunteer whether YouTube-unlisted link in post is acceptable fallback |
| Tags not announced | Ask volunteer proactively at 13:00 (instruction #9: they'll help) |
| Leader's LinkedIn account issue | Second member logged in as standby poster |
| Submission form has surprise fields | Open and READ the full form at 13:00; draft every field by 14:00 |
| A member forgot star/fork/feedback | 9:15 rule + leader verification + 14:15 sweep exist for exactly this |
