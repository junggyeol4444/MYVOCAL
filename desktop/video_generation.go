package main

// Step78: user-installed ComfyUI SVD image-to-video clip bridge (loopback only).
// This does not install models or synthesize video without a real local checkpoint.
import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const maxVideoSourceBytes = 12 << 20
const maxVideoResultBytes = 40 << 20
const maxVideoRequestBytes = 17 << 20

var requiredSVDNodes = []string{"ImageOnlyCheckpointLoader", "LoadImage", "SVD_img2vid_Conditioning", "VideoLinearCFGGuidance", "KSampler", "VAEDecode", "SaveAnimatedWEBP"}

type videoGenerateRequest struct {
	Port       int    `json:"port"`
	Checkpoint string `json:"checkpoint"`
	ImageData  string `json:"imageData"`
	Frames     int    `json:"frames"`
	FPS        int    `json:"fps"`
	Steps      int    `json:"steps"`
	Motion     int    `json:"motion"`
	Seed       int64  `json:"seed"`
}

func validateVideoRequest(x videoGenerateRequest) ([]byte, string, error) {
	if !comfyPortAllowed(x.Port) || !safeCheckpointName(x.Checkpoint) {
		return nil, "", errors.New("로컬 포트/비디오 모델 선택 오류")
	}
	if x.Frames != 14 && x.Frames != 25 {
		return nil, "", errors.New("SVD 영상 프레임은 14 또는 25만 허용합니다")
	}
	if x.FPS != 6 && x.FPS != 8 {
		return nil, "", errors.New("지원 FPS는 6 또는 8입니다")
	}
	if x.Steps < 1 || x.Steps > 40 || x.Motion < 1 || x.Motion > 255 || x.Seed < 0 || x.Seed > 9007199254740991 {
		return nil, "", errors.New("영상 생성 파라미터 범위 오류")
	}
	mime := ""
	switch {
	case strings.HasPrefix(x.ImageData, "data:image/png;base64,"):
		mime = "image/png"
	case strings.HasPrefix(x.ImageData, "data:image/jpeg;base64,"):
		mime = "image/jpeg"
	default:
		return nil, "", errors.New("시작 프레임은 PNG/JPEG 데이터여야 합니다")
	}
	encoded := x.ImageData[strings.IndexByte(x.ImageData, ',')+1:]
	if len(encoded) == 0 || len(encoded) > ((maxVideoSourceBytes+2)/3*4) {
		return nil, "", errors.New("시작 이미지 크기가 제한을 초과했습니다")
	}
	raw, err := base64.StdEncoding.Strict().DecodeString(encoded)
	if err != nil || len(raw) < 32 || len(raw) > maxVideoSourceBytes {
		return nil, "", errors.New("이미지 Base64 형식 또는 크기 오류")
	}
	if http.DetectContentType(raw) != mime {
		return nil, "", errors.New("이미지 선언 형식과 실제 바이트가 다릅니다")
	}
	cfg, format, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil || cfg.Width < 128 || cfg.Height < 128 || cfg.Width > 2048 || cfg.Height > 2048 || (mime == "image/png" && format != "png") || (mime == "image/jpeg" && format != "jpeg") {
		return nil, "", errors.New("시작 이미지 손상 또는 해상도 오류")
	}
	return raw, mime, nil
}
func videoComfyCall(ctx context.Context, port int, method, path, contentType string, body []byte) ([]byte, int, error) {
	if !comfyPortAllowed(port) {
		return nil, 0, errors.New("로컬 포트 오류")
	}
	req, err := http.NewRequestWithContext(ctx, method, comfyURL(port, path), bytes.NewReader(body))
	if err != nil {
		return nil, 0, err
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	resp, err := comfyClient().Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxVideoResultBytes+1))
	if err != nil {
		return nil, 0, err
	}
	if len(raw) > maxVideoResultBytes {
		return nil, 0, errors.New("ComfyUI 영상 응답 크기 초과")
	}
	return raw, resp.StatusCode, nil
}
func videoModels(raw []byte) ([]string, error) {
	// Same input schema as the image checkpoint loader, with an SVD-only model class.
	rewritten := bytes.Replace(raw, []byte(`"ImageOnlyCheckpointLoader"`), []byte(`"CheckpointLoaderSimple"`), 1)
	return availableCheckpoints(rewritten)
}
func availableVideoNodes(ctx context.Context, port int) ([]string, error) {
	missing := []string{}
	for _, name := range requiredSVDNodes {
		raw, status, err := videoComfyCall(ctx, port, "GET", "/object_info/"+name, "", nil)
		if err != nil || status != 200 {
			return nil, fmt.Errorf("ComfyUI 노드 %s 조회 실패", name)
		}
		var result map[string]json.RawMessage
		if json.Unmarshal(raw, &result) != nil || len(result[name]) == 0 {
			missing = append(missing, name)
		}
	}
	return missing, nil
}
func getSVDModels(ctx context.Context, port int) ([]string, error) {
	raw, status, err := videoComfyCall(ctx, port, "GET", "/object_info/ImageOnlyCheckpointLoader", "", nil)
	if err != nil || status != 200 {
		return nil, errors.New("ComfyUI SVD 모델 노드 연결 실패")
	}
	return videoModels(raw)
}
func (a *appServer) videoHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, 405, "GET 요청만 지원합니다")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	port, err := strconv.Atoi(r.URL.Query().Get("port"))
	if err != nil || !comfyPortAllowed(port) {
		jsonError(w, 400, "로컬 포트 오류")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	names, err := getSVDModels(ctx, port)
	if err != nil {
		jsonError(w, 502, err.Error())
		return
	}
	missing, err := availableVideoNodes(ctx, port)
	if err != nil {
		jsonError(w, 502, err.Error())
		return
	}
	jsonReply(w, map[string]any{"engine": "ComfyUI local SVD", "models": names, "missingNodes": missing, "ready": len(names) > 0 && len(missing) == 0, "format": "animated WebP"})
}
func svdWorkflow(x videoGenerateRequest, uploaded string) map[string]any {
	return map[string]any{
		"1": map[string]any{"class_type": "ImageOnlyCheckpointLoader", "inputs": map[string]any{"ckpt_name": x.Checkpoint}},
		"2": map[string]any{"class_type": "LoadImage", "inputs": map[string]any{"image": uploaded}},
		"3": map[string]any{"class_type": "SVD_img2vid_Conditioning", "inputs": map[string]any{"width": 1024, "height": 576, "video_frames": x.Frames, "motion_bucket_id": x.Motion, "fps": x.FPS, "augmentation_level": 0.02, "clip_vision": []any{"1", 1}, "init_image": []any{"2", 0}, "vae": []any{"1", 2}}},
		"4": map[string]any{"class_type": "VideoLinearCFGGuidance", "inputs": map[string]any{"model": []any{"1", 0}, "min_cfg": 1.0}},
		"5": map[string]any{"class_type": "KSampler", "inputs": map[string]any{"seed": x.Seed, "steps": x.Steps, "cfg": 2.5, "sampler_name": "euler", "scheduler": "karras", "denoise": 1.0, "model": []any{"4", 0}, "positive": []any{"3", 0}, "negative": []any{"3", 1}, "latent_image": []any{"3", 2}}},
		"6": map[string]any{"class_type": "VAEDecode", "inputs": map[string]any{"samples": []any{"5", 0}, "vae": []any{"1", 2}}},
		"7": map[string]any{"class_type": "SaveAnimatedWEBP", "inputs": map[string]any{"images": []any{"6", 0}, "filename_prefix": "MYVOCAL_Step78", "fps": x.FPS, "lossless": false, "quality": 80, "method": "default"}},
	}
}
func videoUpload(ctx context.Context, port int, raw []byte, mime string) (string, error) {
	secret := make([]byte, 12)
	if _, err := rand.Read(secret); err != nil {
		return "", err
	}
	ext := "png"
	if mime == "image/jpeg" {
		ext = "jpg"
	}
	name := "MYVOCAL_78_" + hex.EncodeToString(secret) + "." + ext
	var b bytes.Buffer
	mw := multipart.NewWriter(&b)
	part, err := mw.CreateFormFile("image", name)
	if err != nil {
		return "", err
	}
	if _, err = part.Write(raw); err != nil {
		return "", err
	}
	_ = mw.WriteField("type", "input")
	_ = mw.WriteField("overwrite", "false")
	if err = mw.Close(); err != nil {
		return "", err
	}
	response, status, err := videoComfyCall(ctx, port, "POST", "/upload/image", mw.FormDataContentType(), b.Bytes())
	if err != nil || status != 200 {
		return "", fmt.Errorf("ComfyUI 시작 프레임 등록 실패 (HTTP %d)", status)
	}
	var upload struct {
		Name      string `json:"name"`
		Subfolder string `json:"subfolder"`
		Type      string `json:"type"`
	}
	if json.Unmarshal(response, &upload) != nil || upload.Name != name || upload.Subfolder != "" || upload.Type != "input" {
		return "", errors.New("ComfyUI 이미지 등록 응답이 올바르지 않습니다")
	}
	return name, nil
}
func historyVideo(raw []byte, id string) (string, string, bool, error) {
	var entries map[string]struct {
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
	if json.Unmarshal(raw, &entries) != nil {
		return "", "", false, errors.New("ComfyUI 영상 작업 기록 오류")
	}
	entry, ok := entries[id]
	if !ok {
		return "", "", false, nil
	}
	if entry.Status.StatusStr == "error" {
		return "", "", false, errors.New("ComfyUI 영상 생성 실패")
	}
	for _, item := range entry.Outputs["7"].Images {
		if item.Type != "output" || !strings.HasSuffix(strings.ToLower(item.Filename), ".webp") || !safeComfyFilename(item.Filename, item.Subfolder) {
			continue
		}
		return item.Filename, item.Subfolder, true, nil
	}
	if entry.Status.Completed {
		return "", "", false, errors.New("영상 작업 완료 후 WebP 출력이 없습니다")
	}
	return "", "", false, nil
}
func safeComfyFilename(name, sub string) bool {
	return name != "" && len(name) <= 220 && len(sub) <= 220 && !strings.ContainsAny(name, "\\/\x00\r\n") && !strings.Contains(name, "..") && !strings.ContainsAny(sub, "\\\x00\r\n") && !strings.Contains(sub, "..")
}
func webpAnimationFrames(data []byte) (int, error) {
	if len(data) < 30 || string(data[:4]) != "RIFF" || string(data[8:12]) != "WEBP" {
		return 0, errors.New("영상은 WebP 파일이 아닙니다")
	}
	size := uint64(binary.LittleEndian.Uint32(data[4:8])) + 8
	if size != uint64(len(data)) {
		return 0, errors.New("WebP 파일 크기 오류")
	}
	count, animated := 0, false
	for at := 12; at+8 <= len(data); {
		name := string(data[at : at+4])
		sz := uint64(binary.LittleEndian.Uint32(data[at+4 : at+8]))
		end := uint64(at) + 8 + sz
		if end > uint64(len(data)) {
			return 0, errors.New("WebP 청크가 손상됐습니다")
		}
		if name == "VP8X" && sz >= 10 && data[at+8]&0x02 != 0 {
			animated = true
		}
		if name == "ANMF" {
			count++
		}
		at = int(end + sz%2)
		if at > len(data) {
			return 0, errors.New("WebP 패딩 오류")
		}
	}
	if !animated || count < 2 || count > 50 {
		return 0, errors.New("애니메이션 프레임이 없는 WebP 또는 제한 초과")
	}
	return count, nil
}
func (a *appServer) videoGenerate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, 405, "POST 요청만 지원합니다")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxVideoRequestBytes)
	var input videoGenerateRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		jsonError(w, 400, "영상 요청 JSON이 올바르지 않습니다")
		return
	}
	source, mime, err := validateVideoRequest(input)
	if err != nil {
		jsonError(w, 400, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Minute)
	defer cancel()
	names, err := getSVDModels(ctx, input.Port)
	if err != nil {
		jsonError(w, 502, err.Error())
		return
	}
	found := false
	for _, n := range names {
		if n == input.Checkpoint {
			found = true
			break
		}
	}
	if !found {
		jsonError(w, 400, "로컬 SVD 모델을 찾지 못했습니다")
		return
	}
	missing, err := availableVideoNodes(ctx, input.Port)
	if err != nil {
		jsonError(w, 502, err.Error())
		return
	}
	if len(missing) > 0 {
		jsonError(w, 400, "ComfyUI 필수 영상 노드가 없습니다: "+strings.Join(missing, ", "))
		return
	}
	uploaded, err := videoUpload(ctx, input.Port, source, mime)
	if err != nil {
		jsonError(w, 502, err.Error())
		return
	}
	task, _ := json.Marshal(map[string]any{"prompt": svdWorkflow(input, uploaded), "client_id": "MYVOCAL_Step78"})
	result, status, err := videoComfyCall(ctx, input.Port, "POST", "/prompt", "application/json", task)
	if err != nil || status != 200 {
		jsonError(w, 502, fmt.Sprintf("ComfyUI 영상 작업 등록 실패 (HTTP %d)", status))
		return
	}
	var posted struct {
		PromptID string `json:"prompt_id"`
	}
	if json.Unmarshal(result, &posted) != nil || len(posted.PromptID) < 8 || len(posted.PromptID) > 100 || strings.ContainsAny(posted.PromptID, "/\\\x00\r\n") {
		jsonError(w, 502, "영상 작업 ID 오류")
		return
	}
	ticker := time.NewTicker(1500 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			jsonError(w, 504, "영상 생성 취소 또는 시간 초과")
			return
		case <-ticker.C:
			raw, status, err := videoComfyCall(ctx, input.Port, "GET", "/history/"+url.PathEscape(posted.PromptID), "", nil)
			if err != nil || status != 200 {
				continue
			}
			file, sub, done, e := historyVideo(raw, posted.PromptID)
			if e != nil {
				jsonError(w, 502, e.Error())
				return
			}
			if !done {
				continue
			}
			q := url.Values{"filename": {file}, "subfolder": {sub}, "type": {"output"}}
			frames, status, e := videoComfyCall(ctx, input.Port, "GET", "/view?"+q.Encode(), "", nil)
			if e != nil || status != 200 {
				jsonError(w, 502, "생성 영상 파일을 읽을 수 없습니다")
				return
			}
			count, e := webpAnimationFrames(frames)
			if e != nil || count != input.Frames {
				jsonError(w, 502, "생성된 영상 프레임 검증 실패")
				return
			}
			payload, kind := frames, "image/webp"
			w.Header().Set("Content-Type", kind)
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("X-MYVOCAL-Video-Frames", strconv.Itoa(count))
			w.Header().Set("X-MYVOCAL-Video-FPS", strconv.Itoa(input.FPS))
			w.Write(payload)
			return
		}
	}
}
