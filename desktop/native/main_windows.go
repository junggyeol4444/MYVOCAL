//go:build windows

// MYVOCAL Studio native Windows GUI: Win32 controls, no HTTP/HTML/WebView2.
package main

import (
 "context"
 "fmt"
 "os"
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
type nativeUI struct{
 hwnd,chooser,start,cancelButton,logEdit uintptr
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
var fieldNames=[5][7]string{
 {"Python.exe","MusicGen 모델 폴더","입력 (미사용)","보조 (미사용)","출력 WAV","곡 설명","길이(3~28초)"},
 {"Python.exe","RVC 설치 폴더","학습 데이터 폴더","보조 (미사용)","출력 모델 .pth","설명 (미사용)","학습 Epochs"},
 {"Python.exe","Demucs 모델 폴더","입력 음악 WAV","보조 (미사용)","출력 폴더","설명 (미사용)","모델 이름"},
 {"Python.exe","모델 (미사용)","가창 녹음 WAV","MIDI 음표 JSON","출력 WAV","설명 (미사용)","반음 이동"},
 {"Python.exe","캐릭터 이미지","보컬 WAV","음소 싱크 JSON","출력 WebM","설명 (미사용)","FFmpeg.exe"},
}
func updateFields(){
 task:=getTask()
 for i:=0;i<7;i++{
  setText(ui.labels[i],fieldNames[task][i])
  enabled:=!strings.Contains(fieldNames[task][i],"미사용")
  v:=uintptr(0);if enabled{v=1}
  enableWindow.Call(ui.edits[i],v)
  enableWindow.Call(ui.browses[i],v)
 }
 defaults:=[]string{"12","20","htdemucs","0",""}
 setText(ui.edits[6],defaults[task])
 appendLog("\r\n모드: "+taskNames[task]+" (기존 사용자 파일은 덮어쓰지 않습니다)\r\n")
}
func filePicker(index int){
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
 if _,err:=prepareRequest(r);err!=nil{showError(err);return}
 ctx,cancel:=context.WithCancel(context.Background())
 ui.mu.Lock();ui.cancel=cancel;ui.mu.Unlock()
 setRunning(true)
 appendLog("\r\n시작: "+taskNames[r.Task]+"\r\n")
 go func(){
  err:=executeJob(ctx,r,appendLog)
  if err!=nil{appendLog("\r\n작업 실패: "+err.Error()+"\r\n")}else{appendLog("\r\n완료: "+taskNames[r.Task]+"\r\n")}
  ui.mu.Lock();ui.cancel=nil;ui.running=false;ui.mu.Unlock()
  postMessage.Call(ui.hwnd,wmAppLog,1,0)
 }()
}
func handleWindow(hwnd uintptr,message uint32,wparam,lparam uintptr)uintptr{
 switch message{
 case wmCreate:
  ui.hwnd=hwnd
  callCreate("STATIC","MYVOCAL Studio  |  오프라인 Windows GUI (HTTP·HTML·WebView 사용 안 함)",wsChild|wsVisible,20,12,995,28,hwnd,0)
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
  enableWindow.Call(ui.cancelButton,0)
  updateFields()
  return 0
 case wmCommand:
  id:=int(wparam&0xffff);notify:=int((wparam>>16)&0xffff)
  if id==idTask&&notify==cbnSelChange{updateFields();return 0}
  if id==idStart{startTask();return 0}
  if id==idCancel{ui.mu.Lock();f:=ui.cancel;ui.mu.Unlock();if f!=nil{f();appendLog("\r\n취소 요청 중...\r\n")};return 0}
  if id>=idBrowseBase&&id<idBrowseBase+7{filePicker(id-idBrowseBase);return 0}
 case wmAppLog:
  ui.mu.Lock();logText:=ui.logs;isRunning:=ui.running;ui.mu.Unlock()
  setText(ui.logEdit,logText)
  if !isRunning{setRunning(false)}
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
 hwnd:=callCreate("MYVOCALPureNativeWindows","MYVOCAL Studio - Native EXE",wsOverlappedWindow|wsVisible,100,50,1020,720,0,0)
 if hwnd==0{fmt.Fprintln(os.Stderr,"Windows GUI 생성 실패");return}
 showWindow.Call(hwnd,1);updateWindow.Call(hwnd)
 var m msg
 for{ret,_,_:=getMessage.Call(uintptr(unsafe.Pointer(&m)),0,0,0);if int32(ret)<=0{break};translateMessage.Call(uintptr(unsafe.Pointer(&m)));dispatchMessage.Call(uintptr(unsafe.Pointer(&m)))}
}
