# NammaDocs

NammaDocs is a fictional civic-service demonstration powered by THRU. It accepts no real identity documents, credentials, OTPs, payments, or government submissions.

## Local development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` if the THRU API base needs to change. Fixture mode is development-only and must be enabled explicitly with `VITE_THRU_FIXTURE_MODE=true`; live failures never fall back silently.

## Vercel

Import the `thru` repository as a second Vercel project and set:

- Root directory: `nammadocs`
- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Production branch: `main`
- Environment: `VITE_THRU_API_BASE=https://forge-backend.mangosmoke-65ea4a06.centralindia.azurecontainerapps.io`

After the first production deployment, add the exact Vercel origin to `THRU_ALLOWED_ORIGINS` on the Azure Container App. Do not use a wildcard or add preview origins to production.
