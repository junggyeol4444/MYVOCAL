package main

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestValidOpenUtauPath(t *testing.T) {
	good := filepath.Join(t.TempDir(), "OpenUtau.exe")
	if !validOpenUtauPath(good) {
		t.Fatalf("valid path rejected %s", good)
	}
	for _, s := range []string{"OpenUtau.exe", filepath.Join(t.TempDir(), "notepad.exe"), good + "\n"} {
		if validOpenUtauPath(s) {
			t.Errorf("accepted invalid path %q", s)
		}
	}
}
func TestOpenUtauInspectAuthAndLookup(t *testing.T) {
	a := &appServer{sessionKey: "token"}
	valid := filepath.Join(t.TempDir(), "OpenUtau.exe")
	if err := os.WriteFile(valid, []byte("test stub"), 0600); err != nil {
		t.Fatal(err)
	}
	url := "/api/openutau/inspect?path=" + valid
	unauthorized := httptest.NewRecorder()
	a.openUtauInspect(unauthorized, singingReq("GET", url, "bad", nil))
	if unauthorized.Code != 403 {
		t.Fatalf("authorization failed: %d", unauthorized.Code)
	}
	ok := httptest.NewRecorder()
	a.openUtauInspect(ok, singingReq("GET", url, "token", nil))
	if ok.Code != 200 || !strings.Contains(ok.Body.String(), `"found":true`) {
		t.Fatalf("expected found, code %d body %s, OS %s", ok.Code, ok.Body.String(), runtime.GOOS)
	}
	missing := httptest.NewRecorder()
	a.openUtauInspect(missing, singingReq("GET", url+"-missing", "token", nil))
	if missing.Code != 400 {
		t.Fatalf("must reject not-OpenUtau.exe %v", missing.Code)
	}
}
