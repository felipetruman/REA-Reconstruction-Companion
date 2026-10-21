import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { localCommand } from '../../src/adapters/local.mjs';
import { digest } from '../../src/evidence/index.mjs';
const cli=fileURLToPath(new URL('../../src/cli/index.mjs',import.meta.url));
function fixture(t) {
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'rea e2e '));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  // Independent preserved reference behavior; no candidate execution generates it.
  const cases=[{id:'empty',requirementId:'length',input:'',expected:{output:0}},{id:'ascii',requirementId:'length',input:'abc',expected:{output:3}},{id:'unicode',requirementId:'length',input:'😀',expected:{output:2}}];
  const candidate="let input='';for await(const b of process.stdin)input+=b;console.log(JSON.stringify({output:JSON.parse(input).length}));";
  const command={executable:process.execPath,args:['-e',`require('node:fs').writeFileSync('parser.mjs',${JSON.stringify(candidate)})`]};
  const config={schemaVersion:'2.0.0',target:{id:'reference-length',version:'1',hash:digest(cases)},scope:['parser'],requirements:[{id:'length',priority:'critical',acceptance:['UTF-16 length']}],tasks:[{id:'build-parser',scope:['parser'],dependsOn:[],command}],candidate:{identity:'candidate-v1',command:{executable:process.execPath,args:['parser.mjs']}},oracle:{id:'reference',identity:'preserved-v1',cases},topic:'function'};
  const file=path.join(root,'workflow.json');fs.writeFileSync(file,JSON.stringify(config));return {root,file,config};
}
function invoke(file,root,operation,...extra) {const child=spawnSync(process.execPath,[cli,operation,'--config',file,'--root',path.join(root,'run'),...extra],{encoding:'utf8',timeout:20000});return {code:child.status,output:JSON.parse(child.stdout||'{}'),stderr:child.stderr};}
test('CLI read-only plan, explicit real reconstruction, checkpoint resume, report and validation',t=>{
  const {root,file}=fixture(t);
  const plan=invoke(file,root,'plan');assert.equal(plan.code,0,plan.stderr);assert.equal(fs.existsSync(path.join(root,'run')),false);
  const denied=invoke(file,root,'run');assert.equal(denied.code,2);
  const first=invoke(file,root,'run','--execute','--allow-executable',process.execPath,'--until','IMPLEMENT');assert.equal(first.code,0,first.stderr);assert.equal(first.output.state,'VALIDATE');
  const status=invoke(file,root,'status');assert.equal(status.output.completed.includes('build-parser'),true);
  const resumed=invoke(file,root,'resume','--execute','--allow-executable',process.execPath);assert.equal(resumed.code,0,resumed.stderr);assert.equal(resumed.output.state,'COMPLETE');
  assert.equal(invoke(file,root,'validate','--execute','--allow-executable',process.execPath).output.status,'PASS');
  assert.equal(invoke(file,root,'report').output.checkpoint.state,'COMPLETE');
});
test('incorrect real candidate cannot complete; integrity-protected checkpoint and evidence are persisted',t=>{
  const {root,file,config}=fixture(t);config.tasks[0].command.args[1]="require('node:fs').writeFileSync('parser.mjs','console.log(JSON.stringify({output:7}))')";fs.writeFileSync(file,JSON.stringify(config));
  const result=invoke(file,root,'run','--execute','--allow-executable',process.execPath);assert.equal(result.code,1);assert.equal(result.output.state,'BLOCKED');
  assert.ok(fs.existsSync(path.join(root,'run','evidence','store.json')));
});
test('local adapter denies ungranted executables, bounds time/output and never invokes a shell',async t=>{
  const {root}=fixture(t);
  await assert.rejects(()=>localCommand({executable:process.execPath,args:['-e','0']},{cwd:root}),/authorized/);
  await assert.rejects(()=>localCommand({executable:process.execPath,args:['-e','setInterval(()=>{},100)']},{cwd:root,allowedExecutables:[process.execPath],timeoutMs:20}),/deadline/);
  await assert.rejects(()=>localCommand({executable:process.execPath,args:['-e',"console.log('a'.repeat(10000))"]},{cwd:root,allowedExecutables:[process.execPath],maxBytes:100}),/output/);
});
test('SIGTERM during real subprocess execution persists cancellation and resumes safely',{skip:process.platform==='win32'?'Windows kill(SIGTERM) forcibly terminates; cooperative AbortSignal coverage is in runtime.test.mjs':false},async t=>{
  const {root,file,config}=fixture(t);const command=config.tasks[0].command;
  command.args[1]=`require('node:fs').writeFileSync('started','yes');setTimeout(()=>{${command.args[1]}},600);`;
  fs.writeFileSync(file,JSON.stringify(config));
  const child=spawn(process.execPath,[cli,'run','--config',file,'--root',path.join(root,'run'),'--execute','--allow-executable',process.execPath],{stdio:['ignore','pipe','pipe']});
  t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
  const done=new Promise(resolve=>child.on('close',resolve));let output='';child.stdout.on('data',b=>output+=b);
  const deadline=Date.now()+5000;
  while(!fs.existsSync(path.join(root,'run/candidate/started'))&&Date.now()<deadline)await new Promise(r=>setTimeout(r,5));
  assert.ok(fs.existsSync(path.join(root,'run/candidate/started')),'subprocess reached actual work');
  child.kill('SIGTERM');await done;assert.equal(JSON.parse(output).state,'CANCELLED');
  const resumed=invoke(file,root,'resume','--execute','--allow-executable',process.execPath);assert.equal(resumed.output.state,'COMPLETE',resumed.stderr);
});
test('explicit validation after candidate tampering invalidates COMPLETE',t=>{
  const {root,file}=fixture(t);assert.equal(invoke(file,root,'run','--execute','--allow-executable',process.execPath).output.state,'COMPLETE');
  fs.writeFileSync(path.join(root,'run/candidate/parser.mjs'),'console.log(JSON.stringify({output:99}))');
  const validation=invoke(file,root,'validate','--execute','--allow-executable',process.execPath);assert.equal(validation.output.status,'FAIL');assert.notEqual(invoke(file,root,'status').output.state,'COMPLETE');
  assert.deepEqual(invoke(file,root,'report').output.evidence.implementedUnvalidated,['length']);
});
