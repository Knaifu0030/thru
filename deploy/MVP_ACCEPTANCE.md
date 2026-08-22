# Backend MVP acceptance record

## Verified locally on 2026-08-22

- Webcmd 0.7.4 doctor: daemon ready, Cloak 0.4.5 connected, Chromium installed.
- Mock portal v1 succeeded through a real opaque Webcmd Session.
- Mock v2 relocated to the declared fallback and persisted a verified repair.
- Mock v3 re-created the changed button only and preserved the previous step in capped history.
- REST and MCP use the same `runSkill` entry point; MCP rebuilds its tool list from the live registry per request.
- REST sensitive execution returns `needs_human`; CLI approval requires exactly `APPROVE`.
- Public qualifications: `example-reference`, `httpbin-document`, and `cern-history` each passed 10 same-session warm runs plus 3 independent fresh-session runs with schema-valid outputs. Evidence is in `qualification-report.json`.
- Local suite: 28 tests cover REST/MCP, healing, rollback, iframe tables, new tabs, dynamic controls, empty results, popup dismissal, runtime safety, registry recovery, THRU proposals, queue order, and CLI exit codes.
- `npm audit --omit=dev`: zero known vulnerabilities.

## Verified on Azure Container Apps on 2026-08-22

- API base: `https://thru-backend.mangosmoke-65ea4a06.centralindia.azurecontainerapps.io`
- Resource group `thru-rg`, environment `thru-env`, application `thru-backend`, and Basic registry `thruacraa8c18ec` are provisioned in Central India.
- Revision `thru-backend--0000006` runs image `thru-backend:0.1.0-r6` as a non-root user with external HTTPS ingress, 1 CPU, 2 GiB memory, `minReplicas: 1`, and `maxReplicas: 2`.
- `/health` reports `status: ok`, Webcmd `0.7.4`, and `doctor: healthy`; the registry contains exactly five artifacts.
- A real public skill completed successfully through Cloak Chromium, the mock skill completed through the asynchronous queue, REST refused the sensitive skill before browser work, and MCP `tools/list` exposed the live registry tools.
- Container Apps uses an `EmptyDir` mount for `/dev/shm` and Xvfb for Webcmd's background browser runtime.

## Production acceptance still outstanding

Vercel deployment and exact-origin CORS proof, incognito and second-network checks, a long-lived external MCP-client propagation test, the model-assisted Azure OpenAI teaching smoke test, and recorded production sabotage/healing evidence remain. The backend API itself is deployed and functional.

`Docs/08_AGENT_PROMPTS.md` was not present in the workspace during this implementation and could not be reviewed for binding conflicts.
