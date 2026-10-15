package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
)

func syntheticVideoRequest(t *testing.T, port int) videoGenerateRequest {
	t.Helper()
	i := image.NewRGBA(image.Rect(0, 0, 512, 512))
	var b bytes.Buffer
	if err := png.Encode(&b, i); err != nil {
		t.Fatal(err)
	}
	return videoGenerateRequest{Port: port, Checkpoint: "svd_xt.safetensors", ImageData: "data:image/png;base64," + base64.StdEncoding.EncodeToString(b.Bytes()), Frames: 14, FPS: 6, Steps: 20, Motion: 127, Seed: 4}
}
func TestSVDVideoValidationAndWorkflow(t *testing.T) {
	x := syntheticVideoRequest(t, 8188)
	if _, _, e := validateVideoRequest(x); e != nil {
		t.Fatal(e)
	}
	flow := svdWorkflow(x, "start.png")
	if flow["3"].(map[string]any)["class_type"] != "SVD_img2vid_Conditioning" || flow["7"].(map[string]any)["class_type"] != "SaveAnimatedWEBP" {
		t.Fatal("wrong workflow")
	}
	for _, bad := range []func(*videoGenerateRequest){func(x *videoGenerateRequest) { x.Checkpoint = "../unsafe" }, func(x *videoGenerateRequest) { x.Frames = 200 }, func(x *videoGenerateRequest) { x.ImageData = "data:image/png;base64,YmFk" }, func(x *videoGenerateRequest) { x.Port = 58319 }, func(x *videoGenerateRequest) { x.Motion = -1 }, func(x *videoGenerateRequest) { x.Steps = 0 }} {
		copy := x
		bad(&copy)
		if _, _, e := validateVideoRequest(copy); e == nil {
			t.Fatal("accepted invalid video request", copy.Frames, copy.Checkpoint)
		}
	}
}
func TestSVDWebpAndHistory(t *testing.T) {
	raw, e := os.ReadFile("testdata/step78-synthetic-14.webp")
	if e != nil {
		t.Fatal(e)
	}
	if n, e := webpAnimationFrames(raw); e != nil || n != 14 {
		t.Fatalf("n=%d err=%v", n, e)
	}
	corrupt := append([]byte(nil), raw...)
	corrupt[4] = 0
	if _, e := webpAnimationFrames(corrupt); e == nil {
		t.Fatal("corrupt RIFF accepted")
	}
	for _, tt := range []struct {
		payload       string
		ready, failed bool
	}{
		{`{"job-test-1234":{"status":{"completed":true,"status_str":"success"},"outputs":{"7":{"images":[{"filename":"mv.webp","subfolder":"","type":"output"}]}}}}`, true, false},
		{`{"job-test-1234":{"status":{"completed":true,"status_str":"success"},"outputs":{"7":{"images":[{"filename":"../private.webp","subfolder":"","type":"output"}]}}}}`, false, true},
		{`{"job-test-1234":{"status":{"status_str":"error","completed":false}}}`, false, true},
		{`{}`, false, false},
	} {
		_, _, ok, err := historyVideo([]byte(tt.payload), "job-test-1234")
		if ok != tt.ready || (err != nil) != tt.failed {
			t.Fatalf("history unexpected %v %v", ok, err)
		}
	}
}
func TestSVDLocalComfyBridgeMock(t *testing.T) {
	movie, e := os.ReadFile("testdata/step78-synthetic-14.webp")
	if e != nil {
		t.Fatal(e)
	}
	requests := map[string]int{}
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests[r.URL.Path]++
		switch {
		case strings.HasPrefix(r.URL.Path, "/object_info/"):
			name := strings.TrimPrefix(r.URL.Path, "/object_info/")
			if name == "ImageOnlyCheckpointLoader" {
				fmt.Fprint(w, `{"ImageOnlyCheckpointLoader":{"input":{"required":{"ckpt_name":[["svd_xt.safetensors"]]}}}}`)
			} else {
				fmt.Fprintf(w, `{"%s":{}}`, name)
			}
		case r.URL.Path == "/upload/image":
			f, h, e := r.FormFile("image")
			if e != nil {
				t.Error(e)
				w.WriteHeader(400)
				return
			}
			defer f.Close()
			if !strings.HasPrefix(h.Filename, "MYVOCAL_78_") || r.FormValue("type") != "input" {
				t.Error("bad uploaded input")
			}
			fmt.Fprintf(w, `{"name":%q,"subfolder":"","type":"input"}`, h.Filename)
		case r.URL.Path == "/prompt":
			var parsed map[string]any
			_ = json.NewDecoder(r.Body).Decode(&parsed)
			nodes := parsed["prompt"].(map[string]any)
			if nodes["7"].(map[string]any)["class_type"] != "SaveAnimatedWEBP" {
				t.Error("not a video workflow")
			}
			fmt.Fprint(w, `{"prompt_id":"job-test-1234"}`)
		case r.URL.Path == "/history/job-test-1234":
			fmt.Fprint(w, `{"job-test-1234":{"status":{"completed":true,"status_str":"success"},"outputs":{"7":{"images":[{"filename":"mv.webp","subfolder":"","type":"output"}]}}}}`)
		case r.URL.Path == "/view":
			if r.URL.Query().Get("filename") != "mv.webp" {
				t.Error("unexpected filename")
			}
			w.Header().Set("Content-Type", "image/webp")
			_, _ = w.Write(movie)
		default:
			t.Error("unexpected route", r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	defer backend.Close()
	_, portString, _ := net.SplitHostPort(strings.TrimPrefix(backend.URL, "http://"))
	port, _ := strconv.Atoi(portString)
	a := &appServer{sessionKey: "test-session"}
	health := httptest.NewRecorder()
	a.videoHealth(health, testImageAppRequest("GET", fmt.Sprintf("/api/video/health?port=%d", port), "test-session", nil))
	if health.Code != 200 || !strings.Contains(health.Body.String(), "svd_xt.safetensors") {
		t.Fatal(health.Code, health.Body.String())
	}
	payload, _ := json.Marshal(syntheticVideoRequest(t, port))
	denied := httptest.NewRecorder()
	a.videoGenerate(denied, testImageAppRequest("POST", "/api/video/generate", "", payload))
	if denied.Code != 403 {
		t.Fatal("missing session accepted", denied.Code)
	}
	ok := httptest.NewRecorder()
	a.videoGenerate(ok, testImageAppRequest("POST", "/api/video/generate", "test-session", payload))
	if ok.Code != 200 || !bytes.Equal(ok.Body.Bytes(), movie) || ok.Header().Get("Content-Type") != "image/webp" {
		t.Fatal("mock video flow failed", ok.Code, ok.Body.String())
	}
	if requests["/upload/image"] != 1 || requests["/prompt"] != 1 {
		t.Fatal("missing bridge actions", requests)
	}
}
