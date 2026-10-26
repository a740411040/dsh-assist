import test from 'node:test';
import assert from 'node:assert/strict';
import { attachIdle } from '../src/idle-adapter.js';
import { idleFixture, quick } from './idle-helpers.js';

function setup() {
  const f=idleFixture(), a=f.agent(), c=attachIdle(f.ctx,x=>x,f.dependencies);
  const call=(name,args={},agent=a,signal)=>f.tools.get(name).execute(args,{agent,signal});
  return {...f,a,c,call};
}
test('idle host tools require genuine current user turn and respect aborted execution', () => {
  const f=setup(), abort=new AbortController(); abort.abort();
  assert.throws(()=>f.call('assist_idle_start',quick,f.a,abort.signal));
  assert.equal(f.c.status(f.a).enabled,false);
  f.a.messages.push({role:'user',source:{kind:'dsh-assist-idle'}});
  assert.throws(()=>f.call('assist_idle_start',quick)); assert.equal(f.timers.size,0);
  f.a.messages.push({role:'user',source:{kind:'user'}});
  assert.equal(JSON.parse(f.call('assist_idle_start',quick)).enabled,true);
  assert.throws(()=>f.call('assist_idle_stop',{},f.a,abort.signal)); assert.equal(f.c.status(f.a).enabled,true);
  f.a.messages.push({role:'assistant',source:{kind:'model'}});
  assert.equal(JSON.parse(f.call('assist_idle_status')).enabled,true);
  for(const off of f.cleanup)off();
});
test('host events drive human resets and disposal; own followup cannot reset cap', () => {
  const f=setup(); f.call('assist_idle_start',quick);
  f.advance(60000); f.c.tick(); assert.equal(f.a.calls.length,1);
  assert.equal(f.c.status(f.a).unanswered,1);
  f.emit('agent/inbox/inserted',{agent:f.a,message:{source:{kind:'user'}}});
  assert.equal(f.c.status(f.a).unanswered,0);
  f.emit('agent/status',{agent:f.a,status:'idle'});
  f.emit('agent/disposed',{agent:f.a}); assert.equal(f.timers.size,0);
  for(const off of f.cleanup)off();
});
test('host tools cannot target child, missing, or replaced agents', () => {
  const f=setup(); f.a.session.header.origin='subagent';
  for(const name of f.tools.keys()) assert.throws(()=>f.call(name));
  f.a.session.header.origin='user'; f.live.delete(f.a.id);
  for(const name of f.tools.keys()) assert.throws(()=>f.call(name));
  for(const off of f.cleanup)off();
});
test('host unload removes listeners tools and timer, no queued generation afterwards', () => {
  const f=setup(); f.call('assist_idle_start',quick); const pending=[...f.timers.values()][0].fn;
  for(const off of f.cleanup)off();
  assert.equal(f.tools.size,0); assert.equal(f.timers.size,0);
  assert.equal([...f.listeners.values()].reduce((n,s)=>n+s.size,0),0);
  f.advance(60000); pending(); assert.equal(f.a.calls.length,0);
});
test('partial host registration failure unwinds acquired resources', () => {
  const f=idleFixture(); let count=0; const original=f.ctx.tools.register;
  f.ctx.tools.register=t=>{if(++count===2)throw new Error('registration refused');return original(t);};
  assert.throws(()=>attachIdle(f.ctx,x=>x,f.dependencies));
  assert.equal(f.tools.size,0); assert.equal(f.timers.size,0);
  assert.equal([...f.listeners.values()].reduce((n,s)=>n+s.size,0),0);
});

test('tool declarations match the host DSL and render canonical string output', () => {
  const f=setup();
  for(const tool of f.tools.values()) {
    assert.equal(tool.isConcurrencySafe(),false);
    assert.equal(tool.output.schema.type,'string');
    assert.deepEqual(tool.output.render({},'value'),[{type:'text',text:'value'}]);
    assert.equal(tool.parameters.type,undefined);
    for(const field of Object.values(tool.parameters)) assert.equal(field.type,'number');
  }
  for(const off of f.cleanup)off();
});
test('production timer creation leaves the enabling agent initiator scope', t => {
  const f=idleFixture(), a=f.agent(); let withoutCalls=0, inScope=false;
  f.agents.withoutInitiator=fn=>{withoutCalls++;inScope=true;try{return fn();}finally{inScope=false;}};
  t.mock.method(globalThis,'setInterval',(fn,delay)=>{assert.equal(inScope,true);return f.dependencies.setTimer(fn,delay);});
  attachIdle(f.ctx,x=>x,{now:f.dependencies.now,wallNow:f.dependencies.wallNow,clearTimer:f.dependencies.clearTimer});
  f.tools.get('assist_idle_start').execute(quick,{agent:a});
  assert.equal(withoutCalls,1); assert.equal(f.timers.size,1);
  for(const off of f.cleanup)off();
  assert.equal(f.timers.size,0);
});
