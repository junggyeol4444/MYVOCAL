package main

// MIDI score-guided pitch/timing correction of a user-owned vocal recording.
// This endpoint runs actual offline DSP; it does not claim neural Singing.
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

//go:embed score_vocal_worker.py
var scoreVocalWorker embed.FS
var scoreVocalSlot = make(chan struct{}, 1)

// Bounded stderr capture independent of optional Demucs modules.
type scoreVocalLog struct {
	buf *bytes.Buffer
	max int
}

func (l *scoreVocalLog) Write(p []byte) (int, error) {
	n := len(p)
	room := l.max - l.buf.Len()
	if room > 0 {
		if room < n {
			p = p[:room]
		}
		_, _ = l.buf.Write(p)
	}
	return n, nil
}

const maxScoreVocalInput = 90 << 20
const maxScoreVocalOutput = 90 << 20

type scoreVocalNote struct {
	StartSec       float64  `json:"startSec"`
	EndSec         float64  `json:"endSec"`
	Pitch          float64  `json:"pitch"`
	SourceStartSec *float64 `json:"sourceStartSec,omitempty"`
	SourceEndSec   *float64 `json:"sourceEndSec,omitempty"`
}
type scoreVocalDocument struct {
	Notes []scoreVocalNote `json:"notes"`
}
type scoreVocalRunner func(context.Context, string, string, string, string, int, float64) error

func runScoreVocal(ctx context.Context, python, input, score, output string, interval int, strength float64) error {
	code, err := scoreVocalWorker.ReadFile("score_vocal_worker.py")
	if err != nil {
		return err
	}
	script := filepath.Join(filepath.Dir(input), "score_vocal_worker.py")
	if err = os.WriteFile(script, code, 0600); err != nil {
		return err
	}
	cmd := exec.CommandContext(ctx, python, script, "--input", input, "--score", score, "--output", output, "--interval", strconv.Itoa(interval), "--strength", strconv.FormatFloat(strength, 'f', 3, 64))
	cmd.Dir = filepath.Dir(input)
	cmd.Stdin = nil
	cmd.Env = append(os.Environ(), "HF_HUB_OFFLINE=1", "TRANSFORMERS_OFFLINE=1", "HF_DATASETS_OFFLINE=1")
	var log bytes.Buffer
	cmd.Stdout = io.Discard
	cmd.Stderr = &scoreVocalLog{buf: &log, max: 4096}
	if runtime.GOOS == "windows" {
		cmd.Cancel = func() error {
			if cmd.Process == nil {
				return os.ErrProcessDone
			}
			kill := exec.Command("taskkill", "/PID", fmt.Sprint(cmd.Process.Pid), "/T", "/F")
			if e := kill.Run(); e != nil {
				return cmd.Process.Kill()
			}
			return nil
		}
	}
	if err = cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return errors.New("보컬 음정 보정이 취소되거나 제한 시간을 초과했습니다")
		}
		return fmt.Errorf("설치된 Python 음정 보정 실행 실패: %w / %s", err, strings.TrimSpace(log.String()))
	}
	return nil
}
func validateScoreVocalJSON(input string) ([]byte, error) {
	if len(input) > 1<<20 {
		return nil, errors.New("음표 데이터는 1MB 이하입니다")
	}
	var score scoreVocalDocument
	if err := json.Unmarshal([]byte(input), &score); err != nil {
		return nil, errors.New("음표 JSON 형식 오류")
	}
	if len(score.Notes) < 1 || len(score.Notes) > 400 {
		return nil, errors.New("MIDI 음표는 1~400개여야 합니다")
	}
	prev := -1.0
	for _, n := range score.Notes {
		if math.IsNaN(n.StartSec) || math.IsNaN(n.EndSec) || math.IsNaN(n.Pitch) || math.IsInf(n.StartSec, 0) || math.IsInf(n.EndSec, 0) || math.IsInf(n.Pitch, 0) || n.StartSec < 0 || n.StartSec < prev || n.EndSec > 360 || n.EndSec-n.StartSec < .07 || n.EndSec-n.StartSec > 12 || n.Pitch < 24 || n.Pitch > 108 {
			return nil, errors.New("MIDI 음표 시간·음높이가 올바르지 않습니다")
		}
		if (n.SourceStartSec == nil) != (n.SourceEndSec == nil) {
			return nil, errors.New("원본 구간 시간 누락")
		}
		if n.SourceStartSec != nil {
			a, b := *n.SourceStartSec, *n.SourceEndSec
			if math.IsNaN(a) || math.IsNaN(b) || math.IsInf(a, 0) || math.IsInf(b, 0) || a < 0 || a >= b || b > 360 {
				return nil, errors.New("원본 녹음 구간 시간 오류")
			}
		}
		prev = n.StartSec
	}
	return json.Marshal(score)
}
func (a *appServer) scoreVocalRender(w http.ResponseWriter, r *http.Request) {
	a.scoreVocalWith(w, r, runScoreVocal)
}
func (a *appServer) scoreVocalWith(w http.ResponseWriter, r *http.Request, runner scoreVocalRunner) {
	if r.Method != http.MethodPost {
		jsonError(w, 405, "POST만 허용합니다")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	select {
	case scoreVocalSlot <- struct{}{}:
		defer func() { <-scoreVocalSlot }()
	default:
		jsonError(w, 409, "다른 보컬 음정 보정 작업이 실행 중입니다")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxScoreVocalInput+(2<<20))
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		jsonError(w, 400, "녹음 또는 MIDI 요청이 너무 큽니다")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	python := r.FormValue("python")
	if len(python) > 2048 || !filepath.IsAbs(python) || strings.ContainsAny(python, "\x00\r\n") || (runtime.GOOS == "windows" && !strings.EqualFold(filepath.Base(python), "python.exe")) {
		jsonError(w, 400, "설치된 Python.exe의 절대 경로가 필요합니다")
		return
	}
	if err := ensureRegular(python); err != nil {
		jsonError(w, 400, "설치된 Python 실행 파일을 확인하세요")
		return
	}
	if r.FormValue("rights") != "confirmed" {
		jsonError(w, 403, "녹음 사용 권한 확인이 필요합니다")
		return
	}
	interval, err := strconv.Atoi(r.FormValue("interval"))
	if err != nil || interval < -12 || interval > 12 {
		jsonError(w, 400, "화음 반음 이동은 -12~12입니다")
		return
	}
	strength, err := strconv.ParseFloat(r.FormValue("strength"), 64)
	if err != nil || math.IsNaN(strength) || math.IsInf(strength, 0) || strength < 0 || strength > 1 {
		jsonError(w, 400, "음정 보정 강도는 0~1입니다")
		return
	}
	score, err := validateScoreVocalJSON(r.FormValue("score"))
	if err != nil {
		jsonError(w, 400, err.Error())
		return
	}
	source, header, err := r.FormFile("audio")
	if err != nil {
		jsonError(w, 400, "실제 녹음 WAV가 필요합니다")
		return
	}
	defer source.Close()
	if header.Size < 44 || header.Size > maxScoreVocalInput {
		jsonError(w, 400, "녹음 WAV 크기 제한 위반")
		return
	}
	tmp, err := os.MkdirTemp("", "myvocal-score-vocal-")
	if err != nil {
		jsonError(w, 500, "임시 보컬 작업 폴더 생성 실패")
		return
	}
	defer os.RemoveAll(tmp)
	input := filepath.Join(tmp, "source.wav")
	dst, err := os.OpenFile(input, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		jsonError(w, 500, "녹음 임시 파일 생성 실패")
		return
	}
	n, copyErr := io.Copy(dst, io.LimitReader(source, maxScoreVocalInput+1))
	closeErr := dst.Close()
	if copyErr != nil || closeErr != nil || n != header.Size {
		jsonError(w, 400, "녹음 WAV를 읽지 못했습니다")
		return
	}
	original, err := os.ReadFile(input)
	if err != nil || !validSingingWAV(original) {
		jsonError(w, 422, "올바른 PCM WAV가 아닙니다")
		return
	}
	scorePath := filepath.Join(tmp, "score.json")
	if err = os.WriteFile(scorePath, score, 0600); err != nil {
		jsonError(w, 500, "음표 임시 파일 생성 실패")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Minute)
	defer cancel()
	output := filepath.Join(tmp, "vocal.wav")
	if err = runner(ctx, python, input, scorePath, output, interval, strength); err != nil {
		jsonError(w, 502, err.Error())
		return
	}
	stat, err := os.Stat(output)
	if err != nil || stat.Size() > maxScoreVocalOutput {
		jsonError(w, 502, "보컬 WAV 결과가 없거나 너무 큽니다")
		return
	}
	wav, err := os.ReadFile(output)
	if err != nil || !validSingingWAV(wav) {
		jsonError(w, 502, "보컬 PCM WAV 결과 형식 오류")
		return
	}
	w.Header().Set("Content-Type", "audio/wav")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Disposition", "attachment; filename=MYVOCAL-ScoreVocal.wav")
	_, _ = w.Write(wav)
}
