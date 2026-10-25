package main

// Step79: user-attested photograph -> locally generated scene still (img2img).
// This is NOT facial identity recognition or a guarantee of matching likeness.
// The generated still can be sent through the existing Step78 SVD clip engine.
import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type personMVRequest struct {
	Port           int     `json:"port"`
	Checkpoint     string  `json:"checkpoint"`
	Prompt         string  `json:"prompt"`
	Negative       string  `json:"negative"`
	ImageData      string  `json:"imageData"`
	Width          int     `json:"width"`
	Height         int     `json:"height"`
	Steps          int     `json:"steps"`
	Seed           int64   `json:"seed"`
	Denoise        float64 `json:"denoise"`
	RightsAttested bool    `json:"rightsAttested"`
	// 원본 13·58항: 모델이 MYVOCAL에서 실제 생성한 첫 가수 이미지만 자동 재참조.
	// 실존 인물의 사진 권한 동의와 자동 생성 원본 출처는 섞어 취급하지 않는다.
	GeneratedInProject bool `json:"generatedInProject"`
	SourceProjectID string `json:"sourceProjectId"`
	SourceSceneID string `json:"sourceSceneId"`
	SourceAssetID string `json:"sourceAssetId"`
	SourceKey string `json:"sourceKey"`
}

func validatePersonMVRequest(x personMVRequest, automatic bool) ([]byte, string, error) {
	if automatic {
		validOrigin := func(s string) bool {
			if len(s)<1||len(s)>120 {return false}
			for _,r:=range s {if !(r>='a'&&r<='z'||r>='A'&&r<='Z'||r>='0'&&r<='9'||r=='_'||r=='-') {return false}}
			return true
		}
		if x.RightsAttested||!x.GeneratedInProject||!validOrigin(x.SourceProjectID)||
			!validOrigin(x.SourceSceneID)||!strings.HasPrefix(x.SourceAssetID,"img_")||
			!validOrigin(x.SourceAssetID)||len(x.SourceKey)<1||len(x.SourceKey)>8192||
			strings.ContainsAny(x.SourceKey,"\x00\r\n") {
			return nil,"",errors.New("자동 생성 가수의 프로젝트·첫 이미지 출처와 장면 식별 정보를 확인하세요")
		}
	} else if !x.RightsAttested {
		return nil, "", errors.New("본인 또는 사용 허가를 받은 사진임을 확인해야 합니다")
	}
	if err := validateImageRequest(imageGenerationRequest{Port: x.Port, Checkpoint: x.Checkpoint, Prompt: x.Prompt, Negative: x.Negative, Width: x.Width, Height: x.Height, Steps: x.Steps, Seed: x.Seed}); err != nil {
		return nil, "", err
	}
	if x.Denoise < 0.15 || x.Denoise > 0.75 {
		return nil, "", errors.New("사진 변환 강도 범위: 0.15~0.75")
	}
	source := videoGenerateRequest{Port: x.Port, Checkpoint: x.Checkpoint, ImageData: x.ImageData, Frames: 14, FPS: 6, Steps: 1, Motion: 127, Seed: x.Seed}
	raw, mime, err := validateVideoRequest(source)
	if err != nil {
		return nil, "", err
	}
	return raw, mime, nil
}

func buildPersonMVWorkflow(x personMVRequest, uploaded string) map[string]any {
	return map[string]any{
		"1": map[string]any{"class_type": "CheckpointLoaderSimple", "inputs": map[string]any{"ckpt_name": x.Checkpoint}},
		"2": map[string]any{"class_type": "CLIPTextEncode", "inputs": map[string]any{"text": x.Prompt, "clip": []any{"1", 1}}},
		"3": map[string]any{"class_type": "CLIPTextEncode", "inputs": map[string]any{"text": x.Negative, "clip": []any{"1", 1}}},
		"4": map[string]any{"class_type": "LoadImage", "inputs": map[string]any{"image": uploaded}},
		"5": map[string]any{"class_type": "ImageScale", "inputs": map[string]any{"image": []any{"4", 0}, "upscale_method": "lanczos", "width": x.Width, "height": x.Height, "crop": "center"}},
		"6": map[string]any{"class_type": "VAEEncode", "inputs": map[string]any{"pixels": []any{"5", 0}, "vae": []any{"1", 2}}},
		"7": map[string]any{"class_type": "KSampler", "inputs": map[string]any{"seed": x.Seed, "steps": x.Steps, "cfg": 7.0, "sampler_name": "euler", "scheduler": "normal", "denoise": x.Denoise, "model": []any{"1", 0}, "positive": []any{"2", 0}, "negative": []any{"3", 0}, "latent_image": []any{"6", 0}}},
		"8": map[string]any{"class_type": "VAEDecode", "inputs": map[string]any{"samples": []any{"7", 0}, "vae": []any{"1", 2}}},
		"9": map[string]any{"class_type": "SaveImage", "inputs": map[string]any{"images": []any{"8", 0}, "filename_prefix": "MYVOCAL_Step79"}},
	}
}
func personImageOutput(raw []byte, id string) (string, string, bool, error) {
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
		return "", "", false, errors.New("ComfyUI 기록 형식 오류")
	}
	entry, ok := entries[id]
	if !ok {
		return "", "", false, nil
	}
	if entry.Status.StatusStr == "error" {
		return "", "", false, errors.New("사진 기반 장면 생성 작업 실패")
	}
	for _, v := range entry.Outputs["9"].Images {
		if v.Type == "output" && safeComfyFilename(v.Filename, v.Subfolder) {
			return v.Filename, v.Subfolder, true, nil
		}
	}
	if entry.Status.Completed {
		return "", "", false, errors.New("생성 완료 기록에 결과 이미지가 없습니다")
	}
	return "", "", false, nil
}

// Both Step79 and Step80 use the same validated local img2img transport.
// Character mode has its own route and SaveImage prefix; existing Step79 behavior is unchanged.
func (a *appServer) personMVGenerate(w http.ResponseWriter, r *http.Request) {
	a.referenceMVGenerate(w, r, false, false)
}
func (a *appServer) characterMVGenerate(w http.ResponseWriter, r *http.Request) {
	a.referenceMVGenerate(w, r, true, false)
}
// AI 자동 가수 이미지는 사용자 사진·등록 캐릭터 권한을 허위 확인하지 않는다.
// 본인 프로젝트의 생성 이력이 연결된 이미지에만 이 전용 경로를 사용한다.
func (a *appServer) autoSingerMVGenerate(w http.ResponseWriter, r *http.Request) {
	a.referenceMVGenerate(w, r, false, true)
}
func (a *appServer) referenceMVGenerate(w http.ResponseWriter, r *http.Request, character, automatic bool) {
	if r.Method != http.MethodPost {
		jsonError(w, 405, "POST 요청만 지원합니다")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxVideoRequestBytes)
	var x personMVRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&x); err != nil {
		jsonError(w, 400, "Image-to-MV 요청 JSON 또는 크기 오류")
		return
	}
	rawImage, mime, err := validatePersonMVRequest(x,automatic)
	if err != nil {
		jsonError(w, 400, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 220*time.Second)
	defer cancel()
	// Recheck checkpoint and required img2img nodes rather than silently running txt2img.
	raw, code, err := comfyCall(ctx, x.Port, "GET", "/object_info/CheckpointLoaderSimple", nil)
	if err != nil || code != 200 {
		jsonError(w, 502, "ComfyUI 이미지 모델 조회 실패")
		return
	}
	names, err := availableCheckpoints(raw)
	if err != nil {
		jsonError(w, 502, err.Error())
		return
	}
	found := false
	for _, n := range names {
		if n == x.Checkpoint {
			found = true
			break
		}
	}
	if !found {
		jsonError(w, 400, "선택한 체크포인트가 없습니다")
		return
	}
	for _, node := range []string{"LoadImage", "ImageScale", "VAEEncode", "KSampler", "VAEDecode", "SaveImage"} {
		body, status, callErr := comfyCall(ctx, x.Port, "GET", "/object_info/"+node, nil)
		var nodes map[string]json.RawMessage
		if callErr != nil || status != 200 || json.Unmarshal(body, &nodes) != nil || len(nodes[node]) == 0 {
			jsonError(w, 502, "필수 ComfyUI 노드 없음: "+node)
			return
		}
	}
	uploaded, err := videoUpload(ctx, x.Port, rawImage, mime)
	if err != nil {
		jsonError(w, 502, err.Error())
		return
	}
	workflow := buildPersonMVWorkflow(x, uploaded)
	clientID := "MYVOCAL_Step79"
	if character {
		clientID = "MYVOCAL_Step80"
		workflow["9"].(map[string]any)["inputs"].(map[string]any)["filename_prefix"] = "MYVOCAL_Step80"
	} else if automatic {
		clientID = "MYVOCAL_AutoSinger"
		workflow["9"].(map[string]any)["inputs"].(map[string]any)["filename_prefix"] = "MYVOCAL_AutoSinger"
	}
	payload, _ := json.Marshal(map[string]any{"prompt": workflow, "client_id": clientID})
	body, status, err := videoComfyCall(ctx, x.Port, "POST", "/prompt", "application/json", payload)
	if err != nil || status != 200 {
		jsonError(w, 502, fmt.Sprintf("사진 기반 생성 등록 실패 (HTTP %d)", status))
		return
	}
	var posted struct {
		PromptID string `json:"prompt_id"`
	}
	if json.Unmarshal(body, &posted) != nil || len(posted.PromptID) < 8 || len(posted.PromptID) > 100 || strings.ContainsAny(posted.PromptID, "/\\\x00\r\n") {
		jsonError(w, 502, "생성 작업 ID 오류")
		return
	}
	ticker := time.NewTicker(1200 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			jsonError(w, 504, "사진 기반 장면 생성 취소 또는 시간 초과")
			return
		case <-ticker.C:
			history, status, e := comfyCall(ctx, x.Port, "GET", "/history/"+url.PathEscape(posted.PromptID), nil)
			if e != nil || status != 200 {
				continue
			}
			filename, sub, done, e := personImageOutput(history, posted.PromptID)
			if e != nil {
				jsonError(w, 502, e.Error())
				return
			}
			if !done {
				continue
			}
			query := url.Values{"filename": {filename}, "subfolder": {sub}, "type": {"output"}}
			img, code, e := comfyCall(ctx, x.Port, "GET", "/view?"+query.Encode(), nil)
			if e != nil || code != 200 {
				jsonError(w, 502, "이미지 수신 실패")
				return
			}
			contentType := http.DetectContentType(img)
			if contentType != "image/png" && contentType != "image/jpeg" {
				jsonError(w, 502, "ComfyUI 결과 형식은 PNG/JPEG여야 합니다")
				return
			}
			dims, _, e := image.DecodeConfig(bytes.NewReader(img))
			if e != nil || dims.Width != x.Width || dims.Height != x.Height {
				jsonError(w, 502, "장면 이미지 해상도가 요청과 다릅니다")
				return
			}
			w.Header().Set("Content-Type", contentType)
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("X-Content-Type-Options", "nosniff")
			_, _ = w.Write(img)
			return
		}
	}
}
