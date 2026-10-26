package main

// Direct local PCM mixing for the existing native Win32 desktop program.
// This implementation does not use Python, HTML, WebView2, HTTP or a server.
import (
 "context"
 "encoding/binary"
 "errors"
 "fmt"
 "io"
 "math"
 "os"
 "path/filepath"
 "strconv"
)

type nativePCMReader struct {
 file *os.File
 rate int
 channels int
 frames int64
}

func openNativePCM(path string)(nativePCMReader,error){
 stat,err:=os.Lstat(path)
 if err!=nil{return nativePCMReader{},err}
 if !stat.Mode().IsRegular()||stat.Size()<44||stat.Size()>int64(0xFFFFFF00)+44{
  return nativePCMReader{},fmt.Errorf("표준 WAV 파일이 아닙니다: %s",path)
 }
 f,err:=os.Open(path);if err!=nil{return nativePCMReader{},err}
 var head [44]byte
 _,err=io.ReadFull(f,head[:])
 if err!=nil{f.Close();return nativePCMReader{},err}
 channels:=int(binary.LittleEndian.Uint16(head[22:24]))
 rate:=int(binary.LittleEndian.Uint32(head[24:28]))
 size:=int64(binary.LittleEndian.Uint32(head[40:44]))
 if string(head[0:4])!="RIFF"||string(head[8:12])!="WAVE"||
  string(head[12:16])!="fmt "||binary.LittleEndian.Uint32(head[16:20])!=16||
  binary.LittleEndian.Uint16(head[20:22])!=1||
  binary.LittleEndian.Uint16(head[34:36])!=16||
  string(head[36:40])!="data"||
  (channels!=1&&channels!=2)||rate<8000||rate>96000||
  binary.LittleEndian.Uint32(head[4:8])!=uint32(stat.Size()-8)||
  size!=stat.Size()-44||size<=0||size%int64(channels*2)!=0{
  f.Close();return nativePCMReader{},fmt.Errorf("PCM 16비트 WAV의 헤더/채널/길이가 유효하지 않습니다: %s",path)
 }
 return nativePCMReader{file:f,rate:rate,channels:channels,frames:size/int64(channels*2)},nil
}

func mixNativePCM(ctx context.Context,r request,logLine func(string))error{
 gainPercent,err:=strconv.Atoi(r.Option)
 if err!=nil||gainPercent<0||gainPercent>200{return errors.New("보컬 음량은 0~200%입니다")}
 music,err:=openNativePCM(r.Input);if err!=nil{return fmt.Errorf("반주: %w",err)}
 defer music.file.Close()
 voice,err:=openNativePCM(r.Auxiliary);if err!=nil{return fmt.Errorf("보컬: %w",err)}
 defer voice.file.Close()
 if music.rate!=voice.rate||music.channels!=voice.channels{
  return errors.New("반주와 보컬의 PCM 샘플레이트/채널이 다릅니다. 원본은 변경하지 않습니다")
 }
 maxFrames:=music.frames
 if voice.frames>maxFrames{maxFrames=voice.frames}
 block:=int64(music.channels*2)
 totalBytes:=maxFrames*block
 if totalBytes<=0||totalBytes>0xFFFFFF00{return errors.New("PCM WAV 출력이 4GB 한도를 초과합니다")}
 file,err:=os.CreateTemp(filepath.Dir(r.Output),".myvocal-native-mix-*.wav")
 if err!=nil{return err}
 temporary:=file.Name()
 defer os.Remove(temporary)
 err=writeLongWave(file,music.rate,music.channels,totalBytes)
 const framesPerBatch=8192
 mBuf:=make([]byte,framesPerBatch*int(block))
 vBuf:=make([]byte,framesPerBatch*int(block))
 out:=make([]byte,framesPerBatch*int(block))
 factor:=float64(gainPercent)/100.0
 for offset:=int64(0);err==nil&&offset<maxFrames;{
  if ctx.Err()!=nil{err=errors.New("사용자가 믹싱을 취소했습니다");break}
  frames:=int64(framesPerBatch)
  if maxFrames-offset<frames{frames=maxFrames-offset}
  bytesNeeded:=int(frames*block)
  clear(mBuf[:bytesNeeded])
  clear(vBuf[:bytesNeeded])
  mCount:=frames
  if music.frames-offset<mCount{mCount=music.frames-offset}
  if mCount<0{mCount=0}
  vCount:=frames
  if voice.frames-offset<vCount{vCount=voice.frames-offset}
  if vCount<0{vCount=0}
  if mCount>0{_,err=io.ReadFull(music.file,mBuf[:int(mCount*block)]);if err!=nil{break}}
  if vCount>0{_,err=io.ReadFull(voice.file,vBuf[:int(vCount*block)]);if err!=nil{break}}
  for i:=0;i<bytesNeeded;i+=2{
   m:=int16(binary.LittleEndian.Uint16(mBuf[i:i+2]))
   v:=int16(binary.LittleEndian.Uint16(vBuf[i:i+2]))
   // Half-gain for each full-scale source leaves headroom at the default 100%.
   value:=math.Round(0.5*float64(m)+0.5*factor*float64(v))
   if value>32767{value=32767}
   if value< -32768{value= -32768}
   binary.LittleEndian.PutUint16(out[i:i+2],uint16(int16(value)))
  }
  _,err=file.Write(out[:bytesNeeded])
  offset+=frames
 }
 if err==nil{err=file.Sync()}
 if closeErr:=file.Close();err==nil{err=closeErr}
 if err!=nil{return fmt.Errorf("PCM 믹싱 중단 (원본 WAV 보존): %w",err)}
 // Exclusive hard link avoids replacing even a file created after validation.
 if err=os.Link(temporary,r.Output);err!=nil{
  return fmt.Errorf("기존 출력 파일 보존을 위해 저장하지 않았습니다: %w",err)
 }
 logLine(fmt.Sprintf("\r\n실제 PCM 믹싱 WAV 저장: %s (%.2f초, 보컬 %d%%)\r\n",
  r.Output,float64(maxFrames)/float64(music.rate),gainPercent))
 return nil
}
