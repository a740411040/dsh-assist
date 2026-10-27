import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { attach } from './adapter.js';
import { attachIdle } from './idle-adapter.js';
import { IdleConsentStore } from './idle-store.js';

export const name = 'dsh-assist';
export const inject = ['systemPrompt', 'tools', 'agents'];
export function apply(ctx) {
  const home = process.env.DSH_ASSIST_HOME
    || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'dsh-assist');
  const defaultPack = JSON.parse(readFileSync(new URL('../packs/fish.json', import.meta.url), 'utf8'));
  attach(ctx, { home, defaultPack }, defineTool);
  attachIdle(ctx, defineTool, { persistence: new IdleConsentStore(home) });
}
