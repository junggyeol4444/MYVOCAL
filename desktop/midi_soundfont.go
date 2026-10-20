package main

// SoundFont PCM rendering uses the user's locally installed libFluidSynth.
// This is a new non-destructive MIDI -> WAV endpoint inside the existing EXE.
import (
	"bytes"
	"context"
	"embed"
	"encoding/binary"
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

//go:embed midi_soundfont_worker.py
var soundfontWorker embed.FS
var soundfontSlot = make(chan struct{}, 1)

const maxSoundfontMidi = 4 << 20
const maxSoundfontWav = 80 << 20

type soundfontRunner func(context.Context, string, string, string, string, string, int, float64) error

func runSoundfont(ctx context.Context, python, library, sf, midi, out string, rate int, gain float64) error {
	code, err := soundfontWorker.ReadFile("midi_soundfont_worker.py")
	if err != nil {
		return err
	}
	script := filepath.Join(filepath.Dir(midi), "midi_soundfont_worker.py")
	if err = os.WriteFile(script, code, 0600); err != nil {
		return err
	}
	cmd := exec.CommandContext(ctx, python, script, "--input", midi, "--output", out, "--library", library, "--soundfont", sf, "--rate", strconv.Itoa(rate), "--gain", strconv.FormatFloat(gain, 'f', 3, 64))
	cmd.Dir = filepath.Dir(midi)
	cmd.Stdin = nil
	cmd.Env = append(os.Environ(), "HF_HUB_OFFLINE=1", "TRANSFORMERS_OFFLINE=1", "HF_DATASETS_OFFLINE=1")
	var log bytes.Buffer
	cmd.Stdout = io.Discard
	cmd.Stderr = &stemErrorTail{buf: &log, max: 4096}
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
			return errors.New("SoundFont 렌더링이 취소되거나 제한 시간을 초과했습니다")
		}
		return fmt.Errorf("설치된 SoundFont 엔진 실행 실패: %w / %s", err, strings.TrimSpace(log.String()))
	}
	return nil
}

func soundfontPCMValid(wav []byte, rate int) bool {
	if len(wav) < 44 || len(wav) > maxSoundfontWav || !bytes.Equal(wav[:4], []byte("RIFF")) || !bytes.Equal(wav[8:12], []byte("WAVE")) {
		return false
	}
	if int(binary.LittleEndian.Uint32(wav[4:8]))+8 != len(wav) {
		return false
	}
	fmtOK := false
	dataOffset, dataSize := 0, 0
	for p := 12; p+8 <= len(wav); {
		n := int(binary.LittleEndian.Uint32(wav[p+4 : p+8]))
		p += 8
		if n < 0 || n > len(wav)-p {
			return false
		}
		switch string(wav[p-8 : p-4]) {
		case "fmt ":
			if n < 16 {
				return false
			}
			f := wav[p : p+n]
			fmtOK = binary.LittleEndian.Uint16(f[0:2]) == 1 && binary.LittleEndian.Uint16(f[2:4]) == 2 && int(binary.LittleEndian.Uint32(f[4:8])) == rate && int(binary.LittleEndian.Uint32(f[8:12])) == rate*4 && binary.LittleEndian.Uint16(f[12:14]) == 4 && binary.LittleEndian.Uint16(f[14:16]) == 16
		case "data":
			if dataSize != 0 {
				return false
			}
			dataOffset, dataSize = p, n
		}
		p += n + (n & 1)
	}
	if !fmtOK || dataSize < 400 || dataSize%4 != 0 || dataSize/4 > rate*360 {
		return false
	}
	// A silent result is not a valid completed instrument render.
	for _, v := range wav[dataOffset : dataOffset+dataSize] {
		if v != 0 {
			return true
		}
	}
	return false
}

func (a *appServer) midiSoundfont(w http.ResponseWriter, r *http.Request) {
	a.midiSoundfontWith(w, r, runSoundfont)
}
func (a *appServer) midiSoundfontWith(w http.ResponseWriter, r *http.Request, runner soundfontRunner) {
	if r.Method != http.MethodPost {
		jsonError(w, 405, "POST만 허용합니다")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	select {
	case soundfontSlot <- struct{}{}:
		defer func() { <-soundfontSlot }()
	default:
		jsonError(w, 409, "다른 SoundFont 렌더링 작업이 실행 중입니다")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxSoundfontMidi+(1<<20))
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		jsonError(w, 400, "MIDI 변환 요청이 너무 큽니다")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	python, library, sf := r.FormValue("python"), r.FormValue("library"), r.FormValue("soundfont")
	for _, p := range []string{python, library, sf} {
		if len(p) > 2048 || !filepath.IsAbs(p) || strings.ContainsAny(p, "\x00\r\n") {
			jsonError(w, 400, "로컬 파일의 절대 경로를 입력하세요")
			return
		}
	}
	if runtime.GOOS == "windows" && (!strings.EqualFold(filepath.Base(python), "python.exe") || !strings.HasSuffix(strings.ToLower(library), ".dll")) {
		jsonError(w, 400, "Windows Python.exe·FluidSynth DLL 경로가 필요합니다")
		return
	}
	if ext := strings.ToLower(filepath.Ext(sf)); ext != ".sf2" && ext != ".sf3" {
		jsonError(w, 400, "SF2/SF3 SoundFont 파일만 허용합니다")
		return
	}
	for _, p := range []string{python, library, sf} {
		if err := ensureRegular(p); err != nil {
			jsonError(w, 400, "로컬 Python·FluidSynth·SoundFont 파일을 확인하세요")
			return
		}
	}
	rate, err := strconv.Atoi(r.FormValue("rate"))
	if err != nil || (rate != 44100 && rate != 48000) {
		jsonError(w, 400, "샘플레이트는 44100 또는 48000Hz입니다")
		return
	}
	gain, err := strconv.ParseFloat(r.FormValue("gain"), 64)
	if err != nil || math.IsNaN(gain) || math.IsInf(gain, 0) || gain < .01 || gain > 1 {
		jsonError(w, 400, "합성 음량은 0.01~1입니다")
		return
	}
	source, header, err := r.FormFile("midi")
	if err != nil {
		jsonError(w, 400, "MIDI 파일이 필요합니다")
		return
	}
	defer source.Close()
	if header.Size < 26 || header.Size > maxSoundfontMidi {
		jsonError(w, 400, "MIDI 크기 제한을 확인하세요")
		return
	}
	tmp, err := os.MkdirTemp("", "myvocal-soundfont-")
	if err != nil {
		jsonError(w, 500, "임시 렌더링 폴더 생성 실패")
		return
	}
	defer os.RemoveAll(tmp)
	input := filepath.Join(tmp, "input.mid")
	dest, err := os.OpenFile(input, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		jsonError(w, 500, "MIDI 임시 파일 생성 실패")
		return
	}
	n, copyErr := io.Copy(dest, io.LimitReader(source, maxSoundfontMidi+1))
	closeErr := dest.Close()
	if copyErr != nil || closeErr != nil || n != header.Size {
		jsonError(w, 400, "MIDI 입력을 읽지 못했습니다")
		return
	}
	data, err := os.ReadFile(input)
	if err != nil || !validStemMidiOutput(data) {
		jsonError(w, 422, "표준 MIDI Type 0/1 파일이 아닙니다")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Minute)
	defer cancel()
	output := filepath.Join(tmp, "render.wav")
	if err = runner(ctx, python, library, sf, input, output, rate, gain); err != nil {
		jsonError(w, 502, err.Error())
		return
	}
	stat, err := os.Stat(output)
	if err != nil || stat.Size() > maxSoundfontWav {
		jsonError(w, 502, "SoundFont WAV 결과가 없거나 너무 큽니다")
		return
	}
	wav, err := os.ReadFile(output)
	if err != nil || !soundfontPCMValid(wav, rate) {
		jsonError(w, 502, "실제 PCM16 스테레오 WAV 렌더링에 실패했습니다")
		return
	}
	w.Header().Set("Content-Type", "audio/wav")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Disposition", "attachment; filename=MYVOCAL-SoundFont.wav")
	_, _ = w.Write(wav)
}
