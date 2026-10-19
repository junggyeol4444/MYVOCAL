# Isolated Windows native common-dialog control probe for MYVOCAL GUI CI.
# Does not import media, click MYVOCAL, or modify an existing user profile.
$ErrorActionPreference = 'Stop'
$evidence = Join-Path $env:RUNNER_TEMP 'MYVOCAL-Windows-Project-Journey'
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$probePath = Join-Path $env:RUNNER_TEMP 'MYVOCAL-Native-Dialog-Control-Probe.ps1'
$report = [ordered]@{ probe = 'standard-winforms-openfiledialog'; runner = $env:RUNNER_OS; status = 'not-run'; visible = $false; elapsedSeconds = 0 }
@'
Add-Type -AssemblyName System.Windows.Forms
$picker = [System.Windows.Forms.OpenFileDialog]::new()
$picker.Title = 'MYVOCAL Native File Dialog Control Probe'
$picker.Filter = 'JSON files (*.json)|*.json'
[void]$picker.ShowDialog()
'@ | Set-Content -LiteralPath $probePath -Encoding UTF8
$child = $null
try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  $powershell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $child = Start-Process -FilePath $powershell -ArgumentList @('-NoProfile','-STA','-File',('"'+$probePath+'"')) -PassThru
  $report['childStarted'] = $true
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $winType = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Window)
  for ($i=0; $i -lt 32; $i++) {
    Start-Sleep -Milliseconds 500
    $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children,$winType)
    foreach ($window in $windows) {
      if ($window.Current.Name -eq 'MYVOCAL Native File Dialog Control Probe') {
        $report['visible'] = $true
        $report['dialogClass'] = $window.Current.ClassName
        break
      }
    }
    $report['elapsedSeconds'] = [Math]::Round(($i+1)/2,1)
    if ($report['visible']) { break }
    $child.Refresh()
    if ($child.HasExited) { $report['childExitedEarly'] = $true;break }
  }
  $report['status'] = if ($report['visible']) { 'visible' } else { 'not-visible' }
} catch {
  $report['status'] = 'probe-error'
  $report['error'] = $_.Exception.Message
} finally {
  if ($null -ne $child) {
    try { $child.Refresh();if (-not $child.HasExited) { Stop-Process -Id $child.Id -Force -ErrorAction Stop } }
    catch { $report['cleanupError'] = $_.Exception.Message }
  }
  $report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $evidence 'native-dialog-control-probe.json') -Encoding utf8
  $report | ConvertTo-Json -Depth 4
}
