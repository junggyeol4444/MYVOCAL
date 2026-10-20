import test from 'node:test';
import assert from 'node:assert/strict';
import {readMusicGenPreferences,writeMusicGenPreferences,MUSICGEN_SETTINGS_KEY} from '../src/lib/musicGenPreferences.js';
test('stores only local model and Python paths; no recordings or tokens',()=>{
 const db=new Map(),store={getItem:k=>db.get(k),setItem:(k,v)=>db.set(k,v)};
 writeMusicGenPreferences(store,{python:'D:\\AI\\python.exe',modelDir:'D:\\AI\\musicgen'});
 assert.deepEqual(readMusicGenPreferences(store),{python:'D:\\AI\\python.exe',modelDir:'D:\\AI\\musicgen'});
 assert.deepEqual(Object.keys(JSON.parse(db.get(MUSICGEN_SETTINGS_KEY))).sort(),['modelDir','python','version']);
});
test('invalid corrupted preferences cannot crash the UI',()=>{assert.deepEqual(readMusicGenPreferences({getItem:()=>'{bad'}),{});assert.throws(()=>writeMusicGenPreferences({setItem(){}},{python:'bad'+String.fromCharCode(10)+'cmd',modelDir:'a'}),/경로/);});
