package main

import(
 "context"
 "encoding/binary"
 "encoding/json"
 "errors"
 "fmt"
 "io"
 "math"
 "os"
 "path/filepath"
 "sort"
 "time"
)

type voiceSampleAnalysis struct{
 Format string
 Version int
 Sample string
 DurationSeconds float64
 AverageRMS float64
 PeakAmplitude float64
 ClippingRatio float64
 VoicedRatio float64
 Pitch10Hz float64
 Pitch50Hz float64
 Pitch90Hz float64
 DistinctSemitones int
 Notes []string
 CreatedAt string
}
func estimatePitchByDifference(samples []float64,rate float64)float64{
 size:=len(samples)
 if size<256{return 0}
 minlag:=int(rate/900)
 maxlag:=int(rate/75)
 if minlag<3{minlag=3}
 if maxlag>=size/2{maxlag=size/2-1}
 if maxlag<=minlag{return 0}
 common:=size-maxlag
 differences:=make([]float64,maxlag+1)
 cumulative:=0.0
 for lag:=1;lag<=maxlag;lag++{
  diff:=0.0
  for i:=0;i<common;i++{
   delta:=samples[i]-samples[i+lag]
   diff+=delta*delta
  }
  cumulative+=diff
  if lag<minlag{continue}
  normalized:=diff*float64(lag)/math.Max(1e-15,cumulative)
  differences[lag]=normalized
  if normalized<.14{
   for lag+1<=maxlag{
    nextlag:=lag+1
    nextdiff:=0.0
    for i:=0;i<common;i++{
     delta:=samples[i]-samples[i+nextlag]
     nextdiff+=delta*delta
    }
    nextnormalized:=nextdiff*float64(nextlag)/math.Max(1e-15,cumulative+nextdiff)
    if nextnormalized>=normalized{break}
    lag=nextlag;normalized=nextnormalized;cumulative+=nextdiff
   }
   return rate/float64(lag)
  }
 }
 return 0
}
func analyzeVoiceSample(ctx context.Context,source string)(voiceSampleAnalysis,error){
 var report voiceSampleAnalysis
 wav,err:=openNativePCM(source)
 if err!=nil{return report,err}
 defer wav.file.Close()
 if wav.frames<int64(wav.rate)||wav.frames>int64(wav.rate)*360{
  return report,errors.New("내 목소리 분석은 1초~360초 PCM WAV가 필요합니다")
 }
 factor:=int(math.Round(float64(wav.rate)/11025))
 if factor<1{factor=1}
 reducedRate:=float64(wav.rate)/float64(factor)
 down:=make([]float64,0,int(wav.frames)/factor+1)
 var sumSquares float64
 var peak float64
 var clip int64
 var totalSamples int64
 block:=wav.channels*2
 buffer:=make([]byte,4096*block)
 remaining:=wav.frames
 frameNumber:=int64(0)
 for remaining>0{
  if ctx.Err()!=nil{return report,ctx.Err()}
  want:=int64(4096)
  if remaining<want{want=remaining}
  n:=int(want)*block
  if _,err=io.ReadFull(wav.file,buffer[:n]);err!=nil{return report,err}
  for i:=0;i<int(want);i++{
   var average float64
   for c:=0;c<wav.channels;c++{
    position:=i*block+c*2
    v:=float64(int16(binary.LittleEndian.Uint16(buffer[position:position+2])))/32768.0
    sumSquares+=v*v
    totalSamples++
    amp:=math.Abs(v)
    if amp>peak{peak=amp}
    if amp>=.995{clip++}
    average+=v
   }
   if frameNumber%int64(factor)==0{down=append(down,average/float64(wav.channels))}
   frameNumber++
  }
  remaining-=want
 }
 window:=int(reducedRate*.075)
 if window<400{window=400}
 if len(down)<window{return report,errors.New("음정 분석용 WAV가 너무 짧습니다")}
 hop:=int(reducedRate*.05)
 if hop<1{hop=1}
 windows:=(len(down)-window)/hop+1
 if windows>650{hop=int(math.Ceil(float64(len(down)-window)/649));windows=(len(down)-window)/hop+1}
 pitched:=make([]float64,0,windows)
 var voiced int
 for start:=0;start+window<=len(down);start+=hop{
  if ctx.Err()!=nil{return report,ctx.Err()}
  frame:=down[start:start+window]
  rms:=0.0
  for _,v:=range frame{rms+=v*v}
  rms=math.Sqrt(rms/float64(window))
  if rms<.012{continue}
  hz:=estimatePitchByDifference(frame,reducedRate)
  if hz>=75&&hz<=900{
   voiced++
   pitched=append(pitched,hz)
  }
 }
 if len(pitched)==0{return report,errors.New("녹음에서 분석 가능한 유성 음높이를 찾지 못했습니다")}
 sort.Float64s(pitched)
 percentile:=func(p float64)float64{
  i:=int(math.Round(float64(len(pitched)-1)*p))
  return math.Round(pitched[i]*100)/100
 }
 notes:=[]string{}
 if percentile(.9)<392{notes=append(notes,"고음 음역이 적게 측정됐습니다. G4 이상 가창을 추가할 수 있습니다.")}
 if percentile(.1)>196{notes=append(notes,"저음 음역이 적게 측정됐습니다. G3 이하 가창을 추가할 수 있습니다.")}
 if float64(voiced)/float64(windows)<.25{notes=append(notes,"유성 음높이가 확인된 녹음 구간이 적습니다. 노래하는 음성 비중을 늘릴 수 있습니다.")}
 if float64(clip)/float64(totalSamples)>.01{notes=append(notes,"클리핑이 감지되었습니다. 녹음 입력 음량을 낮춰 새 샘플을 만들 수 있습니다.")}
 notes=append(notes,"음역 수치는 로컬 PCM 자기차이 추정치입니다. 발음별 데이터, 호흡, 가성 및 실제 가창 품질은 이 분석만으로 확정하지 않습니다.")
 unique:=map[int]bool{}
 for _,hz:=range pitched{
  midi:=int(math.Round(69+12*math.Log2(hz/440)))
  unique[midi]=true
 }
 report=voiceSampleAnalysis{
  Format:"MYVOCAL_VOICE_SAMPLE_ANALYSIS",Version:1,Sample:source,
  DurationSeconds:math.Round(float64(wav.frames)/float64(wav.rate)*100)/100,
  AverageRMS:math.Sqrt(sumSquares/float64(totalSamples)),
  PeakAmplitude:peak,ClippingRatio:float64(clip)/float64(totalSamples),
  VoicedRatio:float64(voiced)/float64(windows),
  Pitch10Hz:percentile(.1),Pitch50Hz:percentile(.5),Pitch90Hz:percentile(.9),
  DistinctSemitones:len(unique),
  Notes:notes,CreatedAt:time.Now().Format(time.RFC3339),
 }
 return report,nil
}
func publishVoiceAnalysis(path string,report voiceSampleAnalysis)error{
 if err:=preventOverwrite(path);err!=nil{return err}
 body,err:=json.MarshalIndent(report,"","  ")
 if err!=nil{return err}
 tmp,err:=os.CreateTemp(filepath.Dir(path),".myvocal-f0-analysis-*.json")
 if err!=nil{return err}
 name:=tmp.Name()
 defer os.Remove(name)
 _,err=tmp.Write(body)
 if err==nil{err=tmp.Sync()}
 if e:=tmp.Close();err==nil{err=e}
 if err!=nil{return err}
 if err=os.Link(name,path);err!=nil{return fmt.Errorf("녹음 분석 JSON 저장 실패: %w",err)}
 return nil
}
