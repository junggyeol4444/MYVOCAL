package main

// Existing Windows EXE: permission-checked locally installed Wav2Lip face+vocal
// neural video inference. No cloud, no checkpoint downloads, no original edits.
import(
 "bytes"
 "context"
 "errors"
 "fmt"
 "io"
 "mime/multipart"
 "net/http"
 "os"
 "os/exec"
 "path/filepath"
 "runtime"
 "strconv"
 "strings"
 "time"
)
const maxNeuralFaceVideo=int64(200<<20)
const maxNeuralLipAudio=int64(80<<20)
const maxNeuralLipVideo=int64(220<<20)
const maxNeuralLipUpload=maxNeuralFaceVideo+maxNeuralLipAudio+int64(2<<20)
var neuralLipSlot=make(chan struct{},1)
type neuralLipOptions struct{Python,Root,Checkpoint string;Resize int}
type neuralLipRunner func(context.Context,neuralLipOptions,string,string,string)error

func validateNeuralLipOptions(o neuralLipOptions)error{
 if o.Resize<1||o.Resize>4{return errors.New("화면 축소 비율은 1~4 사이여야 합니다")}
 for _,s:=range []string{o.Python,o.Root,o.Checkpoint}{
  if !filepath.IsAbs(s)||len(s)>1024||strings.ContainsAny(s,"\x00\r\n"){return errors.New("설치된 Python·Wav2Lip·모델 절대 경로를 확인하세요")}
 }
 if runtime.GOOS=="windows"&&!strings.EqualFold(filepath.Base(o.Python),"python.exe"){return errors.New("Python.exe가 필요합니다")}
 for _,path:=range []string{o.Python,filepath.Join(o.Root,"inference.py"),o.Checkpoint}{
  if err:=ensureRegular(path);err!=nil{return errors.New("설치된 Wav2Lip 코드·Python·체크포인트 파일이 없습니다")}
 }
 if !strings.EqualFold(filepath.Ext(o.Checkpoint),".pth"){return errors.New("Wav2Lip 체크포인트는 .pth 파일이어야 합니다")}
 return nil
}
func stageNeuralLipInput(header *multipart.FileHeader,path string,limit int64)error{
 if header==nil||header.Size<64||header.Size>limit{return errors.New("원본 파일 크기가 올바르지 않습니다")}
 f,err:=header.Open();if err!=nil{return errors.New("등록 원본을 읽지 못했습니다")};defer f.Close()
 dst,err:=os.OpenFile(path,os.O_WRONLY|os.O_CREATE|os.O_EXCL,0600);if err!=nil{return errors.New("격리 사본 저장에 실패했습니다")}
 n,e:=io.Copy(dst,io.LimitReader(f,limit+1));closeErr:=dst.Close()
 if e!=nil||closeErr!=nil||n!=header.Size||n>limit{return errors.New("격리 사본이 잘렸거나 잘못됐습니다")}
 return nil
}
func validNeuralLipMP4(b []byte)bool{
 return len(b)>=128&&int64(len(b))<=maxNeuralLipVideo&&bytes.Equal(b[4:8],[]byte("ftyp"))
}
func runNeuralPersonLip(ctx context.Context,o neuralLipOptions,face,audio,out string)error{
 script:=filepath.Join(o.Root,"inference.py")
 cmd:=exec.CommandContext(ctx,o.Python,script,
  "--checkpoint_path",o.Checkpoint,"--face",face,"--audio",audio,
  "--outfile",out,"--resize_factor",strconv.Itoa(o.Resize))
 // Upstream Wav2Lip writes temp/result.avi relative to cwd; NEVER run inside
 // the user's repo. Everything is isolated beneath the new request directory.
 cmd.Dir=filepath.Dir(out);cmd.Stdin=nil
 cmd.Env=append(os.Environ(),"PYTHONPATH="+o.Root)
 var logs bytes.Buffer
 logger:=&limitedRVCLog{buffer:&logs,max:2400}
 cmd.Stdout=logger;cmd.Stderr=logger
 if runtime.GOOS=="windows"{
  cmd.Cancel=func()error{if cmd.Process==nil{return os.ErrProcessDone};kill:=exec.Command("taskkill","/PID",strconv.Itoa(cmd.Process.Pid),"/T","/F");if err:=kill.Run();err!=nil{return cmd.Process.Kill()};return nil}
 }
 if err:=cmd.Run();err!=nil{
  if ctx.Err()!=nil{return errors.New("Wav2Lip 생성이 취소됐거나 실행 제한을 초과했습니다")}
  return fmt.Errorf("설치된 Wav2Lip 신경망 실행 실패: %w",err)
 }
 return nil
}
func (a *appServer) neuralPersonLip(w http.ResponseWriter,r *http.Request){a.neuralPersonLipWith(w,r,runNeuralPersonLip)}
func (a *appServer) neuralPersonLipWith(w http.ResponseWriter,r *http.Request,runner neuralLipRunner){
 if r.Method!=http.MethodPost{jsonError(w,405,"POST 요청만 가능합니다");return}
 if !a.authorizeSinging(w,r){return}
 select{case neuralLipSlot<-struct{}{}:defer func(){<-neuralLipSlot}();default:jsonError(w,409,"다른 신경망 립싱크가 실행 중입니다");return}
 r.Body=http.MaxBytesReader(w,r.Body,maxNeuralLipUpload)
 if err:=r.ParseMultipartForm(1<<20);err!=nil{jsonError(w,400,"립싱크 요청 파일 용량 또는 형식 오류");return}
 if r.MultipartForm!=nil{defer r.MultipartForm.RemoveAll()}
 if r.FormValue("rights")!="confirmed"||r.FormValue("modelRights")!="confirmed"{jsonError(w,403,"실제 사람·가창·모델의 사용 권한 확인이 필요합니다");return}
 resize,err:=strconv.Atoi(r.FormValue("resize"))
 if err!=nil{jsonError(w,400,"화면 크기 설정 오류");return}
 o:=neuralLipOptions{Python:r.FormValue("python"),Root:r.FormValue("root"),Checkpoint:r.FormValue("checkpoint"),Resize:resize}
 if err=validateNeuralLipOptions(o);err!=nil{jsonError(w,400,err.Error());return}
 video,audio:=r.MultipartForm.File["face"],r.MultipartForm.File["audio"]
 if len(video)!=1||len(audio)!=1{jsonError(w,400,"등록된 실제 사람 영상과 가창 WAV가 각각 하나씩 필요합니다");return}
 if video[0].Size>maxNeuralFaceVideo||audio[0].Size>maxNeuralLipAudio||video[0].Size<128||audio[0].Size<48{
  jsonError(w,400,"영상 또는 가창 WAV 크기를 확인하세요");return
 }
 faceExt:=".mp4"
 if strings.EqualFold(filepath.Ext(video[0].Filename),".webm"){faceExt=".webm"}else if !strings.EqualFold(filepath.Ext(video[0].Filename),".mp4"){
  jsonError(w,400,"실제 사람 영상은 MP4 또는 WebM만 사용합니다");return
 }
 dir,err:=os.MkdirTemp("","myvocal-neural-lip-")
 if err!=nil{jsonError(w,500,"격리된 영상 제작 폴더 생성 실패");return}
 defer os.RemoveAll(dir)
 if err=os.Mkdir(filepath.Join(dir,"temp"),0700);err!=nil{jsonError(w,500,"Wav2Lip 임시 폴더 준비 실패");return}
 facePath,audioPath,out:=filepath.Join(dir,"input-face"+faceExt),filepath.Join(dir,"voice.wav"),filepath.Join(dir,"output-lipsync.mp4")
 if err=stageNeuralLipInput(video[0],facePath,maxNeuralFaceVideo);err!=nil{jsonError(w,422,err.Error());return}
 if err=stageNeuralLipInput(audio[0],audioPath,maxNeuralLipAudio);err!=nil{jsonError(w,422,err.Error());return}
 f,err:=os.ReadFile(audioPath);if err!=nil||!validSingingWAV(f){jsonError(w,422,"실제 가창 파일은 완전한 PCM/float WAV여야 합니다");return}
 ctx,cancel:=context.WithTimeout(r.Context(),60*time.Minute);defer cancel()
 if err=runner(ctx,o,facePath,audioPath,out);err!=nil{jsonError(w,502,err.Error());return}
 result,err:=os.Open(out);if err!=nil{jsonError(w,502,"Wav2Lip가 MP4 영상을 생성하지 않았습니다");return}
 defer result.Close()
 b,err:=io.ReadAll(io.LimitReader(result,maxNeuralLipVideo+1))
 if err!=nil||!validNeuralLipMP4(b){jsonError(w,502,"신경망 출력이 실제 MP4가 아니거나 크기 제한을 초과했습니다");return}
 w.Header().Set("Content-Type","video/mp4")
 w.Header().Set("Content-Disposition","attachment; filename=MYVOCAL-neural-person-lipsync.mp4")
 w.Header().Set("Cache-Control","no-store")
 w.Header().Set("X-Content-Type-Options","nosniff")
 _,_=w.Write(b)
}
