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
docker build -f backend/Dockerfile -t forge-backend:gate0 .
docker run --rm -p 8080:8080 -e FORGE_ALLOWED_ORIGINS=http://localhost:3000 forge-backend:gate0
```

Serve `frontend/` on port 3000 and confirm the status page reaches the container.

## Azure backend

Choose a globally unique lowercase suffix before running these commands.

```powershell
$ForgeSuffix = '<unique-suffix>'
$ForgeRegistry = "forgeacr$ForgeSuffix"

az login
az extension add --name containerapp --upgrade
az group create --name forge-rg --location centralindia
az acr create --name $ForgeRegistry --resource-group forge-rg --sku Basic --admin-enabled true
az acr build --registry $ForgeRegistry --image forge-backend:gate0 -f backend/Dockerfile .
az containerapp env create --name forge-env --resource-group forge-rg --location centralindia
az containerapp create --name forge-backend --resource-group forge-rg --environment forge-env --image "$ForgeRegistry.azurecr.io/forge-backend:gate0" --registry-server "$ForgeRegistry.azurecr.io" --target-port 8080 --ingress external --min-replicas 1 --max-replicas 2 --cpu 1.0 --memory 2.0Gi --env-vars FORGE_ALLOWED_ORIGINS=http://localhost:3000
az containerapp show --name forge-backend --resource-group forge-rg --query properties.configuration.ingress.fqdn -o tsv
```

Record the FQDN as `https://<fqdn>` and verify `GET /health`.

## Vercel frontend

Replace the local URL in `frontend/config.js` with the Azure HTTPS base, commit that public configuration change, then deploy:

```powershell
vercel --cwd frontend
vercel --cwd frontend --prod
```

Capture the stable production origin, then restrict Azure CORS to it:

```powershell
az containerapp update --name forge-backend --resource-group forge-rg --set-env-vars FORGE_ALLOWED_ORIGINS=https://<project>.vercel.app
```

## Evidence and acceptance

Run `deploy/verify-gate0.ps1` with both production URLs. Then open the Vercel URL in an incognito window and on a second device/network; save the browser screenshot and verifier output outside Git under `gate0-evidence/`.

Confirm:

- Azure `/health` is 200 and the active revision is healthy.
- `minReplicas` is `1` and ingress is external.
- Vercel visibly reports “Forge deployment online.”
- Allowed-origin preflight returns 204 with the exact origin.
- A deliberately unapproved origin returns 403 and no permissive CORS header.
- `git grep` finds no credentials, tokens, cookies, or private browser data.

