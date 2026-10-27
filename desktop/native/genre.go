package main

import (
 "errors"
 "fmt"
 "strings"
)

var originalMusicGenres=[]string{
 "K-Pop","Ballad","Rock","Pop","R&B","Hip-Hop","EDM","House",
 "Techno","Metal","Punk","Jazz","City Pop","J-Pop","Anime Song",
 "Vocal Synth","Orchestral","Cinematic","Acoustic","Lo-fi","Synthwave",
}
var originalSongSections=[]string{
 "Intro","Verse","Pre-Chorus","Chorus","Bridge","Final","Outro",
}
type studioGenreWeight struct {
 Name string
 Percent int
}
type studioGenreSection struct {
 Section string
 Genre string
}
type studioGenrePlan struct {
 Mode string
 Mix []studioGenreWeight
 Sections []studioGenreSection
}
func genreNameAllowed(name string)bool{
 for _,g:=range originalMusicGenres{if strings.EqualFold(g,name){return true}}
 return false
}
func validateGenrePlan(p studioGenrePlan)error{
 if p.Mode==""&&len(p.Mix)==0&&len(p.Sections)==0{return nil} // existing projects
 if p.Mode!="manual"&&p.Mode!="ai_auto"{return errors.New("장르 모드는 manual 또는 ai_auto여야 합니다")}
 if len(p.Mix)>len(originalMusicGenres)||len(p.Sections)>32{return errors.New("장르 또는 구간 수가 허용 범위를 넘었습니다")}
 if p.Mode=="ai_auto"&&len(p.Mix)>0{return errors.New("AI AUTO 모드에서는 수동 장르 비율을 동시에 지정할 수 없습니다")}
 total:=0
 seen:=map[string]bool{}
 for _,x:=range p.Mix{
  if !genreNameAllowed(x.Name){return fmt.Errorf("기획안 목록에 없는 음악 장르입니다: %s",x.Name)}
  key:=strings.ToLower(x.Name)
  if seen[key]{return fmt.Errorf("장르가 중복되었습니다: %s",x.Name)}
  seen[key]=true
  if x.Percent<1||x.Percent>100{return fmt.Errorf("장르 %s 비율은 1~100%%입니다",x.Name)}
  total+=x.Percent
 }
 if p.Mode=="manual"&&total!=100{return fmt.Errorf("장르 혼합 비율 합계는 100%%여야 합니다 (현재 %d%%)",total)}
 for _,s:=range p.Sections{
  if len([]rune(s.Section))==0||len([]rune(s.Section))>40||
   len([]rune(s.Genre))==0||len([]rune(s.Genre))>120||
   strings.ContainsAny(s.Section+s.Genre,"\r\n\x00"){
   return errors.New("구간별 장르 이름 또는 구간 설정이 유효하지 않습니다")
  }
 }
 return nil
}
func defaultGenrePlan()studioGenrePlan{
 return studioGenrePlan{Mode:"manual",Mix:[]studioGenreWeight{{Name:"K-Pop",Percent:100}}}
}
func genrePlanSummary(p studioGenrePlan)string{
 if p.Mode=="ai_auto"{return "AI AUTO"}
 if len(p.Mix)==0{return ""}
 v:=make([]string,0,len(p.Mix))
 for _,entry:=range p.Mix{v=append(v,fmt.Sprintf("%s %d%%",entry.Name,entry.Percent))}
 return strings.Join(v,", ")
}
func genreSectionForIndex(p studioGenrePlan,index,total int)studioGenreSection{
 if len(p.Sections)==0||total<1{return studioGenreSection{}}
 if index<0{index=0}
 if index>=total{index=total-1}
 slot:=index*len(p.Sections)/total
 if slot>=len(p.Sections){slot=len(p.Sections)-1}
 return p.Sections[slot]
}
func genreInstructions(p studioGenrePlan)string{
 if p.Mode=="ai_auto"{
  return "AI AUTO: Select genre arrangement and emotional structure based on the user's song idea (no reference-song copying)."
 }
 if p.Mode!="manual"||len(p.Mix)==0{return ""}
 parts:=make([]string,0,len(p.Mix))
 for _,g:=range p.Mix{parts=append(parts,fmt.Sprintf("%s %d%%",g.Name,g.Percent))}
 return "Genre blend: "+strings.Join(parts,"; ")+"."
}
func promptWithGenre(p studioGenrePlan,source string)string{
 source=strings.TrimSpace(source)
 base:=genreInstructions(p)
 if base==""{return source}
 var b strings.Builder
 b.WriteString(source)
 b.WriteString("\n")
 b.WriteString(base)
 if len(p.Sections)>0{
  b.WriteString("\nSong section arrangement:")
  for _,section:=range p.Sections{
   b.WriteString(" ");b.WriteString(section.Section);b.WriteString(": ")
   b.WriteString(section.Genre);b.WriteString(";")
  }
 }
 return b.String()
}
func longSegmentGenrePrompt(base string,p studioGenrePlan,index,total int)string{
 if len(p.Sections)==0{return base}
 section:=genreSectionForIndex(p,index,total)
 if section.Section==""{return base}
 return base+"\nCurrent section: "+section.Section+"; produce instrumentation/style "+section.Genre+
  ". Maintain continuity with previous audio and preserve genre blend."
}
func parseGenreBlend(source string)([]studioGenreWeight,error){
 var result []studioGenreWeight
 for row,line:=range strings.Split(strings.ReplaceAll(source,"\r\n","\n"),"\n"){
  line=strings.TrimSpace(line)
  if line==""{continue}
  // One line, one genre: "Ballad | 50".
  fields:=strings.Split(line,"|")
  if len(fields)!=2{return nil,fmt.Errorf("%d행: 장르명|비율 형식으로 입력하세요",row+1)}
  name:=strings.TrimSpace(fields[0])
  percent,err:=parsePercent(strings.TrimSpace(fields[1]))
  if err!=nil{return nil,fmt.Errorf("%d행: %w",row+1,err)}
  result=append(result,studioGenreWeight{Name:name,Percent:percent})
 }
 return result,nil
}
func parsePercent(s string)(int,error){
 s=strings.TrimSuffix(strings.TrimSpace(s),"%")
 var number int
 if _,err:=fmt.Sscanf(s,"%d",&number);err!=nil{return 0,errors.New("비율은 1~100의 정수입니다")}
 if fmt.Sprintf("%d",number)!=s{return 0,errors.New("비율은 정수만 허용합니다")}
 return number,nil
}
func parseSectionGenres(source string)([]studioGenreSection,error){
 var result []studioGenreSection
 for row,line:=range strings.Split(strings.ReplaceAll(source,"\r\n","\n"),"\n"){
  line=strings.TrimSpace(line)
  if line==""{continue}
  pair:=strings.Split(line,"|")
  if len(pair)!=2{return nil,fmt.Errorf("%d행: 곡구간|장르 형식이 필요합니다",row+1)}
  result=append(result,studioGenreSection{Section:strings.TrimSpace(pair[0]),Genre:strings.TrimSpace(pair[1])})
 }
 return result,nil
}
