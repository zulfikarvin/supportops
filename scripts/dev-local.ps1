$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$webRoot = Join-Path $projectRoot 'apps/web'
$configPath = Join-Path $webRoot '.env.local'
if (!(Test-Path -LiteralPath $configPath)) { [IO.File]::WriteAllText($configPath, "SUPPORTOPS_AUTH_MODE=demo`n") }
$config = [IO.File]::ReadAllText($configPath)
if ($config -notmatch '(?m)^DIAGNOSTICS_URL=') { $config += "`nDIAGNOSTICS_URL=http://127.0.0.1:8001`n" }
$tokenMatch = [regex]::Match($config, '(?m)^DIAGNOSTICS_API_TOKEN=([^\r\n]*)')
if (!$tokenMatch.Success -or $tokenMatch.Groups[1].Value.Length -lt 32 -or $tokenMatch.Groups[1].Value -match '^replace-') {
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  $token = [BitConverter]::ToString($bytes).Replace('-', '')
  $config = [regex]::Replace($config, '(?m)^DIAGNOSTICS_API_TOKEN=[^\r\n]*\r?\n?', '')
  $config += "`nDIAGNOSTICS_API_TOKEN=$token`n"
} else { $token = $tokenMatch.Groups[1].Value }
[IO.File]::WriteAllText($configPath, $config)
$python = Join-Path $projectRoot 'services/diagnostics/.venv/Scripts/python.exe'
if (!(Test-Path -LiteralPath $python)) { throw 'Create services/diagnostics/.venv and install requirements.lock.txt as described in README.md.' }
$logRoot = Join-Path $projectRoot '.data'
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$env:DIAGNOSTICS_API_TOKEN = $token
if (!(Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue)) {
  Start-Process -FilePath $python -ArgumentList '-m','uvicorn','app:app','--host','127.0.0.1','--port','8001' -WorkingDirectory (Join-Path $projectRoot 'services/diagnostics') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot 'diagnostics.stdout.log') -RedirectStandardError (Join-Path $logRoot 'diagnostics.stderr.log') | Out-Null
}
if (!(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)) {
  $nextCli = '"' + (Join-Path $projectRoot 'node_modules/next/dist/bin/next') + '"'
  Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList $nextCli,'dev','--hostname','127.0.0.1' -WorkingDirectory $webRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot 'web.stdout.log') -RedirectStandardError (Join-Path $logRoot 'web.stderr.log') | Out-Null
}
Write-Output 'SupportOps starting at http://localhost:3000/login; diagnostics at http://127.0.0.1:8001. Logs are in .data/. Existing listeners are left running.'
