//go:build windows

package main

import (
 "context"
 "errors"
 "fmt"
 "strconv"
 "strings"
 "syscall"
 "unsafe"
)

const (
 mvWindowClass="MYVOCALNativeMusicMVStudio"
 idMVStudio=126
 idMVStart=940
 idMVCancel=941
 idMVClose=942
 idMVUseProject=943
 idMVEditSync=944
 idMVBrowseFirst=950
 wmMVStatus=0x8002
)
type mvStudioWindow struct{
 hwnd,mode,start,cancel,status uintptr
 fields [10]uintptr
 running bool
}
var mvStudio mvStudioWindow
var mvStudioClassReady bool
var mvFieldLabels=[10]string{
 "Python.exe (로컬)","FFmpeg.exe (로컬)","인물·캐릭터 PNG/JPG",
 "보컬 가창 WAV","악기 반주 WAV","가사 시간 JSON",
 "RVC 본인 음색 모델 .pth (선택)","RVC 설치 폴더 (선택)",
 "새 뮤직비디오 MP4 저장","RVC 반음 이동 (-24~24)",
}
var mvStyles=[]string{"mixed","performance","story","static"}
var mvStyleLabels=[]string{"혼합 MV (스토리+공연)","공연형 MV","스토리형 MV","고정형 MV"}

func mvStatus(value string){
 if mvStudio.status!=0{setText(mvStudio.status,value)}
}
func mvRead()mvProductionRequest{
 vals:=[10]string{}
 for i:=range vals{vals[i]=strings.TrimSpace(readText(mvStudio.fields[i]))}
 index,_,_:=sendMessage.Call(mvStudio.mode,cbGetCurSel,0,0)
 style:="mixed"
 if int(index)>=0&&int(index)<len(mvStyles){style=mvStyles[int(index)]}
 pitch,_:=strconv.Atoi(vals[9])
 return mvProductionRequest{
  Python:vals[0],FFmpeg:vals[1],Portrait:vals[2],
  Vocal:vals[3],Accompaniment:vals[4],Alignment:vals[5],
  VoiceModel:vals[6],RVCInstall:vals[7],Output:vals[8],
  Pitch:pitch,Style:style,
 }
}
func chooseMVSource(index int)(string,bool){
 if index==7{return folderPicker()}
 var buf [32768]uint16
 filter:=syscall.StringToUTF16("로컬 파일\x00*.*\x00\x00")
 opts:=openFileName{Size:uint32(unsafe.Sizeof(openFileName{})),
  Owner:mvStudio.hwnd,File:&buf[0],MaxFile:uint32(len(buf)),
  Filter:&filter[0],Flags:0x00000800|0x00080000,
 }
 proc:=openDialog
 if index==8{
  ext:=utf16("mp4")
  opts.DefExt=ext
  opts.Flags|=0x00000002
  proc=saveDialog
 }else{opts.Flags|=0x00001000}
 ok,_,_:=proc.Call(uintptr(unsafe.Pointer(&opts)))
 if ok==0{return "",false}
 return syscall.UTF16ToString(buf[:]),true
}
func launchMVProduction(){
 ui.mu.Lock()
 busy:=ui.running
 ui.mu.Unlock()
 if busy{showError(errors.New("다른 로컬 AI 작업이 진행 중입니다"));return}
 req:=mvRead()
 if err:=validateMVProduction(req);err!=nil{showError(err);return}
 _,projectAtStart:=studioSnapshot()
 ctx,cancel:=context.WithCancel(context.Background())
 ui.mu.Lock();ui.cancel=cancel;ui.mu.Unlock()
 setRunning(true)
 mvStudio.running=true
 enableWindow.Call(mvStudio.start,0)
 enableWindow.Call(mvStudio.cancel,1)
 mvStatus("음색 변환(선택) → 보컬·반주 믹싱 → 2D 립싱크 → MP4 출력 진행 중")
 appendLog("\r\n음악·보컬·캐릭터 통합 2D MV 제작 시작\r\n")
 go func(){
  err:=runMusicMVProduction(ctx,req,appendLog)
  if err!=nil{appendLog("\r\n음악+MV 제작 실패: "+err.Error()+"\r\n")}else{
   appendLog("\r\nMP4 제작 및 저장 완료: "+req.Output+"\r\n")
   _,nowProject:=studioSnapshot()
   if projectAtStart!=""&&projectAtStart==nowProject{
    if e:=importStudioAsset(req.Output);e!=nil{appendLog("\r\n완성 MP4 프로젝트 등록 실패: "+e.Error()+"\r\n")}
   }
  }
  ui.mu.Lock();ui.cancel=nil;ui.running=false;ui.mu.Unlock()
  postMessage.Call(ui.hwnd,wmAppLog,0,0)
  postMessage.Call(mvStudio.hwnd,wmMVStatus,0,0)
 }()
}
func suggestSavedMVAssets(){
 f,err:=currentMVProjectFields()
 if err!=nil{showError(err);return}
 items:=[]string{f.Python,f.FFmpeg,f.Portrait,f.Vocal,f.Backing,f.Alignment,f.VoiceModel,"",f.Output}
 filled:=0
 for index,value:=range items{
  if value!=""&&strings.TrimSpace(readText(mvStudio.fields[index]))==""{
   setText(mvStudio.fields[index],value)
   filled++
  }
 }
 mvStatus(fmt.Sprintf("프로젝트에 저장된 사용 가능 자산으로 빈 입력 칸 %d개를 채웠습니다. 길이·모델·권리 확인 후 실행하세요.",filled))
}
func mvWindowProc(hwnd uintptr,message uint32,wparam,lparam uintptr)uintptr{
 switch message{
 case wmCreate:
  mvStudio.hwnd=hwnd
  callCreate("STATIC","MYVOCAL  |  순수 로컬 음악+가창+2D MV 제작",wsChild|wsVisible,20,10,900,28,hwnd,0)
  callCreate("STATIC","보유한 반주·가창 WAV를 사용하며, 선택 시 본인 RVC 모델로 가창 음색을 변환합니다.",wsChild|wsVisible,20,42,910,28,hwnd,0)
  for i,label:=range mvFieldLabels{
   y:=int32(83+i*45)
   callCreate("STATIC",label,wsChild|wsVisible,20,y+5,240,30,hwnd,0)
   mvStudio.fields[i]=callCreate("EDIT","",wsChild|wsVisible|wsBorder|esAutoHScroll,275,y,600,31,hwnd,0)
   if i!=9{callCreate("BUTTON","...",wsChild|wsVisible,885,y,46,31,hwnd,idMVBrowseFirst+uintptr(i))}
  }
  setText(mvStudio.fields[9],"0")
  callCreate("STATIC","영상 연출",wsChild|wsVisible,20,538,170,30,hwnd,0)
  mvStudio.mode=callCreate("COMBOBOX","",wsChild|wsVisible|cbsDropDownList|wsVScroll,275,535,600,150,hwnd,0)
  for _,name:=range mvStyleLabels{sendMessage.Call(mvStudio.mode,cbAddString,0,uintptr(unsafe.Pointer(utf16(name))))}
  sendMessage.Call(mvStudio.mode,cbSetCurSel,0,0)
  mvStudio.start=callCreate("BUTTON","가창·반주·MV 전체 제작",wsChild|wsVisible,20,600,280,44,hwnd,idMVStart)
  mvStudio.cancel=callCreate("BUTTON","작업 취소",wsChild|wsVisible,314,600,180,44,hwnd,idMVCancel)
  callCreate("BUTTON","닫기",wsChild|wsVisible,508,600,140,44,hwnd,idMVClose)
  enableWindow.Call(mvStudio.cancel,0)
  callCreate("BUTTON","프로젝트 저장 자산 가져오기",wsChild|wsVisible,20,658,290,36,hwnd,idMVUseProject)
  callCreate("BUTTON","가사·립싱크 시간 편집",wsChild|wsVisible,325,658,260,36,hwnd,idMVEditSync)
  mvStudio.status=callCreate("STATIC","입력한 오프라인 자료로 최대 6분 2D 음악 영상 MP4를 생성합니다. 실제 AI 가창 모델과 FFmpeg가 필요합니다.",wsChild|wsVisible,20,710,910,60,hwnd,0)
  return 0
 case wmCommand:
  id:=int(wparam&0xffff)
  if id==idMVStart{launchMVProduction();return 0}
  if id==idMVUseProject{suggestSavedMVAssets();return 0}
  if id==idMVEditSync{if err:=openNativeSyncStudio();err!=nil{showError(err)};return 0}
  if id==idMVCancel{
   ui.mu.Lock();c:=ui.cancel;ui.mu.Unlock()
   if c!=nil{c();appendLog("\r\n음악+MV 제작 취소 요청\r\n")}
   return 0
  }
  if id==idMVClose{
   if mvStudio.running{showError(errors.New("먼저 작업을 취소하고 종료될 때까지 창을 유지하세요"));return 0}
   destroyWindow.Call(hwnd);return 0
  }
  if id>=idMVBrowseFirst&&id<idMVBrowseFirst+9{
   i:=id-idMVBrowseFirst
   if path,ok:=chooseMVSource(i);ok{setText(mvStudio.fields[i],path)}
   return 0
  }
 case wmMVStatus:
  mvStudio.running=false
  enableWindow.Call(mvStudio.start,1)
  enableWindow.Call(mvStudio.cancel,0)
  mvStatus("작업 종료. 실제 출력·오류 내용은 메인 창 로그를 확인하세요.")
  return 0
 case wmClose:
  if mvStudio.running{showError(errors.New("작업을 먼저 취소하고 종료될 때까지 창을 유지하세요"));return 0}
  destroyWindow.Call(hwnd);return 0
 case wmDestroy:
  if mvStudio.running{return 0}
  mvStudio=mvStudioWindow{}
  return 0
 }
 ret,_,_:=defWindowProc.Call(hwnd,uintptr(message),wparam,lparam)
 return ret
}
func openNativeMVStudio()error{
 if mvStudio.hwnd!=0{showWindow.Call(mvStudio.hwnd,1);return nil}
 if !mvStudioClassReady{
  instance,_,_:=getModuleHandle.Call(0)
  name:=utf16(mvWindowClass)
  c:=wndClassEx{Size:uint32(unsafe.Sizeof(wndClassEx{})),
   WndProc:syscall.NewCallback(mvWindowProc),Instance:instance,Background:uintptr(6),ClassName:name}
  result,_,e:=registerClass.Call(uintptr(unsafe.Pointer(&c)))
  if result==0{return fmt.Errorf("음악+MV 창 등록 오류: %v",e)}
  mvStudioClassReady=true
 }
 hwnd:=callCreate(mvWindowClass,"MYVOCAL | 음악+보컬+뮤직비디오 자동 제작",wsOverlappedWindow|wsVisible,150,75,980,845,0,0)
 if hwnd==0{return errors.New("Win32 MV 작업실을 열지 못했습니다")}
 showWindow.Call(hwnd,1);updateWindow.Call(hwnd)
 return nil
}
