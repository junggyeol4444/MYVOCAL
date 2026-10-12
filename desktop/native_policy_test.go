package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestNativeNavigationAllowlist(t *testing.T) {
	tests := []struct {
		target  string
		allowed bool
	}{
		{"http://127.0.0.1:58319", true},
		{"http://127.0.0.1:58319/", true},
		{"http://127.0.0.1:58319/index.html#project", true},
		{"http://127.0.0.1:58319/__myvocal_status?x=1", true},
		{"about:blank", true},
		{"https://127.0.0.1:58319", false},
		{"http://127.0.0.1:58320", false},
		{"http://localhost:58319", false},
		{"http://127.0.0.1:58319.evil.example/", false},
		{"http://127.0.0.1:58319@evil.example/", false},
		{"file:///C:/private", false},
		{"javascript:alert(1)", false},
		{"data:text/html,x", false},
		{"http://127.0.0.1:58319\\@evil.example/", false},
		{"", false},
	}
	for _, tt := range tests {
		if got := allowedNativeNavigation(tt.target); got != tt.allowed {
			t.Errorf("%q got %v want %v", tt.target, got, tt.allowed)
		}
	}
}
func TestHostPreferenceConcurrentIncompleteWrite(t *testing.T) {
	base := t.TempDir()
	path := filepath.Join(base, "launcher-host.json")
	if err := os.WriteFile(path, []byte(`{"schema":1,`), 0600); err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() {
		defer close(done)
		time.Sleep(80 * time.Millisecond)
		_ = os.WriteFile(path, []byte(`{"schema":1,"host":"browser","origin":"http://127.0.0.1:58319"}`), 0600)
	}()
	p, exists, err := readHostPreference(base)
	<-done
	if err != nil || !exists || p.Host != hostBrowser {
		t.Fatalf("%+v %v %v", p, exists, err)
	}
}
