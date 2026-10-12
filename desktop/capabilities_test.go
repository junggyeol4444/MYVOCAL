package main

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCapabilityRejectsUntrustedAndPorts(t *testing.T) {
	a := &appServer{sessionKey: "testkey"}
	w := httptest.NewRecorder()
	a.singingCapabilities(w, singingReq("GET", "/api/singing/capabilities?port=7867", "bad", nil))
	if w.Code != 403 {
		t.Fatalf("no session %d", w.Code)
	}
	w = httptest.NewRecorder()
	a.singingCapabilities(w, singingReq("GET", "/api/singing/capabilities?port=58319", "testkey", nil))
	if w.Code != 400 {
		t.Fatalf("own port %d", w.Code)
	}
}
func TestCapabilityDiscoveryAndLegacy(t *testing.T) {
	for _, legacy := range []bool{false, true} {
		legacy := legacy
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if legacy {
				http.NotFound(w, r)
				return
			}
			fmt.Fprint(w, `{"protocol":"MYVOCAL_SINGING_V1","name":"Local demo","mode":"demo","inferenceReady":false,"models":[],"supportedLanguages":["ko"],"features":["wav"]}`)
		}))
		_, ps, _ := net.SplitHostPort(srv.Listener.Addr().String())
		var port int
		fmt.Sscan(ps, &port)
		if !safeSingingPort(port) {
			srv.Close()
			t.Skip("port not supported")
		}
		a := &appServer{sessionKey: "testkey"}
		w := httptest.NewRecorder()
		a.singingCapabilities(w, singingReq("GET", fmt.Sprintf("/api/singing/capabilities?port=%d", port), "testkey", nil))
		srv.Close()
		if w.Code != 200 {
			t.Fatalf("status %d %s", w.Code, w.Body.String())
		}
		var got map[string]interface{}
		if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
			t.Fatal(err)
		}
		if got["supported"] != (!legacy) {
			t.Fatalf("legacy %v reply %v", legacy, got)
		}
	}
}
func TestEngineCapabilitiesValidation(t *testing.T) {
	valid := &engineCapabilities{Protocol: "MYVOCAL_SINGING_V1", Mode: "neural", Models: []engineModel{{ID: "x", EngineID: "svc"}}}
	if !validateEngineCapabilities(valid) {
		t.Fatal("valid rejected")
	}
	valid.Models[0].ID = ""
	if validateEngineCapabilities(valid) {
		t.Fatal("blank model accepted")
	}
}
