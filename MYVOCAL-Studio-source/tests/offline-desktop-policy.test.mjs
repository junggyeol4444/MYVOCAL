import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const desktop=resolve(root,'../desktop');
const read=path=>readFileSync(resolve(root,path),'utf8');

// These tests operate on the distribution source, not a mocked fetch() call.
test('local-only songwriter never requests an external AI API',()=>{
 const component=read('src/components/Songwriter.jsx');
 assert.match(component,/generateOfflineDraft/);
 assert.doesNotMatch(component,/fetch\s*\(|apiKey|draftRemote|openaiChatURL|setTab\('ai'\)/);
 assert.match(component,/로컬 작곡 초안/);
});
test('the Go desktop has no remote AI proxy and no external model URL',()=>{
 const main=readFileSync(resolve(desktop,'main.go'),'utf8');
 const ai=readFileSync(resolve(desktop,'ai.go'),'utf8');
 assert.doesNotMatch(main,/openaiChatURL|HandleFunc\("\/api\/lyrics"/);
 assert.doesNotMatch(ai,/http\.Client|http\.NewRequest|https:\/\//);
});
test('development index does not load remote Google Fonts',()=>{
 const html=read('index.html');
 assert.doesNotMatch(html,/<link[^>]+https?:\/\//);
 assert.doesNotMatch(html,/fonts\.(?:googleapis|gstatic)\.com/);
});
test('standalone release disallows external network destinations through CSP',()=>{
 const html=read('MYVOCAL-Studio-v1.8.html');
 assert.match(html,/http-equiv="Content-Security-Policy"/);
 assert.match(html,/connect-src 'self'/);
 assert.match(html,/default-src 'none'/);
 assert.doesNotMatch(html,/<link[^>]+https?:\/\//);
 assert.doesNotMatch(html,/fonts\.(?:googleapis|gstatic)\.com/);
});
test('existing local project persistence and voice editor are kept',()=>{
 const store=read('src/lib/store.js');
 const voice=read('src/components/SingingWorkbench.jsx');
 assert.match(store,/localStorage|STORAGE_KEY/);
 assert.match(voice,/api\/singing/);
});
