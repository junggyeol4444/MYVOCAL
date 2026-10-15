package main

// Desktop host preflight. The embedded UI is currently opened by an installed
// Chromium browser in app mode; it is NOT an embedded WebView2 control.
// Keep profile and origin stable across EXE upgrades.

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// A missing LOCALAPPDATA on Windows must never silently redirect the browser
// profile to TEMP, since that can make all saved projects appear lost.
func persistentAppDataPath(goos, localAppData, tempDir string) (string, error) {
	base := strings.TrimSpace(localAppData)
	if goos == "windows" {
		if base == "" || !filepath.IsAbs(base) {
			return "", errors.New("Windows LOCALAPPDATA 경로를 확인할 수 없습니다. 임시 폴더로 프로젝트 저장소를 변경하지 않습니다")
		}
	} else if base == "" {
		base = tempDir // test/Linux launcher; Windows always requires LOCALAPPDATA.
	}
	return filepath.Join(base, "MYVOCAL Studio"), nil
}

// Prevent any future refactor from accidentally launching the dedicated app
// profile against a different origin (different origin = different storage).
func browserLaunchArgs(url, profile string) ([]string, error) {
	if url != fixedOrigin {
		return nil, fmt.Errorf("브라우저 실행 주소가 기존 저장소 주소와 다릅니다: %q", url)
	}
	if profile == "" || !filepath.IsAbs(profile) {
		return nil, errors.New("전용 브라우저 프로필 경로는 절대 경로여야 합니다")
	}
	return []string{
		"--app=" + fixedOrigin,
		"--user-data-dir=" + profile,
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-background-mode",
		"--disable-background-networking",
		"--disable-sync",
		"--disable-component-update",
		"--no-pings",
		"--window-size=1480,920",
		"--new-window",
	}, nil
}

func preflightDesktopStorage() error {
	base, err := persistentAppDataPath(runtime.GOOS, os.Getenv("LOCALAPPDATA"), os.TempDir())
	if err != nil {
		return err
	}
	if _, err := inspectStorageDirectoryChain(base); err != nil {
		return err
	}
	if err := os.MkdirAll(base, 0700); err != nil {
		return fmt.Errorf("앱 데이터 폴더를 만들 수 없습니다: %w", err)
	}
	if _, err := inspectStorageDirectoryChain(base); err != nil {
		return err
	}
	// Do not create or reset browser data here; verify only the launcher folder.
	probe, err := os.CreateTemp(base, ".myvocal-writecheck-*")
	if err != nil {
		return fmt.Errorf("앱 데이터 폴더에 기록할 수 없습니다: %w", err)
	}
	name := probe.Name()
	closeErr := probe.Close()
	removeErr := os.Remove(name)
	if closeErr != nil {
		return closeErr
	}
	if removeErr != nil {
		return removeErr
	}
	return nil
}
