package main

// v1.2: explicit, local-only subprocess manager for user-installed compatible
// singing engines. No shell is invoked, no model is bundled, and no training is
// performed. An executable runs ONLY after the user clicks Start.
import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

const maxManagerRequest = 12 << 10
const maxManagerLog = 10 << 10

type managedEngine struct {
	sync.Mutex
	command  *exec.Cmd
	port     int
	started  time.Time
	exeName  string
	log      string
	lastExit string
	running  bool
}

type managedLogWriter struct{ manager *managedEngine }

func (w managedLogWriter) Write(p []byte) (int, error) {
	m := w.manager
	m.Lock()
	defer m.Unlock()
	m.log += string(p)
	if len(m.log) > maxManagerLog {
		m.log = m.log[len(m.log)-maxManagerLog:]
	}
	return len(p), nil
}
func (m *managedEngine) snapshot() map[string]interface{} {
	m.Lock()
	defer m.Unlock()
	result := map[string]interface{}{"running": m.running, "port": m.port, "executable": m.exeName, "log": m.log, "lastExit": m.lastExit}
	if !m.started.IsZero() {
		result["startedAt"] = m.started.Format(time.RFC3339)
	}
	return result
}

type engineStartRequest struct {
	Executable string   `json:"executable"`
	Args       []string `json:"args"`
	Port       int      `json:"port"`
}

func validateStartRequest(r engineStartRequest) error {
	if !safeSingingPort(r.Port) {
		return fmt.Errorf("잘못된 엔진 포트")
	}
	if len(r.Executable) < 3 || len(r.Executable) > 1024 || !filepath.IsAbs(r.Executable) || strings.ContainsAny(r.Executable, "\r\n\x00") {
		return fmt.Errorf("실행 파일은 절대 경로여야 합니다")
	}
	if runtime.GOOS == "windows" && !strings.EqualFold(filepath.Ext(r.Executable), ".exe") {
		return fmt.Errorf("Windows에서는 .exe 실행 파일만 직접 실행할 수 있습니다. Python 스크립트는 python.exe의 인수로 지정하세요")
	}
	st, err := os.Stat(r.Executable)
	if err != nil || !st.Mode().IsRegular() {
		return fmt.Errorf("실행 파일이 존재하지 않거나 일반 파일이 아닙니다")
	}
	if len(r.Args) > 24 {
		return fmt.Errorf("인수 개수 초과")
	}
	for _, arg := range r.Args {
		if len(arg) > 1024 || strings.ContainsAny(arg, "\x00\r\n") {
			return fmt.Errorf("잘못된 실행 인수")
		}
	}
	return nil
}
func (a *appServer) engineManagerStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, 405, "GET만 허용됩니다")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(a.manager.snapshot())
}
func (a *appServer) engineManagerStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, 405, "POST만 허용됩니다")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxManagerRequest)
	var input engineStartRequest
	if json.NewDecoder(r.Body).Decode(&input) != nil {
		jsonError(w, 400, "실행 설정 JSON이 잘못됐습니다")
		return
	}
	if err := validateStartRequest(input); err != nil {
		jsonError(w, 400, err.Error())
		return
	}
	a.manager.Lock()
	if a.manager.running {
		a.manager.Unlock()
		jsonError(w, 409, "이미 관리 중인 엔진이 실행되고 있습니다. 먼저 중지하세요")
		return
	}
	args := make([]string, len(input.Args))
	for i, s := range input.Args {
		args[i] = strings.ReplaceAll(s, "{port}", fmt.Sprint(input.Port))
	}
	cmd := exec.Command(input.Executable, args...)
	cmd.Dir = filepath.Dir(input.Executable)
	cmd.Stdin = nil
	cmd.Stdout = managedLogWriter{&a.manager}
	cmd.Stderr = managedLogWriter{&a.manager}
	a.manager.log = ""
	a.manager.lastExit = ""
	if err := cmd.Start(); err != nil {
		a.manager.Unlock()
		jsonError(w, 502, "엔진 실행 실패: "+err.Error())
		return
	}
	a.manager.command = cmd
	a.manager.port = input.Port
	a.manager.exeName = filepath.Base(input.Executable)
	a.manager.running = true
	a.manager.started = time.Now()
	a.manager.Unlock()
	go func() {
		err := cmd.Wait()
		a.manager.Lock()
		defer a.manager.Unlock()
		if a.manager.command == cmd {
			a.manager.running = false
			a.manager.command = nil
			if err != nil {
				a.manager.lastExit = err.Error()
			} else {
				a.manager.lastExit = "정상 종료"
			}
		}
	}()
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(a.manager.snapshot())
}
func (a *appServer) engineManagerStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, 405, "POST만 허용됩니다")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	a.manager.Lock()
	cmd := a.manager.command
	a.manager.Unlock()
	if cmd == nil || cmd.Process == nil {
		jsonError(w, 409, "관리 중인 엔진이 없습니다")
		return
	}
	if err := cmd.Process.Kill(); err != nil && !strings.Contains(strings.ToLower(err.Error()), "finished") {
		jsonError(w, 502, "종료 실패: "+err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_, _ = io.WriteString(w, `{"stopping":true}`)
}

// Stop subprocesses launched by this app when the desktop server exits.
func (a *appServer) stopManagedEngine() {
	a.manager.Lock()
	cmd := a.manager.command
	a.manager.Unlock()
	if cmd != nil && cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
}
