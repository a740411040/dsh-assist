import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateRole } from '../src/core.js';
import { validateIdleOptions } from '../src/idle.js';
const root = new URL('../', import.meta.url);
let checked=0;
for (const dir of ['src','test','scripts']) {
  for (const name of readdirSync(new URL(dir+'/',root))) {
    if (!/\.(m?js)$/.test(name)) continue;
    const file=new URL(dir+'/'+name,root);
    const result=spawnSync(process.execPath,['--check',fileURLToPath(file)],{encoding:'utf8'});
    if(result.status!==0) { process.stderr.write(result.stderr); process.exit(1); }
    checked++;
  }
}
for (const name of readdirSync(new URL('packs/',root))) {
  if(name.endsWith('.json')) validateRole(JSON.parse(readFileSync(new URL('packs/'+name,root),'utf8')));
}
validateIdleOptions(JSON.parse(readFileSync(new URL('examples/idle-settings.json',root),'utf8')));
console.log(JSON.stringify({syntaxFiles:checked,examplePacks:'valid',idleExample:'valid'}));
