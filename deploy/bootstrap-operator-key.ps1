param(
  [string]$ResourceGroup = "forge-rg",
  [string]$ContainerApp = "forge-backend"
)

$revision = az containerapp revision list --name $ContainerApp --resource-group $ResourceGroup --query "[?properties.active && properties.healthState=='Healthy'] | [-1].name" --output tsv
if (-not $revision) { throw "No healthy THRU revision is available." }
$replica = az containerapp replica list --name $ContainerApp --resource-group $ResourceGroup --revision $revision --query "[0].name" --output tsv
if (-not $replica) { throw "No running THRU replica is available." }

Write-Host "Minting a one-time management key inside $revision. Copy the value into THRU Settings; it will not be shown again."
az containerapp exec --name $ContainerApp --resource-group $ResourceGroup --revision $revision --replica $replica --command "node dist/bootstrap-key.js"
