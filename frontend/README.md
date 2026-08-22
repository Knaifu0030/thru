# THRU — Marketplace UI

React + TypeScript + Tailwind v4 + Framer Motion single-page app for the THRU
gateway. No mock data: every screen reads the live registry through one
data-access module, [src/lib/api.ts](src/lib/api.ts).

## Run it

```sh
# 1. backend (from repo root) — CORS defaults allow http://localhost:3000
cd backend && node dist/server.js

# 2. frontend — dev server is pinned to port 3000
cd frontend && npm install && npm run dev
```

To enable teaching locally, start the backend with `THRU_ADMIN_KEY=<key>` and
put the same value in `frontend/.env.local` as `VITE_THRU_ADMIN_KEY=<key>`.

## Point at production

One line — set the gateway URL and rebuild:

```sh
VITE_THRU_API_BASE=https://<your-container-app>.azurecontainerapps.io npm run build
```

Deploy `dist/` to Vercel (`vercel --cwd frontend --prod`; `vercel.json` already
carries the SPA rewrite). Then allow the Vercel origin on the backend:
`THRU_ALLOWED_ORIGINS=https://<project>.vercel.app`.

Never set `VITE_THRU_ADMIN_KEY` in a public deployment — Vite embeds every
`VITE_*` value in the client bundle.

## Structure

- `src/lib/api.ts` — the only place that talks HTTP. Registry, runs (sync +
  202/queued polling), two-phase teaching flow, health. Dashboard/activity views are
  derived from real registry vitals and history; the UI labels the derived
  chart as an estimate. API keys are browser-local until the gateway grows
  `/keys` routes — only this file changes when it does.
- `src/lib/store.tsx` — registry polling (2.5s), the live teaching session, and
  UI chrome state (drawer, modal, search).
- `src/components/ui` — primitives: PillButton, Chip, Badge, TabGroup,
  Skeleton, CountUp, HealPulse, CopyBlock, Field.
- `src/screens` — Dashboard, Marketplace, Activity, ConnectAgent, Settings.

## Motion note

Never put `AnimatePresence` or `layout`/`layoutId` elements inside a subtree
that an outer `AnimatePresence` will exit — the exit never completes and the
overlay can never unmount (this bit us with the drawer's tab indicator).
Overlays keep their scrim and panel as direct `AnimatePresence` children;
route transitions are mount-only.
