//go:build windows

package main

import (
 "errors"
 "fmt"
 "os"
 "path/filepath"
 "strconv"
 "strings"
 "syscall"
 "unicode/utf8"
 "unsafe"
)

const (
 projectClassName="MYVOCALProjectStudioWin32"
 idProjectNew=120
 idProjectOpen=121
 idProjectEdit=122
 idProjectSave=123
 idProjectEditorSave=741
 idProjectEditorClose=742
 idProjectLyricImport=743
 idProjectGenreOpen=744
)
type projectWinUI struct {
 hwnd uintptr
 edits [8]uintptr
 lyrics uintptr
 status uintptr
}
var projectWin projectWinUI
var projectClassRegistered bool
var projectLabelNames=[8]string{
 "프로젝트 이름","장르·혼합 비율","BPM (20~320)","조성 / Key",
 "곡 설명·콘셉트","내 보컬 모델 경로","가수·캐릭터 이름","MV 스타일",
}

func projectStatusText()string{
 p,path:=studioSnapshot()
 if path==""{return "프로젝트: 없음  |  새 프로젝트를 만들어 시작하세요."}
 return fmt.Sprintf("프로젝트: %s  |  에셋 %d개  |  %s",p.Name,len(p.Assets),path)
}
func refreshProjectStatus(){
 if ui.projectStatus!=0{setText(ui.projectStatus,projectStatusText())}
 if projectWin.status!=0{setText(projectWin.status,projectStatusText())}
}
func chooseNativeProjectFile()(string,bool){
 var buf [32768]uint16
 filter:=syscall.StringToUTF16("MYVOCAL 프로젝트 (project.json)\x00project.json\x00모든 JSON 파일\x00*.json\x00\x00")
 opts:=openFileName{
  Size:uint32(unsafe.Sizeof(openFileName{})),Owner:ui.hwnd,
  File:&buf[0],MaxFile:uint32(len(buf)),Filter:&filter[0],
  Flags:0x00000800|0x00080000|0x00001000,
 }
 if ok,_,_:=openDialog.Call(uintptr(unsafe.Pointer(&opts)));ok==0{return "",false}
 path:=syscall.UTF16ToString(buf[:])
 if filepath.Base(path)!="project.json"{showError(errors.New("project.json 파일을 선택하세요"));return "",false}
 return path,true
}
func chooseLocalLyricsTXT()(string,bool){
 var buf [32768]uint16
 filter:=syscall.StringToUTF16("한국어 가사 텍스트\x00*.txt\x00\x00")
 opts:=openFileName{Size:uint32(unsafe.Sizeof(openFileName{})),Owner:projectWin.hwnd,File:&buf[0],MaxFile:uint32(len(buf)),Filter:&filter[0],Flags:0x00000800|0x00080000|0x00001000}
 found,_,_:=openDialog.Call(uintptr(unsafe.Pointer(&opts)))
 if found==0{return "",false}
 return syscall.UTF16ToString(buf[:]),true
}
func projectWindowProc(hwnd uintptr,message uint32,wparam,lparam uintptr)uintptr{
 switch message{
 case wmCreate:
  projectWin.hwnd=hwnd
  callCreate("STATIC","MYVOCAL Studio  |  네이티브 음악 프로젝트 편집기",wsVisible|wsChild,22,12,780,30,hwnd,0)
  for i,label:=range projectLabelNames{
   y:=int32(53+i*40)
   callCreate("STATIC",label,wsVisible|wsChild,22,y+4,165,24,hwnd,0)
   projectWin.edits[i]=callCreate("EDIT","",wsVisible|wsChild|wsBorder|esAutoHScroll,195,y,625,29,hwnd,0)
  }
  callCreate("STATIC","가사 / Song Lyrics  (작업용 텍스트 직접 편집)",wsVisible|wsChild,22,378,670,26,hwnd,0)
  projectWin.lyrics=callCreate("EDIT","",wsVisible|wsChild|wsBorder|wsVScroll|esMultiline|esAutoVScroll,22,408,798,253,hwnd,0)
  sendMessage.Call(projectWin.lyrics,0x00C5,300000,0)
  callCreate("BUTTON","프로젝트 저장",wsVisible|wsChild,22,679,230,38,hwnd,idProjectEditorSave)
  callCreate("BUTTON","편집 창 닫기",wsVisible|wsChild,265,679,180,38,hwnd,idProjectEditorClose)
  callCreate("BUTTON","가사 TXT 불러오기",wsVisible|wsChild,460,679,190,38,hwnd,idProjectLyricImport)
  callCreate("BUTTON","장르·비율 설정",wsVisible|wsChild,663,679,154,38,hwnd,idProjectGenreOpen)
  projectWin.status=callCreate("STATIC","",wsVisible|wsChild,22,728,800,48,hwnd,0)
  loadProjectEditorFields()
  return 0
 case wmCommand:
  id:=int(wparam&0xffff)
  if id==idProjectEditorSave{
   if err:=saveProjectEditorFields();err!=nil{showError(err)}else{
    appendLog("\r\n네이티브 프로젝트 정보·가사 저장 완료\r\n")
    refreshProjectStatus()
   }
   return 0
  }
  if id==idProjectLyricImport{
   if path,ok:=chooseLocalLyricsTXT();ok{
    stat,err:=os.Lstat(path)
    if err==nil&&(!stat.Mode().IsRegular()||stat.Size()>300000){err=errors.New("가사 텍스트는 300KB 이하의 일반 파일이어야 합니다")}
    if err==nil{
     var raw []byte
     raw,err=os.ReadFile(path)
     if err==nil&&!utf8.Valid(raw){err=errors.New("가사 TXT는 UTF-8 인코딩이어야 합니다")}
     if err==nil{setText(projectWin.lyrics,string(raw))}
    }
    if err!=nil{showError(err)}
   }
   return 0
  }
  if id==idProjectGenreOpen{if err:=openGenreStudio();err!=nil{showError(err)};return 0}
  if id==idProjectEditorClose{destroyWindow.Call(hwnd);return 0}
 case wmClose:
  destroyWindow.Call(hwnd);return 0
 case wmDestroy:
  projectWin=projectWinUI{}
  return 0
 }
 ret,_,_:=defWindowProc.Call(hwnd,uintptr(message),wparam,lparam)
 return ret
}
func readProjectLyrics()string{
 n,_,_:=getTextLength.Call(projectWin.lyrics)
 if n>300000{n=300000}
 b:=make([]uint16,n+1)
 getWindowText.Call(projectWin.lyrics,uintptr(unsafe.Pointer(&b[0])),uintptr(len(b)))
 return syscall.UTF16ToString(b)
}
func loadProjectEditorFields(){
 p,path:=studioSnapshot()
 if path==""{return}
 genre:=p.Genres
 if p.GenrePlan.Mode!=""{genre=genrePlanSummary(p.GenrePlan)}
 values:=[]string{p.Name,genre,strconv.Itoa(p.BPM),p.Key,p.Concept,p.VoiceModel,p.Character,p.VideoStyle}
 for i,v:=range values{setText(projectWin.edits[i],v)}
 setText(projectWin.lyrics,p.Lyrics)
 refreshProjectStatus()
}
func saveProjectEditorFields()error{
 p,path:=studioSnapshot();if path==""{return errors.New("프로젝트를 먼저 생성해야 합니다")}
 bpm,err:=strconv.Atoi(strings.TrimSpace(readText(projectWin.edits[2])))
 if err!=nil{return errors.New("BPM은 20~320 사이 정수로 입력하세요")}
 p.Name=strings.TrimSpace(readText(projectWin.edits[0]))
 if p.GenrePlan.Mode!=""{p.Genres=genrePlanSummary(p.GenrePlan)}else{p.Genres=strings.TrimSpace(readText(projectWin.edits[1]))}
 p.BPM=bpm
 p.Key=strings.TrimSpace(readText(projectWin.edits[3]))
 p.Concept=readText(projectWin.edits[4])
 p.VoiceModel=readText(projectWin.edits[5])
 p.Character=readText(projectWin.edits[6])
 p.VideoStyle=readText(projectWin.edits[7])
 p.Lyrics=readProjectLyrics()
 return updateStudioProject(p)
}
func openStudioProjectEditor()error{
 _,path:=studioSnapshot()
 if path==""{return errors.New("새 프로젝트를 만들거나 기존 프로젝트를 먼저 열어야 합니다")}
 if projectWin.hwnd!=0{
  loadProjectEditorFields()
  showWindow.Call(projectWin.hwnd,1)
  return nil
 }
 instance,_,_:=getModuleHandle.Call(0)
 if !projectClassRegistered{
  class:=utf16(projectClassName)
  wc:=wndClassEx{Size:uint32(unsafe.Sizeof(wndClassEx{})),WndProc:syscall.NewCallback(projectWindowProc),Instance:instance,Background:uintptr(6),ClassName:class}
  ret,_,e:=registerClass.Call(uintptr(unsafe.Pointer(&wc)))
  if ret==0{return fmt.Errorf("프로젝트 편집 창 등록 오류: %v",e)}
  projectClassRegistered=true
 }
 hwnd:=callCreate(projectClassName,"MYVOCAL Studio | 프로젝트 편집",wsOverlappedWindow|wsVisible,170,80,866,834,0,0)
 if hwnd==0{return errors.New("네이티브 프로젝트 편집 창을 만들지 못했습니다")}
 showWindow.Call(hwnd,1)
 updateWindow.Call(hwnd)
 return nil
}
func handleProjectCommand(id int)bool{
 switch id{
 case idMIDIEditor:
  if err:=openNativeMIDIEditor();err!=nil{showError(err)}
  return true
 case idProjectAssets:
  if err:=openStudioAssetLibrary();err!=nil{showError(err)}
  return true
 case idProjectNew:
  _,err:=createStudioProject("새 음악 프로젝트")
  if err==nil{err=openStudioProjectEditor()}
  if err!=nil{showError(err)}
  refreshProjectStatus()
  return true
 case idProjectOpen:
  if path,ok:=chooseNativeProjectFile();ok{
   _,err:=openStudioProject(path)
   if err==nil{
    if projectWin.hwnd!=0{loadProjectEditorFields()}
    err=openStudioProjectEditor()
   }
   if err!=nil{showError(err)}
   refreshProjectStatus()
  }
  return true
 case idProjectEdit:
  if err:=openStudioProjectEditor();err!=nil{showError(err)}
  return true
 case idProjectSave:
  if projectWin.hwnd!=0{
   if err:=saveProjectEditorFields();err!=nil{showError(err)}else{appendLog("\r\n프로젝트 저장 완료\r\n")}
  }else if err:=saveStudioProject();err!=nil{showError(err)}
  refreshProjectStatus()
  return true
 }
 return false
}
