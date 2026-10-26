import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from '../src/core.js';
import { temp, root } from './helpers.js';
const cli = join(root,'src','cli.js'), runAsync = promisify(execFile);
function run(home,...args) {
  return execFileSync(process.execPath,[cli,...args,'--home',home],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
}
test('CLI init / memory / public export / import round-trip', () => {
  const home=join(temp(),'state'); run(home,'init');
  run(home,'remember','one','ONLY-PRIVATE');
  const out=join(temp(),'fish.json');
  run(home,'export','little-fish','--out',out);
  assert.doesNotMatch(readFileSync(out,'utf8'),/ONLY-PRIVATE/);
  assert.throws(()=>run(home,'export','little-fish','--out',out));
  const other=join(temp(),'other');
  const preview=JSON.parse(run(other,'import',out));
  assert.equal(preview.exists,false); assert.equal(existsSync(other),false);
  run(other,'import',out,'--apply');
  assert.equal(JSON.parse(run(other,'show','new')).longTerm.length,0);
});
test('CLI help and invalid arguments never initialize private data', () => {
  const home=join(temp(),'empty');
  assert.match(run(home,'--help'),/init/);
  assert.equal(existsSync(home),false);
  assert.throws(()=>run(home,'init','--unknown'));
  assert.throws(()=>run(home,'init','extra'));
  assert.equal(existsSync(home),false);
});
test('multiple processes either commit or report BUSY without lost writes', async () => {
  const home=temp(); run(home,'init');
  const results=await Promise.all(Array.from({length:6},(_,i)=>runAsync(process.execPath,
    [cli,'remember','parallel','entry-'+i,'--home',home],{encoding:'utf8'}).then(()=>({ok:true})).catch(e=>({ok:false,error:e.stderr}))));
  for(const r of results) if(!r.ok) assert.match(r.error,/BUSY|locked|lock/i);
  const count=results.filter(r=>r.ok).length; assert.ok(count>0);
  assert.equal(new Store(home).context('parallel').longTerm.length,count);
});

test('explicit empty --home never falls back to ambient private storage', () => {
  const fallback=join(temp(),'fallback');
  assert.throws(()=>execFileSync(process.execPath,[cli,'init','--home',''],{
    encoding:'utf8',stdio:['ignore','pipe','pipe'],
    env:{...process.env,DSH_ASSIST_HOME:fallback}
  }));
  assert.equal(existsSync(fallback),false);
});
