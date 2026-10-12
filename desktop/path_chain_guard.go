package main

// Check every existing component of a dedicated app/profile directory before
// accessing it. Checking only the leaf misses a redirected parent such as
// LOCALAPPDATA/MYVOCAL Studio. This is a fail-closed, read-only guard; it does
// not attempt to repair or migrate an existing project store.
import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func inspectStorageDirectoryChain(path string) (bool, error) {
	if path == "" || !filepath.IsAbs(path) {
		return false, fmt.Errorf("저장소 경로는 절대 경로여야 합니다: %q", path)
	}
	clean := filepath.Clean(path)
	volume := filepath.VolumeName(clean)
	root := volume + string(filepath.Separator)
	remainder := strings.TrimPrefix(clean, root)
	if remainder == clean {
		return false, fmt.Errorf("저장소 루트 경로를 분석할 수 없습니다: %q", path)
	}
	// The volume root is an OS-managed boundary. Inspect every component
	// beneath it, including LOCALAPPDATA, app root and the profile directory.
	current := root
	for _, component := range strings.Split(remainder, string(filepath.Separator)) {
		if component == "" {
			continue
		}
		current = filepath.Join(current, component)
		info, err := os.Lstat(current)
		if errors.Is(err, os.ErrNotExist) {
			return false, nil
		}
		if err != nil {
			return false, fmt.Errorf("저장소 경로 검사 실패 (%s): %w", current, err)
		}
		redirected, err := isWindowsReparsePoint(current)
		if err != nil {
			return false, fmt.Errorf("저장소 reparse 검사 실패 (%s): %w", current, err)
		}
		if info.Mode()&os.ModeSymlink != 0 || redirected {
			return true, fmt.Errorf("저장소 경로에 링크 또는 junction/reparse point가 있습니다. 원본을 보존하고 수동 점검하세요: %s", current)
		}
		if !info.IsDir() {
			return true, fmt.Errorf("저장소 경로의 중간 요소가 폴더가 아닙니다. 원본을 보존하세요: %s", current)
		}
	}
	return true, nil
}

// Preference files must be regular files, never symlinks or reparse points.
// The containing app directory is checked separately by the directory guard.
func inspectLauncherPreferenceFile(path string) error {
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	redirected, err := isWindowsReparsePoint(path)
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 || redirected || !info.Mode().IsRegular() {
		return fmt.Errorf("실행 설정이 링크/reparse point 또는 일반 파일이 아닙니다. 원본을 보존하세요: %s", path)
	}
	return nil
}
