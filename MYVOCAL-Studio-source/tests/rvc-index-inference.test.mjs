import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRVCSettings,convertVoiceWithRVC} from '../src/lib/rvcVoiceConversion.js';
import {writeRVCPreferences,readRVCPreferences} from '../src/lib/rvcPreferences.js';
const settings={root:'D:\\RVC',python:'D:\\RVC\\python.exe',model:'D:\\RVC\\myvoice.pth',index:'D:\\RVC\\myvoice.index',f0:'rmvpe',pitch:'0',indexRate:'0.65',rightsConfirmed:true};
test('RVC inference requires a genuine FAISS index when applying retrieval',()=>{
 const wav=new Blob([new Uint8Array(100)],{type:'audio/wav'});
 assert.doesNotThrow(()=>validateRVCSettings(wav,settings));
 assert.throws(()=>validateRVCSettings(wav,{...settings,index:''}),/인덱스/);
 assert.throws(()=>validateRVCSettings(wav,{...settings,index:'X:\\bad.pth'}),/FAISS/);
});
test('RVC settings remember the optional index without modifying model data',()=>{
 const storage=new Map();
 const fake={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
 writeRVCPreferences(fake,settings);
 const restored=readRVCPreferences(fake);
 assert.equal(restored.index,settings.index);
 assert.equal(restored.model,settings.model);
});
