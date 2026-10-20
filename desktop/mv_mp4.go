package main

// Full music video MP4 conversion. A real locally installed FFmpeg converts
// the existing audio/caption-inclusive WebM; no placeholder video is generated.
// The original project media and its IndexedDB references are never opened here.
import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const maxMVWebMBytes int64 = 96 << 20
const maxMVMP4Bytes int64 = 160 << 20

func installedFFmpeg() (string, error) {
	path, err := exec.LookPath("ffmpeg")
	if err != nil {
		return "", errors.New("FFmpeg가 설치되지 않았거나 PATH에서 찾을 수 없습니다. 기존 WebM 저장은 계속 사용할 수 있습니다")
	}
	if !filepath.IsAbs(path) {
		return "", errors.New("FFmpeg 실행 경로를 확인할 수 없습니다")
	}
	return path, nil
}
func validateWebMHeader(raw []byte) error {
	if len(raw) < 16 || !bytes.Equal(raw[:4], []byte{0x1a, 0x45, 0xdf, 0xa3}) || !bytes.Contains(raw[:min(len(raw), 4096)], []byte("webm")) {
		return errors.New("WebM 파일 헤더가 올바르지 않습니다")
	}
	return nil
}

// Parse top-level boxes rather than trusting an .mp4 suffix, a fake encoder,
// or a WebM payload renamed as MP4. Extended-size boxes are supported.
func validateMP4Boxes(file io.ReaderAt, size int64) error {
	if size < 32 || size > maxMVMP4Bytes {
		return errors.New("MP4 파일 크기가 허용 범위를 벗어났습니다")
	}
	var header [16]byte
	var ftyp, moov, mdat bool
	var at int64
	for n := 0; at < size && n < 4096; n++ {
		if size-at < 8 {
			return errors.New("MP4 박스 헤더가 잘렸습니다")
		}
		if _, err := file.ReadAt(header[:8], at); err != nil {
			return err
		}
		length := uint64(binary.BigEndian.Uint32(header[:4]))
		name := string(header[4:8])
		boxHead := uint64(8)
		if length == 1 {
			if size-at < 16 {
				return errors.New("MP4 확장 박스 헤더가 잘렸습니다")
			}
			if _, err := file.ReadAt(header[8:16], at+8); err != nil {
				return err
			}
			length = binary.BigEndian.Uint64(header[8:16])
			boxHead = 16
		} else if length == 0 {
			length = uint64(size - at)
		}
		if length < boxHead || length > uint64(size-at) {
			return errors.New("MP4 박스 길이가 손상됐습니다")
		}
		if at == 0 && name != "ftyp" {
			return errors.New("MP4 형식 표시가 없습니다")
		}
		switch name {
		case "ftyp":
			ftyp = true
		case "moov":
			moov = true
		case "mdat":
			if length <= boxHead {
				return errors.New("MP4 영상 데이터가 비어 있습니다")
			}
			mdat = true
		}
		at += int64(length)
	}
	if at != size || !ftyp || !moov || !mdat {
		return errors.New("MP4 필수 메타데이터 또는 영상 데이터가 없습니다")
	}
	return nil
}

// Never interpolate user data into shell commands or overwrite any user path.
func runInstalledFFmpeg(ctx context.Context, src, dst string) error {
	path, err := installedFFmpeg()
	if err != nil {
		return err
	}
	command := exec.CommandContext(ctx, path, "-hide_banner", "-nostdin", "-loglevel", "error", "-y", "-i", src,
		"-map", "0:v:0", "-map", "0:a:0?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
		"-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", dst)
	var output bytes.Buffer
	command.Stderr = &output
	if err = command.Run(); err != nil {
		if ctx.Err() != nil {
			return errors.New("MP4 변환이 시간 제한 또는 취소로 중단됐습니다")
		}
		msg := strings.TrimSpace(output.String())
		if len(msg) > 350 {
			msg = msg[:350]
		}
		if msg == "" {
			msg = err.Error()
		}
		return errors.New("FFmpeg MP4 변환 실패: " + msg)
	}
	return nil
}
func encodeMP4(ctx context.Context, webm []byte, encoder func(context.Context, string, string) error) ([]byte, error) {
	if len(webm) > int(maxMVWebMBytes) || len(webm) < 16 {
		return nil, errors.New("WebM 용량이 허용 범위를 벗어났습니다")
	}
	if err := validateWebMHeader(webm); err != nil {
		return nil, err
	}
	folder, err := os.MkdirTemp("", "myvocal-mp4-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(folder)
	source := filepath.Join(folder, "source.webm")
	target := filepath.Join(folder, "export.mp4")
	if err = os.WriteFile(source, webm, 0600); err != nil {
		return nil, err
	}
	if err = encoder(ctx, source, target); err != nil {
		return nil, err
	}
	file, err := os.Open(target)
	if err != nil {
		return nil, errors.New("FFmpeg MP4 결과 파일이 없습니다")
	}
	defer file.Close()
	stat, err := file.Stat()
	if err != nil {
		return nil, err
	}
	if err = validateMP4Boxes(file, stat.Size()); err != nil {
		return nil, err
	}
	result, err := io.ReadAll(io.LimitReader(file, maxMVMP4Bytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(result)) != stat.Size() {
		return nil, errors.New("MP4 출력 파일 읽기가 완료되지 않았습니다")
	}
	return result, nil
}
func (a *appServer) mvMP4Status(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "GET만 허용됩니다")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	_, err := installedFFmpeg()
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if err != nil {
		jsonReply(w, map[string]any{"ready": false, "message": err.Error()})
		return
	}
	jsonReply(w, map[string]any{"ready": true, "message": "설치된 로컬 FFmpeg 사용 가능", "maxWebMBytes": maxMVWebMBytes})
}
func (a *appServer) mvMP4Convert(w http.ResponseWriter, r *http.Request) {
	a.mvMP4ConvertWith(w, r, runInstalledFFmpeg)
}
func (a *appServer) mvMP4ConvertWith(w http.ResponseWriter, r *http.Request, encode func(context.Context, string, string) error) {
	if r.Method != http.MethodPost {
		jsonError(w, 405, "POST만 허용됩니다")
		return
	}
	if !a.authorizeSinging(w, r) {
		return
	}
	if r.Header.Get("Content-Type") != "video/webm" {
		jsonError(w, 415, "WebM 원본 영상만 허용합니다")
		return
	}
	if r.ContentLength > maxMVWebMBytes {
		jsonError(w, 413, "WebM 영상은 96MiB 이하여야 합니다")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxMVWebMBytes)
	webm, err := io.ReadAll(r.Body)
	if err != nil {
		jsonError(w, 413, "WebM 영상 크기 또는 수신 실패")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Minute)
	defer cancel()
	mp4, err := encodeMP4(ctx, webm, encode)
	if err != nil {
		jsonError(w, 422, err.Error())
		return
	}
	w.Header().Set("Content-Type", "video/mp4")
	w.Header().Set("Content-Length", strconv.Itoa(len(mp4)))
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = w.Write(mp4)
}