package main

import (
 "context"
 "crypto/rand"
 "encoding/hex"
 "errors"
 "fmt"
 "io"
 "os"
 "path/filepath"
 "strings"
 "time"
)

func voiceDatasetRoot()(string,error){
 _,projectFile:=studioSnapshot()
 if projectFile==""{return "",errors.New("내 목소리를 저장할 프로젝트를 먼저 만들거나 열어야 합니다")}
 root:=filepath.Join(filepath.Dir(projectFile),"voice-dataset")
 if err:=os.MkdirAll(filepath.Join(root,"audio"),0700);err!=nil{return "",err}
 if err:=requireDirectory(root);err!=nil{return "",err}
 if err:=requireDirectory(filepath.Join(root,"audio"));err!=nil{return "",err}
 return root,nil
}
func nextVoiceSamplePath()(string,error){
 root,err:=voiceDatasetRoot()
 if err!=nil{return "",err}
 var raw [9]byte
 if _,err=rand.Read(raw[:]);err!=nil{return "",err}
 filename:=fmt.Sprintf("voice-%s-%s.wav",time.Now().UTC().Format("20060102-150405"),hex.EncodeToString(raw[:]))
 return filepath.Join(root,"audio",filename),nil
}
func importVoiceSample(ctx context.Context,path string)(string,error){
 if err:=requireExistingFile(path);err!=nil{return "",err}
 if !strings.EqualFold(filepath.Ext(path),".wav"){return "",errors.New("보컬 녹음은 16비트 PCM WAV 파일이어야 합니다")}
 wav,err:=openNativePCM(path);if err!=nil{return "",err}
 if wav.frames<int64(wav.rate){wav.file.Close();return "",errors.New("음색 학습 녹음은 최소 1초가 필요합니다")}
 wav.file.Close()
 newPath,err:=nextVoiceSamplePath();if err!=nil{return "",err}
 // Preserve original source. An independently named file is required as the
 // RVC dataset for preprocessing and training.
 target,err:=os.OpenFile(newPath,os.O_WRONLY|os.O_CREATE|os.O_EXCL,0600)
 if err!=nil{return "",err}
 input,err:=os.Open(path)
 if err!=nil{target.Close();return "",err}
 if err=ctx.Err();err==nil{_,err=io.Copy(target,input)}
 if err==nil{err=target.Sync()}
 if closeErr:=target.Close();err==nil{err=closeErr}
 input.Close()
 if err!=nil{return "",fmt.Errorf("음색 학습용 WAV 등록 실패: %w",err)}
 return newPath,nil
}
func allVoiceSamples()([]string,error){
 root,err:=voiceDatasetRoot();if err!=nil{return nil,err}
 folder:=filepath.Join(root,"audio")
 children,err:=os.ReadDir(folder);if err!=nil{return nil,err}
 var paths []string
 for _,entry:=range children{
  if entry.Type().IsRegular()&&strings.EqualFold(filepath.Ext(entry.Name()),".wav"){
   paths=append(paths,filepath.Join(folder,entry.Name()))
  }
 }
 return paths,nil
}
func saveStudioVoiceModel(path string)error{
 if err:=requireExistingFile(path);err!=nil{return err}
 if !strings.EqualFold(filepath.Ext(path),".pth"){return errors.New("학습 보컬 모델은 .pth 파일이어야 합니다")}
 studioMu.Lock()
 defer studioMu.Unlock()
 if studioPath==""{return errors.New("음색 모델을 등록할 프로젝트가 없습니다")}
 p:=studioCurrent
 p.VoiceModel=path
 p.UpdatedAt=time.Now().Format(time.RFC3339)
 if err:=writeProjectFile(studioPath,p,false);err!=nil{return err}
 studioCurrent=p
 return nil
}
