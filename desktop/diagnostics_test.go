package main

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestReadinessAuthAndMethod(t *testing.T) {
	a := &appServer{sessionKey: "unit-test"}
	for _, item := range []struct {
		method, key string
		want        int
	}{{"GET", "", 403}, {"POST", "unit-test", 405}, {"GET", "unit-test", 200}} {
		w := httptest.NewRecorder()
		a.systemReadiness(w, singingReq(item.method, "/api/system/readiness", item.key, nil))
		if w.Code != item.want {
			t.Fatalf("%s key=%q status=%d body=%s", item.method, item.key, w.Code, w.Body.String())
		}
	}
}
func TestReadinessDoesNotClaimAIGeneration(t *testing.T) {
	a := &appServer{sessionKey: "unit-test"}
	w := httptest.NewRecorder()
	a.systemReadiness(w, singingReq("GET", "/api/system/readiness", "unit-test", nil))
	var report readinessReport
	if err := json.Unmarshal(w.Body.Bytes(), &report); err != nil {
		t.Fatal(err)
	}
	if !report.LocalOnly || report.ExternalAPIEnabled {
		t.Fatal("desktop must report external API disabled and local-only mode enabled")
	}
	if report.BundledNeuralSinging || report.BundledVideoGenerator {
		t.Fatal("unbundled AI models claimed available")
	}
	if report.Version != "1.8.0" || len(report.Checks) != 3 {
		t.Fatalf("incomplete report: %+v", report)
	}
}
