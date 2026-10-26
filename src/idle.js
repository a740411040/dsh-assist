import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

export const IDLE_DEFAULTS = Object.freeze({
  idleMinutes: 15, cooldownMinutes: 30, maxUnanswered: 2, quietStart: 23, quietEnd: 8
});
const bounds = {idleMinutes:[1,1440],cooldownMinutes:[1,1440],maxUnanswered:[1,5],quietStart:[0,23],quietEnd:[0,23]};
const SOURCE = 'dsh-assist-idle';
const PROMPT = '【dsh-assist 空闲触发】这是一条插件计时事件，没有新的用户消息。'
  + '结合当前角色与已有记忆，自然、简短地主动聊一两句，可以接续话题或分享轻松的想法。'
  + '不要把本事件当成用户提供的新事实，不要调用 assist_idle_start 重置计时，'
  + '不要执行发帖、发信等外部动作，不要使用情绪施压或编造 token 余额。';

export function validateIdleOptions(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
      || ![Object.prototype,null].includes(Object.getPrototypeOf(options))) throw new Error('Idle options must be a plain object');
  for (const key of Object.keys(options)) if (!Object.hasOwn(bounds,key)) throw new Error('Unknown idle option: ' + key);
  const config = {...IDLE_DEFAULTS,...options};
  for (const [key,[min,max]] of Object.entries(bounds)) {
    if (!Number.isInteger(config[key]) || config[key] < min || config[key] > max)
      throw new Error(key + ' must be an integer from ' + min + ' to ' + max);
  }
  return config;
}

export function createIdleController({
  agents, now = () => performance.now(), wallNow = () => Date.now(),
  setTimer = setInterval, clearTimer = clearInterval, randomId = randomUUID
}) {
  if (typeof agents?.get !== 'function') throw new Error('Idle chat requires the host agents registry');
  const records = new Map();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let timer = null, disposed = false, ticking = false, lastClock = null;
  const idOf = agent => typeof agent?.id === 'string' && agent.id ? agent.id : null;
  const isPrimary = agent => agent?.origin !== 'subagent' && agent?.session?.header?.origin !== 'subagent';
  function isLive(agent) {
    const id = idOf(agent);
    return Boolean(id && agent.session?.id === id && isPrimary(agent) && agents.get(id) === agent
      && ['idle','running'].includes(agent.status) && typeof agent.followup === 'function'
      && Array.isArray(agent.inbox?.nextTurn) && Array.isArray(agent.inbox?.nextStep));
  }
  const recordFor = agent => {
    const record = records.get(idOf(agent));
    return record?.agent === agent ? record : undefined;
  };
  function clock() {
    const value = now();
    if (!Number.isFinite(value) || value < 0 || (lastClock !== null && value < lastClock))
      throw new Error('Invalid or backwards monotonic clock; idle chat paused');
    lastClock = value;
    return value;
  }
  function errorText(error) {
    try { return String(error instanceof Error ? error.message : error).replace(/\s+/g,' ').slice(0,300); }
    catch { return 'Idle delivery failed'; }
  }
  function fail(record,error) {
    if (records.get(record.agent.id) !== record) return;
    record.enabled = false;
    record.lastError = errorText(error);
  }
  function clearIfEmpty() {
    if (records.size === 0 && timer !== null) { clearTimer(timer); timer = null; }
  }
  function drop(agent) {
    if (recordFor(agent)) records.delete(agent.id);
    clearIfEmpty();
  }
  function due(record) {
    return Math.max(record.lastActivity + record.config.idleMinutes * 60000,
      record.lastSent === null ? 0 : record.lastSent + record.config.cooldownMinutes * 60000);
  }
  function status(agent) {
    const record = recordFor(agent);
    if (!record) return {enabled:false,reason:'not-started'};
    const pausedReason = !record.enabled ? 'error'
      : record.unanswered >= record.config.maxUnanswered ? 'unanswered-limit' : null;
    let remaining = null;
    if (!pausedReason) {
      try { const value = now(); if (Number.isFinite(value) && value >= 0) remaining = Math.ceil(Math.max(0,due(record)-value)/1000); } catch {}
    }
    return {enabled:record.enabled,config:{...record.config},unanswered:record.unanswered,
      pausedReason,lastError:record.lastError,secondsUntilDue:remaining,timeZone};
  }
  function start(agent,options) {
    if (disposed) throw new Error('Idle controller is disposed');
    const config = validateIdleOptions(options);
    if (!isLive(agent)) throw new Error('Idle chat requires an exact live primary agent');
    if (!records.has(agent.id) && records.size >= 200) throw new Error('Idle session capacity reached (200)');
    const value = clock();
    if (timer === null) {
      const created = setTimer(tick,15000);
      try { created?.unref?.(); } catch (error) { clearTimer(created); throw error; }
      timer = created;
    }
    records.set(agent.id,{agent,config,enabled:true,unanswered:0,lastActivity:value,lastSent:null,lastError:null});
    return status(agent);
  }
  function stop(agent) { drop(agent); return status(agent); }
  function humanInput({agent,message}) {
    const record = recordFor(agent);
    if (!record?.enabled || message?.source?.kind !== 'user') return;
    try { record.lastActivity = clock(); record.unanswered = 0; }
    catch (error) { fail(record,error); }
  }
  function agentStatus({agent,status:next}) {
    const record = recordFor(agent);
    if (!record?.enabled || next !== 'idle' || agent.status !== 'idle') return;
    try { record.lastActivity = clock(); } catch (error) { fail(record,error); }
  }
  function agentDisposed({agent}) { drop(agent); }
  function tick() {
    if (disposed || ticking) return;
    ticking = true;
    try {
      let value, hour;
      try {
        value = clock();
        const wall = wallNow();
        if (!Number.isFinite(wall)) throw new Error('Invalid wall clock; idle chat paused');
        hour = new Date(wall).getHours();
        if (!Number.isFinite(hour)) throw new Error('Invalid wall clock; idle chat paused');
      } catch (error) {
        for (const record of records.values()) fail(record,error);
        return;
      }
      // Snapshot records: reentrant starts are considered only by a later tick.
      for (const record of [...records.values()]) {
        const {agent,config} = record;
        if (disposed || records.get(agent.id) !== record) continue;
        try {
          if (!isLive(agent)) { drop(agent); continue; }
          if (!record.enabled || record.unanswered >= config.maxUnanswered) continue;
          if (agent.status !== 'idle' || agent.inbox.nextTurn.length || agent.inbox.nextStep.length) continue;
          const quiet = config.quietStart < config.quietEnd
            ? hour >= config.quietStart && hour < config.quietEnd
            : config.quietStart > config.quietEnd && (hour >= config.quietStart || hour < config.quietEnd);
          if (quiet || value < due(record)) continue;
          const message = Object.freeze({
            id:randomId(),role:'user',
            content:Object.freeze([Object.freeze({type:'text',text:PROMPT})]),
            source:Object.freeze({kind:SOURCE})
          });
          record.unanswered++;
          record.lastSent = value;
          agent.followup(message);
        } catch (error) { fail(record,error); }
      }
    } finally { ticking = false; }
  }
  function dispose() {
    disposed = true;
    if (timer !== null) { clearTimer(timer); timer = null; }
    records.clear();
  }
  return {start,stop,status,humanInput,agentStatus,agentDisposed,tick,dispose};
}
