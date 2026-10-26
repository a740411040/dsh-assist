import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdleController, validateIdleOptions, IDLE_DEFAULTS } from '../src/idle.js';
import { idleFixture, quick } from './idle-helpers.js';

function setup() {
  const f=idleFixture(), c=createIdleController({agents:f.agents,...f.dependencies}), a=f.agent();
  return {...f,c,a};
}
test('idle validates strict bounded options and defaults without scheduling', () => {
  const f=setup();
  assert.deepEqual(validateIdleOptions(),IDLE_DEFAULTS);
  for(const bad of [null,[],{idleMinutes:0},{cooldownMinutes:1441},{idleMinutes:1.5},{maxUnanswered:6},{quietStart:24},{extra:1},JSON.parse('{"__proto__":1}')]) {
    assert.throws(()=>f.c.start(f.a,bad)); assert.equal(f.timers.size,0);
    assert.equal(f.c.status(f.a).enabled,false);
  }
  f.c.dispose();
});
test('idle timer emits a valid identified plugin followup once due, never at enable', () => {
  const f=setup(); f.c.start(f.a,quick);
  assert.equal(f.timers.size,1); assert.equal([...f.timers.values()][0].delay,15000);
  f.advance(59999); f.c.tick(); assert.equal(f.a.calls.length,0);
  f.advance(1); [...f.timers.values()][0].fn(); f.c.tick();
  assert.equal(f.a.calls.length,1);
  const m=f.a.calls[0];
  assert.match(m.id,/^[0-9a-f-]{36}$/i); assert.equal(m.role,'user');
  assert.equal(m.source.kind,'dsh-assist-idle'); assert.equal(m.content[0].type,'text');
  assert.ok(m.content[0].text.length>20); assert.ok(Object.isFrozen(m));
  f.c.dispose();
});
test('idle cooldown and unanswered cap survive self messages; human input resumes', () => {
  const f=setup(); f.c.start(f.a,quick); f.advance(60000); f.c.tick();
  f.c.humanInput({agent:f.a,message:f.a.calls[0]});
  f.advance(119999); f.c.tick(); assert.equal(f.a.calls.length,1);
  f.advance(1); f.c.tick(); assert.equal(f.a.calls.length,2);
  f.advance(999999); f.c.tick(); assert.equal(f.a.calls.length,2);
  assert.equal(f.c.status(f.a).pausedReason,'unanswered-limit');
  f.c.humanInput({agent:f.a,message:{source:{kind:'user'}}});
  assert.equal(f.c.status(f.a).unanswered,0);
  f.advance(60000); f.c.tick(); assert.equal(f.a.calls.length,3); f.c.dispose();
});
test('busy and both inbox queues defer without consuming budget', () => {
  const f=setup(); f.c.start(f.a,quick); f.advance(60000);
  f.a.status='running'; f.c.tick(); assert.equal(f.a.calls.length,0);
  f.a.status='idle';
  for(const key of ['nextTurn','nextStep']) { f.a.inbox[key].push({}); f.c.tick(); assert.equal(f.a.calls.length,0); f.a.inbox[key]=[]; }
  f.c.tick(); assert.equal(f.a.calls.length,1); f.c.dispose();
});
test('idle completion restarts idle delay after long generation', () => {
  const f=setup(); f.c.start(f.a,quick); f.a.status='running'; f.advance(900000); f.c.tick();
  f.a.status='idle'; f.c.agentStatus({agent:f.a,status:'idle'}); f.c.tick();
  assert.equal(f.a.calls.length,0); f.advance(60000); f.c.tick();
  assert.equal(f.a.calls.length,1); f.c.dispose();
});
test('quiet hours wrap midnight and end is exclusive; equal hours disables quiet', () => {
  const f=setup(); f.c.start(f.a,{...quick,quietStart:23,quietEnd:8}); f.advance(60000);
  for(const hour of [23,0,7]) { f.setHour(hour); f.c.tick(); assert.equal(f.a.calls.length,0); }
  f.setHour(8); f.c.tick(); assert.equal(f.a.calls.length,1); f.c.dispose();
  const g=setup(); g.c.start(g.a,quick); g.advance(60000); g.setHour(23); g.c.tick(); assert.equal(g.a.calls.length,1); g.c.dispose();
});
test('daytime quiet interval also blocks and huge time jump sends no burst', () => {
  const f=setup(); f.c.start(f.a,{...quick,quietStart:9,quietEnd:17}); f.advance(999999999);
  f.setHour(12); f.c.tick(); assert.equal(f.a.calls.length,0);
  f.setHour(17); f.c.tick(); f.c.tick(); assert.equal(f.a.calls.length,1); f.c.dispose();
});
test('same-id replacement, missing live agent and subagent never receive old opt-in', () => {
  for(const change of ['replacement','missing','child']) {
    const f=setup(); f.c.start(f.a,quick); f.advance(60000);
    if(change==='replacement') f.agent(f.a.id);
    if(change==='missing') f.live.delete(f.a.id);
    if(change==='child') f.a.session.header.origin='subagent';
    f.c.tick(); assert.equal(f.a.calls.length,0); f.c.dispose();
  }
  const f=setup(); f.a.session.header.origin='subagent'; assert.throws(()=>f.c.start(f.a,quick)); assert.equal(f.timers.size,0); f.c.dispose();
});
test('stop and exact-identity disposal clear future work without canceling host', () => {
  const f=setup(); f.c.start(f.a,quick);
  f.c.agentDisposed({agent:{...f.a}}); assert.equal(f.c.status(f.a).enabled,true);
  f.c.stop({...f.a}); assert.equal(f.c.status(f.a).enabled,true);
  f.c.agentDisposed({agent:f.a}); assert.equal(f.timers.size,0);
  f.advance(60000); f.c.tick(); assert.equal(f.a.calls.length,0);
  f.c.start(f.a,quick); f.c.stop(f.a); assert.equal(f.timers.size,0); f.c.dispose();
});
test('followup failure pauses until explicit restart, never retries on human input', () => {
  const f=setup(); f.a.followup=()=>{throw new Error('x'.repeat(600));}; f.c.start(f.a,quick);
  f.advance(60000); assert.doesNotThrow(()=>f.c.tick());
  assert.equal(f.c.status(f.a).enabled,false); assert.ok(f.c.status(f.a).lastError.length<=300);
  f.c.humanInput({agent:f.a,message:{source:{kind:'user'}}});
  assert.equal(f.c.status(f.a).enabled,false); f.advance(60000); f.c.tick();
  f.c.start(f.a,quick); assert.equal(f.c.status(f.a).enabled,true); f.c.dispose();
});
test('reentrant tick and stop in followup cannot duplicate or resurrect entry', () => {
  const f=setup(); let count=0;
  f.a.followup=()=>{count++;f.c.tick();f.c.stop(f.a);};
  f.c.start(f.a,quick); f.advance(60000); f.c.tick();
  assert.equal(count,1); assert.equal(f.c.status(f.a).enabled,false); assert.equal(f.timers.size,0); f.c.dispose();
});
test('restart during failing followup is not clobbered by stale error handler', () => {
  const f=setup(); f.a.followup=()=>{f.c.start(f.a,quick);throw new Error('old send');};
  f.c.start(f.a,quick); f.advance(60000); f.c.tick();
  assert.equal(f.c.status(f.a).enabled,true); assert.equal(f.c.status(f.a).unanswered,0); f.c.dispose();
});
test('clock failures fail closed rather than generating messages or throwing timer errors', () => {
  for(const mode of ['backward','invalidWall','invalidMono']) {
    const f=setup(); f.advance(100); f.c.start(f.a,quick); f.c.tick();
    if(mode==='backward') f.setMono(0);
    if(mode==='invalidWall') f.setWall(NaN);
    if(mode==='invalidMono') f.setMono(NaN);
    assert.doesNotThrow(()=>f.c.tick()); assert.equal(f.a.calls.length,0); assert.equal(f.c.status(f.a).enabled,false); f.c.dispose();
  }
});
test('capacity is bounded, config snapshots detached, disposal permanent', () => {
  const f=setup(); f.c.start(f.a,quick);
  const snapshot=f.c.status(f.a); snapshot.config.idleMinutes=999;
  assert.equal(f.c.status(f.a).config.idleMinutes,1);
  for(let i=1;i<200;i++) f.c.start(f.agent('s'+i),quick);
  assert.throws(()=>f.c.start(f.agent('overflow'),quick));
  assert.equal(f.timers.size,1); f.c.dispose(); f.c.dispose();
  assert.equal(f.timers.size,0); assert.throws(()=>f.c.start(f.a,quick)); f.c.tick(); assert.equal(f.a.calls.length,0);
});
