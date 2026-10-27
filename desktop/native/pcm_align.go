package main

import (
 "context"
 "errors"
 "fmt"
 "io"
 "os"
 "os/exec"
 "path/filepath"
 "strconv"
 "strings"
)

// Direct raw PCM streaming: ffmpeg only reads the neural vocal source; Go
// writes an exact 44-byte RIFF PCM WAV header and the correct number of frames.
// No external server, no replacement of the original voice recording.
type boundedPCMOutput struct{
 sink io.Writer
 written int64
 max int64
}
func (w *boundedPCMOutput)Write(data []byte)(int,error){
 if int64(len(data))>w.max-w.written{return 0,errors.New("오디오 출력이 요청한 PCM 길이를 초과했습니다")}
 n,err:=w.sink.Write(data)
 w.written+=int64(n)
 return n,err
}

func matchSongPCM(ctx context.Context,ffmpeg,input,output string,rate,channels int,frames int64,logLine func(string))error{
 if err:=requireExistingFile(ffmpeg);err!=nil{return fmt.Errorf("FFmpeg 로컬 실행 파일: %w",err)}
 if err:=requireExistingFile(input);err!=nil{return fmt.Errorf("원본 가창 WAV: %w",err)}
 if err:=preventOverwrite(output);err!=nil{return err}
 if rate<16000||rate>96000||(channels!=1&&channels!=2)||frames<1||frames>int64(rate)*360{
  return errors.New("가창 WAV 변환에 사용할 샘플레이트·채널·곡 길이 범위 오류")
 }
 frameBytes:=int64(channels)*2
 exactBytes:=frames*frameBytes
 tmp,err:=os.CreateTemp(filepath.Dir(output),".myvocal-aligned-*.wav")
 if err!=nil{return err}
 name:=tmp.Name()
 defer os.Remove(name)
 if err=writeLongWave(tmp,rate,channels,exactBytes);err!=nil{tmp.Close();return err}
 // Filter output sample rate is fixed before trimming to exact frames.
 filter:=fmt.Sprintf("aresample=%d:async=1:first_pts=0,apad,atrim=end_sample=%d",rate,frames)
 args:=[]string{"-hide_banner","-loglevel","error","-nostdin","-i",input,
  "-map","0:a:0","-vn","-af",filter,
  "-ac",strconv.Itoa(channels),"-ar",strconv.Itoa(rate),
  "-c:a","pcm_s16le","-f","s16le","pipe:1"}
 cmd:=exec.CommandContext(ctx,ffmpeg,args...)
 writer:=&boundedPCMOutput{sink:tmp,max:exactBytes}
 cmd.Stdout=writer
 logs:=&boundedOutput{max:32<<10}
 cmd.Stderr=logs
 logLine("\r\n로컬 FFmpeg PCM 가창 정렬: "+strconv.Itoa(rate)+"Hz / "+strconv.Itoa(channels)+"채널 / "+strconv.FormatInt(frames,10)+" 프레임\r\n")
 if err=cmd.Run();err!=nil{
  tmp.Close()
  if ctx.Err()!=nil{return errors.New("사용자가 가창·반주 동기화 작업을 취소했습니다")}
  return fmt.Errorf("가창 PCM 정렬 실패: %w / %s",err,strings.TrimSpace(logs.buf.String()))
 }
 if writer.written!=exactBytes{
  tmp.Close()
  return fmt.Errorf("가창 PCM 길이가 다릅니다. 기대 %d바이트, 실제 %d바이트",exactBytes,writer.written)
 }
 if err=tmp.Sync();err!=nil{tmp.Close();return err}
 if err=tmp.Close();err!=nil{return err}
 if err=ctx.Err();err!=nil{return err}
 if err=os.Link(name,output);err!=nil{return fmt.Errorf("동기화 WAV 새 파일 저장 실패: %w",err)}
 logLine("\r\n보컬·반주 PCM 타임라인 동기화 완료: "+output+"\r\n")
 return nil
}
