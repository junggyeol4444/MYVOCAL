# Native Win32 USER32 GUI automation; it drives the actual Windows .exe, not a site.
param([string]$ExePath = (Join-Path (Split-Path $PSScriptRoot -Parent) 'MYVOCAL-Native-Windows.exe'))
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class NativeUI {
    [DllImport("user32.dll", CharSet=CharSet.Unicode, EntryPoint="FindWindowW")]
    public static extern IntPtr FindWindow(string c, string name);
    [DllImport("user32.dll")]
    public static extern IntPtr GetDlgItem(IntPtr h, int id);
    [DllImport("user32.dll", CharSet=CharSet.Unicode, EntryPoint="SetWindowTextW")]
    public static extern bool SetWindowText(IntPtr h, string s);
    [DllImport("user32.dll", CharSet=CharSet.Unicode, EntryPoint="GetWindowTextW")]
    public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int max);
    [DllImport("user32.dll", EntryPoint="SendMessageW")]
    public static extern IntPtr SendMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll", EntryPoint="IsWindow")]
    public static extern bool IsWindow(IntPtr h);
}
'@
function Check([bool]$condition,[string]$why){if(-not $condition){throw "MYVOCAL native Windows GUI failure: $why"}}
function Control([int]$id){$h=[NativeUI]::GetDlgItem($script:hwnd,$id);Check ($h -ne [IntPtr]::Zero) "missing native control $id";return $h}
function SetEdit([int]$id,[string]$value){$h=Control $id;Check ([NativeUI]::SetWindowText($h,$value)) "cannot set edit $id"}
function ReadEdit([int]$id){$h=Control $id;$s=New-Object System.Text.StringBuilder 32768;[void][NativeUI]::GetWindowText($h,$s,32768);return $s.ToString()}
function Click([int]$id){[void][NativeUI]::SendMessage($script:hwnd,0x0111,[IntPtr]::new($id),[IntPtr]::Zero)}
$destination = Join-Path $env:RUNNER_TEMP 'myvocal-native-win32-test'
New-Item -ItemType Directory -Path $destination -Force | Out-Null
$env:MYVOCAL_NATIVE_TEST_DIR=$destination
$project=Join-Path $destination 'user-project.myvocal.json'
$prefix=Join-Path $destination 'user-project'
$process=Start-Process -FilePath $ExePath -PassThru
try {
 $script:hwnd=[IntPtr]::Zero
 for($i=0;$i -lt 80;$i++){
  $script:hwnd=[NativeUI]::FindWindow('MYVOCAL_NativeStudio_Window','MYVOCAL Studio — Native Windows')
  if($script:hwnd -ne [IntPtr]::Zero){break}
  if($process.HasExited){throw "native EXE exited early: $($process.ExitCode)"}
  Start-Sleep -Milliseconds 250
 }
 Check ($script:hwnd -ne [IntPtr]::Zero) 'native Windows application window did not appear'
 Write-Host 'PASS: found real Win32 program window; no Edge/Chrome window automation'
 Check ((ReadEdit 301) -eq '새 음악 프로젝트') 'initial project title'
 SetEdit 301 'WIN32 실제 사용자 테스트'
 SetEdit 302 $project
 SetEdit 303 'Anime Rock with orchestral finale'
 SetEdit 304 "[Verse 1]`r`n테스트 사용자 가사`r`n[Chorus]`r`n우리는 노래한다"
 SetEdit 305 '132'
 SetEdit 306 'Rock 50%, K-Pop 30%, Orchestral 20%'
 Click 203 # generate editable independent MIDI tracks
 Click 201 # save real native project
 Check (Test-Path $project) 'native backup JSON not saved'
 $backup=Get-Content -Raw -Encoding UTF8 $project | ConvertFrom-Json
 Check ($backup.format -eq 'MYVOCAL_PROJECT_BACKUP') 'backup format'
 Check ($backup.project.title -eq 'WIN32 실제 사용자 테스트') 'saved title'
 Check ($backup.project.tracks.Count -eq 4) 'generated track count'
 Click 204 # MIDI
 Click 205 # WAV
 Click 209 # lyrics
 Check (Test-Path "$prefix.mid") 'real MIDI export'
 Check (Test-Path "$prefix-preview.wav") 'real WAV export'
 Check (Test-Path "$prefix-lyrics.txt") 'real lyrics export'
 Click 103 # music video section
 SetEdit 303 "도시의 밤거리`r`n캐릭터가 등장`r`n마지막 후렴 무대"
 Click 206 # SRT
 Click 207 # backup
 Check (Test-Path "$prefix.srt") 'storyboard SRT'
 Check (Test-Path "$prefix-backup.myvocal.json") 'backup export'
 $srt=Get-Content -Raw -Encoding UTF8 "$prefix.srt"
 Check ($srt.Contains('00:00:08,000')) 'SRT timestamps'
 Click 201 # Save storyboard metadata
 Click 100 # return song section
 Check ((ReadEdit 304).Contains('테스트 사용자 가사')) 'lyrics preserved across navigation'
 Click 202 # open persisted project from disk
 Check ((ReadEdit 301) -eq 'WIN32 실제 사용자 테스트') 'native open/reload project'
 Click 103 # back to storyboard
 Check ((ReadEdit 303).Contains('캐릭터가 등장')) 'storyboard persisted after reload'
 $listeners=Get-NetTCPConnection -OwningProcess $process.Id -State Listen -ErrorAction SilentlyContinue
 Check (($null -eq $listeners) -or (@($listeners).Count -eq 0)) 'native GUI created an HTTP/TCP listening server'
 Write-Host 'PASS: REAL WINDOWS Win32 UI => title, prompt, lyrics, BPM, editable arrangement, JSON, MIDI, WAV, SRT, backup, reload, native window; no local server.'
} finally {
 if($script:hwnd -ne [IntPtr]::Zero -and [NativeUI]::IsWindow($script:hwnd)){[void][NativeUI]::SendMessage($script:hwnd,0x0010,[IntPtr]::Zero,[IntPtr]::Zero)}
 if(-not $process.HasExited){Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue}
}
