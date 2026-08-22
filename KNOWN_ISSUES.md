# Known Issues

These are current MVP constraints, not hidden production claims.

- The public frontend can browse and run skills, but browser-based teaching requires an admin credential. Do not expose `VITE_THRU_ADMIN_KEY` in a public build; use the backend CLI for live teaching until server-side authentication or a proxy is implemented.
- API keys created in Settings are stored only in the current browser. The backend does not yet provide key-management endpoints.
- Dashboard time-series data is estimated from lifetime totals because the gateway does not yet retain a complete run log. The UI labels the chart accordingly.
- The backend runs one browser workflow at a time and queues concurrent work.
- Skills created into ephemeral container storage do not survive a container replacement unless they are baked into the image or Azure Files is configured.
- The Marketplace production URL must be added to `README.md` after the first Vercel production deployment.
