package main

// MYVOCAL original requirements #6/#8: run the actual locally installed
// openvpi DiffSinger acoustic training pipeline, with a new per-job experiment.
// Each training job gets its own YAML, WAV copies, pronunciation dictionary,
// binary data and checkpoints. No existing voice or project assets are replaced.
import (
 "context"
 "encoding/json"
 "errors"
 "fmt"
 "io"
 "os"
 "os/exec"
 "path/filepath"
 "regexp"
 "runtime"
 "strconv"
 "strings"
)

var regexpDiffSingerJobID = regexp.MustCompile("^[0-9a-f]{24}$")

func validateOfficialDiffSinger(root, python, config string) error {
 for _,p := range []string{root,python,config} {
  if !filepath.IsAbs(p)||len(p)>2048||strings.ContainsAny(p,"\x00\r\n"){
   return errors.New("DiffSinger 원본 폴더, Python.exe, acoustic YAML 절대 경로를 확인하세요")
  }
 }
 if runtime.GOOS=="windows"&&!strings.EqualFold(filepath.Base(python),"python.exe"){
  return errors.New("Windows에 설치된 Python.exe를 선택하세요")
 }
 extension:=strings.ToLower(filepath.Ext(config))
 if extension!=".yaml"&&extension!=".yml"{
  return errors.New("공식 Acoustic 설정 파일은 .yaml 또는 .yml이어야 합니다")
 }
 relative,err:=filepath.Rel(root,config)
 if err!=nil||relative=="."||relative==".."||strings.HasPrefix(relative,".."+string(filepath.Separator)){
  return errors.New("공식 Acoustic YAML은 설치된 DiffSinger 폴더 안에 있어야 합니다")
 }
 for _,p:=range []string{python,config,filepath.Join(root,"scripts","binarize.py"),filepath.Join(root,"scripts","train.py")} {
  if err:=ensureRegular(p);err!=nil{
   return fmt.Errorf("공식 DiffSinger 설치 파일이 없습니다 (%s): %w",filepath.Base(p),err)
  }
 }
 info,err:=os.Stat(root)
 if err!=nil||!info.IsDir(){return errors.New("DiffSinger 설치 원본 폴더가 없습니다")}
 return nil
}

func yamlQuotedPath(path string)(string,error){
 if !filepath.IsAbs(path)||len(path)>2048||strings.ContainsAny(path,"\x00\r\n"){
  return "",errors.New("DiffSinger 학습 경로는 안전한 절대 경로여야 합니다")
 }
 encoded,err:=json.Marshal(filepath.Clean(path))
 if err!=nil{return "",err}
 return string(encoded),nil
}

// The official AcousticBinarizer consumes hparams['datasets'] with
// raw_data_dir/wavs/*.wav and raw_data_dir/transcriptions.csv and a
// dictionary keyed by language. It does not consume a top-level raw_data_dir
// hparam. Build a new overlay config without changing the installed YAML.
// A single test sample is held out: never claim a one-take corpus was trained.
func prepareOfficialDiffSingerConfig(config,dataset,jobDir string,sampleCount int)(string,error){
 if sampleCount<2||sampleCount>60{
  return "",errors.New("공식 Acoustic 학습에는 서로 다른 가창 WAV 최소 2개가 필요합니다")
 }
 dict:=filepath.Join(dataset,"dictionary.txt")
 for _,path:=range []string{dict,filepath.Join(dataset,"transcriptions.csv"),
   filepath.Join(dataset,"wavs","take-001.wav")} {
  if err:=ensureRegular(path);err!=nil{return "",fmt.Errorf("공식 DiffSinger 학습 자료가 빠졌습니다: %w",err)}
 }
 binary:=filepath.Join(jobDir,"binarized")
 if err:=os.Mkdir(binary,0700);err!=nil{return "",err}
 quoted:=make([]string,0,4)
 for _,path:=range []string{config,dict,dataset,binary}{
  value,err:=yamlQuotedPath(path)
  if err!=nil{return "",err}
  quoted=append(quoted,value)
 }
 // JSON strings are valid YAML scalars; escaping Windows backslashes avoids
 // accidental YAML escape sequences and preserves Korean user directory names.
 text:="base_config:\n  - "+quoted[0]+
  "\ndictionaries:\n  ko: "+quoted[1]+
  "\nextra_phonemes:\n  - SP"+
  "\ndatasets:\n  - raw_data_dir: "+quoted[2]+
  "\n    speaker: MYVOCAL\n    spk_id: 0\n    language: ko"+
  "\n    test_prefixes:\n      - take-001"+
  "\nbinary_data_dir: "+quoted[3]+"\n"
 // Every output is exclusive new. No source config, user audio, or checkpoint
 // is changed or deleted on unsuccessful training.
 output:=filepath.Join(jobDir,"myvocal-acoustic.yaml")
 if err:=os.WriteFile(output,[]byte(text),0600);err!=nil{return "",err}
 return output,nil
}

func runOfficialDiffSingerTraining(ctx context.Context,root,python,config,dataset,output,id string,sampleCount int,logs io.Writer)(string,error){
 if err:=validateOfficialDiffSinger(root,python,config);err!=nil{return "",err}
 if !regexpDiffSingerJobID.MatchString(id){return "",errors.New("신규 DiffSinger 학습 ID 오류")}
 jobDir:=filepath.Dir(dataset)
 newConfig,err:=prepareOfficialDiffSingerConfig(config,dataset,jobDir,sampleCount)
 if err!=nil{return "",err}
 experiment:="myvocal-"+id
 checkpointBase:=filepath.Join(root,"checkpoints")
 if err:=os.MkdirAll(checkpointBase,0700);err!=nil{return "",err}
 checkpointDir:=filepath.Join(checkpointBase,experiment)
 if err:=os.Mkdir(checkpointDir,0700);err!=nil{
  if os.IsExist(err){return "",errors.New("이미 동일한 실험이 있으므로 원본을 보존하고 학습을 중단합니다")}
  return "",err
 }
 run:=func(script string,argv ...string)error{
  args:=append([]string{filepath.Join(root,"scripts",script)},argv...)
  cmd:=exec.CommandContext(ctx,python,args...)
  cmd.Dir=root;cmd.Stdin=nil
  cmd.Env=append(os.Environ(),
   "HF_HUB_OFFLINE=1","TRANSFORMERS_OFFLINE=1","HF_HUB_DISABLE_TELEMETRY=1",
   "PYTHONPATH="+root)
  cmd.Stdout=logs;cmd.Stderr=logs
  if runtime.GOOS=="windows"{
   cmd.Cancel=func()error{
    if cmd.Process==nil{return os.ErrProcessDone}
    kill:=exec.Command("taskkill","/PID",strconv.Itoa(cmd.Process.Pid),"/T","/F")
    if e:=kill.Run();e!=nil{return cmd.Process.Kill()}
    return nil
   }
  }
  if err:=cmd.Run();err!=nil{
   if ctx.Err()!=nil{return errors.New("DiffSinger 학습을 취소했거나 실행 시간 제한에 도달했습니다")}
   return fmt.Errorf("로컬 DiffSinger %s 실행 실패: %w",script,err)
  }
  return nil
 }
 if _,err:=fmt.Fprintln(logs,"[MYVOCAL] 실제 가창 데이터 Acoustic 이진화 시작");err!=nil{return "",err}
 if err:=run("binarize.py","--config",newConfig);err!=nil{return "",err}
 if _,err:=fmt.Fprintln(logs,"[MYVOCAL] 생성된 한국어 Acoustic 데이터 신경망 학습 시작");err!=nil{return "",err}
 if err:=run("train.py","--config",newConfig,"--exp_name",experiment);err!=nil{return "",err}
 checkpoint,err:=diffSingerCheckpointIn(checkpointDir)
 if err!=nil{return "",fmt.Errorf("실제 Acoustic 학습이 신규 체크포인트를 생성하지 못했습니다: %w",err)}
 return checkpoint,nil
}
