export function idleFixture() {
  let mono = 0, wall = new Date(2026, 9, 27, 12).getTime(), timerId = 0;
  const live = new Map(), timers = new Map(), listeners = new Map(), tools = new Map(), cleanup = [];
  const agents = { get: id => live.get(id), withoutInitiator: fn => fn() };
  const dependencies = {
    now: () => mono, wallNow: () => wall,
    setTimer(fn, delay) { const timer = { id: ++timerId, fn, delay, unref() {} }; timers.set(timer.id, timer); return timer; },
    clearTimer(timer) { timers.delete(timer.id); }
  };
  const ctx = {
    agents, tools: { register(tool) { tools.set(tool.name, tool); return () => tools.delete(tool.name); } },
    on(name, fn) { let set = listeners.get(name); if (!set) listeners.set(name, set = new Set()); set.add(fn); return () => set.delete(fn); },
    effect(fn) { const off = fn(); if (typeof off === 'function') cleanup.push(off); }
  };
  function emit(name, payload) { for (const fn of [...(listeners.get(name) || [])]) fn(payload); }
  function agent(id = 'chat') {
    const messages = [{id:'human-1',role:'user',content:[{type:'text',text:'开启主动聊天'}],source:{kind:'user'}}];
    const value = {
      id, status:'idle', inbox:{nextTurn:[], nextStep:[]},
      session:{id,header:{origin:'user'},deriveMessages:()=>messages},
      calls:[], messages,
      followup(message) { value.calls.push(message); emit('agent/inbox/inserted',{agent:value,message}); }
    };
    live.set(id,value); return value;
  }
  return { ctx, agents, dependencies, live, timers, listeners, tools, cleanup, emit, agent,
    advance(ms) { mono += ms; wall += ms; }, setMono(value) { mono = value; },
    setHour(hour) { const d = new Date(wall); d.setHours(hour,0,0,0); wall=d.getTime(); },
    setWall(value) { wall=value; }
  };
}
export const quick = {idleMinutes:1,cooldownMinutes:2,maxUnanswered:2,quietStart:0,quietEnd:0};
