import { closeSync, constants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertSafePath, readJsonFile } from './core.js';
import { validateIdleOptions } from './idle.js';

const FORMAT = 'dsh-assist/idle-consents';
const clone = value => structuredClone(value);
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key)))
    throw new Error('Invalid idle consent record');
}
function validId(id) {
  if (typeof id !== 'string' || !id || id.length > 256 || /[\u0000-\u001f]/u.test(id))
    throw new Error('Invalid idle session ID');
}
function validate(state) {
  exact(state, ['format', 'version', 'items']);
  if (state.format !== FORMAT || state.version !== 1 || !Array.isArray(state.items) || state.items.length > 200)
    throw new Error('Unsupported or oversized idle consent store');
  const ids = new Set();
  for (const item of state.items) {
    exact(item, ['id', 'token', 'revision', 'config', 'unanswered', 'paused']);
    validId(item.id);
    if (ids.has(item.id)) throw new Error('Duplicate idle session ID');
    ids.add(item.id);
    if (typeof item.token !== 'string' || !/^[0-9a-f-]{36}$/u.test(item.token)
        || !Number.isSafeInteger(item.revision) || item.revision < 0 || item.revision >= Number.MAX_SAFE_INTEGER
        || !Number.isInteger(item.unanswered) || item.unanswered < 0 || item.unanswered > 5
        || typeof item.paused !== 'boolean') throw new Error('Invalid idle consent state');
    const config = validateIdleOptions(item.config);
    if (Object.keys(item.config).length !== Object.keys(config).length) throw new Error('Incomplete idle options');
  }
  return state;
}

export class IdleConsentStore {
  constructor(home) {
    if (typeof home !== 'string' || !isAbsolute(home)) throw new Error('Idle home must be absolute');
    this.home = resolve(home);
    this.file = join(this.home, 'idle-consents.json');
    this.lock = join(this.home, 'idle-consents.lock');
  }
  #read() {
    assertSafePath(this.home);
    assertSafePath(this.file, { leafFile: true });
    return existsSync(this.file) ? validate(readJsonFile(this.file, 524288))
      : { format: FORMAT, version: 1, items: [] };
  }
  load() { return new Map(this.#read().items.map(item => [item.id, clone(item)])); }
  #change(change) {
    assertSafePath(this.home);
    mkdirSync(this.home, { recursive: true, mode: 0o700 });
    assertSafePath(this.home);
    assertSafePath(this.lock, { leafFile: true });
    const token = randomUUID();
    let fd;
    try { fd = openSync(this.lock, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600); }
    catch (error) {
      if (error.code === 'EEXIST') throw new Error('Idle consent store is busy; retry after its writer finishes');
      throw error;
    }
    let temporary;
    try {
      writeFileSync(fd, token, 'utf8'); fsyncSync(fd);
      const state = this.#read();
      const { result, changed = true } = change(state);
      if (!changed) return clone(result);
      validate(state);
      const text = JSON.stringify(state, null, 2) + '\n';
      if (Buffer.byteLength(text) > 524288) throw new Error('Idle consent store is too large');
      temporary = join(this.home, '.idle-' + randomUUID() + '.tmp');
      const output = openSync(temporary, 'wx', 0o600);
      try { writeFileSync(output, text, 'utf8'); fsyncSync(output); } finally { closeSync(output); }
      assertSafePath(this.file, { leafFile: true });
      renameSync(temporary, this.file); temporary = null;
      return clone(result);
    } finally {
      closeSync(fd);
      if (temporary && existsSync(temporary)) unlinkSync(temporary);
      if (existsSync(this.lock) && !lstatSync(this.lock).isSymbolicLink()
          && readFileSync(this.lock, 'utf8') === token) unlinkSync(this.lock);
    }
  }
  start(id, options) {
    validId(id);
    const config = validateIdleOptions(options);
    return this.#change(state => {
      const index = state.items.findIndex(item => item.id === id);
      const item = { id, token: randomUUID(), revision: 0, config, unanswered: 0, paused: false };
      if (index < 0) state.items.push(item); else state.items[index] = item;
      return { result: item };
    });
  }
  update(expected, changes) {
    return this.#change(state => {
      const item = state.items.find(item => item.id === expected.id);
      if (!item || item.token !== expected.token || item.revision !== expected.revision)
        throw new Error('Idle consent changed elsewhere; this controller is paused');
      Object.assign(item, changes, { revision: item.revision + 1 });
      return { result: item };
    });
  }
  remove(id) {
    validId(id);
    return this.#change(state => {
      const count = state.items.length;
      state.items = state.items.filter(item => item.id !== id);
      return { result: true, changed: state.items.length !== count };
    });
  }
}
