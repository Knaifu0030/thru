param(
  [Parameter(Mandatory=$true)][string]$ApiBase,
  [Parameter(Mandatory=$true)][string]$FrontendOrigin,
  [Parameter(Mandatory=$true)][string]$AdminKey,
  [string]$ResourceGroup = "forge-rg",
  [string]$ContainerApp = "forge-backend"
)
$ErrorActionPreference = "Stop"
$ApiBase = $ApiBase.TrimEnd("/"); $FrontendOrigin = $FrontendOrigin.TrimEnd("/")
$health = Invoke-RestMethod "$ApiBase/health"; if ($health.status -notin @("ok", "degraded")) { throw "Production health failed." }
$cors = Invoke-WebRequest "$ApiBase/hello" -Headers @{ Origin = $FrontendOrigin } -UseBasicParsing; if ($cors.Headers["Access-Control-Allow-Origin"] -ne $FrontendOrigin) { throw "Production CORS mismatch." }
$registry = Invoke-RestMethod "$ApiBase/registry"; if ($registry.skills.Count -ne 5) { throw "Production registry must contain exactly five skills." }
$safe = Invoke-RestMethod "$ApiBase/skills/example-reference"; if ($safe.status -notin @("success", "healed_success")) { throw "Production public skill failed." }
$gated = Invoke-RestMethod "$ApiBase/skills/sensitive-submit?certificate=DEMO-1234"; if ($gated.status -ne "needs_human") { throw "Production sensitive gate failed." }
$queuedResponse = Invoke-WebRequest "$ApiBase/skills/hell-check?certificate=DEMO-1234" -Headers @{ Prefer = "respond-async" } -UseBasicParsing; if ($queuedResponse.StatusCode -ne 202) { throw "Async execution did not return 202." }
$app = az containerapp show --resource-group $ResourceGroup --name $ContainerApp | ConvertFrom-Json
if (-not $app.properties.configuration.ingress.external) { throw "Container App ingress is not external." }
if ($app.properties.template.scale.minReplicas -ne 1) { throw "Container App minReplicas is not one." }
Write-Output "Production backend acceptance passed. Complete incognito, second-network, and external MCP-client evidence manually."
