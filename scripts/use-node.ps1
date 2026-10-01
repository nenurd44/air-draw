# Dot-source from any directory: . ./scripts/use-node.ps1
$projectRoot = Split-Path $PSScriptRoot -Parent
$portableNode = Get-ChildItem "$projectRoot/.tools/node-*-win-x64" -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
if ($portableNode) { $env:Path = "$($portableNode.FullName);$env:Path" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js LTS from https://nodejs.org/ first.' }
