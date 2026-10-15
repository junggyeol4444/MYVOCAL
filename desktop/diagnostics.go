package main

// v1.8 system readiness checks. This endpoint performs no downloading,
// model installation, shell execution, microphone recording, or network scans.
import (
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

type readinessCheck struct {
	ID        string `json:"id"`
	Available bool   `json:"available"`
	Detail    string `json:"detail"`
}

type readinessReport struct {
	Version               string           `json:"version"`
	OS                    string           `json:"os"`
	Arch                  string           `json:"arch"`
	Checks                []readinessCheck `json:"checks"`
	BundledNeuralSinging  bool             `json:"bundledNeuralSinging"`
	BundledVideoGenerator bool             `json:"bundledVideoGenerator"`
	ManagedEngineRunning  bool             `json:"managedEngineRunning"`
	LocalOnly             bool             `json:"localOnly"`
	ExternalAPIEnabled    bool             `json:"externalAPIEnabled"`
}

func browserDetected() bool {
	if runtime.GOOS == "windows" {
		for _, p := range edgePaths() {
			if s, err := os.Stat(p); err == nil && !s.IsDir() {
				return true
			}
		}
		return false
	}
	for _, n := range []string{"chromium", "google-chrome", "microsoft-edge", "chromium-browser"} {
		if _, err := exec.LookPath(n); err == nil {
			return true
		}
	}
	return false
}

func dataStorageWritable() bool {
	dir := filepath.Join(dataDir(), "diagnostics")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return false
	}
	f, err := os.CreateTemp(dir, "readiness-*.tmp")
	if err != nil {
		return false
	}
	path := f.Name()
	_, werr := f.Write([]byte("MYVOCAL-v1.8"))
	cerr := f.Close()
	_ = os.Remove(path)
	return werr == nil && cerr == nil
}

func (a *appServer) systemReadiness(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, 405, "GET만 허용합니다.")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	managed := a.manager.snapshot()["running"] == true
	report := readinessReport{
		Version: "1.8.0", OS: runtime.GOOS, Arch: runtime.GOARCH,
		Checks: []readinessCheck{
			{ID: "desktop_browser", Available: browserDetected(), Detail: "데스크톱 창을 여는 데 Edge 또는 Chrome이 필요합니다."},
			{ID: "data_folder", Available: dataStorageWritable(), Detail: "앱 데이터 폴더에 진단용 파일을 썼다가 삭제합니다."},
			{ID: "app_server", Available: true, Detail: "진단 응답을 반환하는 로컬 앱 서버가 실행 중입니다."},
		},
		BundledNeuralSinging:  false,
		BundledVideoGenerator: false,
		ManagedEngineRunning:  managed,
		LocalOnly:             true,
		ExternalAPIEnabled:    false,
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(report)
}
