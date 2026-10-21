package main

import (
 "bytes"
 "net/http/httptest"
 "os"
 "path/filepath"
 "testing"
)
func TestPairedRVCIndexDownloadOnlyForAuthenticatedCompletedCurrentJob(t *testing.T){
 dir:=t.TempDir()
 idx:=filepath.Join(dir,"trained-model.index")
 content:=append([]byte("IxFI"),bytes.Repeat([]byte{0x35},2044)...)
 if err:=os.WriteFile(idx,content,0600);err!=nil{t.Fatal(err)}
 if !plausibleRVCIndex(idx){t.Fatal("valid FAISS index rejected")}
 a:=&appServer{sessionKey:"secure"}
 a.training.id="abcdefghijkl123456789012"
 a.training.state="completed"
 a.training.indexPath=idx
 makeReq:=func(key,id string)*httptest.ResponseRecorder{
  req:=httptest.NewRequest("GET","http://127.0.0.1:58319/api/training/rvc/index?id="+id,nil)
  req.Header.Set("X-MYVOCAL-Session",key)
  req.Header.Set("Origin","http://127.0.0.1:58319")
  w:=httptest.NewRecorder();a.rvcTrainingIndex(w,req);return w
 }
 valid:=makeReq("secure",a.training.id)
 if valid.Code!=200||!bytes.Equal(valid.Body.Bytes(),content){t.Fatalf("valid index: HTTP %d, bytes %d",valid.Code,valid.Body.Len())}
 if makeReq("wrong",a.training.id).Code==200{t.Fatal("unauthorized index exposed")}
 if makeReq("secure","stale").Code==200{t.Fatal("stale index exposed")}
 a.training.indexPath=""
 if makeReq("secure",a.training.id).Code==200{t.Fatal("missing index exposed")}
 if err:=os.WriteFile(idx,bytes.Repeat([]byte{0x35},2048),0600);err!=nil{t.Fatal(err)}
 if plausibleRVCIndex(idx){t.Fatal("invalid FAISS header accepted")}
}
