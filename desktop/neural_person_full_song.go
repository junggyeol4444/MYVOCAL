package main

// 원본 66항 #34/#55: 허가된 실사 원본이 짧아도 실제 3~6분 가창 전체에
// 설치된 Wav2Lip 신경망을 적용한다. 원본 파일은 읽기만 하며 새 영상은
// 요청별 격리 폴더에만 생성한다. 외부 서비스/모델 다운로드는 사용하지 않는다.
import (
    "bytes"
    "context"
    "encoding/binary"
    "errors"
    "fmt"
    "os"
    "os/exec"
    "path/filepath"
    "strconv"
    "strings"
)

const neuralLipFullSongMinSeconds = 150.0

func neuralLipWAVSeconds(raw []byte) (float64, error) {
    if !validSingingWAV(raw) { return 0, errors.New("원본 가창 WAV가 손상됐습니다") }
    var byteRate, dataBytes uint32
    for at:=12; at+8<=len(raw); {
        name:=string(raw[at:at+4])
        size:=binary.LittleEndian.Uint32(raw[at+4:at+8])
        at+=8
        if uint64(size)>uint64(len(raw)-at) { return 0,errors.New("WAV 청크 길이가 잘못됐습니다") }
        if name=="fmt " { byteRate=binary.LittleEndian.Uint32(raw[at+8:at+12]) }
        if name=="data" { dataBytes=size }
        at+=int(size)+int(size%2)
    }
    if byteRate==0||dataBytes==0 { return 0,errors.New("WAV 재생 시간을 읽지 못했습니다") }
    seconds:=float64(dataBytes)/float64(byteRate)
    if seconds<=0||seconds>360.05 { return 0,errors.New("신경망 가창은 최대 6분까지 지원합니다") }
    return seconds,nil
}

func neuralLipFFmpegLog(raw string) string {
    raw=strings.TrimSpace(raw)
    if len(raw)>450 { raw=raw[:450] }
    return raw
}

// Wav2Lip 원본 inference.py는 입력 영상의 길이에 따라 생성 길이가
// 잘릴 수 있으므로, 짧은 허가 영상을 가창 길이만큼 반복한 별도 사본을 만든다.
// 실제 영상 프레임만 반복하며 얼굴/가창 신경망 추론은 Wav2Lip이 수행한다.
func prepareNeuralLipFullSongFace(ctx context.Context,face string,seconds float64,dir string)(string,error){
    if seconds<neuralLipFullSongMinSeconds||seconds>360.05 { return "",errors.New("전곡 립싱크 길이는 150~360초여야 합니다") }
    ffmpeg,err:=installedFFmpeg()
    if err!=nil{return "",err}
    output:=filepath.Join(dir,"full-song-face.mp4")
    command:=exec.CommandContext(ctx,ffmpeg,"-hide_banner","-nostdin","-loglevel","error","-n",
        "-stream_loop","-1","-i",face,"-map","0:v:0",
        "-t",strconv.FormatFloat(seconds,'f',3,64),"-an","-sn","-dn",
        "-c:v","libx264","-preset","veryfast","-crf","25","-pix_fmt","yuv420p",
        "-r","25","-movflags","+faststart",output)
    command.Stdin=nil
    var logs bytes.Buffer
    command.Stderr=&logs
    if err=command.Run();err!=nil {
        if ctx.Err()!=nil{return "",errors.New("전곡 실사 영상 준비가 취소됐습니다")}
        return "",fmt.Errorf("FFmpeg 전곡 실사 영상 준비 실패: %s: %w",neuralLipFFmpegLog(logs.String()),err)
    }
    stat,err:=os.Stat(output)
    if err!=nil||stat.Size()<128||stat.Size()>450<<20{return "",errors.New("전곡 립싱크용 격리 영상이 생성되지 않았거나 너무 큽니다")}
    return output,nil
}

// 신경망 추론/원곡 합성 뒤 결과 길이가 실제 가창과 맞는지 확인한다.
// 짧은 영상의 성공을 3~6분 전곡 완료로 오인하지 않는다.
func verifyNeuralLipFullSongVideo(ctx context.Context,video string,seconds float64)error{
    probe,err:=exec.LookPath("ffprobe")
    if err!=nil||!filepath.IsAbs(probe){return errors.New("전곡 MP4 길이 확인에 로컬 FFprobe 설치가 필요합니다")}
    command:=exec.CommandContext(ctx,probe,"-v","error","-show_entries","format=duration",
        "-of","default=noprint_wrappers=1:nokey=1",video)
    command.Stdin=nil
    raw,err:=command.Output()
    if err!=nil{return errors.New("신경망 MP4 영상의 실제 재생 시간을 확인하지 못했습니다")}
    duration,err:=strconv.ParseFloat(strings.TrimSpace(string(raw)),64)
    if err!=nil||duration<seconds-1.5||duration>seconds+1.5 {
        return fmt.Errorf("신경망 MP4가 전곡 길이와 맞지 않습니다: 영상 %.2f초 / 가창 %.2f초",duration,seconds)
    }
    return nil
}
