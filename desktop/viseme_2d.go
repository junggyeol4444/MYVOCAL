package main

// Offline Korean lyric alignment -> actual 2D mouth-animation WebM.
// Requires a user-owned portrait and vocal WAV; this is not neural face animation.
import (
	"bytes"
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

//go:embed viseme_2d_worker.py
var viseme2DWorker embed.FS
var viseme2DSlot = make(chan struct{}, 1)

type visemeCue struct {
	StartSec float64 `json:"startSec"`
	EndSec   float64 `json:"endSec"`
	Lyric    string  `json:"lyric"`
}
type visemeDocument struct {
	Format  string      `json:"format"`
	Version int         `json:"version"`
	Cues    []visemeCue `json:"cues"`
}
type viseme2DRunner func(context.Context, string, string, string, string, string, string, float64, float64, float64, int, int, string, string) error

func validateVisemeAlignment(raw string) ([]byte, error) {
	if len(raw) > 1<<20 {
		return nil, errors.New("가사 싱크 JSON은 1MB 이하입니다")
	}
	var a visemeDocument
	if err := json.Unmarshal([]byte(raw), &a); err != nil {
		return nil, errors.New("가사 싱크 JSON 형식 오류")
	}
	if a.Format != "MYVOCAL_LYRIC_ALIGNMENT" || a.Version != 1 || len(a.Cues) < 1 || len(a.Cues) > 400 {
		return nil, errors.New("MYVOCAL 가사·MIDI 싱크 1~400개가 필요합니다")
	}
	previous := -1.0
	for _, c := range a.Cues {
		if math.IsNaN(c.StartSec) || math.IsNaN(c.EndSec) || math.IsInf(c.StartSec, 0) || math.IsInf(c.EndSec, 0) || c.StartSec < 0 || c.StartSec < previous || c.EndSec <= c.StartSec || c.EndSec > 360 || c.EndSec-c.StartSec < .05 || len([]rune(c.Lyric)) > 100 || strings.ContainsAny(c.Lyric, "\x00\r\n") {
			return nil, errors.New("가사 싱크 시간·문자가 올바르지 않습니다")
		}
		previous = c.StartSec
	}
	return json.Marshal(a)
}

func runViseme2D(ctx context.Context, python, ffmpeg, image, audio, alignment, output string, x, y, width float64, fps, size int, soundtrack, sceneMode string) error {
	worker, err := viseme2DWorker.ReadFile("viseme_2d_worker.py")
	if err != nil {
		return err
	}
	script := filepath.Join(filepath.Dir(audio), "viseme_2d_worker.py")
	if err = os.WriteFile(script, worker, 0600); err != nil {
		return err
	}
	cmd := exec.CommandContext(ctx, python, script, "--image", image, "--audio", audio, "--alignment", alignment, "--output", output, "--ffmpeg", ffmpeg, "--x", strconv.FormatFloat(x, 'f', 4, 64), "--y", strconv.FormatFloat(y, 'f', 4, 64), "--mouth-width", strconv.FormatFloat(width, 'f', 4, 64), "--fps", strconv.Itoa(fps), "--size", strconv.Itoa(size), "--scene-mode", sceneMode)
	if soundtrack != "" {
		cmd.Args = append(cmd.Args, "--soundtrack", soundtrack)
	}
	cmd.Dir = filepath.Dir(audio)
	cmd.Stdin = nil
	cmd.Env = append(os.Environ(), "HF_HUB_OFFLINE=1", "TRANSFORMERS_OFFLINE=1")
	var logs bytes.Buffer
	cmd.Stdout = io.Discard
	cmd.Stderr = &scoreVocalLog{buf: &logs, max: 4096}
	if runtime.GOOS == "windows" {
		cmd.Cancel = func() error {
			if cmd.Process == nil {
				return os.ErrProcessDone
			}
			if e := exec.Command("taskkill", "/PID", fmt.Sprint(cmd.Process.Pid), "/T", "/F").Run(); e != nil {
				return cmd.Process.Kill()
			}
			return nil
		}
	}
	if err = cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return errors.New("2D 립싱크 렌더링이 취소되거나 제한 시간을 초과했습니다")
		}
		return fmt.Errorf("로컬 2D 립싱크 실행 실패: %w / %s", err, strings.TrimSpace(logs.String()))
	}
	return nil
}

func visemePath(value, name string) (string, error) {
	if len(value) < 4 || len(value) > 2048 || !filepath.IsAbs(value) || strings.ContainsAny(value, "\x00\r\n") {
		return "", fmt.Errorf("%s 실행 파일의 절대 경로가 필요합니다", name)
	}
	if runtime.GOOS == "windows" && !strings.EqualFold(filepath.Base(value), name+".exe") {
		return "", fmt.Errorf("%s.exe 경로가 필요합니다", name)
	}
	if err := ensureRegular(value); err != nil {
		return "", fmt.Errorf("설치된 %s 실행 파일을 확인하세요", name)
	}
	return value, nil
}
func visemeFloat(r *http.Request, key string, low, high float64) (float64, error) {
	v, err := strconv.ParseFloat(r.FormValue(key), 64)
	if err != nil || math.IsNaN(v) || math.IsInf(v, 0) || v < low || v > high {
		return 0, fmt.Errorf("%s 설정 범위 오류", key)
	}
	return v, nil
}
func visemeUpload(r *http.Request, key, path string, max int64) error {
	f, h, err := r.FormFile(key)
	if err != nil {
		return fmt.Errorf("%s 입력 파일이 필요합니다", key)
	}
	defer f.Close()
	if h.Size < 44 || h.Size > max {
		return fmt.Errorf("%s 파일 크기 제한 위반", key)
	}
	out, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	n, copyErr := io.Copy(out, io.LimitReader(f, max+1))
	closeErr := out.Close()
	if copyErr != nil || closeErr != nil || n != h.Size {
		return fmt.Errorf("%s 파일을 읽지 못했습니다", key)
	}
	return nil
}
func (a *appServer) viseme2DRender(w http.ResponseWriter, r *http.Request) {
	a.viseme2DWith(w, r, runViseme2D)
}
func (a *appServer) viseme2DWith(w http.ResponseWriter, r *http.Request, runner viseme2DRunner) {
	if r.Method != http.MethodPost {
		jsonError(w, 405, "POST만 허용합니다")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	select {
	case viseme2DSlot <- struct{}{}:
		defer func() { <-viseme2DSlot }()
	default:
		jsonError(w, 409, "다른 2D 립싱크 작업이 실행 중입니다")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 196<<20)
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		jsonError(w, 400, "이미지·보컬·음악·가사 싱크 입력이 너무 큽니다")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	if r.FormValue("rights") != "confirmed" {
		jsonError(w, 403, "캐릭터 이미지·보컬 사용 권한 확인이 필요합니다")
		return
	}
	python, err := visemePath(r.FormValue("python"), "python")
	if err != nil {
		jsonError(w, 400, err.Error())
		return
	}
	ffmpeg, err := visemePath(r.FormValue("ffmpeg"), "ffmpeg")
	if err != nil {
		jsonError(w, 400, err.Error())
		return
	}
	x, err := visemeFloat(r, "x", .1, .9)
	if err != nil {
		jsonError(w, 400, err.Error())
		return
	}
	y, err := visemeFloat(r, "y", .1, .9)
	if err != nil {
		jsonError(w, 400, err.Error())
		return
	}
	width, err := visemeFloat(r, "mouthWidth", .03, .3)
	if err != nil {
		jsonError(w, 400, err.Error())
		return
	}
	fps, err := strconv.Atoi(r.FormValue("fps"))
	if err != nil || (fps != 12 && fps != 24) {
		jsonError(w, 400, "영상 FPS는 12 또는 24입니다")
		return
	}
	size, err := strconv.Atoi(r.FormValue("size"))
	if err != nil || (size != 512 && size != 720) {
		jsonError(w, 400, "영상 해상도는 512 또는 720입니다")
		return
	}
	sceneMode := r.FormValue("sceneMode")
	if sceneMode == "" {
		sceneMode = "static"
	}
	if sceneMode != "static" && sceneMode != "performance" && sceneMode != "story" && sceneMode != "mixed" {
		jsonError(w, 400, "지원하지 않는 2D MV 장면 모드입니다")
		return
	}
	alignment, err := validateVisemeAlignment(r.FormValue("alignment"))
	if err != nil {
		jsonError(w, 400, err.Error())
		return
	}
	temp, err := os.MkdirTemp("", "myvocal-viseme2d-")
	if err != nil {
		jsonError(w, 500, "임시 영상 작업 폴더 생성 실패")
		return
	}
	defer os.RemoveAll(temp)
	image := filepath.Join(temp, "character.png")
	if err = visemeUpload(r, "image", image, 12<<20); err != nil {
		jsonError(w, 400, err.Error())
		return
	}
	header, err := os.ReadFile(image)
	if err != nil || len(header) < 8 || !(bytes.HasPrefix(header, []byte("\x89PNG\r\n\x1a\n")) || bytes.HasPrefix(header, []byte("\xff\xd8\xff"))) {
		jsonError(w, 422, "PNG/JPEG 캐릭터 이미지 형식 오류")
		return
	}
	// Keep the original extension for Pillow decoder compatibility.
	if bytes.HasPrefix(header, []byte("\xff\xd8\xff")) {
		_ = os.Rename(image, filepath.Join(temp, "character.jpg"))
		image = filepath.Join(temp, "character.jpg")
	}
	audio := filepath.Join(temp, "vocal.wav")
	if err = visemeUpload(r, "audio", audio, 90<<20); err != nil {
		jsonError(w, 400, err.Error())
		return
	}
	wav, err := os.ReadFile(audio)
	if err != nil || !validSingingWAV(wav) {
		jsonError(w, 422, "보컬 PCM WAV 형식 오류")
		return
	}
	soundtrack := ""
	if r.MultipartForm != nil && r.MultipartForm.File["soundtrack"] != nil {
		soundtrack = filepath.Join(temp, "full_music.wav")
		if err = visemeUpload(r, "soundtrack", soundtrack, 90<<20); err != nil {
			jsonError(w, 400, err.Error())
			return
		}
		music, readErr := os.ReadFile(soundtrack)
		if readErr != nil || !validSingingWAV(music) {
			jsonError(w, 422, "완성 음악 PCM WAV 형식 오류")
			return
		}
	}
	align := filepath.Join(temp, "alignment.json")
	if err = os.WriteFile(align, alignment, 0600); err != nil {
		jsonError(w, 500, "가사 싱크 임시 파일 저장 실패")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 35*time.Minute)
	defer cancel()
	output := filepath.Join(temp, "viseme.webm")
	if err = runner(ctx, python, ffmpeg, image, audio, align, output, x, y, width, fps, size, soundtrack, sceneMode); err != nil {
		jsonError(w, 502, err.Error())
		return
	}
	stat, err := os.Stat(output)
	if err != nil || stat.Size() < 1000 || stat.Size() > 90<<20 {
		jsonError(w, 502, "2D 립싱크 WebM 출력 크기 오류")
		return
	}
	f, err := os.Open(output)
	if err != nil {
		jsonError(w, 502, "WebM 출력 읽기 실패")
		return
	}
	defer f.Close()
	signature := make([]byte, 4)
	if _, err = io.ReadFull(f, signature); err != nil || !bytes.Equal(signature, []byte{0x1a, 0x45, 0xdf, 0xa3}) {
		jsonError(w, 502, "실제 WebM 파일 형식 오류")
		return
	}
	_, _ = f.Seek(0, io.SeekStart)
	w.Header().Set("Content-Type", "video/webm")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Disposition", "attachment; filename=MYVOCAL-2D-LipSync.webm")
	_, _ = io.Copy(w, f)
}
