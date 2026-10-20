import test from 'node:test';import assert from 'node:assert/strict';
import {lipSyncFromSingingAudio} from '../src/lib/audioDrivenLipSync.js';
const audio=()=>({sampleRate:8000,numberOfChannels:1,duration:1,getChannelData:()=>Float32Array.from({length:8000},(_,i)=>i<4000?.4:0)});
const alignment={cues:[{startSec:0,endSec:.5,lyric:'아'},{startSec:.5,endSec:1,lyric:'이'}]};
test('real energized audio gives reviewable Korean mouth shapes',()=>{const cues=lipSyncFromSingingAudio(alignment,audio()).cues;assert.equal(cues.length,1);assert.equal(cues[0].viseme,'A');assert.ok(cues[0].endMs<=500)});
test('silent input never fabricates visemes',()=>{const b=audio();b.getChannelData=()=>new Float32Array(8000);assert.throws(()=>lipSyncFromSingingAudio(alignment,b),/감지/)});
test('MIDI beyond source audio is rejected',()=>{assert.throws(()=>lipSyncFromSingingAudio({cues:[{startSec:0,endSec:2,lyric:'아'}]},audio()),/시간축/)});
test('existing project and alignment are never modified',()=>{const original=JSON.stringify(alignment);lipSyncFromSingingAudio(alignment,audio());assert.equal(JSON.stringify(alignment),original)});