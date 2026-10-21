import test from 'node:test';
import assert from 'node:assert/strict';
import {contextualKoreanSingingHints} from '../src/lib/koreanSingingPronunciation.js';
const hint=(onset,nucleus,coda='')=>({onset,nucleus,coda});
const units=(hints,gap=0)=>hints.map((h,i)=>({hint:h,syllable:'가',startSec:i*(.2+gap),endSec:i*(.2+gap)+.2}));
test('한국어 음표 사이 연음: 먹어→머거',()=>{
 const u=units([hint('ㅁ','ㅓ','ㄱ'),hint('ㅇ','ㅓ')]),before=JSON.stringify(u);
 assert.deepEqual(contextualKoreanSingingHints(u),[hint('ㅁ','ㅓ'),hint('ㄱ','ㅓ')]);
 assert.equal(JSON.stringify(u),before);
});
test('복합 받침: 값이→갑씨, 읽어→일거',()=>{
 const a=contextualKoreanSingingHints(units([hint('ㄱ','ㅏ','ㅄ'),hint('ㅇ','ㅣ')]));
 const b=contextualKoreanSingingHints(units([hint('ㅇ','ㅣ','ㄺ'),hint('ㅇ','ㅓ')]));
 assert.deepEqual(a,[hint('ㄱ','ㅏ','ㅂ'),hint('ㅆ','ㅣ')]);
 assert.deepEqual(b,[hint('ㅇ','ㅣ','ㄹ'),hint('ㄱ','ㅓ')]);
});
test('ㅎ 탈락: 좋아→조아',()=>{
 assert.deepEqual(contextualKoreanSingingHints(units([hint('ㅈ','ㅗ','ㅎ'),hint('ㅇ','ㅏ')])),[hint('ㅈ','ㅗ'),hint('ㅇ','ㅏ')]);
});
test('비음화: 국물→궁물, 합니다→함니다',()=>{
 assert.equal(contextualKoreanSingingHints(units([hint('ㄱ','ㅜ','ㄱ'),hint('ㅁ','ㅜ','ㄹ')]))[0].coda,'ㅇ');
 assert.equal(contextualKoreanSingingHints(units([hint('ㅎ','ㅏ','ㅂ'),hint('ㄴ','ㅣ')]))[0].coda,'ㅁ');
});
test('긴 쉼표·단어 공백·받침 ㅇ은 연음하지 않음',()=>{
 const g=units([hint('ㅁ','ㅓ','ㄱ'),hint('ㅇ','ㅓ')],.1);
 assert.equal(contextualKoreanSingingHints(g)[0].coda,'ㄱ');
 const s=units([hint('ㅁ','ㅓ','ㄱ'),hint('ㅇ','ㅓ')]);s[1].breakBefore=true;
 assert.equal(contextualKoreanSingingHints(s)[0].coda,'ㄱ');
 assert.equal(contextualKoreanSingingHints(units([hint('ㄱ','ㅏ','ㅇ'),hint('ㅇ','ㅏ')]))[0].coda,'ㅇ');
});
test('입력 크기 제한과 원본 보존',()=>{
 const u=units([hint('ㅂ','ㅏ','ㅂ'),hint('ㅇ','ㅡ','ㄹ')]),before=JSON.stringify(u);
 const r=contextualKoreanSingingHints(u);assert.equal(JSON.stringify(u),before);
 assert.equal(r[0].coda,'');assert.equal(r[1].onset,'ㅂ');
 assert.throws(()=>contextualKoreanSingingHints(Array(8193).fill(null)),/입력/);
});
test('ㅎ 거센소리되기: 좋다→조타, 많지→만치',()=>{
 const a=contextualKoreanSingingHints(units([hint('ㅈ','ㅗ','ㅎ'),hint('ㄷ','ㅏ')]));
 const b=contextualKoreanSingingHints(units([hint('ㅁ','ㅏ','ㄶ'),hint('ㅈ','ㅣ')]));
 assert.deepEqual(a,[hint('ㅈ','ㅗ'),hint('ㅌ','ㅏ')]);
 assert.deepEqual(b,[hint('ㅁ','ㅏ','ㄴ'),hint('ㅊ','ㅣ')]);
});
test('받침 대표음: 옷→옫, 꽃→꼳, 앞→압',()=>{
 const p=contextualKoreanSingingHints(units([hint('ㅇ','ㅗ','ㅅ'),hint('ㄲ','ㅗ','ㅊ'),hint('ㅇ','ㅏ','ㅍ')],.1));
 assert.deepEqual(p.map(x=>x.coda),['ㄷ','ㄷ','ㅂ']);
});
