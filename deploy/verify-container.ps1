param([string]$Image = "thru-backend:local", [int]$HostPort = 18080)
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
docker build --file (Join-Path $repoRoot "backend/Dockerfile") --tag $Image $repoRoot
$container = docker run --detach --rm --name thru-mvp-verify --publish "${HostPort}:8080" --env THRU_ADMIN_KEY=container-test-key $Image
try {
  for ($attempt = 0; $attempt -lt 30; $attempt++) { try { $health = Invoke-RestMethod "http://127.0.0.1:$HostPort/health"; if ($health.status -in @("ok", "degraded")) { break } } catch {}; Start-Sleep -Seconds 1 }
  if (-not $health) { throw "Container did not become healthy." }
  $user = docker inspect --format "{{.Config.User}}" $container
  if (-not $user -or $user -eq "0" -or $user -eq "root") { throw "Container is not configured as non-root." }
  docker exec $container node dist/cli.js doctor
  foreach ($skill in @("example-reference", "httpbin-document", "cern-history")) { $result = Invoke-RestMethod "http://127.0.0.1:$HostPort/skills/$skill"; if ($result.status -notin @("success", "healed_success")) { throw "$skill failed in the container." } }
  $mock = Invoke-RestMethod "http://127.0.0.1:$HostPort/skills/hell-check?certificate=DEMO-1234"; if ($mock.status -notin @("success", "healed_success")) { throw "Mock skill failed in the container." }
  Write-Output "Container acceptance passed for $Image as user $user."
} finally { docker stop $container | Out-Null }
