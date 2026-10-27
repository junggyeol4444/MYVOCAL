//go:build windows

package main

import(
 "context"
 "errors"
 "fmt"
 "os"
 "os/exec"
 "path/filepath"
 "strconv"
 "strings"
 "syscall"
 "time"
 "unsafe"
)

const(
 voiceWinClass="MYVOCALNativeVoiceSingerLab"
 idVoiceStudio=131
 idVoiceRecord=1800
 idVoiceImport=1801
 idVoiceAnalyze=1802
 idVoiceTrain=1803
 idVoiceCancel=1804
 idVoiceClose=1805
 idVoiceChooseBase=1810
 wmVoiceFinished=0x8004
)
type voiceStudioWindow struct{
 hwnd,list,status,cancel uintptr
 edits [5]uintptr
 samples []string
 running bool
}
var voiceUI voiceStudioWindow
var voiceClassRegistered bool
var voiceFieldNames=[5]string{
 "기존 Python.exe","기존 RVC 설치 폴더",
 "새 학습 모델 출력 .pth","학습 Epochs (1~1000)","마이크 녹음 길이(3~180초)",
}
func voiceSelectFile(index int)(string,bool){
 if index==1{return folderPicker()}
 var buf [32768]uint16
 filter:=syscall.StringToUTF16("로컬 음성·모델 파일\x00*.wav;*.exe;*.pth\x00모든 파일\x00*.*\x00\x00")
 opts:=openFileName{Size:uint32(unsafe.Sizeof(openFileName{})),Owner:voiceUI.hwnd,
  File:&buf[0],MaxFile:uint32(len(buf)),Filter:&filter[0],
  Flags:0x00000800|0x00080000,
 }
 proc:=openDialog
 if index==2{
  opts.DefExt=utf16("pth")
  opts.Flags|=0x00000002
  proc=saveDialog
 }else{opts.Flags|=0x00001000}
 chosen,_,_:=proc.Call(uintptr(unsafe.Pointer(&opts)))
 if chosen==0{return "",false}
 return syscall.UTF16ToString(buf[:]),true
}
func selectVoiceImportFile()(string,bool){
 var buf [32768]uint16
 filter:=syscall.StringToUTF16("16비트 PCM WAV 녹음\x00*.wav\x00\x00")
 opts:=openFileName{Size:uint32(unsafe.Sizeof(openFileName{})),Owner:voiceUI.hwnd,
  File:&buf[0],MaxFile:uint32(len(buf)),Filter:&filter[0],
  Flags:0x00000800|0x00080000|0x00001000}
 chosen,_,_:=openDialog.Call(uintptr(unsafe.Pointer(&opts)))
 if chosen==0{return "",false}
 return syscall.UTF16ToString(buf[:]),true
}
func refreshVoiceSamples(){
 if voiceUI.list==0{return}
 files,err:=allVoiceSamples()
 if err!=nil{voiceUI.samples=nil;return}
 voiceUI.samples=files
 sendMessage.Call(voiceUI.list,lbResetContent,0,0)
 for _,name:=range files{
  sendMessage.Call(voiceUI.list,lbAddString,0,uintptr(unsafe.Pointer(utf16(filepath.Base(name)))))
 }
 if len(files)>0{sendMessage.Call(voiceUI.list,0x0186,uintptr(len(files)-1),0)}
}
func selectedVoiceSample()(string,error){
 if voiceUI.list==0{return "",errors.New("보컬 녹음을 선택할 수 없습니다")}
 index,_,_:=sendMessage.Call(voiceUI.list,lbGetCurSel,0,0)
 if int32(index)<0||int(index)>=len(voiceUI.samples){return "",errors.New("녹음 목록에서 샘플을 먼저 선택하세요")}
 return voiceUI.samples[int(index)],nil
}
func startVoiceOperation(operation string,action func(context.Context,func(string))error){
 ui.mu.Lock()
 busy:=ui.running
 ui.mu.Unlock()
 if busy{showError(errors.New("진행 중인 로컬 음악/보컬 작업이 있습니다"));return}
 ctx,cancel:=context.WithCancel(context.Background())
 ui.mu.Lock();ui.cancel=cancel;ui.running=true;ui.mu.Unlock()
 setRunning(true)
 voiceUI.running=true
 enableWindow.Call(voiceUI.cancel,1)
 setText(voiceUI.status,operation+" 작업을 실행 중입니다. 내 녹음·학습 모델 원본을 변경하지 않습니다.")
 appendLog("\r\n[내 AI 가수] "+operation+" 시작\r\n")
 go func(){
  err:=action(ctx,appendLog)
  if err!=nil{appendLog("\r\n[내 AI 가수] "+operation+" 실패: "+err.Error()+"\r\n")}else{
   appendLog("\r\n[내 AI 가수] "+operation+" 완료\r\n")
  }
  ui.mu.Lock();ui.running=false;ui.cancel=nil;ui.mu.Unlock()
  postMessage.Call(ui.hwnd,wmAppLog,1,0)
  postMessage.Call(voiceUI.hwnd,wmVoiceFinished,0,0)
 }()
}
func voiceTrainingRequest()request{
 root,_:=voiceDatasetRoot()
 return request{
  Task:taskRVC,
  Python:strings.TrimSpace(readText(voiceUI.edits[0])),
  Engine:strings.TrimSpace(readText(voiceUI.edits[1])),
  Input:root,
  Output:strings.TrimSpace(readText(voiceUI.edits[2])),
  Option:strings.TrimSpace(readText(voiceUI.edits[3])),
 }
}
func voiceStudioProc(hwnd uintptr,message uint32,wparam,lparam uintptr)uintptr{
 switch message{
 case wmCreate:
  voiceUI.hwnd=hwnd
  callCreate("STATIC","MYVOCAL | 내 AI 가수 만들기 (원본 06)",wsVisible|wsChild,18,12,875,30,hwnd,0)
  callCreate("STATIC","마이크 녹음 → 학습용 WAV 등록 → 음역 분석 → 공식 RVC 학습 → 내 모델 저장",wsVisible|wsChild,18,49,910,29,hwnd,0)
  for i,label:=range voiceFieldNames{
   y:=int32(93+i*43)
   callCreate("STATIC",label,wsVisible|wsChild,18,y+5,245,26,hwnd,0)
   voiceUI.edits[i]=callCreate("EDIT","",wsVisible|wsChild|wsBorder|esAutoHScroll,270,y,584,30,hwnd,0)
   if i<3{callCreate("BUTTON","...",wsVisible|wsChild,864,y,49,30,hwnd,idVoiceChooseBase+uintptr(i))}
  }
  setText(voiceUI.edits[3],"100")
  setText(voiceUI.edits[4],"30")
  if path,err:=exec.LookPath("python.exe");err==nil{
   if path,err=filepath.Abs(path);err==nil{setText(voiceUI.edits[0],path)}
  }
  callCreate("BUTTON","1. 마이크에서 녹음",wsVisible|wsChild,18,329,208,39,hwnd,idVoiceRecord)
  callCreate("BUTTON","2. 기존 WAV 등록",wsVisible|wsChild,238,329,202,39,hwnd,idVoiceImport)
  callCreate("BUTTON","3. 녹음 음역 분석",wsVisible|wsChild,452,329,216,39,hwnd,idVoiceAnalyze)
  callCreate("BUTTON","4. RVC 모델 학습",wsVisible|wsChild,680,329,236,39,hwnd,idVoiceTrain)
  callCreate("STATIC","프로젝트에 등록된 학습용 WAV 목록 (원본 음성은 수정하지 않습니다)",wsVisible|wsChild,18,393,891,26,hwnd,0)
  voiceUI.list=callCreate("LISTBOX","",wsVisible|wsChild|wsBorder|wsVScroll|0x0001,18,428,898,199,hwnd,0)
  voiceUI.cancel=callCreate("BUTTON","진행 중 작업 취소",wsVisible|wsChild,18,644,260,40,hwnd,idVoiceCancel)
  callCreate("BUTTON","닫기",wsVisible|wsChild,296,644,161,40,hwnd,idVoiceClose)
  voiceUI.status=callCreate("STATIC","등록한 16비트 PCM WAV만 공식 RVC 데이터셋으로 사용합니다. 새로운 모델만 저장합니다.",wsVisible|wsChild,18,706,895,53,hwnd,0)
  enableWindow.Call(voiceUI.cancel,0)
  refreshVoiceSamples()
  return 0
 case wmCommand:
  id:=int(wparam&0xffff)
  switch id{
  case idVoiceRecord:
   duration:=strings.TrimSpace(readText(voiceUI.edits[4]))
   seconds,err:=strconv.Atoi(duration)
   if err!=nil||seconds<3||seconds>180{showError(errors.New("마이크 녹음은 3~180초입니다"));return 0}
   output,err:=nextVoiceSamplePath()
   if err!=nil{showError(err);return 0}
   startVoiceOperation("실제 마이크 녹음",func(ctx context.Context,log func(string))error{
    r:=request{Task:taskMicRecord,Output:output,Option:duration}
    if err:=recordNativeMic(ctx,r,log);err!=nil{return err}
    return importStudioAsset(output)
   })
   return 0
  case idVoiceImport:
   input,ok:=selectVoiceImportFile()
   if !ok{return 0}
   startVoiceOperation("학습 WAV 등록",func(ctx context.Context,log func(string))error{
    target,err:=importVoiceSample(ctx,input)
    if err!=nil{return err}
    log("\r\n학습용 WAV: "+target+"\r\n")
    return importStudioAsset(target)
   })
   return 0
  case idVoiceAnalyze:
   selected,err:=selectedVoiceSample()
   if err!=nil{showError(err);return 0}
   startVoiceOperation("녹음 음역·음량 분석",func(ctx context.Context,log func(string))error{
    result,err:=analyzeVoiceSample(ctx,selected)
    if err!=nil{return err}
    report:=selected+fmt.Sprintf(".analysis-%d.json",time.Now().UnixNano())
    if err=publishVoiceAnalysis(report,result);err!=nil{return err}
    log(fmt.Sprintf("\r\n음역 P10/P50/P90 Hz: %.2f / %.2f / %.2f\r\n",result.Pitch10Hz,result.Pitch50Hz,result.Pitch90Hz))
    for _,note:=range result.Notes{log("\r\n"+note+"\r\n")}
    return importStudioAsset(report)
   })
   return 0
  case idVoiceTrain:
   req:=voiceTrainingRequest()
   if _,err:=prepareRequest(req);err!=nil{showError(err);return 0}
   startVoiceOperation("실제 공식 RVC 학습",func(ctx context.Context,log func(string))error{
    if err:=executeJob(ctx,req,log);err!=nil{return err}
    if err:=saveStudioVoiceModel(req.Output);err!=nil{return err}
    if err:=importStudioAsset(req.Output);err!=nil{return err}
    index:=strings.TrimSuffix(req.Output,filepath.Ext(req.Output))+".index"
    if requireExistingFile(index)==nil{_ = importStudioAsset(index)}
    return nil
   })
   return 0
  case idVoiceCancel:
   ui.mu.Lock();cancel:=ui.cancel;ui.mu.Unlock()
   if cancel!=nil{cancel()}
   return 0
  case idVoiceClose:
   if voiceUI.running{showError(errors.New("실행 중인 녹음/학습 작업이 끝난 후 창을 닫을 수 있습니다"));return 0}
   destroyWindow.Call(hwnd);return 0
  }
  if id>=idVoiceChooseBase&&id<idVoiceChooseBase+3{
   index:=id-idVoiceChooseBase
   if target,ok:=voiceSelectFile(index);ok{setText(voiceUI.edits[index],target)}
   return 0
  }
 case wmVoiceFinished:
  voiceUI.running=false
  enableWindow.Call(voiceUI.cancel,0)
  refreshVoiceSamples()
  setText(voiceUI.status,"녹음/학습 작업 종료. 결과와 상세 내용은 메인 로그에서 확인할 수 있습니다.")
  return 0
 case wmClose:
  if voiceUI.running{showError(errors.New("먼저 녹음이나 학습 작업을 중지하세요"));return 0}
  destroyWindow.Call(hwnd);return 0
 case wmDestroy:voiceUI=voiceStudioWindow{};return 0
 }
 result,_,_:=defWindowProc.Call(hwnd,uintptr(message),wparam,lparam)
 return result
}
func openNativeVoiceStudio()error{
 if voiceUI.hwnd!=0{refreshVoiceSamples();showWindow.Call(voiceUI.hwnd,1);return nil}
 if !voiceClassRegistered{
  instance,_,_:=getModuleHandle.Call(0)
  cls:=utf16(voiceWinClass)
  wc:=wndClassEx{Size:uint32(unsafe.Sizeof(wndClassEx{})),WndProc:syscall.NewCallback(voiceStudioProc),
   Instance:instance,Background:uintptr(6),ClassName:cls}
  r,_,e:=registerClass.Call(uintptr(unsafe.Pointer(&wc)))
  if r==0{return fmt.Errorf("내 AI 가수 작업실 등록 실패: %v",e)}
  voiceClassRegistered=true
 }
 hwnd:=callCreate(voiceWinClass,"MYVOCAL | 내 AI 가수 녹음·학습",wsOverlappedWindow|wsVisible,160,70,950,840,0,0)
 if hwnd==0{return errors.New("AI 가수 Win32 작업실 생성 실패")}
 showWindow.Call(hwnd,1);updateWindow.Call(hwnd)
 return nil
}
