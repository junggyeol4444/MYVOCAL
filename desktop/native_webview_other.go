//go:build !windows

package main

import ("errors";"net/http")

func nativeHostAvailable() error                  { return errors.New("WebView2는 Windows에서만 실행됩니다") }
func runNativeWebView2(url, profile string, inprocess http.Handler) error { return nativeHostAvailable() }
