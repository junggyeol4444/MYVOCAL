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
	"strconv"
	"strings"
	"testing"
)

func syntheticPersonRequest(t *testing.T, port int) personMVRequest {
	t.Helper()
	pic := image.NewRGBA(image.Rect(0, 0, 512, 512))
	var b bytes.Buffer
	if err := png.Encode(&b, pic); err != nil {
		t.Fatal(err)
	}
	return personMVRequest{Port: port, Checkpoint: "sd.safetensors", Prompt: "Photo based cinematic realistic street scene with same person", Negative: "blurry", ImageData: "data:image/png;base64," + base64.StdEncoding.EncodeToString(b.Bytes()), Width: 512, Height: 512, Steps: 18, Seed: 21, Denoise: 0.35, RightsAttested: true}
}
func TestStep79PersonImageWorkflowAndRights(t *testing.T) {
	x := syntheticPersonRequest(t, 8188)
	if _, _, err := validatePersonMVRequest(x); err != nil {
		t.Fatal(err)
	}
	flow := buildPersonMVWorkflow(x, "registered.png")
	for key, kind := range map[string]string{"4": "LoadImage", "5": "ImageScale", "6": "VAEEncode", "7": "KSampler", "9": "SaveImage"} {
		node := flow[key].(map[string]any)
		if node["class_type"] != kind {
			t.Fatalf("unexpected workflow node %s: %v", key, node)
		}
	}
	sampler := flow["7"].(map[string]any)["inputs"].(map[string]any)
	if sampler["denoise"] != 0.35 {
		t.Fatal("denoise not applied")
	}
	for _, mutation := range []func(*personMVRequest){
		func(x *personMVRequest) { x.RightsAttested = false },
		func(x *personMVRequest) { x.Denoise = 1 },
		func(x *personMVRequest) { x.Denoise = 0.01 },
		func(x *personMVRequest) { x.Checkpoint = "../bad" },
		func(x *personMVRequest) { x.Port = 58319 },
		func(x *personMVRequest) { x.ImageData = "data:image/png;base64,YWJj" },
		func(x *personMVRequest) { x.ImageData = "data:text/html;base64,AAAA" },
	} {
		bad := x
		mutation(&bad)
		if _, _, err := validatePersonMVRequest(bad); err == nil {
			t.Fatal("invalid source accepted")
		}
	}
	name, _, ok, e := personImageOutput([]byte(`{"p1":{"status":{"completed":true},"outputs":{"9":{"images":[{"filename":"image.png","type":"output"}]}}}}`), "p1")
	if e != nil || !ok || name != "image.png" {
		t.Fatal(name, ok, e)
	}
	_, _, _, e = personImageOutput([]byte(`{"p1":{"status":{"completed":true},"outputs":{"9":{"images":[{"filename":"../secret.png","type":"output"}]}}}}`), "p1")
	if e == nil {
		t.Fatal("path traversal accepted")
	}
}
func TestStep79ComfyImageBridgeMock(t *testing.T) {
	x := syntheticPersonRequest(t, 8188)
	original := x.ImageData
	source, _ := base64.StdEncoding.DecodeString(strings.TrimPrefix(original, "data:image/png;base64,"))
	uploads, prompts := 0, 0
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasPrefix(r.URL.Path, "/object_info/"):
			node := strings.TrimPrefix(r.URL.Path, "/object_info/")
			if node == "CheckpointLoaderSimple" {
				fmt.Fprint(w, `{"CheckpointLoaderSimple":{"input":{"required":{"ckpt_name":[["sd.safetensors"]]}}}}`)
			} else {
				fmt.Fprintf(w, `{"%s":{}}`, node)
			}
		case r.URL.Path == "/upload/image":
			uploads++
			f, h, e := r.FormFile("image")
			if e != nil {
				t.Error(e)
				w.WriteHeader(400)
				return
			}
			defer f.Close()
			buf := new(bytes.Buffer)
			_, _ = buf.ReadFrom(f)
			if !bytes.Equal(buf.Bytes(), source) {
				t.Error("source photograph bytes changed")
			}
			fmt.Fprintf(w, `{"name":%q,"subfolder":"","type":"input"}`, h.Filename)
		case r.URL.Path == "/prompt":
			prompts++
			var posted map[string]any
			if e := json.NewDecoder(r.Body).Decode(&posted); e != nil {
				t.Error(e)
			}
			nodes := posted["prompt"].(map[string]any)
			sampler := nodes["7"].(map[string]any)["inputs"].(map[string]any)
			if sampler["denoise"] != 0.35 || nodes["4"].(map[string]any)["class_type"] != "LoadImage" {
				t.Error("not img2img")
			}
			fmt.Fprint(w, `{"prompt_id":"person-12345678"}`)
		case r.URL.Path == "/history/person-12345678":
			fmt.Fprint(w, `{"person-12345678":{"status":{"completed":true,"status_str":"success"},"outputs":{"9":{"images":[{"filename":"image.png","subfolder":"","type":"output"}]}}}}`)
		case r.URL.Path == "/view":
			if r.URL.Query().Get("filename") != "image.png" {
				t.Error("unsafe view lookup")
			}
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write(source)
		default:
			t.Error("unknown route", r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	defer mock.Close()
	_, portString, _ := net.SplitHostPort(strings.TrimPrefix(mock.URL, "http://"))
	x.Port, _ = strconv.Atoi(portString)
	payload, _ := json.Marshal(x)
	app := &appServer{sessionKey: "test-session"}
	rejected := httptest.NewRecorder()
	app.personMVGenerate(rejected, testImageAppRequest("POST", "/api/person-mv/generate", "", payload))
	if rejected.Code != 403 {
		t.Fatalf("unauthorized status %d", rejected.Code)
	}
	x.RightsAttested = false
	invalid, _ := json.Marshal(x)
	denied := httptest.NewRecorder()
	app.personMVGenerate(denied, testImageAppRequest("POST", "/api/person-mv/generate", "test-session", invalid))
	if denied.Code != 400 {
		t.Fatalf("rights denied %d", denied.Code)
	}
	response := httptest.NewRecorder()
	app.personMVGenerate(response, testImageAppRequest("POST", "/api/person-mv/generate", "test-session", payload))
	if response.Code != 200 || !bytes.Equal(response.Body.Bytes(), source) || response.Header().Get("Content-Type") != "image/png" {
		t.Fatalf("img2img bridge failed %d %s", response.Code, response.Body.String())
	}
	if uploads != 1 || prompts != 1 {
		t.Fatalf("expected single generation (uploads=%d, prompts=%d)", uploads, prompts)
	}
}
