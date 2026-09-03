param(
  [string]$ResourceGroup = "forge-rg",
  [string]$ContainerApp = "forge-backend",
  [string]$AcrName = "forgeacraa8c18ec",
  [string]$Location = "centralindia",
  [string]$Environment = "forge-env",
  [string]$ImageTag = "latest",
  [Parameter(Mandatory=$true)][string]$AllowedOrigins,
  [string]$AdminKeySecretName = "thru-admin-key"
)
$ErrorActionPreference = "Stop"
# Keep one replica until the distributed queue/locking backend is deployed.
az account show | Out-Null
az group create --name $ResourceGroup --location $Location | Out-Null
az acr create --name $AcrName --resource-group $ResourceGroup --location $Location --sku Basic | Out-Null
# Build in Azure Container Registry so this deployment path only needs Azure CLI;
# Docker Desktop is not required on the operator workstation.
az acr build --registry $AcrName --image "thru-backend:$ImageTag" --file backend/Dockerfile . | Out-Null
$acrUser = az acr credential show --name $AcrName --query username -o tsv
$acrPassword = az acr credential show --name $AcrName --query passwords[0].value -o tsv
$adminKey = Read-Host "Enter THRU admin key" -AsSecureString
$adminPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminKey))
if (-not (az containerapp env show --name $Environment --resource-group $ResourceGroup 2>$null)) { az containerapp env create --name $Environment --resource-group $ResourceGroup --location $Location | Out-Null }
$exists = az containerapp show --name $ContainerApp --resource-group $ResourceGroup 2>$null
if ($exists) {
  az containerapp update --name $ContainerApp --resource-group $ResourceGroup --image "$AcrName.azurecr.io/thru-backend:$ImageTag" --set-env-vars "THRU_ALLOWED_ORIGINS=$AllowedOrigins" "THRU_ADMIN_KEY=secretref:$AdminKeySecretName" "THRU_RUNS_FILE=/app/data/runs.json" "THRU_KEYS_FILE=/app/data/keys.json" "THRU_TEACHING_FILE=/app/data/teaching-sessions.json" "THRU_SESSIONS_FILE=/app/data/sessions.json" "THRU_APPROVALS_FILE=/app/data/approvals.json" "THRU_RUN_RETENTION_DAYS=30" "THRU_RATE_LIMIT_PER_MINUTE=120" "THRU_QUEUE_MAX_DEPTH=100" --set-secrets "$AdminKeySecretName=$adminPlain" | Out-Null
} else {
  az containerapp create --name $ContainerApp --resource-group $ResourceGroup --environment $Environment --image "$AcrName.azurecr.io/thru-backend:$ImageTag" --registry-server "$AcrName.azurecr.io" --registry-username $acrUser --registry-password $acrPassword --target-port 8080 --ingress external --min-replicas 1 --max-replicas 1 --cpu 1.0 --memory 2.0Gi --secrets "$AdminKeySecretName=$adminPlain" --env-vars "THRU_ALLOWED_ORIGINS=$AllowedOrigins" "THRU_ADMIN_KEY=secretref:$AdminKeySecretName" "THRU_RUNS_FILE=/app/data/runs.json" "THRU_KEYS_FILE=/app/data/keys.json" "THRU_TEACHING_FILE=/app/data/teaching-sessions.json" "THRU_SESSIONS_FILE=/app/data/sessions.json" "THRU_APPROVALS_FILE=/app/data/approvals.json" "THRU_RATE_LIMIT_PER_MINUTE=120" "THRU_QUEUE_MAX_DEPTH=100" "THRU_RUN_RETENTION_DAYS=30" | Out-Null
}
az containerapp update --name $ContainerApp --resource-group $ResourceGroup --max-replicas 1 | Out-Null
az containerapp show --name $ContainerApp --resource-group $ResourceGroup --query properties.configuration.ingress.fqdn -o tsv
