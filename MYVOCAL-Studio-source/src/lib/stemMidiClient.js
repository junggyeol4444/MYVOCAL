// Installed offline Basic Pitch inference, not an invented/generated MIDI file.
import {parseMidiFile} from './midiFile.js';
export async function transcribeStemToMidi(stem,python,{session=window.__MYVOCAL_SESSION_KEY,request=fetch,signal}={}){
 if(!(stem instanceof Blob)||stem.size<44||stem.size>72*1024*1024)throw Error('신경망 변환용 악기 WAV 크기가 올바르지 않습니다.');
 if(typeof python!=='string'||!/(?:^|[/\\])python\.exe$/i.test(python)||python.length>1024)throw Error('설치된 Basic Pitch Python.exe 경로를 입력하세요.');
 if(typeof session!=='string'||!session)throw Error('Windows EXE 세션이 필요합니다.');
 if(signal?.aborted)throw Error('악기 MIDI 변환을 취소했습니다.');
 const body=new FormData();body.set('audio',stem,'MYVOCAL-stem.wav');body.set('python',python);
 const res=await request('/api/music/stems/midi',{method:'POST',headers:{'X-MYVOCAL-Session':session},body,signal,cache:'no-store'});
 if(!res.ok){const e=await res.json().catch(()=>({error:`MIDI HTTP ${res.status}`}));throw Error(e.error||'Basic Pitch 신경망 변환 실패');}
 if(res.headers?.get('Content-Type')?.split(';')[0]!=='audio/midi')throw Error('실제 MIDI 파일이 반환되지 않았습니다.');
 const midi=await res.blob();if(midi.size<26||midi.size>4*1024*1024)throw Error('MIDI 파일 크기 오류');
 const file=new File([midi],'MYVOCAL-BasicPitch.mid',{type:'audio/midi'});
 const parsed=await parseMidiFile(file);
 if(!parsed.tracks?.some(t=>t.notes?.length))throw Error('Basic Pitch가 검출한 편집 가능한 MIDI 음표가 없습니다.');
 return {file,parsed};
}
