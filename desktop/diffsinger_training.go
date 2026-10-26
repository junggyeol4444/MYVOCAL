package main

// 사용 권한이 있는 실제 노래 WAV + 음소/악보를 설치된 DiffSinger 학습기에 전달.
// 모델 다운로드/가짜 체크포인트/기존 실험 폴더 덮어쓰기는 하지 않는다.
import (
 "archive/zip"
 "bytes"
 "context"
 "crypto/rand"
 "encoding/hex"
 "encoding/json"
 "errors"
 "fmt"
 "io"
 "net/http"
 "os"
 "os/exec"
 "path/filepath"
 "regexp"
 "runtime"
 "strconv"
 "strings"
 "sync"
 "time"
)

const diffSingerDatasetLimit = 128 << 20
const diffSingerDatasetExpandedLimit = 150 << 20
const diffSingerCheckpointLimit = 500 << 20

type diffSingerTrainingJob struct {
 mu sync.Mutex
 id, state, voiceID, message, log, checkpoint, directory string
 mode, root, python, experiment string
 started time.Time
 cancel context.CancelFunc
}

func (j *diffSingerTrainingJob) snapshot() map[string]any {
 j.mu.Lock()
 defer j.mu.Unlock()
 return map[string]any{"id":j.id,"state":j.state,"voiceId":j.voiceID,
  "message":j.message,"log":j.log,"checkpointAvailable":j.state=="completed"&&j.checkpoint!="",
  "mode":j.mode,"root":j.root,"python":j.python,"experiment":j.experiment,
  "startedAt":j.started.Format(time.RFC3339)}
}
func (j *diffSingerTrainingJob) stop() {
 j.mu.Lock();cancel:=j.cancel;j.mu.Unlock()
 if cancel!=nil {cancel()}
}
type diffSingerTrainingLog struct {j *diffSingerTrainingJob}
func (w diffSingerTrainingLog) Write(p []byte)(int,error){
 w.j.mu.Lock();defer w.j.mu.Unlock()
 w.j.log+=string(p)
 if len(w.j.log)>8192 {w.j.log=w.j.log[len(w.j.log)-8192:]}
 return len(p),nil
}
type diffSingerTrainingSettings struct {
 Python,Root,Script,VoiceID string
 Mode,Config string
 Args []string
}
var diffSingerTakeName=regexp.MustCompile(`^(?:wavs/take-[0-9]{3}\.wav|labels/take-[0-9]{3}\.json|score/take-[0-9]{3}\.ds|manifest\.json|transcriptions\.csv|dictionary\.txt|README\.txt)$`)

func validateDiffSingerTrainingSettings(v diffSingerTrainingSettings)error{
 if len(v.VoiceID)==0||len(v.VoiceID)>128||strings.ContainsAny(v.VoiceID,"/\\\x00\r\n"){return errors.New("학습 Voice ID 오류")}
 if v.Mode=="official"{return validateOfficialDiffSinger(v.Root,v.Python,v.Config)}
 if v.Mode!=""&&v.Mode!="custom"{return errors.New("지원하지 않는 DiffSinger 학습 방식입니다")}
 if !filepath.IsAbs(v.Root)||!filepath.IsAbs(v.Python)||!filepath.IsAbs(v.Script)||
  len(v.Root)>2048||len(v.Python)>2048||len(v.Script)>2048||
  strings.ContainsAny(v.Root+v.Python+v.Script,"\x00\r\n"){return errors.New("설치 폴더, Python.exe, 학습 스크립트의 절대 경로가 필요합니다")}
 if runtime.GOOS=="windows"&&!strings.EqualFold(filepath.Base(v.Python),"python.exe"){return errors.New("설치된 Windows Python.exe를 선택하세요")}
 rel,e:=filepath.Rel(v.Root,v.Script)
 if e!=nil||rel=="."||rel==".."||strings.HasPrefix(rel,".."+string(filepath.Separator))||filepath.Ext(v.Script)!=".py"{
  return errors.New("DiffSinger 설치 폴더 안의 실제 .py 학습 스크립트만 허용합니다")
 }
 if err:=ensureRegular(v.Python);err!=nil{return fmt.Errorf("Python 실행 파일: %w",err)}
 if err:=ensureRegular(v.Script);err!=nil{return fmt.Errorf("DiffSinger 학습 스크립트: %w",err)}
 if len(v.Args)<2||len(v.Args)>30{return errors.New("학습 스크립트 인수 2~30개가 필요합니다")}
 hasDataset,hasOutput:=false,false
 for _,a:=range v.Args{
  if len(a)>1000||strings.ContainsAny(a,"\x00\r\n"){return errors.New("허용하지 않는 학습 인수입니다")}
  if strings.Contains(a,"{dataset}"){hasDataset=true}
  if strings.Contains(a,"{output}"){hasOutput=true}
 }
 if !hasDataset||!hasOutput{return errors.New("실제 학습 명령에 {dataset}, {output} 인수가 모두 필요합니다")}
 return nil
}

// 학습 데이터는 MYVOCAL이 실제 WAV에서 생성한 ZIP만 인정한다.
// 기존 파일을 복사하거나 기존 모델 디렉터리를 학습 출력으로 지정하지 않는다.
func unpackDiffSingerTrainingDataset(raw []byte,dir,voiceID string)(int,error){
 if len(raw)<100||len(raw)>diffSingerDatasetLimit{return 0,errors.New("학습 ZIP은 128MiB 이하여야 합니다")}
 zr,e:=zip.NewReader(bytes.NewReader(raw),int64(len(raw)))
 if e!=nil{return 0,errors.New("학습 ZIP을 읽을 수 없습니다")}
 if len(zr.File)<4||len(zr.File)>250{return 0,errors.New("학습 데이터 항목 개수가 유효하지 않습니다")}
 seen:=map[string]bool{};wavCount:=0;var size uint64
 var meta struct{Format string `json:"format"`;VoiceID string `json:"voiceId"`;Rights string `json:"rights"`;Phrases []json.RawMessage `json:"phrases"`}
 hasManifest,hasTranscript,hasDictionary:=false,false,false
 for _,f:=range zr.File{
  if !diffSingerTakeName.MatchString(f.Name)||seen[f.Name]||!f.Mode().IsRegular()||
   f.UncompressedSize64>diffSingerDatasetExpandedLimit{return 0,errors.New("학습 ZIP의 중복/경로/파일 형식이 안전하지 않습니다")}
  seen[f.Name]=true;size+=f.UncompressedSize64
  if size>diffSingerDatasetExpandedLimit{return 0,errors.New("학습 ZIP 압축 해제 용량이 너무 큽니다")}
  if strings.HasPrefix(f.Name,"wavs/"){wavCount++}
  if f.Name=="transcriptions.csv"{hasTranscript=true}
  if f.Name=="dictionary.txt"{hasDictionary=true}
  if f.Name=="manifest.json"{
   hasManifest=true
   in,err:=f.Open();if err!=nil{return 0,err}
   data,err:=io.ReadAll(io.LimitReader(in,1<<20));in.Close()
   if err!=nil||json.Unmarshal(data,&meta)!=nil{return 0,errors.New("학습 manifest JSON 오류")}
  }
 }
 if !hasManifest||!hasTranscript||!hasDictionary||wavCount<1||wavCount>60||
  len(meta.Phrases)!=wavCount||meta.Format!="MYVOCAL_SINGING_TAKE_DATASET"||
  meta.VoiceID!=voiceID||!(meta.Rights=="self"||meta.Rights=="owned"||meta.Rights=="licensed"){
  return 0,errors.New("현재 Voice의 실제 노래 녹음·가사·MIDI 학습 자료가 아닙니다")
 }
 for _,f:=range zr.File{
  dst:=filepath.Join(dir,filepath.FromSlash(f.Name))
  if e:=os.MkdirAll(filepath.Dir(dst),0700);e!=nil{return 0,e}
  in,e:=f.Open();if e!=nil{return 0,e}
  out,e:=os.OpenFile(dst,os.O_CREATE|os.O_EXCL|os.O_WRONLY,0600)
  if e!=nil{in.Close();return 0,e}
  written,copyErr:=io.Copy(out,io.LimitReader(in,int64(f.UncompressedSize64)+1))
  closeErr:=out.Close();in.Close()
  if copyErr!=nil||closeErr!=nil||uint64(written)!=f.UncompressedSize64{return 0,errors.New("학습 ZIP 샘플 추출 실패")}
 }
 return wavCount,nil
}

func diffSingerCheckpointIn(dir string)(string,error){
 var found string;var latest time.Time
 err:=filepath.WalkDir(dir,func(path string,entry os.DirEntry)error{
  if err:=entry.Type();err&os.ModeSymlink!=0{return errors.New("학습 결과에 심볼릭 링크를 허용하지 않습니다")}
  if entry.IsDir(){return nil}
  ext:=strings.ToLower(filepath.Ext(path))
  if ext!=".ckpt"&&ext!=".pth"{return nil}
  info,e:=entry.Info();if e!=nil{return e}
  if !info.Mode().IsRegular()||info.Size()<4096||info.Size()>diffSingerCheckpointLimit{return nil}
  if found==""||info.ModTime().After(latest){found=path;latest=info.ModTime()}
  return nil
 })
 if err!=nil{return "",err}
 if found==""{return "",errors.New("학습 엔진이 격리 출력 폴더에 실제 .ckpt/.pth 가중치를 생성하지 않았습니다")}
 return found,nil
}
func (a *appServer) diffSingerTrainingStart(w http.ResponseWriter,r *http.Request){
 if r.Method!=http.MethodPost{jsonError(w,405,"POST만 허용합니다");return}
 if !a.authorizeSinging(w,r){return}
 j:=&a.diffSingerTraining
 j.mu.Lock()
 if j.state=="running"||j.state=="preparing"{j.mu.Unlock();jsonError(w,409,"이미 DiffSinger 학습이 실행 중입니다");return}
 j.state="preparing";j.mu.Unlock()
 accepted:=false
 defer func(){if !accepted{j.mu.Lock();j.state="idle";j.mu.Unlock()}}()
 r.Body=http.MaxBytesReader(w,r.Body,diffSingerDatasetLimit+(1<<20))
 if err:=r.ParseMultipartForm(1<<20);err!=nil{jsonError(w,400,"학습 ZIP 또는 요청 크기 오류");return}
 if r.MultipartForm!=nil{defer r.MultipartForm.RemoveAll()}
 if r.FormValue("rights")!="confirmed"{jsonError(w,403,"실제 녹음 및 모델 사용 권한 확인이 필요합니다");return}
 mode:=r.FormValue("mode")
 if mode==""{mode="custom"}
 var args []string
 if mode!="official"&&json.Unmarshal([]byte(r.FormValue("args")),&args)!=nil{
  jsonError(w,400,"학습 명령 인수 JSON 오류");return
 }
 settings:=diffSingerTrainingSettings{Python:r.FormValue("python"),Root:r.FormValue("root"),
  Script:r.FormValue("script"),VoiceID:r.FormValue("voiceId"),Args:args,
  Mode:mode,Config:r.FormValue("config")}
 if err:=validateDiffSingerTrainingSettings(settings);err!=nil{jsonError(w,400,err.Error());return}
 items:=r.MultipartForm.File["bundle"]
 if len(items)!=1||items[0].Size<100||items[0].Size>diffSingerDatasetLimit{
  jsonError(w,400,"128MiB 이하 실제 가창 학습 ZIP 한 개를 선택하세요");return
 }
 in,e:=items[0].Open();if e!=nil{jsonError(w,400,"ZIP 파일 열기 실패");return}
 raw,e:=io.ReadAll(io.LimitReader(in,diffSingerDatasetLimit+1));in.Close()
 if e!=nil||len(raw)>diffSingerDatasetLimit{jsonError(w,400,"ZIP 파일 읽기 실패");return}
 base:=filepath.Join(dataDir(),"diffsinger-training-jobs")
 if e=os.MkdirAll(base,0700);e!=nil{jsonError(w,500,"격리 학습 폴더 생성 실패");return}
 dir,e:=os.MkdirTemp(base,"diffsinger-")
 if e!=nil{jsonError(w,500,"학습 실행 폴더 생성 실패");return}
 dataset:=filepath.Join(dir,"dataset")
 count,e:=unpackDiffSingerTrainingDataset(raw,dataset,settings.VoiceID)
 if e!=nil{jsonError(w,422,e.Error());return}
 output:=filepath.Join(dir,"output")
 if e=os.Mkdir(output,0700);e!=nil{jsonError(w,500,"새 학습 결과 폴더 생성 실패");return}
 var key [12]byte
 if _,e=rand.Read(key[:]);e!=nil{jsonError(w,500,"학습 식별자 생성 실패");return}
 id:=hex.EncodeToString(key[:])
 ctx,cancel:=context.WithTimeout(context.Background(),12*time.Hour)
 j.mu.Lock()
 j.id=id;j.voiceID=settings.VoiceID;j.state="running";j.directory=dir
 j.mode=settings.Mode;j.root=settings.Root;j.python=settings.Python;j.experiment=""
 if settings.Mode=="official"{j.experiment="myvocal-"+id}
 j.message=fmt.Sprintf("실제 한국어 가창 WAV %d개로 DiffSinger %s 신경망 학습 실행 중",count,settings.Mode)
 j.started=time.Now();j.log="";j.checkpoint="";j.cancel=cancel
 j.mu.Unlock()
 accepted=true
 go func(){
  defer cancel()
  checkpoint:=""
  var runErr error
  if settings.Mode=="official"{
   checkpoint,runErr=runOfficialDiffSingerTraining(ctx,settings.Root,settings.Python,
    settings.Config,dataset,output,id,count,diffSingerTrainingLog{j})
  }else{
   cmdArgs:=[]string{settings.Script}
   for _,arg:=range settings.Args{cmdArgs=append(cmdArgs,strings.ReplaceAll(strings.ReplaceAll(arg,"{dataset}",dataset),"{output}",output))}
   cmd:=exec.CommandContext(ctx,settings.Python,cmdArgs...)
   cmd.Dir=settings.Root;cmd.Stdin=nil
   cmd.Env=append(os.Environ(),"HF_HUB_OFFLINE=1","TRANSFORMERS_OFFLINE=1","HF_HUB_DISABLE_TELEMETRY=1")
   cmd.Stdout=diffSingerTrainingLog{j};cmd.Stderr=diffSingerTrainingLog{j}
   if runtime.GOOS=="windows"{
    cmd.Cancel=func()error{
     if cmd.Process==nil{return os.ErrProcessDone}
     kill:=exec.Command("taskkill","/PID",strconv.Itoa(cmd.Process.Pid),"/T","/F")
     if e:=kill.Run();e!=nil{return cmd.Process.Kill()};return nil
    }
   }
   runErr=cmd.Run()
   if runErr==nil{checkpoint,runErr=diffSingerCheckpointIn(output)}
  }
  j.mu.Lock()
  if j.id==id{
   if ctx.Err()!=nil {j.state="cancelled";j.message="실제 신경망 학습이 중지되거나 실행 제한 시간에 도달했습니다"} else if runErr!=nil {j.state="failed";j.message="설치된 학습 엔진 실행 실패: "+runErr.Error()} else {j.state="completed";j.message="실제 가중치 파일 생성됨. 추론 호환성과 한국어 발음·음질은 미확인";j.checkpoint=checkpoint}
   j.cancel=nil
  }
  j.mu.Unlock()
 }()
 jsonReply(w,map[string]any{"id":id,"state":"running","samples":count})
}
func (a *appServer) diffSingerTrainingStatus(w http.ResponseWriter,r *http.Request){
 if r.Method!=http.MethodGet{jsonError(w,405,"GET만 허용합니다");return}
 if !a.authorizeSinging(w,r){return}
 jsonReply(w,a.diffSingerTraining.snapshot())
}
func (a *appServer) diffSingerTrainingCancel(w http.ResponseWriter,r *http.Request){
 if r.Method!=http.MethodPost{jsonError(w,405,"POST만 허용합니다");return}
 if !a.authorizeSinging(w,r){return}
 j:=&a.diffSingerTraining;j.mu.Lock()
 if j.state!="running"{j.mu.Unlock();jsonError(w,409,"실행 중인 학습이 없습니다");return}
 cancel:=j.cancel;j.mu.Unlock()
 if cancel!=nil{cancel()}
 jsonReply(w,map[string]any{"stopping":true})
}
func (a *appServer) diffSingerTrainingModel(w http.ResponseWriter,r *http.Request){
 if r.Method!=http.MethodGet{jsonError(w,405,"GET만 허용합니다");return}
 if !a.authorizeSinging(w,r){return}
 j:=&a.diffSingerTraining;j.mu.Lock()
 id,state,path:=j.id,j.state,j.checkpoint;j.mu.Unlock()
 if id==""||state!="completed"||path==""||r.URL.Query().Get("id")!=id{
  jsonError(w,409,"학습이 완료된 가창 가중치 파일이 없습니다");return
 }
 f,e:=os.Open(path);if e!=nil{jsonError(w,404,"학습 결과 파일을 읽을 수 없습니다");return}
 defer f.Close()
 info,e:=f.Stat();if e!=nil||!info.Mode().IsRegular()||info.Size()<4096||info.Size()>diffSingerCheckpointLimit{
  jsonError(w,422,"학습 가중치 파일 크기/형식 오류");return
 }
 w.Header().Set("Content-Type","application/octet-stream")
 w.Header().Set("Content-Disposition","attachment; filename=MYVOCAL-DiffSinger-trained"+filepath.Ext(path))
 w.Header().Set("Cache-Control","no-store")
 _,_=io.Copy(w,io.LimitReader(f,diffSingerCheckpointLimit))
}
