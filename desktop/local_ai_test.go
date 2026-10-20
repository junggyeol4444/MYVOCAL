package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestLocalAIModelsAndComposeWithRunningLocalModel(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/tags" {
			_, _ = w.Write([]byte(`{"models":[{"name":"qwen3:4b"},{"name":"../bad?model"}]}`))
			return
		}
		if r.URL.Path != "/api/generate" {
			t.Errorf("wrong endpoint %s", r.URL.Path)
			return
		}
		var v map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&v); err != nil {
			t.Error(err)
			return
		}
		if v["model"] != "qwen3:4b" || v["stream"] != false || v["format"] != "json" {
			t.Errorf("unexpected body %v", v)
		}
		s := v["prompt"].(string)
		if !strings.Contains(s, "오래 헤어진") {
			t.Errorf("user prompt absent")
		}
		_, _ = w.Write([]byte(`{"response":"{\"title\":\"재회\",\"lyrics\":\"[Verse]\\n우리 다시 만날까\\n[Chorus]\\n안녕 오늘\",\"chords\":[\"Am\",\"F\",\"C\",\"G\"],\"bpm\":100,\"key\":\"A Minor\"}","done":true}`))
	}))
	defer backend.Close()
	client := backend.Client()
	a := httptest.NewRecorder()
	localAIModelsProxy(a, httptest.NewRequest("GET", "http://127.0.0.1:58319/api/local-ai/models", nil), client, backend.URL)
	if a.Code != 200 || !strings.Contains(a.Body.String(), "qwen3:4b") || strings.Contains(a.Body.String(), "../bad") {
		t.Errorf("models: %d %s", a.Code, a.Body.String())
	}
	payload := []byte(`{"model":"qwen3:4b","prompt":"오래 헤어진 친구의 재회","genre":"Rock","key":"A Minor"}`)
	b := httptest.NewRecorder()
	localAIComposeProxy(b, httptest.NewRequest("POST", "http://127.0.0.1:58319/api/local-ai/compose", bytes.NewReader(payload)), client, backend.URL)
	if b.Code != 200 || !strings.Contains(b.Body.String(), "재회") || !strings.Contains(b.Body.String(), `"audioGenerated":false`) {
		t.Errorf("compose: %d %s", b.Code, b.Body.String())
	}
}
func TestLocalAIRejectsUnsafeRequestsAndMalformedResults(t *testing.T) {
	var calls int
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		_, _ = w.Write([]byte(`{"response":"garbage","done":true}`))
	}))
	defer backend.Close()
	client := backend.Client()
	for _, body := range []string{`{"model":"../unsafe","prompt":"make music"}`, `{"model":"qwen3:4b","prompt":""}`, `{"model":"qwen3:4b","prompt":"abc","extra":"secret"}`, `{"model":"qwen3:4b","prompt":"a"}`} {
		w := httptest.NewRecorder()
		localAIComposeProxy(w, httptest.NewRequest("POST", "http://127.0.0.1:58319/", strings.NewReader(body)), client, backend.URL)
		if w.Code != 400 {
			t.Errorf("accepted %q: %d", body, w.Code)
		}
	}
	if calls != 0 {
		t.Fatalf("invalid inputs reached model: %d", calls)
	}
	w := httptest.NewRecorder()
	localAIComposeProxy(w, httptest.NewRequest("POST", "http://127.0.0.1:58319/", strings.NewReader(`{"model":"qwen3:4b","prompt":"good music"}`)), client, backend.URL)
	if w.Code != 502 {
		t.Errorf("accepted corrupt model output: %d", w.Code)
	}
}
func TestLocalAIRequiresAppSessionAndDoesNotRestoreCloudEndpoint(t *testing.T) {
	a := &appServer{sessionKey: "private", root: []byte("<html>myvocal</html>")}
	for _, path := range []string{"/api/local-ai/models", "/api/local-ai/compose"} {
		method := "GET"
		if strings.HasSuffix(path, "compose") {
			method = "POST"
		}
		w := httptest.NewRecorder()
		r := httptest.NewRequest(method, "http://127.0.0.1:58319"+path, nil)
		a.routes().ServeHTTP(w, r)
		if w.Code != 403 {
			t.Errorf("unauthorized %s => %d", path, w.Code)
		}
	}
	w := httptest.NewRecorder()
	a.routes().ServeHTTP(w, httptest.NewRequest("POST", "http://127.0.0.1:58319/api/lyrics", nil))
	if w.Code != 404 {
		t.Fatal("legacy external endpoint revived")
	}
}