import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { attach } from '../src/adapter.js';
import { Store } from '../src/core.js';
import { temp, role } from './helpers.js';

function harness(home = temp()) {
  const sections = new Map(), tools = new Map(), cleanup = [];
  const ctx = {
    systemPrompt: { section(s) { sections.set(s.name, s); return () => sections.delete(s.name); } },
    tools: { register(t) { tools.set(t.name, t); return () => tools.delete(t.name); } },
    effect(fn) { const off = fn(); if (typeof off === 'function') cleanup.push(off); },
  };
  attach(ctx, { home, defaultPack: role }, x => x);
  return {home, sections, tools, cleanup};
}
const agent = id => ({session: {id, header: {origin: 'user'}}});
async function call(h, name, args = {}, who = agent('one'), signal) {
  return JSON.parse(await h.tools.get(name).execute(args, {agent: who, signal}));
}

test('adapter registers expected host contracts and disposes prompt section', () => {
  const h = harness(); const section = h.sections.get('dsh-assist:persona');
  assert.equal(section.interpolate, false);
  for (const n of ['assist_list','assist_use','assist_memory_read','assist_remember','assist_checkpoint','assist_recall','assist_resume','assist_revise']) {
    const t = h.tools.get(n);
    assert.ok(t, n); assert.equal(t.output.schema.type, 'string');
    assert.equal(t.isConcurrencySafe(), false);
  }
  assert.equal(section.text({}), '');
  for (const off of h.cleanup) off();
  assert.equal(h.sections.size, 0);
});

test('native tools persist facts and next assembly reflects them without interpolation', async () => {
  const h = harness(); const section = h.sections.get('dsh-assist:persona');
  assert.ok(section.text({agent:agent('one')}).includes(role.name));
  await call(h, 'assist_remember', {text:'喜欢 {{literal}} 红茶',kind:'preference'});
  assert.match(section.text({agent:agent('one')}), /喜欢 \{\{literal\}\} 红茶/);
  assert.match(section.text({agent:agent('two')}), /红茶/);
  await call(h, 'assist_checkpoint', {summary:'SESSION-ONE-ONLY'});
  assert.doesNotMatch(section.text({agent:agent('two')}), /SESSION-ONE-ONLY/);
});

test('subagents and absent session identity cannot read or mutate private memories', async () => {
  const h = harness();
  const child = {session:{id:'child', header:{origin:'subagent'}}};
  assert.equal(h.sections.get('dsh-assist:persona').text({agent:child}), '');
  await assert.rejects(() => call(h, 'assist_remember', {text:'no'}, child));
  await assert.rejects(() => call(h, 'assist_memory_read', {}, {}));
});

test('aborted execution does not write a new fact', async () => {
  const h = harness(); const c = new AbortController(); c.abort();
  await assert.rejects(() => call(h, 'assist_remember', {text:'ABORTED'}, agent('one'), c.signal));
  assert.equal(new Store(h.home).context('one').longTerm.length, 0);
});

test('role switch affects only calling session', async () => {
  const h = harness(); const s = new Store(h.home);
  s.importPackage({...role,id:'owl',name:'猫头鹰',persona:'安静的猫头鹰'}, {apply:true});
  await call(h, 'assist_memory_read');
  await call(h, 'assist_use', {roleId:'owl'}, agent('two'));
  assert.equal((await call(h,'assist_memory_read')).role.id, role.id);
  assert.equal((await call(h,'assist_memory_read',{},agent('two'))).role.id,'owl');
});

test('cancellation of a read does not implicitly bind a new session', async () => {
  const h=harness(), c=new AbortController(); c.abort();
  await assert.rejects(()=>call(h,'assist_memory_read',{},agent('cancelled-read'),c.signal));
  assert.equal(new Store(h.home).status().sessions.length,0);
});

test('large memories retain the checkpoint and custom memory policy in the prompt', () => {
  const h=harness(), s=new Store(h.home);
  s.importPackage({...role,id:'verbose',memoryPolicy:'POLICY-MUST-SURVIVE',greeting:'GREETING-MUST-SURVIVE'},{apply:true});
  s.bind('big','verbose');
  for(let i=0;i<30;i++) s.remember('big','x'.repeat(1950)+i);
  s.checkpoint('big','CHECKPOINT-MUST-SURVIVE');
  const rendered=h.sections.get('dsh-assist:persona').text({agent:agent('big')});
  assert.ok(rendered.length<=40000);
  assert.match(rendered,/CHECKPOINT-MUST-SURVIVE/);
  assert.match(rendered,/POLICY-MUST-SURVIVE/);
  assert.match(rendered,/GREETING-MUST-SURVIVE/);
});


test('aborted prompt assembly propagates cancellation without binding or changing state', () => {
  const h = harness(), s = new Store(h.home), c = new AbortController();
  const before = readFileSync(join(h.home, 'state.json'));
  const status = s.status();
  c.abort();
  assert.throws(
    () => h.sections.get('dsh-assist:persona').text({agent: agent('cancelled-assembly'), signal: c.signal}),
    error => error === c.signal.reason
  );
  assert.deepEqual(readFileSync(join(h.home, 'state.json')), before);
  assert.equal(s.status().revision, status.revision);
  assert.deepEqual(s.status().sessions, status.sessions);
});