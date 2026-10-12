package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAIProxyAuthorization(t *testing.T) {
	a := &appServer{sessionKey: "token"}
	x := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "http://127.0.0.1:58319/api/lyrics", bytes.NewBufferString(`{}`))
	r.Host = "127.0.0.1:58319"
	a.aiLyrics(x, r)
	if x.Code != 403 {
		t.Fatalf("expected forbidden, got %v", x.Code)
	}
}
func TestAIProxySuccessViaFakeUpstream(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer key-1234567890" {
			t.Error("no API key header")
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"choices": []interface{}{map[string]interface{}{"message": map[string]string{"content": `{"title":"첫곡","lyrics":"[Verse 1] 테스트","bpm":120,"key":"C Major","chords":["C","G","Am","F"]}`}}}})
	}))
	defer srv.Close()
	original := openaiChatURL
	openaiChatURL = srv.URL
	defer func() { openaiChatURL = original }()
	a := &appServer{sessionKey: "token"}
	payload := `{"apiKey":"key-1234567890","model":"gpt-4o-mini","prompt":"친구와 재회","title":"노래","genre":"Rock","mood":"희망적","key":"C Major","bpm":120,"bars":24}`
	r := httptest.NewRequest("POST", "http://127.0.0.1:58319/api/lyrics", bytes.NewBufferString(payload))
	r.Host = "127.0.0.1:58319"
	r.Header.Set("Origin", "http://127.0.0.1:58319")
	r.Header.Set("X-MYVOCAL-Session", "token")
	x := httptest.NewRecorder()
	a.aiLyrics(x, r)
	if x.Code != 200 {
		t.Fatalf("got %d: %s", x.Code, x.Body.String())
	}
	if bytes.Contains(x.Body.Bytes(), []byte("key-1234567890")) {
		t.Error("key leaked in response")
	}
}
