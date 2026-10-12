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
