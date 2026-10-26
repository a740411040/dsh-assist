#!/usr/bin/env node
import { openSync, closeSync, writeFileSync, fsyncSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { Store, validatePackage, readJsonFile, assertSafePath } from './core.js';

const HELP = [
  'dsh-assist 0.1.0 — persona packs and private local memory',
  'Usage: node src/cli.js <command> [args] [--home <absolute path>]',
  'init | list | status | validate <file>',
  'import <file> [--apply] [--include-memory]',
  'export <roleId> --out <file> [--include-memory]',
  'default <roleId> | use <sessionId> <roleId> | show <sessionId>',
  'remember <sessionId> <text> [--kind fact|preference|decision|inference]',
  'checkpoint <sessionId> <summary> [--ttl hours]',
  'recall <sessionId> <query> | resume <sessionId> <sourceSessionId>',
  'revise <sessionId> <entryId> <text>',
  'Import is preview-only unless --apply is specified. Export never overwrites.',
].join('\n');
const COMMANDS = {
  init:[0,[]], list:[0,[]], status:[0,[]], validate:[1,[]],
  import:[1,['apply','include-memory']], export:[1,['out','include-memory']],
  default:[1,[]], use:[2,[]], show:[1,[]], remember:[2,['kind']],
  checkpoint:[2,['ttl']], recall:[2,[]], resume:[2,[]], revise:[3,[]],
};
function parse(argv) {
  const positional=[], flags={}; let literal=false;
  for(let i=0;i<argv.length;i++) {
    const arg=argv[i];
    if(arg==='--' && !literal) { literal=true; continue; }
    if(arg.startsWith('--')&&!literal) {
      const key=arg.slice(2);
      if(Object.hasOwn(flags,key)) throw new Error('Duplicate flag --'+key);
      if(['help','apply','include-memory'].includes(key)) flags[key]=true;
      else if(['home','out','kind','ttl'].includes(key)) {
        if(i+1===argv.length||argv[i+1].startsWith('--')) throw new Error('Missing value for --'+key);
        flags[key]=argv[++i];
      } else throw new Error('Unknown flag --'+key);
    } else positional.push(arg);
  }
  if(flags.help) {
    if(positional.length || Object.keys(flags).some(k=>!['help','home'].includes(k))) throw new Error('--help cannot be combined with a command');
    return {help:true};
  }
  const [command,...args]=positional, spec=COMMANDS[command];
  if(!spec) throw new Error('Unknown or missing command. Use --help.');
  if(args.length!==spec[0]) throw new Error('Wrong number of arguments for '+command);
  for(const key of Object.keys(flags)) if(key!=='home'&&!spec[1].includes(key)) throw new Error('Flag --'+key+' is not valid for '+command);
  if(command==='export'&&!flags.out) throw new Error('export requires --out');
  return {command,args,flags};
}
function main() {
  const parsed=parse(process.argv.slice(2));
  if(parsed.help) { console.log(HELP); return; }
  const {command,args,flags}=parsed;
  if(command==='validate') {
    const pack=validatePackage(readJsonFile(resolve(args[0])));
    console.log(JSON.stringify({valid:true,id:pack.role.id,private:pack.private},null,2)); return;
  }
  const home=flags.home ?? (process.env.DSH_ASSIST_HOME
    ||join(process.env.DSH_HOME||join(homedir(),'.dsh'),'dsh-assist'));
  const store=new Store(home); let result;
  switch(command) {
    case 'init': result=store.init(JSON.parse(readFileSync(new URL('../packs/fish.json',import.meta.url),'utf8'))); break;
    case 'list': result=store.list(); break;
    case 'status': result=store.status(); break;
    case 'import': result=store.importPackage(readJsonFile(resolve(args[0])),{apply:!!flags.apply,includeMemory:!!flags['include-memory']}); break;
    case 'export': {
      const pack=store.exportPackage(args[0],{includeMemory:!!flags['include-memory']});
      const output=assertSafePath(resolve(flags.out),{leafFile:true});
      const fd=openSync(output,'wx',0o600);
      try { writeFileSync(fd,JSON.stringify(pack,null,2)+'\n','utf8'); fsyncSync(fd); } finally { closeSync(fd); }
      result={exported:output,id:pack.role.id,private:pack.private}; break;
    }
    case 'default': result=store.setDefault(args[0]); break;
    case 'use': result=store.bind(args[0],args[1]); break;
    case 'show': result=store.context(args[0]); break;
    case 'remember': result=store.remember(args[0],args[1],flags.kind??'fact'); break;
    case 'checkpoint': result=store.checkpoint(args[0],args[1],flags.ttl===undefined?72:Number(flags.ttl)); break;
    case 'recall': result=store.recall(args[0],args[1]); break;
    case 'resume': result=store.resume(args[0],args[1]); break;
    case 'revise': result=store.revise(args[0],args[1],args[2]); break;
  }
  console.log(JSON.stringify(result,null,2));
}
try { main(); }
catch(error) {
  console.error('dsh-assist: '+(error instanceof Error?error.message:String(error)));
  process.exitCode=1;
}
