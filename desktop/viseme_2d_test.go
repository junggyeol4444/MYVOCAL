package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestVisemeAlignmentValidation(t *testing.T) {
	good := `{"format":"MYVOCAL_LYRIC_ALIGNMENT","version":1,"cues":[{"startSec":0,"endSec":0.8,"lyric":"가"},{"startSec":1,"endSec":1.8,"lyric":"구"}]}`
	if _, err := validateVisemeAlignment(good); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{`{}`, `{"format":"MYVOCAL_LYRIC_ALIGNMENT","version":1,"cues":[]}`, `{"format":"MYVOCAL_LYRIC_ALIGNMENT","version":1,"cues":[{"startSec":2,"endSec":1,"lyric":"가"}]}`, `{"format":"MYVOCAL_LYRIC_ALIGNMENT","version":1,"cues":[{"startSec":1,"endSec":2,"lyric":"가"},{"startSec":0,"endSec":1,"lyric":"나"}]}`} {
		if _, err := validateVisemeAlignment(bad); err == nil {
			t.Fatalf("invalid accepted: %s", bad)
		}
	}
}
func TestVisemeWorkerRealWebM(t *testing.T) {
	if os.Getenv("MYVOCAL_RUN_REAL_2D_TEST") != "1" {
		t.Skip("실제 로컬 FFmpeg/파이썬 환경이 있을 때만 실행")
	}
	python, err := exec.LookPath("python3")
	if err != nil {
		t.Skip("python3 미설치")
	}
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("ffmpeg 미설치")
	}
	python, err = filepath.Abs(python)
	if err != nil {
		t.Fatal(err)
	}
	ffmpeg, err = filepath.Abs(ffmpeg)
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	img := filepath.Join(dir, "character.png")
	picture := image.NewRGBA(image.Rect(0, 0, 200, 200))
	for y := 0; y < 200; y++ {
		for x := 0; x < 200; x++ {
			picture.Set(x, y, color.RGBA{120, 160, 190, 255})
		}
	}
	f, err := os.Create(img)
	if err != nil {
		t.Fatal(err)
	}
	if err = png.Encode(f, picture); err != nil {
		t.Fatal(err)
	}
	f.Close()
	audio := filepath.Join(dir, "vocal.wav")
	data := make([]byte, 44+44100*2)
	copy(data[:4], "RIFF")
	binary.LittleEndian.PutUint32(data[4:], uint32(len(data)-8))
	copy(data[8:12], "WAVE")
	copy(data[12:16], "fmt ")
	binary.LittleEndian.PutUint32(data[16:], 16)
	binary.LittleEndian.PutUint16(data[20:], 1)
	binary.LittleEndian.PutUint16(data[22:], 1)
	binary.LittleEndian.PutUint32(data[24:], 44100)
	binary.LittleEndian.PutUint32(data[28:], 88200)
	binary.LittleEndian.PutUint16(data[32:], 2)
	binary.LittleEndian.PutUint16(data[34:], 16)
	copy(data[36:40], "data")
	binary.LittleEndian.PutUint32(data[40:], 44100*2)
	for i := 0; i < 44100; i++ {
		binary.LittleEndian.PutUint16(data[44+i*2:], uint16(int16(4000*math.Sin(2*math.Pi*220*float64(i)/44100))))
	}
	if err = os.WriteFile(audio, data, 0600); err != nil {
		t.Fatal(err)
	}
	alignment := filepath.Join(dir, "alignment.json")
	payload := visemeDocument{Format: "MYVOCAL_LYRIC_ALIGNMENT", Version: 1, Cues: []visemeCue{{StartSec: 0, EndSec: .45, Lyric: "가"}, {StartSec: .5, EndSec: .95, Lyric: "구"}}}
	raw, _ := json.Marshal(payload)
	if err = os.WriteFile(alignment, raw, 0600); err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(dir, "result.webm")
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	if err = runViseme2D(ctx, python, ffmpeg, img, audio, alignment, out, .5, .7, .13, 12, 512, "", "static"); err != nil {
		t.Fatal(err)
	}
	result, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	if len(result) < 1000 || !bytes.HasPrefix(result, []byte{0x1a, 0x45, 0xdf, 0xa3}) {
		t.Fatal("WebM output invalid")
	}
	if !bytes.Equal(data, mustRead(t, audio)) {
		t.Fatal("input audio modified")
	}
	if err = runViseme2D(ctx, python, ffmpeg, img, audio, alignment, out, .5, .7, .13, 12, 512, "", "static"); err == nil {
		t.Fatal("existing output overwritten")
	}
}
func mustRead(t *testing.T, path string) []byte {
	t.Helper()
	b, e := os.ReadFile(path)
	if e != nil {
		t.Fatal(e)
	}
	return b
}
