package main

import (
 "bytes"
 "context"
 "encoding/binary"
 "errors"
 "net/http"
 "net/http/httptest"
 "os"
 "path/filepath"
 "testing"
)
func mp4TestWebM() []byte {return append([]byte{0x1a,0x45,0xdf,0xa3,0x9f,0x42,0x86,0x81,0x01,0x42,0x82,0x84},[]byte("webm......")...)}
func mp4TestBox(name string,payload []byte) []byte {b:=make([]byte,8+len(payload));binary.BigEndian.PutUint32(b[:4],uint32(len(b)));copy(b[4:8],name);copy(b[8:],payload);return b}
func mp4TestFixture() []byte {return bytes.Join([][]byte{mp4TestBox("ftyp",[]byte("isom0000")),mp4TestBox("moov",[]byte("metadata")),mp4TestBox("mdat",[]byte("video-packets"))},nil)}
func TestMP4RejectsWrongWebM(t *testing.T){
 if err:=validateWebMHeader(mp4TestWebM());err!=nil{t.Fatal(err)}
 for _,bad:=range [][]byte{nil,[]byte("fake video"),[]byte("RIFFWEBPxxxxx")}{if validateWebMHeader(bad)==nil{t.Fatal("accepted invalid WebM")}}
}
func TestMP4RejectsCorruptContainers(t *testing.T){
 valid:=mp4TestFixture()
 if err:=validateMP4Boxes(bytes.NewReader(valid),int64(len(valid)));err!=nil{t.Fatal(err)}
 for _,bad:=range [][]byte{valid[:16],append(append([]byte{},valid...),1),mp4TestBox("moov",[]byte("hello"))}{
  if validateMP4Boxes(bytes.NewReader(bad),int64(len(bad)))==nil{t.Fatal("accepted invalid MP4")}
 }
}
func TestMP4ConversionTemporaryIsolation(t *testing.T){
 webm:=mp4TestWebM();mp4:=mp4TestFixture();var working string
 actual,err:=encodeMP4(context.Background(),webm,func(_ context.Context,src,dst string)error{
  working=filepath.Dir(src)
  orig,e:=os.ReadFile(src);if e!=nil||!bytes.Equal(orig,webm){t.Fatal("WebM changed")}
  if filepath.Dir(dst)!=working{t.Fatal("output path escaped")}
  return os.WriteFile(dst,mp4,0600)
 })
 if err!=nil||!bytes.Equal(actual,mp4){t.Fatalf("conversion failed: %v",err)}
 if _,err:=os.Stat(working);!os.IsNotExist(err){t.Fatal("temporary files not removed")}
}
func TestMP4ConversionFailurePreservesSource(t *testing.T){
 var working string
 _,err:=encodeMP4(context.Background(),mp4TestWebM(),func(_ context.Context,src,dst string)error{working=filepath.Dir(src);return errors.New("encoder error")})
 if err==nil{t.Fatal("failed encoder accepted")}
 if _,err:=os.Stat(working);!os.IsNotExist(err){t.Fatal("temporary files remained")}
}
func TestMP4SessionAuthorizationAndContainer(t *testing.T){
 a:=&appServer{sessionKey:"token"};fakeEncoder:=func(_ context.Context,src,dst string)error{return os.WriteFile(dst,mp4TestFixture(),0600)}
 makeRequest:=func(token,mime string,body []byte)*http.Request{
  r:=httptest.NewRequest("POST","http://127.0.0.1:58319/api/video/mp4",bytes.NewReader(body))
  r.Header.Set("Origin","http://127.0.0.1:58319")
  r.Header.Set("X-MYVOCAL-Session",token);r.Header.Set("Content-Type",mime)
  return r
 }
 for _,tc:=range []struct{token,mime string;body []byte;status int}{
  {"","video/webm",mp4TestWebM(),403},
  {"token","application/octet-stream",mp4TestWebM(),415},
  {"token","video/webm",[]byte("corrupt"),422},
  {"token","video/webm",mp4TestWebM(),200},
 }{
  w:=httptest.NewRecorder();a.mvMP4ConvertWith(w,makeRequest(tc.token,tc.mime,tc.body),fakeEncoder)
  if w.Code!=tc.status{t.Fatalf("got %d expected %d: %s",w.Code,tc.status,w.Body.String())}
  if tc.status==200&&(!bytes.Equal(w.Body.Bytes(),mp4TestFixture())||w.Header().Get("Content-Type")!="video/mp4"){t.Fatal("wrong MP4 response")}
 }
}
