package main

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func loaderPEFixture() []byte {
	b := make([]byte, 512)
	copy(b, "MZ")
	binary.LittleEndian.PutUint32(b[0x3c:], 0x80)
	copy(b[0x80:], "PE\x00\x00")
	binary.LittleEndian.PutUint16(b[0x84:], peMachineAMD64)
	binary.LittleEndian.PutUint16(b[0x94:], 0xf0)
	binary.LittleEndian.PutUint16(b[0x96:], peCharacteristicDLL)
	binary.LittleEndian.PutUint16(b[0x98:], peMagicPE32Plus)
	return b
}

func TestValidateX64LoaderPE(t *testing.T) {
	cases := []struct {
		name      string
		mutate    func([]byte) []byte
		wantError bool
	}{
		{"x64-dll", func(b []byte) []byte { return b }, false},
		{"empty", func(b []byte) []byte { return nil }, true},
		{"bad-mz", func(b []byte) []byte { b[0] = 'X'; return b }, true},
		{"bad-pe", func(b []byte) []byte { b[0x80] = 'X'; return b }, true},
		{"x86-dll", func(b []byte) []byte { binary.LittleEndian.PutUint16(b[0x84:], 0x014c); return b }, true},
		{"arm64-dll", func(b []byte) []byte { binary.LittleEndian.PutUint16(b[0x84:], 0xaa64); return b }, true},
		{"exe-not-dll", func(b []byte) []byte { binary.LittleEndian.PutUint16(b[0x96:], 0x0002); return b }, true},
		{"pe32-not-pe32plus", func(b []byte) []byte { binary.LittleEndian.PutUint16(b[0x98:], 0x010b); return b }, true},
		{"truncated-optional", func(b []byte) []byte { binary.LittleEndian.PutUint16(b[0x94:], 0xffff); return b }, true},
		{"out-of-bounds-offset", func(b []byte) []byte { binary.LittleEndian.PutUint32(b[0x3c:], 0xfffffff0); return b }, true},
		{"truncated-file", func(b []byte) []byte { return b[:90] }, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "WebView2Loader.dll")
			if err := os.WriteFile(path, tc.mutate(loaderPEFixture()), 0600); err != nil {
				t.Fatal(err)
			}
			err := validateX64LoaderPE(path)
			if (err != nil) != tc.wantError {
				t.Fatalf("got error %v, wantError=%t", err, tc.wantError)
			}
		})
	}
}

func TestValidateX64LoaderPERejectsMissingAndSymlink(t *testing.T) {
	base := t.TempDir()
	if err := validateX64LoaderPE(filepath.Join(base, "missing.dll")); err == nil {
		t.Fatal("missing DLL accepted")
	}
	if runtime.GOOS == "windows" {
		t.Skip("symlink privileges depend on Windows host")
	}
	target := filepath.Join(base, "real.dll")
	if err := os.WriteFile(target, loaderPEFixture(), 0600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(base, "WebView2Loader.dll")
	if err := os.Symlink(target, link); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	if err := validateX64LoaderPE(link); err == nil || !strings.Contains(err.Error(), "링크") {
		t.Fatalf("symlink accepted: %v", err)
	}
}
