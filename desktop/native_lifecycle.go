package main

// nativeLifecycle is owned by the WebView2 STA thread. A watchdog goroutine
// only posts a Win32 message; it never mutates this state from another thread.
// This prevents late asynchronous COM completions from recreating controls
// after the user has closed the preview window.
type nativeLifecycle uint8

const (
	nativeStarting nativeLifecycle = iota
	nativeRunning
	nativeClosing
)

func (p *nativeLifecycle) acceptsInitCallback() bool { return *p == nativeStarting }
func (p *nativeLifecycle) isClosing() bool           { return *p == nativeClosing }
func (p *nativeLifecycle) markReady() bool {
	if *p != nativeStarting {
		return false
	}
	*p = nativeRunning
	return true
}
func (p *nativeLifecycle) beginClose() bool {
	if *p == nativeClosing {
		return false
	}
	*p = nativeClosing
	return true
}
func (p *nativeLifecycle) startupTimedOut() bool {
	if *p != nativeStarting {
		return false
	}
	*p = nativeClosing
	return true
}

// nativeSTAOwnerMatches is deliberately platform-independent so a Linux test
// can exercise the fail-closed decision. A zero thread ID means the native STA
// has not been established; no COM callback may mutate the window then.
func nativeSTAOwnerMatches(ownerThreadID, currentThreadID uint32) bool {
	return ownerThreadID != 0 && currentThreadID != 0 && ownerThreadID == currentThreadID
}

// A private STA thread-queue event belongs to the current preview only if
// the nonzero per-session identity matches and the owner window is still live.
// Kept platform-independent for race testing on Linux.
func nativeSessionMessageMatches(expected, supplied uintptr, windowLive bool) bool {
	return windowLive && expected != 0 && supplied == expected
}
