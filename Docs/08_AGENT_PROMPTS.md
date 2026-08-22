# 08 — AGENT PROMPTS

> Copy-paste prompts for focused implementation work. These prompts describe the current Node/TypeScript backend and React/Vite frontend; they do not assume the superseded static-HTML architecture.

## Prompt A — Establish a green baseline

```text
Read PRODUCT.md, README.md, Docs/03_SKILL_ARTIFACT_SPEC.md, and Docs/04_ARCHITECTURE.md. Preserve unrelated working-tree changes. Run the backend build and tests, then run the frontend production build. Report exact failures with file and line references before changing behavior.
```

## Prompt B — Implement or repair the backend

```text
Work in backend/. Keep the Skill artifact contract backward-compatible. All CLI, REST, MCP, and UI execution paths must use the same executor and RunEnvelope. Keep admin routes protected, validate inputs before launching WebCMD, and preserve the one-browser queue. Run npm test before handing off.
```

## Prompt C — Implement or repair the frontend

```text
Work in frontend/. Use the existing React, TypeScript, Vite, Tailwind, and component conventions. Keep all HTTP access in src/lib/api.ts. Handle loading, empty, network-error, invalid-input, queued, completed, needs_human, and portal_error states. Do not add fake metrics. Run npm run build and check every route in a real browser at desktop and mobile widths.
```

## Prompt D — Verify WebCMD centrality

```text
Trace every production execution path to the WebCMD runner. List the source file and line for exploration, replay, healing relocation, and diagnostics. Confirm no mock result bypass is presented as a real browser execution. Run the relevant backend tests and record any external-site limitation honestly.
```

## Prompt E — Production deployment

```text
Follow Docs/12_DEPLOYMENT.md and deploy the backend to Azure Container Apps and frontend/ to Vercel. Set VITE_THRU_API_BASE to the public Azure URL and add the exact Vercel origin to THRU_ALLOWED_ORIGINS. Never expose an admin key through a VITE_* variable in a public build. Verify health, registry loading, one skill run, one queued run, MCP tool discovery, and direct navigation to every frontend route.
```

## Prompt F — Security and reliability audit

```text
Audit for committed secrets, permissive CORS, unprotected admin routes, sensitive steps without gates, unsafe retries, unbounded request bodies, missing timeouts, non-atomic registry writes, and frontend leakage of admin credentials. Fix only confirmed issues, add regression coverage, and update KNOWN_ISSUES.md for limitations that remain.
```

## Prompt G — Submission freeze

```text
Do a release-only pass: backend build and tests, frontend production build, browser console check, production link checks, README accuracy, documentation link check, and a secret scan. Do not add features. Update KNOWN_ISSUES.md and the demo cheatsheet, then report the exact evidence for each checklist item in Docs/10_HACKATHON_COMPLIANCE.md.
```
