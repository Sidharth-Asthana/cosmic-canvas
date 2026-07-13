# Cosmic Canvas — one-time setup.
# 1. Links the wallpaper package into Lively's library (junction, so fetches
#    land in the live wallpaper instantly).
# 2. Runs an initial fetch if the image folder is empty.
# 3. Registers a daily scheduled task for the fetcher (9:00 + at logon,
#    catch-up if missed).
# Run from a normal (non-admin) PowerShell:  .\install.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "== Cosmic Canvas setup ==" -ForegroundColor Cyan

# --- 1. Locate Lively (Microsoft Store version) and link the wallpaper ---
$pkg = Get-ChildItem "$env:LOCALAPPDATA\Packages" -Directory -Filter "12030rocksdanister.LivelyWallpaper_*" |
    Select-Object -First 1
if (-not $pkg) {
    throw "Lively Wallpaper (Microsoft Store version) not found. Install it from the Store, run it once, then re-run this script."
}
$library = Join-Path $pkg.FullName "LocalCache\Local\Lively Wallpaper\Library\wallpapers"
New-Item -ItemType Directory -Force -Path $library | Out-Null

$link = Join-Path $library "CosmicCanvas"
if (Test-Path $link) {
    $existing = Get-Item $link -Force
    if ($existing.LinkType -eq "Junction") {
        Write-Host "Junction already exists: $link"
    } else {
        throw "$link exists and is not a junction. Remove it manually and re-run."
    }
} else {
    New-Item -ItemType Junction -Path $link -Target (Join-Path $root "wallpaper") | Out-Null
    Write-Host "Linked wallpaper into Lively library: $link"
}

# --- 2. Initial fetch if there are no images yet ---
$python = "C:\Python314\python.exe"
$pythonw = "C:\Python314\pythonw.exe"
if (-not (Test-Path $python)) { $python = (Get-Command python).Source }
if (-not (Test-Path $pythonw)) { $pythonw = $python }

$imageCount = (Get-ChildItem (Join-Path $root "wallpaper\images") -Filter *.jpg -ErrorAction SilentlyContinue | Measure-Object).Count
if ($imageCount -eq 0) {
    Write-Host "No images yet - running the fetcher (takes a few minutes)..."
    & $python (Join-Path $root "fetcher\fetch.py")
} else {
    Write-Host "$imageCount image(s) already fetched."
}

# --- 3. Daily fetch via Task Scheduler ---
$taskName = "SpaceWallpaperFetch"
$action = New-ScheduledTaskAction -Execute $pythonw `
    -Argument "`"$(Join-Path $root 'fetcher\fetch.py')`"" `
    -WorkingDirectory (Join-Path $root "fetcher")
$triggers = @(
    (New-ScheduledTaskTrigger -Daily -At 09:00),
    (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME)
)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -DontStopOnIdleEnd -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers `
    -Settings $settings -Description "Fetches fresh NASA/ESA/ISRO/JAXA space wallpapers for the Cosmic Canvas Lively wallpaper." `
    -Force | Out-Null
Write-Host "Scheduled task '$taskName' registered (daily 09:00 + at logon)."

# --- 4. Next steps that need the Lively UI ---
Write-Host ""
Write-Host "Done! Finish in the Lively app (restart it if it was open):" -ForegroundColor Green
Write-Host "  1. 'Cosmic Canvas' now appears in your wallpaper library - click it to apply."
Write-Host "  2. Settings > Wallpaper > Wallpaper input: set to 'Mouse' (or 'Keyboard & Mouse')"
Write-Host "     so click & drag effects reach the wallpaper (clicks register on the empty desktop)."
Write-Host "  3. Optional screensaver: Settings > General > Screen saver - Lively runs this same"
Write-Host "     wallpaper as your screensaver. Pick Cosmic Canvas and set your idle timeout."
