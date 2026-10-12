//go:build windows

package main

import (
	"errors"
	"os"
	"syscall"
)

// Lstat catches common junctions; FILE_ATTRIBUTE_REPARSE_POINT also catches
// other Windows redirectors which may not be represented as ModeSymlink.
func isWindowsReparsePoint(path string) (bool, error) {
	utf16, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return false, err
	}
	attrs, err := syscall.GetFileAttributes(utf16)
	if errors.Is(err, syscall.ERROR_FILE_NOT_FOUND) || errors.Is(err, syscall.ERROR_PATH_NOT_FOUND) {
		return false, os.ErrNotExist
	}
	if err != nil {
		return false, err
	}
	return attrs&syscall.FILE_ATTRIBUTE_REPARSE_POINT != 0, nil
}
