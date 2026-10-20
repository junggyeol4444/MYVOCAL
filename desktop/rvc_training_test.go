package main

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func testRVCTrainer(t *testing.T) rvcTrainingOptions {
	t.Helper()
	root := t.TempDir()
	python := filepath.Join(root, "python.exe")
	script := filepath.Join(root, "train.py")
	for _, x := range []string{python, script} {
		if e := os.WriteFile(x, []byte("test"), 0700); e != nil {
			t.Fatal(e)
		}
	}
	return rvcTrainingOptions{Root: root, Python: python, Script: script, Args: []string{"--dataset", "{dataset}", "--output", "{output}"}, VoiceID: "self-voice"}
}
func testRVCTrainingZip(t *testing.T, voiceID, engine string) []byte {
	t.Helper()
	var b bytes.Buffer
	w := zip.NewWriter(&b)
	files := map[string][]byte{
		"training-plan.json":   []byte(fmt.Sprintf(`{"format":"MYVOCAL_TRAINING_PLAN","voiceId":%q,"engineId":%q}`, voiceID, engine)),
		"manifest.json":        []byte(`{"format":"MYVOCAL_VOICE_DATASET","voice":{"rights":"self"}}`),
		"audio/sample-001.wav": []byte("WAV-data-test"),
	}
	for k, v := range files {
		f, e := w.Create(k)
		if e != nil {
			t.Fatal(e)
		}
		if _, e = f.Write(v); e != nil {
			t.Fatal(e)
		}
	}
	if e := w.Close(); e != nil {
		t.Fatal(e)
	}
	return b.Bytes()
}
func TestRVCTrainingExtractRequiresMatchingVoiceAndRVCPlan(t *testing.T) {
	raw := testRVCTrainingZip(t, "self-voice", "rvc")
	dir := filepath.Join(t.TempDir(), "data")
	n, e := unpackTrainingBundle(raw, dir, "self-voice")
	if e != nil || n != 1 {
		t.Fatalf("unpack: %d %v", n, e)
	}
	if _, e = os.Stat(filepath.Join(dir, "audio", "sample-001.wav")); e != nil {
		t.Fatal(e)
	}
	if _, e = unpackTrainingBundle(raw, filepath.Join(t.TempDir(), "bad"), "different-voice"); e == nil {
		t.Fatal("accepted different voice ID")
	}
	if _, e = unpackTrainingBundle(testRVCTrainingZip(t, "self-voice", "generic"), filepath.Join(t.TempDir(), "bad2"), "self-voice"); e == nil {
		t.Fatal("accepted non-RVC training plan")
	}
}
func TestRVCTrainingDisallowsPathTraversal(t *testing.T) {
	var b bytes.Buffer
	w := zip.NewWriter(&b)
	for _, n := range []string{"manifest.json", "training-plan.json", "audio/../stolen.wav"} {
		f, _ := w.Create(n)
		_, _ = f.Write([]byte("fake"))
	}
	_ = w.Close()
	if _, e := unpackTrainingBundle(b.Bytes(), t.TempDir(), "self-voice"); e == nil {
		t.Fatal("accepted zip slip")
	}
}
func rvcTrainingRequest(t *testing.T, opts rvcTrainingOptions, archive []byte, key string) *http.Request {
	t.Helper()
	var b bytes.Buffer
	f := multipart.NewWriter(&b)
	for k, v := range map[string]string{"root": opts.Root, "python": opts.Python, "script": opts.Script, "voiceId": opts.VoiceID, "rights": "confirmed"} {
		if e := f.WriteField(k, v); e != nil {
			t.Fatal(e)
		}
	}
	j, _ := json.Marshal(opts.Args)
	_ = f.WriteField("args", string(j))
	file, _ := f.CreateFormFile("bundle", "dataset.zip")
	_, _ = file.Write(archive)
	_ = f.Close()
	r := httptest.NewRequest("POST", "http://127.0.0.1:58319/api/training/rvc/start", &b)
	r.Header.Set("Origin", "http://127.0.0.1:58319")
	r.Header.Set("X-MYVOCAL-Session", key)
	r.Header.Set("Content-Type", f.FormDataContentType())
	return r
}
func TestRVCTrainingRunnerProducesImportableModelWithoutChangingSource(t *testing.T) {
	o := testRVCTrainer(t)
	a := &appServer{sessionKey: "secure"}
	archive := testRVCTrainingZip(t, "self-voice", "rvc")
	invoked := make(chan string, 1)
	runner := func(_ context.Context, o rvcTrainingOptions, dataset, output string, w io.Writer) error {
		f, e := os.ReadFile(filepath.Join(dataset, "audio", "sample-001.wav"))
		if e != nil || !bytes.Equal(f, []byte("WAV-data-test")) {
			t.Errorf("training source changed: %v", e)
		}
		_, _ = w.Write([]byte("training loop executed"))
		if e = os.WriteFile(output, append([]byte{0x50, 0x4b, 3, 4}, bytes.Repeat([]byte{0x50}, 2044)...), 0600); e != nil {
			return e
		}
		invoked <- output
		return nil
	}
	resp := httptest.NewRecorder()
	a.rvcTrainingStartWith(resp, rvcTrainingRequest(t, o, archive, "secure"), runner)
	if resp.Code != 200 {
		t.Fatalf("start status %d: %s", resp.Code, resp.Body.String())
	}
	var started struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(resp.Body.Bytes(), &started)
	select {
	case <-invoked:
	case <-time.After(5 * time.Second):
		t.Fatal("training never ran")
	}
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if a.training.snapshot()["state"] == "completed" {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if a.training.snapshot()["state"] != "completed" {
		t.Fatal(a.training.snapshot())
	}
	model := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "http://127.0.0.1:58319/api/training/rvc/model?id="+started.ID, nil)
	req.Header.Set("Origin", "http://127.0.0.1:58319")
	req.Header.Set("X-MYVOCAL-Session", "secure")
	a.rvcTrainingModel(model, req)
	if model.Code != 200 || model.Body.Len() != 2048 {
		t.Fatalf("model fetch %d len=%d", model.Code, model.Body.Len())
	}
	a.training.stop()
}
func TestRVCTrainingRejectsMissingSessionBeforeLaunching(t *testing.T) {
	o := testRVCTrainer(t)
	a := &appServer{sessionKey: "secure"}
	w := httptest.NewRecorder()
	calls := 0
	a.rvcTrainingStartWith(w, rvcTrainingRequest(t, o, testRVCTrainingZip(t, "self-voice", "rvc"), "wrong"), func(context.Context, rvcTrainingOptions, string, string, io.Writer) error { calls++; return nil })
	if w.Code != 403 || calls != 0 {
		t.Fatalf("unauthorized start %d calls %d", w.Code, calls)
	}
}
func TestRVCTrainingRejectsStaleOrMissingOutput(t *testing.T) {
	o := testRVCTrainer(t)
	a := &appServer{sessionKey: "secure"}
	w := httptest.NewRecorder()
	archive := testRVCTrainingZip(t, "self-voice", "rvc")
	a.rvcTrainingStartWith(w, rvcTrainingRequest(t, o, archive, "secure"), func(context.Context, rvcTrainingOptions, string, string, io.Writer) error { return nil })
	if w.Code != 200 {
		t.Fatalf("start %d", w.Code)
	}
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if a.training.snapshot()["state"] == "failed" {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("training without model reported complete")
}
func TestRVCTrainingArgumentContractAndPrivacy(t *testing.T) {
	o := testRVCTrainer(t)
	if e := validateTrainingOptions(o); e != nil {
		t.Fatal(e)
	}
	bad := o
	bad.Args = []string{"--dataset", "{dataset}"}
	if validateTrainingOptions(bad) == nil {
		t.Fatal("missing output contract accepted")
	}
	bad = o
	bad.Script = filepath.Join(t.TempDir(), "other.py")
	if validateTrainingOptions(bad) == nil {
		t.Fatal("outside root accepted")
	}
	if strings.Contains(fmt.Sprint((&rvcTrainingManager{}).snapshot()), o.Python) {
		t.Fatal("private Python path leaked")
	}
}

func TestRVCTrainingRejectsPlainTextFakeModel(t *testing.T) {
	f := filepath.Join(t.TempDir(), "fake.pth")
	if err := os.WriteFile(f, bytes.Repeat([]byte("not real model"), 200), 0600); err != nil {
		t.Fatal(err)
	}
	if plausibleTorchCheckpoint(f) {
		t.Fatal("plain text was accepted as model weights")
	}
}