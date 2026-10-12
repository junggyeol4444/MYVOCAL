package main

import "net/url"

// Only the fixed local app origin can be shown in the native top-level window.
// about:blank is an internal WebView2 startup page; other schemes are denied.
func allowedNativeNavigation(raw string) bool {
	if raw == "about:blank" {
		return true
	}
	u, err := url.Parse(raw)
	if err != nil || u == nil {
		return false
	}
	return u.Scheme == "http" && u.Host == "127.0.0.1:"+appPort && u.User == nil &&
		u.Opaque == ""
}
