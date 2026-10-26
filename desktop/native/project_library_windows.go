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
 assetWindowClass="MYVOCALNativeAssetLibrary"
 idProjectAssets=124
 idAssetImport=770
 idAssetPreview=771
 idAssetUse=772
 idAssetStop=773
 idAssetClose=774
 lbAddString=0x0180
 lbResetContent=0x0184
 lbGetCurSel=0x0188
)
type assetLibraryUI struct {
 hwnd uintptr
 list uintptr
 status uintptr
 assets []studioAsset
}
var assetUI assetLibraryUI
var assetClassRegistered bool
var playSoundW=syscall.NewLazyDLL("winmm.dll").NewProc("PlaySoundW")

func assetSelection()(studioAsset,error){
 if assetUI.list==0{return studioAsset{},errors.New("라이브러리 창을 먼저 여세요")}
 index,_,_:=sendMessage.Call(assetUI.list,lbGetCurSel,0,0)
 if int32(index)<0||int(index)>=len(assetUI.assets){return studioAsset{},errors.New("먼저 목록에서 파일을 선택하세요")}
 return assetUI.assets[int(index)],nil
}
func refreshAssetList(){
 if assetUI.list==0{return}
 p,path:=studioSnapshot()
 sendMessage.Call(assetUI.list,lbResetContent,0,0)
 assetUI.assets=append([]studioAsset(nil),p.Assets...)
 for _,a:=range assetUI.assets{
  text:=fmt.Sprintf("[%s] %s",a.Kind,a.Path)
  sendMessage.Call(assetUI.list,lbAddString,0,uintptr(unsafe.Pointer(utf16(text))))
 }
 if path=="" {setText(assetUI.status,"선택된 프로젝트 없음")} else{setText(assetUI.status,fmt.Sprintf("%s: 등록된 자산 %d개  |  원본 파일을 수정하지 않습니다.",p.Name,len(p.Assets)))}
 refreshProjectStatus()
}
func chooseLocalMedia() (string,bool) {
 var buf [32768]uint16
 filter:=syscall.StringToUTF16("지원하는 음악·음성·캐릭터·영상\x00*.wav;*.flac;*.mp3;*.ogg;*.pth;*.ckpt;*.safetensors;*.index;*.png;*.jpg;*.jpeg;*.webp;*.bmp;*.vrm;*.glb;*.gltf;*.fbx;*.mp4;*.mov;*.webm;*.mkv;*.mid;*.midi;*.json;*.ds\x00모든 파일\x00*.*\x00\x00")
 opts:=openFileName{Size:uint32(unsafe.Sizeof(openFileName{})),Owner:assetUI.hwnd,File:&buf[0],MaxFile:uint32(len(buf)),Filter:&filter[0],Flags:0x00000800|0x00080000|0x00001000}
 if found,_,_:=openDialog.Call(uintptr(unsafe.Pointer(&opts)));found==0{return "",false}
 return syscall.UTF16ToString(buf[:]),true
}
func assignSelectedAssetToTask(a studioAsset)error{
 ext:=strings.ToLower(filepath.Ext(a.Path))
 task:=getTask()
 index:= -1
 switch {
 case task==taskRVCConvert&&ext==".pth":index=3
 case task==taskRVCConvert&&ext==".index":index=5
 case task==taskLipSync&&(ext==".png"||ext==".jpg"||ext==".jpeg"||ext==".webp"):index=1
 case task==taskLipSync&&ext==".wav":index=2
 case task==taskDiffSinger&&(ext==".ds"||ext==".json"):index=2
 case task==taskScoreVocal&&(ext==".mid"||ext==".midi"||ext==".json"):index=3
 case task==taskMixWAV&&ext==".wav":
  index=2
  if strings.TrimSpace(readText(ui.edits[2]))!=""{index=3}
 case (task==taskWavTrim||task==taskWavNormalize||task==taskWavFade||
  task==taskDemucs||task==taskScoreVocal||task==taskRVCConvert)&&ext==".wav":index=2
 }
 if index<0{return errors.New("선택한 작업과 자산 형식이 맞지 않습니다. 직접 올바른 입력 칸을 선택하세요")}
 setText(ui.edits[index],a.Path)
 appendLog("\r\n프로젝트 라이브러리에서 입력 연결: "+a.Path+"\r\n")
 return nil
}
func stopNativePreview(){playSoundW.Call(0,0,0)}
func assetLibraryWndProc(hwnd uintptr,message uint32,wparam,lparam uintptr)uintptr{
 switch message{
 case wmCreate:
  assetUI.hwnd=hwnd
  callCreate("STATIC","MYVOCAL  |  프로젝트 로컬 자산 라이브러리",wsChild|wsVisible,18,14,760,27,hwnd,0)
  assetUI.list=callCreate("LISTBOX","",wsChild|wsVisible|wsBorder|wsVScroll|0x0001,18,54,828,385,hwnd,0)
  callCreate("BUTTON","파일 등록",wsChild|wsVisible,18,461,151,38,hwnd,idAssetImport)
  callCreate("BUTTON","WAV 재생",wsChild|wsVisible,180,461,151,38,hwnd,idAssetPreview)
  callCreate("BUTTON","재생 중지",wsChild|wsVisible,342,461,151,38,hwnd,idAssetStop)
  callCreate("BUTTON","현재 작업에 연결",wsChild|wsVisible,504,461,173,38,hwnd,idAssetUse)
  callCreate("BUTTON","닫기",wsChild|wsVisible,690,461,156,38,hwnd,idAssetClose)
  assetUI.status=callCreate("STATIC","",wsChild|wsVisible,18,512,800,55,hwnd,0)
  refreshAssetList()
  return 0
 case wmCommand:
  id:=int(wparam&0xffff)
  switch id{
  case idAssetImport:
   if path,ok:=chooseLocalMedia();ok{
    if err:=importStudioAsset(path);err!=nil{showError(err)}
    refreshAssetList()
   }
   return 0
  case idAssetPreview:
   a,err:=assetSelection()
   if err==nil{
    if strings.ToLower(filepath.Ext(a.Path))!=".wav"{err=errors.New("미리듣기는 WAV 형식만 지원합니다")}
    if err==nil{
     ok,_,_:=playSoundW.Call(uintptr(unsafe.Pointer(utf16(a.Path))),0,0x20000|0x1|0x2)
     if ok==0{err=fmt.Errorf("WAV 미리듣기 재생 실패: %s",a.Path)}
    }
   }
   if err!=nil{showError(err)}
   return 0
  case idAssetStop:stopNativePreview();return 0
  case idAssetUse:
   if a,err:=assetSelection();err!=nil{showError(err)}else if err=assignSelectedAssetToTask(a);err!=nil{showError(err)}
   return 0
  case idAssetClose:destroyWindow.Call(hwnd);return 0
  }
 case wmClose:destroyWindow.Call(hwnd);return 0
 case wmDestroy:
  stopNativePreview()
  assetUI=assetLibraryUI{}
  return 0
 }
 ret,_,_:=defWindowProc.Call(hwnd,uintptr(message),wparam,lparam)
 return ret
}
func openStudioAssetLibrary()error{
 _,path:=studioSnapshot()
 if path==""{return errors.New("먼저 프로젝트를 생성하거나 열어야 합니다")}
 if assetUI.hwnd!=0{refreshAssetList();showWindow.Call(assetUI.hwnd,1);return nil}
 if !assetClassRegistered{
  instance,_,_:=getModuleHandle.Call(0)
  class:=utf16(assetWindowClass)
  wc:=wndClassEx{Size:uint32(unsafe.Sizeof(wndClassEx{})),WndProc:syscall.NewCallback(assetLibraryWndProc),Instance:instance,Background:uintptr(6),ClassName:class}
  ret,_,e:=registerClass.Call(uintptr(unsafe.Pointer(&wc)))
  if ret==0{return fmt.Errorf("로컬 라이브러리 창 등록 오류: %v",e)}
  assetClassRegistered=true
 }
 hwnd:=callCreate(assetWindowClass,"MYVOCAL | 로컬 음원·캐릭터·영상 라이브러리",wsOverlappedWindow|wsVisible,165,100,885,620,0,0)
 if hwnd==0{return errors.New("로컬 자산 라이브러리 창을 만들지 못했습니다")}
 showWindow.Call(hwnd,1)
 updateWindow.Call(hwnd)
 return nil
}
