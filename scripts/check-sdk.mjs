import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { attach } from '../src/adapter.js';
import { attachIdle } from '../src/idle-adapter.js';

// Pass the installed host SDK entry to test its real schema compiler.
const sdkSpecifier = process.argv[2]
  ? pathToFileURL(resolve(process.argv[2])).href : '@deepseek-ai/dsh-tools';
const { defineTool } = await import(sdkSpecifier);
const root = resolve(import.meta.dirname, '..');
mkdirSync(join(root, '.work'), { recursive: true });
const home = mkdtempSync(join(root, '.work', 'sdk-check-'));
const tools = new Map(), disposers = [];
const agent = { id: 'sdk-check', session: { id: 'sdk-check', header: { origin: 'user' } } };
const ctx = {
  systemPrompt: { section() { return () => {}; } },
  tools: { register(tool) {
    assert.ok(!tools.has(tool.name), 'Duplicate tool name');
    tools.set(tool.name, tool);
    return () => tools.delete(tool.name);
  } },
  effect(fn) { const off = fn(); if (typeof off === 'function') disposers.push(off); return off; },
  on() { return () => {}; },
  agents: { get(id) { return id === agent.id ? agent : undefined; }, withoutInitiator(fn) { return fn(); } },
};
try {
  const defaultPack = JSON.parse(readFileSync(join(root, 'packs', 'fish.json'), 'utf8'));
  attach(ctx, { home, defaultPack }, defineTool);
  attachIdle(ctx, defineTool);
  assert.equal(tools.size, 11);
  for (const [name, fields] of [
    ['assist_remember', ['kind']],
    ['assist_checkpoint', ['ttlHours']],
    ['assist_recall', ['limit']],
    ['assist_idle_start', ['idleMinutes', 'cooldownMinutes', 'maxUnanswered', 'quietStart', 'quietEnd']],
  ]) {
    const required = tools.get(name).parameters.required ?? [];
    for (const field of fields) assert.ok(!required.includes(field), name + '.' + field + ' must be optional');
  }
  assert.ok(tools.get('assist_remember').parameters.required.includes('text'));
  const execution = { agent, signal: new AbortController().signal };
  await tools.get('assist_remember').execute({ text: 'SDK smoke test' }, execution);
  await tools.get('assist_checkpoint').execute({ summary: 'Optional TTL omitted' }, execution);
  const recalled = await tools.get('assist_recall').execute({ query: 'SDK' }, execution);
  assert.match(recalled, /SDK smoke test/);
  console.log(JSON.stringify({ sdk: sdkSpecifier, compiledTools: tools.size, optionalArguments: 'passed', idleStarted: false }));
} finally {
  for (const dispose of disposers.reverse()) dispose();
}
