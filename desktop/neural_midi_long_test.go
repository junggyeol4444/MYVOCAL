package main

import (
 "bytes"
 "encoding/json"
 "net/http"
 "net/http/httptest"
 "testing"
)

func TestNeuralMIDIFastTempoFinalSection(t *testing.T) {
 backend:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
  result,_:=json.Marshal(map[string]interface{}{"stems":neuralMidiFixture()})
  _=json.NewEncoder(w).Encode(map[string]interface{}{"response":string(result),"done":true})
 }))
 defer backend.Close()
 request:=[]byte(`{"model":"qwen3:4b","prompt":"빠른 오리지널 노래","genre":"K-pop","key":"C Major","bpm":240,"bars":8,"barStart":353,"section":"Outro","previousMelody":[]}`)
 a:=&appServer{sessionKey:"private"}
 w:=httptest.NewRecorder()
 a.neuralMidiSectionWith(w,httptest.NewRequest("POST","http://127.0.0.1:58319/api/local-ai/midi-section",bytes.NewReader(request)),backend.Client(),backend.URL)
 if w.Code!=200{t.Fatalf("마지막 353마디 신경망 MIDI가 거부됐습니다: %d %s",w.Code,w.Body.String())}
}
