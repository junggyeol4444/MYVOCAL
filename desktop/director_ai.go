package main

// 원본 61·62항: 기존 Windows EXE의 설치된 로컬 Ollama를 사용해
// 한국어 자유 명령을 MYVOCAL의 기존 검토 가능한 편집 명령으로 제안한다.
// 실행/적용은 사용자 확인 전에는 불가능하고, 새 모델을 설치하거나 호출하지 않는다.
import (
 "bytes"
 "context"
 "encoding/json"
 "io"
 "net/http"
 "strings"
 "time"
)

const directorAIRequestLimit=12<<10
type directorAIRequest struct {
 Model string `json:"model"`
 Instruction string `json:"instruction"`
 SceneTitles []string `json:"sceneTitles"`
 SongTitle string `json:"songTitle"`
}
type directorAIResponse struct{
 Commands []string `json:"commands"`
 Explanation string `json:"explanation"`
}

func (a *appServer) localAIDirector(w http.ResponseWriter,r *http.Request){
 if r.Method!=http.MethodPost {jsonError(w,405,"로컬 음악·영상 감독은 POST 요청만 지원합니다");return}
 if !a.authorizeSinging(w,r){return}
 r.Body=http.MaxBytesReader(w,r.Body,directorAIRequestLimit)
 var input directorAIRequest
 dec:=json.NewDecoder(r.Body)
 dec.DisallowUnknownFields()
 if err:=dec.Decode(&input);err!=nil{
  jsonError(w,400,"한국어 전곡 AI 감독 요청 JSON 형식 오류");return
 }
 if !modelNamePattern.MatchString(input.Model)||len(input.Instruction)>1200||
  len([]rune(strings.TrimSpace(input.Instruction)))<5||
  strings.ContainsAny(input.Instruction,"\x00\r\n")||
  len(input.SceneTitles)>48||len(input.SongTitle)>120{
  jsonError(w,400,"실제 설치된 로컬 모델·원곡 지시문·장면 목록 크기를 확인하세요");return
 }
 for _,title:=range input.SceneTitles{
  if len(title)>120||strings.ContainsAny(title,"\x00\r\n") {
   jsonError(w,400,"장면 제목이 올바르지 않습니다");return
  }
 }
 system:=`당신은 Windows MYVOCAL 음악·뮤직비디오 프로젝트의 한국어 편집 지시를 기존 프로그램의 안전한 명령문으로 바꾸는 도우미입니다. 원본 파일을 삭제하거나 모델·명령 실행을 지시하지 마세요. JSON 객체만 답하세요. 형식: {"commands":["정확한 기존 MYVOCAL 편집 명령 1~2개"],"explanation":"한국어 짧은 설명"}. 기존 명령 예: "BPM을 130으로 바꿔", "2번째 장면의 배경을 비 오는 밤거리로 바꿔", "후렴 장면의 카메라를 클로즈업으로 바꿔", "후렴이 심심해". 여러 명령은 반드시 음악 하나와 영상 하나만 넣고, 근거 없는 인물 교체나 삭제 명령은 제안하지 마세요. 장면 제목 또는 장면 번호만 사용하세요. 모르는 명령은 빈 commands로 답하세요.`
 user:="사용자의 원본 명령: "+input.Instruction+"\n현재 음악 제목: "+input.SongTitle+
  "\n현재 장면 제목 순서: "+strings.Join(input.SceneTitles," / ")
 payload:=map[string]any{
  "model":input.Model,"stream":false,"format":"json","system":system,"prompt":user,
  "options":map[string]any{"temperature":0.15,"num_predict":500},"keep_alive":"5m",
 }
 data,_:=json.Marshal(payload)
 ctx,cancel:=context.WithTimeout(r.Context(),90*time.Second);defer cancel()
 req,err:=http.NewRequestWithContext(ctx,http.MethodPost,localAIOrigin+"/api/generate",bytes.NewReader(data))
 if err!=nil{jsonError(w,500,"로컬 AI 감독 요청 준비 실패");return}
 req.Header.Set("Content-Type","application/json")
 response,err:=localAIHTTPClient().Do(req)
 if err!=nil{jsonError(w,502,"설치된 로컬 Ollama에 연결하지 못했습니다. 직접 선택한 모델 상태를 확인하세요");return}
 defer response.Body.Close()
 if response.StatusCode!=200{jsonError(w,502,"선택한 로컬 모델에서 편집 명령 제안을 생성하지 못했습니다");return}
 raw,err:=io.ReadAll(io.LimitReader(response.Body,maxLocalAIReply+1))
 if err!=nil||len(raw)>maxLocalAIReply{jsonError(w,502,"로컬 감독 제안 응답 용량 초과");return}
 var envelope struct{
  Response string `json:"response"`
  Done bool `json:"done"`
 }
 if json.Unmarshal(raw,&envelope)!=nil||!envelope.Done||len(envelope.Response)>16<<10{
  jsonError(w,502,"로컬 AI 감독 제안이 완성된 JSON이 아닙니다");return
 }
 var draft directorAIResponse
 if json.Unmarshal([]byte(envelope.Response),&draft)!=nil||
  len(draft.Commands)<1||len(draft.Commands)>2||len(draft.Explanation)>500{
  jsonError(w,502,"로컬 모델이 지원하는 기존 편집 명령을 제안하지 못했습니다");return
 }
 for _,command:=range draft.Commands{
  if len(command)<4||len(command)>500||strings.ContainsAny(command,"\x00\r\n")||
   strings.Contains(command,"그리고") {
   jsonError(w,502,"실행 불가능한 원본 편집 명령이 포함돼 있습니다");return
  }
 }
 w.Header().Set("Content-Type","application/json; charset=utf-8")
 w.Header().Set("Cache-Control","no-store")
 w.Header().Set("X-Content-Type-Options","nosniff")
 _=json.NewEncoder(w).Encode(map[string]any{
  "provider":"local-ollama","model":input.Model,"commands":draft.Commands,
  "explanation":draft.Explanation,"proposedOnly":true,"projectEdited":false,
  "videoGenerated":false,"audioGenerated":false})
}
