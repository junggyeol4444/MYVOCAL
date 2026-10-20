package main

// Storyboard direction from a user-installed local text model. Timings, media
// generation, and persistent project updates remain controlled by the editor.
import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
)

type localStoryboardSection struct {
	Name string `json:"name"`
	Bars int    `json:"bars"`
}
type localStoryboardInput struct {
	Model    string                   `json:"model"`
	Prompt   string                   `json:"prompt"`
	Lyrics   string                   `json:"lyrics"`
	Sections []localStoryboardSection `json:"sections"`
}
type localStoryboardScene struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Location    string `json:"location"`
	Action      string `json:"action"`
	Camera      string `json:"camera"`
	Lighting    string `json:"lighting"`
}

func (a *appServer) localAIStoryboard(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, 405, "POST 요청만 지원합니다")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	localAIStoryboardProxy(w, r, localAIHTTPClient(), localAIOrigin)
}
func localAIStoryboardProxy(w http.ResponseWriter, r *http.Request, client *http.Client, base string) {
	r.Body = http.MaxBytesReader(w, r.Body, maxLocalAIPayload)
	var in localStoryboardInput
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if dec.Decode(&in) != nil || !modelNamePattern.MatchString(in.Model) || len(strings.TrimSpace(in.Prompt)) < 3 || len(in.Prompt) > 1000 || len(in.Lyrics) > 8000 || len(in.Sections) < 1 || len(in.Sections) > 20 {
		jsonError(w, 400, "장면 제작 요청의 정보나 크기가 올바르지 않습니다.")
		return
	}
	for _, s := range in.Sections {
		if s.Bars < 1 || s.Bars > 128 || len(s.Name) > 100 {
			jsonError(w, 400, "곡 구간 정보가 잘못됐습니다.")
			return
		}
	}
	prompt := struct {
		Lyrics   string                   `json:"lyrics"`
		Prompt   string                   `json:"description"`
		Sections []localStoryboardSection `json:"sections"`
	}{Lyrics: in.Lyrics, Prompt: in.Prompt, Sections: in.Sections}
	p, _ := json.Marshal(prompt)
	system := "당신은 한국어 뮤직비디오 콘티 연출가입니다. 원본 가사·곡 구간의 감정을 분석해 저작권을 침해하지 않는 새 장면 설명을 작성하세요. 영상 픽셀을 생성하지 않습니다. 반드시 JSON 객체만 출력하세요: {\"scenes\":[{\"title\":\"장면 제목\",\"description\":\"장면 내용\",\"location\":\"장소\",\"action\":\"동작\",\"camera\":\"카메라\",\"lighting\":\"조명\"}]} . scenes 개수는 입력된 sections와 정확히 일치해야 합니다."
	body, _ := json.Marshal(map[string]interface{}{"model": in.Model, "stream": false, "format": "json", "system": system, "prompt": string(p), "options": map[string]interface{}{"num_predict": 2048, "temperature": 0.65}})
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, base+"/api/generate", bytes.NewReader(body))
	if err != nil {
		jsonError(w, 500, "콘티 모델 요청 준비 실패")
		return
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := client.Do(req)
	if err != nil {
		jsonError(w, 502, "로컬 AI 콘티 생성에 실패했습니다. 모델 실행 상태를 확인하세요.")
		return
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		jsonError(w, 502, "로컬 AI가 콘티 생성 요청을 거절했습니다.")
		return
	}
	raw, err := io.ReadAll(io.LimitReader(res.Body, maxLocalAIReply+1))
	if err != nil || len(raw) > maxLocalAIReply {
		jsonError(w, 502, "콘티 결과 크기가 초과됐습니다.")
		return
	}
	var output struct {
		Response string `json:"response"`
		Done     bool   `json:"done"`
	}
	if json.Unmarshal(raw, &output) != nil || !output.Done || len(output.Response) > 32<<10 {
		jsonError(w, 502, "콘티 응답 형식이 올바르지 않습니다.")
		return
	}
	var data struct {
		Scenes []localStoryboardScene `json:"scenes"`
	}
	if json.Unmarshal([]byte(output.Response), &data) != nil || len(data.Scenes) != len(in.Sections) {
		jsonError(w, 502, "AI 장면 수가 원본 음악 구간과 일치하지 않습니다.")
		return
	}
	for _, s := range data.Scenes {
		if len(strings.TrimSpace(s.Title)) == 0 || len(s.Title) > 120 || len(s.Description) > 1200 || len(s.Location) > 200 || len(s.Action) > 200 || len(s.Camera) > 200 || len(s.Lighting) > 200 || strings.ContainsAny(s.Title+s.Description+s.Location+s.Action+s.Camera+s.Lighting, "\x00") {
			jsonError(w, 502, "AI 장면 텍스트가 올바르지 않습니다.")
			return
		}
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"provider": "local-ollama", "model": in.Model, "scenes": data.Scenes, "textGenerated": true, "videoGenerated": false})
}