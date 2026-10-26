package main

// An opt-in LOCAL Ollama model generates genuine symbolic MIDI notes per 8-bar
// section. The Windows EXE does not download models or invoke remote APIs.
import (
 "bytes"
 "encoding/json"
 "errors"
 "io"
 "net/http"
 "strings"
)
type neuralMidiInput struct {
 Model string `json:"model"`
 Prompt string `json:"prompt"`
 Genre string `json:"genre"`
 Key string `json:"key"`
 BPM int `json:"bpm"`
 Bars int `json:"bars"`
 Parts int `json:"parts"`
 BarStart int `json:"barStart"`
 Section string `json:"section"`
 PreviousMelody []int `json:"previousMelody"`
 PreviousHarmony []int `json:"previousHarmony"`
 ThemeMotif []int `json:"themeMotif"`
}
type neuralMidiNote struct{
 Pitch int `json:"pitch"`
 StartBeat float64 `json:"startBeat"`
 Length float64 `json:"length"`
 Velocity int `json:"velocity"`
}
type neuralMidiStem struct {
 Role string `json:"role"`
 Notes []neuralMidiNote `json:"notes"`
}
func (a *appServer) neuralMidiSection(w http.ResponseWriter,r *http.Request){
 if r.Method!=http.MethodPost {jsonError(w,405,"POST만 지원합니다");return}
 if !a.authorizeSinging(w,r){return}
 a.neuralMidiSectionWith(w,r,localAIHTTPClient(),localAIOrigin)
}
func (a *appServer) neuralMidiSectionWith(w http.ResponseWriter,r *http.Request,c *http.Client,endpoint string){
 r.Body=http.MaxBytesReader(w,r.Body,6<<10)
 var input neuralMidiInput
 decoder:=json.NewDecoder(r.Body);decoder.DisallowUnknownFields()
 if err:=decoder.Decode(&input);err!=nil{jsonError(w,400,"신경망 MIDI 입력이 올바르지 않습니다");return}
 if !modelNamePattern.MatchString(input.Model)||len(input.Prompt)<3||len(input.Prompt)>1200||
 len(input.Genre)>60||len(input.Key)>40||input.BPM<40||input.BPM>240||
 input.Bars!=8||input.BarStart<1||input.BarStart>360||
 len(input.Section)>60||len(input.PreviousMelody)>16||len(input.PreviousHarmony)>8||len(input.ThemeMotif)>12{
  jsonError(w,400,"신경망 MIDI 마디·BPM·모델 설정이 잘못됐습니다");return
 }
 requestedParts:=input.Parts
 if requestedParts==0{requestedParts=6}
 if requestedParts!=6&&requestedParts!=9{jsonError(w,400,"신경망 MIDI 악기는 6개 또는 9개를 선택하세요");return}
 for _,p:=range input.PreviousMelody{if p<36||p>96{jsonError(w,400,"이전 멜로디 정보가 손상됐습니다");return}}
 for _,p:=range input.PreviousHarmony{if p<0||p>11{jsonError(w,400,"이전 화성 피치 클래스가 잘못됐습니다");return}}
 for _,p:=range input.ThemeMotif{if p<36||p>96{jsonError(w,400,"후렴 테마의 MIDI 음표 범위를 확인하세요");return}}
 system:=`한국어 창작 음악가입니다. 8마디(32박) 동안 6개 악기 파트의 오리지널 MIDI 음표를 창작합니다.
저작권 있는 기존 멜로디를 복제하지 않습니다. 오직 JSON 객체로 응답하세요:
{"stems":[{"role":"melody","notes":[{"pitch":60,"startBeat":0,"length":1,"velocity":88}]}]}
정확히 melody, chords, bass, drums, guitar, pad 6개 role을 하나씩 사용합니다.
startBeat는 해당 8마디의 0~32, length는 0.125~8박, pitch 0~127, velocity 1~127.
melody는 48~84, bass는 28~64, chords/guitar/pad는 36~96의 MIDI 음정.
drums는 일반 MIDI 드럼 노트 36,38,42,46,49를 사용하세요.
각 파트가 실제 음표를 가지도록 하세요. 이전 멜로디와 화성 피치 클래스를 반영해 전후 구간을 연결하세요. 이전 후렴의 오리지널 테마가 제공되면 마지막 후렴에서 음정을 보존하거나 변주해 재등장시키세요. 원래 사용자 데이터는 그대로 두세요.
프로젝트 파일, 개인 녹음 또는 모델을 변경하거나 로컬 명령을 실행하지 마세요.`
 if requestedParts==9{
  system=strings.ReplaceAll(system,"6개 악기","9개 악기")
  system=strings.ReplaceAll(system,"정확히 melody, chords, bass, drums, guitar, pad 6개 role을 하나씩 사용합니다.",
   "정확히 melody, chords, bass, drums, guitar, pad, harmony, piano, synth 9개 role을 하나씩 사용합니다. harmony는 주선율의 화음을, piano는 독립 피아노 연주를, synth는 별도 신시사이저 음표를 만드세요.")
  system=strings.ReplaceAll(system,"chords/guitar/pad는 36~96","chords/guitar/pad/harmony/piano/synth는 36~96")
 }
 user:=`곡 설명: `+input.Prompt+"\n장르: "+input.Genre+"\n조성: "+input.Key+
 "\n템포: "+stringInt(input.BPM)+" BPM\n이번 구간: "+input.Section+
 "\n시작 마디: "+stringInt(input.BarStart)+"\n이전 멜로디 음높이: "
 for _,n:=range input.PreviousMelody{user+=stringInt(n)+","}
 user+="\n이전 구간 화성 피치 클래스: "
 for _,n:=range input.PreviousHarmony{user+=stringInt(n)+","}
 user+="\n이 곡의 앞선 오리지널 후렴 테마 MIDI 음높이: "
 for _,n:=range input.ThemeMotif{user+=stringInt(n)+","}
 payload:=map[string]interface{}{"model":input.Model,"stream":false,"format":"json","system":system,"prompt":user,
  "options":map[string]interface{}{"temperature":0.52,"num_predict":map[bool]int{true:6000,false:3800}[requestedParts==9]},"keep_alive":"5m"}
 body,_:=json.Marshal(payload)
 request,err:=http.NewRequestWithContext(r.Context(),http.MethodPost,endpoint+"/api/generate",bytes.NewReader(body))
 if err!=nil{jsonError(w,500,"모델 요청 생성 실패");return};request.Header.Set("Content-Type","application/json")
 response,err:=c.Do(request)
 if err!=nil{jsonError(w,502,"설치된 로컬 AI 모델 작곡에 실패했습니다");return}
 defer response.Body.Close()
 if response.StatusCode!=200{jsonError(w,502,"로컬 Ollama 신경망이 작곡 요청을 거절했습니다");return}
 raw,err:=io.ReadAll(io.LimitReader(response.Body,maxLocalAIReply+1))
 if err!=nil||len(raw)>maxLocalAIReply{jsonError(w,502,"신경망 MIDI 응답 크기가 초과됐습니다");return}
 var envelope struct{Response string `json:"response"`;Done bool `json:"done"`}
 if json.Unmarshal(raw,&envelope)!=nil||!envelope.Done||len(envelope.Response)>72<<10{jsonError(w,502,"신경망 MIDI 응답이 완성되지 않았습니다");return}
 var generated struct{Stems []neuralMidiStem `json:"stems"`}
 if err=json.Unmarshal([]byte(envelope.Response),&generated);err!=nil||!validNeuralMidiStems(generated.Stems,input.Bars*4,requestedParts){
  jsonError(w,502,"신경망이 실제 편집 가능한 "+stringInt(requestedParts)+"개 MIDI 악기 구간을 만들지 못했습니다");return
 }
 w.Header().Set("Content-Type","application/json; charset=utf-8")
 w.Header().Set("Cache-Control","no-store")
 _=json.NewEncoder(w).Encode(map[string]interface{}{
  "provider":"local-ollama","model":input.Model,"neuralSymbolicGenerated":true,
  "audioGenerated":false,"stems":generated.Stems,"bars":input.Bars,"barStart":input.BarStart,"parts":requestedParts,
 })
}
func validNeuralMidiStems(stems []neuralMidiStem,beats int,parts ...int)bool{
 count:=6
 if len(parts)>0{count=parts[0]}
 if count!=6&&count!=9{return false}
 roles:=map[string]bool{"melody":true,"chords":true,"bass":true,"drums":true,"guitar":true,"pad":true}
 if count==9{roles["harmony"]=true;roles["piano"]=true;roles["synth"]=true}
 if len(stems)!=len(roles)||beats!=32{return false}
 seen:=map[string]bool{}
 for _,stem:=range stems{
  if !roles[stem.Role]||seen[stem.Role]||len(stem.Notes)==0||len(stem.Notes)>240{return false}
  seen[stem.Role]=true
  for _,n:=range stem.Notes{
   if n.Pitch<0||n.Pitch>127||n.Velocity<1||n.Velocity>127||
      n.StartBeat<0||n.StartBeat>=float64(beats)||n.Length<0.125||n.Length>8||
      n.StartBeat+n.Length>float64(beats)+0.001{return false}
   if n.StartBeat!=n.StartBeat||n.Length!=n.Length{return false}
  }
 }
 return true
}
func stringInt(n int)string{
 if n==0{return "0"}
 // no arbitrary model output is interpreted as source code or a path
 if n<0{return "-"+stringInt(-n)}
 var buf [24]byte;pos:=len(buf)
 for n>0{pos--;buf[pos]=byte(n%10)+'0';n/=10}
 return strings.TrimSpace(string(buf[pos:]))
}
var _=errors.New
