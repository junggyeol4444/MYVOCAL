package main

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
 "strings"
)

const nativeBatchFrames = 8192

func parseAudioSeconds(value,label string)(float64,error){
 value=strings.TrimSpace(value)
 n,err:=strconv.ParseFloat(value,64)
 if err!=nil||math.IsNaN(n)||math.IsInf(n,0)||n<0||n>86400{return 0,fmt.Errorf("%s 값은 0~86400초 숫자여야 합니다",label)}
 return n,nil
}
func audioEditCheck(r request)error{
 if err:=requireExistingFile(r.Input);err!=nil{return fmt.Errorf("원본 WAV: %w",err)}
 if err:=preventOverwrite(r.Output);err!=nil{return err}
 switch r.Task{
 case taskWavTrim:
  begin,err:=parseAudioSeconds(r.Prompt,"구간 시작");if err!=nil{return err}
  end,err:=parseAudioSeconds(r.Option,"구간 종료");if err!=nil{return err}
  if end<=begin{return errors.New("구간 종료 시간은 시작보다 커야 합니다")}
 case taskWavNormalize:
  target,err:=strconv.Atoi(strings.TrimSpace(r.Option))
  if err!=nil||target<10||target>100{return errors.New("정규화 목표 피크는 10~100%입니다")}
 case taskWavFade:
  if _,err:=parseAudioSeconds(r.Prompt,"페이드 인");err!=nil{return err}
  if _,err:=parseAudioSeconds(r.Option,"페이드 아웃");err!=nil{return err}
 default:return errors.New("지원하지 않는 오디오 편집")
 }
 return nil
}
func renderEditedWave(ctx context.Context,outputPath string,rate,channels int,frames int64,render func(io.Writer)error)error{
 pcmBytes:=frames*int64(channels)*2
 if pcmBytes<=0||pcmBytes>0xFFFFFF00{return errors.New("편집 결과 WAV 크기가 허용 범위를 초과합니다")}
 if err:=ctx.Err();err!=nil{return errors.New("사용자가 오디오 편집을 취소했습니다")}
 file,err:=os.CreateTemp(filepath.Dir(outputPath),".myvocal-pcm-edit-*.wav")
 if err!=nil{return err}
 temp:=file.Name()
 defer os.Remove(temp)
 if err=writeLongWave(file,rate,channels,pcmBytes);err==nil{err=render(file)}
 if err==nil{err=ctx.Err()}
 if err==nil{err=file.Sync()}
 if closeErr:=file.Close();err==nil{err=closeErr}
 if err!=nil{return fmt.Errorf("WAV 편집 생성 실패: %w",err)}
 if err=os.Link(temp,outputPath);err!=nil{return fmt.Errorf("WAV 새 파일 저장 실패(기존 파일은 덮어쓰지 않음): %w",err)}
 return nil
}
func trimNativeWAV(ctx context.Context,r request,source nativePCMReader,logLine func(string))error{
 begin,_:=parseAudioSeconds(r.Prompt,"구간 시작")
 end,_:=parseAudioSeconds(r.Option,"구간 종료")
 startFrame:=int64(math.Round(begin*float64(source.rate)))
 endFrame:=int64(math.Round(end*float64(source.rate)))
 if startFrame<0||startFrame>=source.frames||endFrame>source.frames||endFrame<=startFrame{
  return fmt.Errorf("잘라낼 구간은 0~%.3f초 내에 있어야 합니다",float64(source.frames)/float64(source.rate))
 }
 bytesPerFrame:=int64(source.channels*2)
 if _,err:=source.file.Seek(44+startFrame*bytesPerFrame,io.SeekStart);err!=nil{return err}
 err:=renderEditedWave(ctx,r.Output,source.rate,source.channels,endFrame-startFrame,func(w io.Writer)error{
  left:=(endFrame-startFrame)*bytesPerFrame
  for left>0{
   if ctx.Err()!=nil{return ctx.Err()}
   n:=int64(nativeBatchFrames)*bytesPerFrame
   if left<n{n=left}
   wrote,e:=io.CopyN(w,source.file,n)
   if e!=nil{return e}
   left-=wrote
  }
  return nil
 })
 if err==nil{logLine(fmt.Sprintf("\r\nWAV 구간 편집 완료: %.2f~%.2f초 → %s\r\n",begin,end,r.Output))}
 return err
}
func normalizeNativeWAV(ctx context.Context,r request,source nativePCMReader,logLine func(string))error{
 target,_:=strconv.Atoi(r.Option)
 block:=source.channels*2
 buffer:=make([]byte,nativeBatchFrames*block)
 peak:=0
 for {
  if ctx.Err()!=nil{return ctx.Err()}
  n,e:=source.file.Read(buffer)
  if n%2!=0{return errors.New("원본 WAV PCM 정렬 오류")}
  for i:=0;i<n;i+=2{
   sample:=int(int16(binary.LittleEndian.Uint16(buffer[i:i+2])))
   if sample<0{sample= -sample}
   if sample>peak{peak=sample}
  }
  if e==io.EOF{break}
  if e!=nil{return e}
 }
 if peak==0{return errors.New("무음 WAV는 정규화할 수 없습니다")}
 factor:=(32767.0*float64(target)/100.0)/float64(peak)
 if _,err:=source.file.Seek(44,io.SeekStart);err!=nil{return err}
 remaining:=source.frames
 err:=renderEditedWave(ctx,r.Output,source.rate,source.channels,source.frames,func(w io.Writer)error{
  for remaining>0{
   if ctx.Err()!=nil{return ctx.Err()}
   frames:=int64(nativeBatchFrames)
   if remaining<frames{frames=remaining}
   n:=int(frames)*block
   if _,e:=io.ReadFull(source.file,buffer[:n]);e!=nil{return e}
   for i:=0;i<n;i+=2{
    sample:=int16(binary.LittleEndian.Uint16(buffer[i:i+2]))
    v:=math.Round(float64(sample)*factor)
    if v>32767{v=32767}
    if v< -32768{v= -32768}
    binary.LittleEndian.PutUint16(buffer[i:i+2],uint16(int16(v)))
   }
   if _,e:=w.Write(buffer[:n]);e!=nil{return e}
   remaining-=frames
  }
  return nil
 })
 if err==nil{logLine(fmt.Sprintf("\r\nWAV 피크 %d%% 정규화: %s\r\n",target,r.Output))}
 return err
}
func fadeNativeWAV(ctx context.Context,r request,source nativePCMReader,logLine func(string))error{
 fadeIn,_:=parseAudioSeconds(r.Prompt,"페이드 인")
 fadeOut,_:=parseAudioSeconds(r.Option,"페이드 아웃")
 inFrames:=int64(math.Round(fadeIn*float64(source.rate)))
 outFrames:=int64(math.Round(fadeOut*float64(source.rate)))
 if inFrames>source.frames||outFrames>source.frames{
  return errors.New("페이드 길이가 원본 WAV보다 깁니다")
 }
 block:=source.channels*2
 buffer:=make([]byte,nativeBatchFrames*block)
 remaining:=source.frames
 var index int64
 err:=renderEditedWave(ctx,r.Output,source.rate,source.channels,source.frames,func(w io.Writer)error{
  for remaining>0{
   if ctx.Err()!=nil{return ctx.Err()}
   frames:=int64(nativeBatchFrames)
   if remaining<frames{frames=remaining}
   n:=int(frames)*block
   if _,e:=io.ReadFull(source.file,buffer[:n]);e!=nil{return e}
   for frame:=int64(0);frame<frames;frame++{
    absolute:=index+frame
    gain:=1.0
    if inFrames>0&&absolute<inFrames{gain=math.Min(gain,float64(absolute)/float64(inFrames))}
    if outFrames>0&&absolute>=source.frames-outFrames{
     gain=math.Min(gain,float64(source.frames-1-absolute)/float64(outFrames))
    }
    for c:=0;c<source.channels;c++{
     at:=int(frame)*block+c*2
     s:=int16(binary.LittleEndian.Uint16(buffer[at:at+2]))
     v:=math.Round(float64(s)*gain)
     if v>32767{v=32767};if v< -32768{v= -32768}
     binary.LittleEndian.PutUint16(buffer[at:at+2],uint16(int16(v)))
    }
   }
   if _,e:=w.Write(buffer[:n]);e!=nil{return e}
   remaining-=frames;index+=frames
  }
  return nil
 })
 if err==nil{logLine(fmt.Sprintf("\r\nWAV 페이드 인 %.2f초 / 아웃 %.2f초 적용: %s\r\n",fadeIn,fadeOut,r.Output))}
 return err
}
func editNativeWAV(ctx context.Context,r request,logLine func(string))error{
 if err:=audioEditCheck(r);err!=nil{return err}
 source,err:=openNativePCM(r.Input);if err!=nil{return err}
 defer source.file.Close()
 switch r.Task{
 case taskWavTrim:return trimNativeWAV(ctx,r,source,logLine)
 case taskWavNormalize:return normalizeNativeWAV(ctx,r,source,logLine)
 case taskWavFade:return fadeNativeWAV(ctx,r,source,logLine)
 }
 return errors.New("알 수 없는 WAV 편집 작업")
}
