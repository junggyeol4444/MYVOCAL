package main

import (
 "context"
 "encoding/json"
 "fmt"
 "os"
 "path/filepath"
 "strings"
)

type separateInstrument struct{
 Name string
 Program int
 Filename string
}
type producedStem struct {
 File string
 Source string
}
func instrumentStemFilename(index int)string{
 return fmt.Sprintf("05-instrument-%02d.wav",index+1)
}
func prepareInstrumentStemTracks(midiPath string)(int,[]midiInstrumentTrack,error){
 notation,bpm,program,err:=readExistingMIDI(midiPath)
 if err!=nil{return 0,nil,err}
 if strings.HasPrefix(strings.TrimSpace(notation),"@"){
  tracks,err:=parseMultiTrackMIDI(notation)
  return bpm,tracks,err
 }
 notes,err:=parseMidiNotes(notation)
 if err!=nil{return 0,nil,err}
 return bpm,[]midiInstrumentTrack{{Name:"Melody",Program:byte(program),Notes:notes}},nil
}
func createSeparateInstrumentStems(ctx context.Context,r fullSongRequest,
 dir string,sampleRate,channels int,frames int64,logLine func(string))([]producedStem,error){
 bpm,tracks,err:=prepareInstrumentStemTracks(r.MIDI)
 if err!=nil{return nil,fmt.Errorf("독립 악기 MIDI 악보: %w",err)}
 if len(tracks)==0{return nil,fmt.Errorf("독립 악기 악보가 비어 있습니다")}
 entries:=make([]producedStem,0,len(tracks)+1)
 manifest:=make([]separateInstrument,0,len(tracks))
 for i,track:=range tracks{
  if ctx.Err()!=nil{return nil,ctx.Err()}
  logLine(fmt.Sprintf("\r\n독립 악기 트랙 %d/%d: %s (MIDI program %d)\r\n",
   i+1,len(tracks),track.Name,track.Program))
  var notation strings.Builder
  for _,note:=range track.Notes{
   fmt.Fprintf(&notation,"%d %.6f %.6f %d\n",note.note,
    float64(note.start)/midiPPQ,float64(note.end-note.start)/midiPPQ,note.velocity)
  }
  single,err:=buildMidi(bpm,int(track.Program),notation.String())
  if err!=nil{return nil,err}
  inputMIDI:=filepath.Join(dir,fmt.Sprintf("instrument-%02d.mid",i+1))
  if err=os.WriteFile(inputMIDI,single,0600);err!=nil{return nil,err}
  rawWAV:=filepath.Join(dir,fmt.Sprintf("instrument-%02d-raw.wav",i+1))
  task:=request{Task:taskSoundFont,Python:r.Python,Engine:r.FluidSynthDLL,
   Input:inputMIDI,Auxiliary:r.SoundFont,Output:rawWAV,Prompt:"0.2",Option:"44100"}
  if err=executeJob(ctx,task,logLine);err!=nil{return nil,err}
  alignedWAV:=filepath.Join(dir,fmt.Sprintf("instrument-%02d-full.wav",i+1))
  if err=matchSongPCM(ctx,r.FFmpeg,rawWAV,alignedWAV,sampleRate,channels,frames,logLine);err!=nil{
   return nil,fmt.Errorf("독립 악기 %s 오디오 길이 동기화: %w",track.Name,err)
  }
  name:=instrumentStemFilename(i)
  entries=append(entries,producedStem{File:name,Source:alignedWAV})
  manifest=append(manifest,separateInstrument{Name:track.Name,Program:int(track.Program),Filename:name})
 }
 manifestData,err:=json.MarshalIndent(struct{
  Format string
  Version int
  Instruments []separateInstrument
 }{Format:"MYVOCAL_INSTRUMENT_TRACKS",Version:1,Instruments:manifest},"","  ")
 if err!=nil{return nil,err}
 manifestPath:=filepath.Join(dir,"instrument-tracks.json")
 if err=os.WriteFile(manifestPath,manifestData,0600);err!=nil{return nil,err}
 entries=append(entries,producedStem{File:"05-instruments.json",Source:manifestPath})
 return entries,nil
}
