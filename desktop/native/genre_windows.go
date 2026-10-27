//go:build windows

package main

import(
 "errors"
 "fmt"
 "strings"
 "syscall"
 "unsafe"
)

const(
 genreWinClass="MYVOCALNativeOriginalGenreStudio"
 idGenreStudio=130
 idGenreSave=1600
 idGenreClose=1601
 idGenreAuto=1602
)
type genreStudioWindow struct{
 hwnd,blend,sections,auto,status uintptr
}
var genreUI genreStudioWindow
var genreWinRegistered bool

func genreEditText(hwnd uintptr)string{
 length,_,_:=getTextLength.Call(hwnd)
 if length>8192{length=8192}
 buffer:=make([]uint16,length+1)
 getWindowText.Call(hwnd,uintptr(unsafe.Pointer(&buffer[0])),uintptr(len(buffer)))
 return syscall.UTF16ToString(buffer)
}
func loadGenreWinFields(){
 if genreUI.hwnd==0{return}
 p,_:=studioSnapshot()
 plan:=p.GenrePlan
 if plan.Mode==""{plan=defaultGenrePlan()}
 var mix strings.Builder
 for _,weight:=range plan.Mix{fmt.Fprintf(&mix,"%s|%d\r\n",weight.Name,weight.Percent)}
 var sections strings.Builder
 for _,section:=range plan.Sections{fmt.Fprintf(&sections,"%s|%s\r\n",section.Section,section.Genre)}
 setText(genreUI.blend,mix.String())
 setText(genreUI.sections,sections.String())
 auto:=uintptr(0)
 if plan.Mode=="ai_auto"{auto=1}
 sendMessage.Call(genreUI.auto,0x00F1,auto,0)
 enableWindow.Call(genreUI.blend,1-auto)
}
func readGenreUI()(studioGenrePlan,error){
 var p studioGenrePlan
 checked,_,_:=sendMessage.Call(genreUI.auto,0x00F0,0,0)
 if checked==1{p.Mode="ai_auto"}else{p.Mode="manual"}
 var err error
 if p.Mode=="manual"{
  p.Mix,err=parseGenreBlend(genreEditText(genreUI.blend))
  if err!=nil{return p,err}
 }
 p.Sections,err=parseSectionGenres(genreEditText(genreUI.sections))
 if err!=nil{return p,err}
 return p,validateGenrePlan(p)
}
func genreWinProc(hwnd uintptr,message uint32,wparam,lparam uintptr)uintptr{
 switch message{
 case wmCreate:
  genreUI.hwnd=hwnd
  callCreate("STATIC","MYVOCAL | 원본 기획 04 장르 선택·비율·구간별 편곡",wsVisible|wsChild,18,12,795,30,hwnd,0)
  callCreate("STATIC","사용 가능한 21개 장르: "+strings.Join(originalMusicGenres,", "),wsVisible|wsChild,18,53,792,42,hwnd,0)
  genreUI.auto=callCreate("BUTTON","AI AUTO: 곡 설명을 기준으로 로컬 모델이 장르를 선택하도록 지시",wsVisible|wsChild|0x00000003,18,110,800,34,hwnd,idGenreAuto)
  callCreate("STATIC","장르별 비율: 장르명|정수비율 (합계 반드시 100%)  예: Ballad|50",wsVisible|wsChild,18,156,795,29,hwnd,0)
  genreUI.blend=callCreate("EDIT","",wsVisible|wsChild|wsBorder|wsVScroll|esMultiline|esAutoVScroll,18,188,790,180,hwnd,0)
  callCreate("STATIC","곡 구간별 장르: 곡구간|장르  예: Intro|Ambient / Verse|Ballad / Final|Rock + Orchestra",wsVisible|wsChild,18,392,798,29,hwnd,0)
  genreUI.sections=callCreate("EDIT","",wsVisible|wsChild|wsBorder|wsVScroll|esMultiline|esAutoVScroll,18,424,790,172,hwnd,0)
  callCreate("BUTTON","프로젝트 장르·구간 저장",wsVisible|wsChild,18,613,265,41,hwnd,idGenreSave)
  callCreate("BUTTON","닫기",wsVisible|wsChild,297,613,160,41,hwnd,idGenreClose)
  genreUI.status=callCreate("STATIC","수동 비율은 총 100%여야 합니다. 구간별 설정은 장편 MusicGen 세그먼트 프롬프트에 적용됩니다.",wsVisible|wsChild,18,676,795,56,hwnd,0)
  loadGenreWinFields()
  return 0
 case wmCommand:
  switch int(wparam&0xffff){
  case idGenreAuto:
   on,_,_:=sendMessage.Call(genreUI.auto,0x00F0,0,0)
   enabled:=uintptr(1)
   if on==1{enabled=0}
   enableWindow.Call(genreUI.blend,enabled)
   return 0
  case idGenreSave:
   plan,err:=readGenreUI()
   if err==nil{err=updateStudioGenrePlan(plan)}
   if err!=nil{showError(err);return 0}
   if projectWin.hwnd!=0{setText(projectWin.edits[1],genrePlanSummary(plan))}
   refreshProjectStatus()
   setText(genreUI.status,"장르 설정 저장 완료: "+genrePlanSummary(plan))
   appendLog("\r\n장르 비율·곡 구간 저장: "+genrePlanSummary(plan)+"\r\n")
   return 0
  case idGenreClose:destroyWindow.Call(hwnd);return 0
  }
 case wmClose:destroyWindow.Call(hwnd);return 0
 case wmDestroy:genreUI=genreStudioWindow{};return 0
 }
 result,_,_:=defWindowProc.Call(hwnd,uintptr(message),wparam,lparam)
 return result
}
func openGenreStudio()error{
 _,path:=studioSnapshot()
 if path==""{return errors.New("장르를 설정할 음악 프로젝트를 먼저 만들어야 합니다")}
 if genreUI.hwnd!=0{loadGenreWinFields();showWindow.Call(genreUI.hwnd,1);return nil}
 if !genreWinRegistered{
  instance,_,_:=getModuleHandle.Call(0)
  cls:=utf16(genreWinClass)
  wc:=wndClassEx{Size:uint32(unsafe.Sizeof(wndClassEx{})),WndProc:syscall.NewCallback(genreWinProc),Instance:instance,Background:uintptr(6),ClassName:cls}
  r,_,e:=registerClass.Call(uintptr(unsafe.Pointer(&wc)))
  if r==0{return fmt.Errorf("장르 작업실 등록 오류: %v",e)}
  genreWinRegistered=true
 }
 hwnd:=callCreate(genreWinClass,"MYVOCAL | 장르 믹스·구간별 장르",wsOverlappedWindow|wsVisible,170,72,846,806,0,0)
 if hwnd==0{return errors.New("장르 설정 창을 열 수 없습니다")}
 showWindow.Call(hwnd,1);updateWindow.Call(hwnd)
 return nil
}
