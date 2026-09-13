$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$nexaNode = Join-Path $PSScriptRoot '../node-x64/node-v24.18.0-win-x64/node.exe'
if (-not (Test-Path -LiteralPath $nexaNode)) { throw 'The local Node runtime is missing.' }
& $nexaNode 'scripts/run-framework.mjs' dev --port 5173 --hostname 127.0.0.1
