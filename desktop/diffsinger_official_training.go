package main

// MYVOCAL 원본 #06/#08: 설치된 openvpi DiffSinger의 공식
// binarize.py → train.py 순서를 실제로 실행한다.
// 입력은 MYVOCAL의 본인 노래 녹음 복사본이며, 기존 실험 폴더와 가중치는
// 절대 덮어쓰지 않고 새 UUID 실험을 생성한다. 다운로드/API/가짜 모델 없음.
import (
 "context"
 "errors"
 "fmt"
 "io"
 "os"
 "os/exec"
 "path/filepath"
 "runtime"
 "strconv"
 "strings"
)

func validateOfficialDiffSinger(root,python,config string) error {
 for _,p:=range []string{root,python,config} {
  if !filepath.IsAbs(p)||len(p)>2048||strings.ContainsAny(p,",=\x00\r\n"){
   return errors.New("공식 학습은 쉼표·등호가 없는 설치 폴더/Python.exe/YAML 절대 경로를 사용하세요")
  }
 }
 if runtime.GOOS=="windows"&&!strings.EqualFold(filepath.Base(python),"python.exe"){
  return errors.New("Windows Python.exe 경로를 입력하세요")
 }
 if filepath.Ext(config)!=".yaml"&&filepath.Ext(config)!=".yml"{
  return errors.New("현재 DiffSinger 모델의 실제 학습 설정 YAML이 필요합니다")
 }
 relative,err:=filepath.Rel(root,config)
 if err!=nil||relative=="."||relative==".."||strings.HasPrefix(relative,".."+string(filepath.Separator)){
  return errors.New("설치된 DiffSinger 원본 폴더 안의 YAML 설정만 사용하세요")
 }
 for _,file:=range []string{python,config,
  filepath.Join(root,"scripts","binarize.py"),filepath.Join(root,"scripts","train.py")} {
  if err:=ensureRegular(file);err!=nil {
   return fmt.Errorf("실제 DiffSinger 설치 파일이 없습니다 (%s): %w",filepath.Base(file),err)
  }
 }
 info,err:=os.Stat(root)
 if err!=nil||!info.IsDir(){return errors.New("공식 DiffSinger 설치 폴더가 없습니다")}
 return nil
}
func safeDiffSingerHparamPath(path string)error {
 if !filepath.IsAbs(path)||strings.ContainsAny(path,",=\x00\r\n'\"") {
  return errors.New("공식 DiffSinger 데이터 절대 경로에 허용하지 않는 기호가 포함됐습니다")
 }
 return nil
}
func runOfficialDiffSingerTraining(ctx context.Context,root,python,config,dataset,output,id string,logs io.Writer)(string,error){
 if err:=validateOfficialDiffSinger(root,python,config);err!=nil{return "",err}
 binary:=filepath.Join(filepath.Dir(dataset),"binarized")
 for _,path:=range []string{dataset,binary,output}{
  if err:=safeDiffSingerHparamPath(path);err!=nil{return "",err}
 }
 if !regexpDiffSingerJobID.MatchString(id){return "",errors.New("DiffSinger 학습 작업 ID 오류")}
 experiment:="myvocal-"+id
 checkpointFolder:=filepath.Join(root,"checkpoints",experiment)
 // 선행 출력 폴더가 있으면 절대로 기존 실험을 열거나 재사용하지 않는다.
 if err:=os.Mkdir(filepath.Join(root,"checkpoints"),0700);err!=nil&&!os.IsExist(err){
  return "",err
 }
 if _,err:=os.Stat(checkpointFolder);err==nil {
  return "",errors.New("동일 이름의 기존 체크포인트가 있어 새 학습을 거절했습니다")
 }else if !os.IsNotExist(err){return "",err}
 // 예약만 생성: 무조건 새 디렉터리. 어떤 기존 체크포인트에도 --reset 사용 금지.
 if err:=os.Mkdir(checkpointFolder,0700);err!=nil{return "",err}
 if err:=os.MkdirAll(binary,0700);err!=nil{return "",err}
 // 공식 hparams.py에서 raw_data_dir, binary_data_dir은 원래 YAML 타입을 유지하며,
 // 작업별 격리 경로만 바꾼다. 리스트형 raw_data_dir에는 이 프리셋 대신 사용자 지정 경로가 필요하다.
 overrides:="raw_data_dir="+dataset+",binary_data_dir="+binary
 run:=func(script string,argv ...string)error{
  args:=append([]string{filepath.Join(root,"scripts",script)},argv...)
  command:=exec.CommandContext(ctx,python,args...)
  command.Dir=root;command.Stdin=nil
  command.Env=append(os.Environ(),
   "HF_HUB_OFFLINE=1","TRANSFORMERS_OFFLINE=1","HF_HUB_DISABLE_TELEMETRY=1",
   "PYTHONPATH="+root)
  command.Stdout=logs;command.Stderr=logs
  if runtime.GOOS=="windows"{
   command.Cancel=func()error{
    if command.Process==nil{return os.ErrProcessDone}
    kill:=exec.Command("taskkill","/PID",strconv.Itoa(command.Process.Pid),"/T","/F")
    if e:=kill.Run();e!=nil{return command.Process.Kill()}
    return nil
   }
  }
  if err:=command.Run();err!=nil{
   if ctx.Err()!=nil{return errors.New("신경망 학습이 취소되거나 12시간 제한에 도달했습니다")}
   return fmt.Errorf("설치된 DiffSinger %s 실제 실행 실패: %w",script,err)
  }
  return nil
 }
 if _,err:=fmt.Fprintln(logs,"MYVOCAL 공식 DiffSinger: 실제 노래 데이터 이진화 시작");err!=nil{return "",err}
 if err:=run("binarize.py","--config",config,"--hparams",overrides);err!=nil{return "",err}
 if _,err:=fmt.Fprintln(logs,"MYVOCAL 공식 DiffSinger: acoustic 신경망 학습 시작");err!=nil{return "",err}
 if err:=run("train.py","--config",config,"--exp_name",experiment,"--hparams",overrides);err!=nil{return "",err}
 checkpoint,err:=diffSingerCheckpointIn(checkpointFolder)
 if err!=nil{return "",fmt.Errorf("학습 후 신규 acoustic 가중치가 없습니다: %w",err)}
 return checkpoint,nil
}
