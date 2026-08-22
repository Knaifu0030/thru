# Backend MVP acceptance record

## Verified locally on 2026-08-22

- Webcmd 0.7.4 doctor: daemon ready, Cloak 0.4.5 connected, Chromium installed.
- Mock portal v1 succeeded through a real opaque Webcmd Session.
- Mock v2 relocated to the declared fallback and persisted a verified repair.
- Mock v3 re-forged the changed button only and preserved the previous step in capped history.
- REST and MCP use the same `runSkill` entry point; MCP rebuilds its tool list from the live registry per request.
- REST sensitive execution returns `needs_human`; CLI approval requires exactly `APPROVE`.
- Public qualifications: `example-reference`, `httpbin-document`, and `cern-history` each passed 10 same-session warm runs plus 3 independent fresh-session runs with schema-valid outputs. Evidence is in `qualification-report.json`.
- Local suite: 26 tests cover REST/MCP, healing, rollback, iframe tables, new tabs, dynamic controls, empty results, popup dismissal, runtime safety, registry recovery, Forge proposals, queue order, and CLI exit codes.
- `npm audit --omit=dev`: zero known vulnerabilities.

## Production acceptance still requires owner infrastructure

Docker, Azure CLI, and Vercel CLI were not installed in the implementation environment. Container build/non-root execution, Azure Container Apps deployment, production CORS, external long-lived MCP-client verification, second-network testing, and the five recorded production acid tests therefore remain deployment gates rather than locally claimed successes.

`Docs/08_AGENT_PROMPTS.md` was not present in the workspace during this implementation and could not be reviewed for binding conflicts.
