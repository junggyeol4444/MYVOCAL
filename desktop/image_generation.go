package main

// Step77: local-only ComfyUI (user-managed) image inference bridge.
// No model download, public API, arbitrary URL forwarding, or off-device calls.
import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const imageRequestLimit = 12 << 10
const imageByteLimit = 12 << 20

type imageGenerationRequest struct {
	Port       int    `json:"port"`
	Checkpoint string `json:"checkpoint"`
	Prompt     string `json:"prompt"`
	Negative   string `json:"negative"`
	Width      int    `json:"width"`
	Height     int    `json:"height"`
	Steps      int    `json:"steps"`
	Seed       int64  `json:"seed"`
}

func comfyPortAllowed(p int) bool { return p >= 1024 && p <= 65535 && p != 58319 }
func comfyClient() *http.Client {
	return &http.Client{Timeout: 40 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }, Transport: &http.Transport{Proxy: nil, ResponseHeaderTimeout: 30 * time.Second, DisableKeepAlives: true}}
}
func comfyURL(port int, suffix string) string {
	return fmt.Sprintf("http://127.0.0.1:%d%s", port, suffix)
}
func comfyCall(ctx context.Context, port int, method, path string, body []byte) ([]byte, int, error) {
	if !comfyPortAllowed(port) {
		return nil, 0, errors.New("허용되지 않은 로컬 엔진 포트입니다")
	}
	req, err := http.NewRequestWithContext(ctx, method, comfyURL(port, path), bytes.NewReader(body))
	if err != nil {
		return nil, 0, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := comfyClient().Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, imageByteLimit+1))
	if err != nil {
		return nil, 0, err
	}
	if len(raw) > imageByteLimit {
		return nil, 0, errors.New("로컬 엔진 응답 크기 초과")
	}
	return raw, resp.StatusCode, nil
}
func jsonReply(w http.ResponseWriter, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(data)
}
func safeCheckpointName(name string) bool {
	return len(name) > 0 && len(name) <= 220 && !strings.ContainsAny(name, "\x00\r\n") && !strings.Contains(name, "..") && !strings.HasPrefix(name, "/") && !strings.HasPrefix(name, "\\")
}
func availableCheckpoints(raw []byte) ([]string, error) {
	var root map[string]struct {
		Input struct {
			Required map[string]json.RawMessage `json:"required"`
		} `json:"input"`
	}
	if err := json.Unmarshal(raw, &root); err != nil {
		return nil, err
	}
	node, ok := root["CheckpointLoaderSimple"]
	if !ok {
		return nil, errors.New("ComfyUI CheckpointLoaderSimple 노드를 사용할 수 없습니다")
	}
	var tuple []json.RawMessage
	if err := json.Unmarshal(node.Input.Required["ckpt_name"], &tuple); err != nil || len(tuple) < 1 {
		return nil, errors.New("사용 가능한 체크포인트 목록이 없습니다")
	}
	var choices []string
	if err := json.Unmarshal(tuple[0], &choices); err != nil {
		return nil, errors.New("체크포인트 목록 형식이 올바르지 않습니다")
	}
	valid := make([]string, 0, len(choices))
	for _, c := range choices {
		if safeCheckpointName(c) {
			valid = append(valid, c)
		}
	}
	if len(valid) > 100 {
		valid = valid[:100]
	}
	return valid, nil
}
func (a *appServer) imageHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, 405, "GET 요청만 지원합니다")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	port, err := strconv.Atoi(r.URL.Query().Get("port"))
	if err != nil || !comfyPortAllowed(port) {
		jsonError(w, 400, "허용되지 않은 포트")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	raw, status, err := comfyCall(ctx, port, "GET", "/object_info/CheckpointLoaderSimple", nil)
	if err != nil {
		jsonError(w, 502, "로컬 ComfyUI 연결 실패: "+err.Error())
		return
	}
	if status != 200 {
		jsonError(w, 502, fmt.Sprintf("ComfyUI 노드 조회 실패 (HTTP %d)", status))
		return
	}
	names, err := availableCheckpoints(raw)
	if err != nil {
		jsonError(w, 502, err.Error())
		return
	}
	jsonReply(w, map[string]any{"engine": "ComfyUI local", "checkpoints": names, "ready": len(names) > 0})
}
func validateImageRequest(x imageGenerationRequest) error {
	if !comfyPortAllowed(x.Port) {
		return errors.New("로컬 엔진 포트 범위 오류")
	}
	if !safeCheckpointName(x.Checkpoint) {
		return errors.New("체크포인트 선택 오류")
	}
	if len(x.Prompt) < 5 || len(x.Prompt) > 3000 || len(x.Negative) > 1500 || strings.ContainsRune(x.Prompt, 0) || strings.ContainsRune(x.Negative, 0) {
		return errors.New("프롬프트 길이 또는 내용 오류")
	}
	if x.Width < 256 || x.Width > 1024 || x.Height < 256 || x.Height > 1024 || x.Width%64 != 0 || x.Height%64 != 0 || x.Width*x.Height > 1024*1024 {
		return errors.New("이미지 크기: 256~1024, 64의 배수만 지원")
	}
	if x.Steps < 1 || x.Steps > 50 || x.Seed < 0 || x.Seed > 9007199254740991 {
		return errors.New("스텝 또는 시드 범위 오류")
	}
	return nil
}
func buildComfyWorkflow(x imageGenerationRequest) map[string]any {
	return map[string]any{
		"1": map[string]any{"class_type": "CheckpointLoaderSimple", "inputs": map[string]any{"ckpt_name": x.Checkpoint}},
		"2": map[string]any{"class_type": "CLIPTextEncode", "inputs": map[string]any{"text": x.Prompt, "clip": []any{"1", 1}}},
		"3": map[string]any{"class_type": "CLIPTextEncode", "inputs": map[string]any{"text": x.Negative, "clip": []any{"1", 1}}},
		"4": map[string]any{"class_type": "EmptyLatentImage", "inputs": map[string]any{"width": x.Width, "height": x.Height, "batch_size": 1}},
		"5": map[string]any{"class_type": "KSampler", "inputs": map[string]any{"seed": x.Seed, "steps": x.Steps, "cfg": 7.0, "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0, "model": []any{"1", 0}, "positive": []any{"2", 0}, "negative": []any{"3", 0}, "latent_image": []any{"4", 0}}},
		"6": map[string]any{"class_type": "VAEDecode", "inputs": map[string]any{"samples": []any{"5", 0}, "vae": []any{"1", 2}}},
		"7": map[string]any{"class_type": "SaveImage", "inputs": map[string]any{"images": []any{"6", 0}, "filename_prefix": "MYVOCAL_Step77"}},
	}
}
func imageOutputFromHistory(raw []byte, id string) (string, string, bool, error) {
	var data map[string]struct {
		Outputs map[string]struct {
			Images []struct {
				Filename  string `json:"filename"`
				Subfolder string `json:"subfolder"`
				Type      string `json:"type"`
			} `json:"images"`
		} `json:"outputs"`
		Status struct {
			StatusStr string `json:"status_str"`
			Completed bool   `json:"completed"`
		} `json:"status"`
	}
	if json.Unmarshal(raw, &data) != nil {
		return "", "", false, errors.New("생성 기록 형식 오류")
	}
	history, ok := data[id]
	if !ok {
		return "", "", false, nil
	}
	if history.Status.StatusStr == "error" {
		return "", "", false, errors.New("ComfyUI 이미지 생성 중 오류 발생")
	}
	for _, img := range history.Outputs["7"].Images {
		if img.Type != "output" || len(img.Filename) > 220 || img.Filename == "" || strings.ContainsAny(img.Filename, "\\/\x00\r\n") || strings.Contains(img.Filename, "..") || strings.Contains(img.Subfolder, "..") || strings.ContainsAny(img.Subfolder, "\\\x00\r\n") || len(img.Subfolder) > 220 {
			continue
		}
		return img.Filename, img.Subfolder, true, nil
	}
	if history.Status.Completed {
		return "", "", false, errors.New("생성은 끝났지만 이미지가 없습니다")
	}
	return "", "", false, nil
}
func (a *appServer) imageGenerate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, 405, "POST 요청만 지원합니다")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, imageRequestLimit)
	var input imageGenerationRequest
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&input); err != nil {
		jsonError(w, 400, "이미지 요청 JSON 오류")
		return
	}
	if err := validateImageRequest(input); err != nil {
		jsonError(w, 400, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 220*time.Second)
	defer cancel()
	// Confirm the checkpoint actually exists in this LOCAL instance before queuing.
	raw, status, err := comfyCall(ctx, input.Port, "GET", "/object_info/CheckpointLoaderSimple", nil)
	if err != nil || status != 200 {
		jsonError(w, 502, "ComfyUI 체크포인트 목록 확인 실패")
		return
	}
	names, err := availableCheckpoints(raw)
	if err != nil {
		jsonError(w, 502, err.Error())
		return
	}
	found := false
	for _, name := range names {
		if name == input.Checkpoint {
			found = true
			break
		}
	}
	if !found {
		jsonError(w, 400, "선택된 로컬 체크포인트가 없습니다")
		return
	}
	workflow, _ := json.Marshal(map[string]any{"prompt": buildComfyWorkflow(input), "client_id": "MYVOCAL_Step77"})
	raw, status, err = comfyCall(ctx, input.Port, "POST", "/prompt", workflow)
	if err != nil || status != 200 {
		jsonError(w, 502, fmt.Sprintf("ComfyUI 작업 등록 실패 (HTTP %d)", status))
		return
	}
	var posted struct {
		PromptID   string          `json:"prompt_id"`
		NodeErrors json.RawMessage `json:"node_errors"`
	}
	if json.Unmarshal(raw, &posted) != nil || len(posted.PromptID) < 8 || len(posted.PromptID) > 100 {
		jsonError(w, 502, "ComfyUI 작업 ID를 확인할 수 없습니다")
		return
	}
	ticker := time.NewTicker(1200 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			jsonError(w, 504, "이미지 생성이 취소되었거나 시간 제한을 초과했습니다")
			return
		case <-ticker.C:
			history, status, err := comfyCall(ctx, input.Port, "GET", "/history/"+url.PathEscape(posted.PromptID), nil)
			if err != nil || status != 200 {
				continue
			}
			filename, subfolder, done, e := imageOutputFromHistory(history, posted.PromptID)
			if e != nil {
				jsonError(w, 502, e.Error())
				return
			}
			if !done {
				continue
			}
			view := url.Values{"filename": {filename}, "subfolder": {subfolder}, "type": {"output"}}
			payload, code, e := comfyCall(ctx, input.Port, "GET", "/view?"+view.Encode(), nil)
			if e != nil || code != 200 {
				jsonError(w, 502, "완성된 이미지 읽기 실패")
				return
			}
			contentType := http.DetectContentType(payload)
			if contentType != "image/png" && contentType != "image/jpeg" {
				jsonError(w, 502, "ComfyUI 결과는 PNG/JPEG여야 합니다")
				return
			}
			dimensions, _, decodeErr := image.DecodeConfig(bytes.NewReader(payload))
			if decodeErr != nil || dimensions.Width != input.Width || dimensions.Height != input.Height {
				jsonError(w, 502, "ComfyUI 이미지의 포맷 또는 생성 크기가 잘못됐습니다")
				return
			}
			w.Header().Set("Content-Type", contentType)
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Write(payload)
			return
		}
	}
}
