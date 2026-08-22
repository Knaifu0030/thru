param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^https://')]
  [string]$ApiBase,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^https://')]
  [string]$FrontendOrigin
)

$ErrorActionPreference = 'Stop'
$ApiBase = $ApiBase.TrimEnd('/')
$FrontendOrigin = $FrontendOrigin.TrimEnd('/')

$health = Invoke-RestMethod -Uri "$ApiBase/health" -Method Get
if ($health.service -ne 'forge-backend') { throw 'Unexpected health response.' }

$preflight = Invoke-WebRequest -UseBasicParsing -Uri "$ApiBase/hello" -Method Options -Headers @{
  Origin = $FrontendOrigin
  'Access-Control-Request-Method' = 'GET'
  'Access-Control-Request-Headers' = 'Content-Type'
}
if ($preflight.StatusCode -ne 204) { throw 'Allowed-origin preflight did not return 204.' }
if ($preflight.Headers['Access-Control-Allow-Origin'] -ne $FrontendOrigin) {
  throw 'Allowed-origin CORS header does not match the frontend.'
}

try {
  Invoke-WebRequest -UseBasicParsing -Uri "$ApiBase/hello" -Method Get -Headers @{ Origin = 'https://unapproved.example' }
  throw 'Unapproved origin unexpectedly succeeded.'
} catch {
  if ($_.Exception.Response.StatusCode.value__ -ne 403) { throw }
}

$frontend = Invoke-WebRequest -UseBasicParsing -Uri $FrontendOrigin -Method Get
if ($frontend.StatusCode -ne 200) { throw 'Frontend did not return 200.' }

[PSCustomObject]@{
  Gate = 'Gate 0'
  Passed = $true
  Api = $ApiBase
  Frontend = $FrontendOrigin
  BackendStatus = $health.status
  WebcmdVersion = $health.webcmd.version
  VerifiedAt = (Get-Date).ToUniversalTime().ToString('o')
} | ConvertTo-Json
