# Creates 1-Click Desktop Shortcuts for AquaGuard Station
$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath('Desktop')
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. Start AquaGuard Station Shortcut
$StartShortcutPath = Join-Path $DesktopPath "Start AquaGuard Station.lnk"
$StartShortcut = $WshShell.CreateShortcut($StartShortcutPath)
$StartShortcut.TargetPath = "wscript.exe"
$StartShortcut.Arguments = "`"$ScriptDir\AquaGuard_Station_Silent.vbs`""
$StartShortcut.WorkingDirectory = $ScriptDir
$StartShortcut.Description = "Start AquaGuard Flood Detection Station (Silent)"
$StartShortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,14" # Video camera icon
$StartShortcut.Save()

# 2. Stop AquaGuard Station Shortcut
$StopShortcutPath = Join-Path $DesktopPath "Stop AquaGuard Station.lnk"
$StopShortcut = $WshShell.CreateShortcut($StopShortcutPath)
$StopShortcut.TargetPath = "wscript.exe"
$StopShortcut.Arguments = "`"$ScriptDir\Stop_AquaGuard_Station.vbs`""
$StopShortcut.WorkingDirectory = $ScriptDir
$StopShortcut.Description = "Stop AquaGuard Flood Detection Station safely"
$StopShortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,27" # Stop / Red X icon
$StopShortcut.Save()

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "🎉 SUCCESS! AquaGuard Desktop Shortcuts have been created:" -ForegroundColor Green
Write-Host " 1. Start AquaGuard Station -> $StartShortcutPath" -ForegroundColor Yellow
Write-Host " 2. Stop AquaGuard Station  -> $StopShortcutPath" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

