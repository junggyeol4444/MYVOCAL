package main

// Browser profile selection is persistent. Switching silently between Edge and
// Chrome can make localStorage/IndexedDB appear empty even with the same URL.
// This file does not delete or migrate existing browser data.

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const fixedOrigin = "http://127.0.0.1:" + appPort

type browserCandidate struct {
	Path   string
	Family string
}

type browserPreference struct {
	Schema int    `json:"schema"`
	Family string `json:"browser_family"`
	Origin string `json:"origin"`
}

func availableBrowsers() []browserCandidate {
	var candidates []browserCandidate
	if runtime.GOOS == "windows" {
		for _, p := range edgePaths() {
			family := "chrome"
			if strings.EqualFold(filepath.Base(p), "msedge.exe") {
				family = "edge"
			}
			candidates = append(candidates, browserCandidate{Path: p, Family: family})
		}
	} else {
		for _, b := range []struct{ name, family string }{
			{"chromium", "chromium"}, {"google-chrome", "chrome"},
			{"microsoft-edge", "edge"}, {"chromium-browser", "chromium"},
		} {
			if p, err := exec.LookPath(b.name); err == nil {
				candidates = append(candidates, browserCandidate{Path: p, Family: b.family})
			}
		}
	}
	var usable []browserCandidate
	seen := map[string]bool{}
	for _, b := range candidates {
		if b.Path == "" || seen[strings.ToLower(b.Path)] {
			continue
		}
		st, err := os.Stat(b.Path)
		if err != nil || st.IsDir() {
			continue
		}
		seen[strings.ToLower(b.Path)] = true
		usable = append(usable, b)
	}
	return usable
}

func readBrowserPreference(path string) (browserPreference, bool, error) {
	if err := inspectLauncherPreferenceFile(path); err != nil {
		return browserPreference{}, true, err
	}
	// The preference is created exclusively by one launcher, but a concurrent
	// launcher may read it before the first writer flushes. Retry incomplete
	// files without ever overwriting a genuinely corrupt preference.
	for attempt := 0; attempt < 20; attempt++ {
		raw, err := os.ReadFile(path)
		if errors.Is(err, os.ErrNotExist) {
			return browserPreference{}, false, nil
		}
		if err != nil {
			return browserPreference{}, false, err
		}
		var p browserPreference
		if len(raw) <= 4096 && json.Unmarshal(raw, &p) == nil && p.Schema == 1 && p.Origin == fixedOrigin &&
			(p.Family == "edge" || p.Family == "chrome" || p.Family == "chromium") {
			return p, true, nil
		}
		if attempt < 19 {
			time.Sleep(25 * time.Millisecond)
		}
	}
	return browserPreference{}, true, fmt.Errorf("브라우저 설정이 손상되었거나 실행 주소가 변경되었습니다: %s (원본을 보존하고 복구하세요)", path)
}

func chooseBrowser(base string, candidates []browserCandidate) (browserCandidate, error) {
	path := filepath.Join(base, "launcher-browser.json")
	if _, err := inspectStorageDirectoryChain(base); err != nil {
		return browserCandidate{}, err
	}
	p, exists, err := readBrowserPreference(path)
	if err != nil {
		return browserCandidate{}, err
	}
	if !exists {
		if len(candidates) == 0 {
			return browserCandidate{}, errors.New("Edge 또는 Chrome 실행 파일을 찾지 못했습니다")
		}
		p = browserPreference{Schema: 1, Family: candidates[0].Family, Origin: fixedOrigin}
		if err := os.MkdirAll(base, 0700); err != nil {
			return browserCandidate{}, err
		}
		// Never publish an empty/truncated launcher-browser.json. As with
		// launcher-host.json, prepare and fsync a private file, then atomically
		// publish it without overwriting an existing preference. If another
		// launcher wins, its selection is authoritative for this process.
		if _, err := inspectStorageDirectoryChain(base); err != nil {
			return browserCandidate{}, err
		}
		if err := publishBrowserPreference(path, p); err != nil {
			return browserCandidate{}, err
		}
		p, _, err = readBrowserPreference(path)
		if err != nil {
			return browserCandidate{}, err
		}
	}
	for _, b := range candidates {
		if b.Family == p.Family {
			return b, nil
		}
	}
	return browserCandidate{}, fmt.Errorf("기존 프로젝트를 보호하기 위해 브라우저를 자동 변경하지 않습니다. 이전에 사용한 %s 브라우저를 다시 설치해 주세요 (설정: %s)", p.Family, path)
}

// publishBrowserPreference never replaces a legacy preference. Atomic
// hard-link publication is supported on NTFS and common Unix filesystems;
// unsupported filesystems fail closed instead of risking project/profile drift.
func publishBrowserPreference(path string, pref browserPreference) error {
	if err := inspectLauncherPreferenceFile(path); err != nil {
		return err
	}
	data, err := json.MarshalIndent(pref, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".launcher-browser-*.tmp")
	if err != nil {
		return fmt.Errorf("브라우저 설정 임시 파일 생성 실패: %w", err)
	}
	defer os.Remove(tmp.Name())
	if err = tmp.Chmod(0600); err == nil {
		_, err = tmp.Write(append(data, '\n'))
	}
	if err == nil {
		err = tmp.Sync()
	}
	if closeErr := tmp.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return fmt.Errorf("브라우저 설정 기록 실패: %w", err)
	}
	if err = os.Link(tmp.Name(), path); errors.Is(err, os.ErrExist) {
		// A competing launcher or an existing user setting won. The caller
		// must reread and obey that value, even if it differs from pref.
		return inspectLauncherPreferenceFile(path)
	}
	if err != nil {
		return fmt.Errorf("브라우저 설정 원자적 게시 실패 (기존 파일 보존): %w", err)
	}
	return nil
}
