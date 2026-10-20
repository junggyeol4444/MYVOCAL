import test from 'node:test';
import assert from 'node:assert/strict';
import {RVC_PREF_KEY,readRVCPreferences,writeRVCPreferences} from '../src/lib/rvcPreferences.js';
test('RVC paths persist once; never include voice recordings or model bytes',()=>{
 const values=new Map(),storage={setItem:(k,v)=>values.set(k,v),getItem:k=>values.get(k)};
 const options={root:'C:\\RVC',python:'C:\\RVC\\runtime\\python.exe',model:'C:\\RVC\\weights\\own.pth',pitch:'0',indexRate:'0.1',f0:'rmvpe',rawVoiceFile:'sensitive'};
 writeRVCPreferences(storage,options);const loaded=readRVCPreferences(storage);
 assert.equal(loaded.model,options.model);assert.equal(loaded.rawVoiceFile,undefined);
 assert.doesNotMatch(values.get(RVC_PREF_KEY),/sensitive/);
});
test('corrupted and legacy unrelated settings are ignored',()=>{
 assert.equal(readRVCPreferences({getItem:()=>'{broken'}),null);
 assert.equal(readRVCPreferences({getItem:()=>JSON.stringify({version:2,root:'x'})}),null);
});