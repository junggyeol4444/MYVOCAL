import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const root=path.resolve(import.meta.dirname,'..');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'myvocal-viseme-client-'));
await fs.copyFile(path.join(root,'src/lib/viseme2DClient.js'),path.join(temp,'viseme2DClient.mjs'));
await fs.writeFile(path.join(temp,'singingOutputValidation.js'),"export function assertUsableSingingWav(b){if(b.byteLength<44)throw Error('WAV 오류');}\n");
// Adapt only the import extension in the isolated test copy; real main module is untouched.
let source=await fs.readFile(path.join(temp,'viseme2DClient.mjs'),'utf8');
source=source.replace("'./singingOutputValidation.js'","'./singingOutputValidation.mjs'");
await fs.writeFile(path.join(temp,'viseme2DClient.mjs'),source);
await fs.rename(path.join(temp,'singingOutputValidation.js'),path.join(temp,'singingOutputValidation.mjs'));
const {viseme2DAlignment,renderViseme2D}=await import('file://'+path.join(temp,'viseme2DClient.mjs'));
const alignment={format:'MYVOCAL_LYRIC_ALIGNMENT',version:1,cues:[{startSec:0,endSec:.7,lyric:'가'},{startSec:.8,endSec:1.6,lyric:'구'}]};
const wav=new File([new Uint8Array(80)],'voice.wav',{type:'audio/wav'});
const png=new File([new Uint8Array(120)],'char.png',{type:'image/png'});
const opts={image:png,audio:wav,alignment,python:'C:\\Python\\python.exe',ffmpeg:'D:\\ffmpeg\\ffmpeg.exe',rightsConfirmed:true};
const ebml=new Uint8Array(1200);ebml.set([0x1a,0x45,0xdf,0xa3]);

test('가사 싱크 검증과 음표 순서',()=>{
 assert.equal(viseme2DAlignment(alignment).cues.length,2);
 assert.throws(()=>viseme2DAlignment({...alignment,cues:[{startSec:1,endSec:1.5,lyric:'가'},{startSec:0,endSec:.5,lyric:'구'}]}));
});
test('권한·실행 경로 검증',async()=>{
 await assert.rejects(renderViseme2D({...opts,rightsConfirmed:false},{session:'abc'}),/권한/);
 await assert.rejects(renderViseme2D({...opts,python:'python'},{session:'abc'}),/절대 경로/);
});
test('세션 및 잘못된 영상 서명 거부',async()=>{
 await assert.rejects(renderViseme2D(opts,{session:''}),/세션/);
 const bad=async()=>({ok:true,headers:{get:()=> 'video/webm'},blob:async()=>new Blob([new Uint8Array(1200)])});
 await assert.rejects(renderViseme2D(opts,{session:'abc',request:bad}),/서명/);
});
test('기존 Windows EXE POST 연결 및 실제 WebM 바이트 반환',async()=>{
 let seen;
 const request=async(url,arg)=>{seen={url,arg};return {ok:true,headers:{get:()=> 'video/webm'},blob:async()=>new Blob([ebml])}};
 const result=await renderViseme2D(opts,{session:'abc',request});
 assert.equal(result.type,'video/webm');assert.equal(result.size,1200);
 assert.equal(seen.url,'/api/mv/lipsync2d');assert.equal(seen.arg.headers['X-MYVOCAL-Session'],'abc');
 assert.equal(seen.arg.body.get('rights'),'confirmed');
 assert.equal(JSON.parse(seen.arg.body.get('alignment')).cues.length,2);
});
test('중단된 요청은 영상 생성 전에 거부',async()=>{
 const ctrl=new AbortController();ctrl.abort();
 await assert.rejects(renderViseme2D(opts,{session:'abc',signal:ctrl.signal}),/취소/);
});


test('실제 완성 음악 WAV와 장면 모드를 기존 EXE 요청으로 전달',async()=>{
 let body;
 const song=new File([new Uint8Array(400)],'final_music.wav',{type:'audio/wav'});
 const request=async(_,o)=>{body=o.body;return {ok:true,headers:{get:()=> 'video/webm'},blob:async()=>new Blob([ebml])}};
 await renderViseme2D({...opts,soundtrack:song,sceneMode:'mixed'},{session:'abc',request});
 assert.equal(body.get('sceneMode'),'mixed');
 assert.equal(body.get('soundtrack').name,'final_music.wav');
 assert.equal(body.get('audio').name,'voice.wav');
 await assert.rejects(renderViseme2D({...opts,sceneMode:'invalid'},{session:'abc'}),/장면 모드/);
});
