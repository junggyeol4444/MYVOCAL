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
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class MYVOCALRestoreInputClick {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string className, string windowName);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
}
'@

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
$testUserCreated = $false
$testUserName = ''
$restoreRoot = ''
$report = [ordered]@{
  stage = 'init'
  passed = $false
  runner = $env:RUNNER_OS
  isolatedProfile = $profileRoot
  projectTitle = '새 음악 프로젝트'
  projectCreated = $false
  projectPersistedAfterRestart = $false
  webmCancelSafe = $false
  projectBackupDownloaded = $false
  projectRestoredViaGui = $false
  projectRestoredPersistedAfterRestart = $false
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
  # A second download in one WebView2 session can trigger Chrome's
  # automatic multiple-downloads permission flyout. The Windows 2025 runner
  # does not consistently expose this flyout to UI Automation. Reopen the
  # very same isolated project profile in a fresh EXE session so the user
  # can execute the real MV export GUI flow as the first download.
  Stop-MYVOCALProcess -Process $process
  $process = $null
  Start-Sleep -Seconds 3
  $process = Start-Process -FilePath $Executable -WorkingDirectory (Split-Path -Parent $Executable) -PassThru
  $window = Wait-MYVOCALWindow -Process $process
  $report['steps'] += 'Restarted same isolated EXE profile before WebM export to avoid multiple-download permission flyout'
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
    # On a freshly opened WebView2 session, UIA may expose the sidebar button
    # before React has attached its click handler. Retry actual navigation.
    if ($i -gt 0 -and $i % 5 -eq 0) {
      Invoke-MYVOCALButton -Window $window -Caption 'Video Studio'
    }
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

  # Start another WebM export, cancel it after actual recording progress, and
  # ensure neither the first export nor the user's isolated project is overwritten.
  $report['stage'] = 'cancel-webm'
  $savedWebmHash = (Get-FileHash -LiteralPath $webm.FullName -Algorithm SHA256).Hash
  $knownWebm = @(Get-ChildItem -LiteralPath $downloads -Filter '*.webm' -File | ForEach-Object { $_.FullName })
  $recordingCondition = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Button)
  Invoke-MYVOCALButton -Window $window -Caption '전체 MV WebM 저장'
  $cancelButton = $null
  $recordingStarted = $false
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    $buttons = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $recordingCondition)
    foreach ($button in $buttons) {
      $caption = $button.Current.Name
      if ($caption -match '^WebM 기록 중 ([1-9][0-9]*)%') { $recordingStarted = $true }
      if ($caption -eq '저장 취소' -and $button.Current.IsEnabled) { $cancelButton = $button }
    }
    if ($recordingStarted -and $null -ne $cancelButton) { break }
  }
  if (-not $recordingStarted -or $null -eq $cancelButton) {
    throw 'Real WebM recording progress and cancel button did not become available'
  }
  $cancelButton.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
  $cancelSettled = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    $exportAgain = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $searchCondition)
    if ($null -ne $exportAgain -and $exportAgain.Current.IsEnabled) { $cancelSettled = $true; break }
  }
  if (-not $cancelSettled) { throw 'WebM export GUI did not return to idle after cancellation' }
  # Allow an asynchronous/delayed download to surface before declaring success.
  Start-Sleep -Seconds 3
  $unexpectedWebm = @(Get-ChildItem -LiteralPath $downloads -Filter '*.webm' -File |
    Where-Object { $knownWebm -notcontains $_.FullName })
  if ($unexpectedWebm.Count -gt 0) { throw 'Cancelled export unexpectedly created a WebM download' }
  $hashAfterCancel = (Get-FileHash -LiteralPath $webm.FullName -Algorithm SHA256).Hash
  if ($hashAfterCancel -ne $savedWebmHash) { throw 'Cancellation altered the previously saved WebM' }
  $report['webmCancelSafe'] = $true
  $report['steps'] += 'Cancelled a real in-progress WebM recording; GUI returned idle and previous file was preserved'

  # Preserve the generated project through the existing real-GUI backup and
  # restore workflow, using only this disposable Windows runner profile.
  $report['stage'] = 'backup-project'
  Stop-MYVOCALProcess -Process $process
  $process = $null
  Start-Sleep -Seconds 3
  $process = Start-Process -FilePath $Executable -WorkingDirectory (Split-Path -Parent $Executable) -PassThru
  $window = Wait-MYVOCALWindow -Process $process
  $projectPageReady = $false
  for ($attempt = 0; $attempt -lt 10; $attempt++) {
    Invoke-MYVOCALButton -Window $window -Caption '내 프로젝트'
    try {
      Assert-MYVOCALProjectVisible -Window $window -Title $report['projectTitle'] -MaxChecks 3
      $projectPageReady = $true
      break
    } catch {
      if ($attempt -eq 9) { throw }
      Start-Sleep -Seconds 1
    }
  }
  if (-not $projectPageReady) { throw 'Projects page did not become ready after EXE restart' }
  $previousBackups = @(Get-ChildItem -LiteralPath $downloads -Filter '*.myvocal.json' -File | ForEach-Object { $_.FullName })
  $backupStarted = [DateTime]::UtcNow
  Invoke-MYVOCALButton -Window $window -Caption '전체 백업'
  $backup = $null
  for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 1
    $backup = Get-ChildItem -LiteralPath $downloads -Filter '*.myvocal.json' -File |
      Where-Object { $_.Length -gt 500 -and $_.LastWriteTimeUtc -ge $backupStarted.AddSeconds(-3) -and $previousBackups -notcontains $_.FullName } |
      Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if ($null -ne $backup -and -not (Test-Path -LiteralPath ($backup.FullName + '.crdownload'))) { break }
    $backup = $null
  }
  if ($null -eq $backup) { throw 'The real Projects GUI did not download a .myvocal.json backup' }
  $backupData = Get-Content -LiteralPath $backup.FullName -Raw -Encoding utf8 | ConvertFrom-Json
  if ($backupData.format -ne 'MYVOCAL_PROJECT_BACKUP' -or $backupData.formatVersion -ne 2) {
    throw 'Downloaded project backup has an unexpected format'
  }
  if ($backupData.project.title -ne $report['projectTitle'] -or @($backupData.project.tracks).Count -lt 4) {
    throw 'Project title or tracks did not survive the actual GUI backup'
  }
  $noteCount = @($backupData.project.tracks | ForEach-Object { $_.midiNotes } | Where-Object { $null -ne $_ }).Count
  if ($noteCount -eq 0) { throw 'Project backup did not preserve generated MIDI tracks' }
  Copy-Item -LiteralPath $backup.FullName -Destination (Join-Path $EvidenceDirectory 'project-backup.myvocal.json') -Force
  $report['projectBackupDownloaded'] = $true
  $report['backupBytes'] = $backup.Length
  $report['steps'] += 'Existing GUI exported a validated project and generated MIDI track backup'

  # Add real files produced by this EXE (WAV/WebM) and a tiny PNG to a
  # disposable *copy* of the real-GUI project backup. This tests the normal
  # GUI import and GUI re-export with media bytes, without changing the
  # original source project or using a browser console / source-level shortcut.
  $report['stage'] = 'prepare-media-backup-fixture'
  $mediaFixturePath = Join-Path $EvidenceDirectory 'MYVOCAL-QA-Media-Restore.myvocal.json'
  # Downloads can be cleaned up or moved by the WebView2 shell after the
  # export steps. The evidence directory contains byte-for-byte copies made
  # immediately after each completed export, before the EXE is restarted.
  $stableWav = Join-Path $EvidenceDirectory 'exported-mix.wav'
  $stableWebm = Join-Path $EvidenceDirectory 'exported-mv.webm'
  if (-not (Test-Path -LiteralPath $stableWav) -or -not (Test-Path -LiteralPath $stableWebm)) {
    throw 'Already verified WAV/WebM export evidence is unavailable'
  }
  $audioFileBytes = [System.IO.File]::ReadAllBytes($stableWav)
  $videoFileBytes = [System.IO.File]::ReadAllBytes($stableWebm)
  $pngBytes = [Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/v9kAAAAASUVORK5CYII=')
  $mediaSamples = @(
    @{ id='qa-audio'; name='qa-original.wav'; type='audio/wav'; bytes=$audioFileBytes },
    @{ id='qa-video'; name='qa-export.webm'; type='video/webm'; bytes=$videoFileBytes },
    @{ id='qa-image'; name='qa-pixel.png'; type='image/png'; bytes=$pngBytes },
    @{ id='qa-checkpoint'; name='qa-external-model.bin'; type='application/octet-stream'; bytes=[byte[]](1,2,3,4,5,6,7,8,9) }
  )
  foreach ($sample in $mediaSamples) {
    $backupData.assets | Add-Member -NotePropertyName $sample.id -NotePropertyValue @{
      name=$sample.name
      type=$sample.type
      dataUrl=('data:' + $sample.type + ';base64,' + [Convert]::ToBase64String($sample.bytes))
    } -Force
  }
  $track = $backupData.project.tracks[0]
  $track.clips = @($track.clips) + @([pscustomobject]@{
    id='qa-media-clip'; assetId='qa-audio'; startBar=1; bars=1
  })
  $scene = $backupData.project.scenes[0]
  $scene | Add-Member -NotePropertyName 'imageAssetId' -NotePropertyValue 'qa-image' -Force
  $scene | Add-Member -NotePropertyName 'videoClipAssetId' -NotePropertyValue 'qa-video' -Force
  # This is a synthetic checkpoint file to test persistence, NOT a trained AI model.
  $backupData.project.voiceId = 'qa-voice'
  $backupData.project | Add-Member -NotePropertyName 'singingEngine' -NotePropertyValue @{
    port=7867; modelId='qa-model'
  } -Force
  $backupData.profiles.voices = @([pscustomobject]@{
    id='qa-voice'; name='MYVOCAL QA Voice'; rights='self'
    assets=@([pscustomobject]@{id='qa-audio';fileName='qa-original.wav'})
  })
  $backupData.profiles | Add-Member -NotePropertyName 'voiceModels' -NotePropertyValue @(
    [pscustomobject]@{id='qa-model';voiceId='qa-voice';name='Synthetic checkpoint fixture';engineId='svc';assetId='qa-checkpoint';status='imported-unverified'}
  ) -Force
  $backupData.profiles | Add-Member -NotePropertyName 'trainingPlans' -NotePropertyValue @(
    [pscustomobject]@{id='qa-plan';voiceId='qa-voice';voiceName='MYVOCAL QA Voice';engineId='generic';status='prepared';sampleIds=@('qa-audio');sampleSnapshot=@([pscustomobject]@{id='qa-audio';fileName='qa-original.wav'})}
  ) -Force
  $backupData | ConvertTo-Json -Depth 100 -Compress |
    Set-Content -LiteralPath $mediaFixturePath -Encoding utf8
  $fixture = Get-Content -LiteralPath $mediaFixturePath -Raw -Encoding utf8 | ConvertFrom-Json
  if (@($fixture.assets.PSObject.Properties).Count -ne 4) { throw 'Real-media restore fixture did not contain 4 assets' }
  $report['testFixtureMediaAssets'] = 4
  $report['testFixtureMediaBytes'] = $audioFileBytes.Length + $videoFileBytes.Length + $pngBytes.Length + 9
  $report['steps'] += 'Prepared disposable portable backup with WAV/WebM/PNG, synthetic checkpoint, voice and training records'

  # The previous separate-user Windows GUI was visibly opening the native
  # picker, but its shell tried to access C:\Users\runneradmin\Desktop
  # and showed an Access denied modal. Keep the disposable LOCALAPPDATA
  # data sandbox while restoring under the SAME desktop login used for
  # the successful project creation, backup and export GUI actions.
  $report['stage'] = 'restore-project'
  Stop-MYVOCALProcess -Process $process
  $process = $null
  Start-Sleep -Seconds 3
  $restoreFile = $mediaFixturePath
  $startRestoredSession = {
    Start-Process -FilePath $Executable -WorkingDirectory (Split-Path -Parent $Executable) -PassThru
  }
  $process = & $startRestoredSession
  $window = Wait-MYVOCALWindow -Process $process
  $report['restoreUserContext'] = 'existing-isolated-Windows-runner-desktop'
  $report['steps'] += 'Opened EXE after restart under existing Windows GUI login with unchanged isolated app data'
  $restoreButtonReady = $false
  for ($attempt = 0; $attempt -lt 10; $attempt++) {
    Invoke-MYVOCALButton -Window $window -Caption '내 프로젝트'
    try {
      $button = Find-MYVOCALButton -Window $window -Caption '프로젝트 복원'
      $restoreButtonReady = $true
      break
    } catch {
      if ($attempt -eq 9) { throw }
      Start-Sleep -Seconds 1
    }
  }
  if (-not $restoreButtonReady) { throw 'Restore button unavailable in restarted Windows EXE' }
  $buttonRect = $button.Current.BoundingRectangle
  if ($buttonRect.Width -le 20 -or $buttonRect.Height -le 15) { throw 'Restore button has no valid screen bounds' }
  # Click the file input itself, not React's former synthetic hidden-input
  # button handler or UIA InvokePattern. The input covers the visible action.
  $hwnd = [IntPtr]$window.Current.NativeWindowHandle
  if ($hwnd -eq [IntPtr]::Zero) { throw 'No native MYVOCAL window handle for direct file-input click' }
  $null = [MYVOCALRestoreInputClick]::SetForegroundWindow($hwnd)
  Start-Sleep -Milliseconds 450
  $centerX = [int][Math]::Round($buttonRect.X + $buttonRect.Width / 2)
  $centerY = [int][Math]::Round($buttonRect.Y + $buttonRect.Height / 2)
  if (-not [MYVOCALRestoreInputClick]::SetCursorPos($centerX,$centerY)) { throw 'Could not target native file input overlay' }
  Start-Sleep -Milliseconds 150
  [MYVOCALRestoreInputClick]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero)
  Start-Sleep -Milliseconds 90
  [MYVOCALRestoreInputClick]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero)
  $report['restoreInputDirectClickAttempted'] = $true
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $winType = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Window)
  $dialog = $null
  for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Milliseconds 750
    $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children,$winType)
    foreach ($w in $windows) {
      if ($w.Current.Name -match '^(Open|열기|Open File|파일 열기)$' -or
          ($w.Current.ClassName -eq '#32770' -and $w.Current.Name -match 'Open|열기')) {
        $dialog = $w;break
      }
    }
    if ($null -ne $dialog) { break }
    # Some runner accessibility trees omit desktop dialogs despite a visible
    # Win32 '#32770' Open window. Check its HWND rather than falsely reporting
    # that the picker was never opened. Do not click the input repeatedly.
    $pickerHwnd = [MYVOCALRestoreInputClick]::FindWindow('#32770','Open')
    if ($pickerHwnd -eq [IntPtr]::Zero) {
      $pickerHwnd = [MYVOCALRestoreInputClick]::FindWindow('#32770','열기')
    }
    if ($pickerHwnd -ne [IntPtr]::Zero) {
      $report['filePickerVisibleViaWin32'] = $true
      try { $dialog = [System.Windows.Automation.AutomationElement]::FromHandle($pickerHwnd) }
      catch { $report['filePickerUIAFromHandleError'] = $_.Exception.Message }
      if ($null -ne $dialog) { break }
    }
    # Avoid repeating the previous UIA/synthetic click after an absent dialog.
  }
  if ($null -eq $dialog) {
    $report['filePickerMissingInRunnerSession'] = $true
    throw 'Native file picker not detected by Windows GUI test after direct input click'
  }
  $report['steps'] += 'Native file picker opened after direct input click in the same isolated Windows GUI session'
  try { $dialog.SetFocus() }
  catch {
    # Windows desktop accessibility may expose the real #32770 file chooser
    # even when UIAutomation.SetFocus is unavailable. Use the native HWND
    # instead of treating an already-visible file chooser as a missing one.
    $report['filePickerUIAFocusFallback'] = $_.Exception.Message
    $nativePicker = [IntPtr]$dialog.Current.NativeWindowHandle
    if ($nativePicker -eq [IntPtr]::Zero) {
      $nativePicker = [MYVOCALRestoreInputClick]::FindWindow('#32770','Open')
      if ($nativePicker -eq [IntPtr]::Zero) { $nativePicker = [MYVOCALRestoreInputClick]::FindWindow('#32770','열기') }
    }
    if ($nativePicker -eq [IntPtr]::Zero) { throw 'Real file chooser has no usable native HWND' }
    $null = [MYVOCALRestoreInputClick]::SetForegroundWindow($nativePicker)
    Start-Sleep -Milliseconds 350
  }
  Add-Type -AssemblyName System.Windows.Forms
  $nameId = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::AutomationIdProperty,'1148')
  $filenameEdit = $dialog.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$nameId)
  if ($null -ne $filenameEdit) {
    try { $filenameEdit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue($restoreFile) }
    catch { $filenameEdit.SetFocus();[System.Windows.Forms.SendKeys]::SendWait('^a');[System.Windows.Forms.SendKeys]::SendWait($restoreFile) }
  } else {
    [System.Windows.Forms.SendKeys]::SendWait('%n')
    [System.Windows.Forms.SendKeys]::SendWait($restoreFile)
  }
  Start-Sleep -Milliseconds 350
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  $restoredTitle = $report['projectTitle'] + ' (복원)'
  Assert-MYVOCALProjectVisible -Window $window -Title $restoredTitle -MaxChecks 45
  $report['projectRestoredViaGui'] = $true
  $report['steps'] += 'Real Windows EXE GUI imported full project backup through OS file picker'

  $report['stage'] = 'verify-restored-restart'
  Stop-MYVOCALProcess -Process $process
  $process = $null
  Start-Sleep -Seconds 3
  $process = & $startRestoredSession
  $window = Wait-MYVOCALWindow -Process $process
  $persisted = $false
  for ($attempt = 0; $attempt -lt 10; $attempt++) {
    Invoke-MYVOCALButton -Window $window -Caption '내 프로젝트'
    try {
      Assert-MYVOCALProjectVisible -Window $window -Title $restoredTitle -MaxChecks 3
      $persisted = $true;break
    } catch {
      if ($attempt -eq 9) { throw }
      Start-Sleep -Seconds 1
    }
  }
  if (-not $persisted) { throw 'Imported project vanished after EXE restart in isolated Windows profile' }
  $report['projectRestoredPersistedAfterRestart'] = $true
  $report['steps'] += 'Imported project persisted after real EXE restart in same isolated Windows profile'

  # Re-export the restored project through its real GUI action. The restored
  # project is prepended in the Projects page and its backup button is first.
  $report['stage'] = 'verify-restored-media-rebackup'
  $knownBackups = @(Get-ChildItem -LiteralPath $downloads -Filter '*.myvocal.json' -File |
    ForEach-Object { $_.FullName })
  $mediaBackupStarted = [DateTime]::UtcNow
  Invoke-MYVOCALButton -Window $window -Caption '전체 백업'
  $mediaRebackup = $null
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    Start-Sleep -Seconds 1
    $mediaRebackup = Get-ChildItem -LiteralPath $downloads -Filter '*.myvocal.json' -File |
      Where-Object {
        $_.Length -gt 1000 -and $_.LastWriteTimeUtc -ge $mediaBackupStarted.AddSeconds(-3) -and
        $knownBackups -notcontains $_.FullName
      } | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if ($null -ne $mediaRebackup -and -not (Test-Path -LiteralPath ($mediaRebackup.FullName + '.crdownload'))) { break }
    $mediaRebackup = $null
  }
  if ($null -eq $mediaRebackup) { throw 'GUI did not export restored project with original WAV/WebM/PNG files' }
  $mediaBackupData = Get-Content -LiteralPath $mediaRebackup.FullName -Raw -Encoding utf8 | ConvertFrom-Json
  if ($mediaBackupData.project.title -ne $restoredTitle) {
    throw 'Re-export selected the original project instead of the restored project'
  }
  $restoredAssets = @($mediaBackupData.assets.PSObject.Properties)
  $restoredVoices = @($mediaBackupData.profiles.voices)
  $restoredModels = @($mediaBackupData.profiles.voiceModels)
  $restoredPlans = @($mediaBackupData.profiles.trainingPlans)
  if ($restoredVoices.Count -ne 1 -or $restoredModels.Count -ne 1 -or $restoredPlans.Count -ne 1) {
    throw 'GUI backup did not retain the restored linked voice, checkpoint and training job'
  }
  $restoredVoice=$restoredVoices[0];$restoredModel=$restoredModels[0];$restoredPlan=$restoredPlans[0]
  if ($restoredVoice.id -eq 'qa-voice' -or $restoredModel.id -eq 'qa-model' -or
      $restoredPlan.id -eq 'qa-plan' -or
      $restoredModel.voiceId -ne $restoredVoice.id -or
      $restoredPlan.voiceId -ne $restoredVoice.id -or
      $mediaBackupData.project.voiceId -ne $restoredVoice.id -or
      $mediaBackupData.project.singingEngine.modelId -ne $restoredModel.id) {
    throw 'GUI rebackup voice/model/training IDs were not remapped and linked'
  }
  if (@($restoredVoice.assets).Count -ne 1 -or
      $restoredVoice.assets[0].id -ne $restoredPlan.sampleIds[0] -or
      $restoredPlan.sampleSnapshot[0].id -ne $restoredPlan.sampleIds[0]) {
    throw 'GUI rebackup training sample ID does not match the restored voice recording'
  }
  $audioEntry=@($restoredAssets | Where-Object { $_.Value.name -eq 'qa-original.wav' })
  $checkpointEntry=@($restoredAssets | Where-Object { $_.Value.name -eq 'qa-external-model.bin' })
  if ($audioEntry.Count -ne 1 -or $checkpointEntry.Count -ne 1 -or
      $restoredVoice.assets[0].id -ne $audioEntry[0].Name -or
      $restoredModel.assetId -ne $checkpointEntry[0].Name) {
    throw 'GUI rebackup checkpoint/recording media links were not preserved'
  }
  $report['linkedVoiceModelTrainingGuiVerified'] = $true
  if ($restoredAssets.Count -ne $mediaSamples.Count) {
    throw "Restored GUI backup asset count mismatch: $($restoredAssets.Count)"
  }
  foreach ($sample in $mediaSamples) {
    $found = @($restoredAssets | Where-Object { $_.Value.name -eq $sample.name })
    if ($found.Count -ne 1) { throw "Restored media missing or duplicated: $($sample.name)" }
    if ($found[0].Name -eq $sample.id) { throw "Restored asset ID not remapped: $($sample.name)" }
    if ($found[0].Value.type -ne $sample.type) { throw "Restored media MIME changed: $($sample.name)" }
    $url = [string]$found[0].Value.dataUrl
    if (-not $url.StartsWith('data:' + $sample.type + ';base64,')) {
      throw "Restored media data URL invalid: $($sample.name)"
    }
    $bytes = [Convert]::FromBase64String($url.Substring($url.IndexOf(',') + 1))
    $hash = [System.Security.Cryptography.SHA256]::Create()
    try {
      $sourceHash = [Convert]::ToHexString($hash.ComputeHash($sample.bytes))
      $restoredHash = [Convert]::ToHexString($hash.ComputeHash($bytes))
    } finally { $hash.Dispose() }
    if ($sourceHash -ne $restoredHash) { throw "Restored media bytes changed: $($sample.name)" }
  }
  $report['mediaGuiRestoreAndRebackupVerified'] = $true
  $report['mediaGuiAssetCount'] = $restoredAssets.Count
  $report['steps'] += 'Real Windows EXE GUI restored WAV/WebM/PNG/checkpoint, linked voice/model/training records, and SHA-256 matching media'
  Stop-MYVOCALProcess -Process $process
  $process = $null
  $process = Start-Process -FilePath $Executable -WorkingDirectory (Split-Path -Parent $Executable) -PassThru
  $window = Wait-MYVOCALWindow -Process $process
  $originalStillThere = $false
  for ($attempt = 0; $attempt -lt 10; $attempt++) {
    Invoke-MYVOCALButton -Window $window -Caption '내 프로젝트'
    try {
      Assert-MYVOCALProjectVisible -Window $window -Title $report['projectTitle'] -MaxChecks 3
      $originalStillThere = $true;break
    } catch {
      if ($attempt -eq 9) { throw }
      Start-Sleep -Seconds 1
    }
  }
  if (-not $originalStillThere) { throw 'Original project changed or disappeared after backup restore' }
  $report['originalPreservedAfterRestore'] = $true
  $report['steps'] += 'Original isolated project preserved after GUI backup export/import without overwrite'
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
  if ($testUserCreated) {
    try { Remove-LocalUser -Name $testUserName -ErrorAction Stop }
    catch { $report['temporaryTestAccountCleanupError'] = $_.Exception.Message }
  }
  try {
    $appLog = Join-Path $profileRoot 'MYVOCAL Studio\logs\launcher.log'
    if (Test-Path -LiteralPath $appLog) { Copy-Item -LiteralPath $appLog -Destination (Join-Path $EvidenceDirectory 'launcher.log') -Force }
  } catch {}
  $report | ConvertTo-Json -Depth 6 | Set-Content -Path (Join-Path $EvidenceDirectory 'result.json') -Encoding utf8
  Get-Content -LiteralPath (Join-Path $EvidenceDirectory 'result.json')
  $env:LOCALAPPDATA = $previousLocalAppData
  $env:MYVOCAL_DESKTOP_HOST = $previousHostMode
}
