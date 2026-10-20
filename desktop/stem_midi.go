package main

// Optional Basic Pitch neural MIDI transcription in the existing Windows EXE.
// The user installs the model locally; the source WAV is never modified.
import (
 "bytes"
 "context"
 "embed"
 "encoding/binary"
 "errors"
 "fmt"
 "io"
 "net/http"
 "os"
 "os/exec"
 "path/filepath"
 "runtime"
 "strings"
 "time"
)

//go:embed stem_midi_worker.py
var embeddedStemMidiWorker embed.FS

var stemMidiSlot = make(chan struct{}, 1)
const maxStemMidiInput = 72 << 20
const maxStemMidiOutput = 4 << 20

type stemMidiRunner func(context.Context, string, string, string) error

func runStemMidi(ctx context.Context, python, input, output string) error {
 script, err := embeddedStemMidiWorker.ReadFile("stem_midi_worker.py")
 if err != nil {return err}
 scriptPath := filepath.Join(filepath.Dir(input), "stem_midi_worker.py")
 if err = os.WriteFile(scriptPath, script, 0600);err != nil{return err}
 cmd := exec.CommandContext(ctx, python, scriptPath, "--input", input, "--output", output)
 cmd.Dir = filepath.Dir(input)
 cmd.Stdin = nil
 cmd.Env = append(os.Environ(), "HF_HUB_OFFLINE=1", "TRANSFORMERS_OFFLINE=1", "HF_DATASETS_OFFLINE=1")
 var log bytes.Buffer
 cmd.Stdout = io.Discard
 cmd.Stderr = &stemErrorTail{buf:&log,max:4096}
 if runtime.GOOS == "windows" {
  cmd.Cancel = func()error {if cmd.Process==nil{return os.ErrProcessDone}; kill:=exec.Command("taskkill","/PID",fmt.Sprint(cmd.Process.Pid),"/T","/F");if e:=kill.Run();e!=nil{return cmd.Process.Kill()};return nil}
 }
 if err = cmd.Run();err!=nil {
  if ctx.Err()!=nil{return errors.New("악기 MIDI 변환이 취소되거나 제한 시간을 초과했습니다")}
  return fmt.Errorf("Basic Pitch 로컬 신경망 실행 실패: %w / %s",err,strings.TrimSpace(log.String()))
 }
 return nil
}
func validStemMidiOutput(data []byte) bool {
 if len(data)<26||len(data)>maxStemMidiOutput||!bytes.Equal(data[:4],[]byte("MThd")) {return false}
 if binary.BigEndian.Uint32(data[4:8])!=6{return false}
 format:=binary.BigEndian.Uint16(data[8:10]);tracks:=int(binary.BigEndian.Uint16(data[10:12]));division:=binary.BigEndian.Uint16(data[12:14])
 if format>1||tracks<1||tracks>128||division==0||division&0x8000!=0{return false}
 at:=14
 for i:=0;i<tracks;i++{
  if at+8>len(data)||!bytes.Equal(data[at:at+4],[]byte("MTrk")){return false}
  n:=int(binary.BigEndian.Uint32(data[at+4:at+8]));at+=8
  if n<4||n>len(data)-at{return false}
  at+=n
 }
 return at==len(data)
}
func (a *appServer) musicStemMidi(w http.ResponseWriter,r *http.Request){a.musicStemMidiWith(w,r,runStemMidi)}
func (a *appServer) musicStemMidiWith(w http.ResponseWriter,r *http.Request,runner stemMidiRunner){
 if r.Method!=http.MethodPost{jsonError(w,405,"POST만 허용합니다");return}
 if !a.authorizeSinging(w,r){return}
 select{case stemMidiSlot<-struct{}{}:defer func(){<-stemMidiSlot}();default:jsonError(w,409,"이미 악기 MIDI 변환이 실행 중입니다");return}
 r.Body=http.MaxBytesReader(w,r.Body,maxStemMidiInput+(1<<20))
 if err:=r.ParseMultipartForm(1<<20);err!=nil{jsonError(w,400,"MIDI 변환 요청이 너무 큽니다");return}
 if r.MultipartForm!=nil{defer r.MultipartForm.RemoveAll()}
 python:=r.FormValue("python")
 if len(python)>1024||!filepath.IsAbs(python)||strings.ContainsAny(python,"\x00\r\n")||(runtime.GOOS=="windows"&&!strings.EqualFold(filepath.Base(python),"python.exe")){jsonError(w,400,"설치된 Python.exe 절대 경로가 필요합니다");return}
 if err:=ensureRegular(python);err!=nil{jsonError(w,400,"Python 실행 파일을 찾지 못했습니다");return}
 source,header,err:=r.FormFile("audio")
 if err!=nil{jsonError(w,400,"변환할 분리 WAV를 선택하세요");return}
 defer source.Close()
 if header.Size<44||header.Size>maxStemMidiInput{jsonError(w,400,"WAV 입력 크기가 올바르지 않습니다");return}
 temp,err:=os.MkdirTemp("","myvocal-midi-")
 if err!=nil{jsonError(w,500,"MIDI 임시 작업 폴더 생성 실패");return}
 defer os.RemoveAll(temp)
 input:=filepath.Join(temp,"stem.wav")
 target,err:=os.OpenFile(input,os.O_WRONLY|os.O_CREATE|os.O_EXCL,0600)
 if err!=nil{jsonError(w,500,"임시 WAV 생성 실패");return}
 n,copyErr:=io.Copy(target,io.LimitReader(source,maxStemMidiInput+1));closeErr:=target.Close()
 if copyErr!=nil||closeErr!=nil||n!=header.Size{jsonError(w,400,"입력 WAV를 모두 읽지 못했습니다");return}
 data,err:=os.ReadFile(input)
 if err!=nil||!validSingingWAV(data){jsonError(w,422,"올바른 PCM WAV가 아닙니다");return}
 ctx,cancel:=context.WithTimeout(r.Context(),15*time.Minute);defer cancel()
 output:=filepath.Join(temp,"stem.mid")
 if err=runner(ctx,python,input,output);err!=nil{jsonError(w,502,err.Error());return}
 midi,err:=os.ReadFile(output)
 if err!=nil||!validStemMidiOutput(midi){jsonError(w,502,"신경망 MIDI 출력이 올바르지 않습니다");return}
 w.Header().Set("Content-Type","audio/midi")
 w.Header().Set("Cache-Control","no-store")
 w.Header().Set("X-Content-Type-Options","nosniff")
 w.Header().Set("Content-Disposition","attachment; filename=MYVOCAL-BasicPitch.mid")
 _,_=w.Write(midi)
}
