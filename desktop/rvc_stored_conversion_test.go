package main

import(
 "bytes"
 "context"
 "mime/multipart"
 "net/http"
 "net/http/httptest"
 "os"
 "path/filepath"
 "runtime"
 "strconv"
 "testing"
)
func makeRegisteredRVCRequest(t *testing.T,options rvcOptions,model,index []byte,rights,key string)*http.Request {
 t.Helper()
 var buf bytes.Buffer
 form:=multipart.NewWriter(&buf)
 for k,v:=range map[string]string{"root":options.Root,"python":options.Python,"f0":"pm","pitch":"0","indexRate":strconv.FormatFloat(options.IndexRate,'f',2,64),"rights":rights}{
  if err:=form.WriteField(k,v);err!=nil{t.Fatal(err)}
 }
 files:=[]struct{name string;bytes []byte}{{"audio",sampleRVCWAV()},{"modelUpload",model}}
 if index!=nil{files=append(files,struct{name string;bytes []byte}{"indexUpload",index})}
 for _,f:=range files {
  part,err:=form.CreateFormFile(f.name,"untrusted-original-name");if err!=nil{t.Fatal(err)}
  if _,err=part.Write(f.bytes);err!=nil{t.Fatal(err)}
 }
 if err:=form.Close();err!=nil{t.Fatal(err)}
 req:=httptest.NewRequest(http.MethodPost,"http://127.0.0.1:58319/api/singing/rvc/stored",&buf)
 req.Host="127.0.0.1:58319"
 req.Header.Set("Origin","http://127.0.0.1:58319")
 req.Header.Set("X-MYVOCAL-Session",key)
 req.Header.Set("Content-Type",form.FormDataContentType())
 return req
}
func TestRegisteredRVCInferenceStagesOnlyIsolatedCopies(t *testing.T){
 opts:=tempRVCInstall(t);opts.IndexRate=.7
 model:=append([]byte{'P','K',3,4},bytes.Repeat([]byte{0x31},2044)...)
 index:=append([]byte{'I','x','F','I'},bytes.Repeat([]byte{0x36},2044)...)
 a:=&appServer{sessionKey:"private-session"}
 called:=0
 var stagedModel,stagedIndex string
 w:=httptest.NewRecorder()
 runner:=func(_ context.Context,o rvcOptions,input,output string)error{
  called++
  stagedModel,stagedIndex=o.Model,o.Index
  if !filepath.IsAbs(o.Model)||!filepath.IsAbs(o.Index)||filepath.Dir(o.Model)!=filepath.Dir(input)||filepath.Dir(o.Index)!=filepath.Dir(input){
   t.Fatal("model/index did not use isolated temporary directory")
  }
  for _,it:=range []struct{path string;want []byte}{{o.Model,model},{o.Index,index}} {
   got,err:=os.ReadFile(it.path);if err!=nil||!bytes.Equal(got,it.want){t.Fatal("registered original was modified or staged wrong")}
  }
  if bytes.Equal([]byte(o.Model),[]byte(opts.Model)){t.Fatal("user installation model overwritten")}
  return os.WriteFile(output,sampleRVCWAV(),0600)
 }
 a.rvcConvertStoredWith(w,makeRegisteredRVCRequest(t,opts,model,index,"confirmed","private-session"),runner)
 if w.Code!=200||called!=1||!validSingingWAV(w.Body.Bytes()){t.Fatalf("RVC model upload got code=%d calls=%d body=%s",w.Code,called,w.Body.String())}
 if _,err:=os.Stat(stagedModel);!os.IsNotExist(err){t.Fatal("temporary model remained after request")}
 if _,err:=os.Stat(stagedIndex);!os.IsNotExist(err){t.Fatal("temporary index remained after request")}
 if _,err:=os.Stat(opts.Model);err!=nil{t.Fatal("user-installed checkpoint was removed")}
}
func TestRegisteredRVCRejectedWithoutOriginalAndModelRights(t *testing.T){
 opts:=tempRVCInstall(t)
 if runtime.GOOS=="windows" && filepath.Base(opts.Python)!="python.exe"{t.Fatal("test python path invalid")}
 model:=append([]byte{'P','K',3,4},bytes.Repeat([]byte{0x2b},2044)...)
 a:=&appServer{sessionKey:"secret-session"}
 called:=0;runner:=func(context.Context,rvcOptions,string,string)error{called++;return nil}
 cases:=[]struct{label,rights,key string;model,index []byte;rate float64;wanted int}{
  {"no access","confirmed","wrong",model,nil,0,403},
  {"no rights","missing","secret-session",model,nil,0,403},
  {"corrupt pth","confirmed","secret-session",bytes.Repeat([]byte{0x33},2048),nil,0,422},
  {"missing index","confirmed","secret-session",model,nil,.5,400},
  {"bad index","confirmed","secret-session",model,bytes.Repeat([]byte{0x34},2048),.5,400},
 }
 for _,tc:=range cases {
  t.Run(tc.label,func(t *testing.T){
   opts.IndexRate=tc.rate
   w:=httptest.NewRecorder()
   a.rvcConvertStoredWith(w,makeRegisteredRVCRequest(t,opts,tc.model,tc.index,tc.rights,tc.key),runner)
   if w.Code!=tc.wanted{t.Fatalf("expected HTTP %d, got %d: %s",tc.wanted,w.Code,w.Body.String())}
  })
 }
 if called!=0{t.Fatalf("rejected file executed actual CLI %d times",called)}
}
