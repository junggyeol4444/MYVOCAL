package main

// The user must install RVC and supply their own permitted .pth model.
// We execute RVC's documented offline infer/cli.py, not a synthesizer demo.
// No models are downloaded, user media is never overwritten, and no shell is used.
import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"mime/multipart"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const maxRVCInputBytes = 24 << 20
const maxRVCResponseBytes = 48 << 20
const maxRVCRequestBytes = maxRVCInputBytes + (1 << 20)
const maxRegisteredRVCRequestBytes = maxRVCInputBytes + maxRVCTrainedModel + (96 << 20) + (2 << 20)

var rvcSlot = make(chan struct{}, 1)

type rvcOptions struct {
	Python    string
	Root      string
	Model     string
	Index     string
	F0        string
	Pitch     int
	IndexRate float64
}

type rvcRunner func(ctx context.Context, options rvcOptions, inputPath, outputPath string) error

func ensureRegular(path string) error {
	stat, err := os.Stat(path)
	if err != nil || !stat.Mode().IsRegular() {
		return errors.New("필요한 로컬 파일이 존재하지 않습니다")
	}
	return nil
}
func validateRVCOptions(o rvcOptions) error {
	if !filepath.IsAbs(o.Root) || !filepath.IsAbs(o.Python) || !filepath.IsAbs(o.Model) {
		return errors.New("RVC 설치 폴더·Python·모델은 모두 절대 경로여야 합니다")
	}
	if len(o.Root) > 1024 || len(o.Python) > 1024 || len(o.Model) > 1024 ||
		strings.ContainsAny(o.Root+o.Python+o.Model, "\x00\r\n") {
		return errors.New("RVC 경로 길이 또는 내용이 올바르지 않습니다")
	}
	if runtime.GOOS == "windows" && !strings.EqualFold(filepath.Base(o.Python), "python.exe") {
		return errors.New("Python 실행 파일은 python.exe여야 합니다")
	}
	if err := ensureRegular(o.Python); err != nil {
		return fmt.Errorf("Python 실행 파일: %w", err)
	}
	if err := ensureRegular(filepath.Join(o.Root, "infer", "cli.py")); err != nil {
		return fmt.Errorf("RVC 공식 CLI: %w", err)
	}
	if !strings.EqualFold(filepath.Ext(o.Model), ".pth") {
		return errors.New("RVC 음색 모델은 .pth 파일이어야 합니다")
	}
	if err := ensureRegular(o.Model); err != nil {
		return fmt.Errorf("RVC 체크포인트: %w", err)
	}
	if o.Index != "" {
		if !filepath.IsAbs(o.Index) || len(o.Index)>1024 || strings.ContainsAny(o.Index,"\x00\r\n") || !strings.EqualFold(filepath.Ext(o.Index),".index") {return errors.New("FAISS 인덱스는 .index 절대 경로여야 합니다")}
		if !plausibleRVCIndex(o.Index) {return errors.New("FAISS 인덱스 파일이 손상됐거나 존재하지 않습니다")}
	}
	if o.IndexRate>0 && o.Index=="" {return errors.New("FAISS 인덱스 적용 비율을 사용하려면 인덱스 파일이 필요합니다")}
	if o.Pitch < -24 || o.Pitch > 24 || math.IsNaN(o.IndexRate) || math.IsInf(o.IndexRate, 0) || o.IndexRate < 0 || o.IndexRate > 1 || (o.F0 != "rmvpe" && o.F0 != "pm") {
		return errors.New("RVC 피치·인덱스 비율·F0 옵션 범위가 올바르지 않습니다")
	}
	return nil
}
func runRVC(ctx context.Context, o rvcOptions, inputPath, outputPath string) error {
	args := []string{"infer/cli.py", "--model", o.Model, "--input", inputPath, "--output", outputPath,
		"--pitch", strconv.Itoa(o.Pitch), "--f0-method", o.F0, "--index-rate", strconv.FormatFloat(o.IndexRate, 'f', 2, 64)}
	if o.Index!="" {args=append(args,"--index",o.Index)}
	cmd := exec.CommandContext(ctx, o.Python, args...)
	cmd.Dir = o.Root
	cmd.Stdin = nil
	// Avoid dumping a user's data or paths into the GUI. Keep a bounded error tail.
	var log bytes.Buffer
	cmd.Stdout = &limitedRVCLog{buffer: &log, max: 4096}
	cmd.Stderr = &limitedRVCLog{buffer: &log, max: 4096}
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return errors.New("RVC 음색 변환이 취소되었거나 제한 시간에 도달했습니다")
		}
		return fmt.Errorf("RVC 음색 변환 실패 (%v): %s", err, log.String())
	}
	return nil
}

type limitedRVCLog struct {
	buffer *bytes.Buffer
	max    int
}

func (w *limitedRVCLog) Write(p []byte) (int, error) {
	n := len(p)
	if n > w.max {
		p = p[n-w.max:]
	}
	if w.buffer.Len()+len(p) > w.max {
		b := append([]byte(nil), w.buffer.Bytes()...)
		w.buffer.Reset()
		w.buffer.Write(b[len(b)+len(p)-w.max:])
	}
	_, _ = w.buffer.Write(p)
	return n, nil
}

 // stageRegisteredRVCUpload keeps user-owned IndexedDB files untouched.
 // It uses a fresh isolated destination with O_EXCL, bounded streaming, and
 // deliberately ignores untrusted multipart names and paths.
func stageRegisteredRVCUpload(header *multipart.FileHeader,destination string,maxSize int64) error {
 if header==nil||header.Size<1024||header.Size>maxSize{return errors.New("파일 크기가 잘못되었습니다")}
 src,err:=header.Open();if err!=nil{return errors.New("파일을 읽을 수 없습니다")};defer src.Close()
 dst,err:=os.OpenFile(destination,os.O_WRONLY|os.O_CREATE|os.O_EXCL,0600)
 if err!=nil{return errors.New("격리 파일을 생성할 수 없습니다")}
 written,copyErr:=io.Copy(dst,io.LimitReader(src,maxSize+1))
 closeErr:=dst.Close()
 if copyErr!=nil||closeErr!=nil||written!=header.Size||written>maxSize{return errors.New("파일 복사에 실패했습니다")}
 return nil
}

func (a *appServer) rvcConvert(w http.ResponseWriter, r *http.Request) {
	a.rvcConvertWith(w, r, runRVC)
}
func (a *appServer) rvcConvertStored(w http.ResponseWriter,r *http.Request) {
 a.rvcConvertStoredWith(w,r,runRVC)
}
func (a *appServer) rvcConvertStoredWith(w http.ResponseWriter,r *http.Request,runner rvcRunner) {
 a.rvcConvertWithMode(w,r,runner,true)
}
func (a *appServer) rvcConvertWith(w http.ResponseWriter, r *http.Request, runner rvcRunner) {
 a.rvcConvertWithMode(w,r,runner,false)
}
func (a *appServer) rvcConvertWithMode(w http.ResponseWriter,r *http.Request,runner rvcRunner,registered bool) {
	if r.Method != http.MethodPost {
		jsonError(w, 405, "POST만 지원합니다")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	select {
	case rvcSlot <- struct{}{}:
		defer func() { <-rvcSlot }()
	default:
		jsonError(w, 409, "다른 RVC 변환이 실행 중입니다")
		return
	}
	limit:=int64(maxRVCRequestBytes)
 if registered {limit=int64(maxRegisteredRVCRequestBytes)}
 r.Body = http.MaxBytesReader(w, r.Body, limit)
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		jsonError(w, 400, "RVC 입력 파일 또는 옵션 크기 오류")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	if r.MultipartForm == nil || len(r.MultipartForm.File["audio"]) != 1 {
		jsonError(w, 400, "원본 WAV 하나를 선택하세요")
		return
	}
	pick := func(k string) string { return r.FormValue(k) }
	if pick("rights") != "confirmed" {
		jsonError(w, 403, "원본 녹음과 모델 사용 권한을 확인해야 합니다")
		return
	}
	pitch, ep := strconv.Atoi(pick("pitch"))
	rate, er := strconv.ParseFloat(pick("indexRate"), 64)
	if ep != nil || er != nil {
		jsonError(w, 400, "RVC 피치 또는 인덱스 비율 형식 오류")
		return
	}
	o := rvcOptions{Root: pick("root"), Python: pick("python"), Model: pick("model"), Index: pick("index"), F0: pick("f0"), Pitch: pitch, IndexRate: rate}
 if registered {
  // Stage only copies of the existing IndexedDB assets. Files never overwrite
  // originals, and the entire temporary directory is removed after conversion.
  if pick("model")!=""||pick("index")!=""{
   jsonError(w,400,"등록된 모델 변환에서 외부 모델 경로는 사용할 수 없습니다");return
  }
  modelHeaders,indexHeaders:=r.MultipartForm.File["modelUpload"],r.MultipartForm.File["indexUpload"]
  if len(modelHeaders)!=1||len(indexHeaders)>1{
   jsonError(w,400,"등록된 RVC 체크포인트 하나와 선택적 인덱스 하나가 필요합니다");return
  }
  if modelHeaders[0].Size<1024||modelHeaders[0].Size>maxRVCTrainedModel||
      len(indexHeaders)==1&&(indexHeaders[0].Size<1024||indexHeaders[0].Size>96<<20){
   jsonError(w,400,"등록된 모델 또는 인덱스 파일 크기가 허용 범위를 벗어났습니다");return
  }
 }
	hdr := r.MultipartForm.File["audio"][0]
	if hdr.Size < 48 || hdr.Size > maxRVCInputBytes {
		jsonError(w, 400, "원본 WAV는 24MB 이하이어야 합니다")
		return
	}
	stream, err := hdr.Open()
	if err != nil {
		jsonError(w, 400, "원본 WAV 파일 읽기 실패")
		return
	}
	defer stream.Close()
	audio, err := io.ReadAll(io.LimitReader(stream, maxRVCInputBytes+1))
	if err != nil || len(audio) > maxRVCInputBytes || !validSingingWAV(audio) {
		jsonError(w, 422, "원본은 정상적인 PCM/float WAV 파일이어야 합니다")
		return
	}
	temp, err := os.MkdirTemp("", "myvocal-rvc-")
	if err != nil {
		jsonError(w, 500, "임시 변환 폴더 생성 실패")
		return
	}
	defer os.RemoveAll(temp)
 if registered {
  modelHeader:=r.MultipartForm.File["modelUpload"][0]
  modelPath:=filepath.Join(temp,"registered-model.pth")
  if err:=stageRegisteredRVCUpload(modelHeader,modelPath,maxRVCTrainedModel);err!=nil{
   jsonError(w,422,"등록된 RVC 모델 복사 실패: "+err.Error());return
  }
  if !plausibleTorchCheckpoint(modelPath){
   jsonError(w,422,"등록된 RVC 체크포인트 구조가 올바르지 않습니다");return
  }
  o.Model=modelPath
  if indexes:=r.MultipartForm.File["indexUpload"];len(indexes)==1 {
   o.Index=filepath.Join(temp,"registered-index.index")
   if err:=stageRegisteredRVCUpload(indexes[0],o.Index,96<<20);err!=nil{
    jsonError(w,422,"등록된 FAISS 인덱스 복사 실패: "+err.Error());return
   }
  }
 }
 if err:=validateRVCOptions(o);err!=nil{jsonError(w,400,err.Error());return}
	input := filepath.Join(temp, "source.wav")
	output := filepath.Join(temp, "result.wav")
	if err = os.WriteFile(input, audio, 0600); err != nil {
		jsonError(w, 500, "임시 원본 기록 실패")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Minute)
	defer cancel()
	if err = runner(ctx, o, input, output); err != nil {
		jsonError(w, 502, err.Error())
		return
	}
	f, err := os.Open(output)
	if err != nil {
		jsonError(w, 502, "RVC 출력 WAV 파일이 없습니다")
		return
	}
	defer f.Close()
	result, err := io.ReadAll(io.LimitReader(f, maxRVCResponseBytes+1))
	if err != nil || len(result) > maxRVCResponseBytes || !validSingingWAV(result) {
		jsonError(w, 502, "RVC가 유효한 WAV 파일을 생성하지 않았습니다")
		return
	}
	w.Header().Set("Content-Type", "audio/wav")
	w.Header().Set("Content-Disposition", "attachment; filename=MYVOCAL-RVC-vocal.wav")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = w.Write(result)
}