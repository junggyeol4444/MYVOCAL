package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"math"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func soundfontTestWav(rate int) []byte {
	frames := rate / 2
	b := make([]byte, 44+frames*4)
	copy(b, "RIFF")
	binary.LittleEndian.PutUint32(b[4:8], uint32(len(b)-8))
	copy(b[8:], "WAVEfmt ")
	binary.LittleEndian.PutUint32(b[16:20], 16)
	binary.LittleEndian.PutUint16(b[20:22], 1)
	binary.LittleEndian.PutUint16(b[22:24], 2)
	binary.LittleEndian.PutUint32(b[24:28], uint32(rate))
	binary.LittleEndian.PutUint32(b[28:32], uint32(rate*4))
	binary.LittleEndian.PutUint16(b[32:34], 4)
	binary.LittleEndian.PutUint16(b[34:36], 16)
	copy(b[36:], "data")
	binary.LittleEndian.PutUint32(b[40:44], uint32(frames*4))
	for i := 0; i < frames; i++ {
		v := int16(math.Sin(float64(i)/12) * 2000)
		binary.LittleEndian.PutUint16(b[44+i*4:], uint16(v))
		binary.LittleEndian.PutUint16(b[46+i*4:], uint16(v))
	}
	return b
}
func soundfontTestMidi() []byte {
	return []byte{77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, 1, 224, 77, 84, 114, 107, 0, 0, 0, 4, 0, 255, 47, 0}
}
func soundfontRequest(t *testing.T, token, python, library, sf string, midi []byte) *http.Request {
	t.Helper()
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	for k, v := range map[string]string{"python": python, "library": library, "soundfont": sf, "rate": "44100", "gain": "0.2"} {
		if err := w.WriteField(k, v); err != nil {
			t.Fatal(err)
		}
	}
	part, err := w.CreateFormFile("midi", "notes.mid")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = part.Write(midi); err != nil {
		t.Fatal(err)
	}
	if err = w.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:58319/api/music/midi/soundfont", &body)
	req.Header.Set("Origin", "http://127.0.0.1:58319")
	req.Header.Set("X-MYVOCAL-Session", token)
	req.Header.Set("Content-Type", w.FormDataContentType())
	return req
}
func TestSoundfontRealPCMContract(t *testing.T) {
	dir := t.TempDir()
	python := filepath.Join(dir, "python.exe")
	dll := filepath.Join(dir, "fluid.dll")
	sf := filepath.Join(dir, "piano.sf2")
	for _, p := range []string{python, dll, sf} {
		if err := os.WriteFile(p, []byte("local"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	a := &appServer{sessionKey: "secret"}
	calls := 0
	var scratch string
	runner := func(_ context.Context, py, lib, font, input, out string, rate int, gain float64) error {
		calls++
		scratch = filepath.Dir(input)
		if py != python || lib != dll || font != sf || rate != 44100 || gain != .2 {
			t.Fatal("wrong local synthesis arguments")
		}
		got, err := os.ReadFile(input)
		if err != nil || !bytes.Equal(got, soundfontTestMidi()) {
			t.Fatal("MIDI changed")
		}
		return os.WriteFile(out, soundfontTestWav(rate), 0600)
	}
	w := httptest.NewRecorder()
	a.midiSoundfontWith(w, soundfontRequest(t, "secret", python, dll, sf, soundfontTestMidi()), runner)
	if w.Code != 200 || calls != 1 || !bytes.Equal(w.Body.Bytes(), soundfontTestWav(44100)) {
		t.Fatalf("status %d calls %d", w.Code, calls)
	}
	if _, err := os.Stat(scratch); !os.IsNotExist(err) {
		t.Fatal("job files were not cleaned")
	}
	w = httptest.NewRecorder()
	a.midiSoundfontWith(w, soundfontRequest(t, "wrong", python, dll, sf, soundfontTestMidi()), runner)
	if w.Code != 403 || calls != 1 {
		t.Fatalf("unauthorized request reached renderer %d", w.Code)
	}
}
func TestSoundfontRejectsSilentOrInvalidWav(t *testing.T) {
	b := soundfontTestWav(44100)
	if !soundfontPCMValid(b, 44100) {
		t.Fatal("valid PCM was rejected")
	}
	if soundfontPCMValid(b, 48000) {
		t.Fatal("wrong sample rate accepted")
	}
	for i := 44; i < len(b); i++ {
		b[i] = 0
	}
	if soundfontPCMValid(b, 44100) {
		t.Fatal("silent PCM was accepted")
	}
	if soundfontPCMValid([]byte("FAKE"), 44100) {
		t.Fatal("fake PCM was accepted")
	}
}

// Optional real integration on a machine with a licensed SF2 and libFluidSynth.
// Set MYVOCAL_TEST_PYTHON, MYVOCAL_TEST_LIBFLUID and MYVOCAL_TEST_SF2.
// Unlike contract tests this invokes the actual sample-synthesis library.
func TestSoundfontInstalledLibraryRealPCM(t *testing.T) {
	python := os.Getenv("MYVOCAL_TEST_PYTHON")
	dll := os.Getenv("MYVOCAL_TEST_LIBFLUID")
	sf := os.Getenv("MYVOCAL_TEST_SF2")
	if python == "" || dll == "" || sf == "" {
		t.Skip("실제 SoundFont 설치 경로가 지정되지 않았습니다")
	}
	for _, p := range []string{python, dll, sf} {
		if _, err := os.Stat(p); err != nil {
			t.Skipf("실제 설치 파일 없음: %s", p)
		}
	}
	midi := []byte{77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, 1, 224, 77, 84, 114, 107, 0, 0, 0, 16,
		0, 192, 0, 0, 144, 60, 100, 131, 96, 128, 60, 0, 0, 255, 47, 0}
	a := &appServer{sessionKey: "secret"}
	w := httptest.NewRecorder()
	a.midiSoundfontWith(w, soundfontRequest(t, "secret", python, dll, sf, midi), runSoundfont)
	if w.Code != 200 || !soundfontPCMValid(w.Body.Bytes(), 44100) {
		t.Fatalf("실제 FluidSynth MIDI->WAV 실행 실패: %d %s", w.Code, w.Body.String())
	}
	t.Logf("실제 SoundFont PCM WAV 생성: %d bytes", w.Body.Len())
}
