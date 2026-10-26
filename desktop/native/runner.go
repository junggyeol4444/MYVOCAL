package main

import (
 "bytes"
 "context"
 "encoding/json"
 "errors"
 "fmt"
 "io"
 "os"
 "os/exec"
 "path/filepath"
 "strconv"
 "strings"
)

const (
 taskMusicGen = iota
 taskRVC
 taskDemucs
 taskScoreVocal
 taskLipSync
 taskRVCConvert
 taskDiffSinger
 taskLongMusicGen
 taskMixWAV
)
var taskNames=[]string{"AI 작곡 (MusicGen)","내 음색 학습 (RVC)","음악 악기 분리 (Demucs)","녹음 음정 보정 (MIDI)","2D 캐릭터 립싱크 MV","학습된 내 음색으로 보컬 변환 (RVC)","한국어 신경망 가창 (DiffSinger)","장편 AI 작곡 (MusicGen 3~6분·중단 재개)","반주·보컬 PCM 믹싱 (네이티브)"}

type request struct {
 Task int
 Python string
 Engine string
 Input string
 Auxiliary string
 Output string
 Prompt string
 Option string
}
type jobSpec struct {exe string;args []string;output string;cwd string}

func requireExistingFile(path string)error{
 if !filepath.IsAbs(path){return fmt.Errorf("절대 파일 경로가 필요합니다: %s",path)}
 s,err:=os.Lstat(path)
 if err!=nil||!s.Mode().IsRegular(){return fmt.Errorf("파일을 찾을 수 없습니다: %s",path)}
 return nil
}
func requireDirectory(path string)error{
 if !filepath.IsAbs(path){return fmt.Errorf("절대 폴더 경로가 필요합니다: %s",path)}
 s,err:=os.Lstat(path)
 if err!=nil||!s.IsDir()||(s.Mode()&os.ModeSymlink)!=0{return fmt.Errorf("폴더를 찾을 수 없습니다: %s",path)}
 return nil
}
func preventOverwrite(path string)error{
 if !filepath.IsAbs(path){return errors.New("출력은 절대 경로로 지정하세요")}
 if err:=requireDirectory(filepath.Dir(path));err!=nil{return err}
 _,err:=os.Lstat(path)
 if err==nil{return fmt.Errorf("기존 파일 덮어쓰기 금지: %s",path)}
 if !os.IsNotExist(err){return err}
 return nil
}
func locateWorker(name string)(string,error){
 exe,err:=os.Executable();if err!=nil{return "",err}
 path:=filepath.Join(filepath.Dir(exe),"MYVOCAL-Studio-workers",name)
 if err:=requireExistingFile(path);err!=nil{return "",err}
 return path,nil
}
func prepareRequest(r request)(jobSpec,error){
 if r.Task<0||r.Task>=len(taskNames){return jobSpec{},errors.New("알 수 없는 작업")}
 for _,v:=range []string{r.Python,r.Engine,r.Input,r.Auxiliary,r.Output,r.Prompt,r.Option}{
  if strings.ContainsRune(v,0)||strings.ContainsAny(v,"\r\n"){return jobSpec{},errors.New("입력값에 제어 문자가 포함돼 있습니다")}
 }
 if r.Task!=taskMixWAV{if err:=requireExistingFile(r.Python);err!=nil{return jobSpec{},fmt.Errorf("로컬 Python: %w",err)}}
 if r.Task!=taskDemucs{if err:=preventOverwrite(r.Output);err!=nil{return jobSpec{},err}}
 var script string;var args []string
 switch r.Task{
 case taskMusicGen:
  if err:=requireDirectory(r.Engine);err!=nil{return jobSpec{},err}
  if err:=requireExistingFile(filepath.Join(r.Engine,"config.json"));err!=nil{return jobSpec{},errors.New("MusicGen 모델 폴더에 config.json이 없습니다")}
  seconds,err:=strconv.Atoi(strings.TrimSpace(r.Option))
  if err!=nil||seconds<3||seconds>28{return jobSpec{},errors.New("MusicGen 길이는 3~28초입니다")}
  if len([]rune(strings.TrimSpace(r.Prompt)))<2||len([]rune(r.Prompt))>600{return jobSpec{},errors.New("작곡 설명은 2~600자입니다")}
  script="musicgen_worker.py"
  args=[]string{"--model-dir",r.Engine,"--output",r.Output,"--prompt",r.Prompt,"--seconds",strconv.Itoa(seconds),"--seed","0"}
 case taskMixWAV:
  if err:=requireExistingFile(r.Input);err!=nil{return jobSpec{},fmt.Errorf("반주 WAV: %w",err)}
  if err:=requireExistingFile(r.Auxiliary);err!=nil{return jobSpec{},fmt.Errorf("보컬 WAV: %w",err)}
  gain,err:=strconv.Atoi(strings.TrimSpace(r.Option))
  if err!=nil||gain<0||gain>200{return jobSpec{},errors.New("보컬 음량은 0~200%입니다")}
  return jobSpec{output:r.Output},nil
 case taskLongMusicGen:
  if err:=requireDirectory(r.Engine);err!=nil{return jobSpec{},err}
  if err:=requireExistingFile(filepath.Join(r.Engine,"config.json"));err!=nil{return jobSpec{},errors.New("MusicGen 모델 폴더에 config.json이 없습니다")}
  seconds,err:=strconv.Atoi(strings.TrimSpace(r.Option))
  if err!=nil||seconds<180||seconds>360{return jobSpec{},errors.New("장편 MusicGen 길이는 180~360초입니다")}
  if len([]rune(strings.TrimSpace(r.Prompt)))<2||len([]rune(r.Prompt))>600{return jobSpec{},errors.New("작곡 설명은 2~600자입니다")}
  script="musicgen_worker.py"
  args=[]string{"--model-dir",r.Engine,"--output",r.Output,"--prompt",r.Prompt,"--seconds","20","--seed","0"}
 case taskRVC:
  if err:=requireDirectory(r.Engine);err!=nil{return jobSpec{},err}
  if err:=requireDirectory(r.Input);err!=nil{return jobSpec{},err}
  if err:=requireDirectory(filepath.Join(r.Input,"audio"));err!=nil{return jobSpec{},errors.New("데이터셋 폴더 아래 audio 폴더가 필요합니다")}
  if strings.ToLower(filepath.Ext(r.Output))!=".pth"{return jobSpec{},errors.New("RVC 출력 파일은 .pth여야 합니다")}
  if err:=preventOverwrite(strings.TrimSuffix(r.Output,filepath.Ext(r.Output))+".index");err!=nil{return jobSpec{},err}
  epochs,err:=strconv.Atoi(strings.TrimSpace(r.Option));if err!=nil||epochs<1||epochs>1000{return jobSpec{},errors.New("학습 epochs: 1~1000")}
  script="rvc_official_worker.py"
  args=[]string{"--root",r.Engine,"--dataset",r.Input,"--output",r.Output,"--epochs",strconv.Itoa(epochs)}
 case taskDemucs:
  if err:=requireDirectory(r.Engine);err!=nil{return jobSpec{},err}
  if err:=requireExistingFile(r.Input);err!=nil{return jobSpec{},err}
  if err:=requireDirectory(r.Output);err!=nil{return jobSpec{},err}
  model:=strings.TrimSpace(r.Option);if model==""{model="htdemucs"}
  if len(model)>50||strings.Trim(model,"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-")!=""{return jobSpec{},errors.New("Demucs 모델 이름 오류")}
  if _,err:=os.Lstat(filepath.Join(r.Output,model));err==nil{return jobSpec{},errors.New("출력 폴더에 같은 모델의 결과가 이미 있습니다. 새 폴더를 지정하세요")}
  script="music_stems_worker.py"
  args=[]string{"--repo",r.Engine,"--input",r.Input,"--out",r.Output,"--model",model}
 case taskScoreVocal:
  if err:=requireExistingFile(r.Input);err!=nil{return jobSpec{},err}
  if err:=requireExistingFile(r.Auxiliary);err!=nil{return jobSpec{},err}
  interval,err:=strconv.Atoi(strings.TrimSpace(r.Option))
  if err!=nil||interval< -24||interval>24{return jobSpec{},errors.New("반음 보정은 -24~24입니다")}
  script="score_vocal_worker.py"
  args=[]string{"--input",r.Input,"--score",r.Auxiliary,"--output",r.Output,"--interval",strconv.Itoa(interval)}
 case taskRVCConvert:
  if err:=requireDirectory(r.Engine);err!=nil{return jobSpec{},err}
  if err:=requireExistingFile(filepath.Join(r.Engine,"infer","cli.py"));err!=nil{return jobSpec{},errors.New("설치된 RVC infer/cli.py가 없습니다")}
  if err:=requireExistingFile(r.Input);err!=nil{return jobSpec{},err}
  if err:=requireExistingFile(r.Auxiliary);err!=nil{return jobSpec{},err}
  if strings.ToLower(filepath.Ext(r.Auxiliary))!=".pth"{return jobSpec{},errors.New("훈련된 RVC 모델은 .pth여야 합니다")}
  pitch,err:=strconv.Atoi(strings.TrimSpace(r.Option));if err!=nil||pitch< -24||pitch>24{return jobSpec{},errors.New("RVC 음정은 -24~24입니다")}
  rate:="0"
  if r.Prompt!=""{if err:=requireExistingFile(r.Prompt);err!=nil{return jobSpec{},err};if filepath.Ext(r.Prompt)!=".index"{return jobSpec{},errors.New("인덱스 확장자는 .index여야 합니다")};rate="0.5"}
  args=[]string{"infer/cli.py","--model",r.Auxiliary,"--input",r.Input,"--output",r.Output,"--pitch",strconv.Itoa(pitch),"--f0-method","pm","--index-rate",rate}
  if r.Prompt!=""{args=append(args,"--index",r.Prompt)}
  return jobSpec{exe:r.Python,args:args,output:r.Output,cwd:r.Engine},nil
 case taskDiffSinger:
  if err:=requireDirectory(r.Engine);err!=nil{return jobSpec{},err}
  if err:=requireExistingFile(filepath.Join(r.Engine,"scripts","infer.py"));err!=nil{return jobSpec{},errors.New("DiffSinger scripts/infer.py가 없습니다")}
  if err:=requireExistingFile(r.Input);err!=nil{return jobSpec{},err}
  if r.Prompt!="confirmed"{return jobSpec{},errors.New("사용 권리가 확인된 자료만 이용하세요. 권리 확인 칸에 confirmed 입력")}
  experiment:=strings.TrimSpace(r.Auxiliary)
  if experiment==""||len(experiment)>80||strings.Trim(experiment,"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-")!=""{return jobSpec{},errors.New("DiffSinger 학습 실험 이름이 올바르지 않습니다")}
  if err:=requireDirectory(filepath.Join(r.Engine,"checkpoints",experiment));err!=nil{return jobSpec{},errors.New("실제 학습 체크포인트 폴더가 없습니다")}
  buf,err:=os.ReadFile(r.Input);if err!=nil||len(buf)>(4<<20){return jobSpec{},errors.New("DiffSinger 악보 파일이 없거나 너무 큽니다")}
  var segments []map[string]interface{}
  if json.Unmarshal(buf,&segments)!=nil||len(segments)<1||len(segments)>60{return jobSpec{},errors.New("DiffSinger 악보는 1~60개 구간 JSON 배열이어야 합니다")}
  for _,seg:=range segments{for _,key:=range []string{"offset","ph_seq","ph_dur","f0_seq","f0_timestep"}{if _,ok:=seg[key];!ok{return jobSpec{},fmt.Errorf("DiffSinger 구간에 %s 필드가 없습니다",key)}}}
  args=[]string{filepath.Join(r.Engine,"scripts","infer.py"),"acoustic",r.Input,"--exp",experiment,"--out",filepath.Dir(r.Output),"--title","MYVOCAL-Neural-Singing"}
  return jobSpec{exe:r.Python,args:args,output:r.Output,cwd:r.Engine},nil
 case taskLipSync:
  if err:=requireExistingFile(r.Engine);err!=nil{return jobSpec{},fmt.Errorf("캐릭터 이미지: %w",err)}
  if err:=requireExistingFile(r.Input);err!=nil{return jobSpec{},fmt.Errorf("가창 WAV: %w",err)}
  if err:=requireExistingFile(r.Auxiliary);err!=nil{return jobSpec{},fmt.Errorf("음소 싱크 JSON: %w",err)}
  if err:=requireExistingFile(r.Option);err!=nil{return jobSpec{},fmt.Errorf("FFmpeg: %w",err)}
  script="viseme_2d_worker.py"
  args=[]string{"--image",r.Engine,"--audio",r.Input,"--alignment",r.Auxiliary,"--output",r.Output,"--ffmpeg",r.Option}
 }
 worker,err:=locateWorker(script);if err!=nil{return jobSpec{},fmt.Errorf("기존 엔진 스크립트가 EXE 옆에 없습니다: %w",err)}
 return jobSpec{exe:r.Python,args:append([]string{worker},args...),output:r.Output},nil
}

func executeJob(ctx context.Context,r request,logLine func(string))error{
 job,err:=prepareRequest(r);if err!=nil{return err}
 if r.Task==taskLongMusicGen{return runLongMusicGen(ctx,r,job,logLine)}
 if r.Task==taskMixWAV{return mixNativePCM(ctx,r,logLine)}
 // Existing MusicGen worker uses wb; generate in scratch and publish new WAV exclusively.
 if r.Task==taskMusicGen||r.Task==taskRVCConvert||r.Task==taskDiffSinger{
  dir,e:=os.MkdirTemp("","myvocal-native-musicgen-");if e!=nil{return e}
  defer os.RemoveAll(dir)
  scratch:=filepath.Join(dir,"generated.wav")
  if r.Task==taskDiffSinger{scratch=filepath.Join(dir,"MYVOCAL-Neural-Singing.wav")}
  for i:=0;i<len(job.args)-1;i++{if job.args[i]=="--output"{job.args[i+1]=scratch;break};if job.args[i]=="--out"{job.args[i+1]=dir;break}}
  if err=runProcess(ctx,job,logLine);err!=nil{return err}
  if err=requireExistingFile(scratch);err!=nil{return fmt.Errorf("MusicGen WAV 출력이 없습니다: %w",err)}
  wav,err:=os.Open(scratch);if err!=nil{return err};defer wav.Close()
  header:=make([]byte,12)
  if _,err=io.ReadFull(wav,header);err!=nil||!bytes.Equal(header[:4],[]byte("RIFF"))||!bytes.Equal(header[8:],[]byte("WAVE")){return errors.New("MusicGen WAV 헤더가 올바르지 않습니다")}
  if _,err=wav.Seek(0,io.SeekStart);err!=nil{return err}
  output,err:=os.OpenFile(r.Output,os.O_WRONLY|os.O_CREATE|os.O_EXCL,0600)
  if err!=nil{return fmt.Errorf("기존 파일 보존을 위해 저장을 중단했습니다: %w",err)}
  n,copyErr:=io.Copy(output,wav);closeErr:=output.Close()
  if copyErr!=nil||closeErr!=nil||n<=44{return errors.New("새 WAV 저장에 실패했습니다. 원본 WAV는 건드리지 않았습니다")}
  logLine("\r\n실제 WAV 저장: "+r.Output+"\r\n")
  return nil
 }
 if err=runProcess(ctx,job,logLine);err!=nil{return err}
 if r.Task==taskDemucs{return nil}
 if err:=requireExistingFile(r.Output);err!=nil{return fmt.Errorf("완료 메시지가 있었으나 출력 파일이 없습니다: %w",err)}
 stat,_:=os.Stat(r.Output);if stat.Size()==0{return errors.New("출력 파일 크기가 0입니다")}
 logLine("\r\n실제 출력 파일 생성: "+r.Output+"\r\n")
 return nil
}
func runProcess(ctx context.Context,job jobSpec,logLine func(string))error{
 cmd:=exec.CommandContext(ctx,job.exe,job.args...)
 if job.cwd!=""{cmd.Dir=job.cwd}
 cmd.Env=append(os.Environ(),"HF_HUB_OFFLINE=1","TRANSFORMERS_OFFLINE=1","HF_DATASETS_OFFLINE=1")
 streamR,streamW:=io.Pipe();cmd.Stdout=streamW;cmd.Stderr=streamW
 done:=make(chan struct{})
 go func(){defer close(done);buf:=make([]byte,4096);for{n,e:=streamR.Read(buf);if n>0{logLine(string(buf[:n]))};if e!=nil{return}}}()
 err:=cmd.Run();streamW.Close();<-done;streamR.Close()
 if ctx.Err()!=nil{return errors.New("사용자가 작업을 취소했습니다")}
 if err!=nil{return fmt.Errorf("로컬 엔진 실행 실패: %w",err)}
 return nil
}
