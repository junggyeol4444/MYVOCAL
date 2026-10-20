package main

// Local Ollama integration for AI-written lyrics and chord proposals.
// The Windows EXE remains fully usable without Ollama; no remote API, API key,
// model download, installation or project mutation is performed here.
import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"regexp"
	"strings"
	"time"
)

const localAIOrigin = "http://127.0.0.1:11434"
const maxLocalAIPayload = 8 << 10
const maxLocalAIReply = 128 << 10

var modelNamePattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,119}$`)

func localAIHTTPClient() *http.Client {
	return &http.Client{Timeout: 90 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }, Transport: &http.Transport{Proxy: nil, DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
		if network != "tcp" || address != "127.0.0.1:11434" {
			return nil, errors.New("외부 네트워크 요청을 차단했습니다")
		}
		return (&net.Dialer{Timeout: 5 * time.Second}).DialContext(ctx, network, address)
	}}}
}

type localAIComposeInput struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
	Genre  string `json:"genre"`
	Mood   string `json:"mood"`
	Key    string `json:"key"`
}

func (a *appServer) localAIModels(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, 405, "GET 요청만 지원합니다")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	localAIModelsProxy(w, r, localAIHTTPClient(), localAIOrigin)
}
func (a *appServer) localAICompose(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, 405, "POST 요청만 지원합니다")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	localAIComposeProxy(w, r, localAIHTTPClient(), localAIOrigin)
}

func localAIModelsProxy(w http.ResponseWriter, r *http.Request, client *http.Client, base string) {
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, base+"/api/tags", nil)
	if err != nil {
		jsonError(w, 502, "로컬 모델 목록 요청 오류")
		return
	}
	res, err := client.Do(req)
	if err != nil {
		jsonError(w, 502, "로컬 AI 서버에 연결할 수 없습니다. Ollama가 실행 중인지 확인하세요.")
		return
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		jsonError(w, 502, "로컬 모델 서버가 정상 응답하지 않았습니다.")
		return
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, maxLocalAIReply+1))
	if err != nil || len(body) > maxLocalAIReply {
		jsonError(w, 502, "모델 목록 응답 용량이 초과됐습니다.")
		return
	}
	var tags struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	if json.Unmarshal(body, &tags) != nil {
		jsonError(w, 502, "모델 목록 형식이 올바르지 않습니다.")
		return
	}
	names := []string{}
	for _, model := range tags.Models {
		if modelNamePattern.MatchString(model.Name) {
			names = append(names, model.Name)
		}
	}
	if len(names) > 100 {
		names = names[:100]
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"models": names, "provider": "local-ollama", "installed": len(names) > 0})
}

func localAIComposeProxy(w http.ResponseWriter, r *http.Request, client *http.Client, base string) {
	r.Body = http.MaxBytesReader(w, r.Body, maxLocalAIPayload)
	var input localAIComposeInput
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if decoder.Decode(&input) != nil {
		jsonError(w, 400, "로컬 AI 요청 형식 또는 크기가 올바르지 않습니다.")
		return
	}
	if !modelNamePattern.MatchString(input.Model) || len(input.Prompt) > 2000 || len(strings.TrimSpace(input.Prompt)) < 3 || len(input.Genre) > 100 || len(input.Mood) > 100 || len(input.Key) > 50 || strings.ContainsAny(input.Model, "\n\r\x00") {
		jsonError(w, 400, "모델 이름 또는 곡 설명이 올바르지 않습니다.")
		return
	}
	// User text is model input, never an executable instruction for the host.
	system := "당신은 한국어 음악 작사·화성 제안 도우미입니다. 창작 가사와 코드 진행을 새로 작성하세요. 저작권 있는 기존 가사를 재현하지 마세요. 오직 JSON 객체만 답하세요: {\"title\":string,\"lyrics\":string,\"chords\":[\"Am\",\"F\",\"C\",\"G\"],\"bpm\":integer,\"key\":\"A Minor\"}. 가사는 Verse, Chorus, Bridge를 포함하고, 코드는 일반적인 4~8개 코드 기호로 제공하세요. 제공된 정보 외 사용자 개인정보를 추측하지 마세요."
	user := "곡 설명: " + input.Prompt + "\n장르: " + input.Genre + "\n감정: " + input.Mood + "\n희망 조성: " + input.Key
	payload := map[string]interface{}{"model": input.Model, "stream": false, "format": "json", "system": system, "prompt": user, "options": map[string]interface{}{"temperature": 0.65, "num_predict": 2048}, "keep_alive": "5m"}
	b, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, base+"/api/generate", bytes.NewReader(b))
	if err != nil {
		jsonError(w, 500, "모델 요청 준비 실패")
		return
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := client.Do(req)
	if err != nil {
		jsonError(w, 502, "로컬 AI 생성에 실패했습니다. 모델 설치 및 Ollama 실행 상태를 확인하세요.")
		return
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		jsonError(w, 502, "로컬 AI가 생성 요청을 거절했습니다. 선택한 모델이 실제로 설치되어 있는지 확인하세요.")
		return
	}
	raw, err := io.ReadAll(io.LimitReader(res.Body, maxLocalAIReply+1))
	if err != nil || len(raw) > maxLocalAIReply {
		jsonError(w, 502, "로컬 AI 출력 용량이 초과됐습니다.")
		return
	}
	var envelope struct {
		Response string `json:"response"`
		Done     bool   `json:"done"`
	}
	if json.Unmarshal(raw, &envelope) != nil || !envelope.Done || len(envelope.Response) > 32<<10 {
		jsonError(w, 502, "로컬 AI 출력 형식이 올바르지 않습니다.")
		return
	}
	var proposal struct {
		Title  string   `json:"title"`
		Lyrics string   `json:"lyrics"`
		Chords []string `json:"chords"`
		BPM    int      `json:"bpm"`
		Key    string   `json:"key"`
	}
	if json.Unmarshal([]byte(envelope.Response), &proposal) != nil || len(strings.TrimSpace(proposal.Lyrics)) < 10 || len(proposal.Lyrics) > 12000 || len(proposal.Title) > 200 || len(proposal.Chords) > 16 || proposal.BPM < 40 || proposal.BPM > 240 || len(proposal.Key) > 30 {
		jsonError(w, 502, "AI 응답에 사용할 수 있는 가사 또는 작곡 정보가 없습니다.")
		return
	}
	// Model output is untrusted. The UI validates chords against its own MIDI engine.
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"provider": "local-ollama", "model": input.Model, "proposal": proposal, "neuralTextGenerated": true, "audioGenerated": false, "trainingPerformed": false})
}