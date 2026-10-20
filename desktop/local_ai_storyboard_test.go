package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestLocalStoryboardGenerateUsingInstalledTextModel(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var v map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&v); err != nil {
			t.Error(err)
		}
		if !strings.Contains(v["prompt"].(string), "후렴") {
			t.Fatal("lyrics not forwarded")
		}
		response := map[string]interface{}{"response": `{"scenes":[{"title":"무대","description":"빛나는 도시","location":"무대","action":"걷기","camera":"고정","lighting":"붉은 조명"}]}`, "done": true}
		_ = json.NewEncoder(w).Encode(response)
	}))
	defer backend.Close()
	body := []byte(`{"model":"qwen3:4b","prompt":"음악 장면 만들기","lyrics":"후렴이 빛난다","sections":[{"name":"Chorus","bars":8}]}`)
	w := httptest.NewRecorder()
	localAIStoryboardProxy(w, httptest.NewRequest("POST", "http://127.0.0.1:58319/api/local-ai/storyboard", bytes.NewReader(body)), backend.Client(), backend.URL)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "무대") || !strings.Contains(w.Body.String(), `"videoGenerated":false`) {
		t.Fatalf("%d %s", w.Code, w.Body.String())
	}
}
func TestLocalStoryboardRejectsInvalidAndMismatchedScenes(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"response":"{\"scenes\":[]}","done":true}`))
	}))
	defer backend.Close()
	req := `{"model":"qwen3:4b","prompt":"음악 장면 만들기","sections":[{"name":"Chorus","bars":8}]}`
	w := httptest.NewRecorder()
	localAIStoryboardProxy(w, httptest.NewRequest("POST", "http://127.0.0.1:58319/", strings.NewReader(req)), backend.Client(), backend.URL)
	if w.Code != 502 {
		t.Fatalf("count mismatch returned %d", w.Code)
	}
	w = httptest.NewRecorder()
	localAIStoryboardProxy(w, httptest.NewRequest("POST", "http://127.0.0.1:58319/", strings.NewReader(`{"model":"../danger","prompt":"song","sections":[{"name":"x","bars":1}]}`)), backend.Client(), backend.URL)
	if w.Code != 400 {
		t.Fatalf("unsafe model returned %d", w.Code)
	}
}