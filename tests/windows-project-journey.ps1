# MYVOCAL Studio existing Windows EXE: isolated real-GUI project creation and persistence check.
# Intended for the repository's Windows Server 2022/2025 Actions matrix after EXE packaging.
# This does not touch the user's real LOCALAPPDATA, projects, voices, characters, or media.
param(
  [string]$Executable = (Join-Path (Split-Path -Parent $PSScriptRoot) 'MYVOCAL-Studio-Windows.exe'),
  [string]$EvidenceDirectory = (Join-Path $env:RUNNER_TEMP 'MYVOCAL-Windows-Project-Journey')
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing

function Wait-MYVOCALWindow {
  param([System.Diagnostics.Process]$Process, [int]$TimeoutSeconds = 90)
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $condition = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $Process.Id)
  for ($i = 0; $i -lt $TimeoutSeconds; $i += 2) {
    Start-Sleep -Seconds 2
    $Process.Refresh()
    if ($Process.HasExited) { throw "EXE exited before window appeared: $($Process.ExitCode)" }
    $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)
    for ($w = 0; $w -lt $windows.Count; $w++) {
      if ($windows.Item($w).Current.Name -match 'MYVOCAL') { return $windows.Item($w) }
    }
  }
  throw 'MYVOCAL window did not appear within 90 seconds'
}
function Find-MYVOCALButton {
  param([System.Windows.Automation.AutomationElement]$Window, [string]$Caption)
  $typeCondition = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Button)
  $nameCondition = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::NameProperty, $Caption)
  $condition = [System.Windows.Automation.AndCondition]::new($typeCondition, $nameCondition)
  for ($i = 0; $i -lt 30; $i++) {
    $button = $Window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
    if ($null -ne $button) { return $button }
    Start-Sleep -Seconds 2
  }
  throw "Button missing: $Caption"
}
function Invoke-MYVOCALButton {
  param([System.Windows.Automation.AutomationElement]$Window, [string]$Caption)
  $button = Find-MYVOCALButton -Window $Window -Caption $Caption
  $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
}
function Assert-MYVOCALProjectVisible {
  param([System.Windows.Automation.AutomationElement]$Window, [string]$Title)
  for ($i = 0; $i -lt 20; $i++) {
    $elements = $Window.FindAll([System.Windows.Automation.TreeScope]::Descendants,
      [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($element in $elements) {
      if ($element.Current.Name -eq $Title) { return }
    }
    Start-Sleep -Seconds 2
  }
  throw "Project not visible in real GUI: $Title"
}
function Stop-MYVOCALProcess {
  param([System.Diagnostics.Process]$Process)
  if ($null -eq $Process) { return }
  $Process.Refresh()
  if ($Process.HasExited) { return }
  $null = $Process.CloseMainWindow()
  if (-not $Process.WaitForExit(5000)) {
    # Only terminate the test's own process in its temporary isolated profile.
    Stop-Process -Id $Process.Id -Force
    $Process.WaitForExit(5000) | Out-Null
  }
}
function Save-MYVOCALWindowCapture {
  param([System.Windows.Automation.AutomationElement]$Window, [string]$Path)
  if ($null -eq $Window) { return }
  $bounds = $Window.Current.BoundingRectangle
  if ($bounds.Width -le 20 -or $bounds.Height -le 20 -or $bounds.Width -gt 4000 -or $bounds.Height -gt 4000) { return }
  $bitmap = [System.Drawing.Bitmap]::new([int]$bounds.Width, [int]$bounds.Height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen([int]$bounds.X, [int]$bounds.Y, 0, 0, $bitmap.Size)
    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $graphics.Dispose(); $bitmap.Dispose() }
}

$previousLocalAppData = $env:LOCALAPPDATA
$previousHostMode = $env:MYVOCAL_DESKTOP_HOST
$profileRoot = Join-Path $env:RUNNER_TEMP ('MYVOCAL-Isolated-Project-Journey-' + [guid]::NewGuid().ToString('N'))
$process = $null
$window = $null
$report = [ordered]@{
  stage = 'init'
  passed = $false
  runner = $env:RUNNER_OS
  isolatedProfile = $profileRoot
  projectTitle = '새 음악 프로젝트'
  projectCreated = $false
  projectPersistedAfterRestart = $false
  steps = @()
}
New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $profileRoot -Force | Out-Null
$env:LOCALAPPDATA = $profileRoot
$env:MYVOCAL_DESKTOP_HOST = 'webview2'
try {
  if (-not (Test-Path -LiteralPath $Executable)) { throw "EXE missing: $Executable" }
  if (-not (Test-Path -LiteralPath (Join-Path (Split-Path -Parent $Executable) 'WebView2Loader.dll'))) {
    throw 'WebView2Loader.dll missing next to EXE'
  }
  $report['stage'] = 'launch'
  $process = Start-Process -FilePath $Executable -WorkingDirectory (Split-Path -Parent $Executable) -PassThru
  $window = Wait-MYVOCALWindow -Process $process
  $report['steps'] += 'EXE window visible'

  $report['stage'] = 'create-project'
  Invoke-MYVOCALButton -Window $window -Caption 'AI로 노래 만들기'
  Invoke-MYVOCALButton -Window $window -Caption '곡 만들고 편집기 열기'
  $report['steps'] += 'Create project button invoked'
  Invoke-MYVOCALButton -Window $window -Caption '내 프로젝트'
  Assert-MYVOCALProjectVisible -Window $window -Title $report['projectTitle']
  $report['projectCreated'] = $true
  $report['steps'] += 'New project visible in Projects page'

  $report['stage'] = 'restart'
  Stop-MYVOCALProcess -Process $process
  $process = $null
  Start-Sleep -Seconds 3
  $process = Start-Process -FilePath $Executable -WorkingDirectory (Split-Path -Parent $Executable) -PassThru
  $window = Wait-MYVOCALWindow -Process $process
  Invoke-MYVOCALButton -Window $window -Caption '내 프로젝트'
  Assert-MYVOCALProjectVisible -Window $window -Title $report['projectTitle']
  $report['projectPersistedAfterRestart'] = $true
  $report['steps'] += 'Created project survived EXE restart with same isolated profile'
  $report['stage'] = 'complete'
  $report['passed'] = $true
} catch {
  $report['error'] = $_.Exception.ToString()
  throw
} finally {
  try { Save-MYVOCALWindowCapture -Window $window -Path (Join-Path $EvidenceDirectory 'project-journey.png') }
  catch { $report['screenshotError'] = $_.Exception.Message }
  try { Stop-MYVOCALProcess -Process $process }
  catch { $report['shutdownError'] = $_.Exception.Message }
  try {
    $appLog = Join-Path $profileRoot 'MYVOCAL Studio\logs\launcher.log'
    if (Test-Path -LiteralPath $appLog) { Copy-Item -LiteralPath $appLog -Destination (Join-Path $EvidenceDirectory 'launcher.log') -Force }
  } catch {}
  $report | ConvertTo-Json -Depth 6 | Set-Content -Path (Join-Path $EvidenceDirectory 'result.json') -Encoding utf8
  Get-Content -LiteralPath (Join-Path $EvidenceDirectory 'result.json')
  $env:LOCALAPPDATA = $previousLocalAppData
  $env:MYVOCAL_DESKTOP_HOST = $previousHostMode
}
