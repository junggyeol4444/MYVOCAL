package main

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/binary"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func stemTestWAV(frames int) []byte {
	b := make([]byte, 44+frames*4)
	copy(b, "RIFF")
	binary.LittleEndian.PutUint32(b[4:], uint32(len(b)-8))
	copy(b[8:], "WAVEfmt ")
	binary.LittleEndian.PutUint32(b[16:], 16)
	binary.LittleEndian.PutUint16(b[20:], 1)
	binary.LittleEndian.PutUint16(b[22:], 2)
	binary.LittleEndian.PutUint32(b[24:], 44100)
	binary.LittleEndian.PutUint32(b[28:], 176400)
	binary.LittleEndian.PutUint16(b[32:], 4)
	binary.LittleEndian.PutUint16(b[34:], 16)
	copy(b[36:], "data")
	binary.LittleEndian.PutUint32(b[40:], uint32(frames*4))
	binary.LittleEndian.PutUint16(b[44:], 1234)
	return b
}
func stemTestConfig(t *testing.T) musicStemOptions {
	t.Helper()
	dir := t.TempDir()
	python := filepath.Join(dir, "python.exe")
	if err := os.WriteFile(python, []byte("binary"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "local-weight.th"), []byte("weights"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "htdemucs.yaml"), []byte("models:\n  - local\n"), 0600); err != nil {
		t.Fatal(err)
	}
	return musicStemOptions{Python: python, Repo: dir, Model: "htdemucs", Device: "cpu"}
}
func stemTestRequest(t *testing.T, c musicStemOptions, token string, audio []byte) *http.Request {
	t.Helper()
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	for key, value := range map[string]string{"python": c.Python, "repo": c.Repo, "model": c.Model, "device": c.Device} {
		if err := w.WriteField(key, value); err != nil {
			t.Fatal(err)
		}
	}
	file, err := w.CreateFormFile("audio", "musicgen.wav")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = file.Write(audio); err != nil {
		t.Fatal(err)
	}
	if err = w.Close(); err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest("POST", "http://127.0.0.1:58319/api/music/stems/split", &body)
	r.Header.Set("Origin", "http://127.0.0.1:58319")
	r.Header.Set("X-MYVOCAL-Session", token)
	r.Header.Set("Content-Type", w.FormDataContentType())
	return r
}
func TestMusicStemsNeuralUserFlow(t *testing.T) {
	c := stemTestConfig(t)
	a := &appServer{sessionKey: "ok"}
	calls := 0
	var scratch string
	runner := func(_ context.Context, o musicStemOptions, input, out string) error {
		calls++
		scratch = filepath.Dir(input)
		if o.Model != "htdemucs" {
			t.Fatal("wrong model")
		}
		if err := os.Mkdir(filepath.Join(out, o.Model), 0700); err != nil {
			return err
		}
		for _, name := range stemNames {
			if err := os.WriteFile(filepath.Join(out, o.Model, name+".wav"), stemTestWAV(4410), 0600); err != nil {
				return err
			}
		}
		return nil
	}
	w := httptest.NewRecorder()
	a.musicStemsSplitWith(w, stemTestRequest(t, c, "ok", stemTestWAV(4410)), runner)
	if w.Code != 200 || calls != 1 || !strings.Contains(w.Header().Get("Content-Type"), "zip") {
		t.Fatalf("response %d, calls %d, body %s", w.Code, calls, w.Body.String()[:min(100, w.Body.Len())])
	}
	if export := os.Getenv("MYVOCAL_TEST_ZIP_OUT"); export != "" {
		if err := os.WriteFile(export, w.Body.Bytes(), 0600); err != nil {
			t.Fatal(err)
		}
	}
	z, err := zip.NewReader(bytes.NewReader(w.Body.Bytes()), int64(w.Body.Len()))
	if err != nil {
		t.Fatal(err)
	}
	if len(z.File) != 5 {
		t.Fatalf("expected 5 zip files got %d", len(z.File))
	}
	for _, f := range z.File {
		if f.Method != zip.Store {
			t.Fatal("stems must be uncompressed for offline import")
		}
		r, err := f.Open()
		if err != nil {
			t.Fatal(err)
		}
		data, err := io.ReadAll(r)
		r.Close()
		if err != nil || len(data) == 0 {
			t.Fatal("missing data", f.Name)
		}
	}
	if _, err = os.Stat(scratch); !os.IsNotExist(err) {
		t.Fatal("scratch was not cleaned")
	}
}
func TestMusicStemsRejectsBeforeModel(t *testing.T) {
	c := stemTestConfig(t)
	a := &appServer{sessionKey: "ok"}
	calls := 0
	runner := func(context.Context, musicStemOptions, string, string) error { calls++; return nil }
	w := httptest.NewRecorder()
	a.musicStemsSplitWith(w, stemTestRequest(t, c, "bad", stemTestWAV(4410)), runner)
	if w.Code != 403 {
		t.Fatalf("session accepted %d", w.Code)
	}
	c.Model = "../outside"
	w = httptest.NewRecorder()
	a.musicStemsSplitWith(w, stemTestRequest(t, c, "ok", stemTestWAV(4410)), runner)
	if w.Code != 400 {
		t.Fatalf("path accepted %d", w.Code)
	}
	c.Model = "htdemucs"
	w = httptest.NewRecorder()
	a.musicStemsSplitWith(w, stemTestRequest(t, c, "ok", []byte("not wav")), runner)
	if w.Code != 400 {
		t.Fatalf("fake WAV accepted %d", w.Code)
	}
	if calls != 0 {
		t.Fatal("invalid input reached inference")
	}
}
func TestMusicStemsRefusesBrokenModelOutputs(t *testing.T) {
	c := stemTestConfig(t)
	a := &appServer{sessionKey: "ok"}
	w := httptest.NewRecorder()
	a.musicStemsSplitWith(w, stemTestRequest(t, c, "ok", stemTestWAV(4410)), func(_ context.Context, o musicStemOptions, _, out string) error {
		_ = os.Mkdir(filepath.Join(out, o.Model), 0700)
		for _, name := range stemNames {
			frames := 4410
			if name == "vocals" {
				frames = 4409
			}
			_ = os.WriteFile(filepath.Join(out, o.Model, name+".wav"), stemTestWAV(frames), 0600)
		}
		return nil
	})
	if w.Code != 502 {
		t.Fatalf("mismatched stem frames accepted %d", w.Code)
	}
}

func TestMusicStemsLocalModelNameMustExist(t *testing.T) {
	c := stemTestConfig(t)
	if err := os.Remove(filepath.Join(c.Repo, "htdemucs.yaml")); err != nil {
		t.Fatal(err)
	}
	if err := validateMusicStemOptions(c); err == nil {
		t.Fatal("unknown model accepted despite unrelated .th weights")
	}
}
func TestMusicStemsSixMinuteCeiling(t *testing.T) {
	if maxStemInput < 44100*4*360+44 || maxStemResponse < 4*(44100*4*360+44) {
		t.Fatal("six-minute PCM16 stereo stems do not fit size limits")
	}
}
func TestStemErrorTailBounded(t *testing.T) {
	var b bytes.Buffer
	w := &stemErrorTail{buf: &b, max: 16}
	w.Write([]byte("123456789"))
	w.Write([]byte("abcdefghijk"))
	if b.String() != "56789abcdefghijk" {
		t.Fatalf("tail=%q", b.String())
	}
	w.Write([]byte("12345678901234567890"))
	if b.String() != "5678901234567890" {
		t.Fatalf("tail=%q", b.String())
	}
}

func TestMusicStemsSixTrackManifestAndZip(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "output")
	base := filepath.Join(out, "htdemucs_6s")
	if err := os.MkdirAll(base, 0700); err != nil {
		t.Fatal(err)
	}
	for _, name := range append(append([]string{}, stemNames...), stemExtras...) {
		if err := os.WriteFile(filepath.Join(base, name+".wav"), stemTestWAV(4410), 0600); err != nil {
			t.Fatal(err)
		}
	}
	zipPath := filepath.Join(dir, "stems.zip")
	if err := writeMusicStemsZip(zipPath, out, "htdemucs_6s"); err != nil {
		t.Fatal(err)
	}
	if export := os.Getenv("MYVOCAL_TEST_ZIP_6_OUT"); export != "" {
		data, err := os.ReadFile(zipPath)
		if err != nil { t.Fatal(err) }
		if err := os.WriteFile(export, data, 0600); err != nil { t.Fatal(err) }
	}
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	if len(r.File) != 7 {
		t.Fatalf("expected 6 WAVs and manifest, got %d", len(r.File))
	}
	found := map[string]bool{}
	for _, f := range r.File {
		found[f.Name] = true
	}
	if !found["stems/guitar.wav"] || !found["stems/piano.wav"] {
		t.Fatal("separate guitar/piano tracks missing")
	}
	for _, f := range r.File {
		if f.Name != "stems/manifest.json" {
			continue
		}
		reader, err := f.Open()
		if err != nil {
			t.Fatal(err)
		}
		b, err := io.ReadAll(reader)
		reader.Close()
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Contains(b, []byte(`"guitar"`)) || !bytes.Contains(b, []byte(`"piano"`)) {
			t.Fatal("manifest omits six-stem identities")
		}
	}
}

func TestMusicStemsRejectsFiveTracks(t *testing.T) {
	dir := t.TempDir()
	out := filepath.Join(dir, "out")
	base := filepath.Join(out, "model")
	if err := os.MkdirAll(base, 0700); err != nil {
		t.Fatal(err)
	}
	for _, name := range append(append([]string{}, stemNames...), "guitar") {
		if err := os.WriteFile(filepath.Join(base, name+".wav"), stemTestWAV(4410), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := writeMusicStemsZip(filepath.Join(dir, "stems.zip"), out, "model"); err == nil {
		t.Fatal("incomplete six-stem result accepted")
	}
}
