package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// The optional external provider is called on demand. We do not store API keys,
// echo them back, or log request bodies. A key stays in browser component memory
// and the proxied request only; users must supply it each time they open the app.
// This service is available only on the local EXE, not in standalone HTML preview.
var aiModelValid = regexp.MustCompile(`^[a-zA-Z0-9._:-]{1,80}$`)

type songRequest struct {
	APIKey string `json:"apiKey"`
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
	Title  string `json:"title"`
	Genre  string `json:"genre"`
	Mood   string `json:"mood"`
	Key    string `json:"key"`
	BPM    int    `json:"bpm"`
	Bars   int    `json:"bars"`
}

func jsonError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
func (a *appServer) aiLyrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, 405, "POST 요청만 지원합니다.")
		return
	}
	// Only this app's loopback page should be able to call the proxy. Prevent
	// cross-site requests from browser tabs or remote HTTP clients.
	host := r.Host
	if !strings.HasPrefix(host, "127.0.0.1:") && !strings.HasPrefix(host, "[::1]:") {
		jsonError(w, 403, "허용되지 않은 호스트입니다.")
		return
	}
	if r.Header.Get("Origin") != "http://"+host || r.Header.Get("X-MYVOCAL-Session") != a.sessionKey {
		jsonError(w, 403, "앱 전용 요청이 아닙니다.")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	var req songRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, 400, "요청 형식 또는 크기를 확인해 주세요.")
		return
	}
	if len(req.APIKey) < 10 || len(req.APIKey) > 512 || strings.ContainsAny(req.APIKey, "\r\n\t ") {
		jsonError(w, 400, "올바른 API 키를 입력해 주세요.")
		return
	}
	if len(req.Prompt) > 2400 || len(req.Title) > 250 || len(req.Genre) > 100 || len(req.Mood) > 100 || len(req.Key) > 80 {
		jsonError(w, 400, "곡 설명 또는 설정이 너무 깁니다.")
		return
	}
	if req.Model == "" {
		req.Model = "gpt-4o-mini"
	}
	if !aiModelValid.MatchString(req.Model) {
		jsonError(w, 400, "모델 ID에는 영문/숫자/._:-만 사용할 수 있습니다.")
		return
	}
	if req.Bars < 8 || req.Bars > 64 || req.BPM < 40 || req.BPM > 240 {
		jsonError(w, 400, "BPM 또는 마디 수가 잘못되었습니다.")
		return
	}
	prompt := fmt.Sprintf("한국어 노래 작사·코드 제안. 새로운 독창적 가사를 작성하세요. 특정 기존 곡이나 아티스트 가사의 복제는 하지 마세요. 반드시 JSON 객체만 반환하세요. 필수 필드: title (문자열), lyrics (완성된 독창적 한국어 가사: [Verse 1], [Pre-Chorus], [Chorus], [Verse 2], [Bridge], [Final Chorus] 구조), bpm (40-240 정수), key (예: C Major / A Minor), chords (8~16개 요소의 문자열 배열. 각 요소는 C, Am, F, G, Em, Dm, G7 등 표준 코드 기호만).\n요청: %s\n이름: %s\n장르: %s\n분위기: %s\n선호 조성: %s\n선호 BPM: %d\n길이: %d마디", req.Prompt, req.Title, req.Genre, req.Mood, req.Key, req.BPM, req.Bars)
	data := map[string]interface{}{
		"model": req.Model, "temperature": 0.8, "response_format": map[string]string{"type": "json_object"}, "max_tokens": 2400,
		"messages": []map[string]string{{"role": "system", "content": "You are a creative Korean songwriter. Reply only with valid JSON. Never copy existing copyrighted lyrics."}, {"role": "user", "content": prompt}},
	}
	raw, _ := json.Marshal(data)
	upstream, err := http.NewRequestWithContext(r.Context(), http.MethodPost, openaiChatURL, bytes.NewReader(raw))
	if err != nil {
		jsonError(w, 500, "외부 AI 요청을 구성하지 못했습니다.")
		return
	}
	upstream.Header.Set("Authorization", "Bearer "+req.APIKey)
	upstream.Header.Set("Content-Type", "application/json")
	upstream.Header.Set("Accept", "application/json")
	client := &http.Client{Timeout: 55 * time.Second}
	result, err := client.Do(upstream)
	if err != nil {
		jsonError(w, 502, "외부 AI에 연결할 수 없습니다. 인터넷 연결 및 API 상태를 확인해 주세요.")
		return
	}
	defer result.Body.Close()
	b, err := io.ReadAll(io.LimitReader(result.Body, 1<<20))
	if err != nil {
		jsonError(w, 502, "AI 응답을 읽지 못했습니다.")
		return
	}
	if result.StatusCode != 200 {
		switch result.StatusCode {
		case 401:
			jsonError(w, 401, "API 키 인증에 실패했습니다.")
		case 402, 429:
			jsonError(w, 429, "AI 서비스 사용 한도 또는 요금제를 확인해 주세요.")
		default:
			jsonError(w, 502, fmt.Sprintf("AI 제공자 오류 (HTTP %d). 모델 ID 또는 제공자 상태를 확인해 주세요.", result.StatusCode))
		}
		return
	}
	var response struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if json.Unmarshal(b, &response) != nil || len(response.Choices) == 0 {
		jsonError(w, 502, "AI 응답 구조를 해석할 수 없습니다.")
		return
	}
	content := strings.TrimSpace(response.Choices[0].Message.Content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)
	var proposal struct {
		Title  string          `json:"title"`
		Lyrics string          `json:"lyrics"`
		BPM    int             `json:"bpm"`
		Key    string          `json:"key"`
		Chords json.RawMessage `json:"chords"`
	}
	if err := json.Unmarshal([]byte(content), &proposal); err != nil {
		jsonError(w, 502, "AI가 JSON 형식의 작사 제안을 반환하지 않았습니다.")
		return
	}
	if strings.TrimSpace(proposal.Lyrics) == "" {
		jsonError(w, 502, "AI 응답에 가사가 없습니다.")
		return
	}
	if len(proposal.Lyrics) > 30000 {
		jsonError(w, 502, "AI 가사 출력이 너무 깁니다.")
		return
	}
	var chords []string
	if len(proposal.Chords) > 0 {
		_ = json.Unmarshal(proposal.Chords, &chords)
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if err := json.NewEncoder(w).Encode(map[string]interface{}{"title": proposal.Title, "lyrics": proposal.Lyrics, "bpm": proposal.BPM, "key": proposal.Key, "chords": chords}); err != nil && !errors.Is(err, io.EOF) {
		return
	}
}
