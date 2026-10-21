import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Runtime } from '../../src/runtime/index.mjs';
import { EvidenceStore, digest, sealEvidence, verifyArtifact } from '../../src/evidence/index.mjs';
import { createExample } from '../../src/cli/example.mjs';
import { createWorkflow, readWorkflow } from '../../src/adapters/workflow.mjs';
function temp(t){const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'rea-resources-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
test('artifact references verify real bytes and reject corruption/traversal',t=>{
  const root=temp(t);fs.writeFileSync(path.join(root,'sample'),'original');
  const evidence=sealEvidence({type:'Evidence',schemaVersion:'2.0.0',id:'e',targetId:'t',targetVersion:'1',targetHash:digest('t'),kind:'artifact',origin:'local',location:'sample',timestamp:new Date().toISOString(),scenario:'x',artifact:'sample',artifactHash:digest('original'),limitations:[]});
  assert.equal(verifyArtifact(evidence,root).status,'PASS');fs.writeFileSync(path.join(root,'sample'),'corrupted');assert.equal(verifyArtifact(evidence,root).status,'FAIL');
  assert.throws(()=>verifyArtifact({...evidence,artifact:'../secret'},root));
});
test('operation budget includes actual candidate tool calls and total deadline includes active elapsed time',async t=>{
  const root=temp(t);createExample(root,{execute:true});const config=readWorkflow(path.join(root,'workflow.json'));config.limits.maxOperations=4;
  const workflow=createWorkflow(config,{root:path.join(root,'run'),allowedExecutables:[process.execPath]});
  const result=await workflow.runtime.run({execute:true});assert.equal(result.state,'BLOCKED');assert.equal(result.operations,4);
  const runtime=new Runtime({root:path.join(root,'time'),target:config.target,scope:config.scope,limits:{totalMs:10,stageMs:100},handlers:{investigate:async()=>{await new Promise(r=>setTimeout(r,50));return {};}}});
  const timed=await runtime.run({execute:true});assert.equal(timed.state,'BLOCKED');assert.ok(timed.spentMs>0);assert.match(timed.blockers.join(),/deadline|budget/i);
});
test('formal checkpoint records are connected to real workflow state',async t=>{
  const root=temp(t);createExample(root,{execute:true});const config=readWorkflow(path.join(root,'workflow.json'));
  const workflow=createWorkflow(config,{root:path.join(root,'run'),allowedExecutables:[process.execPath]});assert.equal((await workflow.runtime.run({execute:true})).state,'COMPLETE');
  const store=new EvidenceStore(path.join(root,'run/evidence'));const checkpoints=store.records().filter(r=>r.type==='Checkpoint');assert.equal(checkpoints.at(-1).workflowState,'COMPLETE');assert.deepEqual(store.audit(),[]);
  const validation=store.records().findLast(r=>r.type==='Validation');assert.ok(validation.implementationIds.length);assert.ok(store.report().edges.some(e=>e.to===validation.id&&e.relation==='implementationIds'));
  assert.equal(workflow.report().metrics.evidenceCoverage.value,1);
  const uncovered=createWorkflow({...config,requirements:[...config.requirements,{id:'uncovered',priority:'critical',acceptance:['No preserved scenario supports this requirement']}]},{root:path.join(root,'uncovered'),allowedExecutables:[process.execPath]});
  assert.equal((await uncovered.runtime.run({execute:true})).state,'BLOCKED');
  assert.equal(uncovered.report().metrics.evidenceCoverage.numerator,1);assert.equal(uncovered.report().metrics.evidenceCoverage.denominator,2);
});
test('target version changes invalidate execution instead of reusing cached proof',async t=>{
  const root=temp(t);createExample(root,{execute:true});const config=readWorkflow(path.join(root,'workflow.json'));
  const workflow=createWorkflow(config,{root:path.join(root,'run'),allowedExecutables:[process.execPath]});await workflow.runtime.run({execute:true,until:'INVESTIGATE'});
  fs.writeFileSync(path.join(root,'target/reference.json'),'changed');const result=await workflow.runtime.resume({execute:true});assert.equal(result.state,'BLOCKED');assert.match(result.blockers.join(),/identity changed/);
});
test('dead owner lock recovery is explicit; live owner cannot be removed',t=>{
  const root=temp(t),runtime=new Runtime({root,target:{id:'t',version:'1',hash:digest('t')},scope:[]});
  fs.writeFileSync(path.join(root,'run.lock'),JSON.stringify({pid:process.pid}));assert.throws(()=>runtime.recoverLock({execute:true}),/alive/);
  fs.writeFileSync(path.join(root,'run.lock'),JSON.stringify({pid:2147483647}));assert.throws(()=>runtime.recoverLock(),/execute/);assert.equal(runtime.recoverLock({execute:true}).recovered,true);
});
