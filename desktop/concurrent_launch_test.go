package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestConcurrentInstanceKeyCreationWaitsForWriter(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "launcher-instance.key")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() {
		time.Sleep(80 * time.Millisecond)
		_, err := f.WriteString(strings.Repeat("a", 64) + "\n")
		if err == nil {
			err = f.Sync()
		}
		if ce := f.Close(); err == nil {
			err = ce
		}
		done <- err
	}()
	key, err := loadOrCreateInstanceKey(dir)
	if err != nil || key != strings.Repeat("a", 64) {
		t.Fatalf("overlap read: %q %v", key, err)
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

func TestConcurrentBrowserPreferenceCreationWaitsForWriter(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "launcher-browser.json")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() {
		time.Sleep(80 * time.Millisecond)
		_, err := f.WriteString(`{"schema":1,"browser_family":"chrome","origin":"` + fixedOrigin + `"}`)
		if err == nil {
			err = f.Sync()
		}
		if ce := f.Close(); err == nil {
			err = ce
		}
		done <- err
	}()
	chosen, err := chooseBrowser(dir, []browserCandidate{{Path: "edge", Family: "edge"}, {Path: "chrome", Family: "chrome"}})
	if err != nil || chosen.Family != "chrome" {
		t.Fatalf("overlap pref: %+v %v", chosen, err)
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}
