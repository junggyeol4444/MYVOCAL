//go:build windows

package main

import(
 "context"
 "errors"
 "fmt"
 "os/exec"
 "path/filepath"
 "strconv"
 "strings"
 "syscall"
 "unsafe"
)

const(
 songWindowClass="MYVOCALNativeFullSongProducer"
 idFullSong=129
 idSongPage1=1250
 idSongPage2=1251
 idSongStart=1252
 idSongCancel=1253
 idSongClose=1254
 idSongProjectAssets=1255
 idSongBrowseBase=1260
 wmSongCompleted=0x8003
)
var fullLabels=[15]string{
 "로컬 Python.exe","로컬 FFmpeg.exe","DiffSinger 설치 폴더",
 "한국어 가창 악보 .ds","학습 모델 실험 이름","MIDI 악기 편곡 파일",
 "SoundFont 음원 .sf2/.sf3","FluidSynth DLL 파일",
 "내 캐릭터 이미지 PNG/JPG","가사 발음 시간표 JSON","새 MP4 출력 경로",
 "본인 RVC 음색 모델 (선택)","RVC 설치 폴더 (선택)",
 "장면 스토리보드 JSON (선택)","RVC 반음 이동 (-24~24)",
}
type fullSongStudio struct{
 hwnd,first,second,start,cancel,status,license,style uintptr
 fields [15]uintptr
 labels [15]uintptr
 browse [15]uintptr
 page int
 running bool
}
var songUI fullSongStudio
var songClassReady bool

func songPage(page int){
 songUI.page=page
 for i:=range songUI.fields{
  visible:=uintptr(0)
  if page==0&&i<8||page==1&&i>=8{visible=1}
  showWindow.Call(songUI.fields[i],visible)
  showWindow.Call(songUI.labels[i],visible)
  if songUI.browse[i]!=0{showWindow.Call(songUI.browse[i],visible)}
 }
 showWindow.Call(songUI.style,uintptr(page))
 showWindow.Call(songUI.license,uintptr(page))
}

func songRequestFromGUI()fullSongRequest{
 values:=[15]string{}
 for i:=range values{values[i]=strings.TrimSpace(readText(songUI.fields[i]))}
 pos,_,_:=sendMessage.Call(songUI.style,cbGetCurSel,0,0)
 mode:="mixed"
 if int32(pos)>=0&&int(pos)<len(mvStyles){mode=mvStyles[pos]}
 pitch,err:=strconv.Atoi(values[14])
 if err!=nil{pitch=1000}
 checked,_,_:=sendMessage.Call(songUI.license,0x00F0,0,0)
 return fullSongRequest{
  Python:values[0],FFmpeg:values[1],DiffSingerRoot:values[2],
  ScoreDS:values[3],Experiment:values[4],MIDI:values[5],
  SoundFont:values[6],FluidSynthDLL:values[7],Portrait:values[8],
  Alignment:values[9],Output:values[10],VoiceModel:values[11],
  RVCRoot:values[12],Storyboard:values[13],Pitch:pitch,
  Style:mode,RightsConfirmed:checked==1,
 }
}
func songBrowseFile(index int)(string,bool){
 if index==2||index==12{return folderPicker()}
 var buf [32768]uint16
 filter:=syscall.StringToUTF16("로컬 파일\x00*.*\x00\x00")
 opts:=openFileName{Size:uint32(unsafe.Sizeof(openFileName{})),Owner:songUI.hwnd,
  File:&buf[0],MaxFile:uint32(len(buf)),Filter:&filter[0],
  Flags:0x00000800|0x00080000,
 }
 proc:=openDialog
 if index==10{
  opts.DefExt=utf16("mp4")
  opts.Flags|=0x00000002
  proc=saveDialog
 }else{opts.Flags|=0x00001000}
 ok,_,_:=proc.Call(uintptr(unsafe.Pointer(&opts)))
 if ok==0{return "",false}
 return syscall.UTF16ToString(buf[:]),true
}
func fillFullSongFromProject(){
 project,path:=studioSnapshot()
 if path==""{showError(errors.New("먼저 프로젝트를 만들거나 불러와야 합니다"));return}
 suggestions:=[15]string{}
 if p,e:=exec.LookPath("python.exe");e==nil{
  if p,e=filepath.Abs(p);e==nil{suggestions[0]=p}
 }
 if p,e:=exec.LookPath("ffmpeg.exe");e==nil{
  if p,e=filepath.Abs(p);e==nil{suggestions[1]=p}
 }
 m,e:=currentMVProjectFields()
 if e==nil{
  suggestions[8]=m.Portrait;suggestions[9]=m.Alignment
  suggestions[10]=m.Output;suggestions[11]=m.VoiceModel
  suggestions[13]=m.Storyboard
 }
 for _,asset:=range project.Assets{
  if !regularStudioAsset(asset.Path){continue}
  ext:=strings.ToLower(filepath.Ext(asset.Path))
  if (ext==".mid"||ext==".midi")&&suggestions[5]==""{suggestions[5]=asset.Path}
  if (ext==".sf2"||ext==".sf3")&&suggestions[6]==""{suggestions[6]=asset.Path}
  if ext==".ds"&&suggestions[3]==""{suggestions[3]=asset.Path}
 }
 total:=0
 for i,value:=range suggestions{
  if value!=""&&readText(songUI.fields[i])==""{setText(songUI.fields[i],value);total++}
 }
 setText(songUI.status,fmt.Sprintf("프로젝트에 등록된 로컬 자산 %d개를 빈 칸에 연결했습니다. 모델 경로·이용 권한·작업 내용을 확인하세요.",total))
}
func startFullSong(){
 ui.mu.Lock()
 busy:=ui.running
 ui.mu.Unlock()
 if busy{showError(errors.New("다른 오디오·MV 작업이 진행 중입니다"));return}
 r:=songRequestFromGUI()
 if err:=validateFullSongRequest(r);err!=nil{showError(err);return}
 _,projectPath:=studioSnapshot()
 ctx,cancel:=context.WithCancel(context.Background())
 ui.mu.Lock();ui.cancel=cancel;ui.running=true;ui.mu.Unlock()
 setRunning(true)
 songUI.running=true
 enableWindow.Call(songUI.start,0)
 enableWindow.Call(songUI.cancel,1)
 setText(songUI.status,"학습된 신경망 가창 → MIDI 반주 → 보컬 정렬 → RVC 선택 → 믹싱·2D MV·MP4를 실행합니다.")
 appendLog("\r\n[전체 음악+MV] 실제 DiffSinger + SoundFont 통합 작업 시작\r\n")
 go func(){
  err:=runFullSong(ctx,r,appendLog)
  if err!=nil{appendLog("\r\n[전체 음악+MV] 실패: "+err.Error()+"\r\n")}else{
   appendLog("\r\n[전체 음악+MV] 출력: "+r.Output+"\r\n")
   _,current:=studioSnapshot()
   if projectPath!=""&&projectPath==current{
    if e:=importStudioAsset(r.Output);e!=nil{appendLog("\r\n생성 영상 프로젝트 연결 실패: "+e.Error()+"\r\n")}
   }
  }
  ui.mu.Lock();ui.cancel=nil;ui.running=false;ui.mu.Unlock()
  postMessage.Call(ui.hwnd,wmAppLog,1,0)
  postMessage.Call(songUI.hwnd,wmSongCompleted,0,0)
 }()
}
func songWinProc(hwnd uintptr,message uint32,wparam,lparam uintptr)uintptr{
 switch message{
 case wmCreate:
  songUI.hwnd=hwnd
  callCreate("STATIC","MYVOCAL  |  AI 가창+MIDI 반주+내 음색+MV 통합 제작 (로컬)",wsChild|wsVisible,20,10,960,34,hwnd,0)
  songUI.first=callCreate("BUTTON","1. 가창·반주 설정",wsChild|wsVisible,20,56,235,38,hwnd,idSongPage1)
  songUI.second=callCreate("BUTTON","2. 캐릭터·영상 출력",wsChild|wsVisible,268,56,235,38,hwnd,idSongPage2)
  for i,label:=range fullLabels{
   row:=i
   if i>=8{row=i-8}
   y:=int32(122+row*58)
   songUI.labels[i]=callCreate("STATIC",label,wsChild|wsVisible,20,y+6,265,28,hwnd,0)
   songUI.fields[i]=callCreate("EDIT","",wsChild|wsVisible|wsBorder|esAutoHScroll,298,y,557,31,hwnd,0)
   if i!=4&&i!=14{
    songUI.browse[i]=callCreate("BUTTON","...",wsChild|wsVisible,868,y,52,31,hwnd,idSongBrowseBase+uintptr(i))
   }
  }
  setText(songUI.fields[14],"0")
  songUI.style=callCreate("COMBOBOX","",wsChild|wsVisible|cbsDropDownList|wsVScroll,20,551,440,160,hwnd,0)
  for _,value:=range mvStyleLabels{sendMessage.Call(songUI.style,cbAddString,0,uintptr(unsafe.Pointer(utf16(value))))}
  sendMessage.Call(songUI.style,cbSetCurSel,0,0)
  songUI.license=callCreate("BUTTON","내 음색·악보·이미지의 사용 권한을 확인했습니다",wsChild|wsVisible|0x00000003,20,600,820,40,hwnd,0)
  songUI.start=callCreate("BUTTON","가창→반주→MV 한번에 제작",wsChild|wsVisible,20,660,320,48,hwnd,idSongStart)
  songUI.cancel=callCreate("BUTTON","작업 취소",wsChild|wsVisible,356,660,172,48,hwnd,idSongCancel)
  callCreate("BUTTON","프로젝트 자산 가져오기",wsChild|wsVisible,544,660,215,48,hwnd,idSongProjectAssets)
  callCreate("BUTTON","닫기",wsChild|wsVisible,774,660,145,48,hwnd,idSongClose)
  enableWindow.Call(songUI.cancel,0)
  songUI.status=callCreate("STATIC","DiffSinger 학습 모델·MIDI·SoundFont·가사 시간·사진이 준비되어야 합니다. 온라인 업로드는 하지 않습니다.",wsChild|wsVisible,20,731,914,70,hwnd,0)
  songPage(0)
  return 0
 case wmCommand:
  id:=int(wparam&0xffff)
  switch{
  case id==idSongPage1:songPage(0);return 0
  case id==idSongPage2:songPage(1);return 0
  case id==idSongStart:startFullSong();return 0
  case id==idSongCancel:
   ui.mu.Lock();c:=ui.cancel;ui.mu.Unlock()
   if c!=nil{c();appendLog("\r\n[전체 음악+MV] 취소 요청\r\n")}
   return 0
  case id==idSongProjectAssets:fillFullSongFromProject();return 0
  case id==idSongClose:
   if songUI.running{showError(errors.New("생성 중인 작업이 종료된 후 창을 닫으세요"));return 0}
   destroyWindow.Call(hwnd);return 0
  case id>=idSongBrowseBase&&id<idSongBrowseBase+15:
   index:=id-idSongBrowseBase
   if index!=4&&index!=14{
    if chosen,ok:=songBrowseFile(index);ok{setText(songUI.fields[index],chosen)}
   }
   return 0
  }
 case wmSongCompleted:
  songUI.running=false
  enableWindow.Call(songUI.start,1)
  enableWindow.Call(songUI.cancel,0)
  setText(songUI.status,"작업 종료. 메인 창 로그에서 생성된 결과·실패 사유를 확인하세요.")
  return 0
 case wmClose:
  if songUI.running{showError(errors.New("실행 중인 작업을 중지하고 종료한 후 닫을 수 있습니다"));return 0}
  destroyWindow.Call(hwnd);return 0
 case wmDestroy:
  songUI=fullSongStudio{}
  return 0
 }
 r,_,_:=defWindowProc.Call(hwnd,uintptr(message),wparam,lparam)
 return r
}
func openNativeFullSongStudio()error{
 if songUI.hwnd!=0{showWindow.Call(songUI.hwnd,1);return nil}
 if !songClassReady{
  instance,_,_:=getModuleHandle.Call(0)
  class:=utf16(songWindowClass)
  wc:=wndClassEx{Size:uint32(unsafe.Sizeof(wndClassEx{})),WndProc:syscall.NewCallback(songWinProc),
   Instance:instance,Background:uintptr(6),ClassName:class}
  registered,_,e:=registerClass.Call(uintptr(unsafe.Pointer(&wc)))
  if registered==0{return fmt.Errorf("전체 노래 자동 제작 GUI 등록 실패: %v",e)}
  songClassReady=true
 }
 hwnd:=callCreate(songWindowClass,"MYVOCAL | DiffSinger + SoundFont + RVC + MV 원클릭",wsOverlappedWindow|wsVisible,120,65,970,890,0,0)
 if hwnd==0{return errors.New("네이티브 노래·MV 제작 창을 열 수 없습니다")}
 showWindow.Call(hwnd,1);updateWindow.Call(hwnd)
 return nil
}
