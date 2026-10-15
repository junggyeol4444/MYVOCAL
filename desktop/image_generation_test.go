package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

func TestComfyWorkflowAndConstraints(t *testing.T) {
	x := imageGenerationRequest{Port: 8188, Checkpoint: "v1.safetensors", Prompt: "night concert", Width: 512, Height: 512, Steps: 20, Seed: 44}
	if err := validateImageRequest(x); err != nil {
		t.Fatal(err)
	}
	w := buildComfyWorkflow(x)
	for _, key := range []string{"1", "2", "3", "4", "5", "6", "7"} {
		if _, ok := w[key]; !ok {
			t.Fatal("missing node", key)
		}
	}
	node := w["7"].(map[string]any)
	if node["class_type"] != "SaveImage" {
		t.Fatal(node)
	}
	x.Checkpoint = "../secret"
	if validateImageRequest(x) == nil {
		t.Fatal("unsafe checkpoint")
	}
	x.Checkpoint = "v1.safetensors"
	x.Width = 513
	if validateImageRequest(x) == nil {
		t.Fatal("nonmultiple width")
	}
	x.Width = 512
	x.Steps = 0
	if validateImageRequest(x) == nil {
		t.Fatal("bad step")
	}
	x.Steps = 20
	x.Port = 58319
	if validateImageRequest(x) == nil {
		t.Fatal("self-proxy risk")
	}
}
func TestComfyCheckpointsParse(t *testing.T) {
	raw := []byte(`{"CheckpointLoaderSimple":{"input":{"required":{"ckpt_name":[["ok.safetensors","../bad.safetensors"],{}]}}}}`)
	names, err := availableCheckpoints(raw)
	if err != nil || len(names) != 1 || names[0] != "ok.safetensors" {
		t.Fatalf("%v %v", names, err)
	}
	if _, e := availableCheckpoints([]byte(`{}`)); e == nil {
		t.Fatal("empty checkpoints accepted")
	}
}
func TestComfyHistoryRejectsTraversalAndError(t *testing.T) {
	for _, tt := range []struct {
		raw   string
		done  bool
		isErr bool
	}{
		{`{"abc":{"status":{"status_str":"success","completed":true},"outputs":{"7":{"images":[{"filename":"shot.png","type":"output"}]}}}}`, true, false},
		{`{"abc":{"status":{"status_str":"success","completed":true},"outputs":{"7":{"images":[{"filename":"../secret.png","type":"output"}]}}}}`, false, true},
		{`{"abc":{"status":{"status_str":"error","completed":false}}}`, false, true},
		{`{}`, false, false},
	} {
		_, _, done, err := imageOutputFromHistory([]byte(tt.raw), "abc")
		if done != tt.done || (err != nil) != tt.isErr {
			t.Errorf("history result done=%v err=%v", done, err)
		}
	}
}
func testImageAppRequest(method, path, key string, payload []byte) *http.Request {
	r := httptest.NewRequest(method, path, bytes.NewReader(payload))
	r.Host = "127.0.0.1:58319"
	if key != "" {
		r.Header.Set("X-MYVOCAL-Session", key)
	}
	return r
}
func TestComfyBridgeMockLocalEngine(t *testing.T) {
	canvas := image.NewRGBA(image.Rect(0, 0, 512, 512))
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, canvas); err != nil {
		t.Fatal(err)
	}
	pngData := encoded.Bytes()
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/object_info/CheckpointLoaderSimple":
			fmt.Fprint(w, `{"CheckpointLoaderSimple":{"input":{"required":{"ckpt_name":[["fake.safetensors"]]}}}}`)
		case "/prompt":
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Error(err)
			}
			nodes := body["prompt"].(map[string]any)
			if nodes["7"].(map[string]any)["class_type"] != "SaveImage" {
				t.Error("workflow invalid")
			}
			fmt.Fprint(w, `{"prompt_id":"test-12345678"}`)
		case "/history/test-12345678":
			fmt.Fprint(w, `{"test-12345678":{"status":{"status_str":"success","completed":true},"outputs":{"7":{"images":[{"filename":"shot.png","subfolder":"","type":"output"}]}}}}`)
		case "/view":
			if r.URL.Query().Get("filename") != "shot.png" {
				t.Error("bad filename")
			}
			w.Header().Set("Content-Type", "image/png")
			w.Write(pngData)
		default:
			t.Error("unexpected route", r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	defer backend.Close()
	_, portstr, _ := net.SplitHostPort(strings.TrimPrefix(backend.URL, "http://"))
	port, _ := strconv.Atoi(portstr)
	app := &appServer{sessionKey: "test-session"}
	health := httptest.NewRecorder()
	app.imageHealth(health, testImageAppRequest("GET", fmt.Sprintf("/api/images/health?port=%d", port), "test-session", nil))
	if health.Code != 200 || !strings.Contains(health.Body.String(), "fake.safetensors") {
		t.Fatal(health.Code, health.Body.String())
	}
	b, _ := json.Marshal(imageGenerationRequest{Port: port, Checkpoint: "fake.safetensors", Prompt: "night stage photo", Width: 512, Height: 512, Steps: 2, Seed: 10})
	denied := httptest.NewRecorder()
	app.imageGenerate(denied, testImageAppRequest("POST", "/api/images/generate", "", b))
	if denied.Code != 403 {
		t.Fatalf("expected forbidden: %d", denied.Code)
	}
	good := httptest.NewRecorder()
	app.imageGenerate(good, testImageAppRequest("POST", "/api/images/generate", "test-session", b))
	if good.Code != 200 || !bytes.Equal(good.Body.Bytes(), pngData) {
		t.Fatalf("render mock failed: %d %s", good.Code, good.Body.String())
	}
}
