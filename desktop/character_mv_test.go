package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

// Step80 verifies that the caller's actual drawing reaches local ComfyUI,
// not just a text prompt, and existing authorization remains required.
func TestStep80CharacterMvBridgeUsesUploadedDrawing(t *testing.T) {
	request := syntheticPersonRequest(t, 8188)
	source, _, err := validatePersonMVRequest(request)
	if err != nil {
		t.Fatal(err)
	}
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
			file, head, e := r.FormFile("image")
			if e != nil {
				t.Error(e)
				w.WriteHeader(400)
				return
			}
			defer file.Close()
			buf := new(bytes.Buffer)
			_, _ = buf.ReadFrom(file)
			if !bytes.Equal(buf.Bytes(), source) {
				t.Error("original artwork bytes changed")
			}
			fmt.Fprintf(w, `{"name":%q,"subfolder":"","type":"input"}`, head.Filename)
		case r.URL.Path == "/prompt":
			prompts++
			var sent map[string]any
			if e := json.NewDecoder(r.Body).Decode(&sent); e != nil {
				t.Error(e)
				return
			}
			nodes := sent["prompt"].(map[string]any)
			if nodes["4"].(map[string]any)["class_type"] != "LoadImage" || nodes["7"].(map[string]any)["class_type"] != "KSampler" {
				t.Error("not image-to-image")
			}
			if nodes["9"].(map[string]any)["inputs"].(map[string]any)["filename_prefix"] != "MYVOCAL_Step80" {
				t.Error("wrong output prefix")
			}
			if sent["client_id"] != "MYVOCAL_Step80" {
				t.Error("incorrect client")
			}
			fmt.Fprint(w, `{"prompt_id":"character-12345678"}`)
		case r.URL.Path == "/history/character-12345678":
			fmt.Fprint(w, `{"character-12345678":{"status":{"completed":true,"status_str":"success"},"outputs":{"9":{"images":[{"filename":"character.png","type":"output"}]}}}}`)
		case r.URL.Path == "/view":
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write(source)
		default:
			t.Errorf("unexpected route %s", r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	defer mock.Close()
	_, p, _ := net.SplitHostPort(strings.TrimPrefix(mock.URL, "http://"))
	request.Port, _ = strconv.Atoi(p)
	payload, _ := json.Marshal(request)
	app := &appServer{sessionKey: "secret80"}
	noToken := httptest.NewRecorder()
	app.characterMVGenerate(noToken, testImageAppRequest("POST", "/api/character-mv/generate", "", payload))
	if noToken.Code != 403 {
		t.Fatalf("unauthed: %d", noToken.Code)
	}
	noRights := request
	noRights.RightsAttested = false
	invalid, _ := json.Marshal(noRights)
	blocked := httptest.NewRecorder()
	app.characterMVGenerate(blocked, testImageAppRequest("POST", "/api/character-mv/generate", "secret80", invalid))
	if blocked.Code != 400 {
		t.Fatalf("rights check: %d", blocked.Code)
	}
	response := httptest.NewRecorder()
	app.characterMVGenerate(response, testImageAppRequest("POST", "/api/character-mv/generate", "secret80", payload))
	if response.Code != 200 || !bytes.Equal(response.Body.Bytes(), source) || response.Header().Get("Content-Type") != "image/png" {
		t.Fatalf("bridge failed: %d %s", response.Code, response.Body.String())
	}
	if uploads != 1 || prompts != 1 {
		t.Fatalf("unexpected calls uploads=%d prompts=%d", uploads, prompts)
	}
}
