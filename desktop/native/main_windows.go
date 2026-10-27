//go:build windows

// MYVOCAL Studio native Windows GUI: Win32 controls, no HTTP/HTML/WebView2.
package main

import (
 "context"
 "fmt"
 "os"
 "os/exec"
 "path/filepath"
 "runtime"
 "strings"
 "sync"
 "syscall"
 "unsafe"
)
const (
 wsOverlappedWindow=0x00CF0000
 wsVisible=0x10000000
 wsChild=0x40000000
 wsBorder=0x00800000
 wsVScroll=0x00200000
 esAutoHScroll=0x0080
 esMultiline=0x0004
 esAutoVScroll=0x0040
 esReadOnly=0x0800
 cbsDropDownList=0x0003
 wmCreate=0x0001
 wmDestroy=0x0002
 wmClose=0x0010
 wmCommand=0x0111
 wmSetFont=0x0030
 wmAppLog=0x8001
 cbAddString=0x0143
 cbSetCurSel=0x014E
 cbGetCurSel=0x0147
 cbnSelChange=1
 idTask=101
 idStart=102
 idCancel=103
 idBrowseBase=200
)
var (
 user32=syscall.NewLazyDLL("user32.dll")
 kernel32=syscall.NewLazyDLL("kernel32.dll")
 gdi32=syscall.NewLazyDLL("gdi32.dll")
 comdlg32=syscall.NewLazyDLL("comdlg32.dll")
 shell32=syscall.NewLazyDLL("shell32.dll")
 ole32=syscall.NewLazyDLL("ole32.dll")
 registerClass=user32.NewProc("RegisterClassExW")
 createWindow=user32.NewProc("CreateWindowExW")
 defWindowProc=user32.NewProc("DefWindowProcW")
 showWindow=user32.NewProc("ShowWindow")
 updateWindow=user32.NewProc("UpdateWindow")
 getMessage=user32.NewProc("GetMessageW")
 translateMessage=user32.NewProc("TranslateMessage")
 dispatchMessage=user32.NewProc("DispatchMessageW")
 sendMessage=user32.NewProc("SendMessageW")
 postMessage=user32.NewProc("PostMessageW")
 setWindowText=user32.NewProc("SetWindowTextW")
 getWindowText=user32.NewProc("GetWindowTextW")
 getTextLength=user32.NewProc("GetWindowTextLengthW")
 enableWindow=user32.NewProc("EnableWindow")
 destroyWindow=user32.NewProc("DestroyWindow")
 postQuit=user32.NewProc("PostQuitMessage")
 messageBox=user32.NewProc("MessageBoxW")
 getModuleHandle=kernel32.NewProc("GetModuleHandleW")
 getStockObject=gdi32.NewProc("GetStockObject")
 openDialog=comdlg32.NewProc("GetOpenFileNameW")
 saveDialog=comdlg32.NewProc("GetSaveFileNameW")
 browseForFolder=shell32.NewProc("SHBrowseForFolderW")
 getPathFromList=shell32.NewProc("SHGetPathFromIDListW")
 freePIDL=ole32.NewProc("CoTaskMemFree")
)
type point struct {X,Y int32}
type msg struct {Hwnd uintptr;Message uint32;_ uint32;WParam,LParam uintptr;Time uint32;Pt point;LPrivate uint32}
type wndClassEx struct{
 Size,Style uint32
 WndProc uintptr
 ClsExtra,WndExtra int32
 Instance,Icon,Cursor,Background uintptr
 MenuName,ClassName *uint16
 IconSmall uintptr
}
type openFileName struct {
 Size uint32
 Owner,Instance uintptr
 Filter,CustomFilter *uint16
 MaxCustomFilter,FilterIndex uint32
 File *uint16
 MaxFile uint32
 FileTitle *uint16
 MaxFileTitle uint32
 InitialDir,Title *uint16
 Flags uint32
 FileOffset,FileExtension uint16
 DefExt *uint16
 CustData,Hook,TemplateName uintptr
 ReservedPtr uintptr
 ReservedInt,FlagsEx uint32
}
type browseInfo struct {
 Owner,Root uintptr
 DisplayName,Title *uint16
 Flags uint32
 Callback,Param uintptr
 Image int32
}
type nativeUI struct{
 hwnd,chooser,start,cancelButton,logEdit,projectStatus uintptr
 labels [7]uintptr
 edits [7]uintptr
 browses [7]uintptr
 running bool
 mu sync.Mutex
 cancel context.CancelFunc
 logs string
}
var ui nativeUI

func utf16(s string)*uint16{return syscall.StringToUTF16Ptr(s)}
func callCreate(class,text string,style uint32,x,y,width,height int32,parent,id uintptr)uintptr{
 instance,_,_:=getModuleHandle.Call(0)
 ret,_,_:=createWindow.Call(0,uintptr(unsafe.Pointer(utf16(class))),uintptr(unsafe.Pointer(utf16(text))),uintptr(style),uintptr(x),uintptr(y),uintptr(width),uintptr(height),parent,id,instance,0)
 if ret!=0&&parent!=0{font,_,_:=getStockObject.Call(17);sendMessage.Call(ret,wmSetFont,font,1)}
 return ret
}
func setText(hwnd uintptr,value string){setWindowText.Call(hwnd,uintptr(unsafe.Pointer(utf16(value))))}
func readText(hwnd uintptr)string{
 n,_,_:=getTextLength.Call(hwnd)
 if n>8192{n=8192}
 buf:=make([]uint16,n+1)
 getWindowText.Call(hwnd,uintptr(unsafe.Pointer(&buf[0])),uintptr(len(buf)))
 return syscall.UTF16ToString(buf)
}
func showError(err error){messageBox.Call(ui.hwnd,uintptr(unsafe.Pointer(utf16(err.Error()))),uintptr(unsafe.Pointer(utf16("MYVOCAL Studio"))),0x10)}
func appendLog(s string){
 ui.mu.Lock()
 ui.logs+=s
 ru:=[]rune(ui.logs)
 if len(ru)>19000{ui.logs=string(ru[len(ru)-19000:])}
 ui.mu.Unlock()
 postMessage.Call(ui.hwnd,wmAppLog,0,0)
}
func setRunning(yes bool){
 ui.mu.Lock();ui.running=yes;ui.mu.Unlock()
 v:=uintptr(1);if yes{v=0}
 enableWindow.Call(ui.start,v)
 enableWindow.Call(ui.cancelButton,1-v)
}
func getTask()int{
 ret,_,_:=sendMessage.Call(ui.chooser,cbGetCurSel,0,0)
 if int32(ret)<0{return 0}
 return int(ret)
}
var fieldNames=[16][7]string{
 {"Python.exe","MusicGen 모델 폴더","입력 (미사용)","보조 (미사용)","출력 WAV","곡 설명","길이(3~28초)"},
 {"Python.exe","RVC 설치 폴더","학습 데이터 폴더","보조 (미사용)","출력 모델 .pth","설명 (미사용)","학습 Epochs"},
 {"Python.exe","Demucs 모델 폴더","입력 음악 WAV","보조 (미사용)","출력 폴더","설명 (미사용)","모델 이름"},
 {"Python.exe","모델 (미사용)","가창 녹음 WAV","MIDI 음표 JSON","출력 WAV","설명 (미사용)","반음 이동"},
 {"Python.exe","캐릭터 이미지","보컬 WAV","음소 싱크 JSON","출력 WebM","설명 (미사용)","FFmpeg.exe"},
 {"Python.exe","RVC 설치 폴더","원본 노래 WAV","학습 모델 .pth","출력 WAV","인덱스 .index (선택)","반음 이동"},
 {"Python.exe","DiffSinger 설치 폴더","악보 JSON(.ds)","실험 이름","출력 WAV","권리 확인: confirmed","옵션 (미사용)"},
 {"Python.exe","MusicGen 모델 폴더","입력 (미사용)","보조 (미사용)","출력 WAV","곡 설명","길이(180~360초)"},
 {"Python (미사용)","모델 (미사용)","반주 WAV","보컬 WAV","출력 WAV","설명 (미사용)","보컬 음량(0~200%)"},
 {"Python (미사용)","모델 (미사용)","입력 (미사용)","보조 (미사용)","마이크 녹음 WAV","설명 (미사용)","녹음 길이(3~180초)"},
 {"Python (미사용)","모델 (미사용)","입력 WAV","보조 (미사용)","새 출력 WAV","시작 시간(초)","종료 시간(초)"},
 {"Python (미사용)","모델 (미사용)","입력 WAV","보조 (미사용)","새 출력 WAV","설명 (미사용)","목표 피크(10~100%)"},
 {"Python (미사용)","모델 (미사용)","입력 WAV","보조 (미사용)","새 출력 WAV","페이드 인(초)","페이드 아웃(초)"},
 {"Python.exe","FluidSynth DLL","입력 MIDI","SoundFont SF2/SF3","출력 악기 WAV","합성 음량(0.01~1)","샘플레이트(44100/48000)"},
 {"llama-cli.exe","GGUF 모델 파일","입력 (미사용)","보조 (미사용)","출력 가사 TXT","노래 주제·장르·설명","생성 토큰(128~2048)"},
 {"llama-cli.exe","GGUF 작곡 모델 파일","입력 (미사용)","보조 (미사용)","출력 MIDI .mid","곡 설명·구조·악기 스타일","생성 토큰(512~4096)"},
}
func updateFields(){
 task:=getTask()
 for i:=0;i<7;i++{
  setText(ui.labels[i],fieldNames[task][i])
  enabled:=!strings.Contains(fieldNames[task][i],"미사용")
  v:=uintptr(0);if enabled{v=1}
  enableWindow.Call(ui.edits[i],v)
  if !pathField(task,i){v=0}
  enableWindow.Call(ui.browses[i],v)
 }
 defaults:=[]string{"12","20","htdemucs","0","","0","","180","100","30","10","95","2","44100","768","3072"}
 setText(ui.edits[6],defaults[task])
 if task==taskWavTrim{setText(ui.edits[5],"0")}
 if task==taskWavFade{setText(ui.edits[5],"2")}
 if task==taskSoundFont{setText(ui.edits[5],"0.2")}
 appendLog("\r\n모드: "+taskNames[task]+" (기존 사용자 파일은 덮어쓰지 않습니다)\r\n")
}
// Desktop-only Windows folder selection. No browser or remote file picker.
func directoryField(task,index int)bool{
 switch task{
 case taskMusicGen,taskLongMusicGen:return index==1
 case taskRVC:return index==1||index==2
 case taskDemucs:return index==1||index==4
 case taskRVCConvert,taskDiffSinger:return index==1
 }
 return false
}
func pathField(task,index int)bool{
 if directoryField(task,index){return true}
 if index==0{return task!=taskMixWAV}
 if index==4{return true}
 if index==2{return task==taskDemucs||task==taskScoreVocal||task==taskLipSync||task==taskRVCConvert||task==taskDiffSinger||task==taskMixWAV||task==taskWavTrim||task==taskWavNormalize||task==taskWavFade||task==taskSoundFont}
 if index==3{return task==taskScoreVocal||task==taskLipSync||task==taskRVCConvert||task==taskMixWAV||task==taskSoundFont}
 if index==5{return task==taskRVCConvert}
 if index==6{return task==taskLipSync}
 if index==1{return task==taskLipSync||task==taskSoundFont||task==taskAILyrics||task==taskAIComposer}
 return false
}
func folderPicker() (string,bool){
 var display [260]uint16
 title:=utf16("로컬 폴더 선택")
 info:=browseInfo{Owner:ui.hwnd,DisplayName:&display[0],Title:title,Flags:0x0001|0x0010}
 pidl,_,_:=browseForFolder.Call(uintptr(unsafe.Pointer(&info)))
 if pidl==0{return "",false}
 defer freePIDL.Call(pidl)
 var name [32768]uint16
 ok,_,_:=getPathFromList.Call(pidl,uintptr(unsafe.Pointer(&name[0])))
 if ok==0{return "",false}
 path:=syscall.UTF16ToString(name[:])
 if path==""{return "",false}
 return path,true
}
func filePicker(index int){
 task:=getTask()
 if !pathField(task,index){return}
 if directoryField(task,index){
  if value,ok:=folderPicker();ok{setText(ui.edits[index],value)}
  return
 }
 var buf [32768]uint16
 old:=readText(ui.edits[index]);if old!=""{copy(buf[:],syscall.StringToUTF16(old))}
 // OFN_PATHMUSTEXIST|OFN_EXPLORER; output mode permits choosing a new file.
 opts:=openFileName{Size:uint32(unsafe.Sizeof(openFileName{})),Owner:ui.hwnd,File:&buf[0],MaxFile:uint32(len(buf)),Flags:0x00000800|0x00080000}
 proc:=openDialog
 if index==4{proc=saveDialog}else{opts.Flags|=0x00001000}
 ret,_,_:=proc.Call(uintptr(unsafe.Pointer(&opts)))
 if ret!=0{setText(ui.edits[index],syscall.UTF16ToString(buf[:]))}
}
func readRequest()request{
 values:=[7]string{}
 for i:=0;i<7;i++{values[i]=strings.TrimSpace(readText(ui.edits[i]))}
 return request{Task:getTask(),Python:values[0],Engine:values[1],Input:values[2],Auxiliary:values[3],Output:values[4],Prompt:values[5],Option:values[6]}
}
func startTask(){
 ui.mu.Lock();busy:=ui.running;ui.mu.Unlock();if busy{return}
 r:=readRequest()
 if r.Task==taskMusicGen||r.Task==taskLongMusicGen||r.Task==taskAILyrics||r.Task==taskAIComposer{
  p,path:=studioSnapshot()
  if path!=""{
   r.GenrePlan=p.GenrePlan
   if r.Task!=taskAIComposer{r.Prompt=promptWithGenre(p.GenrePlan,r.Prompt)}
  }
 }
 if _,err:=prepareRequest(r);err!=nil{showError(err);return}
 _,projectAtStart:=studioSnapshot()
 ctx,cancel:=context.WithCancel(context.Background())
 ui.mu.Lock();ui.cancel=cancel;ui.mu.Unlock()
 setRunning(true)
 appendLog("\r\n시작: "+taskNames[r.Task]+"\r\n")
 go func(){
  err:=executeJob(ctx,r,appendLog)
  if err!=nil{appendLog("\r\n작업 실패: "+err.Error()+"\r\n")}else{
   appendLog("\r\n완료: "+taskNames[r.Task]+"\r\n")
   _,nowProject:=studioSnapshot()
   if projectAtStart!=""&&projectAtStart==nowProject {
    if assetErr:=recordStudioOutput(r.Task,r.Output);assetErr!=nil{appendLog("\r\n프로젝트 결과 연결 실패: "+assetErr.Error()+"\r\n")}
   }
  }
  ui.mu.Lock();ui.cancel=nil;ui.running=false;ui.mu.Unlock()
  postMessage.Call(ui.hwnd,wmAppLog,1,0)
 }()
}
func handleWindow(hwnd uintptr,message uint32,wparam,lparam uintptr)uintptr{
 switch message{
 case wmCreate:
  ui.hwnd=hwnd
  callCreate("STATIC","MYVOCAL Studio  |  로컬 Windows 음악·영상 제작 프로그램",wsChild|wsVisible,20,12,995,28,hwnd,0)
  callCreate("STATIC","작업 종류",wsChild|wsVisible,20,49,145,24,hwnd,0)
  ui.chooser=callCreate("COMBOBOX","",wsChild|wsVisible|wsVScroll|cbsDropDownList,180,47,800,190,hwnd,idTask)
  for _,n:=range taskNames{sendMessage.Call(ui.chooser,cbAddString,0,uintptr(unsafe.Pointer(utf16(n))))}
  sendMessage.Call(ui.chooser,cbSetCurSel,0,0)
  for i:=0;i<7;i++{
   y:=int32(88+i*45)
   ui.labels[i]=callCreate("STATIC","",wsChild|wsVisible,20,y+5,152,27,hwnd,0)
   ui.edits[i]=callCreate("EDIT","",wsChild|wsVisible|wsBorder|esAutoHScroll,180,y,735,30,hwnd,0)
   ui.browses[i]=callCreate("BUTTON","...",wsChild|wsVisible,925,y,55,30,hwnd,idBrowseBase+uintptr(i))
  }
  ui.start=callCreate("BUTTON","실제 로컬 엔진 실행",wsChild|wsVisible,180,412,245,35,hwnd,idStart)
  ui.cancelButton=callCreate("BUTTON","작업 취소",wsChild|wsVisible,437,412,140,35,hwnd,idCancel)
  ui.logEdit=callCreate("EDIT","준비 완료. 선택한 기존 모델·Python 환경만 사용합니다.\r\n",wsChild|wsVisible|wsBorder|wsVScroll|esMultiline|esAutoVScroll|esReadOnly,20,464,960,178,hwnd,0)
  callCreate("BUTTON","새 프로젝트",wsChild|wsVisible,20,660,165,35,hwnd,idProjectNew)
  callCreate("BUTTON","프로젝트 열기",wsChild|wsVisible,197,660,165,35,hwnd,idProjectOpen)
  callCreate("BUTTON","가사·설정 편집",wsChild|wsVisible,374,660,170,35,hwnd,idProjectEdit)
  callCreate("BUTTON","프로젝트 저장",wsChild|wsVisible,556,660,160,35,hwnd,idProjectSave)
  callCreate("BUTTON","자산 라이브러리",wsChild|wsVisible,728,660,170,35,hwnd,idProjectAssets)
  callCreate("BUTTON","MIDI 작곡·편집",wsChild|wsVisible,20,704,205,34,hwnd,idMIDIEditor)
  callCreate("BUTTON","음악+보컬+2D MV",wsChild|wsVisible,240,704,236,34,hwnd,idMVStudio)
  callCreate("BUTTON","가사·립싱크 싱크 편집",wsChild|wsVisible,493,704,246,34,hwnd,idNativeSyncEditor)
  callCreate("BUTTON","MV 스토리보드",wsChild|wsVisible,753,704,211,34,hwnd,idStoryboardEditor)
  callCreate("BUTTON","AI 가창+반주+MV 원클릭",wsChild|wsVisible,20,744,308,38,hwnd,idFullSong)
  callCreate("BUTTON","원본 장르·구간 설정",wsChild|wsVisible,344,744,246,38,hwnd,idGenreStudio)
  callCreate("BUTTON","8개 기능 시작 화면",wsChild|wsVisible,606,744,264,38,hwnd,idWelcomeOpen)
  callCreate("BUTTON","내 AI 가수 녹음·학습",wsChild|wsVisible,20,793,260,38,hwnd,idVoiceStudio)
  ui.projectStatus=callCreate("STATIC",projectStatusText(),wsChild|wsVisible,20,842,960,46,hwnd,0)
  enableWindow.Call(ui.cancelButton,0)
  if pythonPath,err:=exec.LookPath("python.exe");err==nil&&filepath.IsAbs(pythonPath){setText(ui.edits[0],pythonPath)}
  updateFields()
  return 0
 case wmCommand:
  id:=int(wparam&0xffff);notify:=int((wparam>>16)&0xffff)
  if id==idMVStudio{if err:=openNativeMVStudio();err!=nil{showError(err)};return 0}
  if id==idNativeSyncEditor{if err:=openNativeSyncStudio();err!=nil{showError(err)};return 0}
  if id==idStoryboardEditor{if err:=openNativeStoryboardEditor();err!=nil{showError(err)};return 0}
  if id==idFullSong{if err:=openNativeFullSongStudio();err!=nil{showError(err)};return 0}
  if id==idGenreStudio{if err:=openGenreStudio();err!=nil{showError(err)};return 0}
  if id==idWelcomeOpen{if err:=openOriginalHome();err!=nil{showError(err)};return 0}
  if id==idVoiceStudio{if err:=openNativeVoiceStudio();err!=nil{showError(err)};return 0}
  if handleProjectCommand(id){return 0}
  if id==idTask&&notify==cbnSelChange{updateFields();return 0}
  if id==idStart{startTask();return 0}
  if id==idCancel{ui.mu.Lock();f:=ui.cancel;ui.mu.Unlock();if f!=nil{f();appendLog("\r\n취소 요청 중...\r\n")};return 0}
  if id>=idBrowseBase&&id<idBrowseBase+7{filePicker(id-idBrowseBase);return 0}
 case wmAppLog:
  ui.mu.Lock();logText:=ui.logs;isRunning:=ui.running;ui.mu.Unlock()
  setText(ui.logEdit,logText)
  if !isRunning{setRunning(false)}
  refreshProjectStatus()
  if assetUI.hwnd!=0{refreshAssetList()}
  return 0
 case wmClose:
  ui.mu.Lock();running:=ui.running;ui.mu.Unlock()
  if running{showError(fmt.Errorf("진행 중인 작업은 먼저 '작업 취소'를 눌러 종료한 뒤 창을 닫으세요"));return 0}
  destroyWindow.Call(hwnd);return 0
 case wmDestroy:
  postQuit.Call(0);return 0
 }
 ret,_,_:=defWindowProc.Call(hwnd,uintptr(message),wparam,lparam)
 return ret
}
func main(){
 runtime.LockOSThread()
 clsName:=utf16("MYVOCALPureNativeWindows")
 instance,_,_:=getModuleHandle.Call(0)
 wc:=wndClassEx{Size:uint32(unsafe.Sizeof(wndClassEx{})),WndProc:syscall.NewCallback(handleWindow),Instance:instance,Background:uintptr(6),ClassName:clsName}
 ret,_,e:=registerClass.Call(uintptr(unsafe.Pointer(&wc)))
 if ret==0{fmt.Fprintln(os.Stderr,"Window class:",e);return}
 hwnd:=callCreate("MYVOCALPureNativeWindows","MYVOCAL Studio - Native EXE",wsOverlappedWindow|wsVisible,100,50,1020,985,0,0)
 if hwnd==0{fmt.Fprintln(os.Stderr,"Windows GUI 생성 실패");return}
 showWindow.Call(hwnd,1);updateWindow.Call(hwnd)
 if err:=openOriginalHome();err!=nil{showError(err)}
 var m msg
 for{ret,_,_:=getMessage.Call(uintptr(unsafe.Pointer(&m)),0,0,0);if int32(ret)<=0{break};translateMessage.Call(uintptr(unsafe.Pointer(&m)));dispatchMessage.Call(uintptr(unsafe.Pointer(&m)))}
}
