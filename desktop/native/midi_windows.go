//go:build windows

package main

import (
 "context"
 "errors"
 "fmt"
 "path/filepath"
 "strconv"
 "strings"
 "syscall"
 "unsafe"
)

const (
 midiWindowClass="MYVOCALNativeMIDIEditor"
 idMIDIEditor=125
 idMIDISaveDraft=890
 idMIDIExport=891
 idMIDIClose=892
 idMIDIImport=893
)
var midiWindowRegistered bool
type midiEditorUI struct{
 hwnd,notes,bpm,program,status uintptr
}
var midiUI midiEditorUI

func loadMIDIDraft(){
 if midiUI.hwnd==0{return}
 p,_:=studioSnapshot()
 setText(midiUI.bpm,strconv.Itoa(p.BPM))
 setText(midiUI.program,strconv.Itoa(p.MIDIProgram))
 if p.MIDINotes!=""{setText(midiUI.notes,p.MIDINotes)}else{
  setText(midiUI.notes,"60 0 1 100\r\n64 1 1 100\r\n67 2 1 100\r\n72 3 1 110")
 }
}
func readMIDIDraft()(string,error){
 length,_,_:=getTextLength.Call(midiUI.notes)
 if length>250000{return "",errors.New("MIDI 입력은 250000자 이하여야 합니다")}
 buf:=make([]uint16,length+1)
 getWindowText.Call(midiUI.notes,uintptr(unsafe.Pointer(&buf[0])),uintptr(len(buf)))
 return syscall.UTF16ToString(buf),nil
}
func readMIDIEditor()(string,int,int,error){
 notes,err:=readMIDIDraft();if err!=nil{return "",0,0,err}
 bpm,err:=strconv.Atoi(strings.TrimSpace(readText(midiUI.bpm)))
 if err!=nil||bpm<20||bpm>320{return "",0,0,errors.New("BPM은 20~320의 정수입니다")}
 program,err:=strconv.Atoi(strings.TrimSpace(readText(midiUI.program)))
 if err!=nil||program<0||program>127{return "",0,0,errors.New("악기 번호는 0~127의 정수입니다")}
 if _,err=parseMidiNotes(notes);err!=nil{return "",0,0,err}
 return notes,bpm,program,nil
}
func saveMIDIDraft()error{
 notes,bpm,program,err:=readMIDIEditor();if err!=nil{return err}
 return updateStudioMIDI(notes,program,bpm)
}
func chooseMIDIOutput()(string,bool){
 p,projectPath:=studioSnapshot()
 if projectPath==""{showError(errors.New("먼저 음악 프로젝트를 열어야 합니다"));return "",false}
 var buffer [32768]uint16
 copy(buffer[:],syscall.StringToUTF16("MYVOCAL-"+p.ID[:8]+".mid"))
 filter:=syscall.StringToUTF16("표준 MIDI 파일\x00*.mid\x00\x00")
 extension:=utf16("mid")
 initial:=utf16(filepath.Dir(projectPath))
 opts:=openFileName{
  Size:uint32(unsafe.Sizeof(openFileName{})),Owner:midiUI.hwnd,
  Filter:&filter[0],File:&buffer[0],MaxFile:uint32(len(buffer)),
  InitialDir:initial,DefExt:extension,Flags:0x00000800|0x00080000|0x00000002,
 }
 ok,_,_:=saveDialog.Call(uintptr(unsafe.Pointer(&opts)))
 if ok==0{return "",false}
 path:=syscall.UTF16ToString(buffer[:])
 if !strings.EqualFold(filepath.Ext(path),".mid"){showError(errors.New("출력 확장자는 .mid여야 합니다"));return "",false}
 return path,true
}
func chooseMIDIInput()(string,bool){
 var buf [32768]uint16
 filter:=syscall.StringToUTF16("표준 MIDI 파일\x00*.mid;*.midi\x00\x00")
 opts:=openFileName{Size:uint32(unsafe.Sizeof(openFileName{})),Owner:midiUI.hwnd,File:&buf[0],MaxFile:uint32(len(buf)),Filter:&filter[0],Flags:0x00000800|0x00080000|0x00001000}
 ok,_,_:=openDialog.Call(uintptr(unsafe.Pointer(&opts)))
 if ok==0{return "",false}
 return syscall.UTF16ToString(buf[:]),true
}
func midiWindowProc(hwnd uintptr,message uint32,wparam,lparam uintptr)uintptr{
 switch message{
 case wmCreate:
  midiUI.hwnd=hwnd
  callCreate("STATIC","MYVOCAL  |  MIDI 음표 편집·작곡 (완전 오프라인)",wsChild|wsVisible,20,12,800,26,hwnd,0)
  callCreate("STATIC","BPM",wsChild|wsVisible,20,50,70,24,hwnd,0)
  midiUI.bpm=callCreate("EDIT","120",wsChild|wsVisible|wsBorder|esAutoHScroll,93,47,110,29,hwnd,0)
  callCreate("STATIC","악기(0~127)",wsChild|wsVisible,234,50,120,24,hwnd,0)
  midiUI.program=callCreate("EDIT","0",wsChild|wsVisible|wsBorder|esAutoHScroll,355,47,110,29,hwnd,0)
  callCreate("STATIC","음표 한 줄: MIDI 피치(0~127), 시작박, 길이박, 세기(1~127)  예: 60 0 1 100",wsChild|wsVisible,20,89,800,25,hwnd,0)
  midiUI.notes=callCreate("EDIT","",wsChild|wsVisible|wsBorder|wsVScroll|esMultiline|esAutoVScroll,20,120,790,420,hwnd,0)
  sendMessage.Call(midiUI.notes,0x00C5,250000,0)
  callCreate("BUTTON","음표·BPM 저장",wsChild|wsVisible,20,552,225,42,hwnd,idMIDISaveDraft)
  callCreate("BUTTON","새 MIDI 파일 생성",wsChild|wsVisible,260,552,225,42,hwnd,idMIDIExport)
  callCreate("BUTTON","닫기",wsChild|wsVisible,500,552,150,42,hwnd,idMIDIClose)
  callCreate("BUTTON","기존 MIDI 불러오기",wsChild|wsVisible,20,603,225,42,hwnd,idMIDIImport)
  midiUI.status=callCreate("STATIC","편집 후 프로젝트 저장 또는 새 MIDI 파일 생성",wsChild|wsVisible,20,659,790,35,hwnd,0)
  loadMIDIDraft()
  return 0
 case wmCommand:
  id:=int(wparam&0xffff)
  switch id{
  case idMIDISaveDraft:
   if err:=saveMIDIDraft();err!=nil{showError(err)}else{
    setText(midiUI.status,"프로젝트 음표·BPM·악기 설정 저장 완료")
    refreshProjectStatus()
   }
   return 0
  case idMIDIExport:
   notes,bpm,program,err:=readMIDIEditor()
   if err!=nil{showError(err);return 0}
   path,ok:=chooseMIDIOutput()
   if !ok{return 0}
   if err=exportNativeMIDI(context.Background(),path,bpm,program,notes);err!=nil{showError(err);return 0}
   if err=updateStudioMIDI(notes,program,bpm);err!=nil{showError(err);return 0}
   if err=importStudioAsset(path);err!=nil{showError(err)}
   setText(midiUI.status,fmt.Sprintf("MIDI 파일 생성 완료: %s",path))
   appendLog("\r\n네이티브 MIDI 파일 생성: "+path+"\r\n")
   return 0
  case idMIDIImport:
   path,ok:=chooseMIDIInput()
   if !ok{return 0}
   notes,bpm,program,err:=readExistingMIDI(path)
   if err!=nil{showError(err);return 0}
   setText(midiUI.notes,notes)
   setText(midiUI.bpm,strconv.Itoa(bpm))
   setText(midiUI.program,strconv.Itoa(program))
   setText(midiUI.status,"기존 MIDI를 편집 칸에 불러왔습니다. 저장 버튼을 눌러 프로젝트에 반영하세요.")
   return 0
  case idMIDIClose:destroyWindow.Call(hwnd);return 0
  }
 case wmClose:destroyWindow.Call(hwnd);return 0
 case wmDestroy:midiUI=midiEditorUI{};return 0
 }
 ret,_,_:=defWindowProc.Call(hwnd,uintptr(message),wparam,lparam)
 return ret
}
func openNativeMIDIEditor()error{
 _,path:=studioSnapshot()
 if path==""{return errors.New("먼저 새 프로젝트를 만들거나 기존 프로젝트를 여세요")}
 if midiUI.hwnd!=0{showWindow.Call(midiUI.hwnd,1);return nil}
 if !midiWindowRegistered{
  instance,_,_:=getModuleHandle.Call(0)
  name:=utf16(midiWindowClass)
  class:=wndClassEx{Size:uint32(unsafe.Sizeof(wndClassEx{})),WndProc:syscall.NewCallback(midiWindowProc),Instance:instance,Background:uintptr(6),ClassName:name}
  registered,_,err:=registerClass.Call(uintptr(unsafe.Pointer(&class)))
  if registered==0{return fmt.Errorf("MIDI 편집 창 클래스 생성 오류: %v",err)}
  midiWindowRegistered=true
 }
 hwnd:=callCreate(midiWindowClass,"MYVOCAL Studio | MIDI 작곡 편집기",wsOverlappedWindow|wsVisible,240,90,856,740,0,0)
 if hwnd==0{return errors.New("MIDI 편집 창을 열지 못했습니다")}
 showWindow.Call(hwnd,1);updateWindow.Call(hwnd)
 return nil
}
