package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"math"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"testing"
)

// A real Go handler -> Python worker -> FFmpeg -> WebM pipeline check.
// This is an opt-in Linux integration test; it does not certify a Windows EXE.
func TestVisemeRealFullMusicHTTPRequest(t *testing.T) {
	if os.Getenv("MYVOCAL_RUN_REAL_2D_TEST") != "1" {
		t.Skip("별도 실제 FFmpeg 환경 검증")
	}
	python, e := exec.LookPath("python3")
	if e != nil {
		t.Skip("Python 미설치")
	}
	ffmpeg, e := exec.LookPath("ffmpeg")
	if e != nil {
		t.Skip("FFmpeg 미설치")
	}
	python, _ = filepath.Abs(python)
	ffmpeg, _ = filepath.Abs(ffmpeg)
	portrait := image.NewRGBA(image.Rect(0, 0, 240, 240))
	for y := 0; y < 240; y++ {
		for x := 0; x < 240; x++ {
			portrait.Set(x, y, color.RGBA{100, 140, 160, 255})
		}
	}
	var picture bytes.Buffer
	if e = png.Encode(&picture, portrait); e != nil {
		t.Fatal(e)
	}
	makeWav := func(freq float64) []byte {
		rate, n := 44100, 44100
		buf := make([]byte, 44+n*2)
		copy(buf[0:], "RIFF")
		binary.LittleEndian.PutUint32(buf[4:], uint32(len(buf)-8))
		copy(buf[8:], "WAVEfmt ")
		binary.LittleEndian.PutUint32(buf[16:], 16)
		binary.LittleEndian.PutUint16(buf[20:], 1)
		binary.LittleEndian.PutUint16(buf[22:], 1)
		binary.LittleEndian.PutUint32(buf[24:], uint32(rate))
		binary.LittleEndian.PutUint32(buf[28:], uint32(rate*2))
		binary.LittleEndian.PutUint16(buf[32:], 2)
		binary.LittleEndian.PutUint16(buf[34:], 16)
		copy(buf[36:], "data")
		binary.LittleEndian.PutUint32(buf[40:], uint32(n*2))
		for i := 0; i < n; i++ {
			val := int16(math.Sin(float64(i)/float64(rate)*math.Pi*2*freq) * 8000)
			binary.LittleEndian.PutUint16(buf[44+i*2:], uint16(val))
		}
		return buf
	}
	align := visemeDocument{Format: "MYVOCAL_LYRIC_ALIGNMENT", Version: 1, Cues: []visemeCue{{StartSec: 0, EndSec: .45, Lyric: "가"}, {StartSec: .5, EndSec: .95, Lyric: "구"}}}
	sync, _ := json.Marshal(align)
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	fields := map[string]string{"python": python, "ffmpeg": ffmpeg, "rights": "confirmed", "x": "0.5", "y": "0.72", "mouthWidth": "0.12", "fps": "12", "size": "512", "sceneMode": "mixed", "alignment": string(sync)}
	for k, v := range fields {
		if e = mw.WriteField(k, v); e != nil {
			t.Fatal(e)
		}
	}
	for name, content := range map[string][]byte{"image": picture.Bytes(), "audio": makeWav(220), "soundtrack": makeWav(440)} {
		file, e := mw.CreateFormFile(name, name+map[string]string{"image": ".png", "audio": ".wav", "soundtrack": ".wav"}[name])
		if e != nil {
			t.Fatal(e)
		}
		if _, e = file.Write(content); e != nil {
			t.Fatal(e)
		}
	}
	if e = mw.Close(); e != nil {
		t.Fatal(e)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/mv/lipsync2d", &body)
	request.Header.Set("Content-Type", mw.FormDataContentType())
	response := httptest.NewRecorder()
	(&appServer{}).viseme2DRender(response, request)
	if response.Code != 200 {
		t.Fatalf("status=%s response=%s", strconv.Itoa(response.Code), response.Body.String())
	}
	output := response.Body.Bytes()
	if !bytes.HasPrefix(output, []byte{0x1a, 0x45, 0xdf, 0xa3}) || len(output) < 1000 {
		t.Fatalf("잘못된 WebM %d", len(output))
	}
	if response.Header().Get("Content-Type") != "video/webm" {
		t.Fatal("WebM Content-Type 없음")
	}
}
