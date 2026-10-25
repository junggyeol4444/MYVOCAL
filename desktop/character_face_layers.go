package main

// 원본 28항: 기존 Windows EXE가 직접 실행하는 로컬 2D 얼굴 특징점 검출.
// 기존 사용자 원본 이미지는 읽기만 하며, 모델을 자동 설치/다운로드하지 않는다.
import (
 "bytes"
 "context"
 _ "embed"
 "encoding/json"
 "math"
 "net/http"
 "os"
 "os/exec"
 "path/filepath"
 "runtime"
 "strings"
 "time"
)

//go:embed character_face_layers_worker.py
var embeddedFaceLayersWorker []byte

const maxFaceLayerImageBytes int64 = 40 << 20
var faceLayerJobSlot = make(chan struct{},1)
type faceLayerRect struct {
 X int `json:"x"`
 Y int `json:"y"`
 W int `json:"w"`
 H int `json:"h"`
 PivotX float64 `json:"pivotX"`
 PivotY float64 `json:"pivotY"`
 Enabled bool `json:"enabled"`
}
type faceLayerResponse struct {
 Format string `json:"format"`
 Version int `json:"version"`
 Source string `json:"source"`
 Width int `json:"width"`
 Height int `json:"height"`
 Parts map[string]faceLayerRect `json:"parts"`
 Notice string `json:"notice"`
}
func (a *appServer) faceLayerLandmarks28(w http.ResponseWriter, r *http.Request) {
 if r.Method!=http.MethodPost {jsonError(w,405,"등록한 2D 캐릭터 그림의 POST 요청만 가능합니다");return}
 if !a.authorizeSinging(w,r){return}
 select {case faceLayerJobSlot<-struct{}{}:defer func(){<-faceLayerJobSlot}();default:jsonError(w,409,"이미 다른 2D 캐릭터 얼굴 분석이 진행 중입니다");return}
 r.Body=http.MaxBytesReader(w,r.Body,maxFaceLayerImageBytes+(2<<20))
 if err:=r.ParseMultipartForm(1<<20);err!=nil{jsonError(w,400,"얼굴 분석 요청 크기 또는 형식 오류");return}
 if r.MultipartForm!=nil{defer r.MultipartForm.RemoveAll()}
 if r.FormValue("rights")!="confirmed"{
  jsonError(w,403,"본인 제작 또는 허가받은 2D 캐릭터 그림이어야 합니다");return
 }
 python,model:=r.FormValue("python"),r.FormValue("model")
 if !filepath.IsAbs(python)||!filepath.IsAbs(model)||len(python)>1024||len(model)>1024||
  strings.ContainsAny(python+model,"\x00\r\n")||!strings.EqualFold(filepath.Ext(model),".task") {
  jsonError(w,400,"설치된 Python.exe와 FaceLandmarker .task 모델의 절대 경로를 입력하세요");return
 }
 if runtime.GOOS=="windows"&&!strings.EqualFold(filepath.Base(python),"python.exe") {
  jsonError(w,400,"Windows Python.exe가 필요합니다");return
 }
 if ensureRegular(python)!=nil||ensureRegular(model)!=nil{
  jsonError(w,400,"실제 설치된 Python 또는 FaceLandmarker 모델 파일이 없습니다");return
 }
 images:=r.MultipartForm.File["image"]
 if len(images)!=1||images[0].Size<1024||images[0].Size>maxFaceLayerImageBytes{
  jsonError(w,400,"2D 캐릭터 원본 그림 파일 하나(40MB 이하)가 필요합니다");return
 }
 ext:=strings.ToLower(filepath.Ext(images[0].Filename))
 if ext!=".png"&&ext!=".jpg"&&ext!=".jpeg"&&ext!=".webp"{
  jsonError(w,400,"PNG/JPEG/WebP 2D 캐릭터 이미지만 분석합니다");return
 }
 dir,err:=os.MkdirTemp("","myvocal-face-layers28-")
 if err!=nil{jsonError(w,500,"로컬 얼굴 분석 임시 폴더를 만들지 못했습니다");return}
 defer os.RemoveAll(dir)
 input:=filepath.Join(dir,"character"+ext)
 worker:=filepath.Join(dir,"face_worker.py")
 if err=stageRegisteredRVCUpload(images[0],input,maxFaceLayerImageBytes);err!=nil{
  jsonError(w,422,"사용자 그림의 읽기 전용 사본 준비 실패");return
 }
 if err=os.WriteFile(worker,embeddedFaceLayersWorker,0600);err!=nil{
  jsonError(w,500,"내장 2D 얼굴 특징점 모델 실행 코드 준비 실패");return
 }
 ctx,cancel:=context.WithTimeout(r.Context(),2*time.Minute);defer cancel()
 command:=exec.CommandContext(ctx,python,"-I",worker,"--image",input,"--model",model)
 command.Dir=dir;command.Stdin=nil
 var stdout,stderr bytes.Buffer
 command.Stdout=&limitedRVCLog{buffer:&stdout,max:1<<20}
 command.Stderr=&limitedRVCLog{buffer:&stderr,max:1200}
 if err=command.Run();err!=nil{
  if ctx.Err()!=nil{jsonError(w,504,"2D 얼굴 특징점 추론 취소 또는 시간 초과");return}
  jsonError(w,502,"실제 로컬 2D 얼굴 특징점 분석 실패: "+stderr.String());return
 }
 var result faceLayerResponse
 if json.Unmarshal(stdout.Bytes(),&result)!=nil||
  result.Format!="MYVOCAL_FACE_LANDMARK_LAYERS28"||result.Version!=1||
  result.Source!="installed-local-mediapipe-face-landmarker-task"||
  result.Width<1||result.Height<1||result.Width>4096||result.Height>4096||
  result.Width*result.Height>12000000||len(result.Parts)!=4{
  jsonError(w,502,"실제 로컬 모델의 얼굴·눈·입 특징점 응답 형식 오류");return
 }
 for _,name:=range []string{"face","leftEye","rightEye","mouth"}{
  rect,ok:=result.Parts[name]
  if !ok||rect.X<0||rect.Y<0||rect.W<1||rect.H<1||
    rect.X+rect.W>result.Width||rect.Y+rect.H>result.Height||
    math.IsNaN(rect.PivotX)||math.IsInf(rect.PivotX,0)||rect.PivotX<0||rect.PivotX>1||
    math.IsNaN(rect.PivotY)||math.IsInf(rect.PivotY,0)||rect.PivotY<0||rect.PivotY>1||
    !rect.Enabled{
   jsonError(w,502,"실제 얼굴 특징점의 2D 영역이 캐릭터 이미지 범위를 벗어났습니다");return
  }
 }
 w.Header().Set("Content-Type","application/json; charset=utf-8")
 w.Header().Set("Cache-Control","no-store")
 w.Header().Set("X-Content-Type-Options","nosniff")
 _,_=w.Write(stdout.Bytes())
}
