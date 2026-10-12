package main

// MYVOCAL v1.6: non-executing OpenUtau installation-path diagnostics.
// Never launches an executable, reads voice data, or installs any software.
import (
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

func validOpenUtauPath(path string) bool {
	if len(path) < 14 || len(path) > 2048 || !filepath.IsAbs(path) || strings.ContainsAny(path, "\x00\r\n") {
		return false
	}
	return strings.EqualFold(filepath.Base(path), "OpenUtau.exe")
}
func openUtauCandidates() []string {
	options := []string{}
	if p, e := exec.LookPath("OpenUtau.exe"); e == nil {
		options = append(options, p)
	}
	for _, root := range []string{os.Getenv("LOCALAPPDATA"), os.Getenv("PROGRAMFILES"), os.Getenv("PROGRAMFILES(X86)")} {
		if root == "" {
			continue
		}
		for _, suffix := range []string{"OpenUtau/OpenUtau.exe", "Programs/OpenUtau/OpenUtau.exe", "OpenUtau/bin/OpenUtau.exe"} {
			options = append(options, filepath.Join(root, filepath.FromSlash(suffix)))
		}
	}
	return options
}
func fileIsPresent(path string) bool {
	fi, err := os.Stat(path)
	return err == nil && fi.Mode().IsRegular()
}
func (a *appServer) openUtauInspect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, 405, "GET만 지원합니다.")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	path := strings.TrimSpace(r.URL.Query().Get("path"))
	candidates := []string{}
	if path != "" {
		if !validOpenUtauPath(path) {
			jsonError(w, 400, "OpenUtau.exe의 절대 경로만 검사할 수 있습니다.")
			return
		}
		candidates = append(candidates, path)
	} else {
		candidates = openUtauCandidates()
	}
	found := []string{}
	seen := map[string]bool{}
	for _, candidate := range candidates {
		key := strings.ToLower(filepath.Clean(candidate))
		if !seen[key] && validOpenUtauPath(candidate) && fileIsPresent(candidate) {
			found = append(found, candidate)
		}
		seen[key] = true
	}
	message := "선택한 경로나 일반적인 설치 위치에서 OpenUtau.exe를 찾지 못했습니다."
	if len(found) > 0 {
		message = "OpenUtau.exe가 파일로 존재합니다. 실행 및 보이스뱅크 로딩 검증은 아닙니다."
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]any{"platform": runtime.GOOS, "found": len(found) > 0, "paths": found, "message": message})
}
