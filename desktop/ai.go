package main

import (
	"encoding/json"
	"net/http"
)

// MYVOCAL local-only desktop builds do not include an external AI HTTP proxy.
// jsonError remains a local response helper used by the installed singing and
// storage endpoints. A legacy /api/lyrics request now gets a 404 from ServeMux.
func jsonError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
