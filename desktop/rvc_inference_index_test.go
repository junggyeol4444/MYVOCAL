package main
import("bytes";"os";"path/filepath";"testing")
func TestRVCInferenceWithValidFAISSIndex(t *testing.T){
 opts:=tempRVCInstall(t);opts.IndexRate=0.65
 if err:=validateRVCOptions(opts);err==nil{t.Fatal("accepted retrieval ratio without a FAISS index")}
 opts.Index=filepath.Join(opts.Root,"trained.index")
 data:=append([]byte("IxFI"),bytes.Repeat([]byte{0x55},2044)...)
 if err:=os.WriteFile(opts.Index,data,0600);err!=nil{t.Fatal(err)}
 if err:=validateRVCOptions(opts);err!=nil{t.Fatalf("valid index refused: %v",err)}
 opts.IndexRate=1.5
 if err:=validateRVCOptions(opts);err==nil{t.Fatal("accepted indexRate >1")}
 opts.IndexRate=0.5
 if err:=os.WriteFile(opts.Index,bytes.Repeat([]byte{0x55},2048),0600);err!=nil{t.Fatal(err)}
 if err:=validateRVCOptions(opts);err==nil{t.Fatal("accepted corrupted FAISS header")}
 opts.Index=filepath.Join(opts.Root,"trained.pth")
 if err:=validateRVCOptions(opts);err==nil{t.Fatal("accepted wrong extension")}
}
