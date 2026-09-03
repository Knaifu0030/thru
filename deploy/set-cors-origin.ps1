param(
  [Parameter(Mandatory = $true)]
  [string]$Origin,
  [string]$ResourceGroup = "forge-rg",
  [string]$ContainerApp = "forge-backend"
)

try { $uri = [Uri]$Origin } catch { throw "Origin must be a valid absolute URL." }
if ($uri.Scheme -notin @("http", "https") -or $uri.AbsolutePath -ne "/" -or $uri.Query -or $uri.Fragment) { throw "Origin must be scheme plus host only, for example https://your-app.vercel.app" }
$normalized = $uri.GetLeftPart([UriPartial]::Authority).TrimEnd("/")
$current = az containerapp show --name $ContainerApp --resource-group $ResourceGroup --query "properties.template.containers[0].env[?name=='THRU_ALLOWED_ORIGINS'].value | [0]" --output tsv
$origins = @($current -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($origins -notcontains $normalized) { $origins += $normalized }
az containerapp update --name $ContainerApp --resource-group $ResourceGroup --set-env-vars "THRU_ALLOWED_ORIGINS=$($origins -join ',')" --output none
Write-Host "Allowed exact origin: $normalized"
