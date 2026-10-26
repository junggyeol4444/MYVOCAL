package main

// Original requirements #48/#49: train an actual local SD 1.5 character/person
// LoRA using the user's installed sd-scripts, CUDA environment and base model.
// Source art, original base checkpoint, profile and prior LoRA output are read
// only. Every job gets an exclusive private dataset and model output directory.
// This does NOT infer identity consistency or claim a successful GPU training
// run before a genuine safetensors artifact is present.
import (
 "context"
 "bytes"
 "crypto/rand"
 "encoding/hex"
 "errors"
 "fmt"
 "image"
 _ "image/jpeg"
 _ "image/png"
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

const characterTrainUploadLimit int64 = 128 << 20
const characterTrainImageLimit int64 = 12 << 20
const characterTrainModelLimit int64 = 1024 << 20
var characterTrainID = regexp.MustCompile("^[a-f0-9]{24}$")
var characterCaptionSafe = regexp.MustCompile("^[a-zA-Z0-9_ ,.-]{0,180}$")

type characterTrainJob struct {
 mu sync.Mutex
 id, state, characterID, kind, message, log, output, root string
 started time.Time
 cancel context.CancelFunc
}
func (j *characterTrainJob) snapshot() map[string]any{
 j.mu.Lock();defer j.mu.Unlock()
 return map[string]any{"id":j.id,"state":j.state,"characterId":j.characterID,
 "kind":j.kind,"message":j.message,"log":j.log,"root":j.root,
 "modelAvailable":j.state=="completed"&&j.output!="",
 "startedAt":j.started.Format(time.RFC3339)}
}
func (j *characterTrainJob) stop(){
 j.mu.Lock();cancel:=j.cancel;j.mu.Unlock()
 if cancel!=nil{cancel()}
}
type characterTrainLogger struct{job *characterTrainJob}
func(w characterTrainLogger)Write(buf []byte)(int,error){
 w.job.mu.Lock();defer w.job.mu.Unlock()
 w.job.log+=string(buf)
 if len(w.job.log)>9000{w.job.log=w.job.log[len(w.job.log)-9000:]}
 return len(buf),nil
}
func validateCharacterTrainPaths(root,python,base string)error{
 if !filepath.IsAbs(root)||!filepath.IsAbs(python)||!filepath.IsAbs(base)||
  len(root)>2048||len(python)>2048||len(base)>2048||
  strings.ContainsAny(root+python+base,"\x00\r\n") {
  return errors.New("sd-scripts 원본 폴더, 설치된 Python.exe, SD 1.5 체크포인트 절대 경로가 필요합니다")
 }
 if runtime.GOOS=="windows"&&!strings.EqualFold(filepath.Base(python),"python.exe"){
  return errors.New("사용자가 설치한 Python.exe 경로를 선택하세요")
 }
 if ext:=strings.ToLower(filepath.Ext(base));ext!=".safetensors"&&ext!=".ckpt"{
  return errors.New("학습 기반 SD 1.5 모델 파일은 .safetensors/.ckpt 형식이어야 합니다")
 }
 for _,p:=range []string{python,base,filepath.Join(root,"train_network.py")}{
  info,err:=os.Lstat(p)
  if err!=nil||!info.Mode().IsRegular(){return fmt.Errorf("실제 설치 학습 파일을 찾지 못했습니다: %s",filepath.Base(p))}
 }
 info,err:=os.Stat(root)
 if err!=nil||!info.IsDir(){return errors.New("설치된 sd-scripts 원본 폴더가 없습니다")}
 return nil
}
func checkCharacterTrainImage(part io.Reader)([]byte,string,error){
 raw,err:=io.ReadAll(io.LimitReader(part,characterTrainImageLimit+1))
 if err!=nil||int64(len(raw))>characterTrainImageLimit||len(raw)<128{
  return nil,"",errors.New("학습 이미지 1개는 128B~12MiB여야 합니다")
 }
 kind:=http.DetectContentType(raw)
 if kind!="image/png"&&kind!="image/jpeg"{return nil,"",errors.New("실제 PNG/JPEG 사진·원화만 학습할 수 있습니다")}
 size,format,err:=image.DecodeConfig(bytes.NewReader(raw))
 if err!=nil||(format!="png"&&format!="jpeg")||size.Width<256||size.Height<256||
  size.Width>4096||size.Height>4096||int64(size.Width)*int64(size.Height)>16000000{
  return nil,"",errors.New("학습 사진은 256~4096px의 실제 PNG/JPEG여야 합니다")
 }
 ext:=".jpg";if format=="png"{ext=".png"}
 return raw,ext,nil
}
func trainCharacterIdentity(ctx context.Context,job *characterTrainJob,root,python,base,data,output,token string,steps,rank int)error{
 args:=[]string{"-m","accelerate.commands.launch","--num_cpu_threads_per_process","1",
  filepath.Join(root,"train_network.py"),
  "--pretrained_model_name_or_path",base,
  "--train_data_dir",data,
  "--output_dir",output,
  "--output_name",token,
  "--resolution","512,512",
  "--train_batch_size","1",
  "--max_train_steps",strconv.Itoa(steps),
  "--learning_rate","0.0001",
  "--network_module","networks.lora",
  "--network_dim",strconv.Itoa(rank),
  "--network_alpha",strconv.Itoa(rank/2),
  "--mixed_precision","fp16",
  "--save_precision","fp16",
  "--save_model_as","safetensors",
  "--caption_extension",".txt",
  "--enable_bucket",
  "--seed","42",
 }
 cmd:=exec.CommandContext(ctx,python,args...)
 cmd.Dir=root;cmd.Stdin=nil
 cmd.Env=append(os.Environ(),"HF_HUB_OFFLINE=1","TRANSFORMERS_OFFLINE=1",
  "HF_DATASETS_OFFLINE=1","HF_HUB_DISABLE_TELEMETRY=1","PYTHONPATH="+root)
 writer:=characterTrainLogger{job};cmd.Stdout=writer;cmd.Stderr=writer
 if runtime.GOOS=="windows"{
  cmd.Cancel=func()error{
   if cmd.Process==nil{return os.ErrProcessDone}
   kill:=exec.Command("taskkill","/PID",strconv.Itoa(cmd.Process.Pid),"/T","/F")
   if err:=kill.Run();err!=nil{return cmd.Process.Kill()}
   return nil
  }
 }
 if _,err:=fmt.Fprintln(writer,"[MYVOCAL] 실제 SD 1.5 LoRA 학습 시작 (기본 모델·원본 사진 보존)");err!=nil{return err}
 if err:=cmd.Run();err!=nil{
  if ctx.Err()!=nil{return errors.New("캐릭터 신경망 학습 취소 또는 제한 시간 종료")}
  return fmt.Errorf("설치된 sd-scripts 학습 실행 오류: %w",err)
 }
 filename:=filepath.Join(output,token+".safetensors")
 info,err:=os.Lstat(filename)
 if err!=nil||!info.Mode().IsRegular()||info.Size()<4096||info.Size()>characterTrainModelLimit{
  return errors.New("학습 엔진이 새로운 유효한 .safetensors 가중치를 생성하지 않았습니다")
 }
 job.mu.Lock();job.output=filename;job.mu.Unlock()
 return nil
}
func(a *appServer)characterTrainStart(w http.ResponseWriter,r *http.Request){
 if r.Method!=http.MethodPost{jsonError(w,405,"POST만 허용합니다");return}
 if !a.authorizeSinging(w,r){return}
 j:=&a.characterTraining
 j.mu.Lock()
 if j.state=="running"||j.state=="preparing"{j.mu.Unlock();jsonError(w,409,"이미 캐릭터 모델 학습이 진행 중입니다");return}
 j.state="preparing";j.mu.Unlock()
 accepted:=false
 defer func(){if !accepted{j.mu.Lock();j.state="idle";j.mu.Unlock()}}()
 r.Body=http.MaxBytesReader(w,r.Body,characterTrainUploadLimit)
 if err:=r.ParseMultipartForm(1<<20);err!=nil{jsonError(w,400,"캐릭터 사진 업로드 크기 또는 양식 오류");return}
 if r.MultipartForm!=nil{defer r.MultipartForm.RemoveAll()}
 if r.FormValue("consent")!="confirmed"{jsonError(w,403,"인물·캐릭터 원본의 사용·신경망 학습 권한을 확인하세요");return}
 id:=r.FormValue("characterId")
 kind:=r.FormValue("kind")
 if len(id)<1||len(id)>120||strings.ContainsAny(id,"\\/\x00\r\n")||
  (kind!="person"&&kind!="character"){
  jsonError(w,400,"등록된 실제 사람 또는 2D 캐릭터를 선택하세요");return
 }
 if kind=="person"&&r.FormValue("rights")!="self"&&r.FormValue("rights")!="licensed"{
  jsonError(w,403,"실제 사람은 본인 또는 사용 허가받은 사진만 학습합니다");return
 }
 if kind=="character"&&r.FormValue("rights")!="self"&&r.FormValue("rights")!="owned"&&r.FormValue("rights")!="licensed"{
  jsonError(w,403,"권리 확인된 2D 캐릭터 원화만 학습합니다");return
 }
 if r.FormValue("rights")=="licensed"&&strings.TrimSpace(r.FormValue("rightsNote"))==""{
  jsonError(w,403,"자료 학습을 허용하는 라이선스 범위를 입력하세요");return
 }
 root,python,base:=r.FormValue("root"),r.FormValue("python"),r.FormValue("base")
 if err:=validateCharacterTrainPaths(root,python,base);err!=nil{jsonError(w,400,err.Error());return}
 steps,err:=strconv.Atoi(r.FormValue("steps"));if err!=nil||steps<100||steps>3000{
  jsonError(w,400,"학습 스텝은 100~3000 사이입니다");return
 }
 rank,err:=strconv.Atoi(r.FormValue("rank"));if err!=nil||(rank!=8&&rank!=16&&rank!=32){
  jsonError(w,400,"LoRA 차원은 8/16/32 중 하나여야 합니다");return
 }
 imgs:=r.MultipartForm.File["images"]
 if len(imgs)<4||len(imgs)>20{jsonError(w,400,"서로 다른 본인·캐릭터 등록 원본 사진 4~20장이 필요합니다");return}
 var secret [12]byte
 if _,err=rand.Read(secret[:]);err!=nil{jsonError(w,500,"학습 작업 ID 생성 실패");return}
 jobID:=hex.EncodeToString(secret[:])
 token:="mv"+jobID
 parent:=filepath.Join(dataDir(),"character-identity-training")
 if err=os.MkdirAll(parent,0700);err!=nil{jsonError(w,500,"학습 자료 전용 폴더 생성 실패");return}
 jobRoot:=filepath.Join(parent,jobID)
 if err=os.Mkdir(jobRoot,0700);err!=nil{jsonError(w,500,"개별 학습 작업 폴더 생성 실패");return}
 dataset:=filepath.Join(jobRoot,"dataset")
 photos:=filepath.Join(dataset,"10_"+token)
 output:=filepath.Join(jobRoot,"models")
 for _,p:=range []string{photos,output}{if err=os.MkdirAll(p,0700);err!=nil{jsonError(w,500,"학습용 신규 작업 폴더 준비 실패");return}}
 unique:=map[string]bool{}
 for n,header:=range imgs{
  if header.Size<128||header.Size>characterTrainImageLimit{jsonError(w,400,"12MiB 이하 원본 이미지만 가능합니다");return}
  asset:=strings.TrimSpace(r.FormValue("assetId"+strconv.Itoa(n)))
  if asset==""||len(asset)>120||unique[asset]{jsonError(w,400,"서로 다른 등록 이미지 자산을 선택하세요");return}
  unique[asset]=true
  file,e:=header.Open();if e!=nil{jsonError(w,400,"캐릭터 원본 이미지 읽기 실패");return}
  payload,ext,e:=checkCharacterTrainImage(file);file.Close()
  if e!=nil{jsonError(w,422,e.Error());return}
  stem:=fmt.Sprintf("%03d",n+1)
  if e=os.WriteFile(filepath.Join(photos,stem+ext),payload,0600);e!=nil{jsonError(w,500,"학습 이미지 사본 저장 실패");return}
  // Captions use a unique per-job token to avoid colliding with existing subjects.
  tag:=token+", "+kind+", original identity reference"
  if !characterCaptionSafe.MatchString(tag){jsonError(w,400,"학습 설명 오류");return}
  if e=os.WriteFile(filepath.Join(photos,stem+".txt"),[]byte(tag+"\n"),0600);e!=nil{
   jsonError(w,500,"학습 이미지 캡션 저장 실패");return
  }
 }
 ctx,cancel:=context.WithTimeout(context.Background(),18*time.Hour)
 j.mu.Lock()
 j.id=jobID;j.state="running";j.characterID=id;j.kind=kind;j.output="";j.root=jobRoot
 j.started=time.Now();j.message=fmt.Sprintf("원본 이미지 %d장으로 로컬 LoRA 신경망 학습 중",len(imgs))
 j.log="";j.cancel=cancel
 j.mu.Unlock()
 accepted=true
 go func(){
  defer cancel()
  err:=trainCharacterIdentity(ctx,j,root,python,base,dataset,output,token,steps,rank)
  j.mu.Lock()
  if j.id==jobID{
   if ctx.Err()!=nil{j.state="cancelled";j.message="캐릭터 신경망 학습 취소 또는 제한 시간 종료"
   }else if err!=nil{j.state="failed";j.message=err.Error()
   }else{j.state="completed";j.message="신규 LoRA 가중치 생성. 인물·캐릭터 일치율 및 ComfyUI 모델 호환성은 미검증"}
   j.cancel=nil
  }
  j.mu.Unlock()
 }()
 jsonReply(w,map[string]any{"id":jobID,"state":"running","images":len(imgs)})
}
func(a *appServer)characterTrainStatus(w http.ResponseWriter,r *http.Request){
 if r.Method!=http.MethodGet{jsonError(w,405,"GET만 허용합니다");return}
 if !a.authorizeSinging(w,r){return}
 jsonReply(w,a.characterTraining.snapshot())
}
func(a *appServer)characterTrainCancel(w http.ResponseWriter,r *http.Request){
 if r.Method!=http.MethodPost{jsonError(w,405,"POST만 허용합니다");return}
 if !a.authorizeSinging(w,r){return}
 j:=&a.characterTraining;j.mu.Lock()
 if j.state!="running"{j.mu.Unlock();jsonError(w,409,"실행 중인 LoRA 학습이 없습니다");return}
 cancel:=j.cancel;j.mu.Unlock()
 if cancel!=nil{cancel()}
 jsonReply(w,map[string]any{"stopping":true})
}
func(a *appServer)characterTrainModel(w http.ResponseWriter,r *http.Request){
 if r.Method!=http.MethodGet{jsonError(w,405,"GET만 허용합니다");return}
 if !a.authorizeSinging(w,r){return}
 j:=&a.characterTraining;j.mu.Lock()
 id,state,path:=j.id,j.state,j.output;j.mu.Unlock()
 if !characterTrainID.MatchString(id)||r.URL.Query().Get("id")!=id||state!="completed"||path==""{
  jsonError(w,409,"학습 완료된 신규 캐릭터 LoRA 가중치가 없습니다");return
 }
 f,err:=os.Open(path);if err!=nil{jsonError(w,404,"학습 결과 가중치 파일 열기 실패");return}
 defer f.Close()
 info,err:=f.Stat()
 if err!=nil||!info.Mode().IsRegular()||info.Size()<4096||info.Size()>characterTrainModelLimit{
  jsonError(w,422,"학습 모델 실제 파일 크기 오류");return
 }
 w.Header().Set("Content-Type","application/octet-stream")
 w.Header().Set("Content-Disposition","attachment; filename=MYVOCAL-Identity-"+id+".safetensors")
 w.Header().Set("Cache-Control","no-store")
 _,_=io.Copy(w,io.LimitReader(f,characterTrainModelLimit))
}
