//go:build windows

package main

import(
 "fmt"
 "syscall"
 "unsafe"
)

const(
 welcomeClass="MYVOCALOriginalHome"
 idWelcomeOpen=1710
 idWelcomeStart=1711
 welcomeCommandStart=1720
)
var welcomeUI struct{hwnd uintptr}
var welcomeRegistered bool
var welcomeButtons=[]struct{title,detail string}{
 {"✨ AI로 노래 만들기","기존 로컬 가창·작곡 모델 및 최종 음악+MV 제작"},
 {"🎤 내 AI 가수 만들기","내 목소리 녹음 및 RVC 학습 작업실"},
 {"🎹 직접 작곡하기","MIDI 음표·악기·BPM 편집기"},
 {"🎬 뮤직비디오 만들기","보컬·반주·캐릭터 2D MV 작업실"},
 {"👤 사람 / 캐릭터 등록","원본 사람·캐릭터 자산 라이브러리"},
 {"🕺 캐릭터 PV 만들기","캐릭터와 음성·립싱크 영상 제작"},
 {"📚 AI 학습실","로컬 모델·음원 학습을 위한 도구"},
 {"📂 프로젝트 열기","저장한 음악 프로젝트 불러오기"},
}
func selectWelcomeTask(task int){
 sendMessage.Call(ui.chooser,cbSetCurSel,uintptr(task),0)
 updateFields()
}
func dispatchOriginalHomeAction(index int){
 var err error
 switch index{
 case 0:err=openNativeFullSongStudio()
 case 1:err=openNativeVoiceStudio()
 case 2:err=openNativeMIDIEditor()
 case 3:err=openNativeMVStudio()
 case 4:err=openStudioAssetLibrary()
 case 5:err=openNativeMVStudio()
 case 6:err=openNativeVoiceStudio()
 case 7:
  var path string
  var ok bool
  path,ok=chooseNativeProjectFile()
  if !ok{return}
  _,err=openStudioProject(path)
  if err==nil{refreshProjectStatus();err=openStudioProjectEditor()}
 }
 if err!=nil{showError(err);return}
 if welcomeUI.hwnd!=0{destroyWindow.Call(welcomeUI.hwnd)}
}
func welcomeWindowProc(hwnd uintptr,message uint32,wparam,lparam uintptr)uintptr{
 switch message{
 case wmCreate:
  welcomeUI.hwnd=hwnd
  callCreate("STATIC","MYVOCAL Studio",wsChild|wsVisible,30,24,745,49,hwnd,0)
  callCreate("STATIC","네이티브 Windows 음악·AI 보컬·캐릭터·MV 작업실",wsChild|wsVisible,30,80,775,35,hwnd,0)
  for i,b:=range welcomeButtons{
   col:=int32(i%2)
   row:=int32(i/2)
   x:=int32(30)+col*420
   y:=int32(139)+row*115
   callCreate("BUTTON",b.title,wsChild|wsVisible,x,y,390,60,hwnd,welcomeCommandStart+uintptr(i))
   callCreate("STATIC",b.detail,wsChild|wsVisible,x+8,y+67,390,32,hwnd,0)
  }
  callCreate("STATIC","기존 프로젝트 보존 · 새 프로젝트 생성 및 장르 설정은 메인 작업실에서 진행",wsChild|wsVisible,30,619,810,35,hwnd,0)
  callCreate("BUTTON","메인 작업실로 이동",wsChild|wsVisible,30,663,390,43,hwnd,idWelcomeStart)
  return 0
 case wmCommand:
  id:=int(wparam&0xffff)
  if id>=welcomeCommandStart&&id<welcomeCommandStart+len(welcomeButtons){
   dispatchOriginalHomeAction(id-welcomeCommandStart)
   return 0
  }
  if id==idWelcomeStart{destroyWindow.Call(hwnd);return 0}
 case wmClose:
  destroyWindow.Call(hwnd);return 0
 case wmDestroy:
  welcomeUI.hwnd=0;return 0
 }
 ret,_,_:=defWindowProc.Call(hwnd,uintptr(message),wparam,lparam)
 return ret
}
func openOriginalHome()error{
 if welcomeUI.hwnd!=0{showWindow.Call(welcomeUI.hwnd,1);return nil}
 if !welcomeRegistered{
  instance,_,_:=getModuleHandle.Call(0)
  name:=utf16(welcomeClass)
  wc:=wndClassEx{Size:uint32(unsafe.Sizeof(wndClassEx{})),WndProc:syscall.NewCallback(welcomeWindowProc),
   Instance:instance,Background:uintptr(6),ClassName:name}
  result,_,e:=registerClass.Call(uintptr(unsafe.Pointer(&wc)))
  if result==0{return fmt.Errorf("MYVOCAL 시작 화면 등록 실패: %v",e)}
  welcomeRegistered=true
 }
 hwnd:=callCreate(welcomeClass,"MYVOCAL Studio | 시작 화면",wsOverlappedWindow|wsVisible,150,60,900,780,0,0)
 if hwnd==0{return fmt.Errorf("MYVOCAL 시작 화면을 생성하지 못했습니다")}
 showWindow.Call(hwnd,1);updateWindow.Call(hwnd)
 return nil
}
