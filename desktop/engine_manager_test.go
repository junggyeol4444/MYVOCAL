package main

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestEngineProcessHelper(t *testing.T) {
	if len(os.Args) < 2 || os.Args[len(os.Args)-1] != "__managed_engine_helper__" {
		return
	}
	time.Sleep(30 * time.Second)
}
func TestManagerGuards(t *testing.T) {
	a := appServer{sessionKey: "secret"}
	x := httptest.NewRecorder()
	a.engineManagerStatus(x, singingReq("GET", "/api/singing/engine/status", "wrong", nil))
	if x.Code != 403 {
		t.Fatalf("bad session was accepted: %v", x.Code)
	}
	x = httptest.NewRecorder()
	a.engineManagerStart(x, singingReq("POST", "/api/singing/engine/start", "secret", []byte(`{"port":7867,"executable":"relative.py","args":[]}`)))
	if x.Code != 400 {
		t.Fatalf("relative path accepted: %v", x.Code)
	}
	bin, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	if !filepath.IsAbs(bin) {
		t.Fatal("test executable not absolute")
	}
	x = httptest.NewRecorder()
	input := engineStartRequest{Port: 7867, Executable: bin, Args: []string{"-test.run=TestEngineProcessHelper", "--", "__managed_engine_helper__"}}
	body, _ := json.Marshal(input)
	a.engineManagerStart(x, singingReq("POST", "/api/singing/engine/start", "secret", body))
	if x.Code != 200 {
		t.Fatalf("engine start: %v %s", x.Code, x.Body.String())
	}
	if !a.manager.snapshot()["running"].(bool) {
		t.Fatal("not running")
	}
	x = httptest.NewRecorder()
	a.engineManagerStart(x, singingReq("POST", "/api/singing/engine/start", "secret", body))
	if x.Code != 409 {
		t.Fatalf("second engine should be rejected: %v", x.Code)
	}
	x = httptest.NewRecorder()
	a.engineManagerStop(x, singingReq("POST", "/api/singing/engine/stop", "secret", nil))
	if x.Code != 200 {
		t.Fatalf("stop failure: %v %s", x.Code, x.Body.String())
	}
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if !a.manager.snapshot()["running"].(bool) {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("process didn't stop")
}
func TestManagerInputValidation(t *testing.T) {
	e := engineStartRequest{Executable: "/path/does/not/exist", Port: 7867}
	if validateStartRequest(e) == nil {
		t.Fatal("missing file accepted")
	}
	e = engineStartRequest{Executable: "/path/does/not/exist", Port: 58319}
	if err := validateStartRequest(e); err == nil || !strings.Contains(err.Error(), "포트") {
		t.Fatalf("wrong port validation: %v", err)
	}
}
