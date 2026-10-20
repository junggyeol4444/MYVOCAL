package main

import (
 "bytes"
 "context"
 "mime/multipart"
 "net/http/httptest"
 "net/http"
 "os"
 "path/filepath"
 "testing"
)
func midiTestRequest(t *testing.T, python, token string, audio []byte) *http.Request {
 t.Helper()
 var body bytes.Buffer
 writer:=multipart.NewWriter(&body)
 if err:=writer.WriteField("python",python);err!=nil{t.Fatal(err)}
 part,err:=writer.CreateFormFile("audio","stem.wav");if err!=nil{t.Fatal(err)}
 if _,err=part.Write(audio);err!=nil{t.Fatal(err)}
 if err=writer.Close();err!=nil{t.Fatal(err)}
 req:=httptest.NewRequest("POST","http://127.0.0.1:58319/api/music/stems/midi",&body)
 req.Header.Set("Origin","http://127.0.0.1:58319")
 req.Header.Set("X-MYVOCAL-Session",token)
 req.Header.Set("Content-Type",writer.FormDataContentType())
 return req
}
func TestStemMidiNeuralContract(t *testing.T){
 dir:=t.TempDir();python:=filepath.Join(dir,"python.exe");if err:=os.WriteFile(python,[]byte("python"),0600);err!=nil{t.Fatal(err)}
 a:=&appServer{sessionKey:"ok"};calls:=0;var scratch string
 runner:=func(_ context.Context, executable,input,output string)error{
  calls++;scratch=filepath.Dir(input)
  if executable!=python{t.Fatal("wrong Python executable")}
  raw,err:=os.ReadFile(input);if err!=nil||!bytes.Equal(raw,stemTestWAV(4410)){t.Fatal("source PCM changed")}
  return os.WriteFile(output,[]byte{77,84,104,100,0,0,0,6,0,0,0,1,1,224,77,84,114,107,0,0,0,4,0,255,47,0},0600)
 }
 w:=httptest.NewRecorder();a.musicStemMidiWith(w,midiTestRequest(t,python,"ok",stemTestWAV(4410)),runner)
 if w.Code!=200||calls!=1||!bytes.HasPrefix(w.Body.Bytes(),[]byte("MThd")){t.Fatalf("status %d calls %d body %s",w.Code,calls,w.Body.String())}
 if _,err:=os.Stat(scratch);!os.IsNotExist(err){t.Fatal("scratch folder was not cleaned")}
 w=httptest.NewRecorder();a.musicStemMidiWith(w,midiTestRequest(t,python,"wrong",stemTestWAV(4410)),runner)
 if w.Code!=403||calls!=1{t.Fatalf("unauthorized request reached model: %d",w.Code)}
 w=httptest.NewRecorder();a.musicStemMidiWith(w,midiTestRequest(t,python,"ok",[]byte("FAKE")),runner)
 if w.Code!=400||calls!=1{t.Fatalf("fake WAV reached model: %d",w.Code)}
}
func TestStemMidiRejectsFakeNeuralOutput(t *testing.T){
 dir:=t.TempDir();python:=filepath.Join(dir,"python.exe");_ = os.WriteFile(python,[]byte("python"),0600)
 a:=&appServer{sessionKey:"ok"}
 runner:=func(_ context.Context,_,_,out string)error{return os.WriteFile(out,[]byte("NOT_MIDI"),0600)}
 w:=httptest.NewRecorder();a.musicStemMidiWith(w,midiTestRequest(t,python,"ok",stemTestWAV(4410)),runner)
 if w.Code!=502{t.Fatalf("fake MIDI was accepted: %d",w.Code)}
}
