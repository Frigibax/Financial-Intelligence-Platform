Set-Location $PSScriptRoot
if (Test-Path $PSScriptRoot\.venv\Scripts\Activate.ps1) {
    & $PSScriptRoot\.venv\Scripts\Activate.ps1
}
Write-Host ======================================================================== -ForegroundColor Cyan
Write-Host  MULTI-AGENT MARKET INTELLIGENCE (MAMI) - POWERSHELL RUNNER -ForegroundColor Cyan
Write-Host ======================================================================== -ForegroundColor Cyan
Write-Host [1] Generate 16-Page Institutional Financial Report (CLI)
Write-Host [2] Start Web Dashboard Server (Light Mode, http://localhost:8000)
Write-Host ========================================================================

$choice = Read-Host Enter choice [1 or 2, default=1]
if ($choice -eq 2) {
    Write-Host Launching Web Dashboard... -ForegroundColor Green
    python run.py --web
} else {
    $tick = Read-Host Enter Ticker Symbol [default=AAPL]
    if ([string]::IsNullOrWhiteSpace($tick)) { $tick = AAPL }
    Write-Host Generating 16-Page Dossier for $tick... -ForegroundColor Green
    python run.py --ticker $tick
}
