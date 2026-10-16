package main

import (
 "bytes"
 "net/http"
 "strings"
 "testing"
)

func TestInprocessDispatchWithoutNetworkSocket(t *testing.T) {
 // The in-process adapter must not listen on TCP. It executes the same
 // handler used by the legacy server and preserves its origin requirements.
 html,e:=resources.ReadFile("index.html");if e!=nil{t.Fatal(e)}
 app:=&appServer{sessionKey:"internal_test_key",instanceKey:"identity",root:html}
 handler:=secureLoopbackHandler(app.routes())
 r,e:=dispatchInprocessRequest(handler,"GET",fixedOrigin+"/index.html",nil,nil)
 if e!=nil||r.Status!=200||len(r.Body)==0 {t.Fatalf("native document: %d %v",r.Status,e)}
 if !bytes.Contains(r.Body,[]byte("</html>"))&& !bytes.Contains(r.Body,[]byte("</body>")) {t.Fatal("document not returned")}
 h:=http.Header{"X-Myvocal-Session":[]string{"internal_test_key"}}
 result,e:=dispatchInprocessRequest(handler,"GET",fixedOrigin+"/api/system/readiness",h,nil)
 if e!=nil||result.Status!=200||!bytes.Contains(result.Body,[]byte("checks")){t.Fatalf("readiness: %d %v %s",result.Status,e,result.Body)}
 denied,e:=dispatchInprocessRequest(handler,"GET",fixedOrigin+"/api/system/readiness",nil,nil)
 if e!=nil||denied.Status!=403{t.Fatalf("unauthenticated: %d %v",denied.Status,e)}
}
func TestInprocessDispatchRejectsInvalidOriginAndOversize(t *testing.T){
 h:=http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){w.WriteHeader(204)})
 for _,bad:=range []string{"http://evil.test/","http://127.0.0.1:1/","http://127.0.0.1:58319.evil.test/","file:///index.html"}{
  if _,e:=dispatchInprocessRequest(h,"GET",bad,nil,nil);e==nil{t.Error("accepted",bad)}
 }
 if _,e:=dispatchInprocessRequest(h,"DELETE",fixedOrigin,nil,nil);e==nil{t.Error("accepted DELETE")}
 if _,e:=dispatchInprocessRequest(h,"POST",fixedOrigin,nil,make([]byte,nativeInprocessMaxRequestBytes+1));e==nil{t.Error("accepted oversized POST")}
}
func TestInprocessDispatchPreservesRequestBody(t *testing.T){
 h:=http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
  if r.Method!="POST"||r.Header.Get("X-Myvocal-Session")!="ok"{t.Error("request information lost")}
  buf:=make([]byte,8);n,_:=r.Body.Read(buf)
  if string(buf[:n])!="hello"{t.Error("body lost")}
  w.Header().Set("Content-Type","application/json")
  w.WriteHeader(201);w.Write([]byte("{\"ok\":true}"))
 })
 response,e:=dispatchInprocessRequest(h,"POST",fixedOrigin+"/api/singing/render",http.Header{"X-Myvocal-Session":[]string{"ok"}},[]byte("hello"))
 if e!=nil||response.Status!=201||string(response.Body)!="{\"ok\":true}"||response.Header.Get("Content-Type")!="application/json"{t.Fatalf("%#v %v",response,e)}
}

func TestInprocessHandlerPanicDoesNotCrashNativeHost(t *testing.T) {
 handler:=http.HandlerFunc(func(http.ResponseWriter,*http.Request){panic("user-supplied input unexpectedly triggered a handler panic")})
 response,err:=dispatchInprocessRequest(handler,"GET",fixedOrigin+"/api/test",nil,nil)
 if err==nil||response.Status!=0||len(response.Body)!=0{t.Fatalf("panic was not safely contained: %#v %v",response,err)}
 if strings.Contains(err.Error(),"user-supplied"){t.Fatal("handler panic details leaked")}
}
