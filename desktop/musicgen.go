package main

import (
    "context"
    "encoding/base64"
    "bytes"
    "embed"
    "encoding/json"
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

//go:embed musicgen_worker.py
var embeddedMusicGenWorker embed.FS

const maxMusicGenRequest = 3 << 20
const maxMusicGenPromptBytes = 2 << 20
const maxMusicGenWAV = 12 << 20
var musicGenSlot = make(chan struct{},1)

type musicGenInput struct { Python string `json:"python"`; ModelDir string `json:"modelDir"`; Prompt string `json:"prompt"`; Seconds int `json:"seconds"`; Seed int `json:"seed"`; AudioPrompt string `json:"audioPrompt,omitempty"` }
type musicGenRunner func(context.Context,musicGenInput,string) error

func validateMusicGenInput(c musicGenInput) error {
    if len(c.Python)>1024||len(c.ModelDir)>1024||!filepath.IsAbs(c.Python)||!filepath.IsAbs(c.ModelDir)||strings.ContainsAny(c.Python+c.ModelDir,"\r\n\x00") {return errors.New("Python과 MusicGen 모델의 절대 경로를 입력하세요")}
    if runtime.GOOS=="windows"&&!strings.EqualFold(filepath.Base(c.Python),"python.exe") {return errors.New("Windows Python.exe가 필요합니다")}
    if err:=ensureRegular(c.Python);err!=nil{return errors.New("로컬 Python 실행 파일이 없습니다")}
    if err:=ensureRegular(filepath.Join(c.ModelDir,"config.json"));err!=nil{return errors.New("로컬 MusicGen 모델 config.json이 없습니다")}
    if c.Seconds<3||c.Seconds>28||c.Seed<0||len(strings.TrimSpace(c.Prompt))<2||len([]rune(c.Prompt))>600||strings.ContainsRune(c.Prompt,'\x00'){return errors.New("음악 길이(3~28초), 시드(0 이상), 설명(2~600자)을 확인하세요")}
    if c.AudioPrompt!="" {
        raw,err:=base64.StdEncoding.DecodeString(c.AudioPrompt)
        if err!=nil||len(raw)>maxMusicGenPromptBytes||len(raw)<44||!validSingingWAV(raw) {return errors.New("MusicGen 연결 오디오에 올바른 WAV가 없습니다")}
        if c.Seconds>20 {return errors.New("오디오 연속 생성은 한 구간 최대 20초입니다")}
        if err:=validateMusicGenPromptWav(raw);err!=nil{return err}
    }
    return nil
}
func validateMusicGenPromptWav(raw []byte)error{
    if len(raw)<44||!bytes.Equal(raw[:4],[]byte("RIFF"))||!bytes.Equal(raw[8:12],[]byte("WAVE"))||
       !bytes.Equal(raw[12:16],[]byte("fmt "))||!bytes.Equal(raw[36:40],[]byte("data")){
      return errors.New("MusicGen 연결 WAV는 기본 PCM RIFF 형식이어야 합니다")}
    channels:=int(raw[22]);if channels<1||channels>2||raw[23]!=0||raw[20]!=1||raw[21]!=0||raw[34]!=16||raw[35]!=0 {
      return errors.New("MusicGen 연결 WAV는 16비트 PCM 모노/스테레오여야 합니다")}
    rate:=int(uint32(raw[24])|uint32(raw[25])<<8|uint32(raw[26])<<16|uint32(raw[27])<<24)
    if rate<8000||rate>96000{return errors.New("MusicGen 연결 WAV 샘플레이트 오류")}
    samples:=len(raw)-44
    if samples<=0||samples%(channels*2)!=0||samples<3*rate*channels*2||samples>8*rate*channels*2||
       int(uint32(raw[40])|uint32(raw[41])<<8|uint32(raw[42])<<16|uint32(raw[43])<<24)!=samples {
      return errors.New("MusicGen 연결 WAV는 3~8초의 정확한 PCM 파일이어야 합니다")}
    return nil
}
func runMusicGen(ctx context.Context,c musicGenInput,output string) error {
    raw,err:=embeddedMusicGenWorker.ReadFile("musicgen_worker.py");if err!=nil{return err}
    script:=filepath.Join(filepath.Dir(output),"musicgen_worker.py")
    if err=os.WriteFile(script,raw,0600);err!=nil{return err}
    cmd:=exec.CommandContext(ctx,c.Python,script,"--model-dir",c.ModelDir,"--output",output,"--prompt",c.Prompt,"--seconds",fmt.Sprint(c.Seconds),"--seed",fmt.Sprint(c.Seed))
    if c.AudioPrompt!="" {
       decoded,err:=base64.StdEncoding.DecodeString(c.AudioPrompt);if err!=nil{return err}
       inputPath:=filepath.Join(filepath.Dir(output),"musicgen-prompt.wav")
       if err=os.WriteFile(inputPath,decoded,0600);err!=nil{return err}
       cmd.Args=append(cmd.Args,"--audio-prompt",inputPath)
    }
    cmd.Dir=filepath.Dir(output);cmd.Stdin=nil
    cmd.Env=append(os.Environ(),"HF_HUB_OFFLINE=1","TRANSFORMERS_OFFLINE=1")
    cmd.Stdout=io.Discard;cmd.Stderr=io.Discard
    if err=cmd.Run();err!=nil {if ctx.Err()!=nil{return errors.New("MusicGen 생성이 취소됐거나 4분 제한 시간이 지났습니다")};return fmt.Errorf("로컬 MusicGen 실행 실패 (Python/transformers/모델 설치 확인): %w",err)}
    return nil
}
func (a *appServer) musicGenGenerate(w http.ResponseWriter,r *http.Request){a.musicGenGenerateWith(w,r,runMusicGen)}
func (a *appServer) musicGenGenerateWith(w http.ResponseWriter,r *http.Request,run musicGenRunner){
    if r.Method!=http.MethodPost {jsonError(w,405,"POST만 허용합니다");return}
    if !a.authorizeSinging(w,r){return}
    select {case musicGenSlot<-struct{}{}:defer func(){<-musicGenSlot}();default:jsonError(w,409,"이미 MusicGen 생성이 실행 중입니다");return}
    r.Body=http.MaxBytesReader(w,r.Body,maxMusicGenRequest)
    var opt musicGenInput
    dec:=json.NewDecoder(r.Body);dec.DisallowUnknownFields()
    if dec.Decode(&opt)!=nil {jsonError(w,400,"MusicGen 요청 형식 오류");return}
    if err:=validateMusicGenInput(opt);err!=nil{jsonError(w,400,err.Error());return}
    dir,err:=os.MkdirTemp("","myvocal-musicgen-");if err!=nil{jsonError(w,500,"임시 폴더 생성 실패");return}
    defer os.RemoveAll(dir)
    output:=filepath.Join(dir,"generated.wav")
    ctx,cancel:=context.WithTimeout(r.Context(),4*time.Minute);defer cancel()
    if err=run(ctx,opt,output);err!=nil{jsonError(w,502,err.Error());return}
    f,err:=os.Open(output);if err!=nil{jsonError(w,502,"MusicGen이 WAV를 생성하지 않았습니다");return};defer f.Close()
    b,err:=io.ReadAll(io.LimitReader(f,maxMusicGenWAV+1))
    if err!=nil||len(b)>maxMusicGenWAV||!validSingingWAV(b){jsonError(w,502,"MusicGen 출력이 유효한 PCM WAV가 아닙니다");return}
    w.Header().Set("Content-Type","audio/wav");w.Header().Set("X-Content-Type-Options","nosniff");w.Header().Set("Cache-Control","no-store")
    w.Header().Set("Content-Disposition","attachment; filename=MYVOCAL-MusicGen.wav")
    _,_=w.Write(b)
}