//go:build windows

package main

import (
 "errors"
 "fmt"
 "strings"
 "syscall"
 "unsafe"
)

const (
 syncWindowClass="MYVOCALNativeLyricsTiming"
 idNativeSyncEditor=127
 idSyncFromMIDI=1010
 idSyncOpen=1011
 idSyncSave=1012
 idSyncClose=1013
)
type syncStudioWindow struct { hwnd,editor,status uintptr }
var syncStudio syncStudioWindow
var syncClassRegistered bool
func syncReadEditor()string{
 if syncStudio.editor==0{return ""}
 length,_,_:=getTextLength.Call(syncStudio.editor)
 if length>220000{length=220000}
 buf:=make([]uint16,length+1)
 getWindowText.Call(syncStudio.editor,uintptr(unsafe.Pointer(&buf[0])),uintptr(len(buf)))
 return syscall.UTF16ToString(buf)
}
func chooseSyncJSON(save bool)(string,bool){
 var buf [32768]uint16
 var filter = syscall.StringToUTF16("MYVOCAL 가사 싱크 JSON\x00*.json\x00\x00")
 opts:=openFileName{Size:uint32(unsafe.Sizeof(openFileName{})),
  Owner:syncStudio.hwnd,File:&buf[0],MaxFile:uint32(len(buf)),Filter:&filter[0],
  Flags:0x00000800|0x00080000,
 }
 proc:=openDialog
 if save{
  opts.DefExt=utf16("json")
  opts.Flags|=0x00000002
  proc=saveDialog
 }else{opts.Flags|=0x00001000}
 ret,_,_:=proc.Call(uintptr(unsafe.Pointer(&opts)))
 if ret==0{return "",false}
 return syscall.UTF16ToString(buf[:]),true
}
func syncWindowProc(hwnd uintptr,message uint32,wparam,lparam uintptr)uintptr{
 switch message{
 case wmCreate:
  syncStudio.hwnd=hwnd
  callCreate("STATIC","MYVOCAL  |  가사·보컬 립싱크 시간 편집기",wsVisible|wsChild,22,12,785,28,hwnd,0)
  callCreate("STATIC","각 줄: 시작초|종료초|가사  예: 0.000|1.200|안녕하세요",wsVisible|wsChild,22,49,775,28,hwnd,0)
  callCreate("STATIC","MIDI에서 만든 초안은 실제 노래 발음과 다를 수 있습니다. 저장 전 시간표를 수정하세요.",wsVisible|wsChild,22,78,790,25,hwnd,0)
  syncStudio.editor=callCreate("EDIT","",wsVisible|wsChild|wsBorder|wsVScroll|esMultiline|esAutoVScroll,22,113,798,415,hwnd,0)
  sendMessage.Call(syncStudio.editor,0x00C5,220000,0)
  callCreate("BUTTON","프로젝트 MIDI 시간 초안",wsVisible|wsChild,22,546,220,38,hwnd,idSyncFromMIDI)
  callCreate("BUTTON","기존 싱크 JSON 열기",wsVisible|wsChild,252,546,187,38,hwnd,idSyncOpen)
  callCreate("BUTTON","새 싱크 JSON 저장",wsVisible|wsChild,449,546,185,38,hwnd,idSyncSave)
  callCreate("BUTTON","닫기",wsVisible|wsChild,647,546,173,38,hwnd,idSyncClose)
  syncStudio.status=callCreate("STATIC","수동 입력 또는 MIDI 초안 생성 후 JSON으로 저장하세요.",wsVisible|wsChild,22,603,785,45,hwnd,0)
  return 0
 case wmCommand:
  id:=int(wparam&0xffff)
  switch id{
  case idSyncFromMIDI:
   p,path:=studioSnapshot()
   if path==""{showError(errors.New("먼저 프로젝트에 가사와 MIDI를 저장하세요"));return 0}
   text,err:=midiLyricDraft(p)
   if err!=nil{showError(err);return 0}
   setText(syncStudio.editor,text)
   setText(syncStudio.status,"MIDI 시작음 기준 초안입니다. 실제 가창 발음 타이밍 확인 후 수정하세요.")
   return 0
  case idSyncOpen:
   if path,ok:=chooseSyncJSON(false);ok{
    text,err:=readLyricTimingEditor(path)
    if err!=nil{showError(err);return 0}
    setText(syncStudio.editor,text)
    setText(syncStudio.status,"기존 싱크 JSON을 읽었습니다. 편집 후 새 파일로 저장하세요.")
   }
   return 0
  case idSyncSave:
   source:=syncReadEditor()
   if _,err:=parseLyricCueEditor(source);err!=nil{showError(err);return 0}
   path,ok:=chooseSyncJSON(true)
   if !ok{return 0}
   if !strings.EqualFold(path[len(path)-5:],".json"){
    showError(errors.New("가사 싱크 파일은 .json 확장자여야 합니다"))
    return 0
   }
   if err:=writeLyricTimingFile(path,source);err!=nil{showError(err);return 0}
   if mvStudio.hwnd!=0{setText(mvStudio.fields[5],path)}
   _,project:=studioSnapshot()
   if project!=""{
    if err:=importStudioAsset(path);err!=nil{appendLog("\r\n가사 싱크 프로젝트 등록 오류: "+err.Error()+"\r\n")}
   }
   appendLog("\r\n가사·립싱크 시간 JSON 저장: "+path+"\r\n")
   setText(syncStudio.status,fmt.Sprintf("저장 완료: %s",path))
   return 0
  case idSyncClose:destroyWindow.Call(hwnd);return 0
  }
 case wmClose:destroyWindow.Call(hwnd);return 0
 case wmDestroy:syncStudio=syncStudioWindow{};return 0
 }
 ret,_,_:=defWindowProc.Call(hwnd,uintptr(message),wparam,lparam)
 return ret
}
func openNativeSyncStudio()error{
 if syncStudio.hwnd!=0{showWindow.Call(syncStudio.hwnd,1);return nil}
 if !syncClassRegistered{
  instance,_,_:=getModuleHandle.Call(0)
  name:=utf16(syncWindowClass)
  wc:=wndClassEx{Size:uint32(unsafe.Sizeof(wndClassEx{})),WndProc:syscall.NewCallback(syncWindowProc),
   Instance:instance,Background:uintptr(6),ClassName:name}
  r,_,e:=registerClass.Call(uintptr(unsafe.Pointer(&wc)))
  if r==0{return fmt.Errorf("가사 싱크 창 등록 오류: %v",e)}
  syncClassRegistered=true
 }
 hwnd:=callCreate(syncWindowClass,"MYVOCAL Studio | 가사·립싱크 타이밍 편집",wsOverlappedWindow|wsVisible,180,100,866,730,0,0)
 if hwnd==0{return errors.New("가사 싱크 창 생성 실패")}
 showWindow.Call(hwnd,1);updateWindow.Call(hwnd)
 return nil
}
