package main

// Long MusicGen generation in the existing pure Win32 EXE.
// Each 3–6 minute song is produced by the user's existing local MusicGen model,
// with 5 seconds of real previous PCM as the next audio-conditioning prompt.
// Segments are stored without overwriting existing user files and can be resumed.
import (
 "context"
 "crypto/sha256"
 "encoding/binary"
 "encoding/hex"
 "encoding/json"
 "errors"
 "fmt"
 "io"
 "os"
 "path/filepath"
 "strconv"
)

type longMusicManifest struct {
 Version int
 Fingerprint string
 Segments []int
}

type pcm16Chunk struct {
 data []byte
 rate int
 channels int
 frames int
}

func longMusicSegments(total int)([]int,error){
 if total<180||total>360{return nil,errors.New("장편 음악 길이는 180~360초입니다")}
 result:=[]int{}
 for total>0{
  next:=20
  if total<=20{next=total
  }else if total-20<3{next=total-3}
  if next<3||next>20{return nil,errors.New("연속 생성 구간 계산 실패")}
  result=append(result,next);total-=next
 }
 return result,nil
}

func longMusicFingerprint(r request,segments []int)(string,error){
 config,err:=os.ReadFile(filepath.Join(r.Engine,"config.json"))
 if err!=nil{return "",err}
 if len(config)>8<<20{return "",errors.New("MusicGen 모델 설정 파일이 너무 큽니다")}
 configHash:=sha256.Sum256(config)
 identity,err:=json.Marshal([]interface{}{r.Python,r.Engine,r.Prompt,r.Option,segments,hex.EncodeToString(configHash[:])})
 if err!=nil{return "",err}
 digest:=sha256.Sum256(identity)
 return hex.EncodeToString(digest[:]),nil
}

// Only the standard PCM16 WAV layout written by the existing Python worker is
// accepted. Invalid or modified cached segments are never silently reused.
func readLongPCM(path string,expectedSeconds int)(pcm16Chunk,error){
 info,err:=os.Lstat(path)
 if err!=nil{return pcm16Chunk{},err}
 if !info.Mode().IsRegular()||info.Size()<44||info.Size()>32<<20{return pcm16Chunk{},fmt.Errorf("MusicGen WAV 파일 형식/크기 오류: %s",path)}
 raw,err:=os.ReadFile(path)
 if err!=nil{return pcm16Chunk{},err}
 if string(raw[0:4])!="RIFF"||string(raw[8:12])!="WAVE"||string(raw[12:16])!="fmt "||string(raw[36:40])!="data"{
  return pcm16Chunk{},fmt.Errorf("표준 PCM WAV가 아닙니다: %s",path)
 }
 if binary.LittleEndian.Uint32(raw[4:8])!=uint32(len(raw)-8)||
  binary.LittleEndian.Uint32(raw[16:20])!=16||
  binary.LittleEndian.Uint16(raw[20:22])!=1||
  binary.LittleEndian.Uint16(raw[34:36])!=16||
  int(binary.LittleEndian.Uint32(raw[40:44]))!=len(raw)-44{
  return pcm16Chunk{},fmt.Errorf("WAV 헤더 또는 길이가 일치하지 않습니다: %s",path)
 }
 channels:=int(binary.LittleEndian.Uint16(raw[22:24]))
 rate:=int(binary.LittleEndian.Uint32(raw[24:28]))
 if (channels!=1&&channels!=2)||rate<8000||rate>96000{
  return pcm16Chunk{},errors.New("MusicGen WAV 채널 또는 샘플레이트가 올바르지 않습니다")
 }
 block:=channels*2
 if (len(raw)-44)%block!=0{return pcm16Chunk{},errors.New("PCM 프레임 정렬 오류")}
 frames:=(len(raw)-44)/block
 if frames<rate*(expectedSeconds-1)||frames>rate*(expectedSeconds+1){
  return pcm16Chunk{},fmt.Errorf("MusicGen 실제 생성 길이가 요청한 %d초와 다릅니다",expectedSeconds)
 }
 return pcm16Chunk{data:raw[44:],rate:rate,channels:channels,frames:frames},nil
}

func writeLongWave(w io.Writer,rate,channels int,dataSize int64)error{
 if rate<8000||rate>96000||(channels!=1&&channels!=2)||dataSize<0||dataSize>0xFFFFFF00{
  return errors.New("WAV 출력 크기 또는 오디오 형식이 올바르지 않습니다")
 }
 var header [44]byte
 copy(header[0:4],"RIFF")
 binary.LittleEndian.PutUint32(header[4:8],uint32(dataSize+36))
 copy(header[8:12],"WAVE")
 copy(header[12:16],"fmt ")
 binary.LittleEndian.PutUint32(header[16:20],16)
 binary.LittleEndian.PutUint16(header[20:22],1)
 binary.LittleEndian.PutUint16(header[22:24],uint16(channels))
 binary.LittleEndian.PutUint32(header[24:28],uint32(rate))
 binary.LittleEndian.PutUint32(header[28:32],uint32(rate*channels*2))
 binary.LittleEndian.PutUint16(header[32:34],uint16(channels*2))
 binary.LittleEndian.PutUint16(header[34:36],16)
 copy(header[36:40],"data")
 binary.LittleEndian.PutUint32(header[40:44],uint32(dataSize))
 _,err:=w.Write(header[:]);return err
}

func saveLongTail(path string,c pcm16Chunk)error{
 tailFrames:=5*c.rate
 if c.frames<tailFrames{return errors.New("연속 MusicGen에 필요한 5초 오디오가 없습니다")}
 block:=c.channels*2
 tail:=c.data[len(c.data)-tailFrames*block:]
 file,err:=os.OpenFile(path,os.O_CREATE|os.O_EXCL|os.O_WRONLY,0600)
 if err!=nil{return err}
 if err=writeLongWave(file,c.rate,c.channels,int64(len(tail)));err==nil{
  _,err=file.Write(tail)
 }
 if syncErr:=file.Sync();err==nil{err=syncErr}
 if closeErr:=file.Close();err==nil{err=closeErr}
 return err
}

func loadOrCreateLongManifest(folder string,want longMusicManifest)error{
 info,err:=os.Lstat(folder)
 if os.IsNotExist(err){
  if err=os.Mkdir(folder,0700);err!=nil{return err}
 }else if err!=nil{return err
 }else if !info.IsDir()||info.Mode()&os.ModeSymlink!=0{
  return errors.New("중단 재개 폴더가 실제 폴더가 아닙니다")
 }
 path:=filepath.Join(folder,"manifest.json")
 raw,err:=os.ReadFile(path)
 if os.IsNotExist(err){
  entries,e:=os.ReadDir(folder);if e!=nil{return e}
  if len(entries)!=0{return errors.New("이전 중단 재개 폴더의 기록이 불완전합니다. 원본을 보존하고 중단합니다")}
  raw,e=json.MarshalIndent(want,"","  ");if e!=nil{return e}
  file,e:=os.OpenFile(path,os.O_WRONLY|os.O_CREATE|os.O_EXCL,0600)
  if e!=nil{return e}
  _,e=file.Write(raw)
  if syncErr:=file.Sync();e==nil{e=syncErr}
  if closeErr:=file.Close();e==nil{e=closeErr}
  return e
 }
 if err!=nil{return err}
 var have longMusicManifest
 if len(raw)>65536||json.Unmarshal(raw,&have)!=nil||have.Version!=want.Version||
  have.Fingerprint!=want.Fingerprint||len(have.Segments)!=len(want.Segments){
  return errors.New("중단 재개 설정이 다릅니다. 기존 구간을 보존하고 중단합니다")
 }
 for i,n:=range want.Segments{if have.Segments[i]!=n{return errors.New("이전 구간 길이가 현재 요청과 다릅니다")}}
 return nil
}

func runLongMusicGen(ctx context.Context,r request,job jobSpec,logLine func(string))error{
 total,err:=strconv.Atoi(r.Option);if err!=nil{return err}
 segments,err:=longMusicSegments(total);if err!=nil{return err}
 fingerprint,err:=longMusicFingerprint(r,segments);if err!=nil{return err}
 folder:=r.Output+".myvocal-parts"
 if err=loadOrCreateLongManifest(folder,longMusicManifest{Version:1,Fingerprint:fingerprint,Segments:segments});err!=nil{return err}
 work,err:=os.MkdirTemp("","myvocal-native-longmusic-");if err!=nil{return err}
 defer os.RemoveAll(work)
 var rate,channels int
 var totalPCM int64
 for i,seconds:=range segments{
  if err=ctx.Err();err!=nil{return errors.New("작곡 취소됨. 완료된 구간은 보존되어 다시 시작할 수 있습니다")}
  part:=filepath.Join(folder,fmt.Sprintf("part-%03d.wav",i+1))
  info,e:=os.Lstat(part)
  if os.IsNotExist(e){
   if i>0{
    previous,readErr:=readLongPCM(filepath.Join(folder,fmt.Sprintf("part-%03d.wav",i)),segments[i-1])
    if readErr!=nil{return readErr}
    if previous.rate!=rate||previous.channels!=channels{return errors.New("이전 구간의 PCM 형식이 변경됐습니다")}
    tail:=filepath.Join(work,fmt.Sprintf("tail-%03d.wav",i))
    if e=saveLongTail(tail,previous);e!=nil{return e}
   }
   scratch:=filepath.Join(work,fmt.Sprintf("new-%03d.wav",i+1))
   args:=[]string{job.args[0],"--model-dir",r.Engine,"--output",scratch,
    "--prompt",r.Prompt,"--seconds",strconv.Itoa(seconds),"--seed",strconv.Itoa(i)}
   if i>0{args=append(args,"--audio-prompt",filepath.Join(work,fmt.Sprintf("tail-%03d.wav",i)))}
   logLine(fmt.Sprintf("\r\n장편 MusicGen %d/%d 구간 실제 생성 (%d초)\r\n",i+1,len(segments),seconds))
   if e=runProcess(ctx,jobSpec{exe:r.Python,args:args},logLine);e!=nil{
    return fmt.Errorf("구간 %d 생성 실패, 기존 구간은 유지: %w",i+1,e)
   }
   rendered,readErr:=readLongPCM(scratch,seconds)
   if readErr!=nil{return readErr}
   if i>0&&(rendered.rate!=rate||rendered.channels!=channels){
    return errors.New("MusicGen 생성 중 샘플레이트 또는 채널이 달라졌습니다")
   }
   // Hard-link publication is exclusive. A concurrent run cannot overwrite
   // a user's existing segment. The temporary source remains until published.
   if e=os.Link(scratch,part);e!=nil{return fmt.Errorf("구간 원본 보존 저장 실패: %w",e)}
   info,e=os.Lstat(part)
  }else if e!=nil{return e
  }else{logLine(fmt.Sprintf("\r\n기존 %d/%d 구간을 검토하고 재사용합니다.\r\n",i+1,len(segments)))}
  if e!=nil||info==nil||!info.Mode().IsRegular(){return fmt.Errorf("저장된 구간 파일이 올바르지 않습니다: %s",part)}
  chunk,readErr:=readLongPCM(part,seconds);if readErr!=nil{return readErr}
  if i==0{rate=chunk.rate;channels=chunk.channels
  }else if chunk.rate!=rate||chunk.channels!=channels{return errors.New("구간 PCM 형식이 서로 다릅니다")}
  totalPCM+=int64(len(chunk.data))
 }
 if err=ctx.Err();err!=nil{return errors.New("취소됨. 구간은 보존됐습니다")}
 if totalPCM>0xFFFFFF00{return errors.New("전체 WAV가 RIFF 한도를 초과했습니다")}
 output,err:=os.CreateTemp(filepath.Dir(r.Output),".myvocal-long-*.wav")
 if err!=nil{return err}
 tempName:=output.Name()
 defer os.Remove(tempName)
 if err=writeLongWave(output,rate,channels,totalPCM);err==nil{
  for i,seconds:=range segments{
   var chunk pcm16Chunk
   chunk,err=readLongPCM(filepath.Join(folder,fmt.Sprintf("part-%03d.wav",i+1)),seconds)
   if err!=nil{break}
   if chunk.rate!=rate||chunk.channels!=channels{err=errors.New("최종 WAV 병합 중 PCM 형식 불일치");break}
   _,err=output.Write(chunk.data);if err!=nil{break}
  }
 }
 if err==nil{err=ctx.Err()}
 if err==nil{err=output.Sync()}
 if closeErr:=output.Close();err==nil{err=closeErr}
 if err!=nil{return fmt.Errorf("최종 WAV 병합 실패 (구간은 보존): %w",err)}
 if err=os.Link(tempName,r.Output);err!=nil{
  return fmt.Errorf("기존 파일을 덮어쓰지 않기 위해 최종 저장 중단: %w",err)
 }
 logLine(fmt.Sprintf("\r\n장편 MusicGen 실제 PCM WAV 저장: %s (%.2f초, %d구간)\r\n",r.Output,
  float64(totalPCM)/float64(rate*channels*2),len(segments)))
 logLine("\r\n중단 재개 구간 보존: "+folder+"\r\n")
 return nil
}
