import test from 'node:test';
import assert from 'node:assert/strict';
import {stableMvCharacterSeed} from '../src/lib/mvBatchProduction.js';

test('the same registered person keeps one deterministic image seed across song scenes',()=>{
 const original=stableMvCharacterSeed('user-project','permitted-character');
 assert.equal(stableMvCharacterSeed('user-project','permitted-character'),original);
 assert.ok(original>=0&&original<2_000_000_000);
});
test('different registered people and projects do not share the same reference seed',()=>{
 const one=stableMvCharacterSeed('p1','c1');
 assert.notEqual(one,stableMvCharacterSeed('p1','c2'));
 assert.notEqual(one,stableMvCharacterSeed('p2','c1'));
});
test('invalid identity inputs are rejected without generating or replacing user media',()=>{
 assert.throws(()=>stableMvCharacterSeed('','c1'),/ID/);
 assert.throws(()=>stableMvCharacterSeed('p1',''),/ID/);
});
