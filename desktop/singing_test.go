package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
)

func singingReq(method, path, key string, body []byte) *http.Request {
	r := httptest.NewRequest(method, path, bytes.NewReader(body))
	r.Host = "127.0.0.1:58319"
	r.Header.Set("Origin", "http://127.0.0.1:58319")
	r.Header.Set("X-MYVOCAL-Session", key)
	return r
}
func TestSingingBridgeSecurity(t *testing.T) {
	a := &appServer{sessionKey: "testkey"}
	for _, p := range []int{0, 22, 58319, 65536} {
		if safeSingingPort(p) {
			t.Errorf("bad port: %d", p)
		}
	}
	w := httptest.NewRecorder()
	r := singingReq("GET", "/api/singing/health?port=7867", "bad", nil)
	a.singingHealth(w, r)
	if w.Code != 403 {
		t.Fatalf("missing session rejection: %d", w.Code)
	}
	w = httptest.NewRecorder()
	r = singingReq("GET", "/api/singing/health?port=58319", "testkey", nil)
	a.singingHealth(w, r)
	if w.Code != 400 {
		t.Fatalf("should reject own port: %d", w.Code)
	}
}
func TestSingingBridgeToCompatibleWAVEngine(t *testing.T) {
	engine := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/health" {
			fmt.Fprint(w, `{"status":"ok","protocol":"MYVOCAL_SINGING_V1","name":"Test bench"}`)
			return
		}
		if r.URL.Path == "/v1/sing" {
			b := make([]byte, 44)
			copy(b, "RIFF")
			copy(b[8:], "WAVE")
			w.Header().Set("Content-Type", "audio/wav")
			w.Write(b)
			return
		}
		http.NotFound(w, r)
	}))
	defer engine.Close()
	_, pstr, _ := net.SplitHostPort(engine.Listener.Addr().String())
	var port int
	fmt.Sscan(pstr, &port)
	if !safeSingingPort(port) {
		t.Skip("temporary port was outside permitted range")
	}
	a := &appServer{sessionKey: "testkey"}
	w := httptest.NewRecorder()
	a.singingHealth(w, singingReq("GET", fmt.Sprintf("/api/singing/health?port=%d", port), "testkey", nil))
	if w.Code != 200 {
		t.Fatalf("health: %d %s", w.Code, w.Body.String())
	}
	req := singingRequest{Port: port, Format: "MYVOCAL_SINGING_REQUEST", Version: 1, BPM: 120, Cues: []singingCue{{Lyric: "아", Pitch: 69, StartSec: 0, EndSec: 0.5, Velocity: 95}}}
	req.Voice.Rights = "self"
	b, _ := json.Marshal(req)
	w = httptest.NewRecorder()
	a.singingRender(w, singingReq("POST", "/api/singing/render", "testkey", b))
	if w.Code != 200 || w.Body.Len() != 44 {
		t.Fatalf("render: %d bytes %d %s", w.Code, w.Body.Len(), w.Body.String())
	}
}

func TestPhonemeHintsForwardedAndInvalidRejected(t *testing.T) {
	hits := 0
	engine := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/sing" {
			http.NotFound(w, r)
			return
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Error(err)
			return
		}
		ph, ok := payload["phonemes"].([]any)
		if !ok || len(ph) != 2 {
			t.Errorf("missing phonemes: %v", payload["phonemes"])
		}
		hits++
		b := make([]byte, 44)
		copy(b, "RIFF")
		copy(b[8:], "WAVE")
		w.Write(b)
	}))
	defer engine.Close()
	_, pstr, _ := net.SplitHostPort(engine.Listener.Addr().String())
	var port int
	fmt.Sscan(pstr, &port)
	if !safeSingingPort(port) {
		t.Skip("test port unsupported")
	}
	a := &appServer{sessionKey: "key"}
	raw := fmt.Sprintf(`{"port":%d,"format":"MYVOCAL_SINGING_REQUEST","version":1,"project":"test","voice":{"id":"me","rights":"self"},"bpm":120,"cues":[{"lyric":"안","pitch":69,"startSec":0,"endSec":0.5,"velocity":95}],"phonemes":[{"cueIndex":1,"token":"ㅏ","kind":"nucleus","pitch":69,"startSec":0,"endSec":0.35},{"cueIndex":1,"token":"ㄴ","kind":"coda","pitch":69,"startSec":0.35,"endSec":0.5}]}`, port)
	w := httptest.NewRecorder()
	a.singingRender(w, singingReq("POST", "/api/singing/render", "key", []byte(raw)))
	if w.Code != 200 || hits != 1 {
		t.Fatalf("failed forwarding: %d, hits %d: %s", w.Code, hits, w.Body.String())
	}
	bad := bytes.ReplaceAll([]byte(raw), []byte(`"startSec":0.35,"endSec":0.5`), []byte(`"startSec":0.01,"endSec":0.5`))
	w = httptest.NewRecorder()
	a.singingRender(w, singingReq("POST", "/api/singing/render", "key", bad))
	if w.Code != 400 || hits != 1 {
		t.Fatalf("invalid overlap forwarded: status %d hits %d", w.Code, hits)
	}
}
