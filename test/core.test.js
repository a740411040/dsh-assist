import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, symlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Store, validateRole, validatePackage, readJsonFile } from '../src/core.js';
import { temp, role, secondRole } from './helpers.js';

test('role/pack validation rejects unknown executable fields and prototype keys', () => {
  assert.equal(validateRole(role).id, 'little-fish');
  assert.equal(validatePackage(role).role.id, role.id);
  for (const patch of [
    { id: '../escape' }, { id: 'CON' }, { id: 'con' }, { id: 'constructor' },
    { version: 2 }, { script: 'run me' }, { persona: '' }, { name: 'x'.repeat(81) },
  ]) assert.throws(() => validateRole({ ...role, ...patch }));
  assert.throws(() => validateRole(JSON.parse(JSON.stringify(role).replace('{"format"', '{"__proto__":{},"format"'))));
  assert.throws(() => validatePackage({ format: 'dsh-assist/package', version: 1, private: false, role, memory: {} }));
});

test('import preview is read-only, init idempotent, duplicate imports fail', () => {
  const home = join(temp(), 'fresh');
  const s = new Store(home);
  assert.equal(s.importPackage(role).exists, false);
  assert.equal(existsSync(home), false);
  s.init(role);
  const before = s.status().revision;
  s.init(role);
  assert.equal(s.status().revision, before);
  assert.throws(() => s.importPackage(role, { apply: true }));
  s.importPackage(secondRole(), { apply: true });
  assert.equal(s.list().length, 2);
});

test('public export contains persona only, private memory requires explicit opt-in', () => {
  const s = new Store(join(temp(), 'a'));
  s.init(role);
  s.remember('one', 'PRIVATE-MEMORY-123');
  s.checkpoint('one', 'PRIVATE-SHORT-456');
  const pub = s.exportPackage(role.id);
  assert.equal(pub.private, false);
  assert.equal(Object.hasOwn(pub, 'memory'), false);
  assert.doesNotMatch(JSON.stringify(pub), /PRIVATE-MEMORY|PRIVATE-SHORT|"sessions"/);
  const dest = new Store(join(temp(), 'b'));
  dest.importPackage(pub, { apply: true });
  assert.equal(dest.context('new').longTerm.length, 0);
  const priv = s.exportPackage(role.id, { includeMemory: true });
  assert.equal(priv.private, true);
  const restored = new Store(join(temp(), 'c'));
  assert.throws(() => restored.importPackage(priv, { apply: true }));
  restored.importPackage(priv, { apply: true, includeMemory: true });
  assert.equal(restored.context('new').longTerm[0].text, 'PRIVATE-MEMORY-123');
  assert.equal(restored.context('new').shortTerm, null);
});

test('default changes only affect new sessions and remembered facts survive restart', () => {
  const home = temp(); const s = new Store(home);
  s.init(role); s.context('old');
  s.importPackage(secondRole(), { apply: true });
  s.setDefault('owl');
  assert.equal(s.context('old').role.id, role.id);
  assert.equal(s.context('new').role.id, 'owl');
  s.remember('old', '我喜欢乌龙茶', 'preference');
  const reopened = new Store(home);
  assert.equal(reopened.context('old').longTerm[0].text, '我喜欢乌龙茶');
  assert.equal(reopened.context('new').longTerm.length, 0);
});

test('short memory is role/session scoped; explicit resume requires same role', () => {
  const s = new Store(temp()); s.init(role);
  s.checkpoint('a', '准备面试');
  assert.equal(s.context('b').shortTerm, null);
  assert.equal(s.resume('b', 'a').summary, '准备面试');
  s.importPackage(secondRole(), { apply: true });
  s.bind('a', 'owl');
  assert.equal(s.context('a').shortTerm, null);
  assert.throws(() => s.resume('b', 'a'));
  s.bind('a', role.id);
  assert.equal(s.context('a').shortTerm.summary, '准备面试');
});

test('TTL works without deleting expired checkpoints or faking a clock', () => {
  let now = Date.parse('2026-10-27T00:00:00Z');
  const s = new Store(temp(), { now: () => now }); s.init(role);
  s.checkpoint('a', '会过期', 1);
  now += 3600001;
  assert.equal(s.context('a').shortTerm, null);
  assert.throws(() => s.resume('b', 'a'));
  assert.throws(() => s.checkpoint('a', 'bad', 0));
  assert.throws(() => s.checkpoint('a', 'bad', 721));
});

test('recall searches Chinese and revision corrects rather than duplicates', () => {
  const s = new Store(temp()); s.init(role);
  const entry = s.remember('a', '喜欢深圳和乌龙茶', 'preference');
  s.remember('a', '可能更偏好绿茶', 'inference');
  assert.equal(s.recall('a', '乌龙茶')[0].id, entry.id);
  const corrected = s.revise('a', entry.id, '现在喜欢红茶');
  assert.equal(corrected.id, entry.id);
  assert.equal(s.context('a').longTerm.length, 2);
  assert.equal(s.recall('a', '红茶')[0].id, entry.id);
  assert.throws(() => s.recall('a', '', 21));
  assert.throws(() => s.remember('a', 'x', 'fiction'));
});

test('truncated or invalid state fails closed and original bytes remain untouched', () => {
  const home = temp(); const s = new Store(home); s.init(role);
  const file = join(home, 'state.json');
  writeFileSync(file, '{"format":', 'utf8');
  assert.throws(() => s.init(role));
  assert.throws(() => s.remember('a', 'no'));
  assert.equal(readFileSync(file, 'utf8'), '{"format":');
});

test('untrusted state semantic corruption is rejected, not reset', () => {
  const home = temp(); const s = new Store(home); s.init(role);
  const file = join(home, 'state.json');
  const st = JSON.parse(readFileSync(file, 'utf8'));
  st.defaultRole = 'missing';
  writeFileSync(file, JSON.stringify(st), 'utf8');
  assert.throws(() => s.status());
});

test('oversize files/content fail before mutation', () => {
  const home = temp(); const s = new Store(home); s.init(role);
  assert.throws(() => s.remember('a', 'x'.repeat(2001)));
  assert.throws(() => s.checkpoint('a', 'x'.repeat(4001)));
  const p = join(temp(), 'large.json'); writeFileSync(p, 'x'.repeat(100));
  assert.throws(() => readJsonFile(p, 50));
});

test('links and junction ancestors are rejected', () => {
  const base = temp(); const real = join(base, 'real'); mkdirSync(real);
  const link = join(base, 'alias');
  symlinkSync(real, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => new Store(join(link, 'data')).init(role));
  assert.equal(existsSync(join(real, 'data', 'state.json')), false);
});

test('public validation rejects malformed private entry and foreign checkpoint types', () => {
  const s = new Store(temp()); s.init(role); s.remember('a', 'hello');
  const pack = s.exportPackage(role.id, { includeMemory: true });
  pack.memory.longTerm[0].kind = 'script';
  assert.throws(() => validatePackage(pack));
});

test('existing writer lock is neither stolen nor removed on contention', () => {
  const home=temp(), s=new Store(home); s.init(role);
  const lock=join(home,'write.lock');
  writeFileSync(lock,'another-owner','utf8');
  assert.throws(()=>s.remember('a','must not commit'),/BUSY/);
  assert.equal(readFileSync(lock,'utf8'),'another-owner');
  assert.equal(s.status().sessions.length,0);
});

test('malformed memory fields in persisted state fail closed', () => {
  const home=temp(), s=new Store(home); s.init(role); s.remember('a','valid');
  const file=join(home,'state.json'), data=JSON.parse(readFileSync(file,'utf8'));
  data.roles[role.id].longTerm[0].createdAt='yesterday';
  writeFileSync(file,JSON.stringify(data),'utf8');
  assert.throws(()=>s.context('a'),/date|ISO/i);
});

test('memory capacity errors preserve all committed entries', () => {
  const home=temp(), s=new Store(home); s.init(role); s.remember('a','first');
  const file=join(home,'state.json'), data=JSON.parse(readFileSync(file,'utf8'));
  const item=data.roles[role.id].longTerm[0];
  data.roles[role.id].longTerm=Array.from({length:200},(_,i)=>({...item,id:'test-'+i}));
  writeFileSync(file,JSON.stringify(data),'utf8');
  assert.throws(()=>s.remember('a','overflow'),/capacity/);
  assert.equal(s.exportPackage(role.id,{includeMemory:true}).memory.longTerm.length,200);
});

test('missing initialization and invalid session names do not create records', () => {
  const home=join(temp(),'empty'), s=new Store(home);
  assert.throws(()=>s.context('a'),/initialized/);
  assert.equal(existsSync(home),false);
  s.init(role);
  assert.throws(()=>s.remember('__proto__','bad'));
  assert.throws(()=>s.context('constructor'));
  assert.equal(s.status().sessions.length,0);
});

test('highly nested input fails before any import writes', () => {
  const home=join(temp(),'empty'), s=new Store(home);
  let nested={}; for(let i=0;i<30;i++) nested={child:nested};
  assert.throws(()=>s.importPackage(nested,{apply:true}));
  assert.equal(existsSync(home),false);
});


test('invalid clock cannot leave a lock or block subsequent initialization', () => {
  const home=temp();
  assert.throws(()=>new Store(home,{now:()=>NaN}).init(role),/clock/);
  assert.equal(existsSync(join(home,'write.lock')),false);
  assert.equal(new Store(home).init(role).defaultRole,role.id);
});

test('stored references reject coercible non-string IDs without rewriting data', () => {
  for(const bad of [[role.id],123,{}]) {
    for(const place of ['default','binding']) {
      const home=temp(), s=new Store(home); s.init(role); s.bind('a');
      const file=join(home,'state.json'), data=JSON.parse(readFileSync(file,'utf8'));
      if(place==='default') data.defaultRole=bad; else data.sessions.a.roleId=bad;
      const raw=JSON.stringify(data); writeFileSync(file,raw,'utf8');
      assert.throws(()=>s.status(),/role id/i);
      assert.equal(readFileSync(file,'utf8'),raw);
    }
  }
});
