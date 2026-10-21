package main
import(
 "bytes"
 "encoding/json"
 "net/http"
 "net/http/httptest"
 "testing"
)
func neuralMidiFixture() []neuralMidiStem{
 roles:=[]string{"melody","chords","bass","drums","guitar","pad"}
 stems:=make([]neuralMidiStem,0,len(roles))
 for _,role:=range roles{
  stem:=neuralMidiStem{Role:role,Notes:[]neuralMidiNote{{Pitch:60,StartBeat:0,Length:1,Velocity:90}}}
  if role=="drums"{stem.Notes[0].Pitch=36}
  stems=append(stems,stem)
 }
 return stems
}
func TestNeuralMIDIActuallyUsesLocalOllamaAndSixEditableParts(t *testing.T){
 calls:=0
 backend:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
  calls++
  if r.URL.Path!="/api/generate"{t.Errorf("unexpected endpoint: %s",r.URL.Path)}
  var body map[string]interface{}
  if err:=json.NewDecoder(r.Body).Decode(&body);err!=nil{t.Error(err)}
  if body["model"]!="qwen3:4b"||body["stream"]!=false||body["format"]!="json"{t.Errorf("not a real local inference request: %v",body)}
  result,_:=json.Marshal(map[string]interface{}{"stems":neuralMidiFixture()})
  _=json.NewEncoder(w).Encode(map[string]interface{}{"response":string(result),"done":true})
 }))
 defer backend.Close()
 req:=[]byte(`{"model":"qwen3:4b","prompt":"아름다운 우리 한국어 노래","genre":"K-pop","key":"C Major","bpm":120,"bars":8,"barStart":1,"section":"Intro","previousMelody":[]}`)
 a:=&appServer{sessionKey:"private"}
 w:=httptest.NewRecorder()
 a.neuralMidiSectionWith(w,httptest.NewRequest("POST","http://127.0.0.1:58319/api/local-ai/midi-section",bytes.NewReader(req)),backend.Client(),backend.URL)
 if w.Code!=200||calls!=1{t.Fatalf("local neural MIDI failed: %d %s",w.Code,w.Body.String())}
 var result struct{Stems []neuralMidiStem `json:"stems"`;NeuralSymbolicGenerated bool `json:"neuralSymbolicGenerated"`}
 if err:=json.Unmarshal(w.Body.Bytes(),&result);err!=nil||!result.NeuralSymbolicGenerated||len(result.Stems)!=6{t.Fatalf("bad MIDI result: %v",err)}
}
func TestNeuralMIDIRejectsUntrustedModelOutput(t *testing.T){
 good:=neuralMidiFixture()
 if !validNeuralMidiStems(good,32){t.Fatal("valid 6 instrument notes wrongly rejected")}
 corrupt:=append([]neuralMidiStem{},good...)
 corrupt[0].Notes=[]neuralMidiNote{{Pitch:60,StartBeat:31,Length:8,Velocity:90}}
 if validNeuralMidiStems(corrupt,32){t.Fatal("overflowing bars reached the project")}
 corrupt=append([]neuralMidiStem{},good...)
 corrupt[0].Role="drums"
 if validNeuralMidiStems(corrupt,32){t.Fatal("duplicated instrument roles accepted")}
}
