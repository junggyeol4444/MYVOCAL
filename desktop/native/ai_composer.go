package main

import(
 "context"
 "errors"
 "fmt"
 "os"
 "os/exec"
 "path/filepath"
 "strconv"
 "strings"
)

var requiredArrangementTracks=[]string{
 "Lead","Harmony","Bass","Drums","Piano","Guitar","Strings","Synth",
}

func validateAIComposition(r request)error{
 if err:=requireExistingFile(r.Python);err!=nil{return fmt.Errorf("llama-cli.exe 경로: %w",err)}
 if err:=requireExistingFile(r.Engine);err!=nil{return fmt.Errorf("GGUF 작곡 모델: %w",err)}
 if !strings.EqualFold(filepath.Ext(r.Python),".exe")||
  !strings.EqualFold(filepath.Ext(r.Engine),".gguf"){
  return errors.New("Windows 로컬 llama-cli.exe 및 GGUF 모델이 필요합니다")
 }
 if !strings.EqualFold(filepath.Ext(r.Output),".mid"){
  return errors.New("AI 작곡 결과물은 새 .mid 파일이어야 합니다")
 }
 if err:=preventOverwrite(r.Output);err!=nil{return err}
 if err:=preventOverwrite(r.Output+".score.txt");err!=nil{return fmt.Errorf("편집 악보 보조 파일: %w",err)}
 if len([]rune(strings.TrimSpace(r.Prompt)))<5||len([]rune(r.Prompt))>2400{
  return errors.New("곡 설명·가사 콘셉트는 5~2400자여야 합니다")
 }
 tokens,err:=strconv.Atoi(strings.TrimSpace(r.Option))
 if err!=nil||tokens<512||tokens>4096{return errors.New("AI MIDI 생성 토큰은 512~4096 사이로 지정하세요")}
 if err:=validateGenrePlan(r.GenrePlan);err!=nil{return err}
 return nil
}
func aiCompositionPrompt(description string,genre studioGenrePlan)string{
 var b strings.Builder
 b.WriteString("You are an expert original-song arranger and professional MIDI composer.\n")
 b.WriteString("Output only UTF-8 plain text using the EXACT syntax below; no code fences, no explanations.\n")
 b.WriteString("Compose a completely ORIGINAL and musically coherent 4/4 arrangement, 16 bars, for this song:\n")
 b.WriteString(description)
 b.WriteString("\n")
 b.WriteString(genreInstructions(genre))
 b.WriteString("\n")
 if len(genre.Sections)>0{
  b.WriteString("Section directions, in order: ")
  for _,s:=range genre.Sections{b.WriteString(s.Section);b.WriteString("=");b.WriteString(s.Genre);b.WriteString("; ")}
  b.WriteString("\n")
 }
 b.WriteString("Write 8 INDEPENDENT INSTRUMENT TRACKS. Each section starts on its own line with @ NAME PROGRAM.\n")
 b.WriteString("Exactly these track names and General MIDI program numbers:\n")
 b.WriteString("@ Lead 80\n@ Harmony 48\n@ Bass 33\n@ Drums 0\n@ Piano 0\n@ Guitar 24\n@ Strings 48\n@ Synth 80\n")
 b.WriteString("IMPORTANT: The above is a list of section headings, NOT the final MIDI output. Produce each heading with note lines immediately after it.\n")
 b.WriteString("Each note line must be FOUR space separated ASCII numeric fields: PITCH START_BEAT DURATION_BEATS VELOCITY.\n")
 b.WriteString("Pitch 0-127; start >= 0; duration > 0; velocity 1-127. Tempo 120 BPM, time signature 4/4.\n")
 b.WriteString("Be musically meaningful: bass follows roots, harmony supports melody, drums use MIDI percussion notes (36 kick, 38 snare, 42 hi-hat), piano states chords.\n")
 b.WriteString("Use changing chorus/verse patterns with aligned bar boundaries. Do not print lyrics or chord names in MIDI note rows.\n")
 b.WriteString("Keep all notes <= 64 beats. Provide at least 8 useful note events per each of all eight tracks.\n")
 b.WriteString("OUTPUT BEGINS:\n@ Lead 80\n")
 return b.String()
}
func stripGeneratedMIDI(raw string)string{
 raw=strings.TrimSpace(raw)
 raw=strings.TrimPrefix(raw,"\x60\x60\x60midi")
 raw=strings.TrimPrefix(raw,"\x60\x60\x60text")
 raw=strings.TrimPrefix(raw,"\x60\x60\x60")
 raw=strings.TrimSuffix(raw,"\x60\x60\x60")
 raw=strings.TrimSpace(raw)
 // Reject malformed note rows rather than inventing or silently fixing them.
 lines:=strings.Split(strings.ReplaceAll(raw,"\r\n","\n"),"\n")
 for i,line:=range lines{
  if strings.HasPrefix(strings.TrimSpace(line),"@ Lead ")||
   strings.HasPrefix(strings.TrimSpace(line),"@Lead "){
   return strings.TrimSpace(strings.Join(lines[i:],"\n"))
  }
 }
 return raw
}
func composeEditableMIDI(ctx context.Context,r request,logLine func(string))error{
 if err:=validateAIComposition(r);err!=nil{return err}
 tokens,_:=strconv.Atoi(r.Option)
 prompt:=aiCompositionPrompt(strings.TrimSpace(r.Prompt),r.GenrePlan)
 command:=exec.CommandContext(ctx,r.Python,
  "-m",r.Engine,"-p",prompt,"-n",strconv.Itoa(tokens),
  "--no-display-prompt","--no-show-timings",
  "--single-turn","--color","off")
 command.Env=append(os.Environ(),"HF_HUB_OFFLINE=1","TRANSFORMERS_OFFLINE=1")
 stdout:=&boundedOutput{max:4<<20}
 stderr:=&boundedOutput{max:128<<10}
 command.Stdout=stdout
 command.Stderr=stderr
 logLine("\r\n원본 05: 로컬 GGUF 작곡·편곡으로 편집 가능 악기 트랙 생성 중\r\n")
 err:=command.Run()
 if ctx.Err()!=nil{return errors.New("사용자가 AI MIDI 작곡을 취소했습니다")}
 if err!=nil{
  detail:=stderr.buf.String()
  if len(detail)>600{detail=detail[len(detail)-600:]}
  return fmt.Errorf("로컬 GGUF 작곡 실패: %w / %s",err,detail)
 }
 if stdout.buf.Len()>=stdout.max{return errors.New("모델 출력이 최대 4MB를 초과합니다")}
 notes:=stripGeneratedMIDI(stdout.buf.String())
 tracks,err:=parseMultiTrackMIDI(notes)
 if err!=nil{return fmt.Errorf("GGUF가 편집 가능한 MIDI 악보 형식을 출력하지 못했습니다: %w",err)}
 if len(tracks)!=len(requiredArrangementTracks){
  return fmt.Errorf("원본 기획의 8개 편곡 트랙이 모두 필요합니다. 생성된 트랙 수 %d",len(tracks))
 }
 for i,expected:=range requiredArrangementTracks{
  if !strings.EqualFold(tracks[i].Name,expected){
   return fmt.Errorf("AI 편곡의 %d번째 트랙은 %s여야 합니다. 실제: %s",i+1,expected,tracks[i].Name)
  }
  if len(tracks[i].Notes)<8{
   return fmt.Errorf("%s 트랙은 유효한 음표가 8개 이상 필요합니다",expected)
  }
 }
 if err=ctx.Err();err!=nil{return err}
 // Export actual MIDI and editable note text, not a placeholder audio file.
 p,projectPath:=studioSnapshot()
 bpm:=120
 if projectPath!=""{bpm=p.BPM}
 if err=exportNativeMultiMIDI(ctx,r.Output,bpm,notes);err!=nil{return err}
 output,err:=os.OpenFile(r.Output+".score.txt",os.O_CREATE|os.O_EXCL|os.O_WRONLY,0600)
 if err!=nil{return fmt.Errorf("MIDI는 생성됐지만 편집 악보 TXT 저장 실패: %w",err)}
 _,err=output.Write([]byte(notes+"\n"))
 if err==nil{err=output.Sync()}
 if e:=output.Close();err==nil{err=e}
 if err!=nil{return err}
 _,currentProject:=studioSnapshot()
 if projectPath!=""&&projectPath==currentProject{
  if e:=updateStudioMIDI(notes,0,bpm);e!=nil{
   logLine("\r\nMIDI 생성 완료, 프로젝트 편집 악보 저장 실패: "+e.Error()+"\r\n")
  }
 }
 logLine(fmt.Sprintf("\r\n8개 분리 악기 트랙 편집 MIDI 완성: %s\r\n",r.Output))
 return nil
}
