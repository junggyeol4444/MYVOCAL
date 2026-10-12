import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('Windows embedded HTML exactly matches the current standalone application',()=>{
 const app=readFileSync(resolve(root,'MYVOCAL-Studio-v1.8.html'));
 const desktop=readFileSync(resolve(root,'../desktop/index.html'));
 assert.deepEqual(desktop,app);
 const content=app.toString('utf8');
 assert.match(content,/genre-mix-editor/);
 assert.match(content,/genreMixEditor|genreMix/);
});
