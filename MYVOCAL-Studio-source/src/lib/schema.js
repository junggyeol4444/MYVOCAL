export const genId = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
export const now = () => new Date().toISOString();
import {validateGenreMix,singleGenreMix} from './genreMix.js';
export {genreList} from './genres.js';
export const songSections = ['Intro', 'Verse 1', 'Pre-Chorus', 'Chorus', 'Verse 2', 'Bridge', 'Final Chorus', 'Outro'];
export const trackPresets = ['Lead Vocal', 'Harmony', 'Drums', 'Bass', 'Piano', 'Guitar', 'Strings', 'Synth', 'FX'];
export const steps = ['아이디어', '작사', '곡 구조', 'BPM / Key', '코드', '멜로디', '편곡', 'Singing', 'Mix', 'Master', 'Storyboard', '영상'];
export const modes = ['Performance MV', 'Story MV', 'Mixed MV', 'Vocal Synth PV'];
export const rightsOptions = [
  {value:'owned',label:'내가 만든 자료'},
  {value:'self',label:'내 모습 / 내 목소리'},
  {value:'licensed',label:'사용 허가를 받은 자료'},
  {value:'reference',label:'Reference 분석용'}
];
export const initialData = {
  version: 10, projects: [], voices: [], trainingPlans: [], voiceModels: [], voicebanks: [], characters: [], virtualSingers: [], musicStyles: [], videoStyles: [], learning: [], settings: { provider:'MYVOCAL Native', defaultMode:'auto' }
};
export function newProject({title='새 프로젝트',prompt='',genre='Rock',genreMix,genreAuto=false,voiceId='',characterId='',virtualSingerId='',singingModelId='',singingStyle='Natural',ownedMusicGuide8=null,videoMode='auto',withVideo=true,options={}}={}) {
  // Keep legacy projects intact; the new field is opt-in.
  const normalizedMix=genreMix===undefined?singleGenreMix(genre):validateGenreMix(genreMix);
  const date=now();
  return {id:genId('prj'),title,prompt,status:'초안',createdAt:date,updatedAt:date,bpm:120,key:'C Major',genreMix:normalizedMix,genreAuto:!!genreAuto,voiceId,characterId,virtualSingerId,singingModelId,singingStyle,...(ownedMusicGuide8?{ownedMusicGuide8}:{}),videoMode,withVideo,options,
    lyrics:'',activeTab:'music',tracks:[
      {id:genId('trk'),name:'Lead Vocal',type:'vocal',mute:false,solo:false,volume:85,clips:[],midiNotes:[],instrument:'synth'},
      {id:genId('trk'),name:'Drums',type:'rhythm',mute:false,solo:false,volume:78,clips:[],midiNotes:[],instrument:'drums'},
      {id:genId('trk'),name:'Bass',type:'instrument',mute:false,solo:false,volume:76,clips:[],midiNotes:[],instrument:'bass'},
      {id:genId('trk'),name:'Piano',type:'instrument',mute:false,solo:false,volume:72,clips:[],midiNotes:[],instrument:'piano'},
    ],
    sections:[{id:genId('sec'),name:'Intro',bars:4},{id:genId('sec'),name:'Verse 1',bars:8},{id:genId('sec'),name:'Chorus',bars:8},{id:genId('sec'),name:'Outro',bars:4}],
    scenes:[{id:genId('scn'),start:0,end:12,title:'Scene 01',description:'첫 장면을 설명해 주세요',characterId:'',location:'',outfit:'',expression:'',action:'',camera:'',lighting:''}],
    chords:[{id:genId('chd'),bar:1,bars:2,symbol:'C'},{id:genId('chd'),bar:3,bars:2,symbol:'Am'},{id:genId('chd'),bar:5,bars:2,symbol:'F'},{id:genId('chd'),bar:7,bars:2,symbol:'G'}],identityLock:true,outfitLock:true,cameraLock:true,backgroundLock:true,producerLog:[]
  };
}
export function readableDate(iso) { try {return new Intl.DateTimeFormat('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(iso));}catch{return '-';} }
