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

// Preserve the strict default limits for all API methods except the full MV
// MP4 converter; its real WebM source and MP4 result can exceed 16/80 MiB.
func inprocessLimits(method,path string)(int,int){
 if method==http.MethodPost && path=="/api/video/mp4" {return int(maxMVWebMBytes),int(maxMVMP4Bytes)}
 if method==http.MethodPost && path=="/api/singing/rvc/convert" {return int(maxRVCRequestBytes),int(maxRVCResponseBytes)}
 if method==http.MethodPost && path=="/api/training/rvc/start" {return int(maxRVCTrainingRequest),nativeInprocessMaxResponseBytes}
 if method==http.MethodGet && path=="/api/training/rvc/model" {return nativeInprocessMaxRequestBytes,int(maxRVCTrainedModel)}
 return nativeInprocessMaxRequestBytes,nativeInprocessMaxResponseBytes
}

type inprocessResponse struct {
 Status int
 Header http.Header
 Body []byte
}

func dispatchInprocessRequest(handler http.Handler, method, rawURL string, headers http.Header, payload []byte) (inprocessResponse,error) {
 if handler==nil {return inprocessResponse{},errors.New("internal handler missing")}
 u,err:=url.Parse(rawURL)
 if err!=nil||u.Scheme!="http"||u.Host!="127.0.0.1:"+appPort||u.User!=nil {
  return inprocessResponse{},fmt.Errorf("internal URL denied: %q",rawURL)
 }
 if method!=http.MethodGet&&method!=http.MethodPost&&method!=http.MethodHead {return inprocessResponse{},errors.New("unsupported internal method")}
 requestLimit,responseLimit:=inprocessLimits(method,u.Path)
 if len(payload)>requestLimit {return inprocessResponse{},errors.New("internal request too large")}
 req,err:=http.NewRequest(method,rawURL,bytes.NewReader(payload))
 if err!=nil {return inprocessResponse{},err}
 if headers!=nil {req.Header=headers.Clone()}
 req.Host=u.Host
 req.RemoteAddr="127.0.0.1:0"
 w:=httptest.NewRecorder()
 handler.ServeHTTP(w,req)
 res:=w.Result()
 defer res.Body.Close()
 body,err:=io.ReadAll(io.LimitReader(res.Body,int64(responseLimit)+1))
 if err!=nil{return inprocessResponse{},err}
 if len(body)>responseLimit{return inprocessResponse{},errors.New("internal response too large")}
 return inprocessResponse{Status:res.StatusCode,Header:res.Header.Clone(),Body:body},nil
}
