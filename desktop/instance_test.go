package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPersistentInstanceKey(t *testing.T) {
	dir := t.TempDir()
	first, err := loadOrCreateInstanceKey(dir)
	if err != nil || len(first) != 64 {
		t.Fatalf("create: %s %v", first, err)
	}
	second, err := loadOrCreateInstanceKey(dir)
	if err != nil || first != second {
		t.Fatalf("key changed across restarts: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "launcher-instance.key"), []byte("damaged"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := loadOrCreateInstanceKey(dir); err == nil {
		t.Fatal("corrupt key silently regenerated")
	}
	b, _ := os.ReadFile(filepath.Join(dir, "launcher-instance.key"))
	if string(b) != "damaged" {
		t.Fatal("corrupt key overwritten")
	}
}
func TestAuthenticatedReattachRejectsSpoofedStatus(t *testing.T) {
	const secret = "1234567890123456789012345678901234567890123456789012345678901234"
	a := &appServer{instanceKey: secret}
	server := httptest.NewServer(a.routes())
	defer server.Close()
	if !runningApp(server.URL, secret) {
		t.Fatal("correct instance key rejected")
	}
	if runningApp(server.URL, "wrong") {
		t.Fatal("wrong key accepted")
	}
	response, err := http.Get(server.URL + "/__myvocal_identity")
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusForbidden {
		t.Fatalf("unauthorized identity status: %d", response.StatusCode)
	}
	// A different program can return the public status string, but must not
	// convince our launcher to attach to it.
	spoof := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/__myvocal_status" {
			io.WriteString(w, userAgent)
			return
		}
		http.NotFound(w, r)
	}))
	defer spoof.Close()
	if runningApp(spoof.URL, secret) {
		t.Fatal("spoofed local service accepted")
	}
}
func TestLoopbackHostGuard(t *testing.T) {
	handler := secureLoopbackHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))
	for _, tc := range []struct {
		host   string
		status int
	}{
		{"127.0.0.1:" + appPort, 204},
		{"localhost:" + appPort, 403},
		{"evil.example:" + appPort, 403},
		{"127.0.0.1:12345", 403},
	} {
		req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1/", nil)
		req.Host = tc.host
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)
		if w.Code != tc.status {
			t.Errorf("host %q: got %d want %d", tc.host, w.Code, tc.status)
		}
		if tc.status == 204 && !strings.Contains(w.Header().Get("Referrer-Policy"), "no-referrer") {
			t.Fatal("security header missing")
		}
	}
}
