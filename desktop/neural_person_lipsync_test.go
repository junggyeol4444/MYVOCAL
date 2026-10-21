package main

import(
 "bytes"
 "context"
 "encoding/binary"
 "mime/multipart"
 "net/http"
 "net/http/httptest"
 "os"
 "path/filepath"
 "testing"
)
func minimalNeuralMP4()[]byte{
 raw:=make([]byte,1024);binary.BigEndian.PutUint32(raw[:4],24);copy(raw[4:8],"ftyp");copy(raw[8:12],"isom");return raw
}
func neuralLipUpload(t *testing.T,opts neuralLipOptions,rights,modelRights,key string,media []byte)*http.Request{
 t.Helper()
 var buffer bytes.Buffer;form:=multipart.NewWriter(&buffer)
 for k,v:=range map[string]string{"python":opts.Python,"root":opts.Root,"checkpoint":opts.Checkpoint,"resize":"2","rights":rights,"modelRights":modelRights}{
  if err:=form.WriteField(k,v);err!=nil{t.Fatal(err)}
 }
 for _,item:=range []struct{k,name string;raw []byte}{{"face","face.mp4",media},{"audio","voice.wav",sampleRVCWAV()}}{
  writer,err:=form.CreateFormFile(item.k,item.name);if err!=nil{t.Fatal(err)};if _,err=writer.Write(item.raw);err!=nil{t.Fatal(err)}
 }
 if err:=form.Close();err!=nil{t.Fatal(err)}
 req:=httptest.NewRequest(http.MethodPost,"http://127.0.0.1:58319/api/mv/person/neural-lipsync",&buffer)
 req.Host="127.0.0.1:58319";req.Header.Set("Origin","http://127.0.0.1:58319")
 req.Header.Set("X-MYVOCAL-Session",key);req.Header.Set("Content-Type",form.FormDataContentType());return req
}
func neuralLipInstall(t *testing.T)neuralLipOptions{
 t.Helper();dir:=t.TempDir()
 script:=filepath.Join(dir,"inference.py");python:=filepath.Join(dir,"python.exe");model:=filepath.Join(dir,"checkpoint.pth")
 for _,path:=range []string{script,python,model}{if err:=os.WriteFile(path,[]byte("licensed-local-model-code"),0600);err!=nil{t.Fatal(err)}}
 return neuralLipOptions{Python:python,Root:dir,Checkpoint:model,Resize:2}
}
func TestNeuralPersonLipActuallyPassesOwnedFilesToIsolatedRunner(t *testing.T){
 o:=neuralLipInstall(t);raw:=minimalNeuralMP4();a:=&appServer{sessionKey:"session"}
 calls:=0;var isolated string
 runner:=func(_ context.Context,opts neuralLipOptions,face,audio,out string)error{
  calls++;isolated=filepath.Dir(out)
  if opts.Root!=o.Root||filepath.Dir(face)!=filepath.Dir(audio)||isolated!=filepath.Dir(face){t.Fatal("original face/audio not isolated")}
  for _,p:=range []string{face,audio}{if _,err:=os.Stat(p);err!=nil{t.Fatalf("missing isolated media: %v",err)}}
  return os.WriteFile(out,raw,0600)
 }
 w:=httptest.NewRecorder();a.neuralPersonLipWith(w,neuralLipUpload(t,o,"confirmed","confirmed","session",raw),runner)
 if w.Code!=200||calls!=1||!bytes.Equal(w.Body.Bytes(),raw){t.Fatalf("real MP4 response failed: code=%d calls=%d response=%s",w.Code,calls,w.Body.String())}
 if _,err:=os.Stat(isolated);!os.IsNotExist(err){t.Fatal("sensitive copied media was not removed")}
 if _,err:=os.Stat(o.Checkpoint);err!=nil{t.Fatal("original Wav2Lip neural checkpoint was changed/deleted")}
}
func TestNeuralPersonLipRejectsUnauthorizedAndFakeOutput(t *testing.T){
 o:=neuralLipInstall(t);media:=minimalNeuralMP4();a:=&appServer{sessionKey:"session"}
 ran:=0;runner:=func(_ context.Context,_ neuralLipOptions,_,_,out string)error{ran++;return os.WriteFile(out,[]byte("fake-output"),0600)}
 for _,tc:=range []struct{rights,model,key string}{{"denied","confirmed","session"},{"confirmed","missing","session"},{"confirmed","confirmed","bad"}}{
  w:=httptest.NewRecorder();a.neuralPersonLipWith(w,neuralLipUpload(t,o,tc.rights,tc.model,tc.key,media),runner)
  if w.Code!=403{t.Fatalf("invalid authorization accepted: HTTP %d",w.Code)}
 }
 if ran!=0{t.Fatal("ran installed model without consent")}
 w:=httptest.NewRecorder();a.neuralPersonLipWith(w,neuralLipUpload(t,o,"confirmed","confirmed","session",media),runner)
 if w.Code!=502||ran!=1{t.Fatalf("fake MP4 claimed as valid: HTTP %d calls=%d",w.Code,ran)}
}
