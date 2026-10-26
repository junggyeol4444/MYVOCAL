package main

// #48/#49: after a real local training job has produced .safetensors,
// install only THAT completed model into the explicitly selected local
// ComfyUI models/loras directory. Never overwrite any preexisting file.
import (
 "encoding/json"
 "errors"
 "fmt"
 "io"
 "net/http"
 "os"
 "path/filepath"
 "strings"
)

type characterLoRAInstallRequest struct {
 JobID string `json:"jobId"`
 ComfyRoot string `json:"comfyRoot"`
 Confirm bool `json:"confirm"`
}
func(a *appServer)characterTrainInstall(w http.ResponseWriter,r *http.Request){
 if r.Method!=http.MethodPost{jsonError(w,405,"POST만 허용합니다");return}
 if !a.authorizeSinging(w,r){return}
 r.Body=http.MaxBytesReader(w,r.Body,8<<10)
 var x characterLoRAInstallRequest
 decoder:=json.NewDecoder(r.Body);decoder.DisallowUnknownFields()
 if err:=decoder.Decode(&x);err!=nil{jsonError(w,400,"ComfyUI LoRA 설치 요청 오류");return}
 if !x.Confirm{jsonError(w,403,"로컬 ComfyUI의 신규 모델 추가에 명시적으로 동의해야 합니다");return}
 if !characterTrainID.MatchString(x.JobID)||!filepath.IsAbs(x.ComfyRoot)||
  len(x.ComfyRoot)>2048||strings.ContainsAny(x.ComfyRoot,"\x00\r\n"){
  jsonError(w,400,"완료된 LoRA 학습과 ComfyUI 실제 설치 폴더가 필요합니다");return
 }
 j:=&a.characterTraining
 j.mu.Lock()
 jobID,state,output:=j.id,j.state,j.output
 j.mu.Unlock()
 if jobID!=x.JobID||state!="completed"||output==""{
  jsonError(w,409,"완료된 본인·캐릭터 LoRA 가중치 파일이 없습니다");return
 }
 base:=filepath.Clean(x.ComfyRoot)
 for _,entry:=range []string{base,filepath.Join(base,"models"),filepath.Join(base,"models","loras")}{
  info,err:=os.Lstat(entry)
  if err!=nil||!info.IsDir(){jsonError(w,400,"설치된 ComfyUI models/loras 디렉터리가 없습니다");return}
 }
 targetDir:=filepath.Join(base,"models","loras")
 fileName:="MYVOCAL_Identity_"+jobID+".safetensors"
 target:=filepath.Join(targetDir,fileName)
 src,err:=os.Open(output)
 if err!=nil{jsonError(w,404,"실제 학습 가중치를 읽을 수 없습니다");return}
 defer src.Close()
 info,err:=src.Stat()
 if err!=nil||!info.Mode().IsRegular()||info.Size()<4096||info.Size()>characterTrainModelLimit{
  jsonError(w,422,"실제 LoRA 가중치 크기 오류");return
 }
 dest,err:=os.OpenFile(target,os.O_CREATE|os.O_EXCL|os.O_WRONLY,0600)
 if err!=nil{
  if errors.Is(err,os.ErrExist){jsonError(w,409,"동일한 이름의 기존 LoRA가 있어 덮어쓰지 않았습니다");return}
  jsonError(w,500,"신규 ComfyUI LoRA 파일 생성 실패: "+err.Error());return
 }
 written,cpErr:=io.Copy(dest,io.LimitReader(src,characterTrainModelLimit+1))
 syncErr:=dest.Sync()
 closeErr:=dest.Close()
 if cpErr!=nil||syncErr!=nil||closeErr!=nil||written!=info.Size(){
  // The exclusive file did not exist before this request, and its incomplete
  // bytes must not be exposed to ComfyUI as a usable trained checkpoint.
  _=os.Remove(target)
  jsonError(w,500,"새 LoRA 복사 중 오류가 발생해 원본은 유지했습니다");return
 }
 jsonReply(w,map[string]any{"installed":true,"jobId":jobID,
  "loraName":fileName,"bytes":written,
  "message":fmt.Sprintf("ComfyUI 로컬 models/loras에 새 LoRA %s 추가. 추론 및 얼굴·캐릭터 일관성은 미검증",fileName)})
}
