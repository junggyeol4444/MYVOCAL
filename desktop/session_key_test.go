package main

import (
	"bytes"
	"errors"
	"io"
	"strings"
	"testing"
)

type failEntropy struct{}

func (failEntropy) Read([]byte) (int, error) { return 0, errors.New("entropy unavailable") }

func TestSessionKeyRequiresSecureEntropy(t *testing.T) {
	if key, err := generateSessionKey(failEntropy{}); err == nil || key != "" {
		t.Fatalf("entropy failure accepted: %q %v", key, err)
	}
	if key, err := generateSessionKey(bytes.NewReader([]byte{1, 2, 3})); err == nil || key != "" {
		t.Fatalf("short entropy accepted: %q %v", key, err)
	}
	key, err := generateSessionKey(bytes.NewReader(bytes.Repeat([]byte{0xAB}, 32)))
	if err != nil || len(key) != 64 || !strings.HasPrefix(key, "abab") {
		t.Fatalf("invalid key: %q %v", key, err)
	}
	if _, err := io.ReadFull(failEntropy{}, make([]byte, 1)); err == nil {
		t.Fatal("test entropy source invalid")
	}
}

func TestSessionScriptIsInsertedAtFinalBodyClosingTag(t *testing.T) {
  const input = `<!doctype html><body><div id="root"></div><script>const exported = "</body>";</script></body>`
  const session = "<script>window.__testSessionReady=true;</script>"
  result, err := injectSessionScript(input, session)
  if err != nil {
    t.Fatal(err)
  }
  const want = `<!doctype html><body><div id="root"></div><script>const exported = "</body>";</script><script>window.__testSessionReady=true;</script></body>`
  if result != want {
    t.Fatalf("session script was not placed after bundled scripts:\n%s", result)
  }
  if _, err := injectSessionScript("<html><div>no closing body</div></html>", session); err == nil {
    t.Fatal("missing closing body tag was accepted")
  }
}
