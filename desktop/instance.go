package main

// The persistent instance secret distinguishes our listener from another local
// process claiming the public status string on the fixed application port.

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func loadOrCreateInstanceKey(base string) (string, error) {
	if err := os.MkdirAll(base, 0700); err != nil {
		return "", err
	}
	path := filepath.Join(base, "launcher-instance.key")
	read := func() (string, error) {
		b, e := os.ReadFile(path)
		if e != nil {
			return "", e
		}
		k := strings.TrimSpace(string(b))
		if len(k) != 64 {
			return "", fmt.Errorf("인스턴스 인증 파일이 손상되었습니다: %s", path)
		}
		if _, e = hex.DecodeString(k); e != nil {
			return "", fmt.Errorf("인스턴스 인증 파일 형식 오류: %s", path)
		}
		return k, nil
	}
	if k, e := readInstanceKeyWhenReady(read); e == nil {
		return k, nil
	} else if !errors.Is(e, os.ErrNotExist) {
		return "", e
	}
	buf := make([]byte, 32)
	if _, e := rand.Read(buf); e != nil {
		return "", e
	}
	f, e := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if errors.Is(e, os.ErrExist) {
		return readInstanceKeyWhenReady(read)
	}
	if e != nil {
		return "", e
	}
	_, e = f.WriteString(hex.EncodeToString(buf) + "\n")
	if e == nil {
		e = f.Sync()
	}
	ce := f.Close()
	if e == nil {
		e = ce
	}
	if e != nil {
		return "", fmt.Errorf("인스턴스 인증 파일 저장 실패: %w", e)
	}
	return hex.EncodeToString(buf), nil
}

func (a *appServer) identity(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	received := r.Header.Get("X-MYVOCAL-Instance")
	if a.instanceKey == "" || subtle.ConstantTimeCompare([]byte(received), []byte(a.instanceKey)) != 1 {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	io.WriteString(w, userAgent)
}

func runningApp(url, instanceKey string) bool {
	if instanceKey == "" {
		return false
	}
	req, err := http.NewRequest(http.MethodGet, url+"/__myvocal_identity", nil)
	if err != nil {
		return false
	}
	req.Header.Set("X-MYVOCAL-Instance", instanceKey)
	client := http.Client{Timeout: time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	res, err := client.Do(req)
	if err != nil {
		return false
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 128))
	return res.StatusCode == http.StatusOK && string(b) == userAgent
}

func secureLoopbackHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Host != "127.0.0.1:"+appPort {
			http.Error(w, "Invalid local host", http.StatusForbidden)
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(w, r)
	})
}

// An overlapping first launch can observe the exclusively created key file
// before the first process has finished writing it. Wait briefly for the
// writer; never replace a malformed file or silently regenerate the key.
func readInstanceKeyWhenReady(read func() (string, error)) (string, error) {
	for i := 0; i < 20; i++ {
		key, err := read()
		if err == nil || errors.Is(err, os.ErrNotExist) {
			return key, err
		}
		if i == 19 {
			return "", err
		}
		time.Sleep(25 * time.Millisecond)
	}
	return "", errors.New("인스턴스 인증 파일 확인 실패")
}
