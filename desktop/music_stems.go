package main

// Offline Demucs stem separation for the existing native MYVOCAL EXE.
// The output is an additive ZIP: no project, audio recording, model, or asset is overwritten.
import (
	"archive/zip"
	"bytes"
	"context"
	"embed"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

//go:embed music_stems_worker.py
var embeddedMusicStemsWorker embed.FS

const maxStemInput = 72 << 20
const maxStemResponse = 450 << 20

var musicStemSlot = make(chan struct{}, 1)
var stemModelPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,48}$`)
var stemNames = []string{"drums", "bass", "other", "vocals"}
var stemExtras = []string{"guitar", "piano"}

type musicStemOptions struct{ Python, Repo, Model, Device string }
type musicStemRunner func(context.Context, musicStemOptions, string, string) error

type stemWavInfo struct {
	Frames     int64 `json:"frames"`
	SampleRate int   `json:"sampleRate"`
	Channels   int   `json:"channels"`
	Bits       int   `json:"bits"`
}

func validateMusicStemOptions(o musicStemOptions) error {
	if len(o.Python) > 1024 || len(o.Repo) > 1024 || !filepath.IsAbs(o.Python) || !filepath.IsAbs(o.Repo) || strings.ContainsAny(o.Python+o.Repo, "\r\n\x00") {
		return errors.New("Demucs Python.exe와 로컬 모델 폴더의 절대 경로를 입력하세요")
	}
	if runtime.GOOS == "windows" && !strings.EqualFold(filepath.Base(o.Python), "python.exe") {
		return errors.New("Windows Python.exe가 필요합니다")
	}
	if err := ensureRegular(o.Python); err != nil {
		return errors.New("Python 실행 파일을 찾지 못했습니다")
	}
	if !stemModelPattern.MatchString(o.Model) {
		return errors.New("Demucs 모델 이름은 영문·숫자·밑줄·하이픈만 허용합니다")
	}
	if o.Device != "auto" && o.Device != "cpu" && o.Device != "cuda" {
		return errors.New("Demucs 장치 설정이 올바르지 않습니다")
	}
	info, err := os.Lstat(o.Repo)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return errors.New("로컬 Demucs 모델 폴더를 확인하세요")
	}
	entries, err := os.ReadDir(o.Repo)
	if err != nil {
		return errors.New("Demucs 모델 폴더를 읽지 못했습니다")
	}
	weights, selected := false, false
	for _, entry := range entries {
		if entry.IsDir() || !entry.Type().IsRegular() {
			continue
		}
		name := entry.Name()
		if strings.EqualFold(filepath.Ext(name), ".th") {
			weights = true
			signature := strings.TrimSuffix(name, filepath.Ext(name))
			if strings.SplitN(signature, "-", 2)[0] == o.Model {
				selected = true
			}
		}
		if name == o.Model+".yaml" {
			selected = true
		}
	}
	if !weights {
		return errors.New("로컬 Demucs 모델 폴더에 .th 가중치가 없습니다. 자동 다운로드하지 않습니다")
	}
	if !selected {
		return errors.New("선택한 Demucs 모델 이름과 일치하는 로컬 YAML 또는 .th가 없습니다")
	}
	return nil
}

// Bounded writer avoids an unbounded memory spike from long neural logs.
type stemErrorTail struct {
	buf *bytes.Buffer
	max int
}

func (w *stemErrorTail) Write(p []byte) (int, error) {
	n := len(p)
	if len(p) >= w.max {
		w.buf.Reset()
		w.buf.Write(p[len(p)-w.max:])
		return n, nil
	}
	if w.buf.Len()+len(p) > w.max {
		data := append([]byte(nil), w.buf.Bytes()...)
		cut := w.buf.Len() + len(p) - w.max
		w.buf.Reset()
		w.buf.Write(data[cut:])
	}
	w.buf.Write(p)
	return n, nil
}
func runMusicStemModel(ctx context.Context, o musicStemOptions, input, out string) error {
	script, err := embeddedMusicStemsWorker.ReadFile("music_stems_worker.py")
	if err != nil {
		return err
	}
	scriptPath := filepath.Join(filepath.Dir(input), "music_stems_worker.py")
	if err = os.WriteFile(scriptPath, script, 0600); err != nil {
		return err
	}
	cmd := exec.CommandContext(ctx, o.Python, scriptPath, "--repo", o.Repo, "--model", o.Model, "--input", input, "--out", out, "--device", o.Device)
	cmd.Dir = filepath.Dir(input)
	cmd.Stdin = nil
	cmd.Stdout = io.Discard
	// Preserve only a bounded error message for real Windows model failures.
	// This is not a transcript of the user's recordings or model files.
	var stderr bytes.Buffer
	cmd.Stderr = &stemErrorTail{buf: &stderr, max: 8192}
	cmd.Env = append(os.Environ(), "HF_HUB_OFFLINE=1", "TRANSFORMERS_OFFLINE=1", "HF_DATASETS_OFFLINE=1")
	if runtime.GOOS == "windows" {
		cmd.Cancel = func() error {
			if cmd.Process == nil {
				return os.ErrProcessDone
			}
			kill := exec.Command("taskkill", "/PID", fmt.Sprint(cmd.Process.Pid), "/T", "/F")
			if err := kill.Run(); err != nil {
				return cmd.Process.Kill()
			}
			return nil
		}
	}
	if err = cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return errors.New("Demucs 분리 작업이 취소되거나 제한 시간을 초과했습니다")
		}
		detail := strings.TrimSpace(stderr.String())
		if len(detail) > 1000 {
			detail = detail[len(detail)-1000:]
		}
		if detail != "" {
			return fmt.Errorf("로컬 Demucs 실행 실패 (설치·모델·GPU 확인): %w / %s", err, detail)
		}
		return fmt.Errorf("로컬 Demucs 실행 실패 (설치·모델·GPU 확인): %w", err)
	}
	return nil
}

// Parse RIFF chunk boundaries without loading a multi-minute WAV into RAM.
func inspectStemPCM(path string) (stemWavInfo, error) {
	var out stemWavInfo
	f, err := os.Open(path)
	if err != nil {
		return out, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() < 44 || info.Size() > maxStemInput {
		return out, errors.New("분리 WAV 파일 크기 오류")
	}
	header := make([]byte, 12)
	if _, err = io.ReadFull(f, header); err != nil {
		return out, err
	}
	if string(header[:4]) != "RIFF" || string(header[8:12]) != "WAVE" || int64(binary.LittleEndian.Uint32(header[4:8]))+8 != info.Size() {
		return out, errors.New("RIFF/WAVE 길이 오류")
	}
	var haveFmt, haveData bool
	var dataBytes int64
	for pos := int64(12); pos+8 <= info.Size(); {
		var chunk [8]byte
		if _, err = f.ReadAt(chunk[:], pos); err != nil {
			return out, err
		}
		size := int64(binary.LittleEndian.Uint32(chunk[4:8]))
		start := pos + 8
		if size > info.Size()-start {
			return out, errors.New("WAV 청크 경계 오류")
		}
		switch string(chunk[:4]) {
		case "fmt ":
			if haveFmt || size < 16 {
				return out, errors.New("WAV 포맷 중복·누락 오류")
			}
			var format [16]byte
			if _, err = f.ReadAt(format[:], start); err != nil {
				return out, err
			}
			if binary.LittleEndian.Uint16(format[:2]) != 1 {
				return out, errors.New("PCM16 WAV만 지원합니다")
			}
			out.Channels = int(binary.LittleEndian.Uint16(format[2:4]))
			out.SampleRate = int(binary.LittleEndian.Uint32(format[4:8]))
			out.Bits = int(binary.LittleEndian.Uint16(format[14:16]))
			if out.Channels != 2 || out.SampleRate != 44100 || out.Bits != 16 || binary.LittleEndian.Uint16(format[12:14]) != 4 || binary.LittleEndian.Uint32(format[8:12]) != 176400 {
				return out, errors.New("44.1kHz·2채널·16비트 PCM이 아닙니다")
			}
			haveFmt = true
		case "data":
			if haveData {
				return out, errors.New("WAV 데이터 청크 중복 오류")
			}
			dataBytes = size
			haveData = true
		}
		pos = start + size + (size & 1)
	}
	if !haveFmt || !haveData || dataBytes%4 != 0 {
		return out, errors.New("WAV 오디오 데이터가 없습니다")
	}
	out.Frames = dataBytes / 4
	if out.Frames < 4410 || out.Frames > 44100*360 {
		return out, errors.New("Demucs 분리 WAV 길이(0.1~360초) 오류")
	}
	return out, nil
}

func writeMusicStemsZip(path, output, model string) error {
	base := filepath.Join(output, model) // --filename {stem}.{ext} omits the default track subdirectory.
	type item struct {
		name, path string
		info       stemWavInfo
	}
	names := append([]string(nil), stemNames...)
	guitar, gErr := os.Lstat(filepath.Join(base, "guitar.wav"))
	piano, pErr := os.Lstat(filepath.Join(base, "piano.wav"))
	if gErr == nil && pErr == nil && guitar.Mode().IsRegular() && piano.Mode().IsRegular() {
		names = append(names, stemExtras...)
	} else if gErr == nil || pErr == nil {
		return errors.New("Demucs 6트랙 출력 중 기타 또는 피아노 WAV가 누락됐습니다")
	}
	entries, err := os.ReadDir(base)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if !strings.HasSuffix(strings.ToLower(entry.Name()), ".wav") {
			continue
		}
		found := false
		for _, name := range names {
			if entry.Name() == name+".wav" {
				found = true
				break
			}
		}
		if !found {
			return errors.New("Demucs 출력에 알 수 없는 추가 WAV가 있습니다")
		}
	}
	items := make([]item, 0, len(names))
	var expected int64 = -1
	for _, name := range names {
		source := filepath.Join(base, name+".wav")
		st, err := os.Lstat(source)
		if err != nil || !st.Mode().IsRegular() {
			return fmt.Errorf("%s.wav 신경망 출력이 없습니다", name)
		}
		report, err := inspectStemPCM(source)
		if err != nil {
			return fmt.Errorf("%s.wav: %w", name, err)
		}
		if expected != -1 && expected != report.Frames {
			return errors.New("분리 트랙의 프레임 길이가 서로 다릅니다")
		}
		expected = report.Frames
		items = append(items, item{name, source, report})
	}
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	remove := true
	defer func() {
		_ = f.Close()
		if remove {
			_ = os.Remove(path)
		}
	}()
	zw := zip.NewWriter(f)
	manifest := struct {
		Format     string   `json:"format"`
		Version    int      `json:"version"`
		Engine     string   `json:"engine"`
		Model      string   `json:"model"`
		Stems      []string `json:"stems"`
		Frames     int64    `json:"frames"`
		SampleRate int      `json:"sampleRate"`
		Channels   int      `json:"channels"`
		Bits       int      `json:"bits"`
	}{"MYVOCAL_NEURAL_STEMS", 1, "Demucs", model, names, expected, 44100, 2, 16}
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	writer, err := zw.CreateHeader(&zip.FileHeader{Name: "stems/manifest.json", Method: zip.Store})
	if err != nil {
		return err
	}
	if _, err = writer.Write(data); err != nil {
		return err
	}
	for _, item := range items {
		writer, err = zw.CreateHeader(&zip.FileHeader{Name: "stems/" + item.name + ".wav", Method: zip.Store})
		if err != nil {
			return err
		}
		src, openErr := os.Open(item.path)
		if openErr != nil {
			return openErr
		}
		_, err = io.Copy(writer, src)
		closeErr := src.Close()
		if err != nil {
			return err
		}
		if closeErr != nil {
			return closeErr
		}
	}
	if err = zw.Close(); err != nil {
		return err
	}
	if err = f.Sync(); err != nil {
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	stat, err := os.Stat(path)
	if err != nil {
		return err
	}
	if stat.Size() < 200 || stat.Size() > maxStemResponse {
		return errors.New("분리 ZIP 크기 제한을 초과했습니다")
	}
	remove = false
	return nil
}

func (a *appServer) musicStemsSplit(w http.ResponseWriter, r *http.Request) {
	a.musicStemsSplitWith(w, r, runMusicStemModel)
}
func (a *appServer) musicStemsSplitWith(w http.ResponseWriter, r *http.Request, runner musicStemRunner) {
	if r.Method != http.MethodPost {
		jsonError(w, 405, "POST만 허용합니다")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	select {
	case musicStemSlot <- struct{}{}:
		defer func() { <-musicStemSlot }()
	default:
		jsonError(w, 409, "이미 분리 작업이 실행 중입니다")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxStemInput+(1<<20))
	if err := r.ParseMultipartForm(2 << 20); err != nil {
		jsonError(w, 400, "분리 요청이 너무 크거나 형식이 올바르지 않습니다")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	o := musicStemOptions{Python: r.FormValue("python"), Repo: r.FormValue("repo"), Model: r.FormValue("model"), Device: r.FormValue("device")}
	if err := validateMusicStemOptions(o); err != nil {
		jsonError(w, 400, err.Error())
		return
	}
	source, header, err := r.FormFile("audio")
	if err != nil {
		jsonError(w, 400, "분리할 MusicGen WAV가 없습니다")
		return
	}
	defer source.Close()
	if header.Size < 44 || header.Size > maxStemInput {
		jsonError(w, 400, "분리할 WAV 크기가 올바르지 않습니다")
		return
	}
	dir, err := os.MkdirTemp("", "myvocal-demucs-")
	if err != nil {
		jsonError(w, 500, "임시 폴더를 만들 수 없습니다")
		return
	}
	defer os.RemoveAll(dir)
	input := filepath.Join(dir, "musicgen.wav")
	target, err := os.OpenFile(input, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		jsonError(w, 500, "임시 WAV 저장 실패")
		return
	}
	n, err := io.Copy(target, io.LimitReader(source, maxStemInput+1))
	closeErr := target.Close()
	if err != nil || closeErr != nil || n < 44 || n > maxStemInput {
		jsonError(w, 400, "WAV 업로드가 잘렸거나 크기가 초과됐습니다")
		return
	}
	// The current MusicGen WAV validator checks RIFF integrity without assuming 3~8 seconds.
	inputRaw, err := os.ReadFile(input)
	if err != nil || !validSingingWAV(inputRaw) {
		jsonError(w, 400, "분리할 WAV 형식이 잘못됐습니다")
		return
	}
	out := filepath.Join(dir, "out")
	if err = os.Mkdir(out, 0700); err != nil {
		jsonError(w, 500, "출력 폴더 생성 실패")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Minute)
	defer cancel()
	if err = runner(ctx, o, input, out); err != nil {
		jsonError(w, 502, err.Error())
		return
	}
	zipPath := filepath.Join(dir, "stems.zip")
	if err = writeMusicStemsZip(zipPath, out, o.Model); err != nil {
		jsonError(w, 502, "신경망 분리 결과 검증 실패: "+err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Disposition", "attachment; filename=MYVOCAL-Demucs-Stems.zip")
	http.ServeFile(w, r, zipPath)
}
