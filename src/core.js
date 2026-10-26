import {
  constants, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export const LIMITS = Object.freeze({
  bytes: 2 * 1024 * 1024, roles: 32, sessions: 200, entries: 200,
  text: 2000, summary: 4000,
});
const KINDS = new Set(['fact', 'preference', 'decision', 'inference']);
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
const own = (obj, key) => Object.hasOwn(obj, key);
const copy = value => structuredClone(value);
function fail(message) { throw new Error(message); }
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(label + ' must be an object');
  for (const key of Object.keys(value)) if (FORBIDDEN.has(key)) fail('Forbidden key: ' + key);
  return value;
}
function keys(value, allowed, required, label) {
  object(value, label);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(label + ': unknown field ' + key);
  for (const key of required) if (!own(value, key)) fail(label + ': missing ' + key);
}
function text(value, label, max, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())
      || value.includes('\0')) fail(label + ': invalid text (maximum ' + max + ' characters)');
  return value;
}
function integer(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(label + ': out of range');
  return value;
}
function iso(value, label) {
  text(value, label, 32);
  if (!Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(label + ': invalid ISO date');
  return value;
}
function sessionId(value) {
  text(value, 'sessionId', 256);
  if (FORBIDDEN.has(value) || /[\u0000-\u001f]/u.test(value)) fail('Invalid sessionId');
  return value;
}
function roleId(value) {
  if (typeof value !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(value)
    || FORBIDDEN.has(value) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(value)) fail('Invalid role id');
  return value;
}
function bounded(value) {
  let nodes = 0;
  function visit(v, depth) {
    if (depth > 14 || ++nodes > 60000) fail('JSON is too complex');
    if (v && typeof v === 'object') {
      if (!Array.isArray(v)) object(v, 'JSON');
      for (const child of Object.values(v)) visit(child, depth + 1);
    }
  }
  visit(value, 0);
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > LIMITS.bytes) fail('JSON exceeds size limit');
}
export function validateRole(value) {
  keys(value, ['format','version','id','name','persona','style','greeting','memoryPolicy'],
    ['format','version','id','name','persona'], 'role');
  if (value.format !== 'dsh-assist/role' || value.version !== 1) fail('Unsupported role format/version');
  const role = {
    format: 'dsh-assist/role', version: 1, id: roleId(value.id),
    name: text(value.name, 'name', 80), persona: text(value.persona, 'persona', 12000),
  };
  for (const key of ['style','greeting','memoryPolicy']) {
    if (own(value, key)) role[key] = text(value[key], key, 4000, true);
  }
  return role;
}
function entry(value) {
  keys(value, ['id','text','kind','createdAt','updatedAt'], ['id','text','kind','createdAt'], 'entry');
  text(value.id, 'entry.id', 80);
  if (!/^[a-zA-Z0-9-]+$/.test(value.id)) fail('Invalid entry ID');
  text(value.text, 'entry.text', LIMITS.text);
  if (!KINDS.has(value.kind)) fail('Invalid memory kind');
  iso(value.createdAt, 'createdAt');
  if (own(value,'updatedAt')) iso(value.updatedAt,'updatedAt');
  return copy(value);
}
function checkpoint(value) {
  keys(value, ['summary','updatedAt','expiresAt'], ['summary','updatedAt','expiresAt'], 'checkpoint');
  text(value.summary, 'summary', LIMITS.summary);
  iso(value.updatedAt,'updatedAt'); iso(value.expiresAt,'expiresAt');
  const ttl = Date.parse(value.expiresAt) - Date.parse(value.updatedAt);
  if (ttl < 3600000 || ttl > 720 * 3600000) fail('Invalid checkpoint expiry');
  return copy(value);
}
function memory(value) {
  keys(value,['longTerm','shortTerm'],['longTerm','shortTerm'],'memory');
  if (!Array.isArray(value.longTerm) || value.longTerm.length > LIMITS.entries) fail('Too many long-term entries');
  const seen = new Set();
  const longTerm = value.longTerm.map(v => {
    const item = entry(v);
    if (seen.has(item.id)) fail('Duplicate memory ID');
    seen.add(item.id); return item;
  });
  object(value.shortTerm,'shortTerm');
  if (Object.keys(value.shortTerm).length > LIMITS.sessions) fail('Too many checkpoints');
  const shortTerm = {};
  for (const [id, v] of Object.entries(value.shortTerm)) shortTerm[sessionId(id)] = checkpoint(v);
  return {longTerm,shortTerm};
}
export function validatePackage(value) {
  bounded(value);
  if (value?.format === 'dsh-assist/role') {
    return {format:'dsh-assist/package',version:1,private:false,role:validateRole(value)};
  }
  keys(value,['format','version','private','role','memory'],['format','version','private','role'],'package');
  if (value.format !== 'dsh-assist/package' || value.version !== 1 || typeof value.private !== 'boolean')
    fail('Unsupported package format/version');
  if (value.private !== own(value,'memory')) fail('Private flag and memory must agree');
  const pack = {format:value.format,version:1,private:value.private,role:validateRole(value.role)};
  if (value.private) pack.memory = memory(value.memory);
  return pack;
}

/** Reject link/junction traversal. Does not defend against malicious same-user races. */
export function assertSafePath(path, { leafFile = false } = {}) {
  if (typeof path !== 'string' || !path || path.includes('\0')) fail('Invalid filesystem path');
  const absolute = resolve(path), root = parse(absolute).root;
  let part = root;
  const components = absolute.slice(root.length).split(/[\\/]/).filter(Boolean);
  for (let i = 0; i < components.length; i++) {
    part = join(part, components[i]);
    let st;
    try { st = lstatSync(part); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    if (st.isSymbolicLink()) fail('Symlink/junction path is not allowed: ' + part);
    const last = i === components.length - 1;
    if ((!last || !leafFile) && !st.isDirectory()) fail('Expected directory: ' + part);
    if (last && leafFile && (!st.isFile() || st.nlink > 1)) fail('Expected regular, unlinked file: ' + part);
  }
  return absolute;
}
export function readJsonFile(path, maxBytes = LIMITS.bytes) {
  integer(maxBytes,'maxBytes',1,LIMITS.bytes);
  const absolute = assertSafePath(path, {leafFile:true});
  const st = lstatSync(absolute);
  if (!st.isFile() || st.size > maxBytes) fail('File exceeds size limit or is not regular');
  const buf = readFileSync(absolute);
  if (buf.length > maxBytes) fail('File exceeds size limit');
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buf));
  } catch (e) { fail('Invalid UTF-8 JSON: ' + e.message); }
  bounded(value);
  return value;
}
function blank() {
  return {format:'dsh-assist/state',version:1,revision:0,defaultRole:null,roles:{},sessions:{}};
}
function validateState(value) {
  bounded(value);
  keys(value,['format','version','revision','defaultRole','roles','sessions'],
    ['format','version','revision','defaultRole','roles','sessions'],'state');
  if (value.format !== 'dsh-assist/state' || value.version !== 1) fail('Unsupported state format/version');
  integer(value.revision,'revision',0,Number.MAX_SAFE_INTEGER-1);
  object(value.roles,'roles'); object(value.sessions,'sessions');
  if (Object.keys(value.roles).length > LIMITS.roles || Object.keys(value.sessions).length > LIMITS.sessions)
    fail('State capacity exceeded');
  for (const [id, data] of Object.entries(value.roles)) {
    roleId(id);
    keys(data,['role','longTerm','shortTerm'],['role','longTerm','shortTerm'],'stored role');
    if (validateRole(data.role).id !== id) fail('Role ID mismatch');
    memory({longTerm:data.longTerm,shortTerm:data.shortTerm});
  }
  roleId(value.defaultRole);
  if (Object.keys(value.roles).length === 0 || !own(value.roles,value.defaultRole))
    fail('Invalid default role');
  for (const [id, v] of Object.entries(value.sessions)) {
    sessionId(id);
    keys(v,['id','roleId','updatedAt'],['id','roleId','updatedAt'],'binding');
    roleId(v.roleId);
    if (v.id !== id || !own(value.roles,v.roleId)) fail('Invalid session binding');
    iso(v.updatedAt,'binding updatedAt');
  }
  return value;
}

export class Store {
  constructor(home, {now = () => Date.now()} = {}) {
    if (typeof home !== 'string' || !isAbsolute(home)) fail('home must be absolute');
    if (typeof now !== 'function') fail('now must be a function');
    this.home = resolve(home); this.now = now;
    this.file = join(this.home,'state.json'); this.lock = join(this.home,'write.lock');
  }
  #date() {
    const n = this.now();
    if (!Number.isFinite(n)) fail('Invalid clock');
    return new Date(n).toISOString();
  }
  #read(optional = false) {
    assertSafePath(this.home);
    assertSafePath(this.file,{leafFile:true});
    if (!existsSync(this.file)) {
      if (optional) return null;
      fail('Store is not initialized; run init or import --apply');
    }
    return validateState(readJsonFile(this.file));
  }
  #transaction(fn, allowAbsent = false) {
    assertSafePath(this.home);
    mkdirSync(this.home,{recursive:true,mode:0o700});
    assertSafePath(this.home); assertSafePath(this.lock,{leafFile:true});
    const token = JSON.stringify({pid:process.pid,nonce:randomUUID(),createdAt:this.#date()});
    let fd;
    try { fd = openSync(this.lock, constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY, 0o600); }
    catch (e) { if(e.code==='EEXIST') fail('BUSY: another writer owns write.lock; retry after it finishes'); throw e; }
    let temporary;
    try {
      writeFileSync(fd,token,'utf8'); fsyncSync(fd);
      const old = this.#read(allowAbsent);
      const data = old ?? blank();
      const {result,changed = true} = fn(data);
      if (!changed) return copy(result);
      data.revision++;
      validateState(data);
      const encoded = JSON.stringify(data,null,2)+'\n';
      if(Buffer.byteLength(encoded,'utf8')>LIMITS.bytes) fail('State exceeds size limit; no write committed');
      temporary = join(this.home,'.state-'+randomUUID()+'.tmp');
      const tmpFd = openSync(temporary,'wx',0o600);
      try { writeFileSync(tmpFd,encoded,'utf8'); fsyncSync(tmpFd); }
      finally { closeSync(tmpFd); }
      assertSafePath(this.file,{leafFile:true});
      renameSync(temporary,this.file); temporary = null;
      return copy(result);
    } finally {
      closeSync(fd);
      if (temporary && existsSync(temporary)) unlinkSync(temporary);
      // Only remove a lock this transaction actually created and still owns.
      if (existsSync(this.lock) && !lstatSync(this.lock).isSymbolicLink()
          && readFileSync(this.lock,'utf8') === token) unlinkSync(this.lock);
    }
  }
  #binding(data,id,chosen) {
    sessionId(id);
    if(chosen!==undefined) { roleId(chosen); if(!own(data.roles,chosen)) fail('Unknown role: '+chosen); }
    if(!own(data.sessions,id) && Object.keys(data.sessions).length>=LIMITS.sessions) fail('Session capacity reached');
    if(!own(data.sessions,id) || chosen!==undefined) {
      data.sessions[id]={id,roleId:chosen ?? data.defaultRole,updatedAt:this.#date()};
    }
    return data.sessions[id];
  }
  #changeSession(id,fn) {
    sessionId(id);
    return this.#transaction(data => {
      const binding=this.#binding(data,id);
      const result=fn(data.roles[binding.roleId],data,binding);
      binding.updatedAt=this.#date();
      return {result};
    });
  }
  init(role) {
    const normalized=validateRole(role);
    if(this.#read(true)) return this.status();
    this.#transaction(data => {
      if(data.defaultRole!==null) return {result:null,changed:false};
      data.roles[normalized.id]={role:normalized,longTerm:[],shortTerm:{}};
      data.defaultRole=normalized.id;
      return {result:null};
    },true);
    return this.status();
  }
  status() {
    const s=this.#read();
    return {revision:s.revision,defaultRole:s.defaultRole,
      roles:Object.values(s.roles).map(v=>({id:v.role.id,name:v.role.name})),
      sessions:Object.values(s.sessions)};
  }
  list() { return this.status().roles; }
  importPackage(value,{apply=false,includeMemory=false}={}) {
    const p=validatePackage(value), existing=this.#read(true);
    const preview={id:p.role.id,name:p.role.name,private:p.private,exists:existing?own(existing.roles,p.role.id):false};
    if(!apply) return preview;
    if(p.private && !includeMemory) fail('Private import requires --include-memory');
    this.#transaction(data => {
      if(own(data.roles,p.role.id)) fail('Role already exists; import never overwrites: '+p.role.id);
      if(Object.keys(data.roles).length>=LIMITS.roles) fail('Role capacity reached');
      data.roles[p.role.id]={role:p.role,...(p.private?copy(p.memory):{longTerm:[],shortTerm:{}})};
      data.defaultRole ??= p.role.id;
      return {result:null};
    },true);
    return {...preview,applied:true};
  }
  exportPackage(id,{includeMemory=false}={}) {
    roleId(id);
    const data=this.#read();
    if(!own(data.roles,id)) fail('Unknown role: '+id);
    const r=data.roles[id], p={format:'dsh-assist/package',version:1,private:Boolean(includeMemory),role:validateRole(r.role)};
    if(includeMemory) p.memory=copy({longTerm:r.longTerm,shortTerm:r.shortTerm});
    return p;
  }
  setDefault(id) {
    roleId(id);
    this.#transaction(data=>{
      if(!own(data.roles,id)) fail('Unknown role: '+id);
      const changed=data.defaultRole!==id; data.defaultRole=id;
      return {result:null,changed};
    });
    return this.status();
  }
  bind(id,role) {
    sessionId(id);
    const s=this.#read();
    if(own(s.sessions,id) && (role===undefined || s.sessions[id].roleId===role)) return copy(s.sessions[id]);
    return this.#transaction(data=>({result:this.#binding(data,id,role)}));
  }
  context(id) {
    sessionId(id); this.bind(id);
    const s=this.#read(), r=s.roles[s.sessions[id].roleId], short=r.shortTerm[id];
    return {role:copy(r.role),revision:s.revision,longTerm:copy(r.longTerm.slice(-30)),
      shortTerm:short && Date.parse(short.expiresAt)>this.now()?copy(short):null};
  }
  remember(id,value,kind='fact') {
    text(value,'text',LIMITS.text); if(!KINDS.has(kind)) fail('Invalid memory kind');
    return this.#changeSession(id,r=>{
      if(r.longTerm.length>=LIMITS.entries) fail('Long-term entry capacity reached; revise existing entries or export and reorganize');
      const item={id:randomUUID(),text:value,kind,createdAt:this.#date()}; r.longTerm.push(item); return item;
    });
  }
  checkpoint(id,summary,ttlHours=72) {
    text(summary,'summary',LIMITS.summary);
    if(typeof ttlHours!=='number'||!Number.isFinite(ttlHours)||ttlHours<1||ttlHours>720) fail('ttlHours out of range 1..720');
    return this.#changeSession(id,r=>{
      if(!own(r.shortTerm,id) && Object.keys(r.shortTerm).length>=LIMITS.sessions) fail('Checkpoint capacity reached');
      const updatedAt=this.#date();
      return r.shortTerm[id]={summary,updatedAt,expiresAt:new Date(Date.parse(updatedAt)+ttlHours*3600000).toISOString()};
    });
  }
  recall(id,query,limit=5) {
    text(query,'query',2000,true); integer(limit,'limit',1,20);
    this.bind(id); const data=this.#read(), r=data.roles[data.sessions[id].roleId];
    const terms=query.toLocaleLowerCase().trim().split(/\s+/u).filter(Boolean);
    return copy(r.longTerm.slice().reverse().filter(e=>!terms.length||terms.some(t=>e.text.toLocaleLowerCase().includes(t))).slice(0,limit));
  }
  resume(id,sourceId) {
    sessionId(sourceId);
    return this.#changeSession(id,(r,data,b)=>{
      if(!own(data.sessions,sourceId) || data.sessions[sourceId].roleId!==b.roleId) fail('Source session must exist with the same role');
      const source=r.shortTerm[sourceId];
      if(!source||Date.parse(source.expiresAt)<=this.now()) fail('Source checkpoint is missing or expired');
      r.shortTerm[id]=copy(source); return r.shortTerm[id];
    });
  }
  revise(id,entryId,value) {
    text(value,'text',LIMITS.text); text(entryId,'entryId',80);
    return this.#changeSession(id,r=>{
      const found=r.longTerm.find(e=>e.id===entryId);
      if(!found) fail('Unknown entry in this role');
      found.text=value; found.updatedAt=this.#date(); return found;
    });
  }
}
