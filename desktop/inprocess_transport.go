package main

// Execute the desktop API directly inside the Windows application process.
// The WebView2 resource-request bridge uses this same HTTP Handler in memory:
// it does not open a TCP listener or contact the loopback network.
import (
 "bytes"
 "errors"
 "fmt"
 "io"
 "net/http"
 "net/http/httptest"
 "net/url"
)

const nativeInprocessMaxRequestBytes=16 << 20
const nativeInprocessMaxResponseBytes=80 << 20

type inprocessResponse struct {
 Status int
 Header http.Header
 Body []byte
}

func dispatchInprocessRequest(handler http.Handler, method, rawURL string, headers http.Header, payload []byte) (out inprocessResponse, dispatchErr error) {
 // net/http.Server catches panics per connection; the native in-process
 // adapter must offer the same containment instead of crashing the EXE.
 defer func(){
  if recovered:=recover();recovered!=nil {
   out=inprocessResponse{}
   dispatchErr=errors.New("internal request handler failed")
  }
 }()
 if handler==nil {return inprocessResponse{},errors.New("internal handler missing")}
 if len(payload)>nativeInprocessMaxRequestBytes {return inprocessResponse{},errors.New("internal request too large")}
 u,err:=url.Parse(rawURL)
 if err!=nil||u.Scheme!="http"||u.Host!="127.0.0.1:"+appPort||u.User!=nil {
  return inprocessResponse{},fmt.Errorf("internal URL denied: %q",rawURL)
 }
 if method!=http.MethodGet&&method!=http.MethodPost&&method!=http.MethodHead {return inprocessResponse{},errors.New("unsupported internal method")}
 req,err:=http.NewRequest(method,rawURL,bytes.NewReader(payload))
 if err!=nil {return inprocessResponse{},err}
 if headers!=nil {req.Header=headers.Clone()}
 req.Host=u.Host
 req.RemoteAddr="127.0.0.1:0"
 w:=httptest.NewRecorder()
 handler.ServeHTTP(w,req)
 res:=w.Result()
 defer res.Body.Close()
 body,err:=io.ReadAll(io.LimitReader(res.Body,nativeInprocessMaxResponseBytes+1))
 if err!=nil{return inprocessResponse{},err}
 if len(body)>nativeInprocessMaxResponseBytes{return inprocessResponse{},errors.New("internal response too large")}
 return inprocessResponse{Status:res.StatusCode,Header:res.Header.Clone(),Body:body},nil
}
