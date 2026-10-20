package main

import (
 "os"
 "path/filepath"
 "strings"
 "testing"
)

// Validates that the official multi-stage trainer is connected to the SAME
// existing Windows backend. It does not attest CUDA or model inference.
func TestOfficialRVCOptionsAndEmbeddedWorker(t *testing.T) {
 root:=t.TempDir()
 py:=filepath.Join(root,"python.exe")
 if err:=os.WriteFile(py,[]byte("user-selected-python"),0600);err!=nil {t.Fatal(err)}
 required:=[]string{
  "train/preprocess.py","train/dataset/extract_f0.py",
  "train/dataset/extract_hubert_feature.py","train/train.py","infer/cli.py",
  "configs/v2/48k.json","assets/hubert_base/config.json",
  "assets/pretrained_v2/f0G48k.pth","assets/pretrained_v2/f0D48k.pth",
 }
 for _,rel:=range required {
  path:=filepath.Join(root,filepath.FromSlash(rel))
  if err:=os.MkdirAll(filepath.Dir(path),0700);err!=nil {t.Fatal(err)}
  if err:=os.WriteFile(path,[]byte("user-installed-model-or-code"),0600);err!=nil {t.Fatal(err)}
 }
 o:=rvcTrainingOptions{Root:root,Python:py,VoiceID:"self-voice",Mode:"official",Epochs:20,BatchSize:2,GPU:"0"}
 if err:=validateTrainingOptions(o);err!=nil {t.Fatalf("official RVC options unexpectedly rejected: %v",err)}
 bad:=o;bad.GPU="16"
 if validateTrainingOptions(bad)==nil {t.Fatal("invalid GPU must be rejected")}
 bad=o;bad.Epochs=0
 if validateTrainingOptions(bad)==nil {t.Fatal("invalid epochs must be rejected")}
 bad=o;bad.BatchSize=65
 if validateTrainingOptions(bad)==nil {t.Fatal("invalid batch size must be rejected")}
 bad=o;bad.Mode="unknown"
 if validateTrainingOptions(bad)==nil {t.Fatal("unknown trainer mode must be rejected")}
 raw,err:=embeddedRVCOfficialWorker.ReadFile("rvc_official_worker.py")
 if err!=nil {t.Fatal(err)}
 for _,name:=range []string{"train/preprocess.py","extract_f0.py","extract_hubert_feature.py","train/train.py"} {
  if !strings.Contains(string(raw),name) {t.Fatalf("embedded worker missing real stage %s",name)}
 }
}
