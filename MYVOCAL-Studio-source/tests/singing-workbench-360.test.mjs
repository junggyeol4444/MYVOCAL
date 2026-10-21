import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('full Singing Workbench validates 360 seconds before neural RVC and uses 360 seconds score sync',()=>{
 const s=readFileSync(new URL('../src/components/SingingWorkbench.jsx',import.meta.url),'utf8');
 assert.match(s,/maxDurationSec:longForm\?360:90/);
 assert.match(s,/긴 곡 360초 싱크 생성/);
 assert.doesNotMatch(s,/maxDurationSec:longForm\?300:90/);
});
