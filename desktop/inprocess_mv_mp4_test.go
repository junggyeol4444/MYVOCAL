package main
import (
 "net/http"
 "testing"
)
func TestInprocessLimitsAreOnlyRaisedForMVMP4(t *testing.T){
 req,res:=inprocessLimits(http.MethodPost,"/api/video/mp4")
 if req!=int(maxMVWebMBytes)||res!=int(maxMVMP4Bytes){t.Fatalf("MP4 limits: %d %d",req,res)}
 for _,tc:=range []struct{method,path string}{{http.MethodGet,"/api/video/mp4"},{http.MethodPost,"/api/video/generate"},{http.MethodPost,"/api/video/mp4/status"},{http.MethodPost,"/api/singing/render"}}{
  req,res=inprocessLimits(tc.method,tc.path)
  if req!=nativeInprocessMaxRequestBytes||res!=nativeInprocessMaxResponseBytes{t.Fatalf("unrelated route limits were raised: %+v",tc)}
 }
}
