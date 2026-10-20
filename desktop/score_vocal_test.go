package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"math"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func scoreVocalTestWav() []byte {
	frames := 44100 * 2
	b := make([]byte, 44+frames*2)
	copy(b, "RIFF")
	binary.LittleEndian.PutUint32(b[4:], uint32(len(b)-8))
	copy(b[8:], "WAVEfmt ")
	binary.LittleEndian.PutUint32(b[16:], 16)
	binary.LittleEndian.PutUint16(b[20:], 1)
	binary.LittleEndian.PutUint16(b[22:], 1)
	binary.LittleEndian.PutUint32(b[24:], 44100)
	binary.LittleEndian.PutUint32(b[28:], 88200)
	binary.LittleEndian.PutUint16(b[32:], 2)
	binary.LittleEndian.PutUint16(b[34:], 16)
	copy(b[36:], "data")
	binary.LittleEndian.PutUint32(b[40:], uint32(frames*2))
	for i := 0; i < frames; i++ {
		v := int16(math.Sin(2*math.Pi*220*float64(i)/44100) * 11000)
		binary.LittleEndian.PutUint16(b[44+i*2:], uint16(v))
	}
	return b
}
func scoreVocalRequest(t *testing.T, token, python, score string, audio []byte) *http.Request {
	t.Helper()
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	for k, v := range map[string]string{"python": python, "score": score, "rights": "confirmed", "interval": "0", "strength": "1"} {
		if err := w.WriteField(k, v); err != nil {
			t.Fatal(err)
		}
	}
	part, err := w.CreateFormFile("audio", "voice.wav")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = part.Write(audio); err != nil {
		t.Fatal(err)
	}
	if err = w.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:58319/api/singing/score-vocal", &body)
	req.Header.Set("Origin", "http://127.0.0.1:58319")
	req.Header.Set("X-MYVOCAL-Session", token)
	req.Header.Set("Content-Type", w.FormDataContentType())
	return req
}
func TestScoreVocalValidation(t *testing.T) {
	for _, s := range []string{`{"notes":[]}`, `{"notes":[{"startSec":0,"endSec":360,"pitch":60}]}`, `{"notes":[{"startSec":0,"endSec":1,"pitch":300}]}`} {
		if _, err := validateScoreVocalJSON(s); err == nil {
			t.Fatal("invalid score accepted", s)
		}
	}
	good := `{"notes":[{"startSec":0,"endSec":0.8,"pitch":69},{"startSec":0.85,"endSec":1.7,"pitch":72}]}`
	if _, err := validateScoreVocalJSON(good); err != nil {
		t.Fatal(err)
	}
}
func TestScoreVocalAPIContract(t *testing.T) {
	dir := t.TempDir()
	python := filepath.Join(dir, "python.exe")
	if err := os.WriteFile(python, []byte("local"), 0600); err != nil {
		t.Fatal(err)
	}
	score := `{"notes":[{"startSec":0,"endSec":0.8,"pitch":69}]}`
	a := &appServer{sessionKey: "secret"}
	calls := 0
	runner := func(_ context.Context, py, input, scoreFile, output string, interval int, strength float64) error {
		calls++
		if py != python || interval != 0 || strength != 1 {
			t.Fatal("wrong args")
		}
		if _, err := os.Stat(input); err != nil {
			t.Fatal(err)
		}
		raw, err := os.ReadFile(scoreFile)
		if err != nil {
			t.Fatal(err)
		}
		var obj scoreVocalDocument
		if err = json.Unmarshal(raw, &obj); err != nil || len(obj.Notes) != 1 {
			t.Fatal("score missing")
		}
		return os.WriteFile(output, scoreVocalTestWav(), 0600)
	}
	w := httptest.NewRecorder()
	a.scoreVocalWith(w, scoreVocalRequest(t, "secret", python, score, scoreVocalTestWav()), runner)
	if w.Code != 200 || calls != 1 || w.Header().Get("Content-Type") != "audio/wav" {
		t.Fatalf("status=%d calls=%d body=%s", w.Code, calls, w.Body.String()[:min(100, w.Body.Len())])
	}
	w = httptest.NewRecorder()
	a.scoreVocalWith(w, scoreVocalRequest(t, "wrong", python, score, scoreVocalTestWav()), runner)
	if w.Code != 403 || calls != 1 {
		t.Fatal("invalid session reached renderer", w.Code, calls)
	}
}

// Real Go HTTP -> Python librosa -> PCM WAV. Requires local librosa and numpy.
func TestScoreVocalRealPythonPCM(t *testing.T) {
	if os.Getenv("MYVOCAL_REAL_SCORE_VOCAL") != "1" {
		t.Skip("실제 DSP 통합검증 환경 변수가 없습니다")
	}
	python, err := exec.LookPath("python")
	if err != nil {
		t.Skip("python 없음")
	}
	python, err = filepath.Abs(python)
	if err != nil {
		t.Fatal(err)
	}
	score := `{"notes":[{"startSec":0,"endSec":0.8,"pitch":69},{"startSec":0.85,"endSec":1.7,"pitch":72}]}`
	a := &appServer{sessionKey: "secret"}
	w := httptest.NewRecorder()
	a.scoreVocalWith(w, scoreVocalRequest(t, "secret", python, score, scoreVocalTestWav()), runScoreVocal)
	if w.Code != 200 || !validSingingWAV(w.Body.Bytes()) || w.Body.Len() < 50000 {
		t.Fatalf("실제 DSP 실행 실패: status=%d body=%s", w.Code, w.Body.String()[:min(150, w.Body.Len())])
	}
}
