package main

// The experimental native host loads WebView2Loader.dll from the executable
// directory. Check the file type before handing it to the Windows loader:
// an arbitrary executable or an x86/ARM DLL must never be loaded as x64.
// This is a format/architecture check, NOT proof of Microsoft's signature.
import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"os"
)

const (
	peMachineAMD64      = 0x8664
	peMagicPE32Plus     = 0x020b
	peCharacteristicDLL = 0x2000
	maxLoaderSize       = 64 << 20
	maxPEOffset         = 1 << 20
)

func validateX64LoaderPE(path string) error {
	info, err := os.Lstat(path)
	if err != nil {
		return fmt.Errorf("WebView2Loader.dll 파일 확인 실패: %w", err)
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return errors.New("WebView2Loader.dll 심볼릭 링크는 안전을 위해 허용하지 않습니다")
	}
	if !info.Mode().IsRegular() || info.Size() < 128 || info.Size() > maxLoaderSize {
		return errors.New("WebView2Loader.dll 크기 또는 파일 형식이 잘못되었습니다")
	}
	f, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("WebView2Loader.dll 열기 실패: %w", err)
	}
	defer f.Close()
	var dos [64]byte
	if _, err := io.ReadFull(f, dos[:]); err != nil {
		return fmt.Errorf("WebView2Loader.dll DOS 헤더 읽기 실패: %w", err)
	}
	if dos[0] != 'M' || dos[1] != 'Z' {
		return errors.New("WebView2Loader.dll은 유효한 Windows PE 파일이 아닙니다 (MZ)")
	}
	offset := int64(binary.LittleEndian.Uint32(dos[0x3c:0x40]))
	// Signature + COFF header + optional-header magic (26 bytes).
	if offset < 64 || offset > maxPEOffset || offset+26 > info.Size() {
		return errors.New("WebView2Loader.dll PE 헤더 위치가 잘못되었습니다")
	}
	var peHeader [26]byte
	if _, err := f.ReadAt(peHeader[:], offset); err != nil {
		return fmt.Errorf("WebView2Loader.dll PE 헤더 읽기 실패: %w", err)
	}
	if string(peHeader[:4]) != "PE\x00\x00" {
		return errors.New("WebView2Loader.dll PE 서명이 잘못되었습니다")
	}
	machine := binary.LittleEndian.Uint16(peHeader[4:6])
	if machine != peMachineAMD64 {
		return fmt.Errorf("WebView2Loader.dll 아키텍처가 Windows x64가 아닙니다 (0x%04x)", machine)
	}
	optionalSize := binary.LittleEndian.Uint16(peHeader[20:22])
	characteristics := binary.LittleEndian.Uint16(peHeader[22:24])
	if characteristics&peCharacteristicDLL == 0 {
		return errors.New("WebView2Loader.dll이 DLL로 표시되지 않았습니다")
	}
	if optionalSize < 2 || offset+24+int64(optionalSize) > info.Size() || binary.LittleEndian.Uint16(peHeader[24:26]) != peMagicPE32Plus {
		return errors.New("WebView2Loader.dll PE32+ 선택 헤더가 잘못되었습니다")
	}
	return nil
}
