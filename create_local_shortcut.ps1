$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$python = (Get-Command python.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$shortcutPath = Join-Path $projectRoot 'Kapazitätsplanung starten.lnk'
$launcherPath = Join-Path $projectRoot 'local_launcher.py'
if (-not (Test-Path -LiteralPath $launcherPath -PathType Leaf)) {
    throw 'Das lokale Startprogramm wurde nicht gefunden.'
}
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $python
$shortcut.Arguments = '"{0}"' -f $launcherPath
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = 'Lokale Kapazitätsplanung öffnen'
$shortcut.Save()
Write-Output "Verknüpfung erstellt: $shortcutPath"
