import { mkdtempSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
export const root = resolve(import.meta.dirname, '..');
export const role = JSON.parse(readFileSync(join(root, 'packs/fish.json'), 'utf8'));
export function temp() {
  const dir = join(root, '.work', 'test-runs');
  mkdirSync(dir, { recursive: true });
  return mkdtempSync(join(dir, 'run-'));
}
export function secondRole() { return { ...role, id: 'owl', name: '猫头鹰' }; }
