# Gate 0 — Azure + Vercel deploy skeleton

The gate passes only when the production Vercel page fetches `/hello` from the production Azure Container App in a real browser.

## Prerequisites

- Docker Desktop or another Docker-compatible engine
- Azure CLI with the Container Apps extension
- Vercel CLI
- Authenticated Azure and Vercel accounts

Never place credentials in command history or committed files. Azure secrets are set interactively or through protected environment variables.

## Local verification

```powershell
cd backend
npm ci
npm run check
docker build -f backend/Dockerfile -t thru-backend:gate0 .
docker run --rm -p 8080:8080 -e THRU_ALLOWED_ORIGINS=http://localhost:3000 thru-backend:gate0
```

In a second terminal, start the Vite frontend and confirm it reaches the container:

```powershell
cd frontend
npm ci
npm run dev
```

Open `http://localhost:3000` and confirm the sidebar reports the gateway status.

## Azure backend

Choose a globally unique lowercase suffix before running these commands.

```powershell
$THRUSuffix = '<unique-suffix>'
$THRURegistry = "thruacr$THRUSuffix"

az login
az extension add --name containerapp --upgrade
az group create --name thru-rg --location centralindia
az acr create --name $THRURegistry --resource-group thru-rg --sku Basic --admin-enabled true
az acr build --registry $THRURegistry --image thru-backend:gate0 -f backend/Dockerfile .
az containerapp env create --name thru-env --resource-group thru-rg --location centralindia
az containerapp create --name forge-backend --resource-group forge-rg --environment forge-env --image "$THRURegistry.azurecr.io/thru-backend:gate0" --registry-server "$THRURegistry.azurecr.io" --target-port 8080 --ingress external --min-replicas 1 --max-replicas 1 --cpu 1.0 --memory 2.0Gi --env-vars THRU_ALLOWED_ORIGINS=http://localhost:3000
az containerapp show --name forge-backend --resource-group forge-rg --query properties.configuration.ingress.fqdn -o tsv
```

Record the FQDN as `https://<fqdn>` and verify `GET /health`.

## Vercel frontend

Set `VITE_THRU_API_BASE` to the Azure HTTPS base in the Vercel project settings. Configure the Vercel project with `frontend` as its root directory, `npm run build` as its build command, and `dist` as its output directory. Then deploy:

```powershell
vercel --cwd frontend
vercel --cwd frontend --prod
```

Capture the stable production origin, then restrict Azure CORS to it:

```powershell
az containerapp update --name forge-backend --resource-group forge-rg --set-env-vars THRU_ALLOWED_ORIGINS=https://<project>.vercel.app
```

## Evidence and acceptance

Run `deploy/verify-gate0.ps1` with both production URLs. Then open the Vercel URL in an incognito window and on a second device/network; save the browser screenshot and verifier output outside Git under `gate0-evidence/`.

Confirm:

- Azure `/health` is 200 and the active revision is healthy.
- `minReplicas` is `1` and ingress is external.
- Vercel loads the Marketplace and reports the gateway online in the sidebar.
- Allowed-origin preflight returns 204 with the exact origin.
- A deliberately unapproved origin returns 403 and no permissive CORS header.
- `git grep` finds no credentials, tokens, cookies, or private browser data.
