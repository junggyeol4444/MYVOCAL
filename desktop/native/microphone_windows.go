//go:build windows

package main

import (
 "context"
 "errors"
 "fmt"
 "os"
 "path/filepath"
 "runtime"
 "strconv"
 "syscall"
 "time"
 "unsafe"
)

const (
 waveMapperID=0xffffffff
 whdrDone=0x00000001
 mmNoError=0
 nativeMicSampleRate=44100
 nativeMicChannels=1
 nativeMicBits=16
)
var (
 winmm=syscall.NewLazyDLL("winmm.dll")
 waveInOpen=winmm.NewProc("waveInOpen")
 waveInPrepare=winmm.NewProc("waveInPrepareHeader")
 waveInAdd=winmm.NewProc("waveInAddBuffer")
 waveInStart=winmm.NewProc("waveInStart")
 waveInStop=winmm.NewProc("waveInStop")
 waveInReset=winmm.NewProc("waveInReset")
 waveInUnprepare=winmm.NewProc("waveInUnprepareHeader")
 waveInClose=winmm.NewProc("waveInClose")
)
type nativeWaveFormat struct {
 Tag uint16
 Channels uint16
 Rate uint32
 BytesPerSec uint32
 BlockAlign uint16
 Bits uint16
 Extra uint16
}
type nativeWaveHeader struct {
 Data uintptr
 BufferBytes uint32
 RecordedBytes uint32
 User uintptr
 Flags uint32
 Loops uint32
 Next uintptr
 Reserved uintptr
}
func mmCheck(name string,status uintptr)error{
 if status!=mmNoError{return fmt.Errorf("Windows 마이크 %s 오류 (MMRESULT=%d)",name,status)}
 return nil
}
func recordNativeMic(ctx context.Context,r request,logLine func(string))error{
 seconds,err:=strconv.Atoi(r.Option)
 if err!=nil||seconds<3||seconds>180{return errors.New("마이크 녹음 길이는 3~180초여야 합니다")}
 if err=preventOverwrite(r.Output);err!=nil{return err}
 format:=nativeWaveFormat{Tag:1,Channels:nativeMicChannels,Rate:nativeMicSampleRate,
  BytesPerSec:nativeMicSampleRate*nativeMicChannels*nativeMicBits/8,
  BlockAlign:nativeMicChannels*nativeMicBits/8,Bits:nativeMicBits}
 bytesNeeded:=seconds*int(format.BytesPerSec)
 samples:=make([]byte,bytesNeeded)
 header:=nativeWaveHeader{Data:uintptr(unsafe.Pointer(&samples[0])),BufferBytes:uint32(bytesNeeded),Loops:1}
 var input uintptr
 status,_,_:=waveInOpen.Call(uintptr(unsafe.Pointer(&input)),waveMapperID,uintptr(unsafe.Pointer(&format)),0,0,0)
 if err=mmCheck("장치 열기",status);err!=nil{return err}
 prepared:=false
 started:=false
 defer func(){
  if started{waveInStop.Call(input)}
  waveInReset.Call(input)
  if prepared{waveInUnprepare.Call(input,uintptr(unsafe.Pointer(&header)),unsafe.Sizeof(header))}
  waveInClose.Call(input)
  runtime.KeepAlive(samples)
  runtime.KeepAlive(header)
 }()
 status,_,_ =waveInPrepare.Call(input,uintptr(unsafe.Pointer(&header)),unsafe.Sizeof(header))
 if err=mmCheck("녹음 버퍼 준비",status);err!=nil{return err}
 prepared=true
 status,_,_ =waveInAdd.Call(input,uintptr(unsafe.Pointer(&header)),unsafe.Sizeof(header))
 if err=mmCheck("녹음 버퍼 등록",status);err!=nil{return err}
 status,_,_ =waveInStart.Call(input)
 if err=mmCheck("녹음 시작",status);err!=nil{return err}
 started=true
 logLine(fmt.Sprintf("\r\nWindows 기본 마이크 녹음 중: %d초 / 44.1kHz / 모노 / 16-bit\r\n",seconds))
 deadline:=time.Now().Add(time.Duration(seconds+2)*time.Second)
 for {
  if ctx.Err()!=nil{return errors.New("마이크 녹음을 사용자가 취소했습니다")}
  if header.Flags&whdrDone!=0{break}
  if time.Now().After(deadline){return errors.New("마이크 녹음 장치 응답 시간이 초과되었습니다")}
  time.Sleep(40*time.Millisecond)
 }
 status,_,_=waveInStop.Call(input)
 if err=mmCheck("녹음 중지",status);err!=nil{return err}
 started=false
 status,_,_=waveInReset.Call(input)
 if err=mmCheck("녹음 버퍼 정리",status);err!=nil{return err}
 recorded:=int(header.RecordedBytes)
 if recorded>len(samples){return errors.New("녹음된 PCM 크기가 잘못되었습니다")}
 recorded-=(recorded%int(format.BlockAlign))
 if recorded<2*nativeMicSampleRate{return errors.New("1초 미만 녹음되어 파일을 생성하지 않았습니다")}
 file,err:=os.CreateTemp(filepath.Dir(r.Output),".myvocal-voice-*.wav")
 if err!=nil{return err}
 temp:=file.Name()
 defer os.Remove(temp)
 if err=writeLongWave(file,int(format.Rate),int(format.Channels),int64(recorded));err==nil{
  _,err=file.Write(samples[:recorded])
 }
 if err==nil{err=file.Sync()}
 if closeErr:=file.Close();err==nil{err=closeErr}
 if err!=nil{return fmt.Errorf("마이크 녹음 WAV 작성 실패: %w",err)}
 if err=os.Link(temp,r.Output);err!=nil{return fmt.Errorf("새 WAV 생성 실패(기존 파일 덮어쓰기 방지): %w",err)}
 logLine(fmt.Sprintf("\r\n마이크 실녹음 저장: %s (%0.2f초)\r\n",r.Output,float64(recorded)/float64(format.BytesPerSec)))
 runtime.KeepAlive(samples)
 runtime.KeepAlive(header)
 return nil
}
