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
  param([System.Windows.Automation.AutomationElement]$Window, [string]$Title, [int]$MaxChecks = 20)
  for ($i = 0; $i -lt $MaxChecks; $i++) {
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
  # A newly shown WebView2 window can expose its accessible navigation before
  # React has attached the click handler. Retry the real GUI navigation.
  $reopenedProject = $false
  for ($attempt = 0; $attempt -lt 10; $attempt++) {
    Invoke-MYVOCALButton -Window $window -Caption '내 프로젝트'
    try {
      Assert-MYVOCALProjectVisible -Window $window -Title $report['projectTitle'] -MaxChecks 3
      $reopenedProject = $true
      break
    } catch {
      if ($attempt -eq 9) { throw }
      Start-Sleep -Seconds 1
    }
  }
  if (-not $reopenedProject) { throw 'Restarted project GUI navigation did not finish' }
  $report['projectPersistedAfterRestart'] = $true
  $report['steps'] += 'Created project survived EXE restart with same isolated profile'

  # Export the existing generated MIDI arrangement through the real GUI.
  # GitHub-hosted Windows runners are disposable; no user-owned projects are opened.
  $report['stage'] = 'export-wav'
  Invoke-MYVOCALButton -Window $window -Caption '편집'
  $downloads = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads'
  New-Item -ItemType Directory -Path $downloads -Force | Out-Null
  $existing = @(Get-ChildItem -LiteralPath $downloads -Filter '*.wav' -File | ForEach-Object { $_.FullName })
  $exportStarted = [DateTime]::UtcNow
  Invoke-MYVOCALButton -Window $window -Caption 'WAV 믹스 저장'
  $wav = $null
  for ($i = 0; $i -lt 75; $i++) {
    Start-Sleep -Seconds 2
    $wav = Get-ChildItem -LiteralPath $downloads -Filter '*.wav' -File |
      Where-Object { $_.Length -gt 44 -and $_.LastWriteTimeUtc -ge $exportStarted.AddSeconds(-3) -and $existing -notcontains $_.FullName } |
      Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if ($null -ne $wav) {
      # Do not inspect a file still being downloaded.
      if (-not (Test-Path -LiteralPath ($wav.FullName + '.crdownload'))) { break }
      $wav = $null
    }
  }
  if ($null -eq $wav) { throw "No WAV file downloaded by the real GUI into $downloads" }
  $fileStream = [System.IO.File]::Open($wav.FullName, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
  try {
    $reader = [System.IO.BinaryReader]::new($fileStream)
    $riff = [System.Text.Encoding]::ASCII.GetString($reader.ReadBytes(4))
    $null = $reader.ReadUInt32()
    $wave = [System.Text.Encoding]::ASCII.GetString($reader.ReadBytes(4))
    if ($riff -ne 'RIFF' -or $wave -ne 'WAVE') { throw 'Downloaded file does not have a RIFF/WAVE header' }
  } finally { $fileStream.Dispose() }
  Copy-Item -LiteralPath $wav.FullName -Destination (Join-Path $EvidenceDirectory 'exported-mix.wav') -Force
  $report['wavExportedAfterRestart'] = $true
  $report['wavBytes'] = $wav.Length
  $report['steps'] += 'Real GUI WAV export produced a nonempty RIFF/WAVE file after EXE restart'

  # Follow the existing Video Studio user route and export the generated storyboard
  # with its MIDI music as a real WebM. This is NOT an AI-generated scene.
  $report['stage'] = 'export-webm'
  Invoke-MYVOCALButton -Window $window -Caption 'Video Studio'
  $buttonType = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Button)
  $nameType = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::NameProperty, '전체 MV WebM 저장')
  $searchCondition = [System.Windows.Automation.AndCondition]::new($buttonType, $nameType)
  $videoButton = $null
  for ($i = 0; $i -lt 45; $i++) {
    $videoButton = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $searchCondition)
    if ($null -ne $videoButton -and $videoButton.Current.IsEnabled) { break }
    Start-Sleep -Seconds 2
  }
  if ($null -eq $videoButton -or -not $videoButton.Current.IsEnabled) {
    throw 'Real MV WebM export button is missing or disabled'
  }
  $existingWebm = @(Get-ChildItem -LiteralPath $downloads -Filter '*.webm' -File | ForEach-Object { $_.FullName })
  $webmStarted = [DateTime]::UtcNow
  $videoButton.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
  $webm = $null
  $report['multipleDownloadPermissionHandled'] = $false
  $allowName = [System.Windows.Automation.OrCondition]::new(
    [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, 'Allow'),
    [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, '허용'))
  $allowSearch = [System.Windows.Automation.AndCondition]::new($buttonType, $allowName)
  for ($i = 0; $i -lt 120; $i++) {
    Start-Sleep -Seconds 2
    # The second download in a WebView2 session asks the user to allow multiple
    # downloads. Accept it via the real Windows GUI, only after the explicit
    # '전체 MV WebM 저장' click, and only within this disposable CI profile.
    $allowButton = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $allowSearch)
    if ($null -eq $allowButton) {
      # The WebView2 automatic-download permission flyout can be a separate
      # Chromium top-level popup rather than a child of our native app window.
      # Search the Windows UIA root but only accept the Allow button located
      # inside this app window's visible top-left permission bubble.
      $appRect = $window.Current.BoundingRectangle
      $candidates = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants, $allowSearch)
      foreach ($candidate in $candidates) {
        try {
          $rect = $candidate.Current.BoundingRectangle
          if ($rect.Width -gt 0 -and $rect.Width -lt 200 -and
              $rect.X -ge $appRect.X -and $rect.X -le ($appRect.X + 460) -and
              $rect.Y -ge $appRect.Y -and $rect.Y -le ($appRect.Y + 300)) {
            $allowButton = $candidate
            break
          }
        } catch {}
      }
    }
    if ($null -ne $allowButton -and $allowButton.Current.IsEnabled) {
      $allowButton.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
      $report['multipleDownloadPermissionHandled'] = $true
    }
    $webm = Get-ChildItem -LiteralPath $downloads -Filter '*.webm' -File |
      Where-Object { $_.Length -gt 1024 -and $_.LastWriteTimeUtc -ge $webmStarted.AddSeconds(-3) -and $existingWebm -notcontains $_.FullName } |
      Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if ($null -ne $webm) {
      if (-not (Test-Path -LiteralPath ($webm.FullName + '.crdownload'))) { break }
      $webm = $null
    }
  }
  if ($null -eq $webm) { throw "No real WebM downloaded by the Video Studio GUI into $downloads" }
  $videoStream = [System.IO.File]::Open($webm.FullName, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
  try {
    $magic = [byte[]]::new(4)
    if ($videoStream.Read($magic,0,4) -ne 4 -or
        $magic[0] -ne 0x1a -or $magic[1] -ne 0x45 -or $magic[2] -ne 0xdf -or $magic[3] -ne 0xa3) {
      throw 'Downloaded video does not have a Matroska/WebM EBML header'
    }
  } finally { $videoStream.Dispose() }
  Copy-Item -LiteralPath $webm.FullName -Destination (Join-Path $EvidenceDirectory 'exported-mv.webm') -Force
  $report['webmExportedAfterRestart'] = $true
  $report['webmBytes'] = $webm.Length
  $report['steps'] += 'Real GUI Video Studio exported an EBML/WebM file with the generated song'
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
