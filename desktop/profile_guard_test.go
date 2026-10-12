package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// A linked profile can point to a different Chromium/WebView2 store. Never
// follow it automatically, and never alter the target as part of validation.
func TestDedicatedProfileGuardRejectsSymlinkWithoutTouchingTarget(t *testing.T) {
	base := t.TempDir()
	target := filepath.Join(base, "OriginalProjects")
	if err := os.Mkdir(target, 0700); err != nil {
		t.Fatal(err)
	}
	sentinel := filepath.Join(target, "project.json")
	if err := os.WriteFile(sentinel, []byte("do not change"), 0600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(base, "NativeWebView2Profile")
	if err := os.Symlink(target, link); err != nil {
		t.Skipf("symlink creation unavailable: %v", err)
	}
	if _, err := inspectDedicatedProfile(link); err == nil || !strings.Contains(err.Error(), "junction") {
		t.Fatalf("linked profile accepted: %v", err)
	}
	if _, err := profileHasData(link); err == nil {
		t.Fatal("profileHasData followed symlink")
	}
	if _, _, err := resolveHostMode(base, hostWebView2); err == nil {
		t.Fatal("linked native profile accepted")
	}
	data, err := os.ReadFile(sentinel)
	if err != nil || string(data) != "do not change" {
		t.Fatalf("original project changed: %q, %v", data, err)
	}
}

func TestDedicatedProfileGuardRejectsFile(t *testing.T) {
	base := t.TempDir()
	profile := filepath.Join(base, "DesktopProfile")
	if err := os.WriteFile(profile, []byte("existing"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := inspectDedicatedProfile(profile); err == nil {
		t.Fatal("regular file accepted as profile")
	}
	if _, _, err := resolveHostMode(base, hostBrowser); err == nil {
		t.Fatal("file profile accepted")
	}
	data, _ := os.ReadFile(profile)
	if string(data) != "existing" {
		t.Fatal("existing profile path modified")
	}
}

func TestDedicatedProfileGuardAllowsNormalExistingAndMissing(t *testing.T) {
	base := t.TempDir()
	missing := filepath.Join(base, "MissingProfile")
	if exists, err := inspectDedicatedProfile(missing); exists || err != nil {
		t.Fatalf("missing: %t %v", exists, err)
	}
	profile := filepath.Join(base, "DesktopProfile")
	if err := os.Mkdir(profile, 0700); err != nil {
		t.Fatal(err)
	}
	if exists, err := inspectDedicatedProfile(profile); !exists || err != nil {
		t.Fatalf("existing: %t %v", exists, err)
	}
	if has, err := profileHasData(profile); has || err != nil {
		t.Fatalf("empty profile: %t %v", has, err)
	}
	if err := os.WriteFile(filepath.Join(profile, "saved-project.json"), []byte("safe"), 0600); err != nil {
		t.Fatal(err)
	}
	if has, err := profileHasData(profile); !has || err != nil {
		t.Fatalf("existing data: %t %v", has, err)
	}
	mode, _, err := resolveHostMode(base, "")
	if err != nil || mode != hostBrowser {
		t.Fatalf("existing browser project must remain browser: %q %v", mode, err)
	}
}

func TestDedicatedProfileGuardRejectsBrowserSymlink(t *testing.T) {
	base := t.TempDir()
	target := filepath.Join(base, "ExistingBrowserData")
	if err := os.Mkdir(target, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "saved.json"), []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(base, "DesktopProfile")
	if err := os.Symlink(target, link); err != nil {
		t.Skipf("symlink creation unavailable: %v", err)
	}
	if _, _, err := resolveHostMode(base, ""); err == nil {
		t.Fatal("linked browser profile accepted")
	}
	data, err := os.ReadFile(filepath.Join(target, "saved.json"))
	if err != nil || string(data) != "keep" {
		t.Fatalf("original browser project changed: %q %v", data, err)
	}
}
