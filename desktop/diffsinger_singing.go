package main

// Windows EXE 내부에서 학습된 DiffSinger Acoustic+NSF-HiFiGAN을 실제 실행.
// 외부 HTTP 서버, 다운로드, 데모 WAV, 사전 설치 모델 덮어쓰기를 사용하지 않는다.
import (
 "bytes"
 "context"
 "encoding/json"
 "errors"
 "fmt"
 "io"
 "math"
 "net/http"
 "os"
 "os/exec"
 "path/filepath"
 "regexp"
 "runtime"
 "strconv"
 "strings"
 "time"
)

const maxDiffSingerInput=4<<20
const maxDiffSingerOutput=160<<20
var diffSingerSlot=make(chan struct{},1)
var diffSingerExperiment=regexp.MustCompile(`^[A-Za-z0-9_-]{1,80}$`)

type nativeDiffSingerSegment struct{
 Offset float64 `json:"offset"`
 PhSeq string `json:"ph_seq"`
 PhDur string `json:"ph_dur"`
 F0Seq string `json:"f0_seq"`
 F0Timestep string `json:"f0_timestep"`
}
type nativeDiffSingerRequest struct{
 Python string `json:"python"`
 Root string `json:"root"`
 Experiment string `json:"experiment"`
 Rights string `json:"rights"`
 Segments []nativeDiffSingerSegment `json:"segments"`
}

func validateNativeDiffSinger(x nativeDiffSingerRequest) error {
 if x.Rights!="confirmed" {return errors.New("사용 허가된 가창 모델과 가사를 선택해야 합니다")}
 if !filepath.IsAbs(x.Root)||!filepath.IsAbs(x.Python)||len(x.Root)>2048||len(x.Python)>2048||
  strings.ContainsAny(x.Root+x.Python,"\x00\r\n")||!diffSingerExperiment.MatchString(x.Experiment){
  return errors.New("학습 모델 폴더·Python.exe·실험 이름을 확인하세요")
 }
 if runtime.GOOS=="windows"&&!strings.EqualFold(filepath.Base(x.Python),"python.exe"){
  return errors.New("Windows Python.exe 절대 경로가 필요합니다")
 }
 if err:=ensureRegular(x.Python);err!=nil{return errors.New("DiffSinger Python 실행 파일이 없습니다")}
 if err:=ensureRegular(filepath.Join(x.Root,"scripts","infer.py"));err!=nil{return errors.New("설치된 DiffSinger 추론 스크립트가 없습니다")}
 ckptDir:=filepath.Join(x.Root,"checkpoints",x.Experiment)
 info,err:=os.Stat(ckptDir)
 if err!=nil||!info.IsDir(){return errors.New("학습 완료 DiffSinger 실험 폴더가 없습니다")}
 if len(x.Segments)<1||len(x.Segments)>60{return errors.New("실제 모델 가창 구간은 1~60개입니다")}
 lastOffset:= -1.0
 for i,seg:=range x.Segments{
  if math.IsNaN(seg.Offset)||math.IsInf(seg.Offset,0)||seg.Offset<0||seg.Offset>360||seg.Offset<lastOffset{
   return fmt.Errorf("%d번 가창 구간의 시작 위치가 올바르지 않습니다",i+1)
  }
  timestep,err:=strconv.ParseFloat(seg.F0Timestep,64)
  if err!=nil||math.IsNaN(timestep)||math.IsInf(timestep,0)||timestep<.005||timestep>.02{
   return errors.New("신경망 F0 시간 간격이 올바르지 않습니다")
  }
  phones:=strings.Fields(seg.PhSeq)
  durations:=strings.Fields(seg.PhDur)
  if len(phones)<1||len(phones)>4096||len(phones)!=len(durations){
   return errors.New("가창 음소·발음 시간 개수가 일치하지 않습니다")
  }
  duration:=0.0
  for j,token:=range phones{
   if len(token)>70||strings.ContainsAny(token,"\x00\r\n")||
    !regexp.MustCompile(`^[\pL\pN_/-]+$`).MatchString(token){
    return fmt.Errorf("%d번 가창 구간의 음소 기호가 잘못됐습니다",i+1)
   }
   d,e:=strconv.ParseFloat(durations[j],64)
   if e!=nil||math.IsNaN(d)||math.IsInf(d,0)||d<=0||d>20{
    return errors.New("가창 발음 지속 시간이 올바르지 않습니다")
   }
   duration+=d
  }
  if duration>20.1||seg.Offset+duration>360.05 {
   return errors.New("가창 음소 길이가 최대 360초를 벗어났습니다")
  }
  f0:=strings.Fields(seg.F0Seq)
  if len(f0)<1||len(f0)>4500||math.Abs(float64(len(f0))*timestep-duration)>.06{
   return errors.New("가창 음높이 F0와 음소 시간이 일치하지 않습니다")
  }
  for _,hz:=range f0{
   value,e:=strconv.ParseFloat(hz,64)
   if e!=nil||math.IsNaN(value)||math.IsInf(value,0)||value<0||value>2100{
    return errors.New("가창 음높이 F0 범위가 잘못됐습니다")
   }
  }
  lastOffset=seg.Offset
 }
 return nil
}

func runNativeDiffSinger(ctx context.Context,x nativeDiffSingerRequest,scorePath,outputDir string) error {
 args:=[]string{filepath.Join(x.Root,"scripts","infer.py"),"acoustic",scorePath,
  "--exp",x.Experiment,"--out",outputDir,"--title","MYVOCAL-Neural-Singing"}
 cmd:=exec.CommandContext(ctx,x.Python,args...)
 cmd.Dir=x.Root;cmd.Stdin=nil
 cmd.Env=append(os.Environ(),"HF_HUB_OFFLINE=1","TRANSFORMERS_OFFLINE=1",
  "HF_DATASETS_OFFLINE=1","HF_HUB_DISABLE_TELEMETRY=1")
 var log bytes.Buffer
 cmd.Stdout=&scoreVocalLog{buf:&log,max:4096}
 cmd.Stderr=&scoreVocalLog{buf:&log,max:4096}
 if runtime.GOOS=="windows" {
  cmd.Cancel=func()error{
   if cmd.Process==nil{return os.ErrProcessDone}
   kill:=exec.Command("taskkill","/PID",strconv.Itoa(cmd.Process.Pid),"/T","/F")
   if err:=kill.Run();err!=nil{return cmd.Process.Kill()}
   return nil
  }
 }
 if err:=cmd.Run();err!=nil{
  if ctx.Err()!=nil{return errors.New("DiffSinger 가창 생성이 취소됐거나 시간 제한에 도달했습니다")}
  return fmt.Errorf("실제 DiffSinger 신경망 추론 실패: %v / %s",err,log.String())
 }
 return nil
}
func (a *appServer) nativeDiffSingerRender(w http.ResponseWriter,r *http.Request){
 if r.Method!=http.MethodPost{jsonError(w,405,"POST 요청만 허용합니다");return}
 if !a.authorizeSinging(w,r){return}
 select{case diffSingerSlot<-struct{}{}:defer func(){<-diffSingerSlot}():
 default:jsonError(w,409,"다른 DiffSinger 가창 생성이 진행 중입니다");return}
 r.Body=http.MaxBytesReader(w,r.Body,maxDiffSingerInput)
 var input nativeDiffSingerRequest
 if err:=json.NewDecoder(r.Body).Decode(&input);err!=nil{
  jsonError(w,400,"DiffSinger 가사·MIDI 요청이 잘못됐습니다");return
 }
 if err:=validateNativeDiffSinger(input);err!=nil{jsonError(w,400,err.Error());return}
 temp,err:=os.MkdirTemp("","myvocal-native-diffsinger-")
 if err!=nil{jsonError(w,500,"독립 가창 작업 공간 생성 실패");return}
 defer os.RemoveAll(temp)
 scoreFile:=filepath.Join(temp,"score.ds")
 encoded,err:=json.Marshal(input.Segments)
 if err!=nil||len(encoded)>maxDiffSingerInput||os.WriteFile(scoreFile,encoded,0600)!=nil{
  jsonError(w,500,"DiffSinger 악보 생성 실패");return
 }
 ctx,cancel:=context.WithTimeout(r.Context(),45*time.Minute)
 defer cancel()
 if err:=runNativeDiffSinger(ctx,input,scoreFile,temp);err!=nil{
  jsonError(w,502,err.Error());return
 }
 result:=filepath.Join(temp,"MYVOCAL-Neural-Singing.wav")
 f,err:=os.Open(result)
 if err!=nil{jsonError(w,502,"실제 DiffSinger가 WAV를 출력하지 않았습니다");return}
 defer f.Close()
 bytes,err:=io.ReadAll(io.LimitReader(f,maxDiffSingerOutput+1))
 if err!=nil||len(bytes)>maxDiffSingerOutput||!validSingingWAV(bytes){
  jsonError(w,502,"신경망 가창 출력 WAV 형식 또는 용량 오류");return
 }
 w.Header().Set("Content-Type","audio/wav")
 w.Header().Set("Content-Disposition","attachment; filename=MYVOCAL-Neural-Singing.wav")
 w.Header().Set("Cache-Control","no-store")
 w.Header().Set("X-Content-Type-Options","nosniff")
 _,_=w.Write(bytes)
}
