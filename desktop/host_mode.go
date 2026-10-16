package main

// A WebView2 profile is not the same as a Chromium --user-data-dir profile.
// Never switch hosts behind the user's back: localStorage/IndexedDB are scoped
// to the host's profile even though the loopback origin is identical.
import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	hostBrowser  = "browser"
	hostWebView2 = "webview2"
)

type hostPreference struct {
	Schema int    `json:"schema"`
	Host   string `json:"host"`
	Origin string `json:"origin"`
}

func readHostPreference(base string) (hostPreference, bool, error) {
	path := filepath.Join(base, "launcher-host.json")
	if _, err := inspectStorageDirectoryChain(base); err != nil {
		return hostPreference{}, false, err
	}
	if err := inspectLauncherPreferenceFile(path); err != nil {
		return hostPreference{}, true, err
	}
	// A second launcher can see a file immediately after O_EXCL creates it,
	// before the first process finishes writing. Never overwrite the file.
	for attempt := 0; attempt < 20; attempt++ {
		b, err := os.ReadFile(path)
		if errors.Is(err, os.ErrNotExist) {
			return hostPreference{}, false, nil
		}
		if err != nil {
			return hostPreference{}, true, err
		}
		var p hostPreference
		if len(b) <= 4096 && json.Unmarshal(b, &p) == nil && p.Schema == 1 && p.Origin == fixedOrigin &&
			(p.Host == hostBrowser || p.Host == hostWebView2) {
			return p, true, nil
		}
		if attempt < 19 {
			time.Sleep(25 * time.Millisecond)
		}
	}
	return hostPreference{}, true, fmt.Errorf("호스트 설정이 손상되었거나 origin이 변경되었습니다. 원본을 보존하세요: %s", path)
}

// inspectDedicatedProfile also inspects all existing ancestors, not just the
// leaf. A redirected app root/LOCALAPPDATA must not silently redirect projects.
func inspectDedicatedProfile(path string) (bool, error) {
	return inspectStorageDirectoryChain(path)
}

// profileHasData only reads the top-level directory; it never deletes data.
func profileHasData(path string) (bool, error) {
	exists, err := inspectDedicatedProfile(path)
	if err != nil || !exists {
		return false, err
	}
	entries, err := os.ReadDir(path)
	if err != nil {
		return false, err
	}
	return len(entries) > 0, nil
}

// resolveHostMode is deliberately side-effect-free. Persisting the selection is
// a separate operation after the required native loader is found.
func resolveHostMode(base, request string) (string, bool, error) {
	if request != "" && request != hostBrowser && request != hostWebView2 {
		return "", false, fmt.Errorf("알 수 없는 데스크톱 호스트: %q", request)
	}
	p, exists, err := readHostPreference(base)
	if err != nil {
		return "", false, err
	}
	if exists {
		if request != "" && request != p.Host {
			return "", false, fmt.Errorf("기존 프로젝트의 저장소를 보호하기 위해 %s에서 %s로 자동 전환하지 않습니다", p.Host, request)
		}
		return p.Host, false, nil
	}
	legacy, err := profileHasData(filepath.Join(base, "DesktopProfile"))
	if err != nil {
		return "", false, err
	}
	native, err := profileHasData(filepath.Join(base, "NativeWebView2Profile"))
	if err != nil {
		return "", false, err
	}
	if legacy && native {
		return "", false, errors.New("두 브라우저 저장소가 모두 존재합니다. 자동 선택을 중단합니다. 백업 후 수동 점검하세요")
	}
	if legacy {
		if request == hostWebView2 {
			return "", false, errors.New("기존 Edge/Chrome 프로젝트 프로필이 존재합니다. WebView2로 자동 이전하지 않습니다")
		}
		return hostBrowser, true, nil
	}
	if native {
		if request == hostBrowser {
			return "", false, errors.New("WebView2 프로젝트 프로필이 존재합니다. 브라우저 모드로 자동 전환하지 않습니다")
		}
		return hostWebView2, true, nil
	}
	if request == hostBrowser {
		return hostBrowser, true, nil
	}
	// New installations open a real Windows WebView2 window by default.
	// Existing Chromium profiles and pinned host preferences above remain untouched.
	return hostWebView2, true, nil
}

// persistHostMode publishes a fully written, fsynced preference in one step.
// A competing launcher can see either no preference or a complete preference,
// never an O_EXCL-created but only partially written JSON file.
// Hard links give no-overwrite publication on NTFS and POSIX filesystems.
// If the filesystem cannot create hard links, fail closed rather than risk
// replacing an existing user's preference or silently switching profiles.
func persistHostMode(base, mode string) error {
	if mode != hostBrowser && mode != hostWebView2 {
		return errors.New("invalid host mode")
	}
	path := filepath.Join(base, "launcher-host.json")
	if _, err := inspectStorageDirectoryChain(base); err != nil {
		return err
	}
	if err := inspectLauncherPreferenceFile(path); err != nil {
		return err
	}
	p := hostPreference{Schema: 1, Host: mode, Origin: fixedOrigin}
	b, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(base, ".launcher-host-*.tmp")
	if err != nil {
		return fmt.Errorf("호스트 설정 임시 파일 생성 실패: %w", err)
	}
	defer os.Remove(tmp.Name())
	if err = tmp.Chmod(0600); err == nil {
		_, err = tmp.Write(append(b, '\n'))
	}
	if err == nil {
		err = tmp.Sync()
	}
	if closeErr := tmp.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return fmt.Errorf("호스트 설정 기록 실패: %w", err)
	}
	// Link creates path atomically without overwriting an existing pin.
	err = os.Link(tmp.Name(), path)
	if errors.Is(err, os.ErrExist) {
		current, exists, e := readHostPreference(base)
		if e != nil {
			return e
		}
		if !exists || current.Host != mode {
			return fmt.Errorf("다른 프로세스가 호스트 설정을 변경했습니다: %s", path)
		}
		return nil
	}
	if err != nil {
		return fmt.Errorf("호스트 설정 원자적 게시 실패 (기존 파일 보존): %w", err)
	}
	return nil
}

func requestedHostMode() string {
	return strings.ToLower(strings.TrimSpace(os.Getenv("MYVOCAL_DESKTOP_HOST")))
}
