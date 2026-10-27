import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { IdleConsentStore } from '../src/idle-store.js';
import { createIdleController } from '../src/idle.js';
import { attachIdle } from '../src/idle-adapter.js';
import { idleFixture, quick } from './idle-helpers.js';
import { temp } from './helpers.js';

function setup(home = temp(), existingAgent = true) {
  const f = idleFixture(), persistence = new IdleConsentStore(home);
  const a = existingAgent ? f.agent() : null;
  const c = createIdleController({ agents: f.agents, ...f.dependencies, persistence });
  return { ...f, home, persistence, a, c };
}

test('only opted-in sessions recover with their options and full waiting period', () => {
  const first = setup();
  first.c.start(first.a, quick); first.c.dispose();
  const second = setup(first.home), other = second.agent('new-chat');
  assert.equal(second.c.status(second.a).restored, true);
  assert.deepEqual(second.c.status(second.a).config, quick);
  assert.equal(second.c.status(other).enabled, false);
  second.advance(119999); second.c.tick(); assert.equal(second.a.calls.length, 0);
  second.advance(1); second.c.tick(); assert.equal(second.a.calls.length, 1);
  second.c.dispose();
});

test('restart retains unanswered quota, and a genuine human reply resets it durably', () => {
  const first = setup(); first.c.start(first.a, { ...quick, maxUnanswered: 1 });
  first.advance(60000); first.c.tick(); assert.equal(first.a.calls.length, 1);
  first.c.dispose();
  const second = setup(first.home);
  second.advance(3600000); second.c.tick();
  assert.equal(second.a.calls.length, 0);
  assert.equal(second.c.status(second.a).pausedReason, 'unanswered-limit');
  second.c.humanInput({ agent: second.a, message: { source: { kind: 'user' } } });
  second.c.dispose();
  const third = setup(first.home);
  assert.equal(third.c.status(third.a).unanswered, 0);
  third.advance(120000); third.c.tick(); assert.equal(third.a.calls.length, 1);
  third.c.dispose();
});

test('stop forgets consent across restart, including before a saved session has loaded', () => {
  const first = setup(); first.c.start(first.a, quick); first.c.dispose();
  const second = setup(first.home, false);
  const loaded = second.agent();
  second.c.stop(loaded); second.c.dispose();
  const third = setup(first.home);
  assert.equal(third.c.status(third.a).enabled, false);
  assert.equal(third.timers.size, 0);
  assert.equal(third.persistence.load().size, 0);
  third.c.dispose();
});

test('saved sessions wait for the exact live primary agent and ignore children', () => {
  const first = setup(); first.c.start(first.a, quick); first.c.dispose();
  const second = setup(first.home, false);
  second.advance(999999); second.c.tick();
  const child = second.agent(); child.session.header.origin = 'subagent';
  second.c.tick(); assert.equal(second.c.status(child).enabled, false);
  const primary = second.agent(); second.c.tick();
  assert.equal(second.c.status(primary).restored, true);
  assert.equal(primary.calls.length, 0);
  second.advance(120000); second.c.tick(); assert.equal(primary.calls.length, 1);
  second.c.dispose();
});

test('unload retains consent but clears every timer and prevents pending callbacks', () => {
  const f = idleFixture(), p = new IdleConsentStore(temp()), a = f.agent();
  attachIdle(f.ctx, x => x, { ...f.dependencies, persistence: p });
  f.tools.get('assist_idle_start').execute(quick, { agent: a });
  const pending = [...f.timers.values()][0].fn;
  for (const off of f.cleanup) off();
  assert.equal(p.load().size, 1); assert.equal(f.timers.size, 0);
  f.advance(900000); pending(); assert.equal(a.calls.length, 0);
  assert.equal(f.tools.size, 0);
});

test('delivery errors remain paused after restart instead of automatically retrying', () => {
  const first = setup(); first.c.start(first.a, quick);
  first.a.followup = () => { throw new Error('delivery unavailable'); };
  first.advance(60000); first.c.tick(); first.c.dispose();
  const second = setup(first.home);
  assert.equal(second.c.status(second.a).enabled, false);
  assert.equal(second.c.status(second.a).pausedReason, 'error');
  second.advance(900000); second.c.tick(); assert.equal(second.a.calls.length, 0);
  second.c.start(second.a, quick);
  assert.equal(second.c.status(second.a).enabled, true);
  second.c.dispose();
});

test('quota is committed before submission; failed persistence never submits', () => {
  const f = setup(); f.c.start(f.a, quick);
  f.a.followup = message => {
    assert.equal(f.persistence.load().get(f.a.id).unanswered, 1);
    f.a.calls.push(message);
  };
  f.advance(60000); f.c.tick(); assert.equal(f.a.calls.length, 1);
  f.persistence.update = () => { throw new Error('disk unavailable'); };
  f.advance(120000); f.c.tick();
  assert.equal(f.a.calls.length, 1);
  assert.equal(f.c.status(f.a).enabled, false); f.c.dispose();
});

test('another controller cannot revive a stopped consent or overwrite a new opt-in', () => {
  const first = setup(); first.c.start(first.a, quick);
  const second = setup(first.home), stale = second.persistence.load().get('chat');
  first.c.stop(first.a);
  second.advance(900000); second.c.tick(); assert.equal(second.a.calls.length, 0);
  assert.equal(second.c.status(second.a).enabled, false);
  first.c.start(first.a, quick);
  assert.throws(() => second.persistence.update(stale, { unanswered: 1 }), /changed elsewhere/);
  assert.equal(first.persistence.load().get('chat').unanswered, 0);
  first.c.dispose(); second.c.dispose();
});

test('optimistic revisions reject simultaneous reservations', () => {
  const p = new IdleConsentStore(temp());
  const original = p.start('chat', quick);
  p.update(original, { unanswered: 1 });
  assert.throws(() => p.update(original, { unanswered: 1 }), /changed elsewhere/);
  assert.equal(p.load().get('chat').unanswered, 1);
});

test('corrupt consent data fails closed without overwriting it', () => {
  const home = temp(), file = join(home, 'idle-consents.json');
  writeFileSync(file, '{bad json', 'utf8');
  const f = setup(home);
  assert.equal(f.c.status(f.a).reason, 'persistence-error');
  assert.equal(f.timers.size, 0);
  assert.throws(() => f.c.start(f.a, quick));
  assert.equal(readFileSync(file, 'utf8'), '{bad json');
  assert.equal(f.timers.size, 0); f.c.dispose();
});

test('failed durable stop stops this run and does not silently report success', () => {
  const f = setup(); f.c.start(f.a, quick);
  f.persistence.remove = () => { throw new Error('write refused'); };
  assert.throws(() => f.c.stop(f.a), /Stopped for this run, but could not save stop/);
  f.advance(900000); f.c.tick(); assert.equal(f.a.calls.length, 0);
  assert.equal(f.c.status(f.a).enabled, false); f.c.dispose();
});

test('consent validation bounds records and does not touch persona state or a foreign lock', () => {
  const home = temp(), p = new IdleConsentStore(home);
  writeFileSync(join(home, 'state.json'), 'sentinel-persona-state', 'utf8');
  p.start('chat', quick);
  assert.equal(readFileSync(join(home, 'state.json'), 'utf8'), 'sentinel-persona-state');
  writeFileSync(p.lock, 'someone-else', 'utf8');
  assert.throws(() => p.remove('chat'), /busy/);
  assert.equal(readFileSync(p.lock, 'utf8'), 'someone-else');
  assert.ok(existsSync(p.file));
  const state = JSON.parse(readFileSync(p.file, 'utf8'));
  state.items[0].unanswered = 100;
  writeFileSync(p.file, JSON.stringify(state), 'utf8');
  assert.throws(() => p.load(), /Invalid idle consent state/);
});

test('the first human input after session load resets a saved cap before the discovery tick', () => {
  const first = setup(); first.c.start(first.a, { ...quick, maxUnanswered: 1 });
  first.advance(60000); first.c.tick(); first.c.dispose();
  const second = setup(first.home, false), a = second.agent();
  second.c.humanInput({ agent: a, message: { source: { kind: 'user' } } });
  assert.equal(second.c.status(a).unanswered, 0);
  assert.equal(second.persistence.load().get('chat').unanswered, 0);
  second.advance(120000); second.c.tick(); assert.equal(a.calls.length, 1);
  second.c.dispose();
});

for (const reentrantHuman of [false, true]) {
  test(`failed delivery and failed pause write remain paused after restart (human=${reentrantHuman})`, () => {
    const first = setup(); first.c.start(first.a, quick);
    first.a.followup = () => {
      assert.equal(first.persistence.load().get('chat').paused, true);
      if (reentrantHuman) first.c.humanInput({ agent: first.a, message: { source: { kind: 'user' } } });
      first.persistence.update = () => { throw new Error('disk unavailable'); };
      throw new Error('delivery unavailable');
    };
    first.advance(60000); first.c.tick();
    assert.match(first.c.status(first.a).lastError, /pause could not be saved/);
    assert.equal(first.persistence.load().get('chat').paused, true);
    first.c.dispose();
    const second = setup(first.home);
    second.advance(900000); second.c.tick();
    assert.equal(second.c.status(second.a).enabled, false);
    assert.equal(second.a.calls.length, 0); second.c.dispose();
  });
}

test('failed confirmation write after successful submission cannot automatically retry', () => {
  const first = setup(); first.c.start(first.a, quick);
  first.a.followup = message => {
    first.a.calls.push(message);
    first.persistence.update = () => { throw new Error('disk unavailable'); };
  };
  first.advance(60000); first.c.tick();
  assert.equal(first.a.calls.length, 1);
  assert.equal(first.persistence.load().get('chat').paused, true);
  first.c.dispose();
  const second = setup(first.home);
  second.advance(900000); second.c.tick();
  assert.equal(second.c.status(second.a).enabled, false);
  assert.equal(second.a.calls.length, 0); second.c.dispose();
});

for (const action of ['stop', 'start']) {
  test(`submission does not overwrite a reentrant ${action}`, () => {
    const first = setup(); first.c.start(first.a, quick);
    first.a.followup = () => first.c[action](first.a, quick);
    first.advance(60000); first.c.tick(); first.c.dispose();
    const second = setup(first.home);
    assert.equal(second.c.status(second.a).enabled, action === 'start');
    if (action === 'start') assert.equal(second.c.status(second.a).unanswered, 0);
    second.c.dispose();
  });
}