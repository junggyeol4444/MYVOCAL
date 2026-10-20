package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func sampleRVCWAV() []byte {
	out := make([]byte, 44+100)
	copy(out, "RIFF")
	binary.LittleEndian.PutUint32(out[4:8], uint32(len(out)-8))
	copy(out[8:12], "WAVE")
	copy(out[12:16], "fmt ")
	binary.LittleEndian.PutUint32(out[16:20], 16)
	binary.LittleEndian.PutUint16(out[20:22], 1)
	binary.LittleEndian.PutUint16(out[22:24], 1)
	binary.LittleEndian.PutUint32(out[24:28], 22050)
	binary.LittleEndian.PutUint32(out[28:32], 44100)
	binary.LittleEndian.PutUint16(out[32:34], 2)
	binary.LittleEndian.PutUint16(out[34:36], 16)
	copy(out[36:40], "data")
	binary.LittleEndian.PutUint32(out[40:44], 100)
	for i := 44; i < len(out); i++ {
		out[i] = byte(i % 251)
	}
	return out
}
func tempRVCInstall(t *testing.T) rvcOptions {
	t.Helper()
	root := t.TempDir()
	_ = os.MkdirAll(filepath.Join(root, "infer"), 0700)
	python := filepath.Join(root, "python.exe")
	if runtime.GOOS != "windows" {
		python = filepath.Join(root, "python")
	}
	model := filepath.Join(root, "trained.pth")
	for _, f := range []string{python, model, filepath.Join(root, "infer", "cli.py")} {
		if err := os.WriteFile(f, []byte("test"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	return rvcOptions{Root: root, Python: python, Model: model, F0: "rmvpe", Pitch: 0, IndexRate: 0}
}
func rvcUpload(t *testing.T, opts rvcOptions, key string, wav []byte) *http.Request {
	t.Helper()
	var data bytes.Buffer
	form := multipart.NewWriter(&data)
	for field, value := range map[string]string{"root": opts.Root, "rights": "confirmed", "python": opts.Python, "model": opts.Model, "f0": opts.F0, "pitch": fmt.Sprint(opts.Pitch), "indexRate": fmt.Sprint(opts.IndexRate)} {
		if err := form.WriteField(field, value); err != nil {
			t.Fatal(err)
		}
	}
	part, err := form.CreateFormFile("audio", "song.wav")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = part.Write(wav)
	if err = form.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:58319/api/singing/rvc/convert", &data)
	req.Host = "127.0.0.1:58319"
	req.Header.Set("Origin", "http://127.0.0.1:58319")
	req.Header.Set("X-MYVOCAL-Session", key)
	req.Header.Set("Content-Type", form.FormDataContentType())
	return req
}
func TestRVCRealUserRequestUsesTempInputAndValidatesOutput(t *testing.T) {
	opts := tempRVCInstall(t)
	source := sampleRVCWAV()
	a := &appServer{sessionKey: "private-session"}
	called := 0
	w := httptest.NewRecorder()
	runner := func(ctx context.Context, o rvcOptions, input, output string) error {
		called++
		if o.Model != opts.Model || filepath.Dir(input) != filepath.Dir(output) || input == output {
			t.Fatal("RVC paths do not use safe distinct temp files")
		}
		got, err := os.ReadFile(input)
		if err != nil || !bytes.Equal(got, source) {
			t.Fatal("original WAV modified or missing")
		}
		return os.WriteFile(output, sampleRVCWAV(), 0600)
	}
	a.rvcConvertWith(w, rvcUpload(t, opts, "private-session", source), runner)
	if w.Code != 200 || w.Header().Get("Content-Type") != "audio/wav" || !validSingingWAV(w.Body.Bytes()) || called != 1 {
		t.Fatalf("real convert endpoint code %d calls %d body %s", w.Code, called, w.Body.String())
	}
}
func TestRVCAuthAndModelPermissionRejectBeforeRunning(t *testing.T) {
	o := tempRVCInstall(t)
	a := &appServer{sessionKey: "private-session"}
	calls := 0
	runner := func(context.Context, rvcOptions, string, string) error { calls++; return nil }
	for _, tc := range []struct {
		key   string
		opts  rvcOptions
		input []byte
		want  int
	}{
		{key: "incorrect", opts: o, input: sampleRVCWAV(), want: 403},
		{key: "private-session", opts: func() rvcOptions { bad := o; bad.Model = filepath.Join(o.Root, "missing.pth"); return bad }(), input: sampleRVCWAV(), want: 400},
		{key: "private-session", opts: o, input: []byte("invalid wave"), want: 400},
	} {
		w := httptest.NewRecorder()
		a.rvcConvertWith(w, rvcUpload(t, tc.opts, tc.key, tc.input), runner)
		if w.Code != tc.want {
			t.Fatalf("unexpected status %d expected %d", w.Code, tc.want)
		}
	}
	if calls != 0 {
		t.Fatalf("unsafe runner invocation %d", calls)
	}
}
func TestRVCInvalidResultNeverReportedAsSuccess(t *testing.T) {
	o := tempRVCInstall(t)
	a := &appServer{sessionKey: "private-session"}
	w := httptest.NewRecorder()
	a.rvcConvertWith(w, rvcUpload(t, o, "private-session", sampleRVCWAV()), func(_ context.Context, _ rvcOptions, input, output string) error {
		return os.WriteFile(output, []byte("fake model output"), 0600)
	})
	if w.Code != 502 {
		t.Fatalf("invalid model result was reported as successful %d", w.Code)
	}
}
func TestRVCCLIConfigurationValidation(t *testing.T) {
	good := tempRVCInstall(t)
	if err := validateRVCOptions(good); err != nil {
		t.Fatal(err)
	}
	invalid := []rvcOptions{func() rvcOptions { x := good; x.Pitch = 26; return x }(), func() rvcOptions { x := good; x.IndexRate = 2; return x }(), func() rvcOptions { x := good; x.F0 = "unknown"; return x }(), func() rvcOptions { x := good; x.Model = "not-absolute.pth"; return x }()}
	for _, x := range invalid {
		if validateRVCOptions(x) == nil {
			t.Fatalf("accepted invalid %+v", x)
		}
	}
}
func TestRVCResponseHeaderDoesNotContainOriginalMedia(t *testing.T) {
	a := &appServer{sessionKey: "private-session"}
	o := tempRVCInstall(t)
	runner := func(_ context.Context, _ rvcOptions, _, output string) error {
		return os.WriteFile(output, sampleRVCWAV(), 0600)
	}
	w := httptest.NewRecorder()
	a.rvcConvertWith(w, rvcUpload(t, o, "private-session", sampleRVCWAV()), runner)
	if w.Code != 200 || strings.Contains(w.Header().Get("Content-Disposition"), o.Model) {
		t.Fatal("personal source leaked in filename")
	}
	_, err := io.ReadAll(w.Result().Body)
	if err != nil {
		t.Fatal(err)
	}
}