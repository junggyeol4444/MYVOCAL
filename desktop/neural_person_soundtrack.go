package main

// 원본 #34·#55: 이미 Wav2Lip가 만든 실사 영상에 등록 원곡 믹스를 재결합.
// 사용자 파일이 아닌 요청별 격리 폴더 내부에서만 FFmpeg를 실행한다.
import(
 "bytes"
 "context"
 "errors"
 "os/exec"
 "strings"
)
func runNeuralLipSoundtrackMux(ctx context.Context,video,fullSong,out string)error{
 ffmpeg,err:=installedFFmpeg()
 if err!=nil{return err}
 command:=exec.CommandContext(ctx,ffmpeg,"-hide_banner","-nostdin","-loglevel","error",
  "-y","-i",video,"-i",fullSong,"-map","0:v:0","-map","1:a:0",
  "-c:v","copy","-c:a","aac","-b:a","192k","-movflags","+faststart",
  "-shortest",out)
 command.Stdin=nil
 var logs bytes.Buffer
 command.Stderr=&logs
 if err=command.Run();err!=nil{
  if ctx.Err()!=nil{return errors.New("신경망 영상과 원곡 합성이 취소됐습니다")}
  message:=strings.TrimSpace(logs.String())
  if len(message)>350{message=message[:350]}
  if message==""{message=err.Error()}
  return errors.New("기존 원곡 음악 포함 MP4 제작 실패: "+message)
 }
 return nil
}
