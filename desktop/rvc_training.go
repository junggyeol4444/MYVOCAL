package main

// Optional local training runner. The user provides an installed trainer script
// and explicitly starts it; MYVOCAL never downloads or invents model weights.
// All input samples are copied into a new isolated job directory, never moved.
import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const maxRVCTrainingBundle = 151 << 20
const maxRVCTrainedModel = 200 << 20
const maxRVCTrainingRequest = maxRVCTrainingBundle + (1 << 20)

type rvcTrainingOptions struct {
	Root    string
	Python  string
	Script  string
	Args    []string
	VoiceID string
}
type rvcTrainingRunner func(context.Context, rvcTrainingOptions, string, string, io.Writer) error

type rvcTrainingManager struct {
	mu        sync.Mutex
	id        string
	state     string
	voiceID   string
	message   string
	log       string
	modelPath string
	workDir   string
	started   time.Time
	cancel    context.CancelFunc
}
type rvcTrainLog struct{ manager *rvcTrainingManager }

func (w rvcTrainLog) Write(p []byte) (int, error) {
	m := w.manager
	m.mu.Lock()
	defer m.mu.Unlock()
	m.log += string(p)
	if len(m.log) > 4096 {
		m.log = m.log[len(m.log)-4096:]
	}
	return len(p), nil
}
func (m *rvcTrainingManager) snapshot() map[string]any {
	m.mu.Lock()
	defer m.mu.Unlock()
	return map[string]any{"id": m.id, "state": m.state, "voiceId": m.voiceID, "message": m.message,
		"log": m.log, "modelAvailable": m.state == "completed" && m.modelPath != "",
		"startedAt": m.started.Format(time.RFC3339)}
}
func (m *rvcTrainingManager) stop() {
	m.mu.Lock()
	cancel := m.cancel
	m.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func validateTrainingOptions(o rvcTrainingOptions) error {
	if o.VoiceID == "" || len(o.VoiceID) > 128 || strings.ContainsAny(o.VoiceID, "/\\\r\n\x00") {
		return errors.New("목소리 ID가 올바르지 않습니다")
	}
	if len(o.Root) > 1024 || len(o.Python) > 1024 || len(o.Script) > 1024 || !filepath.IsAbs(o.Root) || !filepath.IsAbs(o.Python) || !filepath.IsAbs(o.Script) {
		return errors.New("학습 프로그램과 Python의 절대 경로를 지정하세요")
	}
	if strings.ContainsAny(o.Root+o.Python+o.Script, "\x00\r\n") {
		return errors.New("학습 경로에 허용되지 않는 문자가 있습니다")
	}
	rel, err := filepath.Rel(o.Root, o.Script)
	if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return errors.New("학습 스크립트는 선택한 설치 폴더 안에 있어야 합니다")
	}
	if filepath.Ext(o.Script) != ".py" {
		return errors.New("설치된 Python 학습 스크립트(.py)를 선택하세요")
	}
	if err := ensureRegular(o.Python); err != nil {
		return fmt.Errorf("Python 실행 파일: %w", err)
	}
	if err := ensureRegular(o.Script); err != nil {
		return fmt.Errorf("학습 스크립트: %w", err)
	}
	if len(o.Args) < 2 || len(o.Args) > 30 {
		return errors.New("학습 인수 2~30개를 지정하세요")
	}
	hasData, hasOutput := false, false
	for _, arg := range o.Args {
		if len(arg) > 1000 || strings.ContainsAny(arg, "\x00\r\n") {
			return errors.New("학습 인수에 허용되지 않는 문자가 있습니다")
		}
		if strings.Contains(arg, "{dataset}") {
			hasData = true
		}
		if strings.Contains(arg, "{output}") {
			hasOutput = true
		}
	}
	if !hasData || !hasOutput {
		return errors.New("학습 인수에 {dataset} 및 {output}이 필요합니다")
	}
	return nil
}
func unpackTrainingBundle(raw []byte, destination, voiceID string) (int, error) {
	if len(raw) < 100 || len(raw) > maxRVCTrainingBundle {
		return 0, errors.New("학습 ZIP 크기 오류 (최대 151MiB)")
	}
	zr, e := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if e != nil {
		return 0, errors.New("학습 ZIP 형식 오류")
	}
	if len(zr.File) > 204 {
		return 0, errors.New("학습 ZIP 엔트리가 너무 많습니다")
	}
	seen := map[string]bool{}
	count := 0
	havePlan, haveManifest := false, false
	var total uint64
	for _, f := range zr.File {
		name := f.Name
		if seen[name] || strings.Contains(name, "\\") || strings.Contains(name, "..") || strings.HasPrefix(name, "/") || f.FileInfo().Mode()&os.ModeSymlink != 0 || f.FileInfo().IsDir() {
			return 0, errors.New("ZIP 내부 경로 또는 중복 파일이 안전하지 않습니다")
		}
		seen[name] = true
		switch {
		case name == "manifest.json":
			haveManifest = true
		case name == "training-plan.json":
			havePlan = true
		case name == "README.txt":
		case strings.HasPrefix(name, "audio/sample-"):
			base := strings.TrimPrefix(name, "audio/sample-")
			if len(base) < 7 || len(base) > 13 || base[3] != '.' || !(base[0] >= '0' && base[0] <= '9' && base[1] >= '0' && base[1] <= '9' && base[2] >= '0' && base[2] <= '9') {
				return 0, errors.New("학습 샘플 경로가 올바르지 않습니다")
			}
			switch strings.ToLower(filepath.Ext(base)) {
			case ".wav", ".mp3", ".m4a", ".ogg", ".flac", ".webm", ".aac":
			default:
				return 0, errors.New("지원하지 않는 학습 오디오 확장자")
			}
			count++
		default:
			return 0, errors.New("학습 ZIP에 예상하지 못한 파일이 포함됐습니다")
		}
		if f.UncompressedSize64 > maxRVCTrainingBundle {
			return 0, errors.New("압축 해제 파일이 너무 큽니다")
		}
		total += f.UncompressedSize64
		if total > maxRVCTrainingBundle {
			return 0, errors.New("학습 ZIP 압축 해제 총량이 너무 큽니다")
		}
	}
	if !havePlan || !haveManifest || count == 0 {
		return 0, errors.New("MYVOCAL 학습 자료 manifest 또는 녹음이 없습니다")
	}
	// Confirm metadata is from the existing MYVOCAL dataset exporter.
	for _, f := range zr.File {
		if f.Name == "manifest.json" || f.Name == "training-plan.json" {
			in, e := f.Open()
			if e != nil {
				return 0, e
			}
			raw, e := io.ReadAll(io.LimitReader(in, 1<<20))
			in.Close()
			if e != nil {
				return 0, e
			}
			var meta map[string]json.RawMessage
			if json.Unmarshal(raw, &meta) != nil {
				return 0, errors.New("학습 manifest/준비 기록 JSON 오류")
			}
			if f.Name == "manifest.json" {
				var format string
				_ = json.Unmarshal(meta["format"], &format)
				if format != "MYVOCAL_VOICE_DATASET" {
					return 0, errors.New("MYVOCAL 음성 데이터셋 형식이 아닙니다")
				}
				var v struct {
					Rights string `json:"rights"`
				}
				_ = json.Unmarshal(meta["voice"], &v)
				if v.Rights != "self" && v.Rights != "owned" && v.Rights != "licensed" {
					return 0, errors.New("사용 권한이 있는 목소리 데이터셋만 학습할 수 있습니다")
				}
			} else {
				var format string
				_ = json.Unmarshal(meta["format"], &format)
				if format != "MYVOCAL_TRAINING_PLAN" {
					return 0, errors.New("MYVOCAL 학습 준비 기록이 아닙니다")
				}
				var id, engine string
				_ = json.Unmarshal(meta["voiceId"], &id)
				_ = json.Unmarshal(meta["engineId"], &engine)
				if id != voiceID {
					return 0, errors.New("학습 자료의 목소리가 선택한 목소리와 다릅니다")
				}
				if engine != "rvc" {
					return 0, errors.New("RVC 학습 준비 기록이 아닙니다")
				}
			}
		}
	}
	for _, f := range zr.File {
		path := filepath.Join(destination, filepath.FromSlash(f.Name))
		if e := os.MkdirAll(filepath.Dir(path), 0700); e != nil {
			return 0, e
		}
		reader, e := f.Open()
		if e != nil {
			return 0, e
		}
		out, e := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if e != nil {
			reader.Close()
			return 0, e
		}
		written, copyErr := io.Copy(out, io.LimitReader(reader, int64(f.UncompressedSize64)+1))
		closeErr := out.Close()
		reader.Close()
		if copyErr != nil || closeErr != nil || uint64(written) != f.UncompressedSize64 {
			return 0, errors.New("학습 ZIP 읽기/저장 실패")
		}
	}
	return count, nil
}

// This only rejects obvious non-checkpoint outputs. It cannot prove the neural
// weights are usable; a real inference run is still required before acceptance.
func plausibleTorchCheckpoint(path string) bool {
	f, e := os.Open(path)
	if e != nil {
		return false
	}
	defer f.Close()
	st, e := f.Stat()
	if e != nil || !st.Mode().IsRegular() || st.Size() < 1024 || st.Size() > maxRVCTrainedModel {
		return false
	}
	var head [4]byte
	if _, e = io.ReadFull(f, head[:]); e != nil {
		return false
	}
	return (head[0] == 'P' && head[1] == 'K' && head[2] == 3 && head[3] == 4) || (head[0] == 0x80 && head[1] >= 2 && head[1] <= 5)
}
func runRVCTraining(ctx context.Context, o rvcTrainingOptions, dataset, output string, log io.Writer) error {
	args := []string{o.Script}
	for _, x := range o.Args {
		args = append(args, strings.ReplaceAll(strings.ReplaceAll(x, "{dataset}", dataset), "{output}", output))
	}
	cmd := exec.CommandContext(ctx, o.Python, args...)
	cmd.Dir = o.Root
	cmd.Stdin = nil
	cmd.Stdout = log
	cmd.Stderr = log
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("외부 RVC 학습 실행 실패: %w", err)
	}
	return nil
}
func (a *appServer) rvcTrainingStart(w http.ResponseWriter, r *http.Request) {
	a.rvcTrainingStartWith(w, r, runRVCTraining)
}
func (a *appServer) rvcTrainingStartWith(w http.ResponseWriter, r *http.Request, runner rvcTrainingRunner) {
	if r.Method != http.MethodPost {
		jsonError(w, 405, "POST만 지원합니다")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	a.training.mu.Lock()
	if a.training.state == "running" || a.training.state == "preparing" {
		a.training.mu.Unlock()
		jsonError(w, 409, "이미 로컬 학습을 진행 중입니다")
		return
	}
	a.training.state = "preparing"
	a.training.mu.Unlock()
	accepted := false
	defer func() {
		if !accepted {
			a.training.mu.Lock()
			a.training.state = "idle"
			a.training.mu.Unlock()
		}
	}()
	r.Body = http.MaxBytesReader(w, r.Body, maxRVCTrainingRequest)
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		jsonError(w, 400, "학습 ZIP/요청 크기 오류")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	if r.FormValue("rights") != "confirmed" {
		jsonError(w, 403, "음성 학습 권한 확인이 필요합니다")
		return
	}
	if r.MultipartForm == nil || len(r.MultipartForm.File["bundle"]) != 1 {
		jsonError(w, 400, "MYVOCAL 학습 자료 ZIP 하나를 선택하세요")
		return
	}
	var args []string
	if e := json.Unmarshal([]byte(r.FormValue("args")), &args); e != nil {
		jsonError(w, 400, "학습 인수는 JSON 문자열 배열이어야 합니다")
		return
	}
	o := rvcTrainingOptions{Root: r.FormValue("root"), Python: r.FormValue("python"), Script: r.FormValue("script"), Args: args, VoiceID: r.FormValue("voiceId")}
	if err := validateTrainingOptions(o); err != nil {
		jsonError(w, 400, err.Error())
		return
	}
	f := r.MultipartForm.File["bundle"][0]
	if f.Size < 100 || f.Size > maxRVCTrainingBundle {
		jsonError(w, 400, "학습 ZIP은 151MiB 이하이어야 합니다")
		return
	}
	source, err := f.Open()
	if err != nil {
		jsonError(w, 400, "ZIP 열기 실패")
		return
	}
	raw, err := io.ReadAll(io.LimitReader(source, maxRVCTrainingBundle+1))
	source.Close()
	if err != nil || len(raw) > maxRVCTrainingBundle {
		jsonError(w, 400, "ZIP 읽기 실패")
		return
	}
	base := filepath.Join(dataDir(), "training-jobs")
	if err = os.MkdirAll(base, 0700); err != nil {
		jsonError(w, 500, "학습 작업 디렉터리 생성 실패")
		return
	}
	dir, err := os.MkdirTemp(base, "rvc-")
	if err != nil {
		jsonError(w, 500, "격리된 학습 디렉터리 생성 실패")
		return
	}
	samples, err := unpackTrainingBundle(raw, filepath.Join(dir, "dataset"), o.VoiceID)
	if err != nil {
		os.RemoveAll(dir)
		jsonError(w, 422, err.Error())
		return
	}
	// A trainer must explicitly create a new output file. Never target any preexisting model.
	output := filepath.Join(dir, "trained-model.pth")
	var idb [12]byte
	if _, err = rand.Read(idb[:]); err != nil {
		os.RemoveAll(dir)
		jsonError(w, 500, "작업 ID 생성 실패")
		return
	}
	id := hex.EncodeToString(idb[:])
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Hour)
	a.training.mu.Lock()
	a.training.id = id
	a.training.voiceID = o.VoiceID
	a.training.state = "running"
	a.training.message = fmt.Sprintf("실제 로컬 학습 프로그램 실행 중 · 녹음 %d개", samples)
	a.training.started = time.Now()
	a.training.log = ""
	a.training.modelPath = ""
	a.training.workDir = dir
	a.training.cancel = cancel
	a.training.mu.Unlock()
	accepted = true
	// Never silently remove a previous trained model; older job directories
	// remain intact until the user explicitly manages them outside the app.
	go func() {
		// Copies of private voice recordings exist only during this training run.
		// Remove exactly our newly-created dataset directory, never the user’s originals or output weights.
		defer os.RemoveAll(filepath.Join(dir, "dataset"))
		e := runner(ctx, o, filepath.Join(dir, "dataset"), output, rvcTrainLog{manager: &a.training})
		if e == nil && !plausibleTorchCheckpoint(output) {
			e = errors.New("학습 엔진이 PyTorch 형식의 .pth 파일을 생성하지 않았습니다")
		}
		a.training.mu.Lock()
		if a.training.id == id {
			if e != nil {
				a.training.state = "failed"
				a.training.message = e.Error()
				a.training.modelPath = ""
			} else {
				a.training.state = "completed"
				a.training.message = "실제 학습 명령 종료. 새 체크포인트 생성됨 (추론 호환성·음질은 별도 검증 필요)"
				a.training.modelPath = output
			}
			if ctx.Err() != nil {
				a.training.state = "cancelled"
				a.training.message = "학습이 취소되었거나 최대 실행 시간을 넘었습니다"
				a.training.modelPath = ""
			}
			a.training.cancel = nil
		}
		a.training.mu.Unlock()
		cancel()
	}()
	jsonReply(w, map[string]any{"id": id, "state": "running", "samples": samples})
}
func (a *appServer) rvcTrainingStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, 405, "GET만 지원합니다")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	jsonReply(w, a.training.snapshot())
}
func (a *appServer) rvcTrainingCancel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, 405, "POST만 지원합니다")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	a.training.mu.Lock()
	if a.training.state != "running" {
		a.training.mu.Unlock()
		jsonError(w, 409, "진행 중인 학습이 없습니다")
		return
	}
	c := a.training.cancel
	a.training.mu.Unlock()
	if c != nil {
		c()
	}
	jsonReply(w, map[string]any{"stopping": true})
}
func (a *appServer) rvcTrainingModel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, 405, "GET만 지원합니다")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	a.training.mu.Lock()
	id, state, path := a.training.id, a.training.state, a.training.modelPath
	a.training.mu.Unlock()
	if state != "completed" || id == "" || r.URL.Query().Get("id") != id || path == "" {
		jsonError(w, 409, "학습 완료된 모델이 없습니다")
		return
	}
	f, e := os.Open(path)
	if e != nil {
		jsonError(w, 404, "생성된 모델 파일을 찾지 못했습니다")
		return
	}
	defer f.Close()
	if !plausibleTorchCheckpoint(path) {
		jsonError(w, 422, "체크포인트 크기 또는 유형이 올바르지 않습니다")
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", "attachment; filename=MYVOCAL-RVC-trained.pth")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = io.Copy(w, f)
}