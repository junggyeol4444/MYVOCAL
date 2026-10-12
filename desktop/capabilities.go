package main

// Optional v1.1 engine-discovery endpoint. The app never fetches remote hosts:
// the user supplies only an integer port, and the bridge hardcodes 127.0.0.1.
// Capabilities are claims by an external process, not proof of neural inference.
import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
)

type engineModel struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	EngineID  string   `json:"engineId"`
	Languages []string `json:"languages"`
}
type engineCapabilities struct {
	Protocol           string        `json:"protocol"`
	Name               string        `json:"name"`
	Mode               string        `json:"mode"`
	InferenceReady     bool          `json:"inferenceReady"`
	Models             []engineModel `json:"models"`
	SupportedLanguages []string      `json:"supportedLanguages"`
	Features           []string      `json:"features"`
}

func capStringSafe(s string, n int) bool { return len(s) <= n && !strings.ContainsAny(s, "\x00\r\n") }
func validateEngineCapabilities(c *engineCapabilities) bool {
	if c.Protocol != "MYVOCAL_SINGING_V1" || !capStringSafe(c.Name, 120) || (c.Mode != "demo" && c.Mode != "neural" && c.Mode != "sample" && c.Mode != "unknown") || len(c.Models) > 48 || len(c.SupportedLanguages) > 20 || len(c.Features) > 30 {
		return false
	}
	for _, m := range c.Models {
		if m.ID == "" || !capStringSafe(m.ID, 100) || !capStringSafe(m.Name, 120) || !capStringSafe(m.EngineID, 60) || len(m.Languages) > 20 {
			return false
		}
		for _, l := range m.Languages {
			if !capStringSafe(l, 20) {
				return false
			}
		}
	}
	for _, l := range c.SupportedLanguages {
		if !capStringSafe(l, 20) {
			return false
		}
	}
	for _, f := range c.Features {
		if !capStringSafe(f, 40) {
			return false
		}
	}
	return true
}
func (a *appServer) singingCapabilities(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, 405, "GET 요청만 지원합니다.")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	port, err := strconv.Atoi(r.URL.Query().Get("port"))
	if err != nil || !safeSingingPort(port) {
		jsonError(w, 400, "허용되지 않은 로컬 엔진 포트입니다.")
		return
	}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, fmt.Sprintf("http://127.0.0.1:%d/v1/capabilities", port), nil)
	if err != nil {
		jsonError(w, 500, "엔진 요청 오류")
		return
	}
	res, err := singingClient().Do(req)
	if err != nil {
		jsonError(w, 502, "엔진을 찾을 수 없습니다. 실행 상태를 확인하세요.")
		return
	}
	defer res.Body.Close()
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if res.StatusCode == http.StatusNotFound || res.StatusCode == http.StatusNotImplemented {
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"supported": false, "mode": "unknown", "inferenceReady": false, "models": []engineModel{}, "note": "기존 v1.0 엔진: 모델 목록 조회를 지원하지 않습니다."})
		return
	}
	if res.StatusCode != http.StatusOK {
		jsonError(w, 502, fmt.Sprintf("엔진 모델 조회 실패 (HTTP %d)", res.StatusCode))
		return
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, 32769))
	if err != nil || len(body) > 32768 {
		jsonError(w, 502, "엔진 모델 정보가 너무 큽니다.")
		return
	}
	var info engineCapabilities
	if json.Unmarshal(body, &info) != nil || !validateEngineCapabilities(&info) {
		jsonError(w, 502, "엔진 모델 목록 형식이 올바르지 않습니다.")
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"supported": true, "protocol": info.Protocol, "name": info.Name, "mode": info.Mode, "inferenceReady": info.InferenceReady, "models": info.Models, "supportedLanguages": info.SupportedLanguages, "features": info.Features})
}
