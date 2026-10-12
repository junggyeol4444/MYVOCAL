// v1.5 OpenUtau USTX 0.6 interchange exporter.
// OpenUtau owns the singer and phonemizer registry; this exporter NEVER trains/runs an AI model.
// Reference: https://github.com/openutau/OpenUtau/wiki/USTX-file-format
import { validateAlignment, isAlignmentStale } from './lyricAlignment.js';
import { validateMappedLyrics } from './voicebankAliases.js';

export const USTX_TICKS_PER_BEAT = 480;
const yamlText = x => JSON.stringify(String(x)); // JSON double-quoted strings are valid YAML 1.2 scalars.
function configurationText(value, label, max=180) {
 if(typeof value!=='string'||value.length>max||/[\u0000-\u001f\u007f]/u.test(value))throw Error(`${label} 입력이 잘못되었습니다.`);
 return value.trim();
}
function positiveInteger(value,label){if(!Number.isSafeInteger(value)||value<0||value>10000000)throw Error(`${label} 값이 올바르지 않습니다.`);return value;}
const tick = beat => Math.round(beat*USTX_TICKS_PER_BEAT);

export function prepareUstxNotes(project, alignment){
 validateAlignment(alignment);
 if(isAlignmentStale(project,alignment)) throw Error('MIDI·가사가 변경되어 싱크가 오래됐습니다. 다시 저장한 후 내보내세요.');
 const notes=alignment.cues.map((cue,i)=>{
  const start=tick(cue.startBeat),duration=tick(cue.length),lyric=String(cue.lyric??'').trim();
  positiveInteger(start,'음표 시작');positiveInteger(duration,'음표 길이');
  if(duration<10)throw Error(`${i+1}번 음표가 너무 짧습니다(10틱 미만).`);
  if(!Number.isInteger(cue.pitch)||cue.pitch<0||cue.pitch>127)throw Error(`${i+1}번 음표의 음높이가 올바르지 않습니다.`);
  if(lyric.length>80||/[\u0000-\u001f\u007f]/u.test(lyric)) throw Error(`${i+1}번 음표의 가사가 올바르지 않습니다.`);
  return {position:start,duration,tone:cue.pitch,lyric:lyric&&lyric!=='—'?lyric:'a',needsLyrics:!lyric||lyric==='—'};
 });
 notes.sort((a,b)=>a.position-b.position||a.tone-b.tone);
 for(let i=1;i<notes.length;i++){
  if(notes[i].position<notes[i-1].position+notes[i-1].duration)throw Error('음표가 겹쳐 있습니다. OpenUtau 내보내기를 위해 보컬 트랙에서 겹친 음표를 정리하세요.');
 }
 return notes;
}

export function makeOpenUtauUstx(project, alignment, options={}){
 let notes=prepareUstxNotes(project,alignment);
 if(options.useMappedLyrics){
  if(!options.voicebankProfile)throw Error('매핑을 사용하려면 oto.ini 프로필을 선택하세요.');
  const mapping=options.lyricMap||{};
  validateMappedLyrics(alignment,options.voicebankProfile,mapping);
  notes=notes.map(n=>({...n,lyric:Object.prototype.hasOwnProperty.call(mapping,n.lyric)?mapping[n.lyric]:n.lyric}));
 }
 const singer=configurationText(options.singer??'','보이스뱅크 이름');
 const phonemizer=configurationText(options.phonemizer??'OpenUtau.Core.DefaultPhonemizer','발음 처리기');
 const renderer=options.renderer??'CLASSIC';
 if(!['CLASSIC','DIFFSINGER'].includes(renderer))throw Error('지원하지 않는 OpenUtau 렌더러 설정입니다.');
 if(!Number.isFinite(alignment.bpm)||alignment.bpm<40||alignment.bpm>240)throw Error('BPM 범위를 확인해 주세요.');
 const duration=notes.length?Math.max(...notes.map(n=>n.position+n.duration))+480:480;
 const result=[
  '# Exported by MYVOCAL Studio 1.5. Voicebank/model NOT included.',
  'name: '+yamlText(configurationText(project.title||'MYVOCAL Song','곡 제목')),
  'comment: '+yamlText('MYVOCAL lyric and note interchange; choose a compatible voicebank/phonemizer in OpenUtau.'),
  'output_dir: Vocal',
  'cache_dir: UCache',
  'ustx_version: "0.6"',
  'resolution: 480',
  'key: 0',
  'expressions:',
  '  dyn:',
  '    name: dynamics (curve)',
  '    abbr: dyn',
  '    type: Curve',
  '    min: -240',
  '    max: 120',
  '    default_value: 0',
  '    is_flag: false',
  '  pitd:',
  '    name: pitch deviation (curve)',
  '    abbr: pitd',
  '    type: Curve',
  '    min: -1200',
  '    max: 1200',
  '    default_value: 0',
  '    is_flag: false',
  '  vel:',
  '    name: velocity',
  '    abbr: vel',
  '    type: Numerical',
  '    min: 0',
  '    max: 200',
  '    default_value: 100',
  '    is_flag: false',
  'exp_selectors:',
  '  - dyn',
  '  - pitd',
  '  - vel',
  'exp_primary: 0',
  'exp_secondary: 1',
  'time_signatures:',
  '  - bar_position: 0',
  '    beat_per_bar: 4',
  '    beat_unit: 4',
  'tempos:',
  '  - position: 0',
  '    bpm: '+String(alignment.bpm),
  'tracks:',
  '  - singer: '+yamlText(singer),
  '    phonemizer: '+yamlText(phonemizer),
  '    renderer_settings:',
  '      renderer: '+renderer,
  '    track_name: "Lead Vocal"',
  '    track_color: Blue',
  '    mute: false',
  '    solo: false',
  '    volume: 0',
  '    pan: 0',
  '    track_expressions: []',
  '    voice_color_names: []',
  'voice_parts:',
  '  - duration: '+duration,
  '    name: "Lead Vocal"',
  '    comment: ""',
  '    track_no: 0',
  '    position: 0',
  '    notes:',
 ];
 for(const n of notes){
  result.push(
   '      - position: '+n.position,
   '        duration: '+n.duration,
   '        tone: '+n.tone,
   '        lyric: '+yamlText(n.lyric),
   '        pitch:',
   '          data:',
   '            - {x: -40, y: 0, shape: io}',
   '            - {x: 40, y: 0, shape: io}',
   '          snap_first: true',
   '        vibrato: {length: 0, period: 175, depth: 25, in: 10, out: 10, shift: 0, drift: 0, vol_link: 0}',
   '        phoneme_expressions: []',
   '        phoneme_overrides: []');
 }
 result.push('    curves: []','wave_parts: []','');
 return {text:result.join('\n'),noteCount:notes.length,missingLyrics:notes.filter(n=>n.needsLyrics).length,ticks:duration,format:'USTX 0.6'};
}
export function ustxOutputName(title){return 'MYVOCAL-'+String(title||'Song').replace(/[^a-zA-Z0-9가-힣_-]/g,'_').slice(0,50)+'.ustx';}
