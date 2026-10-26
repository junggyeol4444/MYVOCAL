package main

import (
 "crypto/rand"
 "encoding/hex"
 "encoding/json"
 "errors"
 "fmt"
 "os"
 "path/filepath"
 "unicode"
 "strings"
 "sync"
 "time"
)

const studioProjectFormat = "MYVOCAL-STUDIO-NATIVE"
const studioProjectVersion = 1

type studioAsset struct {
 Kind string
 Task string
 Path string
 AddedAt string
}
type studioProject struct {
 Format string
 Version int
 ID string
 Name string
 Concept string
 Lyrics string
 MIDINotes string
 MIDIProgram int
 Genres string
 BPM int
 Key string
 VoiceModel string
 Character string
 VideoStyle string
 CreatedAt string
 UpdatedAt string
 Assets []studioAsset
}
var (
 studioMu sync.Mutex
 studioCurrent studioProject
 studioPath string
)
func sanitizeStudioTitle(name string)string {
 var b strings.Builder
 for _,r:=range name {if unicode.IsLetter(r)||unicode.IsDigit(r)||unicode.IsSpace(r)||r=='.'||r=='_'||r=='('||r==')'||r=='-' {b.WriteRune(r)}else{b.WriteByte('_')}}
 return b.String()
}

func nativeProjectsRoot() (string,error) {
 base:=os.Getenv("LOCALAPPDATA")
 if base=="" {
  profile:=os.Getenv("USERPROFILE")
  if profile=="" {return "",errors.New("Windows 사용자 홈 디렉터리를 찾지 못했습니다")}
  base=filepath.Join(profile,"AppData","Local")
 }
 base,err:=filepath.Abs(base)
 if err!=nil{return "",err}
 return filepath.Join(base,"MYVOCAL Studio","Projects"),nil
}
func createStudioProject(name string) (studioProject,error) {
 name=strings.TrimSpace(name)
 if name==""{name="새 음악 프로젝트"}
 if len([]rune(name))>120{return studioProject{},errors.New("프로젝트 이름은 120자 이하여야 합니다")}
 root,err:=nativeProjectsRoot();if err!=nil{return studioProject{},err}
 if err=os.MkdirAll(root,0700);err!=nil{return studioProject{},err}
 var token [10]byte
 if _,err=rand.Read(token[:]);err!=nil{return studioProject{},err}
 id:=hex.EncodeToString(token[:])
 title:=sanitizeStudioTitle(name)
 title=strings.Trim(title," .")
 if title==""{title="MYVOCAL"}
 if len([]rune(title))>48{title=string([]rune(title)[:48])}
 folder:=filepath.Join(root,title+"-"+id)
 if err=os.Mkdir(folder,0700);err!=nil{return studioProject{},err}
 now:=time.Now().Format(time.RFC3339)
 p:=studioProject{
  Format:studioProjectFormat,Version:studioProjectVersion,ID:id,
  Name:name,Genres:"K-Pop 100%",BPM:120,Key:"C major",
  CreatedAt:now,UpdatedAt:now,Assets:[]studioAsset{},
 }
 path:=filepath.Join(folder,"project.json")
 if err=writeProjectFile(path,p,true);err!=nil{return studioProject{},err}
 studioMu.Lock();studioCurrent=p;studioPath=path;studioMu.Unlock()
 return p,nil
}
func validateStudioProject(p studioProject)error{
 if p.Format!=studioProjectFormat||p.Version!=studioProjectVersion{return errors.New("이 파일은 MYVOCAL 네이티브 프로젝트가 아닙니다")}
 if len(p.ID)<10||len(p.ID)>100||len([]rune(strings.TrimSpace(p.Name)))==0||len([]rune(p.Name))>120{
  return errors.New("프로젝트 ID 또는 이름이 잘못되었습니다")
 }
 if p.BPM<20||p.BPM>320{return errors.New("BPM은 20~320이어야 합니다")}
 if p.MIDIProgram<0||p.MIDIProgram>127||len(p.MIDINotes)>500000{return errors.New("프로젝트 MIDI 입력 범위 오류")}
 if len(p.Concept)>10000||len(p.Lyrics)>300000||len(p.Genres)>5000||len(p.Key)>100||
 len(p.VoiceModel)>32767||len(p.Character)>1000||len(p.VideoStyle)>1000||
 len(p.Assets)>10000{return errors.New("프로젝트 입력 또는 자산 목록이 허용 범위를 초과합니다")}
 for _,a:=range p.Assets {
  if len(a.Path)>32767||len(a.Kind)>128||len(a.Task)>128{return errors.New("프로젝트 자산 항목이 너무 큽니다")}
 }
 return nil
}
func writeProjectFile(path string,p studioProject,newOnly bool)error{
 if err:=validateStudioProject(p);err!=nil{return err}
 if filepath.Base(path)!="project.json"||!filepath.IsAbs(path){return errors.New("프로젝트 파일의 경로가 잘못되었습니다")}
 if err:=requireDirectory(filepath.Dir(path));err!=nil{return err}
 body,err:=json.MarshalIndent(p,"","  ")
 if err!=nil{return err}
 if len(body)>12<<20{return errors.New("프로젝트 파일이 너무 큽니다")}
 if newOnly{
  out,e:=os.OpenFile(path,os.O_WRONLY|os.O_CREATE|os.O_EXCL,0600)
  if e!=nil{return e}
  _,e=out.Write(body)
  if syncErr:=out.Sync();e==nil{e=syncErr}
  if closeErr:=out.Close();e==nil{e=closeErr}
  return e
 }
 tmp,err:=os.CreateTemp(filepath.Dir(path),".myvocal-project-*.json")
 if err!=nil{return err}
 temp:=tmp.Name()
 defer os.Remove(temp)
 if err=tmp.Chmod(0600);err==nil{_,err=tmp.Write(body)}
 if err==nil{err=tmp.Sync()}
 if cErr:=tmp.Close();err==nil{err=cErr}
 if err!=nil{return err}
 // This is a save of this app's own project.json only, never an imported asset.
 if err=os.Rename(temp,path);err!=nil{return fmt.Errorf("프로젝트 저장 실패: %w",err)}
 return nil
}
func openStudioProject(path string)(studioProject,error){
 absolute,err:=filepath.Abs(path);if err!=nil{return studioProject{},err}
 if filepath.Base(absolute)!="project.json"{return studioProject{},errors.New("project.json 파일을 선택해야 합니다")}
 stat,err:=os.Lstat(absolute)
 if err!=nil||!stat.Mode().IsRegular()||stat.Size()>12<<20{return studioProject{},errors.New("프로젝트 파일을 읽을 수 없습니다")}
 raw,err:=os.ReadFile(absolute);if err!=nil{return studioProject{},err}
 var p studioProject
 if err=json.Unmarshal(raw,&p);err!=nil{return studioProject{},fmt.Errorf("프로젝트 JSON 오류: %w",err)}
 if err=validateStudioProject(p);err!=nil{return studioProject{},err}
 studioMu.Lock();studioCurrent=p;studioPath=absolute;studioMu.Unlock()
 return p,nil
}
func studioSnapshot()(studioProject,string){
 studioMu.Lock();defer studioMu.Unlock()
 return studioCurrent,studioPath
}
func updateStudioProject(p studioProject)error{
 studioMu.Lock();defer studioMu.Unlock()
 if studioPath==""{return errors.New("먼저 프로젝트를 생성하거나 열어야 합니다")}
 if p.ID!=studioCurrent.ID||p.CreatedAt!=studioCurrent.CreatedAt{return errors.New("다른 프로젝트 내용으로 저장할 수 없습니다")}
 p.Format=studioProjectFormat;p.Version=studioProjectVersion
 p.Assets=studioCurrent.Assets
 p.UpdatedAt=time.Now().Format(time.RFC3339)
 if err:=writeProjectFile(studioPath,p,false);err!=nil{return err}
 studioCurrent=p
 return nil
}
func saveStudioProject()error{
 studioMu.Lock();defer studioMu.Unlock()
 if studioPath==""{return errors.New("저장할 프로젝트를 먼저 생성하거나 열어야 합니다")}
 p:=studioCurrent
 p.UpdatedAt=time.Now().Format(time.RFC3339)
 if err:=writeProjectFile(studioPath,p,false);err!=nil{return err}
 studioCurrent=p
 return nil
}
func recordStudioOutput(task int,path string)error{
 if task<0||task>=len(taskNames){return errors.New("알 수 없는 작업")}
 studioMu.Lock();defer studioMu.Unlock()
 if studioPath==""{return nil}
 abs,err:=filepath.Abs(path);if err!=nil{return err}
 stat,err:=os.Lstat(abs);if err!=nil{return err}
 if !stat.Mode().IsRegular()&&!stat.IsDir(){return errors.New("결과 경로가 파일이나 폴더가 아닙니다")}
 kind:="audio"
 if task==taskLipSync{kind="video"}
 if task==taskRVC{kind="voice_model"}
 if task==taskDemucs{kind="stems"}
 p:=studioCurrent
 for _,a:=range p.Assets {if strings.EqualFold(a.Path,abs)&&a.Task==taskNames[task]{return nil}}
 p.Assets=append(p.Assets,studioAsset{Kind:kind,Task:taskNames[task],Path:abs,AddedAt:time.Now().Format(time.RFC3339)})
 p.UpdatedAt=time.Now().Format(time.RFC3339)
 if err=writeProjectFile(studioPath,p,false);err!=nil{return err}
 studioCurrent=p
 return nil
}

func importStudioAsset(path string)error{
 abs,err:=filepath.Abs(path)
 if err!=nil{return err}
 if err=requireExistingFile(abs);err!=nil{return err}
 ext:=strings.ToLower(filepath.Ext(abs))
 kind:=""
 switch ext {
 case ".wav",".flac",".mp3",".ogg":kind="audio"
 case ".pth",".ckpt",".safetensors",".index":kind="voice_model"
 case ".png",".jpg",".jpeg",".webp",".bmp":kind="image"
 case ".vrm",".glb",".gltf",".fbx":kind="character"
 case ".mp4",".mov",".webm",".mkv":kind="video"
 case ".mid",".midi",".json",".ds":kind="score"
 case ".sf2",".sf3":kind="soundfont"
 default:return fmt.Errorf("프로젝트에 지원되지 않는 자산 확장자입니다: %s",ext)
 }
 studioMu.Lock()
 defer studioMu.Unlock()
 if studioPath==""{return errors.New("자산을 추가할 프로젝트를 먼저 만들어야 합니다")}
 p:=studioCurrent
 for _,a:=range p.Assets {if strings.EqualFold(a.Path,abs){return nil}}
 if len(p.Assets)>=10000{return errors.New("프로젝트 등록 자산이 10000개를 넘었습니다")}
 p.Assets=append(p.Assets,studioAsset{
  Kind:kind,Task:"사용자 등록",Path:abs,AddedAt:time.Now().Format(time.RFC3339),
 })
 p.UpdatedAt=time.Now().Format(time.RFC3339)
 if err=writeProjectFile(studioPath,p,false);err!=nil{return err}
 studioCurrent=p
 return nil
}

func updateStudioMIDI(notes string,program,bpm int)error{
 studioMu.Lock()
 defer studioMu.Unlock()
 if studioPath==""{return errors.New("MIDI 정보를 저장할 프로젝트가 없습니다")}
 p:=studioCurrent
 p.MIDINotes=notes;p.MIDIProgram=program;p.BPM=bpm
 p.UpdatedAt=time.Now().Format(time.RFC3339)
 if err:=writeProjectFile(studioPath,p,false);err!=nil{return err}
 studioCurrent=p
 return nil
}
