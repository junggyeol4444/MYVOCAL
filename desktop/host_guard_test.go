package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPersistentAppDataPathRefusesWindowsTempFallback(t *testing.T) {
	if _, err := persistentAppDataPath("windows", "", os.TempDir()); err == nil {
		t.Fatal("Windows missing LOCALAPPDATA silently fell back to TEMP")
	}
	if _, err := persistentAppDataPath("windows", "relative/path", os.TempDir()); err == nil {
		t.Fatal("relative Windows appdata accepted")
	}
	base := t.TempDir()
	got, err := persistentAppDataPath("windows", base, os.TempDir())
	if err != nil || got != filepath.Join(base, "MYVOCAL Studio") {
		t.Fatalf("got %q, %v", got, err)
	}
	got, err = persistentAppDataPath("linux", "", base)
	if err != nil || got != filepath.Join(base, "MYVOCAL Studio") {
		t.Fatalf("linux fallback %q %v", got, err)
	}
}

func TestBrowserHostRequiresStableOriginAndProfile(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "DesktopProfile")
	args, err := browserLaunchArgs(fixedOrigin, dir)
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(args, " ")
	if !strings.Contains(joined, "--app="+fixedOrigin) || !strings.Contains(joined, "--user-data-dir="+dir) {
		t.Fatalf("host flags missing: %s", joined)
	}
	for _, bad := range []string{"http://127.0.0.1:58320", "http://localhost:58319", "https://127.0.0.1:58319"} {
		if _, err := browserLaunchArgs(bad, dir); err == nil {
			t.Fatalf("origin drift accepted: %s", bad)
		}
	}
	if _, err := browserLaunchArgs(fixedOrigin, "relative-profile"); err == nil {
		t.Fatal("relative profile accepted")
	}
}

func TestPreflightDoesNotModifyExistingBrowserProfile(t *testing.T) {
	local := t.TempDir()
	t.Setenv("LOCALAPPDATA", local)
	dir := filepath.Join(local, "MYVOCAL Studio", "DesktopProfile", "Default", "IndexedDB")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	existing := filepath.Join(dir, "important-project-data")
	if err := os.WriteFile(existing, []byte("retain me"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := preflightDesktopStorage(); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(existing)
	if err != nil || string(got) != "retain me" {
		t.Fatalf("browser profile modified: %s %v", got, err)
	}
}
