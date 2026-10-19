package main

// v1.0: Loopback-only bridge to a USER-RUN compatible singing inference server.
// This is a transport adapter, NOT an embedded neural network or model trainer.
import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const maxSingingWAV = 32 << 20
const maxSingingPayload = 48 << 10

type singingCue struct {
	Lyric    string  `json:"lyric"`
	Pitch    float64 `json:"pitch"`
	StartSec float64 `json:"startSec"`
	EndSec   float64 `json:"endSec"`
	Velocity float64 `json:"velocity"`
	Hangul   *struct {
		Onset string `json:"onset"`
		Vowel string `json:"vowel"`
		Coda  string `json:"coda"`
	} `json:"hangul,omitempty"`
}
type singingRequest struct {
	Port    int    `json:"port"`
	Format  string `json:"format"`
	Version int    `json:"version"`
	Project string `json:"project"`
	Voice   struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		Rights string `json:"rights"`
	} `json:"voice"`
	Checkpoint *struct {
		ID       string `json:"id"`
		Name     string `json:"name"`
		EngineID string `json:"engineId"`
	} `json:"checkpoint"`
	BPM      float64      `json:"bpm"`
	Cues     []singingCue `json:"cues"`
	Phonemes []struct {
		CueIndex int     `json:"cueIndex"`
		Token    string  `json:"token"`
		Kind     string  `json:"kind"`
		Pitch    float64 `json:"pitch"`
		StartSec float64 `json:"startSec"`
		EndSec   float64 `json:"endSec"`
	} `json:"phonemes,omitempty"`
}

func safeSingingPort(p int) bool { return p >= 1024 && p <= 65535 && p != 58319 }
func (a *appServer) authorizeSinging(w http.ResponseWriter, r *http.Request) bool {
	host := r.Host
	if !(strings.HasPrefix(host, "127.0.0.1:") || strings.HasPrefix(host, "[::1]:")) || (r.Header.Get("Origin") != "" && r.Header.Get("Origin") != "http://"+host) || r.Header.Get("X-MYVOCAL-Session") != a.sessionKey {
		jsonError(w, http.StatusForbidden, "앱 전용 요청이 아닙니다.")
		return false
	}
	return true
}
func singingClient() *http.Client {
	// No proxy env variables or redirects: all requests always target loopback.
	return &http.Client{Timeout: 115 * time.Second, CheckRedirect: func(r *http.Request, via []*http.Request) error { return http.ErrUseLastResponse }, Transport: &http.Transport{Proxy: nil, ResponseHeaderTimeout: 105 * time.Second, DisableKeepAlives: true}}
}
func (a *appServer) singingHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, 405, "GET 요청만 지원합니다.")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	port, e := strconv.Atoi(r.URL.Query().Get("port"))
	if e != nil || !safeSingingPort(port) {
		jsonError(w, 400, "허용되지 않은 로컬 엔진 포트입니다.")
		return
	}
	req, e := http.NewRequestWithContext(r.Context(), "GET", fmt.Sprintf("http://127.0.0.1:%d/health", port), nil)
	if e != nil {
		jsonError(w, 500, "엔진 요청 오류")
		return
	}
	res, e := singingClient().Do(req)
	if e != nil {
		jsonError(w, 502, "추론 서버가 응답하지 않습니다. 엔진 실행 여부와 포트를 확인하세요.")
		return
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		jsonError(w, 502, fmt.Sprintf("추론 서버 연결 실패 (HTTP %d)", res.StatusCode))
		return
	}
	var info struct {
		Name     string `json:"name"`
		Status   string `json:"status"`
		Protocol string `json:"protocol"`
	}
	if e = json.NewDecoder(io.LimitReader(res.Body, 8192)).Decode(&info); e != nil || info.Status != "ok" || info.Protocol != "MYVOCAL_SINGING_V1" {
		jsonError(w, 502, "호환되지 않는 엔진입니다. /health에서 status=ok, protocol=MYVOCAL_SINGING_V1이 필요합니다.")
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]string{"name": info.Name, "status": "ok", "protocol": info.Protocol})
}
func (a *appServer) singingRender(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, 405, "POST 요청만 지원합니다.")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxSingingPayload)
	var input singingRequest
	if e := json.NewDecoder(r.Body).Decode(&input); e != nil {
		jsonError(w, 400, "보컬 요청 JSON의 형식 또는 크기가 잘못됐습니다.")
		return
	}
	if !safeSingingPort(input.Port) || input.Format != "MYVOCAL_SINGING_REQUEST" || input.Version != 1 || input.Voice.Rights != "self" && input.Voice.Rights != "owned" && input.Voice.Rights != "licensed" {
		jsonError(w, 400, "엔진 포트 또는 목소리 권한이 잘못됐습니다.")
		return
	}
	if len(input.Cues) < 1 || len(input.Cues) > 128 || input.BPM < 40 || input.BPM > 240 || len(input.Voice.ID) > 150 || len(input.Project) > 300 || len(input.Voice.Name) > 300 {
		jsonError(w, 400, "보컬 요청이 허용된 범위를 벗어났습니다.")
		return
	}
	for _, c := range input.Cues {
		if c.Pitch < 36 || c.Pitch > 96 || c.StartSec < 0 || c.EndSec <= c.StartSec || c.EndSec > 90 || len(c.Lyric) > 240 || c.Velocity < 0 || c.Velocity > 127 || (c.Hangul != nil && (len(c.Hangul.Onset) > 16 || len(c.Hangul.Vowel) > 16 || len(c.Hangul.Coda) > 16)) {
			jsonError(w, 400, "잘못된 보컬 음표 데이터입니다.")
			return
		}
	}
	if len(input.Phonemes) > 512 {
		jsonError(w, 400, "발음 구간은 최대 512개까지 허용됩니다.")
		return
	}
	last := map[int]float64{}
	for _, x := range input.Phonemes {
		if x.CueIndex < 1 || x.CueIndex > len(input.Cues) || len(x.Token) < 1 || len(x.Token) > 120 || x.StartSec < 0 || x.EndSec <= x.StartSec || x.EndSec > 90 || x.Pitch != input.Cues[x.CueIndex-1].Pitch ||
			x.StartSec < input.Cues[x.CueIndex-1].StartSec-0.001 || x.EndSec > input.Cues[x.CueIndex-1].EndSec+0.001 ||
			!(x.Kind == "onset" || x.Kind == "nucleus" || x.Kind == "coda" || x.Kind == "text") ||
			(last[x.CueIndex] != 0 && x.StartSec < last[x.CueIndex]-0.00011) {
			jsonError(w, 400, "발음 시간 구간 또는 표기가 유효하지 않습니다.")
			return
		}
		last[x.CueIndex] = x.EndSec
	}
	// Port controls only an integer; the hostname is hardcoded to 127.0.0.1.
	payload, e := json.Marshal(input)
	if e != nil {
		jsonError(w, 500, "보컬 요청 인코딩 오류")
		return
	}
	req, e := http.NewRequestWithContext(r.Context(), "POST", fmt.Sprintf("http://127.0.0.1:%d/v1/sing", input.Port), bytes.NewReader(payload))
	if e != nil {
		jsonError(w, 500, "보컬 엔진 요청 오류")
		return
	}
	req.Header.Set("Content-Type", "application/json")
	res, e := singingClient().Do(req)
	if e != nil {
		jsonError(w, 502, "로컬 가창 엔진에 연결하지 못했습니다. 실행 상태를 확인하세요.")
		return
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		jsonError(w, 502, fmt.Sprintf("외부 가창 엔진 실패 (HTTP %d)", res.StatusCode))
		return
	}
	buf, e := io.ReadAll(io.LimitReader(res.Body, maxSingingWAV+1))
	if e != nil || len(buf) > maxSingingWAV {
		jsonError(w, 502, "WAV 응답을 읽지 못했거나 32MB를 초과했습니다.")
		return
	}
	if !validSingingWAV(buf) {
		jsonError(w, 502, "추론 서버 응답이 손상되었거나 지원하지 않는 WAV 형식입니다.")
		return
	}
	w.Header().Set("Content-Type", "audio/wav")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = w.Write(buf)
}
