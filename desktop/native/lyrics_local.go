package main

import (
 "bytes"
 "context"
 "errors"
 "fmt"
 "os"
 "os/exec"
 "path/filepath"
 "strconv"
 "strings"
 "unicode/utf8"
)

type boundedOutput struct{ buf bytes.Buffer; max int }
func (w *boundedOutput)Write(p []byte)(int,error){
 written:=len(p)
 remaining:=w.max-w.buf.Len()
 if remaining>0{
  if len(p)<remaining{remaining=len(p)}
  w.buf.Write(p[:remaining])
 }
 return written,nil
}
func validateNativeLyrics(r request)error{
 if err:=requireExistingFile(r.Python);err!=nil{return fmt.Errorf("로컬 AI 실행 파일: %w",err)}
 if strings.ToLower(filepath.Ext(r.Python))!=".exe"{return errors.New("Windows llama-cli.exe 실행 파일을 선택하세요")}
 if err:=requireExistingFile(r.Engine);err!=nil{return fmt.Errorf("GGUF 모델 파일: %w",err)}
 if strings.ToLower(filepath.Ext(r.Engine))!=".gguf"{return errors.New("GGUF 로컬 모델을 선택하세요")}
 if strings.ToLower(filepath.Ext(r.Output))!=".txt"{return errors.New("가사 결과물은 새 TXT 파일이어야 합니다")}
 if err:=preventOverwrite(r.Output);err!=nil{return err}
 prompt:=strings.TrimSpace(r.Prompt)
 if len([]rune(prompt))<5||len([]rune(prompt))>2000{return errors.New("한국어 작사 주제는 5~2000자로 입력하세요")}
 tokens,err:=strconv.Atoi(strings.TrimSpace(r.Option))
 if err!=nil||tokens<128||tokens>2048{return errors.New("생성 토큰은 128~2048 사이입니다")}
 return nil
}
func localLyricsPrompt(concept string)string{
 return "너는 한국어 대중음악 작사가다. 완전히 새로운 노래 가사를 작성하라.\n"+
  "출력은 오직 한국어 가사만 사용하고, [Intro], [Verse 1], [Pre-Chorus], [Chorus], [Verse 2], [Bridge], [Final Chorus], [Outro]의 구간을 구분하라.\n"+
  "후렴은 기억하기 쉽고 전체 곡에 감정적 발전이 있어야 한다. 실제 곡으로 부를 수 있는 짧은 문장과 자연스러운 한국어를 사용하라.\n"+
  "실존하는 노래나 가사를 베끼지 않는다. 설명·사족·모델 정보는 쓰지 않는다.\n"+
  "곡 주제와 콘셉트: "+concept+"\n\n[Intro]\n"
}
func runLocalLyrics(ctx context.Context,r request,logLine func(string))error{
 if err:=validateNativeLyrics(r);err!=nil{return err}
 tokens,_:=strconv.Atoi(strings.TrimSpace(r.Option))
 cmd:=exec.CommandContext(ctx,r.Python,
  "-m",r.Engine,"-p",localLyricsPrompt(strings.TrimSpace(r.Prompt)),
  "-n",strconv.Itoa(tokens),"--no-display-prompt","--no-show-timings",
  "--single-turn","--color","off")
 cmd.Env=append(os.Environ(),"HF_HUB_OFFLINE=1","TRANSFORMERS_OFFLINE=1")
 stdout:=&boundedOutput{max:2<<20}
 stderr:=&boundedOutput{max:128<<10}
 cmd.Stdout=stdout;cmd.Stderr=stderr
 logLine("\r\n로컬 GGUF 한국어 작사 생성 중 (네트워크 서버 미사용)\r\n")
 err:=cmd.Run()
 if ctx.Err()!=nil{return errors.New("사용자가 한국어 작사를 취소했습니다")}
 if err!=nil{
  message:=stderr.buf.String()
  if len(message)>800{message=message[len(message)-800:]}
  return fmt.Errorf("llama-cli 모델 추론 실패: %w / %s",err,message)
 }
 lyric:=strings.TrimSpace(stdout.buf.String())
 if !utf8.ValidString(lyric)||len([]rune(lyric))<20{return errors.New("로컬 모델의 한국어 가사 출력이 짧거나 인코딩이 잘못되었습니다")}
 if stdout.buf.Len()>=stdout.max{return errors.New("모델 출력이 2MB를 넘어 중단했습니다")}
 output,err:=os.OpenFile(r.Output,os.O_WRONLY|os.O_CREATE|os.O_EXCL,0600)
 if err!=nil{return fmt.Errorf("이미 존재하는 가사 파일을 덮어쓰지 않습니다: %w",err)}
 _,err=output.Write([]byte(lyric+"\n"))
 if err==nil{err=output.Sync()}
 if closeErr:=output.Close();err==nil{err=closeErr}
 if err!=nil{return fmt.Errorf("가사 TXT 파일 저장 실패: %w",err)}
 logLine(fmt.Sprintf("\r\n한국어 AI 가사 TXT 저장 완료: %s (%d자)\r\n",r.Output,len([]rune(lyric))))
 return nil
}
