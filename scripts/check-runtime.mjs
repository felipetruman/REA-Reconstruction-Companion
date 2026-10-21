import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let count=0;
function check(dir) {
  for(const item of fs.readdirSync(dir,{withFileTypes:true})) {
    const file=path.join(dir,item.name);
    if(item.isDirectory())check(file);
    else if(file.endsWith('.mjs')) {
      const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
      if(result.status!==0)throw new Error(result.stderr);
      const source=fs.readFileSync(file,'utf8');
      if(/\beval\s*\(|new\s+Function\s*\(|shell\s*:\s*true/.test(source))throw new Error(`Unsafe runtime execution primitive: ${file}`);
      count++;
    }
  }
}
check(path.join(root,'src'));
JSON.parse(fs.readFileSync(path.join(root,'schemas/records.json')));
console.log(`Syntax and execution-policy checks passed: ${count} ESM modules. No TypeScript compilation is required for native JavaScript.`);
