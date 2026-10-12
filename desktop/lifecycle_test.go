package main

import (
	"testing"
	"time"
)

func TestHeartbeatLifecycle(t *testing.T) {
	start := time.Unix(1000, 0)
	tests := []struct {
		name    string
		elapsed time.Duration
		seen    bool
		last    time.Duration
		want    string
	}{
		{"initial", 0, false, 0, "wait"},
		{"starting", 74 * time.Second, false, 0, "wait"},
		{"no_browser_ping", 76 * time.Second, false, 0, "startup-timeout"},
		{"active", 120 * time.Second, true, 60 * time.Second, "wait"},
		{"window_closed", 180 * time.Second, true, 80 * time.Second, "closed"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := heartbeatAction(start, start.Add(tc.elapsed), tc.seen, start.Add(tc.last))
			if got != tc.want {
				t.Fatalf("got %s, want %s", got, tc.want)
			}
		})
	}
}
