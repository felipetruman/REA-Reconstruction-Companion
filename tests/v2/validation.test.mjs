import test from 'node:test';
import assert from 'node:assert/strict';
import { recordingOracle, compare, differential, fuzz, mutations, metrics, benchmark } from '../../src/validation/index.mjs';
const rows=[{id:'one',input:'a',expected:{output:1}},{id:'empty',input:'',expected:{output:0}}];
const good=async input=>({output:input.length});
test('preserved independent oracle detects bad candidate and all observation channels',async()=>{
  const oracle=recordingOracle({id:'o',identity:'reference-v1',cases:rows});
  assert.equal((await differential({oracle,candidate:good,candidateIdentity:'candidate-v1',cases:rows})).status,'PASS');
  const report=await differential({oracle,candidate:async()=>({output:5}),candidateIdentity:'bad',cases:rows});
  assert.equal(report.status,'FAIL');assert.equal(report.results.length,2);
  for(const key of ['error','state','effects','transitions'])assert.equal(compare({[key]:1},{[key]:2}).status,'FAIL');
});
test('absent, self generated and incomplete oracles never pass',async()=>{
  for(const oracle of [undefined,{id:'o',identity:'candidate',independent:true,evaluate:good},{id:'o',identity:'other',independent:false,evaluate:good},recordingOracle({id:'o',identity:'reference',cases:[]})]) {
    assert.equal((await differential({oracle,candidate:good,candidateIdentity:'candidate',cases:rows})).status,'INCONCLUSIVE');
  }
  assert.equal((await differential({oracle:recordingOracle({id:'o',identity:'ref',cases:rows}),candidate:good,candidateIdentity:'c',cases:[]})).status,'INCONCLUSIVE');
});
test('infrastructure failure cannot masquerade as an expected business error',async()=>{
  const cases=[{id:'error',input:null,expected:{error:{name:'Error',message:'budget exceeded'}}}];
  const oracle=recordingOracle({id:'o',identity:'ref',cases});
  const report=await differential({oracle,candidate:async()=>{throw Object.assign(new Error('budget exceeded'),{infrastructure:true});},candidateIdentity:'candidate',cases});
  assert.equal(report.status,'INCONCLUSIVE');
});
test('intentional differences require scenario-bound authorization and retain original mismatch',()=>{
  assert.equal(compare({output:1},{output:2},{exception:{approved:false,reason:'wish'}}).status,'FAIL');
  const result=compare({output:1},{output:2},{exception:{approved:true,reason:'authorized behavior change',expectedObserved:{output:2}}});
  assert.equal(result.status,'PASS');assert.equal(result.intentional,true);assert.ok(result.difference);
});
test('seeded bounded fuzz is reproducible and minimizes a failing corpus',async()=>{
  const options={seed:12,iterations:20,generate:r=>Math.floor(r()*20),check:x=>x<4,shrink:x=>x>0?[x-1]:[]};
  const a=await fuzz(options),b=await fuzz(options);assert.deepEqual(a,b);assert.ok(a.failures.length);assert.equal(a.failures[0].minimal,4);
  await assert.rejects(()=>fuzz({...options,iterations:1000001}));
});
test('mutation reports survivors, detected and invalid with explicit denominator',async()=>{
  const result=await mutations({mutants:[{id:'bad',candidate:async()=>({output:3})},{id:'same',candidate:good},{id:'invalid',invalid:true}],test:candidate=>differential({oracle:recordingOracle({id:'o',identity:'reference',cases:rows}),candidate,candidateIdentity:'mutant',cases:rows})});
  assert.equal(result.detected,1);assert.equal(result.survived,1);assert.equal(result.invalid,1);assert.equal(result.score.denominator,2);
});
test('metrics preserve unknown denominators; benchmark never claims agent generalization',async()=>{
  const m=metrics({results:[{status:'PASS'},{status:'FAIL'},{status:'INCONCLUSIVE'}],requirements:[{evidenceIds:['e'],validated:true},{evidenceIds:[],validated:false}],completions:[{claimed:true,independentStatus:'FAIL'}],interventions:0});
  assert.equal(m.functionalParity.numerator,1);assert.equal(m.functionalParity.denominator,2);assert.equal(m.falseCompletionRate.numerator,1);
  assert.equal(metrics({}).functionalParity.value,null);
  const result=await benchmark([{id:'public',run:async()=>({status:'PASS'})}],{environment:{node:process.version},corpus:{id:'public-known'}});
  assert.equal(result.agentEvaluation.status,'NOT_RUN');assert.equal(result.results[0].status,'PASS');
});
