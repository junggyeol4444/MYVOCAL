import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMediaDataUrl,validateMediaMetadata} from '../src/lib/base64Safety.js';
import {MAX_ASSET_DATA_URL_LENGTH} from '../src/lib/bundleSafety.js';
test('accepts valid bounded media base64',()=>{
 assert.deepEqual(validateMediaDataUrl('data:audio/wav;base64,AAE=',8),{mime:'audio/wav',payload:'AAE='});
});
test('rejects truncated, invalid, unpadded, and oversized media',()=>{
 for(const input of ['data:audio/wav;base64,AAE','data:audio/wav;base64,AA==AA==','data:audio/wav;base64,@@@@','data:audio/wav;base64,AA=A','data:text/html;base64,AA==\n'])assert.throws(()=>validateMediaDataUrl(input));
 assert.throws(()=>validateMediaDataUrl('data:audio/wav;base64,AAAA',3));
});
test('rejects non-media and malformed MIME',()=>{
 for(const input of [null,{},'data:;base64,AA==','data:audio/wav,AA==','data:audio/wav;base64,AA==#'])assert.throws(()=>validateMediaDataUrl(input));
});

test('rejects mismatched backup MIME metadata',()=>{assert.throws(()=>validateMediaMetadata({type:'text/html'},'audio/wav'));assert.equal(validateMediaMetadata({type:'AUDIO/WAV'},'audio/wav'),true);});
test('rejects unsafe backup media names',()=>{for(const name of ['../file.wav','a\\b.wav','', 'x'.repeat(256)])assert.throws(()=>validateMediaMetadata({name},'audio/wav'));});

test('validates large media data without regex stack exhaustion',()=>{
 const payload='A'.repeat(2*1024*1024);
 const result=validateMediaDataUrl('data:audio/wav;base64,'+payload);
 assert.equal(result.payload.length,payload.length);
});
test('rejects noncanonical padding bits and nested Base64 padding',()=>{
 for(const payload of ['AB==','AAB=','AAAA====','AA==AA==','AAAA\n','AAAA!','AA=A','A===']) {
  assert.throws(()=>validateMediaDataUrl('data:audio/wav;base64,'+payload),/Base64/);
 }
 assert.equal(validateMediaDataUrl('data:audio/wav;base64,AA==').payload,'AA==');
 assert.equal(validateMediaDataUrl('data:audio/wav;base64,AAA=').payload,'AAA=');
});

test('data URL parser shares the import media ceiling and retains explicit smaller limits',()=>{
 assert.ok(MAX_ASSET_DATA_URL_LENGTH > 130*1024*1024);
 assert.equal(validateMediaDataUrl('data:video/webm;base64,AA==').payload,'AA==');
 assert.throws(()=>validateMediaDataUrl('data:video/webm;base64,AAAA',3),/너무 큽니다/);
});
