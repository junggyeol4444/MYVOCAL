package main
import("os";"path/filepath";"strings";"testing")
func TestPreserveExistingOutputs(t *testing.T){
 dir:=t.TempDir();p:=filepath.Join(dir,"existing.wav")
 if err:=os.WriteFile(p,[]byte("user audio"),0600);err!=nil{t.Fatal(err)}
 if err:=preventOverwrite(p);err==nil{t.Fatal("overwrite permitted")}
 b,err:=os.ReadFile(p);if err!=nil||string(b)!="user audio"{t.Fatal("original altered")}
}
func TestRejectUnsupportedTask(t *testing.T){
 _,err:=prepareRequest(request{Task:99});if err==nil{t.Fatal("invalid task accepted")}
}
func TestRejectControlCharacters(t *testing.T){
 _,err:=prepareRequest(request{Task:0,Prompt:"hello\nworld"});if err==nil||!strings.Contains(err.Error(),"제어"){t.Fatalf("unexpected: %v",err)}
}
