//go:build !windows

package main

func isWindowsReparsePoint(string) (bool, error) { return false, nil }
