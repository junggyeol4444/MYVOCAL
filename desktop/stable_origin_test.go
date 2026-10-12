package main

import (
	"net"
	"strings"
	"testing"
)

func TestFixedPortOriginDoesNotFallBack(t *testing.T) {
	first, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	address := first.Addr().String()
	second, err := listenStable(address)
	if second != nil {
		second.Close()
		t.Fatal("listener improperly switched ports")
	}
	if err == nil || !strings.Contains(strings.ToLower(err.Error()), "address already in use") {
		t.Logf("port busy error (OS-specific): %v", err)
		if err == nil {
			t.Fatal("collision was not detected")
		}
	}
	if err := first.Close(); err != nil {
		t.Fatal(err)
	}
	restored, err := listenStable(address)
	if err != nil {
		t.Fatalf("port not reusable after closing occupant: %v", err)
	}
	restored.Close()
}

func TestSessionOriginRemainsFixed(t *testing.T) {
	if appPort != "58319" {
		t.Fatalf("unexpected origin port %s", appPort)
	}
}
