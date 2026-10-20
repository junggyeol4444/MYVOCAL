package main
import (
 "bytes"
 "context"
 "encoding/json"
 "net/http"
 "net/http/httptest"
 "os"
 "path/filepath"
 "testing"
)
func testMusicGenCfg(t *testing.T) musicGenInput {
 t.Helper();dir:=t.TempDir();python:=filepath.Join(dir,"python.exe");if err:=os.WriteFile(python,[]byte("x"),0600);err!=nil{t.Fatal(err)}
 if err:=os.WriteFile(filepath.Join(dir,"config.json"),[]byte("{}"),0600);err!=nil{t.Fatal(err)}
 return musicGenInput{Python:python,ModelDir:dir,Prompt:"A bright cinematic soundtrack",Seconds:4,Seed:7}
}
func testMusicGenRequest(t *testing.T,c musicGenInput,token string)*http.Request{
 t.Helper();body,_:=json.Marshal(c);r:=httptest.NewRequest("POST","http://127.0.0.1:58319/api/music/generate",bytes.NewReader(body));r.Header.Set("Origin","http://127.0.0.1:58319");r.Header.Set("X-MYVOCAL-Session",token);return r
}
func TestMusicGenUserFlow(t *testing.T){
 c:=testMusicGenCfg(t);a:=&appServer{sessionKey:"ok"};calls:=0
 runner:=func(_ context.Context,opt musicGenInput,out string)error{calls++;if opt.Seconds!=4{t.Fatal("changed requested duration")};return os.WriteFile(out,sampleRVCWAV(),0600)}
 w:=httptest.NewRecorder();a.musicGenGenerateWith(w,testMusicGenRequest(t,c,"ok"),runner)
 if w.Code!=200||w.Header().Get("Content-Type")!="audio/wav"||!bytes.Equal(w.Body.Bytes(),sampleRVCWAV())||calls!=1{t.Fatalf("unexpected response %d calls %d",w.Code,calls)}
}
func TestMusicGenRejectsInvalidInputBeforeInference(t *testing.T){
 a:=&appServer{sessionKey:"ok"};c:=testMusicGenCfg(t);calls:=0
 runner:=func(context.Context,musicGenInput,string)error{calls++;return nil}
 samples:=[]struct{opt musicGenInput;session string;code int}{{c,"incorrect",403},{func()musicGenInput{x:=c;x.Seconds=29;return x}(),"ok",400},{func()musicGenInput{x:=c;x.ModelDir="relative";return x}(),"ok",400},{func()musicGenInput{x:=c;x.Python="missing.exe";return x}(),"ok",400}}
 for _,s:=range samples{w:=httptest.NewRecorder();a.musicGenGenerateWith(w,testMusicGenRequest(t,s.opt,s.session),runner);if w.Code!=s.code{t.Errorf("wrong HTTP response %d expected %d",w.Code,s.code)}}
 if calls!=0{t.Fatal("unexpected inference execution")}
}
func TestMusicGenRejectsFakeAudioAndCleansTemporaryDir(t *testing.T){
 c:=testMusicGenCfg(t);a:=&appServer{sessionKey:"ok"};var outputDir string
 w:=httptest.NewRecorder();a.musicGenGenerateWith(w,testMusicGenRequest(t,c,"ok"),func(_ context.Context,_ musicGenInput,out string)error{outputDir=filepath.Dir(out);return os.WriteFile(out,[]byte("not a WAV"),0600)})
 if w.Code!=502{t.Fatalf("fake output accepted: %d",w.Code)}
 if _,err:=os.Stat(outputDir);!os.IsNotExist(err){t.Fatal("generated output directory not removed")}
}
func TestMusicGenEmbeddedWorkerPresent(t *testing.T){b,err:=embeddedMusicGenWorker.ReadFile("musicgen_worker.py");if err!=nil||!bytes.Contains(b,[]byte("local_files_only=True")){t.Fatal("offline MusicGen worker not bundled")}}