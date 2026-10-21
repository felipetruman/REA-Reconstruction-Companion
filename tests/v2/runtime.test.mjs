import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Runtime, planTasks } from '../../src/runtime/index.mjs';
import { differential, recordingOracle } from '../../src/validation/index.mjs';
const target={id:'local',version:'1',hash:'a'.repeat(64)};
function temp(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'rea-runtime-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function setup(t,{bad=false,repair=true,...config}={}) {
  let wrong=bad;
  const cases=[{id:'c',requirementId:'r',input:'ab',expected:{output:2}}];
  const handlers={investigate:async()=>({target,tools:['local'],evidenceIds:['e']}),specify:async()=>({requirements:[{id:'r',priority:'critical',acceptance:['UTF-16 length']}],tasks:[{id:'task',dependsOn:[],scope:['parser']}]}),implement:async()=>({artifacts:['parser'],progress:'implemented'}),
    validate:()=>differential({oracle:recordingOracle({id:'oracle',identity:'original-v1',cases}),candidate:async x=>({output:wrong?0:x.length}),candidateIdentity:'candidate-v1',target,cases}),
    diagnose:async()=>({category:'implementation',hypothesis:'wrong length',route:'REPAIR'}),repair:async()=>{if(repair)wrong=false;return {progress:wrong?'unchanged':'fixed'};}};
  return new Runtime({root:temp(t),target,scope:['parser'],handlers,...config});
}
test('task planner rejects missing dependencies, cycles and unauthorized scope',()=>{
  assert.deepEqual(planTasks([{id:'b',dependsOn:['a'],scope:['p']},{id:'a',dependsOn:[],scope:['p']}],['p']).map(x=>x.id),['a','b']);
  assert.throws(()=>planTasks([{id:'a',dependsOn:['a'],scope:['p']}],['p']),/cycle/);
  assert.throws(()=>planTasks([{id:'a',dependsOn:[],scope:['other']}],['p']),/scope/);
});
test('inspection does not write; explicit run repairs and independently revalidates to completion',async t=>{
  const runtime=setup(t,{bad:true});assert.equal(fs.readdirSync(runtime.root).length,0);
  await assert.rejects(()=>runtime.run(),/execute/);
  const result=await runtime.run({execute:true});assert.equal(result.state,'COMPLETE');
  assert.ok(result.transitions.some(x=>x.to==='DIAGNOSE'));assert.equal(result.validations.length,2);
  assert.equal(new Runtime({...runtime.options}).status().state,'COMPLETE');
});
test('critical false success is rejected; three equivalent failures block with hypothesis',async t=>{
  const runtime=setup(t,{bad:true,repair:false});const result=await runtime.run({execute:true});
  assert.equal(result.state,'BLOCKED');assert.match(result.blockers.join(),/wrong length|progress/);assert.equal(result.attempts,3);
});
test('cancelled checkpoint resumes without discarding completed investigation',async t=>{
  const runtime=setup(t),controller=new AbortController();let investigations=0;
  runtime.handlers.investigate=async()=>{investigations++;return {target,tools:[],evidenceIds:[]};};
  await runtime.run({execute:true,until:'INVESTIGATE'});controller.abort();
  assert.equal((await runtime.run({execute:true,signal:controller.signal})).state,'CANCELLED');
  assert.equal((await runtime.resume({execute:true})).state,'COMPLETE');assert.equal(investigations,1);
});
test('stage and operation budgets stop execution and preserve checkpoints',async t=>{
  const runtime=setup(t,{limits:{maxOperations:1}});assert.equal((await runtime.run({execute:true})).state,'BLOCKED');
  const timeout=setup(t,{limits:{stageMs:15}});timeout.handlers.investigate=()=>new Promise(()=>{});
  const result=await timeout.run({execute:true});assert.equal(result.state,'BLOCKED');assert.match(result.blockers.join(),/deadline/);
});
test('unverifiable success and uncovered critical requirements never COMPLETE',async t=>{
  const runtime=setup(t);runtime.handlers.validate=async()=>({status:'PASS',results:[]});
  assert.equal((await runtime.run({execute:true})).state,'BLOCKED');
  const second=setup(t);second.handlers.specify=async()=>({requirements:[{id:'uncovered',priority:'critical',acceptance:['Independent coverage required']}],tasks:[]});
  assert.equal((await second.run({execute:true})).state,'BLOCKED');
});
test('malformed tool results block without poisoning the durable checkpoint',async t=>{
  for(const response of [undefined,null,'success',{value:Infinity}]) {
    const runtime=setup(t);runtime.handlers.implement=async()=>response;
    const result=await runtime.run({execute:true});assert.equal(result.state,'BLOCKED');
    assert.equal(new Runtime({...runtime.options}).status().state,'BLOCKED');
  }
  for(const [stage,response] of [['specify',{requirements:{},tasks:[]}],['specify',{requirements:[{id:'r',acceptance:['result'],dependencies:['r']}],tasks:[]}],['investigate',{target,evidenceIds:{}}],['validate',{status:'PASS',results:{}}]]) {
    const runtime=setup(t);runtime.handlers[stage]=async()=>response;
    assert.equal((await runtime.run({execute:true})).state,'BLOCKED');assert.doesNotThrow(()=>runtime.report());
  }
});
