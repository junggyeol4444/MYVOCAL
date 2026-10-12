package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func TestBrowserChoicePersistsAndNeverFallsBack(t *testing.T) {
	dir := t.TempDir()
	edge := browserCandidate{Path: "C:/Program Files/Microsoft/Edge/msedge.exe", Family: "edge"}
	chrome := browserCandidate{Path: "C:/Program Files/Google/Chrome/chrome.exe", Family: "chrome"}
	selected, err := chooseBrowser(dir, []browserCandidate{edge, chrome})
	if err != nil || selected.Family != "edge" {
		t.Fatalf("initial choice: %v %v", selected, err)
	}
	selected, err = chooseBrowser(dir, []browserCandidate{chrome, edge})
	if err != nil || selected.Family != "edge" {
		t.Fatalf("browser silently switched: %v %v", selected, err)
	}
	_, err = chooseBrowser(dir, []browserCandidate{chrome})
	if err == nil || !strings.Contains(err.Error(), "edge") {
		t.Fatalf("missing pinned browser should fail: %v", err)
	}
	pref, exists, err := readBrowserPreference(filepath.Join(dir, "launcher-browser.json"))
	if !exists || err != nil || pref.Origin != fixedOrigin {
		t.Fatalf("preference: %+v %t %v", pref, exists, err)
	}
}
func TestCorruptBrowserPreferenceIsPreserved(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "launcher-browser.json")
	original := []byte("{truncated")
	if err := os.WriteFile(path, original, 0600); err != nil {
		t.Fatal(err)
	}
	_, err := chooseBrowser(dir, []browserCandidate{{Path: "edge", Family: "edge"}})
	if err == nil {
		t.Fatal("corrupt preference was silently overwritten")
	}
	got, _ := os.ReadFile(path)
	if string(got) != string(original) {
		t.Fatalf("corrupt data overwritten: %q", got)
	}
}
func TestChangedOriginRefusesProfileMigration(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "launcher-browser.json"), []byte(`{"schema":1,"browser_family":"edge","origin":"http://127.0.0.1:9999"}`), 0600); err != nil {
		t.Fatal(err)
	}
	_, err := chooseBrowser(dir, []browserCandidate{{Path: "edge", Family: "edge"}})
	if err == nil || !strings.Contains(err.Error(), "변경") {
		t.Fatalf("origin mismatch accepted: %v", err)
	}
}
func TestNoBrowserDoesNotCreatePreference(t *testing.T) {
	dir := t.TempDir()
	if _, err := chooseBrowser(dir, nil); err == nil {
		t.Fatal("missing browser accepted")
	}
	if _, err := os.Stat(filepath.Join(dir, "launcher-browser.json")); !os.IsNotExist(err) {
		t.Fatalf("unexpected preference: %v", err)
	}
}

// Concurrent first launches must observe a complete JSON preference and
// choose the same browser family. No launcher may overwrite the winner.
func TestConcurrentBrowserPreferenceAtomicPublication(t *testing.T) {
	base := t.TempDir()
	choices := [][]browserCandidate{
		{{Family: "edge"}, {Family: "chrome"}},
		{{Family: "chrome"}, {Family: "edge"}},
	}
	const workers = 24
	var wg sync.WaitGroup
	results := make(chan browserCandidate, workers)
	errs := make(chan error, workers)
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			got, err := chooseBrowser(base, choices[i%len(choices)])
			if err != nil {
				errs <- err
				return
			}
			results <- got
		}(i)
	}
	wg.Wait()
	close(results)
	close(errs)
	for err := range errs {
		t.Errorf("concurrent browser choice: %v", err)
	}
	pref, exists, err := readBrowserPreference(filepath.Join(base, "launcher-browser.json"))
	if err != nil || !exists {
		t.Fatalf("missing/corrupt preference: %+v %v", pref, err)
	}
	for got := range results {
		if got.Family != pref.Family {
			t.Fatalf("browser switched: got %s, pinned %s", got.Family, pref.Family)
		}
	}
	raw, err := os.ReadFile(filepath.Join(base, "launcher-browser.json"))
	if err != nil || !json.Valid(raw) {
		t.Fatalf("incomplete JSON published: %s %v", raw, err)
	}
	leftovers, _ := filepath.Glob(filepath.Join(base, ".launcher-browser-*.tmp"))
	if len(leftovers) != 0 {
		t.Fatalf("temporary preference files left behind: %v", leftovers)
	}
}

func TestBrowserPreferencePublishNeverOverwritesLegacyOrCorruptData(t *testing.T) {
	for _, original := range []string{
		`{"schema":1,"browser_family":"edge","origin":"` + fixedOrigin + `"}`,
		`{user-saved-corrupt`,
	} {
		base := t.TempDir()
		path := filepath.Join(base, "launcher-browser.json")
		if err := os.WriteFile(path, []byte(original), 0600); err != nil {
			t.Fatal(err)
		}
		if err := publishBrowserPreference(path, browserPreference{Schema: 1, Family: "chrome", Origin: fixedOrigin}); err != nil {
			t.Fatal(err)
		}
		got, err := os.ReadFile(path)
		if err != nil || string(got) != original {
			t.Fatalf("existing setting overwritten: %q %v", got, err)
		}
	}
}

func TestBrowserPreferencePublishRejectsSymlink(t *testing.T) {
	base := t.TempDir()
	target := filepath.Join(base, "keep.json")
	if err := os.WriteFile(target, []byte("do not touch"), 0600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(base, "launcher-browser.json")
	if err := os.Symlink(target, link); err != nil {
		t.Skipf("symlinks unsupported: %v", err)
	}
	if err := publishBrowserPreference(link, browserPreference{Schema: 1, Family: "edge", Origin: fixedOrigin}); err == nil {
		t.Fatal("symlink accepted")
	}
	got, _ := os.ReadFile(target)
	if string(got) != "do not touch" {
		t.Fatal("symlink target changed")
	}
}
