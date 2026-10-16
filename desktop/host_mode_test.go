package main

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
)

func TestHostModeFreshInstallDefaultsToNativeWindow(t *testing.T) {
	base := t.TempDir()
	mode, persist, err := resolveHostMode(base, "")
	if err != nil || mode != hostWebView2 || !persist {
		t.Fatalf("%s %t %v", mode, persist, err)
	}
	if _, err = os.Stat(filepath.Join(base, "launcher-host.json")); !os.IsNotExist(err) {
		t.Fatal("resolver wrote data")
	}
}
func TestHostModeFreshInstallExplicitBrowserOptIn(t *testing.T) {
	base := t.TempDir()
	mode, persist, err := resolveHostMode(base, hostBrowser)
	if err != nil || mode != hostBrowser || !persist {
		t.Fatalf("%s %t %v", mode, persist, err)
	}
}
func TestHostModeLegacyProfileCannotBeMigratedSilently(t *testing.T) {
	base := t.TempDir()
	dir := filepath.Join(base, "DesktopProfile", "Default", "IndexedDB")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	original := []byte("important")
	path := filepath.Join(dir, "data")
	if err := os.WriteFile(path, original, 0600); err != nil {
		t.Fatal(err)
	}
	if _, _, err := resolveHostMode(base, hostWebView2); err == nil {
		t.Fatal("accepted migration")
	}
	mode, _, err := resolveHostMode(base, "")
	if err != nil || mode != hostBrowser {
		t.Fatalf("%s %v", mode, err)
	}
	got, _ := os.ReadFile(path)
	if string(got) != string(original) {
		t.Fatal("profile modified")
	}
}
func TestHostModeNativeProfileDoesNotFallBack(t *testing.T) {
	base := t.TempDir()
	dir := filepath.Join(base, "NativeWebView2Profile")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "Local State"), []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	mode, _, err := resolveHostMode(base, "")
	if err != nil || mode != hostWebView2 {
		t.Fatalf("%s %v", mode, err)
	}
	if _, _, err := resolveHostMode(base, hostBrowser); err == nil {
		t.Fatal("silent browser fallback")
	}
}
func TestHostModePinnedAndCorruptionPreserved(t *testing.T) {
	base := t.TempDir()
	if err := persistHostMode(base, hostBrowser); err != nil {
		t.Fatal(err)
	}
	if err := persistHostMode(base, hostBrowser); err != nil {
		t.Fatal(err)
	}
	if err := persistHostMode(base, hostWebView2); err == nil {
		t.Fatal("overwrote pin")
	}
	if _, _, err := resolveHostMode(base, hostWebView2); err == nil {
		t.Fatal("switched host")
	}
	path := filepath.Join(base, "launcher-host.json")
	raw := []byte("{broken")
	if err := os.WriteFile(path, raw, 0600); err != nil {
		t.Fatal(err)
	}
	if _, _, err := resolveHostMode(base, ""); err == nil {
		t.Fatal("accepted corrupt setting")
	}
	got, _ := os.ReadFile(path)
	if string(got) != string(raw) {
		t.Fatal("corrupt preference overwritten")
	}
}
func TestHostModeConflictingProfilesStops(t *testing.T) {
	base := t.TempDir()
	for _, dir := range []string{"DesktopProfile", "NativeWebView2Profile"} {
		if err := os.MkdirAll(filepath.Join(base, dir), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(base, dir, "data"), []byte("x"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if _, _, err := resolveHostMode(base, ""); err == nil || !strings.Contains(err.Error(), "모두") {
		t.Fatalf("%v", err)
	}
}

// Concurrent launchers must never publish half-written host preferences.
// The winning host remains pinned and a conflicting writer cannot replace it.
func TestHostModeAtomicPublicationUnderConcurrentLaunches(t *testing.T) {
	base := t.TempDir()
	const writers = 32
	var wg sync.WaitGroup
	errCh := make(chan error, writers)
	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			mode := hostBrowser
			if i%2 == 1 {
				mode = hostWebView2
			}
			errCh <- persistHostMode(base, mode)
		}(i)
	}
	// Observe while writers are active. The preference must be either absent
	// or a complete, valid JSON document. A partial JSON read is a regression.
	for i := 0; i < 100; i++ {
		p, exists, err := readHostPreference(base)
		if err != nil {
			t.Fatalf("partial preference published: %v", err)
		}
		if exists && (p.Schema != 1 || p.Origin != fixedOrigin || (p.Host != hostBrowser && p.Host != hostWebView2)) {
			t.Fatalf("invalid published preference: %+v", p)
		}
		runtime.Gosched()
	}
	wg.Wait()
	close(errCh)
	wins, conflicts := 0, 0
	for err := range errCh {
		if err == nil {
			wins++
		} else if strings.Contains(err.Error(), "다른 프로세스") {
			conflicts++
		} else {
			t.Fatalf("unexpected writer failure: %v", err)
		}
	}
	if wins == 0 || conflicts == 0 {
		t.Fatalf("expected idempotent winners and conflicting writers: wins=%d conflicts=%d", wins, conflicts)
	}
	p, exists, err := readHostPreference(base)
	if err != nil || !exists {
		t.Fatalf("missing valid preference: %+v %v", p, err)
	}
	entries, err := os.ReadDir(base)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Name() != "launcher-host.json" {
		t.Fatalf("temporary files left behind: %+v", entries)
	}
}

func TestHostModeAtomicPublicationPreservesCorruption(t *testing.T) {
	base := t.TempDir()
	path := filepath.Join(base, "launcher-host.json")
	original := []byte("{incomplete-original-data")
	if err := os.WriteFile(path, original, 0600); err != nil {
		t.Fatal(err)
	}
	if err := persistHostMode(base, hostBrowser); err == nil {
		t.Fatal("corrupted preference must block publication")
	}
	actual, err := os.ReadFile(path)
	if err != nil || string(actual) != string(original) {
		t.Fatalf("corrupt original changed: %q %v", actual, err)
	}
}
