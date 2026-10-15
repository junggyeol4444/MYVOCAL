package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Even a valid-looking API key must not trigger an external request.
// This endpoint has been removed from the local-only desktop server.
func TestNoExternalLyricsRoute(t *testing.T) {
	a := &appServer{sessionKey: "token", root: []byte("<html>offline</html>")}
	for _, tt := range []struct{ method, path string }{
		{http.MethodGet, "/api/lyrics"},
		{http.MethodPost, "/api/lyrics"},
		{http.MethodPost, "/api/lyrics?model=gpt-4o-mini"},
	} {
		r := httptest.NewRequest(tt.method, "http://127.0.0.1:58319"+tt.path, bytes.NewBufferString(`{"apiKey":"key-1234567890","prompt":"song"}`))
		r.Header.Set("Origin", fixedOrigin)
		r.Header.Set("X-MYVOCAL-Session", "token")
		w := httptest.NewRecorder()
		a.routes().ServeHTTP(w, r)
		if w.Code != http.StatusNotFound {
			t.Fatalf("%s %s: got %d, expected 404", tt.method, tt.path, w.Code)
		}
	}
}

func TestAppServesOfflineOnlyContentSecurityPolicy(t *testing.T) {
	a := &appServer{root: []byte("<html>offline</html>")}
	w := httptest.NewRecorder()
	a.routes().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "http://127.0.0.1:58319/", nil))
	if w.Code != 200 {
		t.Fatalf("root status %d", w.Code)
	}
	policy := w.Header().Get("Content-Security-Policy")
	for _, required := range []string{"connect-src 'self'", "default-src 'none'", "font-src 'self' data:", "frame-src 'none'", "object-src 'none'"} {
		if !strings.Contains(policy, required) {
			t.Fatalf("CSP missing %q: %s", required, policy)
		}
	}
	if strings.Contains(policy, "https:") || strings.Contains(policy, "http:") || strings.Contains(policy, "*") {
		t.Fatalf("CSP can reach remote origins: %s", policy)
	}
}

func TestDedicatedBrowserDisablesBackgroundNetworking(t *testing.T) {
	args, err := browserLaunchArgs(fixedOrigin, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	flags := strings.Join(args, " ")
	for _, flag := range []string{"--disable-background-networking", "--disable-sync", "--disable-component-update", "--no-pings"} {
		if !strings.Contains(flags, flag) {
			t.Fatalf("missing no-network browser flag %q", flag)
		}
	}
}
