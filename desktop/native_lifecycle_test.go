package main

import "testing"

func TestNativeLifecycleReadyThenClose(t *testing.T) {
	var p nativeLifecycle
	if !p.acceptsInitCallback() || p.isClosing() {
		t.Fatal("initial phase must accept asynchronous creation callbacks")
	}
	if !p.markReady() || p.acceptsInitCallback() || p.startupTimedOut() {
		t.Fatal("ready phase must reject late creation callbacks and timeout")
	}
	if !p.beginClose() || !p.isClosing() || p.markReady() || p.acceptsInitCallback() {
		t.Fatal("closed window must never restart the WebView2 controller")
	}
	if p.beginClose() {
		t.Fatal("close transition should be idempotent")
	}
}

func TestNativeLifecycleTimeoutClosesAndBlocksLateCallbacks(t *testing.T) {
	var p nativeLifecycle
	if !p.startupTimedOut() || !p.isClosing() {
		t.Fatal("missing environment/controller callback must trigger safe close")
	}
	if p.startupTimedOut() || p.markReady() || p.acceptsInitCallback() {
		t.Fatal("late COM callback must not revive a timed-out window")
	}
}

func TestNativeLifecycleEarlyUserCloseBlocksLateCallbacks(t *testing.T) {
	var p nativeLifecycle
	if !p.beginClose() || p.startupTimedOut() || p.markReady() || p.acceptsInitCallback() {
		t.Fatal("closing during async environment creation must remain terminal")
	}
}

func TestNativeSTAOwnerMatches(t *testing.T) {
	cases := []struct {
		owner, current uint32
		want           bool
	}{
		{0, 0, false}, {0, 42, false}, {42, 0, false},
		{42, 43, false}, {42, 42, true}, {1, 1, true},
	}
	for _, c := range cases {
		if got := nativeSTAOwnerMatches(c.owner, c.current); got != c.want {
			t.Errorf("nativeSTAOwnerMatches(%d,%d)=%v want %v", c.owner, c.current, got, c.want)
		}
	}
}

func TestNativeSessionMessageMatches(t *testing.T) {
	cases := []struct {
		name               string
		expected, supplied uintptr
		live               bool
		want               bool
	}{
		{"current live preview", 123, 123, true, true},
		{"retired session token", 123, 124, true, false},
		{"destroyed owner window", 123, 123, false, false},
		{"uninitialized session", 0, 0, true, false},
		{"missing message token", 123, 0, true, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := nativeSessionMessageMatches(tc.expected, tc.supplied, tc.live); got != tc.want {
				t.Fatalf("match=%v, want %v", got, tc.want)
			}
		})
	}
}
