package main

import (
 "context"
 "errors"
 "fmt"
 "os"
 "path/filepath"
 "strconv"
 "strings"
)

// One local handoff: trained DiffSinger checkpoint and song score -> real
// neural vocal WAV; user-owned MIDI/SF2 -> instrumental WAV -> optional RVC
// voice timbre -> 2D character lip sync -> H.264 MP4.
// This is not autonomous AI composition or 3D video generation.
type fullSongRequest struct {
 Python string
 FFmpeg string
 DiffSingerRoot string
 ScoreDS string
 Experiment string
 MIDI string
 SoundFont string
 FluidSynthDLL string
 Portrait string
 Alignment string
 Output string
 VoiceModel string
 RVCRoot string
 Storyboard string
 Style string
 Pitch int
 RightsConfirmed bool
}

func validateFullSongRequest(r fullSongRequest)error{
 if !r.RightsConfirmed{return errors.New("본인 음색·악보·이미지의 학습·생성 이용 권한을 확인하세요")}
 for _,field:=range []string{r.Python,r.FFmpeg,r.DiffSingerRoot,r.ScoreDS,
  r.Experiment,r.MIDI,r.SoundFont,r.FluidSynthDLL,r.Portrait,r.Alignment,
  r.Output,r.VoiceModel,r.RVCRoot,r.Storyboard,r.Style}{
  if strings.ContainsAny(field,"\x00\r\n"){return errors.New("입력 경로 또는 설정에 제어 문자가 포함돼 있습니다")}
 }
 for title,path:=range map[string]string{
  "Python.exe":r.Python,"FFmpeg.exe":r.FFmpeg,"악보 DS":r.ScoreDS,
  "음악 MIDI":r.MIDI,"SoundFont":r.SoundFont,"FluidSynth DLL":r.FluidSynthDLL,
  "주인공 이미지":r.Portrait,
 }{
  if err:=requireExistingFile(path);err!=nil{return fmt.Errorf("%s: %w",title,err)}
 }
 if err:=requireDirectory(r.DiffSingerRoot);err!=nil{return fmt.Errorf("DiffSinger 설치: %w",err)}
 if r.Alignment!=""{if err:=requireExistingFile(r.Alignment);err!=nil{return fmt.Errorf("가사 싱크 시간표: %w",err)}}
 if !strings.EqualFold(filepath.Ext(r.Output),".mp4"){return errors.New("음악·MV 출력 파일은 .mp4여야 합니다")}
 if err:=preventOverwrite(r.Output);err!=nil{return err}
 if _,err:=os.Lstat(songTracksFolder(r.Output));err==nil{return errors.New("같은 이름의 음악 개별 트랙 폴더가 이미 존재합니다. 새 MP4 이름을 지정하세요")}else if !os.IsNotExist(err){return err}
 if r.Pitch< -24||r.Pitch>24{return errors.New("음색 변환 반음 이동: -24~24")}
 if r.VoiceModel!=""{
  if err:=requireExistingFile(r.VoiceModel);err!=nil{return err}
  if !strings.EqualFold(filepath.Ext(r.VoiceModel),".pth"){return errors.New("사용자 음색 모델은 .pth 파일이어야 합니다")}
  if err:=requireDirectory(r.RVCRoot);err!=nil{return fmt.Errorf("RVC 설치: %w",err)}
 }
 switch r.Style{case "static","performance","story","mixed":default:
  return errors.New("MV 연출은 static/performance/story/mixed 중 선택하세요")}
 if r.Storyboard!=""{
  if _,err:=openNativeStoryboard(r.Storyboard);err!=nil{return err}
 }
 // Reuse the existing native task validation for both official local engines.
 vocal:=request{Task:taskDiffSinger,Python:r.Python,Engine:r.DiffSingerRoot,
  Input:r.ScoreDS,Auxiliary:r.Experiment,Output:r.Output+".wav",
  Prompt:"confirmed"}
 if _,err:=prepareRequest(vocal);err!=nil{return fmt.Errorf("DiffSinger 입력: %w",err)}
 music:=request{Task:taskSoundFont,Python:r.Python,Engine:r.FluidSynthDLL,
  Input:r.MIDI,Auxiliary:r.SoundFont,Output:r.Output+".backing.wav",
  Prompt:"0.2",Option:"44100"}
 if _,err:=prepareRequest(music);err!=nil{return fmt.Errorf("악기 반주 입력: %w",err)}
 if _,err:=locateWorker("viseme_2d_worker.py");err!=nil{return err}
 if _,err:=locateWorker("midi_soundfont_worker.py");err!=nil{return err}
 return nil
}

func runFullSong(ctx context.Context,r fullSongRequest,logLine func(string))error{
 if err:=validateFullSongRequest(r);err!=nil{return err}
 work,err:=os.MkdirTemp(filepath.Dir(r.Output),".myvocal-full-song-*")
 if err!=nil{return err}
 defer os.RemoveAll(work)
 logLine("\r\n[1/5] 학습된 DiffSinger로 한국어 악보 신경망 가창 생성\r\n")
 rawVocal:=filepath.Join(work,"neural-vocal.wav")
 vocal:=request{Task:taskDiffSinger,Python:r.Python,Engine:r.DiffSingerRoot,
  Input:r.ScoreDS,Auxiliary:r.Experiment,Output:rawVocal,Prompt:"confirmed"}
 if err=executeJob(ctx,vocal,logLine);err!=nil{return fmt.Errorf("한국어 AI 가창 생성: %w",err)}
 logLine("\r\n[2/5] 실제 MIDI+SoundFont 반주 합성\r\n")
 rawBacking:=filepath.Join(work,"instrumental.wav")
 backingReq:=request{Task:taskSoundFont,Python:r.Python,Engine:r.FluidSynthDLL,
  Input:r.MIDI,Auxiliary:r.SoundFont,Output:rawBacking,Prompt:"0.2",Option:"44100"}
 if err=executeJob(ctx,backingReq,logLine);err!=nil{return fmt.Errorf("악기별 반주 생성: %w",err)}
 // FFmpeg normalizes neural inference and SoundFont timing to a common
 // exact-length PCM timeline. Source assets are never modified.
 backing,err:=openNativePCM(rawBacking)
 if err!=nil{return fmt.Errorf("SoundFont PCM 16bit 읽기: %w",err)}
 rate,channels,frames:=backing.rate,backing.channels,backing.frames
 backing.file.Close()
 if frames<=0||float64(frames)/float64(rate)>360{return errors.New("반주 길이는 0~360초여야 합니다")}
 logLine("\r\n[3/5] 신경망 보컬 샘플레이트·채널·곡 길이 맞춤\r\n")
 aligned:=filepath.Join(work,"vocal-timed.wav")
 if err=matchSongPCM(ctx,r.FFmpeg,rawVocal,aligned,rate,channels,frames,logLine);err!=nil{return err}
 alignment:=r.Alignment
 if alignment==""{
  alignment=filepath.Join(work,"diffsinger-phoneme-alignment.json")
  logLine("\r\nDS 악보의 음소 시간에서 립싱크 타임라인 생성 (실제 발음 정밀 동기화와 구별)\r\n")
  if err=publishDSAlignment(r.ScoreDS,alignment,float64(frames)/float64(rate));err!=nil{return err}
 }
 if err=validateMVAlignment(alignment,float64(frames)/float64(rate));err!=nil{
  return fmt.Errorf("보컬 가사 시간표가 실제 곡 길이와 다릅니다: %w",err)
 }
 finalVocal:=aligned
 if r.VoiceModel!=""{
  logLine("\r\n[4/5] 학습된 내 음색 모델로 전곡 가창 변환\r\n")
  converted:=filepath.Join(work,"my-voice-raw.wav")
  modelReq:=request{Task:taskRVCConvert,Python:r.Python,Engine:r.RVCRoot,
   Input:aligned,Auxiliary:r.VoiceModel,Output:converted,Option:strconv.Itoa(r.Pitch)}
  if err=executeJob(ctx,modelReq,logLine);err!=nil{return fmt.Errorf("학습한 목소리로 전곡 변환: %w",err)}
  finalVocal=filepath.Join(work,"my-voice-aligned.wav")
  if err=matchSongPCM(ctx,r.FFmpeg,converted,finalVocal,rate,channels,frames,logLine);err!=nil{return err}
 }
 logLine("\r\n[4/5] 음색 및 스토리보드를 뮤직비디오에 연결\r\n")
 mv:=mvProductionRequest{
  Python:r.Python,FFmpeg:r.FFmpeg,Portrait:r.Portrait,
  Vocal:finalVocal,Accompaniment:rawBacking,Alignment:alignment,
  Storyboard:r.Storyboard,Output:r.Output,Style:r.Style,
 }
 logLine("\r\n[5/5] 믹싱·가사 립싱크·장면 연출·완성 MP4 자동 제작\r\n")
 if err=runMusicMVProduction(ctx,mv,logLine);err!=nil{return err}
 // Preserve editable vocal/instrumental/mix as separate, newly created files.
 mixPath:=filepath.Join(work,"full-song-mix.wav")
 if err=mixNativePCM(ctx,request{Task:taskMixWAV,Input:rawBacking,Auxiliary:finalVocal,
  Output:mixPath,Option:"100"},logLine);err!=nil{return fmt.Errorf("완성 MP4는 생성했지만 분리 믹스 WAV 작성 실패: %w",err)}
 if err=publishSongTracks(r.Output,finalVocal,rawBacking,mixPath,alignment);err!=nil{
  return fmt.Errorf("완성 MP4는 생성했지만 개별 트랙 출력을 완료하지 못했습니다: %w",err)
 }
 logLine("\r\nDiffSinger + SoundFont + 2D MV 및 편집용 3개 WAV 제작: "+r.Output+"\r\n")
 return nil
}

func songTracksFolder(output string)string{
 return strings.TrimSuffix(output,filepath.Ext(output))+".tracks"
}
func publishSongTracks(output,vocal,backing,mixed,alignment string)error{
 folder:=songTracksFolder(output)
 if err:=os.Mkdir(folder,0700);err!=nil{return err}
 // All files are inside our newly created directory and on the same local
 // volume as the scratch directory. Exclusive hard links never overwrite.
 targets:=[]struct{source,name string}{
  {vocal,"01-vocal.wav"},
  {backing,"02-instrumental.wav"},
  {mixed,"03-full-mix.wav"},
  {alignment,"04-phoneme-alignment.json"},
 }
 for _,entry:=range targets{
  if err:=requireExistingFile(entry.source);err!=nil{return err}
  if err:=os.Link(entry.source,filepath.Join(folder,entry.name));err!=nil{
   return fmt.Errorf("트랙 %s 출력 실패: %w",entry.name,err)
  }
 }
 return nil
}
