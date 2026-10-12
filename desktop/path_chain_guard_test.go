package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStorageChainRejectsRedirectedAppRootPreservesProject(t *testing.T) {
	parent := t.TempDir()
	target := filepath.Join(parent, "untouched")
	if err := os.MkdirAll(filepath.Join(target, "DesktopProfile"), 0700); err != nil {
		t.Fatal(err)
	}
	sentinel := filepath.Join(target, "DesktopProfile", "project.json")
	if err := os.WriteFile(sentinel, []byte("keep-original-project"), 0600); err != nil {
		t.Fatal(err)
	}
	linkedAppRoot := filepath.Join(parent, "MYVOCAL Studio")
	if err := os.Symlink(target, linkedAppRoot); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	if _, err := inspectDedicatedProfile(filepath.Join(linkedAppRoot, "DesktopProfile")); err == nil || !strings.Contains(err.Error(), "junction") {
		t.Fatalf("redirected app root accepted: %v", err)
	}
	if _, _, err := resolveHostMode(linkedAppRoot, ""); err == nil {
		t.Fatal("resolver followed redirected app root")
	}
	if err := persistHostMode(linkedAppRoot, hostBrowser); err == nil {
		t.Fatal("writer followed redirected app root")
	}
	data, err := os.ReadFile(sentinel)
	if err != nil || string(data) != "keep-original-project" {
		t.Fatalf("original data changed: %q %v", data, err)
	}
	if _, err := os.Stat(filepath.Join(target, "launcher-host.json")); !os.IsNotExist(err) {
		t.Fatalf("unexpected preference created: %v", err)
	}
}

func TestStorageChainRejectsRedirectedAncestor(t *testing.T) {
	parent := t.TempDir()
	target := filepath.Join(parent, "other-local-appdata")
	if err := os.MkdirAll(target, 0700); err != nil {
		t.Fatal(err)
	}
	linkedParent := filepath.Join(parent, "Local")
	if err := os.Symlink(target, linkedParent); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	if _, err := inspectStorageDirectoryChain(filepath.Join(linkedParent, "MYVOCAL Studio", "DesktopProfile")); err == nil {
		t.Fatal("redirected ancestor accepted")
	}
	if _, err := os.Stat(filepath.Join(target, "MYVOCAL Studio")); !os.IsNotExist(err) {
		t.Fatalf("guard unexpectedly created app folder: %v", err)
	}
}

func TestStorageChainNormalMissingAndFileAncestor(t *testing.T) {
	base := t.TempDir()
	profile := filepath.Join(base, "MYVOCAL Studio", "DesktopProfile")
	if exists, err := inspectStorageDirectoryChain(profile); exists || err != nil {
		t.Fatalf("missing profile: %v %v", exists, err)
	}
	if err := os.MkdirAll(profile, 0700); err != nil {
		t.Fatal(err)
	}
	if exists, err := inspectStorageDirectoryChain(profile); !exists || err != nil {
		t.Fatalf("normal profile: %v %v", exists, err)
	}
	file := filepath.Join(base, "not-a-directory")
	if err := os.WriteFile(file, []byte("leave-alone"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := inspectStorageDirectoryChain(filepath.Join(file, "child")); err == nil {
		t.Fatal("file ancestor accepted")
	}
	if _, err := inspectStorageDirectoryChain("relative/profile"); err == nil {
		t.Fatal("relative path accepted")
	}
}

func TestLauncherPreferenceRejectsLinksWithoutEditingTarget(t *testing.T) {
	base := t.TempDir()
	original := filepath.Join(base, "original-settings.json")
	if err := os.WriteFile(original, []byte(`{"do_not_change":true}`), 0600); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"launcher-host.json", "launcher-browser.json"} {
		link := filepath.Join(base, name)
		if err := os.Symlink(original, link); err != nil {
			t.Skipf("symlink unavailable: %v", err)
		}
		if err := inspectLauncherPreferenceFile(link); err == nil {
			t.Fatalf("accepted linked preference: %s", name)
		}
		if name == "launcher-host.json" {
			if _, _, err := readHostPreference(base); err == nil {
				t.Fatal("read linked host preference")
			}
			if err := persistHostMode(base, hostBrowser); err == nil {
				t.Fatal("published over linked host preference")
			}
		} else {
			if _, _, err := readBrowserPreference(link); err == nil {
				t.Fatal("read linked browser preference")
			}
		}
		if err := os.Remove(link); err != nil {
			t.Fatal(err)
		}
	}
	data, err := os.ReadFile(original)
	if err != nil || string(data) != `{"do_not_change":true}` {
		t.Fatalf("linked target changed: %q %v", data, err)
	}
}
