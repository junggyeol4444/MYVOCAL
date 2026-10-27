//go:build windows

package main

import (
 "errors"
 "fmt"
 "path/filepath"
 "strings"
 "syscall"
 "unsafe"
)

const(
 storyboardWindowClass="MYVOCALNativeStoryboardEditor"
 idStoryboardEditor=128
 idStoryboardOpen=1100
 idStoryboardSave=1101
 idStoryboardClose=1102
 idStoryboardCueDraft=1103
)
type storyboardGUI struct{ hwnd,editor,status uintptr }
var sceneGUI storyboardGUI
var sceneClassRegistered bool

func getStoryboardText()string{
 count,_,_:=getTextLength.Call(sceneGUI.editor)
 if count>60000{count=60000}
 buffer:=make([]uint16,count+1)
 getWindowText.Call(sceneGUI.editor,uintptr(unsafe.Pointer(&buffer[0])),uintptr(len(buffer)))
 return syscall.UTF16ToString(buffer)
}
func chooseStoryboardJSON(save bool)(string,bool){
 var buf [32768]uint16
 filter:=syscall.StringToUTF16("MYVOCAL 장면 스토리보드\x00*.json\x00\x00")
 opts:=openFileName{Size:uint32(unsafe.Sizeof(openFileName{})),Owner:sceneGUI.hwnd,File:&buf[0],MaxFile:uint32(len(buf)),
  Filter:&filter[0],Flags:0x00000800|0x00080000}
 proc:=openDialog
 if save{
  opts.DefExt=utf16("json")
  opts.Flags|=0x00000002
  proc=saveDialog
 }else{opts.Flags|=0x00001000}
 ok,_,_:=proc.Call(uintptr(unsafe.Pointer(&opts)))
 if ok==0{return "",false}
 return syscall.UTF16ToString(buf[:]),true
}
func selectCueForStoryDraft()(string,bool){
 var buf [32768]uint16
 filter:=syscall.StringToUTF16("가사·립싱크 싱크 JSON\x00*.json\x00\x00")
 opts:=openFileName{Size:uint32(unsafe.Sizeof(openFileName{})),Owner:sceneGUI.hwnd,
  File:&buf[0],MaxFile:uint32(len(buf)),Filter:&filter[0],
  Flags:0x00000800|0x00080000|0x00001000}
 chosen,_,_:=openDialog.Call(uintptr(unsafe.Pointer(&opts)))
 if chosen==0{return "",false}
 return syscall.UTF16ToString(buf[:]),true
}
func storyboardWinProc(hwnd uintptr,message uint32,wparam,lparam uintptr)uintptr{
 switch message{
 case wmCreate:
  sceneGUI.hwnd=hwnd
  callCreate("STATIC","MYVOCAL  |  네이티브 MV 장면별 스토리보드",wsChild|wsVisible,20,12,780,30,hwnd,0)
  callCreate("STATIC","한 줄: 시작초|종료초|연출|장면 설명",wsChild|wsVisible,20,50,790,28,hwnd,0)
  callCreate("STATIC","연출 방식: static / performance / story / mixed   ·   장면 설명은 프로젝트 메타데이터로 보존",wsChild|wsVisible,20,80,800,28,hwnd,0)
  sceneGUI.editor=callCreate("EDIT","0|12|performance|첫 공연 장면",wsChild|wsVisible|wsBorder|wsVScroll|esMultiline|esAutoVScroll,20,116,800,425,hwnd,0)
  sendMessage.Call(sceneGUI.editor,0x00C5,60000,0)
  callCreate("BUTTON","가사 싱크 기준 장면 초안",wsChild|wsVisible,20,554,230,42,hwnd,idStoryboardCueDraft)
  callCreate("BUTTON","JSON 열기",wsChild|wsVisible,264,554,172,42,hwnd,idStoryboardOpen)
  callCreate("BUTTON","새 JSON 저장",wsChild|wsVisible,450,554,180,42,hwnd,idStoryboardSave)
  callCreate("BUTTON","닫기",wsChild|wsVisible,645,554,175,42,hwnd,idStoryboardClose)
  sceneGUI.status=callCreate("STATIC","장면별 카메라 연출을 지정합니다. 인물·의상 자동 재생성이나 3D 모션은 별도 기능입니다.",wsChild|wsVisible,20,613,800,56,hwnd,0)
  project,hasProject:=studioSnapshot()
  if hasProject!=""&&project.Storyboard!=""{
   doc,err:=openNativeStoryboard(project.Storyboard)
   if err==nil{setText(sceneGUI.editor,storyboardText(doc))}
  }
  return 0
 case wmCommand:
  id:=int(wparam&0xffff)
  switch id{
  case idStoryboardCueDraft:
   if path,ok:=selectCueForStoryDraft();ok{
    source,err:=draftStoryboardFromLyricCues(path)
    if err!=nil{showError(err);return 0}
    setText(sceneGUI.editor,source)
    setText(sceneGUI.status,"가사 시간에 맞춰 만든 임시 장면입니다. 공연/스토리 패턴과 연출을 직접 수정하세요.")
   }
   return 0
  case idStoryboardOpen:
   if path,ok:=chooseStoryboardJSON(false);ok{
    doc,err:=openNativeStoryboard(path)
    if err!=nil{showError(err);return 0}
    setText(sceneGUI.editor,storyboardText(doc))
    setText(sceneGUI.status,"기존 장면 설정을 불러왔습니다. 원본은 변경하지 않고 새 JSON으로 저장하세요.")
   }
   return 0
  case idStoryboardSave:
   source:=getStoryboardText()
   if _,err:=parseNativeStoryboardText(source);err!=nil{showError(err);return 0}
   path,ok:=chooseStoryboardJSON(true)
   if !ok{return 0}
   if !strings.EqualFold(filepath.Ext(path),".json"){showError(errors.New("출력 확장자는 .json이어야 합니다"));return 0}
   if err:=saveNativeStoryboard(path,source);err!=nil{showError(err);return 0}
   if mvStudio.hwnd!=0{setText(mvStudio.fields[10],path)}
   _,p:=studioSnapshot()
   if p!=""{
    if err:=importStudioAsset(path);err!=nil{appendLog("\r\n스토리보드 프로젝트 자산 등록 실패: "+err.Error()+"\r\n")}
    if err:=updateStudioStoryboard(path);err!=nil{appendLog("\r\n스토리보드 프로젝트 설정 저장 실패: "+err.Error()+"\r\n")}
   }
   appendLog("\r\n네이티브 스토리보드 새 파일 저장: "+path+"\r\n")
   setText(sceneGUI.status,fmt.Sprintf("장면 JSON 저장 완료: %s",path))
   return 0
  case idStoryboardClose:destroyWindow.Call(hwnd);return 0
  }
 case wmClose:destroyWindow.Call(hwnd);return 0
 case wmDestroy:sceneGUI=storyboardGUI{};return 0
 }
 ret,_,_:=defWindowProc.Call(hwnd,uintptr(message),wparam,lparam)
 return ret
}
func openNativeStoryboardEditor()error{
 if sceneGUI.hwnd!=0{showWindow.Call(sceneGUI.hwnd,1);return nil}
 if !sceneClassRegistered{
  instance,_,_:=getModuleHandle.Call(0)
  name:=utf16(storyboardWindowClass)
  wc:=wndClassEx{Size:uint32(unsafe.Sizeof(wndClassEx{})),WndProc:syscall.NewCallback(storyboardWinProc),
   Instance:instance,Background:uintptr(6),ClassName:name}
  done,_,err:=registerClass.Call(uintptr(unsafe.Pointer(&wc)))
  if done==0{return fmt.Errorf("장면 편집창 클래스 등록 오류: %v",err)}
  sceneClassRegistered=true
 }
 hwnd:=callCreate(storyboardWindowClass,"MYVOCAL | MV 장면별 스토리보드",wsOverlappedWindow|wsVisible,190,90,870,750,0,0)
 if hwnd==0{return errors.New("스토리보드 창을 만들지 못했습니다")}
 showWindow.Call(hwnd,1);updateWindow.Call(hwnd)
 return nil
}
