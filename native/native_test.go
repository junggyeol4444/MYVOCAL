package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNativeProjectBackupRoundTrip(t *testing.T) {
	d := NewDocument()
	d.Set("title", "한글 음악 편집")
	d.Set("lyrics", "1절\n후렴")
	d.Set("characterId", "LUNA")
	d.Set("unknownFutureFeature", map[string]any{"identityLock": true, "camera": []string{"pan", "zoom"}})
	b, e := d.Marshal()
	if e != nil {
		t.Fatal(e)
	}
	d2, e := ParseDocument(b)
	if e != nil {
		t.Fatal(e)
	}
	b2, e := d2.Marshal()
	if e != nil {
		t.Fatal(e)
	}
	var a, c any
	if json.Unmarshal(b, &a) != nil || json.Unmarshal(b2, &c) != nil {
		t.Fatal("parse failed")
	}
	if d2.String("lyrics") != "1절\n후렴" || d2.String("characterId") != "LUNA" {
		t.Fatal("roundtrip lost metadata")
	}
	if !bytes.Contains(b2, []byte("unknownFutureFeature")) {
		t.Fatal("lost unknown fields")
	}
}
func TestRejectInvalidProjects(t *testing.T) {
	for _, s := range []string{"[1,2]", "{}", "{\"format\":\"WRONG\",\"project\":{}}", "{\"format\":\"MYVOCAL_PROJECT_BACKUP\",\"project\":null}"} {
		if _, err := ParseDocument([]byte(s)); err == nil {
			t.Fatalf("accepted invalid project: %s", s)
		}
	}
}
func TestNativeSaveBackupRecovery(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "Project.myvocal.json")
	d := NewDocument()
	d.Set("title", "Original")
	if e := d.Save(p); e != nil {
		t.Fatal(e)
	}
	d.Set("title", "New")
	if e := d.Save(p); e != nil {
		t.Fatal(e)
	}
	b, e := os.ReadFile(p + ".bak")
	if e != nil {
		t.Fatal(e)
	}
	old, e := ParseDocument(b)
	if e != nil || old.String("title") != "Original" {
		t.Fatal("old project not recoverable")
	}
	now, e := ReadDocument(p)
	if e != nil || now.String("title") != "New" {
		t.Fatal("new project not saved")
	}
}
func TestRuleBasedEditableTracks(t *testing.T) {
	d := NewDocument()
	if e := d.GenerateEditableScore(); e != nil {
		t.Fatal(e)
	}
	tr := d.Tracks()
	if len(tr) != 4 {
		t.Fatal(len(tr))
	}
	for _, x := range tr {
		if len(x.MIDI) == 0 {
			t.Fatal("empty track", x.Name)
		}
	}
}
func TestMIDIHeaderTracksAndEnd(t *testing.T) {
	d := NewDocument()
	_ = d.GenerateEditableScore()
	b, e := EncodeMIDI(d.Tracks(), 120)
	if e != nil {
		t.Fatal(e)
	}
	if string(b[:4]) != "MThd" {
		t.Fatal("MIDI header")
	}
	if binary.BigEndian.Uint16(b[10:12]) != 4 {
		t.Fatal("MIDI track count")
	}
	if bytes.Count(b, []byte("MTrk")) != 4 {
		t.Fatal("MIDI track chunks")
	}
	if !bytes.Contains(b, []byte{0xff, 0x2f, 0}) {
		t.Fatal("missing end-of-track")
	}
}
func TestMIDIRejectsInvalidNotes(t *testing.T) {
	_, e := EncodeMIDI([]Track{{Name: "X", MIDI: []Note{{Pitch: 128, StartBeat: 0, Length: 1, Velocity: 90}}}}, 120)
	if e == nil {
		t.Fatal("bad pitch accepted")
	}
}
func TestWAVValidNonSilent(t *testing.T) {
	d := NewDocument()
	_ = d.GenerateEditableScore()
	b, e := EncodePreviewWAV(d.Tracks(), 120)
	if e != nil {
		t.Fatal(e)
	}
	if string(b[:4]) != "RIFF" || string(b[8:12]) != "WAVE" || string(b[36:40]) != "data" {
		t.Fatal("WAV header")
	}
	if len(b) < 1000 || binary.LittleEndian.Uint32(b[4:8]) != uint32(len(b)-8) {
		t.Fatal("WAV length")
	}
	if bytes.Equal(b[100:400], make([]byte, 300)) {
		t.Fatal("WAV unexpectedly silent")
	}
}
func TestSRTHangulAndTiming(t *testing.T) {
	s := StoryboardSRT("첫 장면\n두 번째 장면")
	if !strings.Contains(s, "00:00:00,000 --> 00:00:08,000") || !strings.Contains(s, "00:00:08,000 --> 00:00:16,000") || !strings.Contains(s, "두 번째 장면") {
		t.Fatal(s)
	}
}
func TestExistingStep100BackupLossless(t *testing.T) {
	fixture := os.Getenv("MYVOCAL_LEGACY_BACKUP")
	if fixture == "" {
		t.Skip("No existing Step100 backup provided")
	}
	d, e := ReadDocument(fixture)
	if e != nil {
		t.Fatal(e)
	}
	count := len(d.Tracks())
	if count == 0 {
		t.Fatal("expected original MIDI tracks")
	}
	b, e := d.Marshal()
	if e != nil {
		t.Fatal(e)
	}
	reread, e := ParseDocument(b)
	if e != nil {
		t.Fatal(e)
	}
	if len(reread.Tracks()) != count {
		t.Fatal("MIDI tracks changed on save")
	}
	for key, raw := range d.Project {
		if !bytes.Equal(raw, reread.Project[key]) {
			var x, y any
			_ = json.Unmarshal(raw, &x)
			_ = json.Unmarshal(reread.Project[key], &y)
			aa, _ := json.Marshal(x)
			bb, _ := json.Marshal(y)
			if !bytes.Equal(aa, bb) {
				t.Fatalf("lossy field %s", key)
			}
		}
	}
}
func TestExportOnDisk(t *testing.T) {
	d := NewDocument()
	_ = d.GenerateEditableScore()
	p := filepath.Join(t.TempDir(), "song")
	if e := WriteMIDI(p+".mid", d.Tracks(), 120); e != nil {
		t.Fatal(e)
	}
	if e := WritePreviewWAV(p+".wav", d.Tracks(), 120); e != nil {
		t.Fatal(e)
	}
	if e := ExportSRT(p+".srt", "첫 화면\n마지막 화면"); e != nil {
		t.Fatal(e)
	}
	if e := ExportLyrics(p+".txt", "안녕하세요"); e != nil {
		t.Fatal(e)
	}
	for _, ext := range []string{".mid", ".wav", ".srt", ".txt"} {
		s, e := os.Stat(p + ext)
		if e != nil || s.Size() < 3 {
			t.Fatalf("invalid %s: %v", ext, e)
		}
	}
}
