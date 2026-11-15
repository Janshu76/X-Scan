$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot
$PythonExe = 'C:\Users\Intel\AppData\Local\Programs\Python\Python314\python.exe'
if (-not (Test-Path -LiteralPath $PythonExe)) { throw "System Python was not found at $PythonExe" }
& $PythonExe -m backend.app.worker
